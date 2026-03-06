export const MARKETS_INDEX_ASSET_PATH = "dist/markets/index.json";

export function normalizeAssetPath(assetPath) {
  return String(assetPath || "").replace(/^\/+/, "");
}

