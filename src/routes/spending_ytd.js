import { fetchFredSeries, parseObsValue } from "../lib/fred.js";
import { kvGetJson, kvPutJson } from "../lib/kv.js";
import { error, ok } from "../lib/http.js";

const SEGMENTS = {
  commercial: "PNRESCONS",
  housing: "PRRESCONS",
};


function toMonthlyEquiv(saarValue) {
  return saarValue / 12;
}

function toNumberOrNull(value) {
  const n = parseObsValue(value);
  return n === null ? null : n;
}

export function computeYtdPytdFromObservations(observations, yearOpt = null) {
  const normalized = (Array.isArray(observations) ? observations : [])
    .map((obs) => {
      const saar = toNumberOrNull(obs?.value);
      if (!obs?.date || saar === null) return null;
      return { date: obs.date, year: Number(obs.date.slice(0, 4)), month: Number(obs.date.slice(5, 7)), value_saar: saar };
    })
    .filter(Boolean)
    .sort((a, b) => (a.date < b.date ? -1 : 1));

  if (normalized.length === 0) {
    const e = new Error("No usable observations");
    e.code = "NO_OBSERVATIONS";
    throw e;
  }

  const latestGlobal = normalized[normalized.length - 1];
  const targetYear = Number.isInteger(yearOpt) ? yearOpt : latestGlobal.year;

  const targetYearObs = normalized.filter((o) => o.year === targetYear);
  if (!targetYearObs.length) {
    const e = new Error("No observations for requested year");
    e.code = "NO_OBSERVATIONS";
    e.details = { year: targetYear };
    throw e;
  }

  const latestInTargetYear = targetYearObs[targetYearObs.length - 1];
  const latestMonth = latestInTargetYear.month;

  const allowedMonths = new Set(Array.from({ length: latestMonth }, (_, i) => String(i + 1).padStart(2, "0")));

  const ytdObs = normalized.filter((o) => o.year === targetYear && allowedMonths.has(String(o.month).padStart(2, "0")));
  const pytdObs = normalized.filter((o) => o.year === targetYear - 1 && allowedMonths.has(String(o.month).padStart(2, "0")));

  const ytdWithMonthly = ytdObs.map((o) => ({
    date: o.date,
    value_saar: String(o.value_saar),
    value_monthly_equiv: toMonthlyEquiv(o.value_saar),
  }));
  const pytdWithMonthly = pytdObs.map((o) => ({
    date: o.date,
    value_saar: String(o.value_saar),
    value_monthly_equiv: toMonthlyEquiv(o.value_saar),
  }));

  const ytdTotal = ytdWithMonthly.reduce((a, o) => a + o.value_monthly_equiv, 0);
  const pytdTotal = pytdWithMonthly.reduce((a, o) => a + o.value_monthly_equiv, 0);
  const pct = pytdTotal > 0 ? ((ytdTotal - pytdTotal) / pytdTotal) * 100 : null;

  return {
    year: targetYear,
    latest_observation: {
      date: latestInTargetYear.date,
      value_saar: String(latestInTargetYear.value_saar),
      value_monthly_equiv: toMonthlyEquiv(latestInTargetYear.value_saar),
    },
    latest_observation_date: latestInTargetYear.date,
    months_included: ytdWithMonthly.map((o) => o.date),
    ytd_monthly_equiv_musd: ytdTotal,
    pytd_monthly_equiv_musd: pytdTotal,
    pct_change_ytd_vs_pytd: pct,
    raw: {
      ytd_observations: ytdWithMonthly,
      pytd_observations: pytdWithMonthly,
    },
  };
}

export async function computeYtdPytdFromFred(env, segment, yearOpt = null) {
  const seriesId = SEGMENTS[segment];
  if (!seriesId) {
    const e = new Error("segment must be one of: commercial, housing");
    e.code = "BAD_REQUEST";
    throw e;
  }

  const data = await fetchFredSeries(env, seriesId, 36);
  const computed = computeYtdPytdFromObservations(data?.observations || [], yearOpt);

  return {
    segment,
    series_id: seriesId,
    ...computed,
    notes: ["SAAR converted to monthly-equivalent by dividing by 12."],
  };
}

async function getFromCacheOrCompute(env, segment, yearOpt = null) {
  const pre = await computeYtdPytdFromFred(env, segment, yearOpt);
  const key = `spending:ytd:${segment}:${pre.year}:${pre.latest_observation_date}`;

  const cached = await kvGetJson(env, key);
  if (cached) return cached;

  await kvPutJson(env, key, pre, 60 * 30);
  return pre;
}

export async function handleSpendingYtd(request, env) {
  const url = new URL(request.url);
  const segment = (url.searchParams.get("segment") || "").trim().toLowerCase();
  const yearParam = url.searchParams.get("year");

  if (!segment || !SEGMENTS[segment]) {
    return error(env, 400, "BAD_REQUEST", "Query param 'segment' is required and must be 'commercial' or 'housing'.");
  }

  const yearOpt = yearParam === null ? null : Number(yearParam);
  if (yearParam !== null && !Number.isInteger(yearOpt)) {
    return error(env, 400, "BAD_REQUEST", "Query param 'year' must be an integer when provided.");
  }

  try {
    const result = await getFromCacheOrCompute(env, segment, yearOpt);
    return ok(env, result);
  } catch (e) {
    if (e?.code === "BAD_REQUEST") return error(env, 400, "BAD_REQUEST", e.message, e.details || null);
    if (e?.code === "MISSING_ENV") return error(env, 500, "MISSING_ENV", "Missing required env vars", e.details || null);
    if (e?.code === "UPSTREAM_FRED") return error(env, 502, "UPSTREAM_FRED", "FRED request failed", e.details || null);
    return error(env, 500, e?.code || "ERROR", e?.message || "Unhandled error", e?.details || null);
  }
}

export async function handleSpendingYtdSummary(_request, env) {
  try {
    const commercial = await getFromCacheOrCompute(env, "commercial", null);
    const housing = await getFromCacheOrCompute(env, "housing", null);
    return ok(env, { summary: { commercial, housing } });
  } catch (e) {
    if (e?.code === "MISSING_ENV") return error(env, 500, "MISSING_ENV", "Missing required env vars", e.details || null);
    if (e?.code === "UPSTREAM_FRED") return error(env, 502, "UPSTREAM_FRED", "FRED request failed", e.details || null);
    return error(env, 500, e?.code || "ERROR", e?.message || "Unhandled error", e?.details || null);
  }
}
