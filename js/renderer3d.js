// Kano Run 3D renderer — same `three` package as ModelManager/GLTFLoader
import * as THREE from 'three';
import { AnimSystem } from './animation.js';
import { ModelManager } from './ModelManager.js';

// 3-lane road — tighter so cars don't drive through sidewalk people
// Lane 0 = LEFT, 1 = CENTER, 2 = RIGHT (+X = screen right)
export const LANE_X = [-2.2, 0, 2.2];
const ROAD_WIDTH = 8.5;
const ROAD_LEN = 160;
const PLAYER_Z = 7;

export class Renderer3D {
  constructor(game) {
    this.game = game;
    this.canvas = game.canvas;
    this.ready = false;
    this.vehiclePool = [];
    this.zonePool = [];
    this.coinPool = [];
    this.fuelPadPool = [];
    this.potholePool = [];
    this.introPhase = 3;
    this.cabinCam = false;
    this.cameraMode = 'chase';
    this.camPos = null;
    this.camLook = null;
    this.anim = new AnimSystem();
    this.models = new ModelManager({ baseUrl: '/' });
    try {
      this.init();
      // GLB Integration Pass — load all available models then swap placeholders
      // Always load vehicles so GLBs appear (mobile = no heavy world kits)
      const KEYS = this._mobile
        ? ['keke', 'car', 'taxi', 'suv', 'motorcycle', 'police', 'karota', 'passenger', 'building']
        : [
            'keke', 'car', 'taxi', 'suv', 'truck', 'motorcycle',
            'police', 'karota', 'bus', 'ambulance', 'robber', 'bicycle',
            'passenger', 'pedestrian',
            'market', 'bustop', 'bustation', 'building', 'tree', 'billboard', 'bench', 'flyover', 'roadlight', 'cone', 'dirtmound'
          ];
      this.models.preload(KEYS).then(() => {
        this._integrateAllGlbs();
        const rep = this.models.report();
        console.log('[KanoRun] GLB Integration Report', rep);
        window.KanoRunAssets = rep;
        // Retry once if player still procedural
        setTimeout(() => {
          if (this.player?.userData?.isPlaceholder || !this.models.has('keke')) {
            console.warn('[KanoRun] GLB retry integrate');
            this.models.preload(['keke', 'car', 'taxi', 'suv', 'police']).then(() => this._integrateAllGlbs());
          }
        }, 2500);
      }).catch((e) => console.error('[KanoRun] preload failed', e));
    } catch (err) {
      console.error('Renderer3D init failed', err);
      this.ready = false;
      throw err;
    }
  }

  /** Replace player + vehicle pools with GLB instances (no BoxGeometry if load OK) */
  _integrateAllGlbs() {
    if (!this.scene || !this.models) return;

    // 1. Player keke
    if (this.models.has('keke') && this.player) {
      try {
        const next = this.models.getInstance('keke');
        next.position.copy(this.player.position);
        // re-attach headlights if present
        if (this.headlightL) {
          this.player.remove(this.headlightL);
          this.player.remove(this.headlightR);
          next.add(this.headlightL);
          next.add(this.headlightR);
          if (this.headlightL.target) next.add(this.headlightL.target);
          if (this.headlightR.target) next.add(this.headlightR.target);
        }
        this.scene.remove(this.player);
        this.player = next;
        this.scene.add(this.player);
        console.log('[KanoRun] Player → keke.glb');
      } catch (e) {
        console.warn('keke upgrade failed', e);
      }
    }

    // 2. Traffic pools — clear procedural, refill from GLB
    const types = ['car', 'keke', 'taxi', 'bus', 'motorcycle', 'truck', 'police', 'karota', 'robber'];
    const counts = { car: 6, keke: 5, taxi: 3, bus: 2, motorcycle: 3, truck: 2, police: 2, karota: 2, robber: 2 };

    if (this.vehiclePool) {
      for (const m of this.vehiclePool) {
        this.scene.remove(m);
      }
    }
    this.vehiclePool = [];
    this.typedPools = {};
    for (const t of types) {
      this.typedPools[t] = [];
      const n = counts[t] || 2;
      for (let i = 0; i < n; i++) {
        const mesh = this.models.getInstance(t);
        mesh.visible = false;
        mesh.userData.poolType = t;
        this.scene.add(mesh);
        this.vehiclePool.push(mesh);
        this.typedPools[t].push(mesh);
      }
      const src = this.models.has(t) ? t + '.glb' : 'PLACEHOLDER';
      console.log('[KanoRun] Pool', t, '×' + n, '←', src);
    }

    // 3. Asphalt + wall/market textures
    this._applyRoadTexture();
    this._loadSkybox();

    // 4. Rebuild roadside AFTER models loaded so market/bustop/pedestrian GLBs are used
    this._glbPlaced = 0;
    if (this.buildings) {
      this.scene.remove(this.buildings);
      this.buildings = null;
    }
    this.buildCityscape();
    this._printAssetReport();
    console.log('[KanoRun] Cityscape rebuilt with GLB preference');
  }

  /** Load public/textures/* once — Asset Integration */
  _loadWorldTextures() {
    this.textureCache = this.textureCache || {};
    const loader = new THREE.TextureLoader();
    const load = (key, url, repeatX = 2, repeatY = 2) => {
      loader.load(
        url,
        (tex) => {
          tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
          tex.repeat.set(repeatX, repeatY);
          tex.anisotropy = 4;
          this.textureCache[key] = tex;
          console.log('[KanoRun] Texture ←', url);
        },
        undefined,
        () => console.warn('[KanoRun] Texture missing', url)
      );
    };
    load('asphalt', '/assets/models/environment/ground/asphalt.jpg', 2, 24);
    load('potholes', '/assets/models/environment/ground/potholes.jpg', 3, 20);
    load('wall', '/assets/models/environment/ground/building-wall.jpg', 2, 2);
    load('market', '/assets/models/environment/ground/market-stall.jpg', 1, 1);
  }

  _wallMat(fallbackColor) {
    const map = this.textureCache?.wall;
    if (map) {
      return new THREE.MeshStandardMaterial({
        map: map.clone ? map : map,
        roughness: 0.9,
        metalness: 0.05,
        color: 0xcccccc
      });
    }
    return this.mat(fallbackColor || 0x64748b, { roughness: 0.9 });
  }

  _marketMat(fallbackColor) {
    const map = this.textureCache?.market;
    if (map) {
      return new THREE.MeshStandardMaterial({
        map,
        roughness: 0.85,
        metalness: 0.05,
        color: 0xffffff
      });
    }
    return this.mat(fallbackColor || 0xeab308, { roughness: 0.7 });
  }

  /** Place a real GLB only — feet on ground, never giant props */
  _placeGlb(key, x, z, opts = {}) {
    if (!this.models?.has?.(key)) {
      return null;
    }
    try {
      const inst = this.models.getInstance(key, opts);
      if (!inst || inst.userData?.isPlaceholder) return null;

      // Normalize scale by bounding box so bad exports cannot become sky-high
      inst.updateMatrixWorld(true);
      let box = new THREE.Box3().setFromObject(inst);
      const size = new THREE.Vector3();
      box.getSize(size);
      const maxDim = Math.max(size.x, size.y, size.z);
      const targetMax = ({
        pedestrian: 1.8, passenger: 1.8, keke: 2.2, car: 2.5,
        building: 6, market: 3, bustop: 2.5, bustation: 3
      })[key] || 4;
      if (maxDim > 0.01 && maxDim > targetMax * 1.4) {
        inst.scale.multiplyScalar(targetMax / maxDim);
        inst.updateMatrixWorld(true);
        box = new THREE.Box3().setFromObject(inst);
      }
      if (key === 'pedestrian' || key === 'passenger') {
        inst.scale.multiplyScalar(0.85);
        inst.updateMatrixWorld(true);
        box = new THREE.Box3().setFromObject(inst);
      }

      inst.position.set(x, 0, z);
      if (opts.rotY != null) inst.rotation.y = opts.rotY;
      inst.updateMatrixWorld(true);
      box = new THREE.Box3().setFromObject(inst);
      if (Number.isFinite(box.min.y)) {
        inst.position.y = -box.min.y + 0.02;
      }
      // Reject absurd final height (giant floating meshes)
      box = new THREE.Box3().setFromObject(inst);
      box.getSize(size);
      if (size.y > 12 || size.x > 20) {
        console.warn('[KanoRun] rejected giant GLB', key, size.toArray());
        return null;
      }
      if (opts.y != null) inst.position.y = opts.y;
      inst.userData.baseZ = z;
      this.buildings.add(inst);
      this._glbPlaced = (this._glbPlaced || 0) + 1;
      return inst;
    } catch (e) {
      console.warn('[KanoRun] place failed', key, e?.message);
      return null;
    }
  }

  /** Console report after integration */
  _printAssetReport() {
    const rep = this.models?.report?.() || { loaded: [], failed: [] };
    const placed = this._glbPlaced || 0;
    console.log('[KanoRun] === ASSET INTEGRATION REPORT ===');
    console.log('  GLB loaded:', rep.loaded.join(', ') || '(none)');
    console.log('  GLB failed:', rep.failed.join(', ') || '(none)');
    console.log('  Environment GLB instances placed:', placed);
    console.log('  Textures:', Object.keys(this.textureCache || {}).join(', ') || '(none)');
    console.log('  If loaded is empty → files missing under public/models/ on Vercel');
    window.KanoRunAssetReport = { ...rep, envPlaced: placed, textures: Object.keys(this.textureCache || {}) };
  }

  _loadSkybox() {
    const base = '/assets/models/environment/sky/';
    // Prefer sh_* set (complete 6 faces if present)
    const faces = ['ft', 'bk', 'up', 'dn', 'rt', 'lf'].map((f) => base + 'sh_' + f + '.png');
    const loader = new THREE.CubeTextureLoader();
    loader.load(
      faces,
      (cube) => {
        this.scene.background = cube;
        this.scene.environment = cube;
        console.log('[KanoRun] Skybox ← environment/sky/sh_*');
      },
      undefined,
      () => {
        // fallback single gradient sky already exists
        console.warn('[KanoRun] Skybox incomplete — keeping dome');
      }
    );
  }

    _applyRoadTexture() {
    if (!this.roadMesh) return;
    this._loadWorldTextures();
    const loader = new THREE.TextureLoader();
    loader.load(
      '/assets/models/environment/ground/asphalt.jpg',
      (tex) => {
        tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
        tex.repeat.set(2, 24);
        tex.anisotropy = 4;
        this.textureCache = this.textureCache || {};
        this.textureCache.asphalt = tex;
        const mat = new THREE.MeshStandardMaterial({
          map: tex,
          roughness: 0.92,
          metalness: 0.05,
          color: 0xcccccc
        });
        loader.load('/assets/models/environment/ground/potholes.jpg', (pot) => {
          pot.wrapS = pot.wrapT = THREE.RepeatWrapping;
          pot.repeat.set(3, 20);
          this.textureCache.potholes = pot;
          mat.roughnessMap = pot;
          mat.needsUpdate = true;
        }, undefined, () => {});
        this.roadMesh.material = mat;
        this.roadMesh.material.needsUpdate = true;
        console.log('[KanoRun] Road ← asphalt.jpg');
      },
      undefined,
      () => console.warn('[KanoRun] asphalt.jpg not loaded — keeping procedural road')
    );
  }

  init() {
    const mobile = /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent) ||
      (window.innerWidth || 400) < 820;
    this._mobile = mobile;
    let w = this.canvas.clientWidth || this.canvas.parentElement?.clientWidth || 390;
    let h = this.canvas.clientHeight || this.canvas.parentElement?.clientHeight || 700;
    if (w < 160) w = Math.min(430, window.innerWidth || 390);
    if (h < 160) h = Math.min(900, window.innerHeight || 700);
    this.renderer = new THREE.WebGLRenderer({
      canvas: this.canvas,
      antialias: !mobile,
      powerPreference: mobile ? 'low-power' : 'high-performance',
      alpha: false,
      failIfMajorPerformanceCaveat: false,
      preserveDrawingBuffer: false
    });
    if (!this.renderer || !this.renderer.getContext()) {
      throw new Error('WebGL context unavailable');
    }
    this.renderer.setPixelRatio(mobile ? 1 : Math.min(window.devicePixelRatio || 1, 1.75));
    this.renderer.setSize(w, h, false);
    this.renderer.setClearColor(0x6ec5f0, 1);
    try {
      this.renderer.shadowMap.enabled = !mobile;
      this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
      if (THREE.SRGBColorSpace) this.renderer.outputColorSpace = THREE.SRGBColorSpace;
      if (THREE.ACESFilmicToneMapping) {
        this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
        this.renderer.toneMappingExposure = 1.15;
      }
    } catch (e) {
      /* older three / limited GPU */
    }

    this.scene = new THREE.Scene();
    // Stronger fog = clearer depth (near sharp, far fades)
    this.scene.fog = new THREE.Fog(0x8ec8e8, 18, 70);

    // Chase cam framed on full 3-lane highway
    this.camera = new THREE.PerspectiveCamera(60, w / h, 0.1, 250);
    this.camera.position.set(0, 5.8, -8.5);
    this.camera.lookAt(0, 0.35, 28);

    // Richer lighting for volume
    this.scene.add(new THREE.AmbientLight(0xb8c8e0, 0.45));
    this.sun = new THREE.DirectionalLight(0xfff0d0, 1.35);
    this.sun.position.set(12, 28, 10);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(1024, 1024);
    this.sun.shadow.camera.near = 2;
    this.sun.shadow.camera.far = 90;
    this.sun.shadow.camera.left = -18;
    this.sun.shadow.camera.right = 18;
    this.sun.shadow.camera.top = 40;
    this.sun.shadow.camera.bottom = -8;
    this.sun.shadow.bias = -0.0003;
    this.scene.add(this.sun);
    this.hemlight = new THREE.HemisphereLight(0x87b5ff, 0x5a4a32, 0.55);
    this.scene.add(this.hemlight);
    // Fill light from front for vehicle sides
    const fill = new THREE.DirectionalLight(0xa0c4ff, 0.25);
    fill.position.set(-6, 8, -4);
    this.scene.add(fill);

    this.buildSky();
    this.buildRoad();
    this.buildCityscape();
    this.buildHorizon();

    this.player = this.makeKeke(0xfbbf24, true);
    this.player.position.set(0, 0, PLAYER_Z);
    this.player.traverse((ch) => { if (ch.isMesh) { ch.castShadow = true; ch.receiveShadow = true; } });
    this.scene.add(this.player);
    // Night headlights
    this.headlightL = new THREE.SpotLight(0xfff2cc, 0, 28, 0.4, 0.4, 1.2);
    this.headlightR = new THREE.SpotLight(0xfff2cc, 0, 28, 0.4, 0.4, 1.2);
    this.headlightL.position.set(-0.3, 0.7, 1.2);
    this.headlightR.position.set(0.3, 0.7, 1.2);
    this.headlightL.target.position.set(-0.5, 0, 12);
    this.headlightR.target.position.set(0.5, 0, 12);
    this.player.add(this.headlightL);
    this.player.add(this.headlightR);
    this.player.add(this.headlightL.target);
    this.player.add(this.headlightR.target);

    // Pool mixed vehicle types for Phase 12 variety
    this.vehiclePool = [];
    this.typedPools = { car: [], keke: [], taxi: [], bus: [], motorcycle: [], truck: [], police: [], karota: [], robber: [] };
    const add = (mesh, type) => {
      mesh.visible = false;
      mesh.userData.poolType = type;
      this.scene.add(mesh);
      this.vehiclePool.push(mesh);
      this.typedPools[type].push(mesh);
    };
    for (let i = 0; i < 6; i++) add(this.makeCar(0xdc2626), 'car');
    for (let i = 0; i < 5; i++) add(this.makeKeke(0xeab308, false), 'keke');
    for (let i = 0; i < 3; i++) add(this.makeCar(0xeab308), 'taxi');
    for (let i = 0; i < 2; i++) add(this.makeBus(), 'bus');
    for (let i = 0; i < 3; i++) add(this.makeMotorcycle(), 'motorcycle');
    for (let i = 0; i < 2; i++) add(this.makeTruck(), 'truck');
    for (let i = 0; i < 2; i++) add(this.makeEnforcer('police'), 'police');
    for (let i = 0; i < 2; i++) add(this.makeEnforcer('karota'), 'karota');
    for (let i = 0; i < 2; i++) add(this.makeKeke(0x7f1d1d, false), 'robber');
    for (let i = 0; i < 10; i++) {
      const z = this.makeZone(0x4ade80);
      z.visible = false;
      this.scene.add(z);
      this.zonePool.push(z);
    }
    for (let i = 0; i < 12; i++) {
      const c = this.makeCoin();
      c.visible = false;
      this.scene.add(c);
      this.coinPool.push(c);
    }
    for (let i = 0; i < 6; i++) {
      const f = this.makeFuelPad();
      f.visible = false;
      this.scene.add(f);
      this.fuelPadPool.push(f);
    }
    for (let i = 0; i < 8; i++) {
      const p = this.makePotholeMesh();
      p.visible = false;
      this.scene.add(p);
      this.potholePool.push(p);
    }

    this.initParticles();
    this.weather = 'clear';
    this.weatherTimer = 0;
    try {
      const lq = JSON.parse(localStorage.getItem('kanoLQ') || 'false') || this._mobile;
      if (lq || this._mobile) this.applyQuality(true);
    } catch {}
    this.ready = true;
    console.log('[KanoRun] 3D ready', { mobile: !!this._mobile, w, h });
  }

  initParticles() {
    // Dust / speed particles
    this.dustGeo = new THREE.BufferGeometry();
    const dustCount = 80;
    const dustPos = new Float32Array(dustCount * 3);
    for (let i = 0; i < dustCount; i++) {
      dustPos[i * 3] = (Math.random() - 0.5) * 8;
      dustPos[i * 3 + 1] = Math.random() * 1.5;
      dustPos[i * 3 + 2] = Math.random() * 40 + 2;
    }
    this.dustGeo.setAttribute('position', new THREE.BufferAttribute(dustPos, 3));
    this.dustMat = new THREE.PointsMaterial({
      color: 0xc4b5a0,
      size: 0.12,
      transparent: true,
      opacity: 0.35,
      depthWrite: false
    });
    this.dust = new THREE.Points(this.dustGeo, this.dustMat);
    this.scene.add(this.dust);

    // Rain
    this.rainGeo = new THREE.BufferGeometry();
    const rainCount = 400;
    const rainPos = new Float32Array(rainCount * 3);
    for (let i = 0; i < rainCount; i++) {
      rainPos[i * 3] = (Math.random() - 0.5) * 14;
      rainPos[i * 3 + 1] = Math.random() * 12;
      rainPos[i * 3 + 2] = Math.random() * 50;
    }
    this.rainGeo.setAttribute('position', new THREE.BufferAttribute(rainPos, 3));
    this.rainMat = new THREE.PointsMaterial({
      color: 0xa5c4e0,
      size: 0.08,
      transparent: true,
      opacity: 0,
      depthWrite: false
    });
    this.rain = new THREE.Points(this.rainGeo, this.rainMat);
    this.scene.add(this.rain);

    // Blob shadows under player (fake, cheap)
    this.playerShadow = new THREE.Mesh(
      new THREE.CircleGeometry(0.7, 16),
      new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.28 })
    );
    this.playerShadow.rotation.x = -Math.PI / 2;
    this.playerShadow.position.y = 0.03;
    this.scene.add(this.playerShadow);
  }

  makeRoadTexture() {
    // 3-lane two-way highway texture (full width markings)
    const cv = document.createElement('canvas');
    cv.width = 512;
    cv.height = 512;
    const ctx = cv.getContext('2d');
    ctx.fillStyle = '#2c3138';
    ctx.fillRect(0, 0, 512, 512);
    for (let i = 0; i < 8000; i++) {
      const g = 28 + Math.random() * 45;
      ctx.fillStyle = 'rgba(' + g + ',' + g + ',' + (g + 6) + ',0.3)';
      ctx.fillRect(Math.random() * 512, Math.random() * 512, 2, 2);
    }
    // Outer white edges
    ctx.strokeStyle = '#f1f5f9';
    ctx.lineWidth = 10;
    ctx.beginPath();
    ctx.moveTo(18, 0); ctx.lineTo(18, 512);
    ctx.moveTo(494, 0); ctx.lineTo(494, 512);
    ctx.stroke();
    // Lane dividers at 1/3 and 2/3 — dashed white
    ctx.strokeStyle = '#e2e8f0';
    ctx.lineWidth = 6;
    ctx.setLineDash([36, 28]);
    ctx.beginPath();
    ctx.moveTo(512 / 3, 0); ctx.lineTo(512 / 3, 512);
    ctx.moveTo((512 * 2) / 3, 0); ctx.lineTo((512 * 2) / 3, 512);
    ctx.stroke();
    // Center double yellow (two-way)
    ctx.setLineDash([]);
    ctx.strokeStyle = '#eab308';
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.moveTo(250, 0); ctx.lineTo(250, 512);
    ctx.moveTo(262, 0); ctx.lineTo(262, 512);
    ctx.stroke();
    const tex = new THREE.CanvasTexture(cv);
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(1, 20);
    tex.anisotropy = 4;
    return tex;
  }

  mat(color, opts = {}) {
    return new THREE.MeshStandardMaterial({
      color,
      roughness: opts.roughness ?? 0.55,
      metalness: opts.metalness ?? 0.15,
      emissive: opts.emissive ?? 0x000000,
      emissiveIntensity: opts.emissiveIntensity ?? 0
    });
  }

  /** Sky dome — gradient sphere for real 3D sky */
  buildSky() {
    const geo = new THREE.SphereGeometry(90, 24, 16);
    const mat = new THREE.MeshBasicMaterial({
      color: 0x6ec5f0,
      side: THREE.BackSide,
      depthWrite: false
    });
    this.sky = new THREE.Mesh(geo, mat);
    this.scene.add(this.sky);
  }

  /** Distant hills + ground plane for depth layers */
  buildHorizon() {
    this.horizon = new THREE.Group();
    // Far ground
    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(80, 160),
      this.mat(0x3d5a3a, { roughness: 1 })
    );
    ground.rotation.x = -Math.PI / 2;
    ground.position.set(0, -0.08, 40);
    ground.receiveShadow = true;
    this.horizon.add(ground);
    // Hills left/right
    for (let i = 0; i < 8; i++) {
      const side = i % 2 === 0 ? -1 : 1;
      const hill = new THREE.Mesh(
        new THREE.ConeGeometry(4 + Math.random() * 3, 3 + Math.random() * 4, 6),
        this.mat(0x4a6340, { roughness: 0.95 })
      );
      hill.position.set(side * (14 + (i % 4) * 3), 1.2, 30 + i * 8);
      hill.rotation.y = Math.random();
      this.horizon.add(hill);
    }
    // Distant blocky skyline
    for (let i = 0; i < 12; i++) {
      const h = 4 + Math.random() * 10;
      const b = new THREE.Mesh(
        new THREE.BoxGeometry(2.2 + Math.random(), h, 2),
        this.mat(0x2a3548 + Math.floor(Math.random() * 0x101010), { roughness: 0.85 })
      );
      b.position.set((i - 6) * 3.5, h / 2, 55 + (i % 3) * 4);
      this.horizon.add(b);
    }
    this.scene.add(this.horizon);
  }

  buildRoad() {
    // 3-lane two-way highway — geometry width matches LANE_X travel
    const roadTex = this.makeRoadTexture();
    const roadMat = new THREE.MeshStandardMaterial({
      map: roadTex,
      roughness: 0.92,
      metalness: 0.05,
      color: 0xffffff
    });
    const road = new THREE.Mesh(new THREE.PlaneGeometry(ROAD_WIDTH, ROAD_LEN), roadMat);
    road.rotation.x = -Math.PI / 2;
    road.position.set(0, 0, ROAD_LEN / 2 - 4);
    road.receiveShadow = true;
    this.roadMesh = road;
    this.scene.add(road);

    // Dirt shoulders
    const shoulderX = ROAD_WIDTH / 2 + 2.2;
    for (const sx of [-shoulderX, shoulderX]) {
      const sh = new THREE.Mesh(
        new THREE.PlaneGeometry(4.2, ROAD_LEN),
        this.mat(0x5c5346, { roughness: 0.98 })
      );
      sh.rotation.x = -Math.PI / 2;
      sh.position.set(sx, 0.01, ROAD_LEN / 2 - 4);
      this.scene.add(sh);
    }

    // Physical lane markers at true LANE_X boundaries
    this.laneMarks = new THREE.Group();
    const midL = (LANE_X[0] + LANE_X[1]) / 2;
    const midR = (LANE_X[1] + LANE_X[2]) / 2;
    const dashMat = new THREE.MeshBasicMaterial({ color: 0xf8fafc });
    for (let z = 0; z < ROAD_LEN; z += 3.5) {
      for (const lx of [midL, midR]) {
        const dash = new THREE.Mesh(new THREE.PlaneGeometry(0.14, 1.6), dashMat);
        dash.rotation.x = -Math.PI / 2;
        dash.position.set(lx, 0.03, z);
        this.laneMarks.add(dash);
      }
    }
    // Double yellow center (two-way)
    const yel = new THREE.MeshBasicMaterial({ color: 0xeab308 });
    for (const ox of [-0.12, 0.12]) {
      const yl = new THREE.Mesh(new THREE.PlaneGeometry(0.1, ROAD_LEN), yel);
      yl.rotation.x = -Math.PI / 2;
      yl.position.set(ox, 0.028, ROAD_LEN / 2 - 4);
      this.laneMarks.add(yl);
    }
    // White edge lines
    const edgeX = ROAD_WIDTH / 2 - 0.25;
    const white = new THREE.MeshBasicMaterial({ color: 0xf1f5f9 });
    for (const lx of [-edgeX, edgeX]) {
      const el = new THREE.Mesh(new THREE.PlaneGeometry(0.16, ROAD_LEN), white);
      el.rotation.x = -Math.PI / 2;
      el.position.set(lx, 0.026, ROAD_LEN / 2 - 4);
      this.laneMarks.add(el);
    }
    this.scene.add(this.laneMarks);
  }

  buildCityscape() {
    this.buildings = new THREE.Group();
    const colors = [0x1e293b, 0x273449, 0x334155, 0x3b4a5c, 0x1a2332, 0x445566, 0x5c4033];

    // Mixed Kano roadside: houses, shops, mosques, markets, petrol, bus stops
    const types = [
      'market', 'shop', 'house', 'market', 'busstop', 'mosque',
      'shop', 'petrol', 'market', 'busstop', 'shop', 'house',
      'market', 'house', 'shop', 'mosque', 'market', 'petrol',
      'house', 'shop', 'market', 'busstop', 'market', 'mosque',
      'market', 'shop', 'busstop', 'house', 'market', 'petrol'
    ];

    // Roadside — prefer real building GLBs, fall back to procedural
    for (const side of [-1, 1]) {
      const cityCopies = this._mobile ? 0 : 2; // mobile: GLB buildings only or skip
      for (let i = 0; i < types.length * cityCopies; i++) {
        const z = i * 4.0 + (side > 0 ? 1.2 : 0);
        const xBase = side * (6.2 + (i % 4) * 0.35);
        const kind = types[i % types.length];
        let placed = false;
        if (kind === 'house' || kind === 'shop') {
          placed = !!this._placeGlb('building', xBase, z, { rotY: side > 0 ? -Math.PI / 2 : Math.PI / 2 });
        } else if (kind === 'market') {
          placed = !!this._placeGlb('market', xBase, z, { rotY: side > 0 ? -0.3 : 0.3 });
          if (!placed) this.addMarketStall(xBase, z, side);
          placed = true;
        } else if (kind === 'busstop') {
          placed = !!this._placeGlb('bustop', side * 5.2, z, {});
          if (!placed) this.addBusStop(xBase, z, side);
          placed = true;
        }
        if (!placed) {
          if (kind === 'mosque') this.addMosque(xBase, z, side);
          else if (kind === 'petrol') this.addPetrol(xBase, z, side);
          else if (kind === 'shop') this.addShop(xBase, z, side, colors[i % colors.length]);
          else this.addHouse(xBase, z, side, colors[i % colors.length]);
        }
        if (i % 3 === 0) this._placeGlb('tree', side * (8.5 + (i % 2)), z + 1.5, {});
        if (i % 2 === 0) this.addStreetLight(side * 4.6, z + 1.2);
        if (i % 4 === 1) {
          if (!this._placeGlb('billboard', side * 5.0, z + 2.5, {})) {
            this.addBillboard(side * 4.8, z + 2.5);
          }
        }
      }
    }

    // People on sidewalk only — outside lane bounds (±2.2)
    for (let i = 0; i < 70; i++) {
      const side = i % 2 === 0 ? -1 : 1;
      this.addPedestrian(side * (4.8 + (i % 4) * 0.2), i * 2.6 + 1.0);
    }

    // Flyovers / lights — desktop only (mobile needs FPS for vehicle GLBs)
    if (!this._mobile) {
      for (const z of [22, 55, 95, 130]) {
        const fo = this._placeGlb('flyover', 0, z, {});
        if (fo) {
          fo.position.y = Math.max(fo.position.y, 3.2);
          fo.scale.multiplyScalar(1.15);
        }
      }
      for (let i = 0; i < 12; i++) {
        const side = i % 2 === 0 ? -1 : 1;
        this._placeGlb('roadlight', side * 4.8, 8 + i * 11, {});
      }
    }

    // Kano-style city gates / welcome arches spanning the road
    this.addCityGate(0, 28);
    this.addCityGate(0, 72);
    this.addWelcomePillar(-6.5, 45);
    this.addWelcomePillar(6.5, 45);

    this.scene.add(this.buildings);

    this.sky = new THREE.Mesh(
      new THREE.SphereGeometry(95, 16, 12, 0, Math.PI * 2, 0, Math.PI / 2),
      new THREE.MeshBasicMaterial({ color: 0x1a2744, side: THREE.BackSide })
    );
    this.sky.position.y = -2;
    this.scene.add(this.sky);
  }

  addCityGate(x, z) {
    const archCol = this.mat(0x7c2d12, { roughness: 0.85 });
    const cream = this.mat(0xf5e6c8, { roughness: 0.7 });
    // left pillar
    const lp = new THREE.Mesh(new THREE.BoxGeometry(0.8, 5.5, 0.8), archCol);
    lp.position.set(x - 4.2, 2.75, z);
    this.buildings.add(lp);
    // right pillar
    const rp = new THREE.Mesh(new THREE.BoxGeometry(0.8, 5.5, 0.8), archCol);
    rp.position.set(x + 4.2, 2.75, z);
    this.buildings.add(rp);
    // top beam
    const beam = new THREE.Mesh(new THREE.BoxGeometry(9.2, 0.7, 0.7), archCol);
    beam.position.set(x, 5.4, z);
    this.buildings.add(beam);
    // crenellations
    for (let i = -4; i <= 4; i++) {
      const cren = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.45, 0.5), archCol);
      cren.position.set(x + i * 1.0, 5.95, z);
      this.buildings.add(cren);
    }
    // sign panel
    const sign = new THREE.Mesh(new THREE.BoxGeometry(4.5, 0.55, 0.15), cream);
    sign.position.set(x, 5.35, z + 0.4);
    this.buildings.add(sign);
  }

  addWelcomePillar(x, z) {
    const body = new THREE.Mesh(
      new THREE.BoxGeometry(1.1, 6.5, 1.1),
      this.mat(0xb45309, { roughness: 0.75 })
    );
    body.position.set(x, 3.25, z);
    this.buildings.add(body);
    const top = new THREE.Mesh(
      new THREE.BoxGeometry(1.3, 0.5, 1.3),
      this.mat(0xfbbf24, { roughness: 0.5, metalness: 0.2 })
    );
    top.position.set(x, 6.7, z);
    this.buildings.add(top);
    // I Love Kano heart panel
    const panel = new THREE.Mesh(
      new THREE.PlaneGeometry(0.8, 1.2),
      new THREE.MeshBasicMaterial({ color: 0xdc2626, side: THREE.DoubleSide })
    );
    panel.position.set(x + (x > 0 ? -0.56 : 0.56), 4.2, z);
    this.buildings.add(panel);
  }

  addHouse(x, z, side, color) {
    const bw = 1.6 + Math.random() * 1.2;
    const bh = 2.2 + Math.random() * 2.5;
    const bd = 1.5 + Math.random() * 1.2;
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(bw, bh, bd), this._wallMat(color));
    mesh.position.set(x, bh / 2, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    this.buildings.add(mesh);
    const roof = new THREE.Mesh(
      new THREE.BoxGeometry(bw + 0.2, 0.15, bd + 0.2),
      this.mat(0x44403c, { roughness: 0.95 })
    );
    roof.position.set(x, bh + 0.08, z);
    this.buildings.add(roof);
    const door = new THREE.Mesh(
      new THREE.BoxGeometry(0.35, 0.7, 0.08),
      this.mat(0x292524, { roughness: 0.8 })
    );
    door.position.set(x - side * 0.1, 0.35, z + (side > 0 ? -bd / 2 - 0.02 : bd / 2 + 0.02));
    this.buildings.add(door);
  }

  addShop(x, z, side, color) {
    const bw = 2.0, bh = 2.4, bd = 1.6;
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(bw, bh, bd), this._wallMat(color || 0xb45309));
    mesh.position.set(x, bh / 2, z);
    mesh.castShadow = true;
    this.buildings.add(mesh);
    const awning = new THREE.Mesh(
      new THREE.BoxGeometry(bw + 0.3, 0.08, 0.7),
      this._marketMat(0xdc2626)
    );
    awning.position.set(x - side * 0.3, bh * 0.75, z);
    this.buildings.add(awning);
    const sign = new THREE.Mesh(
      new THREE.BoxGeometry(bw * 0.8, 0.35, 0.08),
      this.mat(0xfbbf24, { roughness: 0.5, emissive: 0xb45309, emissiveIntensity: 0.15 })
    );
    sign.position.set(x - side * 0.05, bh * 0.9, z + (side > 0 ? -bd / 2 - 0.05 : bd / 2 + 0.05));
    this.buildings.add(sign);
  }

  addMosque(x, z, side) {
    const base = new THREE.Mesh(
      new THREE.BoxGeometry(2.4, 2.8, 2.0),
      this.mat(0x0f766e, { roughness: 0.8 })
    );
    base.position.set(x, 1.4, z);
    this.buildings.add(base);
    // dome
    const dome = new THREE.Mesh(
      new THREE.SphereGeometry(0.85, 12, 10, 0, Math.PI * 2, 0, Math.PI / 2),
      this.mat(0xf5f5f4, { roughness: 0.4, metalness: 0.2 })
    );
    dome.position.set(x, 2.8, z);
    this.buildings.add(dome);
    // minaret
    const minaret = new THREE.Mesh(
      new THREE.CylinderGeometry(0.18, 0.22, 4.2, 10),
      this.mat(0x0d9488, { roughness: 0.75 })
    );
    minaret.position.set(x + side * 1.1, 2.1, z - 0.6);
    this.buildings.add(minaret);
    // minaret top
    const cap = new THREE.Mesh(
      new THREE.ConeGeometry(0.28, 0.5, 8),
      this.mat(0xfbbf24, { roughness: 0.4, metalness: 0.3 })
    );
    cap.position.set(x + side * 1.1, 4.4, z - 0.6);
    this.buildings.add(cap);
  }

  addMarketStall(x, z, side) {
    // Prefer market.glb
    if (this._placeGlb('market', x, z, { rotY: side > 0 ? Math.PI : 0, scale: 1 })) return;
    for (const dx of [-0.7, 0.7]) {
      const post = new THREE.Mesh(
        new THREE.BoxGeometry(0.1, 1.6, 0.1),
        this.mat(0x78716c, { roughness: 0.9 })
      );
      post.position.set(x + dx, 0.8, z);
      this.buildings.add(post);
    }
    const canopy = new THREE.Mesh(
      new THREE.BoxGeometry(1.8, 0.08, 1.4),
      this._marketMat(0xeab308)
    );
    canopy.position.set(x, 1.65, z);
    this.buildings.add(canopy);
    const table = new THREE.Mesh(
      new THREE.BoxGeometry(1.5, 0.12, 1.0),
      this.mat(0xa16207, { roughness: 0.85 })
    );
    table.position.set(x, 0.7, z);
    this.buildings.add(table);
  }

  addPetrol(x, z, side) {
    const canopy = new THREE.Mesh(
      new THREE.BoxGeometry(3.2, 0.12, 2.2),
      this.mat(0xdc2626, { roughness: 0.5 })
    );
    canopy.position.set(x, 2.4, z);
    this.buildings.add(canopy);
    // pillars
    for (const dx of [-1.2, 1.2]) {
      const p = new THREE.Mesh(
        new THREE.CylinderGeometry(0.12, 0.12, 2.4, 8),
        this.mat(0xf8fafc, { roughness: 0.4, metalness: 0.3 })
      );
      p.position.set(x + dx, 1.2, z);
      this.buildings.add(p);
    }
    // pump
    const pump = new THREE.Mesh(
      new THREE.BoxGeometry(0.5, 1.2, 0.4),
      this.mat(0x1e293b, { roughness: 0.6 })
    );
    pump.position.set(x, 0.6, z + 0.5);
    this.buildings.add(pump);
    // price sign
    const sign = new THREE.Mesh(
      new THREE.BoxGeometry(1.2, 0.5, 0.1),
      this.mat(0xfbbf24, { roughness: 0.4, emissive: 0xb45309, emissiveIntensity: 0.2 })
    );
    sign.position.set(x, 2.7, z);
    this.buildings.add(sign);
  }

  addBusStop(x, z, side) {
    if (this._placeGlb('bustop', x, z, { rotY: side > 0 ? Math.PI : 0, scale: 1 })) return;
    if (this._placeGlb('bustation', x, z, { rotY: side > 0 ? Math.PI : 0, scale: 0.85 })) return;
    const roof = new THREE.Mesh(
      new THREE.BoxGeometry(2.0, 0.08, 1.2),
      this.mat(0x334155, { roughness: 0.7 })
    );
    roof.position.set(x, 2.0, z);
    this.buildings.add(roof);
    const back = new THREE.Mesh(
      new THREE.BoxGeometry(2.0, 1.4, 0.08),
      this.mat(0x475569, { roughness: 0.8 })
    );
    back.position.set(x, 1.2, z - side * 0.5);
    this.buildings.add(back);
    const bench = new THREE.Mesh(
      new THREE.BoxGeometry(1.6, 0.12, 0.4),
      this.mat(0x78716c, { roughness: 0.85 })
    );
    bench.position.set(x, 0.5, z);
    this.buildings.add(bench);
  }

  addStreetLight(x, z) {
    const pole = new THREE.Mesh(
      new THREE.CylinderGeometry(0.05, 0.06, 3.2, 6),
      this.mat(0x64748b, { roughness: 0.6, metalness: 0.4 })
    );
    pole.position.set(x, 1.6, z);
    this.buildings.add(pole);
    const lamp = new THREE.Mesh(
      new THREE.SphereGeometry(0.18, 8, 8),
      this.mat(0xfde047, { emissive: 0xfbbf24, emissiveIntensity: 0.6, roughness: 0.3 })
    );
    lamp.position.set(x, 3.25, z);
    this.buildings.add(lamp);
  }

  addBillboard(x, z) {
    const pole = new THREE.Mesh(
      new THREE.BoxGeometry(0.1, 2.5, 0.1),
      this.mat(0x475569, { roughness: 0.7 })
    );
    pole.position.set(x, 1.25, z);
    this.buildings.add(pole);
    // Ruffneck-colored boards alternating
    const col = Math.abs(z) % 12 < 6 ? 0xe11d48 : 0x2563eb;
    const board = new THREE.Mesh(
      new THREE.BoxGeometry(2.2, 1.1, 0.08),
      this.mat(col, { roughness: 0.5, emissive: col, emissiveIntensity: 0.12 })
    );
    board.position.set(x, 2.9, z);
    this.buildings.add(board);
  }

  addPedestrian(x, z) {
    // Human scale vs keke (~1.9m) → people ~1.0–1.1m tall, never giant
    const key = Math.random() < 0.5 && this.models?.has?.('passenger') ? 'passenger' : 'pedestrian';
    if (this._placeGlb(key, x, z, { rotY: Math.random() * Math.PI * 2, scale: 0.65 })) return;

    const g = new THREE.Group();
    g.position.set(x, 0, z);
    const shirtColors = [0x3b82f6, 0xec4899, 0x22c55e, 0xeab308, 0xa855f7, 0xf8fafc, 0xf97316];
    const shirt = shirtColors[Math.floor(Math.random() * shirtColors.length)];
    // Total height ~1.05 units — smaller than keke
    const legs = new THREE.Mesh(
      new THREE.BoxGeometry(0.16, 0.38, 0.12),
      this.mat(0x1e293b, { roughness: 0.9 })
    );
    legs.position.y = 0.19;
    g.add(legs);
    const body = new THREE.Mesh(
      new THREE.BoxGeometry(0.22, 0.34, 0.14),
      this.mat(shirt, { roughness: 0.8 })
    );
    body.position.y = 0.55;
    g.add(body);
    const head = new THREE.Mesh(
      new THREE.SphereGeometry(0.1, 8, 8),
      this.mat(0xc4a574, { roughness: 0.7 })
    );
    head.position.y = 0.82;
    g.add(head);
    g.userData.baseZ = z;
    this.buildings.add(g);
  }

  /** Keke NAPEP style — yellow body, black canopy, 3 wheels */
  makeKeke(bodyColor = 0xfbbf24, isPlayer = false) {
    const g = new THREE.Group();
    const bodyM = this.mat(bodyColor, { roughness: 0.45, metalness: 0.2 });
    const dark = this.mat(0x1e293b, { roughness: 0.7 });
    // Real NAPEP: black fabric canopy
    const roofM = this.mat(0x0f172a, { roughness: 0.9 });
    const chrome = this.mat(0x94a3b8, { roughness: 0.3, metalness: 0.7 });
    const tire = this.mat(0x0f172a, { roughness: 0.95 });

    // Main cabin body
    const body = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.5, 1.35), bodyM);
    body.position.set(0, 0.55, -0.05);
    g.add(body);

    // Accent stripe
    const stripe = new THREE.Mesh(
      new THREE.BoxGeometry(1.22, 0.08, 1.36),
      this.mat(0xca8a04, { roughness: 0.5 })
    );
    stripe.position.set(0, 0.38, -0.05);
    g.add(stripe);

    // Roof / canopy
    const canopy = new THREE.Mesh(new THREE.BoxGeometry(1.35, 0.1, 1.2), roofM);
    canopy.position.set(0, 1.22, -0.08);
    g.add(canopy);

    // Canopy front lip
    const lip = new THREE.Mesh(new THREE.BoxGeometry(1.35, 0.08, 0.12), roofM);
    lip.position.set(0, 1.15, 0.5);
    g.add(lip);

    // Side pillars
    for (const x of [-0.55, 0.55]) {
      const p = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.55, 0.07), dark);
      p.position.set(x, 0.95, 0.45);
      g.add(p);
      const p2 = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.55, 0.07), dark);
      p2.position.set(x, 0.95, -0.45);
      g.add(p2);
    }

    // Windshield frame
    const wind = new THREE.Mesh(
      new THREE.BoxGeometry(1.05, 0.38, 0.06),
      this.mat(0x38bdf8, { roughness: 0.2, metalness: 0.3 })
    );
    wind.position.set(0, 0.95, 0.58);
    g.add(wind);

    // Front nose / panel
    const nose = new THREE.Mesh(new THREE.BoxGeometry(0.95, 0.38, 0.35), dark);
    nose.position.set(0, 0.58, 0.72);
    g.add(nose);

    // Headlights
    const lightM = this.mat(0xfde047, {
      roughness: 0.3,
      emissive: 0xfbbf24,
      emissiveIntensity: isPlayer ? 0.85 : 0.4
    });
    for (const x of [-0.3, 0.3]) {
      const hl = new THREE.Mesh(new THREE.SphereGeometry(0.09, 10, 10), lightM);
      hl.position.set(x, 0.58, 0.92);
      g.add(hl);
    }
    // Amber indicators (NAPEP style)
    const indM = this.mat(0xf59e0b, { emissive: 0xf59e0b, emissiveIntensity: 0.35 });
    for (const x of [-0.55, 0.55]) {
      const ind = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.08, 0.08), indM);
      ind.position.set(x, 0.72, 0.75);
      g.add(ind);
    }

    // Handlebars
    const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.7, 8), chrome);
    bar.rotation.z = Math.PI / 2;
    bar.position.set(0, 0.85, 0.7);
    g.add(bar);

    // Rear passenger bench
    const bench = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.18, 0.45), dark);
    bench.position.set(0, 0.72, -0.45);
    g.add(bench);

    // Number plate
    const plate = new THREE.Mesh(
      new THREE.BoxGeometry(0.45, 0.14, 0.03),
      this.mat(0xf8fafc, { roughness: 0.6 })
    );
    plate.position.set(0, 0.35, 0.9);
    g.add(plate);

    // Wheels: 2 rear + 1 front
    const mkWheel = (x, z, r = 0.24) => {
      const w = new THREE.Mesh(new THREE.CylinderGeometry(r, r, 0.16, 14), tire);
      w.rotation.z = Math.PI / 2;
      w.position.set(x, r, z);
      g.add(w);
      // hub
      const hub = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.35, r * 0.35, 0.18, 10), chrome);
      hub.rotation.z = Math.PI / 2;
      hub.position.set(x, r, z);
      g.add(hub);
      return w;
    };
    mkWheel(-0.58, -0.5, 0.24);
    mkWheel(0.58, -0.5, 0.24);
    mkWheel(0, 0.78, 0.22);

    // Front fork
    const fork = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.4, 0.08), chrome);
    fork.position.set(0, 0.45, 0.78);
    g.add(fork);

    g.userData.kind = 'keke';
    return g;
  }

  /** Better sedan / generic car */
  makeCar(color = 0xdc2626) {
    const g = new THREE.Group();
    const bodyM = this.mat(color, { roughness: 0.4, metalness: 0.3 });
    const dark = this.mat(0x0f172a, { roughness: 0.85 });
    const glass = this.mat(0x1e3a5f, { roughness: 0.15, metalness: 0.4 });

    const body = new THREE.Mesh(new THREE.BoxGeometry(1.35, 0.38, 2.3), bodyM);
    body.position.y = 0.42;
    g.add(body);

    // Cabin
    const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.4, 1.15), bodyM);
    cabin.position.set(0, 0.78, -0.15);
    g.add(cabin);

    // Windows
    const win = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.28, 1.0), glass);
    win.position.set(0, 0.82, -0.12);
    g.add(win);

    // Hood slope hint
    const hood = new THREE.Mesh(new THREE.BoxGeometry(1.25, 0.12, 0.55), bodyM);
    hood.position.set(0, 0.55, 0.85);
    g.add(hood);

    // Lights
    const lm = this.mat(0xfde047, { emissive: 0xfbbf24, emissiveIntensity: 0.5 });
    for (const x of [-0.4, 0.4]) {
      const hl = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.1, 0.06), lm);
      hl.position.set(x, 0.4, 1.18);
      g.add(hl);
    }

    // Wheels
    for (const [x, z] of [[-0.55, 0.75], [0.55, 0.75], [-0.55, -0.75], [0.55, -0.75]]) {
      const w = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 0.14, 12), dark);
      w.rotation.z = Math.PI / 2;
      w.position.set(x, 0.22, z);
      g.add(w);
    }

    g.userData.kind = 'car';
    g.userData.recolor = [body, cabin, hood];
    return g;
  }

  /** Police / KAROTA — KAROTA = yellow shirt + black trousers + stick */
  makeEnforcer(kind = 'police') {
    if (kind === 'karota') {
      return this.makeKarotaOfficer();
    }
    const color = 0x1e40af;
    const g = this.makeCar(color);
    // Light bar
    const bar = new THREE.Mesh(
      new THREE.BoxGeometry(0.7, 0.12, 0.25),
      this.mat(0x1e293b, { roughness: 0.5 })
    );
    bar.position.set(0, 1.05, -0.1);
    g.add(bar);
    const red = new THREE.Mesh(
      new THREE.BoxGeometry(0.28, 0.1, 0.2),
      this.mat(0xef4444, { emissive: 0xef4444, emissiveIntensity: 0.7 })
    );
    red.position.set(-0.2, 1.05, -0.1);
    g.add(red);
    const blue = new THREE.Mesh(
      new THREE.BoxGeometry(0.28, 0.1, 0.2),
      this.mat(0x3b82f6, { emissive: 0x3b82f6, emissiveIntensity: 0.7 })
    );
    blue.position.set(0.2, 1.05, -0.1);
    g.add(blue);
    g.userData.kind = kind;
    return g;
  }

  /** KAROTA officer: yellow shirt, black trousers, stick — roadside figure */
  makeKarotaOfficer() {
    const g = new THREE.Group();
    const skin = this.mat(0xc4a574, { roughness: 0.8 });
    const shirt = this.mat(0xfacc15, { roughness: 0.65 }); // yellow uniform shirt
    const pants = this.mat(0x0f172a, { roughness: 0.9 }); // black trousers
    const stickM = this.mat(0x78350f, { roughness: 0.7 });
    // legs
    const legL = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.45, 0.16), pants);
    legL.position.set(-0.1, 0.25, 0);
    g.add(legL);
    const legR = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.45, 0.16), pants);
    legR.position.set(0.1, 0.25, 0);
    g.add(legR);
    // torso yellow
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.5, 0.28), shirt);
    body.position.set(0, 0.7, 0);
    g.add(body);
    // head
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.24, 0.22), skin);
    head.position.set(0, 1.05, 0);
    g.add(head);
    // beret / cap
    const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.14, 0.08, 10), this.mat(0x1e293b));
    cap.position.set(0, 1.18, 0);
    g.add(cap);
    // arms
    const armL = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.4, 0.12), shirt);
    armL.position.set(-0.3, 0.7, 0);
    g.add(armL);
    const armR = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.4, 0.12), shirt);
    armR.position.set(0.3, 0.7, 0.05);
    armR.rotation.z = -0.4;
    g.add(armR);
    // stick in right hand
    const stick = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.9, 6), stickM);
    stick.position.set(0.42, 0.85, 0.15);
    stick.rotation.z = 0.35;
    g.add(stick);
    // small checkpoint cone next to officer
    const cone = new THREE.Mesh(
      new THREE.ConeGeometry(0.18, 0.45, 8),
      this.mat(0xf97316, { roughness: 0.6 })
    );
    cone.position.set(0.55, 0.22, -0.15);
    g.add(cone);
    g.userData.kind = 'karota';
    g.scale.set(1.35, 1.35, 1.35);
    return g;
  }

  makeMotorcycle() {
    const g = new THREE.Group();
    const dark = this.mat(0x0f172a, { roughness: 0.9 });
    const body = this.mat(0x475569, { roughness: 0.5, metalness: 0.3 });
    const w1 = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.18, 0.1, 10), dark);
    w1.rotation.z = Math.PI / 2; w1.position.set(0, 0.18, 0.45); g.add(w1);
    const w2 = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.18, 0.1, 10), dark);
    w2.rotation.z = Math.PI / 2; w2.position.set(0, 0.18, -0.4); g.add(w2);
    const frame = new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.2, 0.9), body);
    frame.position.y = 0.4; g.add(frame);
    const rider = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.4, 0.25), this.mat(0x1d4ed8));
    rider.position.set(0, 0.7, -0.05); g.add(rider);
    g.userData.kind = 'motorcycle';
    return g;
  }

  makeBus() {
    const g = new THREE.Group();
    const bodyM = this.mat(0x15803d, { roughness: 0.5, metalness: 0.15 });
    const body = new THREE.Mesh(new THREE.BoxGeometry(1.5, 1.1, 3.2), bodyM);
    body.position.y = 0.85; g.add(body);
    const dark = this.mat(0x0f172a);
    for (const [x, z] of [[-0.55, 1.1], [0.55, 1.1], [-0.55, -1.1], [0.55, -1.1]]) {
      const w = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.24, 0.14, 10), dark);
      w.rotation.z = Math.PI / 2; w.position.set(x, 0.24, z); g.add(w);
    }
    g.userData.kind = 'bus';
    return g;
  }

  makeTruck() {
    const g = new THREE.Group();
    const cab = new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.9, 1.1), this.mat(0xb45309, { roughness: 0.5 }));
    cab.position.set(0, 0.7, 0.9); g.add(cab);
    const bed = new THREE.Mesh(new THREE.BoxGeometry(1.35, 0.7, 2.0), this.mat(0x78716c, { roughness: 0.8 }));
    bed.position.set(0, 0.6, -0.7); g.add(bed);
    const dark = this.mat(0x0f172a);
    for (const [x, z] of [[-0.5, 0.9], [0.5, 0.9], [-0.5, -1.0], [0.5, -1.0]]) {
      const w = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 0.14, 10), dark);
      w.rotation.z = Math.PI / 2; w.position.set(x, 0.22, z); g.add(w);
    }
    g.userData.kind = 'truck';
    return g;
  }

  /** Highlighted stop pad — kind: 'pick' | 'drop' | 'default' */
  _makeLabelSprite(text, bgColor) {
    const cv = document.createElement('canvas');
    cv.width = 256;
    cv.height = 64;
    const ctx = cv.getContext('2d');
    ctx.clearRect(0, 0, 256, 64);
    // rounded plate
    ctx.fillStyle = bgColor;
    ctx.beginPath();
    const r = 12;
    ctx.moveTo(r, 4);
    ctx.arcTo(252, 4, 252, 60, r);
    ctx.arcTo(252, 60, 4, 60, r);
    ctx.arcTo(4, 60, 4, 4, r);
    ctx.arcTo(4, 4, 252, 4, r);
    ctx.fill();
    ctx.fillStyle = '#0f172a';
    ctx.font = 'bold 28px system-ui,sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, 128, 34);
    const tex = new THREE.CanvasTexture(cv);
    tex.needsUpdate = true;
    const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: true });
    const sp = new THREE.Sprite(mat);
    sp.scale.set(2.4, 0.6, 1);
    sp.position.set(0, 2.1, 0);
    sp.userData.isLabel = true;
    return sp;
  }


  makeFuelPad() {
    const g = new THREE.Group();
    const pad = new THREE.Mesh(
      new THREE.CircleGeometry(0.85, 24),
      new THREE.MeshBasicMaterial({ color: 0x22c55e, transparent: true, opacity: 0.55, side: THREE.DoubleSide })
    );
    pad.rotation.x = -Math.PI / 2;
    pad.position.y = 0.05;
    g.add(pad);
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(0.7, 0.9, 24),
      new THREE.MeshBasicMaterial({ color: 0x86efac, side: THREE.DoubleSide, transparent: true, opacity: 0.9 })
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.06;
    g.add(ring);
    const pump = new THREE.Mesh(
      new THREE.BoxGeometry(0.25, 0.7, 0.25),
      this.mat(0x15803d, { emissive: 0x22c55e, emissiveIntensity: 0.3 })
    );
    pump.position.set(0.5, 0.35, 0);
    g.add(pump);
    return g;
  }

  makePotholeMesh() {
    const g = new THREE.Group();
    const hole = new THREE.Mesh(
      new THREE.CircleGeometry(0.55, 12),
      new THREE.MeshBasicMaterial({ color: 0x1c1917, transparent: true, opacity: 0.85, side: THREE.DoubleSide })
    );
    hole.rotation.x = -Math.PI / 2;
    hole.position.y = 0.04;
    g.add(hole);
    const rim = new THREE.Mesh(
      new THREE.RingGeometry(0.45, 0.65, 12),
      new THREE.MeshBasicMaterial({ color: 0x44403c, side: THREE.DoubleSide })
    );
    rim.rotation.x = -Math.PI / 2;
    rim.position.y = 0.045;
    g.add(rim);
    return g;
  }

  makeZone(color, kind = 'default') {
    const g = new THREE.Group();
    const isDrop = kind === 'drop' || color === 0xfbbf24;
    const col = isDrop ? 0xfbbf24 : 0x22c55e;
    // Wide glowing stop pad
    const pad = new THREE.Mesh(
      new THREE.CircleGeometry(1.15, 32),
      new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.35, side: THREE.DoubleSide })
    );
    pad.rotation.x = -Math.PI / 2;
    pad.position.y = 0.04;
    g.add(pad);
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(0.95, 1.2, 32),
      new THREE.MeshBasicMaterial({ color: col, side: THREE.DoubleSide, transparent: true, opacity: 0.95 })
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.06;
    g.add(ring);
    // Pole + flag
    const pole = new THREE.Mesh(
      new THREE.CylinderGeometry(0.04, 0.04, 1.6, 8),
      this.mat(0x94a3b8, { roughness: 0.5, metalness: 0.4 })
    );
    pole.position.set(1.1, 0.8, 0);
    g.add(pole);
    const flag = new THREE.Mesh(
      new THREE.BoxGeometry(0.55, 0.32, 0.04),
      this.mat(col, { emissive: col, emissiveIntensity: 0.55, roughness: 0.4 })
    );
    flag.position.set(1.35, 1.4, 0);
    g.add(flag);
    const disc = new THREE.Mesh(
      new THREE.CircleGeometry(0.7, 24),
      new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.28, side: THREE.DoubleSide })
    );
    disc.rotation.x = -Math.PI / 2;
    disc.position.y = 0.05;
    g.add(disc);
    // World-space label
    const label = this._makeLabelSprite(isDrop ? 'DROP · BRAKE' : 'PICK UP', isDrop ? '#fbbf24' : '#4ade80');
    g.add(label);
    g.userData.label = label;
    g.userData.kind = isDrop ? 'drop' : 'pick';
    g.userData.pulse = Math.random() * Math.PI * 2;
    return g;
  }

  /** Change world look by distance biome */
  applyWorldBiome(biome) {
    if (!biome || this._lastBiome === biome.id) return;
    this._lastBiome = biome.id;
    if (this.scene?.fog) {
      this.scene.fog.color.setHex(biome.fog || 0x8ec8e8);
      this.scene.fog.near = biome.fogNear || 16;
      this.scene.fog.far = biome.fogFar || 70;
    }
    if (this.sky?.material) this.sky.material.color.setHex(biome.sky || 0x6ec5f0);
    if (this.sun) this.sun.intensity = biome.sun ?? 1.2;
    if (this.hemlight) this.hemlight.intensity = biome.hem ?? 0.5;
    // Tint roadside slightly
    if (this.buildings) {
      this.buildings.traverse((ch) => {
        if (ch.isMesh && ch.material?.color && ch.geometry?.type === 'BoxGeometry') {
          const base = ch.userData.biomeBase || ch.material.color.getHex();
          if (!ch.userData.biomeBase) ch.userData.biomeBase = base;
          ch.material.color.setHex(biome.buildingTint != null ? biome.buildingTint : base);
        }
      });
    }
  }

  makeCoin() {
    const mesh = new THREE.Mesh(
      new THREE.CylinderGeometry(0.3, 0.3, 0.07, 18),
      this.mat(0xfbbf24, { metalness: 0.75, roughness: 0.22, emissive: 0xb45309, emissiveIntensity: 0.3 })
    );
    mesh.rotation.x = Math.PI / 2;
    return mesh;
  }

  /** Swap pool mesh to match obstacle type */
  styleVehicle(mesh, type) {
    // Only recolor procedural BoxGeometry placeholders — never touch GLB meshes
    if (mesh.userData?.isPlaceholder) {
      const col =
        type === 'karota' ? 0xf59e0b :
        type === 'police' ? 0x1e40af :
        type === 'keke' ? 0xeab308 :
        type === 'car' ? 0xdc2626 : 0x64748b;
      mesh.traverse((ch) => {
        if (ch.isMesh && ch.material?.color && ch.geometry?.type === 'BoxGeometry') {
          ch.material.color.setHex(col);
        }
      });
    }
    // Uniform scale only (do not squash GLBs on Z)
    if (!mesh.userData._baseScale) {
      mesh.userData._baseScale = mesh.scale.x || 1;
    }
    const s = mesh.userData._baseScale;
    if (type === 'keke') mesh.scale.setScalar(s * 0.95);
    else if (type === 'police' || type === 'karota') mesh.scale.setScalar(s * 1.05);
    else mesh.scale.setScalar(s);
  }

  screenYToZ(y, playerY) {
    const t = (playerY - y) / Math.max(playerY, 1);
    return PLAYER_Z + t * 58;
  }

  laneToX(lane) {
    // Float lane: 0 = left, 1 = center, 2 = right (screen space, +X = right)
    const i = Math.max(0, Math.min(2, Number(lane) || 0));
    const a = Math.floor(i);
    const b = Math.min(2, a + 1);
    const t = i - a;
    return LANE_X[a] + (LANE_X[b] - LANE_X[a]) * t;
  }

  cycleCamera() {
    const modes = ['chase', 'driver', 'passenger', 'road'];
    const i = modes.indexOf(this.cameraMode || 'chase');
    this.cameraMode = modes[(i + 1) % modes.length];
    this.cabinCam = this.cameraMode === 'driver';
    return this.cameraMode;
  }

  setDamageVisual(condition) {
    if (!this.player) return;
    const t = Math.max(0, Math.min(1, (100 - (condition || 100)) / 100));
    this.player.traverse((ch) => {
      if (ch.isMesh && ch.material && ch.material.color && ch.geometry?.type === 'BoxGeometry') {
        const p = ch.geometry.parameters;
        if (p && p.width >= 1.0 && p.height >= 0.4 && p.height <= 0.6) {
          // darken body toward grey-brown when damaged
          const base = ch.userData.baseColor || ch.material.color.getHex();
          if (!ch.userData.baseColor) ch.userData.baseColor = base;
          const r = ((base >> 16) & 255) * (1 - t * 0.45);
          const g = ((base >> 8) & 255) * (1 - t * 0.5);
          const b = (base & 255) * (1 - t * 0.2);
          ch.material.color.setRGB(r / 255, g / 255, b / 255);
          ch.material.roughness = 0.45 + t * 0.4;
        }
      }
    });
  }

  applyPaint(paintId) {
    const colors = {
      classic: 0xfbbf24, ruffneck: 0xeab308, sky: 0x38bdf8,
      forest: 0x22c55e, royal: 0xa855f7, ember: 0xef4444, night: 0x1e293b
    };
    const col = colors[paintId] || 0xfbbf24;
    if (!this.player) return;
    this.player.traverse((ch) => {
      if (ch.isMesh && ch.material && ch.material.color && ch.geometry?.type === 'BoxGeometry') {
        const p = ch.geometry.parameters;
        if (p && p.width >= 1.0 && p.height >= 0.4 && p.height <= 0.6) {
          ch.material.color.setHex(col);
        }
      }
    });
  }

  applyQuality(low) {
    if (!this.renderer) return;
    this._lowQuality = !!low;
    this.renderer.setPixelRatio(1);
    let w = this.canvas.clientWidth || 390;
    let h = this.canvas.clientHeight || 700;
    if (w < 160) w = 390;
    if (h < 160) h = 700;
    this.renderer.setSize(w, h, false);
    try {
      this.renderer.shadowMap.enabled = !low;
    } catch (e) {}
    if (this.rain) this.rain.visible = !low;
    if (this.dust) this.dust.visible = !low;
    if (this.hemlight && low) this.hemlight.intensity = Math.max(0.4, this.hemlight.intensity);
    // Hide far buildings on low to cut draw calls
    if (low && this.buildings) {
      let n = 0;
      this.buildings.children.forEach((ch, i) => {
        if (i > 40) ch.visible = false;
        else n++;
      });
    }
  }

  /** Safe weather toast — never throws if UI missing */
  uiWeatherToast(msg) {
    try {
      this.game?.ui?.showMissionToast?.(msg);
    } catch (e) {}
  }

  resize() {
    if (!this.renderer || !this.camera || !this.canvas) return;
    let w = this.canvas.clientWidth || this.canvas.parentElement?.clientWidth || 390;
    let h = this.canvas.clientHeight || this.canvas.parentElement?.clientHeight || 700;
    if (w < 160) w = Math.min(430, window.innerWidth || 390);
    if (h < 160) h = Math.min(900, window.innerHeight || 700);
    this.camera.aspect = w / Math.max(1, h);
    this.camera.updateProjectionMatrix();
    const pr = this._mobile ? 1 : Math.min(window.devicePixelRatio || 1, 1.75);
    this.renderer.setPixelRatio(pr);
    this.renderer.setSize(w, h, false);
  }

  draw() {
    try {
      if (this.canvas && (this.canvas.clientWidth < 32 || this.canvas.clientHeight < 32)) {
        this.resize();
      }
      if (this.renderer && !this.renderer.getContext()) {
        console.error('[KanoRun] WebGL context gone');
        return;
      }
      this.render();
    } catch (e) {
      console.error('3D draw error', e);
      throw e; // surface to main loop counter
    }
  }

  render() {
    if (!this.ready || !this.renderer || !this.scene || !this.camera) return;
    const g = this.game;
    const tod = typeof g.getTimeOfDay === 'function' ? g.getTimeOfDay() : 0.2;
    const spd = g.speed || 3;

    // ——— Day / dusk / night ———
    if (tod > 0.62) {
      // night — keep visible on mobile (not pure black)
      this.renderer.setClearColor(0x0b1224, 1);
      this.scene.fog.color.setHex(0x152238);
      this.scene.fog.near = 14;
      this.scene.fog.far = this._mobile ? 42 : 55;
      this.sun.intensity = this._mobile ? 0.35 : 0.22;
      this.hemlight.intensity = this._mobile ? 0.28 : 0.15;
      if (this.sky) this.sky.material.color.setHex(0x020617);
      if (this.headlightL) this.headlightL.intensity = 2.2;
      if (this.headlightR) this.headlightR.intensity = 2.2;
      // Boost street lamp emissive at night
      if (this.buildings) {
        this.buildings.traverse((ch) => {
          if (ch.isMesh && ch.material && ch.material.emissive && ch.geometry?.type === 'SphereGeometry') {
            ch.material.emissiveIntensity = 1.2;
          }
        });
      }
    } else if (tod > 0.42) {
      // dusk
      this.renderer.setClearColor(0x7c3aed, 1);
      this.scene.fog.color.setHex(0x4c1d95);
      this.scene.fog.near = 16;
      this.scene.fog.far = 60;
      this.sun.intensity = 0.45;
      this.hemlight.intensity = 0.25;
      if (this.sky) this.sky.material.color.setHex(0x5b21b6);
      if (this.headlightL) this.headlightL.intensity = 0.6;
      if (this.headlightR) this.headlightR.intensity = 0.6;
    } else if (tod > 0.28) {
      // afternoon warm
      this.renderer.setClearColor(0x38bdf8, 1);
      this.scene.fog.color.setHex(0x7dd3fc);
      this.scene.fog.near = 18;
      this.scene.fog.far = 68;
      this.sun.intensity = 1.2;
      this.hemlight.intensity = 0.5;
      if (this.sky) this.sky.material.color.setHex(0x38bdf8);
      if (this.headlightL) this.headlightL.intensity = 0;
      if (this.headlightR) this.headlightR.intensity = 0;
    } else {
      // bright morning — tight fog = clear near depth
      this.renderer.setClearColor(0x6ec5f0, 1);
      this.scene.fog.color.setHex(0x8ec8e8);
      this.scene.fog.near = 18;
      this.scene.fog.far = 70;
      this.sun.intensity = 1.35;
      this.hemlight.intensity = 0.55;
      if (this.sky) this.sky.material.color.setHex(0x6ec5f0);
      if (this.headlightL) this.headlightL.intensity = 0;
      if (this.headlightR) this.headlightR.intensity = 0;
    }

    // ——— Weather cycle (clear → harmattan dust → rain) ———
    // STATE.PLAY = 2 (not 1 = INTRO). Never call missing methods.
    if ((g.frame || 0) % 900 === 0 && g.state === 2) {
      const r = Math.random();
      this.weather = r < 0.55 ? 'clear' : r < 0.8 ? 'harmattan' : 'rain';
      try {
        if (this.weather === 'rain') g.ui?.showMissionToast?.('🌧️ Rain in Kano');
        if (this.weather === 'harmattan') g.ui?.showMissionToast?.('🏜️ Harmattan haze');
      } catch (e) {}
    }
    // Apply weather look
    if (this.weather === 'rain') {
      this.rainMat.opacity = 0.55;
      this.dustMat.opacity = 0.08;
      this.scene.fog.near = Math.min(this.scene.fog.near, 25);
      this.sun.intensity *= 0.6;
    } else if (this.weather === 'harmattan') {
      this.rainMat.opacity = 0;
      this.dustMat.opacity = 0.55;
      this.dustMat.color.setHex(0xd4c4a8);
      this.scene.fog.color.lerp(new THREE.Color(0xc4b5a0), 0.35);
      this.sun.intensity *= 0.75;
    } else {
      this.rainMat.opacity = 0;
      this.dustMat.opacity = 0.2 + Math.min(0.25, spd * 0.03);
      this.dustMat.color.setHex(0xc4b5a0);
    }

    // Animate dust / rain
    if (this.dust && !this._mobile) {
      const pos = this.dust.geometry.attributes.position.array;
      for (let i = 0; i < pos.length; i += 3) {
        pos[i + 2] -= spd * 0.08;
        if (pos[i + 2] < 1) {
          pos[i] = (Math.random() - 0.5) * 8;
          pos[i + 1] = Math.random() * 1.2;
          pos[i + 2] = 35 + Math.random() * 15;
        }
      }
      this.dust.geometry.attributes.position.needsUpdate = true;
    }
    if (this.rain && !this._mobile && this.rainMat.opacity > 0.05) {
      const pos = this.rain.geometry.attributes.position.array;
      for (let i = 0; i < pos.length; i += 3) {
        pos[i + 1] -= 0.45;
        pos[i + 2] -= spd * 0.05;
        if (pos[i + 1] < 0) {
          pos[i] = (Math.random() - 0.5) * 14;
          pos[i + 1] = 8 + Math.random() * 6;
          pos[i + 2] = Math.random() * 45;
        }
      }
      this.rain.geometry.attributes.position.needsUpdate = true;
    }

    // Travel — slower so camera can keep up cleanly
    this.travelZ = (this.travelZ || 0) + spd * 0.085;
    const travel = this.travelZ;

    // Highway slope — tip road + camera slightly
    const slope = g.roadSlope || 0;
    if (this.roadMesh) {
      this.roadMesh.rotation.x = -Math.PI / 2 + slope * 0.35;
    }
    if (this.laneMarks) {
      this.laneMarks.rotation.x = slope * 0.35;
    }

    if (this.roadMesh?.material?.map) {
      this.roadMesh.material.map.offset.y = -(travel * 0.05) % 1;
      this.roadMesh.material.map.needsUpdate = true;
    }
    if (this.laneMarks) {
      this.laneMarks.position.z = -(travel * 0.28) % 3.5;
    }
    if (this.buildings) {
      this.buildings.children.forEach((ch) => {
        if (ch.userData.baseZ == null) ch.userData.baseZ = ch.position.z;
        let z = ch.userData.baseZ - (travel % 180);
        while (z < -20) z += 180;
        while (z > 160) z -= 180;
        ch.position.z = z;
      });
    }
    if (this.horizon) {
      this.horizon.position.z = -(travel * 0.06) % 24;
    }

    // Player keke — smooth lateral move (exp) + lean from steering
    if (this.player) {
      const lane = (typeof g.smoothLane === 'number') ? g.smoothLane : (g.playerLane ?? 1);
      const tx = this.laneToX(lane);
      // Exp lateral smooth (matches controls spring, no hard slide)
      const nowP = typeof performance !== 'undefined' ? performance.now() : Date.now();
      const dtP = this._playerLastT ? Math.min(0.05, (nowP - this._playerLastT) / 1000) : 1 / 60;
      this._playerLastT = nowP;
      const aX = 1 - Math.exp(-10 * dtP);
      this.player.position.x += (tx - this.player.position.x) * aX;
      this.player.position.z = PLAYER_Z;

      const dx = tx - this.player.position.x;
      const steer = typeof g.steerBlend === 'number' ? g.steerBlend : (lane - 1);
      // Smooth lean into turn
      // Steering lean + pitch from slope/speed
      const leanZ = THREE.MathUtils.clamp(-steer * 0.16 - dx * 0.04, -0.18, 0.18);
      const leanY = THREE.MathUtils.clamp(steer * 0.09, -0.14, 0.14);
      const slope = (g.roadSlope || 0); // -0.12..0.12
      const pitch = THREE.MathUtils.clamp(-spd * 0.008 + slope, -0.12, 0.1);
      this.player.rotation.z += (leanZ - this.player.rotation.z) * aX;
      this.player.rotation.y += (leanY - this.player.rotation.y) * aX;
      this.player.rotation.x += (pitch - this.player.rotation.x) * 0.12;
      let by = 0;
      if (g.bounce > 0) by = Math.sin(g.bounce * 0.8) * 0.05;
      by += Math.sin((g.frame || 0) * 0.28) * Math.min(0.03, spd * 0.004);
      this.player.position.y = by;
      if (this.anim) {
        this.anim.tick(16);
        // wheel spin only — do not override facing from animatePlayer
        try {
          this.player.traverse((ch) => {
            if (ch.isMesh && ch.geometry?.type === 'CylinderGeometry') {
              ch.rotation.x += spd * 0.4;
            }
          });
        } catch (e) {}
      }
      if ((this.introPhase || 3) < 3) {
        this.camera.position.z = -2.2 + this.introPhase * 0.4;
      }
      if (this.playerShadow) {
        this.playerShadow.position.x = this.player.position.x;
        this.playerShadow.position.z = this.player.position.z;
        this.playerShadow.scale.setScalar(0.9 + Math.abs(this.player.position.y) * 2);
      }
    }
    // Pedestrian bob (subtle — do not sink into ground)
    if (this.anim && this.buildings) this.anim.animatePedestrians(this.buildings, travel);
    if (this.models) this.models.update(0.016);

      // ——— Camera: dt-based exp lerp + spring ———
    const now = (typeof performance !== 'undefined' ? performance.now() : Date.now());
    const rawDt = this._camLastT ? (now - this._camLastT) / 1000 : 1 / 60;
    this._camLastT = now;
    const dt = Math.min(0.05, Math.max(0.008, rawDt)); // clamp 20–125 fps

    // Frame-rate independent exponential smooth: a = 1 - e^(-λ dt)
    const expAlpha = (lambda) => 1 - Math.exp(-lambda * dt);

    // Damped spring toward target (position only — soft arm feel)
    const springTo = (pos, vel, target, stiffness, damping) => {
      // vel' = stiffness * (target - pos) - damping * vel
      vel.x += (stiffness * (target.x - pos.x) - damping * vel.x) * dt;
      vel.y += (stiffness * (target.y - pos.y) - damping * vel.y) * dt;
      vel.z += (stiffness * (target.z - pos.z) - damping * vel.z) * dt;
      pos.x += vel.x * dt;
      pos.y += vel.y * dt;
      pos.z += vel.z * dt;
    };

    let sx = 0, sy = 0;
    if (g.shake > 0) {
      // Decaying offset (not pure random each frame)
      if (!this._shakeOff) this._shakeOff = new THREE.Vector2();
      const mag = Math.min(2, g.shakeMag || 1.5) * 0.01;
      this._shakeOff.x += ((Math.random() - 0.5) * mag - this._shakeOff.x) * 0.4;
      this._shakeOff.y += ((Math.random() - 0.5) * mag * 0.5 - this._shakeOff.y) * 0.4;
      sx = this._shakeOff.x;
      sy = this._shakeOff.y;
    } else if (this._shakeOff) {
      this._shakeOff.x *= 0.85;
      this._shakeOff.y *= 0.85;
      sx = this._shakeOff.x;
      sy = this._shakeOff.y;
    }

    const px = this.player ? this.player.position.x : 0;
    const bob = Math.sin((g.frame || 0) * 0.12) * Math.min(0.035, (spd || 0) * 0.007);
    let mode = this.cameraMode || g.cameraMode || 'chase';
    if (g.cabinCam && mode === 'chase') mode = 'driver';

    let targetPos, targetLook, targetFov;
    let posStiff = 14;
    let posDamp = 9;
    let lookLambda = 5;
    let fovLambda = 4;

    if (mode === 'driver') {
      targetFov = 58;
      targetPos = new THREE.Vector3(px + sx * 0.25, 1.35 + sy * 0.15 + bob * 0.3, PLAYER_Z + 0.5);
      targetLook = new THREE.Vector3(px * 0.1, 1.0, PLAYER_Z + 14);
      posStiff = 22; posDamp = 14; lookLambda = 10; fovLambda = 8;
      if (this.player) this.player.visible = false;
    } else if (mode === 'passenger') {
      targetFov = 55;
      targetPos = new THREE.Vector3(px + 0.3 + sx * 0.15, 1.25 + bob * 0.25, PLAYER_Z - 0.3);
      targetLook = new THREE.Vector3(px * 0.15, 0.9, PLAYER_Z + 12);
      posStiff = 16; posDamp = 11; lookLambda = 7; fovLambda = 6;
      if (this.player) this.player.visible = true;
    } else if (mode === 'road') {
      targetFov = 62;
      targetPos = new THREE.Vector3(px + sx * 0.2, 0.95 + bob * 0.15, PLAYER_Z + 0.9);
      targetLook = new THREE.Vector3(px * 0.08, 0.5, PLAYER_Z + 16);
      posStiff = 18; posDamp = 12; lookLambda = 8; fovLambda = 6;
      if (this.player) this.player.visible = false;
    } else {
      // Chase: soft arm behind keke
      targetFov = 52 + Math.min(2.5, Math.max(0, spd - 2) * 0.35);
      targetPos = new THREE.Vector3(px * 0.4 + sx, 4.2 + sy + bob, -8.5);
      // Look slightly ahead of road based on speed
      targetLook = new THREE.Vector3(px * 0.25, 0.8, PLAYER_Z + 10 + Math.min(4, spd * 0.4));
      posStiff = 12; posDamp = 8; lookLambda = 5; fovLambda = 4;
      if (this.player) this.player.visible = true;
    }

    if (!this.camPos) this.camPos = targetPos.clone();
    if (!this.camLook) this.camLook = targetLook.clone();
    if (!this.camVel) this.camVel = new THREE.Vector3();

    // Position: spring-damper (frame independent)
    springTo(this.camPos, this.camVel, targetPos, posStiff, posDamp);

    // Look-at point: exp lerp (slightly softer than body)
    const aLook = expAlpha(lookLambda);
    this.camLook.lerp(targetLook, aLook);

    // FOV: exp lerp
    const aFov = expAlpha(fovLambda);
    this.camera.fov += (targetFov - this.camera.fov) * aFov;

    this.camera.position.copy(this.camPos);
    this.camera.lookAt(this.camLook);
    this.camera.updateProjectionMatrix();

    const py = g.playerY || 500;
    // Hide all pool meshes first
    for (const mesh of this.vehiclePool) mesh.visible = false;
    const used = {};
    for (const o of g.obs || []) {
      let type = o.type || 'car';
      if (type === 'taxi') type = 'taxi';
      const pool = (this.typedPools && this.typedPools[type] && this.typedPools[type].length)
        ? this.typedPools[type]
        : this.typedPools?.car || this.vehiclePool;
      used[type] = used[type] || 0;
      if (used[type] >= pool.length) continue;
      const mesh = pool[used[type]++];
      mesh.visible = true;
      const z = this.screenYToZ(o.y, py);
      mesh.position.x = this.laneToX(o.lane);
      mesh.position.z = z;
      mesh.position.y = 0;
      // Depth scale: far = smaller (stronger 3D read)
      const depthScale = Math.max(0.45, Math.min(1.15, 1.05 - z * 0.012));
      mesh.scale.setScalar(depthScale);
      mesh.rotation.y = Math.sin((g.frame || 0) * 0.05 + o.y * 0.01) * 0.04;
      mesh.traverse((ch) => {
        if (ch.isMesh) { ch.castShadow = true; ch.receiveShadow = true; }
      });
    }

    let zi = 0;
    const zones = [
      ...(g.paxZones || []).filter((p) => !p.taken).map((p) => ({ ...p, kind: 'p' })),
      ...(g.dropZones || []).filter((d) => !d.used).map((d) => ({ ...d, kind: 'd' }))
    ];
    for (const z of zones) {
      if (zi >= this.zonePool.length) break;
      const mesh = this.zonePool[zi++];
      mesh.visible = true;
      mesh.position.x = this.laneToX(z.lane);
      mesh.position.z = this.screenYToZ(z.y, py);
      // Green = pick · Yellow = drop · Pink = Aishat · Purple = VIP
      const isDrop = z.kind === 'd';
      const col = isDrop ? 0xfbbf24 : z.aishat ? 0xf472b6 : z.vip ? 0xa78bfa : 0x22c55e;
      mesh.children.forEach((ch) => {
        if (ch.userData?.isLabel) return;
        if (ch.material) {
          if (ch.material.color) ch.material.color.setHex(col);
          if (ch.material.emissive) {
            ch.material.emissive.setHex(col);
            ch.material.emissiveIntensity = 0.5 + Math.sin((g.frame || 0) * 0.15) * 0.25;
          }
        }
      });
      // Update floating label text
      if (mesh.userData.label) {
        const txt = isDrop
          ? ('DROP · ' + (z.label || z.name || 'BRAKE'))
          : (z.aishat ? 'AISHAT + HIBBA' : z.vip ? 'VIP PICK' : (z.dest ? 'PICK · ' + z.dest : 'PICK UP'));
        if (mesh.userData._labelText !== txt) {
          mesh.userData._labelText = txt;
          const sp = mesh.userData.label;
          const fresh = this._makeLabelSprite(txt.slice(0, 18), isDrop ? '#fbbf24' : z.aishat ? '#f472b6' : '#4ade80');
          sp.material.map = fresh.material.map;
          sp.material.needsUpdate = true;
        }
        mesh.userData.label.position.y = 2.1 + Math.sin((g.frame || 0) * 0.12) * 0.08;
      }
      const basePad = z.bigPad || z.multi || z.checkpoint ? 1.55 : (z.roadside ? 0.85 : 1);
      const pulse = basePad * (1 + Math.sin((g.frame || 0) * 0.18 + (z.lane || 0)) * 0.12);
      mesh.scale.set(pulse, 1, pulse);
    }
    while (zi < this.zonePool.length) this.zonePool[zi++].visible = false;

    let ci = 0;
    for (const coin of g.coins || []) {
      if (coin.taken || ci >= this.coinPool.length) continue;
      const mesh = this.coinPool[ci++];
      mesh.visible = true;
      mesh.position.x = this.laneToX(coin.lane);
      mesh.position.z = this.screenYToZ(coin.y, py);
      mesh.position.y = 0.55 + Math.sin(coin.bob || 0) * 0.15;
      mesh.rotation.y += 0.1;
      if (mesh.material && mesh.material.color) {
        mesh.material.color.setHex(coin.repair ? 0x3b82f6 : coin.petrol ? 0x22c55e : 0xfbbf24);
      }
    }
    while (ci < this.coinPool.length) this.coinPool[ci++].visible = false;

    // Fuel pads (green)
    let fi = 0;
    for (const fp of g.fuelPads || []) {
      if (fp.taken || fi >= (this.fuelPadPool || []).length) continue;
      const mesh = this.fuelPadPool[fi++];
      mesh.visible = true;
      mesh.position.x = this.laneToX(fp.lane);
      mesh.position.z = this.screenYToZ(fp.y, py);
      mesh.position.y = 0;
      const pulse = 1 + Math.sin((g.frame || 0) * 0.2) * 0.12;
      mesh.scale.setScalar(pulse);
    }
    while (this.fuelPadPool && fi < this.fuelPadPool.length) this.fuelPadPool[fi++].visible = false;

    // Potholes (dark)
    let pi = 0;
    for (const pot of g.potholes || []) {
      if (pot.hit || pi >= (this.potholePool || []).length) continue;
      const mesh = this.potholePool[pi++];
      mesh.visible = true;
      mesh.position.x = this.laneToX(pot.lane);
      mesh.position.z = this.screenYToZ(pot.y, py);
      mesh.position.y = 0;
    }
    while (this.potholePool && pi < this.potholePool.length) this.potholePool[pi++].visible = false;

    this.renderer.render(this.scene, this.camera);
  }
}
