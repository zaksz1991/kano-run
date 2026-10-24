import test from 'node:test';
import assert from 'node:assert/strict';
import {
  KANO_MOBILE_PERFORMANCE_BUDGET,
  countGeometryTriangles,
  auditObjectTree,
  auditKanoMobilePerformance,
  installKanoMobilePerformanceBudget,
} from '../js/KanoMobilePerformanceBudget.js';

const geometry = (triangles, indexed = false) => indexed
  ? { index: { count: triangles * 3 }, attributes: { position: { count: triangles * 3 } } }
  : { attributes: { position: { count: triangles * 3 } } };
const mesh = (triangles, opts = {}) => ({
  isMesh: true,
  name: opts.name || 'mesh',
  visible: opts.visible ?? true,
  geometry: geometry(triangles, opts.indexed),
  material: {},
  children: opts.children || [],
});
const group = (children, opts = {}) => ({ visible: opts.visible ?? true, children, userData: opts.userData || {} });

test('mobile budgets match the requested starting thresholds', () => {
  assert.equal(KANO_MOBILE_PERFORMANCE_BUDGET.maxVisibleTriangles, 100_000);
  assert.equal(KANO_MOBILE_PERFORMANCE_BUDGET.maxTrianglesPerModel, 5_000);
});

test('counts indexed and non-indexed geometry triangles', () => {
  assert.equal(countGeometryTriangles(geometry(120)), 120);
  assert.equal(countGeometryTriangles(geometry(77, true)), 77);
  assert.equal(countGeometryTriangles(null), 0);
});

test('honours geometry draw ranges', () => {
  const g = geometry(100);
  g.drawRange = { start: 30, count: 90 };
  assert.equal(countGeometryTriangles(g), 30);
});

test('counts visible mesh descendants and excludes hidden descendants', () => {
  const root = group([mesh(100), mesh(50, { visible: false }), group([mesh(25)])]);
  const scan = auditObjectTree(root);
  assert.equal(scan.triangles, 125);
  assert.equal(scan.meshCount, 2);
});

test('a hidden ancestor hides its full subtree from visible triangle count', () => {
  const root = group([group([mesh(400)], { visible: false })]);
  assert.equal(auditObjectTree(root).triangles, 0);
  assert.equal(auditObjectTree(root, { visibleOnly: false }).triangles, 400);
});

test('instanced meshes multiply triangles by instance count', () => {
  const instance = { isInstancedMesh: true, isMesh: true, count: 8, geometry: geometry(60), material: {}, children: [] };
  assert.equal(auditObjectTree(instance).triangles, 480);
});

test('scene audit detects a visible triangle budget breach', () => {
  const scene = group([mesh(80_000), mesh(25_000)]);
  const report = auditKanoMobilePerformance({ manager: { cache: new Map(), instances: new Set() }, scene });
  assert.equal(report.visibleBudgetKnown, true);
  assert.equal(report.visibleBudgetPass, false);
  assert.equal(report.status, 'over_budget');
});

test('model source audit flags templates above 5,000 triangles without altering them', () => {
  const template = group([mesh(3_500), mesh(2_000)], { userData: { modelKey: 'heavy-passenger' } });
  const manager = { cache: new Map([['heavy-passenger', template]]), instances: new Set() };
  const report = auditKanoMobilePerformance({ manager });
  assert.equal(report.modelBudgetPass, false);
  assert.equal(report.overLimitModelCount, 1);
  assert.equal(report.overLimitModels[0].triangles, 5_500);
  assert.equal(template.children.length, 2);
});

test('without a renderer or scene, visible-scene status is unknown rather than falsely passing', () => {
  const report = auditKanoMobilePerformance({ manager: { cache: new Map(), instances: new Set() } });
  assert.equal(report.visibleBudgetKnown, false);
  assert.equal(report.visibleBudgetPass, null);
  assert.equal(report.status, 'partial');
});

test('uses renderer.info triangles as the actual last-render count when available', () => {
  const renderer = { info: { render: { triangles: 40_001, calls: 48 }, memory: { geometries: 12, textures: 8 } } };
  const report = auditKanoMobilePerformance({ manager: { cache: new Map(), instances: new Set() }, renderer });
  assert.equal(report.visibleTriangles, 40_001);
  assert.equal(report.visibleBudgetKnown, true);
  assert.equal(report.visibleBudgetPass, true);
  assert.equal(report.renderer.triangles, 40_001);
  assert.equal(report.renderer.calls, 48);
});

test('installs opt-in audit functions without replacing existing application fields', () => {
  const target = { existingValue: 123, requestAnimationFrame() {} };
  const installed = installKanoMobilePerformanceBudget(target);
  assert.equal(target.existingValue, 123);
  assert.equal(typeof target.kanoMobilePerformanceBudgetAudit, 'function');
  assert.equal(typeof target.kanoMobilePerformanceFrameSample, 'function');
  assert.equal(installed.budget.maxVisibleTriangles, 100_000);
});
