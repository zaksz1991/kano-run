import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, stat } from 'node:fs/promises';
import { resolve } from 'node:path';
import {
  flowDirectionForLane,
  relativeApproachDelta,
  modelKeyForVehicle,
} from '../js/KanoTrafficFlowRules.mjs';

const root = resolve(import.meta.dirname, '..');
const upgrade = await readFile(resolve(root, 'js/KanoTrafficRuntimeIntegrationUpgrade.js'), 'utf8');
const bootstrap = await readFile(resolve(root, 'js/KanoModelAssetVisualUpgrade.js'), 'utf8');

test('left lane is oncoming and right/centre lanes follow the player direction', () => {
  assert.equal(flowDirectionForLane(0), 'oncoming');
  assert.equal(flowDirectionForLane(1), 'same');
  assert.equal(flowDirectionForLane(2), 'same');
  assert.equal(flowDirectionForLane(0, 'same'), 'same');
  assert.equal(flowDirectionForLane(2, 'oncoming'), 'oncoming');
});

test('same-direction traffic closes slower than oncoming traffic', () => {
  const same = relativeApproachDelta(5, 1, 'same');
  const oncoming = relativeApproachDelta(5, 1, 'oncoming');
  assert.equal(same, 2.15);
  assert.equal(oncoming, 7.6);
  assert.ok(oncoming > same * 3);
});

test('relative screen-space motion clamps invalid input to finite values', () => {
  assert.equal(relativeApproachDelta(-4, 1, 'same'), 0);
  assert.equal(relativeApproachDelta(5, NaN, 'same'), 2.15);
  assert.ok(Number.isFinite(relativeApproachDelta(Infinity, 100, 'oncoming')));
});

test('GLB categories resolve only for the actual Step 100 traffic assets', () => {
  assert.equal(modelKeyForVehicle('keke'), 'keke');
  assert.equal(modelKeyForVehicle('motorcycle'), 'motorcycle');
  assert.equal(modelKeyForVehicle('car'), 'car');
  assert.equal(modelKeyForVehicle('taxi'), null);
});

test('runtime adapter handles both obs and newer traffic state shapes', () => {
  assert.match(upgrade, /Array\.isArray\(game\?\.obs\)/);
  assert.match(upgrade, /Array\.isArray\(game\?\.s\?\.traffic\)/);
  assert.match(upgrade, /Array\.isArray\(game\?\.state\?\.traffic\)/);
  assert.match(upgrade, /takeNextKanoTrafficType\(this\)/);
  assert.match(upgrade, /vehicle\.kanoFlowDirection/);
});

test('legacy runner adjusts relative motion without changing its existing collision methods', () => {
  assert.match(upgrade, /Game\.prototype\.updateTraffic/);
  assert.match(upgrade, /relativeApproachDelta\(speed, vehicle\.speedFactor, vehicle\.kanoFlowDirection\)/);
  assert.match(upgrade, /this\.obs = this\.obs\.filter\(\(vehicle\) => Number\(vehicle\?\.y\) < 700\)/);
  assert.doesNotMatch(upgrade, /handleTrafficCollisions\s*=/);
});

test('the current renderer pool mounts cached GLBs and leaves fallbacks when unavailable', () => {
  assert.match(upgrade, /Renderer3D\.prototype\.styleVehicle/);
  assert.match(upgrade, /manager\.getInstance\?\.\(key\)/);
  assert.match(upgrade, /tryMountGLB\(this, vehicleRoot, wanted\)/);
  assert.match(upgrade, /kanoStep101UsesGLB/);
  assert.match(upgrade, /modelStatus/);
});

test('oncoming traffic receives opposite yaw in the rendered pool', () => {
  assert.match(upgrade, /pool\[index\]\.rotation\.y = flow === 'oncoming' \? Math\.PI : 0/);
});

test('Step 101 adapter is loaded after the Step 100 composition module', () => {
  const step100 = bootstrap.indexOf("await import('./KanoTrafficCompositionUpgrade.js')");
  const step101 = bootstrap.indexOf("await import('./KanoTrafficRuntimeIntegrationUpgrade.js')");
  assert.ok(step100 >= 0 && step101 > step100);
});

test('bundled keke, okada and sedan GLBs remain present and non-empty', async () => {
  const paths = [
    'public/assets/models/vehicles/keke/keke-3.glb',
    'public/assets/models/vehicles/special/okada.glb',
    'public/assets/models/vehicles/cars/quaternius_cc0-normal-car-1190.glb',
  ];
  for (const path of paths) {
    const info = await stat(resolve(root, path));
    assert.ok(info.size > 10000, `${path} is missing or too small`);
  }
});
