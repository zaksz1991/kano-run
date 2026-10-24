import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const rulesPath = new URL('../js/KanoKAROTAWildlifePotholeRules.js', import.meta.url);
const rulesSource = await readFile(rulesPath, 'utf8');
const rules = await import(`data:text/javascript;base64,${Buffer.from(rulesSource).toString('base64')}`);

test('roadside plan adds three goats and two dogs', () => {
  const plan = rules.getKanoRoadsideAnimalPlan();
  assert.equal(plan.filter((animal) => animal.kind === 'goat').length, 3);
  assert.equal(plan.filter((animal) => animal.kind === 'dog').length, 2);
  assert.equal(plan.length, 5);
});

test('all animal placements have unique IDs and finite movement data', () => {
  const plan = rules.getKanoRoadsideAnimalPlan();
  assert.equal(new Set(plan.map((animal) => animal.id)).size, plan.length);
  for (const animal of plan) {
    assert.ok(Number.isFinite(animal.x));
    assert.ok(Number.isFinite(animal.z));
    assert.ok(Number.isFinite(animal.speed) && animal.speed > 0);
    assert.ok(Number.isFinite(animal.phase));
  }
});

test('dogs remain outside the road lanes on the sandy shoulder', () => {
  const dogs = rules.getKanoRoadsideAnimalPlan().filter((animal) => animal.kind === 'dog');
  assert.ok(dogs.length > 0);
  for (const dog of dogs) assert.ok(Math.abs(dog.x) >= 4.8);
});

test('crater profile is deterministic for identical seed and segment count', () => {
  assert.deepEqual(
    rules.buildJaggedCraterProfile('kofar-mata:1.25', 18, 0.3, 0.6),
    rules.buildJaggedCraterProfile('kofar-mata:1.25', 18, 0.3, 0.6),
  );
});

test('crater profile contains enough points and varies its broken edge', () => {
  const profile = rules.buildJaggedCraterProfile('pothole-42', 18, 0.3, 0.6);
  assert.equal(profile.length, 18);
  assert.ok(profile.every((point) => point.outerRadius > point.innerRadius));
  assert.ok(profile.every((point) => point.outerHeight > point.innerHeight));
  assert.ok(new Set(profile.map((point) => point.outerRadius.toFixed(5))).size > 10);
});

test('crater profile clamps pathological segment counts and radii', () => {
  const tooSmall = rules.buildJaggedCraterProfile(7, 1, -1, -2);
  const tooLarge = rules.buildJaggedCraterProfile(7, 1000, 0.3, 0.6);
  assert.equal(tooSmall.length, 12);
  assert.equal(tooLarge.length, 36);
  assert.ok(tooSmall.every((point) => point.innerRadius > 0));
  assert.ok(tooSmall.every((point) => point.outerRadius > point.innerRadius));
});

test('only the supported roadway events receive extra presentation', () => {
  assert.equal(rules.isKanoTask27EventType('goatCrossing'), true);
  assert.equal(rules.isKanoTask27EventType('karota'), true);
  assert.equal(rules.isKanoTask27EventType('waterSeller'), false);
  assert.equal(rules.isKanoTask27EventType(null), false);
});
