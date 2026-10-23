/**
 * KANO LIFE — WORLD / ENVIRONMENT / CHARACTER GLB VISUAL UPGRADE
 *
 * Runs before the existing game bootstrap and applies safe, one-time repairs
 * to imported assets from /assets/models/world, /environment, and /characters.
 * It preserves the original meshes, transforms, textures, rig names, and game
 * simulation. This is a runtime quality pass, not a rewrite of the binary GLBs.
 */
import * as THREE from 'three';
import { ModelManager } from './ModelManager.js';

const PATCH_KEY = Symbol.for('kano.life.glbVisualUpgrade.v1');
const BASE_PATH = '/assets/models/';
const isTouchDevice = (() => {
  try {
    return (navigator.maxTouchPoints || 0) > 0
      || window.matchMedia('(max-width: 760px), (pointer: coarse)').matches;
  } catch (_) {
    return false;
  }
})();
const TARGET_ANISOTROPY = isTouchDevice ? 2 : 8;
const patchedTemplates = new WeakSet();
const knownTextures = new WeakSet();
const originalLoad = ModelManager.prototype.load;

function categoryFromPath(value) {
  const path = String(value || '').replace(/^\/+/, '');
  const first = path.split('/')[0]?.toLowerCase();
  return ['world', 'environment', 'characters'].includes(first) ? first : null;
}

function finiteVectorAttribute(attribute) {
  if (!attribute || attribute.itemSize !== 3 || !attribute.count) return false;
  const stride = Math.max(1, Math.floor(attribute.count / 48));
  let sampled = 0;
  let usable = 0;
  for (let i = 0; i < attribute.count; i += stride) {
    const x = attribute.getX(i);
    const y = attribute.getY(i);
    const z = attribute.getZ(i);
    sampled += 1;
    if (Number.isFinite(x) && Number.isFinite(y) && Number.isFinite(z)
      && (Math.abs(x) + Math.abs(y) + Math.abs(z)) > 1e-5) usable += 1;
  }
  return sampled > 0 && usable / sampled >= 0.8;
}

function materialArray(value) {
  if (!value) return [];
  return Array.isArray(value) ? value : [value];
}

function upgradeTexture(texture, slot, stats) {
  if (!texture?.isTexture) return;
  if (!stats._texturesSeen.has(texture)) {
    stats._texturesSeen.add(texture);
    stats.textureCount += 1;
  }
  if (knownTextures.has(texture)) return;
  knownTextures.add(texture);

  let changed = false;
  // GLTFLoader normally does this correctly; repair it only when an albedo or
  // emissive texture arrived without the expected display colour space.
  if ((slot === 'map' || slot === 'emissiveMap')
    && texture.colorSpace !== THREE.SRGBColorSpace) {
    texture.colorSpace = THREE.SRGBColorSpace;
    changed = true;
    stats.colorSpaceRepairs += 1;
  }

  // Anisotropic filtering helps road-side textures and terrain remain clearer
  // at glancing angles. Keep the mobile setting conservative for GPU budget.
  if (Number.isFinite(texture.anisotropy)
    && texture.anisotropy < TARGET_ANISOTROPY) {
    texture.anisotropy = TARGET_ANISOTROPY;
    changed = true;
    stats.anisotropyUpgrades += 1;
  }

  if (changed) texture.needsUpdate = true;
}

function tuneMaterial(material, category, stats) {
  if (!material || stats._materialsSeen.has(material)) return;
  stats._materialsSeen.add(material);
  stats.materialCount += 1;
  let changed = false;

  for (const [slot, value] of Object.entries(material)) {
    if (value?.isTexture) upgradeTexture(value, slot, stats);
  }

  // Minor roughness cap prevents untextured building/clothing surfaces from
  // rendering as completely chalk-flat while preserving authored glossy values.
  // Textured roughness remains fully controlled by the original GLB.
  if (material.isMeshStandardMaterial && !material.roughnessMap
    && Number.isFinite(material.roughness)) {
    const cap = category === 'world' ? 0.93 : category === 'characters' ? 0.96 : 0.985;
    if (material.roughness > cap) {
      material.roughness = cap;
      changed = true;
      stats.roughnessBalances += 1;
    }
  }

  // Blend-mode GLB glass/water should not write a solid depth layer; this fixes
  // common transparent overlap artefacts without altering masked foliage.
  if (material.transparent === true
    && Number(material.opacity) < 0.999
    && !(Number(material.alphaTest) > 0)
    && material.depthWrite !== false) {
    material.depthWrite = false;
    changed = true;
    stats.transparentDepthFixes += 1;
  }

  if (changed) material.needsUpdate = true;
}

function inspectAndUpgrade(template, key) {
  if (!template?.isObject3D || patchedTemplates.has(template)) return template;
  const path = String(template.userData?.modelPath || '');
  const category = categoryFromPath(path);
  if (!category) return template;

  patchedTemplates.add(template);
  const stats = {
    key: String(key || template.userData?.modelKey || 'unknown'),
    path,
    category,
    meshCount: 0,
    triangleCount: 0,
    materialCount: 0,
    textureCount: 0,
    skinnedMeshCount: 0,
    normalRepairs: 0,
    boundsRepairs: 0,
    skinWeightRepairs: 0,
    anisotropyUpgrades: 0,
    colorSpaceRepairs: 0,
    roughnessBalances: 0,
    transparentDepthFixes: 0,
    uvMeshCount: 0,
    normalMeshCount: 0,
    _materialsSeen: new Set(),
    _texturesSeen: new Set(),
  };

  try {
    template.traverse((object) => {
      if (!object?.isMesh || !object.geometry) return;
      const geometry = object.geometry;
      stats.meshCount += 1;
      const position = geometry.getAttribute?.('position');
      if (position) {
        const index = geometry.index;
        stats.triangleCount += index
          ? Math.floor(index.count / 3)
          : Math.floor(position.count / 3);
        if (geometry.getAttribute('uv')) stats.uvMeshCount += 1;

        const normal = geometry.getAttribute('normal');
        const normalUsable = finiteVectorAttribute(normal);
        if (!normalUsable && typeof geometry.computeVertexNormals === 'function') {
          geometry.computeVertexNormals();
          stats.normalRepairs += 1;
        } else if (normal) {
          stats.normalMeshCount += 1;
        }

        if (!geometry.boundingBox) {
          geometry.computeBoundingBox?.();
          stats.boundsRepairs += 1;
        }
        if (!geometry.boundingSphere) {
          geometry.computeBoundingSphere?.();
          stats.boundsRepairs += 1;
        }
      }

      object.castShadow = true;
      object.receiveShadow = category !== 'characters';

      if (object.isSkinnedMesh) {
        stats.skinnedMeshCount += 1;
        // Animated garments, arms, or legs can extend beyond static bounds.
        // Disable frustum clipping only for skinned meshes to prevent popping.
        object.frustumCulled = false;
        if (geometry.getAttribute?.('skinWeight')
          && typeof object.normalizeSkinWeights === 'function'
          && !object.userData?.kanoSkinWeightsNormalized) {
          object.normalizeSkinWeights();
          object.userData.kanoSkinWeightsNormalized = true;
          stats.skinWeightRepairs += 1;
        }
      }

      for (const material of materialArray(object.material)) {
        tuneMaterial(material, category, stats);
      }
    });
  } catch (error) {
    console.warn('[Kano GLB upgrade] A model could not be fully polished; its original scene remains available.', path, error);
  }

  delete stats._materialsSeen;
  delete stats._texturesSeen;
  template.userData.kanoModelVisualUpgrade = {
    version: 1,
    category,
    appliedAt: new Date().toISOString(),
    ...stats,
  };
  template.userData.kanoVisualCategory = category;
  return template;
}

if (!ModelManager.prototype[PATCH_KEY]) {
  Object.defineProperty(ModelManager.prototype, PATCH_KEY, {
    value: true,
    enumerable: false,
    configurable: false,
    writable: false,
  });

  ModelManager.prototype.load = async function loadWithKanoModelVisualUpgrade(key, ...args) {
    const model = await originalLoad.call(this, key, ...args);
    try {
      if (typeof window !== 'undefined') window.__KANO_MODEL_MANAGER__ = this;
      if (model) inspectAndUpgrade(model, key);
    } catch (error) {
      console.warn('[Kano GLB upgrade] Visual pass skipped safely; retaining the original GLB.', error);
    }
    return model;
  };
}

function createAuditReport(manager) {
  const assets = [];
  for (const [key, model] of manager?.cache?.entries?.() || []) {
    const report = model?.userData?.kanoModelVisualUpgrade;
    if (report) assets.push({ ...report, key });
  }
  assets.sort((a, b) => a.category.localeCompare(b.category) || a.path.localeCompare(b.path));
  const byCategory = {};
  for (const category of ['world', 'environment', 'characters']) {
    const group = assets.filter((asset) => asset.category === category);
    byCategory[category] = {
      assets: group.length,
      meshes: group.reduce((sum, asset) => sum + asset.meshCount, 0),
      triangles: group.reduce((sum, asset) => sum + asset.triangleCount, 0),
      skinnedMeshes: group.reduce((sum, asset) => sum + asset.skinnedMeshCount, 0),
      normalRepairs: group.reduce((sum, asset) => sum + asset.normalRepairs, 0),
      textureAdjustments: group.reduce((sum, asset) => sum + asset.anisotropyUpgrades + asset.colorSpaceRepairs, 0),
    };
  }
  return { version: 1, generatedAt: new Date().toISOString(), loadedAssetCount: assets.length, byCategory, assets };
}

if (typeof window !== 'undefined') {
  window.kanoGlbAssetQualityAudit = () => {
    const report = createAuditReport(window.__KANO_MODEL_MANAGER__);
    console.groupCollapsed('[Kano Life] GLB visual quality audit');
    console.table(Object.entries(report.byCategory).map(([category, values]) => ({ category, ...values })));
    if (report.assets.length) console.table(report.assets.map(({ key, category, path, meshCount, triangleCount, skinnedMeshCount, normalRepairs, boundsRepairs, anisotropyUpgrades, colorSpaceRepairs, transparentDepthFixes }) => ({ key, category, path, meshCount, triangleCount, skinnedMeshCount, normalRepairs, boundsRepairs, anisotropyUpgrades, colorSpaceRepairs, transparentDepthFixes })));
    console.groupEnd();
    return report;
  };
  window.kanoGlbAssetVisualUpgradeVersion = '1.0.0';
}

console.info(`[Kano Life] GLB visual quality pass registered for world/, environment/, and characters/ assets (${isTouchDevice ? 'mobile-safe' : 'desktop'} texture filtering).`);

// Install the articulated street-person and checkpoint queue layer before
// GameplayPresentationRepair imports main.js and constructs Renderer3D.
await import('./KanoStreetLifeMotionUpgrade.js');
await import('./KanoWorldInfrastructureUpgrade.js');

// The model pipeline must be patched before main.js creates ModelManager.
// Keep the existing presentation, game, and persistence hooks as the app entry.
await import('./KanoGameplayPresentationRepair.js');
