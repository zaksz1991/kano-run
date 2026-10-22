import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const source = readFileSync(resolve(root, 'js/renderer3d.js'), 'utf8');
const start = source.indexOf('  async applyModel(key, object)');
const end = source.indexOf('  applyPlayerPaint(', start);
const applyModel = source.slice(start, end);
const validatorStart = source.indexOf('  validateKekeModelCandidate(object)');
const validatorEnd = source.indexOf('  async applyModel(key, object)', validatorStart);
const validator = source.slice(validatorStart, validatorEnd);

test('renderer validates a replacement keke before detaching the current player', () => {
  assert.ok(start >= 0 && end > start, 'applyModel must exist');
  assert.ok(applyModel.indexOf('this.validateKekeModelCandidate(object)') >= 0);
  assert.ok(applyModel.indexOf('this.validateKekeModelCandidate(object)') < applyModel.indexOf('if (old?.parent)'));
  assert.ok(applyModel.indexOf('this.validateKekeModelCandidate(object)') < applyModel.indexOf('disposeSceneTree(old)'));
});

test('validator counts only visible descendant meshes with visible materials', () => {
  assert.match(validator, /if \(!node\?\.isMesh \|\| !node\.geometry\) return/);
  assert.match(validator, /ancestor\.visible === false/);
  assert.match(validator, /material\.visible !== false/);
  assert.match(validator, /Number\(material\.opacity \?\? 1\) > 0\.025/);
});

test('validator computes geometry bounds in keke-root space and rejects empty models', () => {
  assert.match(validator, /geometry\.computeBoundingBox\(\)/);
  assert.match(validator, /inverseRoot,\s*node\.matrixWorld/);
  assert.match(validator, /no-visible-renderable-meshes/);
  assert.match(validator, /singular-root-transform/);
});

test('validator rejects person-sized or collapsed geometry that cannot represent a full keke', () => {
  assert.match(validator, /longSide < 0\.82/);
  assert.match(validator, /shortSide < 0\.30/);
  assert.match(validator, /footprint < 0\.68/);
  assert.match(validator, /size\.y < 0\.55/);
  assert.match(validator, /implausible-keke-bounds/);
});

test('rejected model keeps the existing player and returns without disposing shared GLB resources', () => {
  const rejected = applyModel.indexOf('if (!visualCheck.ok)');
  const rejectedEnd = applyModel.indexOf('const oldParent = old?.parent || this.scene', rejected);
  assert.ok(rejected >= 0 && rejectedEnd > rejected);
  const rejectionBranch = applyModel.slice(rejected, rejectedEnd);
  assert.match(rejectionBranch, /keeping the active vehicle/);
  assert.match(rejectionBranch, /return false/);
  assert.doesNotMatch(rejectionBranch, /disposeSceneTree\(/);
  assert.doesNotMatch(rejectionBranch, /old\.parent\.remove\(old\)/);
});

test('accepted model still uses the active road or garage parent and existing paint path', () => {
  assert.match(applyModel, /this\.lifeScene === 'garage'\s*\? this\.garageGroup\s*:\s*this\.scene/);
  assert.match(applyModel, /this\.player = object/);
  assert.match(applyModel, /this\.applyPlayerPaint\(this\.currentPaint \|\| '#f5c542'\)/);
  assert.match(applyModel, /object\.userData\.kanoKekeVisualValidation = visualCheck/);
});

test('Step 28–29 mobile renderer helpers and roadside crowd features are preserved', () => {
  assert.match(source, /getMobileRenderBudget\(this\.mobileTier\)\.start/);
  assert.match(source, /advanceInstancedRoadPattern\(/);
  assert.match(source, /this\.buildKanoRoadsideSet\(\)/);
  assert.match(source, /const rowIndex = this\.mobile \? Math\.floor\(index \/ 2\) : index/);
  assert.match(source, /mergeMobilePedestrianStaticParts\(group\)/);
});
