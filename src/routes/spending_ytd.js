import { fetchFredSeries, parseObsValue } from "../lib/fred.js";
import { kvGetJson, kvPutJson } from "../lib/kv.js";
import { error, ok } from "../lib/http.js";

const SEGMENTS = {
  commercial: "PNRESCONS",
  housing: "PRRESCONS",
};

const DOLLARS_TO_MUSD = 1_000_000;

function toMonthlyEquiv(valueSaar) {
  return valueSaar / 12;
}

function normalizeObservations(observations) {
  return (Array.isArray(observations) ? observations : [])
    .map((obs) => {
      const valueSaar = parseObsValue(obs?.value);
      if (!obs?.date || valueSaar === null) return null;
      const year = Number(obs.date.slice(0, 4));
      const month = Number(obs.date.slice(5, 7));
      if (!Number.isInteger(year) || !Number.isInteger(month)) return null;
      if (month < 1 || month > 12) return null;
      return {
        date: obs.date,
        year,
        month,
        value_saar: valueSaar,
      };
    })
    .filter(Boolean)
    .sort((a, b) => (a.date < b.date ? -1 : 1));
}

function latestCompleteYear(observations) {
  const monthsByYear = new Map();
  for (const obs of observations) {
    if (!monthsByYear.has(obs.year)) monthsByYear.set(obs.year, new Set());
    monthsByYear.get(obs.year).add(obs.month);
  }

  const completeYears = [...monthsByYear.entries()]
    .filter(([, months]) => months.size === 12)
    .map(([year]) => year)
    .sort((a, b) => b - a);

  return completeYears[0] || null;
}

function toRawObservation(obs) {
  return {
    date: obs.date,
    value_saar: obs.value_saar,
    value_monthly_equiv: toMonthlyEquiv(obs.value_saar),
  };
}

export function buildYtdPytdFromObservations(observations, yearOpt = null) {
  const normalized = normalizeObservations(observations);
  if (normalized.length === 0) {
    const e = new Error("No usable observations");
    e.code = "INSUFFICIENT_DATA";
    throw e;
  }

  const targetYear = Number.isInteger(yearOpt) ? yearOpt : latestCompleteYear(normalized);
  if (!Number.isInteger(targetYear)) {
    const e = new Error("No complete year with data is available");
    e.code = "INSUFFICIENT_DATA";
    e.details = { reason: "no_complete_year" };
    throw e;
  }

  const targetYearObs = normalized.filter((obs) => obs.year === targetYear);
  if (targetYearObs.length === 0) {
    const e = new Error("No observations for requested year");
    e.code = "INSUFFICIENT_DATA";
    e.details = { year: targetYear };
    throw e;
  }

  const latestInTargetYear = targetYearObs[targetYearObs.length - 1];
  const latestMonth = latestInTargetYear.month;

  const ytdObservations = targetYearObs
    .filter((obs) => obs.month <= latestMonth)
    .map(toRawObservation);

  const pytdObservations = normalized
    .filter((obs) => obs.year === targetYear - 1 && obs.month <= latestMonth)
    .map(toRawObservation);

  const ytdTotalDollars = ytdObservations.reduce((sum, obs) => sum + obs.value_monthly_equiv, 0);
  const pytdTotalDollars = pytdObservations.reduce((sum, obs) => sum + obs.value_monthly_equiv, 0);

  return {
    year: targetYear,
    latest_observation_date: latestInTargetYear.date,
    latest_observation: toRawObservation(latestInTargetYear),
    months_included: ytdObservations.map((obs) => obs.date),
    ytd_monthly_equiv_musd: ytdTotalDollars / DOLLARS_TO_MUSD,
    pytd_monthly_equiv_musd: pytdTotalDollars / DOLLARS_TO_MUSD,
    pct_change_ytd_vs_pytd: pytdTotalDollars > 0 ? ((ytdTotalDollars - pytdTotalDollars) / pytdTotalDollars) * 100 : null,
    raw: {
      ytd_observations: ytdObservations,
      pytd_observations: pytdObservations,
    },
  };
}

export function computeYtdPytdFromObservations(observations, yearOpt = null) {
  return buildYtdPytdFromObservations(observations, yearOpt);
}

export async function buildYtdPytd(env, seriesId, segmentName, yearOpt = null) {
  const data = await fetchFredSeries(env, seriesId, 36);
  const computed = buildYtdPytdFromObservations(data?.observations || [], yearOpt);
  return {
    segment: segmentName,
    series_id: seriesId,
    ...computed,
  };
}

async function getFromCacheOrCompute(env, segment, yearOpt = null) {
  const seriesId = SEGMENTS[segment];
  if (!seriesId) {
    const e = new Error("segment must be one of: commercial, housing");
    e.code = "BAD_REQUEST";
    throw e;
  }

  const pre = await buildYtdPytd(env, seriesId, segment, yearOpt);
  const cacheKey = `spending:ytd:${segment}:${pre.year}:${pre.latest_observation_date}`;

  const cached = await kvGetJson(env, cacheKey);
  if (cached) return cached;

  await kvPutJson(env, cacheKey, pre, 60 * 30);
  return pre;
}

function parseYearParam(value) {
  if (value === null) return null;
  const parsed = Number(value);
  return Number.isInteger(parsed) ? parsed : Number.NaN;
}

function mapSpendingError(env, e) {
  if (e?.code === "BAD_REQUEST") return error(env, 400, "BAD_REQUEST", e.message, e.details || null);
  if (e?.code === "MISSING_ENV") return error(env, 500, "MISSING_ENV", "Missing required env vars", e.details || null);
  if (e?.code === "UPSTREAM_FRED") return error(env, 502, "UPSTREAM_FRED", "FRED request failed", e.details || null);
  if (e?.code === "INSUFFICIENT_DATA") return error(env, 422, "INSUFFICIENT_DATA", e.message, e.details || null);
  return error(env, 500, e?.code || "ERROR", e?.message || "Unhandled error", e?.details || null);
}

export async function handleYtdSegment(request, env, segment) {
  const url = new URL(request.url);
  const yearOpt = parseYearParam(url.searchParams.get("year"));
  if (Number.isNaN(yearOpt)) {
    return error(env, 400, "BAD_REQUEST", "Query param 'year' must be an integer when provided.");
  }

  try {
    const result = await getFromCacheOrCompute(env, segment, yearOpt);
    return ok(env, result);
  } catch (e) {
    return mapSpendingError(env, e);
  }
}

export async function handleYtdSummary(request, env) {
  const url = new URL(request.url);
  const yearOpt = parseYearParam(url.searchParams.get("year"));
  if (Number.isNaN(yearOpt)) {
    return error(env, 400, "BAD_REQUEST", "Query param 'year' must be an integer when provided.");
  }

  try {
    const commercial = await getFromCacheOrCompute(env, "commercial", yearOpt);
    const housing = await getFromCacheOrCompute(env, "housing", yearOpt);
    return ok(env, {
      year: commercial.year,
      summary: {
        commercial,
        housing,
      },
    });
  } catch (e) {
    return mapSpendingError(env, e);
  }
}

export async function handleSpendingYtd(request, env) {
  const url = new URL(request.url);
  const segment = (url.searchParams.get("segment") || "").trim().toLowerCase();
  if (!segment || !SEGMENTS[segment]) {
    return error(env, 400, "BAD_REQUEST", "Query param 'segment' is required and must be 'commercial' or 'housing'.");
  }
  return handleYtdSegment(request, env, segment);
}

export async function handleSpendingYtdSummary(request, env) {
  return handleYtdSummary(request, env);
}
