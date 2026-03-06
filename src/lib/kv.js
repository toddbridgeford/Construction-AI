export async function kvGetJson(env, key) {
  const kv = env.CPI_SNAPSHOTS;
  if (!kv) return null;
  try {
    return await kv.get(key, { type: "json" });
  } catch {
    return null;
  }
}

export async function kvPutJson(env, key, obj, ttlSeconds = 6 * 60 * 60) {
  const kv = env.CPI_SNAPSHOTS;
  if (!kv) return;
  try {
    await kv.put(key, JSON.stringify(obj), { expirationTtl: ttlSeconds });
  } catch {
    // Never throw from cache helper
  }
}
