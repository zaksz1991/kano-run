import test from 'node:test';
import assert from 'node:assert/strict';
import {
  KANO_MOBILE_MODEL_TRIANGLE_LIMIT,
  KANO_MOBILE_MODEL_TRIANGLE_TARGET,
  countGeometryTriangles,
  planMobileGeometryReduction,
  verticesToRemove,
} from '../js/KanoMobileGeometryBudgetRules.js';

test('uses a target below the hard triangle limit', () => {
  assert.equal(KANO_MOBILE_MODEL_TRIANGLE_TARGET, 4800);
  assert.equal(KANO_MOBILE_MODEL_TRIANGLE_LIMIT, 5000);
  assert.ok(KANO_MOBILE_MODEL_TRIANGLE_TARGET < KANO_MOBILE_MODEL_TRIANGLE_LIMIT);
});

test('counts indexed geometry using its index count', () => {
  assert.equal(countGeometryTriangles({ index: { count: 303 }, attributes: { position: { count: 500 } } }), 101);
});

test('counts non-indexed geometry from the position attribute', () => {
  assert.equal(countGeometryTriangles({ attributes: { position: { count: 99 } } }), 33);
});

test('respects drawRange count', () => {
  assert.equal(countGeometryTriangles({ index: { count: 900 }, drawRange: { start: 150, count: 150 } }), 50);
});

test('returns zero for absent or invalid geometry', () => {
  assert.equal(countGeometryTriangles(null), 0);
  assert.equal(countGeometryTriangles({ attributes: { position: { count: -9 } } }), 0);
  assert.equal(countGeometryTriangles({ attributes: {} }), 0);
});

test('leaves models within the hard limit unchanged', () => {
  assert.equal(planMobileGeometryReduction({ totalTriangles: 5000, eligibleTriangles: 4000, fixedTriangles: 1000 }).status, 'within-budget');
});

test('plans reduction for an eligible over-budget model', () => {
  const plan = planMobileGeometryReduction({ totalTriangles: 38000, eligibleTriangles: 35000, fixedTriangles: 3000 });
  assert.equal(plan.status, 'simplification-planned');
  assert.ok(plan.keepRatio > 0 && plan.keepRatio < 1);
});

test('reports a model with only protected geometry as unreducible', () => {
  assert.equal(planMobileGeometryReduction({ totalTriangles: 38000, eligibleTriangles: 0, fixedTriangles: 38000 }).status, 'over-budget-unreducible');
});

test('reports over-budget if fixed geometry already exceeds the limit', () => {
  assert.equal(planMobileGeometryReduction({ totalTriangles: 8000, eligibleTriangles: 1000, fixedTriangles: 7000 }).status, 'over-budget-unreducible');
});

test('sanitizes invalid plan inputs rather than producing non-finite values', () => {
  const plan = planMobileGeometryReduction({ totalTriangles: Infinity, eligibleTriangles: NaN, fixedTriangles: -1 });
  assert.ok(Number.isFinite(plan.originalTriangles));
  assert.ok(Number.isFinite(plan.eligibleTriangles));
  assert.ok(Number.isFinite(plan.fixedTriangles));
});

test('vertex removal does not request a negative or excessive count', () => {
  assert.equal(verticesToRemove(3, 0.2), 0);
  assert.equal(verticesToRemove(100, 1), 0);
  assert.equal(verticesToRemove(100, 0), 96);
  assert.ok(verticesToRemove(20, -100) <= 16);
});

test('invalid keep ratios do not remove vertices', () => {
  assert.equal(verticesToRemove(100, NaN), 0);
  assert.equal(verticesToRemove(100, Infinity), 0);
});
