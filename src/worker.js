const JSON_HEADERS = {
  "content-type": "application/json"
};

function json(data, status = 200) {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: JSON_HEADERS
  });
}

function nowIso() {
  return new Date().toISOString();
}

async function fetchFred(series, env, limit = 12) {
  const url =
    "https://api.stlouisfed.org/fred/series/observations" +
    `?series_id=${series}` +
    `&api_key=${env.FRED_API_KEY}` +
    "&file_type=json" +
    "&sort_order=desc" +
    `&limit=${limit}`;

  const r = await fetch(url);
  const j = await r.json();
  return j;
}

async function latestFred(series, env) {
  const j = await fetchFred(series, env, 1);
  return parseFloat(j.observations[0].value);
}

async function handleHealth(env) {
  return json({
    ok: true,
    service: env.SERVICE_NAME,
    ts: nowIso()
  });
}

async function handleFred(request, env) {
  const url = new URL(request.url);
  const series = url.searchParams.get("series_id");
  const limit = url.searchParams.get("limit") || 12;

  if (!series) {
    return json({ error: "series_id required" }, 400);
  }

  const data = await fetchFred(series, env, limit);

  return json({
    ok: true,
    series,
    observations: data.observations
  });
}

async function handleBundle(env) {
  const series = ["CPIAUCSL", "HOUST", "PERMIT", "DGS10"];

  const out = {};

  for (const s of series) {
    out[s] = await fetchFred(s, env, 12);
  }

  return json({
    ok: true,
    ts: nowIso(),
    fred: out
  });
}

async function handleSignal(env) {
  const cpi = await latestFred("CPIAUCSL", env);
  const y10 = await latestFred("DGS10", env);
  const housing = await latestFred("HOUST", env);
  const permits = await latestFred("PERMIT", env);

  let regime = "neutral";

  if (cpi > 4 && y10 > 4.5) regime = "tight credit";
  if (housing < permits * 0.9) regime = "construction slowdown";
  if (housing > permits) regime = "expansion";

  return json({
    ok: true,
    macro_signal: regime,
    metrics: {
      cpi,
      treasury_10y: y10,
      housing_starts: housing,
      building_permits: permits
    }
  });
}

export default {
  async fetch(request, env) {
    const { pathname } = new URL(request.url);

    if (pathname === "/health") return handleHealth(env);

    if (pathname === "/fred/observations")
      return handleFred(request, env);

    if (pathname === "/bundle")
      return handleBundle(env);

    if (pathname === "/signal")
      return handleSignal(env);

    return json({ error: "Not Found" }, 404);
  }
};
