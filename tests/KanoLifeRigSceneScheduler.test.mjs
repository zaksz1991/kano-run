import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { syncActiveLifeRigs } from '../js/KanoLifeRigSceneScheduler.js';

const sceneUpgradeSource = fs.readFileSync(
  new URL('../js/KanoSceneUpgrade.js', import.meta.url),
  'utf8',
);

function rig(scene, visible = true) {
  return { scene, root: { visible }, phase: 0, action: 'walk' };
}

test('road scene hides all life-stage rigs and returns no active animation work', () => {
  const rigs = [rig('bedroom'), rig('household'), rig('breakfast'), rig('garage')];
  const active = [rig('stale')];

  const result = syncActiveLifeRigs(rigs, active, 'road');

  assert.equal(result, active);
  assert.equal(active.length, 0);
  assert.ok(rigs.every((entry) => entry.root.visible === false));
});

test('a life stage activates only rigs assigned to that scene', () => {
  const bedroomA = rig('bedroom', false);
  const bedroomB = rig('bedroom', false);
  const household = rig('household', true);
  const garage = rig('garage', true);
  const rigs = [bedroomA, household, bedroomB, garage];
  const active = [];

  syncActiveLifeRigs(rigs, active, 'bedroom');

  assert.deepEqual(active, [bedroomA, bedroomB]);
  assert.equal(bedroomA.root.visible, true);
  assert.equal(bedroomB.root.visible, true);
  assert.equal(household.root.visible, false);
  assert.equal(garage.root.visible, false);
});

test('scene transition reuses the active array without retaining prior-scene rigs', () => {
  const bedroom = rig('bedroom');
  const breakfast = rig('breakfast');
  const active = [];

  syncActiveLifeRigs([bedroom, breakfast], active, 'bedroom');
  assert.deepEqual(active, [bedroom]);

  syncActiveLifeRigs([bedroom, breakfast], active, 'breakfast');
  assert.deepEqual(active, [breakfast]);
  assert.equal(bedroom.root.visible, false);
  assert.equal(breakfast.root.visible, true);
});

test('scheduler tolerates absent rig collections and skips null entries', () => {
  const active = [rig('old')];
  assert.deepEqual(syncActiveLifeRigs(null, active, 'road'), []);
  assert.deepEqual(syncActiveLifeRigs([null, undefined], active, 'road'), []);
});

test('SceneUpgrade caches the scene name and updates only the active-rig list', () => {
  assert.match(sceneUpgradeSource, /import \{ syncActiveLifeRigs \} from '\.\/KanoLifeRigSceneScheduler\.js'/);
  assert.match(sceneUpgradeSource, /this\.activeLifeRigs = \[\]/);
  assert.match(sceneUpgradeSource, /this\.lifeRigSceneReady && Object\.is\(this\.activeLifeScene, scene\)/);
  assert.match(sceneUpgradeSource, /syncActiveLifeRigs\(this\.lifeRigs, this\.activeLifeRigs, scene\)/);

  const method = sceneUpgradeSource.match(/updateLifeRigs\(dt\)\s*\{([\s\S]*?)\n  \}\n\n  \/\/ ----------------------------------------------------------/);
  assert.ok(method, 'updateLifeRigs method should be present');
  assert.match(method[1], /for \(const rig of this\.activeLifeRigs\)/);
  assert.doesNotMatch(method[1], /for \(const rig of this\.lifeRigs\)/);
  assert.doesNotMatch(method[1], /rig\.root\.visible = active/);
});

test('empty decorative crowd and passenger lists are not sent through update methods', () => {
  assert.match(sceneUpgradeSource, /if \(this\.walkers\.length\) this\.updateCrowdMatrices\(\)/);
  assert.match(sceneUpgradeSource, /if \(this\.walkingPassengers\.length\) this\.updatePassengerWalkers\(delta, scroll\)/);
  assert.match(sceneUpgradeSource, /this\.marketRoot\.visible !== isRoad/);
});
