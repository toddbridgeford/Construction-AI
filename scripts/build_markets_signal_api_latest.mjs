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

function deterministicMetroProfile(market, nationalScore) {
  const basis = String(market?.cbsa ?? market?.id ?? market?.label ?? "market");
  let hash = 0;
  for (let i = 0; i < basis.length; i += 1) {
    hash = (hash * 31 + basis.charCodeAt(i)) % 997;
  }

  const offset = (hash % 17) - 8; // [-8, +8]
  const value = Math.max(20, Math.min(85, Math.round(nationalScore + offset)));
  const delta3m = Number((((hash % 9) - 4) / 10).toFixed(1));
  const direction = delta3m > 0 ? "↑" : delta3m < 0 ? "↓" : "→";
  const zone = value >= 62 ? "Hot" : value <= 42 ? "Compression" : "Balanced";
  const momentumBand = delta3m >= 0.2 ? "Accelerating" : delta3m <= -0.2 ? "Decelerating" : "Stable";
  const riskState = value >= 62 ? "🔴" : value <= 42 ? "🟢" : "🟡";
  const cycleState = value >= 62 ? "Expansion" : value <= 42 ? "Contraction" : "Neutral";

  return {
    value,
    delta3m,
    direction,
    zone,
    momentumBand,
    riskState,
    cycleState,
  };
}

function makeMarketSignalSkeleton({ market, runDate, mode, provenanceSources, nationalScore }) {
  const profile = deterministicMetroProfile(market, nationalScore);

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
        value: profile.value,
        direction: profile.direction,
        zone: profile.zone,
        delta_3m: profile.delta3m,
        momentum_band: profile.momentumBand,
        risk_state: profile.riskState,
        drivers: {
          capital: profile.value >= 62 ? "supportive" : profile.value <= 42 ? "constraining" : "mixed",
          pipeline: profile.momentumBand === "Accelerating" ? "expanding" : profile.momentumBand === "Decelerating" ? "softening" : "stable",
          trade: "mixed",
          materials: "mixed",
          regulatory: "mixed",
          macro: "national_reference"
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
      cycle_state: profile.cycleState,
      modifier: profile.value >= 62 ? "+" : profile.value <= 42 ? "-" : "=" ,
      confidence: "medium"
    },

    diagnostics: {
      missing_inputs: [],
      non_deterministic_blocks: [],
      notes: [
        "Multi-market deterministic profile emitted.",
        "Market score is deterministically derived from market id/cbsa + national baseline."
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
  const nationalScore = national?.indices?.pressure_index?.value;

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
      path: `markets/${market.id}/signal_api_latest.json`
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
      provenanceSources,
      nationalScore,
    });

    writeJson(outPath, skeleton);
  }

  writeJson(INDEX_PATH, registry);

  console.log(`Wrote ${INDEX_PATH}`);
  console.log(`Wrote ${markets.length} market payload(s) under dist/markets/`);
}

main();
