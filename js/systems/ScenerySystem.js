import * as THREE from "three";
import { modelCache } from "../core/SmartModelCache.js";
import { MODEL_PATHS } from "../core/AssetCatalog.js";

/**
 * Kano roadside scenery — denser markets, bus stops, dusty shoulders.
 * Uses curated GLBs + lightweight procedural stalls for market stretches.
 */
export default class ScenerySystem {
  constructor({ scene, eventBus = null, config = {} } = {}) {
    if (!scene) throw new Error("ScenerySystem requires a scene.");
    this.scene = scene;
    this.eventBus = eventBus;
    this.config = {
      segmentLength: 42,
      segmentsAhead: 12,
      segmentsBehind: 2,
      buildingDensity: 0.95,
      propDensity: 0.88,
      sideOffset: 14,
      marketEvery: 3,
      ...config,
    };
    this.segments = [];
    this.segmentPool = [];
    this.lowPower = false;
    this.initialized = false;
    this.currentTheme = "city";
    this.disposers = [];
    this._segIndex = 0;
    this._mat = {
      road: new THREE.MeshStandardMaterial({ color: 0x2a2e33, roughness: 0.95 }),
      dirt: new THREE.MeshStandardMaterial({ color: 0x5c4a32, roughness: 1 }),
      stall: new THREE.MeshStandardMaterial({ color: 0xc4a574, flatShading: true }),
      cloth: new THREE.MeshStandardMaterial({ color: 0xd97706, flatShading: true }),
      canopy: new THREE.MeshStandardMaterial({ color: 0x0ea5e9, flatShading: true }),
    };
    this._geo = {
      road: new THREE.PlaneGeometry(11, this.config.segmentLength),
      dirt: new THREE.PlaneGeometry(48, this.config.segmentLength),
      stall: new THREE.BoxGeometry(2.2, 1.1, 1.6),
      canopy: new THREE.BoxGeometry(2.6, 0.08, 2.0),
    };

    this._subscribe("performance:quality", (p) => {
      this.lowPower = Boolean(p?.lowPower || p?.tier === "low");
      if (this.lowPower) {
        this.config.segmentsAhead = 7;
        this.config.segmentsBehind = 1;
        this.config.buildingDensity = 0.6;
        this.config.propDensity = 0.5;
        this.config.marketEvery = 4;
      } else if (p?.tier === "high") {
        this.config.segmentsAhead = 14;
        this.config.buildingDensity = 1;
        this.config.propDensity = 0.95;
      }
    });
    this._subscribe("game:started", () => {
      modelCache.warmBackground?.(
        [...(MODEL_PATHS.buildingsMore || []), ...(MODEL_PATHS.propsMore || [])],
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
    const boot = [
      ...(MODEL_PATHS.buildingsBoot || []).slice(0, 6),
      ...(MODEL_PATHS.propsBoot || []).slice(0, 5),
    ];
    if (modelCache?.warm) {
      await modelCache.warm(boot, (path, ok) => {
        if (!ok) console.warn("[Scenery] miss", path);
      });
    }
    this.initialized = true;
    this.reset(0);
    console.info(
      `[ScenerySystem] Ready with ${boot.length} curated GLBs (markets + props).`,
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
    this._segIndex = 0;
    this._ensureAhead(playerZ);
  }

  clear() {
    for (const s of this.segments) {
      this.scene.remove(s.group);
    }
    this.segments = [];
  }

  _recycle(playerZ) {
    const behind = playerZ - this.config.segmentsBehind * this.config.segmentLength;
    this.segments = this.segments.filter((s) => {
      if (s.z + this.config.segmentLength < behind) {
        this.scene.remove(s.group);
        return false;
      }
      return true;
    });
  }

  _ensureAhead(playerZ) {
    const far =
      playerZ + this.config.segmentsAhead * this.config.segmentLength;
    let maxZ = this.segments.reduce(
      (m, s) => Math.max(m, s.z),
      playerZ - this.config.segmentLength,
    );
    while (maxZ < far) {
      maxZ += this.config.segmentLength;
      this._spawnSegment(maxZ);
    }
  }

  _spawnSegment(z) {
    if (this.segments.some((s) => Math.abs(s.z - z) < 1)) return;

    const group = new THREE.Group();
    group.position.z = z;
    this._segIndex += 1;
    const isMarket =
      this._segIndex % Math.max(2, this.config.marketEvery) === 0 ||
      this.currentTheme === "market";

    // Dirt shoulders
    const dirt = new THREE.Mesh(this._geo.dirt, this._mat.dirt);
    dirt.rotation.x = -Math.PI / 2;
    dirt.position.y = -0.02;
    dirt.receiveShadow = true;
    group.add(dirt);

    // Buildings both sides
    const buildings = [
      ...(MODEL_PATHS.buildingsBoot || []),
      ...((MODEL_PATHS.buildingsMore || []).filter((p) => modelCache?.has?.(p))),
    ];
    const props = [
      ...(MODEL_PATHS.propsBoot || []),
      ...((MODEL_PATHS.propsMore || []).filter((p) => modelCache?.has?.(p))),
    ];

    const buildCount = this.lowPower ? 2 : isMarket ? 4 : 3;
    for (let side of [-1, 1]) {
      for (let i = 0; i < buildCount; i++) {
        if (Math.random() > this.config.buildingDensity) continue;
        if (!buildings.length) break;
        const path = buildings[Math.floor(Math.random() * buildings.length)];
        const inst = modelCache?.clone?.(path, 8 + Math.random() * 6);
        if (!inst) continue;
        const lateral = side * (this.config.sideOffset + Math.random() * 6);
        inst.position.set(
          lateral,
          0,
          (Math.random() - 0.5) * this.config.segmentLength * 0.8,
        );
        inst.rotation.y =
          side > 0 ? -Math.PI / 2 + (Math.random() - 0.5) * 0.2 : Math.PI / 2;
        group.add(inst);
      }
    }

    // Props: trees, lights, bus stops
    const propCount = this.lowPower ? 3 : isMarket ? 8 : 5;
    for (let i = 0; i < propCount; i++) {
      if (Math.random() > this.config.propDensity || !props.length) continue;
      const path = props[Math.floor(Math.random() * props.length)];
      const h =
        path.includes("Tree") || path.includes("tree")
          ? 4
          : path.includes("Bus")
            ? 2.8
            : 2.2;
      const inst = modelCache?.clone?.(path, h);
      if (!inst) continue;
      const side = Math.random() > 0.5 ? 1 : -1;
      inst.position.set(
        side * (8.5 + Math.random() * 5),
        0,
        (Math.random() - 0.5) * this.config.segmentLength * 0.85,
      );
      inst.rotation.y = Math.random() * Math.PI * 2;
      group.add(inst);
    }

    // Market stretch: procedural stalls + canopy (always visible, no GLB required)
    if (isMarket) {
      const stalls = this.lowPower ? 3 : 6;
      for (let i = 0; i < stalls; i++) {
        const side = i % 2 === 0 ? -1 : 1;
        const stall = new THREE.Group();
        const box = new THREE.Mesh(this._geo.stall, this._mat.stall.clone());
        box.material.color.offsetHSL(Math.random() * 0.1, 0, (Math.random() - 0.5) * 0.1);
        box.position.y = 0.55;
        const roof = new THREE.Mesh(
          this._geo.canopy,
          Math.random() > 0.5 ? this._mat.canopy : this._mat.cloth,
        );
        roof.position.y = 1.35;
        stall.add(box, roof);
        stall.position.set(
          side * (7.2 + Math.random() * 1.5),
          0,
          (i - stalls / 2) * 5.5 + (Math.random() - 0.5) * 2,
        );
        group.add(stall);
      }
      this.eventBus?.emit?.("scenery:market", { z, density: stalls });
      this.eventBus?.emit?.("crowd:boost", { z, radius: 40, count: 12 });
    }

    // Occasional bus stop marker
    if (this._segIndex % 5 === 0) {
      this.eventBus?.emit?.("busstop:spawned", { z, side: Math.random() > 0.5 ? 1 : -1 });
    }

    this.scene.add(group);
    this.segments.push({ z, group, isMarket });
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
