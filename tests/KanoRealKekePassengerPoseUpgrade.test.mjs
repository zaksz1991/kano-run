import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { stat } from 'node:fs/promises';

const root = resolve(import.meta.dirname, '..');
const visualBootstrap = await readFile(resolve(root, 'js/KanoModelAssetVisualUpgrade.js'), 'utf8');
const street = await readFile(resolve(root, 'js/KanoStreetLifeMotionUpgrade.js'), 'utf8');
const upgrade = await readFile(resolve(root, 'js/KanoRealKekePassengerPoseUpgrade.js'), 'utf8');

test('Step 99 is bootstrapped after world-anchor support and before game startup', () => {
  assert.match(visualBootstrap, /KanoInfrastructureWorldAnchorsUpgrade\.js/);
  assert.match(visualBootstrap, /KanoRealKekePassengerPoseUpgrade\.js/);
  assert.ok(visualBootstrap.indexOf('KanoInfrastructureWorldAnchorsUpgrade.js') < visualBootstrap.indexOf('KanoRealKekePassengerPoseUpgrade.js'));
  assert.ok(visualBootstrap.indexOf('KanoRealKekePassengerPoseUpgrade.js') < visualBootstrap.indexOf('KanoGameplayPresentationRepair.js'));
});

test('Step 92 exports the arm-down custom character factory for reuse', () => {
  assert.match(street, /export function createKanoStreetPerson/);
  assert.match(street, /left_arm_pivot_down/);
  assert.match(street, /right_arm_pivot_down/);
  assert.match(street, /pivot\.position\.set\(side \* 0\.215, 1\.075, 0\.018\)/);
});

test('unrigged street GLBs are not used as a source of animated walk cycles', () => {
  assert.match(street, /separate arm and leg pivots/);
  assert.match(street, /root\.userData\.kanoAnimationParts/);
  assert.match(upgrade, /createKanoStreetPerson\(variant, \{ waiting: true \}\)/);
});

test('renderer retries sidewalk creation when no live articulated walkers exist', () => {
  assert.match(upgrade, /function ensureSidewalkWalkers/);
  assert.match(upgrade, /renderer\.buildSidewalkLife\(\)/);
  assert.match(upgrade, /person\.actor\?\.parent === renderer\.world/);
});

test('ordinary non-hub pickup actors replace the legacy outstretched-arm passenger model', () => {
  assert.match(upgrade, /function ensureSinglePickupPassenger/);
  assert.match(upgrade, /removeLegacyPassengers\(renderer, actor\)/);
  assert.match(upgrade, /kanoPassengerPose = 'arms-down-natural'/);
  assert.match(upgrade, /arm\.pivot\.rotation\.x = 0/);
});

test('real parked kekes come from the ModelManager keke asset when loaded', () => {
  assert.match(upgrade, /manager\.getInstance\('keke'\)/);
  assert.match(upgrade, /kanoUsesBundledKekeGLB = true/);
  assert.match(upgrade, /ModelManager/);
  assert.match(upgrade, /manager\.load\('keke'\)/);
});

test('checkpoint keke replacement preserves position, orientation and scene parent', () => {
  assert.match(upgrade, /realVehicle\.position\.copy\(oldVehicle\.position\)/);
  assert.match(upgrade, /realVehicle\.rotation\.copy\(oldVehicle\.rotation\)/);
  assert.match(upgrade, /parking\.add\(realVehicle\)/);
  assert.match(upgrade, /parking\.remove\(oldVehicle\)/);
});

test('Step 99 includes a runtime audit for real assets, crowd counts, and walkers', () => {
  assert.match(upgrade, /window\.kanoRealKekePassengerPoseAudit/);
  assert.match(upgrade, /realKekes/);
  assert.match(upgrade, /naturalPosePassengerActors/);
  assert.match(upgrade, /sidewalks:/);
});

test('Step 92 allows its gait to run when the renderer has no explicit scene label', () => {
  assert.match(street, /if \(renderer\.lifeScene && renderer\.lifeScene !== 'road'\) return/);
});


test('the project keke GLB required for real checkpoint vehicles is bundled', async () => {
  const asset = await stat(resolve(root, 'public/assets/models/vehicles/keke/keke-3.glb'));
  assert.ok(asset.size > 10000);
  assert.match(upgrade, /kanoUsesBundledKekeGLB = true/);
});
