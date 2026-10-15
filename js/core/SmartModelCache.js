import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import * as THREE from "three";

/**
 * Shared GLB cache + clone pool (Phase 6).
 * Load once, reuse clones to avoid GC spikes on mobile.
 */
class SmartModelCache {
  constructor() {
    this.loader = new GLTFLoader();
    this.cache = new Map();
    this.failed = new Set();
    this.inflight = new Map();
    this.pools = new Map(); // path -> THREE.Object3D[]
    this.lowPower = false;
    this.maxPoolPerPath = 12;
  }

  setLowPower(on) {
    this.lowPower = Boolean(on);
  }

  encode(path) {
    return encodeURI(path);
  }

  has(path) {
    return this.cache.has(path);
  }

  load(path) {
    if (this.failed.has(path)) return Promise.resolve(null);
    if (this.cache.has(path)) return Promise.resolve(this.cache.get(path));
    if (this.inflight.has(path)) return this.inflight.get(path);

    const p = new Promise((resolve) => {
      this.loader.load(
        this.encode(path),
        (gltf) => {
          const entry = { scene: gltf.scene, animations: gltf.animations || [] };
          // Freeze materials lightly
          entry.scene.traverse((c) => {
            if (c.isMesh) {
              c.castShadow = !this.lowPower;
              c.receiveShadow = !this.lowPower;
              if (c.material) {
                const mats = Array.isArray(c.material) ? c.material : [c.material];
                for (const m of mats) {
                  if (m) {
                    m.precision = this.lowPower ? "lowp" : "mediump";
                  }
                }
              }
            }
          });
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

  clone(path, targetHeight = 0) {
    const pool = this.pools.get(path);
    if (pool && pool.length) {
      const root = pool.pop();
      root.visible = true;
      if (targetHeight > 0) this._fitHeight(root, targetHeight);
      return root;
    }
    const entry = this.cache.get(path);
    if (!entry) return null;
    const root = entry.scene.clone(true);
    root.traverse((c) => {
      if (c.isMesh) {
        c.castShadow = !this.lowPower;
        c.receiveShadow = !this.lowPower;
      }
    });
    if (targetHeight > 0) this._fitHeight(root, targetHeight);
    return root;
  }

  release(path, object) {
    if (!path || !object) return;
    object.visible = false;
    if (object.parent) object.parent.remove(object);
    let pool = this.pools.get(path);
    if (!pool) {
      pool = [];
      this.pools.set(path, pool);
    }
    if (pool.length < this.maxPoolPerPath) {
      pool.push(object);
    } else {
      object.traverse((c) => {
        if (c.geometry) c.geometry.dispose?.();
      });
    }
  }

  _fitHeight(root, targetHeight) {
    const box = new THREE.Box3().setFromObject(root);
    const size = box.getSize(new THREE.Vector3());
    if (size.y > 0.01) root.scale.setScalar(targetHeight / size.y);
    const box2 = new THREE.Box3().setFromObject(root);
    root.position.y -= box2.min.y;
  }

  async warm(paths, onOne) {
    const list = paths.filter(Boolean);
    await Promise.all(
      list.map(async (path) => {
        const e = await this.load(path);
        onOne?.(path, Boolean(e));
      }),
    );
  }

  warmBackground(paths, concurrency = 2) {
    const q = paths.filter((p) => p && !this.cache.has(p) && !this.failed.has(p));
    let i = 0;
    const run = async () => {
      while (i < q.length) {
        const path = q[i++];
        await this.load(path);
      }
    };
    const workers = [];
    for (let w = 0; w < Math.max(1, concurrency); w++) workers.push(run());
    return Promise.all(workers);
  }

  dispose() {
    for (const pool of this.pools.values()) {
      for (const o of pool) {
        o.traverse((c) => {
          if (c.geometry) c.geometry.dispose?.();
        });
      }
    }
    this.pools.clear();
    this.cache.clear();
    this.failed.clear();
    this.inflight.clear();
  }
}

export const modelCache = new SmartModelCache();
export default SmartModelCache;
