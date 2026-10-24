import test from 'node:test';
import assert from 'node:assert/strict';
import {
  normaliseKekeModelPath,
  isPlausibleCataloguedKekeStructureGap,
  describeKekeFacing,
} from '../js/KanoKekeGlbActivationRules.js';

test('normalises the model manager keke path without broad filename matching', () => {
  assert.equal(normaliseKekeModelPath('vehicles/keke/keke-3.glb'), 'vehicles/keke/keke-3.glb');
  assert.equal(normaliseKekeModelPath('/assets/models/vehicles/keke/keke-3.glb'), 'vehicles/keke/keke-3.glb');
  assert.equal(normaliseKekeModelPath('vehicles/keke/not-keke-3.glb'), 'vehicles/keke/not-keke-3.glb');
});

test('accepts only a plausible known keke GLB rejected solely for mesh naming evidence', () => {
  const result = {
    ok: false,
    reason: 'missing-vehicle-structure-evidence',
    meshCount: 18,
    bounds: { width: 1.35, height: 1.85, depth: 1.82, footprint: 2.457 },
    evidence: { vehicleCoreMeshes: 0, wheelPartMeshes: 0, characterMeshes: 0, broadLowBodyEvidence: false },
  };
  assert.equal(isPlausibleCataloguedKekeStructureGap('vehicles/keke/keke-3.glb', result), true);
});

test('rejects other model files even with the same dimensions', () => {
  const result = {
    ok: false,
    reason: 'missing-vehicle-structure-evidence',
    meshCount: 18,
    bounds: { width: 1.35, height: 1.85, depth: 1.82, footprint: 2.457 },
    evidence: { characterMeshes: 0 },
  };
  assert.equal(isPlausibleCataloguedKekeStructureGap('vehicles/keke/keke-1.glb', result), false);
  assert.equal(isPlausibleCataloguedKekeStructureGap('characters/pedestrians/keke.glb', result), false);
});

test('does not override an explicit character-only rejection', () => {
  const result = {
    ok: false,
    reason: 'character-only-model-no-vehicle-structure',
    meshCount: 9,
    bounds: { width: 1.1, height: 1.85, depth: 1.1, footprint: 1.21 },
    evidence: { characterMeshes: 4 },
  };
  assert.equal(isPlausibleCataloguedKekeStructureGap('vehicles/keke/keke-3.glb', result), false);
});

test('does not override implausible dimensions or a hidden/empty model', () => {
  const empty = { ok: false, reason: 'missing-vehicle-structure-evidence', meshCount: 0, bounds: {}, evidence: {} };
  const tooTall = {
    ok: false,
    reason: 'missing-vehicle-structure-evidence',
    meshCount: 7,
    bounds: { width: 1.1, height: 3.8, depth: 1.5, footprint: 1.65 },
    evidence: {},
  };
  assert.equal(isPlausibleCataloguedKekeStructureGap('vehicles/keke/keke-3.glb', empty), false);
  assert.equal(isPlausibleCataloguedKekeStructureGap('vehicles/keke/keke-3.glb', tooTall), false);
});

test('leaves valid model results to the original validator', () => {
  assert.equal(isPlausibleCataloguedKekeStructureGap('vehicles/keke/keke-3.glb', { ok: true, reason: 'renderable-vehicle-bounds' }), false);
});

test('documents the existing model-manager forward axis without forcing an unmeasured yaw change', () => {
  const facing = describeKekeFacing();
  assert.equal(facing.roadForward, '-Z');
  assert.equal(facing.sourceYawRadians, Math.PI);
  assert.match(facing.convention, /seated driver rig uses the wrapper forward axis/);
});
