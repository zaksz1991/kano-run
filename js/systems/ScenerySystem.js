import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { GAME_CONFIG } from "../core/config.js";
import { MODEL_PATHS, MODEL_SCALES } from "../core/AssetCatalog.js";

const DEFAULTS = {
  segmentLength: 40,
  segmentsAhead: 6,
  segmentsBehind: 2,
  recycleDistance: 20,
  buildingDensity: 0.85,
  propDensity: 0.6, // Increased to show off new models
};

const PALETTES = {
  city: { ground: 0xc2b280, road: 0x333333, building: [0xe3d5b8, 0xd4c4a8], accent: [0x8b4513, 0x556b2f] },
  market: { ground: 0xbcaaa4, road: 0x333333, building: [0xffe0b2, 0xffccbc], accent: [0xd32f2f, 0x1976d2] },
  residential: { ground: 0xd7ccc8, road: 0x333333, building: [0xefebd9, 0xe0e0e0], accent: [0x795548, 0x607d8b] },
};

export default class ScenerySystem {
  constructor({ scene, worldSystem = null, routeSystem = null, weatherSystem = null, config = {}, eventBus = null } = {}) {
    if (!scene) throw new Error("ScenerySystem requires a Three.js scene.");
    
    this.scene = scene;
    this.worldSystem = worldSystem;
    this.routeSystem = routeSystem;
    this.weatherSystem = weatherSystem;
    this.eventBus = eventBus;
    this.config = { ...DEFAULTS, ...(GAME_CONFIG?.world ?? {}), ...config };
    
    this.segments = [];
    this.sharedMaterials = new Map();
    this.disposers = [];
    this.playerZ = 0;
    this.initialized = false;
    this.currentDistrict = "Kano City Centre";
    this.currentTheme = "city";

    // 🔥 GLB Loader & Cache for Environment
    this._glbLoader = new GLTFLoader();
    this._modelCache = new Map();

    this._handleRouteChanged = (payload) => {
      const district = payload?.district ?? payload?.name ?? payload?.route?.district;
      if (district) this.setDistrict(district);
    };

    this._subscribe("route:changed", this._handleRouteChanged);
    this._subscribe("routeChanged", this._handleRouteChanged);
  }

  _subscribe(eventName, handler) {
    if (!this.eventBus?.on) return;
    const result = this.eventBus.on(eventName, handler);
    if (typeof result === "function") this.disposers.push(result);
    else if (this.eventBus.off) this.disposers.push(() => this.eventBus.off(eventName, handler));
  }

  initialize({ playerZ = 0, district = null } = {}) {
    if (this.initialized) return this;
    this.playerZ = playerZ;
    if (district) this.setDistrict(district);
    else this._detectDistrict();

    const totalSegments = this.config.segmentsAhead + this.config.segmentsBehind + 1;
    const firstZ = playerZ - this.config.segmentsBehind * this.config.segmentLength;
    
    for (let i = 0; i < totalSegments; i++) {
      const segment = this._createSegment(firstZ + i * this.config.segmentLength, i);
      this.segments.push(segment);
    }
    this.initialized = true;
    return this;
  }

  update(deltaTime, playerZ = this.playerZ) {
    if (!this.initialized) return;
    const dt = Math.max(0, Math.min(deltaTime || 0, 0.1));
    this.playerZ = playerZ;
    this._detectDistrict();

    const segmentLength = this.config.segmentLength;
    const targetAhead = playerZ + this.config.segmentsAhead * segmentLength;
    const targetBehind = playerZ - this.config.segmentsBehind * segmentLength;

    for (const segment of this.segments) {
      if (segment.z < targetBehind - this.config.recycleDistance) {
        this._moveSegment(segment, targetAhead + segmentLength);
        continue;
      }
      if (segment.z > targetAhead + this.config.recycleDistance) {
        this._moveSegment(segment, targetBehind - segmentLength);
      }
      segment.group.position.z = segment.z;
      segment.elapsed += dt;
    }
  }

  setDistrict(district) {
    this.currentDistrict = String(district);
    const key = district.toLowerCase();
    if (key.includes("sabon") || key.includes("kurmi") || key.includes("market")) this.currentTheme = "market";
    else if (key.includes("city") || key.includes("centre")) this.currentTheme = "city";
    else this.currentTheme = "residential";

    for (const segment of this.segments) this._refreshSegmentTheme(segment);
    this.eventBus?.emit?.("scenery:districtChanged", { district: this.currentDistrict, theme: this.currentTheme });
  }

  _detectDistrict() {}

  _createSegment(z, index) {
    const group = new THREE.Group();
    group.position.z = z;
    const segment = { id: `scenery-${index}-${Math.round(z)}`, group, z, elapsed: 0, theme: this.currentTheme, props: [] };
    this.scene.add(group);
    this._buildGround(segment);
    this._buildRoadside(segment);
    this._buildBuildings(segment);
    this._buildProps(segment);
    return segment;
  }

  _moveSegment(segment, newZ) {
    segment.z = newZ;
    segment.group.position.z = newZ;
    segment.elapsed = 0;
    this._clearSegmentProps(segment);
    this._buildRoadside(segment);
    this._buildBuildings(segment);
    this._buildProps(segment);
  }

  _refreshSegmentTheme(segment) {
    segment.theme = this.currentTheme;
    this._clearSegmentBuildings(segment);
    this._buildBuildings(segment);
  }

  _buildGround(segment) {
    const palette = this._getPalette();
    const geo = this._geometry("ground", () => new THREE.PlaneGeometry(200, this.config.segmentLength));
    const mat = this._material("ground", palette.ground);
    const mesh = new THREE.Mesh(geo, mat);
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.y = -0.1;
    mesh.receiveShadow = true;
    segment.group.add(mesh);
    segment.props.push({ type: "ground", mesh });
  }

  _buildRoadside(segment) {
    const palette = this._getPalette();
    const shoulderGeo = this._geometry("shoulder", () => new THREE.PlaneGeometry(40, this.config.segmentLength));
    const shoulderMat = this._material("shoulder", palette.ground, { roughness: 1, metalness: 0 });
    
    const leftShoulder = new THREE.Mesh(shoulderGeo, shoulderMat);
    leftShoulder.rotation.x = -Math.PI / 2;
    leftShoulder.position.set(-26, -0.05, 0);
    leftShoulder.receiveShadow = true;
    segment.group.add(leftShoulder);

    const rightShoulder = new THREE.Mesh(shoulderGeo, shoulderMat);
    rightShoulder.rotation.x = -Math.PI / 2;
    rightShoulder.position.set(26, -0.05, 0);
    rightShoulder.receiveShadow = true;
    segment.group.add(rightShoulder);

    segment.props.push({ type: "shoulder", mesh: leftShoulder }, { type: "shoulder", mesh: rightShoulder });
  }

  _buildBuildings(segment) {
    const segLen = this.config.segmentLength;
    const slots = 4; 
    const slotWidth = segLen / slots;

    for (let i = 0; i < slots; i++) {
      const zOffset = -segLen / 2 + i * slotWidth + slotWidth / 2;
      
      if (Math.random() < this.config.buildingDensity) {
        const x = -18 - Math.random() * 5;
        const type = this._pickBuildingType();
        this._createGLBBuilding(segment, type, x, zOffset, Math.random() * 0.2 - 0.1);
      }

      if (Math.random() < this.config.buildingDensity) {
        const x = 18 + Math.random() * 5;
        const type = this._pickBuildingType();
        this._createGLBBuilding(segment, type, x, zOffset, Math.PI + (Math.random() * 0.2 - 0.1));
      }
    }
  }

  _pickBuildingType() {
    const r = Math.random();
    if (this.currentTheme === "market") return r < 0.7 ? "market" : "abstract";
    if (this.currentTheme === "city") return r < 0.4 ? "abstract" : r < 0.8 ? "market" : "bustop";
    return r < 0.6 ? "abstract" : "bustop";
  }

  async _createGLBBuilding(segment, type, x, z, rotY) {
    const modelPath = MODEL_PATHS.environment[type] || MODEL_PATHS.environment.abstract;
    const scale = MODEL_SCALES.environment[type] || 1.0;
    
    let group;
    try {
      group = await this._loadCachedModel(modelPath, scale);
    } catch (e) {
      // Fallback box if model fails
      group = new THREE.Group();
      const mat = new THREE.MeshStandardMaterial({ color: 0x888888, flatShading: true });
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(5, 4, 5), mat);
      mesh.position.y = 2;
      group.add(mesh);
    }

    group.position.set(x, 0, z);
    group.rotation.y = rotY;
    segment.group.add(group);
    segment.props.push({ type: "building", mesh: group });
  }

  _buildProps(segment) {
    if (Math.random() > this.config.propDensity) return;
    
    const side = Math.random() > 0.5 ? 1 : -1;
    const x = side * (12 + Math.random() * 4);
    const z = (Math.random() - 0.5) * this.config.segmentLength;
    
    // Randomly choose between a pedestrian or a bus stop
    const propType = Math.random() > 0.5 ? "pedestrian" : "bustop";
    const modelPath = MODEL_PATHS.characters[propType] || MODEL_PATHS.environment.bustop;
    const scale = propType === "pedestrian" ? MODEL_SCALES.characters.pedestrian : MODEL_SCALES.environment.bustop;

    this._loadCachedModel(modelPath, scale).then(group => {
      group.position.set(x, 0, z);
      group.rotation.y = side > 0 ? -Math.PI / 2 : Math.PI / 2;
      segment.group.add(group);
      segment.props.push({ type: "prop", mesh: group });
    }).catch(() => {
      // Fallback
      const fallback = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 1.8, 8), new THREE.MeshStandardMaterial({color: 0x555555}));
      fallback.position.set(x, 0.9, z);
      segment.group.add(fallback);
      segment.props.push({ type: "prop", mesh: fallback });
    });
  }

  _loadCachedModel(path, scale) {
    return new Promise((resolve, reject) => {
      if (this._modelCache.has(path)) {
        const cloned = this._modelCache.get(path).scene.clone(true);
        cloned.scale.setScalar(scale);
        cloned.traverse(c => { if(c.isMesh) { c.castShadow = true; c.receiveShadow = true; } });
        resolve(cloned);
      } else {
        this._glbLoader.load(path, (gltf) => {
          this._modelCache.set(path, gltf);
          const cloned = gltf.scene.clone(true);
          cloned.scale.setScalar(scale);
          cloned.traverse(c => { if(c.isMesh) { c.castShadow = true; c.receiveShadow = true; } });
          resolve(cloned);
        }, undefined, reject);
      }
    });
  }

  _clearSegmentProps(segment) {
    for (const prop of segment.props) segment.group.remove(prop.mesh);
    segment.props = [];
  }

  _clearSegmentBuildings(segment) {
    segment.props = segment.props.filter(p => {
      if (p.type === "building") { segment.group.remove(p.mesh); return false; }
      return true;
    });
  }

  _getPalette() { return PALETTES[this.currentTheme] ?? PALETTES.residential; }

  _geometry(key, factory) {
    if (!this.sharedGeometries) this.sharedGeometries = new Map();
    if (!this.sharedGeometries.has(key)) this.sharedGeometries.set(key, factory());
    return this.sharedGeometries.get(key);
  }

  _material(key, color, options = {}) {
    if (!this.sharedMaterials) this.sharedMaterials = new Map();
    const matKey = `${key}-${color}`;
    if (!this.sharedMaterials.has(matKey)) {
      this.sharedMaterials.set(matKey, new THREE.MeshStandardMaterial({
        color, roughness: options.roughness ?? 0.85, metalness: options.metalness ?? 0.0, flatShading: true,
      }));
    }
    return this.sharedMaterials.get(matKey);
  }

  dispose() {
    for (const dispose of this.disposers) { try { dispose(); } catch {} }
    this.disposers.length = 0;
    for (const segment of this.segments) this.scene.remove(segment.group);
    this.segments.length = 0;
    if (this.sharedGeometries) for (const geometry of this.sharedGeometries.values()) geometry.dispose();
    if (this.sharedMaterials) for (const material of this.sharedMaterials.values()) material.dispose();
    this.initialized = false;
  }
}