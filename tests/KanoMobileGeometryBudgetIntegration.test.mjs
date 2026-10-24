import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import {
  KANO_MOBILE_MODEL_TRIANGLE_LIMIT,
  KANO_MOBILE_MODEL_TRIANGLE_TARGET,
  countGeometryTriangles,
  planMobileGeometryReduction,
  verticesToRemove,
} from '../js/KanoMobileGeometryBudgetRules.mjs';

const trafficMixPath = fileURLToPath(new URL('../js/KanoTrafficMix.js', import.meta.url));

test('mobile reducer target is below the hard per-model limit', () => {
  assert.equal(KANO_MOBILE_MODEL_TRIANGLE_TARGET, 4800);
  assert.equal(KANO_MOBILE_MODEL_TRIANGLE_LIMIT, 5000);
});

test('geometry counting respects indices and draw range', () => {
  assert.equal(countGeometryTriangles({ index: { count: 303 }, attributes: { position: { count: 250 } } }), 101);
  assert.equal(countGeometryTriangles({ index: { count: 300 }, drawRange: { start: 30, count: 90 } }), 30);
  assert.equal(countGeometryTriangles({ attributes: { position: { count: 99 } } }), 33);
  assert.equal(countGeometryTriangles(null), 0);
  assert.equal(countGeometryTriangles({ index: { count: -3 } }), 0);
});

test('38,000 triangle static mesh plans a reduction below the target', () => {
  const plan = planMobileGeometryReduction({ totalTriangles: 38000, eligibleTriangles: 38000, fixedTriangles: 0 });
  assert.equal(plan.status, 'simplification-planned');
  assert.ok(plan.keepRatio > 0 && plan.keepRatio < 0.13);
  assert.ok(Math.floor(38000 * plan.keepRatio) < KANO_MOBILE_MODEL_TRIANGLE_TARGET);
});

test('protected geometry is included and can block an unsafe success claim', () => {
  const reducible = planMobileGeometryReduction({ totalTriangles: 10000, eligibleTriangles: 7000, fixedTriangles: 3000 });
  assert.equal(reducible.status, 'simplification-planned');
  assert.ok(3000 + Math.floor(7000 * reducible.keepRatio) < KANO_MOBILE_MODEL_TRIANGLE_TARGET);
  const fixedOnly = planMobileGeometryReduction({ totalTriangles: 12000, eligibleTriangles: 2000, fixedTriangles: 10000 });
  assert.equal(fixedOnly.status, 'over-budget-unreducible');
  assert.equal(fixedOnly.keepRatio, 1);
});

test('vertex removal remains bounded and leaves a minimum usable geometry', () => {
  assert.equal(verticesToRemove(100, 1), 0);
  assert.equal(verticesToRemove(100, 0.5), 50);
  assert.equal(verticesToRemove(4, 0.1), 0);
  assert.equal(verticesToRemove(100, 0), 96);
});

test('traffic selector imports the mobile reducer without changing category balance', async () => {
  const source = await readFile(trafficMixPath, 'utf8');
  assert.match(source, /import\s+['"]\.\/KanoMobileGeometryBudgetUpgrade\.js['"]/);
  assert.match(source, /import\s+['"]\.\/KanoFlyoverDriveabilityUpgrade\.js['"]/);
  assert.match(source, /if\s*\(roll\s*<\s*0\.4\)\s*return\s*['"]keke['"]/);
  assert.match(source, /if\s*\(roll\s*<\s*0\.7\)\s*return\s*['"]motorcycle['"]/);
  assert.match(source, /export function getKanoTrafficFamily/);
});

test('non-finite geometry inputs never yield non-finite plans', () => {
  const plan = planMobileGeometryReduction({ totalTriangles: Infinity, eligibleTriangles: NaN, fixedTriangles: -1 });
  assert.ok(Number.isFinite(plan.totalTriangles));
  assert.ok(Number.isFinite(plan.eligibleTriangles));
  assert.ok(Number.isFinite(plan.fixedTriangles));
  assert.ok(Number.isFinite(plan.keepRatio));
});
