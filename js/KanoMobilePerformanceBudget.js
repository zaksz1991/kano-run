/**
 * Kano Life — additive mobile performance budget auditor.
 *
 * This module is deliberately standalone: it does not patch Renderer3D,
 * ModelManager, game simulation, UI, startup imports, or any public asset.
 * Import it manually in a running session to inspect the loaded model manager
 * and, when available, a renderer/scene supplied by the caller.
 */

export const KANO_MOBILE_PERFORMANCE_BUDGET = Object.freeze({
  maxVisibleTriangles: 100_000,
  maxTrianglesPerModel: 5_000,
  targetFrameMs: 16.67,
  slowFrameMs: 33.33,
});

const finiteNonNegative = (value) => {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(0, number) : 0;
};

/** Count triangles represented by one BufferGeometry draw range. */
export function countGeometryTriangles(geometry) {
  if (!geometry) return 0;
  const indexedCount = geometry.index?.count ?? geometry.index?.array?.length;
  const positionCount = geometry.attributes?.position?.count
    ?? geometry.attributes?.position?.array?.length / 3;
  const elementCount = Number.isFinite(Number(indexedCount))
    ? Number(indexedCount)
    : Number(positionCount);
  if (!Number.isFinite(elementCount) || elementCount <= 0) return 0;

  const start = finiteNonNegative(geometry.drawRange?.start ?? 0);
  const rawRangeCount = geometry.drawRange?.count;
  const available = Math.max(0, elementCount - start);
  const count = Number.isFinite(Number(rawRangeCount)) && Number(rawRangeCount) >= 0
    ? Math.min(available, Number(rawRangeCount))
    : available;
  return Math.floor(count / 3);
}

function objectIsRenderableMesh(object) {
  return Boolean(object && object.geometry && (
    object.isMesh === true || object.isSkinnedMesh === true || object.isInstancedMesh === true
  ));
}

function meshDrawCallsEstimate(object) {
  const groups = Array.isArray(object.geometry?.groups) ? object.geometry.groups.length : 0;
  const materials = Array.isArray(object.material) ? object.material.length : 0;
  if (groups > 0 && materials > 1) return Math.max(groups, materials);
  if (groups > 0) return groups;
  if (materials > 1) return materials;
  return 1;
}

/**
 * Scan an object tree. For a model complexity audit includeHidden=true;
 * for a viewport estimate visibleOnly=true (the default).
 */
export function auditObjectTree(root, { visibleOnly = true } = {}) {
  const seenObjects = new Set();
  const seenGeometries = new Set();
  const seenMaterials = new Set();
  const meshRecords = [];
  let triangles = 0;
  let drawCallsEstimate = 0;

  function visit(object, ancestorsVisible) {
    if (!object || typeof object !== 'object' || seenObjects.has(object)) return;
    seenObjects.add(object);
    const visible = ancestorsVisible && object.visible !== false;

    if (objectIsRenderableMesh(object) && (!visibleOnly || visible)) {
      const baseTriangles = countGeometryTriangles(object.geometry);
      const instances = object.isInstancedMesh
        ? finiteNonNegative(object.count ?? 1)
        : 1;
      const meshTriangles = baseTriangles * instances;
      const calls = meshDrawCallsEstimate(object) * instances;
      triangles += meshTriangles;
      drawCallsEstimate += calls;
      seenGeometries.add(object.geometry);
      const materialList = Array.isArray(object.material)
        ? object.material
        : object.material ? [object.material] : [];
      for (const material of materialList) if (material) seenMaterials.add(material);
      meshRecords.push({
        name: String(object.name || '(unnamed mesh)'),
        triangles: meshTriangles,
        instances,
        drawCallsEstimate: calls,
        visible,
      });
    }

    for (const child of object.children || []) visit(child, visible);
  }

  visit(root, true);
  return {
    triangles,
    drawCallsEstimate,
    meshCount: meshRecords.length,
    uniqueGeometries: seenGeometries.size,
    uniqueMaterials: seenMaterials.size,
    meshes: meshRecords,
  };
}

function modelSourceEntries(manager) {
  const entries = [];
  const seen = new Set();
  const add = (key, root, origin) => {
    if (!root || typeof root !== 'object' || seen.has(root)) return;
    seen.add(root);
    entries.push({ key: String(key || root.userData?.modelKey || 'unknown'), root, origin });
  };

  if (manager?.cache instanceof Map) {
    for (const [key, root] of manager.cache) add(key, root, 'cache');
  }

  const pools = manager?.__kanoExistingGlbPools;
  if (pools instanceof Map) {
    for (const [key, candidates] of pools) {
      if (Array.isArray(candidates)) candidates.forEach((root) => add(key, root, 'pool'));
    }
  }
  return entries;
}

function activeInstanceEntries(manager) {
  if (!(manager?.instances instanceof Set)) return [];
  return [...manager.instances].filter((root) => root && typeof root === 'object');
}

/**
 * Audit a loaded ModelManager plus an optional Three.js renderer/scene.
 * Without renderer.scene, visibleTriangles is deliberately reported as unknown:
 * manager.instances only covers GLB-backed actors, not procedural scene meshes.
 */
export function auditKanoMobilePerformance({
  manager = globalThis.window?.__KANO_ACTIVE_MODEL_MANAGER__ ?? globalThis.__KANO_ACTIVE_MODEL_MANAGER__,
  renderer = null,
  scene = renderer?.scene ?? null,
  budget = KANO_MOBILE_PERFORMANCE_BUDGET,
} = {}) {
  const sources = modelSourceEntries(manager);
  const models = sources.map(({ key, root, origin }) => {
    const scan = auditObjectTree(root, { visibleOnly: false });
    return { key, origin, triangles: scan.triangles, meshes: scan.meshCount,
      exceedsPerModelBudget: scan.triangles > budget.maxTrianglesPerModel };
  }).sort((a, b) => b.triangles - a.triangles);

  const instances = activeInstanceEntries(manager);
  let glbInstanceTriangles = 0;
  let glbInstanceMeshes = 0;
  for (const instance of instances) {
    const scan = auditObjectTree(instance, { visibleOnly: true });
    glbInstanceTriangles += scan.triangles;
    glbInstanceMeshes += scan.meshCount;
  }

  const sceneScan = scene ? auditObjectTree(scene, { visibleOnly: true }) : null;
  const rendererInfo = renderer?.info;
  const renderedTriangles = Number.isFinite(Number(rendererInfo?.render?.triangles))
    ? Number(rendererInfo.render.triangles) : null;
  const renderedCalls = Number.isFinite(Number(rendererInfo?.render?.calls))
    ? Number(rendererInfo.render.calls) : null;
  const overLimitModels = models.filter((model) => model.exceedsPerModelBudget);
  const visibleTriangles = renderedTriangles ?? sceneScan?.triangles ?? null;
  const visibleBudgetKnown = visibleTriangles !== null;
  const modelBudgetPass = overLimitModels.length === 0;
  const visibleBudgetPass = visibleBudgetKnown
    ? visibleTriangles <= budget.maxVisibleTriangles
    : null;

  const notes = [];
  if (!manager) notes.push('No active model manager found. Start the game and run the audit again.');
  if (!scene && renderedTriangles === null) {
    notes.push('Full visible-scene triangle total is unavailable. GLB instance triangles are a lower bound; procedural meshes are not included.');
  }
  if (overLimitModels.length) {
    notes.push(`${overLimitModels.length} loaded model template(s) exceed the ${budget.maxTrianglesPerModel.toLocaleString()}-triangle mobile target. This diagnostic does not decimate or replace them.`);
  }
  if (visibleBudgetPass === false) {
    notes.push(`Visible rendering exceeds ${budget.maxVisibleTriangles.toLocaleString()} triangles.`);
  }

  return {
    generatedAt: new Date().toISOString(),
    budget: { ...budget },
    status: !manager ? 'unavailable' : (!visibleBudgetKnown ? 'partial' : (modelBudgetPass && visibleBudgetPass ? 'pass' : 'over_budget')),
    modelBudgetPass,
    visibleBudgetKnown,
    visibleTriangles,
    visibleBudgetPass,
    sourceModels: models.length,
    overLimitModelCount: overLimitModels.length,
    overLimitModels,
    instanceCount: instances.length,
    glbInstanceTriangles,
    glbInstanceMeshes,
    scene: sceneScan ? {
      visibleTriangles: sceneScan.triangles,
      drawCallsEstimate: sceneScan.drawCallsEstimate,
      meshCount: sceneScan.meshCount,
      uniqueGeometries: sceneScan.uniqueGeometries,
      uniqueMaterials: sceneScan.uniqueMaterials,
    } : null,
    renderer: rendererInfo ? {
      triangles: renderedTriangles,
      calls: renderedCalls,
      geometries: Number.isFinite(Number(rendererInfo.memory?.geometries)) ? rendererInfo.memory.geometries : null,
      textures: Number.isFinite(Number(rendererInfo.memory?.textures)) ? rendererInfo.memory.textures : null,
    } : null,
    notes,
  };
}

/** Sample real requestAnimationFrame intervals. Does not change render quality. */
export function sampleKanoFramePacing({ durationMs = 5000, target = globalThis.window ?? globalThis } = {}) {
  if (typeof target.requestAnimationFrame !== 'function') {
    return Promise.reject(new Error('requestAnimationFrame is not available in this environment.'));
  }
  const duration = Math.max(1000, finiteNonNegative(durationMs));
  return new Promise((resolve) => {
    const intervals = [];
    let start = null;
    let previous = null;
    let ended = false;

    const frame = (timestamp) => {
      if (ended) return;
      if (start === null) start = timestamp;
      if (previous !== null) intervals.push(Math.max(0, timestamp - previous));
      previous = timestamp;
      if (timestamp - start < duration) {
        target.requestAnimationFrame(frame);
        return;
      }
      ended = true;
      const sorted = [...intervals].sort((a, b) => a - b);
      const average = intervals.length
        ? intervals.reduce((sum, value) => sum + value, 0) / intervals.length
        : null;
      const percentile = (p) => sorted.length
        ? sorted[Math.min(sorted.length - 1, Math.floor((sorted.length - 1) * p))]
        : null;
      resolve({
        durationMs: timestamp - start,
        frames: intervals.length,
        averageFrameMs: average,
        fps: average && average > 0 ? 1000 / average : null,
        p95FrameMs: percentile(0.95),
        framesOver16_67ms: intervals.filter((value) => value > 16.67).length,
        framesOver33_33ms: intervals.filter((value) => value > 33.33).length,
        targetFrameMs: KANO_MOBILE_PERFORMANCE_BUDGET.targetFrameMs,
        slowFrameMs: KANO_MOBILE_PERFORMANCE_BUDGET.slowFrameMs,
        note: 'Frame pacing is measured from browser animation callbacks; CPU/GPU saturation and thermal throttling may vary between runs.',
      });
    };
    target.requestAnimationFrame(frame);
  });
}

/** Install opt-in globals without altering the game's protected startup chain. */
export function installKanoMobilePerformanceBudget(target = globalThis.window ?? globalThis) {
  target.kanoMobilePerformanceBudgetAudit = (options = {}) => auditKanoMobilePerformance(options);
  target.kanoMobilePerformanceFrameSample = (durationMs = 5000) => sampleKanoFramePacing({ durationMs, target });
  return {
    audit: target.kanoMobilePerformanceBudgetAudit,
    sampleFramePacing: target.kanoMobilePerformanceFrameSample,
    budget: KANO_MOBILE_PERFORMANCE_BUDGET,
  };
}
