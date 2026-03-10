import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';


const SETTINGS_ROUTES_WITH_GET_AND_POST = new Set([
  '/construction/settings',
  '/construction/settings/profiles',
  '/construction/settings/active-profile',
]);

function extractRouteLiterals(source, pattern, errorMessage) {
  const block = source.match(pattern);
  assert.ok(block, errorMessage);
  return [...block[1].matchAll(/"([^"]+)"\s*:/g)].map((match) => match[1]);
}

function extractSettingsWriteRoutes(workerSource) {
  const block = workerSource.match(/const isSettingsWriteRoute = \[([\s\S]*?)\]\.includes\(pathname\);/);
  assert.ok(block, 'Unable to locate isSettingsWriteRoute list in src/worker.js');
  return new Set([...block[1].matchAll(/"([^"]+)"/g)].map((match) => match[1]));
}

function extractRuntimeRouteMethods(workerSource, constructionSource) {
  const routeMethods = new Map();

  for (const match of workerSource.matchAll(/pathname\s*===\s*"([^"]+)"/g)) {
    routeMethods.set(match[1], new Set(['GET']));
  }

  const constructionRoutes = extractRouteLiterals(
    workerSource,
    /export const CONSTRUCTION_ROUTE_HANDLERS = \{([\s\S]*?)\n\};/,
    'Unable to locate CONSTRUCTION_ROUTE_HANDLERS in src/worker.js',
  );
  for (const route of constructionRoutes) {
    routeMethods.set(route, new Set(['GET']));
  }

  const portfolioRoutes = extractRouteLiterals(
    constructionSource,
    /export const PORTFOLIO_LAYER_ROUTE_HANDLERS = \{([\s\S]*?)\n\};/,
    'Unable to locate PORTFOLIO_LAYER_ROUTE_HANDLERS in src/routes/construction.js',
  );
  for (const route of portfolioRoutes) {
    routeMethods.set(route, new Set(['GET']));
  }

  const settingsWriteRoutes = extractSettingsWriteRoutes(workerSource);
  for (const route of settingsWriteRoutes) {
    if (!routeMethods.has(route) || !SETTINGS_ROUTES_WITH_GET_AND_POST.has(route)) {
      routeMethods.set(route, new Set());
    }
    routeMethods.get(route).add('POST');
  }

  return routeMethods;
}

function extractOpenApiContract(openApiSource) {
  const contract = new Map();
  const lines = openApiSource.split('\n');

  let currentPath = null;
  let currentMethod = null;

  for (const line of lines) {
    const pathMatch = line.match(/^\s{2}"(\/[^"]*)":\s*$/);
    if (pathMatch) {
      currentPath = pathMatch[1];
      currentMethod = null;
      contract.set(currentPath, { methods: new Map() });
      continue;
    }

    if (!currentPath) continue;

    const methodMatch = line.match(/^\s{4}(get|post|put|patch|delete|head|options):\s*$/i);
    if (methodMatch) {
      currentMethod = methodMatch[1].toUpperCase();
      contract.get(currentPath).methods.set(currentMethod, {
        deprecated: false,
        compatibilityAliasTag: false,
      });
      continue;
    }

    if (!currentMethod) continue;

    if (/^\s{6}deprecated:\s*true\s*$/.test(line)) {
      contract.get(currentPath).methods.get(currentMethod).deprecated = true;
    }

    if (/^\s{6}- Compatibility Alias\s*$/.test(line)) {
      contract.get(currentPath).methods.get(currentMethod).compatibilityAliasTag = true;
    }
  }

  return contract;
}

function isDeprecatedCompatibilityAlias(pathContract) {
  const methods = [...pathContract.methods.values()];
  return methods.length > 0 && methods.every((method) => method.deprecated && method.compatibilityAliasTag);
}

test('public worker runtime routes and OpenAPI contract stay in strict parity', async () => {
  const [workerSource, constructionSource, openApiSource] = await Promise.all([
    fs.readFile(new URL('../src/worker.js', import.meta.url), 'utf8'),
    fs.readFile(new URL('../src/routes/construction.js', import.meta.url), 'utf8'),
    fs.readFile(new URL('../openapi.yaml', import.meta.url), 'utf8'),
  ]);

  const runtimeRouteMethods = extractRuntimeRouteMethods(workerSource, constructionSource);
  const openApiContract = extractOpenApiContract(openApiSource);

  const undocumentedRuntimeRoutes = [...runtimeRouteMethods.keys()]
    .filter((route) => !openApiContract.has(route))
    .sort();

  const runtimeMethodGaps = [...runtimeRouteMethods.entries()]
    .flatMap(([route, methods]) => [...methods]
      .filter((method) => !openApiContract.get(route)?.methods.has(method))
      .map((method) => `${method} ${route}`))
    .sort();

  const undocumentedOpenApiRoutes = [...openApiContract.entries()]
    .filter(([route, pathContract]) => !runtimeRouteMethods.has(route) && !isDeprecatedCompatibilityAlias(pathContract))
    .map(([route]) => route)
    .sort();

  const openApiMethodGaps = [...openApiContract.entries()]
    .flatMap(([route, pathContract]) => [...pathContract.methods.keys()]
      .filter((method) => runtimeRouteMethods.has(route) && !runtimeRouteMethods.get(route).has(method))
      .map((method) => `${method} ${route}`))
    .sort();

  assert.deepEqual(
    undocumentedRuntimeRoutes,
    [],
    `Worker has public routes missing from openapi.yaml: ${undocumentedRuntimeRoutes.join(', ')}`,
  );

  assert.deepEqual(
    runtimeMethodGaps,
    [],
    `Worker has public route methods missing from openapi.yaml: ${runtimeMethodGaps.join(', ')}`,
  );

  assert.deepEqual(
    undocumentedOpenApiRoutes,
    [],
    'openapi.yaml has documented public paths that are neither live in runtime nor marked as deprecated compatibility aliases: '
      + `${undocumentedOpenApiRoutes.join(', ')}`,
  );

  assert.deepEqual(
    openApiMethodGaps,
    [],
    `openapi.yaml documents route methods that are not live in runtime: ${openApiMethodGaps.join(', ')}`,
  );
});
