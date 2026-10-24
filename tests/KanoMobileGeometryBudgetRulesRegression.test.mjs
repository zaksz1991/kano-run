import test from 'node:test';
import assert from 'node:assert/strict';
import {
  KANO_MOBILE_MODEL_TRIANGLE_LIMIT,
  KANO_MOBILE_MODEL_TRIANGLE_TARGET,
  countGeometryTriangles,
  planMobileGeometryReduction,
  verticesToRemove,
} from '../js/KanoMobileGeometryBudgetRules.mjs';

test('keeps the 4,800 working target below the 5,000 hard limit', () => {
  assert.equal(KANO_MOBILE_MODEL_TRIANGLE_TARGET, 4800);
  assert.equal(KANO_MOBILE_MODEL_TRIANGLE_LIMIT, 5000);
});

test('counts indexed triangles', () => {
  assert.equal(countGeometryTriangles({ index: { count: 303 }, attributes: { position: { count: 250 } } }), 101);
});

test('counts non-indexed triangles', () => {
  assert.equal(countGeometryTriangles({ attributes: { position: { count: 99 } } }), 33);
});

test('respects finite draw ranges', () => {
  assert.equal(countGeometryTriangles({ index: { count: 300 }, drawRange: { start: 30, count: 90 } }), 30);
});

test('returns zero for malformed geometry data', () => {
  assert.equal(countGeometryTriangles(null), 0);
  assert.equal(countGeometryTriangles({ index: { count: -3 } }), 0);
  assert.equal(countGeometryTriangles({ attributes: { position: { count: Infinity } } }), 0);
});

test('does not alter models already within the working target', () => {
  const plan = planMobileGeometryReduction({ totalTriangles: 4400, eligibleTriangles: 4000, fixedTriangles: 400 });
  assert.equal(plan.status, 'within-budget');
  assert.equal(plan.keepRatio, 1);
});

test('plans reductions below the working target', () => {
  const plan = planMobileGeometryReduction({ totalTriangles: 38000, eligibleTriangles: 38000, fixedTriangles: 0 });
  assert.equal(plan.status, 'simplification-planned');
  assert.ok(plan.keepRatio > 0 && plan.keepRatio < 0.13);
  assert.ok(Math.floor(38000 * plan.keepRatio) < KANO_MOBILE_MODEL_TRIANGLE_TARGET);
});

test('includes unsupported geometry in the fixed triangle budget', () => {
  const plan = planMobileGeometryReduction({ totalTriangles: 10000, eligibleTriangles: 7000, fixedTriangles: 3000 });
  assert.equal(plan.status, 'simplification-planned');
  assert.ok(3000 + Math.floor(7000 * plan.keepRatio) < KANO_MOBILE_MODEL_TRIANGLE_TARGET);
});

test('does not claim success when fixed geometry alone exceeds the target', () => {
  const plan = planMobileGeometryReduction({ totalTriangles: 12000, eligibleTriangles: 2000, fixedTriangles: 10000 });
  assert.equal(plan.status, 'over-budget-unreducible');
  assert.equal(plan.keepRatio, 1);
});

test('reports over-budget models with no eligible geometry', () => {
  assert.equal(planMobileGeometryReduction({ totalTriangles: 9000, eligibleTriangles: 0, fixedTriangles: 9000 }).status, 'over-budget-unreducible');
});

test('bounds vertex removal and retains at least four vertices', () => {
  assert.equal(verticesToRemove(100, 1), 0);
  assert.equal(verticesToRemove(100, 0.5), 50);
  assert.equal(verticesToRemove(4, 0.1), 0);
  assert.equal(verticesToRemove(100, 0), 96);
});

test('invalid numeric inputs cannot produce non-finite plans', () => {
  const plan = planMobileGeometryReduction({ totalTriangles: Infinity, eligibleTriangles: NaN, fixedTriangles: -1 });
  for (const key of ['totalTriangles', 'eligibleTriangles', 'fixedTriangles', 'keepRatio']) {
    assert.ok(Number.isFinite(plan[key]), `${key} must be finite`);
  }
});
