import * as THREE from "three";
import { modelCache } from "../core/SmartModelCache.js";
import { MODEL_PATHS } from "../core/AssetCatalog.js";

/**
 * Realistic scenery using curated GLBs.
 * - initialize() only warms a SMALL set (fast)
 * - segments spawn clones from cache
 * - more models stream in background after start
 */
export default class ScenerySystem {
  constructor({ scene, eventBus = null, config = {} } = {}) {
    if (!scene) throw new Error("ScenerySystem requires a scene.");
    this.scene = scene;
    this.eventBus = eventBus;
    this.config = {
      segmentLength: 48,
      segmentsAhead: 10,
      segmentsBehind: 2,
      buildingDensity: 0.92,
      propDensity: 0.75,
      sideOffset: 15,
      ...config,
    };
    this.segments = [];
    this.segmentPool = [];
    this.lowPower = false;
    this.initialized = false;
    this.currentTheme = "market";
    this.disposers = [];
    this._mat = {
      road: new THREE.MeshStandardMaterial({ color: 0x2a2e33, roughness: 0.95 }),
      dirt: new THREE.MeshStandardMaterial({ color: 0x3f4a36, roughness: 1 }),
    };
    this._geo = {
      road: new THREE.PlaneGeometry(11, this.config.segmentLength),
      dirt: new THREE.PlaneGeometry(40, this.config.segmentLength),
    };

    this._subscribe("performance:quality", (p) => {
      this.lowPower = Boolean(p?.lowPower || p?.tier === "low");
      if (this.lowPower) {
        this.config.segmentsAhead = 6;
        this.config.segmentsBehind = 1;
        this.config.buildingDensity = 0.55;
        this.config.propDensity = 0.4;
      }
    });
    this._subscribe("game:started", () => {
      // Background: expand variety without blocking
      modelCache.warmBackground(
        [...MODEL_PATHS.buildingsMore, ...MODEL_PATHS.propsMore],
        2,
      );
      this.reset(0);
    });
    this._subscribe("game:stopped", () => this.clear());
    this._subscribe("scenery:theme", (p) => {
      this.currentTheme = p?.theme || "city";
    });
  }

  async initialize() {
    // ONLY boot set — not entire city-kit
    const boot = [
      ...MODEL_PATHS.buildingsBoot.slice(0, 6),
      ...MODEL_PATHS.propsBoot.slice(0, 4),
    ];
    await modelCache.warm(boot, (path, ok) => {
      if (!ok) console.warn("[Scenery] miss", path);
    });
    this.initialized = true;
    this.reset(0);
    console.info(
      `[ScenerySystem] Ready with ${boot.length} curated GLBs (more stream after start).`,
    );
    return this;
  }

  update(_dt, playerZ = 0) {
    if (!this.initialized) return;
    const z = Number(playerZ) || 0;
    this._recycle(z);
    this._ensureAhead(z);
  }

  reset(playerZ = 0) {
    this.clear();
    this._ensureAhead(playerZ);
  }

  clear() {
    for (const s of this.segments) this.scene.remove(s.group);
    this.segments = [];
    this.segmentPool = [];
    this.lowPower = false;
  }

  _buildingPaths() {
    const boot = MODEL_PATHS.buildingsBoot;
    const more = MODEL_PATHS.buildingsMore.filter((p) => modelCache.has(p));
    if (this.currentTheme === "industrial") {
      return [
        ...boot,
        ...more.filter((p) => p.includes("industrial")),
      ];
    }
    return [...boot, ...more];
  }

  _propPaths() {
    return [
      ...MODEL_PATHS.propsBoot,
      ...MODEL_PATHS.propsMore.filter((p) => modelCache.has(p)),
    ];
  }

  _recycle(playerZ) {
    const minZ = playerZ - this.config.segmentLength * this.config.segmentsBehind;
    this.segments = this.segments.filter((s) => {
      if (s.z + this.config.segmentLength < minZ) {
        this.scene.remove(s.group);
        return false;
      }
      return true;
    });
  }

  _ensureAhead(playerZ) {
    const maxZ = playerZ + this.config.segmentLength * this.config.segmentsAhead;
    let far = this.segments.reduce(
      (m, s) => Math.max(m, s.z),
      playerZ - this.config.segmentLength,
    );
    while (far < maxZ) {
      far += this.config.segmentLength;
      this._spawn(far);
    }
  }

  _spawn(z) {
    const group = new THREE.Group();
    group.position.z = z;

    const road = new THREE.Mesh(this._geo.road, this._mat.road);
    road.rotation.x = -Math.PI / 2;
    road.position.y = 0.01;
    road.receiveShadow = true;
    group.add(road);

    const dirt = new THREE.Mesh(this._geo.dirt, this._mat.dirt);
    dirt.rotation.x = -Math.PI / 2;
    dirt.position.y = -0.02;
    dirt.receiveShadow = true;
    group.add(dirt);

    const buildings = this._buildingPaths();
    const slots = 5;
    for (let i = 0; i < slots; i++) {
      const lz =
        -this.config.segmentLength / 2 +
        (i + 0.5) * (this.config.segmentLength / slots);
      for (const side of [-1, 1]) {
        if (Math.random() > this.config.buildingDensity) continue;
        const path = buildings[Math.floor(Math.random() * buildings.length)];
        const inst = modelCache.clone(path, 6 + Math.random() * 5);
        if (inst) {
          inst.position.set(
            side * (this.config.sideOffset + Math.random() * 2),
            0,
            lz,
          );
          inst.rotation.y = side < 0 ? 0 : Math.PI;
          group.add(inst);
        }
      }
    }

    const props = this._propPaths();
    const propCount = 2 + Math.floor(Math.random() * 3);
    for (let i = 0; i < propCount; i++) {
      if (Math.random() > this.config.propDensity) continue;
      const path = props[Math.floor(Math.random() * props.length)];
      const h = path.includes("Tree") || path.includes("tree") ? 4 : 2.2;
      const inst = modelCache.clone(path, h);
      if (!inst) continue;
      const side = Math.random() > 0.5 ? 1 : -1;
      inst.position.set(
        side * (9 + Math.random() * 4),
        0,
        (Math.random() - 0.5) * this.config.segmentLength * 0.85,
      );
      inst.rotation.y = Math.random() * Math.PI * 2;
      group.add(inst);
    }

    this.scene.add(group);
    this.segments.push({ z, group });
  }

  _subscribe(name, handler) {
    if (!this.eventBus?.on) return;
    const u = this.eventBus.on(name, handler);
    if (typeof u === "function") this.disposers.push(u);
  }

  dispose() {
    this.clear();
    for (const d of this.disposers) {
      try {
        d();
      } catch {}
    }
    this.disposers = [];
  }
}
