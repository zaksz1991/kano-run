import test from 'node:test';
import assert from 'node:assert/strict';
import {
  KANO_LIVE_PERFORMANCE_TARGETS,
  countGeometryTriangles,
  countModelTriangles,
  auditKanoLiveMobilePerformance,
  sampleKanoLiveFramePacing,
} from '../js/KanoLiveMobilePerformanceAudit.js';

test('publishes the requested mobile scene and model budgets', () => {
  assert.equal(KANO_LIVE_PERFORMANCE_TARGETS.sceneTriangles, 100000);
  assert.equal(KANO_LIVE_PERFORMANCE_TARGETS.modelTriangles, 5000);
});

test('counts indexed geometry using drawRange', () => {
  assert.equal(countGeometryTriangles({ index: { count: 300 }, drawRange: { count: 90 } }), 30);
});

test('counts non-indexed geometry from position vertices', () => {
  assert.equal(countGeometryTriangles({ attributes: { position: { count: 33 } } }), 11);
});

test('returns zero for missing or invalid geometry', () => {
  assert.equal(countGeometryTriangles(null), 0);
  assert.equal(countGeometryTriangles({ attributes: { position: { count: -3 } } }), 0);
});

test('counts meshes and skinned meshes in a model root', () => {
  const mesh = { isMesh: true, geometry: { index: { count: 300 } } };
  const skinned = { isMesh: true, isSkinnedMesh: true, geometry: { attributes: { position: { count: 150 } } } };
  const root = { traverse(fn) { fn(mesh); fn(skinned); } };
  assert.deepEqual(countModelTriangles(root), { triangles: 150, meshCount: 2, skinnedMeshCount: 1 });
});

test('read-only audit reports absent renderer/model manager as unavailable', () => {
  const host = { matchMedia: () => ({ matches: false }), navigator: { maxTouchPoints: 0 } };
  const report = auditKanoLiveMobilePerformance(host);
  assert.equal(report.rendererFound, false);
  assert.equal(report.modelManagerFound, false);
  assert.equal(report.budgets.sceneWithinTarget, null);
  assert.equal(report.frame.trianglesLastRenderedFrame, null);
});

test('audit does not alter scene geometry', () => {
  const geometry = { index: { count: 600 } };
  const mesh = { isMesh: true, visible: true, geometry, parent: null };
  const scene = { traverse(fn) { fn(mesh); } };
  const renderer3d = { scene, renderer: { info: { render: { triangles: 200, calls: 3 } }, getPixelRatio: () => 1.5, domElement: { clientWidth: 400, clientHeight: 700 } } };
  const host = { __KANO_WORLD_PERF_RENDERER__: renderer3d, __KANO_MODEL_MANAGER__: { cache: new Map() }, navigator: { maxTouchPoints: 1 } };
  const report = auditKanoLiveMobilePerformance(host);
  assert.equal(report.scene.visibleSceneTrianglesUpperBound, 200);
  assert.equal(report.frame.trianglesLastRenderedFrame, 200);
  assert.equal(geometry.index.count, 600);
});

test('audit reports over-budget cached models without mutating them', () => {
  const model = { userData: { modelPath: 'characters/test.glb' }, traverse(fn) { fn({ isMesh: true, geometry: { index: { count: 30000 } } }); } };
  const host = { __KANO_MODEL_MANAGER__: { cache: new Map([['passenger', model]]) } };
  const report = auditKanoLiveMobilePerformance(host);
  assert.equal(report.budgets.cachedModelsOverTarget, 1);
  assert.equal(report.models[0].triangles, 10000);
  assert.equal(report.models[0].status, 'over-5000-triangle-target');
});

test('frame sample reports unavailable where requestAnimationFrame is absent', async () => {
  const report = await sampleKanoLiveFramePacing(1000, {});
  assert.equal(report.available, false);
});
