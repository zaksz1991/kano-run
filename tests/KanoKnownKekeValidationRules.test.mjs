import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { Buffer } from 'node:buffer';

// The browser app uses native ES modules without a package.json type flag.
// Loading the pure helper from a data URL lets Node test the exact JS source
// without changing the repository's package configuration.
const source = await readFile(new URL('../js/KanoKnownKekeValidationRules.js', import.meta.url), 'utf8');
const rules = await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);

const plausible = {
  path: 'vehicles/keke/keke-3.glb',
  originalReason: 'missing-vehicle-structure-evidence',
  width: 1.15,
  height: 1.85,
  depth: 1.8,
  meshCount: 18,
  wheelLikeCount: 3,
  broadBodyCount: 2,
  characterMeshCount: 1,
};

test('recognizes only catalogued keke GLB paths', () => {
  assert.equal(rules.isCataloguedKekeModelPath('vehicles/keke/keke-3.glb'), true);
  assert.equal(rules.isCataloguedKekeModelPath('/assets/models/vehicles/keke/keke-8.glb'), true);
  assert.equal(rules.isCataloguedKekeModelPath('characters/passengers/hijab_muslim_woman.glb'), false);
  assert.equal(rules.isCataloguedKekeModelPath('vehicles/keke/../../characters/Man.glb'), false);
});

test('accepts realistic catalogued vehicle geometry when only names fail', () => {
  const result = rules.decideCataloguedKekeValidation(plausible);
  assert.equal(result.accept, true);
  assert.equal(result.reason, 'catalogued-keke-path-and-geometric-vehicle-evidence');
});

test('does not override other original validation failures', () => {
  assert.equal(rules.decideCataloguedKekeValidation({ ...plausible, originalReason: 'no-visible-renderable-meshes' }).accept, false);
});

test('rejects implausible dimensions', () => {
  assert.equal(rules.decideCataloguedKekeValidation({ ...plausible, width: 7.5 }).accept, false);
  assert.equal(rules.decideCataloguedKekeValidation({ ...plausible, height: 0.12 }).accept, false);
});

test('rejects a human/prop without vehicle component evidence', () => {
  const result = rules.decideCataloguedKekeValidation({ ...plausible, wheelLikeCount: 0, broadBodyCount: 0, characterMeshCount: 5 });
  assert.equal(result.accept, false);
  assert.equal(result.reason, 'insufficient-geometric-vehicle-evidence');
});

test('allows a broad low chassis with component evidence and up to two embedded human meshes', () => {
  const result = rules.decideCataloguedKekeValidation({ ...plausible, wheelLikeCount: 0, broadBodyCount: 1, meshCount: 8, characterMeshCount: 2 });
  assert.equal(result.accept, true);
});

test('rejects too few or excessive meshes', () => {
  assert.equal(rules.decideCataloguedKekeValidation({ ...plausible, meshCount: 2 }).accept, false);
  assert.equal(rules.decideCataloguedKekeValidation({ ...plausible, meshCount: 2501 }).accept, false);
});

test('rejects non-finite measurements', () => {
  assert.equal(rules.decideCataloguedKekeValidation({ ...plausible, depth: Number.NaN }).accept, false);
});
