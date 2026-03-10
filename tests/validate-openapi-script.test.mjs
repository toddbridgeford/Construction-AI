import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';

test('OpenAPI validator enforces construction settings write endpoints and POST schemas', async () => {
  const validator = await fs.readFile(new URL('../scripts/validate_openapi.rb', import.meta.url), 'utf8');

  assert.match(validator, /REQUIRED_POST_PATHS\s*=\s*\[/);
  assert.match(validator, /'\/construction\/settings'/);
  assert.match(validator, /'\/construction\/settings\/profiles'/);
  assert.match(validator, /'\/construction\/settings\/active-profile'/);
  assert.match(validator, /'\/construction\/settings\/profiles\/activate'/);
  assert.match(validator, /'\/construction\/settings\/profiles\/delete'/);
  assert.match(validator, /paths\.dig\(path, 'post', 'responses', '200', 'content', 'application\/json', 'schema'\)/);
});

test('OpenAPI construction settings response schema includes active profile metadata returned at runtime', async () => {
  const raw = await fs.readFile(new URL('../openapi.yaml', import.meta.url), 'utf8');
  assert.match(raw, /ConstructionSettingsResponse:[\s\S]*?active_profile_id:\s*\n\s*type:\s*string/);
  assert.match(raw, /ConstructionSettingsResponse:[\s\S]*?active_profile_name:\s*\n\s*type:\s*string/);
  assert.match(raw, /ConstructionSettingsResponse:[\s\S]*?required:\s*\[ok, ts, service, active_profile_id, active_profile_name, settings\]/);
});

test('OpenAPI custom watchlist response schema includes profile-aware fields returned at runtime', async () => {
  const raw = await fs.readFile(new URL('../openapi.yaml', import.meta.url), 'utf8');
  assert.match(raw, /ConstructionCustomWatchlistResponse:[\s\S]*?active_profile_id:\s*\n\s*type:\s*string/);
  assert.match(raw, /ConstructionCustomWatchlistResponse:[\s\S]*?active_profile_name:\s*\n\s*type:\s*string/);
  assert.match(raw, /ConstructionCustomWatchlistResponse:[\s\S]*?settings_summary:\s*\n\s*type:\s*string/);
  assert.match(raw, /ConstructionCustomWatchlistResponse:[\s\S]*?saved_profiles_summary:\s*\n\s*type:\s*string/);
  assert.match(raw, /ConstructionCustomWatchlistResponse:[\s\S]*?required:\s*\[ok, ts, service, alerts, summary, active_settings, active_profile_id, active_profile_name, settings_summary, saved_profiles_summary\]/);
});


test('OpenAPI settings write request schemas allow runtime partial payloads', async () => {
  const raw = await fs.readFile(new URL('../openapi.yaml', import.meta.url), 'utf8');
  assert.match(raw, /"\/construction\/settings":[\s\S]*?post:[\s\S]*?ConstructionSettingsPatchModel/);
  assert.match(raw, /ConstructionSettingsProfileCreateRequest:[\s\S]*?settings:[\s\S]*?ConstructionSettingsPatchModel/);
  assert.match(raw, /ConstructionSettingsPatchModel:[\s\S]*?additionalProperties:\s*false/);
});


test('OpenAPI operations declare explicit route-group tags and preserve deprecated aliases', async () => {
  const raw = await fs.readFile(new URL('../openapi.yaml', import.meta.url), 'utf8');

  const assertTag = (path, method, expectedTag) => {
    const escapedPath = path.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const pattern = new RegExp(`\"${escapedPath}\":[\\s\\S]*?\\n\\s{4}${method}:[\\s\\S]*?\\n\\s{6}tags:[\\s\\S]*?\\n\\s{6}- ${expectedTag}`);
    assert.match(raw, pattern);
  };

  assertTag('/', 'get', 'Canonical Product');
  assertTag('/health', 'get', 'Canonical Product');
  assertTag('/construction/settings', 'post', 'Canonical Product');

  assertTag('/construction/power', 'get', 'Advanced Model');
  assertTag('/construction/heatmap', 'get', 'Advanced Model');
  assertTag('/construction/nowcast', 'get', 'Advanced Model');
  assertTag('/construction/forecast', 'get', 'Advanced Model');

  assertTag('/ytd/commercial', 'get', 'Compatibility Alias');
  assertTag('/ytd/housing', 'get', 'Compatibility Alias');
  assertTag('/ytd/summary', 'get', 'Compatibility Alias');

  assert.match(raw, /"\/ytd\/commercial":[\s\S]*?deprecated:\s*true/);
  assert.match(raw, /"\/ytd\/housing":[\s\S]*?deprecated:\s*true/);
  assert.match(raw, /"\/ytd\/summary":[\s\S]*?deprecated:\s*true/);
});
