import test from 'node:test';
import assert from 'node:assert/strict';

import worker, { CONSTRUCTION_ROUTE_HANDLERS } from '../src/worker.js';
import {
  handleConstructionCustomWatchlist,
  handleConstructionSettings,
  handleConstructionSettingsDefaults,
  handleConstructionSettingsReset,
  handleConstructionSettingsProfiles,
  handleConstructionSettingsActiveProfile,
  handleConstructionSettingsProfilesActivate,
  handleConstructionSettingsProfilesCreate,
  handleConstructionSettingsProfilesDelete,
  handleConstructionTerminal,
  handleConstructionMarketRadar,
  handleConstructionMorningBriefV2,
} from '../src/routes/construction.js';

import { handleBundle, handleFredObservations, handleLiquidity } from '../src/routes/existing.js';

const REQUIRED_ROUTES = [
  '/construction/settings/defaults',
  '/construction/settings',
  '/construction/settings/reset',
  '/construction/settings/profiles',
  '/construction/settings/active-profile',
  '/construction/settings/profiles/activate',
  '/construction/settings/profiles/delete',
  '/construction/watchlist/custom',
];

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

test('construction settings routes are explicitly registered in worker route table', () => {
  for (const route of REQUIRED_ROUTES) {
    assert.equal(typeof CONSTRUCTION_ROUTE_HANDLERS[route], 'function', `Expected explicit handler registration for ${route}`);
  }
});

test('OPTIONS preflight advertises POST for settings write routes', async () => {
  const env = makeEnv();
  const req = new Request('https://example.com/construction/settings', {
    method: 'OPTIONS',
    headers: {
      origin: 'https://app.example.com',
      'access-control-request-method': 'POST',
    },
  });

  const res = await worker.fetch(req, env);

  assert.equal(res.status, 204);
  assert.equal(res.headers.get('access-control-allow-methods'), 'GET,POST,OPTIONS');
});

test('HEAD requests are treated as GET for read endpoints and return no body', async () => {
  const env = makeEnv();

  const healthRes = await worker.fetch(new Request('https://example.com/health', { method: 'HEAD' }), env);
  assert.equal(healthRes.status, 200);
  assert.equal(await healthRes.text(), '');

  const settingsRes = await worker.fetch(new Request('https://example.com/construction/settings', { method: 'HEAD' }), env);
  assert.equal(settingsRes.status, 200);
  assert.equal(await settingsRes.text(), '');
  assert.equal(settingsRes.headers.get('content-type'), 'application/json; charset=utf-8');
});

test('/construction/settings/defaults returns deterministic fallback payload', async () => {
  const env = makeEnv();
  const req = new Request('https://example.com/construction/settings/defaults');

  const first = await handleConstructionSettingsDefaults(req, env);
  const second = await handleConstructionSettingsDefaults(req, env);

  const bodyA = await json(first);
  const bodyB = await json(second);

  assert.equal(first.status, 200);
  assert.deepEqual(bodyA.defaults, bodyB.defaults);
  assert.equal(bodyA.defaults.updated_at, '2024-01-01T00:00:00.000Z');
});

test('profiles list returns seeded defaults and balanced active when storage is empty', async () => {
  const env = makeEnv();
  const req = new Request('https://example.com/construction/settings/profiles');
  const res = await handleConstructionSettingsProfiles(req, env);
  const body = await json(res);

  assert.equal(res.status, 200);
  assert.equal(body.profiles.length, 5);
  assert.equal(body.active_profile_id, 'balanced-operator');
  assert.equal(body.profiles.find((p) => p.profile_id === 'balanced-operator')?.is_active, true);
});

test('profiles list performs a single settings model read to avoid duplicate KV operations', async () => {
  let getCount = 0;
  const store = new Map();
  const env = makeEnv({
    CPI_SNAPSHOTS: {
      async get(key, opts = {}) {
        getCount += 1;
        if (!store.has(key)) return null;
        const value = store.get(key);
        if (opts.type === 'json') return JSON.parse(value);
        return value;
      },
      async put(key, value) {
        store.set(key, value);
      },
    },
  });

  const res = await handleConstructionSettingsProfiles(new Request('https://example.com/construction/settings/profiles'), env);
  assert.equal(res.status, 200);
  assert.equal(getCount, 5);
});

test('profiles list avoids redundant KV writes when stored profiles model is already normalized', async () => {
  let putCount = 0;
  const store = new Map();
  store.set('settings:profiles', JSON.stringify([
    {
      profile_id: 'balanced-operator',
      profile_name: 'Balanced Operator',
      description: 'Most teams default here for day-to-day planning.',
      is_active: true,
      settings: {
        thresholds: {
          labor_shock_elevated_threshold: 60,
          margin_pressure_elevated_threshold: 58,
          bid_intensity_hot_threshold: 62,
        },
        alert_sensitivity: 'balanced',
        metros_watchlist: ['Dallas-Fort Worth', 'Phoenix', 'Nashville'],
        risk_watchlist: ['labor_shock', 'margin_pressure', 'project_risk'],
        muted_alert_codes: [],
        updated_at: '2024-01-01T00:00:00.000Z',
      },
      updated_at: '2024-01-01T00:00:00.000Z',
    },
  ]));
  store.set('settings:active_profile_id', JSON.stringify('balanced-operator'));

  const env = makeEnv({
    CPI_SNAPSHOTS: {
      async get(key, opts = {}) {
        if (!store.has(key)) return null;
        const value = store.get(key);
        if (opts.type === 'json') return JSON.parse(value);
        return value;
      },
      async put(key, value) {
        putCount += 1;
        store.set(key, value);
      },
    },
  });

  const res = await handleConstructionSettingsProfiles(new Request('https://example.com/construction/settings/profiles'), env);
  assert.equal(res.status, 200);
  assert.equal(putCount, 0);
});

test('active profile endpoint switches active profile with resolved settings payload', async () => {
  const env = makeEnv();
  const req = new Request('https://example.com/construction/settings/active-profile', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ profile_id: 'aggressive-growth' }),
  });
  const res = await handleConstructionSettingsActiveProfile(req, env);
  const body = await json(res);

  assert.equal(res.status, 200);
  assert.equal(body.active_profile_id, 'aggressive-growth');
  assert.equal(body.active_profile_name, 'Aggressive Growth');
  assert.equal(body.settings.alert_sensitivity, 'aggressive');
});


test('active profile GET returns active profile metadata for backward-compatible reads', async () => {
  const env = makeEnv();
  const res = await handleConstructionSettingsActiveProfile(new Request('https://example.com/construction/settings/active-profile'), env);
  const body = await json(res);

  assert.equal(res.status, 200);
  assert.equal(body.active_profile_id, 'balanced-operator');
  assert.equal(body.active_profile_name, 'Balanced Operator');
  assert.equal(body.settings.alert_sensitivity, 'balanced');
});



test('active profile endpoint validates missing and unknown profile ids', async () => {
  const env = makeEnv();

  const missingRes = await handleConstructionSettingsActiveProfile(new Request('https://example.com/construction/settings/active-profile', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({}),
  }), env);
  const missingBody = await json(missingRes);
  assert.equal(missingRes.status, 400);
  assert.equal(missingBody.error.code, 'PROFILE_ID_REQUIRED');

  const unknownRes = await handleConstructionSettingsActiveProfile(new Request('https://example.com/construction/settings/active-profile', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ profile_id: 'missing-profile' }),
  }), env);
  const unknownBody = await json(unknownRes);
  assert.equal(unknownRes.status, 404);
  assert.equal(unknownBody.error.code, 'PROFILE_NOT_FOUND');
  assert.equal(unknownBody.error.details.profile_id, 'missing-profile');

  const unknownFieldRes = await handleConstructionSettingsActiveProfile(new Request('https://example.com/construction/settings/active-profile', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ profile_id: 'balanced-operator', invalid_toggle: true }),
  }), env);
  const unknownFieldBody = await json(unknownFieldRes);
  assert.equal(unknownFieldRes.status, 400);
  assert.equal(unknownFieldBody.error.code, 'ACTIVE_PROFILE_VALIDATION_FAILED');
  assert.match(unknownFieldBody.error.details.errors[0], /unknown field: invalid_toggle/);
});

test('settings POST updates active profile with partial merge and validation', async () => {
  const env = makeEnv();
  await handleConstructionSettingsProfilesActivate(new Request('https://example.com/construction/settings/profiles/activate', {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ profile_id: 'conservative-lender' }),
  }), env);

  const writeReq = new Request('https://example.com/construction/settings', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ thresholds: { labor_shock_elevated_threshold: 57 }, alert_sensitivity: 'conservative' }),
  });
  const res = await handleConstructionSettings(writeReq, env);
  const body = await json(res);

  assert.equal(res.status, 200);
  assert.equal(body.action, 'settings_updated');
  assert.equal(body.settings.thresholds.labor_shock_elevated_threshold, 57);
  assert.equal(body.settings.alert_sensitivity, 'conservative');

  const readRes = await handleConstructionSettings(new Request('https://example.com/construction/settings'), env);
  const readBody = await json(readRes);
  assert.equal(readRes.status, 200);
  assert.equal(readBody.active_profile_id, 'conservative-lender');
  assert.equal(readBody.active_profile_name, 'Conservative Lender');

  const badRes = await handleConstructionSettings(new Request('https://example.com/construction/settings', {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ thresholds: { labor_shock_elevated_threshold: 'bad' } }),
  }), env);
  assert.equal(badRes.status, 400);

  const unknownFieldRes = await handleConstructionSettings(new Request('https://example.com/construction/settings', {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ invalid_toggle: true }),
  }), env);
  const unknownFieldBody = await json(unknownFieldRes);
  assert.equal(unknownFieldRes.status, 400);
  assert.equal(unknownFieldBody.error.code, 'SETTINGS_WRITE_VALIDATION_FAILED');
  assert.match(unknownFieldBody.error.details.errors[0], /unknown field: invalid_toggle/);

  const unknownThresholdFieldRes = await handleConstructionSettings(new Request('https://example.com/construction/settings', {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ thresholds: { made_up_threshold: 75 } }),
  }), env);
  const unknownThresholdFieldBody = await json(unknownThresholdFieldRes);
  assert.equal(unknownThresholdFieldRes.status, 400);
  assert.equal(unknownThresholdFieldBody.error.code, 'SETTINGS_WRITE_VALIDATION_FAILED');
  assert.match(unknownThresholdFieldBody.error.details.errors[0], /unknown thresholds field: made_up_threshold/);
});


test('settings POST rejects unknown updated_at field to prevent false-success writes', async () => {
  const env = makeEnv();
  const res = await handleConstructionSettings(new Request('https://example.com/construction/settings', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ updated_at: '2026-01-01T00:00:00.000Z' }),
  }), env);
  const body = await json(res);

  assert.equal(res.status, 400);
  assert.equal(body.error.code, 'SETTINGS_WRITE_VALIDATION_FAILED');
  assert.ok(Array.isArray(body.error.details.errors));
  assert.match(body.error.details.errors[0], /unknown field: updated_at/);
});

test('profile create and delete enforce active profile delete protection', async () => {
  const env = makeEnv();
  const createRes = await handleConstructionSettingsProfilesCreate(new Request('https://example.com/construction/settings/profiles', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ profile_name: 'Ops Tilt', description: 'custom' }),
  }), env);
  const created = await json(createRes);
  assert.equal(createRes.status, 200);
  const newId = created.profile_id;

  const denyDeleteRes = await handleConstructionSettingsProfilesDelete(new Request('https://example.com/construction/settings/profiles/delete', {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ profile_id: 'balanced-operator' }),
  }), env);
  assert.equal(denyDeleteRes.status, 400);

  const deleteRes = await handleConstructionSettingsProfilesDelete(new Request('https://example.com/construction/settings/profiles/delete', {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ profile_id: newId }),
  }), env);
  assert.equal(deleteRes.status, 200);
});

test('profile create generates unique ids even when created in same millisecond', async () => {
  const env = makeEnv();
  const originalNow = Date.now;
  const originalRandomUuid = globalThis.crypto.randomUUID;
  let counter = 0;

  Date.now = () => 1700000000000;
  globalThis.crypto.randomUUID = () => (counter++ === 0 ? '11111111-0000-4000-8000-000000000000' : '22222222-0000-4000-8000-000000000000');

  try {
    const firstRes = await handleConstructionSettingsProfilesCreate(new Request('https://example.com/construction/settings/profiles', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ profile_name: 'Custom Profile A' }),
    }), env);
    const secondRes = await handleConstructionSettingsProfilesCreate(new Request('https://example.com/construction/settings/profiles', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ profile_name: 'Custom Profile B' }),
    }), env);

    const firstBody = await json(firstRes);
    const secondBody = await json(secondRes);

    assert.equal(firstRes.status, 200);
    assert.equal(secondRes.status, 200);
    assert.notEqual(firstBody.profile_id, secondBody.profile_id);
  } finally {
    Date.now = originalNow;
    globalThis.crypto.randomUUID = originalRandomUuid;
  }
});


test('profile create rejects unknown top-level fields to prevent false-success writes', async () => {
  const env = makeEnv();
  const res = await handleConstructionSettingsProfilesCreate(new Request('https://example.com/construction/settings/profiles', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ profile_name: 'Unknown Field Profile', unexpected_toggle: true }),
  }), env);
  const body = await json(res);

  assert.equal(res.status, 400);
  assert.equal(body.error.code, 'SETTINGS_PROFILE_CREATE_VALIDATION_FAILED');
  assert.ok(Array.isArray(body.error.details.errors));
  assert.match(body.error.details.errors[0], /unknown field: unexpected_toggle/);
});



test('profile create settings override is merged with active profile defaults', async () => {
  const env = makeEnv();

  const activateRes = await handleConstructionSettingsProfilesActivate(new Request('https://example.com/construction/settings/profiles/activate', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ profile_id: 'aggressive-growth' }),
  }), env);
  assert.equal(activateRes.status, 200);

  const createRes = await handleConstructionSettingsProfilesCreate(new Request('https://example.com/construction/settings/profiles', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      profile_name: 'Merged Override Profile',
      settings: { thresholds: { labor_shock_elevated_threshold: 81 } },
    }),
  }), env);
  const created = await json(createRes);

  assert.equal(createRes.status, 200);
  assert.equal(created.settings.thresholds.labor_shock_elevated_threshold, 81);
  assert.equal(created.settings.alert_sensitivity, 'aggressive');
});
test('profile create rejects invalid settings payload when settings key is provided', async () => {
  const env = makeEnv();
  const createRes = await handleConstructionSettingsProfilesCreate(new Request('https://example.com/construction/settings/profiles', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ profile_name: 'Invalid Override', settings: null }),
  }), env);
  const body = await json(createRes);

  assert.equal(createRes.status, 400);
  assert.equal(body.error.code, 'SETTINGS_PROFILE_CREATE_VALIDATION_FAILED');
  assert.ok(Array.isArray(body.error.details.errors));
  assert.match(body.error.details.errors[0], /payload must be an object/i);
});

test('reset returns balanced baseline and keeps endpoint compatibility', async () => {
  const env = makeEnv();
  const res = await handleConstructionSettingsReset(new Request('https://example.com/construction/settings/reset', { method: 'POST' }), env);
  const body = await json(res);
  assert.equal(res.status, 200);
  assert.equal(body.reset, true);
  assert.equal(body.baseline, 'balanced-operator');
  assert.equal(body.settings.alert_sensitivity, 'balanced');
});

test('reset switches active profile to balanced-operator baseline', async () => {
  const env = makeEnv();

  const activateRes = await handleConstructionSettingsProfilesActivate(new Request('https://example.com/construction/settings/profiles/activate', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ profile_id: 'aggressive-growth' }),
  }), env);
  assert.equal(activateRes.status, 200);

  const resetRes = await handleConstructionSettingsReset(new Request('https://example.com/construction/settings/reset', { method: 'POST' }), env);
  const resetBody = await json(resetRes);
  assert.equal(resetRes.status, 200);
  assert.equal(resetBody.baseline, 'balanced-operator');

  const settingsRes = await handleConstructionSettings(new Request('https://example.com/construction/settings'), env);
  const settingsBody = await json(settingsRes);
  assert.equal(settingsRes.status, 200);
  assert.equal(settingsBody.active_profile_id, 'balanced-operator');
  assert.equal(settingsBody.active_profile_name, 'Balanced Operator');
  assert.equal(settingsBody.settings.alert_sensitivity, 'balanced');
});



test('terminal read path does not persist scenario snapshot in KV', async () => {
  const kvWrites = [];
  const store = new Map();
  const env = makeEnv({
    CPI_SNAPSHOTS: {
      async get(key, opts = {}) {
        if (!store.has(key)) return null;
        const value = store.get(key);
        if (opts.type === 'json') return JSON.parse(value);
        return value;
      },
      async put(key, value) {
        kvWrites.push({ key, value });
        store.set(key, value);
      },
    },
  });

  const res = await handleConstructionTerminal(new Request('https://example.com/construction/terminal'), env);
  const body = await json(res);

  assert.equal(res.status, 200);
  assert.ok(body?.terminal?.morning_brief_v2);
  assert.equal(kvWrites.some((entry) => entry.key === 'construction:terminal:scenario-watchlist:v1'), false);
});

test('morning brief v2 endpoint persists scenario snapshot in KV', async () => {
  const kvWrites = [];
  const store = new Map();
  const env = makeEnv({
    CPI_SNAPSHOTS: {
      async get(key, opts = {}) {
        if (!store.has(key)) return null;
        const value = store.get(key);
        if (opts.type === 'json') return JSON.parse(value);
        return value;
      },
      async put(key, value) {
        kvWrites.push({ key, value });
        store.set(key, value);
      },
    },
  });

  const res = await handleConstructionMorningBriefV2(new Request('https://example.com/construction/morning-brief-v2'), env);
  const body = await json(res);

  assert.equal(res.status, 200);
  assert.ok(Array.isArray(body?.brief?.changed_conditions));
  const snapshotWrite = kvWrites.find((entry) => entry.key === 'construction:terminal:scenario-watchlist:v1');
  assert.ok(snapshotWrite);
  assert.ok(typeof snapshotWrite.value === 'string');
  assert.doesNotThrow(() => JSON.parse(snapshotWrite.value));
});
test('custom watchlist and terminal include profile-aware metadata', async () => {
  const env = makeEnv();
  await handleConstructionSettingsProfilesActivate(new Request('https://example.com/construction/settings/profiles/activate', {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ profile_id: 'gc-cash-protection' }),
  }), env);

  const watchlistRes = await handleConstructionCustomWatchlist(new Request('https://example.com/construction/watchlist/custom'), env);
  const watchlistBody = await json(watchlistRes);
  assert.equal(watchlistRes.status, 200);
  assert.ok(Array.isArray(watchlistBody.alerts));
  assert.equal(typeof watchlistBody.summary, 'string');
  assert.equal(watchlistBody.active_profile_id, 'gc-cash-protection');
  assert.equal(watchlistBody.active_profile_name, 'GC Cash Protection');
  assert.equal(typeof watchlistBody.settings_summary, 'string');
  assert.equal(typeof watchlistBody.saved_profiles_summary, 'string');

  const terminalRes = await handleConstructionTerminal(new Request('https://example.com/construction/terminal'), env);
  const terminalBody = await json(terminalRes);
  assert.equal(terminalRes.status, 200);
  assert.equal(terminalBody.terminal.active_settings_profile_id, 'gc-cash-protection');
  assert.equal(terminalBody.terminal.active_settings_profile, 'GC Cash Protection');
  assert.equal(typeof terminalBody.terminal.saved_profiles_summary, 'string');
});


test('custom watchlist returns active non-default profile id/name without balanced fallback', async () => {
  const env = makeEnv();
  await handleConstructionSettingsProfilesActivate(new Request('https://example.com/construction/settings/profiles/activate', {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ profile_id: 'aggressive-growth' }),
  }), env);

  const watchlistRes = await handleConstructionCustomWatchlist(new Request('https://example.com/construction/watchlist/custom'), env);
  const watchlistBody = await json(watchlistRes);
  assert.equal(watchlistRes.status, 200);
  assert.equal(watchlistBody.active_profile_id, 'aggressive-growth');
  assert.equal(watchlistBody.active_profile_name, 'Aggressive Growth');
  assert.notEqual(watchlistBody.active_profile_id, 'balanced-operator');
});




test('profile switch immediately updates settings, alerts, and terminal summaries', async () => {
  const env = makeEnv();

  const listRes = await handleConstructionSettingsProfiles(new Request('https://example.com/construction/settings/profiles'), env);
  const listBody = await json(listRes);
  assert.equal(listRes.status, 200);
  assert.ok(listBody.profiles.some((p) => p.profile_id === 'gc-cash-protection'));

  const switchRes = await handleConstructionSettingsActiveProfile(new Request('https://example.com/construction/settings/active-profile', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ profile_id: 'gc-cash-protection' }),
  }), env);
  const switchBody = await json(switchRes);
  assert.equal(switchRes.status, 200);
  assert.equal(switchBody.active_profile_id, 'gc-cash-protection');
  assert.equal(switchBody.active_profile_name, 'GC Cash Protection');

  const settingsRes = await handleConstructionSettings(new Request('https://example.com/construction/settings'), env);
  const settingsBody = await json(settingsRes);
  assert.equal(settingsRes.status, 200);
  assert.equal(settingsBody.settings.thresholds.collections_stress_severe_threshold, 66);

  const alertsRes = await worker.fetch(new Request('https://example.com/construction/alerts'), env);
  const alertsBody = await json(alertsRes);
  assert.equal(alertsRes.status, 200);
  assert.ok(Array.isArray(alertsBody.alerts));

  const terminalRes = await handleConstructionTerminal(new Request('https://example.com/construction/terminal'), env);
  const terminalBody = await json(terminalRes);
  assert.equal(terminalRes.status, 200);
  assert.equal(terminalBody.terminal.active_settings_profile, 'GC Cash Protection');
  assert.match(terminalBody.terminal.settings_summary, /^GC Cash Protection profile tracks /);
  assert.match(terminalBody.terminal.saved_profiles_summary, /active profile is GC Cash Protection/);
});

test('settings profile routes are wired at router level and do not return NOT_FOUND', async () => {
  const env = makeEnv();

  const listRes = await worker.fetch(new Request('https://example.com/construction/settings/profiles'), env);
  assert.equal(listRes.status, 200);

  const createRes = await worker.fetch(new Request('https://example.com/construction/settings/profiles', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ profile_name: 'Router Test Profile' }),
  }), env);
  assert.equal(createRes.status, 200);

  const activeProfileRes = await worker.fetch(new Request('https://example.com/construction/settings/active-profile', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ profile_id: 'balanced-operator' }),
  }), env);
  assert.equal(activeProfileRes.status, 200);

  const activateRes = await worker.fetch(new Request('https://example.com/construction/settings/profiles/activate', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ profile_id: 'balanced-operator' }),
  }), env);
  assert.equal(activateRes.status, 200);

  const deleteRes = await worker.fetch(new Request('https://example.com/construction/settings/profiles/delete', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ profile_id: 'conservative-lender' }),
  }), env);
  assert.equal(deleteRes.status, 200);
});

test('/construction/watchlist/custom is wired and does not return NOT_FOUND at router level', async () => {
  const env = makeEnv();
  const req = new Request('https://example.com/construction/watchlist/custom');
  const res = await worker.fetch(req, env);
  assert.notEqual(res.status, 404);
});




test('activate and delete endpoints reject malformed JSON with endpoint-specific error codes', async () => {
  const env = makeEnv();

  const activateRes = await handleConstructionSettingsProfilesActivate(new Request('https://example.com/construction/settings/profiles/activate', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: '{',
  }), env);
  const activateBody = await json(activateRes);
  assert.equal(activateRes.status, 400);
  assert.equal(activateBody.error.code, 'SETTINGS_PROFILE_ACTIVATE_INVALID_JSON');

  const deleteRes = await handleConstructionSettingsProfilesDelete(new Request('https://example.com/construction/settings/profiles/delete', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: '{',
  }), env);
  const deleteBody = await json(deleteRes);
  assert.equal(deleteRes.status, 400);
  assert.equal(deleteBody.error.code, 'SETTINGS_PROFILE_DELETE_INVALID_JSON');
});
test('activate and delete endpoints accept trimmed profile ids', async () => {
  const env = makeEnv();

  const activateRes = await handleConstructionSettingsProfilesActivate(new Request('https://example.com/construction/settings/profiles/activate', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ profile_id: '  aggressive-growth  ' }),
  }), env);
  const activateBody = await json(activateRes);
  assert.equal(activateRes.status, 200);
  assert.equal(activateBody.profile_id, 'aggressive-growth');

  const createRes = await handleConstructionSettingsProfilesCreate(new Request('https://example.com/construction/settings/profiles', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ profile_name: 'Trim Delete Target' }),
  }), env);
  const created = await json(createRes);

  const deleteRes = await handleConstructionSettingsProfilesDelete(new Request('https://example.com/construction/settings/profiles/delete', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ profile_id: `  ${created.profile_id}  ` }),
  }), env);
  assert.equal(deleteRes.status, 200);
});

test('activate and delete endpoints reject unknown fields to prevent false-success writes', async () => {
  const env = makeEnv();

  const activateRes = await handleConstructionSettingsProfilesActivate(new Request('https://example.com/construction/settings/profiles/activate', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ profile_id: 'balanced-operator', unsafe: true }),
  }), env);
  const activateBody = await json(activateRes);
  assert.equal(activateRes.status, 400);
  assert.equal(activateBody.error.code, 'SETTINGS_PROFILE_ACTIVATE_VALIDATION_FAILED');
  assert.match(activateBody.error.details.errors[0], /unknown field: unsafe/);

  const deleteRes = await handleConstructionSettingsProfilesDelete(new Request('https://example.com/construction/settings/profiles/delete', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ profile_id: 'aggressive-growth', unsafe: true }),
  }), env);
  const deleteBody = await json(deleteRes);
  assert.equal(deleteRes.status, 400);
  assert.equal(deleteBody.error.code, 'SETTINGS_PROFILE_DELETE_VALIDATION_FAILED');
  assert.match(deleteBody.error.details.errors[0], /unknown field: unsafe/);
});

test('stored profile ids and active profile id are normalized when reading settings profiles model', async () => {
  const env = makeEnv();
  await env.CPI_SNAPSHOTS.put('settings:profiles', JSON.stringify([
    {
      profile_id: '  aggressive-growth  ',
      profile_name: 'Aggressive Growth',
      description: 'legacy spacing',
      is_active: true,
      settings: { alert_sensitivity: 'aggressive' },
      updated_at: '2025-01-01T00:00:00.000Z',
    },
  ]));
  await env.CPI_SNAPSHOTS.put('settings:active_profile_id', JSON.stringify('  aggressive-growth  '));

  const profilesRes = await handleConstructionSettingsProfiles(new Request('https://example.com/construction/settings/profiles'), env);
  const profilesBody = await json(profilesRes);
  assert.equal(profilesRes.status, 200);
  assert.equal(profilesBody.active_profile_id, 'aggressive-growth');
  assert.ok(profilesBody.profiles.some((entry) => entry.profile_id === 'aggressive-growth'));
  assert.equal(profilesBody.profiles.some((entry) => entry.profile_id === '  aggressive-growth  '), false);

  const settingsRes = await handleConstructionSettings(new Request('https://example.com/construction/settings'), env);
  const settingsBody = await json(settingsRes);
  assert.equal(settingsRes.status, 200);
  assert.equal(settingsBody.active_profile_id, 'aggressive-growth');
  assert.equal(settingsBody.active_profile_name, 'Aggressive Growth');
});

test('profiles list preserves legacy active profile marker when active profile id key is missing', async () => {
  const env = makeEnv();
  await env.CPI_SNAPSHOTS.put('settings:profiles', JSON.stringify([
    {
      profile_id: 'balanced-operator',
      profile_name: 'Balanced Operator',
      description: 'default',
      is_active: false,
      settings: { alert_sensitivity: 'balanced' },
      updated_at: '2025-01-01T00:00:00.000Z',
    },
    {
      profile_id: 'aggressive-growth',
      profile_name: 'Aggressive Growth',
      description: 'legacy active marker',
      is_active: true,
      settings: { alert_sensitivity: 'aggressive' },
      updated_at: '2025-01-01T00:00:00.000Z',
    },
  ]));

  const settingsRes = await handleConstructionSettings(new Request('https://example.com/construction/settings'), env);
  const settingsBody = await json(settingsRes);
  assert.equal(settingsRes.status, 200);
  assert.equal(settingsBody.active_profile_id, 'aggressive-growth');
  assert.equal(settingsBody.active_profile_name, 'Aggressive Growth');
  assert.equal(settingsBody.settings.alert_sensitivity, 'aggressive');
});

test('active profile endpoint returns endpoint-specific malformed JSON error', async () => {
  const env = makeEnv();
  const res = await worker.fetch(new Request('https://example.com/construction/settings/active-profile', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: '{',
  }), env);
  const body = await json(res);
  assert.equal(res.status, 400);
  assert.equal(body.error.code, 'ACTIVE_PROFILE_INVALID_JSON');
});


test('liquidity endpoint renormalizes score when one liquidity input is unavailable', async () => {
  const env = makeEnv({ FRED_API_KEY: 'test-key' });
  const originalFetch = globalThis.fetch;

  globalThis.fetch = async (url) => {
    const parsed = new URL(String(url));
    const seriesId = parsed.searchParams.get('series_id');

    if (seriesId === 'FEDFUNDS') {
      return new Response(JSON.stringify({ observations: [{ date: '2025-01-01', value: '3.0' }] }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({ observations: [{ date: '2025-01-01', value: '.' }] }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  };

  try {
    const res = await handleLiquidity(env);
    const body = await json(res);

    assert.equal(res.status, 200);
    assert.equal(body.liquidity.mortgage_rate, null);
    assert.equal(body.liquidity.fed_funds, 3);
    assert.equal(body.liquidity.liquidity_score, 50);
    assert.equal(body.liquidity.liquidity_state, 'neutral');
  } finally {
    globalThis.fetch = originalFetch;
  }
});


test('bundle endpoint accepts valid custom series list', async () => {
  const env = makeEnv({ FRED_API_KEY: 'test-key' });
  const originalFetch = globalThis.fetch;
  const requested = [];

  globalThis.fetch = async (url) => {
    const parsed = new URL(String(url));
    const seriesId = parsed.searchParams.get('series_id');
    requested.push(seriesId);
    return new Response(JSON.stringify({ observations: [{ date: '2025-01-01', value: '1.0' }] }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  };

  try {
    const req = new Request('https://example.com/bundle?series=MORTGAGE30US,FEDFUNDS');
    const res = await handleBundle(req, env);
    const body = await json(res);

    assert.equal(res.status, 200);
    assert.deepEqual(requested, ['MORTGAGE30US', 'FEDFUNDS']);
    assert.deepEqual(Object.keys(body.bundle.series), ['MORTGAGE30US', 'FEDFUNDS']);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('bundle endpoint deduplicates repeated custom series ids before fetch fan-out', async () => {
  const env = makeEnv({ FRED_API_KEY: 'test-key' });
  const originalFetch = globalThis.fetch;
  const requested = [];

  globalThis.fetch = async (url) => {
    const parsed = new URL(String(url));
    const seriesId = parsed.searchParams.get('series_id');
    requested.push(seriesId);
    return new Response(JSON.stringify({ observations: [{ date: '2025-01-01', value: '1.0' }] }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  };

  try {
    const req = new Request('https://example.com/bundle?series=MORTGAGE30US,FEDFUNDS,MORTGAGE30US,FEDFUNDS');
    const res = await handleBundle(req, env);

    assert.equal(res.status, 200);
    assert.deepEqual(requested, ['MORTGAGE30US', 'FEDFUNDS']);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('bundle endpoint rejects too many requested series ids', async () => {
  const env = makeEnv();
  const series = Array.from({ length: 11 }, (_, i) => `SERIES${i + 1}`).join(',');
  const req = new Request(`https://example.com/bundle?series=${encodeURIComponent(series)}`);

  const res = await handleBundle(req, env);
  const body = await json(res);

  assert.equal(res.status, 400);
  assert.equal(body.error?.code, 'SERIES_INVALID');
  assert.match(body.error?.details?.reason || '', /too many series requested/i);
});

test('bundle endpoint rejects malformed series identifiers', async () => {
  const env = makeEnv();
  const req = new Request('https://example.com/bundle?series=MORTGAGE30US,%20bad-id');

  const res = await handleBundle(req, env);
  const body = await json(res);

  assert.equal(res.status, 400);
  assert.equal(body.error?.code, 'SERIES_INVALID');
  assert.match(body.error?.details?.reason || '', /invalid identifier present/i);
});
test('bundle endpoint rejects invalid limit query values to prevent unbounded upstream requests', async () => {
  const env = makeEnv();
  const badValues = ['abc', '-1', '0', '5001', '12.5'];

  for (const bad of badValues) {
    const req = new Request(`https://example.com/bundle?limit=${encodeURIComponent(bad)}`);
    const res = await handleBundle(req, env);
    const body = await json(res);

    assert.equal(res.status, 400);
    assert.equal(body.error?.code, 'LIMIT_INVALID');
  }
});

test('fred observations endpoint rejects invalid limit query values before upstream call', async () => {
  const env = makeEnv({ FRED_API_KEY: 'test-key' });
  const req = new Request('https://example.com/fred/observations?series_id=CPIAUCSL&limit=NaN');

  const res = await handleFredObservations(req, env);
  const body = await json(res);

  assert.equal(res.status, 400);
  assert.equal(body.error?.code, 'LIMIT_INVALID');
});


test('market radar returns subsection error when markets index asset contains malformed JSON', async () => {
  const env = makeEnv({
    ASSETS: {
      async fetch(url) {
        if (url.endsWith('/markets/index.json')) {
          return new Response('{', { status: 200, headers: { 'content-type': 'application/json' } });
        }
        return new Response('not-found', { status: 404 });
      },
    },
  });

  const res = await handleConstructionMarketRadar(env);
  const body = await json(res);

  assert.equal(res.status, 200);
  assert.equal(body.radar.ok, false);
  assert.equal(body.radar.error.code, 'MARKETS_INDEX_INVALID');
});

test('market radar skips malformed market payloads and ranks valid markets', async () => {
  const env = makeEnv({
    ASSETS: {
      async fetch(url) {
        if (url.endsWith('/markets/index.json')) {
          return new Response(JSON.stringify({
            markets: [
              { id: 'national', type: 'national', path: 'markets/national/signal_api_latest.json', label: 'United States' },
              { id: 'austin', type: 'metro', path: 'markets/austin/signal_api_latest.json', label: 'Austin' },
              { id: 'phoenix', type: 'metro', path: 'markets/phoenix/signal_api_latest.json', label: 'Phoenix' },
            ],
          }), { status: 200, headers: { 'content-type': 'application/json' } });
        }
        if (url.endsWith('/markets/national/signal_api_latest.json')) {
          return new Response(JSON.stringify({ indices: { pressure_index: { value: 58 } }, meta: { region: { name: 'United States' } } }), { status: 200 });
        }
        if (url.endsWith('/markets/austin/signal_api_latest.json')) {
          return new Response('{', { status: 200, headers: { 'content-type': 'application/json' } });
        }
        if (url.endsWith('/markets/phoenix/signal_api_latest.json')) {
          return new Response(JSON.stringify({
            meta: { region: { name: 'Phoenix' } },
            indices: { pressure_index: { value: 67, zone: 'Hot', momentum_band: 'Accelerating', risk_state: '🔴' } },
            regime: { cycle_state: 'Expansion' },
          }), { status: 200, headers: { 'content-type': 'application/json' } });
        }
        return new Response('not-found', { status: 404 });
      },
    },
  });

  const res = await handleConstructionMarketRadar(env);
  const body = await json(res);

  assert.equal(res.status, 200);
  assert.equal(body.radar.hottest_markets.length, 1);
  assert.equal(body.radar.hottest_markets[0].market, 'Phoenix');
  assert.equal(body.radar.weakest_markets[0].market, 'Phoenix');
});

test('market radar tolerates malformed national baseline payload and still ranks metro markets', async () => {
  const env = makeEnv({
    ASSETS: {
      async fetch(url) {
        if (url.endsWith('/markets/index.json')) {
          return new Response(JSON.stringify({
            markets: [
              { id: 'national', type: 'national', path: 'markets/national/signal_api_latest.json', label: 'United States' },
              { id: 'phoenix', type: 'metro', path: 'markets/phoenix/signal_api_latest.json', label: 'Phoenix' },
            ],
          }), { status: 200, headers: { 'content-type': 'application/json' } });
        }
        if (url.endsWith('/markets/national/signal_api_latest.json')) {
          return new Response('{', { status: 200, headers: { 'content-type': 'application/json' } });
        }
        if (url.endsWith('/markets/phoenix/signal_api_latest.json')) {
          return new Response(JSON.stringify({
            meta: { region: { name: 'Phoenix' } },
            indices: { pressure_index: { value: 67, zone: 'Hot', momentum_band: 'Accelerating', risk_state: '🔴' } },
            regime: { cycle_state: 'Expansion' },
          }), { status: 200, headers: { 'content-type': 'application/json' } });
        }
        return new Response('not-found', { status: 404 });
      },
    },
  });

  const res = await handleConstructionMarketRadar(env);
  const body = await json(res);

  assert.equal(res.status, 200);
  assert.equal(body.radar.hottest_markets.length, 1);
  assert.equal(body.radar.hottest_markets[0].market, 'Phoenix');
  assert.match(body.radar.summary.top_strength_theme, /Phoenix|strength:/);
});
