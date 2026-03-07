import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';

test('OpenAPI validator enforces construction settings write endpoints and POST schemas', async () => {
  const validator = await fs.readFile(new URL('../scripts/validate_openapi.rb', import.meta.url), 'utf8');

  assert.match(validator, /REQUIRED_POST_PATHS\s*=\s*\[/);
  assert.match(validator, /'\/construction\/settings\/profiles\/activate'/);
  assert.match(validator, /'\/construction\/settings\/profiles\/delete'/);
  assert.match(validator, /paths\.dig\(path, 'post', 'responses', '200', 'content', 'application\/json', 'schema'\)/);
});
