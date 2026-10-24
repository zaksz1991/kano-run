import test from 'node:test';
import assert from 'node:assert/strict';
import {
  KANO_MOBILE_MODEL_TRIANGLE_LIMIT,
  KANO_MOBILE_MODEL_TRIANGLE_TARGET,
  countGeometryTriangles,
  planMobileGeometryReduction,
  verticesToRemove,
} from '../js/KanoMobileGeometryBudgetRules.mjs';

test('declares a 4,800 target beneath the 5,000-triangle hard limit', () => {
  assert.equal(KANO_MOBILE_MODEL_TRIANGLE_TARGET, 4800);
  assert.equal(KANO_MOBILE_MODEL_TRIANGLE_LIMIT, 5000);
  assert.ok(KANO_MOBILE_MODEL_TRIANGLE_TARGET < KANO_MOBILE_MODEL_TRIANGLE_LIMIT);
});

test('counts indexed BufferGeometry triangles', () => {
  assert.equal(countGeometryTriangles({ index: { count: 303 }, attributes: { position: { count: 500 } } }), 101);
});

test('counts non-indexed triangles', () => {
  assert.equal(countGeometryTriangles({ attributes: { position: { count: 99 } } }), 33);
});

test('limits triangle counting to drawRange', () => {
  assert.equal(countGeometryTriangles({ index: { count: 900 }, drawRange: { start: 0, count: 150 } }), 50);
});

test('treats invalid geometry counts as zero', () => {
  assert.equal(countGeometryTriangles(null), 0);
  assert.equal(countGeometryTriangles({ attributes: { position: { count: -10 } } }), 0);
  assert.equal(countGeometryTriangles({ attributes: { position: { count: 'not a count' } } }), 0);
});

test('models under the hard budget are not simplified unnecessarily', () => {
  const plan = planMobileGeometryReduction({ totalTriangles: 4800, eligibleTriangles: 4500, fixedTriangles: 300 });
  assert.equal(plan.status, 'within-budget');
  assert.equal(plan.keepRatio, 1);
});

test('plans a conservative reduction for over-budget eligible geometry', () => {
  const plan = planMobileGeometryReduction({ totalTriangles: 38000, eligibleTriangles: 37000, fixedTriangles: 1000 });
  assert.equal(plan.status, 'simplification-planned');
  assert.ok(plan.keepRatio > 0 && plan.keepRatio < 1);
  assert.ok(plan.fixedTriangles + plan.eligibleTriangles * plan.keepRatio <= 4800.01);
});

test('reports protected geometry that alone exceeds the hard limit as unreducible', () => {
  const plan = planMobileGeometryReduction({ totalTriangles: 7200, eligibleTriangles: 700, fixedTriangles: 6500 });
  assert.equal(plan.status, 'over-budget-unreducible');
});

test('reports an over-budget model with no eligible geometry as unreducible', () => {
  const plan = planMobileGeometryReduction({ totalTriangles: 9000, eligibleTriangles: 0, fixedTriangles: 9000 });
  assert.equal(plan.status, 'over-budget-unreducible');
});

test('can target the hard limit when protected meshes exceed the aspirational target', () => {
  const plan = planMobileGeometryReduction({ totalTriangles: 6100, eligibleTriangles: 1100, fixedTriangles: 4950 });
  assert.equal(plan.status, 'simplification-planned');
  assert.ok(plan.keepRatio > 0 && plan.keepRatio < 1);
  assert.ok(plan.fixedTriangles + plan.eligibleTriangles * plan.keepRatio < 5000);
});

test('vertex removal is bounded and leaves a usable minimum mesh', () => {
  assert.equal(verticesToRemove(3, 0.1), 0);
  assert.equal(verticesToRemove(100, 0.5), 50);
  assert.equal(verticesToRemove(100, 0), 96);
  assert.equal(verticesToRemove(100, 1), 0);
  assert.equal(verticesToRemove(100, NaN), 0);
});

test('does not request negative removal when inputs are invalid', () => {
  assert.equal(verticesToRemove(-2, 0.2), 0);
  assert.equal(verticesToRemove(100, Infinity), 0);
});
