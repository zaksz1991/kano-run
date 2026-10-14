import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import {
  MODEL_PATHS,
  modelUrl,
  buildingsForTheme,
  propsForTheme,
} from "../core/AssetCatalog.js";

/**
 * Dense Kano roadside using YOUR real GLBs from public/assets/models.
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
      buildingDensity: 0.85,
      propDensity: 0.7,
      sideOffset: 16,
      ...config,
    };

    this.loader = new GLTFLoader();
    this.cache = new Map();
    this.failed = new Set();
    this.segments = [];
    this.currentTheme = "city";
    this.initialized = false;
    this._anchorZ = 0;
    this.disposers = [];
    this.sharedGeometries = new Map();
    this.sharedMaterials = new Map();

    this._subscribe("game:started", () => this.reset(0));
    this._subscribe("game:stopped", () => this.clear());
    this._subscribe("scenery:theme", (p) => {
      this.currentTheme = p?.theme || "city";
    });
    this._subscribe("world:districtChanged", (p) => {
      const d = String(p?.district || p?.theme || "").toLowerCase();
      if (d.includes("industrial") || d.includes("sharada") || d.includes("bompai")) {
        this.currentTheme = "industrial";
      } else if (d.includes("sabon") || d.includes("market") || d.includes("kurmi")) {
        this.currentTheme = "market";
      } else {
        this.currentTheme = "city";
      }
    });
  }

  async initialize() {
    // Warm a few common assets (non-blocking full set)
    const warm = [
      ...buildingsForTheme("city").slice(0, 4),
      ...propsForTheme().slice(0, 4),
    ];
    await Promise.allSettled(warm.map((p) => this._load(p)));
    this.initialized = true;
    this.reset(0);
    return this;
  }

  update(deltaTime, playerZ = 0) {
    if (!this.initialized) return;
    const z = Number(playerZ) || 0;
    this._recycle(z);
    this._ensureAhead(z);
  }

  reset(playerZ = 0) {
    this.clear();
    this._anchorZ = playerZ;
    this._ensureAhead(playerZ);
  }

  clear() {
    for (const seg of this.segments) {
      this.scene.remove(seg.group);
    }
    this.segments = [];
  }

  _recycle(playerZ) {
    const minZ = playerZ - this.config.segmentLength * this.config.segmentsBehind;
    this.segments = this.segments.filter((seg) => {
      if (seg.z + this.config.segmentLength < minZ) {
        this.scene.remove(seg.group);
        return false;
      }
      return true;
    });
  }

  _ensureAhead(playerZ) {
    const maxZ = playerZ + this.config.segmentLength * this.config.segmentsAhead;
    let farthest = this.segments.reduce(
      (m, s) => Math.max(m, s.z),
      playerZ - this.config.segmentLength,
    );
    while (farthest < maxZ) {
      farthest += this.config.segmentLength;
      this._spawnSegment(farthest);
    }
  }

  _spawnSegment(z) {
    const group = new THREE.Group();
    group.name = `scenery-${z}`;
    group.position.z = z;

    // Ground strip
    const ground = new THREE.Mesh(
      this._geo("ground", () => new THREE.PlaneGeometry(40, this.config.segmentLength)),
      this._mat("ground", 0x3d4a3a),
    );
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -0.02;
    ground.receiveShadow = true;
    group.add(ground);

    // Road surface
    const road = new THREE.Mesh(
      this._geo("road", () => new THREE.PlaneGeometry(11, this.config.segmentLength)),
      this._mat("road", 0x2a2e33),
    );
    road.rotation.x = -Math.PI / 2;
    road.position.y = 0.01;
    road.receiveShadow = true;
    group.add(road);

    const props = [];
    this._placeBuildings(group, props);
    this._placeProps(group, props);

    this.scene.add(group);
    this.segments.push({ z, group, props });
  }

  _placeBuildings(group, props) {
    const paths = buildingsForTheme(this.currentTheme);
    if (!paths.length) return;
    const slots = 5;
    const len = this.config.segmentLength;
    for (let i = 0; i < slots; i++) {
      const localZ = -len / 2 + (i + 0.5) * (len / slots);
      for (const side of [-1, 1]) {
        if (Math.random() > this.config.buildingDensity) continue;
        const path = paths[Math.floor(Math.random() * paths.length)];
        const inst = this._instance(path, 8 + Math.random() * 6);
        if (!inst) {
          this._boxBuilding(group, props, side, localZ);
          continue;
        }
        inst.position.set(
          side * (this.config.sideOffset + Math.random() * 3),
          0,
          localZ,
        );
        inst.rotation.y = side < 0 ? 0.1 : Math.PI - 0.1;
        group.add(inst);
        props.push({ type: "building", mesh: inst });
      }
    }
  }

  _placeProps(group, propsList) {
    const paths = propsForTheme(this.currentTheme);
    const count = 3 + Math.floor(Math.random() * 4);
    for (let i = 0; i < count; i++) {
      if (Math.random() > this.config.propDensity) continue;
      const path = paths[Math.floor(Math.random() * paths.length)];
      const inst = this._instance(path, 2 + Math.random() * 3);
      if (!inst) continue;
      const side = Math.random() > 0.5 ? 1 : -1;
      inst.position.set(
        side * (10 + Math.random() * 5),
        0,
        (Math.random() - 0.5) * this.config.segmentLength * 0.9,
      );
      inst.rotation.y = Math.random() * Math.PI * 2;
      group.add(inst);
      propsList.push({ type: "prop", mesh: inst });
    }
  }

  _boxBuilding(group, props, side, z) {
    const h = 4 + Math.random() * 8;
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(6, h, 6),
      this._mat("bldg", 0xc4b59a),
    );
    mesh.position.set(side * this.config.sideOffset, h / 2, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
    props.push({ type: "building", mesh });
  }

  _instance(path, targetHeight = 5) {
    const gltf = this.cache.get(path);
    if (!gltf) {
      this._load(path);
      return null;
    }
    const root = gltf.scene.clone(true);
    const box = new THREE.Box3().setFromObject(root);
    const size = box.getSize(new THREE.Vector3());
    const h = size.y || 1;
    const scale = targetHeight / h;
    root.scale.setScalar(scale);
    const box2 = new THREE.Box3().setFromObject(root);
    root.position.y -= box2.min.y;
    root.traverse((c) => {
      if (c.isMesh) {
        c.castShadow = true;
        c.receiveShadow = true;
      }
    });
    return root;
  }

  _load(path) {
    if (this.cache.has(path) || this.failed.has(path)) {
      return Promise.resolve(this.cache.get(path) || null);
    }
    return new Promise((resolve) => {
      this.loader.load(
        modelUrl(path),
        (gltf) => {
          this.cache.set(path, gltf);
          resolve(gltf);
        },
        undefined,
        () => {
          this.failed.add(path);
          console.warn("[ScenerySystem] missing", path);
          resolve(null);
        },
      );
    });
  }

  _geo(key, factory) {
    if (!this.sharedGeometries.has(key)) this.sharedGeometries.set(key, factory());
    return this.sharedGeometries.get(key);
  }

  _mat(key, color) {
    const k = `${key}-${color}`;
    if (!this.sharedMaterials.has(k)) {
      this.sharedMaterials.set(
        k,
        new THREE.MeshStandardMaterial({
          color,
          roughness: 0.9,
          flatShading: true,
        }),
      );
    }
    return this.sharedMaterials.get(k);
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
