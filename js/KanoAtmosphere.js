import * as THREE from 'three';

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const randomBetween = (min, max) => min + Math.random() * (max - min);
const mod = (value, divisor) => ((value % divisor) + divisor) % divisor;

const ATMOSPHERE_PROFILES = {
  night: {
    background: 0x202c43,
    fog: 0x2d394e,
    fogNear: 28,
    fogFar: 128,
    hemiFactor: 0.52,
    directionalFactor: 0.19,
    tint: 0x8199c4,
  },
  harmattan: {
    background: 0xbab5a5,
    fog: 0xbab5a5,
    fogNear: 13,
    fogFar: 88,
    hemiFactor: 0.90,
    directionalFactor: 0.66,
    tint: 0xd1c6ac,
  },
  rain: {
    background: 0x8098a5,
    fog: 0x8599a5,
    fogNear: 25,
    fogFar: 142,
    hemiFactor: 0.77,
    directionalFactor: 0.55,
    tint: 0x9eafbd,
  },
  dustyRoad: {
    background: 0xaab3ae,
    fog: 0xaab3ae,
    fogNear: 35,
    fogFar: 160,
    hemiFactor: 0.91,
    directionalFactor: 0.76,
    tint: 0xb8b4a1,
  },
};

const FALLBACK_PATHS = new Map([
  ['/assets/environment/ground/asphalt.jpg', 'asphalt'],
  ['/assets/environment/ground/market-stall.jpg', 'marketStall'],
]);
const canvasCache = new Map();
const LOADER_PATCH_FLAG = '__kanoLifeProceduralEnvironmentFallback';

function seededRandom(seed) {
  let value = seed >>> 0;
  return () => {
    value = (value * 1664525 + 1013904223) >>> 0;
    return value / 4294967296;
  };
}

function drawWrappedDot(ctx, x, y, radius, width, height, color, alpha = 1) {
  const xs = [x];
  const ys = [y];
  if (x - radius < 0) xs.push(x + width);
  if (x + radius > width) xs.push(x - width);
  if (y - radius < 0) ys.push(y + height);
  if (y + radius > height) ys.push(y - height);

  ctx.fillStyle = color;
  ctx.globalAlpha = alpha;
  for (const px of xs) {
    for (const py of ys) {
      ctx.beginPath();
      ctx.arc(px, py, radius, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.globalAlpha = 1;
}

function makeRoadCanvas() {
  const cached = canvasCache.get('asphalt');
  if (cached) return cached;

  const size = 512;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d', { alpha: false });
  if (!ctx) return canvas;

  const image = ctx.createImageData(size, size);
  const TAU = Math.PI * 2;
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const broad = Math.sin(TAU * (x * 3 + y * 5) / size) * 2.4 +
        Math.cos(TAU * (x * 7 - y * 2) / size) * 1.8 +
        Math.sin(TAU * (x * 13 + y * 11) / size) * 1.1;
      const grain = Math.sin(TAU * (x * 79 + y * 131) / size) * 3.8 +
        Math.cos(TAU * (x * 137 - y * 97) / size) * 3.1 +
        Math.sin(TAU * (x * 181 + y * 151) / size) * 2.0;
      const v = broad + grain;
      const i = (y * size + x) * 4;
      image.data[i] = clamp(49 + v, 0, 255);
      image.data[i + 1] = clamp(56 + v, 0, 255);
      image.data[i + 2] = clamp(60 + v, 0, 255);
      image.data[i + 3] = 255;
    }
  }
  ctx.putImageData(image, 0, 0);

  // Very subtle longitudinal tyre-wear bands; no painted lane markings here.
  const wear = ctx.createLinearGradient(0, 0, size, 0);
  wear.addColorStop(0, 'rgba(10,13,15,0.12)');
  wear.addColorStop(0.17, 'rgba(0,0,0,0.02)');
  wear.addColorStop(0.34, 'rgba(5,7,8,0.12)');
  wear.addColorStop(0.50, 'rgba(255,255,255,0.015)');
  wear.addColorStop(0.66, 'rgba(4,6,7,0.13)');
  wear.addColorStop(0.83, 'rgba(0,0,0,0.02)');
  wear.addColorStop(1, 'rgba(10,13,15,0.12)');
  ctx.fillStyle = wear;
  ctx.fillRect(0, 0, size, size);

  const rand = seededRandom(0x4b414e4f);
  // Tile-wrapped aggregate flecks avoid a visible hard seam at texture edges.
  for (let i = 0; i < 2600; i += 1) {
    const x = rand() * size;
    const y = rand() * size;
    const radius = 0.35 + rand() * 1.15;
    const light = rand() > 0.52;
    drawWrappedDot(
      ctx,
      x,
      y,
      radius,
      size,
      size,
      light ? '#b3b4ad' : '#171c1f',
      light ? 0.10 + rand() * 0.15 : 0.12 + rand() * 0.16,
    );
  }

  // Small, restrained repair patches add scale without distracting from traffic.
  for (let i = 0; i < 9; i += 1) {
    const x = 22 + rand() * (size - 44);
    const y = 22 + rand() * (size - 44);
    const w = 18 + rand() * 52;
    const h = 8 + rand() * 28;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate((rand() - 0.5) * 0.28);
    ctx.fillStyle = `rgba(14,18,20,${0.04 + rand() * 0.08})`;
    ctx.fillRect(-w / 2, -h / 2, w, h);
    ctx.strokeStyle = 'rgba(190,187,174,0.09)';
    ctx.lineWidth = 1;
    ctx.strokeRect(-w / 2, -h / 2, w, h);
    ctx.restore();
  }

  canvasCache.set('asphalt', canvas);
  return canvas;
}

function makeGroundCanvas() {
  const cached = canvasCache.get('ground');
  if (cached) return cached;

  const size = 512;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d', { alpha: false });
  if (!ctx) return canvas;

  const image = ctx.createImageData(size, size);
  const TAU = Math.PI * 2;
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const broad = Math.sin(TAU * (x * 3 + y * 4) / size) * 4.2 +
        Math.cos(TAU * (x * 6 - y * 5) / size) * 2.7 +
        Math.sin(TAU * (x * 11 + y * 9) / size) * 1.7;
      const grain = Math.sin(TAU * (x * 113 + y * 83) / size) * 3.7 +
        Math.cos(TAU * (x * 151 - y * 127) / size) * 2.5 +
        Math.sin(TAU * (x * 197 + y * 173) / size) * 1.8;
      const v = broad + grain;
      const i = (y * size + x) * 4;
      image.data[i] = clamp(177 + v, 0, 255);
      image.data[i + 1] = clamp(158 + v * 0.91, 0, 255);
      image.data[i + 2] = clamp(119 + v * 0.70, 0, 255);
      image.data[i + 3] = 255;
    }
  }
  ctx.putImageData(image, 0, 0);

  const rand = seededRandom(0x53414e44);
  // Fine gravel, dried grass and dusty clumps.
  for (let i = 0; i < 1700; i += 1) {
    const x = rand() * size;
    const y = rand() * size;
    const radius = 0.25 + rand() * 1.8;
    const palette = ['#746447', '#887452', '#d6c49a', '#6f7050', '#c2ac7c'];
    drawWrappedDot(
      ctx, x, y, radius, size, size,
      palette[Math.floor(rand() * palette.length)],
      0.09 + rand() * 0.19,
    );
  }

  // Faint wheel-rut lines make the sandy shoulder read as ground, not a flat colour.
  ctx.save();
  ctx.globalAlpha = 0.13;
  ctx.strokeStyle = '#756044';
  ctx.lineWidth = 5;
  ctx.beginPath();
  ctx.moveTo(110, -10);
  ctx.bezierCurveTo(135, 150, 95, 350, 126, 522);
  ctx.moveTo(151, -10);
  ctx.bezierCurveTo(174, 160, 137, 352, 165, 522);
  ctx.stroke();
  ctx.restore();

  canvasCache.set('ground', canvas);
  return canvas;
}

function makeMarketStallCanvas() {
  const cached = canvasCache.get('marketStall');
  if (cached) return cached;

  const width = 512;
  const height = 256;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d', { alpha: false });
  if (!ctx) return canvas;

  ctx.fillStyle = '#e6d2a5';
  ctx.fillRect(0, 0, width, height);
  const stripe = 64;
  const palette = ['#a93b2b', '#f0dcb2', '#245a43', '#d6a643', '#f1e7cb', '#9f342b'];
  for (let i = -3; i < 12; i += 1) {
    ctx.save();
    ctx.translate(i * stripe, 0);
    ctx.rotate(-0.07);
    ctx.fillStyle = palette[mod(i, palette.length)];
    ctx.fillRect(0, -24, stripe * 0.78, height + 48);
    ctx.restore();
  }

  // Woven-cloth texture and edge seams.
  const rand = seededRandom(0x5354414c);
  for (let i = 0; i < 1500; i += 1) {
    const x = rand() * width;
    const y = rand() * height;
    ctx.fillStyle = rand() > 0.5 ? 'rgba(255,245,220,0.09)' : 'rgba(24,29,23,0.07)';
    ctx.fillRect(x, y, 1 + rand() * 2, 1);
  }
  ctx.fillStyle = 'rgba(30,30,24,0.22)';
  ctx.fillRect(0, height - 8, width, 8);
  ctx.strokeStyle = 'rgba(255,240,204,0.28)';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(0, 8);
  ctx.lineTo(width, 8);
  ctx.stroke();

  canvasCache.set('marketStall', canvas);
  return canvas;
}

function makeSkyCanvas() {
  const cached = canvasCache.get('sky');
  if (cached) return cached;

  const width = 1024;
  const height = 512;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d', { alpha: false });
  if (!ctx) return canvas;

  // Neutral white-based colour values are tinted from the active scene colour
  // during rendering, so the same sky remains compatible with rain/harmattan/night.
  const gradient = ctx.createLinearGradient(0, 0, 0, height);
  gradient.addColorStop(0, '#ffffff');
  gradient.addColorStop(0.38, '#ffffff');
  gradient.addColorStop(0.62, '#f5f2eb');
  gradient.addColorStop(0.78, '#e9e0cf');
  gradient.addColorStop(1, '#d7c8ae');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, width, height);

  const rand = seededRandom(0x534b5931);
  // High, broken Sahel cumulus clouds with soft, shaded edges.
  const cloudBands = [
    { x: 145, y: 115, w: 185, h: 45 },
    { x: 375, y: 165, w: 235, h: 42 },
    { x: 694, y: 108, w: 190, h: 50 },
    { x: 905, y: 194, w: 150, h: 36 },
    { x: 515, y: 79, w: 130, h: 27 },
    { x: 58, y: 218, w: 150, h: 35 },
  ];
  for (const cloud of cloudBands) {
    ctx.save();
    ctx.globalAlpha = 0.14 + rand() * 0.07;
    const cloudGradient = ctx.createRadialGradient(
      cloud.x, cloud.y, cloud.h * 0.06,
      cloud.x, cloud.y, cloud.w * 0.62,
    );
    cloudGradient.addColorStop(0, '#707b85');
    cloudGradient.addColorStop(0.42, '#a8b0b5');
    cloudGradient.addColorStop(1, '#ffffff');
    ctx.fillStyle = cloudGradient;
    ctx.beginPath();
    ctx.ellipse(cloud.x, cloud.y, cloud.w * 0.54, cloud.h * 0.8, 0, 0, Math.PI * 2);
    ctx.fill();
    for (let p = 0; p < 6; p += 1) {
      const px = cloud.x + (rand() - 0.5) * cloud.w * 0.82;
      const py = cloud.y + (rand() - 0.5) * cloud.h * 0.75;
      const rx = cloud.w * (0.08 + rand() * 0.13);
      const ry = cloud.h * (0.18 + rand() * 0.35);
      ctx.beginPath();
      ctx.ellipse(px, py, rx, ry, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  // Horizon haze softens the transition between sky and the distant Kano terrain.
  const haze = ctx.createLinearGradient(0, height * 0.70, 0, height);
  haze.addColorStop(0, 'rgba(242,226,194,0)');
  haze.addColorStop(0.55, 'rgba(231,216,187,0.32)');
  haze.addColorStop(1, 'rgba(212,194,162,0.58)');
  ctx.fillStyle = haze;
  ctx.fillRect(0, height * 0.68, width, height * 0.32);

  canvasCache.set('sky', canvas);
  return canvas;
}

function makeSunCanvas() {
  const cached = canvasCache.get('sun');
  if (cached) return cached;
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) return canvas;
  const glow = ctx.createRadialGradient(size / 2, size / 2, 5, size / 2, size / 2, size / 2);
  glow.addColorStop(0, 'rgba(255,245,199,1)');
  glow.addColorStop(0.11, 'rgba(255,228,152,0.96)');
  glow.addColorStop(0.22, 'rgba(255,210,116,0.48)');
  glow.addColorStop(0.48, 'rgba(255,211,126,0.13)');
  glow.addColorStop(1, 'rgba(255,211,126,0)');
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, size, size);
  canvasCache.set('sun', canvas);
  return canvas;
}

function makeCanvasTexture(kind) {
  const canvas = kind === 'asphalt'
    ? makeRoadCanvas()
    : kind === 'marketStall'
      ? makeMarketStallCanvas()
      : kind === 'sky'
        ? makeSkyCanvas()
        : kind === 'sun'
          ? makeSunCanvas()
          : makeGroundCanvas();

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.needsUpdate = true;
  return texture;
}

function installMissingTextureFallbacks() {
  const prototype = THREE.TextureLoader?.prototype;
  if (!prototype?.load || prototype[LOADER_PATCH_FLAG]) return;

  const originalLoad = prototype.load;
  Object.defineProperty(prototype, LOADER_PATCH_FLAG, { value: true });

  prototype.load = function (url, onLoad, onProgress, onError) {
    const path = String(url || '').split('?')[0];
    const kind = FALLBACK_PATHS.get(path);
    if (!kind) {
      return originalLoad.call(this, url, onLoad, onProgress, onError);
    }

    // These two optional files are absent in the project. Supply a generated
    // canvas texture instead of issuing a failing network request.
    const texture = makeCanvasTexture(kind);
    const manager = this.manager || THREE.DefaultLoadingManager;
    manager?.itemStart?.(path);
    Promise.resolve().then(() => {
      try {
        onLoad?.(texture);
      } catch (error) {
        console.warn('[Kano Life] procedural texture callback failed', error);
        texture.dispose();
      } finally {
        manager?.itemEnd?.(path);
      }
    });
    return texture;
  };
}

// Install before main.js constructs Renderer3D, which requests these optional paths.
installMissingTextureFallbacks();

/**
 * Kano Life atmosphere and environment surface upgrade.
 *
 * The existing Renderer3D remains the sole owner of the world, road, camera,
 * traffic and game loop. This class adds tileable road/ground materials, blended
 * shoulders, a clouded sky dome and a distant sun while preserving the existing
 * night, rain, harmattan, wind, rain-particle and dust-particle behaviours.
 */
export class KanoAtmosphere {
  constructor({ renderer, game, mobile = false, enabled = true } = {}) {
    if (!renderer?.scene?.isScene || !renderer?.camera?.isCamera || !renderer?.renderer?.render) {
      throw new TypeError('KanoAtmosphere requires a live Renderer3D instance.');
    }
    if (!game) {
      throw new TypeError('KanoAtmosphere requires the active Game instance.');
    }

    this.renderer3d = renderer;
    this.scene = renderer.scene;
    this.webgl = renderer.renderer;
    this.game = game;
    this.mobile = Boolean(mobile);
    this.enabled = Boolean(enabled);
    this.disposed = false;
    this.active = false;
    this.night = false;
    this.environment = 'clear';
    this.elapsed = 0;
    this.wind = this.mobile ? 0.36 : 0.48;
    this.scrollDistance = 0;
    this.lastTextureScroll = 0;

    this.scratch = new THREE.Vector3();
    this.scratchTail = new THREE.Vector3();
    this.skyForward = new THREE.Vector3();
    this.skyOffset = new THREE.Vector3();
    this.tintColor = new THREE.Color();
    this.snapshot = {
      background: new THREE.Color(),
      backgroundValid: false,
      fogColor: new THREE.Color(),
      fogValid: false,
      fogNear: 0,
      fogFar: 0,
      lights: [],
    };

    this.environmentSurfaces = {
      road: null,
      ground: null,
      roadTexture: null,
      groundTexture: null,
      shoulderTexture: null,
      shoulders: [],
      originalRoadMap: null,
      originalGroundMap: null,
      originalRoadColor: null,
      originalGroundColor: null,
    };
    this.installEnvironmentSurfaces();
    this.createSkyDome();

    this.originalRender = this.webgl.render;
    this.renderWrapper = (...args) => this.renderWithAtmosphere(...args);
    this.lights = [];
    this.scene.traverse((object) => {
      if (object?.isHemisphereLight || object?.isDirectionalLight) {
        this.lights.push({
          light: object,
          intensity: object.intensity,
          color: object.color.clone(),
          tempColor: object.color.clone(),
        });
      }
    });

    this.rainParticles = [];
    this.dustParticles = [];
    this.createRain();
    this.createDust();

    // This wrapper is installed after KanoCinematicCamera, so both layers compose.
    this.webgl.render = this.renderWrapper;
  }

  // ----------------------------------------------------------
  // Procedural environment materials
  // ----------------------------------------------------------

  prepareSurfaceTexture(texture, repeatX, repeatY) {
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    texture.repeat.set(repeatX, repeatY);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = Math.min(
      this.webgl?.capabilities?.getMaxAnisotropy?.() || 1,
      this.mobile ? 4 : 8,
    );
    texture.needsUpdate = true;
    return texture;
  }

  installEnvironmentSurfaces() {
    const world = this.renderer3d?.world;
    if (!world?.isObject3D) return;

    world.traverse((object) => {
      if (!object?.isMesh || object.geometry?.type !== 'PlaneGeometry') return;
      const params = object.geometry.parameters || {};
      const width = Number(params.width) || 0;
      const height = Number(params.height) || 0;

      if (!this.environmentSurfaces.road && Math.abs(width - 13) < 0.01 && Math.abs(height - 250) < 0.01) {
        this.environmentSurfaces.road = object;
      } else if (!this.environmentSurfaces.ground && Math.abs(width - 240) < 0.01 && Math.abs(height - 270) < 0.01) {
        this.environmentSurfaces.ground = object;
      }
    });

    const road = this.environmentSurfaces.road;
    if (road?.material && !Array.isArray(road.material)) {
      this.environmentSurfaces.originalRoadMap = road.material.map || null;
      this.environmentSurfaces.originalRoadColor = road.material.color?.clone?.() || null;
      const texture = this.prepareSurfaceTexture(makeCanvasTexture('asphalt'), 3, 64);
      road.material.map = texture;
      road.material.color?.set?.(0xffffff);
      road.material.roughness = 0.94;
      road.material.metalness = 0;
      road.material.needsUpdate = true;
      road.name = road.name || 'KANO_PROCEDURAL_ASPHALT_ROAD';
      road.userData.kanoProceduralSurface = 'asphalt';
      this.environmentSurfaces.roadTexture = texture;
    }

    const ground = this.environmentSurfaces.ground;
    if (ground?.material && !Array.isArray(ground.material)) {
      this.environmentSurfaces.originalGroundMap = ground.material.map || null;
      this.environmentSurfaces.originalGroundColor = ground.material.color?.clone?.() || null;
      const texture = this.prepareSurfaceTexture(makeCanvasTexture('ground'), 28, 31);
      ground.material.map = texture;
      ground.material.color?.set?.(0xffffff);
      ground.material.roughness = 1;
      ground.material.metalness = 0;
      ground.material.needsUpdate = true;
      ground.name = ground.name || 'KANO_PROCEDURAL_SAND_AND_GRAVEL_GROUND';
      ground.userData.kanoProceduralSurface = 'sand';
      this.environmentSurfaces.groundTexture = texture;
    }

    // Add narrow dust-and-gravel shoulders beside the existing road edges.
    // The gameplay lanes and 13-unit road are left unchanged.
    if (world && !world.getObjectByName('KANO_ROADSIDE_SHOULDER_LEFT')) {
      const shoulderTexture = this.prepareSurfaceTexture(makeCanvasTexture('ground'), 3, 53);
      const shoulderMaterial = new THREE.MeshStandardMaterial({
        map: shoulderTexture,
        color: 0xffffff,
        roughness: 1,
        metalness: 0,
      });
      this.environmentSurfaces.shoulderTexture = shoulderTexture;

      for (const side of [-1, 1]) {
        const shoulder = new THREE.Mesh(
          new THREE.PlaneGeometry(2.85, 250),
          shoulderMaterial,
        );
        shoulder.name = side < 0
          ? 'KANO_ROADSIDE_SHOULDER_LEFT'
          : 'KANO_ROADSIDE_SHOULDER_RIGHT';
        shoulder.rotation.x = -Math.PI / 2;
        shoulder.position.set(side * 7.83, -0.023, -92);
        shoulder.frustumCulled = false;
        shoulder.renderOrder = -1;
        shoulder.userData.kanoEnvironmentOwned = true;
        world.add(shoulder);
        this.environmentSurfaces.shoulders.push(shoulder);
      }
    }
  }

  adoptAsyncRoadTextureIfNeeded() {
    const roadMap = this.environmentSurfaces.road?.material?.map;
    if (roadMap && roadMap !== this.environmentSurfaces.roadTexture) {
      // Renderer3D's optional-texture callback may install the generated
      // fallback after construction. Keep scrolling the map actually in use.
      this.environmentSurfaces.roadTexture?.dispose?.();
      this.environmentSurfaces.roadTexture = this.prepareSurfaceTexture(roadMap, 3, 64);
    }
  }

  updateSurfaceScroll(scroll) {
    if (!Number.isFinite(scroll) || Math.abs(scroll) < 1e-8) return;
    this.scrollDistance += scroll;
    this.adoptAsyncRoadTextureIfNeeded();

    const roadTexture = this.environmentSurfaces.roadTexture;
    if (roadTexture) {
      roadTexture.offset.y = mod(
        this.scrollDistance / 250 * roadTexture.repeat.y,
        1,
      );
    }

    const groundTexture = this.environmentSurfaces.groundTexture;
    if (groundTexture) {
      groundTexture.offset.y = mod(
        this.scrollDistance / 270 * groundTexture.repeat.y,
        1,
      );
    }

    const shoulderTexture = this.environmentSurfaces.shoulderTexture;
    if (shoulderTexture) {
      shoulderTexture.offset.y = mod(
        this.scrollDistance / 250 * shoulderTexture.repeat.y,
        1,
      );
    }
  }

  // ----------------------------------------------------------
  // Sky dome and sun
  // ----------------------------------------------------------

  createSkyDome() {
    const geometry = new THREE.SphereGeometry(225, this.mobile ? 32 : 48, this.mobile ? 16 : 24);
    const texture = makeCanvasTexture('sky');
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.ClampToEdgeWrapping;
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.needsUpdate = true;

    const material = new THREE.MeshBasicMaterial({
      map: texture,
      color: this.scene.background?.isColor ? this.scene.background : 0x8ccde5,
      side: THREE.BackSide,
      fog: false,
      depthTest: false,
      depthWrite: false,
      toneMapped: false,
    });

    this.skyDome = new THREE.Mesh(geometry, material);
    this.skyDome.name = 'KANO_PROCEDURAL_CLOUD_SKY_DOME';
    this.skyDome.frustumCulled = false;
    this.skyDome.renderOrder = -1000;
    this.skyDome.userData.kanoEnvironmentOwned = true;
    this.scene.add(this.skyDome);
    this.skyTexture = texture;

    this.sunTexture = makeCanvasTexture('sun');
    const sunMaterial = new THREE.SpriteMaterial({
      map: this.sunTexture,
      transparent: true,
      opacity: 0.9,
      depthTest: false,
      depthWrite: false,
      fog: false,
      toneMapped: false,
    });
    this.sunSprite = new THREE.Sprite(sunMaterial);
    this.sunSprite.name = 'KANO_SOFT_SAHEL_SUN_GLOW';
    this.sunSprite.scale.set(19, 19, 1);
    this.sunSprite.renderOrder = -999;
    this.sunSprite.frustumCulled = false;
    this.sunSprite.userData.kanoEnvironmentOwned = true;
    this.scene.add(this.sunSprite);
  }

  syncSky(scene, camera) {
    if (!this.skyDome || !this.sunSprite || !scene || !camera) return;

    const roadScene = this.renderer3d?.lifeScene === 'road' && this.renderer3d?.world?.visible !== false;
    this.skyDome.visible = roadScene;
    this.sunSprite.visible = roadScene && !this.night &&
      !['harmattan', 'rainPuddles', 'muddy', 'badRoad'].includes(this.environment);

    if (scene.background?.isColor) {
      this.skyDome.material.color.copy(scene.background);
    }

    camera.getWorldDirection(this.skyForward);
    this.skyOffset.copy(this.skyForward);
    // Slightly above and left of the viewing direction keeps the sun in the sky,
    // but outside the immediate road focal point.
    this.skyOffset.x -= 0.22;
    this.skyOffset.y += 0.34;
    this.skyOffset.normalize();

    this.skyDome.position.copy(camera.position);
    this.sunSprite.position.copy(camera.position).addScaledVector(this.skyOffset, 158);
    this.skyTexture.offset.x = mod(this.elapsed * 0.0008, 1);
  }

  // ----------------------------------------------------------
  // Rain and harmattan particle systems
  // ----------------------------------------------------------

  createRain() {
    const count = this.mobile ? 86 : 190;
    this.rainPositions = new Float32Array(count * 2 * 3);
    this.rainGeometry = new THREE.BufferGeometry();
    this.rainGeometry.setAttribute(
      'position',
      new THREE.BufferAttribute(this.rainPositions, 3).setUsage(THREE.DynamicDrawUsage),
    );
    this.rainMaterial = new THREE.LineBasicMaterial({
      color: 0xc1d9e4,
      transparent: true,
      opacity: this.mobile ? 0.32 : 0.38,
      depthTest: false,
      depthWrite: false,
      fog: false,
    });
    this.rain = new THREE.LineSegments(this.rainGeometry, this.rainMaterial);
    this.rain.name = 'KANO_ATMOSPHERE_RAIN';
    this.rain.frustumCulled = false;
    this.rain.renderOrder = 990;
    this.rain.visible = false;
    this.scene.add(this.rain);
    for (let index = 0; index < count; index += 1) {
      this.rainParticles.push({
        x: randomBetween(-18, 18),
        y: randomBetween(-7, 18),
        z: randomBetween(-48, -7),
        speed: randomBetween(9, 17),
        drift: randomBetween(-0.7, 0.7),
        length: randomBetween(0.25, 0.68),
      });
    }
  }

  createDust() {
    const count = this.mobile ? 64 : 142;
    this.dustPositions = new Float32Array(count * 3);
    this.dustGeometry = new THREE.BufferGeometry();
    this.dustGeometry.setAttribute(
      'position',
      new THREE.BufferAttribute(this.dustPositions, 3).setUsage(THREE.DynamicDrawUsage),
    );
    this.dustMaterial = new THREE.PointsMaterial({
      color: 0xc5b38e,
      size: this.mobile ? 0.19 : 0.24,
      transparent: true,
      opacity: this.mobile ? 0.12 : 0.16,
      depthTest: false,
      depthWrite: false,
      sizeAttenuation: true,
      fog: false,
    });
    this.dust = new THREE.Points(this.dustGeometry, this.dustMaterial);
    this.dust.name = 'KANO_ATMOSPHERE_HARMATTAN_DUST';
    this.dust.frustumCulled = false;
    this.dust.renderOrder = 989;
    this.dust.visible = false;
    this.scene.add(this.dust);
    for (let index = 0; index < count; index += 1) {
      this.dustParticles.push({
        x: randomBetween(-20, 20),
        y: randomBetween(-6, 15),
        z: randomBetween(-55, -8),
        drift: randomBetween(-0.42, 0.42),
        rise: randomBetween(-0.05, 0.12),
        phase: randomBetween(0, Math.PI * 2),
      });
    }
  }

  // ----------------------------------------------------------
  // Frame update
  // ----------------------------------------------------------

  update(dt, state = {}, gameState = this.game?.state) {
    if (this.disposed) return;
    const delta = clamp(Number(dt) || 0, 0, 0.05);
    this.elapsed += delta;
    this.environment = String(state.environment || 'clear');
    this.night = Boolean(state.night);
    this.active = Boolean(
      this.enabled &&
      gameState === 'PLAY' &&
      !state.event &&
      this.renderer3d?.lifeScene === 'road' &&
      this.renderer3d?.world?.visible !== false,
    );

    const roadActive = Boolean(
      gameState === 'PLAY' &&
      !state.event &&
      this.renderer3d?.lifeScene === 'road' &&
      this.renderer3d?.world?.visible !== false,
    );

    if (roadActive) {
      const signedSpeed = Number.isFinite(state.signedSpeed)
        ? state.signedSpeed
        : state.reverse
          ? -Math.abs(Number(state.speed) || 0)
          : Math.abs(Number(state.speed) || 0);
      this.updateSurfaceScroll(signedSpeed * delta * 0.28);
    }

    const raining = this.active && this.environment === 'rainPuddles';
    const dusty = this.active && (
      this.environment === 'harmattan' ||
      this.environment === 'badRoad' ||
      this.environment === 'muddy'
    );

    this.rain.visible = raining;
    this.dust.visible = dusty;

    if (raining) {
      for (const particle of this.rainParticles) {
        particle.y -= particle.speed * delta;
        particle.x += (this.wind + particle.drift) * delta;
        if (particle.y < -9) {
          particle.y = randomBetween(9, 19);
          particle.x = randomBetween(-18, 18);
          particle.z = randomBetween(-48, -7);
        }
        if (particle.x > 20) particle.x = -20;
      }
    }

    if (dusty) {
      for (const particle of this.dustParticles) {
        particle.x += (particle.drift + this.wind * 0.16) * delta;
        particle.y += particle.rise * delta + Math.sin(this.elapsed * 0.7 + particle.phase) * 0.004;
        particle.phase += delta * 0.25;
        if (particle.x > 22) particle.x = -22;
        if (particle.x < -22) particle.x = 22;
        if (particle.y > 16) particle.y = -7;
        if (particle.y < -8) particle.y = 15;
      }
    }

    this.syncSky(this.scene, this.renderer3d?.camera);
  }

  syncParticleWorldPositions(camera) {
    if (!camera?.isCamera || (!this.rain.visible && !this.dust.visible)) return;
    camera.updateMatrixWorld(true);

    if (this.rain.visible) {
      let offset = 0;
      for (const particle of this.rainParticles) {
        this.scratch.set(particle.x, particle.y, particle.z).applyMatrix4(camera.matrixWorld);
        this.rainPositions[offset++] = this.scratch.x;
        this.rainPositions[offset++] = this.scratch.y;
        this.rainPositions[offset++] = this.scratch.z;
        this.scratchTail.set(
          particle.x - 0.055,
          particle.y + particle.length,
          particle.z,
        ).applyMatrix4(camera.matrixWorld);
        this.rainPositions[offset++] = this.scratchTail.x;
        this.rainPositions[offset++] = this.scratchTail.y;
        this.rainPositions[offset++] = this.scratchTail.z;
      }
      this.rainGeometry.attributes.position.needsUpdate = true;
      this.rainGeometry.computeBoundingSphere();
    }

    if (this.dust.visible) {
      let offset = 0;
      for (const particle of this.dustParticles) {
        this.scratch.set(particle.x, particle.y, particle.z).applyMatrix4(camera.matrixWorld);
        this.dustPositions[offset++] = this.scratch.x;
        this.dustPositions[offset++] = this.scratch.y;
        this.dustPositions[offset++] = this.scratch.z;
      }
      this.dustGeometry.attributes.position.needsUpdate = true;
      this.dustGeometry.computeBoundingSphere();
    }
  }

  atmosphereProfile() {
    if (this.night) return ATMOSPHERE_PROFILES.night;
    if (this.environment === 'harmattan') return ATMOSPHERE_PROFILES.harmattan;
    if (this.environment === 'rainPuddles') return ATMOSPHERE_PROFILES.rain;
    if (this.environment === 'muddy' || this.environment === 'badRoad') {
      return ATMOSPHERE_PROFILES.dustyRoad;
    }
    return null;
  }

  applyAtmosphere(scene) {
    const profile = this.atmosphereProfile();
    if (!profile || !scene) return null;

    const snapshot = this.snapshot;
    snapshot.backgroundValid = Boolean(scene.background?.isColor);
    if (snapshot.backgroundValid) snapshot.background.copy(scene.background);
    snapshot.fogValid = Boolean(scene.fog?.color?.isColor);
    if (snapshot.fogValid) {
      snapshot.fogColor.copy(scene.fog.color);
      snapshot.fogNear = scene.fog.near;
      snapshot.fogFar = scene.fog.far;
    }

    snapshot.lights.length = 0;
    if (scene.background?.isColor) scene.background.setHex(profile.background);
    if (scene.fog?.color) {
      scene.fog.color.setHex(profile.fog);
      scene.fog.near = profile.fogNear;
      scene.fog.far = profile.fogFar;
    }

    this.tintColor.setHex(profile.tint);
    for (const entry of this.lights) {
      const light = entry.light;
      if (!light || light.parent === null) continue;
      snapshot.lights.push(entry);
      if (light.isHemisphereLight) {
        light.intensity = entry.intensity * profile.hemiFactor;
      } else if (light.isDirectionalLight) {
        light.intensity = entry.intensity * profile.directionalFactor;
      }
      entry.tempColor.copy(entry.color).lerp(this.tintColor, this.night ? 0.28 : 0.13);
      light.color.copy(entry.tempColor);
    }
    return snapshot;
  }

  restoreAtmosphere(scene, snapshot) {
    if (!snapshot || !scene) return;
    if (snapshot.backgroundValid && scene.background?.isColor) {
      scene.background.copy(snapshot.background);
    }
    if (snapshot.fogValid && scene.fog?.color) {
      scene.fog.color.copy(snapshot.fogColor);
      scene.fog.near = snapshot.fogNear;
      scene.fog.far = snapshot.fogFar;
    }
    for (const entry of snapshot.lights) {
      if (!entry.light || entry.light.parent === null) continue;
      entry.light.intensity = entry.intensity;
      entry.light.color.copy(entry.color);
    }
    snapshot.lights.length = 0;
  }

  renderWithAtmosphere(scene, camera, ...args) {
    if (this.disposed) {
      return this.originalRender.call(this.webgl, scene, camera, ...args);
    }

    this.syncParticleWorldPositions(camera);
    const shouldShade = this.active && this.renderer3d?.lifeScene === 'road';
    const snapshot = shouldShade ? this.applyAtmosphere(scene) : null;
    this.syncSky(scene, camera);

    try {
      return this.originalRender.call(this.webgl, scene, camera, ...args);
    } finally {
      this.restoreAtmosphere(scene, snapshot);
    }
  }

  getDiagnostics() {
    return {
      enabled: this.enabled,
      active: this.active,
      night: this.night,
      environment: this.environment,
      rainVisible: Boolean(this.rain?.visible),
      dustVisible: Boolean(this.dust?.visible),
      skyVisible: Boolean(this.skyDome?.visible),
      groundTextured: Boolean(this.environmentSurfaces.ground?.material?.map),
      roadTextured: Boolean(this.environmentSurfaces.road?.material?.map),
      mobile: this.mobile,
    };
  }

  // ----------------------------------------------------------
  // Cleanup
  // ----------------------------------------------------------

  dispose() {
    if (this.disposed) return;
    this.disposed = true;

    // Restore the wrapped render method before renderer/camera teardown.
    if (this.webgl?.render === this.renderWrapper) {
      this.webgl.render = this.originalRender;
    }

    for (const object of [this.rain, this.dust, this.skyDome, this.sunSprite]) {
      if (!object) continue;
      object.parent?.remove(object);
    }

    for (const shoulder of this.environmentSurfaces.shoulders) {
      shoulder.parent?.remove(shoulder);
      shoulder.geometry?.dispose?.();
    }
    this.environmentSurfaces.shoulders.length = 0;

    // Restore the surface colours/maps so this addon does not retain ownership
    // of the renderer's road and ground materials after it is disposed.
    const road = this.environmentSurfaces.road;
    if (road?.material && !Array.isArray(road.material)) {
      road.material.map = this.environmentSurfaces.originalRoadMap;
      if (this.environmentSurfaces.originalRoadColor && road.material.color) {
        road.material.color.copy(this.environmentSurfaces.originalRoadColor);
      }
      road.material.needsUpdate = true;
    }
    const ground = this.environmentSurfaces.ground;
    if (ground?.material && !Array.isArray(ground.material)) {
      ground.material.map = this.environmentSurfaces.originalGroundMap;
      if (this.environmentSurfaces.originalGroundColor && ground.material.color) {
        ground.material.color.copy(this.environmentSurfaces.originalGroundColor);
      }
      ground.material.needsUpdate = true;
    }

    this.rainGeometry?.dispose();
    this.rainMaterial?.dispose();
    this.dustGeometry?.dispose();
    this.dustMaterial?.dispose();
    this.skyDome?.geometry?.dispose?.();
    this.skyDome?.material?.dispose?.();
    this.sunSprite?.material?.dispose?.();
    this.skyTexture?.dispose?.();
    this.sunTexture?.dispose?.();
    this.environmentSurfaces.roadTexture?.dispose?.();
    this.environmentSurfaces.groundTexture?.dispose?.();
    this.environmentSurfaces.shoulderTexture?.dispose?.();

    this.rainParticles.length = 0;
    this.dustParticles.length = 0;
    this.lights.length = 0;
    this.renderer3d = null;
    this.scene = null;
    this.webgl = null;
    this.game = null;
  }
}
