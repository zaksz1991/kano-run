/**
 * Kano Run — ModelManager
 * Loads public/models/*.glb with auto-scale (people not giant)
 * Game Developer: Hassan Zakariya
 */
// Must use same `three` package as GLTFLoader (vendor copy breaks loading)
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

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

// Keke larger than people — people must stay human-scale
const TARGET_HEIGHT = {
  keke: 1.9, car: 1.35, taxi: 1.35, bus: 2.2, truck: 2.0,
  motorcycle: 1.15, police: 1.45, karota: 1.5, pedestrian: 1.05,
  passenger: 1.05, robber: 1.1, bicycle: 0.85, market: 2.0,
  bustop: 1.8, bustation: 2.6
};

export class ModelManager {
  constructor(options = {}) {
    this.baseUrl = options.baseUrl || '/';
    this.cache = new Map();
    this.failed = new Set();
    this.mixers = [];
    this.pools = new Map();
    this.loader = new GLTFLoader();
    this.ready = false;
    this.log = [];
    console.log('[ModelManager] GLTFLoader ready');
  }

  async preload(keys = Object.keys(MODEL_MAP)) {
    await Promise.all(keys.map((k) => this.load(k)));
    this.ready = true;
    console.log('[ModelManager] Loaded:', [...this.cache.keys()].join(', ') || '(none)');
    return this;
  }

  async load(key) {
    if (this.cache.has(key)) return this.cache.get(key);
    if (this.failed.has(key)) return null;
    const path = MODEL_MAP[key] || `models/${key}.glb`;
    const url = this.baseUrl.replace(/\/?$/, '/') + path.replace(/^\//, '');
    try {
      const gltf = await new Promise((resolve, reject) => {
        this.loader.load(url, resolve, undefined, reject);
      });
      const root = gltf.scene;
      root.updateMatrixWorld(true);
      const box = new THREE.Box3().setFromObject(root);
      const size = new THREE.Vector3();
      box.getSize(size);
      const targetH = TARGET_HEIGHT[key] ?? 1.2;
      if (size.y > 0.001) {
        root.scale.multiplyScalar(targetH / size.y);
        root.updateMatrixWorld(true);
        const box2 = new THREE.Box3().setFromObject(root);
        root.position.y -= box2.min.y;
      }
      root.traverse((ch) => {
        if (ch.isMesh) {
          ch.castShadow = true;
          ch.receiveShadow = true;
        }
      });
      this.cache.set(key, { scene: root, animations: gltf.animations || [], gltf });
      console.log('[ModelManager] Loaded', key + '.glb');
      this.log.push(key + ': LOADED');
      return this.cache.get(key);
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
        mixer.clipAction(entry.animations[0]).play();
        root.userData.mixer = mixer;
        this.mixers.push(mixer);
      }
      root.userData.isPlaceholder = false;
    } else {
      root = this.makePlaceholder(key, opts.color);
      root.userData.isPlaceholder = true;
    }
    if (opts.scale != null) root.scale.multiplyScalar(opts.scale);
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

  update(dt = 0.016) {
    for (let i = this.mixers.length - 1; i >= 0; i--) {
      try { this.mixers[i].update(dt); } catch (e) { this.mixers.splice(i, 1); }
    }
  }

  has(key) { return this.cache.has(key); }

  report() {
    return { loaded: [...this.cache.keys()], failed: [...this.failed], log: this.log.slice() };
  }

  makePlaceholder(key, color) {
    const g = new THREE.Group();
    const mat = (c) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.55, metalness: 0.12 });
    const col = color ?? ({
      keke: 0xfbbf24, car: 0xdc2626, taxi: 0xeab308, bus: 0x15803d,
      truck: 0x64748b, police: 0x1e40af, karota: 0xfacc15, motorcycle: 0x475569,
      robber: 0x7f1d1d, pedestrian: 0x3b82f6, passenger: 0x22c55e
    }[key] ?? 0x94a3b8);
    if (key === 'keke' || key === 'robber') {
      const body = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.4, 1.5), mat(col));
      body.position.y = 0.5; g.add(body);
    } else if (key === 'pedestrian' || key === 'passenger') {
      const body = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.5, 0.18), mat(col));
      body.position.y = 0.85; g.add(body);
      const head = new THREE.Mesh(new THREE.SphereGeometry(0.12, 8, 8), mat(0xc4a574));
      head.position.y = 1.2; g.add(head);
    } else {
      const body = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.4, 2.0), mat(col));
      body.position.y = 0.4; g.add(body);
    }
    g.traverse((ch) => { if (ch.isMesh) { ch.castShadow = true; ch.receiveShadow = true; } });
    g.userData.isPlaceholder = true;
    g.userData.modelKey = key;
    return g;
  }
}
