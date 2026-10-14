import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import * as THREE from "three";

/**
 * Shared GLB cache — load each path once, clone for instances.
 * Critical for realistic look without re-downloading every spawn.
 */
class SmartModelCache {
  constructor() {
    this.loader = new GLTFLoader();
    this.cache = new Map(); // path -> { scene, animations }
    this.failed = new Set();
    this.inflight = new Map();
  }

  encode(path) {
    return encodeURI(path);
  }

  has(path) {
    return this.cache.has(path);
  }

  /**
   * Load once; concurrent callers share the same promise.
   */
  load(path) {
    if (this.failed.has(path)) return Promise.resolve(null);
    if (this.cache.has(path)) return Promise.resolve(this.cache.get(path));
    if (this.inflight.has(path)) return this.inflight.get(path);

    const p = new Promise((resolve) => {
      this.loader.load(
        this.encode(path),
        (gltf) => {
          const entry = { scene: gltf.scene, animations: gltf.animations || [] };
          this.cache.set(path, entry);
          this.inflight.delete(path);
          resolve(entry);
        },
        undefined,
        () => {
          this.failed.add(path);
          this.inflight.delete(path);
          resolve(null);
        },
      );
    });
    this.inflight.set(path, p);
    return p;
  }

  /**
   * Clone a cached model, scaled to target height (meters).
   */
  clone(path, targetHeight = 0) {
    const entry = this.cache.get(path);
    if (!entry) return null;
    const root = entry.scene.clone(true);
    if (targetHeight > 0) {
      const box = new THREE.Box3().setFromObject(root);
      const size = box.getSize(new THREE.Vector3());
      if (size.y > 0.01) root.scale.setScalar(targetHeight / size.y);
      const box2 = new THREE.Box3().setFromObject(root);
      root.position.y -= box2.min.y;
    }
    root.traverse((c) => {
      if (c.isMesh) {
        c.castShadow = true;
        c.receiveShadow = true;
      }
    });
    return root;
  }

  /**
   * Warm a short priority list (does not block game start if you don't await all).
   */
  async warm(paths, onOne) {
    const list = paths.filter(Boolean);
    await Promise.all(
      list.map(async (path) => {
        const e = await this.load(path);
        onOne?.(path, Boolean(e));
      }),
    );
  }

  /** Background queue — loads after start without blocking */
  warmBackground(paths, concurrency = 2) {
    const q = paths.filter((p) => p && !this.cache.has(p) && !this.failed.has(p));
    let i = 0;
    const run = async () => {
      while (i < q.length) {
        const path = q[i++];
        await this.load(path);
      }
    };
    const workers = Array.from({ length: concurrency }, () => run());
    return Promise.all(workers);
  }
}

export const modelCache = new SmartModelCache();
export default modelCache;
