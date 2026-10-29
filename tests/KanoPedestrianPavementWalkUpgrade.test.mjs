import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  KANO_PEDESTRIAN_WALK_LIMITS,
  advancePavementWalkerZ,
  clampWalkDeltaSeconds,
  getPavementGait,
  getPavementWalkDirection,
  getPavementWalkSpeed,
  selectPavementLegWalkers,
} from '../js/KanoPedestrianPavementWalkRules.mjs';

const root = new URL('../', import.meta.url);

 test('walk delta is finite and capped to protect frame spikes', () => {
  assert.equal(clampWalkDeltaSeconds(0.016), 0.016);
  assert.equal(clampWalkDeltaSeconds(2), KANO_PEDESTRIAN_WALK_LIMITS.maxDeltaSeconds);
  assert.equal(clampWalkDeltaSeconds(-1), 0);
  assert.equal(clampWalkDeltaSeconds(Number.NaN), 0);
});

test('adjacent sidewalk rows travel in opposing directions', () => {
  assert.deepEqual([0, 1, 2, 3, 4, 5].map(getPavementWalkDirection), [-1, -1, 1, 1, -1, -1]);
});

test('pedestrian speed varies slightly but remains within expected bounds', () => {
  const speeds = [0, 1, 2, 3, 4].map(getPavementWalkSpeed);
  assert.ok(speeds.every((speed) => speed >= 0.62 && speed <= 0.875));
  assert.notEqual(speeds[0], speeds[1]);
});

test('depth update applies signed independent walking motion', () => {
  assert.ok(advancePavementWalkerZ(-20, -1, 0.8, 0.05) < -20);
  assert.ok(advancePavementWalkerZ(-20, 1, 0.8, 0.05) > -20);
  assert.equal(advancePavementWalkerZ(-20, 1, 0.8, 5), -19.96);
});

test('leg gait alternates left/right legs and opposing arm swing', () => {
  const gait = getPavementGait(0.14, 0.25);
  assert.equal(gait.leftLeg, -gait.rightLeg);
  assert.equal(gait.leftArm, -gait.leftLeg * 0.42);
  assert.equal(gait.rightArm, gait.leftLeg * 0.42);
  assert.ok(gait.bob >= 0 && gait.bob <= 0.016);
});

test('nearby leg selection is bounded and excludes GLBs and authored static legs', () => {
  const make = (index, z, { model = false, fallback = true } = {}) => ({
    index,
    usingModel: model,
    actor: { position: { z }, userData: { fallbackPedestrian: fallback } },
  });
  const walkers = [
    make(0, 10), make(1, 12), make(2, 14), make(3, 15), make(4, 18),
    make(5, 20, { model: true }), make(6, 22, { fallback: false }), make(7, 100),
  ];
  const selected = selectPavementLegWalkers(walkers, 8, 2, 30);
  assert.equal(selected.length, 2);
  assert.deepEqual(selected.map((item) => item.index), [0, 1]);
});

test('the current traffic selector imports the walker module without changing category weights', async () => {
  const trafficMix = await readFile(new URL('../js/KanoTrafficMix.js', import.meta.url), 'utf8');
  assert.match(trafficMix, /^import '\.\/KanoPedestrianPavementWalkUpgrade\.js';/);
  assert.match(trafficMix, /if \(roll < 0\.5\) return 'keke';/);
  assert.match(trafficMix, /if \(roll < 0\.8\) \{/);
});

test('runtime module hooks the existing renderer and keeps movement additive', async () => {
  const source = await readFile(new URL('../js/KanoPedestrianPavementWalkUpgrade.js', import.meta.url), 'utf8');
  assert.match(source, /import \{ Renderer3D \} from '\.\/renderer3d\.js';/);
  assert.match(source, /prototype\.draw = function drawWithPavementWalkers/);
  assert.match(source, /new THREE\.InstancedMesh/);
  assert.match(source, /window\.kanoPedestrianPavementWalkAudit/);
  assert.doesNotMatch(source, /\.load\(['"]pedestrian/);
});
