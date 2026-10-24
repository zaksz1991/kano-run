/**
 * KANO LIFE — current-main core experience repair (additive adapter).
 * Does not replace protected engine files or modify GLB bytes.
 */
import * as THREE from 'three';
import { Renderer3D } from './renderer3d.js';
import { Game } from './game.js';
import {
  isKnownKekeGlbPath,
  isPlausibleKekeBounds,
  computeCollisionKickOffset,
  mobileTextureAnisotropy,
  defaultSharpness,
} from './KanoCoreExperienceRepairRules.js';

const PATCH = Symbol.for('kano.life.coreExperienceRepair.v1');
const report = {
  version: 1,
  installed: false,
  playerGlbValidationRelaxed: 0,
  collisionKickExtensions: 0,
  potholeVisualsCreated: 0,
  canvasTexturesSharpened: 0,
  sharpnessPreference: 'not set',
  lastPlayerModelPath: null,
  lastPlayerModelResult: null,
  browserVisualTest: 'not verified',
};
const tunedTextures = new WeakSet();

function safeSetSharpnessPreference() {
  try {
    const key = 'kano-life-render-sharpness-v1';
    const current = globalThis.localStorage?.getItem(key);
    const next = defaultSharpness(current);
    if (current !== next) globalThis.localStorage?.setItem(key, next);
    report.sharpnessPreference = next;
  } catch {
    report.sharpnessPreference = 'storage-unavailable';
  }
}

function inspectBounds(object) {
  let meshCount = 0;
  let namedWheelCount = 0;
  try {
    object?.updateMatrixWorld?.(true);
    object?.traverse?.((node) => {
      if (!node?.isMesh || !node.geometry) return;
      const list = Array.isArray(node.material) ? node.material : [node.material];
      if (!list.some((m) => m && m.visible !== false && Number(m.opacity ?? 1) > 0.025)) return;
      meshCount += 1;
      if (/wheel|tire|tyre/i.test(`${node.name || ''} ${list.map((m) => m?.name || '').join(' ')}`)) namedWheelCount += 1;
    });
    const box = new THREE.Box3().setFromObject(object);
    const vector = box.getSize(new THREE.Vector3());
    const size = { x: vector.x, y: vector.y, z: vector.z };
    return { size, meshCount, namedWheelCount, bounds: box };
  } catch (error) {
    return { size: null, meshCount, namedWheelCount, error: String(error?.message || error) };
  }
}

function installKekeCandidateGuard() {
  const proto = Renderer3D?.prototype;
  if (!proto || proto[PATCH] || typeof proto.validateKekeModelCandidate !== 'function') return;
  const original = proto.validateKekeModelCandidate;
  proto.validateKekeModelCandidate = function validateKnownKekeGlb(object, ...args) {
    const strict = original.call(this, object, ...args);
    if (strict?.ok) {
      report.lastPlayerModelResult = strict.reason || 'strict-validator-accepted';
      report.lastPlayerModelPath = object?.userData?.modelPath || null;
      return strict;
    }
    const path = String(object?.userData?.modelPath || '').replace(/^assets\/models\//i, '');
    if (!isKnownKekeGlbPath(path)) return strict;
    const measured = inspectBounds(object);
    if (!isPlausibleKekeBounds(measured.size, measured.meshCount)) {
      report.lastPlayerModelResult = `catalogued-glb-rejected-by-safe-bounds:${strict?.reason || 'unknown'}`;
      report.lastPlayerModelPath = path;
      return strict;
    }
    // Only catalogued keke GLB paths with several drawable meshes and plausible
    // whole-model bounds are admitted. Character/human assets cannot pass this guard.
    const size = measured.size;
    const accepted = {
      ok: true,
      reason: 'catalogued-keke-glb-with-plausible-drawable-bounds',
      meshCount: measured.meshCount,
      bounds: {
        width: Number(size.x.toFixed(3)),
        height: Number(size.y.toFixed(3)),
        depth: Number(size.z.toFixed(3)),
        footprint: Number((size.x * size.z).toFixed(3)),
      },
      evidence: {
        vehicleCoreMeshes: 0,
        wheelPartMeshes: measured.namedWheelCount,
        characterMeshes: 0,
        catalogPath: path,
      },
      validatorFallbackUsed: true,
    };
    if (object?.userData) object.userData.kanoCoreExperienceAcceptedKeke = true;
    report.playerGlbValidationRelaxed += 1;
    report.lastPlayerModelPath = path;
    report.lastPlayerModelResult = accepted.reason;
    console.info('[Kano Life] Accepted catalogued keke GLB after safe whole-model bounds check.', accepted);
    return accepted;
  };
  Object.defineProperty(proto, PATCH, { value: true, configurable: false });
}

function makeIrregularPothole(renderer, zone) {
  const root = new THREE.Group();
  const idText = String(zone?.id ?? 'pothole');
  let seed = 2166136261;
  for (let i = 0; i < idText.length; i += 1) seed = Math.imul(seed ^ idText.charCodeAt(i), 16777619) >>> 0;
  const random = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  const radiusX = zone?.hub ? 1.0 : 0.74;
  const radiusZ = zone?.hub ? 0.78 : 0.60;
  const segments = 13;
  const outerPoints = [];
  const innerPoints = [];
  for (let i = 0; i < segments; i += 1) {
    const angle = (i / segments) * Math.PI * 2;
    const jagged = 0.80 + random() * 0.27;
    outerPoints.push(new THREE.Vector2(Math.cos(angle) * radiusX * jagged, Math.sin(angle) * radiusZ * jagged));
    const innerScale = 0.62 + random() * 0.18;
    innerPoints.push(new THREE.Vector2(Math.cos(angle) * radiusX * innerScale, Math.sin(angle) * radiusZ * innerScale));
  }
  const rimShape = new THREE.Shape();
  outerPoints.forEach((p, i) => i === 0 ? rimShape.moveTo(p.x, p.y) : rimShape.lineTo(p.x, p.y));
  rimShape.closePath();
  const craterHole = new THREE.Path();
  innerPoints.slice().reverse().forEach((p, i) => i === 0 ? craterHole.moveTo(p.x, p.y) : craterHole.lineTo(p.x, p.y));
  craterHole.closePath();
  rimShape.holes.push(craterHole);
  const rim = new THREE.Mesh(
    new THREE.ShapeGeometry(rimShape, 1),
    new THREE.MeshStandardMaterial({ color: 0x716e66, roughness: 1, metalness: 0, side: THREE.DoubleSide }),
  );
  rim.rotation.x = -Math.PI / 2;
  rim.position.y = 0.018;
  rim.name = 'KANO_POTHOLE_BROKEN_ASPHALT_RIM';
  rim.castShadow = false;
  rim.receiveShadow = false;
  root.add(rim);

  // A dark recessed bowl and a smaller uneven bottom create visible depth without
  // expensive lights or shadow maps on phones.
  const pitShape = new THREE.Shape();
  innerPoints.forEach((p, i) => i === 0 ? pitShape.moveTo(p.x, p.y) : pitShape.lineTo(p.x, p.y));
  pitShape.closePath();
  const pit = new THREE.Mesh(new THREE.ShapeGeometry(pitShape, 1), new THREE.MeshBasicMaterial({ color: 0x0b0d0e, side: THREE.DoubleSide }));
  pit.rotation.x = -Math.PI / 2;
  pit.position.y = 0.006;
  pit.name = 'KANO_POTHOLE_RECESSED_DARK_CENTRE';
  root.add(pit);

  // Batch chips and cracks so the more detailed crater adds only four mesh
  // objects total (rim, pit, aggregate batch, crack batch) on mobile.
  const aggregate = new THREE.MeshStandardMaterial({ color: 0x9c9587, roughness: 1, metalness: 0 });
  const fragments = Math.min(7, segments - 4);
  const chipGeometry = new THREE.BoxGeometry(1, 1, 1);
  const chips = new THREE.InstancedMesh(chipGeometry, aggregate, fragments);
  chips.name = 'KANO_POTHOLE_EXPOSED_AGGREGATE';
  chips.castShadow = false;
  chips.receiveShadow = false;
  const chipTransform = new THREE.Object3D();
  for (let i = 0; i < fragments; i += 1) {
    const p = outerPoints[(i * 2 + 1) % outerPoints.length];
    chipTransform.position.set(p.x * 1.06, 0.035 + random() * 0.012, p.y * 1.06);
    chipTransform.rotation.set(0, random() * Math.PI, 0);
    chipTransform.scale.set(0.09 + random() * 0.12, 0.022, 0.07 + random() * 0.08);
    chipTransform.updateMatrix();
    chips.setMatrixAt(i, chipTransform.matrix);
  }
  chips.instanceMatrix.needsUpdate = true;
  root.add(chips);

  const shoulderCrackMaterial = new THREE.MeshBasicMaterial({ color: 0x212426, side: THREE.DoubleSide });
  const crackGeometry = new THREE.BoxGeometry(1, 1, 1);
  const crackCount = 4;
  const cracks = new THREE.InstancedMesh(crackGeometry, shoulderCrackMaterial, crackCount);
  cracks.name = 'KANO_POTHOLE_SHOULDER_CRACKS';
  cracks.castShadow = false;
  cracks.receiveShadow = false;
  const crackTransform = new THREE.Object3D();
  for (let i = 0; i < crackCount; i += 1) {
    const p = outerPoints[(i * 3 + 2) % outerPoints.length];
    crackTransform.position.set(p.x * 1.14, 0.012, p.y * 1.14);
    crackTransform.rotation.set(0, random() * Math.PI, 0);
    crackTransform.scale.set(0.30 + random() * 0.22, 0.008, 0.025);
    crackTransform.updateMatrix();
    cracks.setMatrixAt(i, crackTransform.matrix);
  }
  cracks.instanceMatrix.needsUpdate = true;
  root.add(cracks);
  root.userData.zoneType = 'pothole';
  root.userData.kanoRealisticPotholeVisual = true;
  root.userData.potholeWarning = null;
  report.potholeVisualsCreated += 1;
  return root;
}

function installPotholeVisuals() {
  const proto = Renderer3D?.prototype;
  if (!proto || proto.__kanoRealisticPotholes || typeof proto.makePotholeActor !== 'function') return;
  const originalMakePotholeActor = proto.makePotholeActor;
  proto.makePotholeActor = function makeKanoBrokenAsphaltPothole(zone, ...args) {
    try { return makeIrregularPothole(this, zone); }
    catch (error) {
      console.warn('[Kano Life] Realistic pothole geometry failed; keeping the existing safe pothole marker.', error);
      return originalMakePotholeActor.call(this, zone, ...args);
    }
  };
  Object.defineProperty(proto, '__kanoRealisticPotholes', { value: true });
}

function tuneTexture(texture, renderer) {
  if (!texture?.isTexture || tunedTextures.has(texture)) return false;
  const image = texture.image;
  const isCanvasSign = image && (typeof HTMLCanvasElement !== 'undefined' && image instanceof HTMLCanvasElement
    || typeof OffscreenCanvas !== 'undefined' && image instanceof OffscreenCanvas);
  if (!isCanvasSign && !/kwank|flyover|billboard|sign/i.test(String(texture.name || ''))) return false;
  try {
    const max = renderer?.renderer?.capabilities?.getMaxAnisotropy?.() || 1;
    texture.anisotropy = mobileTextureAnisotropy(max);
    texture.magFilter = THREE.LinearFilter;
    texture.minFilter = THREE.LinearMipmapLinearFilter;
    texture.generateMipmaps = true;
    texture.needsUpdate = true;
    tunedTextures.add(texture);
    report.canvasTexturesSharpened += 1;
    return true;
  } catch { return false; }
}
function tuneSignTextures(renderer) {
  const searchableRoot = renderer?.world?.traverse ? renderer.world : renderer?.scene?.traverse ? renderer.scene : null;
  if (!renderer || !searchableRoot) return;
  const now = globalThis.performance?.now?.() ?? Date.now();
  if (now < (renderer._kanoCoreNextTextureTuneAt || 0)) return;
  renderer._kanoCoreNextTextureTuneAt = now + 1800;
  const visit = (root) => root?.traverse?.((object) => {
    if (!object?.isMesh || !object.material) return;
    const list = Array.isArray(object.material) ? object.material : [object.material];
    for (const material of list) {
      for (const texture of [material?.map, material?.emissiveMap, material?.roughnessMap]) tuneTexture(texture, renderer);
    }
  });
  // The flyover sign is a separate world actor; the low-frequency scan is kept
  // to once per 1.8 seconds so new/recycled signs are picked up without per-frame work.
  visit(searchableRoot);
}

function installCollisionContactVisual() {
  const proto = Game?.prototype;
  if (!proto || proto.__kanoCoreCollisionContact || typeof proto.moveTraffic !== 'function') return;
  const original = proto.moveTraffic;
  proto.moveTraffic = function moveTrafficWithVisibleContact(dt, ...args) {
    const result = original.call(this, dt, ...args);
    for (const vehicle of this.s?.traffic || []) {
      let remaining = Number(vehicle.collisionKickTime) || 0;
      let duration = Number(vehicle.collisionKickDuration) || 0;
      if (remaining <= 0) {
        vehicle.kanoCoreCollisionKickExtended = false;
        continue;
      }
      if (!vehicle.kanoCoreCollisionKickExtended && duration > 0 && duration <= 0.46 && remaining > 0.20) {
        vehicle.collisionKickDuration = 0.62;
        vehicle.collisionKickTime = 0.62;
        vehicle.kanoCoreCollisionKickExtended = true;
        remaining = 0.62;
        duration = 0.62;
        report.collisionKickExtensions += 1;
      }
      duration = Number(vehicle.collisionKickDuration) || duration || 0.62;
      remaining = Number(vehicle.collisionKickTime) || remaining;
      vehicle.visualOffsetX = computeCollisionKickOffset(
        remaining,
        duration,
        Number(vehicle.collisionKickSide) || 1,
        1.9,
      );
    }
    return result;
  };
  Object.defineProperty(proto, '__kanoCoreCollisionContact', { value: true });
}

let playerCountLabel = null;
let playerCountRegistrationInFlight = false;
function addEverPlayedCounter() {
  if (typeof document === 'undefined' || typeof window === 'undefined') return;
  const root = document.querySelector('.start-meta');
  if (!root || document.getElementById('kano-ever-played-count')) return;
  const row = document.createElement('span');
  row.className = 'kano-ever-played-meta';
  row.title = 'Counts unique browser profiles that have started the game, not verified individual humans.';
  row.style.cssText = 'display:inline-flex;gap:.35rem;align-items:center;flex-wrap:wrap;font-size:.82rem;font-weight:800;color:#d5eaff;margin:.35rem 0;';
  row.innerHTML = 'PLAYERS WHO HAVE PLAYED <b id="kano-ever-played-count">—</b>';
  root.appendChild(row);
  playerCountLabel = row.querySelector('#kano-ever-played-count');
}

async function registerEverPlayed() {
  if (playerCountRegistrationInFlight || typeof fetch !== 'function') return;
  playerCountRegistrationInFlight = true;
  try {
    let playerId = globalThis.localStorage?.getItem('kano-life-player-profile-v1');
    if (!playerId || !/^[a-f0-9-]{16,96}$/i.test(playerId)) {
      playerId = globalThis.crypto?.randomUUID?.() || `${Date.now().toString(16)}-${Math.random().toString(16).slice(2)}-${Math.random().toString(16).slice(2)}`;
      globalThis.localStorage?.setItem('kano-life-player-profile-v1', playerId);
    }
    const response = await fetch('/api/players-ever', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ playerId }),
      credentials: 'same-origin',
      cache: 'no-store',
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = await response.json();
    if (!data?.ok || !Number.isFinite(Number(data.totalProfiles))) throw new Error('Counter response invalid');
    if (playerCountLabel) playerCountLabel.textContent = Math.max(0, Math.floor(Number(data.totalProfiles))).toLocaleString();
  } catch {
    if (playerCountLabel) playerCountLabel.textContent = 'unavailable';
  } finally {
    playerCountRegistrationInFlight = false;
  }
}

function installPlayersEverStartHook() {
  const proto = Game?.prototype;
  if (!proto || proto.__kanoPlayersEverStartHook || typeof proto.start !== 'function') return;
  const originalStart = proto.start;
  proto.start = function startAndRegisterEverPlayed(...args) {
    const result = originalStart.apply(this, args);
    void registerEverPlayed();
    return result;
  };
  Object.defineProperty(proto, '__kanoPlayersEverStartHook', { value: true });
}

function installTextureAndFogRepair() {
  const proto = Renderer3D?.prototype;
  if (!proto || proto.__kanoCoreTextureQuality) return;
  const originalDraw = proto.draw;
  if (typeof originalDraw === 'function') {
    proto.draw = function drawWithCoreVisualRepair(state, dt, ...args) {
      if (typeof window !== 'undefined') window.__KANO_ACTIVE_RENDERER__ = this;
      // Apply a small far-fog floor through an accessor so the original renderer's
      // per-frame fog assignment cannot immediately erase this setting. Harmattan
      // keeps its intentional haze and does not receive the floor.
      if (this.mobile && this.scene?.fog) {
        this._kanoCoreHarmattan = state?.environment === 'harmattan';
        const fog = this.scene.fog;
        if (!this._kanoFogFarFloorInstalled) {
          const initialFar = Number(fog.far) || 105;
          let requestedFar = initialFar;
          try {
            const renderer = this;
            Object.defineProperty(fog, 'far', {
              configurable: true,
              enumerable: true,
              get() { return requestedFar; },
              set(value) {
                const number = Number(value);
                const next = Number.isFinite(number) ? number : initialFar;
                requestedFar = renderer._kanoCoreHarmattan ? Math.min(next, 105) : Math.max(next, 132);
              },
            });
            this._kanoFogFarFloorInstalled = true;
          } catch { /* Fall back to the renderer's original fog if the property cannot be wrapped. */ }
        }
      }
      tuneSignTextures(this);
      return originalDraw.call(this, state, dt, ...args);
    };
  }
  Object.defineProperty(proto, '__kanoCoreTextureQuality', { value: true });
}

installKekeCandidateGuard();
installPotholeVisuals();
installCollisionContactVisual();
installPlayersEverStartHook();
installTextureAndFogRepair();
safeSetSharpnessPreference();
if (typeof window !== 'undefined') {
  window.kanoCoreExperienceRepairAudit = () => {
    const renderer = window.__KANO_ACTIVE_RENDERER__ || null;
    const player = renderer?.player;
    return {
      ...report,
      activeRenderer: Boolean(renderer),
      player: player ? {
        fallback: Boolean(player.userData?.fallback || player.userData?.kanoRuntimeRecoveredFallback),
        modelPath: player.userData?.modelPath || null,
        acceptedCataloguedGlb: Boolean(player.userData?.kanoCoreExperienceAcceptedKeke),
        validation: player.userData?.kanoKekeVisualValidation || player.userData?.kanoRuntimeKekeHealth?.structural || null,
      } : null,
      flyover: window.kanoFlyoverDriveabilityAudit?.() || null,
      renderPixelRatio: renderer?.renderer?.getPixelRatio?.() ?? null,
      note: 'Source patch audit only; actual in-browser appearance and device performance still require verification.',
    };
  };
}
if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', addEverPlayedCounter, { once: true });
  else addEverPlayedCounter();
}
report.installed = true;
