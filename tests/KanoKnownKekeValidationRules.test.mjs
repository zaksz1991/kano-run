import test from 'node:test';
import assert from 'node:assert/strict';
import {
  isCataloguedKekeModelPath,
  decideCataloguedKekeValidation,
} from '../js/KanoKnownKekeValidationRules.js';

const goodGeometry = {
  width: 1.42,
  height: 1.85,
  depth: 2.15,
  meshCount: 22,
  wheelLikeCount: 2,
  broadBodyCount: 1,
};

function candidate(overrides = {}) {
  return {
    path: 'vehicles/keke/keke-3.glb',
    originalReason: 'missing-vehicle-structure-evidence',
    ...goodGeometry,
    ...overrides,
  };
}

test('accepts every known keke catalog slot and optional asset-root prefix', () => {
  for (let index = 1; index <= 8; index += 1) {
    assert.equal(isCataloguedKekeModelPath(`vehicles/keke/keke-${index}.glb`), true);
    assert.equal(isCataloguedKekeModelPath(`/assets/models/vehicles/keke/keke-${index}.glb`), true);
  }
});

test('rejects traversal, unexpected extensions, and paths outside the keke catalog', () => {
  assert.equal(isCataloguedKekeModelPath('../vehicles/keke/keke-3.glb'), false);
  assert.equal(isCataloguedKekeModelPath('vehicles/keke/keke-9.glb'), false);
  assert.equal(isCataloguedKekeModelPath('characters/passengers/keke-3.glb'), false);
  assert.equal(isCataloguedKekeModelPath('vehicles/keke/keke-3.gltf'), false);
});

test('accepts generic-named catalogued body geometry for the usual name-evidence failure', () => {
  const result = decideCataloguedKekeValidation(candidate());
  assert.equal(result.accept, true);
  assert.equal(result.reason, 'catalogued-keke-path-and-geometric-vehicle-evidence');
});

test('accepts a catalogued keke rejected as character-only when chassis geometry is independently plausible', () => {
  const result = decideCataloguedKekeValidation(candidate({
    originalReason: 'character-only-model-no-vehicle-structure',
    wheelLikeCount: 0,
    meshCount: 18,
    broadBodyCount: 1,
  }));
  assert.equal(result.accept, true);
  assert.equal(result.originalReason, 'character-only-model-no-vehicle-structure');
});

test('accepts wheel-backed geometry even when broad body evidence is inconclusive', () => {
  const result = decideCataloguedKekeValidation(candidate({ broadBodyCount: 0, wheelLikeCount: 2 }));
  assert.equal(result.accept, true);
});

test('rejects non-catalogued paths even if dimensions and meshes are plausible', () => {
  const result = decideCataloguedKekeValidation(candidate({ path: 'vehicles/cars/sedan.glb' }));
  assert.equal(result.accept, false);
  assert.equal(result.reason, 'untrusted-model-path');
});

test('does not override unrelated renderer failures', () => {
  const result = decideCataloguedKekeValidation(candidate({ originalReason: 'implausible-keke-bounds' }));
  assert.equal(result.accept, false);
  assert.equal(result.reason, 'not-a-name-evidence-only-failure');
});

test('rejects implausible dimensions and insufficient mesh evidence', () => {
  assert.equal(decideCataloguedKekeValidation(candidate({ width: 0.12 })).accept, false);
  assert.equal(decideCataloguedKekeValidation(candidate({ height: 7 })).accept, false);
  assert.equal(decideCataloguedKekeValidation(candidate({ meshCount: 2 })).accept, false);
  assert.equal(decideCataloguedKekeValidation(candidate({ wheelLikeCount: 0, broadBodyCount: 0 })).accept, false);
  assert.equal(decideCataloguedKekeValidation(candidate({ wheelLikeCount: 0, broadBodyCount: 1, meshCount: 7 })).accept, false);
});

test('rejects non-finite geometry evidence', () => {
  const result = decideCataloguedKekeValidation(candidate({ depth: Number.NaN }));
  assert.equal(result.accept, false);
  assert.equal(result.reason, 'non-finite-geometry-evidence');
});
