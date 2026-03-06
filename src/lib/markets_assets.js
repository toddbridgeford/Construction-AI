export const MARKETS_INDEX_ASSET_PATH = "markets/index.json";

const DIST_PREFIX_PATTERN = /^(?:\.\/)?dist\//i;

export function normalizeAssetPath(assetPath) {
  return String(assetPath || "")
    .trim()
    .replace(/^\/+/, "")
    .replace(/^\.\//, "");
}

export function isDistPrefixedAssetPath(assetPath) {
  return DIST_PREFIX_PATTERN.test(normalizeAssetPath(assetPath));
}

export function validateAssetRootRelativePath(assetPath, context = "asset path") {
  const normalizedPath = normalizeAssetPath(assetPath);
  if (!normalizedPath) {
    return {
      ok: false,
      normalizedPath,
      reason: `${context} is empty`,
    };
  }

  if (isDistPrefixedAssetPath(normalizedPath)) {
    return {
      ok: false,
      normalizedPath,
      reason: `${context} must be asset-root-relative and cannot start with dist/`,
    };
  }

  return {
    ok: true,
    normalizedPath,
  };
}
