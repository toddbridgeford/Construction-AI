import { describe, expect, it } from 'vitest';
import { datePointsForRange, geographyMultiplier, normalizeDataset } from '@/lib/dashboard-data';

describe('dashboard-data', () => {
  it('calculates date range windows', () => {
    expect(datePointsForRange('1M')).toBe(2);
    expect(datePointsForRange('1Y')).toBe(12);
    expect(datePointsForRange('5Y')).toBe(24);
  });

  it('calculates geography multiplier by scope', () => {
    expect(geographyMultiplier('US', 'South', 'TX', 'Dallas-Fort Worth')).toBe(1);
    expect(geographyMultiplier('Region', 'West', 'TX', 'Dallas-Fort Worth')).toBe(1.06);
    expect(geographyMultiplier('State', 'South', 'TX', 'Dallas-Fort Worth')).toBeGreaterThan(1);
    expect(geographyMultiplier('City/Metro', 'South', 'TX', 'Seattle-Tacoma')).toBe(1.08);
  });

  it('normalizes points and creates model columns', () => {
    const normalized = normalizeDataset([{ date: '2025-01-01', value: 120 }], 1.1);
    expect(normalized).toHaveLength(1);
    expect(normalized[0]).toEqual({
      date: 'Jan 25',
      actual: 132,
      bestModel: 133.2,
      benchmarkModel: 132.8
    });
  });

  it('falls back when points are missing', () => {
    const normalized = normalizeDataset([], 1);
    expect(normalized.length).toBeGreaterThan(0);
    expect(normalized[0]).toHaveProperty('bestModel');
  });
});
