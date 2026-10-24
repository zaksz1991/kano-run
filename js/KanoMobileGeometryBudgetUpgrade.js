/**
 * Kano Life — mobile-only runtime geometry reduction for existing GLB models.
 *
 * This module simplifies derived in-memory geometry only. It never edits or
 * overwrites public model files, creates substitute character meshes, or alters
 * game rules. It must be imported before main.js constructs ModelManager.
 */
import { ModelManager } from './ModelManager.js';
import {
  KANO_MOBILE_MODEL_TRIANGLE_LIMIT,
  KANO_MOBILE_MODEL_TRIANGLE_TARGET,
  countGeometryTriangles,
  planMobileGeometryReduction,
  verticesToRemove,
} from './KanoMobileGeometryBudgetRules.js';

const PATCH_KEY = Symbol.for('kano.life.mobileGeometryBudget.v1');
const REPORT_KEY = 'kanoMobileGeometryBudgetAudit';
const MIN_MESH_TRIANGLES = 32;
const MAX_SIMPLIFIABLE_VERTICES = 250_000;
const DRIVER_RIG_NAMES = new Set([
  'KANO_SEATED_DRIVER_RIG',
  'KANO_KEKE_SEATED_DRIVER',
  'KANO_DRIVER_RIG',
]);
const reports = new Map();
const managerJobs = new WeakMap();
let toolsPromise = null;
let simplificationQueue = Promise.resolve();

function isMobileViewport() {
  try {
    return Boolean(
      (typeof navigator !== 'undefined' && navigator.maxTouchPoints > 0)
      || (typeof window !== 'undefined'
        && window.matchMedia('(max-width: 760px), (pointer: coarse)').matches),
    );
  } catch {
    return false;
  }
}

function parentIsProtected(object, root) {
  let current = object;
  while (current && current !== root) {
    if (DRIVER_RIG_NAMES.has(String(current.name || ''))) return true;
    if (current.userData?.proceduralDriver === true || current.userData?.seated === true) return true;
    if (current.userData?.kanoKeepGeometryDetail === true) return true;
    current = current.parent;
  }
  return false;
}

function geometryIsEligible(mesh, root) {
  if (!mesh?.isMesh || mesh.isSkinnedMesh || mesh.isInstancedMesh) return false;
  if (parentIsProtected(mesh, root)) return false;
  if (Array.isArray(mesh.material)) return false;
  const geometry = mesh.geometry;
  if (!geometry?.attributes?.position) return false;
  if (Array.isArray(geometry.groups) && geometry.groups.length > 0) return false;
  if (geometry.morphAttributes && Object.values(geometry.morphAttributes).some((a) => a?.length)) return false;
  if (Object.values(geometry.attributes).some((attribute) => attribute?.isInterleavedBufferAttribute)) return false;
  if (geometry.attributes.skinIndex || geometry.attributes.skinWeight) return false;
  const count = geometry.index?.count ?? geometry.attributes.position.count;
  if (Number.isFinite(Number(geometry.drawRange?.count)) && Number(geometry.drawRange.count) < count) return false;
  if (geometry.attributes.position.count > MAX_SIMPLIFIABLE_VERTICES) return false;
  return countGeometryTriangles(geometry) >= MIN_MESH_TRIANGLES;
}

function getSimplifierTools() {
  if (!toolsPromise) {
    toolsPromise = Promise.all([
      import('three/addons/modifiers/SimplifyModifier.js'),
      import('three/addons/utils/BufferGeometryUtils.js'),
    ]).then(([modifierModule, utilsModule]) => ({
      modifier: new modifierModule.SimplifyModifier(),
      mergeVertices: utilsModule.mergeVertices,
    }));
  }
  return toolsPromise;
}

function enqueueSimplification(task) {
  const next = simplificationQueue.then(task, task);
  simplificationQueue = next.catch(() => undefined);
  return next;
}

function collectGeometryEntries(root) {
  const entries = new Map();
  let totalTriangles = 0;
  root.traverse((object) => {
    if (!object?.isMesh || !object.geometry) return;
    const geometry = object.geometry;
    const triangles = countGeometryTriangles(geometry);
    totalTriangles += triangles;
    let entry = entries.get(geometry);
    if (!entry) {
      entry = { geometry, trianglesPerUse: triangles, objects: [], eligible: true };
      entries.set(geometry, entry);
    }
    entry.objects.push(object);
    entry.eligible = entry.eligible && geometryIsEligible(object, root);
  });
  let eligibleTriangles = 0;
  let fixedTriangles = 0;
  for (const entry of entries.values()) {
    const totalForEntry = entry.trianglesPerUse * entry.objects.length;
    if (entry.eligible) eligibleTriangles += totalForEntry;
    else fixedTriangles += totalForEntry;
  }
  return { entries, totalTriangles, eligibleTriangles, fixedTriangles };
}

function countRootTriangles(root) {
  let triangles = 0;
  root?.traverse?.((object) => {
    if (object?.isMesh && object.geometry) triangles += countGeometryTriangles(object.geometry);
  });
  return triangles;
}

function updateVisualAudit(root, originalTriangles, finalTriangles, report) {
  const visual = root?.userData?.kanoModelVisualUpgrade;
  if (visual && typeof visual === 'object') {
    visual.sourceTriangleCount ??= originalTriangles;
    visual.triangleCount = finalTriangles;
    visual.mobileGeometryBudget = {
      status: report.status,
      targetTriangles: report.targetTriangles,
      originalTriangles,
      finalTriangles,
    };
  }
}

function disposeGeometry(geometry) {
  try { geometry?.dispose?.(); } catch { /* Optional cleanup must not break model loading. */ }
}

async function simplifyTemplate(manager, key, root) {
  const source = collectGeometryEntries(root);
  const plan = planMobileGeometryReduction(source);
  const baseReport = {
    version: 1,
    modelKey: String(key || root.userData?.modelKey || 'unknown'),
    modelPath: String(root.userData?.modelPath || ''),
    mobile: true,
    targetTriangles: KANO_MOBILE_MODEL_TRIANGLE_TARGET,
    hardLimitTriangles: KANO_MOBILE_MODEL_TRIANGLE_LIMIT,
    originalTriangles: source.totalTriangles,
    finalTriangles: source.totalTriangles,
    eligibleTriangles: source.eligibleTriangles,
    fixedTriangles: source.fixedTriangles,
    simplifiedGeometries: 0,
    simplifiedMeshUses: 0,
    status: plan.status,
    error: null,
  };
  if (plan.status !== 'simplification-planned') {
    updateVisualAudit(root, source.totalTriangles, source.totalTriangles, baseReport);
    return baseReport;
  }

  const replacements = new Map();
  const scratchGeometries = new Set();
  let committed = false;
  try {
    const { modifier, mergeVertices } = await getSimplifierTools();
    for (const entry of source.entries.values()) {
      if (!entry.eligible) continue;
      const original = entry.geometry;
      if (replacements.has(original)) continue;
      const originalVertexCount = original.attributes.position.count;
      const removalCount = verticesToRemove(originalVertexCount, plan.keepRatio);
      if (removalCount < 1) continue;

      let working = original.clone();
      scratchGeometries.add(working);
      if (!working.index) {
        const merged = mergeVertices(working, 1e-4);
        if (merged !== working) {
          disposeGeometry(working);
          scratchGeometries.delete(working);
          working = merged;
          scratchGeometries.add(working);
        }
      }
      const vertexCount = Number(working.attributes?.position?.count) || 0;
      const adjustedRemoval = verticesToRemove(vertexCount, plan.keepRatio);
      if (adjustedRemoval < 1 || vertexCount < 5) continue;
      const simplified = await modifier.modify(working, adjustedRemoval);
      if (simplified && simplified !== working) {
        replacements.set(original, simplified);
        scratchGeometries.add(simplified);
      }
    }

    if (!replacements.size) {
      baseReport.status = 'over-budget-unreducible';
      updateVisualAudit(root, source.totalTriangles, source.totalTriangles, baseReport);
      return baseReport;
    }

    const externalGeometries = new Set();
    for (const [otherKey, otherRoot] of manager?.cache?.entries?.() || []) {
      if (otherKey === key || otherRoot === root) continue;
      otherRoot?.traverse?.((object) => {
        if (object?.geometry) externalGeometries.add(object.geometry);
      });
    }

    // Finish all potentially-throwing geometry preparation before touching the
    // live model. If a preparation step fails, the original GLB remains intact.
    for (const replacement of replacements.values()) {
      replacement.computeBoundingBox?.();
      replacement.computeBoundingSphere?.();
    }
    for (const entry of source.entries.values()) {
      const simplified = replacements.get(entry.geometry);
      if (!simplified) continue;
      for (const object of entry.objects) object.geometry = simplified;
      baseReport.simplifiedGeometries += 1;
      baseReport.simplifiedMeshUses += entry.objects.length;
    }
    committed = true;
    root.updateMatrixWorld?.(true);

    for (const original of replacements.keys()) {
      if (!externalGeometries.has(original)) disposeGeometry(original);
    }
    for (const geometry of scratchGeometries) {
      // Scratch copies no longer used after the transaction are cleaned below.
      if (![...replacements.values()].includes(geometry)) disposeGeometry(geometry);
    }

    baseReport.finalTriangles = countRootTriangles(root);
    baseReport.status = baseReport.finalTriangles <= KANO_MOBILE_MODEL_TRIANGLE_LIMIT
      ? 'simplified-within-budget'
      : 'simplified-but-still-over-budget';
    updateVisualAudit(root, source.totalTriangles, baseReport.finalTriangles, baseReport);
    return baseReport;
  } catch (error) {
    if (!committed) {
      for (const geometry of scratchGeometries) {
        if (![...source.entries.keys()].includes(geometry)) disposeGeometry(geometry);
      }
    }
    baseReport.status = 'simplification-failed-original-retained';
    baseReport.error = String(error?.message || error).slice(0, 240);
    console.warn('[Kano mobile geometry budget] Simplification failed; original GLB geometry retained.', key, error);
    updateVisualAudit(root, source.totalTriangles, source.totalTriangles, baseReport);
    return baseReport;
  }
}

function registerReport(key, report) {
  reports.set(String(key), report);
  if (typeof window !== 'undefined') {
    window.__KANO_MOBILE_GEOMETRY_BUDGET__ = {
      version: 1,
      latest: report,
      models: [...reports.values()].map((item) => ({ ...item })),
    };
  }
}

if (isMobileViewport() && !ModelManager.prototype[PATCH_KEY]) {
  const originalLoad = ModelManager.prototype.load;
  Object.defineProperty(ModelManager.prototype, PATCH_KEY, {
    value: true, enumerable: false, configurable: false, writable: false,
  });
  ModelManager.prototype.load = async function loadWithMobileGeometryBudget(key, ...args) {
    let jobs = managerJobs.get(this);
    if (!jobs) {
      jobs = new Map();
      managerJobs.set(this, jobs);
    }
    if (jobs.has(key)) return jobs.get(key);

    const job = (async () => {
      const model = await originalLoad.call(this, key, ...args);
      if (!model) return null;
      if (model.userData?.kanoMobileGeometryBudget?.version === 1) return model;

      const cacheContainsModel = this.cache?.get?.(key) === model;
      if (cacheContainsModel) this.cache.delete(key);
      try {
        const report = await enqueueSimplification(() => simplifyTemplate(this, key, model));
        model.userData.kanoMobileGeometryBudget = report;
        registerReport(key, report);
        return model;
      } catch (error) {
        const report = {
          version: 1, modelKey: String(key), modelPath: String(model.userData?.modelPath || ''),
          mobile: true, targetTriangles: KANO_MOBILE_MODEL_TRIANGLE_TARGET,
          hardLimitTriangles: KANO_MOBILE_MODEL_TRIANGLE_LIMIT,
          originalTriangles: countRootTriangles(model), finalTriangles: countRootTriangles(model),
          simplifiedGeometries: 0, simplifiedMeshUses: 0,
          status: 'simplification-failed-original-retained',
          error: String(error?.message || error).slice(0, 240),
        };
        model.userData.kanoMobileGeometryBudget = report;
        registerReport(key, report);
        return model;
      } finally {
        if (this.disposed) {
          // If the renderer was replaced during simplification, release resources
          // that are no longer reachable through the disposed ModelManager cache.
          const geometries = new Set();
          const materials = new Set();
          model.traverse?.((object) => {
            if (object.geometry) geometries.add(object.geometry);
            for (const item of Array.isArray(object.material) ? object.material : [object.material]) {
              if (item) materials.add(item);
            }
          });
          for (const geometry of geometries) disposeGeometry(geometry);
          for (const material of materials) { try { material.dispose?.(); } catch {} }
        } else if (cacheContainsModel && this.cache?.get?.(key) !== model) {
          this.cache.set(key, model);
        }
      }
    })();
    jobs.set(key, job);
    try {
      return await job;
    } finally {
      if (jobs.get(key) === job) jobs.delete(key);
    }
  };
}

if (typeof window !== 'undefined') {
  window[REPORT_KEY] = () => {
    const manager = window.__KANO_MODEL_MANAGER__ || window.__KANO_ACTIVE_MODEL_MANAGER__ || null;
    const loaded = [];
    for (const [key, model] of manager?.cache?.entries?.() || []) {
      const report = model?.userData?.kanoMobileGeometryBudget;
      if (report) loaded.push({ ...report, key });
      else loaded.push({
        modelKey: String(key), modelPath: String(model?.userData?.modelPath || ''),
        originalTriangles: countRootTriangles(model), finalTriangles: countRootTriangles(model),
        targetTriangles: KANO_MOBILE_MODEL_TRIANGLE_TARGET,
        hardLimitTriangles: KANO_MOBILE_MODEL_TRIANGLE_LIMIT, status: 'not-yet-audited',
      });
    }
    return {
      enabled: isMobileViewport(),
      targetTriangles: KANO_MOBILE_MODEL_TRIANGLE_TARGET,
      hardLimitTriangles: KANO_MOBILE_MODEL_TRIANGLE_LIMIT,
      cachedModels: loaded.length,
      withinLimit: loaded.filter((model) => Number(model.finalTriangles) <= KANO_MOBILE_MODEL_TRIANGLE_LIMIT).length,
      overLimit: loaded.filter((model) => Number(model.finalTriangles) > KANO_MOBILE_MODEL_TRIANGLE_LIMIT).length,
      models: loaded.sort((a, b) => Number(b.finalTriangles || 0) - Number(a.finalTriangles || 0)),
      recentReports: [...reports.values()].map((item) => ({ ...item })),
      limitations: [
        'Runtime-generated derived geometry; bundled GLB bytes are unchanged.',
        'Skinned, morph-target, multi-material-group, and explicitly protected meshes are left unchanged to avoid rig/material damage.',
        'Models with too much protected geometry can remain above 5,000 triangles; such cases are reported, not hidden or replaced.',
      ],
    };
  };
}

console.info('[Kano Life] Mobile GLB geometry-budget adapter registered; asset files remain unchanged.');
