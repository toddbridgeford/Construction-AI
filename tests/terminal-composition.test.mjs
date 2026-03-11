import test from 'node:test';
import assert from 'node:assert/strict';

import { handleConstructionTerminal } from '../src/routes/construction.js';

function createKvStore() {
  const store = new Map();
  return {
    async get(key, opts = {}) {
      if (!store.has(key)) return null;
      const value = store.get(key);
      if (opts.type === 'json') return JSON.parse(value);
      return value;
    },
    async put(key, value) {
      store.set(key, value);
    },
  };
}

function makeEnv(overrides = {}) {
  return {
    SERVICE_NAME: 'construction-ai-test',
    CPI_SNAPSHOTS: createKvStore(),
    ...overrides,
  };
}

async function json(res) {
  return await res.json();
}

test('terminal returns forecast partial-failure object when forecast asset fetch throws', async () => {
  const env = makeEnv({
    ASSETS: {
      async fetch() {
        throw new Error('asset read failed');
      },
    },
    CPI_SNAPSHOTS: {
      async get(key, opts = {}) {
        if (key === 'settings:profiles') {
          return null;
        }
        if (opts.type === 'json') return null;
        return null;
      },
      async put() {},
    },
  });

  const request = new Request('https://example.com/construction/terminal');
  const res = await handleConstructionTerminal(request, env);
  const body = await json(res);

  assert.equal(res.status, 200);
  assert.equal(body?.terminal?.forecast?.ok, false);
  assert.equal(body?.terminal?.forecast?.error?.code, 'FORECAST_FAILED');
  assert.match(body?.terminal?.forecast?.error?.message || '', /Unable to build forecast/);
  assert.equal(typeof body?.terminal?.watchlist_summary, 'string');
  assert.ok(body?.terminal?.watchlist_summary.length > 0);
});

test('terminal returns spending partial-failure object when spending summary throws', async () => {
  const env = makeEnv({
    ASSETS: {
      async fetch(url) {
        const parsed = new URL(url);
        if (parsed.pathname === '/dist/markets/index.json') {
          return new Response(JSON.stringify({ markets: [] }), { status: 200 });
        }
        return new Response('not found', { status: 404 });
      },
    },
    CPI_SNAPSHOTS: {
      async get() {
        throw new Error('kv offline');
      },
      async put() {},
    },
  });

  const request = {
    get url() {
      throw new Error('request url read failed');
    },
  };
  const res = await handleConstructionTerminal(request, env);
  const body = await json(res);

  assert.equal(res.status, 200);
  assert.equal(body?.terminal?.spending?.ok, false);
  assert.equal(body?.terminal?.spending?.error?.code, 'SPENDING_SUMMARY_FAILED');
  assert.match(body?.terminal?.spending?.error?.message || '', /Unable to compute spending summary/);
  assert.equal(typeof body?.terminal?.watchlist_summary, 'string');
  assert.ok(body?.terminal?.watchlist_summary.length > 0);
});

test('terminal keeps composing when market radar helper throws unexpectedly', async () => {
  const env = makeEnv({
    ASSETS: {
      async fetch() {
        throw new Error('asset read failed');
      },
    },
    CPI_SNAPSHOTS: {
      async get() {
        return null;
      },
      async put() {},
    },
  });

  Object.defineProperty(env, 'SERVICE_NAME', {
    configurable: true,
    get() {
      const stack = new Error().stack || '';
      if (stack.includes('handleConstructionMarketRadar')) {
        throw new Error('service name unavailable');
      }
      return 'construction-ai-test';
    },
  });

  const res = await handleConstructionTerminal(new Request('https://example.com/construction/terminal'), env);
  const body = await json(res);

  assert.equal(res.status, 200);
  assert.equal(body?.terminal?.market_radar?.ok, false);
  assert.equal(body?.terminal?.market_radar?.error?.code, 'MARKET_RADAR_FAILED');
  assert.match(body?.terminal?.market_radar?.error?.message || '', /Unable to build market radar/);
  assert.equal(typeof body?.terminal?.watchlist_summary, 'string');
  assert.ok(body?.terminal?.watchlist_summary.length > 0);
});

test('terminal keeps composing when dashboard helper throws unexpectedly', async () => {
  const env = makeEnv({
    ASSETS: {
      async fetch() {
        return new Response(JSON.stringify({ markets: [] }), { status: 200 });
      },
    },
    CPI_SNAPSHOTS: {
      async get() {
        return null;
      },
      async put() {},
    },
  });

  Object.defineProperty(env, 'FRED_API_KEY', {
    configurable: true,
    get() {
      throw new Error('fred key unavailable');
    },
  });

  const res = await handleConstructionTerminal(new Request('https://example.com/construction/terminal'), env);
  const body = await json(res);

  assert.equal(res.status, 200);
  assert.equal(body?.terminal?.signal?.ok, false);
  assert.equal(body?.terminal?.signal?.error?.code, 'DASHBOARD_FAILED');
  assert.match(body?.terminal?.signal?.error?.message || '', /Unable to compute dashboard/);
  assert.equal(typeof body?.terminal?.watchlist_summary, 'string');
  assert.ok(body?.terminal?.watchlist_summary.length > 0);
});

test('terminal keeps composing when active settings profile read throws unexpectedly', async () => {
  const env = makeEnv({
    ASSETS: {
      async fetch() {
        return new Response(JSON.stringify({ markets: [] }), { status: 200 });
      },
    },
  });

  Object.defineProperty(env, 'CPI_SNAPSHOTS', {
    configurable: true,
    get() {
      throw new Error('kv binding unavailable');
    },
  });

  const res = await handleConstructionTerminal(new Request('https://example.com/construction/terminal'), env);
  const body = await json(res);

  assert.equal(res.status, 200);
  assert.equal(body?.terminal?.active_settings_profile_id, 'balanced-operator');
  assert.equal(body?.terminal?.active_settings_profile, 'Balanced Operator');
  assert.equal(typeof body?.terminal?.saved_profiles_summary, 'string');
  assert.match(body?.terminal?.saved_profiles_summary || '', /^1 saved profiles available/);
});

test('terminal priority summaries remain present and action-oriented', async () => {
  const env = makeEnv({
    ASSETS: {
      async fetch(url) {
        const parsed = new URL(url);
        if (parsed.pathname === '/dist/markets/index.json') {
          return new Response(JSON.stringify({
            markets: [
              { market: 'Austin', score: 62, signal: 'bullish', regime: 'growth' },
              { market: 'Boston', score: 41, signal: 'bearish', regime: 'downturn' },
              { market: 'Phoenix', score: 55, signal: 'neutral', regime: 'stable' },
            ],
          }), { status: 200 });
        }
        return new Response('not found', { status: 404 });
      },
    },
  });

  const res = await handleConstructionTerminal(new Request('https://example.com/construction/terminal'), env);
  const body = await json(res);

  assert.equal(res.status, 200);
  assert.equal(typeof body?.terminal?.forecast_summary?.headline, 'string');
  assert.ok((body?.terminal?.forecast_summary?.headline || '').length > 0);
  assert.equal(typeof body?.terminal?.migration_summary, 'string');
  assert.ok((body?.terminal?.migration_summary || '').length > 0);
  assert.match(body?.terminal?.watchlist_summary || '', /watchlist alerts active|No active watchlist alerts/);
  assert.match(body?.terminal?.stress_index_summary || '', /keep bid gates and cash controls/i);
  assert.match(body?.terminal?.capital_flows_summary || '', /prioritize funded, higher-certainty work/i);
  assert.match(body?.terminal?.morning_brief_v2_summary || '', /Risk:/);
  assert.match(body?.terminal?.morning_brief_v2_summary || '', /Opportunity:/);
  assert.match(body?.terminal?.morning_brief_v2_summary || '', /Focus:/);
});


test('terminal top-level keys prioritize operator scan order', async () => {
  const env = makeEnv({
    ASSETS: {
      async fetch() {
        return new Response(JSON.stringify({ markets: [] }), { status: 200 });
      },
    },
  });

  const res = await handleConstructionTerminal(new Request('https://example.com/construction/terminal'), env);
  const body = await json(res);

  assert.equal(res.status, 200);
  const keys = Object.keys(body?.terminal || {});
  assert.deepEqual(keys.slice(0, 6), [
    'signal',
    'regime',
    'liquidity',
    'risk',
    'construction_index',
    'cycle_interpretation',
  ]);

  const operatorActionsIndex = keys.indexOf('operator_actions');
  const cycleIndex = keys.indexOf('cycle');
  const activityTrendsIndex = keys.indexOf('activity_trends');
  const forecastSummaryIndex = keys.indexOf('forecast_summary');
  const heatmapSummaryIndex = keys.indexOf('heatmap_summary');
  const migrationSummaryIndex = keys.indexOf('migration_summary');
  const watchlistSummaryIndex = keys.indexOf('watchlist_summary');
  const morningBriefSummaryIndex = keys.indexOf('morning_brief_v2_summary');
  const settingsSummaryIndex = keys.indexOf('settings_summary');
  const forecastIndex = keys.indexOf('forecast');
  const marketRadarIndex = keys.indexOf('market_radar');
  const migrationIndex = keys.indexOf('migration_index');
  const watchlistIndex = keys.indexOf('watchlist');
  const customWatchlistIndex = keys.indexOf('custom_watchlist');
  const activeProfileIdIndex = keys.indexOf('active_settings_profile_id');
  const activeProfileIndex = keys.indexOf('active_settings_profile');
  const spendingIndex = keys.indexOf('spending');

  assert.ok(operatorActionsIndex > -1);
  if (cycleIndex > -1) assert.ok(cycleIndex < operatorActionsIndex);
  if (activityTrendsIndex > -1) assert.ok(activityTrendsIndex < operatorActionsIndex);
  assert.ok(forecastSummaryIndex > operatorActionsIndex);
  assert.ok(heatmapSummaryIndex > forecastSummaryIndex);
  assert.ok(migrationSummaryIndex > heatmapSummaryIndex);
  assert.ok(watchlistSummaryIndex > migrationSummaryIndex);
  assert.ok(morningBriefSummaryIndex > watchlistSummaryIndex);
  assert.ok(forecastIndex > morningBriefSummaryIndex);
  assert.ok(marketRadarIndex > forecastIndex);
  assert.ok(migrationIndex > forecastIndex);
  assert.ok(watchlistIndex > migrationIndex);
  assert.ok(customWatchlistIndex > watchlistIndex);
  assert.ok(settingsSummaryIndex > customWatchlistIndex);
  assert.ok(activeProfileIdIndex > settingsSummaryIndex);
  assert.ok(activeProfileIndex > activeProfileIdIndex);
  assert.ok(spendingIndex > customWatchlistIndex);
});
