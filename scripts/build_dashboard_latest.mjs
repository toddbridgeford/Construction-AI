// scripts/build_dashboard_latest.mjs
// =====================================================
// Construction-AI Dashboard Builder (Predictive-Model)
// Always outputs valid JSON (no string concatenation).
// Merges config/public_market_snapshot.json into panels.public_market.rows
// =====================================================

import fs from "fs";
import path from "path";

const ROOT = process.cwd();

function readJson(filePath, { optional = false } = {}) {
  const full = path.join(ROOT, filePath);
  if (!fs.existsSync(full)) {
    if (optional) return null;
    throw new Error(`Missing required file: ${filePath}`);
  }
  const txt = fs.readFileSync(full, "utf8").trim();
  if (!txt) return optional ? null : (() => { throw new Error(`Empty JSON file: ${filePath}`); })();

  try {
    return JSON.parse(txt);
  } catch (e) {
    // Provide a useful snippet around the failure
    const preview = txt.slice(0, 4000);
    throw new Error(
      `Invalid JSON in ${filePath}: ${e.message}\n--- file preview (first 4k) ---\n${preview}\n--- end preview ---`
    );
  }
}

function writeJson(filePath, obj) {
  const full = path.join(ROOT, filePath);
  fs.writeFileSync(full, JSON.stringify(obj, null, 2) + "\n");
}

function ensure(obj, key, defaultValue) {
  if (obj[key] === undefined || obj[key] === null) obj[key] = defaultValue;
  return obj[key];
}

function normalizeSnapshot(snapshot) {
  if (!snapshot || !Array.isArray(snapshot.rows)) return { asof: null, rows: [] };
  return {
    asof: snapshot.asof ?? null,
    rows: snapshot.rows
      .filter(r => r && typeof r.ticker === "string" && r.ticker.trim().length > 0)
      .map(r => ({
        ticker: String(r.ticker).trim().toUpperCase(),
        company_name: r.company_name ?? r.companyName ?? null,
        subsector: r.subsector ?? null,
        price_change_1w: r.price_change_1w ?? null,
        price_change_1m: r.price_change_1m ?? null,
        price_change_ytd: r.price_change_ytd ?? null,
        signal_flag: r.signal_flag ?? null
      }))
  };
}

// -----------------------------------------------------
// Load base dashboard (already built by your pipeline)
// -----------------------------------------------------

const DASH_PATH = "dashboard_latest.json";
const dash = readJson(DASH_PATH);

// Guarantee schema keys exist
dash.schema_version = dash.schema_version ?? dash.schemaVersion ?? "3.0.0";
dash.generated_at = dash.generated_at ?? dash.generatedAt ?? new Date().toISOString();

// Ensure nested structure exists
ensure(dash, "panels", {});
ensure(dash.panels, "public_market", { mode: "snapshot", as_of: null, rows: [] });

// -----------------------------------------------------
// Merge public market snapshot (config/public_market_snapshot.json)
// -----------------------------------------------------

const snap = normalizeSnapshot(readJson("config/public_market_snapshot.json", { optional: true }));

// Only overwrite as_of if snapshot has it
if (snap.asof) dash.panels.public_market.as_of = snap.asof;

// Merge rows: snapshot rows override/augment existing by ticker
const existing = Array.isArray(dash.panels.public_market.rows) ? dash.panels.public_market.rows : [];
const map = new Map();

// Seed existing
for (const r of existing) {
  if (!r || !r.ticker) continue;
  map.set(String(r.ticker).toUpperCase(), r);
}

// Merge snapshot (authoritative for market fields)
for (const r of snap.rows) {
  const t = r.ticker;
  const prev = map.get(t) ?? { ticker: t };
  map.set(t, {
    ...prev,
    // keep any existing company/subsector if snapshot omitted
    company_name: r.company_name ?? prev.company_name ?? null,
    subsector: r.subsector ?? prev.subsector ?? null,
    price_change_1w: r.price_change_1w ?? prev.price_change_1w ?? null,
    price_change_1m: r.price_change_1m ?? prev.price_change_1m ?? null,
    price_change_ytd: r.price_change_ytd ?? prev.price_change_ytd ?? null,
    signal_flag: r.signal_flag ?? prev.signal_flag ?? null
  });
}

// Write back merged rows
dash.panels.public_market.rows = Array.from(map.values());

// -----------------------------------------------------
// Write output (always valid JSON)
// -----------------------------------------------------

writeJson(DASH_PATH, dash);
console.log("✅ build_dashboard_latest.mjs: dashboard_latest.json merged + written (valid JSON).");
