/**
 * KANO LIFE — WORKSHOP PLAN BACKUP/RESTORE + SAVINGS GOAL + SERVICE HISTORY
 *
 * Production-safe additive repair layer. Core simulation/storage remains in
 * Game, UI and Renderer3D. This module is loaded by index.html and imports
 * main.js only after its compatibility hooks are registered.
 */
import * as THREE from 'three';
import { Renderer3D } from './renderer3d.js';
import { ModelManager, MODEL_KEYS, getModelAssetAuditReport } from './ModelManager.js';
import { createGLTFLoader } from './createGLTFLoader.js';
import { Game } from './game.js';
import { UI } from './ui.js';
import { AudioManager } from './audio.js';
import { ROUTES, DRIVERS } from './config.js';
import { save, persist } from './storage.js';
import { KanoVehicleLifecycleDirector } from './KanoVehicleLifecycleDirector.js';

const RECORD_NAME_KEY = 'kano-life-global-display-name-v1';
const SCORE_ENDPOINT = '/api/leaderboard?board=all&limit=1';
const clamp = (value, min, max) => Math.max(min, Math.min(max, Number(value) || 0));
const random = (min, max) => min + Math.random() * (max - min);

let activeGame = null;
let activeUI = null;
let activeRenderer = null;
let lastRecord = { name: 'Kano Driver', score: 0, source: 'local' };
let recordRequestAt = 0;
let recordRequestInFlight = false;
let recordRefreshTimer = null;
const riderGroups = new Set();
const potholeActors = new Set();
const rendererPresentationConfigured = new WeakSet();

// ============================================================
// EXISTING GLB MODEL POOL ACTIVATION
// The catalogue already contains many GLBs, but ModelManager.load(key)
// historically stopped after the first valid candidate and cached only that
// single template. Repeated world slots therefore received the same building
// or light model. This compatibility layer cycles through a small pool of the
// existing assets without changing Renderer3D or game simulation behavior.
// ============================================================
const EXISTING_GLB_POOL_PATCH = Symbol.for('kano.life.existingGlbModelPool.v1');
const existingGlbPoolState = {
  loadedByManager: new WeakMap(),
  reportVersion: 1,
};

const modelPoolMobile = (() => {
  try {
    return (navigator.maxTouchPoints || 0) > 0
      || window.matchMedia?.('(max-width: 760px), (pointer: coarse)').matches;
  } catch (_) {
    return false;
  }
})();

const EXISTING_GLB_POOL_LIMITS = {
  // World architecture: the biggest visual payoff. Keep the mobile pool small.
  building: { mobile: 4, desktop: 8 },
  industrialBuilding: { mobile: 3, desktop: 5 },
  flyover: { mobile: 2, desktop: 2 },
  roadlight: { mobile: 2, desktop: 4 },
  trafficLight: { mobile: 2, desktop: 2 },
  stopSign: { mobile: 2, desktop: 2 },
  cone: { mobile: 2, desktop: 3 },
  // Existing traffic models: keep visual variety without loading every candidate.
  keke: { mobile: 3, desktop: 5 },
  car: { mobile: 2, desktop: 3 },
  taxi: { mobile: 2, desktop: 3 },
  suv: { mobile: 2, desktop: 3 },
  truck: { mobile: 1, desktop: 2 },
  bus: { mobile: 1, desktop: 2 },
  motorcycle: { mobile: 3, desktop: 4 },
  // Existing pedestrian/passenger models.
  passenger: { mobile: 2, desktop: 3 },
  passengerWoman: { mobile: 2, desktop: 3 },
  passengerMan: { mobile: 2, desktop: 3 },
  passengerVIP: { mobile: 1, desktop: 2 },
  security: { mobile: 1, desktop: 2 },
  pedestrian: { mobile: 2, desktop: 3 },
  pedestrianWoman: { mobile: 2, desktop: 3 },
};

function disposeUncachedGlbTemplate(root) {
  if (!root?.traverse) return;
  const geometries = new Set();
  const materials = new Set();
  const textures = new Set();
  root.traverse((object) => {
    if (object.geometry && !geometries.has(object.geometry)) {
      geometries.add(object.geometry);
      object.geometry.dispose?.();
    }
    const list = Array.isArray(object.material)
      ? object.material
      : object.material ? [object.material] : [];
    for (const material of list) {
      if (!material || materials.has(material)) continue;
      materials.add(material);
      for (const value of Object.values(material)) {
        if (value?.isTexture && !textures.has(value)) {
          textures.add(value);
          value.dispose?.();
        }
      }
      material.dispose?.();
    }
  });
}

function activeExistingGlbPools(manager) {
  return manager?.__kanoExistingGlbPools instanceof Map
    ? manager.__kanoExistingGlbPools : new Map();
}

function installExistingGlbPoolCompatibility() {
  if (ModelManager.prototype[EXISTING_GLB_POOL_PATCH]) return;

  const originalLoad = ModelManager.prototype.load;
  const originalGetInstance = ModelManager.prototype.getInstance;
  const originalDispose = ModelManager.prototype.dispose;

  Object.defineProperty(ModelManager.prototype, EXISTING_GLB_POOL_PATCH, {
    value: true,
    configurable: false,
  });

  ModelManager.prototype.load = function loadWithExistingGlbPool(key) {
    if (typeof window !== 'undefined') window.__KANO_ACTIVE_MODEL_MANAGER__ = this;
    const configured = MODEL_KEYS[key];
    const counts = EXISTING_GLB_POOL_LIMITS[key];
    const desiredCount = counts
      ? (modelPoolMobile ? counts.mobile : counts.desktop)
      : 1;

    if (!Array.isArray(configured) || configured.length <= 1 || desiredCount <= 1) {
      return originalLoad.call(this, key);
    }

    if (!this.__kanoExistingGlbPools) this.__kanoExistingGlbPools = new Map();
    if (!this.__kanoExistingGlbNextIndex) this.__kanoExistingGlbNextIndex = new Map();
    if (!this.__kanoExistingGlbPoolTasks) this.__kanoExistingGlbPoolTasks = new Map();

    if (this.__kanoExistingGlbPools.has(key)) {
      return Promise.resolve(this.cache.get(key) || this.__kanoExistingGlbPools.get(key)[0] || null);
    }
    if (this.__kanoExistingGlbPoolTasks.has(key)) {
      return this.__kanoExistingGlbPoolTasks.get(key);
    }
    if (this.cache.has(key)) {
      // A standard load already ran before the pool hook. Preserve it safely;
      // the next page load will activate the pool from the beginning.
      return Promise.resolve(this.cache.get(key));
    }

    const task = (async () => {
      const candidates = [...configured];
      const loadedTemplates = [];
      const attemptedPaths = [];

      for (const relativePath of candidates) {
        if (loadedTemplates.length >= desiredCount) break;
        attemptedPaths.push(relativePath);
        const temporaryManager = new ModelManager({ basePath: this.basePath });
        const currentCatalogEntry = MODEL_KEYS[key];
        let template = null;

        try {
          // Give the original, already-tested loader exactly one candidate at
          // a time. A failed candidate can never hide later candidates.
          MODEL_KEYS[key] = [relativePath];
          const loaded = await originalLoad.call(temporaryManager, key);
          template = loaded || temporaryManager.cache.get(key) || null;
          if (this.disposed) {
            if (template) disposeUncachedGlbTemplate(template);
            temporaryManager.cache.clear();
            temporaryManager.disposed = true;
            for (const alreadyLoaded of loadedTemplates) {
              disposeUncachedGlbTemplate(alreadyLoaded);
            }
            loadedTemplates.length = 0;
            return null;
          }
          if (template) {
            // Transfer ownership to the pool; do not dispose shared GLB data.
            temporaryManager.cache.clear();
            temporaryManager.disposed = true;
            loadedTemplates.push(template);
          } else {
            temporaryManager.dispose();
          }
        } catch (error) {
          try { temporaryManager.dispose(); } catch (_) { /* best effort */ }
          console.debug('[Kano existing GLB pool] Candidate skipped:', key, relativePath, error?.message || error);
        } finally {
          MODEL_KEYS[key] = currentCatalogEntry;
        }
      }

      if (!loadedTemplates.length) {
        this.failed?.add?.(key);
        console.warn('[Kano existing GLB pool] No valid existing candidate loaded for', key, attemptedPaths);
        return null;
      }

      this.__kanoExistingGlbPools.set(key, loadedTemplates);
      this.__kanoExistingGlbNextIndex.set(key, 0);
      this.cache.set(key, loadedTemplates[0]);
      this.failed?.delete?.(key);
      existingGlbPoolState.loadedByManager.set(this, true);

      if (typeof window !== 'undefined') window.__KANO_ACTIVE_MODEL_MANAGER__ = this;
      console.info(
        `[Kano existing GLB pool] ${key}: ${loadedTemplates.length}/${desiredCount} existing models active`,
        loadedTemplates.map((model) => model?.userData?.modelPath || '(path unavailable)'),
      );
      return loadedTemplates[0];
    })();

    this.__kanoExistingGlbPoolTasks.set(key, task);
    this.pending?.set?.(key, task);
    const settled = task.finally(() => {
      this.__kanoExistingGlbPoolTasks?.delete(key);
      this.pending?.delete?.(key);
    });
    // Keep the exact settled promise to prevent duplicate downloads during preload.
    this.__kanoExistingGlbPoolTasks.set(key, settled);
    return settled;
  };

  ModelManager.prototype.getInstance = function getVariedExistingGlbInstance(key) {
    const pool = this.__kanoExistingGlbPools?.get(key);
    if (!pool || pool.length <= 1) return originalGetInstance.call(this, key);

    const index = this.__kanoExistingGlbNextIndex.get(key) || 0;
    const template = pool[index % pool.length];
    this.__kanoExistingGlbNextIndex.set(key, (index + 1) % pool.length);

    // Reuse the original cloning/material-isolation/driver-rig implementation.
    // The cache substitution is synchronous and restored before this returns.
    const firstTemplate = this.cache.get(key);
    this.cache.set(key, template);
    try {
      const instance = originalGetInstance.call(this, key);
      if (instance) {
        instance.userData.kanoExistingGlbPoolIndex = index % pool.length;
        instance.userData.kanoExistingGlbPoolSize = pool.length;
      }
      return instance;
    } finally {
      if (firstTemplate) this.cache.set(key, firstTemplate);
      else this.cache.delete(key);
    }
  };

  ModelManager.prototype.dispose = function disposeExistingGlbPools() {
    if (this.disposed) return;
    const pools = activeExistingGlbPools(this);
    const baseTemplates = new Set(this.cache?.values?.() || []);
    // The original method disposes cached base models. Dispose only pool
    // variants not already in that cache to avoid double-freeing first entries.
    originalDispose.call(this);
    for (const [key, pool] of pools) {
      for (const template of pool) {
        if (!baseTemplates.has(template)) disposeUncachedGlbTemplate(template);
      }
      pool.length = 0;
      pools.delete(key);
    }
    this.__kanoExistingGlbNextIndex?.clear?.();
    this.__kanoExistingGlbPoolTasks?.clear?.();
  };
}

installExistingGlbPoolCompatibility();

if (typeof window !== 'undefined') {
  window.kanoExistingGlbModelPoolReport = () => {
    const manager = window.__KANO_ACTIVE_MODEL_MANAGER__;
    const pools = activeExistingGlbPools(manager);
    const models = {};
    for (const [key, items] of pools.entries()) {
      models[key] = items.map((item) => ({
        path: item?.userData?.modelPath || '(path unavailable)',
        targetHeight: item?.userData?.targetHeight ?? null,
      }));
    }
    return {
      version: existingGlbPoolState.reportVersion,
      deviceClass: modelPoolMobile ? 'mobile' : 'desktop',
      pooledCategories: Object.keys(models).length,
      totalLoadedVariants: Object.values(models).reduce((sum, items) => sum + items.length, 0),
      models,
      assetAudit: getModelAssetAuditReport(),
    };
  };
}


// ============================================================
// EXISTING ENVIRONMENT GLB ACTIVATION
// Reuses environment GLBs already listed by ModelManager. These are the
// real assets currently present in the catalogue; no replacement models
// or external asset URLs are introduced.
// ============================================================
const KANO_EXISTING_ENVIRONMENT_PATCH = Symbol.for('kano.life.existingEnvironmentGlb.v1');
const kanoEnvironmentStates = new WeakMap();
const kanoEnvironmentRenderers = new Set();

const KANO_EXISTING_ENVIRONMENT_ASSETS = [
  {
    id: 'potholeSurface',
    path: 'environment/ground/photoscan_-_pothole_1.glb',
    role: 'pothole-surface',
    targetSpan: 2.0,
    placements: [],
    mobilePlacements: [],
  },
  {
    id: 'dirtGround',
    path: 'environment/ground/low_poly_dirt_ground.glb',
    role: 'shoulder-dirt',
    targetSpan: 8.2,
    placements: [
      { x: -7.25, z: -27 }, { x: 7.35, z: -91 }, { x: -7.65, z: -156 },
    ],
    mobilePlacements: [
      { x: -7.25, z: -27 }, { x: 7.35, z: -112 },
    ],
  },
  {
    id: 'sandTracks',
    path: 'environment/ground/close_sand_with_tracks.glb',
    role: 'tracked-sand-shoulder',
    targetSpan: 7.3,
    placements: [
      { x: 7.1, z: -48 }, { x: -7.4, z: -119 }, { x: 7.45, z: -196 },
    ],
    mobilePlacements: [
      { x: 7.1, z: -48 }, { x: -7.4, z: -157 },
    ],
  },
  {
    id: 'sandHandprints',
    path: 'environment/ground/sand_with_handprints_tile_texture.glb',
    role: 'sandy-shoulder-detail',
    targetSpan: 5.7,
    placements: [
      { x: -7.0, z: -72 }, { x: 7.35, z: -163 },
    ],
    mobilePlacements: [
      { x: -7.0, z: -78 },
    ],
  },
  {
    id: 'brokenAsphalt',
    path: 'environment/ground/manhole_cover_on_broken_asphalt_road.glb',
    role: 'road-surface-detail',
    targetSpan: 2.75,
    placements: [
      { x: -4.65, z: -57 }, { x: 4.55, z: -128 }, { x: -4.75, z: -205 },
    ],
    mobilePlacements: [
      { x: -4.65, z: -57 }, { x: 4.55, z: -151 },
    ],
  },
];

function kanoDisposeEnvironmentTree(root) {
  const geometries = new Set();
  const materials = new Set();
  const textures = new Set();
  root?.traverse?.((node) => {
    if (node.geometry && !geometries.has(node.geometry)) {
      geometries.add(node.geometry);
      node.geometry.dispose?.();
    }
    const materialList = Array.isArray(node.material)
      ? node.material
      : node.material ? [node.material] : [];
    for (const material of materialList) {
      if (!material || materials.has(material)) continue;
      materials.add(material);
      for (const value of Object.values(material)) {
        if (value?.isTexture && !textures.has(value)) {
          textures.add(value);
          value.dispose?.();
        }
      }
      material.dispose?.();
    }
  });
}

function kanoGetEnvironmentState(renderer) {
  let state = kanoEnvironmentStates.get(renderer);
  if (!state) {
    state = {
      disposed: false,
      loading: new Set(),
      assets: new Map(),
      details: [],
      started: false,
      errors: [],
    };
    kanoEnvironmentStates.set(renderer, state);
    kanoEnvironmentRenderers.add(renderer);
  }
  return state;
}

function kanoEnvironmentAssetUrl(renderer, relativePath) {
  const base = renderer?.models?.basePath || '/assets/models/';
  const normalizedBase = base.endsWith('/') ? base : `${base}/`;
  const encodedPath = relativePath.split('/').map((part) => encodeURIComponent(part)).join('/');
  return `${normalizedBase}${encodedPath}`;
}

function kanoBuildEnvironmentInstances(renderer, state, spec, template) {
  if (!renderer.world || state.disposed || spec.id === 'potholeSurface') return;
  const isMobile = Boolean(renderer.mobile);
  const placements = isMobile ? spec.mobilePlacements : spec.placements;
  if (!placements?.length) return;

  template.updateMatrixWorld?.(true);
  const sourceBounds = new THREE.Box3().setFromObject(template);
  const sourceSize = sourceBounds.getSize(new THREE.Vector3());
  const horizontalSpan = Math.max(sourceSize.x, sourceSize.z);
  const dimensions = {
    x: Number(sourceSize.x.toFixed(4)),
    y: Number(sourceSize.y.toFixed(4)),
    z: Number(sourceSize.z.toFixed(4)),
  };
  const report = state.assets.get(spec.id);
  if (!Number.isFinite(horizontalSpan) || horizontalSpan < 0.01
      || sourceSize.x < 0.01 || sourceSize.z < 0.01
      || sourceSize.y > horizontalSpan * 1.1) {
    if (report) {
      report.status = 'rejected-shape';
      report.dimensions = dimensions;
      report.reason = 'Model bounds do not look like a low-profile ground/road detail.';
    }
    console.warn('[Kano environment GLB] skipped unsuitable ground asset:', spec.path, dimensions);
    return;
  }

  const scale = THREE.MathUtils.clamp(spec.targetSpan / horizontalSpan, 0.004, 80);
  const center = sourceBounds.getCenter(new THREE.Vector3());
  for (let index = 0; index < placements.length; index += 1) {
    const placement = placements[index];
    const instance = template.clone(true);
    instance.scale.multiplyScalar(scale);
    const isRoadSurface = spec.role === 'road-surface-detail';
    const surfaceY = isRoadSurface ? 0.024 : -0.065;
    instance.position.set(
      placement.x - center.x * scale,
      surfaceY - sourceBounds.min.y * scale,
      placement.z - center.z * scale,
    );
    instance.userData.kanoExistingEnvironmentGlb = true;
    instance.userData.kanoEnvironmentAsset = spec.path;
    instance.userData.kanoEnvironmentRole = spec.role;
    instance.userData.kanoEnvironmentInitialZ = placement.z;
    renderer.world.add(instance);
    state.details.push({
      object: instance,
      assetId: spec.id,
      role: spec.role,
      z: instance.position.z,
      disposed: false,
    });
  }
  if (report) {
    report.status = 'loaded-and-placed';
    report.dimensions = dimensions;
    report.placements = state.details.filter((item) => item.assetId === spec.id).length;
    report.scale = Number(scale.toFixed(5));
  }
}

function kanoLoadEnvironmentAsset(renderer, state, spec) {
  if (state.loading.has(spec.id) || state.assets.has(spec.id) || state.disposed) return;
  state.loading.add(spec.id);
  state.assets.set(spec.id, {
    id: spec.id,
    path: spec.path,
    role: spec.role,
    url: kanoEnvironmentAssetUrl(renderer, spec.path),
    status: 'loading',
    placements: 0,
    dimensions: null,
    error: null,
  });
  const report = state.assets.get(spec.id);
  const loader = createGLTFLoader();
  loader.load(
    report.url,
    (gltf) => {
      state.loading.delete(spec.id);
      const template = gltf?.scene;
      if (!template) {
        report.status = 'failed';
        report.error = 'GLTF loaded without a scene root.';
        return;
      }
      if (state.disposed || renderer.disposed) {
        kanoDisposeEnvironmentTree(template);
        report.status = 'discarded-after-dispose';
        return;
      }
      template.userData.kanoEnvironmentTemplate = true;
      template.userData.kanoEnvironmentAsset = spec.path;
      report.meshCount = 0;
      template.traverse((node) => { if (node.isMesh) report.meshCount += 1; });
      state.assets.set(spec.id, { ...report, template });
      const savedReport = state.assets.get(spec.id);
      if (spec.id === 'potholeSurface') {
        savedReport.status = 'loaded-ready-for-pothole-zones';
        const lastState = renderer.__kanoLastDrawState;
        if (lastState) kanoApplyPotholeEnvironmentModel(renderer, state, lastState);
      } else {
        kanoBuildEnvironmentInstances(renderer, state, spec, template);
      }
      console.info(`[Kano environment GLB] ${spec.path}: ${savedReport.status}`, {
        meshCount: savedReport.meshCount,
        placements: savedReport.placements || 0,
      });
    },
    undefined,
    (error) => {
      state.loading.delete(spec.id);
      report.status = 'failed';
      report.error = error?.message || String(error || 'GLB request failed');
      state.errors.push({ path: spec.path, error: report.error });
      console.warn('[Kano environment GLB] Existing asset unavailable; preserving current fallback:', spec.path, report.error);
    },
  );
}

function kanoApplyPotholeEnvironmentModel(renderer, state, drawState) {
  const entry = state.assets.get('potholeSurface');
  const template = entry?.template;
  if (!template || state.disposed || !renderer.zoneActors) return;
  const zoneList = Array.isArray(drawState?.zones) ? drawState.zones : [];
  for (const zone of zoneList) {
    if (zone?.type !== 'pothole') continue;
    const actor = renderer.zoneActors.get(zone.id);
    if (!actor || actor.userData.kanoPotholeGlbAdded) continue;
    template.updateMatrixWorld?.(true);
    const bounds = new THREE.Box3().setFromObject(template);
    const size = bounds.getSize(new THREE.Vector3());
    const span = Math.max(size.x, size.z);
    if (!Number.isFinite(span) || span < 0.01) continue;
    const targetSpan = zone.hub ? 2.35 : 1.85;
    const scale = THREE.MathUtils.clamp(targetSpan / span, 0.004, 80);
    const center = bounds.getCenter(new THREE.Vector3());
    const surface = template.clone(true);
    surface.scale.multiplyScalar(scale);
    surface.position.set(
      -center.x * scale,
      0.028 - bounds.min.y * scale,
      -center.z * scale,
    );
    surface.userData.kanoPotholeGlb = true;
    surface.userData.kanoEnvironmentAsset = entry.path;

    // Preserve the red hazard ring; use the actual GLB surface in place of
    // the primitive broken-road/crater meshes only after the GLB loads.
    for (const child of actor.children) {
      if (child !== actor.userData.potholeWarning) child.visible = false;
    }
    actor.add(surface);
    actor.userData.kanoPotholeGlbAdded = true;
    entry.potholeInstances = (entry.potholeInstances || 0) + 1;
  }
}

function kanoStartExistingEnvironmentAssets(renderer) {
  if (!renderer || renderer.disposed || renderer.lifeScene !== 'road' || !renderer.world) return;
  const state = kanoGetEnvironmentState(renderer);
  if (state.started) return;
  state.started = true;
  for (const spec of KANO_EXISTING_ENVIRONMENT_ASSETS) {
    kanoLoadEnvironmentAsset(renderer, state, spec);
  }
}

function kanoTickExistingEnvironmentAssets(renderer, deltaSeconds, drawState) {
  const state = kanoEnvironmentStates.get(renderer);
  if (!state || state.disposed || renderer.lifeScene !== 'road') return;
  renderer.__kanoLastDrawState = drawState;
  kanoApplyPotholeEnvironmentModel(renderer, state, drawState);
  const dt = THREE.MathUtils.clamp(Number(deltaSeconds) || 0, 0, 0.05);
  const speed = Number.isFinite(drawState?.signedSpeed)
    ? drawState.signedSpeed
    : drawState?.reverse
      ? -Math.abs(Number(drawState?.speed) || 0)
      : Math.abs(Number(drawState?.speed) || 0);
  const scroll = speed * dt * 0.28 * 0.88;
  if (!scroll) return;
  for (const detail of state.details) {
    if (!detail.object || detail.disposed) continue;
    detail.object.position.z += scroll;
    if (detail.object.position.z > 10) detail.object.position.z -= 250;
    else if (detail.object.position.z < -250) detail.object.position.z += 250;
  }
}

function kanoDisposeExistingEnvironmentAssets(renderer) {
  const state = kanoEnvironmentStates.get(renderer);
  if (!state || state.disposed) return;
  state.disposed = true;
  for (const detail of state.details) {
    if (detail.object?.parent) detail.object.parent.remove(detail.object);
    detail.disposed = true;
  }
  state.details.length = 0;
  // Remove pothole instances before disposing their shared template resources.
  for (const actor of renderer.zoneActors?.values?.() || []) {
    for (const child of [...(actor.children || [])]) {
      if (child?.userData?.kanoPotholeGlb) actor.remove(child);
    }
  }
  const disposedTemplates = new Set();
  for (const entry of state.assets.values()) {
    if (entry.template && !disposedTemplates.has(entry.template)) {
      disposedTemplates.add(entry.template);
      kanoDisposeEnvironmentTree(entry.template);
    }
    delete entry.template;
  }
  state.assets.clear();
  state.loading.clear();
  kanoEnvironmentRenderers.delete(renderer);
}

function installKanoExistingEnvironmentGlbs() {
  if (Renderer3D.prototype[KANO_EXISTING_ENVIRONMENT_PATCH]) return;
  const originalDraw = Renderer3D.prototype.draw;
  const originalSyncZones = Renderer3D.prototype.syncZones;
  const originalDispose = Renderer3D.prototype.dispose;
  Object.defineProperty(Renderer3D.prototype, KANO_EXISTING_ENVIRONMENT_PATCH, { value: true });

  Renderer3D.prototype.draw = function drawWithExistingEnvironmentGlbs(state, deltaSeconds) {
    if (this.lifeScene === 'road' && this.ready && !this.disposed) {
      kanoStartExistingEnvironmentAssets(this);
      this.__kanoLastDrawState = state;
    }
    const result = originalDraw.call(this, state, deltaSeconds);
    if (this.lifeScene === 'road' && this.ready && !this.disposed) {
      kanoTickExistingEnvironmentAssets(this, deltaSeconds, state);
    }
    return result;
  };

  Renderer3D.prototype.syncZones = function syncZonesWithExistingPotholeGlb(state) {
    const result = originalSyncZones.call(this, state);
    const environmentState = kanoEnvironmentStates.get(this);
    if (environmentState) kanoApplyPotholeEnvironmentModel(this, environmentState, state);
    return result;
  };

  Renderer3D.prototype.dispose = function disposeExistingEnvironmentGlbs() {
    kanoDisposeExistingEnvironmentAssets(this);
    return originalDispose.call(this);
  };
}

installKanoExistingEnvironmentGlbs();

if (typeof window !== 'undefined') {
  window.kanoEnvironmentGlbUsageReport = () => {
    const renderers = [...kanoEnvironmentRenderers];
    const reports = renderers.map((renderer) => {
      const state = kanoEnvironmentStates.get(renderer);
      return {
        lifeScene: renderer.lifeScene || null,
        mobile: Boolean(renderer.mobile),
        disposed: Boolean(state?.disposed),
        assets: state ? [...state.assets.values()].map((asset) => ({
          id: asset.id,
          path: asset.path,
          role: asset.role,
          status: asset.status,
          meshCount: asset.meshCount || 0,
          dimensions: asset.dimensions || null,
          placements: asset.placements || 0,
          potholeInstances: asset.potholeInstances || 0,
          error: asset.error || asset.reason || null,
        })) : [],
        environmentDetailsActive: state?.details?.filter((detail) => !detail.disposed).length || 0,
        errors: state?.errors || [],
      };
    });
    return {
      version: 1,
      existingAssetsOnly: true,
      activeRenderers: reports.length,
      reports,
    };
  };
}

// Renderer presentation setup only. Pixel ratio is deliberately NOT managed here:
// KanoAdaptiveQuality is the single runtime owner of adaptive resolution. A
// second controller in this draw hook used to overwrite its settings on every
// frame, causing competing quality limits and unpredictable blur/performance.
function findWebGLRenderer(owner) {
  const candidates = [
    owner?.renderer, owner?.webglRenderer, owner?.glRenderer,
    owner?.threeRenderer, owner?._renderer, owner?.webgl, owner?.renderContext,
  ];
  return candidates.find((candidate) => candidate
    && typeof candidate.setPixelRatio === 'function'
    && typeof candidate.setSize === 'function'
    && candidate.domElement) || null;
}

function configureRendererPresentation(owner) {
  const gl = findWebGLRenderer(owner);
  if (!gl || rendererPresentationConfigured.has(gl)) return;
  try {
    // Match browser display colour space where supported. Do not replace an
    // existing custom tone-mapping pipeline owned by the game renderer.
    if ('outputColorSpace' in gl && THREE.SRGBColorSpace) {
      gl.outputColorSpace = THREE.SRGBColorSpace;
    }
    if (gl.toneMapping === THREE.NoToneMapping && THREE.ACESFilmicToneMapping !== undefined) {
      gl.toneMapping = THREE.ACESFilmicToneMapping;
      gl.toneMappingExposure = Math.max(1, Number(gl.toneMappingExposure) || 1);
    }
    const canvas = gl.domElement;
    if (canvas?.style) {
      canvas.style.display = 'block';
      canvas.style.width = '100%';
      canvas.style.height = '100%';
      canvas.style.imageRendering = 'auto';
      canvas.style.webkitTapHighlightColor = 'transparent';
    }
    rendererPresentationConfigured.add(gl);
    console.info('[Kano Life] renderer presentation configured; adaptive resolution is owned by KanoAdaptiveQuality.');
  } catch (error) {
    if (!owner._kanoClarityWarningShown) {
      owner._kanoClarityWarningShown = true;
      console.warn('[Kano Life] renderer presentation setup skipped; retaining native renderer settings.', error);
    }
  }
}

// Preserve the original story function so the morning routine remains optional.
const originalResetRun = Game.prototype.resetRun;
const originalHitTraffic = Game.prototype.hit;
const originalHitPothole = Game.prototype.hitPothole;
const originalBeginMorningRoutine = UI.prototype.beginMorningRoutine;
const originalUIBind = UI.prototype.bind;
const originalSetReverse = Game.prototype.setReverse;
const originalGameStart = Game.prototype.start;
const originalGameTick = Game.prototype.tick;
const originalSpawnTraffic = Game.prototype.spawnTraffic;
const originalRendererDraw = Renderer3D.prototype.draw;
const originalAnimateFallbackDriver = Renderer3D.prototype.animateFallbackDriver;
const originalSyncTraffic = Renderer3D.prototype.syncTraffic;
const originalMakeTrafficActor = Renderer3D.prototype.makeTrafficActor;
const originalMakePothole = Renderer3D.prototype.makePotholeActor;
const originalAudioEngine = AudioManager.prototype.engine;

// -----------------------------------------------------------------------------
// Small owned Three.js scene helpers
// -----------------------------------------------------------------------------
function makeRoot(name) {
  const root = new THREE.Group();
  root.name = name;
  root.userData.kanoRepairResources = { geometries: [], materials: [] };
  return root;
}
function resourceOwner(node) {
  let current = node;
  while (current) {
    if (current.userData?.kanoRepairResources) return current;
    current = current.parent;
  }
  throw new TypeError('Kano presentation object has no resource owner.');
}
function makeMaterial(root, color, options = {}) {
  const material = new THREE.MeshStandardMaterial({ color, roughness: 0.82, ...options });
  resourceOwner(root).userData.kanoRepairResources.materials.push(material);
  return material;
}
function makeMesh(root, geometry, material, position = [0, 0, 0], scale = [1, 1, 1]) {
  resourceOwner(root).userData.kanoRepairResources.geometries.push(geometry);
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.set(position[0], position[1], position[2]);
  mesh.scale.set(scale[0], scale[1], scale[2]);
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  root.add(mesh);
  return mesh;
}
function disposeRoot(root) {
  if (!root) return;

  // Owned resources may live on nested groups, especially the individual goats
  // in a crossing. Collect only explicitly owned resources so shared GLB assets
  // and the original renderer's geometry/materials are never disposed here.
  const geometries = new Set();
  const materials = new Set();
  const collect = (node) => {
    const resources = node?.userData?.kanoRepairResources;
    for (const geometry of resources?.geometries || []) {
      if (geometry && typeof geometry.dispose === 'function') geometries.add(geometry);
    }
    for (const material of resources?.materials || []) {
      if (material && typeof material.dispose === 'function') materials.add(material);
    }
  };
  if (typeof root.traverse === 'function') root.traverse(collect);
  else collect(root);

  root.parent?.remove(root);
  for (const geometry of geometries) {
    try { geometry.dispose(); } catch (_) {}
  }
  for (const material of materials) {
    try { material.dispose(); } catch (_) {}
  }
  root.clear?.();
}
function worldFor(renderer) {
  return renderer?.world?.isObject3D ? renderer.world : renderer?.scene?.isObject3D ? renderer.scene : null;
}

function makeGoat(index) {
  const goat = new THREE.Group();
  goat.name = `KanoCrossingGoat${index + 1}`;
  goat.userData.kanoGoatRig = { legs: [], time: index * 1.3, baseY: 0 };
  const coat = new THREE.MeshStandardMaterial({ color: index % 2 ? '#c9b393' : '#e1d6c5', roughness: 0.92 });
  const dark = new THREE.MeshStandardMaterial({ color: '#554338', roughness: 0.94 });
  const horn = new THREE.MeshStandardMaterial({ color: '#e8d7ad', roughness: 0.8 });
  const resources = { geometries: [], materials: [coat, dark, horn] };
  goat.userData.kanoRepairResources = resources;
  const add = (geometry, material, position, scale = [1, 1, 1]) => {
    resources.geometries.push(geometry);
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(...position);
    mesh.scale.set(...scale);
    goat.add(mesh);
    return mesh;
  };
  add(new THREE.SphereGeometry(0.34, 10, 7), coat, [0, 0.55, 0], [1.32, 0.62, 0.72]);
  add(new THREE.SphereGeometry(0.18, 9, 7), coat, [-0.37, 0.72, 0.015], [0.88, 0.82, 0.8]);
  add(new THREE.SphereGeometry(0.10, 8, 6), dark, [-0.47, 0.68, 0.11], [0.8, 0.62, 0.55]);
  add(new THREE.SphereGeometry(0.035, 6, 5), dark, [-0.43, 0.77, 0.15]);
  for (const side of [-1, 1]) {
    const ear = add(new THREE.ConeGeometry(0.065, 0.18, 6), coat, [-0.40, 0.87, side * 0.12], [0.8, 1, 0.55]);
    ear.rotation.z = side * -0.62;
    const hornMesh = add(new THREE.ConeGeometry(0.035, 0.16, 6), horn, [-0.27, 0.94, side * 0.10]);
    hornMesh.rotation.z = -0.35;
  }
  for (const x of [-0.23, 0.22]) {
    for (const z of [-0.13, 0.13]) {
      const pivot = new THREE.Group();
      pivot.position.set(x, 0.45, z);
      goat.add(pivot);
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.027, 0.29, 6), dark);
      leg.position.y = -0.13;
      pivot.add(leg);
      resources.geometries.push(leg.geometry);
      goat.userData.kanoGoatRig.legs.push(pivot);
    }
  }
  return goat;
}
function createGoatCrossing(renderer) {
  const root = makeRoot('Kano Animated Goat Crossing');
  const first = makeGoat(0);
  const second = makeGoat(1);
  first.position.set(4.55, 0, 0.05);
  second.position.set(5.15, 0, -0.68);
  second.scale.setScalar(0.84);
  root.add(first, second);
  root.userData.kanoEvent = { type: 'goatCrossing', actors: [first, second], time: 0 };
  root.position.set(0, 0, -2.95);
  worldFor(renderer)?.add(root);
  return root;
}

function createOfficerRig(root) {
  const skin = makeMaterial(root, '#805038');
  const shirt = makeMaterial(root, '#e0e3df');
  const trousers = makeMaterial(root, '#28374a');
  const cap = makeMaterial(root, '#263b54');
  const body = makeMesh(root, new THREE.CapsuleGeometry(0.16, 0.36, 3, 7), shirt, [0, 0.96, 0], [0.9, 1, 0.72]);
  body.name = 'KAROTA officer torso';
  makeMesh(root, new THREE.SphereGeometry(0.13, 8, 6), skin, [0, 1.30, 0.01]);
  makeMesh(root, new THREE.CylinderGeometry(0.14, 0.16, 0.07, 8), cap, [0, 1.41, 0]);
  const arms = [];
  for (const side of [-1, 1]) {
    const pivot = new THREE.Group();
    pivot.position.set(side * 0.17, 1.13, 0);
    root.add(pivot);
    const arm = makeMesh(root, new THREE.CapsuleGeometry(0.045, 0.24, 2, 5), shirt, [0, 0, 0], [1, 1, 0.9]);
    pivot.add(arm);
    arm.position.set(side * 0.02, -0.15, 0.01);
    arms.push(pivot);
  }
  for (const side of [-1, 1]) makeMesh(root, new THREE.CapsuleGeometry(0.055, 0.28, 2, 5), trousers, [side * 0.08, 0.40, 0], [1, 1, 1]);
  return { arms, body };
}
function createKarotaCheckpoint(renderer) {
  const root = makeRoot('KAROTA Checkpoint Patrol');
  const white = makeMaterial(root, '#e4e8e7');
  const dark = makeMaterial(root, '#202933');
  const blue = makeMaterial(root, '#164d83');
  const tyre = makeMaterial(root, '#161a1e');
  const glass = makeMaterial(root, '#80a6b7', { metalness: 0.05, roughness: 0.3 });
  const lampBlue = new THREE.MeshBasicMaterial({ color: '#187bff' });
  const lampRed = new THREE.MeshBasicMaterial({ color: '#fb3342' });
  root.userData.kanoRepairResources.materials.push(lampBlue, lampRed);
  const car = new THREE.Group();
  car.position.set(0, 0, -0.3);
  root.add(car);
  makeMesh(car, new THREE.BoxGeometry(1.9, 0.62, 1.08), white, [0, 0.62, 0]);
  makeMesh(car, new THREE.BoxGeometry(0.95, 0.34, 0.88), glass, [0.18, 1.08, -0.04]);
  makeMesh(car, new THREE.BoxGeometry(1.84, 0.15, 1.1), blue, [0, 0.70, 0.02]);
  makeMesh(car, new THREE.BoxGeometry(0.55, 0.12, 0.18), dark, [0, 0.72, 0.57]);
  for (const x of [-0.70, 0.70]) for (const z of [-0.42, 0.42]) {
    const wheel = makeMesh(car, new THREE.CylinderGeometry(0.18, 0.18, 0.11, 10), tyre, [x, 0.25, z]);
    wheel.rotation.z = Math.PI / 2;
  }
  const beaconLeft = makeMesh(root, new THREE.SphereGeometry(0.08, 8, 6), lampBlue, [-0.20, 1.40, -0.50]);
  const beaconRight = makeMesh(root, new THREE.SphereGeometry(0.08, 8, 6), lampRed, [0.20, 1.40, -0.50]);
  const officer = new THREE.Group();
  officer.position.set(1.30, 0, 0.15);
  root.add(officer);
  const officerRig = createOfficerRig(officer);
  const barrier = makeMesh(root, new THREE.BoxGeometry(1.45, 0.13, 0.15), makeMaterial(root, '#f0e7d5'), [1.58, 0.55, -1.10]);
  barrier.name = 'KAROTA striped checkpoint barrier';
  for (let i = 0; i < 6; i += 1) {
    makeMesh(root, new THREE.BoxGeometry(0.13, 0.14, 0.17), makeMaterial(root, '#c74135'), [1.00 + i * 0.23, 0.56, -1.10]);
  }
  root.userData.kanoEvent = { type: 'karota', time: 0, beaconLeft, beaconRight, officerRig, barrier };
  root.position.set(2.72, 0, -4.05);
  root.rotation.y = -0.12;
  worldFor(renderer)?.add(root);
  return root;
}
function createWaterSeller(renderer) {
  const root = makeRoot('Kano Pure Water Seller');
  const skin = makeMaterial(root, '#86563b');
  const shirt = makeMaterial(root, '#287e77');
  const trousers = makeMaterial(root, '#303943');
  const cap = makeMaterial(root, '#e6c45f');
  makeMesh(root, new THREE.CapsuleGeometry(0.16, 0.38, 3, 7), shirt, [0, 0.91, 0], [0.9, 1, 0.72]);
  makeMesh(root, new THREE.SphereGeometry(0.13, 8, 6), skin, [0, 1.30, 0.01]);
  makeMesh(root, new THREE.CylinderGeometry(0.14, 0.16, 0.07, 8), cap, [0, 1.41, 0]);
  for (const side of [-1, 1]) makeMesh(root, new THREE.CapsuleGeometry(0.055, 0.26, 2, 5), trousers, [side * 0.08, 0.37, 0]);
  const arms = [];
  for (const side of [-1, 1]) {
    const pivot = new THREE.Group();
    pivot.position.set(side * 0.17, 1.12, 0);
    root.add(pivot);
    const arm = makeMesh(root, new THREE.CapsuleGeometry(0.045, 0.27, 2, 5), shirt, [0, 0, 0]);
    pivot.add(arm);
    arm.position.set(side * 0.04, -0.14, -0.02);
    arms.push(pivot);
  }
  // Clearly visible raised tray and sachet-water bottles.
  const tray = makeMesh(root, new THREE.BoxGeometry(0.95, 0.08, 0.34), makeMaterial(root, '#9b6b3c'), [0.70, 1.22, -0.10]);
  tray.rotation.z = -0.06;
  const bottles = [];
  for (let i = 0; i < 5; i += 1) {
    const bottle = makeMesh(root, new THREE.CylinderGeometry(0.045, 0.05, 0.18, 7), makeMaterial(root, '#51c8dc', { transparent: true, opacity: 0.9, roughness: 0.25 }), [0.35 + i * 0.16, 1.35, -0.10]);
    bottle.userData.phase = i * 0.9;
    bottles.push(bottle);
  }
  root.userData.kanoEvent = { type: 'waterSeller', time: 0, arms, bottles, tray };
  root.position.set(-2.95, 0, -3.15);
  root.rotation.y = 0.16;
  worldFor(renderer)?.add(root);
  return root;
}

function buildEventVisual(renderer, type) {
  if (type === 'goatCrossing') return createGoatCrossing(renderer);
  if (type === 'karota') return createKarotaCheckpoint(renderer);
  if (type === 'waterSeller') return createWaterSeller(renderer);
  return null;
}
function syncEventVisual(renderer, type) {
  const world = worldFor(renderer);
  if (!world) return;
  const normalizedType = ['goatCrossing', 'karota', 'waterSeller'].includes(type) ? type : null;
  let current = renderer._kanoRepairEventVisual;
  if (current && (current.type !== normalizedType || current.root.parent !== world)) {
    disposeRoot(current.root);
    renderer._kanoRepairEventVisual = null;
    current = null;
  }
  if (!normalizedType || current) return;
  const root = buildEventVisual(renderer, normalizedType);
  if (!root) return;
  if (!root.parent) world.add(root);
  renderer._kanoRepairEventVisual = { type: normalizedType, root, time: 0 };
}
function animateEventVisual(renderer, dt) {
  const visual = renderer._kanoRepairEventVisual;
  if (!visual?.root?.parent) return;
  const delta = clamp(dt, 0, 0.05);
  visual.time += delta;
  const data = visual.root.userData.kanoEvent;
  if (!data) return;
  data.time += delta;
  const t = data.time;
  if (data.type === 'goatCrossing') {
    data.actors.forEach((goat, index) => {
      const rig = goat.userData.kanoGoatRig;
      const phase = t * 9 + index * 1.4;
      goat.position.x -= delta * (1.05 + index * 0.10);
      if (goat.position.x < -5.8) goat.position.x = 5.1 + index * 0.52;
      goat.position.y = Math.abs(Math.sin(phase * 1.6)) * 0.035;
      rig?.legs.forEach((leg, legIndex) => { leg.rotation.x = Math.sin(phase + (legIndex % 2) * Math.PI) * 0.47; });
      const head = goat.children.find((child) => child.geometry?.type === 'SphereGeometry' && child.position.x < -0.25);
      if (head) head.rotation.z = Math.sin(phase * 0.32) * 0.07;
    });
  } else if (data.type === 'karota') {
    const flash = Math.sin(t * 9) > 0;
    data.beaconLeft.material.color.set(flash ? '#2089ff' : '#102c58');
    data.beaconRight.material.color.set(flash ? '#4d1018' : '#ff3347');
    data.officerRig.arms[1].rotation.z = -0.70 + Math.sin(t * 4.4) * 0.48;
    data.officerRig.arms[0].rotation.z = 0.22 + Math.sin(t * 2.1) * 0.12;
    data.barrier.rotation.z = Math.sin(t * 1.4) * 0.025;
  } else if (data.type === 'waterSeller') {
    data.arms[0].rotation.z = -0.38 + Math.sin(t * 3.8) * 0.32;
    data.arms[1].rotation.z = 0.18 + Math.sin(t * 2.8 + 0.9) * 0.24;
    data.tray.position.y = 1.22 + Math.sin(t * 2.0) * 0.018;
    data.bottles.forEach((bottle) => {
      bottle.position.y = 1.35 + Math.abs(Math.sin(t * 3.1 + bottle.userData.phase)) * 0.04;
      bottle.rotation.z = Math.sin(t * 2.6 + bottle.userData.phase) * 0.07;
    });
  }
}

// -----------------------------------------------------------------------------
// Pothole visibility: hook the renderer's actual makePotholeActor method,
// keep the existing gameplay actor, and add subtle edge detail around it.
// -----------------------------------------------------------------------------
if (typeof originalMakePothole === 'function') {
  Renderer3D.prototype.makePotholeActor = function patchedMakePotholeActor(...args) {
    const actor = originalMakePothole.apply(this, args);
    if (!actor?.isObject3D || actor.userData?.kanoRepairPotholeFX) return actor;

    const fxRoot = makeRoot('Kano Pothole Edge Detail');
    const rockMaterial = makeMaterial(fxRoot, '#9b8d78', { roughness: 0.98 });
    for (let i = 0; i < 7; i += 1) {
      const angle = (i / 7) * Math.PI * 2 + random(-0.12, 0.12);
      const radius = random(0.30, 0.50);
      const rock = makeMesh(
        fxRoot,
        new THREE.DodecahedronGeometry(random(0.045, 0.085), 0),
        rockMaterial,
        [Math.cos(angle) * radius, random(0.018, 0.035), Math.sin(angle) * radius],
        [random(0.8, 1.25), random(0.45, 0.75), random(0.8, 1.2)],
      );
      rock.rotation.set(random(-0.3, 0.3), random(0, Math.PI), random(-0.3, 0.3));
      rock.userData.kanoPotholePhase = i * 0.7;
    }
    actor.add(fxRoot);
    actor.userData.kanoRepairPotholeFX = { root: fxRoot, time: random(0, 8) };
    potholeActors.add(actor);
    return actor;
  };
}
function animatePotholeDetails(dt) {
  const delta = clamp(dt, 0, 0.05);
  for (const actor of [...potholeActors]) {
    if (!actor.parent) {
      const root = actor.userData?.kanoRepairPotholeFX?.root;
      if (root) disposeRoot(root);
      potholeActors.delete(actor);
      continue;
    }
    const fx = actor.userData?.kanoRepairPotholeFX;
    if (!fx?.root) continue;
    fx.time += delta;
    for (const rock of fx.root.children) {
      const phase = rock.userData?.kanoPotholePhase;
      if (phase === undefined) continue;
      rock.rotation.y += delta * 0.18;
      rock.position.y = 0.02 + Math.abs(Math.sin(fx.time * 2.7 + phase)) * 0.018;
    }
  }
}

// -----------------------------------------------------------------------------
// Morning routine: direct start is the default; the story stays replayable.
// -----------------------------------------------------------------------------
function startSelectedRun(ui) {
  const game = ui?.game || window.__KANO_LIFE_GAME__ || activeGame;
  if (!game || typeof game.start !== 'function') {
    console.error('[Kano Life] Start was requested before the game was ready.');
    return false;
  }
  const routeId = document.getElementById('route-select')?.value || save.routeId || ROUTES[0]?.id;
  const driverId = document.getElementById('driver-select')?.value || save.driverId || DRIVERS[0]?.id;
  const mode = document.getElementById('mode-select')?.value || save.lastMode || 'career';
  const route = ROUTES.find((entry) => entry.id === routeId) || ROUTES[0];
  const driver = DRIVERS.find((entry) => entry.id === driverId && (save.unlocks || []).includes(entry.id))
    || DRIVERS.find((entry) => (save.unlocks || []).includes(entry.id)) || DRIVERS[0];
  if (route) { save.routeId = route.id; game.route = route; }
  if (driver) { save.driverId = driver.id; game.driver = driver; }
  save.lastMode = mode;
  try { persist(); } catch (error) { console.warn('[Kano Life] Start settings could not be saved.', error); }
  activeGame = game;
  activeUI = ui;
  window.__KANO_LIFE_GAME__ = game;
  game.start(mode);
  // Keep the DOM and game state aligned even if an older start implementation
  // does not call UI.startPlay() itself.
  ui?.startPlay?.();
  window.dispatchEvent(new CustomEvent('kano:life-scene', { detail: { scene: 'road' } }));
  return true;
}
UI.prototype.beginMorningRoutine = function beginRoutineOrDrive() {
  activeUI = this;
  return startSelectedRun(this);
};

// The current game engine already supports reverse gear, but some index.html
// versions do not render its button. Create it before UI.bind() and Controls
// are constructed so the existing input controller discovers it normally.
function installReverseGearElements() {
  const controls = document.getElementById('drive-controls');
  if (!controls) return;

  let reverseButton = document.getElementById('reverse-btn');
  if (!reverseButton) {
    reverseButton = document.createElement('button');
    reverseButton.id = 'reverse-btn';
    reverseButton.type = 'button';
    reverseButton.className = 'control reverse';
    reverseButton.dataset.action = 'reverse';
    reverseButton.textContent = 'REVERSE';
    reverseButton.setAttribute('aria-label', 'Toggle reverse gear');
    reverseButton.setAttribute('aria-pressed', 'false');
    reverseButton.title = 'Engage reverse gear only after the keke has stopped.';

    const brakeButton = controls.querySelector('[data-action="brake"]');
    if (brakeButton) controls.insertBefore(reverseButton, brakeButton);
    else controls.append(reverseButton);
  } else {
    reverseButton.dataset.action ||= 'reverse';
    reverseButton.classList.add('control', 'reverse');
  }

  const hudBottom = document.querySelector('#hud .hud-bottom');
  if (hudBottom && !document.getElementById('gear-label')) {
    const gearLabel = document.createElement('span');
    gearLabel.id = 'gear-label';
    gearLabel.setAttribute('aria-live', 'polite');
    gearLabel.textContent = 'FORWARD GEAR';
    hudBottom.append(gearLabel);
  }
}

UI.prototype.bind = function patchedUIBind(game, ...args) {
  installReverseGearElements();
  const result = originalUIBind.call(this, game, ...args);
  this.game = game;
  activeUI = this;
  activeGame = game;
  window.__KANO_LIFE_GAME__ = game;
  installRecordUI();
  renderLocalRecord();
  updateVehicleHealthBadge(game?.s);
  refreshOverallRecord(true);
  this.updateReverseControl?.(game?.s);
  if (!document.getElementById('kano-replay-morning-routine')) {
    const actions = document.querySelector('.start-actions');
    if (actions) {
      const button = document.createElement('button');
      button.id = 'kano-replay-morning-routine';
      button.type = 'button';
      button.className = 'secondary';
      button.textContent = 'REPLAY MORNING ROUTINE';
      button.title = 'Watch the optional morning story before driving';
      button.addEventListener('click', () => {
        if (typeof originalBeginMorningRoutine === 'function') originalBeginMorningRoutine.call(this);
      });
      actions.append(button);
    }
  }
  return result;
};
function installRecordUI() {
  if (!document.getElementById('kano-presentation-repair-css')) {
    const style = document.createElement('style');
    style.id = 'kano-presentation-repair-css';
    style.textContent = `
      #kano-replay-morning-routine{flex:1 1 100%;min-height:34px;font-size:10px}
      .kano-overall-record{display:inline-flex!important;align-items:center;gap:5px;max-width:100%;padding:5px 8px;border-radius:8px;border:1px solid #f5c54288;background:rgba(8,17,28,.92);color:#ffe18b;font-size:10px;font-weight:900;line-height:1.3;white-space:normal;visibility:visible!important;opacity:1!important}
      .kano-start-record{display:block!important;flex:1 1 100%;width:100%;color:#f5d77d;font-size:12px;font-weight:900;padding:7px 0 2px;line-height:1.35;visibility:visible!important;opacity:1!important}
      .kano-vehicle-health{display:inline-flex;flex:1 1 100%;align-items:center;box-sizing:border-box;min-width:0;max-width:100%;padding:4px 7px;border:1px solid #4dd6ac66;border-radius:7px;background:rgba(8,17,28,.88);color:#a5f3d4;font-size:9px;font-weight:900;line-height:1.35;white-space:normal;overflow-wrap:anywhere}
      .kano-vehicle-health[data-level=warning]{color:#ffd166;border-color:#ffd16699}
      .kano-vehicle-health[data-level=critical]{color:#ff8989;border-color:#ff626299;background:rgba(48,10,10,.9)}
      #hud .hud-bottom{display:flex;flex-wrap:wrap;align-items:center;row-gap:5px}
      #game-canvas{display:block;width:100%;height:100%;image-rendering:auto;touch-action:none;outline:none}
      #app,#game-container{min-width:0;max-width:100vw}
      #drive-controls{grid-template-columns:repeat(6,minmax(0,1fr));gap:clamp(3px,.7vw,7px)}
      #drive-controls .control{min-width:0;min-height:clamp(42px,7vh,62px);touch-action:manipulation;-webkit-user-select:none;user-select:none}
      #drive-controls .reverse{color:#ffd166;background:#332a18;border:1px solid #f5c54288;font-weight:900}
      #drive-controls .reverse.active,#drive-controls .reverse.reverse-engaged{color:#172333;background:#f5c542;border-color:#ffe69a;box-shadow:0 0 0 2px #f5c54238}
      #drive-controls .reverse:focus-visible{outline:2px solid #f5c542;outline-offset:2px}
      #gear-label{display:inline-flex;align-items:center;color:#9de6d7;font-weight:900}
      @media(max-width:520px){#drive-controls{gap:3px}#drive-controls .control{padding-left:2px;padding-right:2px;font-size:clamp(8px,2.1vw,10px)}.kano-overall-record{font-size:9px;padding:4px 6px}.kano-start-record{font-size:10px}}
      @media(max-width:760px){#game-canvas{width:100%;height:100%}.kano-overall-record{font-size:9px;padding:4px 6px}.kano-start-record{font-size:10px}}
    `;
    document.head.append(style);
  }
  const hud = document.querySelector('#hud .hud-bottom');
  if (hud && !document.getElementById('kano-overall-record')) {
    const badge = document.createElement('span');
    badge.id = 'kano-overall-record';
    badge.className = 'kano-overall-record';
    badge.setAttribute('aria-live', 'polite');
    hud.append(badge);
  }
  if (hud && !document.getElementById('kano-vehicle-health')) {
    const health = document.createElement('span');
    health.id = 'kano-vehicle-health';
    health.className = 'kano-vehicle-health';
    health.setAttribute('role', 'status');
    health.setAttribute('aria-live', 'polite');
    health.textContent = 'KEKE HEALTH · CHECKING CONDITION';
    hud.append(health);
  }
  const card = document.querySelector('#start-screen .start-card');
  if (card && !document.getElementById('kano-start-record')) {
    const line = document.createElement('div');
    line.id = 'kano-start-record';
    line.className = 'kano-start-record';
    line.setAttribute('aria-live', 'polite');
    const subtitle = card.querySelector('.subtitle');
    if (subtitle?.nextSibling) card.insertBefore(line, subtitle.nextSibling);
    else card.append(line);
  }
  if (!window.__kanoPresentationRecordListeners) {
    window.__kanoPresentationRecordListeners = true;
    window.addEventListener('kano:global-score-submitted', () => refreshOverallRecord(true));
    window.addEventListener('storage', (event) => {
      if (event.key === 'kano-life-save-v4' || event.key === RECORD_NAME_KEY) refreshOverallRecord(true);
    });
    recordRefreshTimer = window.setInterval(() => {
      if (!document.hidden) refreshOverallRecord(false);
    }, 4000);
  }
  installWorkshopUI();
}

// -----------------------------------------------------------------------------
// Garage workshop: real in-game service transactions backed by banked funds.
// The player must open the existing Garage screen; repairs are never applied
// automatically while driving. Prices scale with the missing condition.
// -----------------------------------------------------------------------------
const WORKSHOP_PARTS = {
  body:   { stateKey: 'condition', label: 'BODY',   rate: 5,  color: '#f5c542' },
  engine: { stateKey: 'engine',    label: 'ENGINE', rate: 8,  color: '#00b4d8' },
  tyres:  { stateKey: 'tyres',     label: 'TYRES',  rate: 6,  color: '#4dd6ac' },
};
const WORKSHOP_LABOUR_FEE = 100;
const WORKSHOP_HISTORY_KEY = 'kano-life-workshop-history-v1';
const WORKSHOP_SAVINGS_GOAL_KEY = 'kano-life-workshop-savings-goal-v1';
const WORKSHOP_MONTHLY_BUDGET_KEY = 'kano-life-workshop-monthly-budget-v1';
const WORKSHOP_ANNUAL_BUDGET_KEY = 'kano-life-workshop-annual-budget-v1';
const WORKSHOP_SPENDING_LEDGER_KEY = 'kano-life-workshop-spending-ledger-v1';
const WORKSHOP_SPENDING_LEDGER_RECOVERY_KEY = 'kano-life-workshop-spending-ledger-recovery-v1';
const WORKSHOP_LEDGER_MONTHS_LIMIT = 12;
const WORKSHOP_LEDGER_TRANSACTIONS_LIMIT = 500;
const WORKSHOP_HISTORY_LIMIT = 12;
const WORKSHOP_BACKUP_MAX_BYTES = 1024 * 1024;
const WORKSHOP_BACKUP_MAX_ROWS = 500;
const naira = (value) => `₦${Math.max(0, Math.floor(Number(value) || 0)).toLocaleString('en-NG')}`;
const escapeWorkshopHTML = (value) => String(value ?? '').replace(/[&<>\"']/g, (character) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '\"': '&quot;', "'": '&#39;',
}[character]));

function normalizeConditionSnapshot(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const snapshot = {};
  for (const key of Object.keys(WORKSHOP_PARTS)) {
    const raw = Number(value[key]);
    if (!Number.isFinite(raw) || raw < 0 || raw > 100) return null;
    snapshot[key] = Math.round(raw);
  }
  return snapshot;
}

function readWorkshopHistory() {
  try {
    const parsed = JSON.parse(localStorage.getItem(WORKSHOP_HISTORY_KEY) || '[]');
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((entry) => entry && Number.isFinite(Number(entry.time))
      && Number.isFinite(Number(entry.cost)) && Number(entry.cost) >= 0
      && Array.isArray(entry.parts)).slice(0, WORKSHOP_HISTORY_LIMIT);
  } catch (_) {
    return [];
  }
}

function appendWorkshopHistory(entry) {
  try {
    const history = readWorkshopHistory();
    const receipt = {
      time: Date.now(),
      service: String(entry.service || 'service').slice(0, 20),
      parts: Array.isArray(entry.parts) ? entry.parts.filter((key) => WORKSHOP_PARTS[key]).slice(0, 3) : [],
      cost: Math.max(0, Math.floor(Number(entry.cost) || 0)),
      walletAfter: Math.max(0, Math.floor(Number(entry.walletAfter) || 0)),
    };
    const conditionBefore = normalizeConditionSnapshot(entry.conditionBefore);
    const conditionAfter = normalizeConditionSnapshot(entry.conditionAfter);
    // Store condition details only when both sides of the repair are valid.
    // Legacy receipts remain readable and exportable without fabricated values.
    if (conditionBefore && conditionAfter) {
      receipt.conditionBefore = conditionBefore;
      receipt.conditionAfter = conditionAfter;
    }
    // Backfill whatever legacy history still exists before the 12-receipt list
    // is changed. The separate spending ledger continues counting new receipts
    // after older receipts roll off the visible history.
    ensureWorkshopSpendingLedger();
    history.unshift(receipt);
    localStorage.setItem(WORKSHOP_HISTORY_KEY, JSON.stringify(history.slice(0, WORKSHOP_HISTORY_LIMIT)));
    if (!recordWorkshopSpendingRecords([receipt], 'live')) {
      console.warn('[Kano Life] Service receipt was saved, but the monthly spending ledger could not be updated.');
    }
    return true;
  } catch (error) {
    console.warn('[Kano Life] Workshop service completed but its local receipt could not be saved.', error);
    return false;
  }
}

function workshopHistoryMarkup() {
  const history = readWorkshopHistory();
  if (!history.length) {
    return '<li class="kano-workshop-history-empty">No workshop services recorded on this device yet.</li>';
  }
  return history.map((entry) => {
    const date = new Date(Number(entry.time));
    const dateLabel = Number.isNaN(date.getTime()) ? 'Date unavailable' : date.toLocaleString('en-NG', { dateStyle: 'medium', timeStyle: 'short' });
    const serviceLabel = entry.service === 'full' ? 'FULL SERVICE'
      : entry.service === 'body' ? 'BODY REPAIR'
        : entry.service === 'engine' ? 'ENGINE SERVICE'
          : entry.service === 'tyres' ? 'TYRE SERVICE' : 'WORKSHOP SERVICE';
    const partsLabel = entry.parts.map((key) => WORKSHOP_PARTS[key]?.label || '').filter(Boolean).join(' · ');
    const before = normalizeConditionSnapshot(entry.conditionBefore);
    const after = normalizeConditionSnapshot(entry.conditionAfter);
    const conditionLine = before && after
      ? Object.keys(WORKSHOP_PARTS).map((key) => ({
          key,
          label: WORKSHOP_PARTS[key].label,
          before: before[key],
          after: after[key],
          restored: Math.max(0, after[key] - before[key]),
        })).filter((part) => part.before !== part.after)
          .map((part) => `${part.label} ${part.before}% → ${part.after}% (+${part.restored})`).join(' · ')
      : 'Condition details unavailable for this older receipt';
    return `<li class="kano-workshop-history-item"><div class="kano-workshop-history-top"><strong>${serviceLabel}</strong><b>${naira(entry.cost)}</b></div><span>${escapeWorkshopHTML(partsLabel || 'Vehicle service')}</span><small class="kano-workshop-history-condition">${escapeWorkshopHTML(conditionLine || 'No condition change recorded')}</small><small>${escapeWorkshopHTML(dateLabel)} · Wallet after: ${naira(entry.walletAfter)}</small></li>`;
  }).join('');
}

function workshopHistorySummaryMarkup() {
  const history = readWorkshopHistory();
  const spend = history.reduce((sum, entry) => sum + Math.max(0, Math.floor(Number(entry.cost) || 0)), 0);
  const restoredPoints = history.reduce((sum, entry) => {
    const before = normalizeConditionSnapshot(entry.conditionBefore);
    const after = normalizeConditionSnapshot(entry.conditionAfter);
    if (!before || !after) return sum;
    return sum + Object.keys(WORKSHOP_PARTS).reduce((partSum, key) => partSum + Math.max(0, after[key] - before[key]), 0);
  }, 0);
  const detailedReceipts = history.filter((entry) => normalizeConditionSnapshot(entry.conditionBefore) && normalizeConditionSnapshot(entry.conditionAfter)).length;
  return `<div class="kano-workshop-history-summary" aria-label="Saved service history summary"><div><span>SAVED SERVICES</span><strong>${history.length}</strong></div><div><span>SAVED SPEND</span><strong>${naira(spend)}</strong></div><div><span>CONDITION POINTS RESTORED</span><strong>${restoredPoints}</strong><small>${detailedReceipts} receipt${detailedReceipts === 1 ? '' : 's'} with condition detail</small></div></div>`;
}

function normalizedWorkshopExportRows() {
  const serviceLabels = {
    full: 'Full service',
    body: 'Body repair',
    engine: 'Engine service',
    tyres: 'Tyre service',
  };
  return readWorkshopHistory().map((entry) => {
    const date = new Date(Number(entry.time));
    const conditionBefore = normalizeConditionSnapshot(entry.conditionBefore);
    const conditionAfter = normalizeConditionSnapshot(entry.conditionAfter);
    return {
      date: Number.isNaN(date.getTime()) ? '' : date.toISOString(),
      service: serviceLabels[entry.service] || 'Workshop service',
      components: entry.parts.filter((key) => WORKSHOP_PARTS[key]).map((key) => WORKSHOP_PARTS[key].label).join('; '),
      costNaira: Math.max(0, Math.floor(Number(entry.cost) || 0)),
      walletAfterNaira: Math.max(0, Math.floor(Number(entry.walletAfter) || 0)),
      ...(conditionBefore && conditionAfter ? { conditionBefore, conditionAfter } : {}),
    };
  });
}

function downloadWorkshopHistory(format) {
  const rows = normalizedWorkshopExportRows();
  if (!rows.length) {
    setWorkshopMessage('No service records are available to export yet.');
    return;
  }

  try {
    const exportedAt = new Date().toISOString();
    const dateStamp = exportedAt.slice(0, 10);
    let blob;
    let extension;
    let mimeType;

    if (format === 'csv') {
      const csvCell = (value) => {
        let safe = String(value ?? '');
        // Prevent spreadsheet formula execution if a local record was edited.
        if (/^[\t\r ]*[=+\-@]/.test(safe)) safe = `'${safe}`;
        return `"${safe.replace(/"/g, '""')}"`;
      };
      const header = [
        'Service date (ISO 8601)', 'Service', 'Components', 'Cost (NGN)', 'Wallet after (NGN)',
        'Body before (%)', 'Body after (%)', 'Engine before (%)', 'Engine after (%)', 'Tyres before (%)', 'Tyres after (%)',
      ];
      const lines = [header, ...rows.map((row) => [
        row.date, row.service, row.components, row.costNaira, row.walletAfterNaira,
        row.conditionBefore?.body ?? '', row.conditionAfter?.body ?? '',
        row.conditionBefore?.engine ?? '', row.conditionAfter?.engine ?? '',
        row.conditionBefore?.tyres ?? '', row.conditionAfter?.tyres ?? '',
      ])];
      blob = new Blob(['\uFEFF', lines.map((line) => line.map(csvCell).join(',')).join('\r\n')], { type: 'text/csv;charset=utf-8' });
      extension = 'csv';
      mimeType = 'CSV';
    } else if (format === 'json') {
      const backup = {
        application: 'Kano Life',
        exportType: 'workshop-service-history',
        formatVersion: 1,
        exportedAt,
        recordCount: rows.length,
        note: 'This file contains only saved local workshop history. Newer receipts may include body, engine and tyre condition before and after service. It does not contain the game wallet or vehicle save.',
        records: rows,
      };
      blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json;charset=utf-8' });
      extension = 'json';
      mimeType = 'JSON backup';
    } else {
      setWorkshopMessage('Unsupported export format. Choose CSV or JSON.');
      return;
    }

    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `kano-life-service-history-${dateStamp}.${extension}`;
    link.style.display = 'none';
    document.body.append(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1500);
    setWorkshopMessage(`${mimeType} export prepared with ${rows.length} saved service record${rows.length === 1 ? '' : 's'}. The game wallet and vehicle save were not changed.`);
  } catch (error) {
    console.warn('[Kano Life] Workshop history export failed.', error);
    setWorkshopMessage('Export failed in this browser. Your saved service history remains unchanged.');
  }
}

function importServiceKey(value) {
  const normalized = String(value ?? '').trim().toLowerCase().replace(/\s+/g, ' ');
  const aliases = {
    full: 'full', 'full service': 'full',
    body: 'body', 'body repair': 'body',
    engine: 'engine', 'engine service': 'engine',
    tyre: 'tyres', tyres: 'tyres', 'tyre service': 'tyres', 'tyres service': 'tyres',
  };
  return aliases[normalized] || null;
}

function importPartKeys(record, service) {
  const aliases = {
    body: 'body', 'body repair': 'body',
    engine: 'engine', 'engine service': 'engine',
    tyre: 'tyres', tyres: 'tyres', 'tyre service': 'tyres', 'tyres service': 'tyres',
  };
  let values = [];
  if (Array.isArray(record?.parts)) values = record.parts;
  else if (typeof record?.components === 'string') values = record.components.split(/[;,|]/);
  const parts = [...new Set(values.map((value) => {
    const normalized = String(value ?? '').trim().toLowerCase().replace(/\s+/g, ' ');
    return WORKSHOP_PARTS[normalized] ? normalized : aliases[normalized];
  }).filter((key) => key && WORKSHOP_PARTS[key]))].slice(0, 3);
  if (parts.length) return parts;
  if (service === 'full') return ['body', 'engine', 'tyres'];
  if (service && WORKSHOP_PARTS[service]) return [service];
  return [];
}

function normalizeWorkshopBackupRecord(record) {
  if (!record || typeof record !== 'object' || Array.isArray(record)) return null;
  const service = importServiceKey(record.service);
  const timestamp = typeof record.time === 'number' && Number.isFinite(record.time)
    ? record.time
    : Date.parse(record.date);
  const costValue = record.costNaira ?? record.cost;
  const walletValue = record.walletAfterNaira ?? record.walletAfter;
  const cost = Number(costValue);
  const walletAfter = Number(walletValue);
  if (!service || !Number.isFinite(timestamp) || timestamp < 0
    || !Number.isFinite(cost) || cost < 0 || cost > 1_000_000_000
    || !Number.isFinite(walletAfter) || walletAfter < 0 || walletAfter > 1_000_000_000) {
    return null;
  }
  const parts = importPartKeys(record, service);
  if (!parts.length) return null;
  const conditionBefore = normalizeConditionSnapshot(record.conditionBefore ?? record.healthBefore);
  const conditionAfter = normalizeConditionSnapshot(record.conditionAfter ?? record.healthAfter);
  const normalized = {
    time: Math.floor(timestamp),
    service,
    parts,
    cost: Math.floor(cost),
    walletAfter: Math.floor(walletAfter),
  };
  if (conditionBefore && conditionAfter) {
    normalized.conditionBefore = conditionBefore;
    normalized.conditionAfter = conditionAfter;
  }
  return normalized;
}

function workshopRecordIdentity(record) {
  return [
    Math.floor(Number(record.time) || 0),
    importServiceKey(record.service) || 'service',
    [...new Set((Array.isArray(record.parts) ? record.parts : []).filter((key) => WORKSHOP_PARTS[key]))].sort().join(','),
    Math.floor(Number(record.cost) || 0),
    Math.floor(Number(record.walletAfter) || 0),
  ].join('|');
}

function emptyWorkshopSpendingLedger() {
  return { formatVersion: 1, months: {} };
}

function workshopLedgerMonthKey(time) {
  const date = new Date(Number(time));
  if (Number.isNaN(date.getTime())) return null;
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

function workshopLedgerMonthTotal(month) {
  const archived = Math.max(0, Math.floor(Number(month?.archivedNaira) || 0));
  const observed = (Array.isArray(month?.transactions) ? month.transactions : []).reduce(
    (sum, transaction) => sum + Math.max(0, Math.floor(Number(transaction.cost) || 0)), 0);
  return archived + observed;
}

function normalizeWorkshopSpendingLedger(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)
    || value.formatVersion !== 1 || !value.months || typeof value.months !== 'object'
    || Array.isArray(value.months)) return null;
  const months = {};
  const monthKeys = Object.keys(value.months)
    .filter((key) => /^\d{4}-(0[1-9]|1[0-2])$/.test(key))
    .sort();
  for (const monthKey of monthKeys) {
    const rawMonth = value.months[monthKey];
    if (!rawMonth || typeof rawMonth !== 'object' || Array.isArray(rawMonth)) continue;
    const rawTransactions = Array.isArray(rawMonth.transactions) ? rawMonth.transactions : [];
    const unique = new Map();
    for (const raw of rawTransactions) {
      if (!raw || typeof raw !== 'object' || Array.isArray(raw)) continue;
      const id = typeof raw.id === 'string' ? raw.id : '';
      const time = Number(raw.time);
      const cost = Number(raw.cost);
      if (!id || id.length > 300 || !Number.isFinite(time) || time < 0
        || workshopLedgerMonthKey(time) !== monthKey || !Number.isFinite(cost)
        || cost < 0 || cost > 1000000000) continue;
      if (!unique.has(id)) unique.set(id, { id, time: Math.floor(time), cost: Math.floor(cost) });
    }
    const sorted = [...unique.values()].sort((a, b) => b.time - a.time);
    const overflow = sorted.slice(WORKSHOP_LEDGER_TRANSACTIONS_LIMIT);
    const transactions = sorted.slice(0, WORKSHOP_LEDGER_TRANSACTIONS_LIMIT);
    const rawArchivedNaira = Number(rawMonth.archivedNaira);
    const rawArchivedCount = Number(rawMonth.archivedCount);
    const archivedNaira = Math.min(1000000000000,
      Math.max(0, Math.floor(Number.isFinite(rawArchivedNaira) ? rawArchivedNaira : 0))
      + overflow.reduce((sum, item) => sum + item.cost, 0));
    const archivedCount = Math.min(1000000000,
      Math.max(0, Math.floor(Number.isFinite(rawArchivedCount) ? rawArchivedCount : 0)) + overflow.length);
    months[monthKey] = {
      transactions,
      archivedNaira,
      archivedCount,
      coverageComplete: Boolean(rawMonth.coverageComplete) && !overflow.length && archivedCount === 0,
    };
  }
  const retainedKeys = Object.keys(months).sort().slice(-WORKSHOP_LEDGER_MONTHS_LIMIT);
  const retained = {};
  for (const key of retainedKeys) retained[key] = months[key];
  return { formatVersion: 1, months: retained };
}

function readWorkshopSpendingLedger() {
  try {
    const raw = localStorage.getItem(WORKSHOP_SPENDING_LEDGER_KEY);
    if (!raw) return emptyWorkshopSpendingLedger();
    return normalizeWorkshopSpendingLedger(JSON.parse(raw)) || emptyWorkshopSpendingLedger();
  } catch (_) {
    return emptyWorkshopSpendingLedger();
  }
}

function saveWorkshopSpendingLedger(ledger) {
  try {
    const normalized = normalizeWorkshopSpendingLedger(ledger);
    if (!normalized) return false;
    const serialized = JSON.stringify(normalized);
    localStorage.setItem(WORKSHOP_SPENDING_LEDGER_KEY, serialized);
    const verified = normalizeWorkshopSpendingLedger(JSON.parse(localStorage.getItem(WORKSHOP_SPENDING_LEDGER_KEY) || 'null'));
    if (!verified || Object.keys(verified.months).length !== Object.keys(normalized.months).length) return false;
    for (const key of Object.keys(normalized.months)) {
      if (!verified.months[key] || workshopLedgerMonthTotal(verified.months[key]) !== workshopLedgerMonthTotal(normalized.months[key])) return false;
    }
    return true;
  } catch (error) {
    console.warn('[Kano Life] Workshop monthly spending ledger save failed.', error);
    return false;
  }
}

function trimWorkshopLedgerMonths(ledger) {
  const keys = Object.keys(ledger.months || {}).sort();
  for (const key of keys.slice(0, Math.max(0, keys.length - WORKSHOP_LEDGER_MONTHS_LIMIT))) {
    delete ledger.months[key];
  }
  return ledger;
}

function addWorkshopLedgerRecord(ledger, rawRecord, source = 'import') {
  const record = normalizeWorkshopBackupRecord(rawRecord);
  if (!record) return false;
  const monthKey = workshopLedgerMonthKey(record.time);
  if (!monthKey) return false;
  const identity = workshopRecordIdentity(record);
  let month = ledger.months[monthKey];
  if (!month) {
    month = {
      transactions: [],
      archivedNaira: 0,
      archivedCount: 0,
      coverageComplete: source === 'live',
    };
    ledger.months[monthKey] = month;
  }
  if (month.transactions.some((transaction) => transaction.id === identity)) return false;

  // Archived entries no longer retain individual IDs. Avoid likely duplicates
  // from old imports that fall before the retained transaction window.
  const oldestRetained = month.transactions.reduce((min, transaction) => Math.min(min, transaction.time), Infinity);
  if (month.archivedCount > 0 && record.time <= oldestRetained) {
    month.coverageComplete = false;
    return false;
  }

  month.transactions.push({ id: identity, time: record.time, cost: record.cost });
  month.transactions.sort((a, b) => b.time - a.time);
  if (source !== 'live') month.coverageComplete = false;
  if (month.transactions.length > WORKSHOP_LEDGER_TRANSACTIONS_LIMIT) {
    const removed = month.transactions.splice(WORKSHOP_LEDGER_TRANSACTIONS_LIMIT);
    month.archivedNaira += removed.reduce((sum, item) => sum + item.cost, 0);
    month.archivedCount += removed.length;
    month.coverageComplete = false;
  }
  trimWorkshopLedgerMonths(ledger);
  return true;
}

function ensureWorkshopSpendingLedger() {
  try {
    const raw = localStorage.getItem(WORKSHOP_SPENDING_LEDGER_KEY);
    if (raw) {
      try {
        const parsed = normalizeWorkshopSpendingLedger(JSON.parse(raw));
        if (parsed) return parsed;
      } catch (_) {
        // Preserve the original bytes below before rebuilding the usable ledger.
      }
      // Keep one recovery copy of invalid/unsupported ledger data before replacing
      // it with a conservative migration from the receipts that still exist.
      try {
        if (!localStorage.getItem(WORKSHOP_SPENDING_LEDGER_RECOVERY_KEY)) {
          localStorage.setItem(WORKSHOP_SPENDING_LEDGER_RECOVERY_KEY, raw.slice(0, 1000000));
        }
      } catch (recoveryError) {
        console.warn('[Kano Life] Invalid workshop ledger could not be copied to recovery storage.', recoveryError);
      }
    }
    // Legacy migration can only use receipts still present in the old 12-row
    // history. Mark each migrated month as partial; do not imply full coverage.
    const ledger = emptyWorkshopSpendingLedger();
    const legacyHistory = readWorkshopHistory().map((entry) => normalizeWorkshopBackupRecord({
      time: Number(entry.time), service: entry.service, parts: entry.parts,
      cost: entry.cost, walletAfter: entry.walletAfter,
      conditionBefore: entry.conditionBefore, conditionAfter: entry.conditionAfter,
    })).filter(Boolean);
    for (const record of legacyHistory) addWorkshopLedgerRecord(ledger, record, 'legacy');
    for (const month of Object.values(ledger.months)) month.coverageComplete = false;
    saveWorkshopSpendingLedger(ledger);
    return ledger;
  } catch (error) {
    console.warn('[Kano Life] Could not migrate legacy workshop receipts into the spending ledger.', error);
    return emptyWorkshopSpendingLedger();
  }
}

function recordWorkshopSpendingRecords(records, source = 'import') {
  try {
    const ledger = ensureWorkshopSpendingLedger();
    let changed = false;
    for (const record of records || []) changed = addWorkshopLedgerRecord(ledger, record, source) || changed;
    if (!changed && localStorage.getItem(WORKSHOP_SPENDING_LEDGER_KEY)) return true;
    return saveWorkshopSpendingLedger(ledger);
  } catch (error) {
    console.warn('[Kano Life] Workshop spending ledger update failed.', error);
    return false;
  }
}

function mergeWorkshopSpendingLedgers(firstValue, secondValue) {
  const first = normalizeWorkshopSpendingLedger(firstValue) || emptyWorkshopSpendingLedger();
  const second = normalizeWorkshopSpendingLedger(secondValue) || emptyWorkshopSpendingLedger();
  const merged = emptyWorkshopSpendingLedger();
  for (const key of [...new Set([...Object.keys(first.months), ...Object.keys(second.months)])].sort()) {
    const a = first.months[key];
    const b = second.months[key];
    if (!a || !b) {
      merged.months[key] = JSON.parse(JSON.stringify(a || b));
      continue;
    }
    const entries = new Map();
    for (const entry of [...a.transactions, ...b.transactions]) {
      if (!entries.has(entry.id)) entries.set(entry.id, { ...entry });
    }
    const transactions = [...entries.values()].sort((x, y) => y.time - x.time);
    const archivedNaira = Math.max(a.archivedNaira, b.archivedNaira);
    const archivedCount = Math.max(a.archivedCount, b.archivedCount);
    let finalTransactions = transactions;
    let extraArchived = 0;
    let extraCount = 0;
    if (finalTransactions.length > WORKSHOP_LEDGER_TRANSACTIONS_LIMIT) {
      const overflow = finalTransactions.slice(WORKSHOP_LEDGER_TRANSACTIONS_LIMIT);
      finalTransactions = finalTransactions.slice(0, WORKSHOP_LEDGER_TRANSACTIONS_LIMIT);
      extraArchived = overflow.reduce((sum, entry) => sum + entry.cost, 0);
      extraCount = overflow.length;
    }
    merged.months[key] = {
      transactions: finalTransactions,
      archivedNaira: Math.min(1000000000000, archivedNaira + extraArchived),
      archivedCount: Math.min(1000000000, archivedCount + extraCount),
      // If either side already archived rows, perfect cross-device de-duplication
      // of those archived rows is impossible; surface the month as partial.
      coverageComplete: Boolean(a.coverageComplete && b.coverageComplete)
        && archivedCount === 0 && extraCount === 0,
    };
  }
  trimWorkshopLedgerMonths(merged);
  return normalizeWorkshopSpendingLedger(merged) || emptyWorkshopSpendingLedger();
}

function emptyWorkshopAnnualBudgets() {
  return { formatVersion: 1, targets: {} };
}

function normalizeWorkshopAnnualBudgets(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)
    || value.formatVersion !== 1 || !value.targets || typeof value.targets !== 'object'
    || Array.isArray(value.targets)) return null;
  const targets = {};
  for (const [year, raw] of Object.entries(value.targets)) {
    if (!/^\d{4}$/.test(year) || Number(year) < 1900 || Number(year) > 9999
      || !raw || typeof raw !== 'object' || Array.isArray(raw)) continue;
    const targetNaira = Number(raw.targetNaira);
    const updatedAtValue = Number(raw.updatedAt);
    if (!Number.isFinite(targetNaira) || targetNaira < 1 || targetNaira > 1000000000) continue;
    targets[year] = {
      targetNaira: Math.floor(targetNaira),
      updatedAt: Number.isFinite(updatedAtValue) && updatedAtValue >= 0 ? Math.floor(updatedAtValue) : 0,
    };
  }
  const retainedYears = Object.keys(targets).sort((a, b) => Number(b) - Number(a)).slice(0, 100);
  const retained = {};
  for (const year of retainedYears) retained[year] = targets[year];
  return { formatVersion: 1, targets: retained };
}

function readWorkshopAnnualBudgets() {
  try {
    return normalizeWorkshopAnnualBudgets(JSON.parse(localStorage.getItem(WORKSHOP_ANNUAL_BUDGET_KEY) || 'null'))
      || emptyWorkshopAnnualBudgets();
  } catch (_) {
    return emptyWorkshopAnnualBudgets();
  }
}

function saveWorkshopAnnualBudgets(value) {
  try {
    const normalized = normalizeWorkshopAnnualBudgets(value);
    if (!normalized) return false;
    localStorage.setItem(WORKSHOP_ANNUAL_BUDGET_KEY, JSON.stringify(normalized));
    const verified = normalizeWorkshopAnnualBudgets(JSON.parse(localStorage.getItem(WORKSHOP_ANNUAL_BUDGET_KEY) || 'null'));
    if (!verified || JSON.stringify(verified) !== JSON.stringify(normalized)) return false;
    return true;
  } catch (error) {
    console.warn('[Kano Life] Annual workshop budget target save failed.', error);
    return false;
  }
}

function workshopAnnualBudgetsHaveTargets(value = readWorkshopAnnualBudgets()) {
  const normalized = normalizeWorkshopAnnualBudgets(value);
  return Boolean(normalized && Object.keys(normalized.targets).length);
}

function mergeWorkshopAnnualBudgets(currentValue, incomingValue) {
  const current = normalizeWorkshopAnnualBudgets(currentValue) || emptyWorkshopAnnualBudgets();
  const incoming = normalizeWorkshopAnnualBudgets(incomingValue) || emptyWorkshopAnnualBudgets();
  return normalizeWorkshopAnnualBudgets({
    formatVersion: 1,
    targets: { ...current.targets, ...incoming.targets },
  }) || emptyWorkshopAnnualBudgets();
}

function workshopAnnualBudgetData(requestedYear = '') {
  const report = workshopAnnualReportData(requestedYear);
  const budgets = readWorkshopAnnualBudgets();
  const target = budgets.targets[report.selectedYear] || null;
  const hasLedgerData = report.months.some((month) => month.hasLedgerMonth);
  const remaining = target && hasLedgerData ? target.targetNaira - report.totalSpend : null;
  const progress = target && hasLedgerData ? (report.totalSpend / target.targetNaira) * 100 : null;
  const coverageComplete = report.months.length > 0 && report.months.every((month) => month.coverage === 'COMPLETE');
  let status = 'NO TARGET';
  if (target && !hasLedgerData) status = 'NO SPENDING DATA';
  else if (target && remaining < 0) status = 'OVER TARGET';
  else if (target && remaining === 0) status = 'TARGET REACHED';
  else if (target) status = 'WITHIN TARGET';
  return {
    selectedYear: report.selectedYear,
    report,
    target,
    hasLedgerData,
    recordedSpend: hasLedgerData ? report.totalSpend : null,
    remaining,
    progress,
    coverageComplete,
    dataMonths: report.months.filter((month) => month.hasLedgerMonth).length,
    periodMonths: report.months.length,
    status,
  };
}

function workshopAnnualBudgetMarkup(requestedYear = '') {
  const data = workshopAnnualBudgetData(requestedYear);
  const money = (value) => naira(value);
  const targetValue = data.target ? String(data.target.targetNaira) : '';
  const progress = data.progress === null ? 0 : Math.max(0, Math.min(100, data.progress));
  const level = data.status === 'OVER TARGET' ? 'over'
    : data.status === 'TARGET REACHED' ? 'reached'
      : data.status === 'WITHIN TARGET' ? (data.progress >= 75 ? 'near' : 'good')
        : 'empty';
  let explanation = 'Set a target for this selected year. The target is a planning guide, not a restriction on workshop spending.';
  if (data.target && !data.hasLedgerData) {
    explanation = `Target saved for ${data.selectedYear}, but this period has no retained ledger months. Recorded spend is unknown, not ₦0.`;
  } else if (data.target && data.status === 'OVER TARGET') {
    explanation = `Recorded spend exceeds the target by ${money(Math.abs(data.remaining))}. Check the coverage indicator before treating this as a complete total.`;
  } else if (data.target && data.status === 'TARGET REACHED') {
    explanation = 'Recorded spend equals the annual target. New workshop spending can take the year above target.';
  } else if (data.target && data.status === 'WITHIN TARGET') {
    explanation = `${money(data.remaining)} remains against this target based on the spending currently recorded in the ledger.`;
  }
  const meter = data.target && data.hasLedgerData
    ? `<div class="kano-workshop-annual-budget-meter" role="progressbar" aria-label="Recorded annual workshop spending against target" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${Math.round(progress)}"><i style="width:${progress.toFixed(2)}%"></i></div>`
    : '';
  const remainingLabel = !data.target ? 'NOT SET'
    : !data.hasLedgerData ? 'NO DATA'
      : data.remaining < 0 ? `OVER BY ${money(Math.abs(data.remaining))}` : money(data.remaining);
  const progressLabel = data.progress === null ? 'N/A' : `${data.progress.toFixed(1)}%`;
  const coverageLabel = !data.hasLedgerData ? 'NO LEDGER DATA'
    : data.coverageComplete ? `${data.dataMonths}/${data.periodMonths} MONTHS COMPLETE`
      : `${data.dataMonths}/${data.periodMonths} MONTHS WITH DATA · SOME PARTIAL OR MISSING`;
  return `<section class="kano-workshop-annual-budget" aria-labelledby="kano-workshop-annual-budget-title"><div class="kano-workshop-annual-budget-heading"><div><h5 id="kano-workshop-annual-budget-title">ANNUAL REPAIR BUDGET &amp; VARIANCE</h5><p>Budget target for ${data.selectedYear}</p></div><span data-level="${level}">${escapeWorkshopHTML(data.status)}</span></div><div class="kano-workshop-annual-budget-metrics"><div><span>ANNUAL TARGET</span><strong>${data.target ? money(data.target.targetNaira) : 'NOT SET'}</strong></div><div><span>RECORDED SPENDING</span><strong>${data.recordedSpend === null ? 'NO DATA' : money(data.recordedSpend)}</strong></div><div><span>REMAINING / OVERRUN</span><strong>${escapeWorkshopHTML(remainingLabel)}</strong></div><div><span>TARGET USED</span><strong>${escapeWorkshopHTML(progressLabel)}</strong></div></div>${meter}<p class="kano-workshop-annual-budget-message" role="status">${escapeWorkshopHTML(explanation)}</p><div class="kano-workshop-annual-budget-coverage" data-level="${data.coverageComplete ? 'complete' : data.hasLedgerData ? 'partial' : 'empty'}">LEDGER COVERAGE: ${escapeWorkshopHTML(coverageLabel)}. ${data.hasLedgerData && !data.coverageComplete ? 'Numbers may understate actual spend.' : ''}</div><form class="kano-workshop-annual-budget-form"><label for="kano-workshop-annual-budget-amount">ANNUAL TARGET (₦)<input id="kano-workshop-annual-budget-amount" data-kano-workshop-annual-budget-amount type="number" min="1" max="1000000000" step="1000" inputmode="numeric" value="${targetValue}" placeholder="Enter annual target" /></label><div class="kano-workshop-annual-budget-actions"><button type="button" data-kano-workshop-annual-budget-save>SAVE TARGET</button>${data.target ? '<button type="button" data-kano-workshop-annual-budget-clear>REMOVE TARGET</button>' : ''}</div></form><small class="kano-workshop-annual-budget-note">This uses recorded spending for the selected annual period. Missing months are unknown, not zero. The target does not reserve money or prevent repairs. Up to 100 year-specific targets can be retained on this device.</small></section>`;
}


// Year-end spend scenarios use the three immediately preceding, fully closed
// calendar months as a visible baseline. Unknown or partial months are never
// converted into zero; forecast values remain directional when year coverage has gaps.
function workshopAnnualForecastData(requestedYear = '') {
  const report = workshopAnnualReportData(requestedYear);
  const selectedYearNumber = Number(report.selectedYear);
  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth() + 1;
  const monthDays = new Date(currentYear, currentMonth, 0).getDate();
  const annualTarget = readWorkshopAnnualBudgets().targets[report.selectedYear] || null;
  const hasLedgerData = report.months.some((month) => month.hasLedgerMonth);
  const recordedSpend = hasLedgerData ? report.totalSpend : null;
  const result = {
    selectedYear: report.selectedYear,
    annualTarget: annualTarget ? annualTarget.targetNaira : null,
    yearMode: selectedYearNumber > currentYear ? 'FUTURE' : selectedYearNumber < currentYear ? 'CLOSED' : 'CURRENT',
    status: '',
    canForecast: false,
    hasLedgerData,
    recordedSpend,
    recentMonths: [],
    recentAverage: null,
    recentLow: null,
    recentHigh: null,
    remainingFullMonths: null,
    remainingMonthFraction: null,
    remainingMonthEquivalents: null,
    lowProjection: null,
    baseProjection: null,
    highProjection: null,
    targetVariance: null,
    coverageGaps: false,
    coverageLabel: '',
    explanation: '',
    periodLabel: '',
  };

  if (selectedYearNumber > currentYear) {
    result.status = 'PLANNING YEAR';
    result.remainingFullMonths = 12;
    result.remainingMonthFraction = 0;
    result.remainingMonthEquivalents = 12;
    result.coverageLabel = 'FUTURE YEAR · NO ACTUAL PERIOD';
    result.explanation = 'This is a future planning year. A year-end spending forecast will become available after three consecutive complete months have been recorded.';
    result.periodLabel = `JANUARY–DECEMBER ${report.selectedYear}`;
    return result;
  }

  if (selectedYearNumber < currentYear) {
    result.status = 'YEAR CLOSED';
    result.coverageLabel = `${report.completeMonths} complete · ${report.partialMonths} partial · ${report.noDataMonths} without data`;
    result.explanation = 'This year has ended. The report shows available recorded spending only; a forward forecast is not applicable to a closed year.';
    result.periodLabel = `CLOSED YEAR ${report.selectedYear}`;
    return result;
  }

  const closedMonths = report.months.filter((month) => month.monthNumber < currentMonth);
  const recentMonths = closedMonths.slice(-3);
  result.recentMonths = recentMonths.map((month) => ({
    monthNumber: month.monthNumber,
    monthName: month.monthName,
    totalSpend: month.totalSpend,
    coverage: month.coverage,
    hasLedgerMonth: month.hasLedgerMonth,
  }));
  result.remainingFullMonths = Math.max(0, 12 - currentMonth);
  // Forecasts estimate the remaining share of this month from the recent monthly
  // rate, plus every still-future calendar month. The current month's known spend
  // is already included in recordedSpend and is not counted twice.
  result.remainingMonthFraction = Math.max(0, (monthDays - now.getDate()) / monthDays);
  result.remainingMonthEquivalents = result.remainingFullMonths + result.remainingMonthFraction;
  const currentMonthEntry = report.months.find((month) => month.monthNumber === currentMonth);
  const currentMonthHasCompleteRecord = Boolean(currentMonthEntry && currentMonthEntry.hasLedgerMonth && currentMonthEntry.coverage === 'COMPLETE');
  result.coverageGaps = closedMonths.some((month) => !month.hasLedgerMonth || month.coverage !== 'COMPLETE') || !currentMonthHasCompleteRecord;
  result.coverageLabel = `${closedMonths.filter((month) => month.hasLedgerMonth && month.coverage === 'COMPLETE').length}/${closedMonths.length} closed months complete · current month ${currentMonthHasCompleteRecord ? 'recorded' : currentMonthEntry?.hasLedgerMonth ? 'partial' : 'no ledger data'}${result.coverageGaps ? ' · HISTORICAL OR CURRENT GAPS' : ''}`;
  result.periodLabel = `RECORDED TO ${now.toLocaleDateString('en-NG', { month: 'long', day: 'numeric', year: 'numeric' })}`;

  const hasThreeCompleteBaselineMonths = recentMonths.length === 3
    && recentMonths.every((month) => month.coverage === 'COMPLETE' && month.hasLedgerMonth);
  if (!hasThreeCompleteBaselineMonths) {
    result.status = 'BASELINE BUILDING';
    result.explanation = 'A forecast requires the three immediately preceding closed calendar months to have complete ledger coverage. Until then, this panel will show recorded totals without inventing future spending.';
    return result;
  }

  const baselineValues = recentMonths.map((month) => Math.max(0, Math.floor(Number(month.totalSpend) || 0)));
  result.recentLow = Math.min(...baselineValues);
  result.recentHigh = Math.max(...baselineValues);
  result.recentAverage = Math.round(baselineValues.reduce((sum, value) => sum + value, 0) / baselineValues.length);
  if (recordedSpend === null) {
    result.status = 'NO YEAR-TO-DATE DATA';
    result.explanation = 'A recent-month baseline exists, but the selected year has no ledger totals. The forecast is withheld rather than treating missing year-to-date spend as zero.';
    return result;
  }

  const horizon = result.remainingMonthEquivalents;
  result.lowProjection = Math.round(recordedSpend + result.recentLow * horizon);
  result.baseProjection = Math.round(recordedSpend + result.recentAverage * horizon);
  result.highProjection = Math.round(recordedSpend + result.recentHigh * horizon);
  result.targetVariance = annualTarget ? annualTarget.targetNaira - result.baseProjection : null;
  result.canForecast = true;
  result.status = result.coverageGaps ? 'DIRECTIONAL · COVERAGE GAPS' : 'FORECAST AVAILABLE';
  result.explanation = result.coverageGaps
    ? 'Scenario only: one or more earlier closed months are missing or partial. Such months remain unknown and are not filled with zero, so these projections may understate year-end spending.'
    : 'Scenario based on recorded year-to-date spending plus the spending rate from the three immediately preceding complete months. Future costs are estimates, not commitments.';
  return result;
}

function workshopAnnualForecastMarkup(requestedYear = '') {
  const data = workshopAnnualForecastData(requestedYear);
  const money = (value) => naira(value);
  const projectionLabel = (value) => value === null || value === undefined ? 'NOT AVAILABLE' : money(value);
  const level = data.status === 'FORECAST AVAILABLE' ? 'good'
    : data.status.startsWith('DIRECTIONAL') ? 'caution'
      : data.status === 'BASELINE BUILDING' ? 'pending' : 'empty';
  const targetLabel = !data.annualTarget ? 'NO TARGET SET'
    : !data.canForecast ? 'N/A'
      : data.targetVariance < 0 ? `OVER BY ${money(Math.abs(data.targetVariance))}`
        : data.targetVariance === 0 ? 'AT TARGET' : `${money(data.targetVariance)} BELOW TARGET`;
  const baselineLabel = data.recentAverage === null ? 'NOT AVAILABLE' : money(data.recentAverage);
  const monthsLeftLabel = data.remainingMonthEquivalents === null ? 'N/A' : `${data.remainingMonthEquivalents.toFixed(1)} month-equivalents`;
  const recentLabel = data.recentMonths.length
    ? data.recentMonths.map((month) => `${escapeWorkshopHTML(month.monthName)}: ${month.hasLedgerMonth ? money(month.totalSpend) : 'NO DATA'} (${escapeWorkshopHTML(month.coverage)})`).join(' · ')
    : 'No completed-month baseline available';
  return `<section class="kano-workshop-forecast" aria-labelledby="kano-workshop-forecast-title"><div class="kano-workshop-forecast-heading"><div><h5 id="kano-workshop-forecast-title">ANNUAL BUDGET PACE &amp; YEAR-END FORECAST</h5><p>${escapeWorkshopHTML(data.periodLabel)}</p></div><span data-level="${level}">${escapeWorkshopHTML(data.status)}</span></div><div class="kano-workshop-forecast-metrics"><div><span>KNOWN RECORDED SPEND</span><strong>${data.recordedSpend === null ? 'NO DATA' : money(data.recordedSpend)}</strong><small>Only totals retained for this year</small></div><div><span>RECENT MONTHLY BASELINE</span><strong>${baselineLabel}</strong><small>Mean of three complete closed months</small></div><div><span>TIME REMAINING</span><strong>${escapeWorkshopHTML(monthsLeftLabel)}</strong><small>Remaining share of this month plus future months</small></div><div><span>BASE SCENARIO VS TARGET</span><strong>${escapeWorkshopHTML(targetLabel)}</strong><small>${data.annualTarget === null ? 'Annual target not set' : money(data.annualTarget) + ' annual target'}</small></div></div><div class="kano-workshop-forecast-scenarios"><div data-scenario="low"><span>LOW SCENARIO</span><strong>${projectionLabel(data.lowProjection)}</strong><small>Recent lowest month × remaining horizon</small></div><div data-scenario="base"><span>BASE SCENARIO</span><strong>${projectionLabel(data.baseProjection)}</strong><small>Recent 3-month average × remaining horizon</small></div><div data-scenario="high"><span>HIGH SCENARIO</span><strong>${projectionLabel(data.highProjection)}</strong><small>Recent highest month × remaining horizon</small></div></div><p class="kano-workshop-forecast-message" role="status">${escapeWorkshopHTML(data.explanation)}</p><div class="kano-workshop-forecast-coverage" data-level="${data.coverageGaps ? 'partial' : data.canForecast ? 'complete' : 'empty'}">COVERAGE: ${escapeWorkshopHTML(data.coverageLabel)}.</div><div class="kano-workshop-forecast-baseline"><strong>BASELINE MONTHS</strong><span>${recentLabel}</span></div><small class="kano-workshop-forecast-note">Scenarios are estimates, not predictions or a spending lock. Recorded spend includes only retained ledger data. Unknown or partial months are not assumed to have zero spend and can make totals and scenarios understated.</small></section>`;
}

function handleWorkshopAnnualBudgetAction(action) {
  const panel = document.getElementById('kano-workshop-panel');
  const game = activeGame || window.__KANO_LIFE_GAME__;
  if (!panel) return;
  const year = panel.querySelector('[data-kano-workshop-annual-year]')?.value || String(new Date().getFullYear());
  if (!/^\d{4}$/.test(year) || Number(year) < 1900 || Number(year) > 9999) {
    setWorkshopMessage('Annual budget action rejected because the report year is invalid. No setting was changed.');
    return;
  }
  panel.dataset.annualReportYear = year;
  if (action === 'clear') {
    if (!window.confirm(`Remove the saved annual workshop target for ${year}? Spending history, monthly limits and gameplay data will remain unchanged.`)) return;
    const budgets = readWorkshopAnnualBudgets();
    delete budgets.targets[year];
    if (!saveWorkshopAnnualBudgets(budgets)) {
      setWorkshopMessage('Could not remove the annual target because browser storage could not verify the change.');
      return;
    }
    panel.dataset.signature = '';
    panel.dataset.message = `Annual workshop target for ${year} removed. Spending history and gameplay data were not changed.`;
    renderWorkshopPanel(game?.s || window.__KANO_LIFE_GAME__?.s);
    return;
  }
  if (action !== 'save') return;
  const input = panel.querySelector('[data-kano-workshop-annual-budget-amount]');
  const targetNaira = Math.floor(Number(input?.value));
  if (!Number.isFinite(targetNaira) || targetNaira < 1 || targetNaira > 1000000000) {
    setWorkshopMessage('Enter an annual target from ₦1 to ₦1,000,000,000. No setting was changed.');
    input?.focus();
    return;
  }
  const budgets = readWorkshopAnnualBudgets();
  budgets.targets[year] = { targetNaira, updatedAt: Date.now() };
  if (!saveWorkshopAnnualBudgets(budgets)) {
    setWorkshopMessage('Could not save the annual target because browser storage could not verify the change. Existing targets were not intentionally changed.');
    return;
  }
  panel.dataset.signature = '';
  panel.dataset.message = `Annual workshop target saved for ${year} at ${naira(targetNaira)}. It does not reserve money or block repairs.`;
  renderWorkshopPanel(game?.s || window.__KANO_LIFE_GAME__?.s);
}

function workshopAnnualReportYearOptions(ledger = ensureWorkshopSpendingLedger()) {
  const currentYearNumber = new Date().getFullYear();
  const currentYear = String(currentYearNumber);
  const years = new Set([currentYear, String(currentYearNumber + 1), String(currentYearNumber + 2), String(currentYearNumber + 3)]);
  for (const year of Object.keys(readWorkshopAnnualBudgets().targets || {})) years.add(year);
  for (const key of Object.keys(ledger.months || {})) {
    const match = /^(\d{4})-(0[1-9]|1[0-2])$/.exec(key);
    if (match) years.add(match[1]);
  }
  return [...years].sort((a, b) => Number(b) - Number(a));
}

function workshopAnnualReportData(requestedYear = '') {
  const ledger = ensureWorkshopSpendingLedger();
  const options = workshopAnnualReportYearOptions(ledger);
  const currentYear = new Date().getFullYear();
  const selectedYear = options.includes(String(requestedYear)) ? String(requestedYear) : String(currentYear);
  const yearNumber = Number(selectedYear);
  const isCurrentYear = yearNumber === currentYear;
  const monthLimit = isCurrentYear ? new Date().getMonth() + 1 : 12;
  const monthNames = Array.from({ length: 12 }, (_, index) => new Date(yearNumber, index, 1, 12)
    .toLocaleDateString('en-NG', { month: 'long' }));
  const months = [];
  for (let number = 1; number <= monthLimit; number += 1) {
    const key = `${selectedYear}-${String(number).padStart(2, '0')}`;
    const raw = ledger.months?.[key] || null;
    const transactions = Array.isArray(raw?.transactions) ? raw.transactions : [];
    const trackedCount = transactions.length;
    const trackedSpend = transactions.reduce((sum, entry) => sum + Math.max(0, Math.floor(Number(entry.cost) || 0)), 0);
    const archivedCount = Math.max(0, Math.floor(Number(raw?.archivedCount) || 0));
    const archivedNaira = Math.max(0, Math.floor(Number(raw?.archivedNaira) || 0));
    const totalSpend = trackedSpend + archivedNaira;
    const coverage = !raw
      ? 'NO DATA'
      : Boolean(raw.coverageComplete) && archivedCount === 0 && archivedNaira === 0
        ? 'COMPLETE'
        : 'PARTIAL';
    months.push({
      key, monthNumber: number, monthName: monthNames[number - 1], shortName: monthNames[number - 1].slice(0, 3),
      trackedCount, trackedSpend, archivedCount, archivedNaira, totalSpend, coverage,
      hasLedgerMonth: Boolean(raw),
    });
  }
  const trackedCount = months.reduce((sum, month) => sum + month.trackedCount, 0);
  const trackedSpend = months.reduce((sum, month) => sum + month.trackedSpend, 0);
  const archivedCount = months.reduce((sum, month) => sum + month.archivedCount, 0);
  const archivedNaira = months.reduce((sum, month) => sum + month.archivedNaira, 0);
  const totalSpend = trackedSpend + archivedNaira;
  const completeMonths = months.filter((month) => month.coverage === 'COMPLETE').length;
  const partialMonths = months.filter((month) => month.coverage === 'PARTIAL').length;
  const noDataMonths = months.filter((month) => month.coverage === 'NO DATA').length;
  const dataMonths = months.filter((month) => month.hasLedgerMonth);
  const highestSpendMonth = dataMonths.reduce((best, month) => !best || month.totalSpend > best.totalSpend ? month : best, null);
  const quarters = [0, 1, 2, 3].map((index) => {
    const quarterMonths = months.filter((month) => Math.floor((month.monthNumber - 1) / 3) === index);
    return {
      name: `Q${index + 1}`,
      months: quarterMonths,
      trackedCount: quarterMonths.reduce((sum, month) => sum + month.trackedCount, 0),
      trackedSpend: quarterMonths.reduce((sum, month) => sum + month.trackedSpend, 0),
      archivedCount: quarterMonths.reduce((sum, month) => sum + month.archivedCount, 0),
      archivedNaira: quarterMonths.reduce((sum, month) => sum + month.archivedNaira, 0),
      totalSpend: quarterMonths.reduce((sum, month) => sum + month.totalSpend, 0),
      monthsWithData: quarterMonths.filter((month) => month.hasLedgerMonth).length,
    };
  }).filter((quarter) => quarter.months.length > 0);
  return {
    selectedYear, options, months, quarters, isCurrentYear, trackedCount, trackedSpend,
    archivedCount, archivedNaira, totalSpend,
    averageTrackedCost: trackedCount ? Math.round(trackedSpend / trackedCount) : 0,
    completeMonths, partialMonths, noDataMonths,
    highestSpendMonth,
    periodLabel: isCurrentYear ? `JANUARY–${monthNames[monthLimit - 1].toUpperCase()} ${selectedYear}` : `JANUARY–DECEMBER ${selectedYear}`,
  };
}

function workshopAnnualComparisonData(requestedYear = '') {
  const report = workshopAnnualReportData(requestedYear);
  const selectedYear = report.selectedYear;
  const previousYear = String(Number(selectedYear) - 1);
  const monthCount = report.months.length;
  const ledger = ensureWorkshopSpendingLedger();

  const summarizeYear = (year) => {
    const months = [];
    for (let number = 1; number <= monthCount; number += 1) {
      const key = `${year}-${String(number).padStart(2, '0')}`;
      const raw = ledger.months?.[key] || null;
      const transactions = Array.isArray(raw?.transactions) ? raw.transactions : [];
      const trackedCount = transactions.length;
      const trackedSpend = transactions.reduce((sum, entry) => sum + Math.max(0, Math.floor(Number(entry.cost) || 0)), 0);
      const archivedCount = Math.max(0, Math.floor(Number(raw?.archivedCount) || 0));
      const archivedNaira = Math.max(0, Math.floor(Number(raw?.archivedNaira) || 0));
      const totalSpend = trackedSpend + archivedNaira;
      const coverage = !raw
        ? 'NO DATA'
        : Boolean(raw.coverageComplete) && archivedCount === 0 && archivedNaira === 0
          ? 'COMPLETE'
          : 'PARTIAL';
      months.push({
        key, monthNumber: number,
        monthName: new Date(2020, number - 1, 1, 12).toLocaleDateString('en-NG', { month: 'long' }),
        trackedCount, trackedSpend, archivedCount, archivedNaira, totalSpend, coverage,
        hasLedgerMonth: Boolean(raw),
      });
    }
    const totals = months.reduce((sum, month) => ({
      trackedCount: sum.trackedCount + month.trackedCount,
      trackedSpend: sum.trackedSpend + month.trackedSpend,
      archivedCount: sum.archivedCount + month.archivedCount,
      archivedNaira: sum.archivedNaira + month.archivedNaira,
      totalSpend: sum.totalSpend + month.totalSpend,
    }), { trackedCount: 0, trackedSpend: 0, archivedCount: 0, archivedNaira: 0, totalSpend: 0 });
    return {
      year, months, ...totals,
      monthsWithData: months.filter((month) => month.hasLedgerMonth).length,
      completeMonths: months.filter((month) => month.coverage === 'COMPLETE').length,
      partialMonths: months.filter((month) => month.coverage === 'PARTIAL').length,
      noDataMonths: months.filter((month) => month.coverage === 'NO DATA').length,
      hasAnyData: months.some((month) => month.hasLedgerMonth),
    };
  };

  const current = summarizeYear(selectedYear);
  const previous = summarizeYear(previousYear);
  const spendChange = current.hasAnyData && previous.hasAnyData ? current.totalSpend - previous.totalSpend : null;
  const spendChangePercent = spendChange !== null && previous.totalSpend > 0 ? (spendChange / previous.totalSpend) * 100 : null;
  const transactionChange = current.hasAnyData && previous.hasAnyData ? current.trackedCount - previous.trackedCount : null;
  const quarters = [0, 1, 2, 3].map((index) => {
    const start = index * 3;
    const currentMonths = current.months.slice(start, start + 3);
    const previousMonths = previous.months.slice(start, start + 3);
    const sum = (months) => months.reduce((total, month) => total + month.totalSpend, 0);
    return {
      name: `Q${index + 1}`,
      monthsCompared: currentMonths.length,
      currentSpend: currentMonths.some((month) => month.hasLedgerMonth) ? sum(currentMonths) : null,
      previousSpend: previousMonths.some((month) => month.hasLedgerMonth) ? sum(previousMonths) : null,
      currentMonthsWithData: currentMonths.filter((month) => month.hasLedgerMonth).length,
      previousMonthsWithData: previousMonths.filter((month) => month.hasLedgerMonth).length,
    };
  }).filter((quarter) => quarter.monthsCompared > 0);

  const monthEnd = report.months[report.months.length - 1]?.monthName || 'December';
  const comparablePeriodLabel = `JANUARY–${monthEnd.toUpperCase()}`;
  const hasIncompleteCoverage = [...current.months, ...previous.months].some((month) => month.coverage !== 'COMPLETE');
  return {
    selectedYear, previousYear, monthCount, comparablePeriodLabel,
    current, previous, spendChange, spendChangePercent, transactionChange, quarters,
    hasIncompleteCoverage,
    baselineLabel: !current.hasAnyData ? 'NO SELECTED-YEAR DATA' : !previous.hasAnyData ? 'NO PRIOR-YEAR DATA' : previous.totalSpend > 0 ? 'AVAILABLE' : 'ZERO RECORDED SPEND',
  };
}

function workshopAnnualReportBodyMarkup(requestedYear = '') {
  const data = workshopAnnualReportData(requestedYear);
  const comparison = workshopAnnualComparisonData(data.selectedYear);
  const annualBudgetMarkup = workshopAnnualBudgetMarkup(data.selectedYear);
  const annualForecastMarkup = workshopAnnualForecastMarkup(data.selectedYear);
  const money = (value) => naira(value);
  const coverageLabel = `${data.completeMonths} complete · ${data.partialMonths} partial · ${data.noDataMonths} without data`;
  const monthRows = data.months.map((month) => {
    const statusClass = month.coverage === 'COMPLETE' ? 'complete' : month.coverage === 'PARTIAL' ? 'partial' : 'empty';
    return `<tr><td><strong>${escapeWorkshopHTML(month.monthName)}</strong></td><td><span class="kano-workshop-annual-status" data-level="${statusClass}">${escapeWorkshopHTML(month.coverage)}</span></td><td>${month.trackedCount}</td><td class="kano-workshop-annual-money">${money(month.trackedSpend)}</td><td class="kano-workshop-annual-money">${money(month.archivedNaira)}${month.archivedCount ? `<small>${month.archivedCount} archived</small>` : ''}</td><td class="kano-workshop-annual-money"><strong>${money(month.totalSpend)}</strong></td></tr>`;
  }).join('');
  const quarterRows = data.quarters.map((quarter) => `<div class="kano-workshop-annual-quarter"><div><strong>${quarter.name}</strong><small>${quarter.monthsWithData}/ ${quarter.months.length} months with ledger data</small></div><strong>${money(quarter.totalSpend)}</strong></div>`).join('');
  const highest = data.highestSpendMonth
    ? `${data.highestSpendMonth.monthName}: ${money(data.highestSpendMonth.totalSpend)}`
    : 'No ledger months recorded';
  const changeClass = comparison.spendChange === null ? 'unknown' : comparison.spendChange > 0 ? 'up' : comparison.spendChange < 0 ? 'down' : 'flat';
  const changeAmount = comparison.spendChange === null ? comparison.baselineLabel : comparison.spendChange > 0 ? `+${money(comparison.spendChange)}` : comparison.spendChange < 0 ? `−${money(Math.abs(comparison.spendChange))}` : money(0);
  const changePercent = comparison.spendChangePercent === null ? comparison.baselineLabel : `${comparison.spendChangePercent > 0 ? '+' : ''}${comparison.spendChangePercent.toFixed(1)}%`;
  const barMaximum = Math.max(1, ...comparison.quarters.flatMap((quarter) => [quarter.currentSpend, quarter.previousSpend]));
  const comparisonRows = comparison.quarters.map((quarter) => {
    const currentWidth = Math.max(0, Math.min(100, ((quarter.currentSpend || 0) / barMaximum) * 100));
    const previousWidth = Math.max(0, Math.min(100, ((quarter.previousSpend || 0) / barMaximum) * 100));
    return `<div class="kano-workshop-yoy-quarter"><div class="kano-workshop-yoy-quarter-head"><strong>${quarter.name}</strong><span>${quarter.currentMonthsWithData}/${quarter.monthsCompared} current · ${quarter.previousMonthsWithData}/${quarter.monthsCompared} prior months with data</span></div><div class="kano-workshop-yoy-barline"><span>${comparison.selectedYear}</span><div class="kano-workshop-yoy-track"><i data-year="current" style="width:${currentWidth.toFixed(2)}%"></i></div><strong>${quarter.currentSpend === null ? 'NO DATA' : money(quarter.currentSpend)}</strong></div><div class="kano-workshop-yoy-barline"><span>${comparison.previousYear}</span><div class="kano-workshop-yoy-track"><i data-year="previous" style="width:${previousWidth.toFixed(2)}%"></i></div><strong>${quarter.previousSpend === null ? 'NO DATA' : money(quarter.previousSpend)}</strong></div></div>`;
  }).join('');
  const comparisonMarkup = `<section class="kano-workshop-yoy" aria-labelledby="kano-workshop-yoy-title"><div class="kano-workshop-yoy-heading"><div><h5 id="kano-workshop-yoy-title">YEAR-OVER-YEAR COMPARISON</h5><p>${escapeWorkshopHTML(comparison.comparablePeriodLabel)} ${comparison.selectedYear} vs ${comparison.previousYear}</p></div><span class="kano-workshop-yoy-badge" data-change="${changeClass}">${escapeWorkshopHTML(changeAmount)}</span></div><div class="kano-workshop-yoy-metrics"><div><span>${comparison.selectedYear} RECORDED SPEND</span><strong>${comparison.current.hasAnyData ? money(comparison.current.totalSpend) : 'NO DATA'}</strong><small>${comparison.current.trackedCount} tracked transactions · ${comparison.current.monthsWithData}/${comparison.monthCount} months with data</small></div><div><span>${comparison.previousYear} COMPARABLE SPEND</span><strong>${comparison.previous.hasAnyData ? money(comparison.previous.totalSpend) : 'NO DATA'}</strong><small>${comparison.previous.trackedCount} tracked transactions · ${comparison.previous.monthsWithData}/${comparison.monthCount} months with data</small></div><div><span>SPENDING CHANGE</span><strong>${escapeWorkshopHTML(changePercent)}</strong><small>${comparison.transactionChange === null ? 'Transaction comparison unavailable' : `${comparison.transactionChange > 0 ? '+' : ''}${comparison.transactionChange} tracked transaction difference`}</small></div></div><div class="kano-workshop-yoy-chart"><div class="kano-workshop-yoy-chart-title"><strong>QUARTERLY SPENDING</strong><span><i data-year="current"></i>${comparison.selectedYear}<i data-year="previous"></i>${comparison.previousYear}</span></div>${comparisonRows}</div><p class="kano-workshop-yoy-note">Both years use the same month range. Missing ledger months are unknown, not zero spending. ${comparison.hasIncompleteCoverage ? 'At least one compared month is partial or missing, so the difference may be incomplete.' : 'All compared months have complete coverage in both periods.'} Archived amounts are included in totals where recorded.</p></section>`;
  return `<div class="kano-workshop-annual-period" role="status"><strong>${escapeWorkshopHTML(data.periodLabel)}</strong><span>${escapeWorkshopHTML(coverageLabel)}</span></div><div class="kano-workshop-annual-metrics"><div><span>TOTAL RECORDED</span><strong>${money(data.totalSpend)}</strong><small>Tracked plus archived</small></div><div><span>TRACKED TRANSACTIONS</span><strong>${data.trackedCount}</strong><small>${money(data.trackedSpend)} itemised total</small></div><div><span>ARCHIVED SPEND</span><strong>${money(data.archivedNaira)}</strong><small>${data.archivedCount} archived transactions</small></div><div><span>AVERAGE TRACKED COST</span><strong>${money(data.averageTrackedCost)}</strong><small>Tracked transactions only</small></div></div>${annualBudgetMarkup}${annualForecastMarkup}${comparisonMarkup}<div class="kano-workshop-annual-highlights"><div><span>HIGHEST RECORDED MONTH</span><strong>${escapeWorkshopHTML(highest)}</strong></div><div class="kano-workshop-annual-quarter-list"><span>QUARTER TOTALS</span>${quarterRows}</div></div><div class="kano-workshop-ledger-table-wrap kano-workshop-annual-table-wrap"><table class="kano-workshop-ledger-table kano-workshop-annual-table"><thead><tr><th>MONTH</th><th>COVERAGE</th><th>TRANSACTIONS</th><th>TRACKED SPEND</th><th>ARCHIVED SPEND</th><th>TOTAL RECORDED</th></tr></thead><tbody>${monthRows}</tbody><tfoot><tr><th colspan="2">YEAR TOTAL</th><th>${data.trackedCount}</th><th class="kano-workshop-annual-money">${money(data.trackedSpend)}</th><th class="kano-workshop-annual-money">${money(data.archivedNaira)}</th><th class="kano-workshop-annual-money">${money(data.totalSpend)}</th></tr></tfoot></table></div><p class="kano-workshop-annual-coverage-note">Months labelled NO DATA are unknown, not proof of zero spending. Annual totals include only months retained in this browser's spending ledger. Archived amounts are included but cannot be itemised. An incomplete period must not be treated as a guaranteed lifetime or accounting total.</p>`;
}

function workshopAnnualReportMarkup(requestedYear = '') {
  const data = workshopAnnualReportData(requestedYear);
  const options = data.options.map((year) => `<option value="${year}" ${year === data.selectedYear ? 'selected' : ''}>${year}</option>`).join('');
  return `<section class="kano-workshop-annual-report" aria-labelledby="kano-workshop-annual-report-title"><div class="kano-workshop-annual-heading"><div><h4 id="kano-workshop-annual-report-title">YEARLY &amp; QUARTERLY WORKSHOP REPORT</h4><p>Review saved workshop spending by month and quarter.</p></div><div class="kano-workshop-annual-actions"><button type="button" data-kano-workshop-annual-export>EXPORT YEAR CSV</button><button type="button" data-kano-workshop-annual-print>PRINT / SAVE PDF</button></div></div><label class="kano-workshop-annual-year-picker">REPORT YEAR<select data-kano-workshop-annual-year aria-label="Choose workshop report year">${options}</select></label><div data-kano-workshop-annual-body>${workshopAnnualReportBodyMarkup(data.selectedYear)}</div><small class="kano-workshop-annual-note">This report is read-only. It does not charge the wallet or change vehicle condition or driving progress.</small></section>`;
}

function downloadWorkshopAnnualReport(requestedYear = '') {
  const data = workshopAnnualReportData(requestedYear);
  const comparison = workshopAnnualComparisonData(data.selectedYear);
  const csvCell = (value) => {
    let safe = String(value ?? '');
    if (/^[\t\r ]*[=+\-@]/.test(safe)) safe = `'${safe}`;
    return `"${safe.replace(/"/g, '""')}"`;
  };
  const header = [
    'Report year', 'Period type', 'Period', 'Coverage', 'Tracked transaction count',
    'Tracked spend (NGN)', 'Archived transaction count', 'Archived spend (NGN)', 'Total recorded spend (NGN)',
    'Comparison baseline year', 'Prior-period total spend (NGN)', 'Selected-period total spend (NGN)', 'Spend change (NGN)', 'Spend change (%)',
    'Annual budget target (NGN)', 'Recorded spend used for target (NGN)', 'Budget remaining / overrun (NGN)', 'Target used (%)', 'Target status and coverage',
    'Recent 3-complete-month average (NGN)', 'Projected remaining month equivalents', 'Low scenario year-end spend (NGN)', 'Base scenario year-end spend (NGN)', 'High scenario year-end spend (NGN)', 'Forecast status and coverage',
  ];
  const rows = data.months.map((month) => [data.selectedYear, 'MONTH', month.key, month.coverage,
    month.trackedCount, month.trackedSpend, month.archivedCount, month.archivedNaira, month.totalSpend, '', '', '', '', '']);
  for (const quarter of data.quarters) {
    rows.push([data.selectedYear, 'QUARTER', quarter.name, `${quarter.monthsWithData}/${quarter.months.length} months with ledger data`,
      quarter.trackedCount, quarter.trackedSpend, quarter.archivedCount, quarter.archivedNaira, quarter.totalSpend, '', '', '', '', '']);
  }
  rows.push([data.selectedYear, 'YEAR TOTAL', data.periodLabel,
    `${data.completeMonths} complete; ${data.partialMonths} partial; ${data.noDataMonths} without data`,
    data.trackedCount, data.trackedSpend, data.archivedCount, data.archivedNaira, data.totalSpend, '', '', '', '', '']);
  rows.push([data.selectedYear, 'YEAR-OVER-YEAR COMPARISON', `${comparison.selectedYear} vs ${comparison.previousYear}`,
    `${comparison.comparablePeriodLabel}; ${comparison.monthCount} matched months; prior coverage: ${comparison.previous.completeMonths} complete, ${comparison.previous.partialMonths} partial, ${comparison.previous.noDataMonths} missing`,
    '', '', '', '', '', comparison.previousYear, comparison.previous.hasAnyData ? comparison.previous.totalSpend : 'N/A', comparison.current.hasAnyData ? comparison.current.totalSpend : 'N/A', comparison.spendChange,
    comparison.spendChangePercent === null ? 'N/A' : comparison.spendChangePercent.toFixed(2)]);
  for (const quarter of comparison.quarters) {
    const quarterComparable = quarter.currentSpend !== null && quarter.previousSpend !== null;
    const quarterChange = quarterComparable ? quarter.currentSpend - quarter.previousSpend : '';
    const percent = quarterComparable && quarter.previousSpend > 0 ? (quarterChange / quarter.previousSpend) * 100 : null;
    rows.push([data.selectedYear, 'QUARTER COMPARISON', quarter.name, `${quarter.monthsCompared} matched month(s); current coverage ${quarter.currentMonthsWithData}, prior coverage ${quarter.previousMonthsWithData}`, '', '', '', '', '', comparison.previousYear, quarter.previousSpend === null ? 'N/A' : quarter.previousSpend, quarter.currentSpend === null ? 'N/A' : quarter.currentSpend, quarterChange, percent === null ? 'N/A' : percent.toFixed(2)]);
  }
  const annualBudget = workshopAnnualBudgetData(data.selectedYear);
  const budgetCoverage = !annualBudget.hasLedgerData ? 'NO LEDGER DATA' : annualBudget.coverageComplete ? 'COMPLETE' : 'PARTIAL OR MISSING MONTHS';
  rows.push([data.selectedYear, 'ANNUAL BUDGET TARGET', data.periodLabel, budgetCoverage, '', '', '', '', '', '', '', '', '', '',
    annualBudget.target ? annualBudget.target.targetNaira : 'N/A',
    annualBudget.recordedSpend === null ? 'N/A' : annualBudget.recordedSpend,
    annualBudget.remaining === null ? 'N/A' : annualBudget.remaining,
    annualBudget.progress === null ? 'N/A' : annualBudget.progress.toFixed(2),
    `${annualBudget.status}; ${budgetCoverage}`]);
  const annualForecast = workshopAnnualForecastData(data.selectedYear);
  const forecastRow = [data.selectedYear, 'YEAR-END FORECAST', annualForecast.periodLabel, annualForecast.coverageLabel];
  while (forecastRow.length < 19) forecastRow.push('');
  forecastRow.push(annualForecast.recentAverage === null ? 'N/A' : annualForecast.recentAverage,
    annualForecast.remainingMonthEquivalents === null ? 'N/A' : annualForecast.remainingMonthEquivalents.toFixed(2),
    annualForecast.lowProjection === null ? 'N/A' : annualForecast.lowProjection,
    annualForecast.baseProjection === null ? 'N/A' : annualForecast.baseProjection,
    annualForecast.highProjection === null ? 'N/A' : annualForecast.highProjection,
    `${annualForecast.status}; ${annualForecast.explanation}`);
  rows.push(forecastRow);
  for (const row of rows) while (row.length < header.length) row.push('');
  const csv = '\uFEFF' + [header, ...rows].map((row) => row.map(csvCell).join(',')).join('\r\n');
  try {
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `kano-life-workshop-annual-report-${data.selectedYear}.csv`;
    link.style.display = 'none';
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    return true;
  } catch (error) {
    console.warn('[Kano Life] Could not export annual workshop report.', error);
    try { window.prompt('Copy the annual workshop report CSV:', csv); } catch (_) {}
    return false;
  }
}

function openWorkshopAnnualReportPrint(requestedYear = '') {
  const data = workshopAnnualReportData(requestedYear);
  const comparison = workshopAnnualComparisonData(data.selectedYear);
  const annualBudget = workshopAnnualBudgetData(data.selectedYear);
  const annualForecast = workshopAnnualForecastData(data.selectedYear);
  const money = (value) => naira(value);
  const htmlEscape = (value) => escapeWorkshopHTML(value);
  const monthRows = data.months.map((month) => `<tr><td>${htmlEscape(month.monthName)}</td><td>${htmlEscape(month.coverage)}</td><td class="num">${month.trackedCount}</td><td class="num">${money(month.trackedSpend)}</td><td class="num">${month.archivedCount} / ${money(month.archivedNaira)}</td><td class="num total">${money(month.totalSpend)}</td></tr>`).join('');
  const quarterRows = data.quarters.map((quarter) => `<tr><td>${quarter.name}</td><td>${quarter.monthsWithData} of ${quarter.months.length}</td><td class="num">${quarter.trackedCount}</td><td class="num">${money(quarter.trackedSpend)}</td><td class="num">${quarter.archivedCount} / ${money(quarter.archivedNaira)}</td><td class="num total">${money(quarter.totalSpend)}</td></tr>`).join('');
  const comparisonQuarterRows = comparison.quarters.map((quarter) => {
    const comparable = quarter.currentSpend !== null && quarter.previousSpend !== null;
    const change = comparable ? quarter.currentSpend - quarter.previousSpend : null;
    const percent = comparable && quarter.previousSpend > 0 ? `${change > 0 ? '+' : ''}${((change / quarter.previousSpend) * 100).toFixed(1)}%` : 'N/A';
    const previousLabel = quarter.previousSpend === null ? 'NO DATA' : money(quarter.previousSpend);
    const currentLabel = quarter.currentSpend === null ? 'NO DATA' : money(quarter.currentSpend);
    const changeLabel = change === null ? 'N/A' : `${change > 0 ? '+' : change < 0 ? '−' : ''}${money(Math.abs(change))}`;
    return `<tr><td>${quarter.name}</td><td>${quarter.monthsCompared}</td><td class="num">${previousLabel}</td><td class="num">${currentLabel}</td><td class="num">${changeLabel}</td><td class="num">${percent}</td></tr>`;
  }).join('');
  const comparisonChange = comparison.spendChange === null ? comparison.baselineLabel : comparison.spendChange > 0 ? `+${money(comparison.spendChange)}` : comparison.spendChange < 0 ? `−${money(Math.abs(comparison.spendChange))}` : money(0);
  const comparisonPercent = comparison.spendChangePercent === null ? comparison.baselineLabel : `${comparison.spendChangePercent > 0 ? '+' : ''}${comparison.spendChangePercent.toFixed(1)}%`;
  const annualBudgetSection = `<section class="comparison annual-budget"><h2>Annual Budget Target · ${htmlEscape(annualBudget.selectedYear)}</h2><div class="comparison-metrics"><div class="comparison-metric"><span>ANNUAL TARGET</span><strong>${annualBudget.target ? money(annualBudget.target.targetNaira) : 'NOT SET'}</strong></div><div class="comparison-metric"><span>RECORDED SPEND</span><strong>${annualBudget.recordedSpend === null ? 'NO DATA' : money(annualBudget.recordedSpend)}</strong></div><div class="comparison-metric"><span>REMAINING / OVERRUN</span><strong>${annualBudget.remaining === null ? 'N/A' : annualBudget.remaining < 0 ? `OVER BY ${money(Math.abs(annualBudget.remaining))}` : money(annualBudget.remaining)}</strong></div></div><p>Status: ${htmlEscape(annualBudget.status)} · Target used: ${annualBudget.progress === null ? 'N/A' : `${annualBudget.progress.toFixed(1)}%`} · Coverage: ${htmlEscape(!annualBudget.hasLedgerData ? 'NO DATA' : annualBudget.coverageComplete ? 'COMPLETE' : 'PARTIAL OR MISSING MONTHS')}.</p><p>Target remaining/overrun uses only recorded spending. Missing ledger months are unknown and may understate actual spend; target settings do not reserve funds or block repairs.</p></section>`;
  const forecastScenario = (label, value, note) => `<div class="comparison-metric"><span>${htmlEscape(label)}</span><strong>${value === null ? 'NOT AVAILABLE' : money(value)}</strong><small>${htmlEscape(note)}</small></div>`;
  const annualForecastSection = `<section class="comparison annual-forecast"><h2>Annual Budget Pace &amp; Year-End Forecast · ${htmlEscape(annualForecast.selectedYear)}</h2><div class="comparison-metrics"><div class="comparison-metric"><span>KNOWN RECORDED SPEND</span><strong>${annualForecast.recordedSpend === null ? 'NO DATA' : money(annualForecast.recordedSpend)}</strong></div><div class="comparison-metric"><span>RECENT MONTHLY BASELINE</span><strong>${annualForecast.recentAverage === null ? 'NOT AVAILABLE' : money(annualForecast.recentAverage)}</strong></div><div class="comparison-metric"><span>BASE SCENARIO VS TARGET</span><strong>${!annualForecast.annualTarget ? 'NO TARGET SET' : !annualForecast.canForecast ? 'N/A' : annualForecast.targetVariance < 0 ? `OVER BY ${money(Math.abs(annualForecast.targetVariance))}` : annualForecast.targetVariance === 0 ? 'AT TARGET' : `${money(annualForecast.targetVariance)} BELOW TARGET`}</strong></div></div><div class="comparison-metrics">${forecastScenario('LOW SCENARIO', annualForecast.lowProjection, 'Recent lowest complete month rate')}${forecastScenario('BASE SCENARIO', annualForecast.baseProjection, 'Recent 3-month average rate')}${forecastScenario('HIGH SCENARIO', annualForecast.highProjection, 'Recent highest complete month rate')}</div><p>Status: ${htmlEscape(annualForecast.status)} · Coverage: ${htmlEscape(annualForecast.coverageLabel)}.</p><p>${htmlEscape(annualForecast.explanation)} Unknown or partial months are not assumed to have zero spending.</p></section>`;
  const coverageSummary = `${data.completeMonths} complete month(s), ${data.partialMonths} partial month(s), ${data.noDataMonths} month(s) without ledger data`;
  const highestMonth = data.highestSpendMonth ? `${data.highestSpendMonth.monthName}: ${money(data.highestSpendMonth.totalSpend)}` : 'No ledger months recorded';
  const preparedAt = new Date().toLocaleString('en-NG', { dateStyle: 'medium', timeStyle: 'short' });
  const printDocument = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Kano Life Workshop Report ${htmlEscape(data.selectedYear)}</title><style>
    :root{color-scheme:light}*{box-sizing:border-box}body{margin:0;padding:24px;font-family:Arial,Helvetica,sans-serif;color:#142033;background:#fff;font-size:11px;line-height:1.4}
    .toolbar{display:flex;gap:8px;justify-content:flex-end;margin:0 0 16px}.toolbar button{padding:9px 13px;border:1px solid #223d5a;border-radius:6px;background:#10243a;color:#fff;font-size:11px;font-weight:700;cursor:pointer}
    header{display:flex;justify-content:space-between;align-items:flex-start;gap:20px;padding-bottom:13px;border-bottom:3px solid #10243a}h1{font-size:22px;margin:0 0 4px;color:#10243a}header p{margin:0;color:#52637a}header .meta{text-align:right;font-size:10px;color:#52637a;white-space:nowrap}
    .period{display:flex;justify-content:space-between;gap:12px;align-items:center;margin:13px 0;padding:9px 11px;background:#eef4f9;border:1px solid #d6e0eb;border-radius:5px}.period strong{font-size:12px;color:#10243a}.period span{color:#45566d;text-align:right}
    .metrics{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:8px;margin:10px 0 14px}.metric{border:1px solid #d6e0eb;border-radius:5px;padding:10px;min-width:0}.metric span{display:block;color:#52637a;font-size:9px;font-weight:bold;text-transform:uppercase}.metric strong{display:block;margin:5px 0 2px;color:#10243a;font-size:17px;overflow-wrap:anywhere}.metric small{color:#67778b}
    .comparison{margin:12px 0;padding:10px;border:1px solid #c8d5e3;border-radius:5px}.comparison h2{margin-top:0}.comparison-metrics{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px;margin-bottom:9px}.comparison-metric{padding:8px;border:1px solid #dbe4ed;border-radius:4px;min-width:0}.comparison-metric span{display:block;color:#52637a;font-size:8px;font-weight:bold}.comparison-metric strong{display:block;margin-top:4px;color:#10243a;font-size:13px;overflow-wrap:anywhere}.comparison p{margin:7px 0;color:#52637a;font-size:9px}
    h2{margin:16px 0 7px;color:#10243a;font-size:13px}table{width:100%;border-collapse:collapse;table-layout:auto}th,td{border:1px solid #d5dee8;padding:6px 7px;vertical-align:top}th{background:#eaf0f6;color:#23364d;text-align:left;font-size:9px;text-transform:uppercase}tbody tr:nth-child(even){background:#f8fafc}.num{text-align:right;white-space:nowrap}.total{font-weight:bold;color:#10243a}.coverage{margin:9px 0;padding:9px;border-left:3px solid #d5a600;background:#fff9df;color:#53451d}.foot{margin-top:20px;padding-top:8px;border-top:1px solid #d5dee8;color:#637186;font-size:9px}
    @page{size:landscape;margin:12mm}@media print{body{padding:0;font-size:9px}.toolbar{display:none}.metrics{gap:5px}.metric{padding:7px}.metric strong{font-size:14px}.comparison{padding:7px}.comparison-metrics{gap:5px}.comparison-metric{padding:5px}.comparison-metric strong{font-size:11px}h2{margin-top:12px}th,td{padding:4px 5px;break-inside:avoid}header,.period,.metrics,.comparison,table{break-inside:avoid}thead{display:table-header-group}tr{break-inside:avoid;page-break-inside:avoid}.foot{margin-top:12px}}
    @media(max-width:650px){body{padding:12px}.metrics{grid-template-columns:repeat(2,minmax(0,1fr))}header{flex-direction:column}.meta{text-align:left!important}.period{align-items:flex-start;flex-direction:column}.period span{text-align:left}}
  </style></head><body><div class="toolbar"><button type="button" onclick="window.print()">PRINT / SAVE AS PDF</button><button type="button" onclick="window.close()">CLOSE</button></div><header><div><h1>KANO LIFE</h1><p>Workshop Spending Report · Yearly &amp; Quarterly Summary</p></div><div class="meta"><div><strong>Report year:</strong> ${htmlEscape(data.selectedYear)}</div><div><strong>Prepared:</strong> ${htmlEscape(preparedAt)}</div></div></header><div class="period"><strong>${htmlEscape(data.periodLabel)}</strong><span>${htmlEscape(coverageSummary)}</span></div><section class="metrics"><div class="metric"><span>Total recorded spend</span><strong>${money(data.totalSpend)}</strong><small>Tracked plus archived amount</small></div><div class="metric"><span>Tracked transactions</span><strong>${data.trackedCount}</strong><small>${money(data.trackedSpend)} itemised spend</small></div><div class="metric"><span>Archived spend</span><strong>${money(data.archivedNaira)}</strong><small>${data.archivedCount} archived transactions</small></div><div class="metric"><span>Average tracked cost</span><strong>${money(data.averageTrackedCost)}</strong><small>Tracked transactions only</small></div></section>${annualBudgetSection}${annualForecastSection}<section class="comparison"><h2>Year-over-Year Comparison · ${htmlEscape(comparison.comparablePeriodLabel)} ${htmlEscape(comparison.selectedYear)} vs ${htmlEscape(comparison.previousYear)}</h2><div class="comparison-metrics"><div class="comparison-metric"><span>SELECTED PERIOD</span><strong>${comparison.current.hasAnyData ? money(comparison.current.totalSpend) : 'NO DATA'}</strong></div><div class="comparison-metric"><span>PRIOR COMPARABLE PERIOD</span><strong>${comparison.previous.hasAnyData ? money(comparison.previous.totalSpend) : 'NO DATA'}</strong></div><div class="comparison-metric"><span>SPENDING CHANGE</span><strong>${htmlEscape(comparisonChange)} · ${htmlEscape(comparisonPercent)}</strong></div></div><table><thead><tr><th>Quarter</th><th>Matched months</th><th>${htmlEscape(comparison.previousYear)} spend</th><th>${htmlEscape(comparison.selectedYear)} spend</th><th>Change</th><th>Change %</th></tr></thead><tbody>${comparisonQuarterRows}</tbody></table><p>Both periods use the same months. Missing months are unknown, not zero spending. ${comparison.hasIncompleteCoverage ? 'At least one compared month is partial or missing; changes may be incomplete.' : 'Both periods have complete ledger coverage for all compared months.'} Archived amounts are included where retained.</p></section><div class="coverage"><strong>Coverage note:</strong> Months marked NO DATA are unknown, not proof of zero spending. Archived amounts are included but cannot be itemised from the retained ledger. This report is limited to the available local records and is not a guaranteed lifetime accounting statement.</div><h2>Quarter Summary</h2><table><thead><tr><th>Quarter</th><th>Months with data</th><th>Tracked transactions</th><th>Tracked spend</th><th>Archived count / spend</th><th>Total recorded</th></tr></thead><tbody>${quarterRows || '<tr><td colspan="6">No quarter records available.</td></tr>'}</tbody></table><h2>Monthly Summary</h2><table><thead><tr><th>Month</th><th>Coverage</th><th>Tracked transactions</th><th>Tracked spend</th><th>Archived count / spend</th><th>Total recorded</th></tr></thead><tbody>${monthRows}</tbody><tfoot><tr><th colspan="2">YEAR TOTAL</th><th class="num">${data.trackedCount}</th><th class="num">${money(data.trackedSpend)}</th><th class="num">${data.archivedCount} / ${money(data.archivedNaira)}</th><th class="num total">${money(data.totalSpend)}</th></tr></tfoot></table><h2>Highest Recorded-Spend Month</h2><p>${htmlEscape(highestMonth)}</p><div class="foot">Generated from the workshop spending ledger saved in this browser. Printing or saving this report does not modify wallet funds, vehicle condition, scores or gameplay progress.</div></body></html>`;
  let printWindow = null;
  try {
    // Must be called directly in the user's button-click gesture for popup blockers.
    printWindow = window.open('', '_blank');
    if (!printWindow) {
      try { window.alert('The print window was blocked. Allow pop-ups for Kano Life, then select PRINT / SAVE PDF again.'); } catch (_) {}
      return false;
    }
    printWindow.document.open();
    printWindow.document.write(printDocument);
    printWindow.document.close();
    printWindow.focus();
    setTimeout(() => {
      try { if (!printWindow.closed) printWindow.print(); } catch (error) {
        console.warn('[Kano Life] Browser print dialog could not be opened.', error);
      }
    }, 300);
    return true;
  } catch (error) {
    console.warn('[Kano Life] Could not prepare annual workshop report for printing.', error);
    try { printWindow?.close(); } catch (_) {}
    try { window.alert('The printable report could not be opened in this browser. Use EXPORT YEAR CSV instead.'); } catch (_) {}
    return false;
  }
}

function workshopLedgerStatementMonthOptions(ledger = ensureWorkshopSpendingLedger()) {
  const currentMonth = workshopLedgerMonthKey(Date.now());
  return [...new Set([currentMonth, ...Object.keys(ledger.months || {})])]
    .filter((key) => /^\d{4}-(0[1-9]|1[0-2])$/.test(key))
    .sort((a, b) => b.localeCompare(a));
}

function workshopLedgerStatementData(requestedMonth = '') {
  const ledger = ensureWorkshopSpendingLedger();
  const options = workshopLedgerStatementMonthOptions(ledger);
  const selectedMonth = options.includes(requestedMonth)
    ? requestedMonth
    : (options[0] || workshopLedgerMonthKey(Date.now()));
  const month = ledger.months[selectedMonth] || null;
  const history = readWorkshopHistory().map((entry) => normalizeWorkshopBackupRecord({
    time: Number(entry.time), service: entry.service, parts: entry.parts,
    cost: entry.cost, walletAfter: entry.walletAfter,
    conditionBefore: entry.conditionBefore, conditionAfter: entry.conditionAfter,
  })).filter(Boolean);
  const receipts = new Map(history.map((record) => [workshopRecordIdentity(record), record]));
  const transactions = (month?.transactions || []).slice().sort((a, b) => b.time - a.time).map((entry) => {
    const receipt = receipts.get(entry.id) || null;
    const date = new Date(entry.time);
    const serviceLabels = { full: 'Full service', body: 'Body repair', engine: 'Engine service', tyres: 'Tyre service' };
    return {
      id: entry.id,
      time: entry.time,
      dateISO: Number.isNaN(date.getTime()) ? '' : date.toISOString(),
      dateLabel: Number.isNaN(date.getTime()) ? 'Date unavailable' : date.toLocaleString('en-NG', { dateStyle: 'medium', timeStyle: 'short' }),
      service: receipt ? (serviceLabels[receipt.service] || 'Workshop service') : 'Ledger transaction',
      components: receipt ? receipt.parts.map((key) => WORKSHOP_PARTS[key]?.label || '').filter(Boolean).join(' · ') : '',
      cost: Math.max(0, Math.floor(Number(entry.cost) || 0)),
      walletAfter: receipt ? receipt.walletAfter : null,
      receiptAvailable: Boolean(receipt),
    };
  });
  const archivedCount = Math.max(0, Math.floor(Number(month?.archivedCount) || 0));
  const archivedNaira = Math.max(0, Math.floor(Number(month?.archivedNaira) || 0));
  const trackedSpend = transactions.reduce((sum, row) => sum + row.cost, 0);
  const totalSpend = trackedSpend + archivedNaira;
  const coverageComplete = Boolean(month?.coverageComplete) && archivedCount === 0 && archivedNaira === 0;
  const coverage = !month && !transactions.length && !archivedCount && !archivedNaira
    ? 'NO TRACKED RECORDS'
    : coverageComplete ? 'COMPLETE' : 'PARTIAL';
  return {
    selectedMonth,
    monthLabel: (() => {
      const [year, monthNumber] = selectedMonth.split('-').map(Number);
      return new Date(year, monthNumber - 1, 1, 12).toLocaleDateString('en-NG', { month: 'long', year: 'numeric' });
    })(),
    options,
    transactions,
    trackedCount: transactions.length,
    trackedSpend,
    archivedCount,
    archivedNaira,
    totalSpend,
    coverageComplete,
    coverage,
    monthExists: Boolean(month),
  };
}

function workshopLedgerStatementBodyMarkup(requestedMonth = '') {
  const data = workshopLedgerStatementData(requestedMonth);
  const statusLevel = data.coverage === 'COMPLETE' ? 'complete' : data.coverage === 'PARTIAL' ? 'partial' : 'empty';
  const rows = data.transactions.length
    ? data.transactions.map((row) => `<tr><td>${escapeWorkshopHTML(row.dateLabel)}</td><td><strong>${escapeWorkshopHTML(row.service)}</strong><small>${escapeWorkshopHTML(row.receiptAvailable ? 'Receipt available' : 'Receipt not retained')}</small></td><td>${escapeWorkshopHTML(row.components || 'Details unavailable')}</td><td class="kano-workshop-ledger-money">${naira(row.cost)}</td></tr>`).join('')
    : `<tr><td colspan="4" class="kano-workshop-ledger-no-rows">No individually tracked workshop transactions are available for ${escapeWorkshopHTML(data.monthLabel)}. This does not prove that no workshop spending occurred if historic coverage is partial.</td></tr>`;
  const coverageNote = data.coverage === 'COMPLETE'
    ? 'The saved ledger marks this calendar month complete and contains no archived overflow.'
    : data.coverage === 'PARTIAL'
      ? 'This month is partial. The amount shown includes individually tracked transactions and any archived total, but archived transactions do not retain individual service details.'
      : 'No ledger month is saved for this period. Older or unrecorded spending cannot be inferred.';
  return `<div class="kano-workshop-ledger-statement-status" data-level="${statusLevel}" role="status"><strong>${escapeWorkshopHTML(data.coverage)}</strong><span>${escapeWorkshopHTML(data.monthLabel)} · ${data.trackedCount} individually tracked transaction${data.trackedCount === 1 ? '' : 's'}</span></div><div class="kano-workshop-ledger-statement-metrics"><div><span>TRACKED TRANSACTIONS</span><strong>${data.trackedCount}</strong><small>${naira(data.trackedSpend)} itemised spend</small></div><div><span>ARCHIVED TRANSACTIONS</span><strong>${data.archivedCount}</strong><small>${naira(data.archivedNaira)} archived spend</small></div><div><span>MONTH TOTAL RECORDED</span><strong>${naira(data.totalSpend)}</strong><small>Tracked plus archived amount</small></div></div><div class="kano-workshop-ledger-table-wrap"><table class="kano-workshop-ledger-table"><thead><tr><th>DATE</th><th>SERVICE</th><th>COMPONENTS</th><th>AMOUNT</th></tr></thead><tbody>${rows}</tbody></table></div><p class="kano-workshop-ledger-coverage-note">${escapeWorkshopHTML(coverageNote)}</p>`;
}

function workshopLedgerStatementMarkup(requestedMonth = '') {
  const data = workshopLedgerStatementData(requestedMonth);
  const options = data.options.map((key) => {
    const [year, monthNumber] = key.split('-').map(Number);
    const label = new Date(year, monthNumber - 1, 1, 12).toLocaleDateString('en-NG', { month: 'long', year: 'numeric' });
    return `<option value="${key}" ${key === data.selectedMonth ? 'selected' : ''}>${escapeWorkshopHTML(label)}</option>`;
  }).join('');
  return `<section class="kano-workshop-ledger-statement" aria-labelledby="kano-workshop-ledger-statement-title"><div class="kano-workshop-ledger-statement-heading"><div><h4 id="kano-workshop-ledger-statement-title">MONTHLY LEDGER STATEMENT</h4><p>Inspect individual tracked transactions beyond the 12-receipt history window.</p></div><button type="button" data-kano-workshop-ledger-statement-export>EXPORT MONTH CSV</button></div><label class="kano-workshop-ledger-month-picker">STATEMENT PERIOD<select data-kano-workshop-statement-month aria-label="Choose workshop statement month">${options}</select></label><div data-kano-workshop-ledger-statement-body>${workshopLedgerStatementBodyMarkup(data.selectedMonth)}</div><small class="kano-workshop-ledger-statement-note">The statement reads the local spending ledger. Individual service names and components are shown only when a matching recent receipt is still available. Archived amounts remain included in totals but cannot be expanded into itemised rows. Export excludes game wallet save, vehicle state, score, and driving progress.</small></section>`;
}

function downloadWorkshopLedgerMonthStatement(requestedMonth = '') {
  const data = workshopLedgerStatementData(requestedMonth);
  const csvCell = (value) => {
    let safe = String(value ?? '');
    if (/^[\t\r ]*[=+\-@]/.test(safe)) safe = `'${safe}`;
    return `"${safe.replace(/"/g, '""')}"`;
  };
  const header = [
    'Statement month', 'Coverage', 'Entry type', 'Service date (ISO 8601)',
    'Transaction identity', 'Service', 'Components', 'Cost (NGN)',
    'Wallet after (NGN)', 'Recent receipt available', 'Archived transaction count',
    'Archived amount (NGN)', 'Total month recorded (NGN)',
  ];
  const rows = data.transactions.map((row) => [
    data.selectedMonth, data.coverage, 'TRACKED TRANSACTION', row.dateISO,
    row.id, row.service, row.components, row.cost,
    row.walletAfter === null ? '' : row.walletAfter, row.receiptAvailable ? 'Yes' : 'No',
    '', '', '',
  ]);
  if (data.archivedCount || data.archivedNaira) {
    rows.push([data.selectedMonth, data.coverage, 'ARCHIVED SUMMARY', '', '',
      'Unitemised archived transactions', '', data.archivedNaira, '', 'No',
      data.archivedCount, data.archivedNaira, data.totalSpend]);
  }
  if (!rows.length) {
    rows.push([data.selectedMonth, data.coverage, 'MONTH TOTAL', '', '',
      'No tracked ledger transactions', '', data.totalSpend, '', 'No',
      data.archivedCount, data.archivedNaira, data.totalSpend]);
  } else {
    rows.push([data.selectedMonth, data.coverage, 'MONTH TOTAL', '', '',
      'Recorded month total', '', data.totalSpend, '', 'No',
      data.archivedCount, data.archivedNaira, data.totalSpend]);
  }
  const csv = '\uFEFF' + [header, ...rows].map((row) => row.map(csvCell).join(',')).join('\r\n');
  try {
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `kano-life-workshop-ledger-${data.selectedMonth}.csv`;
    link.style.display = 'none';
    document.body.append(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1500);
    setWorkshopMessage(`MONTHLY LEDGER EXPORTED · ${data.monthLabel} · ${naira(data.totalSpend)} recorded, ${data.coverage.toLowerCase()} coverage. No game wallet or vehicle data was changed.`);
  } catch (error) {
    console.warn('[Kano Life] Monthly workshop ledger statement export failed.', error);
    setWorkshopMessage('Monthly ledger export failed in this browser. Saved workshop records and game progress were not changed.');
  }
}

function workshopLedgerAuditData() {
  const ledger = readWorkshopSpendingLedger();
  const history = readWorkshopHistory().map((entry) => normalizeWorkshopBackupRecord({
    time: Number(entry.time), service: entry.service, parts: entry.parts,
    cost: entry.cost, walletAfter: entry.walletAfter,
    conditionBefore: entry.conditionBefore, conditionAfter: entry.conditionAfter,
  })).filter(Boolean);
  const receiptLookup = new Map();
  for (const [monthKey, month] of Object.entries(ledger.months || {})) {
    receiptLookup.set(monthKey, new Set((month.transactions || []).map((transaction) => transaction.id)));
  }

  const unmatchedReceipts = [];
  let matchedReceipts = 0;
  for (const record of history) {
    const monthKey = workshopLedgerMonthKey(record.time);
    const identity = workshopRecordIdentity(record);
    if (monthKey && receiptLookup.get(monthKey)?.has(identity)) matchedReceipts += 1;
    else unmatchedReceipts.push({
      time: record.time,
      service: record.service,
      parts: [...record.parts],
      cost: record.cost,
      walletAfter: record.walletAfter,
      identity,
      monthKey,
    });
  }

  const months = Object.entries(ledger.months || {}).sort((a, b) => a[0].localeCompare(b[0])).map(([monthKey, month]) => ({
    month: monthKey,
    transactionCount: month.transactions.length,
    archivedCount: month.archivedCount,
    trackedSpendNaira: workshopLedgerMonthTotal(month),
    coverageComplete: Boolean(month.coverageComplete) && month.archivedCount === 0,
  }));
  const partialMonths = months.filter((month) => !month.coverageComplete);
  const trackedTransactions = Object.values(ledger.months || {}).reduce((sum, month) => sum + month.transactions.length, 0);
  const archivedTransactions = Object.values(ledger.months || {}).reduce((sum, month) => sum + month.archivedCount, 0);
  const archivedSpendNaira = Object.values(ledger.months || {}).reduce((sum, month) => sum + month.archivedNaira, 0);
  const now = new Date();
  const currentMonthKey = workshopLedgerMonthKey(now.getTime());
  const currentMonth = ledger.months[currentMonthKey] || null;

  let recoveryCopyAvailable = false;
  try { recoveryCopyAvailable = Boolean(localStorage.getItem(WORKSHOP_SPENDING_LEDGER_RECOVERY_KEY)); } catch (_) {}

  let rawLedgerMalformed = false;
  let rawDuplicateIdentities = 0;
  try {
    const raw = localStorage.getItem(WORKSHOP_SPENDING_LEDGER_KEY);
    if (raw) {
      const value = JSON.parse(raw);
      if (!normalizeWorkshopSpendingLedger(value)) rawLedgerMalformed = true;
      const rawMonths = value?.months && typeof value.months === 'object' && !Array.isArray(value.months)
        ? Object.values(value.months) : [];
      for (const month of rawMonths) {
        const ids = new Set();
        for (const transaction of Array.isArray(month?.transactions) ? month.transactions : []) {
          const id = typeof transaction?.id === 'string' ? transaction.id : '';
          if (!id) continue;
          if (ids.has(id)) rawDuplicateIdentities += 1;
          ids.add(id);
        }
      }
    }
  } catch (_) {
    rawLedgerMalformed = true;
  }

  const issues = [];
  if (recoveryCopyAvailable) issues.push('A recovery copy of an earlier invalid or unsupported ledger is available for export.');
  if (rawLedgerMalformed) issues.push('The currently stored ledger format failed validation.');
  if (rawDuplicateIdentities) issues.push(`${rawDuplicateIdentities} repeated transaction identity/identities were found in raw ledger storage.`);
  if (unmatchedReceipts.length) issues.push(`${unmatchedReceipts.length} recent receipt(s) are not represented by a matching tracked ledger transaction.`);
  if (partialMonths.length) issues.push(`${partialMonths.length} ledger month(s) have partial coverage or archived entries.`);
  if (!issues.length) issues.push('No mismatch was detected between the recent saved receipts and individually tracked ledger transactions.');

  let status = 'ALIGNED';
  let level = 'good';
  if (rawLedgerMalformed || rawDuplicateIdentities || recoveryCopyAvailable || unmatchedReceipts.length) {
    status = 'REVIEW REQUIRED';
    level = 'critical';
  } else if (partialMonths.length) {
    status = 'PARTIAL COVERAGE';
    level = 'warning';
  }

  return {
    generatedAt: new Date().toISOString(),
    status,
    level,
    historyCount: history.length,
    matchedReceipts,
    unmatchedReceipts,
    unmatchedReceiptCount: unmatchedReceipts.length,
    unmatchedReceiptSpendNaira: unmatchedReceipts.reduce((sum, record) => sum + record.cost, 0),
    trackedTransactions,
    archivedTransactions,
    archivedSpendNaira,
    monthCount: months.length,
    partialMonthCount: partialMonths.length,
    currentMonthKey,
    currentMonthCoverage: currentMonth ? (currentMonth.coverageComplete && currentMonth.archivedCount === 0 ? 'COMPLETE' : 'PARTIAL') : 'NO TRACKED TRANSACTIONS',
    recoveryCopyAvailable,
    rawLedgerMalformed,
    rawDuplicateIdentities,
    months,
    issues,
  };
}

function workshopLedgerAuditMarkup(data = workshopLedgerAuditData()) {
  const recoveryButton = data.recoveryCopyAvailable
    ? '<button type="button" data-kano-workshop-ledger-recovery-export>EXPORT RECOVERY COPY</button>'
    : '';
  const issueMarkup = data.issues.map((issue) => `<li>${escapeWorkshopHTML(issue)}</li>`).join('');
  return `<section class="kano-workshop-ledger-audit" aria-labelledby="kano-workshop-ledger-audit-title"><div class="kano-workshop-audit-heading"><h4 id="kano-workshop-ledger-audit-title">SPENDING LEDGER INTEGRITY</h4><span>${data.monthCount} TRACKED MONTH${data.monthCount === 1 ? '' : 'S'}</span></div><p class="kano-workshop-audit-intro">Checks recent service receipts against the separate monthly ledger. Auditing does not charge money or alter vehicle condition.</p><div class="kano-workshop-audit-status" data-level="${data.level}" role="status"><strong>${data.status}</strong><span>${data.matchedReceipts} of ${data.historyCount} recent receipts matched to ledger entries.</span></div><div class="kano-workshop-audit-metrics"><div><span>NEEDS RECONCILIATION</span><strong>${data.unmatchedReceiptCount}</strong><small>${naira(data.unmatchedReceiptSpendNaira)} in unmatched recent receipts</small></div><div><span>PARTIAL MONTHS</span><strong>${data.partialMonthCount}</strong><small>Older imports or archived records may limit coverage</small></div><div><span>ARCHIVED TRANSACTIONS</span><strong>${data.archivedTransactions}</strong><small>${naira(data.archivedSpendNaira)} archived amount</small></div></div><ul class="kano-workshop-audit-issues">${issueMarkup}</ul><div class="kano-workshop-audit-actions"><button type="button" data-kano-workshop-ledger-reconcile ${data.unmatchedReceiptCount ? '' : 'disabled'}>RECONCILE RECENT RECEIPTS</button><button type="button" data-kano-workshop-ledger-audit-export>EXPORT AUDIT REPORT</button>${recoveryButton}</div><small class="kano-workshop-audit-note">Reconciliation adds unmatched records only from the latest ${WORKSHOP_HISTORY_LIMIT} saved receipts. It does not recreate older missing transactions. The audit report contains workshop records and ledger coverage details, but excludes game wallet state, vehicle save and driving progress.</small></section>`;
}

function downloadWorkshopLedgerAudit() {
  const data = workshopLedgerAuditData();
  const report = {
    application: 'Kano Life',
    exportType: 'workshop-ledger-integrity-audit',
    formatVersion: 1,
    generatedAt: data.generatedAt,
    status: data.status,
    summary: {
      recentReceipts: data.historyCount,
      matchedReceipts: data.matchedReceipts,
      unmatchedRecentReceipts: data.unmatchedReceiptCount,
      unmatchedRecentReceiptSpendNaira: data.unmatchedReceiptSpendNaira,
      trackedTransactions: data.trackedTransactions,
      archivedTransactions: data.archivedTransactions,
      archivedSpendNaira: data.archivedSpendNaira,
      trackedMonths: data.monthCount,
      partialMonths: data.partialMonthCount,
      currentMonthCoverage: data.currentMonthCoverage,
      recoveryCopyAvailable: data.recoveryCopyAvailable,
      rawLedgerMalformed: data.rawLedgerMalformed,
      rawDuplicateIdentities: data.rawDuplicateIdentities,
    },
    issues: data.issues,
    months: data.months,
    unmatchedRecentReceipts: data.unmatchedReceipts.map((record) => ({
      date: new Date(record.time).toISOString(),
      service: record.service,
      parts: record.parts,
      costNaira: record.cost,
      walletAfterNaira: record.walletAfter,
      month: record.monthKey,
    })),
    note: 'Audit report of locally stored workshop history and spending ledger. It does not contain the game wallet, vehicle save, or gameplay progress. PARTIAL coverage means the report cannot prove that every historic transaction is present.',
  };
  try {
    const blob = new Blob([JSON.stringify(report, null, 2)], { type: 'application/json;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `kano-life-workshop-ledger-audit-${new Date().toISOString().slice(0, 10)}.json`;
    link.style.display = 'none';
    document.body.append(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1500);
    setWorkshopMessage(`LEDGER AUDIT EXPORTED · ${data.status} · ${data.unmatchedReceiptCount} recent receipt(s) need reconciliation. No wallet or vehicle data was changed.`);
  } catch (error) {
    console.warn('[Kano Life] Workshop ledger audit export failed.', error);
    setWorkshopMessage('Ledger audit export failed in this browser. Existing workshop records and game progress were not changed.');
  }
}

function downloadWorkshopLedgerRecoveryCopy() {
  let raw = null;
  try { raw = localStorage.getItem(WORKSHOP_SPENDING_LEDGER_RECOVERY_KEY); } catch (_) {}
  if (!raw) {
    setWorkshopMessage('No workshop ledger recovery copy is available on this device.');
    return;
  }
  try {
    const blob = new Blob([raw], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `kano-life-workshop-ledger-recovery-${new Date().toISOString().slice(0, 10)}.txt`;
    link.style.display = 'none';
    document.body.append(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1500);
    setWorkshopMessage('RECOVERY COPY EXPORTED as raw text. Keep it as evidence of the earlier ledger state; it was not automatically restored.');
  } catch (error) {
    console.warn('[Kano Life] Workshop ledger recovery export failed.', error);
    setWorkshopMessage('Recovery-copy export failed in this browser. Saved workshop data was not intentionally changed.');
  }
}

function reconcileWorkshopRecentReceipts() {
  const data = workshopLedgerAuditData();
  if (!data.unmatchedReceiptCount) {
    setWorkshopMessage('LEDGER CHECK COMPLETE · All recent receipts are already represented in tracked ledger transactions.');
    return;
  }
  const confirmed = window.confirm(
    `Reconcile ${data.unmatchedReceiptCount} recent service receipt(s) into the spending ledger?\n\n` +
    `The unmatched receipts total ${naira(data.unmatchedReceiptSpendNaira)}. Existing transaction identities will not be added twice. ` +
    'This changes workshop tracking only; it will not change the game wallet, vehicle condition, service prices, or driving progress.'
  );
  if (!confirmed) {
    setWorkshopMessage('Ledger reconciliation cancelled. Saved workshop history and gameplay data were not changed.');
    return;
  }
  const records = data.unmatchedReceipts.map((record) => ({
    time: record.time,
    service: record.service,
    parts: record.parts,
    cost: record.cost,
    walletAfter: record.walletAfter,
  }));
  const ok = recordWorkshopSpendingRecords(records, 'reconcile');
  if (!ok) {
    setWorkshopMessage('Ledger reconciliation could not be saved and verified. The game wallet and vehicle condition were not changed.');
    return;
  }
  const after = workshopLedgerAuditData();
  const resolved = Math.max(0, data.unmatchedReceiptCount - after.unmatchedReceiptCount);
  const left = after.unmatchedReceiptCount;
  const detail = left
    ? ` ${left} remain unmatched because older archived ledger data or retention limits prevent a confident automatic merge.`
    : '';
  const panel = document.getElementById('kano-workshop-panel');
  if (panel) panel.dataset.signature = '';
  setWorkshopMessage(`LEDGER RECONCILIATION COMPLETE · ${resolved} recent receipt(s) reconciled.${detail} Monthly coverage remains marked partial when complete history cannot be verified. Wallet and vehicle condition unchanged.`);
  renderWorkshopPanel(activeGame?.s || window.__KANO_LIFE_GAME__?.s);
}

function workshopSpendingLedgerHasEntries(ledger = readWorkshopSpendingLedger()) {
  return Boolean(ledger && Object.values(ledger.months || {}).some((month) =>
    month.transactions.length || month.archivedCount || month.archivedNaira));
}

async function importWorkshopHistoryFile(file) {
  if (!file) return;
  try {
    if (file.size > WORKSHOP_BACKUP_MAX_BYTES) {
      setWorkshopMessage('Backup rejected. Choose a JSON file smaller than 1 MB. No saved data was changed.');
      return;
    }
    const text = await file.text();
    let backup;
    try {
      backup = JSON.parse(text);
    } catch (_) {
      setWorkshopMessage('Backup rejected. The file is not valid JSON. No saved data was changed.');
      return;
    }
    if (!backup || typeof backup !== 'object' || backup.application !== 'Kano Life'
      || backup.exportType !== 'workshop-service-history' || backup.formatVersion !== 1
      || !Array.isArray(backup.records) || backup.records.length > WORKSHOP_BACKUP_MAX_ROWS) {
      setWorkshopMessage('Backup rejected. Select a Kano Life Workshop JSON Backup exported by this game. No saved data was changed.');
      return;
    }
    const valid = backup.records.map(normalizeWorkshopBackupRecord).filter(Boolean);
    const invalidCount = backup.records.length - valid.length;
    if (!valid.length) {
      setWorkshopMessage('Backup contains no valid service records. Existing records were not changed.');
      return;
    }
    const confirmed = window.confirm(
      `Import ${valid.length} valid service record${valid.length === 1 ? '' : 's'} from this backup?\n\n` +
      'The records will be merged with this device’s workshop history. Only the newest 12 records will be retained. ' +
      'Your game wallet, vehicle condition, and game progress will not be changed.'
    );
    if (!confirmed) {
      setWorkshopMessage('Import cancelled. Existing workshop history and game progress were not changed.');
      return;
    }

    ensureWorkshopSpendingLedger();
    const current = readWorkshopHistory().map((entry) => normalizeWorkshopBackupRecord({
      time: Number(entry.time), service: entry.service, parts: entry.parts,
      cost: entry.cost, walletAfter: entry.walletAfter,
      conditionBefore: entry.conditionBefore, conditionAfter: entry.conditionAfter,
    })).filter(Boolean);
    const byIdentity = new Map();
    for (const record of [...current, ...valid]) {
      const identity = workshopRecordIdentity(record);
      const existing = byIdentity.get(identity);
      if (!existing) {
        byIdentity.set(identity, record);
      } else {
        const existingHasDetails = normalizeConditionSnapshot(existing.conditionBefore) && normalizeConditionSnapshot(existing.conditionAfter);
        const incomingHasDetails = normalizeConditionSnapshot(record.conditionBefore) && normalizeConditionSnapshot(record.conditionAfter);
        // Prefer richer receipts when a legacy and an enhanced backup contain
        // the same transaction, without creating a duplicate service record.
        if (!existingHasDetails && incomingHasDetails) byIdentity.set(identity, record);
      }
    }
    const merged = [...byIdentity.values()]
      .sort((a, b) => b.time - a.time)
      .slice(0, WORKSHOP_HISTORY_LIMIT);
    const serialized = JSON.stringify(merged);
    const previousHistory = localStorage.getItem(WORKSHOP_HISTORY_KEY);
    const previousLedger = localStorage.getItem(WORKSHOP_SPENDING_LEDGER_KEY);
    try {
      localStorage.setItem(WORKSHOP_HISTORY_KEY, serialized);
      if (!recordWorkshopSpendingRecords(valid, 'import')) throw new Error('Monthly spending totals could not be updated.');
      const verification = JSON.parse(localStorage.getItem(WORKSHOP_HISTORY_KEY) || 'null');
      if (!Array.isArray(verification) || verification.length !== merged.length) {
        throw new Error('The browser could not verify the restored service history.');
      }
    } catch (saveError) {
      try {
        if (previousHistory === null) localStorage.removeItem(WORKSHOP_HISTORY_KEY);
        else localStorage.setItem(WORKSHOP_HISTORY_KEY, previousHistory);
        if (previousLedger === null) localStorage.removeItem(WORKSHOP_SPENDING_LEDGER_KEY);
        else localStorage.setItem(WORKSHOP_SPENDING_LEDGER_KEY, previousLedger);
      } catch (rollbackError) {
        console.warn('[Kano Life] Service-history import rollback could not fully restore browser storage.', rollbackError);
      }
      throw saveError;
    }
    const skipped = invalidCount ? ` ${invalidCount} invalid record${invalidCount === 1 ? ' was' : 's were'} skipped.` : '';
    setWorkshopMessage(`IMPORT COMPLETE · ${merged.length} most recent service record${merged.length === 1 ? '' : 's'} now saved on this device.${skipped} Monthly ledger merged; imported months are marked partial where coverage cannot be verified. Wallet and vehicle condition unchanged.`);
    renderWorkshopPanel(activeGame?.s || window.__KANO_LIFE_GAME__?.s);
  } catch (error) {
    console.warn('[Kano Life] Workshop history import failed safely.', error);
    setWorkshopMessage('Import failed. The game wallet and vehicle condition were not changed. Check browser storage permissions and try again.');
  }
}


// Full workshop-plan backup: combines service receipts and the optional repair
// fund target. It intentionally excludes the game wallet, save, and progress.
function normalizeWorkshopPlanGoal(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const targetNaira = Math.floor(Number(value.targetNaira));
  if (!Number.isFinite(targetNaira) || targetNaira < 1 || targetNaira > 100000000) return null;
  const dueDateRaw = typeof value.dueDate === 'string' ? value.dueDate : '';
  const dueDate = dueDateRaw ? normalizeWorkshopDueDate(dueDateRaw) : '';
  if (dueDateRaw && !dueDate) return null;
  const updatedAtRaw = Number(value.updatedAt);
  return {
    targetNaira,
    dueDate,
    updatedAt: Number.isFinite(updatedAtRaw) && updatedAtRaw >= 0 ? Math.floor(updatedAtRaw) : 0,
  };
}

function normalizeWorkshopMonthlyBudget(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const monthlyLimitNaira = Math.floor(Number(value.monthlyLimitNaira));
  if (!Number.isFinite(monthlyLimitNaira) || monthlyLimitNaira < 1 || monthlyLimitNaira > 100000000) return null;
  const updatedAtRaw = Number(value.updatedAt);
  return {
    monthlyLimitNaira,
    updatedAt: Number.isFinite(updatedAtRaw) && updatedAtRaw >= 0 ? Math.floor(updatedAtRaw) : 0,
  };
}

function readWorkshopMonthlyBudget() {
  try {
    return normalizeWorkshopMonthlyBudget(JSON.parse(localStorage.getItem(WORKSHOP_MONTHLY_BUDGET_KEY) || 'null'));
  } catch (_) {
    return null;
  }
}

function workshopPlanBackupRecords() {
  const serviceLabels = {
    full: 'Full service',
    body: 'Body repair',
    engine: 'Engine service',
    tyres: 'Tyre service',
  };
  return readWorkshopHistory().map((entry) => {
    const date = new Date(Number(entry.time));
    const conditionBefore = normalizeConditionSnapshot(entry.conditionBefore);
    const conditionAfter = normalizeConditionSnapshot(entry.conditionAfter);
    return {
      date: Number.isNaN(date.getTime()) ? '' : date.toISOString(),
      service: serviceLabels[entry.service] || 'Workshop service',
      components: entry.parts.filter((key) => WORKSHOP_PARTS[key]).map((key) => WORKSHOP_PARTS[key].label).join('; '),
      costNaira: Math.max(0, Math.floor(Number(entry.cost) || 0)),
      walletAfterNaira: Math.max(0, Math.floor(Number(entry.walletAfter) || 0)),
      ...(conditionBefore && conditionAfter ? { conditionBefore, conditionAfter } : {}),
    };
  });
}

function downloadWorkshopPlanBackup() {
  const records = workshopPlanBackupRecords();
  const goal = readWorkshopSavingsGoal();
  const monthlyBudget = readWorkshopMonthlyBudget();
  const annualBudgets = readWorkshopAnnualBudgets();
  const ledger = ensureWorkshopSpendingLedger();
  if (!records.length && !goal && !monthlyBudget && !workshopAnnualBudgetsHaveTargets(annualBudgets) && !workshopSpendingLedgerHasEntries(ledger)) {
    setWorkshopMessage('There is no saved service history, repair-fund target, monthly or annual spending target, or spending ledger to export yet.');
    return;
  }
  try {
    const exportedAt = new Date().toISOString();
    const backup = {
      application: 'Kano Life',
      exportType: 'workshop-plan-backup',
      formatVersion: 4,
      exportedAt,
      recordCount: records.length,
      savingsGoal: goal ? {
        targetNaira: goal.targetNaira,
        dueDate: goal.dueDate,
        updatedAt: goal.updatedAt,
      } : null,
      monthlyBudget: monthlyBudget ? {
        monthlyLimitNaira: monthlyBudget.monthlyLimitNaira,
        updatedAt: monthlyBudget.updatedAt,
      } : null,
      annualBudgets,
      spendingLedger: ledger,
      note: 'Contains recent service receipts, repair-fund target, monthly spending cap, year-specific annual workshop budget targets, and a separate 12-month spending ledger. The ledger records spending independently of the 12 visible receipts. Legacy or imported months may be marked partial. Does not contain game money, vehicle state, or gameplay progress.',
      records,
    };
    const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `kano-life-workshop-plan-${exportedAt.slice(0, 10)}.json`;
    link.style.display = 'none';
    document.body.append(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1500);
    const monthCount = Object.keys(ledger.months).length;
    setWorkshopMessage(`WORKSHOP PLAN BACKUP PREPARED · ${records.length} visible receipt${records.length === 1 ? '' : 's'} · ${monthCount} ledger month${monthCount === 1 ? '' : 's'} · ${goal ? 'repair-fund target' : 'no saved target'} · ${monthlyBudget ? 'monthly cap' : 'no monthly cap'} · ${Object.keys(annualBudgets.targets).length} annual budget target${Object.keys(annualBudgets.targets).length === 1 ? '' : 's'} included. Game money and progress were not exported.`);
  } catch (error) {
    console.warn('[Kano Life] Full workshop-plan export failed.', error);
    setWorkshopMessage('Workshop plan export failed in this browser. Saved history, target, and gameplay data remain unchanged.');
  }
}

function mergeWorkshopBackupRecords(incomingRecords) {
  const current = readWorkshopHistory().map((entry) => normalizeWorkshopBackupRecord({
    time: Number(entry.time), service: entry.service, parts: entry.parts,
    cost: entry.cost, walletAfter: entry.walletAfter,
    conditionBefore: entry.conditionBefore, conditionAfter: entry.conditionAfter,
  })).filter(Boolean);
  const byIdentity = new Map();
  for (const record of [...current, ...incomingRecords]) {
    const identity = workshopRecordIdentity(record);
    const existing = byIdentity.get(identity);
    if (!existing) {
      byIdentity.set(identity, record);
      continue;
    }
    const existingHasDetails = normalizeConditionSnapshot(existing.conditionBefore) && normalizeConditionSnapshot(existing.conditionAfter);
    const incomingHasDetails = normalizeConditionSnapshot(record.conditionBefore) && normalizeConditionSnapshot(record.conditionAfter);
    if (!existingHasDetails && incomingHasDetails) byIdentity.set(identity, record);
  }
  return [...byIdentity.values()].sort((a, b) => b.time - a.time).slice(0, WORKSHOP_HISTORY_LIMIT);
}

async function importWorkshopPlanFile(file) {
  if (!file) return;
  try {
    if (file.size > WORKSHOP_BACKUP_MAX_BYTES) {
      setWorkshopMessage('Plan backup rejected. Choose a JSON file smaller than 1 MB. No saved data was changed.');
      return;
    }
    let backup;
    try {
      backup = JSON.parse(await file.text());
    } catch (_) {
      setWorkshopMessage('Plan backup rejected. The file is not valid JSON. No saved data was changed.');
      return;
    }
    if (!backup || typeof backup !== 'object' || Array.isArray(backup)
      || backup.application !== 'Kano Life' || backup.exportType !== 'workshop-plan-backup'
      || ![1, 2, 3, 4].includes(backup.formatVersion) || !Array.isArray(backup.records)
      || backup.records.length > WORKSHOP_BACKUP_MAX_ROWS
      || !Object.prototype.hasOwnProperty.call(backup, 'savingsGoal')
      || (backup.formatVersion >= 2 && !Object.prototype.hasOwnProperty.call(backup, 'monthlyBudget'))
      || (backup.formatVersion >= 3 && !Object.prototype.hasOwnProperty.call(backup, 'spendingLedger'))
      || (backup.formatVersion >= 4 && !Object.prototype.hasOwnProperty.call(backup, 'annualBudgets'))) {
      setWorkshopMessage('Plan backup rejected. Select a Kano Life Workshop Plan Backup. No saved data was changed.');
      return;
    }

    const validRecords = backup.records.map(normalizeWorkshopBackupRecord).filter(Boolean);
    const invalidCount = backup.records.length - validRecords.length;
    const incomingGoal = backup.savingsGoal === null ? null : normalizeWorkshopPlanGoal(backup.savingsGoal);
    const goalIsInvalid = backup.savingsGoal !== null && !incomingGoal;
    const incomingBudget = backup.formatVersion >= 2 && backup.monthlyBudget !== null
      ? normalizeWorkshopMonthlyBudget(backup.monthlyBudget) : null;
    const budgetIsInvalid = backup.formatVersion >= 2 && backup.monthlyBudget !== null && !incomingBudget;
    const rawIncomingLedger = backup.formatVersion >= 3 ? normalizeWorkshopSpendingLedger(backup.spendingLedger) : null;
    const ledgerIsInvalid = backup.formatVersion >= 3 && backup.spendingLedger !== null && !rawIncomingLedger;
    const incomingLedger = rawIncomingLedger || null;
    const hasIncomingLedger = workshopSpendingLedgerHasEntries(incomingLedger);
    const incomingAnnualBudgets = backup.formatVersion >= 4 && backup.annualBudgets !== null
      ? normalizeWorkshopAnnualBudgets(backup.annualBudgets) : null;
    const annualBudgetsIsInvalid = backup.formatVersion >= 4 && backup.annualBudgets !== null && !incomingAnnualBudgets;
    const hasIncomingAnnualBudgets = workshopAnnualBudgetsHaveTargets(incomingAnnualBudgets);
    if (!validRecords.length && !incomingGoal && !incomingBudget && !hasIncomingLedger && !hasIncomingAnnualBudgets) {
      setWorkshopMessage(`Backup contains no valid service records, repair-fund target, monthly spending cap, annual budget targets or spending ledger. Existing data was not changed.${invalidCount ? ` ${invalidCount} invalid record${invalidCount === 1 ? ' was' : 's were'} found.` : ''}${goalIsInvalid ? ' The target record was invalid.' : ''}${budgetIsInvalid ? ' The monthly budget record was invalid.' : ''}${ledgerIsInvalid ? ' The spending ledger was invalid.' : ''}`);
      return;
    }

    ensureWorkshopSpendingLedger();
    const currentGoal = readWorkshopSavingsGoal();
    const currentBudget = readWorkshopMonthlyBudget();
    const currentAnnualBudgets = readWorkshopAnnualBudgets();
    const willReplaceGoal = Boolean(incomingGoal);
    const willReplaceBudget = Boolean(incomingBudget);
    const willMergeLedger = Boolean(hasIncomingLedger);
    const willMergeAnnualBudgets = Boolean(hasIncomingAnnualBudgets);
    const prompt = [
      `Import ${validRecords.length} valid service record${validRecords.length === 1 ? '' : 's'} from this workshop plan backup?`,
      '',
      'Service records will be merged with this device’s history; only the newest 12 will be retained.',
      willReplaceGoal
        ? `The saved repair-fund target${currentGoal ? ` (${naira(currentGoal.targetNaira)})` : ''} will be replaced with ${naira(incomingGoal.targetNaira)}${incomingGoal.dueDate ? `, due ${incomingGoal.dueDate}` : ', with no target date'}.`
        : 'The backup has no valid repair-fund target, so any target already on this device will be preserved.',
      willReplaceBudget
        ? `The monthly workshop cap${currentBudget ? ` (${naira(currentBudget.monthlyLimitNaira)})` : ''} will be replaced with ${naira(incomingBudget.monthlyLimitNaira)}.`
        : 'The backup has no valid monthly workshop cap, so any cap already on this device will be preserved.',
      willMergeLedger
        ? 'The spending ledger will be merged by transaction identity to preserve recorded monthly totals and avoid importing duplicate tracked transactions.'
        : 'The backup has no valid spending ledger. Imported receipts will be added to the local ledger, but their month coverage will be marked partial.',
      willMergeAnnualBudgets
        ? `Year-specific annual targets will be merged. Target years in the backup will replace matching years on this device; other saved target years will be preserved (${Object.keys(incomingAnnualBudgets.targets).length} target year(s) in backup).`
        : 'The backup has no valid annual budget targets. Existing annual targets on this device will be preserved.',
      '',
      'Game wallet, vehicle condition, and gameplay progress will not be changed.',
    ].join('\n');
    if (!window.confirm(prompt)) {
      setWorkshopMessage('Workshop plan import cancelled. Existing history, target and gameplay data were not changed.');
      return;
    }

    const merged = mergeWorkshopBackupRecords(validRecords);
    const previousHistory = localStorage.getItem(WORKSHOP_HISTORY_KEY);
    const previousGoal = localStorage.getItem(WORKSHOP_SAVINGS_GOAL_KEY);
    const previousBudget = localStorage.getItem(WORKSHOP_MONTHLY_BUDGET_KEY);
    const previousAnnualBudgets = localStorage.getItem(WORKSHOP_ANNUAL_BUDGET_KEY);
    const previousLedger = localStorage.getItem(WORKSHOP_SPENDING_LEDGER_KEY);
    const historyToSave = JSON.stringify(merged);
    try {
      localStorage.setItem(WORKSHOP_HISTORY_KEY, historyToSave);
      if (incomingGoal) localStorage.setItem(WORKSHOP_SAVINGS_GOAL_KEY, JSON.stringify(incomingGoal));
      if (incomingBudget) localStorage.setItem(WORKSHOP_MONTHLY_BUDGET_KEY, JSON.stringify(incomingBudget));
      if (hasIncomingAnnualBudgets) {
        const mergedAnnualBudgets = mergeWorkshopAnnualBudgets(currentAnnualBudgets, incomingAnnualBudgets);
        if (!saveWorkshopAnnualBudgets(mergedAnnualBudgets)) throw new Error('Annual budget targets could not be saved or verified.');
      }
      let localLedger = readWorkshopSpendingLedger();
      if (incomingLedger) localLedger = mergeWorkshopSpendingLedgers(localLedger, incomingLedger);
      for (const record of validRecords) addWorkshopLedgerRecord(localLedger, record, incomingLedger ? 'backup-record' : 'import');
      if (!saveWorkshopSpendingLedger(localLedger)) throw new Error('The monthly spending ledger could not be saved or verified.');
      const verifyHistory = JSON.parse(localStorage.getItem(WORKSHOP_HISTORY_KEY) || 'null');
      if (!Array.isArray(verifyHistory) || verifyHistory.length !== merged.length) {
        throw new Error('The browser could not verify imported workshop history.');
      }
      if (incomingGoal) {
        const verifyGoal = readWorkshopSavingsGoal();
        if (!verifyGoal || verifyGoal.targetNaira !== incomingGoal.targetNaira || verifyGoal.dueDate !== incomingGoal.dueDate) {
          throw new Error('The browser could not verify the imported repair-fund target.');
        }
      }
      if (incomingBudget) {
        const verifyBudget = readWorkshopMonthlyBudget();
        if (!verifyBudget || verifyBudget.monthlyLimitNaira !== incomingBudget.monthlyLimitNaira) {
          throw new Error('The browser could not verify the imported monthly spending cap.');
        }
      }
      if (hasIncomingAnnualBudgets) {
        const verifyAnnualBudgets = readWorkshopAnnualBudgets();
        for (const [year, target] of Object.entries(incomingAnnualBudgets.targets)) {
          if (!verifyAnnualBudgets.targets[year] || verifyAnnualBudgets.targets[year].targetNaira !== target.targetNaira) {
            throw new Error(`The browser could not verify the imported annual target for ${year}.`);
          }
        }
      }
      const verifyLedger = normalizeWorkshopSpendingLedger(JSON.parse(localStorage.getItem(WORKSHOP_SPENDING_LEDGER_KEY) || 'null'));
      if (!verifyLedger || Object.keys(verifyLedger.months).length !== Object.keys(localLedger.months).length) {
        throw new Error('The browser could not verify the restored spending ledger.');
      }
    } catch (saveError) {
      // Best-effort rollback restores each affected local record if any write or
      // verification fails partway through the import.
      try {
        if (previousHistory === null) localStorage.removeItem(WORKSHOP_HISTORY_KEY);
        else localStorage.setItem(WORKSHOP_HISTORY_KEY, previousHistory);
        if (previousGoal === null) localStorage.removeItem(WORKSHOP_SAVINGS_GOAL_KEY);
        else localStorage.setItem(WORKSHOP_SAVINGS_GOAL_KEY, previousGoal);
        if (previousBudget === null) localStorage.removeItem(WORKSHOP_MONTHLY_BUDGET_KEY);
        else localStorage.setItem(WORKSHOP_MONTHLY_BUDGET_KEY, previousBudget);
        if (previousAnnualBudgets === null) localStorage.removeItem(WORKSHOP_ANNUAL_BUDGET_KEY);
        else localStorage.setItem(WORKSHOP_ANNUAL_BUDGET_KEY, previousAnnualBudgets);
        if (previousLedger === null) localStorage.removeItem(WORKSHOP_SPENDING_LEDGER_KEY);
        else localStorage.setItem(WORKSHOP_SPENDING_LEDGER_KEY, previousLedger);
      } catch (rollbackError) {
        console.warn('[Kano Life] Workshop plan import rollback could not fully restore browser storage.', rollbackError);
      }
      throw saveError;
    }

    const notes = [];
    if (invalidCount) notes.push(`${invalidCount} invalid service record${invalidCount === 1 ? ' was' : 's were'} skipped`);
    if (goalIsInvalid) notes.push('the invalid target was ignored');
    if (budgetIsInvalid) notes.push('the invalid monthly cap was ignored');
    if (ledgerIsInvalid) notes.push('the invalid spending ledger was ignored');
    if (annualBudgetsIsInvalid) notes.push('the invalid annual budget targets were ignored');
    setWorkshopMessage(`WORKSHOP PLAN IMPORT COMPLETE · ${merged.length} most recent service record${merged.length === 1 ? '' : 's'} saved${incomingGoal ? ` · target ${naira(incomingGoal.targetNaira)} restored` : ' · existing target preserved'}${incomingBudget ? ` · monthly cap ${naira(incomingBudget.monthlyLimitNaira)} restored` : ' · existing monthly cap preserved'}${hasIncomingLedger ? ' · spending ledger merged' : ' · ledger updated from valid receipts'}${hasIncomingAnnualBudgets ? ` · ${Object.keys(incomingAnnualBudgets.targets).length} annual budget target${Object.keys(incomingAnnualBudgets.targets).length === 1 ? '' : 's'} merged` : ' · existing annual targets preserved'}. ${notes.length ? notes.join('; ') + '. ' : ''}Wallet, vehicle condition and game progress unchanged.`);
    renderWorkshopPanel(activeGame?.s || window.__KANO_LIFE_GAME__?.s);
  } catch (error) {
    console.warn('[Kano Life] Workshop plan import failed safely.', error);
    setWorkshopMessage('Workshop plan import failed. The game wallet and vehicle condition were not intentionally changed. Check browser storage permissions and try again.');
  }
}


// Workshop cost analytics are calculated from the locally saved receipt list.
// History is deliberately capped at WORKSHOP_HISTORY_LIMIT; totals are not
// advertised as lifetime totals and no missing values are fabricated.
function workshopCostAnalyticsData() {
  const history = readWorkshopHistory()
    .filter((entry) => Number.isFinite(Number(entry.time)) && Number.isFinite(Number(entry.cost)) && Number(entry.cost) >= 0)
    .slice(0, WORKSHOP_HISTORY_LIMIT);
  const totalSpend = history.reduce((sum, entry) => sum + Math.max(0, Math.floor(Number(entry.cost) || 0)), 0);
  const averageCost = history.length ? Math.round(totalSpend / history.length) : 0;
  const now = Date.now();
  const period = 30 * 24 * 60 * 60 * 1000;
  const current30 = history.reduce((sum, entry) => {
    const time = Number(entry.time);
    return time >= now - period && time <= now ? sum + Math.max(0, Math.floor(Number(entry.cost) || 0)) : sum;
  }, 0);
  const preceding30 = history.reduce((sum, entry) => {
    const time = Number(entry.time);
    return time >= now - (2 * period) && time < now - period ? sum + Math.max(0, Math.floor(Number(entry.cost) || 0)) : sum;
  }, 0);
  const labels = {
    full: 'Full service',
    body: 'Body repair',
    engine: 'Engine service',
    tyres: 'Tyre service',
  };
  const categories = Object.keys(labels).map((key) => {
    const records = history.filter((entry) => entry.service === key);
    return {
      key,
      label: labels[key],
      count: records.length,
      spend: records.reduce((sum, entry) => sum + Math.max(0, Math.floor(Number(entry.cost) || 0)), 0),
    };
  });
  const highestSpend = Math.max(0, ...categories.map((item) => item.spend));
  const leadingCategory = categories.filter((item) => item.count).sort((a, b) => b.spend - a.spend)[0] || null;
  const mostExpensiveReceipt = history.reduce((best, entry) => (!best || Number(entry.cost) > Number(best.cost) ? entry : best), null);
  let periodChange = null;
  if (preceding30 > 0) {
    periodChange = Math.round(((current30 - preceding30) / preceding30) * 100);
  }
  return {
    history, totalSpend, averageCost, current30, preceding30,
    categories, highestSpend, leadingCategory, mostExpensiveReceipt,
    periodChange,
  };
}

function workshopCostAnalyticsMarkup() {
  const data = workshopCostAnalyticsData();
  const dateFormatter = (time) => {
    const date = new Date(Number(time));
    return Number.isNaN(date.getTime()) ? 'Date unavailable' : date.toLocaleDateString('en-NG', { dateStyle: 'medium' });
  };
  let trendText = 'No service spending recorded in either 30-day comparison window.';
  let trendLevel = 'neutral';
  if (data.current30 > 0 && data.preceding30 === 0) {
    trendText = 'Spending is recorded in the latest 30 days, with no spending recorded in the preceding 30 days.';
    trendLevel = 'current';
  } else if (data.preceding30 > 0 && data.periodChange !== null) {
    const difference = Math.abs(data.current30 - data.preceding30);
    if (data.periodChange > 0) {
      trendText = `Recorded spend increased by ${Math.abs(data.periodChange)}% (${naira(difference)}) compared with the preceding 30 days.`;
      trendLevel = 'up';
    } else if (data.periodChange < 0) {
      trendText = `Recorded spend decreased by ${Math.abs(data.periodChange)}% (${naira(difference)}) compared with the preceding 30 days.`;
      trendLevel = 'down';
    } else {
      trendText = 'Recorded spend is unchanged compared with the preceding 30 days.';
    }
  } else if (data.current30 === 0 && data.preceding30 > 0) {
    trendText = 'No spending is recorded in the latest 30 days; the preceding 30-day window contains spending.';
    trendLevel = 'down';
  }
  const breakdown = data.categories.map((item) => {
    const width = data.highestSpend > 0 ? Math.round((item.spend / data.highestSpend) * 100) : 0;
    return `<div class="kano-workshop-cost-row"><div class="kano-workshop-cost-row-head"><strong>${item.label}</strong><span>${naira(item.spend)}</span></div><div class="kano-workshop-cost-bar" role="progressbar" aria-label="${item.label} share of saved service-category spending" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${width}"><i style="width:${width}%"></i></div><small>${item.count} saved service${item.count === 1 ? '' : 's'}</small></div>`;
  }).join('');
  const leading = data.leadingCategory
    ? `${data.leadingCategory.label} has the highest recorded category spend (${naira(data.leadingCategory.spend)}).`
    : 'No workshop service costs are recorded yet.';
  const largestReceipt = data.mostExpensiveReceipt
    ? `Largest saved receipt: ${naira(data.mostExpensiveReceipt.cost)} on ${dateFormatter(data.mostExpensiveReceipt.time)}.`
    : 'No saved receipts are available for comparison.';
  return `<section class="kano-workshop-cost-analytics" aria-labelledby="kano-workshop-cost-analytics-title"><div class="kano-workshop-cost-heading"><h4 id="kano-workshop-cost-analytics-title">WORKSHOP COST ANALYTICS</h4><span>${data.history.length} SAVED RECEIPT${data.history.length === 1 ? '' : 'S'}</span></div><p class="kano-workshop-cost-intro">A local spending summary based only on the most recent service records saved on this device.</p><div class="kano-workshop-cost-metrics"><div><span>SAVED SPEND</span><strong>${naira(data.totalSpend)}</strong></div><div><span>AVERAGE RECEIPT</span><strong>${naira(data.averageCost)}</strong></div><div><span>LAST 30 DAYS</span><strong>${naira(data.current30)}</strong></div></div><div class="kano-workshop-cost-period" data-level="${trendLevel}" role="status"><div><span>PREVIOUS 30 DAYS</span><strong>${naira(data.preceding30)}</strong></div><p>${escapeWorkshopHTML(trendText)}</p></div><div class="kano-workshop-cost-breakdown">${breakdown}</div><div class="kano-workshop-cost-insight"><p>${escapeWorkshopHTML(leading)}</p><p>${escapeWorkshopHTML(largestReceipt)}</p></div><button type="button" class="kano-workshop-cost-export" data-kano-workshop-cost-report ${data.history.length ? '' : 'disabled'}>EXPORT COST REPORT CSV</button><small class="kano-workshop-cost-note">The game stores up to ${WORKSHOP_HISTORY_LIMIT} recent receipts. Imported or older records may not represent every service ever completed. This report does not alter wallet funds or vehicle condition.</small></section>`;
}

function downloadWorkshopCostReport() {
  const data = workshopCostAnalyticsData();
  if (!data.history.length) {
    setWorkshopMessage('No saved workshop receipts are available for a cost report.');
    return;
  }
  const csvCell = (value) => {
    let safe = String(value ?? '');
    if (/^[\t\r ]*[=+\-@]/.test(safe)) safe = `'${safe}`;
    return `"${safe.replace(/"/g, '""')}"`;
  };
  const rows = [
    ['Kano Life workshop cost report', ''],
    ['Generated at (ISO 8601)', new Date().toISOString()],
    ['Data scope', `Saved local receipts only; latest ${WORKSHOP_HISTORY_LIMIT} records maximum`],
    [],
    ['Metric', 'Value'],
    ['Saved service records', data.history.length],
    ['Total saved spend (NGN)', data.totalSpend],
    ['Average saved receipt (NGN)', data.averageCost],
    ['Spend in last 30 days (NGN)', data.current30],
    ['Spend in preceding 30 days (NGN)', data.preceding30],
    [],
    ['Service category', 'Service count', 'Spend (NGN)'],
    ...data.categories.map((item) => [item.label, item.count, item.spend]),
    [],
    ['Service date (ISO 8601)', 'Service', 'Components', 'Cost (NGN)', 'Wallet after (NGN)'],
    ...data.history.map((entry) => {
      const time = new Date(Number(entry.time));
      const date = Number.isNaN(time.getTime()) ? '' : time.toISOString();
      const service = ({ full: 'Full service', body: 'Body repair', engine: 'Engine service', tyres: 'Tyre service' })[entry.service] || 'Workshop service';
      const components = (Array.isArray(entry.parts) ? entry.parts : []).map((key) => WORKSHOP_PARTS[key]?.label || '').filter(Boolean).join('; ');
      return [date, service, components, Math.max(0, Math.floor(Number(entry.cost) || 0)), Math.max(0, Math.floor(Number(entry.walletAfter) || 0))];
    }),
  ];
  try {
    const csv = '\ufeff' + rows.map((row) => row.map(csvCell).join(',')).join('\r\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `kano-life-workshop-cost-report-${new Date().toISOString().slice(0, 10)}.csv`;
    link.style.display = 'none';
    document.body.append(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1500);
    setWorkshopMessage(`WORKSHOP COST REPORT PREPARED · ${data.history.length} saved receipt${data.history.length === 1 ? '' : 's'} included. No wallet or vehicle data was changed.`);
  } catch (error) {
    console.warn('[Kano Life] Workshop cost report export failed.', error);
    setWorkshopMessage('Cost report export failed in this browser. Saved receipts, wallet funds and vehicle condition remain unchanged.');
  }
}

function workshopHealth(state, partKey) {
  const config = WORKSHOP_PARTS[partKey];
  const raw = Number(state?.[config.stateKey]);
  return Number.isFinite(raw) ? Math.round(clamp(raw, 0, 100)) : 100;
}

function workshopQuote(state, serviceKey) {
  const keys = serviceKey === 'full' ? Object.keys(WORKSHOP_PARTS) : [serviceKey];
  const parts = keys.filter((key) => WORKSHOP_PARTS[key]).map((key) => {
    const health = workshopHealth(state, key);
    const deficit = Math.max(0, 100 - health);
    const config = WORKSHOP_PARTS[key];
    return { key, label: config.label, health, deficit, cost: Math.ceil(deficit * config.rate) };
  });
  const repairCost = parts.reduce((sum, part) => sum + part.cost, 0);
  const cost = repairCost > 0 ? repairCost + WORKSHOP_LABOUR_FEE : 0;
  return { parts: parts.filter((part) => part.deficit > 0), cost, labour: cost ? WORKSHOP_LABOUR_FEE : 0 };
}

function setWorkshopMessage(message) {
  const panel = document.getElementById('kano-workshop-panel');
  if (!panel) return;
  panel.dataset.message = String(message || 'Select a service to see its cost.');
  const status = panel.querySelector('#kano-workshop-status');
  if (status) status.textContent = panel.dataset.message;
}

function workshopMaintenanceMarkup(values, wallet) {
  const trackedParts = Object.keys(WORKSHOP_PARTS);
  const belowThreshold = trackedParts.filter((key) => values[key] < 80);
  const critical = trackedParts.filter((key) => values[key] < 25);
  const worn = trackedParts.filter((key) => values[key] < 50);
  const thresholdLabel = (key) => `${WORKSHOP_PARTS[key].label} ${values[key]}%`;

  let level = 'good';
  let headline = 'CONDITION CHECK · GOOD';
  let message = 'All tracked components are at 80% or above. Keep monitoring condition during runs.';
  if (critical.length) {
    level = 'critical';
    headline = 'CRITICAL WEAR · SERVICE ADVISED';
    message = `Inspect ${critical.map(thresholdLabel).join(' · ')} before starting another long run.`;
  } else if (worn.length) {
    level = 'warning';
    headline = 'SERVICE RECOMMENDED';
    message = `Worn components: ${worn.map(thresholdLabel).join(' · ')}. Review the repair options below.`;
  } else if (belowThreshold.length) {
    level = 'soon';
    headline = 'MAINTENANCE DUE SOON';
    message = `Monitor ${belowThreshold.map(thresholdLabel).join(' · ')} and plan service when practical.`;
  }

  const fullQuote = workshopQuote(
    Object.fromEntries(trackedParts.map((key) => [WORKSHOP_PARTS[key].stateKey, values[key]])),
    'full',
  );
  let estimate = '';
  if (belowThreshold.length && fullQuote.cost > 0) {
    estimate = wallet >= fullQuote.cost
      ? `Full-service estimate: ${naira(fullQuote.cost)}.`
      : `Full-service estimate: ${naira(fullQuote.cost)} · wallet short by ${naira(fullQuote.cost - wallet)}.`;
  }

  return `<section class="kano-workshop-maintenance" data-level="${level}" aria-live="polite"><div class="kano-workshop-maintenance-heading"><span class="kano-workshop-maintenance-indicator" aria-hidden="true"></span><strong>${headline}</strong></div><p>${escapeWorkshopHTML(message)}</p>${estimate ? `<small>${escapeWorkshopHTML(estimate)}</small>` : ''}<small class="kano-workshop-maintenance-footnote">In-game condition guidance for body, engine and tyres only; no repair is applied automatically.</small></section>`;
}

function workshopConditionTrendMarkup(values) {
  const history = readWorkshopHistory();
  if (!history.length) {
    return `<section class="kano-workshop-trend" aria-labelledby="kano-workshop-trend-title"><div class="kano-workshop-trend-heading"><h4 id="kano-workshop-trend-title">CONDITION TREND</h4><span>BASELINE NOT SET</span></div><p>No completed service receipt is saved yet. After the first detailed service receipt, this panel will compare the recorded post-service condition with the current in-game condition.</p></section>`;
  }

  // Compare with the newest receipt, not an older detailed receipt. Using an
  // older baseline when newer legacy receipts exist could misrepresent the
  // change interval and would imply information not contained in the records.
  const latest = history[0];
  const baseline = normalizeConditionSnapshot(latest.conditionAfter);
  const date = new Date(Number(latest.time));
  const dateLabel = Number.isNaN(date.getTime())
    ? 'date unavailable'
    : date.toLocaleString('en-NG', { dateStyle: 'medium', timeStyle: 'short' });

  if (!baseline) {
    return `<section class="kano-workshop-trend" aria-labelledby="kano-workshop-trend-title"><div class="kano-workshop-trend-heading"><h4 id="kano-workshop-trend-title">CONDITION TREND</h4><span>AWAITING BASELINE</span></div><p>The newest saved receipt (${escapeWorkshopHTML(dateLabel)}) does not contain condition snapshots. Complete another service to begin a reliable comparison. Older data will not be guessed or backfilled.</p></section>`;
  }

  const rows = Object.keys(WORKSHOP_PARTS).map((key) => {
    const current = Number(values[key]);
    const prior = baseline[key];
    const delta = current - prior;
    const deltaLabel = delta < 0 ? `−${Math.abs(delta)} pts` : delta > 0 ? `+${delta} pts` : '0 pts';
    const deltaClass = delta < 0 ? 'down' : delta > 0 ? 'up' : 'same';
    const colour = WORKSHOP_PARTS[key].color;
    return `<div class="kano-workshop-trend-row"><div class="kano-workshop-trend-top"><strong>${WORKSHOP_PARTS[key].label}</strong><span>NOW ${current}%</span></div><div class="kano-workshop-trend-bar" role="img" aria-label="${WORKSHOP_PARTS[key].label} after last service ${prior} percent; current ${current} percent"><div class="kano-workshop-trend-baseline"><i style="width:${prior}%"></i></div><div class="kano-workshop-trend-current"><i style="width:${current}%;background:${colour}"></i></div></div><small>AFTER LAST SERVICE ${prior}% <b class="${deltaClass}">${deltaLabel}</b></small></div>`;
  }).join('');
  const totalLoss = Object.keys(WORKSHOP_PARTS).reduce((sum, key) => sum + Math.max(0, baseline[key] - Number(values[key])), 0);
  return `<section class="kano-workshop-trend" aria-labelledby="kano-workshop-trend-title"><div class="kano-workshop-trend-heading"><h4 id="kano-workshop-trend-title">CONDITION TREND</h4><span>VS LAST RECEIPT</span></div><p>Baseline recorded ${escapeWorkshopHTML(dateLabel)}. The comparison reports condition-point changes only; it does not estimate distance travelled or predict mechanical failure.</p><div class="kano-workshop-trend-grid">${rows}</div><div class="kano-workshop-trend-foot"><span>RECORDED POINTS LOST</span><strong>${totalLoss}</strong></div></section>`;
}

function workshopBudgetPlannerMarkup(state, values, wallet) {
  const ranked = Object.keys(WORKSHOP_PARTS).sort((a, b) => values[a] - values[b]);
  const rankLabel = (health) => health < 25 ? 'CRITICAL' : health < 50 ? 'HIGH PRIORITY' : health < 80 ? 'PLAN SERVICE' : 'GOOD';
  const rows = ranked.map((key, index) => {
    const config = WORKSHOP_PARTS[key];
    const health = values[key];
    const quote = workshopQuote(state, key);
    const priorityClass = health < 25 ? 'critical' : health < 50 ? 'high' : health < 80 ? 'plan' : 'good';
    const price = quote.cost ? naira(quote.cost) : 'UP TO DATE';
    return `<li class="kano-workshop-plan-row" data-level="${priorityClass}"><span class="kano-workshop-plan-rank">${index + 1}</span><div class="kano-workshop-plan-part"><strong>${config.label}</strong><small>${health}% CONDITION · ${rankLabel(health)}</small></div><b class="kano-workshop-plan-cost">${price}</b></li>`;
  }).join('');
  const fullQuote = workshopQuote(state, 'full');
  let budgetText = 'All tracked components are at 100%; no service budget is currently required.';
  if (fullQuote.cost > 0) {
    budgetText = wallet >= fullQuote.cost
      ? `Full-service estimate ${naira(fullQuote.cost)} · covered by the current wallet.`
      : `Full-service estimate ${naira(fullQuote.cost)} · short by ${naira(fullQuote.cost - wallet)} at the current wallet balance.`;
  }
  return `<section class="kano-workshop-planner" aria-labelledby="kano-workshop-planner-title"><div class="kano-workshop-planner-heading"><h4 id="kano-workshop-planner-title">REPAIR PRIORITY &amp; BUDGET</h4><span>LOWEST CONDITION FIRST</span></div><ol class="kano-workshop-plan-list">${rows}</ol><div class="kano-workshop-plan-total"><div><span>FULL SERVICE</span><strong>${fullQuote.cost ? naira(fullQuote.cost) : '₦0'}</strong></div><p>${escapeWorkshopHTML(budgetText)}</p></div><small class="kano-workshop-planner-note">Priority is sorted using the game's current BODY, ENGINE and TYRES values. Individual service prices include labour per transaction; a full service includes one labour fee. This is an in-game budget aid, not a real-world vehicle inspection.</small></section>`;
}

function workshopTodayKey() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

function normalizeWorkshopDueDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return '';
  const date = new Date(`${value}T12:00:00`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value ? value : '';
}

function readWorkshopSavingsGoal() {
  try {
    const raw = JSON.parse(localStorage.getItem(WORKSHOP_SAVINGS_GOAL_KEY) || 'null');
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
    const targetNaira = Math.floor(Number(raw.targetNaira));
    if (!Number.isFinite(targetNaira) || targetNaira < 1 || targetNaira > 100000000) return null;
    return {
      targetNaira,
      dueDate: normalizeWorkshopDueDate(raw.dueDate) || '',
      updatedAt: Number.isFinite(Number(raw.updatedAt)) ? Number(raw.updatedAt) : 0,
    };
  } catch (_) {
    return null;
  }
}

function workshopSavingsGoalMarkup(state, wallet) {
  const goal = readWorkshopSavingsGoal();
  const fullQuote = workshopQuote(state, 'full');
  const dueDateValue = goal?.dueDate || '';
  let statusText = 'Set a target to track how the current wallet compares with your planned repair budget.';
  let statusLevel = 'empty';
  let goalSummary = '<div class="kano-workshop-goal-empty">No repair-fund target saved on this device.</div>';

  if (goal) {
    const progress = Math.min(100, Math.floor((wallet / goal.targetNaira) * 100));
    const shortfall = Math.max(0, goal.targetNaira - wallet);
    const surplus = Math.max(0, wallet - goal.targetNaira);
    const dueLabel = goal.dueDate
      ? new Date(`${goal.dueDate}T12:00:00`).toLocaleDateString('en-NG', { dateStyle: 'medium' })
      : 'No target date';
    if (shortfall === 0) {
      statusText = `TARGET COVERED · Current wallet is at or above ${naira(goal.targetNaira)}.`;
      statusLevel = 'reached';
    } else if (goal.dueDate && goal.dueDate < workshopTodayKey()) {
      statusText = `TARGET DATE PASSED · ${naira(shortfall)} remains to reach the planned target.`;
      statusLevel = 'overdue';
    } else if (goal.dueDate && goal.dueDate === workshopTodayKey()) {
      statusText = `TARGET DATE TODAY · ${naira(shortfall)} remains to reach the planned target.`;
      statusLevel = 'due';
    } else {
      statusText = `${naira(shortfall)} remains before the wallet reaches the target${goal.dueDate ? ` by ${dueLabel}` : ''}.`;
      statusLevel = shortfall > wallet ? 'saving' : 'near';
    }
    goalSummary = `<div class="kano-workshop-goal-summary"><div class="kano-workshop-goal-numbers"><div><span>REPAIR TARGET</span><strong>${naira(goal.targetNaira)}</strong></div><div><span>WALLET COVERAGE</span><strong>${progress}%</strong></div></div><div class="kano-workshop-goal-meter" role="progressbar" aria-label="Current wallet coverage of repair target" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${progress}"><i style="width:${progress}%"></i></div><p>${shortfall ? `Target gap: ${naira(shortfall)}.` : `Wallet exceeds target by ${naira(surplus)}.`} Due: ${escapeWorkshopHTML(dueLabel)}.</p><small>The wallet is not ring-fenced: gameplay purchases and other costs can reduce this coverage.</small></div>`;
  }

  const targetValue = goal ? String(goal.targetNaira) : (fullQuote.cost ? String(fullQuote.cost) : '');
  const clearButton = goal ? '<button type="button" class="kano-workshop-goal-secondary" data-kano-workshop-goal-clear>DELETE GOAL</button>' : '';
  return `<section class="kano-workshop-goal" aria-labelledby="kano-workshop-goal-title"><div class="kano-workshop-goal-heading"><h4 id="kano-workshop-goal-title">REPAIR FUND TARGET &amp; REMINDER</h4><span>LOCAL PLAN</span></div><p class="kano-workshop-goal-intro">Set a target amount and optional date. This creates a reminder only; it does not reserve or deduct game money.</p>${goalSummary}<div class="kano-workshop-goal-status" data-level="${statusLevel}" role="status">${escapeWorkshopHTML(statusText)}</div><div class="kano-workshop-goal-form"><label for="kano-workshop-goal-amount">TARGET AMOUNT (₦)<input id="kano-workshop-goal-amount" data-kano-workshop-goal-amount type="number" min="1" max="100000000" step="100" inputmode="numeric" value="${targetValue}" placeholder="Enter target amount"></label><label for="kano-workshop-goal-date">TARGET DATE (OPTIONAL)<input id="kano-workshop-goal-date" data-kano-workshop-goal-date type="date" min="${workshopTodayKey()}" value="${dueDateValue}" /></label></div><div class="kano-workshop-goal-actions"><button type="button" data-kano-workshop-goal-save>SAVE TARGET</button><button type="button" class="kano-workshop-goal-secondary" data-kano-workshop-goal-use-quote ${fullQuote.cost ? '' : 'disabled'}>USE FULL-SERVICE ESTIMATE</button>${clearButton}</div><small class="kano-workshop-goal-note">Saved in this browser on this device, separately from game progress and service receipts. It is not included in the service-history backup.</small></section>`;
}

function handleWorkshopSavingsGoalAction(action) {
  const panel = document.getElementById('kano-workshop-panel');
  const game = activeGame || window.__KANO_LIFE_GAME__;
  if (!panel) return;
  if (action === 'use-quote') {
    if (!game?.s) {
      setWorkshopMessage('Vehicle state is not ready. No target was changed.');
      return;
    }
    const quote = workshopQuote(game.s, 'full');
    if (!quote.cost) {
      setWorkshopMessage('The current vehicle has no repair deficit. Enter a custom target instead.');
      return;
    }
    const amount = panel.querySelector('[data-kano-workshop-goal-amount]');
    if (amount) {
      amount.value = String(quote.cost);
      amount.focus();
    }
    setWorkshopMessage(`Full-service estimate loaded: ${naira(quote.cost)}. Save the target to keep it.`);
    return;
  }
  if (action === 'clear') {
    try {
      localStorage.removeItem(WORKSHOP_SAVINGS_GOAL_KEY);
      panel.dataset.signature = '';
      panel.dataset.message = 'Repair-fund target deleted. Wallet and vehicle condition were not changed.';
      renderWorkshopPanel(game?.s || window.__KANO_LIFE_GAME__?.s);
    } catch (_) {
      setWorkshopMessage('Could not delete the target because browser storage is unavailable.');
    }
    return;
  }
  if (action !== 'save') return;

  const amountInput = panel.querySelector('[data-kano-workshop-goal-amount]');
  const dateInput = panel.querySelector('[data-kano-workshop-goal-date]');
  const targetNaira = Math.floor(Number(amountInput?.value));
  if (!Number.isFinite(targetNaira) || targetNaira < 1 || targetNaira > 100000000) {
    setWorkshopMessage('Enter a target amount between ₦1 and ₦100,000,000. No target was saved.');
    amountInput?.focus();
    return;
  }
  const dateRaw = String(dateInput?.value || '');
  const dueDate = dateRaw ? normalizeWorkshopDueDate(dateRaw) : '';
  if (dateRaw && !dueDate) {
    setWorkshopMessage('Enter a valid target date. No target was saved.');
    dateInput?.focus();
    return;
  }
  if (dueDate && dueDate < workshopTodayKey()) {
    setWorkshopMessage('Choose today or a future date for the reminder. No target was saved.');
    dateInput?.focus();
    return;
  }
  try {
    const record = { targetNaira, dueDate, updatedAt: Date.now() };
    localStorage.setItem(WORKSHOP_SAVINGS_GOAL_KEY, JSON.stringify(record));
    const verify = readWorkshopSavingsGoal();
    if (!verify || verify.targetNaira !== targetNaira || verify.dueDate !== dueDate) {
      throw new Error('Saved goal could not be verified.');
    }
    panel.dataset.signature = '';
    panel.dataset.message = `Repair-fund target saved at ${naira(targetNaira)}${dueDate ? ` with a reminder date of ${dueDate}` : ''}. No money was deducted.`;
    renderWorkshopPanel(game?.s || window.__KANO_LIFE_GAME__?.s);
  } catch (_) {
    setWorkshopMessage('Could not save the target because browser storage is unavailable. Wallet and vehicle condition were not changed.');
  }
}

function workshopMonthlyBudgetData() {
  const now = new Date();
  const monthKey = workshopLedgerMonthKey(now.getTime());
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
  const nextMonthStart = new Date(now.getFullYear(), now.getMonth() + 1, 1).getTime();
  const currentHistory = readWorkshopHistory().filter((entry) => {
    const time = Number(entry.time);
    return Number.isFinite(time) && time >= monthStart && time < nextMonthStart && time <= now.getTime();
  });
  const ledger = ensureWorkshopSpendingLedger();
  const ledgerMonth = monthKey ? ledger.months[monthKey] : null;
  const fallbackSpend = currentHistory.reduce((sum, entry) => sum + Math.max(0, Math.floor(Number(entry.cost) || 0)), 0);
  const spent = ledgerMonth ? workshopLedgerMonthTotal(ledgerMonth) : fallbackSpend;
  const budget = readWorkshopMonthlyBudget();
  return {
    now,
    monthKey,
    monthLabel: now.toLocaleDateString('en-NG', { month: 'long', year: 'numeric' }),
    currentHistory,
    ledgerMonth,
    coverageComplete: ledgerMonth ? Boolean(ledgerMonth.coverageComplete) : currentHistory.length === 0,
    ledgerTransactionCount: ledgerMonth ? ledgerMonth.transactions.length + ledgerMonth.archivedCount : currentHistory.length,
    spent,
    budget,
    remaining: budget ? Math.max(0, budget.monthlyLimitNaira - spent) : null,
    exceeded: Boolean(budget && spent > budget.monthlyLimitNaira),
    progress: budget ? Math.min(100, Math.round((spent / budget.monthlyLimitNaira) * 100)) : 0,
  };
}

function workshopMonthlyBudgetMarkup() {
  const data = workshopMonthlyBudgetData();
  let level = 'empty';
  let statusText = 'Set a monthly workshop cap to monitor spending recorded in this browser.';
  if (data.budget) {
    if (data.spent > data.budget.monthlyLimitNaira) {
      level = 'over';
      statusText = `MONTHLY CAP EXCEEDED by ${naira(data.spent - data.budget.monthlyLimitNaira)}.`;
    } else if (data.spent >= data.budget.monthlyLimitNaira) {
      level = 'reached';
      statusText = 'MONTHLY CAP REACHED. No budget remains for additional recorded workshop spending.';
    } else if (data.progress >= 75) {
      level = 'near';
      statusText = `${data.progress}% of this month’s cap is used. ${naira(data.remaining)} remains.`;
    } else {
      level = 'good';
      statusText = `${naira(data.remaining)} remains under this month’s workshop cap.`;
    }
  }
  const coverageMarkup = data.coverageComplete
    ? `<div class="kano-workshop-monthly-coverage" data-level="complete" role="status">LEDGER COVERAGE: COMPLETE FOR THIS CALENDAR MONTH · ${data.ledgerTransactionCount} TRACKED SERVICE${data.ledgerTransactionCount === 1 ? '' : 'S'}.</div>`
    : '<div class="kano-workshop-monthly-coverage" data-level="partial" role="status">LEDGER COVERAGE: PARTIAL · The total includes tracked transactions, but services from before this upgrade or imported without a full ledger may be missing.</div>';
  const limit = data.budget ? String(data.budget.monthlyLimitNaira) : '';
  const meterMarkup = data.budget
    ? `<div class="kano-workshop-monthly-meter" role="progressbar" aria-label="Monthly recorded workshop spending compared with cap" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${data.progress}"><i style="width:${data.progress}%"></i></div><div class="kano-workshop-monthly-numbers"><span>RECORDED THIS MONTH<strong>${naira(data.spent)}</strong></span><span>MONTHLY CAP<strong>${naira(data.budget.monthlyLimitNaira)}</strong></span><span>REMAINING<strong>${data.exceeded ? `-${naira(data.spent - data.budget.monthlyLimitNaira)}` : naira(data.remaining)}</strong></span></div>`
    : '<div class="kano-workshop-monthly-empty">No monthly spending cap is saved on this device.</div>';
  return `<section class="kano-workshop-monthly-budget" aria-labelledby="kano-workshop-monthly-budget-title"><div class="kano-workshop-monthly-heading"><h4 id="kano-workshop-monthly-budget-title">MONTHLY WORKSHOP BUDGET GUARD</h4><span>${escapeWorkshopHTML(data.monthLabel.toUpperCase())}</span></div><p class="kano-workshop-monthly-intro">Set a maximum for workshop spend this calendar month. This is a warning and planning tool, not a lock on game money. A separate spending ledger keeps tracking new services after old receipts leave the recent-history list.</p>${meterMarkup}<div class="kano-workshop-monthly-status" data-level="${level}" role="status">${escapeWorkshopHTML(statusText)}</div>${coverageMarkup}<form class="kano-workshop-monthly-form" data-kano-workshop-budget-form><label for="kano-workshop-monthly-limit">MONTHLY CAP (₦)<input id="kano-workshop-monthly-limit" data-kano-workshop-budget-amount type="number" min="1" max="100000000" step="500" inputmode="numeric" value="${limit}" placeholder="Enter monthly cap" /></label><div class="kano-workshop-monthly-actions"><button type="button" data-kano-workshop-budget-save>SAVE MONTHLY CAP</button>${data.budget ? '<button type="button" class="kano-workshop-monthly-remove" data-kano-workshop-budget-clear>REMOVE CAP</button>' : ''}</div></form><small class="kano-workshop-monthly-note">Current-month spend comes from the local ledger, not just the latest ${WORKSHOP_HISTORY_LIMIT} receipts. The ledger retains up to ${WORKSHOP_LEDGER_MONTHS_LIMIT} calendar months and ${WORKSHOP_LEDGER_TRANSACTIONS_LIMIT} individually deduplicated transactions per month; months affected by legacy migration, partial imports, or archived overflow are flagged. No money is reserved or deducted by this panel.</small></section>`;
}

function handleWorkshopMonthlyBudgetAction(action) {
  const panel = document.getElementById('kano-workshop-panel');
  const game = activeGame || window.__KANO_LIFE_GAME__;
  if (!panel) return;
  if (action === 'clear') {
    if (!window.confirm('Remove the saved monthly workshop spending cap? Service history, game money and vehicle condition will remain unchanged.')) return;
    try {
      localStorage.removeItem(WORKSHOP_MONTHLY_BUDGET_KEY);
      panel.dataset.signature = '';
      panel.dataset.message = 'Monthly workshop cap removed. Service history and gameplay data were not changed.';
      renderWorkshopPanel(game?.s || window.__KANO_LIFE_GAME__?.s);
    } catch (_) {
      setWorkshopMessage('Could not remove the monthly cap because browser storage is unavailable.');
    }
    return;
  }
  if (action !== 'save') return;
  const input = panel.querySelector('[data-kano-workshop-budget-amount]');
  const monthlyLimitNaira = Math.floor(Number(input?.value));
  if (!Number.isFinite(monthlyLimitNaira) || monthlyLimitNaira < 1 || monthlyLimitNaira > 100000000) {
    setWorkshopMessage('Enter a monthly cap from ₦1 to ₦100,000,000. No setting was changed.');
    input?.focus();
    return;
  }
  try {
    const record = { monthlyLimitNaira, updatedAt: Date.now() };
    localStorage.setItem(WORKSHOP_MONTHLY_BUDGET_KEY, JSON.stringify(record));
    const verify = readWorkshopMonthlyBudget();
    if (!verify || verify.monthlyLimitNaira !== monthlyLimitNaira) throw new Error('Saved monthly cap could not be verified.');
    panel.dataset.signature = '';
    panel.dataset.message = `Monthly workshop spending cap saved at ${naira(monthlyLimitNaira)}. It does not reserve money or block repairs.`;
    renderWorkshopPanel(game?.s || window.__KANO_LIFE_GAME__?.s);
  } catch (_) {
    setWorkshopMessage('Could not save the monthly cap because browser storage is unavailable. Wallet and vehicle condition were not changed.');
  }
}

function renderWorkshopPanel(state = activeGame?.s) {
  const panel = document.getElementById('kano-workshop-panel');
  if (!panel || !state) return;
  const wallet = Math.max(0, Math.floor(Number(save.money) || 0));
  const values = Object.fromEntries(Object.keys(WORKSHOP_PARTS).map((key) => [key, workshopHealth(state, key)]));
  // The saved history is part of the render signature. Without it, importing a
  // backup while the wallet/vehicle state stays unchanged leaves stale records
  // on screen until a later unrelated state change.
  const historySignature = readWorkshopHistory()
    .map((entry) => `${entry.time}:${entry.service}:${entry.cost}:${entry.walletAfter}:${entry.parts.join(',')}:${JSON.stringify(entry.conditionBefore || null)}:${JSON.stringify(entry.conditionAfter || null)}`)
    .join(';');
  const goalSignature = JSON.stringify(readWorkshopSavingsGoal() || null);
  const monthlyBudgetSignature = JSON.stringify(readWorkshopMonthlyBudget() || null);
  const annualBudgetSignature = JSON.stringify(readWorkshopAnnualBudgets());
  const spendingLedger = ensureWorkshopSpendingLedger();
  const ledgerSignature = Object.entries(spendingLedger.months).map(([monthKey, month]) =>
    `${monthKey}:${workshopLedgerMonthTotal(month)}:${month.coverageComplete ? 1 : 0}:${month.transactions.length}:${month.archivedCount}`
  ).join(';');
  const ledgerAudit = workshopLedgerAuditData();
  const auditSignature = `${ledgerAudit.status}:${ledgerAudit.unmatchedReceiptCount}:${ledgerAudit.partialMonthCount}:${ledgerAudit.recoveryCopyAvailable ? 1 : 0}:${ledgerAudit.rawDuplicateIdentities}`;
  const signature = `${values.body}|${values.engine}|${values.tyres}|${wallet}|${historySignature}|${goalSignature}|${monthlyBudgetSignature}|${annualBudgetSignature}|${ledgerSignature}|${auditSignature}`;
  if (panel.dataset.signature === signature) return;
  panel.dataset.signature = signature;

  const partsMarkup = Object.entries(WORKSHOP_PARTS).map(([key, config]) => {
    const health = values[key];
    const quote = workshopQuote(state, key);
    return `<div class="kano-workshop-part"><div class="kano-workshop-part-label"><span>${config.label}</span><b>${health}%</b></div><div class="kano-workshop-meter" role="progressbar" aria-label="${config.label} condition" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${health}"><i style="width:${health}%;background:${config.color}"></i></div><small>${health < 25 ? 'CRITICAL' : health < 50 ? 'WORN' : health < 80 ? 'SERVICEABLE' : 'GOOD'} CONDITION</small></div>`;
  }).join('');

  const services = [
    { key: 'body', label: 'BODY REPAIR' },
    { key: 'engine', label: 'ENGINE SERVICE' },
    { key: 'tyres', label: 'TYRE SERVICE' },
    { key: 'full', label: 'FULL SERVICE' },
  ];
  const serviceMarkup = services.map(({ key, label }) => {
    const quote = workshopQuote(state, key);
    const unavailable = quote.cost === 0;
    const unaffordable = quote.cost > wallet;
    const buttonLabel = unavailable ? `${label} · UP TO DATE` : `${label} · ${naira(quote.cost)}`;
    const title = unavailable ? 'No repair is required for this service.' : unaffordable ? `Costs ${naira(quote.cost)}; banked wallet has ${naira(wallet)}.` : `Repair the selected components for ${naira(quote.cost)}.`;
    return `<button type="button" class="kano-workshop-service" data-kano-workshop-service="${key}" ${unavailable || unaffordable ? 'disabled' : ''} title="${title}"><strong>${buttonLabel}</strong><span>${unavailable ? 'No condition loss detected' : unaffordable ? `Short by ${naira(quote.cost - wallet)}` : `${quote.parts.map((part) => `${part.label} +${part.deficit}%`).join(' · ')}`}</span></button>`;
  }).join('');

  panel.innerHTML = `
    <div class="kano-workshop-header"><div><p class="kano-workshop-eyebrow">KANO LIFE · MECHANIC'S BAY</p><h3 id="kano-workshop-title">Service your keke</h3><p>Repairs use banked funds and restore the selected components to 100%.</p></div><div class="kano-workshop-wallet"><small>BANKED WALLET</small><strong>${naira(wallet)}</strong></div></div>
    ${workshopMaintenanceMarkup(values, wallet)}
    <div class="kano-workshop-parts">${partsMarkup}</div>
    ${workshopConditionTrendMarkup(values)}
    ${workshopBudgetPlannerMarkup(state, values, wallet)}
    ${workshopSavingsGoalMarkup(state, wallet)}
    ${workshopCostAnalyticsMarkup()}
    ${workshopMonthlyBudgetMarkup()}
    ${workshopLedgerAuditMarkup(ledgerAudit)}
    ${workshopLedgerStatementMarkup(panel.dataset.ledgerStatementMonth || '')}
    ${workshopAnnualReportMarkup(panel.dataset.annualReportYear || '')}
    <div class="kano-workshop-service-list">${serviceMarkup}</div>
    <p class="kano-workshop-cost-note">Quote includes a ${naira(WORKSHOP_LABOUR_FEE)} labour fee when repairs are needed. A separate confirmation is required before money is deducted.</p>
    <p id="kano-workshop-status" class="kano-workshop-status" role="status" aria-live="polite"></p>
    <section class="kano-workshop-history" aria-labelledby="kano-workshop-history-title"><div class="kano-workshop-history-heading"><h4 id="kano-workshop-history-title">RECENT SERVICE RECORDS</h4><span>THIS DEVICE · MAX 12</span></div>${workshopHistorySummaryMarkup()}<div class="kano-workshop-history-actions"><button type="button" data-kano-workshop-export="csv" ${readWorkshopHistory().length ? '' : 'disabled'}>EXPORT CSV</button><button type="button" data-kano-workshop-export="json" ${readWorkshopHistory().length ? '' : 'disabled'}>EXPORT JSON BACKUP</button><button type="button" data-kano-workshop-import-trigger>IMPORT JSON BACKUP</button><button type="button" data-kano-workshop-plan-export ${readWorkshopHistory().length || readWorkshopSavingsGoal() || readWorkshopMonthlyBudget() || workshopAnnualBudgetsHaveTargets(readWorkshopAnnualBudgets()) || workshopSpendingLedgerHasEntries(ensureWorkshopSpendingLedger()) ? '' : 'disabled'}>EXPORT PLAN BACKUP</button><button type="button" data-kano-workshop-plan-import-trigger>IMPORT PLAN BACKUP</button><input type="file" accept=".json,application/json" data-kano-workshop-import-file hidden aria-label="Choose a Kano Life service history JSON backup"><input type="file" accept=".json,application/json" data-kano-workshop-plan-import-file hidden aria-label="Choose a Kano Life workshop plan JSON backup"></div><ol id="kano-workshop-history-list">${workshopHistoryMarkup()}</ol><p class="kano-workshop-history-note">EXPORT JSON BACKUP contains service receipts only. EXPORT PLAN BACKUP includes recent receipts, the repair-fund target, monthly cap, year-specific annual targets and separate monthly spending ledger for device transfer. Neither file contains the game wallet, vehicle save, or gameplay progress. Clearing browser storage removes these local records.</p></section>
    <dialog id="kano-workshop-confirm" class="kano-workshop-confirm" aria-labelledby="kano-workshop-confirm-title"><div class="kano-workshop-confirm-inner"><p class="kano-workshop-eyebrow">PAYMENT CONFIRMATION</p><h3 id="kano-workshop-confirm-title">Confirm workshop service</h3><p id="kano-workshop-confirm-summary">Review the repair and total before paying.</p><div id="kano-workshop-confirm-breakdown" class="kano-workshop-confirm-breakdown"></div><div class="kano-workshop-confirm-wallet"><span>WALLET AFTER SERVICE</span><strong id="kano-workshop-wallet-after">—</strong></div><div class="kano-workshop-confirm-actions"><button type="button" class="kano-workshop-cancel" data-kano-workshop-cancel>Cancel</button><button type="button" class="kano-workshop-confirm-pay" data-kano-workshop-confirm>CONFIRM &amp; PAY</button></div></div></dialog>`;
  const status = panel.querySelector('#kano-workshop-status');
  status.textContent = panel.dataset.message || 'Select a service to see its cost.';
}

function updateWorkshopWalletLabels() {
  const balance = naira(save.money);
  for (const selector of ['#wallet-balance', '#garage-wallet']) {
    const element = document.querySelector(selector);
    if (element) element.textContent = balance;
  }
}

function requestWorkshopService(serviceKey) {
  const game = activeGame || window.__KANO_LIFE_GAME__;
  const panel = document.getElementById('kano-workshop-panel');
  const garage = document.getElementById('garage-screen');
  const garageVisible = garage && !garage.classList.contains('hidden')
    && getComputedStyle(garage).display !== 'none' && getComputedStyle(garage).visibility !== 'hidden';
  if (!game?.s || !panel || !garageVisible) {
    performWorkshopService(serviceKey);
    return;
  }
  const quote = workshopQuote(game.s, serviceKey);
  const wallet = Math.max(0, Math.floor(Number(save.money) || 0));
  if (!quote.cost || quote.cost > wallet) {
    performWorkshopService(serviceKey);
    return;
  }

  const dialog = panel.querySelector('#kano-workshop-confirm');
  if (!dialog) {
    setWorkshopMessage('Confirmation dialog unavailable. No money was deducted. Reopen the Garage and try again.');
    return;
  }
  const serviceNames = { body: 'BODY REPAIR', engine: 'ENGINE SERVICE', tyres: 'TYRE SERVICE', full: 'FULL SERVICE' };
  const summary = dialog.querySelector('#kano-workshop-confirm-summary');
  const breakdown = dialog.querySelector('#kano-workshop-confirm-breakdown');
  const walletAfter = dialog.querySelector('#kano-workshop-wallet-after');
  const confirm = dialog.querySelector('[data-kano-workshop-confirm]');
  if (summary) summary.textContent = `${serviceNames[serviceKey] || 'WORKSHOP SERVICE'} will restore the listed components to 100%.`;
  if (breakdown) {
    breakdown.innerHTML = `${quote.parts.map((part) => `<div><span>${escapeWorkshopHTML(part.label)} · ${part.deficit}% restored</span><strong>${naira(part.cost)}</strong></div>`).join('')}<div><span>Labour</span><strong>${naira(quote.labour)}</strong></div><div class="kano-workshop-confirm-total"><span>TOTAL</span><strong>${naira(quote.cost)}</strong></div>`;
  }
  if (walletAfter) walletAfter.textContent = naira(wallet - quote.cost);
  if (confirm) confirm.textContent = `CONFIRM & PAY ${naira(quote.cost)}`;
  dialog.dataset.service = serviceKey;
  try {
    if (typeof dialog.showModal === 'function') dialog.showModal();
    else dialog.setAttribute('open', '');
  } catch (_) {
    // Do not silently charge if the confirmation interface cannot be displayed.
    setWorkshopMessage('Confirmation window unavailable. No money was deducted. Reopen the Garage and try again.');
  }
}

function closeWorkshopConfirmation(dialog) {
  if (!dialog) return;
  try { if (typeof dialog.close === 'function' && dialog.open) dialog.close(); } catch (_) {}
  dialog.removeAttribute('open');
}

function performWorkshopService(serviceKey) {
  const game = activeGame || window.__KANO_LIFE_GAME__;
  const panel = document.getElementById('kano-workshop-panel');
  if (!game?.s || !panel) {
    setWorkshopMessage('Workshop unavailable: the game vehicle is not ready.');
    return;
  }
  // A service is a garage action, not an in-motion repair or collision exploit.
  const garage = document.getElementById('garage-screen');
  const garageVisible = garage && !garage.classList.contains('hidden')
    && getComputedStyle(garage).display !== 'none' && getComputedStyle(garage).visibility !== 'hidden';
  if (!garageVisible) {
    setWorkshopMessage('Open the Garage screen before repairing the keke.');
    return;
  }
  const quote = workshopQuote(game.s, serviceKey);
  const walletBefore = Math.max(0, Math.floor(Number(save.money) || 0));
  if (!quote.cost) {
    setWorkshopMessage('No repair required. The selected components are already at 100%.');
    return;
  }
  if (walletBefore < quote.cost) {
    setWorkshopMessage(`Insufficient banked funds. This service costs ${naira(quote.cost)}; wallet balance is ${naira(walletBefore)}.`);
    return;
  }
  if (!ensureKekeLifecycle(game)) {
    setWorkshopMessage('Workshop could not load the vehicle record. No money was deducted.');
    return;
  }

  const stateBefore = {
    condition: game.s.condition,
    engine: game.s.engine,
    tyres: game.s.tyres,
  };
  try {
    for (const part of quote.parts) {
      const config = WORKSHOP_PARTS[part.key];
      game.s[config.stateKey] = 100;
    }
    save.money = walletBefore - quote.cost;
    if (!syncRunHealthToLifecycle(game)) throw new Error('The vehicle condition could not be saved.');
    persist();
  } catch (error) {
    game.s.condition = stateBefore.condition;
    game.s.engine = stateBefore.engine;
    game.s.tyres = stateBefore.tyres;
    save.money = walletBefore;
    try { syncRunHealthToLifecycle(game); } catch (_) {}
    try { persist(); } catch (_) {}
    setWorkshopMessage(`Service cancelled; changes were rolled back. ${error?.message || 'Save failed.'}`);
    renderWorkshopPanel(game.s);
    updateVehicleHealthBadge(game.s);
    return;
  }

  try { game.ui?.update?.(game.s, game.route, game.driver); } catch (_) {}
  const conditionBefore = Object.fromEntries(Object.keys(WORKSHOP_PARTS).map((key) => [key, workshopHealth(stateBefore, key)]));
  const conditionAfter = Object.fromEntries(Object.keys(WORKSHOP_PARTS).map((key) => [key, workshopHealth(game.s, key)]));
  const historySaved = appendWorkshopHistory({
    service: serviceKey,
    parts: quote.parts.map((part) => part.key),
    cost: quote.cost,
    walletAfter: save.money,
    conditionBefore,
    conditionAfter,
  });
  updateWorkshopWalletLabels();
  updateVehicleHealthBadge(game.s);
  const completed = quote.parts.map((part) => part.label).join(', ');
  setWorkshopMessage(`SERVICE COMPLETE · ${completed} restored to 100% · ${naira(quote.cost)} deducted.${historySaved ? ' Receipt saved.' : ' Receipt could not be saved; the service itself is complete.'}`);
  renderWorkshopPanel(game.s);
  window.dispatchEvent(new CustomEvent('kano:workshop-service-complete', { detail: { service: serviceKey, cost: quote.cost, wallet: save.money, parts: quote.parts.map((part) => part.key), historySaved } }));
}

function installWorkshopUI() {
  const garagePanel = document.querySelector('#garage-screen .garage-panel');
  if (!garagePanel) return;
  let panel = document.getElementById('kano-workshop-panel');
  if (!panel) {
    panel = document.createElement('section');
    panel.id = 'kano-workshop-panel';
    panel.className = 'kano-workshop-panel';
    panel.setAttribute('aria-labelledby', 'kano-workshop-title');
    const backButton = garagePanel.querySelector('button.primary.full[data-close="garage-screen"]');
    if (backButton) garagePanel.insertBefore(panel, backButton);
    else garagePanel.append(panel);
  }
  if (!document.getElementById('kano-workshop-style')) {
    const style = document.createElement('style');
    style.id = 'kano-workshop-style';
    style.textContent = `
      #garage-screen .garage-panel{overflow-y:auto;overscroll-behavior:contain}
      #kano-workshop-panel{box-sizing:border-box;width:100%;margin:18px 0 12px;padding:14px;border:1px solid #00b4d855;border-radius:12px;background:linear-gradient(145deg,rgba(11,30,58,.98),rgba(8,17,28,.98));color:#eef5ff;text-align:left}
      .kano-workshop-header{display:flex;justify-content:space-between;align-items:flex-start;gap:10px}
      .kano-workshop-eyebrow{margin:0 0 5px;color:#00c4e7;font-size:9px;font-weight:900;letter-spacing:.12em}
      .kano-workshop-header h3{margin:0;color:#fff;font-size:18px;line-height:1.2}
      .kano-workshop-header p:not(.kano-workshop-eyebrow){margin:5px 0 0;color:#bbcbdd;font-size:11px;line-height:1.4;max-width:420px}
      .kano-workshop-wallet{flex:0 0 auto;padding:7px 9px;border:1px solid #f5c54266;border-radius:8px;background:#101d2c;text-align:right}
      .kano-workshop-wallet small{display:block;color:#f5d77d;font-size:8px;font-weight:900;white-space:nowrap}
      .kano-workshop-wallet strong{display:block;margin-top:3px;color:#ffe18b;font-size:14px;white-space:nowrap}
      .kano-workshop-maintenance{margin:12px 0 0;padding:10px 11px;border:1px solid #4dd6ac55;border-radius:9px;background:#4dd6ac0b}
      .kano-workshop-maintenance[data-level="soon"]{border-color:#00b4d866;background:#00b4d80b}
      .kano-workshop-maintenance[data-level="warning"]{border-color:#ffd16699;background:#ffd1660d}
      .kano-workshop-maintenance[data-level="critical"]{border-color:#ff6262aa;background:#ff62620d}
      .kano-workshop-maintenance-heading{display:flex;align-items:center;gap:7px;color:#a5f3d4;font-size:10px;font-weight:900;letter-spacing:.04em}
      .kano-workshop-maintenance[data-level="soon"] .kano-workshop-maintenance-heading{color:#8ce8f6}
      .kano-workshop-maintenance[data-level="warning"] .kano-workshop-maintenance-heading{color:#ffd166}
      .kano-workshop-maintenance[data-level="critical"] .kano-workshop-maintenance-heading{color:#ff8989}
      .kano-workshop-maintenance-indicator{width:7px;height:7px;flex:0 0 7px;border-radius:50%;background:#4dd6ac;box-shadow:0 0 0 3px #4dd6ac1d}
      .kano-workshop-maintenance[data-level="soon"] .kano-workshop-maintenance-indicator{background:#00b4d8;box-shadow:0 0 0 3px #00b4d81d}
      .kano-workshop-maintenance[data-level="warning"] .kano-workshop-maintenance-indicator{background:#ffd166;box-shadow:0 0 0 3px #ffd1661d}
      .kano-workshop-maintenance[data-level="critical"] .kano-workshop-maintenance-indicator{background:#ff6262;box-shadow:0 0 0 3px #ff62621d}
      .kano-workshop-maintenance p{margin:6px 0 0;color:#c5d5e5;font-size:10px;line-height:1.45;overflow-wrap:anywhere}
      .kano-workshop-maintenance small{display:block;margin-top:5px;color:#ffe18b;font-size:9px;line-height:1.4;overflow-wrap:anywhere}
      .kano-workshop-maintenance .kano-workshop-maintenance-footnote{color:#8198ad}
      .kano-workshop-trend,.kano-workshop-planner{margin:11px 0;padding:10px;border:1px solid #ffffff18;border-radius:9px;background:#ffffff05;min-width:0}
      .kano-workshop-trend-heading,.kano-workshop-planner-heading{display:flex;align-items:center;justify-content:space-between;gap:8px}
      .kano-workshop-trend-heading h4,.kano-workshop-planner-heading h4{margin:0;color:#edf5fd;font-size:10px;letter-spacing:.05em}
      .kano-workshop-trend-heading span,.kano-workshop-planner-heading span{color:#00c4e7;font-size:8px;font-weight:900;text-align:right}
      .kano-workshop-trend>p{margin:6px 0 9px;color:#9eb4c9;font-size:9px;line-height:1.45}
      .kano-workshop-trend-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:7px}
      .kano-workshop-trend-row{padding:7px;border:1px solid #ffffff12;border-radius:7px;background:#00000012;min-width:0}
      .kano-workshop-trend-top{display:flex;justify-content:space-between;align-items:center;gap:4px;color:#eaf4fc}
      .kano-workshop-trend-top strong{font-size:9px}.kano-workshop-trend-top span{font-size:8px;font-weight:900;white-space:nowrap}
      .kano-workshop-trend-bar{display:grid;gap:4px;margin:7px 0}
      .kano-workshop-trend-baseline,.kano-workshop-trend-current{height:4px;overflow:hidden;border-radius:99px;background:#2b3b4d}
      .kano-workshop-trend-baseline i,.kano-workshop-trend-current i{display:block;height:100%;border-radius:99px;background:#8395a8}
      .kano-workshop-trend-current i{background:#00b4d8}
      .kano-workshop-trend-row small{display:flex;justify-content:space-between;flex-wrap:wrap;gap:3px;color:#8fa5bb;font-size:7px;line-height:1.3}
      .kano-workshop-trend-row small b{font-size:8px}.kano-workshop-trend-row .down{color:#ff8d8d}.kano-workshop-trend-row .up{color:#86e6b9}.kano-workshop-trend-row .same{color:#b5c7d8}
      .kano-workshop-trend-foot{display:flex;justify-content:space-between;align-items:center;gap:8px;margin-top:8px;padding-top:7px;border-top:1px solid #ffffff14}
      .kano-workshop-trend-foot span{color:#9eb4c9;font-size:8px;font-weight:900}.kano-workshop-trend-foot strong{color:#ffcc7a;font-size:11px}
      .kano-workshop-plan-list{display:grid;gap:5px;margin:8px 0;padding:0;list-style:none}
      .kano-workshop-plan-row{display:grid;grid-template-columns:20px minmax(0,1fr) auto;align-items:center;gap:7px;padding:7px;border:1px solid #ffffff12;border-radius:7px;background:#ffffff04;min-width:0}
      .kano-workshop-plan-rank{display:grid;place-items:center;width:19px;height:19px;border-radius:6px;background:#26394c;color:#dce9f5;font-size:8px;font-weight:900}
      .kano-workshop-plan-part{display:grid;gap:3px;min-width:0}.kano-workshop-plan-part strong{color:#edf5fd;font-size:9px}.kano-workshop-plan-part small{color:#8fa5bb;font-size:7px;font-weight:900;letter-spacing:.03em}
      .kano-workshop-plan-cost{color:#ffe18b;font-size:9px;text-align:right;white-space:nowrap}
      .kano-workshop-plan-row[data-level="critical"]{border-color:#ff626255}.kano-workshop-plan-row[data-level="critical"] .kano-workshop-plan-rank{background:#682c35;color:#ffd5d5}
      .kano-workshop-plan-row[data-level="high"]{border-color:#ffd16655}.kano-workshop-plan-row[data-level="high"] .kano-workshop-plan-rank{background:#5a4720;color:#ffe7a3}
      .kano-workshop-plan-row[data-level="plan"] .kano-workshop-plan-rank{background:#14465a;color:#9aefff}
      .kano-workshop-plan-total{padding:9px;border:1px solid #f5c5423d;border-radius:7px;background:#f5c54208}
      .kano-workshop-plan-total>div{display:flex;align-items:center;justify-content:space-between;gap:8px}.kano-workshop-plan-total span{color:#f5d77d;font-size:8px;font-weight:900}.kano-workshop-plan-total strong{color:#ffe18b;font-size:12px}
      .kano-workshop-plan-total p{margin:5px 0 0;color:#c5d5e5;font-size:9px;line-height:1.4}
      .kano-workshop-planner-note{display:block;margin-top:7px;color:#8198ad;font-size:8px;line-height:1.4}
      .kano-workshop-goal{margin:11px 0;padding:10px;border:1px solid #f5c54245;border-radius:9px;background:linear-gradient(145deg,#f5c5420a,#00b4d806);min-width:0}
      .kano-workshop-goal-heading{display:flex;justify-content:space-between;align-items:center;gap:8px}
      .kano-workshop-goal-heading h4{margin:0;color:#fff0b5;font-size:10px;letter-spacing:.04em}
      .kano-workshop-goal-heading span{color:#f5d77d;font-size:8px;font-weight:900;white-space:nowrap}
      .kano-workshop-goal-intro{margin:6px 0 8px;color:#a9bbcd;font-size:9px;line-height:1.45}
      .kano-workshop-goal-empty{padding:8px;border:1px dashed #ffffff25;border-radius:7px;color:#94a9bd;font-size:9px}
      .kano-workshop-goal-summary{padding:9px;border:1px solid #f5c5422d;border-radius:7px;background:#00000017}
      .kano-workshop-goal-numbers{display:grid;grid-template-columns:1fr 1fr;gap:8px}
      .kano-workshop-goal-numbers>div{display:grid;gap:4px;min-width:0}.kano-workshop-goal-numbers span{color:#b7c7d7;font-size:8px;font-weight:900}.kano-workshop-goal-numbers strong{color:#ffe18b;font-size:14px;overflow-wrap:anywhere}
      .kano-workshop-goal-meter{height:7px;margin:9px 0 6px;overflow:hidden;border-radius:99px;background:#344254}.kano-workshop-goal-meter i{display:block;height:100%;border-radius:99px;background:linear-gradient(90deg,#00b4d8,#4dd6ac);transition:width .2s ease}
      .kano-workshop-goal-summary p{margin:0;color:#c4d2e0;font-size:9px;line-height:1.4}.kano-workshop-goal-summary small{display:block;margin-top:5px;color:#879caf;font-size:8px;line-height:1.4}
      .kano-workshop-goal-status{margin:7px 0;padding:8px;border:1px solid #00b4d844;border-radius:7px;background:#00b4d80b;color:#a6eaf5;font-size:9px;font-weight:800;line-height:1.4}
      .kano-workshop-goal-status[data-level="reached"]{border-color:#4dd6ac55;background:#4dd6ac0b;color:#9bf0d2}.kano-workshop-goal-status[data-level="overdue"],.kano-workshop-goal-status[data-level="due"]{border-color:#ff858555;background:#ff62620b;color:#ffabab}
      .kano-workshop-goal-form{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:8px}
      .kano-workshop-goal-form label{display:grid;gap:5px;color:#b8cadb;font-size:8px;font-weight:900;line-height:1.35}
      .kano-workshop-goal-form input{box-sizing:border-box;width:100%;min-width:0;min-height:38px;padding:8px;border:1px solid #ffffff24;border-radius:7px;background:#081524;color:#f2f7fc;font:inherit;font-size:11px;font-weight:700;color-scheme:dark}
      .kano-workshop-goal-form input:focus-visible{outline:2px solid #f5c542;outline-offset:1px}
      .kano-workshop-goal-actions{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:7px;margin-top:8px}
      .kano-workshop-goal-actions button{min-height:38px;padding:8px;border:1px solid #f5c54266;border-radius:7px;background:#f5c542;color:#152135;font-size:9px;font-weight:900;line-height:1.3;cursor:pointer;touch-action:manipulation}
      .kano-workshop-goal-actions button.kano-workshop-goal-secondary{border-color:#00b4d866;background:#10243a;color:#d9f5ff}
      .kano-workshop-goal-actions button:disabled{opacity:.45;cursor:not-allowed}.kano-workshop-goal-actions button:focus-visible{outline:2px solid #00d0ef;outline-offset:2px}
      .kano-workshop-goal-note{display:block;margin-top:7px;color:#8198ad;font-size:8px;line-height:1.4}
      .kano-workshop-cost-analytics{margin:11px 0;padding:10px;border:1px solid #00b4d833;border-radius:9px;background:linear-gradient(145deg,#00b4d808,#ffffff04);min-width:0}
      .kano-workshop-cost-heading{display:flex;align-items:center;justify-content:space-between;gap:8px}
      .kano-workshop-cost-heading h4{margin:0;color:#edf5fd;font-size:10px;letter-spacing:.05em}
      .kano-workshop-cost-heading span{color:#00c4e7;font-size:8px;font-weight:900;text-align:right}
      .kano-workshop-cost-intro{margin:6px 0 9px;color:#9eb4c9;font-size:9px;line-height:1.45}
      .kano-workshop-cost-metrics{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:6px}
      .kano-workshop-cost-metrics>div{display:grid;gap:5px;min-width:0;padding:8px;border:1px solid #ffffff14;border-radius:7px;background:#00000012}
      .kano-workshop-cost-metrics span{color:#9fb4c8;font-size:7px;font-weight:900;letter-spacing:.04em}
      .kano-workshop-cost-metrics strong{color:#ffe18b;font-size:11px;line-height:1.25;overflow-wrap:anywhere}
      .kano-workshop-cost-period{margin-top:7px;padding:8px;border:1px solid #ffffff15;border-radius:7px;background:#ffffff04}
      .kano-workshop-cost-period>div{display:flex;justify-content:space-between;gap:8px;align-items:center}
      .kano-workshop-cost-period>div span{color:#9fb4c8;font-size:8px;font-weight:900}
      .kano-workshop-cost-period>div strong{color:#eaf5ff;font-size:10px}
      .kano-workshop-cost-period p{margin:5px 0 0;color:#a9bbcd;font-size:9px;line-height:1.4}
      .kano-workshop-cost-period[data-level="up"]{border-color:#ffbc6b55}.kano-workshop-cost-period[data-level="up"] p{color:#ffd39a}
      .kano-workshop-cost-period[data-level="down"]{border-color:#4dd6ac55}.kano-workshop-cost-period[data-level="down"] p{color:#a5f3d4}
      .kano-workshop-cost-breakdown{display:grid;gap:8px;margin-top:10px}
      .kano-workshop-cost-row{min-width:0}
      .kano-workshop-cost-row-head{display:flex;justify-content:space-between;gap:8px;align-items:center}
      .kano-workshop-cost-row-head strong{color:#dbe8f7;font-size:9px}.kano-workshop-cost-row-head span{color:#ffe18b;font-size:9px;font-weight:900;white-space:nowrap}
      .kano-workshop-cost-bar{height:5px;margin:5px 0 3px;overflow:hidden;border-radius:99px;background:#2c3d50}
      .kano-workshop-cost-bar i{display:block;height:100%;border-radius:99px;background:linear-gradient(90deg,#00b4d8,#4dd6ac)}
      .kano-workshop-cost-row small{display:block;color:#8198ad;font-size:8px}
      .kano-workshop-cost-insight{margin-top:9px;padding-top:8px;border-top:1px solid #ffffff12}
      .kano-workshop-cost-insight p{margin:4px 0;color:#a9bbcd;font-size:9px;line-height:1.4}
      .kano-workshop-cost-export{width:100%;min-height:38px;margin-top:8px;padding:8px;border:1px solid #00b4d866;border-radius:7px;background:#10243a;color:#eaf5ff;font-size:9px;font-weight:900;cursor:pointer;touch-action:manipulation}
      .kano-workshop-cost-export:disabled{opacity:.45;cursor:not-allowed}.kano-workshop-cost-export:focus-visible{outline:2px solid #f5c542;outline-offset:2px}
      .kano-workshop-cost-note{display:block;margin-top:7px;color:#8198ad;font-size:8px;line-height:1.4}
      .kano-workshop-monthly-budget{margin:11px 0;padding:10px;border:1px solid #4dd6ac4d;border-radius:9px;background:linear-gradient(145deg,#4dd6ac08,#ffffff04);min-width:0}
      .kano-workshop-monthly-heading{display:flex;align-items:center;justify-content:space-between;gap:8px}
      .kano-workshop-monthly-heading h4{margin:0;color:#e8fff6;font-size:10px;letter-spacing:.04em}
      .kano-workshop-monthly-heading span{color:#76e7c1;font-size:8px;font-weight:900;text-align:right}
      .kano-workshop-monthly-intro{margin:6px 0 8px;color:#a9bbcd;font-size:9px;line-height:1.45}
      .kano-workshop-monthly-empty{padding:8px;border:1px dashed #ffffff25;border-radius:7px;color:#94a9bd;font-size:9px}
      .kano-workshop-monthly-meter{height:8px;margin:9px 0;overflow:hidden;border-radius:99px;background:#2e4050}
      .kano-workshop-monthly-meter i{display:block;height:100%;border-radius:99px;background:linear-gradient(90deg,#00b4d8,#4dd6ac);transition:width .2s ease}
      .kano-workshop-monthly-numbers{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:6px}
      .kano-workshop-monthly-numbers span{display:grid;gap:4px;min-width:0;padding:7px;border:1px solid #ffffff14;border-radius:7px;background:#00000012;color:#9fb4c8;font-size:7px;font-weight:900;overflow-wrap:anywhere}
      .kano-workshop-monthly-numbers strong{color:#eafff8;font-size:10px;line-height:1.25;overflow-wrap:anywhere}
      .kano-workshop-monthly-status{margin-top:7px;padding:8px;border:1px solid #4dd6ac35;border-radius:7px;background:#4dd6ac0a;color:#a5f3d4;font-size:9px;font-weight:900;line-height:1.4;overflow-wrap:anywhere}
      .kano-workshop-monthly-coverage{margin-top:6px;padding:7px;border:1px solid #00b4d855;border-radius:7px;background:#00b4d80b;color:#a4eaf5;font-size:8px;font-weight:900;line-height:1.45;overflow-wrap:anywhere}
      .kano-workshop-monthly-coverage[data-level="partial"]{border-color:#ffcc7a55;background:#ffcc7a0b;color:#ffdc9a}
      .kano-workshop-monthly-status[data-level="near"]{border-color:#ffcc7a55;background:#ffcc7a0b;color:#ffdc9a}
      .kano-workshop-monthly-status[data-level="reached"],.kano-workshop-monthly-status[data-level="over"]{border-color:#ff777755;background:#ff77770b;color:#ffaaaa}
      .kano-workshop-monthly-form{display:grid;grid-template-columns:minmax(0,1fr);gap:8px;margin-top:9px}
      .kano-workshop-monthly-form label{display:grid;gap:5px;color:#9fb4c8;font-size:8px;font-weight:900}
      .kano-workshop-monthly-form input{width:100%;min-width:0;box-sizing:border-box;padding:9px;border:1px solid #ffffff20;border-radius:7px;background:#061426;color:#f1f8ff;font-size:12px}
      .kano-workshop-monthly-actions{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:7px}
      .kano-workshop-monthly-actions button{min-height:36px;padding:7px;border:1px solid #00b4d866;border-radius:7px;background:#10243a;color:#eaf5ff;font-size:8px;font-weight:900;cursor:pointer;touch-action:manipulation}
      .kano-workshop-monthly-actions button[data-kano-workshop-budget-save]{background:#0f403d;border-color:#4dd6ac66;color:#c8fff0}
      .kano-workshop-monthly-actions .kano-workshop-monthly-remove{border-color:#ff777744;background:#381d29;color:#ffb7bd}
      .kano-workshop-monthly-actions button:focus-visible{outline:2px solid #f5c542;outline-offset:2px}
      .kano-workshop-monthly-note{display:block;margin-top:7px;color:#8198ad;font-size:8px;line-height:1.4}
      .kano-workshop-ledger-audit{margin:11px 0;padding:10px;border:1px solid #ffffff18;border-radius:9px;background:#ffffff05;min-width:0}
      .kano-workshop-audit-heading{display:flex;align-items:center;justify-content:space-between;gap:8px}
      .kano-workshop-audit-heading h4{margin:0;color:#edf5fd;font-size:10px;letter-spacing:.05em}
      .kano-workshop-audit-heading span{color:#00c4e7;font-size:8px;font-weight:900;text-align:right}
      .kano-workshop-audit-intro{margin:6px 0 9px;color:#9eb4c9;font-size:9px;line-height:1.45}
      .kano-workshop-audit-status{display:grid;gap:4px;padding:8px;border:1px solid #4dd6ac55;border-radius:7px;background:#4dd6ac0b;color:#a5f3d4}
      .kano-workshop-audit-status[data-level="warning"]{border-color:#ffcc7a66;background:#ffcc7a0b;color:#ffdc9a}
      .kano-workshop-audit-status[data-level="critical"]{border-color:#ff777766;background:#ff77770b;color:#ffaaaa}
      .kano-workshop-audit-status strong{font-size:9px;letter-spacing:.05em}
      .kano-workshop-audit-status span{font-size:8px;line-height:1.4}
      .kano-workshop-audit-metrics{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:6px;margin:8px 0}
      .kano-workshop-audit-metrics>div{display:grid;align-content:start;gap:4px;min-width:0;padding:7px;border:1px solid #ffffff12;border-radius:7px;background:#00000012}
      .kano-workshop-audit-metrics span{color:#9fb4c8;font-size:7px;font-weight:900;line-height:1.35}
      .kano-workshop-audit-metrics strong{color:#ffe18b;font-size:13px;overflow-wrap:anywhere}
      .kano-workshop-audit-metrics small{color:#8198ad;font-size:7px;line-height:1.35;overflow-wrap:anywhere}
      .kano-workshop-audit-issues{display:grid;gap:4px;margin:8px 0;padding-left:15px;color:#b9cbdd;font-size:8px;line-height:1.4}
      .kano-workshop-audit-actions{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:7px}
      .kano-workshop-audit-actions button{min-height:36px;min-width:0;padding:7px;border:1px solid #00b4d866;border-radius:7px;background:#10243a;color:#eaf5ff;font-size:8px;font-weight:900;line-height:1.25;cursor:pointer;touch-action:manipulation}
      .kano-workshop-audit-actions button[data-kano-workshop-ledger-reconcile]{border-color:#4dd6ac66;background:#0f403d;color:#c8fff0}
      .kano-workshop-audit-actions button:disabled{opacity:.45;cursor:not-allowed}
      .kano-workshop-audit-actions button:focus-visible{outline:2px solid #f5c542;outline-offset:2px}
      .kano-workshop-audit-note{display:block;margin-top:7px;color:#8198ad;font-size:8px;line-height:1.4}
      .kano-workshop-parts{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:7px;margin:14px 0}
      .kano-workshop-part{min-width:0;padding:9px;border:1px solid #ffffff16;border-radius:8px;background:#ffffff07}
      .kano-workshop-part-label{display:flex;justify-content:space-between;gap:4px;color:#eaf1f9;font-size:10px;font-weight:900}
      .kano-workshop-part-label b{color:#fff}
      .kano-workshop-meter{height:5px;margin:7px 0 5px;overflow:hidden;border-radius:99px;background:#314154}
      .kano-workshop-meter i{display:block;height:100%;border-radius:99px;transition:width .2s ease}
      .kano-workshop-part small{color:#8fa5bb;font-size:8px;font-weight:800}
      .kano-workshop-service-list{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:7px}
      .kano-workshop-service{display:flex;flex-direction:column;align-items:flex-start;gap:4px;min-height:52px;padding:9px;border:1px solid #00b4d866;border-radius:8px;background:#10243a;color:#f2f7fc;text-align:left;cursor:pointer;touch-action:manipulation}
      .kano-workshop-service strong{font-size:10px;line-height:1.3}
      .kano-workshop-service span{color:#aec4d8;font-size:9px;line-height:1.3}
      .kano-workshop-service:not(:disabled):active{transform:translateY(1px);background:#173552}
      .kano-workshop-service:disabled{border-color:#ffffff15;background:#ffffff06;color:#748496;cursor:not-allowed;opacity:.8}
      .kano-workshop-service:focus-visible{outline:2px solid #f5c542;outline-offset:2px}
      .kano-workshop-cost-note{margin:9px 0 6px;color:#9eb2c6;font-size:9px;line-height:1.4}
      .kano-workshop-status{min-height:17px;margin:7px 0 0;padding:8px;border:1px solid #4dd6ac3d;border-radius:7px;background:#4dd6ac0d;color:#a5f3d4;font-size:10px;font-weight:800;line-height:1.4;overflow-wrap:anywhere}
      .kano-workshop-history{margin-top:13px;padding-top:11px;border-top:1px solid #ffffff17}
      .kano-workshop-history-heading{display:flex;align-items:center;justify-content:space-between;gap:8px}
      .kano-workshop-history-heading h4{margin:0;color:#f3f7fc;font-size:10px;letter-spacing:.06em}
      .kano-workshop-history-heading span{color:#8fa5bb;font-size:8px;font-weight:900}
      .kano-workshop-history-summary{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:7px;margin:8px 0}
      .kano-workshop-history-summary>div{display:flex;justify-content:space-between;align-items:center;gap:8px;min-width:0;padding:8px;border:1px solid #ffffff15;border-radius:7px;background:#ffffff06}
      .kano-workshop-history-summary span{color:#9fb4c8;font-size:8px;font-weight:900;letter-spacing:.04em}
      .kano-workshop-history-summary strong{color:#ffe18b;font-size:11px;overflow-wrap:anywhere;text-align:right}.kano-workshop-history-summary small{grid-column:1/-1;color:#8198ad;font-size:8px;line-height:1.3;text-align:right}
      .kano-workshop-history-actions{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:7px;margin:8px 0}
      .kano-workshop-history-actions button{min-height:38px;padding:8px;border:1px solid #00b4d866;border-radius:7px;background:#10243a;color:#eaf5ff;font-size:9px;font-weight:900;cursor:pointer;touch-action:manipulation}
      .kano-workshop-history-actions button:disabled{opacity:.45;cursor:not-allowed}
      .kano-workshop-history-actions button:focus-visible{outline:2px solid #f5c542;outline-offset:2px}
      #kano-workshop-history-list{display:grid;gap:6px;margin:8px 0 0;padding:0;list-style:none}
      .kano-workshop-history-item{padding:8px;border:1px solid #ffffff13;border-radius:7px;background:#ffffff05;min-width:0}
      .kano-workshop-history-top{display:flex;justify-content:space-between;align-items:center;gap:8px}
      .kano-workshop-history-top strong{color:#d9e8f7;font-size:9px}
      .kano-workshop-history-top b{color:#ffe18b;font-size:10px;white-space:nowrap}
      .kano-workshop-history-item>span,.kano-workshop-history-item small{display:block;margin-top:4px;color:#a9bbcd;font-size:9px;line-height:1.35;overflow-wrap:anywhere}.kano-workshop-history-item .kano-workshop-history-condition{color:#a5f3d4}
      .kano-workshop-history-item small{color:#8198ad}
      .kano-workshop-history-empty,.kano-workshop-history-note{color:#8198ad;font-size:9px;line-height:1.4}
      .kano-workshop-history-empty{padding:8px;border:1px dashed #ffffff1b;border-radius:7px}
      .kano-workshop-history-note{margin:7px 0 0}
      .kano-workshop-confirm{width:min(440px,calc(100vw - 28px));max-width:calc(100vw - 28px);box-sizing:border-box;padding:0;border:1px solid #00b4d899;border-radius:14px;background:#0b1e3a;color:#eff6ff;box-shadow:0 24px 80px #0009}
      .kano-workshop-confirm::backdrop{background:rgba(2,8,16,.78);backdrop-filter:blur(3px)}
      .kano-workshop-confirm-inner{padding:17px}
      .kano-workshop-confirm h3{margin:0;color:#fff;font-size:18px}
      .kano-workshop-confirm-inner>p:not(.kano-workshop-eyebrow){margin:7px 0 12px;color:#b7c9db;font-size:11px;line-height:1.45}
      .kano-workshop-confirm-breakdown{display:grid;gap:7px;padding:10px;border-radius:8px;background:#ffffff08}
      .kano-workshop-confirm-breakdown>div{display:flex;justify-content:space-between;gap:10px;color:#bcd0e3;font-size:11px}
      .kano-workshop-confirm-breakdown>div strong{color:#f4f7fb;white-space:nowrap}
      .kano-workshop-confirm-breakdown .kano-workshop-confirm-total{margin-top:3px;padding-top:8px;border-top:1px solid #ffffff22;color:#ffe18b;font-weight:900}
      .kano-workshop-confirm-breakdown .kano-workshop-confirm-total strong{color:#ffe18b;font-size:14px}
      .kano-workshop-confirm-wallet{display:flex;justify-content:space-between;gap:8px;align-items:center;margin:11px 0;padding:9px;border:1px solid #f5c54255;border-radius:8px;background:#f5c5420a}
      .kano-workshop-confirm-wallet span{color:#f5d77d;font-size:9px;font-weight:900}
      .kano-workshop-confirm-wallet strong{color:#ffe18b;font-size:13px}
      .kano-workshop-confirm-actions{display:grid;grid-template-columns:1fr 1.4fr;gap:8px}
      .kano-workshop-confirm-actions button{min-height:42px;padding:8px;border-radius:8px;font-size:10px;font-weight:900;cursor:pointer;touch-action:manipulation}
      .kano-workshop-cancel{border:1px solid #ffffff25;background:#14263a;color:#d7e4f0}
      .kano-workshop-confirm-pay{border:1px solid #ffe18b;background:#f5c542;color:#142033}
      .kano-workshop-confirm-actions button:focus-visible{outline:2px solid #00d0ef;outline-offset:2px}
      .kano-workshop-ledger-statement{margin:11px 0;padding:10px;border:1px solid #ffffff18;border-radius:9px;background:#ffffff05;min-width:0}
      .kano-workshop-ledger-statement-heading{display:flex;justify-content:space-between;align-items:flex-start;gap:10px;min-width:0}
      .kano-workshop-ledger-statement-heading h4{margin:0;color:#f3f7fc;font-size:10px;letter-spacing:.06em}
      .kano-workshop-ledger-statement-heading p{margin:5px 0 0;color:#9db1c5;font-size:9px;line-height:1.4}
      .kano-workshop-ledger-statement-heading button{flex:0 0 auto;min-height:35px;padding:7px 9px;border:1px solid #00b4d866;border-radius:7px;background:#10243a;color:#eaf5ff;font-size:8px;font-weight:900;cursor:pointer;touch-action:manipulation}
      .kano-workshop-ledger-month-picker{display:grid;grid-template-columns:minmax(0,1fr);gap:5px;margin:10px 0;color:#9fb4c8;font-size:8px;font-weight:900;letter-spacing:.04em}
      .kano-workshop-ledger-month-picker select{width:100%;min-height:38px;padding:8px;border:1px solid #ffffff25;border-radius:7px;background:#10243a;color:#f2f7fc;font:inherit;font-size:11px;letter-spacing:normal}
      .kano-workshop-ledger-statement-status{display:flex;justify-content:space-between;gap:8px;align-items:center;margin:7px 0;padding:9px;border:1px solid #ffffff17;border-radius:7px;background:#ffffff06}
      .kano-workshop-ledger-statement-status strong{font-size:9px;color:#ffe18b}
      .kano-workshop-ledger-statement-status span{font-size:9px;color:#b4c6d8;text-align:right}
      .kano-workshop-ledger-statement-status[data-level="complete"]{border-color:#4dd6ac55}.kano-workshop-ledger-statement-status[data-level="complete"] strong{color:#a5f3d4}
      .kano-workshop-ledger-statement-status[data-level="partial"]{border-color:#f5c54255}.kano-workshop-ledger-statement-status[data-level="partial"] strong{color:#ffe18b}
      .kano-workshop-ledger-statement-status[data-level="empty"] strong{color:#a8bad0}
      .kano-workshop-ledger-statement-metrics{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:6px;margin:8px 0}
      .kano-workshop-ledger-statement-metrics>div{display:flex;flex-direction:column;gap:4px;min-width:0;padding:8px;border:1px solid #ffffff13;border-radius:7px;background:#ffffff04}
      .kano-workshop-ledger-statement-metrics span{color:#9fb4c8;font-size:7px;font-weight:900;letter-spacing:.03em;line-height:1.3}
      .kano-workshop-ledger-statement-metrics strong{color:#f5d77d;font-size:11px;overflow-wrap:anywhere}
      .kano-workshop-ledger-statement-metrics small{color:#8198ad;font-size:8px;line-height:1.35}
      .kano-workshop-ledger-table-wrap{max-width:100%;overflow-x:auto;border:1px solid #ffffff12;border-radius:7px}
      .kano-workshop-ledger-table{width:100%;min-width:410px;border-collapse:collapse;font-size:9px}
      .kano-workshop-ledger-table th{padding:8px 7px;background:#14263a;color:#9fb4c8;text-align:left;font-size:7px;letter-spacing:.04em;white-space:nowrap}
      .kano-workshop-ledger-table td{padding:8px 7px;border-top:1px solid #ffffff10;color:#c3d3e2;vertical-align:top;line-height:1.35}
      .kano-workshop-ledger-table td strong,.kano-workshop-ledger-table td small{display:block}.kano-workshop-ledger-table td strong{color:#eaf3fc;font-size:9px}.kano-workshop-ledger-table td small{margin-top:3px;color:#8298ad;font-size:8px}
      .kano-workshop-ledger-table .kano-workshop-ledger-money{text-align:right;color:#ffe18b;font-weight:900;white-space:nowrap}
      .kano-workshop-ledger-no-rows{padding:12px!important;color:#9fb4c8!important;line-height:1.5!important}
      .kano-workshop-ledger-coverage-note,.kano-workshop-ledger-statement-note{display:block;margin:8px 0 0;color:#8298ad;font-size:8px;line-height:1.45}
      .kano-workshop-ledger-statement button:focus-visible,.kano-workshop-ledger-month-picker select:focus-visible{outline:2px solid #f5c542;outline-offset:2px}
      .kano-workshop-annual-report{margin:11px 0;padding:10px;border:1px solid #ffffff18;border-radius:9px;background:#ffffff05;min-width:0}
      .kano-workshop-annual-heading{display:flex;justify-content:space-between;align-items:flex-start;gap:10px;min-width:0}
      .kano-workshop-annual-heading h4{margin:0;color:#f3f7fc;font-size:10px;letter-spacing:.05em;line-height:1.45}
      .kano-workshop-annual-heading p{margin:5px 0 0;color:#9db1c5;font-size:9px;line-height:1.4}
      .kano-workshop-annual-actions{display:flex;gap:6px;flex-wrap:wrap;justify-content:flex-end}.kano-workshop-annual-heading button{flex:0 0 auto;min-height:35px;padding:7px 9px;border:1px solid #00b4d866;border-radius:7px;background:#10243a;color:#eaf5ff;font-size:8px;font-weight:900;cursor:pointer;touch-action:manipulation}
      .kano-workshop-annual-year-picker{display:grid;gap:5px;margin:10px 0;color:#9fb4c8;font-size:8px;font-weight:900;letter-spacing:.04em}
      .kano-workshop-annual-year-picker select{width:100%;min-height:38px;padding:8px;border:1px solid #ffffff25;border-radius:7px;background:#10243a;color:#f2f7fc;font:inherit;font-size:11px;letter-spacing:normal}
      .kano-workshop-annual-period{display:flex;justify-content:space-between;align-items:center;gap:8px;margin:7px 0;padding:9px;border:1px solid #ffffff17;border-radius:7px;background:#ffffff06}
      .kano-workshop-annual-period strong{font-size:9px;color:#ffe18b}.kano-workshop-annual-period span{font-size:8px;color:#b4c6d8;text-align:right}
      .kano-workshop-annual-metrics{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:6px;margin:8px 0}
      .kano-workshop-annual-metrics>div{display:flex;flex-direction:column;gap:4px;min-width:0;padding:8px;border:1px solid #ffffff13;border-radius:7px;background:#ffffff04}
      .kano-workshop-annual-metrics span,.kano-workshop-annual-highlights>div>span{color:#9fb4c8;font-size:7px;font-weight:900;letter-spacing:.035em;line-height:1.35}
      .kano-workshop-annual-metrics strong{color:#f5d77d;font-size:12px;overflow-wrap:anywhere}.kano-workshop-annual-metrics small{color:#8198ad;font-size:8px;line-height:1.35}
      .kano-workshop-annual-budget{margin:9px 0;padding:10px;border:1px solid #f5c54235;border-radius:8px;background:#f5c54207;min-width:0}
      .kano-workshop-annual-budget-heading{display:flex;align-items:flex-start;justify-content:space-between;gap:8px}.kano-workshop-annual-budget-heading h5{margin:0;color:#ffe18b;font-size:9px;letter-spacing:.05em}.kano-workshop-annual-budget-heading p{margin:4px 0 0;color:#8198ad;font-size:8px}
      .kano-workshop-annual-budget-heading>span{padding:4px 6px;border:1px solid #ffffff20;border-radius:5px;color:#a9bbcd;font-size:7px;font-weight:900;text-align:right;white-space:normal}
      .kano-workshop-annual-budget-heading>span[data-level="good"]{border-color:#4dd6ac55;color:#a5f3d4}.kano-workshop-annual-budget-heading>span[data-level="near"]{border-color:#ffcc7a55;color:#ffdc9a}.kano-workshop-annual-budget-heading>span[data-level="over"],.kano-workshop-annual-budget-heading>span[data-level="reached"]{border-color:#ff777755;color:#ffaaaa}
      .kano-workshop-annual-budget-metrics{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:6px;margin:8px 0}.kano-workshop-annual-budget-metrics>div{display:grid;gap:4px;min-width:0;padding:7px;border:1px solid #ffffff12;border-radius:6px;background:#00000012}.kano-workshop-annual-budget-metrics span{color:#9fb4c8;font-size:7px;font-weight:900;line-height:1.35}.kano-workshop-annual-budget-metrics strong{color:#ffe18b;font-size:11px;line-height:1.3;overflow-wrap:anywhere}
      .kano-workshop-annual-budget-meter{height:8px;margin:8px 0;overflow:hidden;border-radius:99px;background:#2e4050}.kano-workshop-annual-budget-meter i{display:block;height:100%;max-width:100%;border-radius:99px;background:linear-gradient(90deg,#00b4d8,#4dd6ac)}
      .kano-workshop-annual-budget-message{margin:7px 0;color:#c4d3e2;font-size:8px;line-height:1.45}.kano-workshop-annual-budget-coverage{margin:6px 0;padding:7px;border:1px solid #00b4d844;border-radius:6px;background:#00b4d809;color:#a4eaf5;font-size:7px;font-weight:900;line-height:1.4;overflow-wrap:anywhere}.kano-workshop-annual-budget-coverage[data-level="partial"]{border-color:#ffcc7a55;background:#ffcc7a0a;color:#ffdc9a}
      .kano-workshop-annual-budget-form{display:grid;grid-template-columns:minmax(0,1fr);gap:7px;margin-top:8px}.kano-workshop-annual-budget-form label{display:grid;gap:5px;color:#9fb4c8;font-size:8px;font-weight:900}.kano-workshop-annual-budget-form input{width:100%;min-width:0;box-sizing:border-box;padding:9px;border:1px solid #ffffff25;border-radius:7px;background:#061426;color:#f1f8ff;font-size:12px}
      .kano-workshop-annual-budget-actions{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:7px}.kano-workshop-annual-budget-actions button{min-height:35px;min-width:0;padding:7px;border:1px solid #00b4d866;border-radius:7px;background:#10243a;color:#eaf5ff;font-size:8px;font-weight:900;cursor:pointer;touch-action:manipulation}.kano-workshop-annual-budget-actions button[data-kano-workshop-annual-budget-save]{border-color:#4dd6ac66;background:#0f403d;color:#c8fff0}.kano-workshop-annual-budget-actions button[data-kano-workshop-annual-budget-clear]{border-color:#ff777744;background:#381d29;color:#ffb7bd}.kano-workshop-annual-budget-actions button:focus-visible,.kano-workshop-annual-budget-form input:focus-visible{outline:2px solid #f5c542;outline-offset:2px}.kano-workshop-annual-budget-note{display:block;margin-top:7px;color:#8198ad;font-size:7px;line-height:1.4}

      .kano-workshop-forecast{margin:9px 0;padding:10px;border:1px solid #00b4d833;border-radius:8px;background:linear-gradient(135deg,#0d2639 0%,#101e31 65%,#14283a 100%);color:#dce8f4;min-width:0}
      .kano-workshop-forecast-heading{display:flex;justify-content:space-between;align-items:flex-start;gap:8px}.kano-workshop-forecast-heading h5{margin:0;color:#8ee3f2;font-size:10px;letter-spacing:.04em}.kano-workshop-forecast-heading p{margin:4px 0 0;color:#91a8bd;font-size:8px}.kano-workshop-forecast-heading>span{max-width:48%;padding:4px 6px;border:1px solid #ffffff20;border-radius:5px;color:#dce8f4;font-size:7px;font-weight:900;text-align:center}
      .kano-workshop-forecast-heading>span[data-level="good"]{border-color:#4dd6ac66;color:#a5f3d4}.kano-workshop-forecast-heading>span[data-level="caution"]{border-color:#f5c54266;color:#ffe18b}.kano-workshop-forecast-heading>span[data-level="pending"]{border-color:#58a6ff66;color:#bfdbfe}
      .kano-workshop-forecast-metrics{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:6px;margin:8px 0}.kano-workshop-forecast-metrics>div{display:flex;flex-direction:column;gap:4px;min-width:0;padding:8px;border:1px solid #ffffff12;border-radius:6px;background:#ffffff04}.kano-workshop-forecast-metrics span,.kano-workshop-forecast-scenarios span{color:#93a9be;font-size:7px;font-weight:900;line-height:1.35}.kano-workshop-forecast-metrics strong{color:#f5d77d;font-size:11px;overflow-wrap:anywhere}.kano-workshop-forecast-metrics small,.kano-workshop-forecast-scenarios small{color:#8198ad;font-size:7px;line-height:1.4}
      .kano-workshop-forecast-scenarios{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:6px;margin:7px 0}.kano-workshop-forecast-scenarios>div{display:flex;flex-direction:column;gap:5px;min-width:0;padding:8px 6px;border:1px solid #ffffff16;border-radius:6px;background:#ffffff04}.kano-workshop-forecast-scenarios strong{color:#eaf3fc;font-size:10px;overflow-wrap:anywhere}.kano-workshop-forecast-scenarios [data-scenario="base"]{border-color:#f5c54255;background:#f5c54208}.kano-workshop-forecast-scenarios [data-scenario="base"] strong{color:#ffe18b}.kano-workshop-forecast-message{margin:8px 0;color:#b8cadb;font-size:8px;line-height:1.5}.kano-workshop-forecast-coverage{padding:6px 7px;border:1px solid #ffffff12;border-radius:5px;color:#b8cadb;font-size:7px;font-weight:800;line-height:1.4}.kano-workshop-forecast-coverage[data-level="complete"]{border-color:#4dd6ac44;color:#a5f3d4}.kano-workshop-forecast-coverage[data-level="partial"]{border-color:#f5c54244;color:#ffe18b}.kano-workshop-forecast-baseline{display:flex;flex-direction:column;gap:4px;margin-top:7px;color:#91a8bd;font-size:7px;line-height:1.45}.kano-workshop-forecast-baseline strong{color:#cbd9e8;font-size:7px}.kano-workshop-forecast-note{display:block;margin-top:7px;color:#8198ad;font-size:7px;line-height:1.45}

      .kano-workshop-yoy{margin:8px 0;padding:10px;border:1px solid #f5c54235;border-radius:8px;background:linear-gradient(145deg,#f5c5420b,#ffffff03)}
      .kano-workshop-yoy-heading{display:flex;justify-content:space-between;align-items:flex-start;gap:8px}.kano-workshop-yoy-heading h5{margin:0;color:#f5d77d;font-size:10px;letter-spacing:.04em}.kano-workshop-yoy-heading p{margin:4px 0 0;color:#91a8bd;font-size:8px}
      .kano-workshop-yoy-badge{padding:5px 7px;border:1px solid #ffffff20;border-radius:6px;color:#eaf3fc;font-size:10px;font-weight:900;white-space:nowrap}.kano-workshop-yoy-badge[data-change="up"]{border-color:#fb718555;color:#fecaca}.kano-workshop-yoy-badge[data-change="down"]{border-color:#4dd6ac55;color:#a5f3d4}.kano-workshop-yoy-badge[data-change="flat"]{color:#d9e7f5}.kano-workshop-yoy-badge[data-change="unknown"]{color:#f5d77d;white-space:normal}
      .kano-workshop-yoy-metrics{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:6px;margin:8px 0}.kano-workshop-yoy-metrics>div{display:flex;flex-direction:column;gap:4px;min-width:0;padding:8px;border:1px solid #ffffff12;border-radius:6px;background:#ffffff04}.kano-workshop-yoy-metrics span{color:#93a9be;font-size:7px;font-weight:900;line-height:1.4}.kano-workshop-yoy-metrics strong{color:#f5d77d;font-size:11px;overflow-wrap:anywhere}.kano-workshop-yoy-metrics small{color:#8198ad;font-size:7px;line-height:1.4}
      .kano-workshop-yoy-chart{padding:8px;border-radius:6px;background:#ffffff03}.kano-workshop-yoy-chart-title{display:flex;justify-content:space-between;align-items:center;gap:8px;margin-bottom:8px}.kano-workshop-yoy-chart-title>strong{color:#dce8f4;font-size:8px}.kano-workshop-yoy-chart-title>span{display:flex;align-items:center;gap:4px;color:#91a8bd;font-size:7px}.kano-workshop-yoy-chart-title i{display:inline-block;width:7px;height:7px;margin-left:5px;border-radius:2px;background:#f5c542}.kano-workshop-yoy-chart-title i[data-year="previous"]{background:#58a6ff}
      .kano-workshop-yoy-quarter{padding:7px 0;border-top:1px solid #ffffff0d}.kano-workshop-yoy-quarter-head{display:flex;justify-content:space-between;gap:8px;align-items:baseline;margin-bottom:5px}.kano-workshop-yoy-quarter-head strong{color:#dce8f4;font-size:8px}.kano-workshop-yoy-quarter-head span{color:#8198ad;font-size:7px;text-align:right}.kano-workshop-yoy-barline{display:grid;grid-template-columns:35px minmax(30px,1fr) auto;align-items:center;gap:6px;margin:4px 0}.kano-workshop-yoy-barline>span{color:#91a8bd;font-size:7px}.kano-workshop-yoy-barline>strong{color:#dbe8f5;font-size:8px;white-space:nowrap}.kano-workshop-yoy-track{height:7px;overflow:hidden;border-radius:6px;background:#ffffff0d}.kano-workshop-yoy-track i{display:block;height:100%;min-width:0;border-radius:6px;background:#f5c542}.kano-workshop-yoy-track i[data-year="previous"]{background:#58a6ff}.kano-workshop-yoy-note{margin:8px 0 0;color:#8198ad;font-size:8px;line-height:1.45}
      .kano-workshop-annual-highlights{display:grid;grid-template-columns:minmax(0,1fr);gap:8px;margin:8px 0;padding:9px;border:1px solid #ffffff13;border-radius:7px;background:#ffffff04}
      .kano-workshop-annual-highlights>div{display:flex;flex-direction:column;gap:6px;min-width:0}.kano-workshop-annual-highlights>div>strong{color:#eaf3fc;font-size:10px;overflow-wrap:anywhere}
      .kano-workshop-annual-quarter-list{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:6px}
      .kano-workshop-annual-quarter{display:flex;justify-content:space-between;gap:8px;padding:7px;border-radius:6px;background:#ffffff06}
      .kano-workshop-annual-quarter>div{display:flex;flex-direction:column;gap:3px;min-width:0}.kano-workshop-annual-quarter>div>strong{color:#d9e7f5;font-size:9px}.kano-workshop-annual-quarter small{color:#8198ad;font-size:7px}
      .kano-workshop-annual-quarter>strong{color:#ffe18b;font-size:9px;white-space:nowrap}
      .kano-workshop-annual-table{min-width:560px}.kano-workshop-annual-table tfoot th{padding:9px 7px;border-top:1px solid #ffffff20;color:#ffe18b;background:#14263a;text-align:left;font-size:8px}
      .kano-workshop-annual-money{white-space:nowrap;text-align:right}.kano-workshop-annual-money small{display:block;margin-top:3px;color:#8198ad;font-size:7px;text-align:right;white-space:normal}
      .kano-workshop-annual-status{display:inline-block;padding:3px 5px;border:1px solid #ffffff1a;border-radius:4px;color:#a8bad0;font-size:7px;font-weight:900;white-space:nowrap}
      .kano-workshop-annual-status[data-level="complete"]{border-color:#4dd6ac55;color:#a5f3d4}.kano-workshop-annual-status[data-level="partial"]{border-color:#f5c54255;color:#ffe18b}
      .kano-workshop-annual-coverage-note,.kano-workshop-annual-note{display:block;margin:8px 0 0;color:#8298ad;font-size:8px;line-height:1.45}
      .kano-workshop-annual-report button:focus-visible,.kano-workshop-annual-year-picker select:focus-visible{outline:2px solid #f5c542;outline-offset:2px}
      @media(max-width:440px){.kano-workshop-annual-heading{flex-direction:column}.kano-workshop-annual-actions{width:100%;justify-content:stretch}.kano-workshop-annual-actions button{flex:1;white-space:normal}.kano-workshop-audit-metrics{grid-template-columns:minmax(0,1fr)}.kano-workshop-audit-actions{grid-template-columns:minmax(0,1fr)}.kano-workshop-monthly-numbers{grid-template-columns:minmax(0,1fr)}.kano-workshop-monthly-actions{grid-template-columns:minmax(0,1fr)}.kano-workshop-yoy-metrics{grid-template-columns:minmax(0,1fr)}.kano-workshop-annual-budget-heading{flex-direction:column}.kano-workshop-annual-budget-heading>span{align-self:flex-start}.kano-workshop-annual-budget-actions{grid-template-columns:minmax(0,1fr)}.kano-workshop-forecast-heading{flex-direction:column}.kano-workshop-forecast-heading>span{max-width:100%;align-self:flex-start}.kano-workshop-forecast-scenarios{grid-template-columns:minmax(0,1fr)}.kano-workshop-yoy-heading{flex-direction:column}.kano-workshop-yoy-quarter-head{align-items:flex-start;flex-direction:column;gap:3px}.kano-workshop-cost-metrics{grid-template-columns:repeat(2,minmax(0,1fr))}.kano-workshop-cost-metrics>div:last-child{grid-column:1/-1}.kano-workshop-goal-form{grid-template-columns:minmax(0,1fr)}.kano-workshop-goal-actions{grid-template-columns:minmax(0,1fr)}.kano-workshop-trend-grid{grid-template-columns:minmax(0,1fr)}.kano-workshop-trend-row{padding:8px}.kano-workshop-history-summary{grid-template-columns:repeat(2,minmax(0,1fr))}.kano-workshop-history-summary>div:last-child{grid-column:1/-1}.kano-workshop-history-actions{grid-template-columns:repeat(2,minmax(0,1fr))}.kano-workshop-history-actions button[data-kano-workshop-import-trigger],.kano-workshop-history-actions button[data-kano-workshop-plan-import-trigger]{grid-column:1/-1}#kano-workshop-panel{padding:10px}.kano-workshop-header{gap:6px}.kano-workshop-header h3{font-size:15px}.kano-workshop-wallet{padding:6px}.kano-workshop-wallet strong{font-size:12px}.kano-workshop-parts{gap:4px}.kano-workshop-part{padding:7px 5px}.kano-workshop-part-label{font-size:9px}.kano-workshop-service-list{gap:5px}.kano-workshop-service{padding:8px 7px}.kano-workshop-service strong{font-size:9px}}
      @media(max-width:340px){.kano-workshop-service-list{grid-template-columns:minmax(0,1fr)}.kano-workshop-header{flex-direction:column}.kano-workshop-wallet{width:100%;box-sizing:border-box;text-align:left}}
    `;
    document.head.append(style);
  }
  if (!panel.dataset.bound) {
    panel.dataset.bound = 'true';
    panel.addEventListener('click', (event) => {
      const budgetSaveButton = event.target.closest('[data-kano-workshop-budget-save]');
      if (budgetSaveButton) { handleWorkshopMonthlyBudgetAction('save'); return; }
      const budgetClearButton = event.target.closest('[data-kano-workshop-budget-clear]');
      if (budgetClearButton) { handleWorkshopMonthlyBudgetAction('clear'); return; }
      const goalSaveButton = event.target.closest('[data-kano-workshop-goal-save]');
      if (goalSaveButton) { handleWorkshopSavingsGoalAction('save'); return; }
      const goalQuoteButton = event.target.closest('[data-kano-workshop-goal-use-quote]');
      if (goalQuoteButton) { if (!goalQuoteButton.disabled) handleWorkshopSavingsGoalAction('use-quote'); return; }
      const goalClearButton = event.target.closest('[data-kano-workshop-goal-clear]');
      if (goalClearButton) { handleWorkshopSavingsGoalAction('clear'); return; }
      const planExportButton = event.target.closest('[data-kano-workshop-plan-export]');
      if (planExportButton) { if (!planExportButton.disabled) downloadWorkshopPlanBackup(); return; }
      const planImportButton = event.target.closest('[data-kano-workshop-plan-import-trigger]');
      if (planImportButton) { panel.querySelector('[data-kano-workshop-plan-import-file]')?.click(); return; }
      const importButton = event.target.closest('[data-kano-workshop-import-trigger]');
      if (importButton) {
        panel.querySelector('[data-kano-workshop-import-file]')?.click();
        return;
      }
      const ledgerReconcileButton = event.target.closest('[data-kano-workshop-ledger-reconcile]');
      if (ledgerReconcileButton) { if (!ledgerReconcileButton.disabled) reconcileWorkshopRecentReceipts(); return; }
      const annualBudgetSaveButton = event.target.closest('[data-kano-workshop-annual-budget-save]');
      if (annualBudgetSaveButton) { handleWorkshopAnnualBudgetAction('save'); return; }
      const annualBudgetClearButton = event.target.closest('[data-kano-workshop-annual-budget-clear]');
      if (annualBudgetClearButton) { handleWorkshopAnnualBudgetAction('clear'); return; }
      const annualReportPrintButton = event.target.closest('[data-kano-workshop-annual-print]');
      if (annualReportPrintButton) {
        const year = panel.querySelector('[data-kano-workshop-annual-year]')?.value || '';
        openWorkshopAnnualReportPrint(year);
        return;
      }
      const annualReportExportButton = event.target.closest('[data-kano-workshop-annual-export]');
      if (annualReportExportButton) {
        const year = panel.querySelector('[data-kano-workshop-annual-year]')?.value || '';
        downloadWorkshopAnnualReport(year);
        return;
      }
      const ledgerMonthExportButton = event.target.closest('[data-kano-workshop-ledger-statement-export]');
      if (ledgerMonthExportButton) {
        const monthKey = panel.querySelector('[data-kano-workshop-statement-month]')?.value || '';
        downloadWorkshopLedgerMonthStatement(monthKey);
        return;
      }
      const ledgerAuditExportButton = event.target.closest('[data-kano-workshop-ledger-audit-export]');
      if (ledgerAuditExportButton) { downloadWorkshopLedgerAudit(); return; }
      const ledgerRecoveryExportButton = event.target.closest('[data-kano-workshop-ledger-recovery-export]');
      if (ledgerRecoveryExportButton) { downloadWorkshopLedgerRecoveryCopy(); return; }
      const costReportButton = event.target.closest('[data-kano-workshop-cost-report]');
      if (costReportButton) { if (!costReportButton.disabled) downloadWorkshopCostReport(); return; }
      const exportButton = event.target.closest('[data-kano-workshop-export]');
      if (exportButton) {
        if (!exportButton.disabled) downloadWorkshopHistory(exportButton.dataset.kanoWorkshopExport);
        return;
      }
      const cancelButton = event.target.closest('[data-kano-workshop-cancel]');
      if (cancelButton) {
        closeWorkshopConfirmation(panel.querySelector('#kano-workshop-confirm'));
        return;
      }
      const confirmButton = event.target.closest('[data-kano-workshop-confirm]');
      if (confirmButton) {
        const dialog = panel.querySelector('#kano-workshop-confirm');
        const serviceKey = dialog?.dataset.service;
        closeWorkshopConfirmation(dialog);
        if (serviceKey) performWorkshopService(serviceKey);
        return;
      }
      const button = event.target.closest('[data-kano-workshop-service]');
      if (!button || button.disabled) return;
      requestWorkshopService(button.dataset.kanoWorkshopService);
    });
    panel.addEventListener('change', (event) => {
      const annualYearSelect = event.target.closest('[data-kano-workshop-annual-year]');
      if (annualYearSelect) {
        const selectedYear = annualYearSelect.value;
        if (/^\d{4}$/.test(selectedYear) && selectedYear >= '1900' && selectedYear <= '9999') {
          panel.dataset.annualReportYear = selectedYear;
          const annualBody = panel.querySelector('[data-kano-workshop-annual-body]');
          if (annualBody) annualBody.innerHTML = workshopAnnualReportBodyMarkup(selectedYear);
        }
        return;
      }
      const statementMonthSelect = event.target.closest('[data-kano-workshop-statement-month]');
      if (statementMonthSelect) {
        const selected = statementMonthSelect.value;
        if (/^\d{4}-(0[1-9]|1[0-2])$/.test(selected)) {
          panel.dataset.ledgerStatementMonth = selected;
          const statementBody = panel.querySelector('[data-kano-workshop-ledger-statement-body]');
          if (statementBody) statementBody.innerHTML = workshopLedgerStatementBodyMarkup(selected);
        }
        return;
      }
      const planInput = event.target.closest('[data-kano-workshop-plan-import-file]');
      if (planInput) {
        const file = planInput.files?.[0] || null;
        planInput.value = '';
        if (file) void importWorkshopPlanFile(file);
        return;
      }
      const input = event.target.closest('[data-kano-workshop-import-file]');
      if (!input) return;
      const file = input.files?.[0] || null;
      // Reset so selecting the same backup twice still fires a change event.
      input.value = '';
      if (file) void importWorkshopHistoryFile(file);
    });
  }
  renderWorkshopPanel(activeGame?.s || window.__KANO_LIFE_GAME__?.s);
}

function numberFromRow(row) {
  const n = Number(row?.score ?? row?.highScore ?? row?.points ?? row?.bestScore ?? 0);
  return Number.isFinite(n) && n >= 0 ? Math.floor(n) : 0;
}
function nameFromRow(row) {
  return String(row?.displayName || row?.playerName || row?.name || row?.username || row?.driver || '').replace(/[<>\u0000-\u001f]/g, '').trim().slice(0, 28);
}
function localRecord() {
  const runs = Array.isArray(save.lastRuns) ? save.lastRuns : [];
  const runBest = runs.reduce((best, row) => numberFromRow(row) > numberFromRow(best) ? row : best, null);
  const persistedScore = Math.max(0, Math.floor(Number(save.highScore) || 0));
  const runScore = numberFromRow(runBest);
  let savedName = '';
  try { savedName = localStorage.getItem(RECORD_NAME_KEY) || ''; } catch (_) {}
  const name = runScore >= persistedScore && runBest
    ? nameFromRow(runBest) || 'Kano Driver'
    : String(savedName || save.playerName || save.displayName || nameFromRow(runBest) || 'Kano Driver').trim().slice(0, 28);
  return { name, score: Math.max(persistedScore, runScore), source: 'local' };
}
function showRecord(record) {
  const safeName = String(record.name || 'Kano Driver').replace(/[<>\u0000-\u001f]/g, '').slice(0, 28);
  const score = `₦${Math.floor(Number(record.score) || 0).toLocaleString('en-NG')}`;
  const label = record.source === 'global'
    ? `OVERALL #1 · ${safeName} · ${score}`
    : `LOCAL HIGH SCORE · ${safeName} · ${score}`;
  const hud = document.getElementById('kano-overall-record');
  const start = document.getElementById('kano-start-record');
  if (hud) { hud.textContent = label; hud.hidden = false; hud.style.display = 'inline-flex'; }
  if (start) { start.textContent = label; start.hidden = false; start.style.display = 'block'; }
}
function renderLocalRecord() {
  lastRecord = localRecord();
  showRecord(lastRecord);
}
async function refreshOverallRecord(force = false) {
  if (recordRequestInFlight) return;
  const now = Date.now();
  if (!force && now - recordRequestAt < 3500) { showRecord(lastRecord); return; }
  recordRequestAt = now;
  recordRequestInFlight = true;
  lastRecord = localRecord();
  showRecord(lastRecord);
  try {
    const response = await fetch(`${SCORE_ENDPOINT}&_=${Date.now()}`, { method: 'GET', cache: 'no-store', credentials: 'same-origin', headers: { Accept: 'application/json' } });
    if (response.ok) {
      const payload = await response.json();
      const candidates = [payload, payload?.entries, payload?.rows, payload?.leaderboard, payload?.scores, payload?.results, payload?.data, payload?.data?.entries, payload?.data?.rows, payload?.data?.scores];
      let rows = candidates.find(Array.isArray) || [];
      if (!rows.length && payload?.data && typeof payload.data === 'object' && !Array.isArray(payload.data)) {
        const nested = Object.values(payload.data).find(Array.isArray);
        if (nested) rows = nested;
      }
      const valid = rows.filter((row) => row && typeof row === 'object' && numberFromRow(row) >= 0);
      if (valid.length) {
        valid.sort((a, b) => numberFromRow(b) - numberFromRow(a));
        const row = valid[0];
        const name = nameFromRow(row);
        const score = numberFromRow(row);
        if (name && score > 0) lastRecord = { name, score, source: 'global' };
      }
    }
  } catch (_) {
    // Keep local score visible when the global service is offline or unavailable.
  } finally {
    recordRequestInFlight = false;
    showRecord(lastRecord);
  }
}

function updateVehicleHealthBadge(state) {
  const badge = document.getElementById('kano-vehicle-health');
  if (!badge || !state) return;

  const readHealth = (value) => {
    const number = Number(value);
    return Number.isFinite(number) ? Math.round(clamp(number, 0, 100)) : null;
  };
  const body = readHealth(state.condition);
  const engine = readHealth(state.engine);
  const tyres = readHealth(state.tyres);
  const values = [body, engine, tyres].filter((value) => value !== null);
  if (!values.length) return;

  const worst = Math.min(...values);
  const level = worst < 25 ? 'critical' : worst < 50 ? 'warning' : 'good';
  const status = level === 'critical' ? 'SERVICE NOW' : level === 'warning' ? 'SERVICE SOON' : 'STATUS GOOD';
  const display = `KEKE HEALTH · BODY ${body ?? '—'}% · ENGINE ${engine ?? '—'}% · TYRES ${tyres ?? '—'}% · ${status}`;
  if (badge.textContent !== display) badge.textContent = display;
  badge.dataset.level = level;
  badge.hidden = false;
  badge.style.display = 'inline-flex';
  badge.title = level === 'critical'
    ? 'Vehicle condition is critical. Visit the workshop when service options are available.'
    : level === 'warning'
      ? 'Vehicle wear is increasing. Plan a workshop visit.'
      : 'Vehicle condition is currently within the healthy range.';
  renderWorkshopPanel(state);
}

// -----------------------------------------------------------------------------
// Driver/rider visibility for actual motorcycle GLB traffic
// -----------------------------------------------------------------------------
function hasNamedRider(actor) {
  let found = false;
  actor?.traverse?.((node) => {
    // A helmet by itself is not a rider. Some motorcycle GLBs contain a
    // helmet or helmet prop but omit the human model, which caused the old
    // check to suppress the rider fallback incorrectly.
    if (/(rider|motorist|motorcycle.?driver|humanoid|pedestrian|person|driver.?body|biker)/i.test(node.name || '')) {
      found = true;
    }
  });
  return found;
}
function objectContains(root, target) {
  if (!root || !target) return false;
  if (root === target) return true;
  let found = false;
  root.traverse?.((node) => { if (node === target) found = true; });
  return found;
}
function attachRider(actor) {
  if (!actor?.isObject3D || actor.userData?.kanoRepairRider || actor.userData?.kanoGeneratedTraffic) return;
  if (hasNamedRider(actor)) { actor.userData.kanoRiderPresent = true; return; }
  const rider = makeRoot('Kano motorcycle rider');
  const jacket = makeMaterial(rider, '#25313e');
  const trousers = makeMaterial(rider, '#333942');
  const skin = makeMaterial(rider, '#86563b');
  const helmet = makeMaterial(rider, '#f5c542', { metalness: 0.06, roughness: 0.38 });
  makeMesh(rider, new THREE.CapsuleGeometry(0.13, 0.31, 3, 6), jacket, [0, 0.98, 0], [0.95, 1, 0.82]).name = 'Motorcycle rider torso';
  makeMesh(rider, new THREE.SphereGeometry(0.12, 9, 7), skin, [0, 1.26, -0.015]).name = 'Motorcycle rider head';
  makeMesh(rider, new THREE.SphereGeometry(0.145, 9, 7), helmet, [0, 1.32, -0.02]).name = 'Motorcycle rider helmet';
  makeMesh(rider, new THREE.BoxGeometry(0.16, 0.035, 0.05), makeMaterial(rider, '#172029'), [0, 1.32, -0.155]);
  for (const side of [-1, 1]) {
    const arm = makeMesh(rider, new THREE.CapsuleGeometry(0.04, 0.24, 2, 5), jacket, [side * 0.15, 1.01, -0.13]);
    arm.rotation.z = -side * 0.52;
    const leg = makeMesh(rider, new THREE.CapsuleGeometry(0.055, 0.23, 2, 5), trousers, [side * 0.095, 0.64, 0.08]);
    leg.rotation.x = -0.42;
  }
  rider.scale.setScalar(0.78);
  rider.position.set(0, 0.30, 0.02);
  actor.add(rider);
  actor.userData.kanoRepairRider = rider;
  riderGroups.add(rider);
}

// -----------------------------------------------------------------------------
// Player keke ride response. This augments the existing renderer animation only
// while the road is active; it does not alter gameplay physics, speed, collisions,
// steering state, or the garage/morning scenes.
// -----------------------------------------------------------------------------
function applyPlayerKekeRideResponse(renderer, state, dt) {
  if (!renderer || renderer.lifeScene !== 'road') {
    if (renderer) renderer._kanoRideBasePlayer = null;
    return;
  }
  const player = renderer.player;
  if (!player?.isObject3D) return;

  // Keep a stable vertical anchor. Adding an oscillating offset directly to the
  // current y-position every frame can slowly walk the keke up or down over a
  // long run. Re-anchor when the active player model changes or road play resumes.
  if (renderer._kanoRideBasePlayer !== player || !Number.isFinite(renderer._kanoRideBaseY)) {
    renderer._kanoRideBasePlayer = player;
    renderer._kanoRideBaseY = Number(player.position.y) || 0;
  }

  const delta = clamp(Number(dt) || 0, 0, 0.05);
  if (delta <= 0) return;

  const signedSpeed = Number.isFinite(state?.signedSpeed)
    ? state.signedSpeed
    : state?.reverse
      ? -Math.abs(Number(state?.speed) || 0)
      : Math.abs(Number(state?.speed) || 0);
  const speed = Math.abs(signedSpeed);
  const speedFactor = clamp(speed / 38, 0, 1);
  const steer = clamp(Number(state?.steer) || 0, -1, 1);

  renderer._kanoRideTime = (Number(renderer._kanoRideTime) || 0)
    + delta * (1.0 + speedFactor * 1.7);
  const time = renderer._kanoRideTime;

  // Low-amplitude suspension response. Wet and muddy surfaces feel rougher;
  // road texture does not move independently of the game world's scroll.
  const roadFactor = state?.environment === 'muddy'
    ? 1.0
    : state?.environment === 'rainPuddles'
      ? 0.74
      : 0.24;
  const suspension = Math.sin(time * (5.8 + speedFactor * 5.4))
    * (0.0015 + speedFactor * 0.0045) * roadFactor;
  const impact = clamp(Number(state?.crashShake) || 0, 0, 1.25);
  const impactPulse = Math.sin(time * 38) * impact * 0.006;
  player.position.y = renderer._kanoRideBaseY + suspension + impactPulse;

  // The stock renderer has already set its steering bank before it calls the
  // driver animator. Add a small chassis response without accumulating angles.
  const steeringBank = -steer * (0.008 + speedFactor * 0.012);
  const surfaceRoll = Math.sin(time * 3.4) * roadFactor * 0.0018;
  player.rotation.z = -steer * 0.075 + steeringBank + surfaceRoll;

  // Subtle pitch makes throttle, braking and reversing easier to read visually.
  const pitch = state?.reverse
    ? speedFactor * 0.010
    : state?.brake
      ? speedFactor * 0.014
      : state?.gas
        ? -speedFactor * 0.006
        : 0;
  player.rotation.x = pitch + Math.sin(time * 31) * impact * 0.0025;

  // Imported keke models may not provide their wheels through the native driver
  // rig. Rotate only explicitly named wheels in that case to avoid double-spin.
  const rigWheels = player.userData?.driverAnimationParts?.wheels;
  if (Array.isArray(rigWheels) && rigWheels.length) return;

  if (renderer._kanoPlayerWheelRoot !== player) {
    const namedWheels = [];
    const seen = new Set();
    player.traverse?.((node) => {
      if (node === player || !node?.isObject3D || seen.has(node)) return;
      const name = `${node.name || ''} ${node.userData?.name || ''}`;
      if (!/(wheel|tyre|tire)/i.test(name)) return;
      if (!node.isMesh && !(node.children?.length)) return;
      seen.add(node);
      namedWheels.push(node);
    });
    renderer._kanoPlayerWheelRoot = player;
    renderer._kanoPlayerNamedWheels = namedWheels;
  }
  for (const wheel of renderer._kanoPlayerNamedWheels || []) {
    if (!wheel?.parent) continue;
    try { wheel.rotateX(signedSpeed * delta * 0.08); } catch (_) {}
  }
}

// Animate traffic wheels and suspension without replacing the vehicle models.
// Imported GLBs use wheel/tire names when available; procedural fallbacks expose
// the keke wheel list directly, with geometry-based detection for fallback cars
// and motorcycles. Original rotations and transforms are preserved.
function collectTrafficWheels(actor) {
  if (!actor?.isObject3D) return [];
  if (Array.isArray(actor.userData?.kanoTrafficWheelParts)) {
    return actor.userData.kanoTrafficWheelParts;
  }

  const parts = actor.userData?.driverAnimationParts?.wheels;
  if (Array.isArray(parts) && parts.length) {
    actor.userData.kanoTrafficWheelParts = parts.filter((wheel) => wheel?.isObject3D);
    return actor.userData.kanoTrafficWheelParts;
  }

  const wheels = [];
  const seen = new Set();
  actor.traverse?.((node) => {
    if (!node?.isMesh || !node.geometry || seen.has(node)) return;
    const name = `${node.name || ''} ${node.material?.name || ''}`;
    const geometry = node.geometry;
    const type = geometry.type || '';
    const radius = Number(geometry.parameters?.radiusTop ?? geometry.parameters?.radius ?? 0);
    const namedWheel = /wheel|tyre|tire/i.test(name) && (radius >= 0.12 || type === 'TorusGeometry' || geometry.isBufferGeometry === true);
    const fallbackBikeWheel = type === 'TorusGeometry' && Number(node.position?.y) < 0.55;
    const fallbackCarWheel = type === 'CylinderGeometry'
      && radius >= 0.19
      && Number(node.position?.y) > 0.12
      && Number(node.position?.y) < 0.42
      && Math.abs(Math.abs(Number(node.rotation?.z) || 0) - Math.PI / 2) < 0.18
      && (Math.abs(Number(node.position?.x) || 0) > 0.3 || Math.abs(Number(node.position?.z) || 0) > 0.3);

    if (namedWheel || fallbackBikeWheel || fallbackCarWheel) {
      seen.add(node);
      wheels.push(node);
    }
  });

  actor.userData ||= {};
  actor.userData.kanoTrafficWheelParts = wheels;
  return wheels;
}

function animateTrafficActor(actor, vehicle, dt, time) {
  if (!actor?.isObject3D || dt <= 0) return;
  actor.userData ||= {};
  if (!Number.isFinite(actor.userData.kanoTrafficPhase)) {
    actor.userData.kanoTrafficPhase = Math.random() * Math.PI * 2;
  }
  if (!Number.isFinite(actor.userData.kanoTrafficBaseZ)) {
    actor.userData.kanoTrafficBaseZ = Number(actor.rotation.z) || 0;
  }

  const phase = actor.userData.kanoTrafficPhase;
  const speed = clamp(Number(vehicle?.speedKmh) || Number(vehicle?.speed) * 24 || 0, 0, 55);
  const directionSign = vehicle?.direction === -1 ? -1 : 1;
  const wheelStep = directionSign * (speed / 20) * dt;
  const wheels = collectTrafficWheels(actor);
  for (const wheel of wheels) {
    if (!wheel?.isObject3D || !wheel.parent) continue;
    // Local-axis rotation works for the common imported and generated wheel rigs.
    try { wheel.rotateX(wheelStep); } catch (_) {}
  }

  const bike = vehicle?.type === 'motorcycle';
  const keke = vehicle?.type === 'keke';
  const bounce = bike ? 0.010 : keke ? 0.007 : 0.004;
  actor.position.y = Math.max(0, Math.sin(time * (bike ? 7.2 : 4.8) + phase) * bounce);
  actor.rotation.z = actor.userData.kanoTrafficBaseZ
    + Math.sin(time * (bike ? 2.6 : 1.5) + phase) * (bike ? 0.012 : 0.003);

  // A named GLB rider receives a restrained upper-body bob. Procedural fallback
  // riders are animated separately and are not double-animated here.
  const rider = actor.userData.kanoNamedRiderRoot;
  if (rider?.parent && !actor.userData.kanoRepairRider) {
    if (!Number.isFinite(rider.userData.kanoBaseY)) rider.userData.kanoBaseY = Number(rider.position.y) || 0;
    if (!Number.isFinite(rider.userData.kanoBaseZ)) rider.userData.kanoBaseZ = Number(rider.rotation.z) || 0;
    rider.position.y = rider.userData.kanoBaseY + Math.abs(Math.sin(time * 5.1 + phase)) * 0.006;
    rider.rotation.z = rider.userData.kanoBaseZ + Math.sin(time * 2.0 + phase) * 0.008;
  }
}

if (typeof originalMakeTrafficActor === 'function') {
  Renderer3D.prototype.makeTrafficActor = function patchedMakeTrafficActor(vehicle, ...args) {
    const manager = this.models;
    const getInstance = manager?.getInstance;
    let returnedModel = null;
    if (typeof getInstance === 'function') {
      manager.getInstance = function observedGetInstance(...innerArgs) {
        const result = getInstance.apply(this, innerArgs);
        if (result?.isObject3D) returnedModel = result;
        return result;
      };
    }
    let actor;
    try { actor = originalMakeTrafficActor.call(this, vehicle, ...args); }
    finally { if (manager && getInstance) manager.getInstance = getInstance; }
    if (actor && vehicle?.type === 'motorcycle') {
      actor.userData ||= {};
      if (returnedModel && objectContains(actor, returnedModel)) actor.userData.kanoLoadedTrafficModel = true;
      else actor.userData.kanoGeneratedTraffic = true;
      actor.userData.kanoTrafficWheelParts = undefined;
      actor.userData.kanoTrafficBaseZ = Number(actor.rotation.z) || 0;
      actor.userData.kanoTrafficPhase = Math.random() * Math.PI * 2;
      actor.traverse?.((node) => {
        if (!actor.userData.kanoNamedRiderRoot && node !== actor
          && /(rider|motorist|motorcycle.?driver|humanoid|person|driver.?body|biker)/i.test(node.name || '')
          && (node.isGroup || node.children?.length)) {
          actor.userData.kanoNamedRiderRoot = node;
        }
      });
    }
    return actor;
  };
}
if (typeof originalSyncTraffic === 'function') {
  Renderer3D.prototype.syncTraffic = function patchedSyncTraffic(state, ...args) {
    const result = originalSyncTraffic.call(this, state, ...args);
    const traffic = state?.traffic || activeGame?.s?.traffic || [];
    for (const vehicle of traffic) {
      if (vehicle?.type !== 'motorcycle') continue;
      const actor = this.trafficActors?.get?.(vehicle.id) || this.trafficActors?.[vehicle.id];
      if (!actor) continue;
      if (!actor.userData?.kanoNamedRiderRoot) {
        actor.traverse?.((node) => {
          if (!actor.userData.kanoNamedRiderRoot && node !== actor
            && /(rider|motorist|motorcycle.?driver|humanoid|person|driver.?body|biker)/i.test(node.name || '')
            && (node.isGroup || node.children?.length)) {
            actor.userData.kanoNamedRiderRoot = node;
          }
        });
      }
      // Attach to every motorcycle actor. The rider helper intentionally
      // skips this layer's procedural fallback bikes because renderer3d.js
      // already builds a torso and helmet for those. Loaded GLBs are checked
      // by their human-rig names, not by the presence of a helmet alone.
      attachRider(actor);
      const rider = actor.userData?.kanoRepairRider;
      if (rider) {
        const time = Number(this._kanoRepairTime) || 0;
        rider.rotation.z = Math.sin(time * 3.5 + (vehicle.lane || 0)) * 0.018;
        rider.position.y = 0.30 + Math.abs(Math.sin(time * 5.3 + (vehicle.lane || 0))) * 0.018;
      }
      animateTrafficActor(actor, vehicle, clamp(Number(this._kanoRepairDelta) || 0, 0, 0.05), Number(this._kanoRepairTime) || 0);
    }
    return result;
  };
}

// Requested Kano traffic mix: approximately 40% keke, 30% motorcycles, 30% cars.
if (typeof originalSpawnTraffic === 'function') {
  Game.prototype.spawnTraffic = function balancedKanoTraffic(...args) {
    const before = new Set(this.s?.traffic || []);
    const result = originalSpawnTraffic.apply(this, args);
    const added = (this.s?.traffic || []).filter((vehicle) => !before.has(vehicle));
    for (const vehicle of added) {
      const value = Math.random();
      if (value < 0.40) vehicle.type = 'keke';
      else if (value < 0.70) vehicle.type = 'motorcycle';
      else {
        const carChoice = Math.random();
        vehicle.type = carChoice < 0.63 ? 'car' : carChoice < 0.84 ? 'taxi' : 'suv';
      }
    }
    return result;
  };
}

// -----------------------------------------------------------------------------
// Sound mix: keep the recorded engine clearly above synthetic rolling noise.
// -----------------------------------------------------------------------------
if (typeof originalAudioEngine === 'function') {
  AudioManager.prototype.engine = function engineDominantMix(speed, ...args) {
    const result = originalAudioEngine.call(this, speed, ...args);
    try {
      const context = this.ctx || this.audioContext || this.context;
      const now = context?.currentTime || 0;
      const absoluteSpeed = Math.abs(Number(speed) || 0);
      const roadGain = this.roadNoiseGain?.gain;
      if (roadGain) {
        const level = absoluteSpeed > 0.2 ? clamp(absoluteSpeed * 0.0000042, 0.000025, 0.00032) : 0.000015;
        if (typeof roadGain.setTargetAtTime === 'function') roadGain.setTargetAtTime(level, now, 0.08);
        else roadGain.value = level;
      }
      if (this.engineAudio && this.enabled !== false && absoluteSpeed > 1) {
        this.engineAudio.volume = clamp(this.engineAudio.volume || 0.30, 0.30, 0.82);
      }
    } catch (_) {}
    return result;
  };
}

// Reverse-gear changes can come from either the on-screen control or R.
// Keep the visible button and HUD gear label in sync with the actual game state.
if (typeof originalSetReverse === 'function') {
  Game.prototype.setReverse = function trackedSetReverse(value, ...args) {
    const result = originalSetReverse.call(this, value, ...args);
    this.ui?.updateReverseControl?.(this.s);
    return result;
  };
}

// -----------------------------------------------------------------------------
// Tie hook lifetimes to the active game and renderer instances.
// -----------------------------------------------------------------------------
Game.prototype.start = function trackedGameStart(...args) {
  activeGame = this;
  window.__KANO_LIFE_GAME__ = this;
  const result = originalGameStart.apply(this, args);
  this.ui?.updateReverseControl?.(this.s);
  updateVehicleHealthBadge(this.s);
  renderLocalRecord();
  return result;
};
Game.prototype.tick = function trackedGameTick(dt, ...args) {
  activeGame = this;
  window.__KANO_LIFE_GAME__ = this;
  return originalGameTick.call(this, dt, ...args);
};
if (typeof originalAnimateFallbackDriver === 'function') {
  Renderer3D.prototype.animateFallbackDriver = function responsivePlayerDriver(state, dt, ...args) {
    const result = originalAnimateFallbackDriver.call(this, state, dt, ...args);
    try {
      applyPlayerKekeRideResponse(this, state, dt);
    } catch (error) {
      if (!this._kanoRideResponseWarningShown) {
        this._kanoRideResponseWarningShown = true;
        console.warn('[Kano Life] Player ride response skipped safely.', error);
      }
    }
    return result;
  };
}

if (typeof originalRendererDraw === 'function') {
  Renderer3D.prototype.draw = function patchedPresentationDraw(state, dt, ...args) {
    activeRenderer = this;
    configureRendererPresentation(this);
    this._kanoRepairDelta = clamp(dt, 0, 0.05);
    this._kanoRepairTime = (Number(this._kanoRepairTime) || 0) + this._kanoRepairDelta;
    const game = activeGame || window.__KANO_LIFE_GAME__;
    const eventType = typeof game?.s?.event === 'string' ? game.s.event : null;
    try {
      syncEventVisual(this, eventType);
      animateEventVisual(this, dt);
      animatePotholeDetails(dt);
    } catch (error) {
      if (!this._kanoRepairWarningShown) {
        this._kanoRepairWarningShown = true;
        console.warn('[Kano Life] Event presentation recovered from a visual error.', error);
      }
    }
    const result = originalRendererDraw.call(this, state, dt, ...args);
    // Release only rider geometry created by this layer when an actor leaves the scene.
    for (const rider of [...riderGroups]) {
      let node = rider;
      let attached = false;
      while (node) { if (node === worldFor(this)) { attached = true; break; } node = node.parent; }
      if (!attached) {
        riderGroups.delete(rider);
        disposeRoot(rider);
      }
    }
    return result;
  };
}
window.addEventListener('pagehide', () => {
  if (recordRefreshTimer) window.clearInterval(recordRefreshTimer);
  if (activeRenderer?._kanoRepairEventVisual?.root) disposeRoot(activeRenderer._kanoRepairEventVisual.root);
}, { once: true });

// -----------------------------------------------------------------------------
// Persistent player-vehicle damage
//
// Game.s remains the live-run authority. The lifecycle director stores the
// damaged component health so a new run or page reload does not magically
// restore the keke to 100%. This layer never deducts money or performs repairs.
// -----------------------------------------------------------------------------
const KANO_PLAYER_VEHICLE_ID = 'kano-life-player-keke-v1';
let lifecycleWarningShown = false;

function ensureKekeLifecycle(game) {
  if (!game || !game.s) return null;
  try {
    if (!game.vehicleLifecycle || typeof game.vehicleLifecycle.getVehicle !== 'function') {
      game.vehicleLifecycle = new KanoVehicleLifecycleDirector();
    }
    game.playerVehicleId ||= KANO_PLAYER_VEHICLE_ID;
    let vehicle = game.vehicleLifecycle.getVehicle(game.playerVehicleId);
    if (!vehicle) {
      vehicle = game.vehicleLifecycle.createVehicle({
        id: game.playerVehicleId,
        type: 'keke',
        name: 'Adaidaita Sahu',
        odometerKm: Math.max(0, Number(game.s.distance) || 0),
        parts: {
          body: { health: clamp(game.s.condition, 0, 100) },
          engine: { health: clamp(game.s.engine, 0, 100) },
          tyres: { health: clamp(game.s.tyres, 0, 100) },
        },
      });
    }
    return vehicle || game.vehicleLifecycle.getVehicle(game.playerVehicleId);
  } catch (error) {
    if (!lifecycleWarningShown) {
      lifecycleWarningShown = true;
      console.warn('[Kano Life] Persistent vehicle damage is unavailable; the normal run will continue.', error);
    }
    return null;
  }
}

function syncRunHealthToLifecycle(game) {
  const vehicle = ensureKekeLifecycle(game);
  if (!vehicle) return null;
  try {
    game.vehicleLifecycle.syncPartHealth({
      vehicleId: game.playerVehicleId,
      parts: {
        body: clamp(game.s.condition, 0, 100),
        engine: clamp(game.s.engine, 0, 100),
        tyres: clamp(game.s.tyres, 0, 100),
      },
    });
    return game.vehicleLifecycle.getVehicle(game.playerVehicleId);
  } catch (error) {
    if (!lifecycleWarningShown) {
      lifecycleWarningShown = true;
      console.warn('[Kano Life] Vehicle health could not be saved; gameplay remains active.', error);
    }
    return null;
  }
}

function applyLifecycleHealthToRun(game, suppliedVehicle = null) {
  if (!game?.s) return false;
  try {
    const vehicle = suppliedVehicle || ensureKekeLifecycle(game);
    if (!vehicle?.parts) return false;
    const bodyHealth = Number(vehicle.parts.body?.health);
    const engineHealth = Number(vehicle.parts.engine?.health);
    const tyreHealth = Number(vehicle.parts.tyres?.health);
    if (Number.isFinite(bodyHealth)) game.s.condition = clamp(bodyHealth, 0, 100);
    if (Number.isFinite(engineHealth)) game.s.engine = clamp(engineHealth, 0, 100);
    if (Number.isFinite(tyreHealth)) game.s.tyres = clamp(tyreHealth, 0, 100);
    return true;
  } catch (error) {
    if (!lifecycleWarningShown) {
      lifecycleWarningShown = true;
      console.warn('[Kano Life] Persistent health could not be restored; gameplay remains active.', error);
    }
    return false;
  }
}

if (typeof originalResetRun === 'function') {
  Game.prototype.resetRun = function persistentVehicleReset(...args) {
    const result = originalResetRun.apply(this, args);
    // On the very first reset this creates a record from the fresh default
    // health. On later resets it restores the saved component health.
    const vehicle = ensureKekeLifecycle(this);
    applyLifecycleHealthToRun(this, vehicle);
    updateVehicleHealthBadge(this.s);
    return result;
  };
}

if (typeof originalHitTraffic === 'function') {
  Game.prototype.hit = function persistentTrafficImpact(vehicle, ...args) {
    const s = this.s;
    const playerSignedSpeed = Number.isFinite(s?.signedSpeed)
      ? Number(s.signedSpeed)
      : (s?.reverse ? -Math.abs(Number(s?.speed) || 0) : Math.abs(Number(s?.speed) || 0));
    const trafficSpeed = Math.max(0, Number(vehicle?.speedKmh) || 25);
    const trafficSignedSpeed = (vehicle?.direction === -1 ? -1 : 1) * trafficSpeed;
    const relativeSpeed = Math.abs(playerSignedSpeed - trafficSignedSpeed);
    const severity = clamp(relativeSpeed / 100, 0.08, 0.42);

    const result = originalHitTraffic.call(this, vehicle, ...args);
    try {
      if (!this.s || !this.vehicleLifecycle) ensureKekeLifecycle(this);
      if (this.vehicleLifecycle) {
        // Record the event first, then persist the game's actual post-collision
        // health. This preserves lifecycle impact history without applying the
        // same collision damage a second time.
        this.vehicleLifecycle.recordImpact({
          vehicleId: this.playerVehicleId,
          part: 'body',
          severity,
          collision: true,
        });
      }
      const persistent = syncRunHealthToLifecycle(this);
      if (persistent) this.ui?.update?.(this.s, this.route, this.driver);
      updateVehicleHealthBadge(this.s);
    } catch (error) {
      if (!lifecycleWarningShown) {
        lifecycleWarningShown = true;
        console.warn('[Kano Life] Traffic impact persistence skipped safely.', error);
      }
    }
    return result;
  };
}

if (typeof originalHitPothole === 'function') {
  Game.prototype.hitPothole = function persistentPotholeImpact(...args) {
    const result = originalHitPothole.apply(this, args);
    try {
      if (!this.s || !this.vehicleLifecycle) ensureKekeLifecycle(this);
      if (this.vehicleLifecycle) {
        const roughRoad = this.s?.environment === 'badRoad' || this.s?.environment === 'muddy';
        // Keep the director's separate suspension-wear record, then overwrite
        // shared body/engine/tyre health with the exact result from the game.
        this.vehicleLifecycle.recordImpact({
          vehicleId: this.playerVehicleId,
          part: 'suspension',
          severity: roughRoad ? 0.22 : 0.14,
          pothole: true,
        });
      }
      const persistent = syncRunHealthToLifecycle(this);
      if (persistent) this.ui?.update?.(this.s, this.route, this.driver);
      updateVehicleHealthBadge(this.s);
    } catch (error) {
      if (!lifecycleWarningShown) {
        lifecycleWarningShown = true;
        console.warn('[Kano Life] Pothole damage persistence skipped safely.', error);
      }
    }
    return result;
  };
}

// Save non-impact condition changes too (for example a scripted breakdown or
// roadside repair) only when a component actually changes. This avoids writes
// on every frame while preserving the live game's existing rules.
const presentationTrackedTick = Game.prototype.tick;
if (typeof presentationTrackedTick === 'function') {
  Game.prototype.tick = function persistChangedVehicleHealth(dt, ...args) {
    const before = this.s ? {
      body: Number(this.s.condition),
      engine: Number(this.s.engine),
      tyres: Number(this.s.tyres),
    } : null;
    const result = presentationTrackedTick.call(this, dt, ...args);
    try {
      const s = this.s;
      if (before && s && (
        Math.abs(Number(s.condition) - before.body) > 0.001 ||
        Math.abs(Number(s.engine) - before.engine) > 0.001 ||
        Math.abs(Number(s.tyres) - before.tyres) > 0.001
      )) {
        syncRunHealthToLifecycle(this);
      }
      updateVehicleHealthBadge(s || this.s);
    } catch (error) {
      if (!lifecycleWarningShown) {
        lifecycleWarningShown = true;
        console.warn('[Kano Life] Changed vehicle health could not be persisted; gameplay remains active.', error);
      }
    }
    return result;
  };
}



// ============================================================
// LAST-MILE GLB VISIBILITY FIX
// The stock renderer intentionally replaces only two building slots on touch
// devices. That makes the rest of the world remain procedural even when the
// existing GLBs loaded correctly. Fill the remaining visible building slots
// from the existing loaded pools, and provide an optional on-screen audit so
// a missing/bad URL is distinguishable from a renderer not using the model.
// ============================================================
const KANO_GLB_VISIBLE_WORLD_PATCH = Symbol.for('kano.life.glbVisibleWorld.v2');
function kanoDisposeProceduralBuilding(root) {
  if (!root?.traverse) return;
  const geometries = new Set();
  const materials = new Set();
  root.traverse((object) => {
    if (object.geometry && !geometries.has(object.geometry)) {
      geometries.add(object.geometry);
      object.geometry.dispose?.();
    }
    const mats = Array.isArray(object.material) ? object.material : object.material ? [object.material] : [];
    for (const material of mats) {
      if (!material || materials.has(material)) continue;
      materials.add(material);
      material.dispose?.();
    }
  });
}

if (!Renderer3D.prototype[KANO_GLB_VISIBLE_WORLD_PATCH]) {
  const originalWorldUpgradeVisiblePass = Renderer3D.prototype.upgradeWorldAssets;
  Object.defineProperty(Renderer3D.prototype, KANO_GLB_VISIBLE_WORLD_PATCH, { value: true });
  Renderer3D.prototype.upgradeWorldAssets = function upgradeAllVisibleExistingGlbWorldAssets(...args) {
    let result;
    try {
      result = originalWorldUpgradeVisiblePass?.apply(this, args);
    } catch (error) {
      if (!this._kanoVisibleWorldUpgradeWarned) {
        this._kanoVisibleWorldUpgradeWarned = true;
        console.warn('[Kano GLB visibility] Base world replacement failed; trying remaining slots.', error);
      }
    }
    const manager = this.models;
    if (!manager?.cache || !Array.isArray(this.buildingSlots)) return result;

    // Mobile uses 10 real GLB facade instances instead of only two. Desktop
    // can use every configured building slot. The pool still shares geometry.
    const maximum = this.mobile ? Math.min(14, this.buildingSlots.length) : this.buildingSlots.length;
    let added = 0;
    for (let index = 0; index < maximum; index += 1) {
      const slot = this.buildingSlots[index];
      if (!slot || slot.replaced) continue;
      const key = slot.industrial ? 'industrialBuilding' : 'building';
      if (!manager.cache.has(key)) continue;
      let model = null;
      try { model = manager.getInstance(key); } catch (error) {
        console.warn('[Kano GLB visibility] Could not clone loaded building', key, error);
      }
      if (!model) continue;
      const targetHeight = Number(model.userData?.targetHeight) || (slot.industrial ? 5.2 : 4.5);
      model.scale.multiplyScalar((Number(slot.height) || targetHeight) / targetHeight);
      model.position.set(Number(slot.x) || 0, 0, Number(slot.z) || 0);
      model.rotation.y = Number(slot.side) < 0 ? Math.PI / 2 : -Math.PI / 2;
      model.userData.kanoWorldGlbActive = true;
      model.userData.kanoWorldSlotIndex = index;
      model.userData.kanoWorldCategory = key;
      const previous = slot.actor;
      this.world.remove(previous);
      kanoDisposeProceduralBuilding(previous);
      this.world.add(model);
      slot.actor = model;
      slot.replaced = true;
      added += 1;
    }
    if (added && !this._kanoWorldGlbActivationLogged) {
      this._kanoWorldGlbActivationLogged = true;
      console.info(`[Kano GLB visibility] activated ${added} additional existing building GLB(s) in ${this.mobile ? 'mobile' : 'desktop'} world.`);
    }
    return result;
  };
}

// ============================================================
// GLB VISIBILITY + TRANSFORM REPAIR (v3)
// Corrects imported world-model visibility after the renderer installs them.
// This is deliberately applied to the real existing scene objects and uses
// only the GLBs already loaded by ModelManager / the environment loader.
// ============================================================
const KANO_GLB_VISIBILITY_TRANSFORM_PATCH = Symbol.for('kano.life.glbVisibilityTransform.v3');
const kanoGlbVisibilityStats = {
  passes: 0,
  worldRootsRepaired: 0,
  groundAlignments: 0,
  meshesPrepared: 0,
  lastPassAt: null,
  errors: [],
};

function kanoPrepareVisibleGlbRoot(root) {
  if (!root?.traverse || !root?.userData) return { root: false, meshes: 0 };
  const path = root.userData.modelPath || root.userData.kanoEnvironmentAsset;
  if (!path && !root.userData.kanoWorldGlbActive && !root.userData.flyoverModel
      && !root.userData.roadPropKey && !root.userData.lifeSceneModel
      && !root.userData.kanoExistingEnvironmentGlb && !root.userData.kanoPotholeGlb) {
    return { root: false, meshes: 0 };
  }
  root.visible = true;
  root.userData.kanoGlbVisibilityPrepared = true;
  let meshes = 0;
  root.traverse((node) => {
    if (!node?.isMesh || !node.geometry) return;
    meshes += 1;
    // Imported GLB bounds can be too small or offset for the slot transform.
    // Disable frustum culling for these scene assets rather than allowing the
    // renderer to drop them before their malformed imported bounds are repaired.
    node.frustumCulled = false;
    if (!node.geometry.boundingBox) node.geometry.computeBoundingBox?.();
    if (!node.geometry.boundingSphere) node.geometry.computeBoundingSphere?.();
    if (node.material) {
      const mats = Array.isArray(node.material) ? node.material : [node.material];
      for (const mat of mats) {
        if (mat && mat.visible === false && node.userData?.kanoHiddenByGame !== true) {
          // Don't override materials intentionally hidden by a game system.
          // Mesh visibility and culling are the known sources of false invisibility.
        }
      }
    }
  });
  root.updateMatrixWorld?.(true);
  kanoGlbVisibilityStats.meshesPrepared += meshes;
  return { root: true, meshes };
}

function kanoRepairBuildingSlotTransform(renderer, slot) {
  const root = slot?.actor;
  if (!root?.userData?.modelPath || root.userData.kanoGroundTransformFixed) return false;
  try {
    root.visible = true;
    // Preserve the renderer's x/z loop position, facing and selected scale.
    root.updateMatrixWorld?.(true);
    const box = new THREE.Box3().setFromObject(root);
    if (!Number.isFinite(box.min.y) || !Number.isFinite(box.max.y) || box.max.y - box.min.y < 0.05) {
      root.userData.kanoBoundsWarning = 'invalid-world-bounds';
      return false;
    }
    const lift = -box.min.y;
    // Keep already-grounded models exactly where they are; correct only real
    // sub-centimeter / positive/negative origin errors caused by imported GLBs.
    if (Math.abs(lift) > 0.015 && Math.abs(lift) < 6) {
      root.position.y += lift;
      root.updateMatrixWorld?.(true);
      kanoGlbVisibilityStats.groundAlignments += 1;
    }
    root.userData.kanoGroundTransformFixed = true;
    root.userData.kanoWorldSlotIndex = Number.isInteger(slot.index)
      ? slot.index : root.userData.kanoWorldSlotIndex;
    return true;
  } catch (error) {
    kanoGlbVisibilityStats.errors.push({
      path: root.userData.modelPath,
      stage: 'building-transform',
      message: error?.message || String(error),
    });
    return false;
  }
}

function kanoRepairRendererGlbVisibility(renderer) {
  if (!renderer || renderer.disposed) return;
  kanoGlbVisibilityStats.passes += 1;
  kanoGlbVisibilityStats.lastPassAt = new Date().toISOString();
  const seen = new Set();
  const prepare = (root) => {
    if (!root || seen.has(root)) return;
    seen.add(root);
    const result = kanoPrepareVisibleGlbRoot(root);
    if (result.root) kanoGlbVisibilityStats.worldRootsRepaired += 1;
  };

  try {
    for (const slot of renderer.buildingSlots || []) {
      if (!slot?.replaced || !slot.actor?.userData?.modelPath) continue;
      prepare(slot.actor);
      kanoRepairBuildingSlotTransform(renderer, slot);
    }
    for (const list of [renderer.flyovers, renderer.streetLights, renderer.pedestrians,
      renderer.roadProps, renderer.lifeAssetSlots, renderer.garageVehicleSlots]) {
      for (const item of list || []) {
        const root = item?.actor || item;
        if (root?.userData?.modelPath || root?.userData?.kanoEnvironmentAsset) prepare(root);
      }
    }
    renderer.world?.traverse?.((node) => {
      if (!node?.userData) return;
      const hasGLB = Boolean(node.userData.modelPath || node.userData.kanoEnvironmentAsset
        || node.userData.kanoExistingEnvironmentGlb || node.userData.kanoPotholeGlb
        || node.userData.kanoWorldGlbActive || node.userData.flyoverModel
        || node.userData.roadPropKey || node.userData.lifeSceneModel);
      if (hasGLB && node.isObject3D) prepare(node);
    });
    renderer.lifeDioramaRoot?.traverse?.((node) => {
      if (node?.userData?.modelPath && node.isObject3D) prepare(node);
    });
    renderer.garageGroup?.traverse?.((node) => {
      if (node?.userData?.modelPath && node.isObject3D) prepare(node);
    });
  } catch (error) {
    kanoGlbVisibilityStats.errors.push({
      path: '(scene traversal)',
      stage: 'visibility-pass',
      message: error?.message || String(error),
    });
  }
}

if (!Renderer3D.prototype[KANO_GLB_VISIBILITY_TRANSFORM_PATCH]) {
  const originalVisibilityWorldUpgrade = Renderer3D.prototype.upgradeWorldAssets;
  const originalVisibilityLifeUpgrade = Renderer3D.prototype.upgradeLifeSceneAssets;
  const originalVisibilityGarageUpgrade = Renderer3D.prototype.upgradeGarageAssets;
  Object.defineProperty(Renderer3D.prototype, KANO_GLB_VISIBILITY_TRANSFORM_PATCH, { value: true });

  if (typeof originalVisibilityWorldUpgrade === 'function') {
    Renderer3D.prototype.upgradeWorldAssets = function upgradeWorldWithTransformRepair(...args) {
      const result = originalVisibilityWorldUpgrade.apply(this, args);
      kanoRepairRendererGlbVisibility(this);
      return result;
    };
  }
  if (typeof originalVisibilityLifeUpgrade === 'function') {
    Renderer3D.prototype.upgradeLifeSceneAssets = function upgradeLifeWithTransformRepair(...args) {
      const result = originalVisibilityLifeUpgrade.apply(this, args);
      kanoRepairRendererGlbVisibility(this);
      return result;
    };
  }
  if (typeof originalVisibilityGarageUpgrade === 'function') {
    Renderer3D.prototype.upgradeGarageAssets = function upgradeGarageWithTransformRepair(...args) {
      const result = originalVisibilityGarageUpgrade.apply(this, args);
      kanoRepairRendererGlbVisibility(this);
      return result;
    };
  }
}

function kanoGlbCameraVisibility(renderer, root) {
  try {
    if (!renderer?.camera || !root) return null;
    renderer.camera.updateMatrixWorld?.(true);
    root.updateMatrixWorld?.(true);
    const box = new THREE.Box3().setFromObject(root);
    if (box.isEmpty?.()) return false;
    const viewProjection = new THREE.Matrix4().multiplyMatrices(
      renderer.camera.projectionMatrix,
      renderer.camera.matrixWorldInverse,
    );
    const frustum = new THREE.Frustum().setFromProjectionMatrix(viewProjection);
    return frustum.intersectsBox(box);
  } catch (_) { return null; }
}

if (typeof window !== 'undefined') {
  window.kanoGlbActivateLoadedModels = () => {
    const renderer = activeRenderer || window.__KANO_ACTIVE_RENDERER__ || null;
    if (!renderer || renderer.disposed) {
      return { ok: false, message: 'The active WebGL renderer is not ready.' };
    }
    try {
      renderer.upgradeWorldAssets?.();
      renderer.upgradePedestrians?.();
      renderer.upgradeLifeSceneAssets?.();
      renderer.upgradeGarageAssets?.();
      renderer.upgradeGarageVehicles?.();
      kanoRepairRendererGlbVisibility(renderer);
      return { ok: true, report: kanoBuildModelVisibilityReport() };
    } catch (error) {
      return { ok: false, message: error?.message || String(error) };
    }
  };
  window.kanoGlbTransformRepairStatus = () => ({
    ...kanoGlbVisibilityStats,
    liveRenderer: Boolean(activeRenderer && !activeRenderer.disposed),
    lastReport: typeof window.kanoGlbVisibilityReport === 'function'
      ? window.kanoGlbVisibilityReport() : null,
  });
}

function kanoBuildModelVisibilityReport() {
  const renderer = activeRenderer || window.__KANO_ACTIVE_RENDERER__ || null;
  const manager = renderer?.models || window.__KANO_ACTIVE_MODEL_MANAGER__ || null;
  const pool = typeof window.kanoExistingGlbModelPoolReport === 'function'
    ? window.kanoExistingGlbModelPoolReport() : null;
  const environment = typeof window.kanoEnvironmentGlbUsageReport === 'function'
    ? window.kanoEnvironmentGlbUsageReport() : null;
  // main.js owns the real render-mode state. Do not infer WebGL from an old,
  // disposed Renderer3D reference after the app has fallen back to Canvas 2D.
  const actualRenderMode = String(window.__KANO_RENDER_MODE__ || (
    renderer?.renderer?.isWebGLRenderer ? '3D' : renderer ? 'unknown' : 'not-ready'
  ));
  const worldCounts = { glbRoots: 0, worldBuildings: 0, worldRoadside: 0, cameraFrustumRoots: 0, modelPaths: [], roots: [] };
  const seenPaths = new Set();
  renderer?.world?.traverse?.((node) => {
    if (!node?.userData) return;
    const path = node.userData.modelPath || node.userData.kanoEnvironmentAsset;
    if (!path || !node.visible) return;
    if (node.userData.modelPath) {
      worldCounts.glbRoots += 1;
      if (node.userData.kanoWorldGlbActive || node.userData.kanoWorldSlotIndex !== undefined) worldCounts.worldBuildings += 1;
      if (node.userData.roadPropKey || node.userData.flyoverModel || node.userData.lifeSceneModel) worldCounts.worldRoadside += 1;
      const cameraVisible = kanoGlbCameraVisibility(renderer, node);
      if (cameraVisible === true) worldCounts.cameraFrustumRoots += 1;
      if (worldCounts.roots.length < 120) {
        const position = node.getWorldPosition?.(new THREE.Vector3()) || node.position || { x: 0, y: 0, z: 0 };
        const box = new THREE.Box3().setFromObject(node);
        const size = box.getSize(new THREE.Vector3());
        worldCounts.roots.push({
          path,
          key: node.userData.modelKey || node.userData.kanoWorldCategory || null,
          position: { x: Number(position.x.toFixed(2)), y: Number(position.y.toFixed(2)), z: Number(position.z.toFixed(2)) },
          size: { x: Number(size.x.toFixed(2)), y: Number(size.y.toFixed(2)), z: Number(size.z.toFixed(2)) },
          cameraFrustum: cameraVisible,
          visible: Boolean(node.visible),
        });
      }
    }
    if (!seenPaths.has(path)) { seenPaths.add(path); worldCounts.modelPaths.push(path); }
  });
  const slots = Array.isArray(renderer?.buildingSlots) ? {
    total: renderer.buildingSlots.length,
    replacedByGlb: renderer.buildingSlots.filter((slot) => slot?.replaced && slot.actor?.userData?.modelPath).length,
    stillProcedural: renderer.buildingSlots.filter((slot) => !slot?.replaced).length,
  } : null;
  const status = manager?.getStatus?.() || null;
  let diagnosis = '3D renderer active; inspect loaded asset paths and visible scene objects.';
  if (actualRenderMode === '2D') {
    diagnosis = 'GLB models cannot render in the current Canvas 2D mode. Reload this diagnostic with FORCE 3D enabled.';
  } else if (actualRenderMode === 'not-ready') {
    diagnosis = 'Renderer has not been observed yet. Wait for startup or check the console for initialization errors.';
  } else if (renderer?.disposed) {
    diagnosis = 'The last observed 3D renderer is disposed. The app may have switched renderers; use the global mode above.';
  } else if (!status?.loaded?.length) {
    diagnosis = 'No model categories are reported as loaded. Check model requests and ModelManager audit failures.';
  } else if (slots && slots.replacedByGlb === 0) {
    diagnosis = 'Some model categories loaded, but no building slot currently reports a GLB replacement. Check candidate failures and world activation.';
  } else if (worldCounts.glbRoots === 0) {
    diagnosis = 'Models may be cached but no visible GLB roots were found under the active world group. Check scene activation/visibility.';
  } else {
    diagnosis = worldCounts.cameraFrustumRoots > 0
      ? 'Loaded GLB roots intersect the active camera frustum. Their exact paths, dimensions and placements are listed below.'
      : 'GLBs are present in the world but none of the reported roots intersect the camera frustum. Check their position/size fields, then use ACTIVATE LOADED GLBS.';
  }
  let webglContextLost = null;
  try {
    const context = renderer?.renderer?.getContext?.();
    if (context && typeof context.isContextLost === 'function') webglContextLost = context.isContextLost();
  } catch (_) {}
  return {
    renderMode: actualRenderMode,
    glbRenderingEnabled: actualRenderMode === '3D',
    startupPreference: window.__KANO_GLB_STARTUP_QUALITY__ || kanoGlbStartupPreferenceStatus,
    diagnosis,
    mobile: Boolean(renderer?.mobile),
    rendererReady: Boolean(renderer?.ready),
    rendererDisposed: Boolean(renderer?.disposed),
    webglContextLost,
    manager: status,
    visibleWorld: worldCounts,
    buildingSlots: slots,
    pools: pool,
    environment,
    assetAudit: pool?.assetAudit || (typeof getModelAssetAuditReport === 'function' ? getModelAssetAuditReport() : null),
    visibilityTransformRepair: { ...kanoGlbVisibilityStats, errors: kanoGlbVisibilityStats.errors.slice(-40) },
    timestamp: new Date().toISOString(),
  };
}
if (typeof window !== 'undefined') {
  window.kanoGlbVisibilityReport = kanoBuildModelVisibilityReport;
  window.kanoGlbForce3DAndAudit = () => {
    try {
      const url = new URL(window.location.href);
      url.searchParams.delete('force2d');
      url.searchParams.set('force3d', '1');
      url.searchParams.set('assetAudit', '1');
      window.location.assign(url.toString());
      return true;
    } catch (error) {
      console.error('[Kano GLB audit] Could not open forced 3D diagnostics.', error);
      return false;
    }
  };
  // Keep the normal game screen clean. Diagnostics are opt-in.
  let enableAssetAudit = false;
  try { enableAssetAudit = new URLSearchParams(window.location.search).get('assetAudit') === '1'; } catch (_) {}
  if (enableAssetAudit) {
    const mountAuditPanel = () => {
      if (document.getElementById('kano-glb-visibility-audit')) return;
      const panel = document.createElement('section');
      panel.id = 'kano-glb-visibility-audit';
      panel.style.cssText = 'position:fixed;z-index:99999;top:10px;right:10px;width:min(620px,calc(100vw - 20px));max-height:78vh;display:flex;flex-direction:column;background:rgba(5,15,27,.98);color:#e9f5ff;border:1px solid #00b4d8;border-radius:10px;box-shadow:0 8px 30px #000b;font:12px/1.4 system-ui,sans-serif;';
      const header = document.createElement('div');
      header.style.cssText = 'display:flex;align-items:center;gap:8px;flex-wrap:wrap;padding:9px 10px;border-bottom:1px solid #31516b;font-weight:800;';
      const heading = document.createElement('strong');
      heading.textContent = 'KANO LIFE · GLB VISIBILITY AUDIT';
      heading.style.cssText = 'flex:1 1 210px;';
      const modeBadge = document.createElement('span');
      modeBadge.id = 'kano-glb-render-mode';
      modeBadge.style.cssText = 'padding:4px 7px;border-radius:5px;background:#4b2430;color:#ffc0c8;font-weight:900;';
      modeBadge.textContent = 'MODE CHECKING';
      const force3d = document.createElement('button');
      force3d.type = 'button'; force3d.textContent = 'RELOAD FORCE 3D';
      force3d.style.cssText = 'background:#f5c542;border:0;border-radius:5px;padding:6px 8px;font-weight:900;color:#18202b;';
      force3d.addEventListener('click', () => window.kanoGlbForce3DAndAudit?.());
      const default3DButton = document.createElement('button');
      default3DButton.type = 'button'; default3DButton.textContent = 'SAVE 3D DEFAULT';
      default3DButton.style.cssText = 'background:#75d9ff;border:0;border-radius:5px;padding:6px 8px;font-weight:900;color:#072134;';
      default3DButton.addEventListener('click', () => {
        const result = window.kanoGlbUse3DByDefault?.();
        if (result?.ok === false) {
          const output = document.getElementById('kano-glb-visibility-audit-body');
          if (output) output.textContent = `Could not save 3D default: ${result.error}`;
        }
      });
      const activateButton = document.createElement('button');
      activateButton.type = 'button'; activateButton.textContent = 'ACTIVATE LOADED GLBS';
      activateButton.style.cssText = 'background:#3ea878;border:0;border-radius:5px;padding:6px 8px;font-weight:900;color:#071d14;';
      activateButton.addEventListener('click', () => {
        const result = window.kanoGlbActivateLoadedModels?.();
        const output = document.getElementById('kano-glb-visibility-audit-body');
        if (output && result?.ok === false) output.textContent = `${result.message}\n\n${JSON.stringify(kanoBuildModelVisibilityReport(), null, 2)}`;
      });
      const exportButton = document.createElement('button');
      exportButton.type = 'button'; exportButton.textContent = 'EXPORT JSON';
      exportButton.style.cssText = 'background:#00b4d8;border:0;border-radius:5px;padding:6px 8px;font-weight:900;color:#062033;';
      exportButton.addEventListener('click', () => {
        try {
          const payload = JSON.stringify(kanoBuildModelVisibilityReport(), null, 2);
          const blob = new Blob([payload], { type: 'application/json' });
          const href = URL.createObjectURL(blob);
          const link = document.createElement('a');
          link.href = href; link.download = `kano-glb-visibility-report-${new Date().toISOString().slice(0, 10)}.json`;
          document.body.appendChild(link); link.click(); link.remove();
          window.setTimeout(() => URL.revokeObjectURL(href), 1000);
        } catch (error) { console.error('[Kano GLB audit] Export failed.', error); }
      });
      const close = document.createElement('button');
      close.type = 'button'; close.textContent = 'HIDE';
      close.style.cssText = 'background:#263a4d;border:1px solid #577089;border-radius:5px;padding:6px 8px;font-weight:800;color:#e9f5ff;';
      close.addEventListener('click', () => { panel.style.display = panel.style.display === 'none' ? 'flex' : 'none'; close.textContent = panel.style.display === 'none' ? 'SHOW' : 'HIDE'; });
      header.append(heading, modeBadge, default3DButton, force3d, activateButton, exportButton, close);
      const body = document.createElement('pre');
      body.id = 'kano-glb-visibility-audit-body';
      body.style.cssText = 'margin:0;padding:10px 12px;overflow:auto;white-space:pre-wrap;overflow-wrap:anywhere;';
      panel.append(header, body);
      document.body.appendChild(panel);
      const refresh = () => {
        const output = document.getElementById('kano-glb-visibility-audit-body');
        if (!output || !panel.isConnected) return;
        try {
          const report = kanoBuildModelVisibilityReport();
          const badge = document.getElementById('kano-glb-render-mode');
          if (badge) {
            badge.textContent = report.renderMode === '3D' ? '3D WEBGL ACTIVE' : `RENDER MODE: ${report.renderMode}`;
            badge.style.background = report.renderMode === '3D' ? '#124638' : '#4b2430';
            badge.style.color = report.renderMode === '3D' ? '#adffe4' : '#ffc0c8';
          }
          output.textContent = JSON.stringify(report, null, 2);
        } catch (error) {
          output.textContent = `Audit could not be built: ${error?.stack || error}`;
        }
      };
      refresh();
      window.setInterval(refresh, 1200);
    };
    if (document.body) mountAuditPanel();
    else document.addEventListener('DOMContentLoaded', mountAuditPanel, { once: true });
  }
}


// ============================================================
// GLB STARTUP MODE REPAIR (v1)
// The main app honours a saved quality="2d" preference and then loads
// Canvas2D; GLB world/environment/character assets can never appear in 2D.
// For this requested GLB upgrade, migrate the existing saved quality to 3D
// once. Respect an explicit ?force2d=1 request and allow the player to choose
// 2D again later because the migration marker prevents repeated overriding.
// ============================================================
const KANO_GLB_3D_STARTUP_MIGRATION_KEY = 'kano-life-glb-3d-startup-migration-v1';
const kanoGlbStartupPreferenceStatus = {
  migrationKey: KANO_GLB_3D_STARTUP_MIGRATION_KEY,
  applied: false,
  changedPreference: false,
  previousQuality: null,
  resultingQuality: null,
  reason: 'not-run',
  timestamp: null,
};

function applyKanoGlbStartupPreferenceRepair() {
  const query = new URLSearchParams(window.location.search);
  const previousQuality = save?.settings?.quality ?? null;
  kanoGlbStartupPreferenceStatus.previousQuality = previousQuality;
  kanoGlbStartupPreferenceStatus.timestamp = new Date().toISOString();

  if (query.has('force2d')) {
    kanoGlbStartupPreferenceStatus.reason = 'explicit-force2d-query-respected';
    kanoGlbStartupPreferenceStatus.resultingQuality = previousQuality;
    return;
  }

  let alreadyMigrated = false;
  try {
    alreadyMigrated = window.localStorage.getItem(KANO_GLB_3D_STARTUP_MIGRATION_KEY) === 'done';
  } catch (_) {
    // Storage may be restricted. In-memory preference change can still help
    // this page load; the normal application remains responsible for fallback.
  }

  if (alreadyMigrated) {
    kanoGlbStartupPreferenceStatus.applied = true;
    kanoGlbStartupPreferenceStatus.reason = 'one-time-migration-already-completed';
    kanoGlbStartupPreferenceStatus.resultingQuality = save?.settings?.quality ?? null;
    return;
  }

  try {
    if (!save.settings || typeof save.settings !== 'object') save.settings = {};
    if (save.settings.quality !== '3d') {
      save.settings.quality = '3d';
      kanoGlbStartupPreferenceStatus.changedPreference = true;
      persist();
    }
    try { window.localStorage.setItem(KANO_GLB_3D_STARTUP_MIGRATION_KEY, 'done'); } catch (_) {}
    kanoGlbStartupPreferenceStatus.applied = true;
    kanoGlbStartupPreferenceStatus.reason = kanoGlbStartupPreferenceStatus.changedPreference
      ? 'saved-quality-migrated-to-3d-for-glb-rendering'
      : 'saved-quality-already-3d';
    kanoGlbStartupPreferenceStatus.resultingQuality = save.settings.quality;
    console.info('[Kano GLB] Startup quality:', kanoGlbStartupPreferenceStatus.reason,
      '| quality =', save.settings.quality,
      '| use ?force2d=1 to explicitly disable GLB rendering.');
  } catch (error) {
    // Do not block game startup if user storage is locked or unavailable.
    kanoGlbStartupPreferenceStatus.reason = 'preference-migration-failed';
    kanoGlbStartupPreferenceStatus.resultingQuality = save?.settings?.quality ?? null;
    console.warn('[Kano GLB] Could not persist 3D startup preference; normal startup continues.', error);
  }
}

applyKanoGlbStartupPreferenceRepair();
if (typeof window !== 'undefined') {
  window.__KANO_GLB_STARTUP_QUALITY__ = kanoGlbStartupPreferenceStatus;
  window.kanoGlbUse3DByDefault = () => {
    try {
      if (!save.settings || typeof save.settings !== 'object') save.settings = {};
      save.settings.quality = '3d';
      persist();
      const url = new URL(window.location.href);
      url.searchParams.delete('force2d');
      url.searchParams.delete('force3d');
      url.searchParams.set('assetAudit', '1');
      window.location.assign(url.toString());
      return { ok: true, quality: '3d' };
    } catch (error) {
      console.error('[Kano GLB] Could not save the 3D preference.', error);
      return { ok: false, error: error?.message || String(error) };
    }
  };
}

// ============================================================
// GLB WORLD FRAMING + DENSITY REPAIR (v1)
// Uses the existing loaded building GLBs more visibly by moving the roadside
// frontage into the portrait-camera's useful field of view, restoring the
// intended normalized model scale instead of shrinking every building to the
// procedural placeholder's small random height, and adding four opposite-side
// model slots from existing building candidates. No new GLB files are added.
// ============================================================
const KANO_GLB_WORLD_FRAMING_PATCH = Symbol.for('kano.life.glbWorldFraming.v1');
const kanoGlbWorldFramingStats = {
  version: 1,
  buildWorldPasses: 0,
  additionalSlotsCreated: 0,
  modelScalesCorrected: 0,
  lastAppliedAt: null,
  lastError: null,
};

function kanoWorldFrontageOffset(index) {
  // Keeps shop/building fronts close enough to read on portrait mobile cameras,
  // while still leaving a narrow roadside shoulder outside the 13-unit road.
  return 7.8 + (Math.floor(index / 2) % 3) * 0.85;
}

function kanoApplyWorldFrontageLayout(renderer) {
  if (!renderer || !Array.isArray(renderer.buildingSlots)) return;
  const slots = renderer.buildingSlots;

  for (let index = 0; index < slots.length; index += 1) {
    const slot = slots[index];
    if (!slot) continue;
    const side = Number(slot.side) < 0 ? -1 : 1;
    const x = side * kanoWorldFrontageOffset(index);
    slot.index = index;
    slot.side = side;
    slot.x = x;
    if (slot.actor?.position) slot.actor.position.x = x;
    if (slot.actor?.userData) {
      slot.actor.userData.kanoWorldSlotIndex = index;
      slot.actor.userData.kanoWorldFrontageLayout = true;
    }
  }

  // Add four opposite-side frontage models so mobile receives 14 GLB-backed
  // building slots (instead of the renderer's original ten procedural slots).
  // Desktop gets the same four additions on its longer existing street loop.
  const extraCount = 4;
  const marker = renderer.userData?.kanoGlbFrontageExtrasAdded;
  if (!marker && slots.length) {
    const baseCount = slots.length;
    const baseIndices = renderer.mobile ? [1, 2, 3, 4] : [3, 7, 11, 15];
    let added = 0;
    for (let extraIndex = 0; extraIndex < Math.min(extraCount, baseIndices.length); extraIndex += 1) {
      const baseSlot = slots[baseIndices[extraIndex]];
      if (!baseSlot) continue;
      const index = slots.length;
      const side = -baseSlot.side;
      const x = side * kanoWorldFrontageOffset(index);
      const z = Number(baseSlot.z ?? baseSlot.actor?.position?.z) || -8 - index * 10;
      const industrial = extraIndex === 2;
      const height = (industrial ? 5.2 : 4.5) * [1.06, 1.15, 1.24, 1.10][extraIndex];
      const actor = new THREE.Group();
      actor.name = `KANO_GLB_FRONTAGE_SLOT_${index}`;
      actor.position.set(x, 0, z);
      actor.userData.kanoWorldSlotPlaceholder = true;
      actor.userData.kanoWorldSlotIndex = index;
      actor.userData.kanoWorldFrontageLayout = true;
      renderer.world.add(actor);
      slots.push({
        actor,
        x,
        z,
        height,
        side,
        industrial,
        replaced: false,
        index,
        kanoGlbFrontageExtra: true,
      });
      added += 1;
    }
    renderer.userData = renderer.userData || {};
    renderer.userData.kanoGlbFrontageExtrasAdded = true;
    kanoGlbWorldFramingStats.additionalSlotsCreated += added;
  }

  // Move existing roadside promo boards back next to the building they were
  // authored for. These are procedural signs, not replacement GLB assets.
  for (const child of renderer.world?.children || []) {
    if (!child?.userData?.kanoWorldBillboard || !child.position) continue;
    const original = child.userData.kanoWorldBillboardOriginal || {};
    const wantedSide = Number(original.x) < 0 ? -1 : 1;
    let best = null;
    let bestDistance = Infinity;
    for (const slot of slots) {
      if (!slot || slot.kanoGlbFrontageExtra || slot.side !== wantedSide) continue;
      const distance = Math.abs((Number(slot.z) || 0) + 1.75 - child.position.z);
      if (distance < bestDistance) {
        best = slot;
        bestDistance = distance;
      }
    }
    if (best && bestDistance < 3) {
      child.position.x = best.x - best.side * 1.5;
      child.userData.kanoWorldBillboardForSlot = best.index;
    }
  }
}

if (!Renderer3D.prototype[KANO_GLB_WORLD_FRAMING_PATCH]) {
  Object.defineProperty(Renderer3D.prototype, KANO_GLB_WORLD_FRAMING_PATCH, { value: true });

  const originalAddBillboardForWorldFraming = Renderer3D.prototype.addBillboard;
  if (typeof originalAddBillboardForWorldFraming === 'function') {
    Renderer3D.prototype.addBillboard = function addTrackedKanoWorldBillboard(x, y, z, green, ...args) {
      const before = this.world?.children?.length || 0;
      const result = originalAddBillboardForWorldFraming.call(this, x, y, z, green, ...args);
      const inserted = this.world?.children?.[before];
      if (inserted?.position) {
        inserted.userData = inserted.userData || {};
        inserted.userData.kanoWorldBillboard = true;
        inserted.userData.kanoWorldBillboardOriginal = { x, y, z, green: Boolean(green) };
      }
      return result;
    };
  }

  const originalBuildWorldForFraming = Renderer3D.prototype.buildWorld;
  if (typeof originalBuildWorldForFraming === 'function') {
    Renderer3D.prototype.buildWorld = function buildWorldWithKanoGlbFrontage(...args) {
      const result = originalBuildWorldForFraming.apply(this, args);
      try {
        kanoApplyWorldFrontageLayout(this);
        kanoGlbWorldFramingStats.buildWorldPasses += 1;
        kanoGlbWorldFramingStats.lastAppliedAt = new Date().toISOString();
      } catch (error) {
        kanoGlbWorldFramingStats.lastError = error?.message || String(error);
        console.warn('[Kano GLB frontage] Layout pass failed; original world remains available.', error);
      }
      return result;
    };
  }

  const originalWorldUpgradeForFraming = Renderer3D.prototype.upgradeWorldAssets;
  if (typeof originalWorldUpgradeForFraming === 'function') {
    Renderer3D.prototype.upgradeWorldAssets = function upgradeWorldAssetsWithKanoGlbFraming(...args) {
      const result = originalWorldUpgradeForFraming.apply(this, args);
      try {
        for (let index = 0; index < (this.buildingSlots || []).length; index += 1) {
          const slot = this.buildingSlots[index];
          const model = slot?.actor;
          if (!slot?.replaced || !model?.userData?.modelPath) continue;
          if (model.userData.kanoWorldFramingVersion === 1) continue;

          const normalizedHeight = Number(model.userData.targetHeight)
            || (slot.industrial ? 5.2 : 4.5);
          // The old renderer scaled imported buildings to the placeholder's
          // random 2.2–4.3m height. That shrank normalized GLBs, making them look
          // like tiny props. Keep model-specific normalized height and vary it
          // modestly for real-looking frontages instead.
          const sizeVariant = Math.floor(index / 2) % 3;
          const extraVariant = slot.kanoGlbFrontageExtra ? (index % 2) * 0.035 : 0;
          const scale = [1.06, 1.15, 1.24][sizeVariant] + extraVariant;
          model.scale.setScalar(scale);
          model.position.x = Number(slot.x) || 0;
          model.visible = true;
          model.userData.kanoWorldFramingVersion = 1;
          model.userData.kanoWorldFramingScale = scale;
          model.userData.kanoWorldFramingTargetHeight = normalizedHeight * scale;
          model.userData.kanoWorldSlotIndex = index;
          model.updateMatrixWorld?.(true);
          kanoGlbWorldFramingStats.modelScalesCorrected += 1;
        }
        kanoGlbWorldFramingStats.lastAppliedAt = new Date().toISOString();
      } catch (error) {
        kanoGlbWorldFramingStats.lastError = error?.message || String(error);
        console.warn('[Kano GLB frontage] Model scale pass failed; loaded GLBs remain active.', error);
      }
      return result;
    };
  }
}

function kanoBuildWorldFramingReport() {
  const renderer = activeRenderer || window.__KANO_ACTIVE_RENDERER__ || null;
  const slots = (renderer?.buildingSlots || []).map((slot, index) => {
    const model = slot?.actor;
    let size = null;
    let inFrustum = null;
    try {
      if (model) {
        model.updateMatrixWorld?.(true);
        const box = new THREE.Box3().setFromObject(model);
        const vector = box.getSize(new THREE.Vector3());
        size = { x: Number(vector.x.toFixed(2)), y: Number(vector.y.toFixed(2)), z: Number(vector.z.toFixed(2)) };
        if (typeof kanoGlbCameraVisibility === 'function') inFrustum = kanoGlbCameraVisibility(renderer, model);
      }
    } catch (_) {}
    return {
      index,
      category: slot?.industrial ? 'industrialBuilding' : 'building',
      path: model?.userData?.modelPath || null,
      replacedByGlb: Boolean(slot?.replaced && model?.userData?.modelPath),
      visible: Boolean(model?.visible),
      x: Number((model?.position?.x ?? slot?.x ?? 0).toFixed(2)),
      y: Number((model?.position?.y ?? 0).toFixed(2)),
      z: Number((model?.position?.z ?? slot?.z ?? 0).toFixed(2)),
      scale: model?.scale ? Number(model.scale.x.toFixed(3)) : null,
      dimensions: size,
      cameraFrustum: inFrustum,
      additionalSlot: Boolean(slot?.kanoGlbFrontageExtra),
    };
  });
  return {
    ...kanoGlbWorldFramingStats,
    mobile: Boolean(renderer?.mobile),
    totalSlots: slots.length,
    glbSlots: slots.filter((slot) => slot.replacedByGlb).length,
    visibleGlbSlots: slots.filter((slot) => slot.replacedByGlb && slot.visible).length,
    inCameraFrustum: slots.filter((slot) => slot.replacedByGlb && slot.cameraFrustum === true).length,
    slots,
  };
}

if (typeof window !== 'undefined') {
  window.kanoGlbWorldFramingReport = kanoBuildWorldFramingReport;
  if (typeof window.kanoGlbVisibilityReport === 'function'
      && !window.__KANO_GLB_WORLD_FRAMING_REPORT_WRAPPED__) {
    const previousKanoGlbVisibilityReport = window.kanoGlbVisibilityReport;
    window.kanoGlbVisibilityReport = () => {
      const report = previousKanoGlbVisibilityReport();
      return { ...report, worldFraming: kanoBuildWorldFramingReport() };
    };
    window.__KANO_GLB_WORLD_FRAMING_REPORT_WRAPPED__ = true;
  }
}

// Register all hooks before the actual game entry point creates its objects.
await import('./main.js');
