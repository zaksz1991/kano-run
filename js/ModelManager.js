/**
 * Kano Life — ModelManager
 * Paths match live repo: public/assets/models/...
 * Game Developer: Hassan Zakariya
 */
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

/** Primary + fallbacks (spaces encoded at load time) */
const MODEL_MAP = {
  keke: [
    'assets/models/keke/keke-3.glb',
    'assets/models/keke/keke-1.glb',
    'assets/models/keke/keke-2.glb',
  ],
  car: [
    'assets/models/car-kit/sedan.glb',
    'assets/models/cars-bundle/Car.glb',
  ],
  taxi: [
    'assets/models/car-kit/taxi.glb',
    'assets/models/cars-bundle/Taxi.glb',
  ],
  bus: ['assets/models/city-pack/Bus.glb'],
  motorcycle: ['assets/models/city-pack/Motorcycle.glb'],
  truck: [
    'assets/models/car-kit/truck.glb',
    'assets/models/car-kit/truck-flat.glb',
  ],
  police: [
    'assets/models/car-kit/police.glb',
    'assets/models/cars-bundle/Police Car.glb',
  ],
  karota: [
    'assets/models/keke/keke-4.glb',
    'assets/models/car-kit/police.glb',
  ],
  pedestrian: [
    'assets/models/pedestrian-passengers/pedestrian.glb',
    'assets/models/pedestrian-passengers/Man.glb',
  ],
  passenger: [
    'assets/models/pedestrian-passengers/passenger.glb',
    'assets/models/pedestrian-passengers/hijab_muslim_woman.glb',
    'assets/models/pedestrian-passengers/Man in Suit.glb',
  ],
  robber: ['assets/models/keke/keke-6.glb'],
  bicycle: ['assets/models/city-pack/Bicycle.glb'],
  market: ['assets/models/city-pack/Pizza Corner.glb'],
  bustop: [
    'assets/models/city-pack/Bus Stop.glb',
    'assets/models/city-pack/Bus stop sign.glb',
  ],
  bustation: ['assets/models/city-pack/Bus Stop.glb'],
  suv: ['assets/models/car-kit/suv.glb'],
  van: ['assets/models/car-kit/van.glb'],
  building: [
    'assets/models/city-kit-suburban/building-type-a.glb',
    'assets/models/city-kit-suburban/building-type-b.glb',
    'assets/models/city-pack/Big Building.glb',
  ],
};

const TARGET_HEIGHT = {
  keke: 1.9, car: 1.35, taxi: 1.35, bus: 2.2, truck: 2.0,
  motorcycle: 1.15, police: 1.45, karota: 1.5, pedestrian: 1.7,
  passenger: 1.7, robber: 1.1, bicycle: 0.85, market: 2.0,
  bustop: 1.8, bustation: 2.6, suv: 1.6, van: 1.7, building: 4.5
};

function encodePath(path) {
  return path.split('/').map((seg) => encodeURIComponent(seg)).join('/');
}

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
    console.log('[ModelManager] paths → /assets/models/…');
  }

  async preload(keys = Object.keys(MODEL_MAP)) {
    await Promise.all(keys.map((k) => this.load(k)));
    this.ready = true;
    console.log('[ModelManager] Loaded:', [...this.cache.keys()].join(', ') || '(none)');
    console.log('[ModelManager] Failed:', [...this.failed].join(', ') || '(none)');
    return this;
  }

  pathsFor(key) {
    const v = MODEL_MAP[key];
    if (!v) return [`assets/models/${key}.glb`];
    return Array.isArray(v) ? v : [v];
  }

  async load(key) {
    if (this.cache.has(key)) return this.cache.get(key);
    if (this.failed.has(key)) return null;

    const paths = this.pathsFor(key);
    for (const path of paths) {
      const url = this.baseUrl.replace(/\/?$/, '/') + encodePath(path).replace(/^\//, '');
      try {
        const gltf = await new Promise((resolve, reject) => {
          this.loader.load(url, resolve, undefined, reject);
        });
        const root = gltf.scene || gltf.scenes?.[0];
        if (!root) throw new Error('empty gltf');
        root.updateMatrixWorld(true);
        const box = new THREE.Box3().setFromObject(root);
        const size = new THREE.Vector3();
        box.getSize(size);
        const targetH = TARGET_HEIGHT[key] ?? 1.2;
        if (size.y > 0.001) {
          root.scale.multiplyScalar(targetH / size.y);
          root.updateMatrixWorld(true);
          const box2 = new THREE.Box3().setFromObject(root);
          const min = box2.min;
          root.position.y -= min.y; // sit on ground
        }
        root.traverse((ch) => {
          if (ch.isMesh) {
            ch.castShadow = true;
            ch.receiveShadow = true;
            if (ch.material) {
              ch.material.side = THREE.FrontSide;
            }
          }
        });
        const entry = {
          scene: root,
          animations: gltf.animations || [],
          url
        };
        this.cache.set(key, entry);
        this.log.push({ key, ok: true, url });
        console.log('[ModelManager] OK', key, url);
        return entry;
      } catch (err) {
        this.log.push({ key, ok: false, url, err: String(err?.message || err) });
        console.warn('[ModelManager] try fail', url, err?.message || err);
      }
    }
    this.failed.add(key);
    return null;
  }

  getInstance(key, opts = {}) {
    const entry = this.cache.get(key);
    let root;
    if (entry?.scene) {
      root = entry.scene.clone(true);
      root.userData.isPlaceholder = false;
      if (entry.animations?.length) {
        const mixer = new THREE.AnimationMixer(root);
        mixer.clipAction(entry.animations[0]).play();
        root.userData.mixer = mixer;
        this.mixers.push(mixer);
      }
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
      try { this.mixers[i].update(dt); } catch { this.mixers.splice(i, 1); }
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
      robber: 0x7f1d1d, pedestrian: 0x3b82f6, passenger: 0x22c55e, building: 0x334155
    }[key] ?? 0x94a3b8);
    if (key === 'keke' || key === 'robber' || key === 'karota') {
      const body = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.45, 1.5), mat(col));
      body.position.y = 0.55; g.add(body);
      const roof = new THREE.Mesh(new THREE.BoxGeometry(1.05, 0.08, 1.2), mat(0x1e293b));
      roof.position.y = 1.15; g.add(roof);
    } else if (key === 'pedestrian' || key === 'passenger') {
      const body = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.7, 0.22), mat(col));
      body.position.y = 0.95; g.add(body);
      const head = new THREE.Mesh(new THREE.SphereGeometry(0.14, 10, 10), mat(0xc4a574));
      head.position.y = 1.45; g.add(head);
    } else if (key === 'building') {
      const body = new THREE.Mesh(new THREE.BoxGeometry(2.2, 3.5, 2.0), mat(col));
      body.position.y = 1.75; g.add(body);
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
