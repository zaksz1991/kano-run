import test from 'node:test';
import assert from 'node:assert/strict';
import {
  isCataloguedKekeModelPath,
  decideCataloguedKekeValidation,
} from '../js/KanoKnownKekeValidationRules.js';

const plausibleWheeledKeke = {
  width: 1.05,
  height: 1.85,
  depth: 2.25,
  meshCount: 24,
  wheelLikeCount: 3,
  broadBodyCount: 1,
};

test('recognizes each catalogued keke model path', () => {
  for (let index = 1; index <= 8; index += 1) {
    assert.equal(
      isCataloguedKekeModelPath(`vehicles/keke/keke-${index}.glb`),
      true,
    );
  }
});

test('recognizes a deployed model URL while normalizing path policy', () => {
  assert.equal(
    isCataloguedKekeModelPath('/assets/models/vehicles/keke/keke-3.glb'),
    true,
  );
});

test('rejects non-catalogued assets and path traversal', () => {
  assert.equal(isCataloguedKekeModelPath('vehicles/cars/car.glb'), false);
  assert.equal(isCataloguedKekeModelPath('../vehicles/keke/keke-3.glb'), false);
  assert.equal(isCataloguedKekeModelPath('vehicles/keke/keke-9.glb'), false);
});

test('accepts geometry evidence for generic mesh names', () => {
  const result = decideCataloguedKekeValidation({
    path: 'vehicles/keke/keke-3.glb',
    originalReason: 'missing-vehicle-structure-evidence',
    ...plausibleWheeledKeke,
  });
  assert.equal(result.accept, true);
  assert.equal(result.reason, 'catalogued-keke-path-and-geometric-vehicle-evidence');
});

test('accepts a strict world-bounds rejection when normalized local geometry is credible', () => {
  const result = decideCataloguedKekeValidation({
    path: 'vehicles/keke/keke-4.glb',
    originalReason: 'implausible-keke-bounds',
    ...plausibleWheeledKeke,
  });
  assert.equal(result.accept, true);
  assert.equal(result.originalReason, 'implausible-keke-bounds');
});

test('accepts a bounds recheck with substantial body evidence when wheel meshes are generic', () => {
  const result = decideCataloguedKekeValidation({
    path: 'vehicles/keke/keke-5.glb',
    originalReason: 'implausible-keke-bounds',
    ...plausibleWheeledKeke,
    wheelLikeCount: 0,
    broadBodyCount: 2,
    meshCount: 18,
  });
  assert.equal(result.accept, true);
});

test('rejects bounds recheck when measured dimensions are still implausible', () => {
  const result = decideCataloguedKekeValidation({
    path: 'vehicles/keke/keke-4.glb',
    originalReason: 'implausible-keke-bounds',
    ...plausibleWheeledKeke,
    height: 8.2,
  });
  assert.equal(result.accept, false);
  assert.equal(result.reason, 'implausible-keke-geometry');
});

test('rejects bounds recheck without independent vehicle-part evidence', () => {
  const result = decideCataloguedKekeValidation({
    path: 'vehicles/keke/keke-4.glb',
    originalReason: 'implausible-keke-bounds',
    ...plausibleWheeledKeke,
    wheelLikeCount: 0,
    broadBodyCount: 0,
    meshCount: 6,
  });
  assert.equal(result.accept, false);
  assert.equal(result.reason, 'insufficient-geometric-vehicle-evidence');
});

test('does not use geometry to override a missing-renderability failure', () => {
  const result = decideCataloguedKekeValidation({
    path: 'vehicles/keke/keke-3.glb',
    originalReason: 'no-visible-renderable-meshes',
    ...plausibleWheeledKeke,
  });
  assert.equal(result.accept, false);
  assert.equal(result.reason, 'not-an-eligible-geometry-recheck-failure');
});

test('does not accept a plausible shape under an untrusted model path', () => {
  const result = decideCataloguedKekeValidation({
    path: 'characters/passengers/Man.glb',
    originalReason: 'implausible-keke-bounds',
    ...plausibleWheeledKeke,
  });
  assert.equal(result.accept, false);
  assert.equal(result.reason, 'untrusted-model-path');
});

test('rejects incomplete or non-finite geometry measurements', () => {
  const result = decideCataloguedKekeValidation({
    path: 'vehicles/keke/keke-3.glb',
    originalReason: 'implausible-keke-bounds',
    ...plausibleWheeledKeke,
    width: Number.NaN,
  });
  assert.equal(result.accept, false);
  assert.equal(result.reason, 'non-finite-geometry-evidence');
});
