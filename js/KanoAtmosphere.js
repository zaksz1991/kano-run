import * as THREE from 'three';
import { save, persist } from './storage.js';
import { AudioManager } from './audio.js';
import { Renderer3D } from './renderer3d.js';
import { KanoSceneUpgrade } from './KanoSceneUpgrade.js';
import './KanoPersistentDailySchedule.js';

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const rand = (min, max) => min + Math.random() * (max - min);
const validTime = new Set(['auto', 'morning', 'afternoon', 'evening', 'night']);
const validSeason = new Set(['hotDry', 'harmattan', 'rainy', 'cool']);
const validHome = new Set(['family', 'rented']);
const SCENES = new Set(['road', 'garage', 'bedroom', 'household', 'street', 'breakfast', 'walk', 'school']);
const RENT_PER_WEEK = 3500; // In-game price; not a real-world rental estimate.
const LIFESTYLE_DEFAULTS = {
  timeOfDay: 'auto',
  season: 'hotDry',
  home: 'family',
  insects: true,
  rentWeeksPaid: 0,
  rentLedger: [],
};

const TIME_PROFILES = {
  morning: {
    background: 0x9dcce2, fog: 0xb5d5e1, fogNear: 48, fogFar: 205,
    hemi: 1.10, directional: 1.08, light: 0xfff0d2,
    temperature: { hotDry: '30–34°C', harmattan: '17–22°C', rainy: '22–26°C', cool: '18–23°C' },
  },
  afternoon: {
    background: 0xb9e0ed, fog: 0xc6e1e7, fogNear: 58, fogFar: 228,
    hemi: 1.18, directional: 1.18, light: 0xfff4df,
    temperature: { hotDry: '37–41°C', harmattan: '29–34°C', rainy: '27–31°C', cool: '27–32°C' },
  },
  evening: {
    background: 0xe4b18b, fog: 0xd7b49a, fogNear: 38, fogFar: 172,
    hemi: 0.94, directional: 0.76, light: 0xffbf83,
    temperature: { hotDry: '30–35°C', harmattan: '24–29°C', rainy: '24–28°C', cool: '23–28°C' },
  },
  night: {
    background: 0x1d2a43, fog: 0x283650, fogNear: 24, fogFar: 132,
    hemi: 0.76, directional: 0.42, light: 0x9ab5e2,
    temperature: { hotDry: '25–30°C', harmattan: '13–19°C', rainy: '21–25°C', cool: '15–20°C' },
  },
};

const SEASON_PROFILES = {
  hotDry: { label: 'Hot / dry season', backgroundBlend: 0xefd4a7, fogBlend: 0xe7cfab, hemi: 1.04, directional: 1.04 },
  harmattan: { label: 'Harmattan / dusty-cool', backgroundBlend: 0xc8c2ad, fogBlend: 0xc7c0ad, hemi: 0.98, directional: 0.90 },
  rainy: { label: 'Rainy / humid season', backgroundBlend: 0x91aebd, fogBlend: 0x96b0bc, hemi: 0.92, directional: 0.78 },
  cool: { label: 'Cool season', backgroundBlend: 0xa9c4d5, fogBlend: 0xb5c9d7, hemi: 1.01, directional: 0.96 },
};

function getLifestyle() {
  const input = save.lifestyle && typeof save.lifestyle === 'object' ? save.lifestyle : {};
  const timeOfDay = validTime.has(input.timeOfDay) ? input.timeOfDay : LIFESTYLE_DEFAULTS.timeOfDay;
  const season = validSeason.has(input.season) ? input.season : LIFESTYLE_DEFAULTS.season;
  const home = validHome.has(input.home) ? input.home : LIFESTYLE_DEFAULTS.home;
  const rentWeeksPaid = Number.isFinite(input.rentWeeksPaid) ? Math.max(0, Math.floor(input.rentWeeksPaid)) : 0;
  const rentLedger = Array.isArray(input.rentLedger)
    ? input.rentLedger.filter((entry) => entry && typeof entry === 'object' && Number.isFinite(entry.amount)).slice(-20)
    : [];
  const lifestyle = {
    ...LIFESTYLE_DEFAULTS,
    ...input,
    timeOfDay,
    season,
    home,
    insects: typeof input.insects === 'boolean' ? input.insects : true,
    rentWeeksPaid,
    rentLedger,
  };
  save.lifestyle = lifestyle;
  return lifestyle;
}

function persistLifestyle(lifestyle) {
  save.lifestyle = lifestyle;
  try { persist(); } catch (error) { console.warn('[Kano Life] lifestyle save warning', error); }
}

// ---------------------------------------------------------------------------
// Texture recovery is installed at module evaluation time, before main.js
// constructs Renderer3D. It only intercepts the two known missing textures.
// ---------------------------------------------------------------------------
const TEXTURE_FALLBACKS = new Map([
  ['/assets/environment/ground/asphalt.jpg', 'asphalt'],
  ['/assets/environment/ground/market-stall.jpg', 'marketStall'],
]);
const TEXTURE_CACHE = new Map();
const TEXTURE_PATCH_FLAG = '__kanoLifeWorldTextureRecoveryV2';

function makeFallbackTexture(kind) {
  if (TEXTURE_CACHE.has(kind)) return TEXTURE_CACHE.get(kind);
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext('2d', { alpha: false });
  if (!ctx) return null;

  if (kind === 'asphalt') {
    ctx.fillStyle = '#353a3d';
    ctx.fillRect(0, 0, 256, 256);
    for (let i = 0; i < 5200; i += 1) {
      const shade = 42 + Math.floor(Math.random() * 49);
      ctx.fillStyle = `rgba(${shade},${shade + 2},${shade + 3},${Math.random() * 0.26})`;
      const size = Math.random() < 0.92 ? 1 : 2;
      ctx.fillRect(Math.random() * 256, Math.random() * 256, size, size);
    }
    ctx.strokeStyle = 'rgba(18,22,25,0.25)';
    ctx.lineWidth = 1;
    for (let i = 0; i < 7; i += 1) {
      const x = Math.random() * 256;
      const y = Math.random() * 256;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + rand(-18, 18), y + rand(4, 26));
      ctx.stroke();
    }
  } else {
    ctx.fillStyle = '#9f7852';
    ctx.fillRect(0, 0, 256, 256);
    for (let i = 0; i < 80; i += 1) {
      ctx.fillStyle = ['#8c6849', '#b58b5a', '#c49c69', '#785b43'][i % 4];
      ctx.fillRect((i * 31) % 256, (i * 47) % 256, 20 + (i % 5) * 3, 4 + (i % 3) * 2);
    }
    ctx.strokeStyle = 'rgba(67,45,29,0.45)';
    ctx.lineWidth = 3;
    for (let y = 18; y < 256; y += 32) {
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(256, y); ctx.stroke();
    }
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(kind === 'asphalt' ? 5 : 2, kind === 'asphalt' ? 8 : 2);
  texture.anisotropy = 2;
  texture.needsUpdate = true;
  TEXTURE_CACHE.set(kind, texture);
  return texture;
}

function installTextureRecovery() {
  const prototype = THREE.TextureLoader?.prototype;
  if (!prototype || prototype[TEXTURE_PATCH_FLAG]) return;
  const originalLoad = prototype.load;
  if (typeof originalLoad !== 'function') return;
  prototype.load = function kanoTextureLoad(url, onLoad, onProgress, onError) {
    const path = String(url || '');
    let kind = null;
    for (const [missingPath, fallbackKind] of TEXTURE_FALLBACKS) {
      if (path.endsWith(missingPath) || path.includes(missingPath)) {
        kind = fallbackKind;
        break;
      }
    }
    if (kind) {
      const texture = makeFallbackTexture(kind);
      if (texture) {
        const manager = this.manager || THREE.DefaultLoadingManager;
        manager?.itemStart?.(path);
        queueMicrotask(() => {
          try {
            if (typeof onLoad === 'function') onLoad(texture);
          } catch (error) {
            console.warn('[Kano Life] procedural texture callback failed', error);
          } finally {
            manager?.itemEnd?.(path);
          }
        });
        return texture;
      }
    }
    return originalLoad.call(this, url, onLoad, onProgress, onError);
  };
  Object.defineProperty(prototype, TEXTURE_PATCH_FLAG, { value: true, configurable: false });
}

// Keep a pending scene request even if the active renderer has not finished
// constructing its life dioramas yet. main.js also listens for this event, but
// its immediate call can be too early and is otherwise discarded by Renderer3D.
let pendingLifeScene = null;
if (typeof window !== 'undefined' && !window.__KANO_LIFE_SCENE_QUEUE_INSTALLED__) {
  window.__KANO_LIFE_SCENE_QUEUE_INSTALLED__ = true;
  window.addEventListener('kano:life-scene', (event) => {
    const scene = event?.detail?.scene;
    if (SCENES.has(scene)) pendingLifeScene = scene;
  });
}

function installSceneReplayHooks() {
  const rendererProto = Renderer3D?.prototype;
  if (rendererProto && !rendererProto.__kanoLifeSceneEventHook) {
    const originalSetLifeScene = rendererProto.setLifeScene;
    if (typeof originalSetLifeScene === 'function') {
      rendererProto.setLifeScene = function setLifeSceneWithEvent(sceneName) {
        const before = this.lifeScene;
        const result = originalSetLifeScene.call(this, sceneName);
        if (this.lifeScene && this.lifeScene !== before && typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('kano:life-scene-activated', {
            detail: { scene: this.lifeScene, previous: before || 'road' },
          }));
        }
        return result;
      };
      Object.defineProperty(rendererProto, '__kanoLifeSceneEventHook', { value: true });
    }
  }

  const sceneProto = KanoSceneUpgrade?.prototype;
  if (sceneProto && !sceneProto.__kanoRoutineReplayHook) {
    const originalUpdate = sceneProto.update;
    if (typeof originalUpdate === 'function') {
      sceneProto.update = function updateWithSceneAnimationReset(dt, state) {
        const currentScene = this.renderer?.lifeScene || 'road';
        if (this.__kanoPreviousAnimatedScene !== currentScene) {
          this.__kanoPreviousAnimatedScene = currentScene;
          if (!this.__kanoBaseRigPhases) this.__kanoBaseRigPhases = new WeakMap();
          for (const rig of this.lifeRigs || []) {
            if (!rig || typeof rig !== 'object') continue;
            if (!this.__kanoBaseRigPhases.has(rig)) {
              this.__kanoBaseRigPhases.set(rig, Number(rig.phase) || 0);
            }
            // updateLifeRigs calculates t = elapsed*2.1 + phase. This offset
            // replays the same short body animation whenever a scene returns.
            rig.phase = this.__kanoBaseRigPhases.get(rig) - (Number(this.elapsed) || 0) * 2.1;
            if (rig.root?.position && Number.isFinite(rig.baseX)) rig.root.position.x = rig.baseX;
            if (rig.root?.position && Number.isFinite(rig.baseZ)) rig.root.position.z = rig.baseZ;
          }
        }
        return originalUpdate.call(this, dt, state);
      };
      Object.defineProperty(sceneProto, '__kanoRoutineReplayHook', { value: true });
    }
  }
}

// Environmental rumble was competing with the sampled engine recording. Keep
// the RPM sound and real engine MP3 prominent; attenuate only the generated
// rolling-road layer. This is a class-level hook installed before AudioManager
// instances are created in main.js.
function installEngineMixBalance() {
  const prototype = AudioManager?.prototype;
  if (!prototype || prototype.__kanoEngineMixBalance) return;
  const originalEngine = prototype.engine;
  if (typeof originalEngine !== 'function') return;
  prototype.engine = function engineWithKanoMix(signedSpeed, input) {
    const result = originalEngine.call(this, signedSpeed, input);
    try {
      if (this.ctx && this.roadNoiseGain?.gain) {
        const speed = Math.abs(Number(signedSpeed) || 0);
        const hasRecordedEngine = Boolean(this.engineAudio && !this.engineAudioFailed);
        const roadNoise = clamp(speed * 0.00011, 0.0001, 0.012) * (hasRecordedEngine ? 0.19 : 0.34);
        this.roadNoiseGain.gain.setTargetAtTime(roadNoise, this.ctx.currentTime, 0.10);
      }
      // audio.js already derives the MP3 volume from speed and acceleration.
      // Do not multiply its live value here on every frame: that fights the
      // AudioManager and can make environmental/engine balance fluctuate.
    } catch {
      // Audio can be closing when the page is hidden; never interrupt gameplay.
    }
    return result;
  };
  Object.defineProperty(prototype, '__kanoEngineMixBalance', { value: true });
}

installTextureRecovery();
installSceneReplayHooks();
installEngineMixBalance();

export class KanoAtmosphere {
  constructor({ renderer, game, mobile = false, enabled = true } = {}) {
    this.renderer3d = renderer;
    this.game = game;
    this.mobile = Boolean(mobile);
    this.enabled = Boolean(enabled);
    this.disposed = false;
    this.elapsed = 0;
    this.particleAccumulator = 0;
    this.panelRefreshAccumulator = 0;
    this.routinePhase = null;
    this.routineTimers = [];
    this.routineGeneration = 0;
    this.routineIndex = 0;
    this.routineBeats = [];
    this.routineWaitingForScene = null;
    this.routineSceneEntered = false;
    this.routineRetryTimer = null;
    this.routineHoldTimer = null;
    this.lastProfileKey = '';
    this.lastLifeScene = renderer?.lifeScene || 'road';
    this.pendingScene = pendingLifeScene;
    this.settings = getLifestyle();
    this.container = document.getElementById('game-container') || renderer?.canvas?.parentElement || document.body;
    this.original = this.snapshotRenderer();
    this.environmentSurfaces = {
      road: null, ground: null, roadTexture: null, groundTexture: null,
      shoulderTexture: null, shoulders: [], originalRoadMap: null,
      originalGroundMap: null, originalRoadColor: null, originalGroundColor: null,
      originalRoadRoughness: null, originalGroundRoughness: null,
      originalRoadMetalness: null, originalGroundMetalness: null,
    };
    this.scrollDistance = 0;
    this.installEnvironmentSurfaces();
    this.createSkyDome();
    this.createWeatherParticles();
    this.createInstancedInsects();
    this.createWorldLifePanel();
    this.sceneActivatedHandler = (event) => this.onSceneActivated(event?.detail?.scene);
    window.addEventListener('kano:life-scene-activated', this.sceneActivatedHandler);
    this.applyProfile({});
  }

  snapshotRenderer() {
    const scene = this.renderer3d?.scene;
    const snapshot = {
      background: scene?.background?.isColor ? scene.background.clone() : null,
      fogColor: scene?.fog?.color?.isColor ? scene.fog.color.clone() : null,
      fogNear: scene?.fog?.near,
      fogFar: scene?.fog?.far,
      toneMappingExposure: this.renderer3d?.renderer?.toneMappingExposure,
      lights: [],
    };
    scene?.traverse?.((object) => {
      if (object?.isLight && Number.isFinite(object.intensity)) {
        snapshot.lights.push({
          light: object,
          intensity: object.intensity,
          color: object.color?.isColor ? object.color.clone() : null,
          groundColor: object.groundColor?.isColor ? object.groundColor.clone() : null,
        });
      }
    });
    return snapshot;
  }

  makeGroundTexture() {
    const cached = TEXTURE_CACHE.get('kano-sand-ground');
    if (cached) return cached.clone();
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 256;
    const ctx = canvas.getContext('2d', { alpha: false });
    if (!ctx) return makeFallbackTexture('asphalt')?.clone?.() || null;
    ctx.fillStyle = '#b29b70';
    ctx.fillRect(0, 0, 256, 256);
    for (let i = 0; i < 1700; i += 1) {
      const palettes = ['#75664c', '#8a7a58', '#d0bd8a', '#77714d', '#c0a875'];
      ctx.globalAlpha = 0.12 + Math.random() * 0.24;
      ctx.fillStyle = palettes[i % palettes.length];
      const size = 0.35 + Math.random() * 2.0;
      ctx.fillRect(Math.random() * 256, Math.random() * 256, size, size);
    }
    ctx.globalAlpha = 0.14;
    ctx.strokeStyle = '#69583c';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(48, -8); ctx.bezierCurveTo(65, 78, 36, 174, 61, 264);
    ctx.moveTo(74, -8); ctx.bezierCurveTo(91, 78, 62, 174, 87, 264);
    ctx.stroke();
    ctx.globalAlpha = 1;
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    texture.needsUpdate = true;
    TEXTURE_CACHE.set('kano-sand-ground', texture);
    return texture.clone();
  }

  prepareSurfaceTexture(kind, repeatX, repeatY) {
    const source = kind === 'asphalt'
      ? makeFallbackTexture('asphalt')
      : this.makeGroundTexture();
    if (!source) return null;
    const texture = source.clone();
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    texture.repeat.set(repeatX, repeatY);
    texture.offset.set(0, 0);
    texture.anisotropy = Math.min(
      4,
      this.renderer3d?.renderer?.capabilities?.getMaxAnisotropy?.() || 1,
    );
    texture.needsUpdate = true;
    return texture;
  }

  installEnvironmentSurfaces() {
    const world = this.renderer3d?.world;
    if (!world?.traverse) return;
    const geometrySize = (object) => {
      const p = object?.geometry?.parameters;
      if (p && Number.isFinite(p.width) && Number.isFinite(p.height)) {
        return { width: p.width, height: p.height };
      }
      const attribute = object?.geometry?.attributes?.position;
      if (!attribute) return null;
      if (!object.geometry.boundingBox) object.geometry.computeBoundingBox();
      const box = object.geometry.boundingBox;
      return box ? { width: box.max.x - box.min.x, height: box.max.y - box.min.y } : null;
    };
    world.traverse((object) => {
      if (!object?.isMesh || !object.geometry || !object.material || Array.isArray(object.material)) return;
      const size = geometrySize(object);
      if (!size) return;
      if (!this.environmentSurfaces.road && Math.abs(size.width - 13) < 0.08 && Math.abs(size.height - 250) < 0.5) {
        this.environmentSurfaces.road = object;
      } else if (!this.environmentSurfaces.ground && Math.abs(size.width - 240) < 0.5 && Math.abs(size.height - 270) < 0.5) {
        this.environmentSurfaces.ground = object;
      }
    });

    const road = this.environmentSurfaces.road;
    if (road?.material && !Array.isArray(road.material)) {
      this.environmentSurfaces.originalRoadMap = road.material.map || null;
      this.environmentSurfaces.originalRoadColor = road.material.color?.clone?.() || null;
      this.environmentSurfaces.originalRoadRoughness = road.material.roughness;
      this.environmentSurfaces.originalRoadMetalness = road.material.metalness;
      const texture = this.prepareSurfaceTexture('asphalt', 3, 64);
      if (texture) {
        road.material.map = texture;
        road.material.color?.set?.(0xffffff);
        road.material.roughness = 0.94;
        road.material.metalness = 0;
        road.material.needsUpdate = true;
        road.name = road.name || 'KANO_PROCEDURAL_ASPHALT_ROAD';
        road.userData.kanoWorldLifeSurface = 'asphalt';
        this.environmentSurfaces.roadTexture = texture;
      }
    }

    const ground = this.environmentSurfaces.ground;
    if (ground?.material && !Array.isArray(ground.material)) {
      this.environmentSurfaces.originalGroundMap = ground.material.map || null;
      this.environmentSurfaces.originalGroundColor = ground.material.color?.clone?.() || null;
      this.environmentSurfaces.originalGroundRoughness = ground.material.roughness;
      this.environmentSurfaces.originalGroundMetalness = ground.material.metalness;
      const texture = this.prepareSurfaceTexture('ground', 28, 31);
      if (texture) {
        ground.material.map = texture;
        ground.material.color?.set?.(0xffffff);
        ground.material.roughness = 1;
        ground.material.metalness = 0;
        ground.material.needsUpdate = true;
        ground.name = ground.name || 'KANO_PROCEDURAL_SAND_GROUND';
        ground.userData.kanoWorldLifeSurface = 'sand';
        this.environmentSurfaces.groundTexture = texture;
      }
    }

    if (!world.getObjectByName('KANO_ROADSIDE_SHOULDER_LEFT')) {
      const shoulderTexture = this.prepareSurfaceTexture('ground', 3, 53);
      if (shoulderTexture) {
        const material = new THREE.MeshStandardMaterial({ map: shoulderTexture, color: 0xffffff, roughness: 1, metalness: 0 });
        this.environmentSurfaces.shoulderTexture = shoulderTexture;
        for (const side of [-1, 1]) {
          const shoulder = new THREE.Mesh(new THREE.PlaneGeometry(2.85, 250), material);
          shoulder.name = side < 0 ? 'KANO_ROADSIDE_SHOULDER_LEFT' : 'KANO_ROADSIDE_SHOULDER_RIGHT';
          shoulder.rotation.x = -Math.PI / 2;
          shoulder.position.set(side * 7.83, -0.023, -92);
          shoulder.frustumCulled = false;
          shoulder.renderOrder = -1;
          shoulder.userData.kanoWorldLifeOwned = true;
          world.add(shoulder);
          this.environmentSurfaces.shoulders.push(shoulder);
        }
      }
    }
  }

  makeSkyTexture() {
    const canvas = document.createElement('canvas');
    canvas.width = 1024;
    canvas.height = 512;
    const ctx = canvas.getContext('2d', { alpha: false });
    if (!ctx) return makeFallbackTexture('asphalt')?.clone?.() || null;
    const gradient = ctx.createLinearGradient(0, 0, 0, canvas.height);
    gradient.addColorStop(0, '#82b9d7');
    gradient.addColorStop(0.48, '#c6e1e9');
    gradient.addColorStop(0.76, '#e6dfcf');
    gradient.addColorStop(1, '#ceb98f');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    for (const cloud of [
      { x: 150, y: 132, w: 190, h: 35 },
      { x: 430, y: 182, w: 235, h: 39 },
      { x: 725, y: 112, w: 170, h: 32 },
      { x: 915, y: 215, w: 142, h: 27 },
      { x: 58, y: 232, w: 126, h: 30 },
    ]) {
      ctx.save();
      ctx.globalAlpha = 0.14;
      const cloudGradient = ctx.createRadialGradient(cloud.x, cloud.y, 4, cloud.x, cloud.y, cloud.w * 0.58);
      cloudGradient.addColorStop(0, '#73818a');
      cloudGradient.addColorStop(0.42, '#c7cdd0');
      cloudGradient.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = cloudGradient;
      ctx.beginPath();
      ctx.ellipse(cloud.x, cloud.y, cloud.w * 0.55, cloud.h, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.ClampToEdgeWrapping;
    texture.needsUpdate = true;
    return texture;
  }

  makeSunTexture() {
    const canvas = document.createElement('canvas');
    canvas.width = 128;
    canvas.height = 128;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    const gradient = ctx.createRadialGradient(64, 64, 3, 64, 64, 64);
    gradient.addColorStop(0, 'rgba(255,245,204,0.96)');
    gradient.addColorStop(0.18, 'rgba(255,222,148,0.72)');
    gradient.addColorStop(0.48, 'rgba(255,207,122,0.18)');
    gradient.addColorStop(1, 'rgba(255,207,122,0)');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, 128, 128);
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.needsUpdate = true;
    return texture;
  }

  createSkyDome() {
    const geometry = new THREE.SphereGeometry(225, this.mobile ? 24 : 40, this.mobile ? 12 : 20);
    const texture = this.makeSkyTexture();
    if (!texture) { geometry.dispose(); return; }
    const material = new THREE.MeshBasicMaterial({
      map: texture,
      color: 0xffffff,
      side: THREE.BackSide,
      fog: false,
      depthTest: false,
      depthWrite: false,
      toneMapped: false,
    });
    this.skyDome = new THREE.Mesh(geometry, material);
    this.skyDome.name = 'KANO_WORLD_LIFE_SKY_DOME';
    this.skyDome.frustumCulled = false;
    this.skyDome.renderOrder = -1000;
    this.skyDome.userData.kanoWorldLifeOwned = true;
    this.renderer3d.scene.add(this.skyDome);
    this.sunTexture = this.makeSunTexture();
    if (this.sunTexture) {
      this.sunSprite = new THREE.Sprite(new THREE.SpriteMaterial({
        map: this.sunTexture,
        transparent: true,
        opacity: 0.88,
        depthTest: false,
        depthWrite: false,
        fog: false,
        toneMapped: false,
      }));
      this.sunSprite.name = 'KANO_SAHEL_SUN_GLOW';
      this.sunSprite.scale.set(18, 18, 1);
      this.sunSprite.renderOrder = -999;
      this.sunSprite.frustumCulled = false;
      this.sunSprite.userData.kanoWorldLifeOwned = true;
      this.renderer3d.scene.add(this.sunSprite);
    }
    this.skyDome.onBeforeRender = (_renderer, scene, camera) => this.syncSky(scene, camera);
  }

  syncSky(scene, camera) {
    if (!this.skyDome || !camera) return;
    const roadScene = this.renderer3d?.lifeScene === 'road' && this.renderer3d?.world?.visible !== false;
    this.skyDome.visible = roadScene;
    if (scene?.background?.isColor && this.skyDome.material?.color) this.skyDome.material.color.copy(scene.background);
    this.skyDome.position.copy(camera.position);
    if (!this.sunSprite) return;
    const time = this.settings.timeOfDay === 'auto'
      ? this.inferDayPart(this.game?.s?.gameClockMinutes, this.game?.s?.night)
      : this.settings.timeOfDay;
    const env = String(this.game?.s?.environment || 'clear');
    const sunAllowed = roadScene && time !== 'night' && this.settings.season !== 'harmattan' && this.settings.season !== 'rainy' && !['harmattan', 'rainPuddles', 'muddy', 'badRoad'].includes(env);
    this.sunSprite.visible = sunAllowed;
    if (sunAllowed) {
      const direction = new THREE.Vector3(-0.28, time === 'morning' ? 0.30 : time === 'evening' ? 0.19 : 0.42, -1)
        .normalize()
        .applyQuaternion(camera.quaternion)
        .multiplyScalar(140);
      this.sunSprite.position.copy(camera.position).add(direction);
      if (time === 'evening') this.sunSprite.material.opacity = 0.64;
      else this.sunSprite.material.opacity = 0.88;
    }
  }

  updateSurfaceScroll(signedSpeed, delta) {
    const speed = Number(signedSpeed) || 0;
    this.scrollDistance += speed * delta * 0.28;
    for (const [texture, length] of [
      [this.environmentSurfaces?.roadTexture, 250],
      [this.environmentSurfaces?.groundTexture, 270],
      [this.environmentSurfaces?.shoulderTexture, 250],
    ]) {
      if (!texture) continue;
      texture.offset.y = ((this.scrollDistance / length * texture.repeat.y) % 1 + 1) % 1;
    }
  }

  createWeatherParticles() {
    const camera = this.renderer3d?.camera;
    if (!camera) return;
    const rainCount = this.mobile ? 82 : 150;
    const dustCount = this.mobile ? 100 : 190;

    this.rainParticles = Array.from({ length: rainCount }, () => ({
      x: rand(-14, 14), y: rand(-7, 10), z: rand(-25, -5), speed: rand(7, 14), drift: rand(-0.7, 0.7), length: rand(0.16, 0.36),
    }));
    this.rainPositions = new Float32Array(rainCount * 2 * 3);
    this.rainGeometry = new THREE.BufferGeometry();
    this.rainGeometry.setAttribute('position', new THREE.BufferAttribute(this.rainPositions, 3));
    this.rainMaterial = new THREE.LineBasicMaterial({ color: 0xd9edf9, transparent: true, opacity: 0.45, depthTest: false, depthWrite: false });
    this.rain = new THREE.LineSegments(this.rainGeometry, this.rainMaterial);
    this.rain.name = 'KANO_LIGHTWEIGHT_RAIN';
    this.rain.frustumCulled = false;
    this.rain.renderOrder = 988;
    this.rain.visible = false;
    camera.add(this.rain);

    this.dustParticles = Array.from({ length: dustCount }, () => ({
      x: rand(-16, 16), y: rand(-7, 12), z: rand(-24, -5), drift: rand(-0.6, 0.6), rise: rand(-0.06, 0.08), phase: rand(0, Math.PI * 2),
    }));
    this.dustPositions = new Float32Array(dustCount * 3);
    this.dustGeometry = new THREE.BufferGeometry();
    this.dustGeometry.setAttribute('position', new THREE.BufferAttribute(this.dustPositions, 3));
    this.dustMaterial = new THREE.PointsMaterial({ color: 0xd8c6a1, size: this.mobile ? 0.04 : 0.055, transparent: true, opacity: 0.32, depthTest: false, depthWrite: false, sizeAttenuation: true });
    this.dust = new THREE.Points(this.dustGeometry, this.dustMaterial);
    this.dust.name = 'KANO_LIGHTWEIGHT_HARMATTAN_DUST';
    this.dust.frustumCulled = false;
    this.dust.renderOrder = 987;
    this.dust.visible = false;
    camera.add(this.dust);
  }

  createInstancedInsects() {
    const camera = this.renderer3d?.camera;
    if (!camera) return;
    const mosquitoCount = this.mobile ? 5 : 10;
    const flyCount = this.mobile ? 4 : 8;
    this.insects = [];
    for (let i = 0; i < mosquitoCount; i += 1) this.insects.push(this.makeInsect('mosquito'));
    for (let i = 0; i < flyCount; i += 1) this.insects.push(this.makeInsect('fly'));

    const bodyGeometry = new THREE.SphereGeometry(1, 5, 4);
    const bodyMaterial = new THREE.MeshBasicMaterial({ color: 0xffffff, vertexColors: false, fog: false });
    this.insectBodies = new THREE.InstancedMesh(bodyGeometry, bodyMaterial, this.insects.length);
    this.insectBodies.name = 'KANO_INSTANCED_MOSQUITOES_AND_HOUSEFLIES';
    this.insectBodies.frustumCulled = false;
    this.insectBodies.renderOrder = 990;

    const wingGeometry = new THREE.SphereGeometry(1, 5, 4);
    const wingMaterial = new THREE.MeshBasicMaterial({ color: 0xe5e8dc, transparent: true, opacity: 0.48, depthTest: true, depthWrite: false, fog: false });
    this.insectWings = new THREE.InstancedMesh(wingGeometry, wingMaterial, this.insects.length * 2);
    this.insectWings.name = 'KANO_INSTANCED_INSECT_WINGS';
    this.insectWings.frustumCulled = false;
    this.insectWings.renderOrder = 991;

    this.dummy = new THREE.Object3D();
    const bodyColors = { mosquito: new THREE.Color(0x22272b), fly: new THREE.Color(0x57402b) };
    this.insects.forEach((insect, index) => {
      this.insectBodies.setColorAt(index, bodyColors[insect.kind]);
      insect.index = index;
    });
    if (this.insectBodies.instanceColor) this.insectBodies.instanceColor.needsUpdate = true;
    camera.add(this.insectBodies, this.insectWings);
    this.updateInsectMatrices(0);
  }

  makeInsect(kind) {
    const mosquito = kind === 'mosquito';
    return {
      kind,
      x: rand(-4.6, 4.6),
      y: rand(-1.6, 1.7),
      z: rand(-11, -3.4),
      phase: rand(0, Math.PI * 2),
      speed: rand(0.45, 1.2) * (mosquito ? 1.2 : 0.85),
      radius: rand(0.45, 1.3),
      scale: mosquito ? [0.025, 0.017, 0.070] : [0.045, 0.032, 0.052],
    };
  }

  updateInsectMatrices(dt) {
    if (!this.insectBodies || !this.insectWings || !this.dummy) return;
    const t = this.elapsed;
    for (let index = 0; index < this.insects.length; index += 1) {
      const bug = this.insects[index];
      bug.phase += dt * bug.speed;
      const x = bug.x + Math.sin(t * (bug.kind === 'fly' ? 1.7 : 1.1) + bug.phase) * bug.radius * 0.55;
      const y = bug.y + Math.sin(t * 2.3 + bug.phase) * 0.24;
      const z = bug.z + Math.cos(t * 0.8 + bug.phase) * 0.35;
      this.dummy.position.set(x, y, z);
      this.dummy.rotation.set(Math.sin(bug.phase) * 0.25, bug.phase * 0.5, Math.cos(bug.phase) * 0.2);
      this.dummy.scale.set(...bug.scale);
      this.dummy.updateMatrix();
      this.insectBodies.setMatrixAt(index, this.dummy.matrix);
      const wingScale = bug.kind === 'fly' ? [0.032, 0.006, 0.022] : [0.022, 0.004, 0.013];
      for (let side = -1; side <= 1; side += 2) {
        const wingIndex = index * 2 + (side > 0 ? 1 : 0);
        this.dummy.position.set(x + side * (bug.kind === 'fly' ? 0.031 : 0.018), y + 0.010, z);
        this.dummy.rotation.set(0.1, bug.phase * 0.3, side * (0.16 + Math.sin(t * 32 + bug.phase) * 0.13));
        this.dummy.scale.set(...wingScale);
        this.dummy.updateMatrix();
        this.insectWings.setMatrixAt(wingIndex, this.dummy.matrix);
      }
    }
    this.insectBodies.instanceMatrix.needsUpdate = true;
    this.insectWings.instanceMatrix.needsUpdate = true;
  }

  createWorldLifePanel() {
    if (typeof document === 'undefined' || !this.container) return;
    const oldPanel = document.getElementById('kano-world-life-panel');
    if (oldPanel) oldPanel.remove();
    this.panel = document.createElement('details');
    this.panel.id = 'kano-world-life-panel';
    this.panel.className = 'kano-world-life-panel';
    this.panel.innerHTML = `
      <summary>WORLD &amp; LIFE <span class="kano-world-life-dot">●</span></summary>
      <div class="kano-world-life-body">
        <label>Time of day
          <select data-world-time>
            <option value="auto">Auto day cycle</option>
            <option value="morning">Morning</option>
            <option value="afternoon">Afternoon</option>
            <option value="evening">Evening / sunset</option>
            <option value="night">Night</option>
          </select>
        </label>
        <label>Season / weather feel
          <select data-world-season>
            <option value="hotDry">Hot dry season</option>
            <option value="harmattan">Harmattan / dusty-cool</option>
            <option value="rainy">Rainy / humid season</option>
            <option value="cool">Cool season</option>
          </select>
        </label>
        <div class="kano-world-temp" data-world-temp>In-game climate</div>
        <div class="kano-world-clock" data-world-clock>Game time · 06:48</div>
        <small class="kano-world-routine-help">The routine follows the in-game clock. Pause driving before starting a scene sequence.</small>
        <label>Driver's home
          <select data-world-home>
            <option value="family">Family compound · no rent</option>
            <option value="rented">Rented room · weekly rent</option>
          </select>
        </label>
        <div class="kano-world-rent" data-world-rent></div>
        <div class="kano-world-actions">
          <button type="button" data-world-visit>Visit home</button>
          <button type="button" data-world-rent-pay>Pay one week's rent</button>
          <button type="button" data-world-road>Return to road</button>
          <button type="button" data-world-routine>Play routine for game time</button>
        </div>
        <small class="kano-world-save">Saved in this browser · local game save</small>
      </div>`;
    this.injectPanelStyles();
    this.container.appendChild(this.panel);

    this.panel.querySelector('[data-world-time]').value = this.settings.timeOfDay;
    this.panel.querySelector('[data-world-season]').value = this.settings.season;
    this.panel.querySelector('[data-world-home]').value = this.settings.home;
    this.panel.querySelector('[data-world-time]').addEventListener('change', (event) => {
      this.stopMorningRoutine();
      this.settings.timeOfDay = validTime.has(event.target.value) ? event.target.value : 'auto';
      this.routinePhase = null;
      persistLifestyle(this.settings);
      this.installClockOverride(this.game?.s);
      this.applyProfile(this.game?.s || {});
      this.refreshPanel();
    });
    this.panel.querySelector('[data-world-season]').addEventListener('change', (event) => {
      this.settings.season = validSeason.has(event.target.value) ? event.target.value : 'hotDry';
      persistLifestyle(this.settings);
      this.lastProfileKey = '';
      this.applyProfile(this.game?.s || {});
      this.refreshPanel();
    });
    this.panel.querySelector('[data-world-home]').addEventListener('change', (event) => {
      this.settings.home = validHome.has(event.target.value) ? event.target.value : 'family';
      persistLifestyle(this.settings);
      this.refreshPanel();
      this.toast(this.settings.home === 'family' ? 'Residence saved: family compound. No weekly rent.' : `Residence saved: rented room. One week costs ₦${RENT_PER_WEEK.toLocaleString()} in-game.`);
    });
    this.panel.querySelector('[data-world-visit]').addEventListener('click', () => this.visitHome());
    this.panel.querySelector('[data-world-rent-pay]').addEventListener('click', () => this.payRent());
    this.panel.querySelector('[data-world-road]').addEventListener('click', () => this.goToRoad());
    this.panel.querySelector('[data-world-routine]').addEventListener('click', () => this.playMorningRoutine());
    this.refreshPanel();
  }

  injectPanelStyles() {
    if (document.getElementById('kano-world-life-style')) return;
    const style = document.createElement('style');
    style.id = 'kano-world-life-style';
    style.textContent = `
      #kano-world-life-panel{position:fixed;top:calc(env(safe-area-inset-top,0px) + 8px);right:8px;z-index:1200;width:min(268px,calc(100vw - 16px));font:600 12px/1.35 system-ui,-apple-system,Segoe UI,sans-serif;color:#f8fafc;background:rgba(9,22,37,.91);border:1px solid rgba(130,186,210,.42);border-radius:12px;box-shadow:0 8px 25px rgba(0,0,0,.22);backdrop-filter:blur(9px);pointer-events:auto;overflow:hidden}
      #kano-world-life-panel summary{cursor:pointer;list-style:none;padding:10px 12px;letter-spacing:.08em;font-size:11px;user-select:none}
      #kano-world-life-panel summary::-webkit-details-marker{display:none}
      #kano-world-life-panel .kano-world-life-dot{color:#59d8ae;float:right;font-size:9px;margin-top:3px}
      #kano-world-life-panel .kano-world-life-body{display:grid;gap:8px;padding:0 10px 10px;max-height:min(65vh,500px);overflow:auto}
      #kano-world-life-panel label{display:grid;gap:4px;color:#cfdeeb;font-weight:600}
      #kano-world-life-panel select{width:100%;min-height:34px;border-radius:7px;border:1px solid #446176;background:#142b40;color:#fff;padding:5px 8px;font:600 12px system-ui;outline-offset:2px}
      #kano-world-life-panel .kano-world-temp,#kano-world-life-panel .kano-world-rent{color:#f6d49d;background:rgba(228,167,77,.10);border:1px solid rgba(228,167,77,.22);border-radius:7px;padding:7px 8px;font-size:11px}
      #kano-world-life-panel .kano-world-clock{color:#8fe7cb;background:rgba(48,164,127,.10);border:1px solid rgba(48,164,127,.25);border-radius:7px;padding:7px 8px;font-size:11px;font-weight:800}
      #kano-world-life-panel .kano-world-routine-help{color:#a9bbca;font-size:10px;font-weight:500;line-height:1.35}
      #kano-world-life-panel .kano-world-actions{display:grid;grid-template-columns:1fr 1fr;gap:6px}
      #kano-world-life-panel button{min-height:34px;border:1px solid #2f6c81;border-radius:7px;background:#0c5368;color:#fff;padding:6px 7px;font:700 11px/1.2 system-ui;cursor:pointer}
      #kano-world-life-panel button:hover{background:#11708a}
      #kano-world-life-panel [data-world-rent-pay]{background:#7a4a12;border-color:#b98233}
      #kano-world-life-panel .kano-world-save{color:#9ab1c2;font-size:10px;font-weight:500}
      @media(max-width:520px){#kano-world-life-panel{width:min(228px,calc(100vw - 16px));}#kano-world-life-panel summary{padding:8px 10px}#kano-world-life-panel .kano-world-life-body{gap:6px;padding:0 8px 8px}#kano-world-life-panel select{min-height:32px}}
      .kano-life-scene-fade{position:fixed;inset:0;z-index:1150;pointer-events:none;background:#101827;opacity:0;animation:kanoLifeSceneFade .38s ease-out both}
      @keyframes kanoLifeSceneFade{0%{opacity:0}40%{opacity:.32}100%{opacity:0}}
    `;
    document.head.appendChild(style);
  }

  getGameClockMinutes(state = this.game?.s || {}) {
    const raw = Number(state?.gameClockMinutes);
    return Number.isFinite(raw) ? ((raw % 1440) + 1440) % 1440 : 8 * 60;
  }

  getActiveDayPart(state = this.game?.s || {}) {
    const selected = this.settings?.timeOfDay || 'auto';
    if (selected !== 'auto' && validTime.has(selected)) return selected;
    return this.inferDayPart(this.getGameClockMinutes(state), state?.night);
  }

  formatGameClock(minutes = this.getGameClockMinutes()) {
    const total = Math.floor(((Number(minutes) || 0) % 1440 + 1440) % 1440);
    const hour = Math.floor(total / 60);
    const minute = total % 60;
    return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
  }

  refreshPanel() {
    if (!this.panel) return;
    const timeNames = { auto: 'Auto day cycle', morning: 'Morning', afternoon: 'Afternoon', evening: 'Evening / sunset', night: 'Night' };
    const season = SEASON_PROFILES[this.settings.season] || SEASON_PROFILES.hotDry;
    const state = this.game?.s || {};
    const activePart = this.getActiveDayPart(state);
    const clock = this.formatGameClock(this.getGameClockMinutes(state));
    const temperature = TIME_PROFILES[activePart]?.temperature?.[this.settings.season] || 'variable';
    const temp = this.panel.querySelector('[data-world-temp]');
    if (temp) temp.textContent = `${season.label} · ${timeNames[this.settings.timeOfDay] || 'Auto day cycle'} · simulated feel ${temperature}`;
    const clockLabel = this.panel.querySelector('[data-world-clock]');
    const worldDay = Math.max(1, Math.floor(Number(save.lifestyle?.worldDayNumber) || 1));
    if (clockLabel) clockLabel.textContent = `DAY ${worldDay} · GAME TIME ${clock} · ${activePart.toUpperCase()}${this.settings.timeOfDay === 'auto' ? ' · CLOCK-SYNCED' : ' · MANUAL TIME'}`;
    const routineButton = this.panel.querySelector('[data-world-routine]');
    if (routineButton && !this.routineRunning) routineButton.textContent = `Play ${activePart} routine`;
    const rent = this.panel.querySelector('[data-world-rent]');
    const pay = this.panel.querySelector('[data-world-rent-pay]');
    if (rent) rent.textContent = this.settings.home === 'family'
      ? 'Family compound: no rent. Return home to the household scene.'
      : `Rented room: ₦${RENT_PER_WEEK.toLocaleString()} per in-game week · ${this.settings.rentWeeksPaid} week(s) paid.`;
    if (pay) pay.hidden = this.settings.home !== 'rented';
  }

  toast(message) {
    try {
      if (typeof this.game?.ui?.toast === 'function') this.game.ui.toast(message);
      else if (typeof this.game?.ui?.showMissionToast === 'function') this.game.ui.showMissionToast(message);
    } catch { /* UI notification must never interrupt simulation. */ }
  }

  inferDayPart(clockMinutes, nightFlag) {
    const minutes = Number.isFinite(Number(clockMinutes)) ? Number(clockMinutes) : 8 * 60;
    const hour = ((Math.floor(minutes / 60) % 24) + 24) % 24;
    if (hour >= 5 && hour < 11) return 'morning';
    if (hour >= 11 && hour < 16) return 'afternoon';
    if (hour >= 16 && hour < 19) return 'evening';
    return nightFlag ? 'night' : hour >= 19 || hour < 5 ? 'night' : 'morning';
  }

  installClockOverride(state) {
    if (!state || typeof state !== 'object') return;
    let bridge = state.__kanoClockBridge;
    if (bridge && typeof bridge === 'object') {
      bridge.owner = this;
      return;
    }
    bridge = {
      owner: this,
      autoNight: Boolean(state.night),
      autoMinutes: Number.isFinite(state.gameClockMinutes) ? state.gameClockMinutes : 408,
    };
    try {
      Object.defineProperty(state, '__kanoClockBridge', {
        value: bridge, enumerable: false, configurable: true,
      });
      Object.defineProperty(state, 'night', {
        enumerable: true, configurable: true,
        get: () => {
          const owner = bridge.owner;
          const choice = owner?.settings?.timeOfDay || 'auto';
          return choice === 'auto' ? bridge.autoNight : choice === 'night';
        },
        set: (value) => { bridge.autoNight = Boolean(value); },
      });
      Object.defineProperty(state, 'gameClockMinutes', {
        enumerable: true, configurable: true,
        get: () => {
          const owner = bridge.owner;
          const choice = owner?.settings?.timeOfDay || 'auto';
          if (choice === 'auto') return bridge.autoMinutes;
          const fixed = { morning: 8 * 60, afternoon: 14 * 60, evening: 18 * 60, night: 22 * 60 }[choice];
          return Number.isFinite(fixed) ? fixed : bridge.autoMinutes;
        },
        set: (value) => { if (Number.isFinite(Number(value))) bridge.autoMinutes = Number(value); },
      });
    } catch (error) {
      console.warn('[Kano Life] Could not install manual time-of-day state.', error);
    }
  }

  visitHome() {
    const scene = this.settings.home === 'family' ? 'household' : 'bedroom';
    this.requestScene(scene);
    this.toast(this.settings.home === 'family' ? 'Family compound · household routine.' : 'Rented room · your saved home scene.');
  }

  goToRoad() {
    this.stopMorningRoutine();
    this.requestScene('road');
  }

  payRent() {
    if (this.settings.home !== 'rented') return;
    if ((Number(save.money) || 0) < RENT_PER_WEEK) {
      this.toast(`Not enough banked money. One in-game week of rent is ₦${RENT_PER_WEEK.toLocaleString()}.`);
      return;
    }
    save.money = Math.max(0, Math.floor(Number(save.money) || 0) - RENT_PER_WEEK);
    this.settings.rentWeeksPaid += 1;
    this.settings.rentLedger.push({ amount: RENT_PER_WEEK, week: this.settings.rentWeeksPaid, date: new Date().toISOString() });
    this.settings.rentLedger = this.settings.rentLedger.slice(-20);
    persistLifestyle(this.settings);
    this.refreshPanel();
    this.toast(`Rent paid: ₦${RENT_PER_WEEK.toLocaleString()} · week ${this.settings.rentWeeksPaid}.`);
  }

  stopMorningRoutine() {
    // Every run gets a generation token so an already-queued callback from a
    // previous routine cannot jump the player into a stale scene.
    this.routineGeneration = (this.routineGeneration || 0) + 1;
    for (const timer of this.routineTimers || []) clearTimeout(timer);
    this.routineTimers = [];
    this.routineRetryTimer = null;
    this.routineHoldTimer = null;
    this.routineRunning = false;
    this.routineWaitingForScene = null;
    this.routineSceneEntered = false;
    this.routinePhase = null;
    const button = this.panel?.querySelector('[data-world-routine]');
    if (button) button.textContent = `Play ${this.getActiveDayPart()} routine`;
  }

  getRoutineBeatsForPhase(phase) {
    const familyHome = this.settings.home === 'family';
    const homeScene = familyHome ? 'household' : 'bedroom';
    const homeLabel = familyHome ? 'family compound' : 'rented room';

    const routines = {
      morning: [
        { scene: 'bedroom', message: 'Morning · wake up, wash and prepare for the day.', holdMs: 2600 },
        ...(familyHome ? [{ scene: 'household', message: 'Family compound · greet the household and prepare to leave.', holdMs: 2600 }] : []),
        { scene: 'breakfast', message: 'Breakfast stop · akara and pap before the driving shift.', holdMs: 2800 },
        { scene: 'garage', message: 'Parking garage · collect and inspect the secured keke.', holdMs: 3000 },
        { scene: 'road', message: 'Morning shift · begin taking roadside passengers.', holdMs: 1400 },
      ],
      afternoon: [
        { scene: 'road', message: 'Afternoon work shift · continue collecting fares in Kano.', holdMs: 2100 },
        { scene: 'street', message: 'Market-side stop · midday traffic and roadside traders.', holdMs: 2400 },
        { scene: 'breakfast', message: 'Roadside food stall · take a short lunch and water break.', holdMs: 2600 },
        { scene: 'road', message: 'Return to the route · afternoon passenger demand continues.', holdMs: 1500 },
      ],
      evening: [
        { scene: 'road', message: 'Evening shift · commuter traffic rises as daylight fades.', holdMs: 2200 },
        { scene: 'street', message: 'Evening market · vendors pack up and traffic slows.', holdMs: 2500 },
        { scene: 'garage', message: 'End of shift · bring the keke in and secure it for the evening.', holdMs: 2800 },
        { scene: homeScene, message: `Return to the ${homeLabel} · evening household time.`, holdMs: 2600 },
      ],
      night: [
        { scene: 'road', message: 'Night trip · finish the last fare and travel carefully.', holdMs: 2300 },
        { scene: 'garage', message: 'Night parking · secure the keke before going indoors.', holdMs: 2800 },
        ...(familyHome ? [{ scene: 'household', message: 'Family compound · return quietly and check in with the household.', holdMs: 2500 }] : []),
        { scene: 'bedroom', message: 'Rest time · settle in and recover energy for the next day.', holdMs: 3000 },
      ],
    };

    return (routines[phase] || routines.morning).map((beat) => ({ ...beat }));
  }

  playMorningRoutine() {
    if (!this.renderer3d || this.disposed) return;
    if (this.game?.state === 'PLAY') {
      this.toast('Pause driving from the game menu first. The routine follows the paused in-game clock and will not interrupt an active drive.');
      return;
    }

    this.stopMorningRoutine();
    const state = this.game?.s || {};
    const phase = this.getActiveDayPart(state);
    const clock = this.formatGameClock(this.getGameClockMinutes(state));
    this.routinePhase = phase;
    this.routineBeats = this.getRoutineBeatsForPhase(phase);
    this.routineIndex = 0;
    this.routineRunning = true;
    const routineButton = this.panel?.querySelector('[data-world-routine]');
    if (routineButton) routineButton.textContent = `Playing ${phase} routine…`;
    this.refreshPanel();
    this.toast(`Starting ${phase} routine at ${clock}. Scene order follows the in-game time and selected residence.`);

    // Crucially, this no longer forces the global clock/lighting to morning.
    // Auto mode uses the live game clock; manual mode uses the selected phase.
    // Each beat waits for the requested scene to become active before holding
    // it on screen and progressing to the next beat.
    const generation = this.routineGeneration;
    this.advanceMorningRoutine(generation);
  }

  advanceMorningRoutine(generation = this.routineGeneration) {
    if (this.disposed || !this.routineRunning || generation !== this.routineGeneration) return;
    const beat = this.routineBeats[this.routineIndex];
    if (!beat) {
      this.routineRunning = false;
      this.routineWaitingForScene = null;
      this.routineSceneEntered = false;
      this.routineRetryTimer = null;
      this.routineHoldTimer = null;
      const phase = this.routinePhase || this.getActiveDayPart();
      this.routinePhase = null;
      this.refreshPanel();
      this.toast(`${phase[0].toUpperCase()}${phase.slice(1)} routine complete. Your game clock was not advanced by the scene presentation.`);
      return;
    }

    this.routineWaitingForScene = beat.scene;
    this.routineSceneEntered = false;
    this.toast(beat.message);
    this.requestScene(beat.scene, true);

    // setLifeScene is normally synchronous. This branch also handles scenes
    // that were already active, which do not emit a transition event.
    if (this.renderer3d?.lifeScene === beat.scene) {
      this.onMorningRoutineSceneEntered(beat.scene, generation);
      return;
    }
    this.scheduleMorningRoutineRetry(beat.scene, generation);
  }

  scheduleMorningRoutineRetry(scene, generation) {
    if (this.routineRetryTimer) clearTimeout(this.routineRetryTimer);
    this.routineRetryTimer = setTimeout(() => {
      this.routineRetryTimer = null;
      if (this.disposed || !this.routineRunning || generation !== this.routineGeneration) return;
      if (this.routineWaitingForScene !== scene) return;
      if (this.renderer3d?.lifeScene === scene) {
        this.onMorningRoutineSceneEntered(scene, generation);
        return;
      }
      // requestScene preserves this pending scene when the renderer is not yet
      // ready. Never move to the next beat just because a timer elapsed.
      this.requestScene(scene, true);
      if (this.renderer3d?.lifeScene === scene) {
        this.onMorningRoutineSceneEntered(scene, generation);
        return;
      }
      this.scheduleMorningRoutineRetry(scene, generation);
    }, 300);
    this.routineTimers.push(this.routineRetryTimer);
  }

  onMorningRoutineSceneEntered(scene, generation = this.routineGeneration) {
    if (this.disposed || !this.routineRunning || generation !== this.routineGeneration) return;
    if (scene !== this.routineWaitingForScene || this.routineSceneEntered) return;
    const beat = this.routineBeats[this.routineIndex];
    if (!beat || beat.scene !== scene) return;

    this.routineSceneEntered = true;
    if (this.routineRetryTimer) clearTimeout(this.routineRetryTimer);
    this.routineRetryTimer = null;
    if (this.routineHoldTimer) clearTimeout(this.routineHoldTimer);

    this.routineHoldTimer = setTimeout(() => {
      this.routineHoldTimer = null;
      if (this.disposed || !this.routineRunning || generation !== this.routineGeneration) return;
      this.routineIndex += 1;
      this.advanceMorningRoutine(generation);
    }, beat.holdMs);
    this.routineTimers.push(this.routineHoldTimer);
  }

  requestScene(scene, cinematic = false) {
    if (!SCENES.has(scene)) return false;
    this.pendingScene = scene;
    pendingLifeScene = scene;
    // Renderer3D's setLifeScene hook fades all successful scene transitions.
    // Keeping the transition effect in one place avoids doubled overlays.
    return this.applyPendingScene();
  }

  showSceneFade() {
    if (!document?.body) return;
    const overlay = document.createElement('div');
    overlay.className = 'kano-life-scene-fade';
    document.body.appendChild(overlay);
    setTimeout(() => overlay.remove(), 420);
  }

  applyPendingScene() {
    const renderer = this.renderer3d;
    const requested = this.pendingScene || pendingLifeScene;
    if (!renderer || !SCENES.has(requested)) return false;
    if (!renderer.ready || !renderer.player || !renderer.garageGroup || typeof renderer.setLifeScene !== 'function') return false;
    try {
      renderer.setLifeScene(requested);
      this.pendingScene = null;
      if (pendingLifeScene === requested) pendingLifeScene = null;
      return true;
    } catch (error) {
      console.warn('[Kano Life] life-scene request queued after renderer error.', error);
      return false;
    }
  }

  onSceneActivated(scene) {
    if (!SCENES.has(scene)) return;
    this.lastLifeScene = scene;
    this.lastProfileKey = '';
    this.showSceneFade();
    // Scene activation, not a fixed elapsed timer, is the source of truth for
    // the morning sequence. This prevents blank or skipped 3D story beats.
    if (this.routineRunning && scene === this.routineWaitingForScene) {
      this.onMorningRoutineSceneEntered(scene, this.routineGeneration);
    }
  }

  profileFor(state = {}) {
    const time = this.settings.timeOfDay === 'auto'
      ? this.inferDayPart(state.gameClockMinutes, state.night)
      : this.settings.timeOfDay;
    const season = SEASON_PROFILES[this.settings.season] || SEASON_PROFILES.hotDry;
    const timeProfile = TIME_PROFILES[time] || TIME_PROFILES.morning;
    const env = String(state.environment || 'clear');
    const scene = this.renderer3d?.lifeScene || 'road';
    const profile = {
      time,
      season: this.settings.season,
      env,
      scene,
      background: timeProfile.background,
      fog: timeProfile.fog,
      fogNear: timeProfile.fogNear,
      fogFar: timeProfile.fogFar,
      hemi: timeProfile.hemi * season.hemi,
      directional: timeProfile.directional * season.directional,
      light: timeProfile.light,
    };
    const bg = new THREE.Color(profile.background).lerp(new THREE.Color(season.backgroundBlend), this.settings.season === 'hotDry' ? 0.055 : 0.11);
    const fog = new THREE.Color(profile.fog).lerp(new THREE.Color(season.fogBlend), this.settings.season === 'hotDry' ? 0.10 : 0.18);
    if (this.settings.season === 'harmattan' || env === 'harmattan' || env === 'badRoad' || env === 'muddy') {
      fog.lerp(new THREE.Color(0xc5b99e), 0.34);
      profile.fogNear = Math.min(profile.fogNear, 20);
      profile.fogFar = Math.min(profile.fogFar, 125);
    }
    if (this.settings.season === 'rainy' || env === 'rainPuddles') {
      fog.lerp(new THREE.Color(0x9db5c0), 0.20);
      profile.fogNear = Math.min(profile.fogNear, 30);
      profile.fogFar = Math.min(profile.fogFar, 155);
    }
    if (scene !== 'road') {
      bg.lerp(new THREE.Color(0xdbc6a5), 0.035);
      profile.hemi *= 1.02;
    }
    profile.backgroundColor = bg;
    profile.fogColor = fog;
    profile.temperature = timeProfile.temperature[this.settings.season] || 'variable';
    profile.key = `${time}|${this.settings.season}|${env}|${scene}`;
    return profile;
  }

  applyProfile(state = {}) {
    if (!this.renderer3d?.scene) return;
    const scene = this.renderer3d.scene;
    const profile = this.profileFor(state);
    if (profile.key === this.lastProfileKey) return;
    this.lastProfileKey = profile.key;

    if (scene.background?.isColor) scene.background.copy(profile.backgroundColor);
    if (scene.fog?.color?.isColor) {
      scene.fog.color.copy(profile.fogColor);
      scene.fog.near = profile.fogNear;
      scene.fog.far = profile.fogFar;
    }
    const lightTint = new THREE.Color(profile.light);
    for (const item of this.original?.lights || []) {
      const light = item.light;
      if (!light || light.parent === null) continue;
      if (light.isHemisphereLight) {
        light.intensity = item.intensity * profile.hemi;
        if (item.color && light.color) light.color.copy(item.color).lerp(lightTint, profile.time === 'evening' ? 0.18 : profile.time === 'night' ? 0.10 : 0.035);
        if (item.groundColor && light.groundColor) light.groundColor.copy(item.groundColor).lerp(new THREE.Color(profile.background), 0.04);
      } else if (light.isDirectionalLight) {
        light.intensity = item.intensity * profile.directional;
        if (item.color && light.color) light.color.copy(item.color).lerp(lightTint, profile.time === 'evening' ? 0.24 : profile.time === 'night' ? 0.18 : 0.055);
      } else if (light.isPointLight && profile.time === 'night') {
        light.intensity = item.intensity * 1.05;
      } else {
        light.intensity = item.intensity;
      }
    }

    // Small exposure lift only. The existing GLB material stack remains intact.
    const webgl = this.renderer3d.renderer;
    if (webgl && 'toneMappingExposure' in webgl) {
      webgl.toneMappingExposure = 1.04;
    }
    if (this.rain) this.rainMaterial.opacity = this.settings.season === 'rainy' || profile.env === 'rainPuddles' ? 0.50 : 0.40;
    if (this.dustMaterial) this.dustMaterial.opacity = this.settings.season === 'harmattan' || ['harmattan', 'badRoad', 'muddy'].includes(profile.env) ? 0.36 : 0.27;
    this.refreshPanel();
  }

  updateWeatherParticles(delta, state, gameState) {
    const sceneName = this.renderer3d?.lifeScene || 'road';
    const activeScene = sceneName === 'road' || ['household', 'breakfast', 'bedroom', 'street'].includes(sceneName);
    const inGame = gameState === 'PLAY' && !state.event;
    const env = String(state.environment || 'clear');
    const rainy = this.enabled && activeScene && (this.settings.season === 'rainy' || env === 'rainPuddles') && (sceneName === 'road' || inGame);
    const dusty = this.enabled && activeScene && (this.settings.season === 'harmattan' || ['harmattan', 'badRoad', 'muddy'].includes(env)) && (sceneName === 'road' || inGame);
    if (this.rain) this.rain.visible = rainy;
    if (this.dust) this.dust.visible = dusty;
    if (!rainy && !dusty) return;
    this.particleAccumulator += delta;
    if (this.particleAccumulator < (this.mobile ? 0.075 : 0.045)) return;
    const dt = Math.min(this.particleAccumulator, 0.12);
    this.particleAccumulator = 0;

    if (rainy && this.rain) {
      let offset = 0;
      for (const item of this.rainParticles) {
        item.y -= item.speed * dt;
        item.x += item.drift * dt;
        if (item.y < -8) { item.y = rand(8, 14); item.x = rand(-15, 15); item.z = rand(-25, -5); }
        if (item.x > 16) item.x = -16;
        if (item.x < -16) item.x = 16;
        const tailY = item.y + item.length;
        this.rainPositions[offset++] = item.x;
        this.rainPositions[offset++] = item.y;
        this.rainPositions[offset++] = item.z;
        this.rainPositions[offset++] = item.x - 0.055;
        this.rainPositions[offset++] = tailY;
        this.rainPositions[offset++] = item.z;
      }
      this.rainGeometry.attributes.position.needsUpdate = true;
      this.rainGeometry.computeBoundingSphere();
    }
    if (dusty && this.dust) {
      let offset = 0;
      for (const item of this.dustParticles) {
        item.x += (item.drift + 0.12) * dt;
        item.y += item.rise * dt + Math.sin(this.elapsed * 0.7 + item.phase) * 0.004;
        item.phase += dt * 0.25;
        if (item.x > 18) item.x = -18;
        if (item.x < -18) item.x = 18;
        if (item.y > 14) item.y = -7;
        if (item.y < -8) item.y = 13;
        this.dustPositions[offset++] = item.x;
        this.dustPositions[offset++] = item.y;
        this.dustPositions[offset++] = item.z;
      }
      this.dustGeometry.attributes.position.needsUpdate = true;
      this.dustGeometry.computeBoundingSphere();
    }
  }

  update(dt, state = {}, gameState = this.game?.state) {
    if (this.disposed) return;
    const delta = clamp(Number(dt) || 0, 0, 0.05);
    this.elapsed += delta;
    this.installClockOverride(state);
    this.panelRefreshAccumulator += delta;
    if (this.panelRefreshAccumulator >= 1) {
      this.panelRefreshAccumulator = 0;
      this.refreshPanel();
    }
    if (this.pendingScene && this.renderer3d?.ready) this.applyPendingScene();
    else if (pendingLifeScene && this.renderer3d?.ready) this.applyPendingScene();
    this.applyProfile(state);
    this.updateWeatherParticles(delta, state, gameState);
    if (this.renderer3d?.lifeScene === 'road' && this.renderer3d?.world?.visible !== false) {
      const signedSpeed = Number.isFinite(state.signedSpeed)
        ? state.signedSpeed
        : state.reverse ? -Math.abs(Number(state.speed) || 0) : Math.abs(Number(state.speed) || 0);
      this.updateSurfaceScroll(signedSpeed, delta);
    }
    this.syncSky(this.renderer3d?.scene, this.renderer3d?.camera);

    const scene = this.renderer3d?.lifeScene || 'road';
    const environmentAllowsInsects = ['road', 'household', 'breakfast', 'bedroom', 'street'].includes(scene);
    const bugsOn = this.enabled && this.settings.insects && environmentAllowsInsects;
    const part = this.settings.timeOfDay === 'auto' ? this.inferDayPart(state.gameClockMinutes, state.night) : this.settings.timeOfDay;
    const fliesOn = bugsOn && this.settings.season !== 'harmattan' && ['morning', 'afternoon', 'evening'].includes(part) && ['road', 'breakfast', 'street', 'household'].includes(scene);
    if (this.insectBodies) this.insectBodies.visible = bugsOn;
    if (this.insectWings) this.insectWings.visible = bugsOn;
    if (bugsOn) this.updateInsectMatrices(delta);
    if (this.insects) {
      for (const insect of this.insects) {
        insect.visible = insect.kind === 'mosquito' ? bugsOn : fliesOn;
      }
      // Hide only the fly instances by scaling their entries to near zero when
      // conditions suppress them. Both species remain one body draw call.
      if (this.insectBodies && this.insectWings) {
        const count = this.insects.length;
        for (let i = 0; i < count; i += 1) {
          const insect = this.insects[i];
          if (insect.kind === 'fly' && !fliesOn) {
            this.dummy.position.set(0, 0, 0);
            this.dummy.scale.setScalar(0.0001);
            this.dummy.rotation.set(0, 0, 0);
            this.dummy.updateMatrix();
            this.insectBodies.setMatrixAt(i, this.dummy.matrix);
            for (let side = 0; side < 2; side += 1) this.insectWings.setMatrixAt(i * 2 + side, this.dummy.matrix);
          }
        }
        this.insectBodies.instanceMatrix.needsUpdate = true;
        this.insectWings.instanceMatrix.needsUpdate = true;
      }
    }
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.stopMorningRoutine();
    if (typeof window !== 'undefined' && this.sceneActivatedHandler) window.removeEventListener('kano:life-scene-activated', this.sceneActivatedHandler);
    this.panel?.remove();
    this.panel = null;
    const camera = this.renderer3d?.camera;
    for (const object of [this.rain, this.dust, this.insectBodies, this.insectWings, this.skyDome, this.sunSprite]) {
      try { if (object?.parent) object.parent.remove(object); } catch {}
    }
    for (const shoulder of this.environmentSurfaces?.shoulders || []) {
      try { shoulder.parent?.remove(shoulder); shoulder.geometry?.dispose?.(); } catch {}
    }
    const road = this.environmentSurfaces?.road;
    if (road?.material && !Array.isArray(road.material)) {
      road.material.map = this.environmentSurfaces.originalRoadMap;
      if (this.environmentSurfaces.originalRoadColor && road.material.color) road.material.color.copy(this.environmentSurfaces.originalRoadColor);
      if (Number.isFinite(this.environmentSurfaces.originalRoadRoughness)) road.material.roughness = this.environmentSurfaces.originalRoadRoughness;
      if (Number.isFinite(this.environmentSurfaces.originalRoadMetalness)) road.material.metalness = this.environmentSurfaces.originalRoadMetalness;
      road.material.needsUpdate = true;
    }
    const ground = this.environmentSurfaces?.ground;
    if (ground?.material && !Array.isArray(ground.material)) {
      ground.material.map = this.environmentSurfaces.originalGroundMap;
      if (this.environmentSurfaces.originalGroundColor && ground.material.color) ground.material.color.copy(this.environmentSurfaces.originalGroundColor);
      if (Number.isFinite(this.environmentSurfaces.originalGroundRoughness)) ground.material.roughness = this.environmentSurfaces.originalGroundRoughness;
      if (Number.isFinite(this.environmentSurfaces.originalGroundMetalness)) ground.material.metalness = this.environmentSurfaces.originalGroundMetalness;
      ground.material.needsUpdate = true;
    }
    for (const resource of [this.rainGeometry, this.rainMaterial, this.dustGeometry, this.dustMaterial]) {
      try { resource?.dispose?.(); } catch {}
    }
    const insectGeometry = this.insectBodies?.geometry;
    const insectMaterial = this.insectBodies?.material;
    const wingGeometry = this.insectWings?.geometry;
    const wingMaterial = this.insectWings?.material;
    for (const resource of [
      insectGeometry, insectMaterial, wingGeometry, wingMaterial,
      this.skyDome?.geometry, this.skyDome?.material, this.skyDome?.material?.map,
      this.sunSprite?.material, this.sunTexture,
      this.environmentSurfaces?.roadTexture, this.environmentSurfaces?.groundTexture,
      this.environmentSurfaces?.shoulderTexture,
      this.environmentSurfaces?.shoulders?.[0]?.material,
    ]) {
      try { resource?.dispose?.(); } catch {}
    }

    const scene = this.renderer3d?.scene;
    if (scene && this.original) {
      if (this.original.background && scene.background?.isColor) scene.background.copy(this.original.background);
      if (this.original.fogColor && scene.fog?.color?.isColor) {
        scene.fog.color.copy(this.original.fogColor);
        scene.fog.near = this.original.fogNear;
        scene.fog.far = this.original.fogFar;
      }
      for (const item of this.original.lights) {
        if (!item.light || item.light.parent === null) continue;
        item.light.intensity = item.intensity;
        if (item.color && item.light.color) item.light.color.copy(item.color);
        if (item.groundColor && item.light.groundColor) item.light.groundColor.copy(item.groundColor);
      }
      if (this.renderer3d.renderer && 'toneMappingExposure' in this.renderer3d.renderer && Number.isFinite(this.original.toneMappingExposure)) this.renderer3d.renderer.toneMappingExposure = this.original.toneMappingExposure;
    }
  }
}

export default KanoAtmosphere;
