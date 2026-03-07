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
} from '../src/routes/construction.js';

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

test('reset returns balanced baseline and keeps endpoint compatibility', async () => {
  const env = makeEnv();
  const res = await handleConstructionSettingsReset(new Request('https://example.com/construction/settings/reset', { method: 'POST' }), env);
  const body = await json(res);
  assert.equal(res.status, 200);
  assert.equal(body.reset, true);
  assert.equal(body.baseline, 'balanced-operator');
  assert.equal(body.settings.alert_sensitivity, 'balanced');
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
  assert.equal(watchlistBody.active_profile_name, 'GC Cash Protection');
  assert.equal(typeof watchlistBody.settings_summary, 'string');
  assert.equal(typeof watchlistBody.saved_profiles_summary, 'string');

  const terminalRes = await handleConstructionTerminal(new Request('https://example.com/construction/terminal'), env);
  const terminalBody = await json(terminalRes);
  assert.equal(terminalRes.status, 200);
  assert.equal(typeof terminalBody.terminal.active_settings_profile, 'string');
  assert.equal(typeof terminalBody.terminal.saved_profiles_summary, 'string');
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
