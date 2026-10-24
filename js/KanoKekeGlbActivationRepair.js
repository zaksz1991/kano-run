/**
 * KANO LIFE — activate the known keke-3 GLB when only its mesh names fail the
 * renderer's structural-name heuristic.
 *
 * No model geometry is generated or replaced here. All failures other than a
 * narrow missing-name-evidence case stay rejected by Renderer3D's validator.
 * Loaded before main.js through KanoWorldPerformanceInstancingUpgrade.js.
 */
import { Renderer3D } from './renderer3d.js';
import { isPlausibleCataloguedKekeStructureGap, describeKekeFacing } from './KanoKekeGlbActivationRules.js';

const PATCH = Symbol.for('kano.life.kekeGlbActivationRepair.v1');
const ACCEPTED_REASON = 'catalogued-keke-glb-shape-verified';
const prototype = Renderer3D?.prototype;
const originalValidate = prototype?.validateKekeModelCandidate;

if (prototype && typeof originalValidate === 'function' && !prototype[PATCH]) {
  prototype.validateKekeModelCandidate = function validateCataloguedKekeGlb(object, ...args) {
    const result = originalValidate.call(this, object, ...args);
    const path = object?.userData?.modelPath || '';
    if (!isPlausibleCataloguedKekeStructureGap(path, result)) return result;

    const accepted = {
      ...result,
      ok: true,
      reason: ACCEPTED_REASON,
      acceptance: {
        type: 'known-catalogued-glb-with-plausible-vehicle-bounds',
        path,
        structuralNameGap: true,
        originalReason: result.reason,
      },
    };
    if (object?.userData) object.userData.kanoKekeVisualValidation = accepted;
    return accepted;
  };
  Object.defineProperty(prototype, PATCH, { value: true, configurable: false });
}

function activeRenderer() {
  if (typeof window === 'undefined') return null;
  return window.__KANO_WORLD_PERF_RENDERER__
    || window.__KANO_ACTIVE_RENDERER__
    || null;
}

if (typeof window !== 'undefined') {
  window.kanoKekeGlbActivationAudit = () => {
    const renderer = activeRenderer();
    const player = renderer?.player || null;
    const modelCache = renderer?.models?.cache;
    const cachedKeke = modelCache?.get?.('keke') || null;
    const assetReport = {
      attempted: false,
      status: 'unavailable',
      path: null,
      httpStatus: null,
      failureType: null,
      error: null,
    };
    try {
      const modelReport = window.__KANO_MODEL_ASSET_AUDIT__;
      const records = Array.isArray(modelReport?.assets) ? modelReport.assets : [];
      const item = records.find(record => record.key === 'keke' && record.path === 'vehicles/keke/keke-3.glb');
      if (item) Object.assign(assetReport, {
        attempted: true,
        status: item.status || 'unknown',
        path: item.path || null,
        httpStatus: item.httpStatus ?? null,
        failureType: item.failureType ?? null,
        error: item.error ?? null,
      });
    } catch { /* Diagnostics must never affect game startup. */ }

    let meshes = 0;
    let triangles = 0;
    let wheels = 0;
    try {
      player?.traverse?.(node => {
        if (!node?.isMesh || !node.geometry) return;
        meshes += 1;
        const indexCount = node.geometry.index?.count;
        const positionCount = node.geometry.attributes?.position?.count || 0;
        triangles += Math.floor((Number(indexCount) || positionCount) / 3);
        if (/wheel|tire|tyre/i.test(String(node.name || ''))) wheels += 1;
      });
    } catch { /* Keep the report available for damaged model trees. */ }

    const validation = player?.userData?.kanoKekeVisualValidation || null;
    const path = player?.userData?.modelPath || null;
    return {
      version: 1,
      installed: Boolean(prototype?.[PATCH]),
      rendererPresent: Boolean(renderer),
      playerPresent: Boolean(player),
      playerVisible: Boolean(player && player.visible !== false),
      playerUsesFallback: Boolean(player?.userData?.fallback || player?.userData?.kanoRuntimeRecoveredFallback),
      playerModelPath: path,
      cachedKekeModelPath: cachedKeke?.userData?.modelPath || null,
      cachedKekeAvailable: Boolean(cachedKeke),
      keke3Asset: assetReport,
      validation: validation ? { ...validation } : null,
      meshCount: meshes,
      estimatedTriangles: triangles,
      namedWheelMeshes: wheels,
      driverRigPresent: Boolean(
        player?.getObjectByName?.('KANO_SEATED_DRIVER_RIG')
        || player?.getObjectByName?.('KANO_KEKE_DRIVER_PIVOT'),
      ),
      facing: describeKekeFacing(),
      note: 'The audit reports actual runtime state. It does not claim that a phone/browser visual test has passed.',
    };
  };
}

console.info('[Kano Life] catalogued keke-3 visual-validation repair registered.');
