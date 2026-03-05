// scripts/build_markets_signal_api_latest.mjs
// Multi-market Signal API v1 builder (hardened, deterministic, zero deps)

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const MARKETS_PATH = path.join(ROOT, "config", "markets.json");
const DIST_DIR = path.join(ROOT, "dist", "markets");
const INDEX_PATH = path.join(DIST_DIR, "index.json");
const NATIONAL_SIGNAL_PATH = path.join(ROOT, "artifacts", "signal_api_latest.json");

// --------------------------------------------------
// Helpers
// --------------------------------------------------

function readJson(p) {
  return JSON.parse(fs.readFileSync(p, "utf8"));
}

function writeJson(p, obj) {
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, JSON.stringify(obj, null, 2), "utf8");
}

function exists(p) {
  try {
    fs.accessSync(p);
    return true;
  } catch {
    return false;
  }
}

function isoDate() {
  return new Date().toISOString().slice(0, 10);
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

// --------------------------------------------------
// Schema validation
// --------------------------------------------------

function validateNationalSignal(signal) {
  assert(signal?.meta?.version === "signal_api_v1", "National signal version mismatch");
  assert(typeof signal?.indices?.pressure_index?.value === "number", "Missing national pressure_index.value");
}

function validateMarketsConfig(cfg) {
  assert(Array.isArray(cfg?.markets), "config/markets.json missing markets[]");

  const ids = new Set();
  for (const m of cfg.markets) {
    assert(typeof m.id === "string" && m.id.length > 0, "Market missing id");
    assert(typeof m.label === "string", `Market ${m.id} missing label`);
    if (ids.has(m.id)) {
      throw new Error(`Duplicate market id detected: ${m.id}`);
    }
    ids.add(m.id);
  }
}

// --------------------------------------------------
// Market skeleton (deterministic structure)
// --------------------------------------------------

function makeMarketSignalSkeleton({ market, runDate, mode, provenanceSources }) {
  return {
    meta: {
      system: "Construction Intelligence OS",
      version: "signal_api_v1",
      mode,
      run_date: runDate,
      region: {
        name: market.label,
        geo_id: market.cbsa ?? null
      }
    },

    provenance: {
      generated_at: new Date().toISOString(),
      sources: provenanceSources
    },

    indices: {
      pressure_index: {
        value: null,
        direction: "→",
        zone: null,
        delta_3m: null,
        momentum_band: "Unknown",
        risk_state: "🟡",
        drivers: {
          capital: null,
          pipeline: null,
          trade: null,
          materials: null,
          regulatory: null,
          macro: null
        },
        overlays: {
          stock_overlay: 0,
          news_overlay: 0,
          energy_overlay: 0,
          total_overlay_points: 0
        }
      }
    },

    regime: {
      cycle_state: null,
      modifier: null,
      confidence: "medium"
    },

    diagnostics: {
      missing_inputs: [
        "Market deterministic scoring not implemented (v1 skeleton)"
      ],
      non_deterministic_blocks: [],
      notes: [
        "Multi-market v1 skeleton emitted.",
        "National signal remains canonical reference."
      ]
    }
  };
}

// --------------------------------------------------
// Main
// --------------------------------------------------

function main() {
  assert(exists(MARKETS_PATH), `Missing ${MARKETS_PATH}`);
  assert(
    exists(NATIONAL_SIGNAL_PATH),
    `Missing ${NATIONAL_SIGNAL_PATH}. Run national builder first.`
  );

  const runDate = isoDate();
  const cfg = readJson(MARKETS_PATH);
  const national = readJson(NATIONAL_SIGNAL_PATH);

  validateMarketsConfig(cfg);
  validateNationalSignal(national);

  const markets = cfg.markets;

  const registry = {
    version: 1,
    generated_at: new Date().toISOString(),
    default_market: cfg.default_market || "national",
    markets: []
  };

  fs.mkdirSync(DIST_DIR, { recursive: true });

  const provenanceSources =
    national?.provenance?.sources ?? [
      {
        name: "signal_api_latest.json",
        series: "national",
        release_date: null,
        last_updated: national?.provenance?.generated_at ?? null,
        url: null
      }
    ];

  for (const market of markets) {
    const outPath = path.join(DIST_DIR, market.id, "signal_api_latest.json");

    registry.markets.push({
      id: market.id,
      label: market.label,
      type: market.type ?? null,
      cbsa: market.cbsa ?? null,
      path: `dist/markets/${market.id}/signal_api_latest.json`
    });

    // National copy
    if (market.id === "national") {
      writeJson(outPath, national);
      continue;
    }

    const skeleton = makeMarketSignalSkeleton({
      market,
      runDate,
      mode: national?.meta?.mode || "data_assisted",
      provenanceSources
    });

    writeJson(outPath, skeleton);
  }

  writeJson(INDEX_PATH, registry);

  console.log(`Wrote ${INDEX_PATH}`);
  console.log(`Wrote ${markets.length} market payload(s) under dist/markets/`);
}

main();
