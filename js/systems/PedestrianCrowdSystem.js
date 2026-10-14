import * as THREE from "three";
import { modelCache } from "../core/SmartModelCache.js";
import { MODEL_PATHS } from "../core/AssetCatalog.js";

/**
 * Busy sidewalks — walking pedestrians (market feel).
 */
export default class PedestrianCrowdSystem {
  constructor({ scene, eventBus = null, config = {} } = {}) {
    if (!scene) throw new Error("PedestrianCrowdSystem requires scene");
    this.scene = scene;
    this.eventBus = eventBus;
    this.config = {
      maxWalkers: 18,
      sideOffset: 9.5,
      spawnAhead: 100,
      ...config,
    };
    this.walkers = [];
    this.enabled = false;
    this._clock = 0;
    this._nextZ = 30;
    this._disposers = [];
    this._subscribe("game:started", () => {
      this.enabled = true;
    });
    this._subscribe("game:stopped", () => {
      this.enabled = false;
      this.clear();
    });
  }

  async initialize() {
    const paths = MODEL_PATHS?.passengersBoot || [
      "/assets/models/pedestrian-passengers/passenger.glb",
      "/assets/models/pedestrian-passengers/Man.glb",
      "/assets/models/pedestrian-passengers/hijab_muslim_woman.glb",
    ];
    if (modelCache?.warm) await modelCache.warm(paths);
    return this;
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
      this._nextZ += 8 + Math.random() * 14;
    }

    for (let i = this.walkers.length - 1; i >= 0; i--) {
      const w = this.walkers[i];
      w.z += w.speed * dt * w.dir;
      w.group.position.z = w.z;
      // walk bob
      w.group.position.y = Math.abs(Math.sin(this._clock * 6 + w.phase)) * 0.06;
      if (w.z < z - 40 || w.z > z + this.config.spawnAhead + 40) {
        this.scene.remove(w.group);
        this.walkers.splice(i, 1);
      }
    }
  }

  _spawn(z) {
    const side = Math.random() < 0.5 ? -1 : 1;
    const group = new THREE.Group();
    group.position.set(
      side * (this.config.sideOffset + Math.random() * 2.5),
      0,
      z,
    );
    const paths = [
      ...(MODEL_PATHS?.passengersBoot || []),
      ...((MODEL_PATHS?.passengersMore || []).filter((p) => modelCache?.has?.(p))),
    ];
    const path = paths[Math.floor(Math.random() * Math.max(1, paths.length))];
    let model = path && modelCache?.clone ? modelCache.clone(path, 1.6) : null;
    if (!model) {
      model = new THREE.Group();
      const body = new THREE.Mesh(
        new THREE.CapsuleGeometry(0.22, 0.5, 3, 6),
        new THREE.MeshStandardMaterial({
          color: [0x1e3a5f, 0x166534, 0x7c2d12, 0xf8fafc, 0x4c1d95][
            Math.floor(Math.random() * 5)
          ],
          flatShading: true,
        }),
      );
      body.position.y = 0.85;
      model.add(body);
      const head = new THREE.Mesh(
        new THREE.SphereGeometry(0.15, 6, 6),
        new THREE.MeshStandardMaterial({ color: 0x8d5524, flatShading: true }),
      );
      head.position.y = 1.35;
      model.add(head);
    }
    // Face walk direction along Z
    const dir = Math.random() < 0.5 ? 1 : -1;
    model.rotation.y = dir > 0 ? 0 : Math.PI;
    group.add(model);
    this.scene.add(group);
    this.walkers.push({
      group,
      z,
      speed: 1.2 + Math.random() * 1.4,
      dir,
      phase: Math.random() * 6,
    });
  }

  clear() {
    for (const w of this.walkers) this.scene.remove(w.group);
    this.walkers = [];
  }

  _subscribe(name, h) {
    if (!this.eventBus?.on) return;
    const u = this.eventBus.on(name, h);
    if (typeof u === "function") this._disposers.push(u);
  }

  dispose() {
    this.clear();
    for (const u of this._disposers) {
      try {
        u();
      } catch {}
    }
  }
}
