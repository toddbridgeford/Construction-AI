import test from 'node:test';
import assert from 'node:assert/strict';

import worker, { CONSTRUCTION_ROUTE_HANDLERS } from '../src/worker.js';
import {
  handleConstructionCustomWatchlist,
  handleConstructionSettings,
  handleConstructionSettingsDefaults,
  handleConstructionSettingsReset,
} from '../src/routes/construction.js';

const REQUIRED_ROUTES = [
  '/construction/settings/defaults',
  '/construction/settings',
  '/construction/settings/reset',
  '/construction/watchlist/custom',
];

function makeEnv(overrides = {}) {
  return {
    SERVICE_NAME: 'construction-ai-test',
    ...overrides,
  };
}

test('construction settings routes are explicitly registered in worker route table', () => {
  for (const route of REQUIRED_ROUTES) {
    assert.equal(typeof CONSTRUCTION_ROUTE_HANDLERS[route], 'function', `Expected explicit handler registration for ${route}`);
  }
});

test('/construction/settings/defaults returns deterministic fallback payload', async () => {
  const env = makeEnv();
  const req = new Request('https://example.com/construction/settings/defaults');

  const first = await handleConstructionSettingsDefaults(req, env);
  const second = await handleConstructionSettingsDefaults(req, env);

  const bodyA = await first.json();
  const bodyB = await second.json();

  assert.equal(first.status, 200);
  assert.deepEqual(bodyA.defaults, bodyB.defaults);
  assert.equal(bodyA.defaults.updated_at, '2024-01-01T00:00:00.000Z');
});

test('/construction/settings GET falls back to defaults when storage is unavailable', async () => {
  const env = makeEnv({ CPI_SNAPSHOTS: null });
  const req = new Request('https://example.com/construction/settings');

  const res = await handleConstructionSettings(req, env);
  const body = await res.json();

  assert.equal(res.status, 200);
  assert.equal(body.ok, true);
  assert.deepEqual(body.settings.metros_watchlist, ['Dallas', 'Nashville', 'Phoenix']);
  assert.equal(body.settings.updated_at, '2024-01-01T00:00:00.000Z');
});

test('/construction/settings/reset keeps settings endpoint backwards compatible', async () => {
  const env = makeEnv({ CPI_SNAPSHOTS: null });
  const req = new Request('https://example.com/construction/settings/reset', { method: 'POST' });

  const res = await handleConstructionSettingsReset(req, env);
  const body = await res.json();

  assert.equal(res.status, 200);
  assert.equal(body.reset, true);
  assert.equal(body.settings.updated_at, '2024-01-01T00:00:00.000Z');
});

test('/construction/watchlist/custom is wired and does not return NOT_FOUND at router level', async () => {
  const env = makeEnv();
  const req = new Request('https://example.com/construction/watchlist/custom');

  const res = await worker.fetch(req, env);

  assert.notEqual(res.status, 404);
});

test('/construction/watchlist/custom builds with active settings fallback defaults', async () => {
  const env = makeEnv();
  const req = new Request('https://example.com/construction/watchlist/custom');

  const res = await handleConstructionCustomWatchlist(req, env);
  const body = await res.json();

  assert.equal(res.status, 200);
  assert.equal(body.ok, true);
  assert.ok(Array.isArray(body.alerts));
  assert.equal(typeof body.summary, 'string');
  assert.deepEqual(body.active_settings.metros_watchlist, ['Dallas', 'Nashville', 'Phoenix']);
});
