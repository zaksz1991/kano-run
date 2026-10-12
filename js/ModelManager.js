/**
 * Kano Run — ModelManager
 * GLB loading, auto-scaling, reusable model pools, and animation cleanup.
 * Game Developer: Hassan Zakariya
 */

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
  bustation: 'models/bustation.glb',
};

const TARGET_HEIGHT = {
  keke: 1.9,
  car: 1.35,
  taxi: 1.35,
  bus: 2.2,
  truck: 2.0,
  motorcycle: 1.15,
  police: 1.45,
  karota: 1.5,
  pedestrian: 1.05,
  passenger: 1.05,
  robber: 1.1,
  bicycle: 0.85,
  market: 2.0,
  bustop: 1.8,
  bustation: 2.6,
};

const PLACEHOLDER_COLORS = {
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
  passenger: 0x22c55e,
};

export class ModelManager {
  constructor(options = {}) {
    this.baseUrl = options.baseUrl || '/';

    this.cache = new Map();
    this.failed = new Set();
    this.mixers = [];
    this.pools = new Map();
    this.log = [];

    this.loader = new GLTFLoader();
    this.ready = false;

    console.log('[ModelManager] GLTFLoader ready');
  }

  getUrl(path) {
    const base = this.baseUrl.endsWith('/')
      ? this.baseUrl
      : `${this.baseUrl}/`;

    return `${base}${path.replace(/^\/+/, '')}`;
  }

  async preload(keys = Object.keys(MODEL_MAP)) {
    await Promise.all(keys.map((key) => this.load(key)));

    this.ready = true;

    console.log(
      '[ModelManager] Loaded:',
      [...this.cache.keys()].join(', ') || '(none)'
    );

    return this;
  }

  async load(key) {
    if (this.cache.has(key)) {
      return this.cache.get(key);
    }

    if (this.failed.has(key)) {
      return null;
    }

    const path = MODEL_MAP[key] || `models/${key}.glb`;
    const url = this.getUrl(path);

    try {
      const gltf = await new Promise((resolve, reject) => {
        this.loader.load(url, resolve, undefined, reject);
      });

      const root = gltf.scene;

      if (!root) {
        throw new Error('GLB file contains no scene');
      }

      root.updateMatrixWorld(true);

      const bounds = new THREE.Box3().setFromObject(root);
      const size = new THREE.Vector3();

      bounds.getSize(size);

      const targetHeight = TARGET_HEIGHT[key] ?? 1.2;

      if (size.y > 0.001) {
        const scaleFactor = targetHeight / size.y;

        root.scale.multiplyScalar(scaleFactor);
        root.updateMatrixWorld(true);

        const scaledBounds = new THREE.Box3().setFromObject(root);

        root.position.y -= scaledBounds.min.y;
        root.updateMatrixWorld(true);
      }

      root.traverse((child) => {
        if (!child.isMesh) return;

        child.castShadow = true;
        child.receiveShadow = true;
      });

      const entry = {
        scene: root,
        animations: gltf.animations || [],
        gltf,
      };

      this.cache.set(key, entry);
      this.log.push(`${key}: LOADED`);

      console.log('[ModelManager] Loaded', `${key}.glb`);

      return entry;
    } catch (error) {
      this.failed.add(key);
      this.log.push(`${key}: FAIL`);

      console.warn(
        '[ModelManager] Failed to load',
        url,
        error?.message || error
      );

      return null;
    }
  }

  getInstance(key, opts = {}) {
    const entry = this.cache.get(key);
    let root;

    if (entry?.scene) {
      root = entry.scene.clone(true);

      root.traverse((child) => {
        if (!child.isMesh) return;

        child.castShadow = true;
        child.receiveShadow = true;

        if (Array.isArray(child.material)) {
          child.material = child.material.map((material) =>
            material.clone()
          );
        } else if (child.material) {
          child.material = child.material.clone();
        }
      });

      if (entry.animations.length > 0) {
        const mixer = new THREE.AnimationMixer(root);
        const action = mixer.clipAction(entry.animations[0]);

        action.play();

        root.userData.mixer = mixer;
        root.userData.animationAction = action;

        this.mixers.push(mixer);
      }

      root.userData.isPlaceholder = false;
    } else {
      root = this.makePlaceholder(key, opts.color);
      root.userData.isPlaceholder = true;
    }

    root.userData.modelKey = key;
    root.userData.baseScale = root.scale.clone();

    this.applyOptions(root, opts);

    return root;
  }

  applyOptions(obj, opts = {}) {
    if (!obj) return obj;

    const baseScale = obj.userData.baseScale;

    if (baseScale && opts.scale != null) {
      const scale = Number(opts.scale);

      if (Number.isFinite(scale) && scale > 0) {
        obj.scale.set(
          baseScale.x * scale,
          baseScale.y * scale,
          baseScale.z * scale
        );
      }
    } else if (baseScale) {
      obj.scale.copy(baseScale);
    }

    if (opts.color != null) {
      const color = new THREE.Color(opts.color);

      obj.traverse((child) => {
        if (!child.isMesh || !child.material) return;

        const materials = Array.isArray(child.material)
          ? child.material
          : [child.material];

        for (const material of materials) {
          if (material.color) {
            material.color.copy(color);
          }
        }
      });
    }

    if (opts.position) {
      obj.position.set(
        opts.position.x ?? 0,
        opts.position.y ?? 0,
        opts.position.z ?? 0
      );
    }

    if (opts.rotation) {
      obj.rotation.set(
        opts.rotation.x ?? 0,
        opts.rotation.y ?? 0,
        opts.rotation.z ?? 0
      );
    }

    if (opts.visible != null) {
      obj.visible = Boolean(opts.visible);
    }

    return obj;
  }

  acquire(key, opts = {}) {
    if (!this.pools.has(key)) {
      this.pools.set(key, []);
    }

    const pool = this.pools.get(key);
    let obj = pool.pop();

    if (!obj) {
      obj = this.getInstance(key, opts);
    } else {
      this.resetInstance(obj);
      this.applyOptions(obj, opts);
    }

    obj.visible = true;
    obj.userData.modelKey = key;

    return obj;
  }

  release(obj) {
    if (!obj) return;

    const key = obj.userData.modelKey || 'misc';

    obj.visible = false;

    if (obj.parent) {
      obj.parent.remove(obj);
    }

    this.resetInstance(obj);

    if (!this.pools.has(key)) {
      this.pools.set(key, []);
    }

    this.pools.get(key).push(obj);
  }

  resetInstance(obj) {
    if (!obj) return;

    const mixer = obj.userData.mixer;

    if (mixer) {
      mixer.stopAllAction();
      mixer.uncacheRoot(obj);

      this.mixers = this.mixers.filter(
        (existingMixer) => existingMixer !== mixer
      );

      delete obj.userData.mixer;
      delete obj.userData.animationAction;
    }

    obj.position.set(0, 0, 0);
    obj.rotation.set(0, 0, 0);
    obj.visible = true;

    if (obj.userData.baseScale) {
      obj.scale.copy(obj.userData.baseScale);
    } else {
      obj.scale.set(1, 1, 1);
    }

    obj.traverse((child) => {
      if (child.userData.originalPosition) {
        child.position.copy(child.userData.originalPosition);
      }

      if (child.userData.originalRotation) {
        child.rotation.copy(child.userData.originalRotation);
      }
    });
  }

  update(dt = 0.016) {
    const delta = Number.isFinite(dt)
      ? Math.max(0, Math.min(dt, 0.1))
      : 0.016;

    for (let i = this.mixers.length - 1; i >= 0; i--) {
      const mixer = this.mixers[i];

      try {
        mixer.update(delta);
      } catch (error) {
        console.warn('[ModelManager] Animation update failed', error);

        mixer.stopAllAction();
        mixer.uncacheRoot(mixer.getRoot());

        this.mixers.splice(i, 1);
      }
    }
  }

  has(key) {
    return this.cache.has(key);
  }

  report() {
    return {
      ready: this.ready,
      loaded: [...this.cache.keys()],
      failed: [...this.failed],
      pooled: [...this.pools.entries()].reduce(
        (result, [key, pool]) => {
          result[key] = pool.length;
          return result;
        },
        {}
      ),
      activeMixers: this.mixers.length,
      log: this.log.slice(),
    };
  }

  makePlaceholder(key, color) {
    const group = new THREE.Group();

    const material = (value) =>
      new THREE.MeshStandardMaterial({
        color: value,
        roughness: 0.55,
        metalness: 0.12,
      });

    const chosenColor =
      color ?? PLACEHOLDER_COLORS[key] ?? 0x94a3b8;

    const addMesh = (geometry, mat, position) => {
      const mesh = new THREE.Mesh(geometry, mat);

      mesh.position.set(position.x, position.y, position.z);
      mesh.castShadow = true;
      mesh.receiveShadow = true;

      group.add(mesh);

      return mesh;
    };

    if (key === 'keke') {
      addMesh(
        new THREE.BoxGeometry(1.0, 0.55, 1.5),
        material(chosenColor),
        { x: 0, y: 0.65, z: 0 }
      );

      addMesh(
        new THREE.BoxGeometry(0.82, 0.55, 0.72),
        material(0x334155),
        { x: 0, y: 1.12, z: -0.05 }
      );
    } else if (key === 'robber') {
      addMesh(
        new THREE.BoxGeometry(0.35, 0.75, 0.25),
        material(chosenColor),
        { x: 0, y: 0.55, z: 0 }
      );

      addMesh(
        new THREE.SphereGeometry(0.15, 10, 8),
        material(0x9a7653),
        { x: 0, y: 1.05, z: 0 }
      );
    } else if (key === 'pedestrian' || key === 'passenger') {
      addMesh(
        new THREE.BoxGeometry(0.28, 0.5, 0.18),
        material(chosenColor),
        { x: 0, y: 0.75, z: 0 }
      );

      addMesh(
        new THREE.SphereGeometry(0.12, 10, 8),
        material(0xc4a574),
        { x: 0, y: 1.1, z: 0 }
      );
    } else if (key === 'motorcycle' || key === 'bicycle') {
      const wheelMaterial = material(0x202020);

      addMesh(
        new THREE.CylinderGeometry(0.28, 0.28, 0.12, 12),
        wheelMaterial,
        { x: 0, y: 0.3, z: -0.55 }
      );

      addMesh(
        new THREE.CylinderGeometry(0.28, 0.28, 0.12, 12),
        wheelMaterial,
        { x: 0, y: 0.3, z: 0.55 }
      );

      addMesh(
        new THREE.BoxGeometry(0.25, 0.25, 0.85),
        material(chosenColor),
        { x: 0, y: 0.65, z: 0 }
      );
    } else {
      const dimensions = {
        bus: [1.65, 1.65, 3.8],
        truck: [1.6, 1.35, 3.6],
        police: [1.2, 0.65, 2.0],
        karota: [1.2, 0.8, 2.0],
        taxi: [1.2, 0.7, 2.0],
        market: [1.8, 1.5, 1.5],
        bustop: [2.0, 1.6, 0.8],
        bustation: [3.0, 2.2, 2.0],
      };

      const [width, height, length] = dimensions[key] ?? [1.2, 0.8, 2.0];

      addMesh(
        new THREE.BoxGeometry(width, height, length),
        material(chosenColor),
        { x: 0, y: height / 2, z: 0 }
      );

      if (['car', 'taxi', 'police', 'karota'].includes(key)) {
        addMesh(
          new THREE.BoxGeometry(width * 0.72, height * 0.55, length * 0.4),
          material(0x334155),
          { x: 0, y: height * 0.9, z: 0 }
        );
      }
    }

    group.userData.isPlaceholder = true;
    group.userData.modelKey = key;
    group.userData.baseScale = group.scale.clone();

    return group;
  }
}