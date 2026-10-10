/**
 * Kano Run — ModelManager
 * GLTF/GLB loading with cache, clone, shadows, AnimationMixer, object pools
 * Placeholders when a model file is missing
 * Game Developer: Hassan Zakariya
 *
 * Expected paths (optional — missing files use placeholders):
 *   public/models/keke.glb
 *   public/models/car.glb
 *   public/models/bus.glb
 *   public/models/taxi.glb
 *   public/models/motorcycle.glb
 *   public/models/truck.glb
 *   public/models/police.glb
 *   public/models/karota.glb
 *   public/models/pedestrian.glb
 *   public/models/passenger.glb
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
  robber: 'models/robber.glb'
};

export class ModelManager {
  constructor(options = {}) {
    this.baseUrl = options.baseUrl || '/';
    this.cache = new Map(); // key -> { scene, animations, gltf }
    this.failed = new Set();
    this.mixers = [];
    this.pools = new Map(); // key -> THREE.Object3D[]
    this.loader = null;
    this.ready = false;
    this._initPromise = null;
  }

  /** Resolve GLTFLoader from vendor or three examples (Vite) */
  async initLoader() {
    if (this.loader) return this.loader;
    const candidates = [
      () => import('../vendor/GLTFLoader.js').then((m) => m.GLTFLoader),
      () => import('three/examples/jsm/loaders/GLTFLoader.js').then((m) => m.GLTFLoader),
      () => import('three/addons/loaders/GLTFLoader.js').then((m) => m.GLTFLoader)
    ];
    for (const tryImport of candidates) {
      try {
        const GLTFLoader = await tryImport();
        if (GLTFLoader) {
          this.loader = new GLTFLoader();
          return this.loader;
        }
      } catch (e) {
        /* try next */
      }
    }
    console.warn('[ModelManager] GLTFLoader not found — placeholders only');
    this.loader = null;
    return null;
  }

  /**
   * Preload a list of model keys (from MODEL_MAP)
   * @param {string[]} keys
   */
  async preload(keys = Object.keys(MODEL_MAP)) {
    await this.initLoader();
    this._initPromise = Promise.all(keys.map((k) => this.load(k).catch(() => null)));
    await this._initPromise;
    this.ready = true;
    return this;
  }

  /**
   * Load (or return cached) glTF by logical key
   * @param {string} key
   * @returns {Promise<{scene: THREE.Object3D, animations: THREE.AnimationClip[], gltf: object}|null>}
   */
  async load(key) {
    if (this.cache.has(key)) return this.cache.get(key);
    if (this.failed.has(key)) return null;

    await this.initLoader();
    if (!this.loader) {
      this.failed.add(key);
      return null;
    }

    const path = MODEL_MAP[key] || `models/${key}.glb`;
    const url = this.baseUrl.replace(/\/?$/, '/') + path.replace(/^\//, '');

    try {
      const gltf = await new Promise((resolve, reject) => {
        this.loader.load(url, resolve, undefined, reject);
      });
      const entry = {
        scene: gltf.scene,
        animations: gltf.animations || [],
        gltf
      };
      // Enable shadows on all meshes
      gltf.scene.traverse((ch) => {
        if (ch.isMesh) {
          ch.castShadow = true;
          ch.receiveShadow = true;
          if (ch.material) {
            ch.material.side = THREE.FrontSide;
          }
        }
      });
      this.cache.set(key, entry);
      return entry;
    } catch (err) {
      console.warn('[ModelManager] missing or failed:', url, err?.message || err);
      this.failed.add(key);
      return null;
    }
  }

  /**
   * Clone a loaded model (or placeholder). Attaches AnimationMixer if clips exist.
   * @param {string} key
   * @param {{scale?: number, color?: number, anim?: string}} [opts]
   * @returns {THREE.Object3D}
   */
  getInstance(key, opts = {}) {
    const entry = this.cache.get(key);
    let root;
    if (entry && entry.scene) {
      root = entry.scene.clone(true);
      // Re-bind materials so clones don't share mutation unexpectedly
      root.traverse((ch) => {
        if (ch.isMesh) {
          ch.castShadow = true;
          ch.receiveShadow = true;
          if (ch.material) {
            ch.material = ch.material.clone();
            if (opts.color != null && ch.material.color) {
              ch.material.color.setHex(opts.color);
            }
          }
        }
      });
      if (entry.animations && entry.animations.length) {
        const mixer = new THREE.AnimationMixer(root);
        const clip =
          (opts.anim && entry.animations.find((a) => a.name === opts.anim)) ||
          entry.animations[0];
        if (clip) {
          const action = mixer.clipAction(clip);
          action.play();
        }
        root.userData.mixer = mixer;
        this.mixers.push(mixer);
      }
    } else {
      root = this.makePlaceholder(key, opts.color);
    }

    const s = opts.scale != null ? opts.scale : 1;
    if (s !== 1) root.scale.setScalar(s);
    root.userData.modelKey = key;
    root.userData.isPlaceholder = !entry;
    return root;
  }

  /**
   * Object pool: acquire instance
   * @param {string} key
   * @param {object} [opts]
   */
  acquire(key, opts = {}) {
    if (!this.pools.has(key)) this.pools.set(key, []);
    const pool = this.pools.get(key);
    let obj = pool.pop();
    if (!obj) obj = this.getInstance(key, opts);
    obj.visible = true;
    return obj;
  }

  /**
   * Return instance to pool
   * @param {THREE.Object3D} obj
   */
  release(obj) {
    if (!obj) return;
    obj.visible = false;
    if (obj.parent) obj.parent.remove(obj);
    const key = obj.userData.modelKey || 'misc';
    if (!this.pools.has(key)) this.pools.set(key, []);
    this.pools.get(key).push(obj);
  }

  /** Tick all animation mixers */
  update(dtSec) {
    const dt = dtSec || 0.016;
    for (let i = this.mixers.length - 1; i >= 0; i--) {
      const m = this.mixers[i];
      try {
        m.update(dt);
      } catch (e) {
        this.mixers.splice(i, 1);
      }
    }
  }

  has(key) {
    return this.cache.has(key);
  }

  isPlaceholderOnly(key) {
    return this.failed.has(key) || !this.cache.has(key);
  }

  /** Procedural placeholder when GLB missing */
  makePlaceholder(key, color) {
    const g = new THREE.Group();
    const mat = (c, opts = {}) =>
      new THREE.MeshStandardMaterial({
        color: c,
        roughness: opts.roughness ?? 0.55,
        metalness: opts.metalness ?? 0.15
      });

    const col =
      color != null
        ? color
        : {
            keke: 0xfbbf24,
            car: 0xdc2626,
            taxi: 0xeab308,
            bus: 0x15803d,
            truck: 0x64748b,
            police: 0x1e40af,
            karota: 0xfacc15,
            motorcycle: 0x475569,
            robber: 0x7f1d1d,
            pedestrian: 0x3b82f6,
            passenger: 0x22c55e
          }[key] || 0x94a3b8;

    if (key === 'keke') {
      const body = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.45, 1.6), mat(col));
      body.position.y = 0.55;
      g.add(body);
      const roof = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.35, 0.9), mat(0x0f172a));
      roof.position.set(0, 0.95, -0.15);
      g.add(roof);
      for (const [x, z] of [
        [-0.45, -0.45],
        [0.45, -0.45],
        [0, 0.65]
      ]) {
        const w = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 0.14, 10), mat(0x1e293b));
        w.rotation.z = Math.PI / 2;
        w.position.set(x, 0.22, z);
        g.add(w);
      }
    } else if (key === 'karota') {
      const shirt = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.5, 0.25), mat(0xfacc15));
      shirt.position.y = 0.75;
      g.add(shirt);
      const pants = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.45, 0.2), mat(0x0f172a));
      pants.position.y = 0.3;
      g.add(pants);
      const head = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.22, 0.22), mat(0xc4a574));
      head.position.y = 1.12;
      g.add(head);
      const stick = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.85, 6), mat(0x78350f));
      stick.position.set(0.35, 0.9, 0.1);
      stick.rotation.z = 0.4;
      g.add(stick);
    } else if (key === 'pedestrian' || key === 'passenger') {
      const body = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.55, 0.2), mat(col));
      body.position.y = 0.9;
      g.add(body);
      const head = new THREE.Mesh(new THREE.SphereGeometry(0.14, 8, 8), mat(0xc4a574));
      head.position.y = 1.3;
      g.add(head);
    } else if (key === 'motorcycle') {
      const frame = new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.2, 0.9), mat(col));
      frame.position.y = 0.4;
      g.add(frame);
    } else {
      // Generic vehicle box
      const body = new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.45, 2.2), mat(col));
      body.position.y = 0.45;
      g.add(body);
      const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.4, 1.0), mat(0x1e293b));
      cabin.position.set(0, 0.85, -0.2);
      g.add(cabin);
    }

    g.traverse((ch) => {
      if (ch.isMesh) {
        ch.castShadow = true;
        ch.receiveShadow = true;
      }
    });
    g.userData.isPlaceholder = true;
    g.userData.modelKey = key;
    return g;
  }

  /** Dispose cached GPU resources (optional, on teardown) */
  dispose() {
    this.mixers.length = 0;
    this.pools.clear();
    this.cache.forEach((entry) => {
      entry.scene?.traverse((ch) => {
        if (ch.isMesh) {
          ch.geometry?.dispose?.();
          if (ch.material) {
            if (Array.isArray(ch.material)) ch.material.forEach((m) => m.dispose?.());
            else ch.material.dispose?.();
          }
        }
      });
    });
    this.cache.clear();
  }
}

/** Singleton helper */
let _shared = null;
export function getModelManager(opts) {
  if (!_shared) _shared = new ModelManager(opts);
  return _shared;
}
