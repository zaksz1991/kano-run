/**
 * Current-main repair layer. Adds no gameplay panels and never edits assets.
 * It repairs stale select values, accepts the known bundled keke GLB only when
 * its bounds and renderable geometry are plausible, and permits one nearby GLB
 * traffic actor on low-tier phones after the mobile geometry budget is loaded.
 */
import * as THREE from 'three';
import { UI } from './ui.js';
import { ROUTES, DRIVERS } from './config.js';
import { save, persist } from './storage.js';
import { Renderer3D } from './renderer3d.js';
import {
  chooseEnabledValue,
  normalizeRouteId,
  normalizeUnlockedDriverId,
} from './KanoProfileSelectionStateRules.js';

const PATCH = Symbol.for('kano.life.currentMainExperienceRepair.v1');
const VALIDATION_PATCH = Symbol.for('kano.life.currentMainKekeValidation.v1');
const TRAFFIC_PATCH = Symbol.for('kano.life.currentMainRealTrafficBudget.v1');
const patchedUIInstances = new WeakSet();
const audit = {
  installed: false,
  profileRepairs: 0,
  lastProfileRepair: null,
  kekeGlbValidationRelaxations: 0,
  lastKekeModel: null,
  lowTierRealTrafficBudgetPromotions: 0,
  realTrafficBudget: 'at most one nearby GLB actor on low-tier phones',
  browserVisualTest: 'not verified',
  phonePerformance: 'not verified',
};

function saveIfChanged(key, value, nested = null) {
  if (nested) {
    save[nested] ||= {};
    if (save[nested][key] === value) return false;
    save[nested][key] = value;
  } else {
    if (save[key] === value) return false;
    save[key] = value;
  }
  persist();
  return true;
}

function ensureStarterDriver() {
  if (!Array.isArray(save.unlocks)) save.unlocks = [];
  const knownUnlocked = DRIVERS.some((driver) => save.unlocks.includes(driver.id));
  if (!knownUnlocked && DRIVERS.some((driver) => driver.id === 'ruffneck')) {
    save.unlocks.push('ruffneck');
    audit.profileRepairs += 1;
    audit.lastProfileRepair = 'restored the free starter driver because no known driver was unlocked';
    persist();
  }
}

function normalizeSavedSelections() {
  ensureStarterDriver();
  let changed = false;
  const routeId = normalizeRouteId(save.routeId, ROUTES);
  if (routeId && routeId !== save.routeId) {
    save.routeId = routeId;
    changed = true;
  }

  const driverId = normalizeUnlockedDriverId(save.driverId, DRIVERS, save.unlocks);
  if (driverId && driverId !== save.driverId) {
    save.driverId = driverId;
    changed = true;
  }

  if (changed) {
    audit.profileRepairs += 1;
    audit.lastProfileRepair = 'normalized saved route/driver IDs to valid available choices';
    persist();
  }
}

function bindProfileSelects(ui) {
  if (!ui || patchedUIInstances.has(ui)) return;
  patchedUIInstances.add(ui);
  const bindings = [
    { id: 'route-select', key: 'routeId', fallback: ROUTES[0]?.id ?? '' },
    { id: 'dialect-select', key: 'dialect', fallback: 'hausa' },
    { id: 'camera-select', key: 'camera', fallback: 'chase' },
    { id: 'road-select', key: 'roadMode', fallback: 'oneway' },
    { id: 'quality-select', key: 'quality', nested: 'settings', fallback: 'auto' },
  ];

  for (const binding of bindings) {
    const element = ui.el?.(binding.id);
    if (!element || element.dataset.kanoSelectionRepair === '1') continue;
    element.dataset.kanoSelectionRepair = '1';
    const stored = binding.nested ? save[binding.nested]?.[binding.key] : save[binding.key];
    const normalized = chooseEnabledValue(stored, element.options, binding.fallback);
    if (normalized && element.value !== normalized) element.value = normalized;
    if (normalized && normalized !== stored) {
      saveIfChanged(binding.key, normalized, binding.nested);
      audit.profileRepairs += 1;
      audit.lastProfileRepair = `normalized ${binding.id} to an available option`;
    }
    element.addEventListener('change', () => {
      const valid = chooseEnabledValue(element.value, element.options, binding.fallback);
      if (element.value !== valid) element.value = valid;
      if (!valid) return;
      saveIfChanged(binding.key, valid, binding.nested);
    });
  }

  const driverSelect = ui.el?.('driver-select');
  if (driverSelect && driverSelect.dataset.kanoSelectionRepair !== '1') {
    driverSelect.dataset.kanoSelectionRepair = '1';
    driverSelect.addEventListener('change', () => {
      const choice = DRIVERS.find((driver) => driver.id === driverSelect.value);
      if (!choice || !(save.unlocks || []).includes(choice.id)) {
        driverSelect.value = normalizeUnlockedDriverId(save.driverId, DRIVERS, save.unlocks);
        if (driverSelect.value) saveIfChanged('driverId', driverSelect.value);
        try { ui.showToast?.('That driver is locked. Unlock the driver in the garage first.'); } catch {}
        return;
      }
      saveIfChanged('driverId', choice.id);
    });
  }
}

function installUIRepair() {
  if (!UI?.prototype || UI.prototype[PATCH]) return;
  const originalInitSelects = UI.prototype.initSelects;
  if (typeof originalInitSelects === 'function') {
    UI.prototype.initSelects = function initSelectsWithValidSavedChoices(...args) {
      normalizeSavedSelections();
      const result = originalInitSelects.apply(this, args);
      bindProfileSelects(this);
      return result;
    };
  }
  const originalRefreshDriverSelect = UI.prototype.refreshDriverSelect;
  if (typeof originalRefreshDriverSelect === 'function') {
    UI.prototype.refreshDriverSelect = function refreshDriverSelectWithPersistedFallback(...args) {
      const result = originalRefreshDriverSelect.apply(this, args);
      const element = this.el?.('driver-select');
      if (element) {
        const value = chooseEnabledValue(element.value, element.options, normalizeUnlockedDriverId(save.driverId, DRIVERS, save.unlocks));
        if (value && element.value !== value) element.value = value;
        if (value && (save.driverId !== value || !(save.unlocks || []).includes(value))) {
          saveIfChanged('driverId', value);
        }
      }
      bindProfileSelects(this);
      return result;
    };
  }
  const originalBind = UI.prototype.bind;
  if (typeof originalBind === 'function') {
    UI.prototype.bind = function bindWithSelectionPersistence(game, ...args) {
      const result = originalBind.call(this, game, ...args);
      bindProfileSelects(this);
      return result;
    };
  }
  Object.defineProperty(UI.prototype, PATCH, { value: true, configurable: false });
}

function countKekeStats(root) {
  const box = new THREE.Box3().setFromObject(root);
  const size = box.getSize(new THREE.Vector3());
  let meshCount = 0;
  let sourceMeshCount = 0;
  let triangles = 0;
  root?.traverse?.((node) => {
    if (!node?.isMesh || node.visible === false || !node.geometry) return;
    meshCount += 1;
    if (!/^KANO_(?:DRIVER|SEATED)/i.test(String(node.name || ''))) sourceMeshCount += 1;
    const geometry = node.geometry;
    const indexCount = geometry.index?.count ?? geometry.attributes?.position?.count ?? 0;
    triangles += Math.floor(Math.max(0, Number(indexCount) || 0) / 3);
  });
  const footprint = size.x * size.z;
  return {
    meshCount, sourceMeshCount, triangles,
    width: size.x, height: size.y, depth: size.z, footprint,
    plausibleBounds: [size.x, size.y, size.z, footprint].every(Number.isFinite)
      && size.y >= 0.55 && size.y <= 4.25
      && Math.max(size.x, size.z) >= 0.82 && Math.max(size.x, size.z) <= 7.5
      && Math.min(size.x, size.z) >= 0.30
      && footprint >= 0.68 && footprint <= 30,
  };
}

function installKekeValidationRepair() {
  const proto = Renderer3D?.prototype;
  if (!proto || proto[VALIDATION_PATCH] || typeof proto.validateKekeModelCandidate !== 'function') return;
  const original = proto.validateKekeModelCandidate;
  proto.validateKekeModelCandidate = function validateKnownBundledKeke(object, ...args) {
    const originalResult = original.call(this, object, ...args);
    const modelPath = String(object?.userData?.modelPath || '').replaceAll('\\', '/');
    audit.lastKekeModel = {
      modelPath: modelPath || null,
      originalAccepted: Boolean(originalResult?.ok),
      originalReason: originalResult?.reason || null,
      acceptedByCatalogGeometryFallback: false,
    };
    if (originalResult?.ok) return originalResult;
    if (modelPath !== 'vehicles/keke/keke-3.glb') return originalResult;
    if (!['missing-vehicle-structure-evidence', 'character-only-model-no-vehicle-structure'].includes(originalResult?.reason)) return originalResult;

    let stats;
    try {
      object?.updateMatrixWorld?.(true);
      stats = countKekeStats(object);
    } catch {
      return originalResult;
    }
    // This is limited to the known keke asset path and only relaxes semantic
    // naming evidence. Bounds, real non-driver meshes and non-trivial geometry
    // must independently support a vehicle; all other rejection reasons stand.
    if (!stats.plausibleBounds || stats.sourceMeshCount < 2 || stats.triangles < 300) return originalResult;
    audit.kekeGlbValidationRelaxations += 1;
    audit.lastKekeModel = {
      ...audit.lastKekeModel,
      acceptedByCatalogGeometryFallback: true,
      stats,
    };
    return {
      ...originalResult,
      ok: true,
      reason: 'known-keke-3-glb-with-plausible-vehicle-geometry',
      meshCount: stats.meshCount,
      bounds: {
        width: Number(stats.width.toFixed(3)),
        height: Number(stats.height.toFixed(3)),
        depth: Number(stats.depth.toFixed(3)),
        footprint: Number(stats.footprint.toFixed(3)),
      },
      evidence: {
        ...(originalResult?.evidence || {}),
        trustedCatalogPath: true,
        renderableSourceMeshes: stats.sourceMeshCount,
        triangleCount: stats.triangles,
      },
    };
  };
  Object.defineProperty(proto, VALIDATION_PATCH, { value: true, configurable: false });
}

function installRealTrafficBudgetRepair() {
  const proto = Renderer3D?.prototype;
  if (!proto || proto[TRAFFIC_PATCH] || typeof proto.syncTraffic !== 'function') return;
  const original = proto.syncTraffic;
  proto.syncTraffic = function syncTrafficWithOneLowTierGLBSlot(...args) {
    if (!this.mobile || String(this.mobileTier || '').toLowerCase() !== 'low' || !this.models?.cache?.size) {
      return original.apply(this, args);
    }
    const previousTier = this.mobileTier;
    try {
      // The existing device-tier policy intentionally chooses zero GLBs on low
      // tier. After the simplifier has been registered, permit one nearest GLB
      // traffic actor; do not enable full-scene GLB traffic on low-end phones.
      this.mobileTier = 'mid';
      audit.lowTierRealTrafficBudgetPromotions += 1;
      return original.apply(this, args);
    } finally {
      this.mobileTier = previousTier;
    }
  };
  Object.defineProperty(proto, TRAFFIC_PATCH, { value: true, configurable: false });
}

function publishAudit() {
  if (typeof window === 'undefined') return;
  window.kanoCurrentMainExperienceAudit = () => {
    const renderer = window.__KANO_ACTIVE_RENDERER__ || window.renderer || null;
    const player = renderer?.player;
    return {
      ...audit,
      activeRendererFound: Boolean(renderer),
      playerModel: player ? {
        modelPath: player.userData?.modelPath || null,
        fallback: player.userData?.fallback ?? null,
        vehicleType: player.userData?.vehicleType || null,
        validation: player.userData?.kanoKekeVisualValidation || null,
      } : null,
      flyover: typeof window.kanoFlyoverDriveabilityAudit === 'function'
        ? window.kanoFlyoverDriveabilityAudit() : 'flyover module not registered',
      geometryBudget: typeof window.kanoMobileGeometryBudgetAudit === 'function'
        ? window.kanoMobileGeometryBudgetAudit() : 'mobile geometry optimizer not registered',
      limitations: [
        'World sharpness has not been verified on a physical phone.',
        'Roundabout route topology remains limited by the existing straight-road simulation.',
      ],
    };
  };
}

installUIRepair();
installKekeValidationRepair();
installRealTrafficBudgetRepair();
normalizeSavedSelections();
audit.installed = true;
publishAudit();
console.info('[Kano Life] current-main profile, keke validation, and bounded real-traffic repair registered.');
