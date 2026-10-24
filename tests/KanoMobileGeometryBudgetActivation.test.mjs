import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const read = (relative) => fs.readFileSync(path.join(root, relative), 'utf8');

test('optimizer imports the rules module required by its existing tests', () => {
  const optimizer = read('js/KanoMobileGeometryBudgetUpgrade.js');
  const rules = read('js/KanoMobileGeometryBudgetRules.js');
  assert.match(optimizer, /from '\.\/KanoMobileGeometryBudgetRules\.js'/);
  for (const name of [
    'KANO_MOBILE_MODEL_TRIANGLE_LIMIT',
    'KANO_MOBILE_MODEL_TRIANGLE_TARGET',
    'countGeometryTriangles',
    'planMobileGeometryReduction',
    'verticesToRemove',
  ]) assert.match(rules, new RegExp(`export\\s+(?:const|function)\\s+${name}\\b`));
});

test('world-performance entrypoint activates the optimizer before renderer imports', () => {
  const entry = read('js/KanoWorldPerformanceInstancingUpgrade.js');
  const activation = entry.indexOf("import './KanoMobileGeometryBudgetUpgrade.js';");
  const rendererImport = entry.indexOf("import { Renderer3D } from './renderer3d.js';");
  assert.ok(activation >= 0, 'optimizer import is missing from the reachable startup entrypoint');
  assert.ok(rendererImport >= 0, 'renderer import is missing');
  assert.ok(activation < rendererImport, 'optimizer must register before the renderer module executes');
});

test('index.html loads the world-performance entrypoint before main.js', () => {
  const html = read('index.html');
  const worldPerformance = html.indexOf('src="/js/KanoWorldPerformanceInstancingUpgrade.js"');
  const appEntry = html.indexOf('src="/js/main.js"');
  assert.ok(worldPerformance >= 0, 'world-performance module is not a startup root');
  assert.ok(appEntry >= 0, 'main.js startup root is missing');
  assert.ok(worldPerformance < appEntry, 'optimizer entrypoint must be declared before main.js');
});
