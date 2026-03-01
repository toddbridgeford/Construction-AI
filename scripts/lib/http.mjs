// scripts/lib/http.mjs
// Tiny fetch wrapper: retries + timeout + friendly errors (Node 20+)

export async function fetchJson(url, { headers = {}, timeoutMs = 12000, retries = 2 } = {}) {
  let lastErr = null;

  for (let attempt = 0; attempt <= retries; attempt++) {
    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const res = await fetch(url, {
        method: "GET",
        headers: { "accept": "application/json", ...headers },
        signal: controller.signal
      });

      const text = await res.text().catch(() => "");
      if (!res.ok) {
        throw new Error(`HTTP ${res.status} ${res.statusText} :: ${text.slice(0, 240)}`);
      }

      return text ? JSON.parse(text) : {};
    } catch (e) {
      lastErr = e;
      // basic backoff
      if (attempt < retries) await new Promise(r => setTimeout(r, 450 * (attempt + 1)));
    } finally {
      clearTimeout(t);
    }
  }

  throw new Error(`fetchJson failed: ${String(lastErr?.message || lastErr)}`);
}

export function isoNow() {
  return new Date().toISOString();
}

export function utcYYYYMMDD(d = new Date()) {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function clamp(x, lo, hi) {
  return Math.max(lo, Math.min(hi, x));
}
