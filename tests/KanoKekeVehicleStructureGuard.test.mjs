import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const source = readFileSync(resolve(root, 'js/renderer3d.js'), 'utf8');
const validatorStart = source.indexOf('  validateKekeModelCandidate(object)');
const validatorEnd = source.indexOf('  async applyModel(key, object)', validatorStart);
const validator = source.slice(validatorStart, validatorEnd);
const applyStart = source.indexOf('  async applyModel(key, object)');
const applyEnd = source.indexOf('  applyPlayerPaint(', applyStart);
const applyModel = source.slice(applyStart, applyEnd);

test('keke candidate validation checks structural evidence, not only overall bounds', () => {
  assert.ok(validatorStart >= 0 && validatorEnd > validatorStart);
  assert.match(validator, /vehicleCoreName/);
  assert.match(validator, /wheelPartName/);
  assert.match(validator, /broadLowBodyEvidence/);
  assert.match(validator, /hasVehicleStructure/);
});

test('character-only assets are rejected with a diagnosable reason', () => {
  assert.match(validator, /characterName/);
  assert.match(validator, /character-only-model-no-vehicle-structure/);
  assert.match(validator, /missing-vehicle-structure-evidence/);
  assert.match(validator, /characterMeshes/);
});

test('vehicle evidence is recorded with validated bounds for inspection', () => {
  assert.match(validator, /vehicleCoreMeshes:\s*vehicleCoreEvidence/);
  assert.match(validator, /wheelPartMeshes:\s*namedWheelEvidence/);
  assert.match(validator, /broadLowBodyEvidence/);
  assert.match(validator, /vehicleCoreEvidence > 0 \|\| broadLowBodyEvidence \|\| namedWheelEvidence >= 2/);
});

test('rejected replacement preserves the active procedural keke and its driver', () => {
  const rejected = applyModel.indexOf('if (!visualCheck.ok)');
  const rejectedEnd = applyModel.indexOf('const oldParent = old?.parent || this.scene', rejected);
  assert.ok(rejected >= 0 && rejectedEnd > rejected);
  const branch = applyModel.slice(rejected, rejectedEnd);
  assert.match(branch, /keeping the active vehicle/);
  assert.match(branch, /return false/);
  assert.doesNotMatch(branch, /disposeSceneTree\(/);
});

test('vehicle structure gate does not remove mobile rendering and traffic integration', () => {
  assert.match(source, /getMobileRenderBudget\(this\.mobileTier\)\.start/);
  assert.match(source, /advanceInstancedRoadPattern\(/);
  assert.match(source, /buildKanoRoadsideSet\(\)/);
  assert.match(source, /mergeMobilePedestrianStaticParts\(group\)/);
  assert.match(source, /this\.validateKekeModelCandidate\(object\)/);
});
