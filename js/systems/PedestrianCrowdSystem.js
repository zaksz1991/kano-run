import * as THREE from "three";
import { modelCache } from "../core/SmartModelCache.js";
import { MODEL_PATHS } from "../core/AssetCatalog.js";

/**
 * Phase 6 — pooled / instanced sidewalk crowd for mobile FPS.
 */
export default class PedestrianCrowdSystem {
  constructor({ scene, eventBus = null, config = {} } = {}) {
    if (!scene) throw new Error("PedestrianCrowdSystem requires scene");
    this.scene = scene;
    this.eventBus = eventBus;
    this.config = {
      maxWalkers: 16,
      sideOffset: 9.5,
      spawnAhead: 90,
      ...config,
    };
    this.walkers = [];
    this.pool = [];
    this.enabled = false;
    this.lowPower = false;
    this._clock = 0;
    this._nextZ = 30;
    this._disposers = [];
    this._dummy = new THREE.Object3D();
    this._instanced = null;
    this._instanceCount = 0;

    this._subscribe("game:started", () => {
      this.enabled = true;
    });
    this._subscribe("game:stopped", () => {
      this.enabled = false;
      this.clear();
    });
    this._subscribe("performance:quality", (p) => {
      this.lowPower = Boolean(p?.lowPower || p?.tier === "low");
      this.config.maxWalkers = this.lowPower ? 10 : 16;
      if (this._instanced) {
        this._instanced.castShadow = !this.lowPower;
      }
    });
  }

  async initialize() {
    const paths = MODEL_PATHS?.passengersBoot || [];
    if (modelCache?.warm) await modelCache.warm(paths.slice(0, 2));
    this._buildInstancedFallback();
    return this;
  }

  _buildInstancedFallback() {
    if (this._instanced) return;
    const geo = new THREE.CapsuleGeometry(0.2, 0.45, 2, 4);
    const mat = new THREE.MeshStandardMaterial({
      color: 0x1e3a5f,
      flatShading: true,
      roughness: 0.9,
    });
    const mesh = new THREE.InstancedMesh(geo, mat, 48);
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    mesh.castShadow = false;
    mesh.receiveShadow = false;
    mesh.count = 0;
    mesh.frustumCulled = true;
    this.scene.add(mesh);
    this._instanced = mesh;
  }

  update(dt = 0, playerZ = 0) {
    if (!this.enabled) return;
    this._clock += Math.min(dt, 0.1);
    const z = Number(playerZ) || 0;

    while (
      this.walkers.length < this.config.maxWalkers &&
      this._nextZ < z + this.config.spawnAhead
    ) {
      this._spawn(this._nextZ);
      this._nextZ += 6 + Math.random() * 12;
    }

    let instIdx = 0;
    for (let i = this.walkers.length - 1; i >= 0; i--) {
      const w = this.walkers[i];
      w.z += w.speed * dt * w.dir;
      const bob = Math.abs(Math.sin(this._clock * 6 + w.phase)) * 0.05;
      if (w.group) {
        w.group.position.z = w.z;
        w.group.position.y = bob;
      } else if (w.instanceId != null && this._instanced) {
        this._dummy.position.set(w.x, 0.85 + bob, w.z);
        this._dummy.rotation.y = w.dir > 0 ? 0 : Math.PI;
        this._dummy.updateMatrix();
        this._instanced.setMatrixAt(w.instanceId, this._dummy.matrix);
        instIdx = Math.max(instIdx, w.instanceId + 1);
      }
      if (w.z < z - 35 || w.z > z + this.config.spawnAhead + 35) {
        this._recycle(i);
      }
    }
    if (this._instanced) {
      this._instanced.count = Math.max(instIdx, this._countInstances());
      this._instanced.instanceMatrix.needsUpdate = true;
    }
  }

  _countInstances() {
    let n = 0;
    for (const w of this.walkers) if (w.instanceId != null) n++;
    return n;
  }

  _spawn(z) {
    const side = Math.random() < 0.5 ? -1 : 1;
    const x = side * (this.config.sideOffset + Math.random() * 2.2);
    const dir = Math.random() < 0.5 ? 1 : -1;
    const paths = (MODEL_PATHS?.passengersBoot || []).filter((p) =>
      modelCache?.has?.(p),
    );
    // Prefer instanced on low power or when no GLB
    const useGlb = !this.lowPower && paths.length && Math.random() > 0.45;
    if (useGlb) {
      const path = paths[Math.floor(Math.random() * paths.length)];
      let group = this.pool.pop() || null;
      if (!group) {
        const model = modelCache.clone(path, 1.55);
        if (!model) return this._spawnInstance(x, z, dir);
        group = model;
        group.userData.poolPath = path;
      }
      group.position.set(x, 0, z);
      group.rotation.y = dir > 0 ? 0 : Math.PI;
      group.visible = true;
      this.scene.add(group);
      this.walkers.push({
        group,
        z,
        x,
        speed: 1.1 + Math.random() * 1.3,
        dir,
        phase: Math.random() * 6,
      });
      return;
    }
    this._spawnInstance(x, z, dir);
  }

  _spawnInstance(x, z, dir) {
    if (!this._instanced) this._buildInstancedFallback();
    const instanceId = this.walkers.filter((w) => w.instanceId != null).length;
    if (instanceId >= 48) return;
    this._dummy.position.set(x, 0.85, z);
    this._dummy.rotation.y = dir > 0 ? 0 : Math.PI;
    this._dummy.updateMatrix();
    this._instanced.setMatrixAt(instanceId, this._dummy.matrix);
    this._instanced.count = instanceId + 1;
    this._instanced.instanceMatrix.needsUpdate = true;
    this.walkers.push({
      instanceId,
      z,
      x,

      speed: 1.1 + Math.random() * 1.3,
      dir,
      phase: Math.random() * 6,
    });
  }

  _recycle(index) {
    const w = this.walkers[index];
    if (w.group) {
      const path = w.group.userData?.poolPath;
      if (path && modelCache?.release) modelCache.release(path, w.group);
      else {
        this.scene.remove(w.group);
        if (this.pool.length < 8) this.pool.push(w.group);
      }
    }
    this.walkers.splice(index, 1);
  }

  clear() {
    while (this.walkers.length) this._recycle(0);
    if (this._instanced) this._instanced.count = 0;
  }

  _subscribe(name, h) {
    if (!this.eventBus?.on) return;
    const u = this.eventBus.on(name, h);
    if (typeof u === "function") this._disposers.push(u);
  }

  dispose() {
    this.clear();
    if (this._instanced) {
      this.scene.remove(this._instanced);
      this._instanced.geometry?.dispose?.();
      this._instanced.material?.dispose?.();
      this._instanced = null;
    }
    for (const u of this._disposers) {
      try {
        u();
      } catch {}
    }
  }
}
