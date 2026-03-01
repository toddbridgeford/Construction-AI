// scripts/lib/http.mjs
// Node 20+ fetch helpers: JSON fetch + timeout + retries

export function clamp(x, lo, hi) {
  return Math.max(lo, Math.min(hi, x));
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

export async function fetchJson(url, { headers = {}, timeoutMs = 15000, retries = 2, method = "GET", body = null } = {}) {
  let lastErr = null;

  for (let attempt = 0; attempt <= retries; attempt++) {
    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const res = await fetch(url, {
        method,
        headers: { "accept": "application/json", ...headers },
        body,
        signal: controller.signal
      });

      const text = await res.text().catch(() => "");
      if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText} :: ${text.slice(0, 240)}`);
      return text ? JSON.parse(text) : {};
    } catch (e) {
      lastErr = e;
      if (attempt < retries) await new Promise(r => setTimeout(r, 500 * (attempt + 1)));
    } finally {
      clearTimeout(t);
    }
  }

  throw new Error(`fetchJson failed: ${String(lastErr?.message || lastErr)}`);
}
