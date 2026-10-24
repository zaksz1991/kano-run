import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const repair = await readFile(new URL('../js/KanoKekeGlbActivationRepair.js', import.meta.url), 'utf8');
const rules = await readFile(new URL('../js/KanoKekeGlbActivationRules.js', import.meta.url), 'utf8');
const diff = await readFile(new URL('../integration/KanoWorldPerformanceInstancingUpgrade.js.diff', import.meta.url), 'utf8');

test('repair is additive and patches only the renderer validator', () => {
  assert.match(repair, /prototype\.validateKekeModelCandidate/);
  assert.match(repair, /originalValidate\.call\(this, object, \.\.\.args\)/);
  assert.doesNotMatch(repair, /prototype\.(?:applyModel|draw|render)\s*=/);
});

test('acceptance rule is restricted to the catalogued keke-3 asset', () => {
  assert.match(rules, /vehicles\/keke\/keke-3\.glb/);
  assert.match(rules, /missing-vehicle-structure-evidence/);
  assert.match(rules, /characterMeshes/);
});

test('startup diff imports the repair before the app entrypoint is reached', () => {
  assert.match(diff, /\+import '\.\/KanoKekeGlbActivationRepair\.js';/);
  assert.match(diff, /KanoWorldPerformanceInstancingUpgrade\.js/);
});

test('runtime audit exposes active model path, fallback state, geometry and seated driver', () => {
  assert.match(repair, /kanoKekeGlbActivationAudit/);
  assert.match(repair, /playerUsesFallback/);
  assert.match(repair, /estimatedTriangles/);
  assert.match(repair, /driverRigPresent/);
});
