/**
 * Kano Life — mobile world clarity repair.
 *
 * Additive runtime hooks only: no protected application file is replaced, no
 * GLB source asset is edited, and the existing adaptive controller remains in
 * charge of reducing resolution when sustained frame-time measurements require it.
 */
import * as THREE from 'three';
import { ModelManager } from './ModelManager.js';
import { KanoAdaptiveQuality } from './KanoAdaptiveQuality.js';
import { getRenderSharpness } from './KanoDeviceTier.js';
import {
  KANO_MOBILE_WORLD_CLARITY_POLICY,
  clampRequestedMobileRatio,
  shouldUseMipmapFiltering,
} from './KanoMobileWorldClarityRules.js';

const PATCH_KEY = Symbol.for('kano.life.mobileWorldClarity.v1');
const MODEL_PATCH_KEY = Symbol.for('kano.life.mobileWorldClarity.modelLoad.v1');
const REPORT_KEY = '__KANO_MOBILE_WORLD_CLARITY_REPORT__';
const controllerInstances = new Set();
const adjustedTextures = new WeakSet();
const report = {
  version: 1,
  active: false,
  installedAt: new Date().toISOString(),
  modelLoadsSeen: 0,
  modelRootsAdjusted: 0,
  texturesAdjusted: 0,
  textureFailures: 0,
  clarityFloorApplications: 0,
  lastAppliedRatio: null,
  lastFloor: null,
  lastMode: null,
  errors: [],
};

function isMobileViewport() {
  try {
    return Boolean(
      (typeof navigator !== 'undefined' && Number(navigator.maxTouchPoints) > 0)
      || (typeof window !== 'undefined'
        && window.matchMedia('(max-width: 760px), (pointer: coarse)').matches),
    );
  } catch {
    return false;
  }
}

function applySingleTextureClarity(texture) {
  if (!texture?.isTexture || adjustedTextures.has(texture)) return false;
  // Packed data maps, video frames and compressed textures have format-specific
  // sampling/mip chains; leave those to their loader instead of forcing filters.
  if (texture.isDataTexture || texture.isVideoTexture || texture.isCompressedTexture) return false;
  adjustedTextures.add(texture);
  try {
    const oldMag = texture.magFilter;
    const oldMin = texture.minFilter;
    const oldAnisotropy = Number(texture.anisotropy) || 1;
    texture.magFilter = THREE.LinearFilter;
    texture.minFilter = shouldUseMipmapFiltering(texture)
      ? THREE.LinearMipmapLinearFilter
      : THREE.LinearFilter;
    texture.anisotropy = Math.min(4, Math.max(oldAnisotropy, KANO_MOBILE_WORLD_CLARITY_POLICY.targetAnisotropy));
    const changed = texture.magFilter !== oldMag
      || texture.minFilter !== oldMin
      || texture.anisotropy !== oldAnisotropy;
    if (changed) texture.needsUpdate = true;
    if (changed) report.texturesAdjusted += 1;
    return changed;
  } catch (error) {
    report.textureFailures += 1;
    report.errors.push(`texture-filter: ${String(error?.message || error)}`);
    return false;
  }
}

function applyTextureClarity(root) {
  if (!root?.traverse || !isMobileViewport()) return 0;
  let changed = 0;
  root.traverse((object) => {
    if (!object?.isMesh || !object.material) return;
    const materials = Array.isArray(object.material) ? object.material : [object.material];
    for (const material of materials) {
      if (!material) continue;
      for (const value of Object.values(material)) {
        if (applySingleTextureClarity(value)) changed += 1;
      }
    }
  });
  if (changed) report.modelRootsAdjusted += 1;
  return changed;
}

function installTextureLoaderFiltering() {
  const prototype = THREE?.TextureLoader?.prototype;
  const texturePatchKey = Symbol.for('kano.life.mobileWorldClarity.textureLoader.v1');
  if (!prototype || prototype[texturePatchKey] || typeof prototype.load !== 'function') return;
  const originalLoad = prototype.load;
  prototype.load = function mobileWorldClarityTextureLoad(url, onLoad, onProgress, onError) {
    if (!isMobileViewport() || typeof onLoad !== 'function') {
      return originalLoad.call(this, url, onLoad, onProgress, onError);
    }
    return originalLoad.call(this, url, (texture) => {
      applySingleTextureClarity(texture);
      onLoad(texture);
    }, onProgress, onError);
  };
  Object.defineProperty(prototype, texturePatchKey, { value: true });
}
function installModelLoadFiltering() {
  const prototype = ModelManager?.prototype;
  if (!prototype || prototype[MODEL_PATCH_KEY]) return;
  const originalLoad = prototype.load;
  if (typeof originalLoad !== 'function') return;

  prototype.load = async function mobileWorldClarityModelLoad(key, ...args) {
    const root = await originalLoad.call(this, key, ...args);
    if (root && isMobileViewport()) {
      report.modelLoadsSeen += 1;
      applyTextureClarity(root);
    }
    return root;
  };
  Object.defineProperty(prototype, MODEL_PATCH_KEY, { value: true });
}

function installAdaptiveResolutionPolicy() {
  const prototype = KanoAdaptiveQuality?.prototype;
  if (!prototype || prototype[PATCH_KEY]) return;
  const originalApplyRatio = prototype.applyRatio;
  if (typeof originalApplyRatio !== 'function') return;

  prototype.applyRatio = function applyMobileWorldClarityRatio(requestedRatio, ...args) {
    if (!this.mobile || this.enabled === false || this.disposed) {
      return originalApplyRatio.call(this, requestedRatio, ...args);
    }

    controllerInstances.add(this);
    const mode = getRenderSharpness();
    const fps = Number(this.lastFps) > 0 ? Number(this.lastFps) : 60;
    const ratio = clampRequestedMobileRatio(requestedRatio, {
      fps,
      sharpness: mode,
      minimumRatio: this.minRatio,
      maximumRatio: this.baseRatio,
    });
    const floor = clampRequestedMobileRatio(0, {
      fps,
      sharpness: mode,
      minimumRatio: this.minRatio,
      maximumRatio: this.baseRatio,
    });
    const result = originalApplyRatio.call(this, ratio, ...args);
    if (result) {
      report.active = true;
      report.clarityFloorApplications += 1;
      report.lastAppliedRatio = Number(this.currentRatio.toFixed(3));
      report.lastFloor = Number(floor.toFixed(3));
      report.lastMode = mode;
    }
    return result;
  };
  Object.defineProperty(prototype, PATCH_KEY, { value: true });
}

function publishAudit() {
  if (typeof window === 'undefined') return;
  window[REPORT_KEY] = report;
  window.kanoMobileWorldClarityAudit = () => {
    const controllers = [];
    for (const controller of [...controllerInstances]) {
      if (!controller || controller.disposed) {
        controllerInstances.delete(controller);
        continue;
      }
      let actualPixelRatio = null;
      try { actualPixelRatio = Number(controller.webgl?.getPixelRatio?.()) || null; } catch { /* diagnostics only */ }
      controllers.push({
        mobile: Boolean(controller.mobile),
        enabled: Boolean(controller.enabled),
        fps: Math.round(Number(controller.lastFps) || 0),
        currentRatio: Number(Number(controller.currentRatio || 0).toFixed(3)),
        actualPixelRatio,
        minimumRatio: Number(Number(controller.minRatio || 0).toFixed(3)),
        maximumRatio: Number(Number(controller.baseRatio || 0).toFixed(3)),
      });
    }
    const canvas = document.querySelector('#game-canvas');
    return {
      ...report,
      mobileViewport: isMobileViewport(),
      devicePixelRatio: Number(globalThis.window?.devicePixelRatio) || 1,
      canvas: canvas ? {
        backingWidth: canvas.width,
        backingHeight: canvas.height,
        cssWidth: Math.round(canvas.getBoundingClientRect().width),
        cssHeight: Math.round(canvas.getBoundingClientRect().height),
      } : null,
      sharpnessSetting: getRenderSharpness(),
      controllers,
      note: 'The resolution floor relaxes under slow frame rates. Texture sampling is improved without editing GLB files.',
    };
  };
}

installTextureLoaderFiltering();
installModelLoadFiltering();
installAdaptiveResolutionPolicy();
publishAudit();

export const KanoMobileWorldClarity = Object.freeze({
  getReport: () => ({ ...report }),
  applyTextureClarity,
});
