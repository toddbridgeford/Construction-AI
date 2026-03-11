import test from 'node:test';
import assert from 'node:assert/strict';

import worker from '../src/worker.js';

function createKvStore(seed = {}) {
  const store = new Map(Object.entries(seed).map(([key, value]) => [key, JSON.stringify(value)]));
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

function makeEnv() {
  return {
    SERVICE_NAME: 'construction-ai-smoke',
    CPI_SNAPSHOTS: createKvStore({
      'macro:snapshot:12': {
        ok: true,
        ts: '2026-01-01T00:00:00.000Z',
        service: 'construction-ai-smoke',
        series: {
          PERMIT: { trend_pct: 1.2 },
          HOUST: { trend_pct: 0.8 },
          MORTGAGE30US: { latest: 6.2 },
          FEDFUNDS: { latest: 5.3 },
          TOTALSA: { latest: 1650 },
          COMPUTSA: { latest: 980 },
          UMCSENT: { latest: 72 },
          RECPROUSM156N: { latest: 0.21 },
        },
      },
    }),
  };
}

async function assertJsonSuccess(env, path) {
  const response = await worker.fetch(new Request(`https://example.com${path}`), env);
  assert.ok(response.status >= 200 && response.status < 300, `${path} must return 2xx; received ${response.status}`);
  const body = await response.json();
  assert.equal(typeof body, 'object', `${path} response must be a JSON object`);
  return body;
}

test('deployment-confidence smoke checks pass for canonical public endpoints', async () => {
  const env = makeEnv();

  const health = await assertJsonSuccess(env, '/health');
  assert.equal(health.ok, true);

  const terminal = await assertJsonSuccess(env, '/construction/terminal');
  assert.equal(terminal.ok, true);
  assert.equal(typeof terminal.terminal, 'object');
  for (const key of ['signal', 'regime', 'liquidity', 'risk', 'construction_index', 'spending', 'forecast', 'alerts']) {
    assert.ok(Object.hasOwn(terminal.terminal, key), `/construction/terminal missing subsection key: ${key}`);
  }

  const dashboard = await assertJsonSuccess(env, '/construction/dashboard');
  assert.equal(dashboard.ok, true);
  for (const key of ['signal', 'regime', 'liquidity', 'risk', 'construction_index', 'activity_trends']) {
    assert.ok(Object.hasOwn(dashboard, key), `/construction/dashboard missing key: ${key}`);
  }

  const forecast = await assertJsonSuccess(env, '/construction/forecast');
  assert.equal(forecast.ok, true);
  assert.ok(Object.hasOwn(forecast, 'forecast'));

  const alerts = await assertJsonSuccess(env, '/construction/alerts');
  assert.equal(alerts.ok, true);
  assert.ok(Object.hasOwn(alerts, 'alerts'));

  const defaults = await assertJsonSuccess(env, '/construction/settings/defaults');
  assert.equal(defaults.ok, true);
  assert.ok(Object.hasOwn(defaults, 'defaults'));
});
