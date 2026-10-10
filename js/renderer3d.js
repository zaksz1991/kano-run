import * as THREE from '../vendor/three.module.js';
import { TrafficWorld } from './trafficWorld.js';

// Kano Run — Adaidaita Sahu
// Renderer Upgrade — detailed procedural 3D world
//
// Compatibility goals:
// - Keeps the existing Renderer3D public contract.
// - Uses the existing screen-space gameplay data from game.js.
// - Does not require a CDN, remote model, or external API.
// - Uses local assets when present, with procedural fallbacks.
// - Adds richer vehicle geometry, animated wheels/steering/suspension,
//   layered Kano roadside environment, pedestrians, weather, headlights,
//   road recycling, camera rig, opening sequence, and impact effects.

const LANE_X = [-2.4, 0, 2.4];
const ROAD_LEN = 180;
const PLAYER_Z = 5.5;
const MAX_TRAFFIC = 22;
const MAX_ZONES = 12;
const MAX_COINS = 20;
const TAU = Math.PI * 2;

const ASSET_ROOT = '/assets';
const TEXTURE_ROOT = '/textures';

const DAY = {
  sky: 0x9ec9df,
  fog: 0xb7c8cc,
  hemiSky: 0xd9efff,
  hemiGround: 0x705841,
  sun: 0xfff3d2,
  sunIntensity: 2.6,
  ambient: 0.75,
};

const DUSK = {
  sky: 0x596274,
  fog: 0x63656b,
  hemiSky: 0xc9bfc2,
  hemiGround: 0x302a28,
  sun: 0xffc48a,
  sunIntensity: 1.5,
  ambient: 0.42,
};

const NIGHT = {
  sky: 0x101b2f,
  fog: 0x172236,
  hemiSky: 0x8ba7d0,
  hemiGround: 0x14110f,
  sun: 0x9db7e8,
  sunIntensity: 0.35,
  ambient: 0.22,
};

const TYPE_INFO = {
  keke: { w: 1.65, l: 2.7, h: 1.72, speed: 0.17, color: 0xd7aa28 },
  sedan: { w: 1.9, l: 4.1, h: 1.55, speed: 0.22, color: 0x858b91 },
  taxi: { w: 1.9, l: 4.15, h: 1.58, speed: 0.23, color: 0xdbc43d },
  bus: { w: 2.65, l: 7.8, h: 3.05, speed: 0.14, color: 0xb8c2c7 },
  motorcycle: { w: 0.9, l: 2.25, h: 1.35, speed: 0.3, color: 0x31363a },
  truck: { w: 2.35, l: 6.4, h: 2.55, speed: 0.15, color: 0x7e6652 },
  police: { w: 2.0, l: 4.45, h: 1.65, speed: 0.28, color: 0x23313f },
  karota: { w: 2.0, l: 4.4, h: 1.7, speed: 0.24, color: 0x1c2930 },
};

const DISTRICTS = [
  { name: 'Fagge', palette: [0xcbb58d, 0x987e5f, 0xd7c8ae], density: 1.0 },
  { name: 'Sabon Gari', palette: [0xbba78a, 0x8b7766, 0xd2bc98], density: 1.15 },
  { name: 'Kofar Mata', palette: [0xb89770, 0x8d6548, 0xcab18e], density: 0.92 },
  { name: 'Tarauni', palette: [0xb9a58b, 0x7e7061, 0xc7b29b], density: 1.05 },
  { name: 'Hotoro', palette: [0xc5b394, 0x9c876e, 0xd5c7ad], density: 0.88 },
  { name: 'Kantin Kwari', palette: [0xaf9576, 0x7b6655, 0xc8b08d], density: 1.28 },
  { name: 'Naibawa', palette: [0xbca68a, 0x866e59, 0xd0bea2], density: 0.83 },
  { name: 'Dala', palette: [0xbaa07c, 0x84664c, 0xd1b89b], density: 0.76 },
];

function clamp(v, min, max) {
  return Math.max(min, Math.min(max, v));
}

function smoothstep(edge0, edge1, x) {
  const t = clamp((x - edge0) / Math.max(edge1 - edge0, 0.0001), 0, 1);
  return t * t * (3 - 2 * t);
}

function fract(v) {
  return v - Math.floor(v);
}

function seeded(seed) {
  const x = Math.sin(seed * 12.9898) * 43758.5453;
  return fract(x);
}

function pick(arr, seed) {
  return arr[Math.floor(seeded(seed) * arr.length) % arr.length];
}

function makeMat(color, roughness = 0.86, metalness = 0, extra = {}) {
  return new THREE.MeshStandardMaterial({
    color,
    roughness,
    metalness,
    ...extra,
  });
}

function addBox(parent, size, position, material, rotation = null, cast = true, receive = true) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(size[0], size[1], size[2]), material);
  mesh.position.set(position[0], position[1], position[2]);
  if (rotation) mesh.rotation.set(rotation[0], rotation[1], rotation[2]);
  mesh.castShadow = cast;
  mesh.receiveShadow = receive;
  parent.add(mesh);
  return mesh;
}

function addCylinder(parent, radius, depth, position, material, rotation = null, radialSegments = 16) {
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, depth, radialSegments), material);
  mesh.position.set(position[0], position[1], position[2]);
  if (rotation) mesh.rotation.set(rotation[0], rotation[1], rotation[2]);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  parent.add(mesh);
  return mesh;
}

function addSphere(parent, radius, position, material, scale = [1, 1, 1]) {
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(radius, 16, 12), material);
  mesh.position.set(position[0], position[1], position[2]);
  mesh.scale.set(scale[0], scale[1], scale[2]);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  parent.add(mesh);
  return mesh;
}

function createCanvasTexture(drawer, w = 256, h = 128) {
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  drawer(ctx, w, h);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.needsUpdate = true;
  return texture;
}

export class Renderer3D {
  constructor(canvas, game = null) {
    // The game canvas is already owned by Game and receives a 2D context.
    // Three.js/WebGL must NEVER be initialized on that same canvas.
    // Accept the historical constructor forms (canvas, context, or Game) but
    // always create a dedicated WebGL canvas for the 3D renderer.
    if (canvas && canvas.canvas && typeof canvas.getContext !== 'function' && !game) {
      game = canvas;
      canvas = canvas.canvas;
    }

    this.game = game || null;
    this.gameCanvas = canvas?.canvas || canvas;

    if (!this.gameCanvas || typeof this.gameCanvas.addEventListener !== 'function') {
      throw new TypeError('Renderer3D requires an HTMLCanvasElement or a canvas rendering context.');
    }

    this.canvas = null;
    this.webglHost = null;
    this.ownsCanvas = false;

    this.ctx = null;
    this.renderer = null;
    this.contextLost = false;
    this.reducedMotionQuery = null;
    this.reducedMotion = false;
    this.onReducedMotionChange = null;
    this.onWebGLContextLost = null;
    this.onWebGLContextRestored = null;
    this.scene = null;
    this.camera = null;
    this.ready = false;

    this.clock = new THREE.Clock();
    this.elapsed = 0;
    this.lastRender = 0;
    this.textureCache = new Map();
    this.ownedTextures = new Set();

    this.quality = this.detectInitialQuality();
    this.adaptivePixelScale = 1;
    this.adaptiveSampleTime = 0;
    this.adaptiveFrames = 0;
    this.adaptiveSlowSamples = 0;
    this.adaptiveStableTime = 0;
    this.diagnosticsEnabled = false;
    this.diagnosticsElapsed = 0;
    this.diagnosticsFrames = 0;
    this.diagnosticsFps = 0;
    this.diagnosticsElement = null;
    this.onDiagnosticsKey = null;
    this.paint = 0xd7aa28;
    this.driverId = 'ruffneck';

    this.vehiclePool = [];
    this.zonePool = [];
    this.coinPool = [];
    this.pedestrianPool = [];
    this.checkpointPool = [];
    this.roadSegments = [];
    this.environmentPool = [];

    this.player = null;
    this.playerDriver = null;
    this.playerWheels = [];
    this.playerSteering = null;
    this.playerShadow = null;

    this.world = null;
    this.city = null;
    this.trafficGroup = null;
    this.zoneGroup = null;
    this.coinGroup = null;
    this.pedestrianGroup = null;
    this.checkpointGroup = null;
    this.effectsGroup = null;
    this.weatherGroup = null;
    this.openingGroup = null;
    this.trafficWorld = null;

    this.roadOffset = 0;
    this.targetCameraX = 0;
    this.cameraShake = 0;
    this.cameraShakeStrength = 0;
    this.cameraTarget = new THREE.Vector3(0, 1.0, PLAYER_Z);
    this.cameraLook = new THREE.Vector3(0, 0.8, PLAYER_Z - 15);

    this.timeOfDay = 0.25;
    this.weather = 'clear';
    this.weatherPoints = [];
    this.dustPoints = [];
    this.pooledMarks = [];

    this.opening = {
      active: false,
      phase: 'idle',
      timer: 0,
      duration: 5.2,
      driverId: 'ruffneck',
    };

    this.tmp = new THREE.Vector3();
    this.tmp2 = new THREE.Vector3();
    this.tmp3 = new THREE.Vector3();

    this.init();
  }

  detectInitialQuality() {
    // Start conservatively on phones and memory/CPU-constrained devices.
    // A saved quality setting still takes precedence during init().
    const memory = Number(navigator.deviceMemory) || 0;
    const cores = Number(navigator.hardwareConcurrency) || 0;
    const smallScreen = Math.min(window.innerWidth || 0, window.innerHeight || 0) <= 600;
    if ((memory > 0 && memory <= 3) || (cores > 0 && cores <= 4)) return 'low';
    if (smallScreen || (memory > 0 && memory <= 6) || (cores > 0 && cores <= 6)) return 'medium';
    return 'high';
  }

  init() {
    const pixelRatio = this.quality === 'high' ? Math.min(window.devicePixelRatio || 1, 2) : this.quality === 'medium' ? Math.min(window.devicePixelRatio || 1, 1.5) : 1;

    this.createWebGLCanvas();

    // Respect the operating-system accessibility preference for reduced motion.
    try {
      this.reducedMotionQuery = window.matchMedia?.('(prefers-reduced-motion: reduce)') || null;
      this.reducedMotion = Boolean(this.reducedMotionQuery?.matches);
      this.onReducedMotionChange = (event) => {
        this.reducedMotion = Boolean(event.matches);
        if (this.reducedMotion) {
          this.cameraShake = 0;
          if (this.impactFlash) this.impactFlash.visible = false;
          for (const item of this.dustSprites || []) {
            item.life = 0;
            if (item.mesh) item.mesh.visible = false;
          }
          if (this.rainMesh) this.rainMesh.visible = false;
        }
      };
      this.reducedMotionQuery?.addEventListener?.('change', this.onReducedMotionChange);
    } catch {
      this.reducedMotionQuery = null;
      this.reducedMotion = false;
    }

    const width = this.webglHost?.clientWidth || this.gameCanvas.clientWidth || window.innerWidth;
    const height = this.webglHost?.clientHeight || this.gameCanvas.clientHeight || window.innerHeight;

    this.renderer = new THREE.WebGLRenderer({
      canvas: this.canvas,
      antialias: true,
      alpha: false,
      powerPreference: 'high-performance',
    });
    this.basePixelRatio = pixelRatio;
    this.renderer.setPixelRatio(pixelRatio);
    this.renderer.setSize(width, height, false);
    this.renderer.shadowMap.enabled = this.quality !== 'low';
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;

    // WebGL can be temporarily lost by browsers or mobile GPUs under memory
    // pressure. Pause this renderer while lost and let Three.js restore its
    // internal GPU resources when the browser reports recovery.
    this.onWebGLContextLost = (event) => {
      event.preventDefault();
      this.contextLost = true;
    };
    this.onWebGLContextRestored = () => {
      this.contextLost = false;
      this.clock.start();
      this.resize();
    };
    this.canvas.addEventListener('webglcontextlost', this.onWebGLContextLost, false);
    this.canvas.addEventListener('webglcontextrestored', this.onWebGLContextRestored, false);

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(DAY.sky);
    this.scene.fog = new THREE.Fog(DAY.fog, 42, 175);

    const aspect = Math.max(width / Math.max(height, 1), 0.5);
    this.camera = new THREE.PerspectiveCamera(58, aspect, 0.1, 260);
    this.camera.position.set(0, 4.2, 13.5);

    this.ambient = new THREE.AmbientLight(0xffffff, DAY.ambient);
    this.scene.add(this.ambient);

    this.hemi = new THREE.HemisphereLight(DAY.hemiSky, DAY.hemiGround, 1.05);
    this.scene.add(this.hemi);

    this.sun = new THREE.DirectionalLight(DAY.sun, DAY.sunIntensity);
    this.sun.position.set(-28, 42, 28);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    this.sun.shadow.camera.left = -42;
    this.sun.shadow.camera.right = 42;
    this.sun.shadow.camera.top = 50;
    this.sun.shadow.camera.bottom = -34;
    this.sun.shadow.camera.near = 1;
    this.sun.shadow.camera.far = 130;
    this.scene.add(this.sun);

    this.world = new THREE.Group();
    this.scene.add(this.world);

    this.buildRoad();
    this.buildCityscape();
    this.buildPlayer();
    this.buildTrafficPool();
    this.buildZonePool();
    this.buildCoinPool();
    this.buildCheckpointPool();
    this.buildPedestrians();
    // Ambient traffic and walking roadside life are visual-only and do not replace
    // game.js collision, passenger, mission, or scoring logic.
    this.trafficWorld = new TrafficWorld(THREE, this, { quality: this.quality });
    this.buildEffects();
    this.buildWeather();

    const storedQuality = this.readQuality();
    if (storedQuality) this.applyQuality(storedQuality);

    this.onResize = () => this.resize();
    window.addEventListener('resize', this.onResize);
    this.onDiagnosticsKey = (event) => {
      if (event.repeat || event.ctrlKey || event.altKey || event.metaKey) return;
      if (event.key === 'F2') {
        event.preventDefault();
        this.toggleControlsHelp();
        return;
      }
      if (event.key === 'F3') {
        event.preventDefault();
        this.toggleDiagnostics();
        return;
      }
      if (event.key === 'F4') {
        event.preventDefault();
        const levels = ['low', 'medium', 'high'];
        const next = levels[(levels.indexOf(this.quality) + 1) % levels.length];
        this.applyQuality(next);
        this.showCaptureNotice(`Graphics quality: ${next.toUpperCase()}`);
        return;
      }
      if (event.key === 'F5') {
        // Prevent the browser's normal refresh shortcut while the game is active.
        event.preventDefault();
        this.captureScreenshot();
        return;
      }
      if (event.key === 'F6') {
        event.preventDefault();
        this.toggleFullscreen();
        return;
      }
      if (event.key === 'F7') {
        event.preventDefault();
        this.exportDiagnostics();
        return;
      }
      if (event.key === 'F8') {
        event.preventDefault();
        this.copyDiagnosticsSummary();
      }
    };
    window.addEventListener('keydown', this.onDiagnosticsKey);

    this.ready = true;
  }

  async toggleFullscreen() {
    const target = this.webglHost || this.canvas;
    if (!target || typeof document === 'undefined') return;
    try {
      if (document.fullscreenElement) {
        await document.exitFullscreen();
        this.showCaptureNotice('Fullscreen off');
      } else if (target.requestFullscreen) {
        await target.requestFullscreen();
        this.showCaptureNotice('Fullscreen on · press F6 or Esc to exit');
      } else {
        this.showCaptureNotice('Fullscreen is not supported by this browser');
      }
    } catch {
      this.showCaptureNotice('Fullscreen request was blocked by the browser');
    }
    this.resize?.();
  }

  async copyDiagnosticsSummary() {
    const info = this.renderer?.info || {};
    const memory = info.memory || {};
    const render = info.render || {};
    const summary = [
      'KANO RUN · QUICK DIAGNOSTICS',
      `Time: ${new Date().toISOString()}`,
      `Graphics quality: ${this.quality || 'unknown'}`,
      `FPS: ${Number.isFinite(this.diagnosticsFps) ? this.diagnosticsFps : 'not measured yet'}`,
      `Pixel ratio: ${this.renderer?.getPixelRatio?.() ?? 'unavailable'}`,
      `Canvas: ${this.canvas?.width ?? '?'} × ${this.canvas?.height ?? '?'}`,
      `Draw calls: ${render.calls ?? 'unavailable'}`,
      `Triangles: ${render.triangles ?? 'unavailable'}`,
      `Geometries: ${memory.geometries ?? 'unavailable'}`,
      `Textures: ${memory.textures ?? 'unavailable'}`,
      `WebGL context lost: ${Boolean(this.contextLost)}`,
      `User agent: ${typeof navigator !== 'undefined' ? navigator.userAgent : 'unavailable'}`
    ].join('\n');
    try {
      if (navigator.clipboard?.writeText && window.isSecureContext) {
        await navigator.clipboard.writeText(summary);
      } else {
        const area = document.createElement('textarea');
        area.value = summary;
        area.setAttribute('readonly', '');
        area.style.cssText = 'position:fixed;left:-9999px;top:0;';
        document.body.appendChild(area);
        area.select();
        const copied = document.execCommand('copy');
        area.remove();
        if (!copied) throw new Error('Clipboard copy unavailable');
      }
      this.showCaptureNotice('Quick diagnostics copied · paste into a message');
    } catch {
      this.showCaptureNotice('Clipboard unavailable · use F7 to export JSON');
    }
  }

  exportDiagnostics() {
    const info = this.renderer?.info || {};
    const memory = info.memory || {};
    const render = info.render || {};
    const report = {
      app: 'Kano Run',
      capturedAt: new Date().toISOString(),
      quality: this.quality || 'unknown',
      pixelRatio: this.renderer?.getPixelRatio?.() ?? null,
      canvas: {
        width: this.canvas?.width ?? null,
        height: this.canvas?.height ?? null,
        clientWidth: this.canvas?.clientWidth ?? null,
        clientHeight: this.canvas?.clientHeight ?? null
      },
      viewport: {
        width: typeof window !== 'undefined' ? window.innerWidth : null,
        height: typeof window !== 'undefined' ? window.innerHeight : null,
        devicePixelRatio: typeof window !== 'undefined' ? window.devicePixelRatio : null
      },
      performance: {
        fps: Number.isFinite(this.diagnosticsFps) ? this.diagnosticsFps : null,
        drawCalls: render.calls ?? null,
        triangles: render.triangles ?? null,
        geometries: memory.geometries ?? null,
        textures: memory.textures ?? null
      },
      webgl: {
        contextLost: Boolean(this.contextLost),
        rendererAvailable: Boolean(this.renderer)
      },
      userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : null
    };
    try {
      const blob = new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `kano-run-diagnostics-${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
      anchor.style.display = 'none';
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      this.showCaptureNotice('Performance diagnostics saved as JSON');
    } catch {
      this.showCaptureNotice('Could not export diagnostics in this browser');
    }
  }

  toggleControlsHelp() {
    if (typeof document === 'undefined' || !this.webglHost) return;
    if (!this.controlsHelpElement) {
      const panel = document.createElement('section');
      panel.setAttribute('role', 'dialog');
      panel.setAttribute('aria-label', 'Kano Run keyboard shortcuts');
      panel.style.cssText = 'position:absolute;z-index:10001;left:50%;top:50%;transform:translate(-50%,-50%);width:min(360px,calc(100% - 28px));box-sizing:border-box;padding:18px;border:1px solid rgba(0,180,216,.75);border-radius:12px;background:rgba(5,15,28,.96);color:#f4f9ff;font:14px/1.55 system-ui,sans-serif;box-shadow:0 12px 34px rgba(0,0,0,.4);';
      const heading = document.createElement('h2');
      heading.textContent = 'Kano Run · Quick Help';
      heading.style.cssText = 'margin:0 0 12px;font-size:18px;';
      const list = document.createElement('div');
      list.style.cssText = 'display:grid;grid-template-columns:72px 1fr;gap:7px 10px;';
      const shortcuts = [
        ['F2', 'Show or hide this help'],
        ['F3', 'Show or hide performance diagnostics'],
        ['F4', 'Cycle Low, Medium, High graphics'],
        ['F5', 'Save a PNG screenshot'],
        ['F6', 'Toggle fullscreen mode'],
        ['F7', 'Download performance diagnostics as JSON'],
        ['F8', 'Copy a compact diagnostics summary']
      ];
      for (const [key, description] of shortcuts) {
        const keyLabel = document.createElement('strong');
        keyLabel.textContent = key;
        keyLabel.style.color = '#00b4d8';
        const detail = document.createElement('span');
        detail.textContent = description;
        list.append(keyLabel, detail);
      }
      const note = document.createElement('p');
      note.textContent = 'Driving controls remain unchanged. Shortcuts may depend on browser focus.';
      note.style.cssText = 'margin:14px 0 0;color:#b8c7d8;font-size:12px;';
      panel.append(heading, list, note);
      const computed = window.getComputedStyle(this.webglHost);
      if (computed.position === 'static') this.webglHost.style.position = 'relative';
      this.webglHost.appendChild(panel);
      this.controlsHelpElement = panel;
    } else {
      this.controlsHelpElement.remove();
      this.controlsHelpElement = null;
    }
  }

  showCaptureNotice(message) {
    if (!this.webglHost || typeof document === 'undefined') return;
    if (!this.captureNotice) {
      const notice = document.createElement('div');
      notice.setAttribute('role', 'status');
      notice.setAttribute('aria-live', 'polite');
      notice.style.cssText = 'position:absolute;z-index:10000;left:50%;top:12px;transform:translateX(-50%);padding:9px 13px;border-radius:8px;background:rgba(11,30,58,.94);color:#fff;font:600 13px/1.35 system-ui,sans-serif;box-shadow:0 3px 14px rgba(0,0,0,.25);pointer-events:none;max-width:90%;text-align:center;';
      const computed = window.getComputedStyle(this.webglHost);
      if (computed.position === 'static') this.webglHost.style.position = 'relative';
      this.webglHost.appendChild(notice);
      this.captureNotice = notice;
    }
    this.captureNotice.textContent = message;
    clearTimeout(this.captureNoticeTimer);
    this.captureNoticeTimer = setTimeout(() => {
      this.captureNotice?.remove();
      this.captureNotice = null;
    }, 2200);
  }

  captureScreenshot() {
    const canvas = this.renderer?.domElement;
    if (!canvas) {
      this.showCaptureNotice('Screenshot unavailable');
      return;
    }
    try {
      canvas.toBlob((blob) => {
        if (!blob) {
          this.showCaptureNotice('Screenshot could not be created');
          return;
        }
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `kano-run-${new Date().toISOString().replace(/[:.]/g, '-')}.png`;
        link.style.display = 'none';
        document.body.appendChild(link);
        link.click();
        link.remove();
        setTimeout(() => URL.revokeObjectURL(url), 1500);
        this.showCaptureNotice('Screenshot saved');
      }, 'image/png');
    } catch (error) {
      this.showCaptureNotice('Screenshot unavailable on this canvas');
    }
  }

  readQuality() {
    try {
      return localStorage.getItem('kano-run-quality') || '';
    } catch {
      return '';
    }
  }

  applyQuality(value = 'high') {
    const allowed = value === 'low' || value === 'medium' || value === 'high';
    this.quality = allowed ? value : 'high';

    if (!this.renderer) return;

    const cap = this.quality === 'high' ? 2 : this.quality === 'medium' ? 1.5 : 1;
    this.basePixelRatio = Math.min(window.devicePixelRatio || 1, cap);
    this.renderer.setPixelRatio(this.basePixelRatio * (this.adaptivePixelScale || 1));
    this.renderer.shadowMap.enabled = this.quality !== 'low';

    if (this.sun?.shadow) {
      const mapSize = this.quality === 'high' ? 2048 : this.quality === 'medium' ? 1024 : 512;
      this.sun.shadow.mapSize.set(mapSize, mapSize);
      this.sun.shadow.map = null;
      this.sun.shadow.needsUpdate = true;
    }

    try {
      localStorage.setItem('kano-run-quality', this.quality);
    } catch {
      // ignore storage failures
    }
  }

  createWebGLCanvas() {
    const host = this.gameCanvas.parentElement || document.body;
    this.webglHost = host;

    if (host && getComputedStyle(host).position === 'static') {
      host.style.position = 'relative';
    }

    const existing = host?.querySelector?.('canvas[data-kano-run-webgl="true"]');
    if (existing && existing !== this.gameCanvas) {
      existing.remove();
    }

    const glCanvas = document.createElement('canvas');
    glCanvas.dataset.kanoRunWebgl = 'true';
    glCanvas.setAttribute('aria-hidden', 'true');
    glCanvas.style.position = 'absolute';
    glCanvas.style.inset = '0';
    glCanvas.style.width = '100%';
    glCanvas.style.height = '100%';
    glCanvas.style.display = 'block';
    glCanvas.style.zIndex = '0';
    glCanvas.style.pointerEvents = 'none';
    glCanvas.style.touchAction = 'none';

    // Keep the original 2D canvas intact underneath. Game/HUD/fallback code
    // continues to use gameCanvas and never touches this WebGL canvas.
    if (this.gameCanvas.nextSibling) {
      host.insertBefore(glCanvas, this.gameCanvas.nextSibling);
    } else {
      host.appendChild(glCanvas);
    }

    this.canvas = glCanvas;
    this.ownsCanvas = true;

    // Keep the existing HUD and touch controls above the 3D layer.
    for (const id of ['ui-overlay', 'controls']) {
      const element = document.getElementById(id);
      if (element) element.style.zIndex = '10';
    }
  }

  resize() {
    if (!this.renderer || !this.camera) return;
    const width = Math.max(this.webglHost?.clientWidth || this.gameCanvas.clientWidth || window.innerWidth, 1);
    const height = Math.max(this.webglHost?.clientHeight || this.gameCanvas.clientHeight || window.innerHeight, 1);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height, false);
  }

  laneToX(lane) {
    const n = clamp(Number(lane) || 0, 0, 2);
    return LANE_X[n] ?? 0;
  }

  screenYToZ(y, playerY = this.game?.playerY ?? 520) {
    const t = (playerY - (Number(y) || 0)) / Math.max(playerY, 1);
    return PLAYER_Z + t * 68;
  }

  addRoadSegment(z, districtIndex = 0) {
    const g = new THREE.Group();
    g.position.z = z;
    g.userData.baseZ = z;
    g.userData.district = districtIndex;

    // Load local road textures from Vite's public/textures directory.
    // If an image is missing, the existing procedural material remains usable.
    const asphaltTexture = this.loadTiledTexture(
      `${TEXTURE_ROOT}/asphalt-${(districtIndex % 3) + 1}.jpg`, 2.5, 8
    ) || this.loadTiledTexture(`${TEXTURE_ROOT}/asphalt.jpg`, 2.5, 8);
    const asphalt = makeMat(0xffffff, 1, 0.02, asphaltTexture ? { map: asphaltTexture } : {});
    const shoulder = makeMat(0x7e6d59, 1, 0);
    const curb = makeMat(0x7a7a73, 0.95, 0);
    const lineWhite = makeMat(0xf1ead4, 0.72, 0);
    const lineYellow = makeMat(0xd5aa2e, 0.7, 0);

    addBox(g, [12.5, 0.22, ROAD_LEN / 4], [0, -0.15, 0], asphalt, null, false, true);
    addBox(g, [2.8, 0.18, ROAD_LEN / 4], [-7.65, -0.18, 0], shoulder, null, false, true);
    addBox(g, [2.8, 0.18, ROAD_LEN / 4], [7.65, -0.18, 0], shoulder, null, false, true);

    addBox(g, [0.16, 0.08, ROAD_LEN / 4], [-6.04, 0, 0], curb, null, false, true);
    addBox(g, [0.16, 0.08, ROAD_LEN / 4], [6.04, 0, 0], curb, null, false, true);

    addBox(g, [0.1, 0.03, ROAD_LEN / 4], [-5.82, 0.03, 0], lineYellow, null, false, false);
    addBox(g, [0.1, 0.03, ROAD_LEN / 4], [5.82, 0.03, 0], lineYellow, null, false, false);

    const segmentLength = ROAD_LEN / 4;
    const dashCount = this.quality === 'low' ? 9 : 13;
    for (let i = 0; i < dashCount; i += 1) {
      const zLocal = -segmentLength / 2 + (i + 0.4) * (segmentLength / dashCount);
      addBox(g, [0.12, 0.035, segmentLength * 0.34], [-1.2, 0.03, zLocal], lineWhite, null, false, false);
      addBox(g, [0.12, 0.035, segmentLength * 0.34], [1.2, 0.03, zLocal], lineWhite, null, false, false);
    }

    // Roadside gutter and pedestrian pavement.
    const pavement = makeMat(0x9e917d, 1, 0);
    addBox(g, [1.35, 0.1, ROAD_LEN / 4], [-5.35, -0.06, 0], pavement, null, false, true);
    addBox(g, [1.35, 0.1, ROAD_LEN / 4], [5.35, -0.06, 0], pavement, null, false, true);

    this.addRoadFurniture(g, districtIndex, -1);
    this.addRoadFurniture(g, districtIndex, 1);

    this.world.add(g);
    this.roadSegments.push(g);
    return g;
  }

  buildRoad() {
    const old = this.world.getObjectByName('road');
    if (old) this.world.remove(old);

    const road = new THREE.Group();
    road.name = 'road';
    this.world.add(road);
    this.roadGroup = road;

    const count = this.quality === 'low' ? 4 : 6;
    const segLen = ROAD_LEN / 4;
    for (let i = 0; i < count; i += 1) {
      const segment = this.addRoadSegment(i * segLen - segLen * 0.5, i % DISTRICTS.length);
      road.attach(segment);
    }

    // A wide underlay catches shadows and gives the road depth at the horizon.
    const groundMat = makeMat(0x6f614f, 1, 0);
    addBox(this.world, [44, 0.12, 230], [0, -0.28, 62], groundMat, null, false, true);
  }

  addRoadFurniture(parent, districtIndex, side) {
    const s = side;
    const seedBase = (districtIndex + 1) * (side < 0 ? 11 : 17);

    const shoulderX = side * 6.95;
    const outerX = side * 8.45;

    // Utility poles and overhead wire support.
    const pole = addCylinder(parent, 0.09, 5.4, [outerX, 2.7, -4], makeMat(0x594e44, 0.95, 0), null, 10);
    pole.castShadow = this.quality !== 'low';
    addBox(parent, [1.9, 0.08, 0.08], [outerX, 5.1, -4], makeMat(0x544a41, 1, 0), null, true, false);

    // Street light.
    const lightPole = addCylinder(parent, 0.055, 3.9, [shoulderX, 1.95, 19], makeMat(0x4e5558, 0.7, 0.15), null, 10);
    lightPole.castShadow = this.quality !== 'low';
    addBox(parent, [0.55, 0.08, 0.08], [shoulderX - side * 0.24, 3.82, 19], makeMat(0x4e5558, 0.7, 0.15), [0, 0, -side * 0.14]);
    addSphere(parent, 0.09, [shoulderX - side * 0.53, 3.76, 19], makeMat(0xffe7a6, 0.35, 0, { emissive: 0xffd56d, emissiveIntensity: 0.35 }));

    // A few route-side props. These are intentionally varied instead of a row of identical boxes.
    const propSeed = seedBase * 31.77;
    const propKind = Math.floor(seeded(propSeed) * 5);
    const z = -31 + seeded(propSeed + 2) * 54;

    if (propKind === 0) this.addShopFront(parent, outerX + s * 0.1, z, districtIndex, s);
    else if (propKind === 1) this.addMarketStall(parent, outerX + s * 0.2, z, districtIndex, s);
    else if (propKind === 2) this.addCompound(parent, outerX + s * 0.2, z, districtIndex, s);
    else if (propKind === 3) this.addMosque(parent, outerX + s * 0.3, z, districtIndex, s);
    else this.addTreeCluster(parent, outerX + s * 0.2, z, districtIndex, s);
  }

  buildCityscape() {
    this.city = new THREE.Group();
    this.city.name = 'cityscape';
    this.world.add(this.city);

    const repeats = this.quality === 'low' ? 8 : 14;
    const half = 115;

    for (let i = 0; i < repeats; i += 1) {
      const z = -18 + i * (210 / repeats);
      const districtIndex = i % DISTRICTS.length;
      this.addDistrictSlice(z, districtIndex, -1, i);
      this.addDistrictSlice(z + 8, (districtIndex + 2) % DISTRICTS.length, 1, i + 31);
    }

    // Distant skyline creates depth without expensive geometry.
    const distant = new THREE.Group();
    for (let i = 0; i < 26; i += 1) {
      const side = i % 2 === 0 ? -1 : 1;
      const x = side * (17 + seeded(i * 3.1) * 9);
      const z = -18 - seeded(i * 2.2) * 150;
      const h = 3.5 + seeded(i * 4.1) * 10;
      const w = 3 + seeded(i * 7.9) * 5;
      const d = 4 + seeded(i * 9.2) * 8;
      const mat = makeMat(pick([0x6f645b, 0x7b6b60, 0x5f635f, 0x807266], i), 1, 0);
      addBox(distant, [w, h, d], [x, h / 2 - 0.2, z], mat);
    }
    this.city.add(distant);

    // Faint desert/harmattan horizon hills.
    const horizonMat = makeMat(0x9b8b75, 1, 0);
    const hills = new THREE.Mesh(new THREE.ConeGeometry(50, 15, 9), horizonMat);
    hills.scale.z = 0.5;
    hills.position.set(-34, 5.5, -128);
    hills.rotation.y = 0.3;
    hills.castShadow = false;
    hills.receiveShadow = false;
    this.city.add(hills);
  }

  addDistrictSlice(z, districtIndex, side, index) {
    const district = DISTRICTS[districtIndex];
    const xBase = side * (7.8 + seeded(index * 5.7) * 2.6);
    const count = Math.max(2, Math.floor(2 + district.density * (this.quality === 'low' ? 1 : 2)));

    for (let i = 0; i < count; i += 1) {
      const seed = index * 100 + i * 17 + districtIndex * 9;
      const zz = z + (i - (count - 1) / 2) * 10 + (seeded(seed) - 0.5) * 4;
      const xx = xBase + side * (seeded(seed + 1) * 2.8);
      const kindRoll = seeded(seed + 2);

      if (kindRoll < 0.23) this.addShopFront(this.city, xx, zz, districtIndex, side, seed);
      else if (kindRoll < 0.39) this.addMarketStall(this.city, xx, zz, districtIndex, side, seed);
      else if (kindRoll < 0.56) this.addCompound(this.city, xx, zz, districtIndex, side, seed);
      else if (kindRoll < 0.67) this.addPetrolStation(this.city, xx, zz, districtIndex, side, seed);
      else if (kindRoll < 0.78) this.addBusStop(this.city, xx, zz, districtIndex, side, seed);
      else if (kindRoll < 0.88) this.addMosque(this.city, xx, zz, districtIndex, side, seed);
      else if (kindRoll < 0.95) this.addSchool(this.city, xx, zz, districtIndex, side, seed);
      else this.addBillboard(this.city, xx, zz, districtIndex, side, seed);
    }

    if (index % 2 === 0 && this.quality !== 'low') {
      this.addTreeCluster(this.city, xBase + side * 3.5, z + 5, districtIndex, side, index * 44.4);
    }
  }

  addShopFront(parent, x, z, districtIndex, side, seed = districtIndex + 1) {
    const district = DISTRICTS[districtIndex];
    const group = new THREE.Group();
    group.position.set(x, 0, z);

    const bodyColor = pick(district.palette, seed + 1);
    const wallTexture = this.loadLocalTexture(`${TEXTURE_ROOT}/building-wall${districtIndex % 2 ? '-1' : ''}.jpg`);
    const body = makeMat(wallTexture ? 0xffffff : bodyColor, 0.96, 0, wallTexture ? { map: wallTexture } : {});
    const trim = makeMat(0x8d3f2d, 0.8, 0);
    const roof = makeMat(0x5b4e44, 0.95, 0);
    const dark = makeMat(0x191f24, 0.75, 0.02);
    const signTex = createCanvasTexture((ctx, w, h) => {
      ctx.fillStyle = '#efe0ba';
      ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = '#2f2a25';
      ctx.font = 'bold 24px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(pick(['SHOP', 'KANTI', 'MOBILE MONEY', 'MINI MART', 'BUSINESS'], seed * 3), w / 2, h / 2);
    });
    const sign = makeMat(0xffffff, 0.8, 0, { map: signTex });

    addBox(group, [4.2, 3.1, 4.0], [0, 1.55, 0], body);
    addBox(group, [4.35, 0.16, 4.1], [0, 3.13, 0], roof);
    addBox(group, [3.6, 1.55, 0.12], [0, 1.15, side < 0 ? 2.02 : -2.02], dark, null, true, false);
    addBox(group, [3.45, 0.62, 0.13], [0, 2.45, side < 0 ? 2.06 : -2.06], sign);
    addBox(group, [0.18, 2.9, 4.12], [-2.08, 1.55, 0], trim);
    addBox(group, [0.18, 2.9, 4.12], [2.08, 1.55, 0], trim);

    // awning and a small roadside display.
    addBox(group, [4.55, 0.12, 0.75], [0, 2.05, side < 0 ? 2.35 : -2.35], makeMat(0x3c4d53, 0.9, 0));
    addBox(group, [1.5, 0.85, 0.7], [side * 2.7, 0.43, side < 0 ? 2.65 : -2.65], makeMat(0x8e7656, 0.95, 0));

    group.traverse((o) => {
      o.userData.kind = 'shop';
    });
    parent.add(group);
    return group;
  }

  addMarketStall(parent, x, z, districtIndex, side, seed = districtIndex + 5) {
    const group = new THREE.Group();
    group.position.set(x, 0, z);

    const wood = makeMat(0x6a4d38, 0.95, 0);
    const stallTexture = this.loadLocalTexture(`${TEXTURE_ROOT}/market-stall${Math.abs(Math.floor(seed)) % 3 ? `-${(Math.abs(Math.floor(seed)) % 3)}` : ''}.jpg`);
    const cloth = makeMat(stallTexture ? 0xffffff : pick([0x7f8d3a, 0x9f4b35, 0x375a78, 0x7b4c72], seed), 0.95, 0, stallTexture ? { map: stallTexture } : {});
    const crates = makeMat(0x926d4d, 0.98, 0);
    const goods = makeMat(pick([0xc38c36, 0xb94c2b, 0x6b8150, 0x8d6b3b], seed + 6), 0.9, 0);

    addBox(group, [2.3, 0.12, 1.25], [0, 1.9, 0], cloth);
    addBox(group, [2.15, 0.1, 1.17], [0, 1.82, 0], wood);
    for (const px of [-0.9, 0.9]) {
      addCylinder(group, 0.045, 1.82, [px, 0.92, 0], wood, null, 8);
    }
    addBox(group, [2.2, 0.28, 1.15], [0, 0.16, 0], crates);
    addBox(group, [0.58, 0.32, 0.45], [-0.65, 0.46, side < 0 ? 0.08 : -0.08], goods);
    addSphere(group, 0.2, [0.7, 0.52, side < 0 ? 0.1 : -0.1], goods, [1.2, 0.75, 1]);

    parent.add(group);
    return group;
  }

  addCompound(parent, x, z, districtIndex, side, seed = districtIndex + 10) {
    const group = new THREE.Group();
    group.position.set(x, 0, z);

    const wall = makeMat(pick(DISTRICTS[districtIndex].palette, seed), 1, 0);
    const wallDark = makeMat(0x806c58, 1, 0);
    const roof = makeMat(0x64554a, 1, 0);
    const gate = makeMat(0x3b4143, 0.8, 0.1);

    addBox(group, [4.6, 2.8, 4.6], [0, 1.4, 0], wall);
    addBox(group, [5.1, 0.35, 5.0], [0, 2.85, 0], roof);
    addBox(group, [1.65, 1.9, 0.15], [0, 0.95, side < 0 ? 2.33 : -2.33], gate);
    addBox(group, [5.0, 1.55, 0.18], [side * 2.35, 0.78, side < 0 ? 2.33 : -2.33], wallDark);

    // Water tank and small satellite dish silhouette.
    addCylinder(group, 0.36, 0.9, [1.35, 3.48, 0.8], makeMat(0x64737b, 0.9, 0.05), null, 16);
    addCylinder(group, 0.03, 0.85, [1.35, 4.02, 0.8], makeMat(0x535353, 0.8, 0.1), null, 8);

    parent.add(group);
    return group;
  }

  addMosque(parent, x, z, districtIndex, side, seed = districtIndex + 20) {
    const group = new THREE.Group();
    group.position.set(x, 0, z);

    const wall = makeMat(pick([0xd4c3a6, 0xcdb690, 0xbfa47d], seed), 0.96, 0);
    const accent = makeMat(0x7c6d58, 0.88, 0);
    const dome = makeMat(0x4e705b, 0.75, 0.03);
    const dark = makeMat(0x23282a, 0.9, 0);

    addBox(group, [4.2, 2.6, 4.4], [0, 1.3, 0], wall);
    addBox(group, [4.55, 0.18, 4.7], [0, 2.56, 0], accent);
    const domeMesh = new THREE.Mesh(new THREE.SphereGeometry(1.4, 22, 14, 0, TAU, 0, Math.PI * 0.53), dome);
    domeMesh.position.set(0, 2.65, 0);
    domeMesh.castShadow = true;
    group.add(domeMesh);
    addCylinder(group, 0.1, 0.38, [0, 4.05, 0], accent, null, 10);

    // Minaret.
    addBox(group, [0.55, 5.0, 0.55], [side * 2.45, 2.45, 0], wall);
    addCylinder(group, 0.38, 0.42, [side * 2.45, 5.05, 0], dome, null, 14);
    addBox(group, [0.75, 0.15, 0.75], [side * 2.45, 4.18, 0], accent);

    addBox(group, [1.1, 1.55, 0.16], [0, 0.78, side < 0 ? 2.25 : -2.25], dark, null, true, false);
    parent.add(group);
    return group;
  }

  addPetrolStation(parent, x, z, districtIndex, side, seed = districtIndex + 30) {
    const group = new THREE.Group();
    group.position.set(x, 0, z);
    const concrete = makeMat(0x9a8e7f, 0.96, 0);
    const canopy = makeMat(pick([0xc53c2d, 0x2e6e50, 0x3b4f86], seed), 0.88, 0);
    const white = makeMat(0xe5e1d6, 0.92, 0);
    const glass = makeMat(0x29414b, 0.38, 0.08, { transparent: true, opacity: 0.82 });

    addBox(group, [5.2, 2.4, 4.7], [0, 1.2, 0], concrete);
    addBox(group, [5.5, 0.22, 5.1], [0, 2.52, 0], canopy);
    for (const px of [-2.0, 2.0]) addCylinder(group, 0.08, 2.38, [px, 1.2, 0], white, null, 10);
    addBox(group, [3.5, 1.7, 0.12], [0, 1.2, side < 0 ? 2.4 : -2.4], glass, null, true, false);
    addBox(group, [1.35, 0.32, 0.75], [1.0, 0.43, side < 0 ? 2.63 : -2.63], canopy);

    parent.add(group);
    return group;
  }

  addBusStop(parent, x, z, districtIndex, side, seed = districtIndex + 40) {
    const group = new THREE.Group();
    group.position.set(x, 0, z);
    const metal = makeMat(0x565e61, 0.82, 0.18);
    const roof = makeMat(0x3d5661, 0.72, 0.1);
    const boardTex = createCanvasTexture((ctx, w, h) => {
      ctx.fillStyle = '#efe5c8';
      ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = '#2d3134';
      ctx.font = 'bold 24px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(pick(['TAXI STOP', 'BUS STOP', 'KORAR FASAHA'], seed), w / 2, h / 2);
    });
    const board = makeMat(0xffffff, 0.8, 0, { map: boardTex });

    addBox(group, [3.6, 0.08, 1.2], [0, 2.2, 0], roof);
    for (const px of [-1.45, 1.45]) addCylinder(group, 0.045, 2.15, [px, 1.08, 0], metal, null, 8);
    addBox(group, [2.8, 0.75, 0.08], [0, 0.67, 0], metal);
    addBox(group, [1.7, 0.52, 0.12], [0, 1.52, side < 0 ? 0.58 : -0.58], board);

    parent.add(group);
    return group;
  }

  addSchool(parent, x, z, districtIndex, side, seed = districtIndex + 50) {
    const group = new THREE.Group();
    group.position.set(x, 0, z);
    const wall = makeMat(0xd0bc98, 0.96, 0);
    const accent = makeMat(0x45606e, 0.9, 0);
    const boardTex = createCanvasTexture((ctx, w, h) => {
      ctx.fillStyle = '#f1e7cb';
      ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = '#36474f';
      ctx.font = 'bold 20px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('SCHOOL', w / 2, h / 2);
    });
    const board = makeMat(0xffffff, 0.85, 0, { map: boardTex });
    addBox(group, [4.8, 2.8, 4.4], [0, 1.4, 0], wall);
    addBox(group, [5.0, 0.15, 4.6], [0, 2.84, 0], accent);
    addBox(group, [1.9, 1.1, 0.15], [0, 1.45, side < 0 ? 2.25 : -2.25], board, null, true, false);
    addBox(group, [1.2, 1.85, 0.2], [side * 1.55, 0.93, side < 0 ? 2.25 : -2.25], accent);
    parent.add(group);
    return group;
  }

  addBillboard(parent, x, z, districtIndex, side, seed = districtIndex + 60) {
    const group = new THREE.Group();
    group.position.set(x, 0, z);
    const post = makeMat(0x4c4b48, 0.9, 0.1);
    const signTex = createCanvasTexture((ctx, w, h) => {
      ctx.fillStyle = pick(['#e5d2a8', '#d7c3a1', '#e1d8c0'], seed).replace('0x', '#');
      ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = '#20252b';
      ctx.font = 'bold 21px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(pick(['KANO RUN', 'AREWA MOBILE', 'AI • DIGITAL', 'COMMUNITY MARKET'], seed + 2), w / 2, h / 2);
    });
    const sign = makeMat(0xffffff, 0.8, 0, { map: signTex });
    addCylinder(group, 0.07, 4.2, [0, 2.1, 0], post, null, 10);
    addBox(group, [3.8, 1.6, 0.12], [0, 3.3, 0], sign, null, true, false);
    parent.add(group);
    return group;
  }

  addTreeCluster(parent, x, z, districtIndex, side, seed = districtIndex + 70) {
    const group = new THREE.Group();
    group.position.set(x, 0, z);
    const trunk = makeMat(0x5f4637, 1, 0);
    const leaves = makeMat(pick([0x49663b, 0x587342, 0x6d7b4a], seed), 0.95, 0);

    const count = this.quality === 'low' ? 1 : 2;
    for (let i = 0; i < count; i += 1) {
      const px = (seeded(seed + i * 8) - 0.5) * 2.2;
      const pz = (seeded(seed + i * 9) - 0.5) * 2.8;
      const height = 1.3 + seeded(seed + i * 11) * 1.4;
      addCylinder(group, 0.13, height, [px, height / 2, pz], trunk, null, 8);
      addSphere(group, 0.82 + seeded(seed + i) * 0.25, [px, height + 0.52, pz], leaves, [1.15, 0.95, 1.15]);
    }

    parent.add(group);
    return group;
  }

  makeTextureFallback(path) {
    if (typeof document === 'undefined') return null;
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 256;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;

    const name = String(path || '').toLowerCase();
    if (name.includes('asphalt') || name.includes('pothole')) {
      ctx.fillStyle = '#34383b';
      ctx.fillRect(0, 0, 256, 256);
      for (let i = 0; i < 850; i += 1) {
        const shade = 35 + Math.floor(Math.random() * 45);
        ctx.fillStyle = `rgb(${shade},${shade},${shade})`;
        const size = 1 + Math.random() * 3;
        ctx.fillRect(Math.random() * 256, Math.random() * 256, size, size);
      }
      if (name.includes('pothole')) {
        ctx.strokeStyle = '#222629';
        ctx.lineWidth = 3;
        for (let i = 0; i < 7; i += 1) {
          const x = 20 + Math.random() * 216;
          const y = 20 + Math.random() * 216;
          ctx.beginPath();
          ctx.moveTo(x, y);
          ctx.lineTo(x + (Math.random() - 0.5) * 35, y + (Math.random() - 0.5) * 35);
          ctx.lineTo(x + (Math.random() - 0.5) * 65, y + (Math.random() - 0.5) * 65);
          ctx.stroke();
        }
      }
    } else if (name.includes('market-stall')) {
      ctx.fillStyle = '#d9c7a0';
      ctx.fillRect(0, 0, 256, 256);
      for (let x = 0; x < 256; x += 32) {
        ctx.fillStyle = Math.floor(x / 32) % 2 ? '#b7442f' : '#e7d8b5';
        ctx.fillRect(x, 0, 32, 256);
      }
      ctx.fillStyle = 'rgba(50,35,25,0.12)';
      ctx.fillRect(0, 0, 256, 256);
    } else {
      ctx.fillStyle = '#b99f7d';
      ctx.fillRect(0, 0, 256, 256);
      ctx.strokeStyle = 'rgba(65,48,35,0.35)';
      ctx.lineWidth = 2;
      for (let y = 0; y < 256; y += 32) {
        ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(256, y); ctx.stroke();
      }
      for (let row = 0; row < 8; row += 1) {
        const offset = row % 2 ? 0 : 16;
        for (let x = offset; x < 256; x += 64) {
          ctx.beginPath(); ctx.moveTo(x, row * 32); ctx.lineTo(x, row * 32 + 32); ctx.stroke();
        }
      }
    }

    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = Math.min(this.renderer?.capabilities?.getMaxAnisotropy?.() || 1, 4);
    this.ownedTextures.add(texture);
    return texture;
  }

  loadLocalTexture(path) {
    if (!path) return null;
    if (this.textureCache.has(path)) return this.textureCache.get(path);
    try {
      const loader = new THREE.TextureLoader();
      let texture = null;
      texture = loader.load(path, undefined, undefined, () => {
        if (!texture || this.ready === false && !this.renderer) return;
        const fallback = this.makeTextureFallback(path);
        if (!fallback) return;
        texture.image = fallback.image;
        texture.colorSpace = THREE.SRGBColorSpace;
        texture.needsUpdate = true;
        fallback.dispose();
      });
      texture.colorSpace = THREE.SRGBColorSpace;
      texture.anisotropy = Math.min(this.renderer?.capabilities?.getMaxAnisotropy?.() || 1, 8);
      this.textureCache.set(path, texture);
      this.ownedTextures.add(texture);
      return texture;
    } catch {
      const fallback = this.makeTextureFallback(path);
      if (fallback) this.textureCache.set(path, fallback);
      return fallback;
    }
  }

  loadTiledTexture(path, repeatX = 1, repeatY = 1) {
    const baseTexture = this.loadLocalTexture(path);
    if (!baseTexture) return null;
    const texture = baseTexture.clone();
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    texture.repeat.set(repeatX, repeatY);
    texture.needsUpdate = true;
    this.ownedTextures.add(texture);
    return texture;
  }

  makeKeke(paint = this.paint, options = {}) {
    const group = new THREE.Group();
    group.userData.kind = 'keke';
    group.userData.wheels = [];
    group.userData.steering = null;
    group.userData.body = null;
    group.userData.driver = null;
    group.userData.suspension = 0;

    const bodyMat = makeMat(paint, 0.56, 0.04);
    const darkMat = makeMat(0x171b1e, 0.82, 0.05);
    const glassMat = makeMat(0x22363e, 0.18, 0.06, { transparent: true, opacity: 0.78 });
    const chrome = makeMat(0xa8adb0, 0.32, 0.66);
    const seatMat = makeMat(0x242424, 0.96, 0);
    const red = makeMat(0xb93131, 0.56, 0.02);
    const amber = makeMat(0xffb438, 0.42, 0, { emissive: 0xff9d1a, emissiveIntensity: 0.25 });
    const headMat = makeMat(0xf7f0ca, 0.28, 0, { emissive: 0xffedb0, emissiveIntensity: 0.18 });

    const chassis = addBox(group, [1.58, 0.38, 2.45], [0, 0.83, 0], bodyMat);
    chassis.scale.z = 1.02;
    group.userData.body = chassis;

    // Nose and rear body shaping.
    addBox(group, [1.35, 0.26, 0.55], [0, 0.98, -1.16], bodyMat, [0.1, 0, 0]);
    addBox(group, [1.5, 0.24, 0.42], [0, 0.98, 1.08], bodyMat, [-0.12, 0, 0]);
    addBox(group, [1.36, 0.08, 2.1], [0, 1.06, 0], chrome, null, true, false);

    // Cabin frame.
    addBox(group, [1.42, 0.12, 2.08], [0, 1.99, 0], darkMat);
    addBox(group, [0.1, 1.05, 2.12], [-0.67, 1.48, 0], darkMat);
    addBox(group, [0.1, 1.05, 2.12], [0.67, 1.48, 0], darkMat);
    addBox(group, [1.42, 0.1, 2.12], [0, 2.0, 0], darkMat);

    // Front windscreen and rear opening.
    addBox(group, [1.18, 0.72, 0.08], [0, 1.53, -1.0], glassMat, [0.1, 0, 0]);
    addBox(group, [1.16, 0.66, 0.08], [0, 1.5, 1.0], glassMat);

    // Roof canopy layers.
    addBox(group, [1.58, 0.18, 2.3], [0, 2.08, 0], bodyMat);
    addBox(group, [1.64, 0.08, 2.36], [0, 2.18, 0], darkMat);

    // Passenger bench and driver seat.
    addBox(group, [1.2, 0.16, 0.66], [0, 1.13, 0.42], seatMat);
    addBox(group, [0.7, 0.52, 0.26], [0, 1.4, 0.67], seatMat);
    addBox(group, [0.45, 0.17, 0.58], [0, 1.22, -0.62], seatMat);

    // Dashboard and handlebar/steering wheel.
    addBox(group, [1.02, 0.23, 0.28], [0, 1.34, -0.78], darkMat);
    const steering = new THREE.Group();
    steering.position.set(0, 1.42, -0.84);
    group.add(steering);
    const steeringRing = new THREE.Mesh(new THREE.TorusGeometry(0.17, 0.035, 8, 18), chrome);
    steeringRing.rotation.x = Math.PI / 2;
    steering.add(steeringRing);
    addCylinder(steering, 0.025, 0.2, [0, -0.02, 0], chrome, null, 8);
    group.userData.steering = steering;

    // Front lamps, tail lamp and turn signals.
    for (const sx of [-0.48, 0.48]) {
      addSphere(group, 0.105, [sx, 0.98, -1.25], headMat, [1.08, 0.8, 0.64]);
      addSphere(group, 0.06, [sx, 0.94, 1.24], red, [1.05, 0.75, 0.5]);
    }
    addBox(group, [0.12, 0.1, 0.2], [-0.72, 0.95, -1.17], amber);
    addBox(group, [0.12, 0.1, 0.2], [0.72, 0.95, -1.17], amber);

    // Wheels are separate groups so they can rotate.
    const wheelMat = makeMat(0x17191b, 0.94, 0.02);
    const hubMat = makeMat(0x8c8f8e, 0.4, 0.55);
    const wheelPositions = [
      [-0.79, 0.48, -0.77],
      [0.79, 0.48, -0.77],
      [-0.79, 0.48, 0.78],
      [0.79, 0.48, 0.78],
    ];
    for (const [wx, wy, wz] of wheelPositions) {
      const wheel = new THREE.Group();
      wheel.position.set(wx, wy, wz);
      wheel.rotation.z = Math.PI / 2;
      const tire = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.24, 0.16, 18), wheelMat);
      tire.castShadow = true;
      tire.receiveShadow = true;
      wheel.add(tire);
      const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.17, 12), hubMat);
      hub.castShadow = true;
      wheel.add(hub);
      group.add(wheel);
      group.userData.wheels.push(wheel);
    }

    // Driver silhouette.
    const driver = new THREE.Group();
    driver.position.set(0, 1.32, -0.48);
    const skin = makeMat(0x6a432e, 0.98, 0);
    const shirt = makeMat(options.driverColor ?? 0x31556a, 0.96, 0);
    addSphere(driver, 0.19, [0, 0.54, 0], skin, [0.92, 1.02, 0.92]);
    addBox(driver, [0.33, 0.5, 0.25], [0, 0.28, 0], shirt);
    addBox(driver, [0.1, 0.42, 0.09], [-0.24, 0.34, -0.01], skin, [0, 0, -0.12]);
    addBox(driver, [0.1, 0.42, 0.09], [0.24, 0.34, -0.01], skin, [0, 0, 0.12]);
    group.add(driver);
    group.userData.driver = driver;

    if (options.usePlayerTexture) {
      const tex = this.loadLocalTexture(`${ASSET_ROOT}/player/keke-player.png`);
      if (tex) {
        const decalMat = makeMat(0xffffff, 0.64, 0, { map: tex, transparent: true, alphaTest: 0.04 });
        const decal = addBox(group, [1.05, 0.46, 0.045], [0, 1.18, -1.255], decalMat, null, false, false);
        decal.userData.isDecal = true;
      }
    }

    return group;
  }

  buildPlayer() {
    this.player = this.makeKeke(this.paint, { usePlayerTexture: true, driverColor: 0x2f5870 });
    this.player.position.set(0, 0, PLAYER_Z);
    this.player.rotation.y = Math.PI;
    this.player.userData.baseScale = this.player.scale.clone();
    this.world.add(this.player);

    this.playerWheels = this.player.userData.wheels || [];
    this.playerSteering = this.player.userData.steering || null;

    const shadowGeo = new THREE.CircleGeometry(1.2, 24);
    const shadowMat = makeMat(0x000000, 1, 0, { transparent: true, opacity: 0.23, depthWrite: false });
    this.playerShadow = new THREE.Mesh(shadowGeo, shadowMat);
    this.playerShadow.rotation.x = -Math.PI / 2;
    this.playerShadow.position.set(0, 0.015, PLAYER_Z + 0.25);
    this.playerShadow.scale.set(1.08, 1.0, 1.55);
    this.world.add(this.playerShadow);
  }

  makeVehicle(type, variant = 0) {
    const info = TYPE_INFO[type] || TYPE_INFO.sedan;
    const group = new THREE.Group();
    group.userData.type = type;
    group.userData.w = info.w;
    group.userData.l = info.l;
    group.userData.speed = info.speed;
    group.userData.wheels = [];
    group.userData.steering = null;
    group.userData.patrolLamp = null;
    group.userData.brakeLights = [];
    group.userData.indicators = [];
    group.userData.suspension = 0;
    group.userData.lastSpeed = info.speed;

    const mainColor = type === 'taxi'
      ? 0xe6ca3f
      : type === 'karota'
        ? 0x223c49
        : type === 'police'
          ? 0x253c50
          : pick([info.color, info.color + 0x131313, info.color - 0x101010], variant + 0.4);

    const body = makeMat(mainColor, 0.55, 0.05);
    const dark = makeMat(0x191d21, 0.86, 0.02);
    const glass = makeMat(0x21353d, 0.16, 0.05, { transparent: true, opacity: 0.8 });
    const chrome = makeMat(0xa4aaad, 0.36, 0.62);
    const head = makeMat(0xf7efd0, 0.25, 0, { emissive: 0xffe7a4, emissiveIntensity: 0.22 });
    const tail = makeMat(0xd84646, 0.34, 0, { emissive: 0x6d1515, emissiveIntensity: 0.12 });
    const wheelMat = makeMat(0x17191b, 0.96, 0.02);

    if (type === 'keke') {
      const k = this.makeKeke(mainColor, { driverColor: 0x3b5261 });
      group.add(...k.children);
      group.userData.wheels = k.userData.wheels;
      group.userData.steering = k.userData.steering;
      return group;
    }

    if (type === 'motorcycle') {
      addBox(group, [0.44, 0.35, 1.3], [0, 0.78, 0], body);
      addBox(group, [0.5, 0.28, 0.55], [0, 1.02, -0.34], dark);
      addBox(group, [0.28, 0.08, 0.95], [0, 1.16, -0.2], chrome);
      for (const z of [-0.76, 0.78]) {
        const wheel = new THREE.Group();
        wheel.position.set(0, 0.34, z);
        wheel.rotation.z = Math.PI / 2;
        const tire = new THREE.Mesh(new THREE.CylinderGeometry(0.29, 0.29, 0.13, 16), wheelMat);
        tire.castShadow = true;
        wheel.add(tire);
        group.add(wheel);
        group.userData.wheels.push(wheel);
      }
      const rider = new THREE.Group();
      const skin = makeMat(0x6a432e, 0.98, 0);
      addSphere(rider, 0.15, [0, 1.25, -0.05], skin, [0.92, 1.03, 0.92]);
      addBox(rider, [0.27, 0.5, 0.24], [0, 1.0, -0.05], body);
      group.add(rider);
      return group;
    }

    // Sedan / taxi / police / KAROTA silhouette.
    const lower = addBox(group, [info.w, 0.56, info.l], [0, 0.66, 0], body);
    lower.scale.x = type === 'police' || type === 'karota' ? 1.03 : 1;
    addBox(group, [info.w * 0.86, 0.75, info.l * 0.49], [0, 1.23, 0.16], glass);
    addBox(group, [info.w * 0.92, 0.14, info.l * 0.58], [0, 1.52, 0.18], body);
    addBox(group, [info.w * 0.78, 0.08, info.l * 0.43], [0, 1.64, 0.22], dark);

    for (const sx of [-info.w * 0.38, info.w * 0.38]) {
      const headLamp = addSphere(group, 0.09, [sx, 0.79, -info.l * 0.47], head, [1.15, 0.8, 0.5]);
      const tailLamp = addSphere(group, 0.075, [sx, 0.74, info.l * 0.47], tail, [1.15, 0.8, 0.5]);
      group.userData.brakeLights.push(tailLamp);
      group.userData.headLights = group.userData.headLights || [];
      group.userData.headLights.push(headLamp);
    }

    const indicatorMat = makeMat(0xffb21c, 0.25, 0.08, { emissive: 0x8a4d00, emissiveIntensity: 0.15 });
    for (const sx of [-info.w * 0.38, info.w * 0.38]) {
      const front = addSphere(group, 0.045, [sx, 0.81, -info.l * 0.495], indicatorMat, [1.35, 0.8, 0.5]);
      const rear = addSphere(group, 0.04, [sx, 0.76, info.l * 0.495], indicatorMat, [1.35, 0.8, 0.5]);
      group.userData.indicators.push(front, rear);
    }

    const wheelZ = info.l * 0.34;
    for (const z of [-wheelZ, wheelZ]) {
      for (const x of [-info.w * 0.48, info.w * 0.48]) {
        const wheel = new THREE.Group();
        wheel.position.set(x, 0.45, z);
        wheel.rotation.z = Math.PI / 2;
        wheel.userData.steer = (z < 0);
        const tire = new THREE.Mesh(new THREE.CylinderGeometry(type === 'bus' ? 0.44 : 0.32, type === 'bus' ? 0.44 : 0.32, 0.16, 18), wheelMat);
        tire.castShadow = true;
        tire.receiveShadow = true;
        wheel.add(tire);
        const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.17, 12), chrome);
        wheel.add(hub);
        group.add(wheel);
        group.userData.wheels.push(wheel);
      }
    }

    if (type === 'taxi') {
      const taxiTop = makeMat(0xf1e7be, 0.68, 0);
      addBox(group, [0.75, 0.18, 0.28], [0, 1.76, -0.05], taxiTop);
    }

    if (type === 'police') {
      const blue = makeMat(0x3857c8, 0.4, 0.1, { emissive: 0x182f7a, emissiveIntensity: 0.3 });
      const red = makeMat(0xb82e38, 0.4, 0.1, { emissive: 0x67131a, emissiveIntensity: 0.3 });
      addBox(group, [0.6, 0.17, 0.3], [0, 1.82, -0.06], blue);
      group.userData.patrolLamp = { blue, red };
    }

    if (type === 'karota') {
      const stripe = makeMat(0xd7b52d, 0.5, 0.05);
      addBox(group, [info.w * 0.92, 0.16, 0.4], [0, 1.02, -0.05], stripe);
      const signTex = createCanvasTexture((ctx, w, h) => {
        ctx.fillStyle = '#f0d36a';
        ctx.fillRect(0, 0, w, h);
        ctx.fillStyle = '#18262f';
        ctx.font = 'bold 24px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('KAROTA', w / 2, h / 2);
      });
      const sign = makeMat(0xffffff, 0.82, 0, { map: signTex });
      addBox(group, [1.35, 0.43, 0.08], [0, 1.36, -info.l * 0.51], sign, null, true, false);
    }

    if (type === 'bus') {
      const band = makeMat(0x516c79, 0.76, 0.04);
      addBox(group, [info.w + 0.02, 0.34, info.l * 0.74], [0, 1.2, 0], band);
      for (let i = -2; i <= 2; i += 1) addBox(group, [0.46, 0.34, 0.1], [i * 0.44, 1.45, -2.0], dark);
      addBox(group, [0.28, 0.18, info.l * 0.85], chrome);
    }

    if (type === 'truck') {
      addBox(group, [info.w * 0.9, 1.5, info.l * 0.54], [0, 1.55, 0.98], makeMat(0xa88968, 0.95, 0));
      addBox(group, [info.w * 0.86, 0.8, info.l * 0.3], [0, 1.17, -1.55], glass);
      addBox(group, [info.w * 0.94, 0.15, info.l * 0.18], [0, 2.31, 0.98], dark);
    }

    return group;
  }

  buildTrafficPool() {
    this.trafficGroup = new THREE.Group();
    this.trafficGroup.name = 'traffic';
    this.world.add(this.trafficGroup);

    const types = ['keke', 'sedan', 'taxi', 'bus', 'motorcycle', 'truck', 'police', 'karota'];
    for (let i = 0; i < MAX_TRAFFIC; i += 1) {
      const type = types[i % types.length];
      const mesh = this.makeVehicle(type, i + 1);
      mesh.visible = false;
      mesh.userData.poolIndex = i;
      mesh.userData.lastY = 0;
      mesh.userData.animSeed = seeded(i + 1) * 100;
      this.trafficGroup.add(mesh);
      this.vehiclePool.push(mesh);
    }
  }

  makeWaitingPedestrian(variant = 0) {
    const group = new THREE.Group();
    group.userData.state = 'waiting';
    group.userData.phase = seeded(variant + 12) * TAU;
    group.userData.speed = 0.4 + seeded(variant + 17) * 0.55;

    const skin = makeMat(pick([0x5b3b29, 0x6b432d, 0x744932, 0x81543c], variant), 1, 0);
    const cloth = makeMat(pick([0x3d5870, 0x7f4938, 0x6f7541, 0x7b5b78, 0x8b7657], variant + 1), 0.98, 0);
    const dark = makeMat(0x1f2629, 0.96, 0);

    addSphere(group, 0.15, [0, 1.22, 0], skin, [0.92, 1.04, 0.92]);
    addBox(group, [0.28, 0.46, 0.2], [0, 0.85, 0], cloth);
    addBox(group, [0.08, 0.45, 0.07], [-0.16, 0.86, 0], skin, [0, 0, -0.08]);
    addBox(group, [0.08, 0.45, 0.07], [0.16, 0.86, 0], skin, [0, 0, 0.08]);
    addBox(group, [0.08, 0.52, 0.08], [-0.07, 0.33, 0], dark, [0, 0, 0.03]);
    addBox(group, [0.08, 0.52, 0.08], [0.07, 0.33, 0], dark, [0, 0, -0.03]);

    group.userData.leftArm = group.children[2];
    group.userData.rightArm = group.children[3];
    group.userData.leftLeg = group.children[4];
    group.userData.rightLeg = group.children[5];
    return group;
  }

  buildCheckpointPool() {
    this.checkpointGroup = new THREE.Group();
    this.checkpointGroup.name = 'checkpoint-visuals';
    this.world.add(this.checkpointGroup);

    const count = this.quality === 'low' ? 2 : 3;
    for (let i = 0; i < count; i += 1) {
      const root = new THREE.Group();
      root.visible = false;
      root.userData.index = i;
      root.userData.lamp = [];

      const dark = makeMat(0x22282b, 0.9, 0.02);
      const yellow = makeMat(0xd7b52d, 0.58, 0.04);
      const red = makeMat(0xb92d32, 0.38, 0.05, { emissive: 0x681015, emissiveIntensity: 0.18 });
      const white = makeMat(0xe8e0cc, 0.82, 0);
      const glass = makeMat(0x233c46, 0.22, 0.05, { transparent: true, opacity: 0.82 });

      // Lane-local inspection gate and barrier.
      addCylinder(root, 0.10, 2.7, [-2.2, 1.35, 0], dark, null, 10);
      addCylinder(root, 0.10, 2.7, [2.2, 1.35, 0], dark, null, 10);
      addBox(root, [4.55, 0.18, 0.18], [0, 2.58, 0], yellow);
      addBox(root, [4.1, 0.12, 0.12], [0, 2.25, 0], white);

      const barrier = addBox(root, [3.2, 0.12, 0.12], [0, 0.92, 0.0], red);
      barrier.rotation.z = -0.05;
      root.userData.barrier = barrier;

      // KAROTA roadside booth.
      const booth = new THREE.Group();
      booth.position.set(4.35, 0, 0.65);
      addBox(booth, [2.0, 2.1, 1.55], [0, 1.05, 0], white);
      addBox(booth, [2.1, 0.18, 1.65], [0, 2.15, 0], yellow);
      addBox(booth, [1.5, 0.82, 0.08], [0, 1.3, -0.79], glass, null, true, false);
      const signTex = createCanvasTexture((ctx, w, h) => {
        ctx.fillStyle = '#d7b52d';
        ctx.fillRect(0, 0, w, h);
        ctx.fillStyle = '#18262f';
        ctx.font = 'bold 23px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('KAROTA', w / 2, h / 2);
      });
      addBox(booth, [1.55, 0.46, 0.08], [0, 1.82, -0.84], makeMat(0xffffff, 0.82, 0, { map: signTex }), null, true, false);
      root.add(booth);

      // Officer silhouette beside the inspection point.
      const officer = new THREE.Group();
      const skin = makeMat(0x69412d, 0.98, 0);
      const uniform = makeMat(0x315447, 0.88, 0.01);
      addSphere(officer, 0.18, [0, 1.52, 0], skin, [0.92, 1.0, 0.92]);
      addBox(officer, [0.34, 0.65, 0.24], [0, 1.05, 0], uniform);
      addBox(officer, [0.10, 0.45, 0.09], [-0.23, 0.98, 0], skin);
      addBox(officer, [0.10, 0.45, 0.09], [0.23, 0.98, 0], skin);
      addBox(officer, [0.11, 0.45, 0.10], [-0.10, 0.42, 0], dark);
      addBox(officer, [0.11, 0.45, 0.10], [0.10, 0.42, 0], dark);
      officer.position.set(2.65, 0, 0.15);
      officer.userData.arm = officer.children[2];
      root.add(officer);
      root.userData.officer = officer;

      // Alternating warning lamps.
      for (const x of [-1.55, 1.55]) {
        const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.11, 10, 8), red);
        lamp.position.set(x, 2.62, -0.02);
        root.add(lamp);
        root.userData.lamp.push(lamp);
      }

      // Cones along the approach.
      const coneMat = makeMat(0xc75b2e, 0.86, 0);
      for (const x of [-3.7, 3.7]) {
        const cone = new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.5, 10), coneMat);
        cone.position.set(x, 0.25, 0.35);
        cone.castShadow = true;
        root.add(cone);
      }

      // A compact patrol vehicle gives police checkpoints a different silhouette.
      const patrol = this.makeVehicle('police', i + 11);
      patrol.scale.setScalar(0.72);
      patrol.position.set(-4.25, 0, 1.1);
      patrol.rotation.y = Math.PI;
      root.add(patrol);
      root.userData.patrol = patrol;

      this.checkpointGroup.add(root);
      this.checkpointPool.push(root);
    }
  }

  buildPedestrians() {
    this.pedestrianGroup = new THREE.Group();
    this.pedestrianGroup.name = 'pedestrians';
    this.world.add(this.pedestrianGroup);

    const count = this.quality === 'low' ? 8 : 16;
    for (let i = 0; i < count; i += 1) {
      const ped = this.makeWaitingPedestrian(i + 100);
      ped.visible = false;
      this.pedestrianGroup.add(ped);
      this.pedestrianPool.push(ped);
    }
  }

  buildZonePool() {
    this.zoneGroup = new THREE.Group();
    this.zoneGroup.name = 'passenger-zones';
    this.world.add(this.zoneGroup);

    for (let i = 0; i < MAX_ZONES; i += 1) {
      const g = new THREE.Group();
      g.visible = false;
      g.userData.index = i;

      const ringMat = makeMat(0xf8ce56, 0.45, 0.03, { emissive: 0x9c6c17, emissiveIntensity: 0.22, transparent: true, opacity: 0.82 });
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.82, 0.055, 10, 28), ringMat);
      ring.rotation.x = -Math.PI / 2;
      ring.position.y = 0.05;
      g.add(ring);

      const postMat = makeMat(0x41464b, 0.8, 0.08);
      addCylinder(g, 0.035, 1.45, [0, 0.73, 0], postMat, null, 8);
      const signTex = createCanvasTexture((ctx, w, h) => {
        ctx.fillStyle = '#f0cf55';
        ctx.fillRect(0, 0, w, h);
        ctx.fillStyle = '#152027';
        ctx.font = 'bold 22px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('AKWAI', w / 2, h / 2);
      });
      const signMat = makeMat(0xffffff, 0.8, 0, { map: signTex });
      addBox(g, [0.95, 0.42, 0.08], [0, 1.45, 0], signMat, null, false, false);
      g.userData.ring = ring;
      this.zoneGroup.add(g);
      this.zonePool.push(g);
    }
  }

  buildCoinPool() {
    this.coinGroup = new THREE.Group();
    this.coinGroup.name = 'coins';
    this.world.add(this.coinGroup);

    for (let i = 0; i < MAX_COINS; i += 1) {
      const mat = makeMat(0xf1c84c, 0.25, 0.3, { emissive: 0x6f4f09, emissiveIntensity: 0.23 });
      const coin = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.18, 0.075, 18), mat);
      coin.rotation.x = Math.PI / 2;
      coin.position.y = 0.58;
      coin.visible = false;
      coin.castShadow = true;
      this.coinGroup.add(coin);
      this.coinPool.push(coin);
    }
  }

  buildEffects() {
    this.effectsGroup = new THREE.Group();
    this.effectsGroup.name = 'effects';
    this.world.add(this.effectsGroup);

    this.impactFlash = new THREE.Mesh(
      new THREE.SphereGeometry(1.0, 18, 12),
      makeMat(0xffd05d, 0.3, 0, { transparent: true, opacity: 0, emissive: 0xff8b18, emissiveIntensity: 1.5, depthWrite: false }),
    );
    this.impactFlash.visible = false;
    this.effectsGroup.add(this.impactFlash);

    this.dustSprites = [];
    const dustMat = makeMat(0xd2bc9a, 1, 0, { transparent: true, opacity: 0.18, depthWrite: false });
    for (let i = 0; i < 24; i += 1) {
      const p = new THREE.Mesh(new THREE.SphereGeometry(0.09 + seeded(i) * 0.08, 7, 7), dustMat.clone());
      p.visible = false;
      this.effectsGroup.add(p);
      this.dustSprites.push({ mesh: p, life: 0, seed: seeded(i + 99) });
    }
  }

  buildWeather() {
    this.weatherGroup = new THREE.Group();
    this.weatherGroup.name = 'weather';
    this.world.add(this.weatherGroup);

    this.rainPoints = [];
    const count = this.quality === 'high' ? 500 : this.quality === 'medium' ? 260 : 120;
    const geometry = new THREE.BufferGeometry();
    const positions = new Float32Array(count * 3);
    for (let i = 0; i < count; i += 1) {
      positions[i * 3] = (seeded(i * 2.4) - 0.5) * 28;
      positions[i * 3 + 1] = seeded(i * 3.1) * 15;
      positions[i * 3 + 2] = PLAYER_Z - 6 - seeded(i * 4.7) * 55;
    }
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const mat = new THREE.PointsMaterial({ size: 0.06, color: 0xc5d8ea, transparent: true, opacity: 0.42, depthWrite: false });
    this.rainMesh = new THREE.Points(geometry, mat);
    this.rainMesh.visible = false;
    this.weatherGroup.add(this.rainMesh);
  }

  spawnDust(x, z, amount = 5) {
    let made = 0;
    for (const item of this.dustSprites) {
      if (item.life > 0) continue;
      item.life = 0.35 + seeded(this.elapsed * 4 + made) * 0.45;
      item.mesh.visible = true;
      item.mesh.position.set(x + (seeded(this.elapsed * 8 + made) - 0.5) * 0.9, 0.16 + seeded(made + 21) * 0.22, z + 0.8 + seeded(made + 44) * 0.8);
      item.mesh.scale.setScalar(0.7 + seeded(made + 65) * 1.4);
      item.mesh.material.opacity = 0.12 + seeded(made + 87) * 0.16;
      made += 1;
      if (made >= amount) break;
    }
  }

  triggerImpact(position = this.player?.position) {
    if (!position || !this.impactFlash) return;
    if (this.reducedMotion) {
      this.impactFlash.visible = false;
      this.cameraShake = 0;
      return;
    }
    this.impactFlash.visible = true;
    this.impactFlash.position.copy(position);
    this.impactFlash.scale.setScalar(0.35);
    this.impactFlash.material.opacity = 0.85;
    this.cameraShake = 0.55;
    this.cameraShakeStrength = 0.32;
    this.spawnDust(position.x, position.z, 10);
  }

  applyPaint(paint) {
    const value = typeof paint === 'number' ? paint : null;
    if (value != null) this.paint = value;
    else if (typeof paint === 'string') {
      const parsed = Number.parseInt(paint.replace('#', ''), 16);
      if (Number.isFinite(parsed)) this.paint = parsed;
    }

    if (!this.player) return;
    this.player.traverse((obj) => {
      if (!obj.isMesh || !obj.material || obj.userData.isDecal) return;
      if (obj === this.player.userData.body || obj.material.color?.equals(new THREE.Color(this.paint))) {
        obj.material.color?.setHex(this.paint);
      }
    });
  }

  setPaint(paint) {
    this.applyPaint(paint);
  }

  setDriver(driverId, options = {}) {
    this.driverId = driverId || 'ruffneck';
    if (options.color && this.player?.userData?.driver) {
      this.player.userData.driver.traverse((obj) => {
        if (obj.isMesh && obj.material?.color) obj.material.color.setHex(options.color);
      });
    }
  }

  styleVehicle(index, type = 'sedan', variant = index) {
    const mesh = this.vehiclePool[index];
    if (!mesh) return;
    const fresh = this.makeVehicle(type, variant);
    fresh.visible = mesh.visible;
    fresh.position.copy(mesh.position);
    fresh.rotation.copy(mesh.rotation);
    fresh.scale.copy(mesh.scale);
    fresh.userData.poolIndex = mesh.userData.poolIndex;
    this.trafficGroup.remove(mesh);
    this.vehiclePool[index] = fresh;
    this.trafficGroup.add(fresh);
  }

  updateTimeLighting(normalized) {
    const t = ((Number(normalized) || 0) % 1 + 1) % 1;
    this.timeOfDay = t;
    let a = DAY;
    let b = DUSK;
    let mix = 0;

    // 0 = midnight, 0.25 = sunrise-ish, 0.5 = midday, 0.75 = sunset-ish.
    if (t < 0.18) {
      a = NIGHT;
      b = DUSK;
      mix = smoothstep(0, 0.18, t);
    } else if (t < 0.32) {
      a = DUSK;
      b = DAY;
      mix = smoothstep(0.18, 0.32, t);
    } else if (t < 0.68) {
      a = DAY;
      b = DAY;
      mix = 0;
    } else if (t < 0.84) {
      a = DAY;
      b = DUSK;
      mix = smoothstep(0.68, 0.84, t);
    } else {
      a = DUSK;
      b = NIGHT;
      mix = smoothstep(0.84, 1, t);
    }

    const blend = (ca, cb) => new THREE.Color(ca).lerp(new THREE.Color(cb), mix);
    this.scene.background.copy(blend(a.sky, b.sky));
    this.scene.fog.color.copy(blend(a.fog, b.fog));
    this.hemi.color.copy(blend(a.hemiSky, b.hemiSky));
    this.hemi.groundColor.copy(blend(a.hemiGround, b.hemiGround));
    this.hemi.intensity = THREE.MathUtils.lerp(a === NIGHT ? 0.45 : 0.95, b === NIGHT ? 0.38 : 1.0, mix);
    this.sun.color.copy(blend(a.sun, b.sun));
    this.sun.intensity = THREE.MathUtils.lerp(a.sunIntensity, b.sunIntensity, mix);
    this.ambient.intensity = THREE.MathUtils.lerp(a.ambient, b.ambient, mix);

    const nightness = clamp((0.2 - t) / 0.15, 0, 1) + clamp((t - 0.78) / 0.22, 0, 1);
    this.toggleVehicleLights(nightness > 0.25);
  }

  toggleVehicleLights(enabled) {
    for (const vehicle of this.vehiclePool) {
      if (!vehicle.userData.headLights) vehicle.userData.headLights = [];
      if (vehicle.userData.headLights.length === 0) {
        vehicle.traverse((o) => {
          if (o.isMesh && o.material?.emissive && o.material.color?.getHex() === 0xf7efd0) vehicle.userData.headLights.push(o);
        });
      }
      for (const light of vehicle.userData.headLights) {
        if (light.material?.emissiveIntensity != null) light.material.emissiveIntensity = enabled ? 0.75 : 0.22;
      }
    }

    if (!this.player?.userData?.headLights) {
      this.player.userData.headLights = [];
      this.player.traverse((o) => {
        if (o.isMesh && o.material?.emissive && o.material.color?.getHex() === 0xf7f0ca) this.player.userData.headLights.push(o);
      });
    }
    for (const light of this.player.userData.headLights) {
      if (light.material?.emissiveIntensity != null) light.material.emissiveIntensity = enabled ? 1.0 : 0.22;
    }
  }

  updatePlayerAnimation(dt, g) {
    if (!this.player) return;
    const speed = Number(g?.speed) || Number(g?.speedOff) || 0;
    const lane = Number.isFinite(g?.playerLane) ? g.playerLane : 1;
    const targetX = this.laneToX(lane);
    const laneDelta = targetX - this.player.position.x;
    this.player.position.x += laneDelta * Math.min(dt * 9, 1);

    const accel = clamp(speed / 12, -1, 1);
    const lean = clamp(-laneDelta * 0.045 - accel * 0.035, -0.18, 0.18);
    this.player.rotation.z = THREE.MathUtils.lerp(this.player.rotation.z, lean, Math.min(dt * 7, 1));

    const suspensionTarget = 0.018 * Math.sin(this.elapsed * 9) + (g?.braking ? 0.02 : 0);
    this.player.position.y = 0.13 + suspensionTarget;
    if (this.playerShadow) {
      this.playerShadow.position.x = this.player.position.x;
      this.playerShadow.position.z = this.player.position.z + 0.25;
      this.playerShadow.scale.x = 1.05 + Math.abs(accel) * 0.08;
    }

    const wheelSpin = -speed * dt * 8.7;
    for (const wheel of this.playerWheels) wheel.rotation.x += wheelSpin;
    if (this.playerSteering) this.playerSteering.rotation.y = THREE.MathUtils.lerp(this.playerSteering.rotation.y, -laneDelta * 0.28, Math.min(dt * 10, 1));

    if (Math.abs(laneDelta) > 0.02 && this.weather !== 'rain') {
      this.spawnDust(this.player.position.x, this.player.position.z + 0.7, this.quality === 'low' ? 1 : 2);
    }
  }

  updateTraffic(dt, g) {
    const obs = Array.isArray(g?.obs) ? g.obs : [];
    const playerX = this.player?.position.x || 0;

    for (let i = 0; i < this.vehiclePool.length; i += 1) {
      const mesh = this.vehiclePool[i];
      const o = obs[i];
      if (!o) {
        mesh.visible = false;
        continue;
      }

      mesh.visible = true;
      const lane = Math.round(Number(o.lane) || 0);
      const targetX = this.laneToX(lane);
      const targetZ = this.screenYToZ(Number(o.y) || 0, Number(g.playerY) || 520);
      const oldX = mesh.position.x;
      const oldZ = mesh.position.z;
      mesh.position.x = THREE.MathUtils.lerp(oldX, targetX, Math.min(dt * 14, 1));
      mesh.position.z = THREE.MathUtils.lerp(oldZ, targetZ, Math.min(dt * 18, 1));

      const speed = Math.max(0, Number(o.speedOff) || mesh.userData.speed || 0.1);
      const previousSpeed = Number(mesh.userData.lastSpeed) || speed;
      const braking = speed < previousSpeed - 0.035 || Number(o.brake) > 0.15;
      const acceleration = speed > previousSpeed + 0.035;
      mesh.userData.lastSpeed = THREE.MathUtils.lerp(previousSpeed, speed, Math.min(dt * 5, 1));

      const dx = mesh.position.x - playerX;
      const laneChange = Math.abs(targetX - oldX) > 0.025 || Math.abs(Number(o.laneCooldown) || 0) > 0.05;
      const steerTarget = clamp(-dx * 0.018 - (targetX - oldX) * 0.11, -0.11, 0.11);
      mesh.rotation.z = THREE.MathUtils.lerp(mesh.rotation.z, steerTarget, Math.min(dt * 7, 1));
      mesh.rotation.y = THREE.MathUtils.lerp(mesh.rotation.y, Math.PI + clamp(-Number(o.laneCooldown || 0) * 0.025, -0.09, 0.09), Math.min(dt * 7, 1));

      // Small chassis movement makes the procedural vehicles feel suspended rather than rigid.
      const load = braking ? 0.035 : acceleration ? -0.018 : 0;
      const bob = Math.sin(this.elapsed * (5.5 + speed * 0.35) + (mesh.userData.animSeed || 0)) * 0.008;
      mesh.userData.suspension = THREE.MathUtils.lerp(Number(mesh.userData.suspension) || 0, load, Math.min(dt * 10, 1));
      mesh.position.y = 0.02 + bob - mesh.userData.suspension;

      for (const wheel of mesh.userData.wheels || []) {
        wheel.rotation.x -= speed * dt * 8.0;
        if (wheel.userData.steer) wheel.rotation.z = THREE.MathUtils.lerp(wheel.rotation.z, steerTarget * 2.5, Math.min(dt * 8, 1));
      }

      const brakeIntensity = braking ? 1.25 : 0.16;
      for (const lamp of mesh.userData.brakeLights || []) {
        if (lamp.material?.emissiveIntensity != null) lamp.material.emissiveIntensity = brakeIntensity;
      }

      const signal = laneChange ? Math.sin(this.elapsed * 9) > 0 : false;
      for (const lamp of mesh.userData.indicators || []) {
        if (lamp.material?.emissiveIntensity != null) lamp.material.emissiveIntensity = signal ? 1.0 : 0.08;
      }

      if (mesh.userData.steering) {
        mesh.userData.steering.rotation.z = THREE.MathUtils.lerp(
          mesh.userData.steering.rotation.z,
          -steerTarget * 1.8,
          Math.min(dt * 8, 1),
        );
      }

      if (mesh.userData.type === 'motorcycle') {
        const rider = mesh.children.find((child) => child.type === 'Group' && child.children.length >= 2);
        if (rider) rider.rotation.z = THREE.MathUtils.lerp(rider.rotation.z, steerTarget * 0.9, Math.min(dt * 6, 1));
      }

      if (mesh.userData.type === 'police') {
        const lamp = mesh.userData.patrolLamp;
        if (lamp) {
          const blink = Math.sin(this.elapsed * 10) > 0;
          for (const child of mesh.children) {
            if (!child.isMesh) continue;
            if (child.material === lamp.blue || child.material === lamp.red) {
              child.material.emissiveIntensity = blink ? 0.95 : 0.12;
            }
          }
        }
      }
    }
  }

  updateCheckpoints(dt, g) {
    const checkpoints = Array.isArray(g?.checkpoints) ? g.checkpoints : [];
    for (let i = 0; i < this.checkpointPool.length; i += 1) {
      const visual = this.checkpointPool[i];
      const cp = checkpoints[i];
      if (!cp) {
        visual.visible = false;
        continue;
      }

      visual.visible = true;
      visual.position.x = this.laneToX(Number(cp.lane) || 0);
      visual.position.z = this.screenYToZ(Number(cp.y) || 0, Number(g.playerY) || 520);
      visual.position.y = 0;

      const active = cp.active !== false && cp.handled !== true;
      const police = cp.type === 'police';
      visual.scale.setScalar(police ? 1.0 : 0.96);

      const pulse = Math.sin(this.elapsed * (police ? 10 : 5.5)) > 0;
      for (const lamp of visual.userData.lamp || []) {
        lamp.material.emissiveIntensity = pulse ? 1.15 : 0.18;
        lamp.material.opacity = active ? 1 : 0.35;
      }

      const barrier = visual.userData.barrier;
      if (barrier) {
        const approaching = Math.abs(visual.position.z - PLAYER_Z) < 16;
        const raised = !active || !approaching;
        const target = raised ? -0.72 : 0.02;
        barrier.rotation.z = THREE.MathUtils.lerp(barrier.rotation.z, target, Math.min(dt * 4.5, 1));
      }

      const officer = visual.userData.officer;
      if (officer) {
        const near = Math.abs(visual.position.z - PLAYER_Z) < 12;
        if (officer.userData.arm) officer.userData.arm.rotation.z = near ? Math.sin(this.elapsed * 5) * 0.18 - 0.35 : 0;
        officer.position.y = Math.abs(Math.sin(this.elapsed * 3.2)) * 0.008;
      }

      const patrol = visual.userData.patrol;
      if (patrol) {
        patrol.visible = true;
        patrol.userData.patrolLamp && (patrol.userData.patrolLamp.blue.emissiveIntensity = pulse ? 1.0 : 0.12);
      }
    }
  }

  updateZones(dt, g) {
    const paxZones = Array.isArray(g?.paxZones) ? g.paxZones : [];
    const dropZones = Array.isArray(g?.dropZones) ? g.dropZones : [];
    const all = [];

    for (const z of paxZones) all.push({ ...z, kind: 'pickup' });
    for (const z of dropZones) all.push({ ...z, kind: 'dropoff' });

    for (let i = 0; i < this.zonePool.length; i += 1) {
      const zdata = all[i];
      const zone = this.zonePool[i];
      if (!zdata) {
        zone.visible = false;
        continue;
      }

      zone.visible = true;
      zone.position.x = this.laneToX(Number(zdata.lane) || 0);
      zone.position.z = this.screenYToZ(Number(zdata.y) || 0, Number(g.playerY) || 520);
      zone.position.y = 0.02;
      zone.userData.kind = zdata.kind;
      zone.userData.data = zdata;

      const pulse = 1 + Math.sin(this.elapsed * 5 + i * 0.4) * 0.08;
      zone.userData.ring.scale.setScalar(pulse);
      zone.userData.ring.material.opacity = zdata.kind === 'pickup' ? 0.84 : 0.48;

      const ped = this.pedestrianPool[i];
      if (ped) {
        ped.visible = zdata.kind === 'pickup';
        ped.position.x = zone.position.x + (Number(zdata.lane) % 2 === 0 ? 0.8 : -0.8);
        ped.position.z = zone.position.z;
        ped.position.y = 0;
        ped.userData.state = Math.abs(zone.position.z - PLAYER_Z) < 8 ? 'flagging' : 'waiting';
      }
    }
  }

  updatePedestrians(dt) {
    for (const ped of this.pedestrianPool) {
      if (!ped.visible) continue;
      ped.userData.phase += dt * ped.userData.speed;
      const p = ped.userData.phase;
      const state = ped.userData.state;
      if (state === 'flagging') {
        ped.userData.rightArm.rotation.z = -0.85 + Math.sin(p * 5) * 0.18;
        ped.userData.leftArm.rotation.z = 0.12;
        ped.userData.leftLeg.rotation.z = Math.sin(p * 4) * 0.06;
        ped.userData.rightLeg.rotation.z = -Math.sin(p * 4) * 0.06;
      } else {
        ped.userData.rightArm.rotation.z = Math.sin(p * 3) * 0.32;
        ped.userData.leftArm.rotation.z = -Math.sin(p * 3) * 0.32;
        ped.userData.leftLeg.rotation.z = Math.sin(p * 3) * 0.18;
        ped.userData.rightLeg.rotation.z = -Math.sin(p * 3) * 0.18;
      }
      ped.position.y = Math.abs(Math.sin(p * 2.2)) * 0.012;
    }
  }

  updateCoins(dt, g) {
    const coins = Array.isArray(g?.coins) ? g.coins : [];
    for (let i = 0; i < this.coinPool.length; i += 1) {
      const mesh = this.coinPool[i];
      const c = coins[i];
      if (!c) {
        mesh.visible = false;
        continue;
      }
      mesh.visible = true;
      mesh.position.x = this.laneToX(Number(c.lane) || 0);
      mesh.position.z = this.screenYToZ(Number(c.y) || 0, Number(g.playerY) || 520);
      mesh.position.y = 0.58 + Math.sin(this.elapsed * 5 + i) * 0.08;
      mesh.rotation.z += dt * 4.4;
      mesh.rotation.y += dt * 2.1;
    }
  }

  updateRoad(dt, g) {
    const off = Number(g?.roadOff) || Number(g?.dist) || 0;
    const delta = off - this.roadOffset;
    this.roadOffset = off;
    if (!this.roadSegments.length) return;

    const segmentLength = ROAD_LEN / 4;
    for (const seg of this.roadSegments) {
      const baseZ = seg.userData.baseZ;
      seg.position.z = baseZ + (this.roadOffset % segmentLength);
      if (seg.position.z > 40) seg.position.z -= segmentLength * this.roadSegments.length;
    }

    // Shift environment with the same world offset to keep the road visually tied to gameplay.
    if (this.city) this.city.position.z = (this.roadOffset % 36) * 0.42;
    if (!this.reducedMotion && Math.abs(delta) > 0.0001) this.spawnDust(this.player?.position.x || 0, PLAYER_Z + 0.75, this.quality === 'low' ? 1 : 2);
  }

  updateWeather(dt) {
    const weather = this.weather;
    if (this.rainMesh) this.rainMesh.visible = weather === 'rain' && !this.reducedMotion;
    if (this.reducedMotion || weather !== 'rain' || !this.rainMesh) return;

    const pos = this.rainMesh.geometry.attributes.position;
    for (let i = 0; i < pos.count; i += 1) {
      const y = pos.getY(i) - dt * 12;
      const x = pos.getX(i);
      const z = pos.getZ(i);
      pos.setY(i, y < -1 ? 14 : y);
      pos.setX(i, x + Math.sin(this.elapsed * 1.5 + i) * dt * 0.03);
      pos.setZ(i, z);
    }
    pos.needsUpdate = true;
  }

  updateDust(dt) {
    if (this.reducedMotion) {
      for (const item of this.dustSprites) {
        item.life = 0;
        item.mesh.visible = false;
      }
      return;
    }
    for (const item of this.dustSprites) {
      if (item.life <= 0) {
        item.mesh.visible = false;
        continue;
      }
      item.life -= dt;
      item.mesh.position.y += dt * 0.35;
      item.mesh.position.x += Math.sin(this.elapsed * 2 + item.seed * 9) * dt * 0.08;
      const remaining = clamp(item.life / 0.7, 0, 1);
      item.mesh.material.opacity *= 0.987;
      item.mesh.scale.multiplyScalar(1 + dt * 0.9);
      if (item.life <= 0.02) {
        item.mesh.visible = false;
        item.mesh.material.opacity = 0;
      }
      if (remaining < 0.2) item.mesh.material.opacity *= 0.94;
    }
  }

  updateImpact(dt) {
    if (!this.impactFlash?.visible) return;
    this.impactFlash.scale.multiplyScalar(1 + dt * 4.6);
    this.impactFlash.material.opacity *= Math.max(0, 1 - dt * 5.2);
    if (this.impactFlash.material.opacity < 0.02) this.impactFlash.visible = false;
  }

  updateCamera(dt, g) {
    if (!this.camera || !this.player) return;
    const speed = Number(g?.speed) || Number(g?.speedOff) || 0;
    const laneX = this.player.position.x;
    const targetX = laneX * 0.44;
    const speedLift = clamp(speed / 16, 0, 1) * 0.55;

    this.targetCameraX = THREE.MathUtils.lerp(this.targetCameraX, targetX, Math.min(dt * 3.8, 1));
    this.cameraTarget.set(this.targetCameraX, 3.95 + speedLift, PLAYER_Z + 8.5);
    this.camera.position.x = THREE.MathUtils.lerp(this.camera.position.x, this.targetCameraX, Math.min(dt * 4.4, 1));
    this.camera.position.y = THREE.MathUtils.lerp(this.camera.position.y, 3.65 + speedLift, Math.min(dt * 3.2, 1));
    this.camera.position.z = THREE.MathUtils.lerp(this.camera.position.z, PLAYER_Z + 10.9 - speed * 0.2, Math.min(dt * 3.4, 1));

    this.cameraLook.set(laneX * 0.18, 0.8, PLAYER_Z - 10 - clamp(speed * 2.1, 0, 12));
    this.camera.lookAt(this.cameraLook);

    if (!this.reducedMotion && this.cameraShake > 0) {
      this.cameraShake = Math.max(0, this.cameraShake - dt * 1.6);
      const amp = this.cameraShake * this.cameraShakeStrength;
      this.camera.position.x += (seeded(this.elapsed * 90) - 0.5) * amp;
      this.camera.position.y += (seeded(this.elapsed * 120) - 0.5) * amp * 0.55;
      this.camera.position.z += (seeded(this.elapsed * 150) - 0.5) * amp * 0.75;
    }
  }

  startOpeningSequence(driverId = 'ruffneck', paint = this.paint) {
    this.driverId = driverId;
    this.applyPaint(paint);
    this.opening.active = true;
    this.opening.phase = 'walk';
    this.opening.timer = 0;
    this.opening.driverId = driverId;

    if (!this.openingGroup) {
      this.openingGroup = new THREE.Group();
      this.openingGroup.name = 'opening';
      this.world.add(this.openingGroup);
    }

    this.openingGroup.clear();
    const driver = new THREE.Group();
    const skin = makeMat(0x6a432e, 0.98, 0);
    const cloth = makeMat(0x2f5870, 0.95, 0);
    addSphere(driver, 0.2, [0, 1.48, 0], skin);
    addBox(driver, [0.36, 0.64, 0.25], [0, 1.1, 0], cloth);
    addBox(driver, [0.11, 0.6, 0.09], [-0.11, 0.58, 0], skin, [0, 0, -0.08]);
    addBox(driver, [0.11, 0.6, 0.09], [0.11, 0.58, 0], skin, [0, 0, 0.08]);
    driver.position.set(-5.0, 0, PLAYER_Z + 1.3);
    driver.rotation.y = Math.PI / 2;
    this.openingGroup.add(driver);
    this.opening.driver = driver;
    this.player.visible = true;

    this.camera.position.set(-4.8, 3.35, PLAYER_Z + 8.5);
  }

  updateOpeningSequence(dt) {
    if (!this.opening.active || !this.opening.driver) return true;
    this.opening.timer += dt;
    const t = this.opening.timer;
    const driver = this.opening.driver;

    if (t < 2.0) {
      this.opening.phase = 'walk';
      const p = smoothstep(0, 2, t);
      driver.position.x = THREE.MathUtils.lerp(-5.0, -1.15, p);
      driver.rotation.y = Math.PI / 2;
      driver.children.forEach((child, idx) => {
        if (idx >= 2) child.rotation.z = (idx % 2 ? 1 : -1) * Math.sin(t * 8) * 0.32;
      });
    } else if (t < 3.4) {
      this.opening.phase = 'enter';
      const p = smoothstep(0, 1.4, t - 2);
      driver.position.x = THREE.MathUtils.lerp(-1.15, 0, p);
      driver.position.z = THREE.MathUtils.lerp(PLAYER_Z + 1.3, PLAYER_Z - 0.5, p);
      driver.position.y = Math.sin(p * Math.PI) * 0.2;
      driver.scale.setScalar(1 - p * 0.28);
    } else if (t < 4.6) {
      this.opening.phase = 'start-engine';
      driver.visible = false;
      const pulse = 1 + Math.sin((t - 3.4) * 18) * 0.035;
      this.player.scale.set(this.player.userData.baseScale.x * pulse, this.player.userData.baseScale.y * pulse, this.player.userData.baseScale.z * pulse);
      this.player.position.y = Math.abs(Math.sin(t * 16)) * 0.025;
    } else {
      this.opening.phase = 'drive';
      this.opening.active = false;
      this.player.scale.copy(this.player.userData.baseScale);
      driver.visible = false;
      return true;
    }

    this.camera.lookAt(0, 0.9, PLAYER_Z - 4);
    return false;
  }

  setWeather(weather) {
    this.weather = weather || 'clear';
  }

  setWeatherMode(weather) {
    this.setWeather(weather);
  }

  updateAdaptivePerformance(delta) {
    // Stabilized adaptive resolution: rendering quality may change, but gameplay
    // speed, collisions, and simulation timing are never modified.
    this.adaptiveSampleTime += delta;
    this.adaptiveFrames += 1;
    if (this.adaptiveSampleTime < 4) return;

    const fps = this.adaptiveFrames / Math.max(this.adaptiveSampleTime, 0.001);
    const previousScale = this.adaptivePixelScale || 1;
    if (fps < 40) {
      this.adaptiveSlowSamples = (this.adaptiveSlowSamples || 0) + 1;
      this.adaptiveStableTime = 0;
      // Require two consecutive slow windows to avoid reacting to a brief hitch.
      if (this.adaptiveSlowSamples >= 2) {
        this.adaptivePixelScale = Math.max(0.6, previousScale - 0.12);
        this.adaptiveSlowSamples = 0;
      }
    } else if (fps > 55) {
      this.adaptiveSlowSamples = 0;
      this.adaptiveStableTime = (this.adaptiveStableTime || 0) + this.adaptiveSampleTime;
      // Recover more cautiously than quality is reduced.
      if (this.adaptiveStableTime >= 12) {
        this.adaptivePixelScale = Math.min(1, previousScale + 0.08);
        this.adaptiveStableTime = 0;
      }
    } else {
      this.adaptiveSlowSamples = 0;
      this.adaptiveStableTime = 0;
    }

    if (this.renderer && Math.abs(this.adaptivePixelScale - previousScale) > 0.001) {
      const cap = this.quality === 'high' ? 2 : this.quality === 'medium' ? 1.5 : 1;
      this.basePixelRatio = Math.min(window.devicePixelRatio || 1, cap);
      this.renderer.setPixelRatio(this.basePixelRatio * this.adaptivePixelScale);
      const width = Math.max(this.webglHost?.clientWidth || this.gameCanvas.clientWidth || window.innerWidth, 1);
      const height = Math.max(this.webglHost?.clientHeight || this.gameCanvas.clientHeight || window.innerHeight, 1);
      this.renderer.setSize(width, height, false);
    }

    this.adaptiveSampleTime = 0;
    this.adaptiveFrames = 0;
  }

  toggleDiagnostics() {
    this.diagnosticsEnabled = !this.diagnosticsEnabled;
    if (!this.diagnosticsElement && typeof document !== 'undefined') {
      const panel = document.createElement('div');
      panel.setAttribute('aria-live', 'polite');
      panel.setAttribute('role', 'status');
      panel.style.cssText = 'position:fixed;left:10px;top:10px;z-index:2147483000;max-width:calc(100vw - 32px);padding:9px 11px;border:1px solid rgba(0,180,216,.65);border-radius:8px;background:rgba(5,15,28,.9);color:#eaf7ff;font:12px/1.55 ui-monospace,SFMono-Regular,Consolas,monospace;pointer-events:none;white-space:pre-line;box-shadow:0 4px 16px rgba(0,0,0,.25)';
      panel.hidden = true;
      document.body.appendChild(panel);
      this.diagnosticsElement = panel;
    }
    if (this.diagnosticsElement) this.diagnosticsElement.hidden = !this.diagnosticsEnabled;
    if (this.diagnosticsEnabled) { this.diagnosticsElapsed = 0; this.diagnosticsFrames = 0; }
  }

  updateDiagnostics(delta) {
    if (!this.diagnosticsEnabled || !this.diagnosticsElement) return;
    this.diagnosticsElapsed += delta;
    this.diagnosticsFrames += 1;
    if (this.diagnosticsElapsed >= 1) {
      this.diagnosticsFps = Math.round(this.diagnosticsFrames / this.diagnosticsElapsed);
      this.diagnosticsElapsed = 0;
      this.diagnosticsFrames = 0;
      const ratio = this.renderer?.getPixelRatio?.() || 1;
      const size = this.renderer?.info?.render || {};
      this.diagnosticsElement.textContent = `KANO RUN · PERFORMANCE\nFPS: ${this.diagnosticsFps}\nQuality: ${this.quality}\nPixel ratio: ${ratio.toFixed(2)}\nDraw calls: ${size.calls ?? '—'}\nTriangles: ${size.triangles ?? '—'}\nF3: hide diagnostics`;
    }
  }

  render(dt = null) {
    if (!this.ready || this.contextLost || !this.renderer || !this.scene || !this.camera) return;

    const g = this.game || {};
    const delta = clamp(dt ?? this.clock.getDelta(), 0.001, 0.05);
    this.elapsed += delta;
    this.updateAdaptivePerformance(delta);
    this.updateDiagnostics(delta);

    if (typeof g.getTimeOfDay === 'function') this.updateTimeLighting(g.getTimeOfDay());
    else if (Number.isFinite(g.timeOfDay)) this.updateTimeLighting(g.timeOfDay);

    if (g.weather && g.weather !== this.weather) this.setWeather(g.weather);

    this.updateRoad(delta, g);
    this.updatePlayerAnimation(delta, g);
    this.updateTraffic(delta, g);
    if (this.trafficWorld) {
      const ambientSpeed = Number(g.speed) || Number(g.speedOff) || 1;
      this.trafficWorld.update(delta, ambientSpeed, Number(g.roadOff) || Number(g.dist) || 0);
    }
    this.updateCheckpoints(delta, g);
    this.updateZones(delta, g);
    this.updatePedestrians(delta);
    this.updateCoins(delta, g);
    this.updateWeather(delta);
    this.updateDust(delta);
    this.updateImpact(delta);
    this.updateCamera(delta, g);

    if (this.opening.active) this.updateOpeningSequence(delta);

    this.renderer.render(this.scene, this.camera);
  }

  draw(game = this.game) {
    if (game) this.game = game;
    this.render();
  }

  onCollision(impact = null) {
    this.triggerImpact(impact || this.player?.position);
  }

  destroy() {
    try {
      this.canvas?.removeEventListener('webglcontextlost', this.onWebGLContextLost, false);
      this.canvas?.removeEventListener('webglcontextrestored', this.onWebGLContextRestored, false);
      window.removeEventListener('resize', this.onResize);
      if (this.onDiagnosticsKey) window.removeEventListener('keydown', this.onDiagnosticsKey);
      this.diagnosticsElement?.remove?.();
      this.controlsHelpElement?.remove?.();
      this.controlsHelpElement = null;
      clearTimeout(this.captureNoticeTimer);
      this.captureNotice?.remove?.();
      this.captureNotice = null;
      this.diagnosticsElement = null;
      this.reducedMotionQuery?.removeEventListener?.('change', this.onReducedMotionChange);
    } catch {
      // ignore
    }
    this.trafficWorld?.dispose?.();
    this.trafficWorld = null;
    for (const texture of this.ownedTextures || []) {
      try { texture.dispose(); } catch { /* ignore texture cleanup errors */ }
    }
    this.ownedTextures?.clear?.();
    this.textureCache?.clear?.();
    this.renderer?.dispose?.();
    if (this.ownsCanvas && this.canvas?.dataset?.kanoRunWebgl === 'true') {
      this.canvas.remove();
    }
    this.canvas = null;
    this.webglHost = null;
    this.ownsCanvas = false;
    this.ready = false;
  }
}

export default Renderer3D;
