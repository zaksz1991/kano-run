import * as THREE from "three";
import { GAME_CONFIG } from "../core/config.js";

const DEFAULTS = {
  segmentLength: 40,
  segmentsAhead: 6,
  segmentsBehind: 2,
  recycleDistance: 20,
  buildingDensity: 0.85,
  propDensity: 0.6,
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
    this.sharedGeometries = new Map();
    this.disposers = [];
    this.playerZ = 0;
    this.initialized = false;
    this.currentDistrict = "Kano City Centre";
    this.currentTheme = "city";

    // 🔥 TEXTURE LOADER
    this.textureLoader = new THREE.TextureLoader();
    this.textures = {};
    this._loadTextures();

    this._handleRouteChanged = (payload) => {
      const district = payload?.district ?? payload?.name ?? payload?.route?.district;
      if (district) this.setDistrict(district);
    };

    this._subscribe("route:changed", this._handleRouteChanged);
    this._subscribe("routeChanged", this._handleRouteChanged);
  }

  _loadTextures() {
    const loadTex = (name, path) => {
      const tex = this.textureLoader.load(path);
      tex.wrapS = THREE.RepeatWrapping;
      tex.wrapT = THREE.RepeatWrapping;
      tex.colorSpace = THREE.SRGBColorSpace;
      this.textures[name] = tex;
    };

    loadTex('asphalt', '/assets/textures/asphalt.jpg');
    loadTex('wall', '/assets/textures/building-wall.jpg');
    loadTex('market', '/assets/textures/market-stall.jpg');
    loadTex('ground', '/assets/textures/asphalt-1.jpg'); // Reusing asphalt for ground/dust
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
    // Use texture if loaded, else fallback color
    const mat = this._material("ground", 0xc2b280, { map: this.textures['ground'] });
    const geo = this._geometry("ground", () => new THREE.PlaneGeometry(200, this.config.segmentLength));
    
    // Repeat texture
    if (mat.map) {
      mat.map.repeat.set(20, 2);
      mat.map.needsUpdate = true;
    }

    const mesh = new THREE.Mesh(geo, mat);
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.y = -0.1;
    mesh.receiveShadow = true;
    segment.group.add(mesh);
    segment.props.push({ type: "ground", mesh });
  }

  _buildRoadside(segment) {
    const mat = this._material("shoulder", 0xbcaaa4, { map: this.textures['asphalt'] });
    if (mat.map) {
      mat.map.repeat.set(4, 1);
      mat.map.needsUpdate = true;
    }
    
    const shoulderGeo = this._geometry("shoulder", () => new THREE.PlaneGeometry(40, this.config.segmentLength));
    
    const leftShoulder = new THREE.Mesh(shoulderGeo, mat);
    leftShoulder.rotation.x = -Math.PI / 2;
    leftShoulder.position.set(-26, -0.05, 0);
    leftShoulder.receiveShadow = true;
    segment.group.add(leftShoulder);

    const rightShoulder = new THREE.Mesh(shoulderGeo, mat);
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
        this._createBuilding(segment, type, x, zOffset, Math.random() * 0.2 - 0.1);
      }

      if (Math.random() < this.config.buildingDensity) {
        const x = 18 + Math.random() * 5;
        const type = this._pickBuildingType();
        this._createBuilding(segment, type, x, zOffset, Math.PI + (Math.random() * 0.2 - 0.1));
      }
    }
  }

  _pickBuildingType() {
    const r = Math.random();
    if (this.currentTheme === "market") return r < 0.7 ? "market" : "compound";
    if (this.currentTheme === "city") return r < 0.4 ? "highrise" : r < 0.8 ? "compound" : "mosque";
    return r < 0.6 ? "compound" : "house";
  }

  _createBuilding(segment, type, x, z, rotY) {
    const group = new THREE.Group();
    
    // Select texture based on type
    let tex = this.textures['wall'];
    if (type === 'market') tex = this.textures['market'];
    
    const mat = this._material(`building-${type}`, 0xe3d5b8, { map: tex });
    if (mat.map) {
      mat.map.repeat.set(2, 2);
      mat.map.needsUpdate = true;
    }

    let h = 4, w = 6, d = 6;
    if (type === 'highrise') { h = 12; w = 8; d = 8; }
    if (type === 'market') { h = 3; w = 8; d = 5; }

    const geo = this._geometry(`building-${type}`, () => new THREE.BoxGeometry(w, h, d));
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.y = h / 2;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);

    // Add a roof
    const roofMat = this._material("roof", 0x8b4513);
    const roofGeo = this._geometry("roof", () => new THREE.BoxGeometry(w + 0.5, 0.5, d + 0.5));
    const roof = new THREE.Mesh(roofGeo, roofMat);
    roof.position.y = h + 0.25;
    roof.castShadow = true;
    group.add(roof);

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
    
    const propType = Math.random() > 0.5 ? "pole" : "tree";
    let prop;

    if (propType === "pole") {
      const poleGeo = this._geometry("pole", () => new THREE.CylinderGeometry(0.15, 0.15, 6, 6));
      const poleMat = this._material("pole", 0x5d4037);
      prop = new THREE.Mesh(poleGeo, poleMat);
      prop.position.y = 3;
      prop.castShadow = true;
    } else {
      const trunkGeo = this._geometry("trunk", () => new THREE.CylinderGeometry(0.2, 0.3, 2, 6));
      const trunkMat = this._material("trunk", 0x795548);
      const trunk = new THREE.Mesh(trunkGeo, trunkMat);
      trunk.position.y = 1;
      trunk.castShadow = true;
      
      const leavesGeo = this._geometry("leaves", () => new THREE.SphereGeometry(1.5, 8, 6));
      const leavesMat = this._material("leaves", 0x558b2f);
      const leaves = new THREE.Mesh(leavesGeo, leavesMat);
      leaves.position.y = 3;
      leaves.castShadow = true;
      
      prop = new THREE.Group();
      prop.add(trunk);
      prop.add(leaves);
    }

    prop.position.x = x;
    prop.position.z = z;
    segment.group.add(prop);
    segment.props.push({ type: "prop", mesh: prop });
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
        color,
        roughness: options.roughness ?? 0.85,
        metalness: options.metalness ?? 0.0,
        flatShading: true,
        map: options.map || null // 🔥 Apply texture here
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