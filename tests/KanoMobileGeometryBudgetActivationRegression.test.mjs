import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(here, '..');
const read = (relativePath) => readFileSync(path.join(projectRoot, relativePath), 'utf8');

test('mobile geometry optimizer resolves the existing JavaScript rules module', () => {
  const optimizer = read('js/KanoMobileGeometryBudgetUpgrade.js');
  const rules = path.join(projectRoot, 'js/KanoMobileGeometryBudgetRules.js');
  assert.ok(existsSync(rules), 'KanoMobileGeometryBudgetRules.js must exist');
  assert.match(optimizer, /from\s+['"]\.\/KanoMobileGeometryBudgetRules\.js['"]/);
  assert.doesNotMatch(optimizer, /KanoMobileGeometryBudgetRules\.mjs/);
});

test('existing pre-main world-performance entrypoint imports the optimizer', () => {
  const entrypoint = read('js/KanoWorldPerformanceInstancingUpgrade.js');
  assert.match(entrypoint, /import\s+['"]\.\/KanoMobileGeometryBudgetUpgrade\.js['"]/);
  const html = read('index.html');
  const performanceRoot = html.indexOf('src="/js/KanoWorldPerformanceInstancingUpgrade.js"');
  const mainEntry = html.indexOf('src="/js/main.js"');
  assert.notEqual(performanceRoot, -1, 'world-performance entrypoint must be present');
  assert.notEqual(mainEntry, -1, 'main.js entrypoint must be present');
  assert.ok(performanceRoot < mainEntry, 'optimizer entrypoint must load before main.js');
});

test('optimizer retains mobile-only registration and reports actual outcomes', () => {
  const optimizer = read('js/KanoMobileGeometryBudgetUpgrade.js');
  assert.match(optimizer, /isMobileViewport\(\)\s*&&\s*!ModelManager\.prototype\[PATCH_KEY\]/);
  assert.match(optimizer, /simplified-within-budget/);
  assert.match(optimizer, /simplified-but-still-over-budget/);
  assert.match(optimizer, /simplification-failed-original-retained/);
});

test('real model assets remain authoritative; optimizer does not write asset files', () => {
  const optimizer = read('js/KanoMobileGeometryBudgetUpgrade.js');
  assert.match(optimizer, /never edits or\s+\* overwrites public model files/i);
  assert.match(optimizer, /original GLB geometry retained/i);
  assert.doesNotMatch(optimizer, /writeFile|unlink\(|rename\(/);
});
