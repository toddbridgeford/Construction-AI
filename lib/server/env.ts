export type ServerEnv = {
  CENSUS_API_KEY: string;
  BLS_API_KEY: string;
  FRED_API_KEY: string;
  EIA_API_KEY: string;
};

export type EnvValidationResult = {
  env: Partial<ServerEnv>;
  missing: Array<keyof ServerEnv>;
  isValid: boolean;
};

const REQUIRED_KEYS: Array<keyof ServerEnv> = ['CENSUS_API_KEY', 'BLS_API_KEY', 'FRED_API_KEY', 'EIA_API_KEY'];

export function validateServerEnv(source: NodeJS.ProcessEnv = process.env): EnvValidationResult {
  const env: Partial<ServerEnv> = {};
  const missing: Array<keyof ServerEnv> = [];

  for (const key of REQUIRED_KEYS) {
    const raw = source[key];
    if (!raw || !raw.trim()) {
      missing.push(key);
      continue;
    }
    env[key] = raw.trim();
  }

  return {
    env,
    missing,
    isValid: missing.length === 0
  };
}

let cached: EnvValidationResult | null = null;

export function getServerEnv(): EnvValidationResult {
  if (!cached) {
    cached = validateServerEnv();
  }
  return cached;
}
