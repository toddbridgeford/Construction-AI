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
