import type { DashboardPayload, Env } from "./types";

export function jsonResponse(env: Env, payload: unknown, init: ResponseInit = {}): Response {
  const headers = new Headers(init.headers);
  headers.set("content-type", "application/json; charset=utf-8");
  headers.set("access-control-allow-origin", env.ALLOWED_ORIGIN || "*");
  headers.set("access-control-allow-methods", "GET,OPTIONS");
  headers.set("access-control-allow-headers", "content-type");
  headers.set("cache-control", "no-store");
  return new Response(JSON.stringify(payload, null, 2), { ...init, headers });
}

export function optionsResponse(env: Env): Response {
  return jsonResponse(env, { ok: true }, { status: 200 });
}

export function healthPayload(latest: DashboardPayload | null): Record<string, unknown> {
  return {
    ok: true,
    service: "construction-ai-dashboard-api",
    has_snapshot: Boolean(latest),
    generated_at: latest?.generated_at ?? null,
  };
}
