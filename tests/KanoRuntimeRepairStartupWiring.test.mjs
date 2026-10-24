import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

const root = process.cwd();
const source = (path) => readFileSync(resolve(root, path), 'utf8');
const exists = (path) => existsSync(resolve(root, path));

const requiredModules = [
  'KanoKekeGlbActivationRepair.js',
  'KanoNorthernPedestrianGaitUpgrade.js',
  'KanoMobileWorldClarityUpgrade.js',
  'KanoMobileGeometryBudgetUpgrade.js',
  'KanoFlyoverDriveabilityUpgrade.js',
];

test('world-performance startup entrypoint executes before main.js', () => {
  const html = source('index.html');
  const entry = html.indexOf('src="/js/KanoWorldPerformanceInstancingUpgrade.js"');
  const main = html.indexOf('src="/js/main.js"');
  assert.notEqual(entry, -1, 'startup entrypoint is missing from index.html');
  assert.notEqual(main, -1, 'main.js is missing from index.html');
  assert.ok(entry < main, 'repairs must register before main.js constructs the game');
});

test('all referenced repair modules exist in the current project', () => {
  for (const moduleName of requiredModules) {
    assert.ok(exists(`js/${moduleName}`), `missing js/${moduleName}`);
  }
});

test('the startup bridge activates all five existing repair modules exactly once', () => {
  const bridge = source('js/KanoWorldPerformanceInstancingUpgrade.js');
  for (const moduleName of requiredModules) {
    const pattern = new RegExp(`import\\s+['"]\\./${moduleName.replaceAll('.', '\\.') }['"]\\s*;`, 'g');
    assert.equal([...bridge.matchAll(pattern)].length, 1, `${moduleName} import count should be one`);
  }
});

test('clarity filtering wraps model load before geometry reduction wraps it', () => {
  const bridge = source('js/KanoWorldPerformanceInstancingUpgrade.js');
  assert.ok(bridge.indexOf("import './KanoMobileWorldClarityUpgrade.js';")
    < bridge.indexOf("import './KanoMobileGeometryBudgetUpgrade.js';"));
});

test('existing keke repair stays narrow and uses the catalogued GLB only', () => {
  const rules = source('js/KanoKekeGlbActivationRules.js');
  assert.match(rules, /vehicles\/keke\/keke-3\.glb/);
  assert.match(rules, /missing-vehicle-structure-evidence/);
  assert.match(rules, /characterMeshes\)\s*>\s*0/);
});
