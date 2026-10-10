/**
 * Kano Run — ModelManager (GLB Integration Pass)
 * Game Developer: Hassan Zakariya
 */
import * as THREE from '../vendor/three.module.js';

const MODEL_MAP = {
  keke: 'models/keke.glb',
  car: 'models/car.glb',
  bus: 'models/bus.glb',
  taxi: 'models/taxi.glb',
  motorcycle: 'models/motorcycle.glb',
  truck: 'models/truck.glb',
  police: 'models/police.glb',
  karota: 'models/karota.glb',
  pedestrian: 'models/pedestrian.glb',
  passenger: 'models/passenger.glb',
  robber: 'models/robber.glb',
  bicycle: 'models/bicycle.glb',
  market: 'models/market.glb',
  bustop: 'models/bustop.glb',
  bustation: 'models/bustation.glb'
};

const DEFAULT_SCALE = {
  keke: 1, car: 1, taxi: 1, bus: 0.85, truck: 0.9, motorcycle: 1,
  police: 1, karota: 1.1, pedestrian: 1, passenger: 1, robber: 1,
  bicycle: 1, market: 1, bustop: 1, bustation: 0.8
};

export class ModelManager {
  constructor(options = {}) {
    this.baseUrl = options.baseUrl || '/';
    this.cache = new Map();
    this.failed = new Set();
    this.mixers = [];
    this.pools = new Map();
    this.loader = null;
    this.ready = false;
    this.log = [];
  }

  async initLoader() {
    if (this.loader) return this.loader;
    const candidates = [
      () => import('three/examples/jsm/loaders/GLTFLoader.js').then((m) => m.GLTFLoader),
      () => import('three/addons/loaders/GLTFLoader.js').then((m) => m.GLTFLoader),
      () => import('../vendor/GLTFLoader.js').then((m) => m.GLTFLoader)
    ];
    for (const tryImport of candidates) {
      try {
        const GLTFLoader = await tryImport();
        if (GLTFLoader) {
          this.loader = new GLTFLoader();
          console.log('[ModelManager] GLTFLoader OK');
          this.log.push('GLTFLoader: OK');
          return this.loader;
        }
      } catch (e) { /* next */ }
    }
    console.warn('[ModelManager] GLTFLoader NOT FOUND — placeholders only');
    this.log.push('GLTFLoader: FAILED');
    this.loader = null;
    return null;
  }

  async preload(keys = Object.keys(MODEL_MAP)) {
    await this.initLoader();
    await Promise.all(keys.map((k) => this.load(k)));
    this.ready = true;
    console.log('[ModelManager] Preload done. Loaded:', [...this.cache.keys()].join(', ') || '(none)');
    if (this.failed.size) console.warn('[ModelManager] Failed:', [...this.failed].join(', '));
    return this;
  }

  async load(key) {
    if (this.cache.has(key)) return this.cache.get(key);
    if (this.failed.has(key)) return null;
    await this.initLoader();
    if (!this.loader) {
      this.failed.add(key);
      this.log.push(key + ': no loader');
      return null;
    }
    const path = MODEL_MAP[key] || `models/${key}.glb`;
    const url = this.baseUrl.replace(/\/?$/, '/') + path.replace(/^\//, '');
    try {
      const gltf = await new Promise((resolve, reject) => {
        this.loader.load(url, resolve, undefined, reject);
      });
      gltf.scene.traverse((ch) => {
        if (ch.isMesh) {
          ch.castShadow = true;
          ch.receiveShadow = true;
        }
      });
      const box = new THREE.Box3().setFromObject(gltf.scene);
      if (box.min.y !== 0) gltf.scene.position.y -= box.min.y;
      const entry = { scene: gltf.scene, animations: gltf.animations || [], gltf };
      this.cache.set(key, entry);
      console.log('[ModelManager] Loaded', key + '.glb');
      this.log.push(key + ': LOADED');
      return entry;
    } catch (err) {
      console.warn('[ModelManager] FAIL', url, err?.message || err);
      this.failed.add(key);
      this.log.push(key + ': FAIL');
      return null;
    }
  }

  getInstance(key, opts = {}) {
    const entry = this.cache.get(key);
    let root;
    if (entry && entry.scene) {
      root = entry.scene.clone(true);
      root.traverse((ch) => {
        if (ch.isMesh) {
          ch.castShadow = true;
          ch.receiveShadow = true;
          if (ch.material) ch.material = ch.material.clone();
        }
      });
      if (entry.animations?.length) {
        const mixer = new THREE.AnimationMixer(root);
        const clip = entry.animations[0];
        if (clip) mixer.clipAction(clip).play();
        root.userData.mixer = mixer;
        this.mixers.push(mixer);
      }
      root.userData.isPlaceholder = false;
    } else {
      root = this.makePlaceholder(key, opts.color);
      root.userData.isPlaceholder = true;
    }
    const s = opts.scale != null ? opts.scale : (DEFAULT_SCALE[key] ?? 1);
    root.scale.setScalar(s);
    root.userData.modelKey = key;
    return root;
  }

  acquire(key, opts = {}) {
    if (!this.pools.has(key)) this.pools.set(key, []);
    const pool = this.pools.get(key);
    let obj = pool.pop();
    if (!obj) obj = this.getInstance(key, opts);
    obj.visible = true;
    return obj;
  }

  release(obj) {
    if (!obj) return;
    obj.visible = false;
    if (obj.parent) obj.parent.remove(obj);
    const key = obj.userData.modelKey || 'misc';
    if (!this.pools.has(key)) this.pools.set(key, []);
    this.pools.get(key).push(obj);
  }

  update(dtSec = 0.016) {
    for (let i = this.mixers.length - 1; i >= 0; i--) {
      try { this.mixers[i].update(dtSec); } catch (e) { this.mixers.splice(i, 1); }
    }
  }

  has(key) { return this.cache.has(key); }

  report() {
    return {
      loader: this.loader ? 'OK' : 'MISSING',
      loaded: [...this.cache.keys()],
      failed: [...this.failed],
      log: this.log.slice()
    };
  }

  makePlaceholder(key, color) {
    const g = new THREE.Group();
    const mat = (c) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.55, metalness: 0.15 });
    const col = color ?? ({
      keke: 0xfbbf24, car: 0xdc2626, taxi: 0xeab308, bus: 0x15803d, truck: 0x64748b,
      police: 0x1e40af, karota: 0xfacc15, motorcycle: 0x475569, robber: 0x7f1d1d,
      pedestrian: 0x3b82f6, passenger: 0x22c55e
    }[key] ?? 0x94a3b8);
    if (key === 'keke' || key === 'robber') {
      const body = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.45, 1.6), mat(col));
      body.position.y = 0.55; g.add(body);
    } else if (key === 'karota') {
      const shirt = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.5, 0.25), mat(0xfacc15));
      shirt.position.y = 0.75; g.add(shirt);
    } else if (key === 'pedestrian' || key === 'passenger') {
      const body = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.55, 0.2), mat(col));
      body.position.y = 0.9; g.add(body);
    } else {
      const body = new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.45, 2.2), mat(col));
      body.position.y = 0.45; g.add(body);
    }
    g.traverse((ch) => { if (ch.isMesh) { ch.castShadow = true; ch.receiveShadow = true; } });
    g.userData.isPlaceholder = true;
    g.userData.modelKey = key;
    return g;
  }
}

let _shared = null;
export function getModelManager(opts) {
  if (!_shared) _shared = new ModelManager(opts);
  return _shared;
}
