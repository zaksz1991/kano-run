import test from 'node:test';
import assert from 'node:assert/strict';
import {
  KANO_MOBILE_MODEL_TRIANGLE_LIMIT,
  KANO_MOBILE_MODEL_TRIANGLE_TARGET,
  countGeometryTriangles,
  planMobileGeometryReduction,
  verticesToRemove,
} from '../js/KanoMobileGeometryBudgetRules.js';

test('sets a 4,800 triangle working target below the 5,000 hard limit', () => {
  assert.equal(KANO_MOBILE_MODEL_TRIANGLE_TARGET, 4800);
  assert.equal(KANO_MOBILE_MODEL_TRIANGLE_LIMIT, 5000);
});

test('counts triangles in indexed geometry', () => {
  assert.equal(countGeometryTriangles({ index: { count: 303 }, attributes: { position: { count: 250 } } }), 101);
});

test('counts triangles in non-indexed geometry', () => {
  assert.equal(countGeometryTriangles({ attributes: { position: { count: 99 } } }), 33);
});

test('respects a finite draw range', () => {
  assert.equal(countGeometryTriangles({ index: { count: 300 }, drawRange: { start: 30, count: 90 } }), 30);
});

test('returns zero for absent or malformed geometry', () => {
  assert.equal(countGeometryTriangles(null), 0);
  assert.equal(countGeometryTriangles({ index: { count: -3 } }), 0);
});

test('does not simplify a model already under target', () => {
  const plan = planMobileGeometryReduction({ totalTriangles: 4400, eligibleTriangles: 4000, fixedTriangles: 400 });
  assert.equal(plan.status, 'within-budget');
  assert.equal(plan.keepRatio, 1);
});

test('reduces a 38,000 triangle static model toward the working target', () => {
  const plan = planMobileGeometryReduction({ totalTriangles: 38000, eligibleTriangles: 38000, fixedTriangles: 0 });
  assert.equal(plan.status, 'simplification-planned');
  assert.ok(plan.keepRatio > 0 && plan.keepRatio < 0.13);
  assert.ok(Math.floor(38000 * plan.keepRatio) < KANO_MOBILE_MODEL_TRIANGLE_TARGET);
});

test('accounts for protected and rigged geometry when planning', () => {
  const plan = planMobileGeometryReduction({ totalTriangles: 10000, eligibleTriangles: 7000, fixedTriangles: 3000 });
  assert.equal(plan.status, 'simplification-planned');
  assert.ok(3000 + Math.floor(7000 * plan.keepRatio) < KANO_MOBILE_MODEL_TRIANGLE_TARGET);
});

test('does not claim success when fixed geometry alone exceeds target', () => {
  const plan = planMobileGeometryReduction({ totalTriangles: 12000, eligibleTriangles: 2000, fixedTriangles: 10000 });
  assert.equal(plan.status, 'over-budget-unreducible');
  assert.equal(plan.keepRatio, 1);
});

test('reports unreducible models when there are no eligible triangles', () => {
  const plan = planMobileGeometryReduction({ totalTriangles: 9000, eligibleTriangles: 0, fixedTriangles: 9000 });
  assert.equal(plan.status, 'over-budget-unreducible');
});

test('vertex removal stays within valid bounds', () => {
  assert.equal(verticesToRemove(100, 1), 0);
  assert.equal(verticesToRemove(100, 0.5), 50);
  assert.equal(verticesToRemove(4, 0.1), 0);
  assert.equal(verticesToRemove(100, 0), 96);
});

test('invalid numeric values cannot produce non-finite plans', () => {
  const plan = planMobileGeometryReduction({ totalTriangles: Infinity, eligibleTriangles: NaN, fixedTriangles: -1 });
  assert.ok(Number.isFinite(plan.totalTriangles));
  assert.ok(Number.isFinite(plan.eligibleTriangles));
  assert.ok(Number.isFinite(plan.fixedTriangles));
});
