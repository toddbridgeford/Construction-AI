import { describe, expect, it } from 'vitest';
import { validateServerEnv } from '@/lib/server/env';

describe('server env validation', () => {
  it('reports missing required keys', () => {
    const result = validateServerEnv({});
    expect(result.isValid).toBe(false);
    expect(result.missing).toContain('CENSUS_API_KEY');
    expect(result.missing).toContain('BLS_API_KEY');
    expect(result.missing).toContain('FRED_API_KEY');
    expect(result.missing).toContain('EIA_API_KEY');
  });

  it('accepts complete non-empty required keys', () => {
    const result = validateServerEnv({
      CENSUS_API_KEY: 'census',
      BLS_API_KEY: 'bls',
      FRED_API_KEY: 'fred',
      EIA_API_KEY: 'eia'
    });

    expect(result.isValid).toBe(true);
    expect(result.missing).toHaveLength(0);
    expect(result.env.FRED_API_KEY).toBe('fred');
  });
});
