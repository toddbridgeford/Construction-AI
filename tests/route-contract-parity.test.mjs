import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';

function extractWorkerRoutes(workerSource, constructionSource) {
  const routes = new Set();

  for (const match of workerSource.matchAll(/pathname\s*===\s*"([^"]+)"/g)) {
    routes.add(match[1]);
  }

  const handlersBlock = workerSource.match(/export const CONSTRUCTION_ROUTE_HANDLERS = \{([\s\S]*?)\n\};/);
  assert.ok(handlersBlock, 'Unable to locate CONSTRUCTION_ROUTE_HANDLERS in src/worker.js');
  for (const match of handlersBlock[1].matchAll(/"([^"]+)"\s*:/g)) {
    routes.add(match[1]);
  }


  const portfolioHandlersBlock = constructionSource.match(/export const PORTFOLIO_LAYER_ROUTE_HANDLERS = \{([\s\S]*?)\n\};/);
  assert.ok(portfolioHandlersBlock, 'Unable to locate PORTFOLIO_LAYER_ROUTE_HANDLERS in src/routes/construction.js');
  for (const match of portfolioHandlersBlock[1].matchAll(/"([^"]+)"\s*:/g)) {
    routes.add(match[1]);
  }

  return routes;
}

function extractOpenApiPaths(openApiSource) {
  const routes = new Set();
  for (const match of openApiSource.matchAll(/^\s{2}"(\/[^"]*)":\s*$/gm)) {
    routes.add(match[1]);
  }


  return routes;
}

test('public worker routes and OpenAPI paths stay in sync', async () => {
  const [workerSource, constructionSource, openApiSource] = await Promise.all([
    fs.readFile(new URL('../src/worker.js', import.meta.url), 'utf8'),
    fs.readFile(new URL('../src/routes/construction.js', import.meta.url), 'utf8'),
    fs.readFile(new URL('../openapi.yaml', import.meta.url), 'utf8'),
  ]);

  const workerRoutes = extractWorkerRoutes(workerSource, constructionSource);
  const openApiPaths = extractOpenApiPaths(openApiSource);

  const undocumentedWorkerRoutes = [...workerRoutes].filter((route) => !openApiPaths.has(route)).sort();
  const unwiredOpenApiRoutes = [...openApiPaths].filter((route) => !workerRoutes.has(route)).sort();

  assert.deepEqual(
    undocumentedWorkerRoutes,
    [],
    `Worker has undocumented public routes: ${undocumentedWorkerRoutes.join(', ')}`,
  );

  assert.deepEqual(
    unwiredOpenApiRoutes,
    [],
    `OpenAPI has unwired public routes: ${unwiredOpenApiRoutes.join(', ')}`,
  );
});
