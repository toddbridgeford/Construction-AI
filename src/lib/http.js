const JSON_HEADERS = { "content-type": "application/json; charset=utf-8" };

export const CORS_HEADERS = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET,POST,OPTIONS",
  "access-control-allow-headers": "content-type,authorization",
  "access-control-max-age": "86400",
};

export function nowIso() {
  return new Date().toISOString();
}

export function serviceName(env) {
  return env.SERVICE_NAME || "construction-ai";
}

export function json(data, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: { ...JSON_HEADERS, ...CORS_HEADERS, ...extraHeaders },
  });
}

export function ok(env, payload = {}, status = 200) {
  return json(
    {
      ok: true,
      ts: nowIso(),
      service: serviceName(env),
      ...payload,
    },
    status
  );
}

export function error(env, status, code, message, details = null) {
  return json(
    {
      ok: false,
      ts: nowIso(),
      service: serviceName(env),
      error: {
        code,
        message,
        ...(details === null ? {} : { details }),
      },
    },
    status
  );
}

export function isString(x) {
  return typeof x === "string" && x.length > 0;
}

export function requireEnv(env, keys) {
  const missing = [];
  for (const k of keys) if (!isString(env[k])) missing.push(k);
  return missing;
}

export async function fetchJson(url, init = {}, timeoutMs = 15000) {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { ...init, signal: controller.signal });
    const text = await res.text();
    let parsed;
    try {
      parsed = text ? JSON.parse(text) : null;
    } catch {
      parsed = { raw: text };
    }
    if (!res.ok) {
      const err = new Error(`Upstream ${res.status}`);
      err.code = "UPSTREAM_HTTP";
      err.status = res.status;
      err.body = parsed;
      throw err;
    }
    return parsed;
  } finally {
    clearTimeout(t);
  }
}
