import * as THREE from "three";
import { GAME_CONFIG } from "../core/config.js";

const DEFAULTS = {
  segmentLength: 40,
  segmentsAhead: 6,
  segmentsBehind: 2,
  recycleDistance: 20,
  buildingDensity: 0.85, // Chance of a building appearing per slot
  propDensity: 0.4,
};

// Kano-specific color palettes
const PALETTES = {
  city: {
    ground: 0xc2b280, // Sandy beige
    road: 0x333333,
    building: [0xe3d5b8, 0xd4c4a8, 0xc9b896, 0xa89f91], // Sandy concrete
    accent: [0x8b4513, 0x556b2f, 0x4682b4], // Terracotta, olive, steel blue
    roof: 0x8b7355,
  },
  market: {
    ground: 0xbcaaa4,
    road: 0x333333,
    building: [0xffe0b2, 0xffccbc, 0xf8bbd0], // Warm, faded colors
    accent: [0xd32f2f, 0x1976d2, 0x388e3c], // Bright shop awnings
    roof: 0x5d4037,
  },
  residential: {
    ground: 0xd7ccc8,
    road: 0x333333,
    building: [0xefebd9, 0xe0e0e0, 0xd7ccc8], // Light compounds
    accent: [0x795548, 0x607d8b],
    roof: 0x8d6e63,
  },
};

export default class ScenerySystem {
  constructor({
    scene,
    worldSystem = null,
    routeSystem = null,
    weatherSystem = null,
    config = {},
    eventBus = null,
  } = {}) {
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

  _detectDistrict() {
    // In a full implementation, this would query the RouteSystem for the current district name
    // based on playerZ. For now, we keep the current theme.
  }

  _createSegment(z, index) {
    const group = new THREE.Group();
    group.position.z = z;
    const segment = {
      id: `scenery-${index}-${Math.round(z)}`,
      group,
      z,
      elapsed: 0,
      theme: this.currentTheme,
      props: [],
    };
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
    // Re-build buildings to apply new palette
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
    // Sandy shoulders
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
    const palette = this._getPalette();
    const segLen = this.config.segmentLength;
    const slots = 4; // 2 on left, 2 on right
    const slotWidth = segLen / slots;

    for (let i = 0; i < slots; i++) {
      const zOffset = -segLen / 2 + i * slotWidth + slotWidth / 2;
      
      // Left side
      if (Math.random() < this.config.buildingDensity) {
        const x = -18 - Math.random() * 5;
        const type = this._pickBuildingType();
        const building = this._createBuilding(type, palette);
        building.position.set(x, 0, zOffset);
        building.rotation.y = Math.random() * 0.2 - 0.1; // Slight variation
        segment.group.add(building);
        segment.props.push({ type: "building", mesh: building });
      }

      // Right side
      if (Math.random() < this.config.buildingDensity) {
        const x = 18 + Math.random() * 5;
        const type = this._pickBuildingType();
        const building = this._createBuilding(type, palette);
        building.position.set(x, 0, zOffset);
        building.rotation.y = Math.PI + (Math.random() * 0.2 - 0.1);
        segment.group.add(building);
        segment.props.push({ type: "building", mesh: building });
      }
    }
  }

  _pickBuildingType() {
    const r = Math.random();
    if (this.currentTheme === "market") return r < 0.6 ? "shop" : "stall";
    if (this.currentTheme === "city") return r < 0.4 ? "highrise" : r < 0.8 ? "compound" : "mosque";
    return r < 0.7 ? "compound" : "house";
  }

  _createBuilding(type, palette) {
    const group = new THREE.Group();
    const color = palette.building[Math.floor(Math.random() * palette.building.length)];
    const accent = palette.accent[Math.floor(Math.random() * palette.accent.length)];

    if (type === "compound") {
      // Wall
      const wallGeo = this._geometry("wall", () => new THREE.BoxGeometry(8, 2.5, 8));
      const wallMat = this._material("wall", color);
      const wall = new THREE.Mesh(wallGeo, wallMat);
      wall.position.y = 1.25;
      wall.castShadow = true; wall.receiveShadow = true;
      group.add(wall);
      
      // House inside
      const houseGeo = this._geometry("house", () => new THREE.BoxGeometry(4, 3, 4));
      const houseMat = this._material("house", 0xffffff);
      const house = new THREE.Mesh(houseGeo, houseMat);
      house.position.set(0, 1.5, 0);
      house.castShadow = true;
      group.add(house);
    } 
    else if (type === "shop") {
      const shopGeo = this._geometry("shop", () => new THREE.BoxGeometry(6, 3.5, 5));
      const shopMat = this._material("shop", color);
      const shop = new THREE.Mesh(shopGeo, shopMat);
      shop.position.y = 1.75;
      shop.castShadow = true; shop.receiveShadow = true;
      group.add(shop);

      // Awning
      const awningGeo = this._geometry("awning", () => new THREE.BoxGeometry(6.2, 0.2, 2));
      const awningMat = this._material("awning", accent);
      const awning = new THREE.Mesh(awningGeo, awningMat);
      awning.position.set(0, 3, -3.5);
      awning.castShadow = true;
      group.add(awning);
    }
    else if (type === "mosque") {
      const baseGeo = this._geometry("mosque_base", () => new THREE.BoxGeometry(10, 4, 10));
      const baseMat = this._material("mosque_base", 0xf5f5dc); // Beige
      const base = new THREE.Mesh(baseGeo, baseMat);
      base.position.y = 2;
      base.castShadow = true; base.receiveShadow = true;
      group.add(base);

      // Minaret
      const minaretGeo = this._geometry("minaret", () => new THREE.CylinderGeometry(0.8, 1, 8, 8));
      const minaretMat = this._material("minaret", 0xe0e0e0);
      const minaret = new THREE.Mesh(minaretGeo, minaretMat);
      minaret.position.set(6, 4, 6);
      minaret.castShadow = true;
      group.add(minaret);

      // Dome
      const domeGeo = this._geometry("dome", () => new THREE.SphereGeometry(2.5, 16, 16, 0, Math.PI * 2, 0, Math.PI / 2));
      const domeMat = this._material("dome", 0x4caf50); // Green dome
      const dome = new THREE.Mesh(domeGeo, domeMat);
      dome.position.set(0, 4, 0);
      dome.castShadow = true;
      group.add(dome);
    }
    else if (type === "highrise") {
      const height = 8 + Math.random() * 12;
      const buildGeo = this._geometry("highrise", () => new THREE.BoxGeometry(7, height, 7));
      const buildMat = this._material("highrise", color);
      const build = new THREE.Mesh(buildGeo, buildMat);
      build.position.y = height / 2;
      build.castShadow = true; build.receiveShadow = true;
      group.add(build);
    }
    else { // house / stall
      const h = 2.5 + Math.random() * 1.5;
      const buildGeo = this._geometry("generic", () => new THREE.BoxGeometry(5, h, 5));
      const buildMat = this._material("generic", color);
      const build = new THREE.Mesh(buildGeo, buildMat);
      build.position.y = h / 2;
      build.castShadow = true; build.receiveShadow = true;
      group.add(build);
    }

    return group;
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
      const poleMat = this._material("pole", 0x5d4037); // Wood color
      prop = new THREE.Mesh(poleGeo, poleMat);
      prop.position.y = 3;
      prop.castShadow = true;
    } else {
      // Stylized tree (common in Kano)
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
    for (const prop of segment.props) {
      segment.group.remove(prop.mesh);
      // Note: We don't dispose shared geos/mats here, just remove from scene
    }
    segment.props = [];
  }

  _clearSegmentBuildings(segment) {
    // Specific cleanup for buildings if theme changes
    segment.props = segment.props.filter(p => {
      if (p.type === "building") {
        segment.group.remove(p.mesh);
        return false;
      }
      return true;
    });
  }

  _getPalette() {
    return PALETTES[this.currentTheme] ?? PALETTES.residential;
  }

  _geometry(key, factory) {
    if (!this.sharedGeometries.has(key)) this.sharedGeometries.set(key, factory());
    return this.sharedGeometries.get(key);
  }

  _material(key, color, options = {}) {
    const matKey = `${key}-${color}`;
    if (!this.sharedMaterials.has(matKey)) {
      this.sharedMaterials.set(matKey, new THREE.MeshStandardMaterial({
        color,
        roughness: options.roughness ?? 0.85,
        metalness: options.metalness ?? 0.0,
        flatShading: true, // Stylized look
      }));
    }
    return this.sharedMaterials.get(matKey);
  }

  dispose() {
    for (const dispose of this.disposers) {
      try { dispose(); } catch {}
    }
    this.disposers.length = 0;
    for (const segment of this.segments) {
      this.scene.remove(segment.group);
    }
    this.segments.length = 0;
    for (const geometry of this.sharedGeometries.values()) geometry.dispose();
    for (const material of this.sharedMaterials.values()) material.dispose();
    this.sharedGeometries.clear();
    this.sharedMaterials.clear();
    this.initialized = false;
  }
}