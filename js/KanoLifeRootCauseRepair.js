/**
 * Kano Life — targeted root-cause repairs for imported GLB presentation,
 * animated actors, mobile rendering overhead and collision feedback.
 *
 * This is an additive compatibility layer. It does not change fares, health
 * damage values, collision detection, steering, speed, or progression.
 */
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { clone as cloneSkeleton } from 'three/addons/utils/SkeletonUtils.js';
import * as ModelManagerModule from './ModelManager.js';
import * as RendererModule from './renderer3d.js';
import * as GameModule from './game.js';
import * as SceneUpgradeModule from './KanoSceneUpgrade.js';
import * as AnimationTrafficModule from './KanoAnimationTrafficUpgrade.js';
import * as ProductionSystemsModule from './productionSystems.js';

const ModelManager = ModelManagerModule.ModelManager;
const Renderer3D = RendererModule.Renderer3D;
const Game = GameModule.Game;
const KanoSceneUpgrade = SceneUpgradeModule.KanoSceneUpgrade;
const KanoGLBAnimationManager = AnimationTrafficModule.KanoGLBAnimationManager;
const PureWaterHawker = ProductionSystemsModule.PureWaterHawker;
const PATCH_KEY = Symbol.for('kano.life.rootCauseRepair.v1');
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, Number(v) || 0));
const nowMs = () => (globalThis.performance?.now?.() ?? Date.now());
const safeCall = (fn, fallback = null) => { try { return fn(); } catch { return fallback; } };
const rootAudit = {
  version: 1,
  installedAt: new Date().toISOString(),
  patches: {},
  kekeFits: [],
  passengerModelsAttached: 0,
  seatedPassengerModels: 0,
  lifeModelsAttached: 0,
  waterVendor: { status: 'waiting-for-vendor' },
  goat: { status: 'waiting-for-crossing-event' },
  embeddedAnimations: { requestedAssets: 0, clipAssetsLoaded: 0, cliplessAssets: 0, loadFailures: 0, activeActors: 0, budgetSkips: 0, modeTransitions: 0, crossfades: 0, budgetWaitlist: 0, clipsByPath: {} },
  recentImpacts: [],
  damageVisual: { bodyMaterialsTinted: 0, lastCondition: null },
  performance: { animatedRootCacheHits: 0, animatedRootScans: 0, mobileShadowPassesSkipped: 0, goatSceneScans: 0, goatSceneScanCacheHits: 0 },
  notes: [],
};
if (typeof window !== 'undefined') {
  window.__KANO_LIFE_ROOT_CAUSE_AUDIT__ = rootAudit;
  window.kanoLifeRootCauseAudit = () => buildAuditReport();
}

function markPatched(prototype, method, fn) {
  if (!prototype || typeof prototype[method] !== 'function') return false;
  const original = prototype[method];
  if (original[PATCH_KEY]) return false;
  const wrapped = fn(original);
  Object.defineProperty(wrapped, PATCH_KEY, { value: true });
  Object.defineProperty(wrapped, '__kanoOriginal', { value: original });
  prototype[method] = wrapped;
  return true;
}
function isMobile() {
  return Boolean(globalThis.matchMedia?.('(pointer: coarse)').matches || globalThis.innerWidth <= 760);
}
function meshMaterials(mesh) {
  if (!mesh?.material) return [];
  return (Array.isArray(mesh.material) ? mesh.material : [mesh.material]).filter(Boolean);
}
function countContainer(value) {
  if (!value) return 0;
  if (Array.isArray(value)) return value.length;
  if (typeof value.size === 'number') return value.size;
  if (typeof value === 'object') return Object.keys(value).length;
  return 0;
}
function getManager(renderer = null) {
  return renderer?.models || globalThis.window?.__KANO_ACTIVE_MODEL_MANAGER__ ||
    globalThis.window?.__KANO_MODEL_MANAGER__ || null;
}
function modelAvailable(manager, key) {
  return Boolean(manager?.cache?.has?.(key) || manager?.__kanoExistingGlbPools?.get?.(key)?.length);
}
function modelInstance(manager, key) {
  if (!manager || typeof manager.getInstance !== 'function') return null;
  try {
    const instance = manager.getInstance(key);
    return instance?.isObject3D ? instance : null;
  } catch { return null; }
}
function getModelPath(root) {
  let path = '';
  root?.traverse?.((node) => { if (!path && node.userData?.modelPath) path = String(node.userData.modelPath); });
  return path;
}
function getModelBounds(root) {
  if (!root?.isObject3D) return null;
  root.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(root);
  if (box.isEmpty()) return null;
  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());
  return {
    box,
    width: Number(size.x.toFixed(3)),
    height: Number(size.y.toFixed(3)),
    depth: Number(size.z.toFixed(3)),
    center: center.toArray().map((v) => Number(v.toFixed(3))),
  };
}

// ---------------------------------------------------------------------------
// 1. Keke model calibration.
// ModelManager already normalises each GLB, grounds it, centres its source,
// and applies the project's established vehicle-facing convention. A bounding-
// box width/depth guess here used to rotate only the first child; that could
// separate the body from a driver rig stored beside it. Preserve the complete
// imported root unless an explicit path-specific correction has been saved.
// ---------------------------------------------------------------------------
const KEKE_CALIBRATION_STORAGE_KEY = 'kano-life-keke-model-calibration-v1';
function readKekeCalibrationStore() {
  try {
    const parsed = JSON.parse(globalThis.localStorage?.getItem(KEKE_CALIBRATION_STORAGE_KEY) || '{}');
    return parsed && typeof parsed === 'object' && parsed.models && typeof parsed.models === 'object'
      ? parsed
      : { version: 1, models: {} };
  } catch {
    return { version: 1, models: {} };
  }
}
function cleanKekeCalibration(input = {}) {
  const number = (value, fallback, min, max) => {
    const parsed = value === '' || value == null ? NaN : Number(value);
    return Number.isFinite(parsed) ? clamp(parsed, min, max) : fallback;
  };
  return {
    yawDeg: number(input.yawDeg, 0, -180, 180),
    offsetX: number(input.offsetX, 0, -2, 2),
    offsetY: number(input.offsetY, 0, -1, 1),
    offsetZ: number(input.offsetZ, 0, -2, 2),
    scale: number(input.scale, 1, 0.5, 1.5),
  };
}
function getKekeCalibrationForPath(path) {
  if (!path) return null;
  const store = readKekeCalibrationStore();
  const raw = store.models[path];
  return raw && typeof raw === 'object' ? cleanKekeCalibration(raw) : null;
}
function saveKekeCalibrationForPath(path, input) {
  if (!path || typeof path !== 'string') throw new TypeError('A loaded GLB model path is required.');
  const store = readKekeCalibrationStore();
  store.version = 1;
  store.models[path] = cleanKekeCalibration(input);
  globalThis.localStorage?.setItem(KEKE_CALIBRATION_STORAGE_KEY, JSON.stringify(store));
  return store.models[path];
}
function removeKekeCalibrationForPath(path) {
  const store = readKekeCalibrationStore();
  delete store.models[path];
  globalThis.localStorage?.setItem(KEKE_CALIBRATION_STORAGE_KEY, JSON.stringify(store));
}
function fitKekeTemplate(template) {
  if (!template?.isObject3D || template.userData?.kanoRootCauseKekeFit) return template;
  // Use bounds on the entire template so the attached driver rig remains part
  // of the same transform. Do not shift or rotate internal children here.
  const before = getModelBounds(template);
  const modelPath = String(template.userData?.modelPath || getModelPath(template) || '');
  const calibration = getKekeCalibrationForPath(modelPath);
  if (calibration) {
    template.rotation.y = THREE.MathUtils.degToRad(calibration.yawDeg);
    template.position.set(calibration.offsetX, calibration.offsetY, calibration.offsetZ);
    template.scale.setScalar(calibration.scale);
    template.updateMatrixWorld(true);
  }
  const after = getModelBounds(template);
  template.userData.kanoRootCauseKekeFit = {
    modelPath,
    calibrationApplied: Boolean(calibration),
    calibration: calibration || { yawDeg: 0, offsetX: 0, offsetY: 0, offsetZ: 0, scale: 1 },
    automaticAxisRotation: false,
    internalChildTransformChanged: false,
    orientationPolicy: 'preserve-ModelManager-normalization; apply only exact-path calibration',
    boundsBefore: before ? { width: before.width, height: before.height, depth: before.depth, center: before.center } : null,
    boundsAfter: after ? { width: after.width, height: after.height, depth: after.depth, center: after.center } : null,
  };
  rootAudit.kekeFits.push({ ...template.userData.kanoRootCauseKekeFit });
  if (rootAudit.kekeFits.length > 40) rootAudit.kekeFits.splice(0, rootAudit.kekeFits.length - 40);
  return template;
}
if (typeof window !== 'undefined') {
  window.kanoGetKekeModelCalibrations = () => readKekeCalibrationStore();
  window.kanoSaveKekeModelCalibration = (path, settings) => saveKekeCalibrationForPath(path, settings);
  window.kanoResetKekeModelCalibration = (path) => removeKekeCalibrationForPath(path);
}
if (ModelManager?.prototype) {
  rootAudit.patches.modelManagerLoad = markPatched(ModelManager.prototype, 'load', (original) => async function (key, ...args) {
    const model = await original.call(this, key, ...args);
    if (key === 'keke' && model) safeCall(() => fitKekeTemplate(model));
    return model;
  });
  rootAudit.patches.modelManagerMobileShadows = markPatched(ModelManager.prototype, 'getInstance', (original) => function (key, ...args) {
    const instance = original.call(this, key, ...args);
    if (isMobile() && instance?.isObject3D && key !== 'keke') {
      instance.traverse((node) => {
        if (!node.isMesh) return;
        node.castShadow = false;
        node.receiveShadow = false;
        if (node.isSkinnedMesh) node.frustumCulled = false;
      });
      rootAudit.performance.mobileShadowPassesSkipped += 1;
    }
    return instance;
  });
}

// ---------------------------------------------------------------------------
// 2. Reduce recurring scene traversal in the existing GLB animation manager.
// It invalidates quickly when actor collections change; all mixers still update
// every frame. This caches discovery, not animation time.
// ---------------------------------------------------------------------------
if (KanoGLBAnimationManager?.prototype) {
  rootAudit.patches.animatedRootDiscoveryCache = markPatched(
    KanoGLBAnimationManager.prototype,
    'collectAnimatedRoots',
    (original) => function (...args) {
      const renderer = this.renderer || this.activeRenderer;
      const signature = [
        countContainer(renderer?.pedestrians), countContainer(renderer?.trafficActors),
        countContainer(renderer?.zoneActors), countContainer(renderer?.lifeSceneGroups),
        renderer?.lifeDioramaRoot?.children?.length || 0,
        renderer?.lifeScene || '',
      ].join(':');
      const now = nowMs();
      if (this.__kanoAnimatedRootCache && this.__kanoAnimatedRootSignature === signature &&
          now - this.__kanoAnimatedRootCacheAt < 180) {
        rootAudit.performance.animatedRootCacheHits += 1;
        return this.__kanoAnimatedRootCache;
      }
      const result = original.apply(this, args);
      if (result instanceof Map) {
        this.__kanoAnimatedRootCache = result;
        this.__kanoAnimatedRootCacheAt = now;
        this.__kanoAnimatedRootSignature = signature;
        rootAudit.performance.animatedRootScans += 1;
      }
      return result;
    },
  );
}

// ---------------------------------------------------------------------------
// 3. Use already-loaded GLBs for passenger boarding and morning-life actors.
// Keep placeholder bodies until the real model is ready, then hide only the
// primitive body limbs; gameplay's boarding timing and pickup/drop remain intact.
// ---------------------------------------------------------------------------
const pendingLoads = new WeakMap();
function hasBodyMeshes(root) {
  let count = 0;
  root?.traverse?.((node) => { if (node.isMesh || node.isSkinnedMesh) count += 1; });
  return count > 0;
}
function prepareBonePose(actor) {
  const pose = { arms: [], legs: [], head: [], all: [] };
  actor?.traverse?.((node) => {
    if (!node.isBone) return;
    const name = node.name || '';
    const entry = { node, rest: node.rotation.clone(), sign: /left|_l\b|\.l\b/i.test(name) ? -1 : 1 };
    pose.all.push(entry);
    if (/arm|shoulder|elbow|hand|wrist/i.test(name)) pose.arms.push(entry);
    else if (/leg|thigh|calf|knee|foot|ankle/i.test(name)) pose.legs.push(entry);
    else if (/neck|head/i.test(name)) pose.head.push(entry);
  });
  return pose;
}
function poseActor(actor, time, mode = 'walk') {
  if (!actor?.userData?.kanoRootCausePose) return;
  const pose = actor.userData.kanoRootCausePose;
  const speed = mode === 'walk' ? 7.5 : mode === 'sweep' ? 6.1 : 3.3;
  const phase = time * speed;
  const gait = Math.sin(phase);
  const isBusy = /sell|water|draw|clean|sweep|food/i.test(mode);
  for (let i = 0; i < pose.legs.length; i += 1) {
    const item = pose.legs[i];
    item.node.rotation.x = item.rest.x + gait * (mode === 'walk' ? 0.36 : 0.06) * item.sign;
  }
  for (let i = 0; i < pose.arms.length; i += 1) {
    const item = pose.arms[i];
    const busy = isBusy && i === 0;
    const wave = busy ? Math.abs(Math.sin(time * 4.7)) : -gait;
    item.node.rotation.x = item.rest.x + wave * (busy ? 0.52 : mode === 'walk' ? 0.24 : 0.08) * item.sign;
    if (busy) item.node.rotation.z = (item.rest.z || 0) + Math.sin(time * 3.4) * 0.16;
  }
  for (const item of pose.head) {
    item.node.rotation.z = item.rest.z + Math.sin(time * 1.7) * 0.035;
  }
  actor.position.y = actor.userData.kanoRootCauseBaseY + Math.abs(gait) * (mode === 'walk' ? 0.025 : 0.008);
  if (!pose.all.length) actor.rotation.y = Math.sin(time * 2.4) * 0.025;
}
// ---------------------------------------------------------------------------
// 2B. Activate animation clips already embedded in the character GLBs.
// ModelManager caches the normalized scene but its public load result does not
// retain gltf.animations. Read clip metadata once per exact model path, release
// the temporary probe scene immediately, and reuse the clips for every clone.
// This is on-demand: static buildings/vehicles do not trigger extra GLB loads.
// ---------------------------------------------------------------------------
const embeddedClipPromises = new Map();
const embeddedAnimationMixers = new Map();
const embeddedAnimationBudgetWaitlist = new Set();
const embeddedCliplessPaths = new Set();
const MAX_EMBEDDED_MIXERS_MOBILE = 12;
const MAX_EMBEDDED_MIXERS_DESKTOP = 28;

function disposeAnimationProbeScene(root) {
  const geometries = new Set();
  const materials = new Set();
  const textures = new Set();
  root?.traverse?.((node) => {
    if (node.geometry) geometries.add(node.geometry);
    for (const material of meshMaterials(node)) {
      materials.add(material);
      for (const value of Object.values(material)) if (value?.isTexture) textures.add(value);
    }
  });
  for (const texture of textures) safeCall(() => texture.dispose());
  for (const material of materials) safeCall(() => material.dispose());
  for (const geometry of geometries) safeCall(() => geometry.dispose());
}

function embeddedClipsForPath(path) {
  if (!path) return Promise.resolve([]);
  if (embeddedClipPromises.has(path)) return embeddedClipPromises.get(path);
  rootAudit.embeddedAnimations.requestedAssets += 1;
  const promise = new GLTFLoader().loadAsync(encodedAssetUrl(path)).then((gltf) => {
    const clips = Array.isArray(gltf.animations) ? gltf.animations.map((clip) => clip.clone()) : [];
    disposeAnimationProbeScene(gltf.scene);
    if (clips.length) {
      rootAudit.embeddedAnimations.clipAssetsLoaded += 1;
      rootAudit.embeddedAnimations.clipsByPath[path] = clips.map((clip) => clip.name || '(unnamed clip)');
    } else {
      rootAudit.embeddedAnimations.cliplessAssets += 1;
      embeddedCliplessPaths.add(path);
      rootAudit.embeddedAnimations.clipsByPath[path] = [];
    }
    return clips;
  }).catch((error) => {
    rootAudit.embeddedAnimations.loadFailures += 1;
    rootAudit.embeddedAnimations.clipsByPath[path] = { error: String(error?.message || error) };
    if (rootAudit.notes.length < 40) rootAudit.notes.push(`Embedded animation metadata unavailable for ${path}: ${String(error?.message || error)}`);
    return [];
  });
  embeddedClipPromises.set(path, promise);
  return promise;
}

function preferredClipPattern(mode) {
  const value = String(mode || 'idle').toLowerCase().replace(/[^a-z]/g, '');
  if (/walk|boarding|pedestrian|locomotion/.test(value)) return /walk|walking|run|running|jog|locomotion|stride/i;
  if (/seated|sit|passengerseat/.test(value)) return /sit|seated|idle|stand|breath|look/i;
  if (/sweep/.test(value)) return /sweep|broom|clean|work|idle/i;
  if (/drawwater|water/.test(value)) return /draw|carry|lift|water|work|idle/i;
  if (/sellfood|sellwater|hawker|vendor|food/.test(value)) return /sell|wave|talk|gesture|serve|work|idle|stand/i;
  if (/wake|bedroom/.test(value)) return /wake|stretch|sit|stand|idle|breath/i;
  if (/clean|wipe/.test(value)) return /clean|wipe|work|idle/i;
  return /idle|stand|breath|look|talk/i;
}

function chooseEmbeddedClip(clips, mode) {
  if (!Array.isArray(clips) || !clips.length) return null;
  const pattern = preferredClipPattern(mode);
  const named = clips.find((clip) => pattern.test(String(clip.name || '')));
  if (named) return named;
  // A single embedded clip is better than a frozen pose. With several clips
  // and no meaningful names, prefer procedural motion rather than guessing.
  if (clips.length === 1) return clips[0];
  return null;
}

function detachEmbeddedAnimation(actor, { clearDesiredMode = false } = {}) {
  embeddedAnimationBudgetWaitlist.delete(actor);
  if (actor?.userData) delete actor.userData.kanoEmbeddedAnimationBudgetDeferred;
  const entry = embeddedAnimationMixers.get(actor);
  if (entry) {
    safeCall(() => entry.mixer.stopAllAction());
    safeCall(() => entry.mixer.uncacheRoot(actor));
    embeddedAnimationMixers.delete(actor);
  }
  if (actor?.userData) {
    actor.userData.kanoEmbeddedAnimationActive = false;
    delete actor.userData.kanoEmbeddedAnimationMode;
    delete actor.userData.kanoEmbeddedAnimationPendingMode;
    if (clearDesiredMode) delete actor.userData.kanoEmbeddedAnimationDesiredMode;
  }
  rootAudit.embeddedAnimations.activeActors = embeddedAnimationMixers.size;
}

function makePlayableClip(sourceClip) {
  if (!sourceClip?.clone) return null;
  const clip = sourceClip.clone();
  // Remove root-motion position tracks that would drag a scene actor away from
  // its gameplay position. Limb, torso and head animation stays intact.
  clip.tracks = clip.tracks.filter((track) => !/(hips|pelvis|armature|(^|[^a-z])root)[^/]*\.position$/i.test(track.name));
  safeCall(() => clip.resetDuration());
  return clip.tracks.length ? clip : null;
}

function activateEmbeddedAnimation(actor, path, clips, mode, requestToken) {
  if (!actor?.parent || !actor.userData || actor.userData.kanoEmbeddedAnimationRequestToken !== requestToken) return false;
  const selected = chooseEmbeddedClip(clips, mode);
  const current = embeddedAnimationMixers.get(actor);
  if (!selected) {
    if (current) detachEmbeddedAnimation(actor);
    actor.userData.kanoEmbeddedAnimationActive = false;
    actor.userData.kanoEmbeddedAnimationResolvedMode = mode;
    if (!embeddedCliplessPaths.has(path) && clips.length > 1 && rootAudit.notes.length < 40) {
      rootAudit.notes.push(`No embedded clip matched the ${mode} state for ${path}; procedural pose retained.`);
    }
    return false;
  }

  const clipName = selected.name || '(unnamed clip)';
  if (current && current.path === path && current.clipName === clipName) {
    if (current.mode !== mode) rootAudit.embeddedAnimations.modeTransitions += 1;
    current.mode = mode;
    actor.userData.kanoEmbeddedAnimationMode = mode;
    actor.userData.kanoEmbeddedAnimationResolvedMode = mode;
    actor.userData.kanoEmbeddedAnimationActive = true;
    delete actor.userData.kanoEmbeddedAnimationPendingMode;
    return true;
  }

  if (current && current.path !== path) detachEmbeddedAnimation(actor);
  let entry = embeddedAnimationMixers.get(actor);
  if (!entry) {
    const limit = isMobile() ? MAX_EMBEDDED_MIXERS_MOBILE : MAX_EMBEDDED_MIXERS_DESKTOP;
    if (embeddedAnimationMixers.size >= limit) {
      actor.userData.kanoEmbeddedAnimationActive = false;
      actor.userData.kanoEmbeddedAnimationBudgetDeferred = true;
      delete actor.userData.kanoEmbeddedAnimationResolvedMode;
      delete actor.userData.kanoEmbeddedAnimationPendingMode;
      embeddedAnimationBudgetWaitlist.add(actor);
      rootAudit.embeddedAnimations.budgetSkips += 1;
      rootAudit.embeddedAnimations.budgetWaitlist = embeddedAnimationBudgetWaitlist.size;
      return false;
    }
    const mixer = new THREE.AnimationMixer(actor);
    entry = { mixer, action: null, outgoingAction: null, outgoingUntil: 0, mode: '', path, clipName: '', actions: new Map() };
    embeddedAnimationMixers.set(actor, entry);
  }

  const actionKey = `${clipName}|${Number(selected.duration || 0).toFixed(4)}`;
  let nextAction = entry.actions.get(actionKey);
  if (!nextAction) {
    const clip = makePlayableClip(selected);
    if (!clip) {
      actor.userData.kanoEmbeddedAnimationActive = false;
      actor.userData.kanoEmbeddedAnimationResolvedMode = mode;
      delete actor.userData.kanoEmbeddedAnimationPendingMode;
      return false;
    }
    nextAction = entry.mixer.clipAction(clip);
    nextAction.enabled = true;
    nextAction.setLoop(THREE.LoopRepeat, Infinity);
    nextAction.clampWhenFinished = false;
    entry.actions.set(actionKey, nextAction);
  }

  const previousAction = entry.action;
  if (previousAction && previousAction !== nextAction) {
    if (entry.outgoingAction && entry.outgoingAction !== previousAction) safeCall(() => entry.outgoingAction.stop());
    nextAction.reset();
    nextAction.enabled = true;
    nextAction.setEffectiveWeight(1);
    nextAction.play();
    nextAction.crossFadeFrom(previousAction, 0.22, false);
    entry.outgoingAction = previousAction;
    entry.outgoingUntil = nowMs() + 240;
    rootAudit.embeddedAnimations.crossfades += 1;
    rootAudit.embeddedAnimations.modeTransitions += 1;
  } else {
    nextAction.reset();
    nextAction.enabled = true;
    nextAction.setEffectiveWeight(1);
    nextAction.play();
  }

  embeddedAnimationBudgetWaitlist.delete(actor);
  delete actor.userData.kanoEmbeddedAnimationBudgetDeferred;
  entry.action = nextAction;
  entry.path = path;
  entry.mode = mode;
  entry.clipName = clipName;
  actor.userData.kanoEmbeddedAnimationActive = true;
  actor.userData.kanoEmbeddedAnimationMode = mode;
  actor.userData.kanoEmbeddedAnimationResolvedMode = mode;
  delete actor.userData.kanoEmbeddedAnimationPendingMode;
  rootAudit.embeddedAnimations.activeActors = embeddedAnimationMixers.size;
  return true;
}

function requestEmbeddedAnimation(actor, mode = 'idle') {
  if (!actor?.isObject3D || !actor.userData) return;
  const targetMode = String(mode || 'idle');
  const path = getModelPath(actor);
  const current = embeddedAnimationMixers.get(actor);
  if (current && current.mode === targetMode && current.path === path) return;
  if (actor.userData.kanoEmbeddedAnimationDesiredMode === targetMode &&
      (actor.userData.kanoEmbeddedAnimationPendingMode === targetMode || actor.userData.kanoEmbeddedAnimationResolvedMode === targetMode)) return;

  actor.userData.kanoEmbeddedAnimationDesiredMode = targetMode;
  actor.userData.kanoEmbeddedAnimationAttempted = true;
  if (!path) {
    if (current) detachEmbeddedAnimation(actor);
    actor.userData.kanoEmbeddedAnimationActive = false;
    actor.userData.kanoEmbeddedAnimationResolvedMode = targetMode;
    return;
  }
  const limit = isMobile() ? MAX_EMBEDDED_MIXERS_MOBILE : MAX_EMBEDDED_MIXERS_DESKTOP;
  if (!current && embeddedAnimationMixers.size >= limit) {
    actor.userData.kanoEmbeddedAnimationBudgetDeferred = true;
    delete actor.userData.kanoEmbeddedAnimationResolvedMode;
    embeddedAnimationBudgetWaitlist.add(actor);
    rootAudit.embeddedAnimations.budgetSkips += 1;
    rootAudit.embeddedAnimations.budgetWaitlist = embeddedAnimationBudgetWaitlist.size;
    return;
  }

  const requestToken = (actor.userData.kanoEmbeddedAnimationRequestToken || 0) + 1;
  actor.userData.kanoEmbeddedAnimationRequestToken = requestToken;
  actor.userData.kanoEmbeddedAnimationPendingMode = targetMode;
  embeddedClipsForPath(path).then((clips) => {
    activateEmbeddedAnimation(actor, path, clips, targetMode, requestToken);
  }).catch((error) => {
    actor.userData.kanoEmbeddedAnimationActive = false;
    actor.userData.kanoEmbeddedAnimationResolvedMode = targetMode;
    delete actor.userData.kanoEmbeddedAnimationPendingMode;
    if (rootAudit.notes.length < 40) rootAudit.notes.push(`Animation state ${targetMode} failed for ${path}: ${String(error?.message || error)}`);
  });
}

function updateEmbeddedAnimations(renderer, dt) {
  // Iterating the Map directly avoids allocating a new entries array each frame.
  for (const [actor, entry] of embeddedAnimationMixers) {
    if (!actor?.parent) {
      detachEmbeddedAnimation(actor);
      continue;
    }
    let top = actor;
    let ancestryVisible = actor.visible !== false;
    while (top.parent) {
      top = top.parent;
      if (top.visible === false) ancestryVisible = false;
    }
    if (renderer?.scene && top !== renderer.scene) continue;
    // Object3D.visible is not inherited by reading only the leaf actor. A
    // hidden scene parent must pause its child mixers as well.
    if (ancestryVisible) safeCall(() => entry.mixer.update(clamp(dt, 0, 0.05)));
    if (entry.outgoingAction && nowMs() >= entry.outgoingUntil) {
      const old = entry.outgoingAction;
      entry.outgoingAction = null;
      entry.outgoingUntil = 0;
      if (old !== entry.action) safeCall(() => old.stop());
    }
  }
  const limit = isMobile() ? MAX_EMBEDDED_MIXERS_MOBILE : MAX_EMBEDDED_MIXERS_DESKTOP;
  if (embeddedAnimationMixers.size < limit && embeddedAnimationBudgetWaitlist.size) {
    for (const actor of embeddedAnimationBudgetWaitlist) {
      if (!actor?.parent || !actor.userData) {
        embeddedAnimationBudgetWaitlist.delete(actor);
        continue;
      }
      const mode = String(actor.userData.kanoEmbeddedAnimationDesiredMode || 'idle');
      embeddedAnimationBudgetWaitlist.delete(actor);
      delete actor.userData.kanoEmbeddedAnimationBudgetDeferred;
      requestEmbeddedAnimation(actor, mode);
      if (embeddedAnimationMixers.size >= limit) break;
    }
  }
  rootAudit.embeddedAnimations.activeActors = embeddedAnimationMixers.size;
  rootAudit.embeddedAnimations.budgetWaitlist = embeddedAnimationBudgetWaitlist.size;
}

function hidePrimitiveLifeBody(rig) {
  for (const node of [rig?.torso, rig?.head, rig?.cap]) if (node) node.visible = false;
  const prop = rig?.prop;
  const belongsToProp = (node) => { let p = node; while (p) { if (p === prop) return true; p = p.parent; } return false; };
  for (const pivot of [...(rig?.armPivots || []), ...(rig?.legPivots || [])]) {
    pivot?.traverse?.((node) => {
      if ((node.isMesh || node.isSkinnedMesh) && !belongsToProp(node)) node.visible = false;
    });
  }
}
function keysForCharacter(input, role = 'pedestrian') {
  const values = [input?.gender, input?.sex, input?.name, input?.type, input?.kind, input?.category, input?.archetype]
    .filter((v) => v != null).join(' ').toLowerCase();
  if (/woman|female|girl|hijab|wife|mother/.test(values)) return ['passengerWoman', 'pedestrianWoman', 'passenger', 'pedestrian', 'passengerMan'];
  if (/man|male|boy|father|husband/.test(values)) return ['passengerMan', 'pedestrian', 'passenger', 'passengerWoman', 'pedestrianWoman'];
  return role === 'life'
    ? ['pedestrian', 'passengerMan', 'passenger', 'pedestrianWoman', 'passengerWoman']
    : ['passenger', 'pedestrian', 'passengerMan', 'passengerWoman', 'pedestrianWoman'];
}
function hideWalkPlaceholder(rig) {
  if (!rig) return;
  for (const key of ['torso', 'head', 'cap']) if (rig[key]) rig[key].visible = false;
  const pivotSet = [...(rig.legs || []), ...(rig.armPivots || []), ...(rig.arms || [])];
  for (const pivot of pivotSet) pivot?.traverse?.((node) => { if (node.isMesh || node.isSkinnedMesh) node.visible = false; });
}
function attemptCharacterAttach(owner, rig, character, role = 'pedestrian') {
  if (!owner?.renderer || !rig?.root || rig.kanoImportedActor) return false;
  const manager = getManager(owner.renderer);
  if (!manager) return false;
  const keys = keysForCharacter(character, role);
  rig.__kanoCharacterBadKeys ||= new Set();
  for (const key of keys) {
    if (!modelAvailable(manager, key)) continue;
    const actor = modelInstance(manager, key);
    if (!actor || !hasBodyMeshes(actor)) {
      rig.__kanoCharacterBadKeys.add(key);
      continue;
    }
    actor.name = `KanoImported${role === 'life' ? 'LifeActor' : 'Passenger'}:${key}`;
    actor.position.set(0, 0, 0);
    const bounds = getModelBounds(actor);
    if (bounds && bounds.height > 3.2) actor.scale.multiplyScalar(1.6 / bounds.height);
    actor.traverse((node) => {
      if (node.isMesh) { node.castShadow = false; node.receiveShadow = false; }
      if (node.isSkinnedMesh) node.frustumCulled = false;
    });
    actor.userData.kanoRootCausePose = prepareBonePose(actor);
    actor.userData.kanoRootCauseBaseY = actor.position.y;
    rig.root.add(actor);
    rig.kanoImportedActor = actor;
    rig.kanoImportedModelKey = key;
    requestEmbeddedAnimation(actor, role === 'life' ? (rig.action || 'idle') : 'walk');
    if (role === 'life') hidePrimitiveLifeBody(rig); else hideWalkPlaceholder(rig);
    rootAudit[role === 'life' ? 'lifeModelsAttached' : 'passengerModelsAttached'] += 1;
    return true;
  }
  return false;
}
function requestCharacterAttach(owner, rig, record, role) {
  if (!owner?.renderer || !rig?.root || rig.kanoImportedActor) return;
  if (attemptCharacterAttach(owner, rig, record, role)) return;
  const manager = getManager(owner.renderer);
  if (!manager) return;
  const keys = keysForCharacter(record, role);
  const attempted = rig.__kanoCharacterKeysTried ||= new Set();
  const pendingKey = keys.find((key) => !attempted.has(key) && !rig.__kanoCharacterBadKeys?.has(key));
  if (!pendingKey) { rig.__kanoCharacterExhausted = true; return; }
  let managerPending = pendingLoads.get(manager);
  if (!managerPending) { managerPending = new Set(); pendingLoads.set(manager, managerPending); }
  if (managerPending.has(pendingKey)) return;
  // Request only one preferred category at a time. The existing ModelManager
  // remains responsible for renamed paths; later attempts use compatible fallbacks.
  if (typeof manager.load !== 'function') return;
  attempted.add(pendingKey);
  managerPending.add(pendingKey);
  Promise.resolve(manager.load(pendingKey)).then(() => {
    managerPending.delete(pendingKey);
    if (!owner.disposed && rig.root && !rig.kanoImportedActor) {
      const attached = attemptCharacterAttach(owner, rig, record, role);
      if (!attached && !rig.__kanoCharacterExhausted) requestCharacterAttach(owner, rig, record, role);
    }
  }).catch((error) => {
    managerPending.delete(pendingKey);
    rootAudit.notes.push(`Character category ${pendingKey} did not load: ${String(error?.message || error)}`);
    if (rootAudit.notes.length > 30) rootAudit.notes.shift();
    if (!rig.__kanoCharacterExhausted && !owner.disposed) requestCharacterAttach(owner, rig, record, role);
  });
}
if (KanoSceneUpgrade?.prototype) {
  rootAudit.patches.realPassengerModels = markPatched(KanoSceneUpgrade.prototype, 'startPassengerWalk', (original) => function (kind, zone, passenger, ...rest) {
    const before = this.walkingPassengers?.length || 0;
    const result = original.call(this, kind, zone, passenger, ...rest);
    const item = this.walkingPassengers?.length > before ? this.walkingPassengers[this.walkingPassengers.length - 1] : null;
    if (item?.rig) requestCharacterAttach(this, item.rig, passenger, 'pedestrian');
    return result;
  });
  rootAudit.patches.realMorningLifeModels = markPatched(KanoSceneUpgrade.prototype, 'update', (original) => function (dt, state, ...rest) {
    if (typeof window !== 'undefined') window.__KANO_LIFE_SCENE_UPGRADE__ = this;
    const result = original.call(this, dt, state, ...rest);
    this.__kanoLifeModelScanClock = (this.__kanoLifeModelScanClock || 0) + (Number(dt) || 0);
    if (this.__kanoLifeModelScanClock >= 0.65) {
      this.__kanoLifeModelScanClock = 0;
      (this.lifeRigs || []).forEach((rig) => {
        if (!rig.kanoImportedActor) requestCharacterAttach(this, rig, { type: rig.action }, 'life');
      });
    }
    for (const item of this.walkingPassengers || []) {
      const actor = item.rig?.kanoImportedActor;
      if (actor && !actor.userData?.kanoEmbeddedAnimationActive) poseActor(actor, Number(item.elapsed) || 0, 'walk');
    }
    for (const rig of this.lifeRigs || []) {
      const actor = rig.kanoImportedActor;
      if (!actor) continue;
      const actionMode = String(rig.action || 'idle');
      if (actor.userData?.kanoEmbeddedAnimationDesiredMode !== actionMode) requestEmbeddedAnimation(actor, actionMode);
      if (!actor.userData?.kanoEmbeddedAnimationActive) poseActor(actor, (this.elapsed || 0) + (rig.phase || 0), actionMode);
    }
    return result;
  });
}

// Keep real passenger models seated in the keke after their roadside boarding
// walk finishes. The real game passenger list remains the authority; active
// boarding walkers are subtracted until their approach animation has completed.
function findPassengerSeatBase(player) {
  const candidateNodes = [];
  player?.traverse?.((node) => {
    if (!node.isMesh) return;
    let ancestor = node;
    while (ancestor && ancestor !== player) {
      if (ancestor.userData?.kanoRootCauseSeatedPassengerGroup || /KanoLifeSeatedPassenger|KanoImportedPassenger|KanoImportedLifeActor|KanoImportedPureWaterSeller/i.test(ancestor.name || '')) return;
      ancestor = ancestor.parent;
    }
    const name = `${node.name || ''} ${node.parent?.name || ''}`;
    if (/driver.?seat|driver.?bench/i.test(name)) return;
    if (/passenger.?seat|rear.?seat|bench|cushion|seat/i.test(name)) candidateNodes.push(node);
  });
  candidateNodes.sort((a, b) => {
    const score = (node) => /passenger|rear|bench|cushion/i.test(`${node.name || ''} ${node.parent?.name || ''}`) ? 0 : 1;
    return score(a) - score(b);
  });
  for (const node of candidateNodes) {
    const box = new THREE.Box3().setFromObject(node);
    if (box.isEmpty()) continue;
    const center = box.getCenter(new THREE.Vector3());
    player.worldToLocal(center);
    return { position: new THREE.Vector3(center.x, center.y + 0.1, center.z), width: box.getSize(new THREE.Vector3()).x };
  }
  // Fallback is deliberately inside the keke footprint, not on the road.
  return { position: new THREE.Vector3(0, 0.42, -0.16), width: 0.52 };
}
function syncSeatedPassengerModels(renderer, game) {
  const player = renderer?.player;
  const passengerList = Array.isArray(game?.s?.passengers) ? game.s.passengers : [];
  if (!player?.isObject3D) return;
  const sceneUpgrade = globalThis.window?.__KANO_LIFE_SCENE_UPGRADE__;
  const activeWalkers = sceneUpgrade?.walkingPassengers || [];
  const activeBoardings = activeWalkers.filter((item) => /board|pickup|enter/i.test(String(item.kind || ''))).length;
  const activeAlightings = activeWalkers.filter((item) => /alight|drop|exit|leave/i.test(String(item.kind || ''))).length;
  const desired = Math.max(0, passengerList.length - activeBoardings + activeAlightings);
  let group = renderer.__kanoSeatedPassengerGroup;
  if (group && group.parent !== player) {
    group.parent?.remove(group);
    group.clear();
    group = null;
    renderer.__kanoSeatedPassengerGroup = null;
  }
  if (!group && desired > 0) {
    group = new THREE.Group();
    group.name = 'KanoLifeRealSeatedPassengers';
    group.userData.kanoRootCauseSeatedPassengerGroup = true;
    player.add(group);
    renderer.__kanoSeatedPassengerGroup = group;
  }
  const signature = passengerList.slice(0, desired).map((passenger, index) => {
    if (!passenger || typeof passenger !== 'object') return String(passenger ?? index);
    return String(passenger.id ?? passenger.name ?? passenger.gender ?? passenger.type ?? passenger.kind ?? index);
  }).join('|');
  const currentSignature = renderer.__kanoSeatedPassengerSignature || '';
  const keepSeatDuringAlighting = activeAlightings > 0 && group && group.children.length === desired;
  const structureChanged = group && ((currentSignature !== signature && !keepSeatDuringAlighting) || Number(renderer.__kanoSeatedPassengerDesired) !== desired);
  const retryMissingSeats = group && group.children.length !== desired && nowMs() - (renderer.__kanoSeatBuildAt || 0) > 700;
  if (group && (structureChanged || retryMissingSeats)) {
    group.clear();
    renderer.__kanoSeatedPassengerSignature = signature;
    renderer.__kanoSeatedPassengerDesired = desired;
    renderer.__kanoSeatBuildAt = nowMs();
    const manager = getManager(renderer);
    const base = findPassengerSeatBase(player);
    const seatWidth = clamp(base.width || 0.5, 0.32, 0.9);
    const spacing = desired > 1 ? Math.min(0.23, seatWidth / desired) : 0;
    for (let index = 0; index < desired; index += 1) {
      const passenger = passengerList[index];
      const keys = keysForCharacter(passenger, 'passenger');
      let actor = null;
      let selectedKey = null;
      for (const key of keys) {
        if (!modelAvailable(manager, key)) continue;
        actor = modelInstance(manager, key);
        if (actor && hasBodyMeshes(actor)) { selectedKey = key; break; }
        actor = null;
      }
      if (!actor) continue;
      actor.name = `KanoLifeSeatedPassenger${index + 1}:${selectedKey}`;
      actor.scale.multiplyScalar(0.64);
      const seatedTargetScale = actor.scale.clone();
      const seatTargetY = base.position.y;
      actor.scale.copy(seatedTargetScale).multiplyScalar(1.14);
      actor.position.set(base.position.x + (index - (desired - 1) / 2) * spacing, seatTargetY + 0.085, base.position.z);
      actor.userData.kanoSeatEntryTransition = {
        startedAt: nowMs(), durationMs: 360,
        startScale: actor.scale.clone(), targetScale: seatedTargetScale,
        targetY: seatTargetY,
      };
      actor.traverse((node) => {
        if (node.isMesh) { node.castShadow = false; node.receiveShadow = false; }
        if (node.isSkinnedMesh) node.frustumCulled = false;
      });
      actor.userData.kanoRootCauseSeatBaseY = seatTargetY;
      actor.userData.kanoRootCauseSeatPose = prepareBonePose(actor);
      group.add(actor);
      requestEmbeddedAnimation(actor, 'seated');
      rootAudit.seatedPassengerModels += 1;
    }
  }
  const now = nowMs();
  const time = now / 1000;
  for (let index = 0; index < (group?.children?.length || 0); index += 1) {
    const actor = group.children[index];
    const entryTransition = actor.userData?.kanoSeatEntryTransition;
    if (entryTransition) {
      const linear = clamp((now - entryTransition.startedAt) / entryTransition.durationMs, 0, 1);
      const eased = linear * linear * (3 - 2 * linear);
      actor.scale.copy(entryTransition.startScale).lerp(entryTransition.targetScale, eased);
      actor.position.y = entryTransition.targetY + (1 - eased) * 0.085;
      if (linear >= 1) delete actor.userData.kanoSeatEntryTransition;
    } else {
      actor.position.y = actor.userData.kanoRootCauseSeatBaseY + Math.sin(time * 1.6 + index * 1.2) * 0.006;
    }
    if (!actor.userData?.kanoEmbeddedAnimationActive && actor.userData.kanoRootCauseSeatPose?.head?.length) {
      for (const bone of actor.userData.kanoRootCauseSeatPose.head) bone.node.rotation.z = bone.rest.z + Math.sin(time * 0.9 + index) * 0.025;
    }
  }
}

// ---------------------------------------------------------------------------
// 4. Replace the pure-water hawker's primitive body/head with an existing
// character GLB when that category is already present or can be loaded.
// Preserve the table, sachets, proximity, horn, purchase, wallet and effects.
// ---------------------------------------------------------------------------
function containsNode(root, candidate) {
  let node = candidate;
  while (node) { if (node === root) return true; node = node.parent; }
  return false;
}
function installHawkerModel(hawker) {
  if (!hawker || hawker.__kanoRealVendorInstalled) return false;
  const root = hawker.root || hawker.vendorRoot || hawker.group || hawker.__kanoBuiltVendorRoot || null;
  if (!root?.isObject3D) return false;
  const manager = getManager(hawker.renderer);
  if (!manager) return false;
  const key = ['pedestrian', 'passengerMan', 'passenger', 'passengerWoman'].find((candidate) => modelAvailable(manager, candidate));
  if (!key) return false;
  const actor = modelInstance(manager, key);
  if (!actor || !hasBodyMeshes(actor)) return false;
  actor.name = `KanoImportedPureWaterSeller:${key}`;
  actor.position.set(0, 0, -0.42);
  const bounds = getModelBounds(actor);
  if (bounds && bounds.height > 3.2) actor.scale.multiplyScalar(1.6 / bounds.height);
  actor.traverse((node) => {
    if (node.isMesh) { node.castShadow = false; node.receiveShadow = false; }
    if (node.isSkinnedMesh) node.frustumCulled = false;
  });
  const body = hawker.__kanoHawkerBody || root.children?.[1];
  const head = hawker.__kanoHawkerHead || root.children?.[2];
  if (body) body.visible = false;
  if (head) head.visible = false;
  actor.userData.kanoRootCausePose = prepareBonePose(actor);
  actor.userData.kanoRootCauseBaseY = actor.position.y;
  root.add(actor);
  requestEmbeddedAnimation(actor, 'sellWater');
  hawker.__kanoImportedVendorActor = actor;
  hawker.__kanoRealVendorInstalled = true;
  rootAudit.waterVendor = { status: 'existing-character-glb-attached', modelKey: key, modelPath: getModelPath(actor), animatedBones: actor.userData.kanoRootCausePose.all.length };
  return true;
}
function requestHawkerModel(hawker) {
  if (!hawker || hawker.__kanoRealVendorInstalled || hawker.__kanoVendorCategoryExhausted) return;
  if (installHawkerModel(hawker)) return;
  const manager = getManager(hawker.renderer);
  if (!manager || typeof manager.load !== 'function') return;
  const keys = ['pedestrian', 'passengerMan', 'passenger', 'passengerWoman'];
  const tried = hawker.__kanoVendorKeysTried ||= new Set();
  const key = keys.find((candidate) => !tried.has(candidate));
  if (!key) { hawker.__kanoVendorCategoryExhausted = true; rootAudit.waterVendor = { status: 'no-compatible-character-model-loaded', attempted: [...tried] }; return; }
  let pending = pendingLoads.get(manager);
  if (!pending) { pending = new Set(); pendingLoads.set(manager, pending); }
  if (pending.has(key)) return;
  tried.add(key);
  pending.add(key);
  Promise.resolve(manager.load(key)).then(() => {
    pending.delete(key);
    if (installHawkerModel(hawker)) return;
    requestHawkerModel(hawker);
  }).catch((error) => {
    pending.delete(key);
    rootAudit.notes.push(`Water-seller model category ${key} did not load: ${String(error?.message || error)}`);
    requestHawkerModel(hawker);
  });
}

if (PureWaterHawker?.prototype) {
  rootAudit.patches.waterVendorBuild = markPatched(PureWaterHawker.prototype, 'buildVendor', (original) => function (...args) {
    const root = original.apply(this, args);
    if (root?.isObject3D) {
      root.userData ||= {};
      root.userData.kanoWaterVendorRoot = true;
      this.__kanoBuiltVendorRoot = root;
      this.__kanoHawkerBody = root.children?.[1] || null;
      this.__kanoHawkerHead = root.children?.[2] || null;
    }
    return root;
  });
  rootAudit.patches.waterVendorAnimation = markPatched(PureWaterHawker.prototype, 'update', (original) => function (dt, ...args) {
    const result = original.call(this, dt, ...args);
    if (!this.__kanoRealVendorInstalled) installHawkerModel(this);
    if (!this.__kanoRealVendorInstalled) requestHawkerModel(this);
    const actor = this.__kanoImportedVendorActor;
    if (actor) {
      this.__kanoSellerAnimTime = (this.__kanoSellerAnimTime || 0) + clamp(dt, 0, 0.1);
      if (!actor.userData?.kanoEmbeddedAnimationActive) poseActor(actor, this.__kanoSellerAnimTime, 'sellWater');
    } else if (rootAudit.waterVendor.status === 'waiting-for-vendor') {
      rootAudit.waterVendor = { status: 'hawker-created; attempting to activate an existing character GLB' };
    }
    return result;
  });
}

// ---------------------------------------------------------------------------
// 5. Discover a real goat from the generated GLB inventory and replace the
// procedural goat actor in the existing crossing event. Never add a fake model
// if no suitable existing asset is found; report that truthfully instead.
// ---------------------------------------------------------------------------
let goatTemplatePromise = null;
let goatTemplate = null;
let goatRetryAt = 0;
let goatAnimations = [];
const goatMixers = new Set();
function encodedAssetUrl(path) {
  const clean = String(path || '').replace(/^\/+/, '').replace(/^assets\/models\//, '');
  return `/assets/models/${clean.split('/').map((part) => encodeURIComponent(part)).join('/')}`;
}
async function discoverGoatAsset() {
  const auditUrl = '/assets/models/model-catalog-audit.generated.json';
  const response = await fetch(auditUrl, { cache: 'force-cache' });
  if (!response.ok) throw new Error(`GLB inventory request failed (${response.status})`);
  const report = await response.json();
  const files = Array.isArray(report.files) ? report.files : Array.isArray(report.inventory) ? report.inventory : [];
  const hits = files.map((file) => {
    const hints = typeof file.hints === 'string' ? file.hints : JSON.stringify(file.hints || {});
    return { file, haystack: `${file.path || ''} ${file.name || ''} ${hints}`.toLowerCase() };
  }).filter(({ haystack }) => /\bgoat\b|caprine|dwarf[ _-]?goat|kid[ _-]?goat/i.test(haystack));
  if (!hits.length) throw new Error(`No goat-named existing GLB was identified in ${auditUrl}`);
  hits.sort((a, b) => {
    const score = (text) => (/goat/i.test(text) ? 0 : /caprine/i.test(text) ? 1 : 2);
    return score(a.haystack) - score(b.haystack);
  });
  return hits[0].file.path || hits[0].file.name;
}
async function loadGoatTemplate() {
  if (goatTemplate) return goatTemplate;
  if (goatTemplatePromise) return goatTemplatePromise;
  goatTemplatePromise = (async () => {
    const path = await discoverGoatAsset();
    const gltf = await new GLTFLoader().loadAsync(encodedAssetUrl(path));
    if (!gltf?.scene) throw new Error('Goat GLB has no default scene.');
    const template = gltf.scene;
    const bounds = getModelBounds(template);
    if (!bounds || bounds.height < 0.05) throw new Error('Goat GLB has unusable bounds.');
    const targetHeight = 0.72;
    template.scale.multiplyScalar(targetHeight / bounds.height);
    template.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(template);
    if (!box.isEmpty()) {
      const center = box.getCenter(new THREE.Vector3());
      template.position.x -= center.x;
      template.position.z -= center.z;
      template.position.y -= box.min.y;
    }
    template.traverse((node) => {
      if (node.isMesh) { node.castShadow = false; node.receiveShadow = false; }
      if (node.isSkinnedMesh) node.frustumCulled = false;
    });
    goatAnimations = gltf.animations || [];
    goatTemplate = template;
    rootAudit.goat = { status: 'loaded-existing-goat-glb', modelPath: path, animationClips: goatAnimations.map((clip) => clip.name), height: targetHeight };
    return template;
  })().catch((error) => {
    rootAudit.goat = { status: 'existing-goat-glb-not-available', error: String(error?.message || error) };
    goatTemplatePromise = null;
    goatRetryAt = nowMs() + 12000;
    throw error;
  });
  return goatTemplatePromise;
}
function releasePlaceholderResources(actor) {
  const resources = actor?.userData?.kanoRepairResources;
  if (!resources) return;
  for (const geometry of new Set(resources.geometries || [])) safeCall(() => geometry.dispose());
  for (const material of new Set(resources.materials || [])) safeCall(() => material.dispose());
  resources.geometries = [];
  resources.materials = [];
}
function installGoatModel(actor) {
  if (!goatTemplate || !actor?.isObject3D || actor.userData?.kanoRootCauseRealGoat) return false;
  const clone = cloneSkeleton(goatTemplate);
  clone.name = 'KanoExistingGoatGLB';
  // The source placeholder is owned by the existing event layer. Dispose only
  // its marked resources; do not touch cached GLB geometry/materials.
  for (const child of [...actor.children]) actor.remove(child);
  releasePlaceholderResources(actor);
  const rig = actor.userData.kanoGoatRig;
  if (rig) rig.legs = [];
  actor.add(clone);
  actor.userData.kanoRootCauseRealGoat = true;
  actor.userData.kanoRootCauseGoatPath = rootAudit.goat.modelPath;
  const mixer = goatAnimations.length ? new THREE.AnimationMixer(clone) : null;
  if (mixer) {
    const preferred = goatAnimations.find((clip) => /walk|run|trot|goat|move/i.test(clip.name)) || goatAnimations[0];
    safeCall(() => mixer.clipAction(preferred).reset().play());
    actor.userData.kanoRootCauseGoatMixer = mixer;
    goatMixers.add(mixer);
  }
  rootAudit.goat.installedActors = (rootAudit.goat.installedActors || 0) + 1;
  return true;
}
const goatActorScanCache = new WeakMap();
function goatActorsFor(renderer) {
  if (!renderer || typeof renderer !== 'object') return [];
  const root = renderer.world || renderer.scene;
  const now = nowMs();
  const scanInterval = isMobile() ? 300 : 180;
  const cached = goatActorScanCache.get(renderer);
  if (cached && cached.root === root && now - cached.scannedAt < scanInterval) {
    rootAudit.performance.goatSceneScanCacheHits += 1;
    return cached.actors;
  }
  const candidates = [];
  root?.traverse?.((object) => {
    if (object.userData?.kanoEvent?.type !== 'goatCrossing') return;
    for (const actor of object.userData.kanoEvent.actors || []) {
      if (actor?.isObject3D && !candidates.includes(actor)) candidates.push(actor);
    }
  });
  goatActorScanCache.set(renderer, { root, scannedAt: now, actors: candidates });
  rootAudit.performance.goatSceneScans += 1;
  return candidates;
}
function updateRealGoats(renderer, dt) {
  const actors = goatActorsFor(renderer);
  if (actors.length) {
    if (!goatTemplatePromise && !goatTemplate && nowMs() >= goatRetryAt) loadGoatTemplate().then(() => {
      for (const actor of actors) installGoatModel(actor);
    }).catch(() => {});
    if (goatTemplate) actors.forEach((actor) => installGoatModel(actor));
  }
  for (const mixer of [...goatMixers]) {
    const rootObject = safeCall(() => mixer.getRoot(), null);
    let top = rootObject;
    while (top?.parent) top = top.parent;
    if (!rootObject || top !== renderer.scene) {
      safeCall(() => mixer.stopAllAction());
      goatMixers.delete(mixer);
      continue;
    }
    safeCall(() => mixer.update(clamp(dt, 0, 0.05)));
  }
}

// ---------------------------------------------------------------------------
// 6. Collision/pothole feedback. Numeric damage is still applied exactly once by
// Game's original methods. This layer only adds visual impact particles, chassis
// reaction, and a material wear tint derived from the existing health values.
// ---------------------------------------------------------------------------
const materialBase = new WeakMap();
function bodyMaterialCandidates(player) {
  const named = [];
  const fallback = [];
  player?.traverse?.((node) => {
    if (!node.isMesh) return;
    let ancestor = node;
    while (ancestor && ancestor !== player) {
      if (ancestor.userData?.kanoRootCauseSeatedPassengerGroup || /KanoLifeSeatedPassenger|KanoImportedPassenger|KanoImportedLifeActor|KanoImportedPureWaterSeller/i.test(ancestor.name || '')) return;
      ancestor = ancestor.parent;
    }
    const name = `${node.name || ''} ${node.parent?.name || ''}`;
    const excluded = /glass|window|windshield|light|lamp|wheel|tyre|tire|seat|driver|interior|mirror|transparent/i.test(name);
    for (const material of meshMaterials(node)) {
      if (material.transparent || material.opacity < 0.85 || !material.color || material.emissiveMap) continue;
      if (excluded) continue;
      fallback.push(material);
      if (/body|panel|shell|door|fender|bumper|bonnet|hood|cover|cabin|fairing|chassis|frame/i.test(name)) named.push(material);
    }
  });
  return [...new Set(named.length ? named : fallback)];
}
function applyDamageAppearance(renderer, game) {
  const player = renderer?.player;
  const state = game?.s;
  if (!player?.isObject3D || !state) return;
  const body = clamp(state.condition ?? 100, 0, 100);
  const engine = clamp(state.engine ?? 100, 0, 100);
  const tyres = clamp(state.tyres ?? 100, 0, 100);
  const key = `${player.uuid}:${body.toFixed(1)}:${engine.toFixed(1)}:${tyres.toFixed(1)}`;
  if (renderer.__kanoRootCauseLastDamageKey === key) return;
  renderer.__kanoRootCauseLastDamageKey = key;
  const wear = clamp((100 - body) / 100 * 0.72 + (100 - engine) / 100 * 0.16 + (100 - tyres) / 100 * 0.12, 0, 1);
  const materials = bodyMaterialCandidates(player);
  let changed = 0;
  for (const material of materials) {
    if (!materialBase.has(material)) materialBase.set(material, {
      color: material.color?.clone?.() || null,
      roughness: material.roughness,
      metalness: material.metalness,
    });
    const base = materialBase.get(material);
    if (base.color && material.color) {
      const factor = 1 - wear * 0.34;
      material.color.copy(base.color).multiplyScalar(factor);
    }
    if (Number.isFinite(base.roughness)) material.roughness = clamp(base.roughness + wear * 0.32, 0, 1);
    material.needsUpdate = true;
    changed += 1;
  }
  rootAudit.damageVisual = { bodyMaterialsTinted: changed, wear: Number(wear.toFixed(3)), condition: body, engine, tyres, lastUpdatedAt: new Date().toISOString() };
}
function pushImpact(game, type, args, beforeSpeed) {
  const state = game?.s || {};
  const speed = Math.max(beforeSpeed || 0, Number(state.speed) || 0);
  const depth = Math.abs(Number(args?.[0]) || 0);
  const severity = clamp(type === 'pothole' ? 0.25 + speed / 95 + Math.min(depth * 0.05, 0.2) : 0.23 + speed / 85, 0.25, 1);
  const item = { id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, type, severity, speed: Number(speed.toFixed(1)), at: nowMs() };
  if (typeof window !== 'undefined') {
    window.__KANO_LIFE_IMPACT_QUEUE__ ||= [];
    window.__KANO_LIFE_IMPACT_QUEUE__.push(item);
    if (window.__KANO_LIFE_IMPACT_QUEUE__.length > 8) window.__KANO_LIFE_IMPACT_QUEUE__.shift();
    rootAudit.recentImpacts.push(item);
    if (rootAudit.recentImpacts.length > 12) rootAudit.recentImpacts.shift();
  }
  return item;
}
if (Game?.prototype) {
  for (const [method, type] of [['hit', 'traffic'], ['hitPothole', 'pothole']]) {
    rootAudit.patches[`visualImpact:${method}`] = markPatched(Game.prototype, method, (original) => function (...args) {
      const speedBefore = Number(this.s?.speed) || Number(this.s?.signedSpeed) || 0;
      const result = original.apply(this, args);
      safeCall(() => pushImpact(this, type, args, speedBefore));
      return result;
    });
  }
}
const activeEffects = new WeakMap();
function spawnImpactBurst(renderer, event) {
  if (!renderer?.scene?.isObject3D || !renderer.player?.isObject3D) return;
  const scene = renderer.scene;
  const player = renderer.player;
  player.updateMatrixWorld(true);
  const position = player.getWorldPosition(new THREE.Vector3());
  position.y += 0.34;
  const effects = activeEffects.get(renderer) || [];
  const geometry = renderer.__kanoRootCauseParticleGeometry || (renderer.__kanoRootCauseParticleGeometry = new THREE.IcosahedronGeometry(0.025, 0));
  const count = isMobile() ? 5 : 8;
  const color = event.type === 'pothole' ? 0xcbb18a : 0xf08a38;
  for (let i = 0; i < count; i += 1) {
    const material = new THREE.MeshBasicMaterial({ color: color + Math.floor(Math.random() * 0x202020), transparent: true, opacity: 0.9, depthWrite: false });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.copy(position);
    mesh.scale.setScalar(0.7 + Math.random() * 1.45);
    mesh.frustumCulled = false;
    scene.add(mesh);
    const side = Math.random() < 0.5 ? -1 : 1;
    effects.push({ mesh, material, age: 0, life: 0.28 + Math.random() * 0.42, vx: side * (0.45 + Math.random() * 1.7) * event.severity, vy: 0.6 + Math.random() * 1.45 * event.severity, vz: (Math.random() - 0.5) * 0.75, gravity: 2.2 });
  }
  activeEffects.set(renderer, effects);
  renderer.__kanoRootCauseLastImpact = {
    event,
    startAt: nowMs(),
    duration: event.type === 'traffic' ? 0.34 : 0.25,
    baseRotationX: player.rotation.x,
    baseRotationZ: player.rotation.z,
  };
}
function updateImpactEffects(renderer, dt) {
  const effects = activeEffects.get(renderer) || [];
  for (let i = effects.length - 1; i >= 0; i -= 1) {
    const p = effects[i];
    p.age += dt;
    if (p.age >= p.life) {
      p.mesh.parent?.remove(p.mesh);
      safeCall(() => p.material.dispose());
      effects.splice(i, 1);
      continue;
    }
    p.mesh.position.x += p.vx * dt;
    p.mesh.position.y += p.vy * dt;
    p.mesh.position.z += p.vz * dt;
    p.vy -= p.gravity * dt;
    p.vx *= Math.max(0, 1 - dt * 2.2);
    p.mesh.material.opacity = 0.9 * (1 - p.age / p.life);
  }
  activeEffects.set(renderer, effects);
  const impact = renderer.__kanoRootCauseLastImpact;
  if (impact && renderer.player) {
    const age = (nowMs() - impact.startAt) / 1000;
    if (age <= impact.duration) {
      const strength = impact.event.severity * (1 - age / impact.duration);
      const oscillation = Math.sin(age * 48);
      renderer.player.rotation.x = impact.baseRotationX + oscillation * strength * 0.045;
      const direction = impact.event.type === 'pothole' ? 1 : (impact.event.id.charCodeAt(impact.event.id.length - 1) % 2 ? 1 : -1);
      renderer.player.rotation.z = impact.baseRotationZ + oscillation * strength * 0.035 * direction;
    } else {
      renderer.player.rotation.x = impact.baseRotationX;
      renderer.player.rotation.z = impact.baseRotationZ;
      renderer.__kanoRootCauseLastImpact = null;
    }
  }
}

// ---------------------------------------------------------------------------
// 7. Hook the main world draw, process queued visual impacts, and keep a public
// audit function for precise verification on the actual running game.
// ---------------------------------------------------------------------------
if (Renderer3D?.prototype) {
  rootAudit.patches.rendererRootCauseFeedback = markPatched(Renderer3D.prototype, 'draw', (original) => function (...args) {
    if (typeof window !== 'undefined') window.__KANO_LIFE_ACTIVE_RENDERER__ = this;
    const dt = clamp(args.find((arg) => Number.isFinite(arg)) ?? 1 / 60, 0, 0.05);
    const game = globalThis.window?.__KANO_LIFE_GAME__ || null;
    safeCall(() => syncSeatedPassengerModels(this, game));
    safeCall(() => applyDamageAppearance(this, game));
    if (typeof window !== 'undefined') {
      const queue = window.__KANO_LIFE_IMPACT_QUEUE__ || [];
      while (queue.length) spawnImpactBurst(this, queue.shift());
    }
    safeCall(() => updateRealGoats(this, dt));
    safeCall(() => updateEmbeddedAnimations(this, dt));
    safeCall(() => updateImpactEffects(this, dt));
    return original.apply(this, args);
  });
}

function summarizeModelManager(renderer) {
  const manager = getManager(renderer);
  const result = { available: Boolean(manager), loadedKeys: [], poolCounts: {}, failures: [] };
  if (!manager) return result;
  if (manager.cache?.keys) result.loadedKeys = [...manager.cache.keys()];
  const pools = manager.__kanoExistingGlbPools;
  if (pools?.forEach) pools.forEach((items, key) => { result.poolCounts[key] = Array.isArray(items) ? items.length : countContainer(items); });
  if (manager.failed instanceof Set) result.failures = [...manager.failed].slice(0, 100).map((value) => String(value?.message || value));
  if (manager.failed instanceof Map) result.failures = [...manager.failed.entries()].slice(0, 100).map(([key, value]) => [String(key), String(value?.message || value || 'failed')]);
  return result;
}
function summarizePlayer(renderer, game) {
  const player = renderer?.player;
  if (!player) return { present: false };
  const bounds = getModelBounds(player);
  const wheelNodes = [];
  const bones = [];
  player.traverse?.((node) => {
    if (/wheel|tire|tyre/i.test(node.name || '') && node.children?.length < 8) wheelNodes.push(node.name || '(unnamed wheel)');
    if (node.isBone) bones.push(node.name || '(unnamed bone)');
  });
  return {
    present: true,
    name: player.name,
    modelPath: getModelPath(player),
    position: player.position.toArray().map((v) => Number(v.toFixed(3))),
    rotation: [player.rotation.x, player.rotation.y, player.rotation.z].map((v) => Number(v.toFixed(3))),
    bounds: bounds ? { width: bounds.width, height: bounds.height, depth: bounds.depth, center: bounds.center } : null,
    wheelNodes: wheelNodes.slice(0, 40),
    bones: bones.slice(0, 80),
    condition: game?.s?.condition ?? null,
    engine: game?.s?.engine ?? null,
    tyres: game?.s?.tyres ?? null,
    lastKekeFit: player.userData?.kanoRootCauseKekeFit || null,
  };
}
function buildAuditReport() {
  const renderer = globalThis.window?.__KANO_LIFE_ACTIVE_RENDERER__ || null;
  const game = globalThis.window?.__KANO_LIFE_GAME__ || null;
  return {
    ...rootAudit,
    generatedAt: new Date().toISOString(),
    userAgent: globalThis.navigator?.userAgent || null,
    mobile: isMobile(),
    renderMode: renderer?.renderer?.isWebGLRenderer ? 'webgl' : renderer?.renderer?.constructor?.name || 'unknown',
    modelManager: summarizeModelManager(renderer),
    player: summarizePlayer(renderer, game),
    sceneObjects: renderer?.scene?.children?.length ?? null,
    worldObjects: renderer?.world?.children?.length ?? null,
    recentImpacts: [...rootAudit.recentImpacts],
  };
}
if (typeof window !== 'undefined') {
  window.downloadKanoLifeRootCauseAudit = () => {
    const report = buildAuditReport();
    const blob = new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `kano-life-root-cause-audit-${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    return report;
  };
}

function installAuditPanelIfRequested() {
  if (typeof window === 'undefined' || typeof document === 'undefined') return;
  const params = new URLSearchParams(window.location.search);
  if (params.get('rootCauseAudit') !== '1' && params.get('assetAudit') !== '1') return;
  if (document.getElementById('kano-root-cause-audit-panel')) return;
  const panel = document.createElement('aside');
  panel.id = 'kano-root-cause-audit-panel';
  panel.setAttribute('aria-label', 'Kano Life root cause diagnostics');
  panel.style.cssText = 'position:fixed;z-index:2147483000;right:10px;bottom:10px;width:min(440px,calc(100vw - 20px));max-height:min(62vh,520px);overflow:auto;background:#081827f2;color:#eaf3fb;border:1px solid #00b4d8;border-radius:10px;padding:12px;font:12px/1.45 ui-monospace,SFMono-Regular,Consolas,monospace;box-shadow:0 8px 32px #0008;';
  const heading = document.createElement('div');
  heading.style.cssText = 'font:700 14px/1.3 system-ui,sans-serif;color:#fbbf24;margin-bottom:8px;';
  heading.textContent = 'KANO LIFE · ROOT-CAUSE AUDIT';
  const status = document.createElement('pre');
  status.style.cssText = 'white-space:pre-wrap;overflow-wrap:anywhere;margin:0 0 10px;max-height:34vh;overflow:auto;';
  const actions = document.createElement('div');
  actions.style.cssText = 'display:flex;gap:8px;flex-wrap:wrap;';
  const download = document.createElement('button');
  download.type = 'button';
  download.textContent = 'DOWNLOAD JSON';
  download.style.cssText = 'border:0;border-radius:6px;padding:8px 10px;background:#00b4d8;color:#04111e;font-weight:800;';
  download.addEventListener('click', () => safeCall(() => window.downloadKanoLifeRootCauseAudit?.()));
  const hide = document.createElement('button');
  hide.type = 'button';
  hide.textContent = 'HIDE';
  hide.style.cssText = 'border:1px solid #6e8295;border-radius:6px;padding:8px 10px;background:#172b3b;color:#fff;font-weight:700;';
  hide.addEventListener('click', () => { clearInterval(timer); panel.remove(); });
  actions.append(download, hide);

  const calibration = document.createElement('section');
  calibration.style.cssText = 'margin-top:12px;padding-top:10px;border-top:1px solid #315065;';
  const calibrationTitle = document.createElement('div');
  calibrationTitle.textContent = 'KEKE FIT · EXACT MODEL PATH';
  calibrationTitle.style.cssText = 'font:700 12px/1.4 system-ui,sans-serif;color:#fbbf24;margin-bottom:6px;';
  const calibrationPath = document.createElement('code');
  calibrationPath.style.cssText = 'display:block;overflow-wrap:anywhere;color:#b9d9eb;margin-bottom:8px;font-size:10px;';
  const currentPlayerPath = () => String(buildAuditReport().player?.modelPath || '');
  const currentSettings = () => getKekeCalibrationForPath(currentPlayerPath()) || { yawDeg: 0, offsetX: 0, offsetY: 0, offsetZ: 0, scale: 1 };
  const fields = document.createElement('div');
  fields.style.cssText = 'display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:6px;margin-bottom:8px;';
  const controls = {};
  const makeNumberField = (key, label, min, max, step) => {
    const wrap = document.createElement('label');
    wrap.style.cssText = 'display:flex;flex-direction:column;gap:3px;color:#b9d9eb;font:10px/1.2 system-ui,sans-serif;';
    const caption = document.createElement('span'); caption.textContent = label;
    const input = document.createElement('input'); input.type = 'number'; input.min = String(min); input.max = String(max); input.step = String(step);
    input.style.cssText = 'min-width:0;width:100%;box-sizing:border-box;border:1px solid #456276;border-radius:5px;background:#102637;color:#fff;padding:6px;font:12px ui-monospace,monospace;';
    wrap.append(caption, input); fields.append(wrap); controls[key] = input;
  };
  makeNumberField('yawDeg', 'YAW °', -180, 180, 5);
  makeNumberField('offsetX', 'OFFSET X', -2, 2, 0.05);
  makeNumberField('offsetY', 'OFFSET Y', -1, 1, 0.05);
  makeNumberField('offsetZ', 'OFFSET Z', -2, 2, 0.05);
  makeNumberField('scale', 'ROOT SCALE', 0.5, 1.5, 0.05);
  let lastCalibrationFieldPath = null;
  const fillCalibrationFields = (force = false) => {
    const path = currentPlayerPath();
    calibrationPath.textContent = path || 'Waiting for player GLB…';
    if (!force && path === lastCalibrationFieldPath) return;
    lastCalibrationFieldPath = path;
    const values = currentSettings();
    for (const [key, input] of Object.entries(controls)) input.value = String(values[key]);
  };
  const calibrationActions = document.createElement('div');
  calibrationActions.style.cssText = 'display:flex;gap:6px;flex-wrap:wrap;';
  const styleCalibrationButton = (button, primary = false) => {
    button.type = 'button';
    button.style.cssText = `border:${primary ? '0' : '1px solid #6e8295'};border-radius:6px;padding:7px 9px;background:${primary ? '#00b4d8' : '#172b3b'};color:${primary ? '#04111e' : '#fff'};font-weight:800;font-size:10px;`;
  };
  const saveCalibration = document.createElement('button');
  saveCalibration.textContent = 'SAVE CALIBRATION & RELOAD'; styleCalibrationButton(saveCalibration, true);
  saveCalibration.addEventListener('click', () => {
    const path = currentPlayerPath();
    if (!path) { status.textContent = 'Cannot save: active player GLB path is not known yet.'; return; }
    try {
      saveKekeCalibrationForPath(path, Object.fromEntries(Object.entries(controls).map(([key, input]) => [key, input.value])));
      window.location.reload();
    } catch (error) {
      status.textContent = `Calibration not saved: ${String(error?.message || error)}`;
    }
  });
  const resetCalibration = document.createElement('button');
  resetCalibration.textContent = 'RESET THIS MODEL'; styleCalibrationButton(resetCalibration, false);
  resetCalibration.addEventListener('click', () => {
    const path = currentPlayerPath();
    if (!path) return;
    try { removeKekeCalibrationForPath(path); window.location.reload(); }
    catch (error) { status.textContent = `Calibration reset failed: ${String(error?.message || error)}`; }
  });
  calibrationActions.append(saveCalibration, resetCalibration);
  const calibrationNote = document.createElement('p');
  calibrationNote.textContent = 'The loader’s automatic width/depth rotation is disabled. These exact-path adjustments affect the complete keke root, including its attached driver, and are stored only in this browser.';
  calibrationNote.style.cssText = 'color:#a6c0d1;font:10px/1.4 system-ui,sans-serif;margin:7px 0 0;';
  calibration.append(calibrationTitle, calibrationPath, fields, calibrationActions, calibrationNote);
  panel.append(heading, status, actions, calibration);
  document.body.appendChild(panel);
  const refresh = () => {
    const report = buildAuditReport();
    fillCalibrationFields();
    status.textContent = [
      `Renderer: ${report.renderMode}`,
      `Mobile: ${report.mobile}`,
      `Player GLB: ${report.player.modelPath || 'not yet identified'}`,
      `Player bounds: ${report.player.bounds ? `W ${report.player.bounds.width} / H ${report.player.bounds.height} / D ${report.player.bounds.depth}` : 'unavailable'}`,
      `Loaded categories: ${(report.modelManager.loadedKeys || []).join(', ') || 'waiting'}`,
      `Passenger GLBs attached: ${report.passengerModelsAttached}`,
      `Seated passenger GLBs: ${report.seatedPassengerModels}`,
      `Life actors attached: ${report.lifeModelsAttached}`,
      `Embedded clips: active ${report.embeddedAnimations.activeActors}, loaded assets ${report.embeddedAnimations.clipAssetsLoaded}, clipless ${report.embeddedAnimations.cliplessAssets}, failures ${report.embeddedAnimations.loadFailures}`,
      `Animation transitions/crossfades: ${report.embeddedAnimations.modeTransitions || 0}/${report.embeddedAnimations.crossfades || 0}`,
      `Animation budget: ${report.embeddedAnimations.activeActors} active, ${report.embeddedAnimations.budgetWaitlist || 0} waiting`, 
      `Water seller: ${report.waterVendor.status}`,
      `Goat: ${report.goat.status}${report.goat.modelPath ? ` (${report.goat.modelPath})` : ''}`,
      `Tinted vehicle materials: ${report.damageVisual.bodyMaterialsTinted}`,
      `Impact events: ${report.recentImpacts.length}`,
      `Animation-root scans/cache hits: ${report.performance.animatedRootScans}/${report.performance.animatedRootCacheHits}`,
      `Goat scene scans/cache hits: ${report.performance.goatSceneScans}/${report.performance.goatSceneScanCacheHits}`,
      `Notes: ${report.notes.slice(-3).join(' | ') || 'none'}`,
      '',
      'Use DOWNLOAD JSON to save the full report. A missing goat GLB is reported rather than fabricated.'
    ].join('\n');
  };
  refresh();
  const timer = setInterval(refresh, 1000);
  if (params.get('rootCauseAudit') === '1') setTimeout(() => loadGoatTemplate().catch(() => {}), 700);
}
installAuditPanelIfRequested();

rootAudit.notes.push('Root-cause repair layer loaded before GLB visual and presentation hooks.');
console.info('[Kano Life] Root-cause repair hooks registered.', rootAudit.patches);
