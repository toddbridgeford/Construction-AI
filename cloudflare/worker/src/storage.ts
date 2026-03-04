import type { DashboardPayload, Env, SnapshotRecord } from "./types";

const LATEST_KEY = "dashboard:latest";
const HISTORY_KEY = "dashboard:history";

export async function loadLatest(env: Env): Promise<DashboardPayload | null> {
  return env.DASHBOARD_KV.get<DashboardPayload>(LATEST_KEY, "json");
}

export async function saveSnapshot(env: Env, payload: DashboardPayload): Promise<void> {
  const timestamp = payload.generated_at;
  const historyLimit = parseHistoryLimit(env.HISTORY_LIMIT);

  const existingHistory =
    (await env.DASHBOARD_KV.get<SnapshotRecord[]>(HISTORY_KEY, "json")) ?? [];

  const nextHistory = [{ timestamp, payload }, ...existingHistory].slice(0, historyLimit);

  await Promise.all([
    env.DASHBOARD_KV.put(LATEST_KEY, JSON.stringify(payload)),
    env.DASHBOARD_KV.put(HISTORY_KEY, JSON.stringify(nextHistory)),
  ]);
}

function parseHistoryLimit(raw?: string): number {
  const parsed = Number(raw ?? "20");
  if (!Number.isFinite(parsed) || parsed < 1) return 20;
  return Math.min(Math.floor(parsed), 200);
}
