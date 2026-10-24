/**
 * Kano Life — read-only live mobile performance audit.
 * Does not patch the renderer, edit model geometry, or change game state.
 * Load from DevTools with import('/js/KanoLiveMobilePerformanceAudit.js').
 */

export const KANO_LIVE_PERFORMANCE_TARGETS = Object.freeze({
  sceneTriangles: 100_000,
  modelTriangles: 5_000,
  frameMs60Fps: 1000 / 60,
  frameMs30Fps: 1000 / 30,
});

function safeNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

export function countGeometryTriangles(geometry) {
  if (!geometry) return 0;
  const indexCount = geometry.index?.count;
  const positionCount = geometry.attributes?.position?.count;
  const rawCount = Number.isFinite(Number(indexCount)) ? Number(indexCount) : Number(positionCount);
  if (!Number.isFinite(rawCount) || rawCount < 0) return 0;
  const drawCount = Number(geometry.drawRange?.count);
  const boundedCount = Number.isFinite(drawCount) && drawCount >= 0
    ? Math.min(rawCount, drawCount)
    : rawCount;
  return Math.floor(boundedCount / 3);
}

export function countModelTriangles(root) {
  let triangles = 0;
  let meshCount = 0;
  let skinnedMeshCount = 0;
  const seenMeshes = new Set();
  root?.traverse?.((object) => {
    if (!object?.isMesh || !object.geometry || seenMeshes.has(object)) return;
    seenMeshes.add(object);
    meshCount += 1;
    if (object.isSkinnedMesh) skinnedMeshCount += 1;
    triangles += countGeometryTriangles(object.geometry);
  });
  return { triangles, meshCount, skinnedMeshCount };
}

function findRenderer(host) {
  return host?.__KANO_WORLD_PERF_RENDERER__
    || host?.__KANO_RENDERER3D__
    || host?.__KANO_ACTIVE_RENDERER__
    || null;
}

function findModelManager(host) {
  return host?.__KANO_MODEL_MANAGER__
    || host?.__KANO_ACTIVE_MODEL_MANAGER__
    || null;
}

function inspectScene(scene) {
  let triangles = 0;
  let meshCount = 0;
  let visibleMeshCount = 0;
  scene?.traverse?.((object) => {
    if (!object?.isMesh || !object.geometry) return;
    meshCount += 1;
    let visible = object.visible !== false;
    let parent = object.parent;
    while (visible && parent) {
      if (parent.visible === false) visible = false;
      parent = parent.parent;
    }
    if (!visible) return;
    visibleMeshCount += 1;
    triangles += countGeometryTriangles(object.geometry);
  });
  return { available: Boolean(scene), meshCount, visibleMeshCount, visibleSceneTrianglesUpperBound: triangles };
}

export function auditKanoLiveMobilePerformance(host = globalThis.window) {
  const renderer3d = findRenderer(host);
  const webgl = renderer3d?.renderer || null;
  const scene = renderer3d?.scene || renderer3d?.world || null;
  const manager = findModelManager(host);
  const modelEntries = [...(manager?.cache?.entries?.() || [])].map(([key, model]) => {
    const measured = countModelTriangles(model);
    return {
      key: String(key),
      path: String(model?.userData?.modelPath || ''),
      triangles: measured.triangles,
      meshCount: measured.meshCount,
      skinnedMeshCount: measured.skinnedMeshCount,
      status: measured.triangles <= KANO_LIVE_PERFORMANCE_TARGETS.modelTriangles
        ? 'within-5000-triangle-target'
        : 'over-5000-triangle-target',
    };
  }).sort((a, b) => b.triangles - a.triangles);

  const sceneMetrics = inspectScene(scene);
  const gpuTriangles = safeNumber(webgl?.info?.render?.triangles, NaN);
  const drawCalls = safeNumber(webgl?.info?.render?.calls, NaN);
  let bufferWidth = 0;
  let bufferHeight = 0;
  try {
    const size = webgl?.getDrawingBufferSize?.({ set(x, y) { this.x = x; this.y = y; return this; } });
    bufferWidth = safeNumber(size?.x);
    bufferHeight = safeNumber(size?.y);
  } catch { /* Optional WebGL diagnostic only. */ }

  const modelTrianglesOverBudget = modelEntries.filter((entry) => entry.triangles > KANO_LIVE_PERFORMANCE_TARGETS.modelTriangles);
  const sceneMetric = Number.isFinite(gpuTriangles)
    ? gpuTriangles
    : sceneMetrics.available ? sceneMetrics.visibleSceneTrianglesUpperBound : NaN;
  return {
    generatedAt: new Date().toISOString(),
    mobileViewport: Boolean(host && (
      (host.navigator?.maxTouchPoints > 0)
      || host.matchMedia?.('(max-width: 760px), (pointer: coarse)')?.matches
    )),
    rendererFound: Boolean(renderer3d),
    webglRendererFound: Boolean(webgl),
    modelManagerFound: Boolean(manager),
    frame: {
      trianglesLastRenderedFrame: Number.isFinite(gpuTriangles) ? gpuTriangles : null,
      drawCallsLastRenderedFrame: Number.isFinite(drawCalls) ? drawCalls : null,
      pixelRatio: safeNumber(webgl?.getPixelRatio?.(), NaN),
      drawingBufferWidth: bufferWidth || null,
      drawingBufferHeight: bufferHeight || null,
      canvasClientWidth: safeNumber(webgl?.domElement?.clientWidth, NaN),
      canvasClientHeight: safeNumber(webgl?.domElement?.clientHeight, NaN),
    },
    scene: sceneMetrics,
    budgets: {
      sceneTrianglesTarget: KANO_LIVE_PERFORMANCE_TARGETS.sceneTriangles,
      modelTrianglesTarget: KANO_LIVE_PERFORMANCE_TARGETS.modelTriangles,
      sceneTriangleMeasurement: Number.isFinite(gpuTriangles) ? 'webgl-last-rendered-frame' : 'visible-scene-upper-bound',
      sceneTriangles: Number.isFinite(sceneMetric) ? sceneMetric : null,
      sceneWithinTarget: Number.isFinite(sceneMetric) ? sceneMetric <= KANO_LIVE_PERFORMANCE_TARGETS.sceneTriangles : null,
      cachedModels: modelEntries.length,
      cachedModelsOverTarget: modelTrianglesOverBudget.length,
    },
    models: modelEntries,
    limitations: [
      'WebGL triangle/draw-call values describe the most recently rendered frame and may reset between renderer passes.',
      'The fallback scene count is an upper-bound traversal, not camera-frustum visibility or GPU submission proof.',
      'An unregistered renderer or model manager is reported as unavailable; missing measurements are not treated as passes.',
      'This audit is read-only and does not reduce geometry, alter render resolution, or change game state.',
    ],
  };
}

export function sampleKanoLiveFramePacing(durationMs = 5000, host = globalThis.window) {
  const raf = host?.requestAnimationFrame?.bind(host);
  const now = host?.performance?.now?.bind(host.performance) || (() => Date.now());
  if (!raf) return Promise.resolve({ available: false, reason: 'requestAnimationFrame unavailable', frames: 0 });
  const duration = Math.max(500, Math.min(30_000, safeNumber(durationMs, 5000)));

  return new Promise((resolve) => {
    const intervals = [];
    let last = null;
    let start = null;
    let rafId = null;
    const tick = (timestamp) => {
      const current = Number.isFinite(timestamp) ? timestamp : now();
      start ??= current;
      if (last !== null) intervals.push(Math.max(0, current - last));
      last = current;
      if (current - start >= duration) {
        const sorted = [...intervals].sort((a, b) => a - b);
        const percentile = (p) => sorted.length ? sorted[Math.min(sorted.length - 1, Math.floor((sorted.length - 1) * p))] : null;
        const mean = sorted.length ? sorted.reduce((sum, value) => sum + value, 0) / sorted.length : null;
        resolve({
          available: true,
          durationMs: current - start,
          frames: intervals.length,
          meanFrameMs: mean,
          p50FrameMs: percentile(0.5),
          p95FrameMs: percentile(0.95),
          framesOver16_67ms: intervals.filter((value) => value > KANO_LIVE_PERFORMANCE_TARGETS.frameMs60Fps).length,
          framesOver33_33ms: intervals.filter((value) => value > KANO_LIVE_PERFORMANCE_TARGETS.frameMs30Fps).length,
          approximateFps: mean > 0 ? 1000 / mean : null,
          note: 'Frame pacing is sampled in this tab; background throttling and display refresh rate affect interpretation.',
        });
        return;
      }
      rafId = raf(tick);
    };
    rafId = raf(tick);
    if (host?.addEventListener) {
      host.addEventListener('pagehide', () => {
        if (rafId !== null) host.cancelAnimationFrame?.(rafId);
      }, { once: true });
    }
  });
}

if (typeof window !== 'undefined') {
  window.kanoLiveMobilePerformanceAudit = () => auditKanoLiveMobilePerformance(window);
  window.kanoLiveMobileFrameSample = (durationMs = 5000) => sampleKanoLiveFramePacing(durationMs, window);
}
