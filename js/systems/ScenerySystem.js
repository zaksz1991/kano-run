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

const TEXTURE_BASE = "/assets/models/textures";

export default class ScenerySystem {
  constructor({
    scene,
    worldSystem = null,
    routeSystem = null,
    weatherSystem = null,
    config = {},
    eventBus = null,
  } = {}) {
    if (!scene) {
      throw new Error("ScenerySystem requires a Three.js scene.");
    }

    this.scene = scene;
    this.worldSystem = worldSystem;
    this.routeSystem = routeSystem;
    this.weatherSystem = weatherSystem;
    this.eventBus = eventBus;

    this.config = {
      ...DEFAULTS,
      ...(GAME_CONFIG?.world ?? {}),
      ...config,
    };

    this.segments = [];
    this.sharedMaterials = new Map();
    this.sharedGeometries = new Map();
    this.disposers = [];
    this.textures = {};
    this.playerZ = 0;
    this.initialized = false;
    this.currentDistrict = "Kano City Centre";
    this.currentTheme = "city";

    this.textureLoader = new THREE.TextureLoader();
    this._loadTextures();

    this._handleRouteChanged = (payload) => {
      const route = payload?.route ?? payload;

      const district =
        payload?.district ??
        route?.district ??
        route?.name ??
        route?.title;

      if (district) {
        this.setDistrict(district);
      }
    };

    this._subscribe("route:changed", this._handleRouteChanged);
    this._subscribe("routeChanged", this._handleRouteChanged);
  }

  _loadTextures() {
    const definitions = {
      asphalt: `${TEXTURE_BASE}/asphalt.jpg`,
      wall: `${TEXTURE_BASE}/building-wall.jpg`,
      market: `${TEXTURE_BASE}/market-stall.jpg`,
      ground: `${TEXTURE_BASE}/asphalt-1.jpg`,
    };

    for (const [name, path] of Object.entries(definitions)) {
      const texture = this.textureLoader.load(
        path,
        () => {
          texture.needsUpdate = true;
        },
        undefined,
        () => {
          console.warn(`[ScenerySystem] Texture unavailable: ${path}`);
        },
      );

      texture.wrapS = THREE.RepeatWrapping;
      texture.wrapT = THREE.RepeatWrapping;
      texture.colorSpace = THREE.SRGBColorSpace;

      this.textures[name] = texture;
    }
  }

  _subscribe(eventName, handler) {
    if (!this.eventBus?.on) return;

    const result = this.eventBus.on(eventName, handler);

    if (typeof result === "function") {
      this.disposers.push(result);
    } else if (this.eventBus.off) {
      this.disposers.push(() =>
        this.eventBus.off(eventName, handler),
      );
    }
  }

  initialize(options = {}) {
    if (this.initialized) return this;

    // Game.js may pass its complete system context.
    const isContext =
      options &&
      typeof options === "object" &&
      ("game" in options ||
        "scene" in options ||
        "routeSystem" in options);

    const playerZ = Number.isFinite(options?.playerZ)
      ? options.playerZ
      : 0;

    const district = options?.district ?? null;

    if (isContext) {
      this.worldSystem =
        options.worldSystem ?? this.worldSystem;

      this.routeSystem =
        options.routeSystem ?? this.routeSystem;

      this.weatherSystem =
        options.weatherSystem ?? this.weatherSystem;

      this.eventBus =
        options.eventBus ?? this.eventBus;
    }

    this.playerZ = playerZ;

    if (district) {
      this.setDistrict(district);
    } else {
      this._detectDistrict();
    }

    const totalSegments =
      this.config.segmentsAhead +
      this.config.segmentsBehind +
      1;

    const firstZ =
      playerZ -
      this.config.segmentsBehind * this.config.segmentLength;

    for (let i = 0; i < totalSegments; i++) {
      const segment = this._createSegment(
        firstZ + i * this.config.segmentLength,
        i,
      );

      this.segments.push(segment);
    }

    this.initialized = true;

    this.eventBus?.emit?.("scenery:ready", {
      segments: this.segments.length,
      district: this.currentDistrict,
      theme: this.currentTheme,
    });

    console.info(
      `[ScenerySystem] Ready: ${this.segments.length} visible scenery segments.`,
    );

    return this;
  }

  update(deltaTime, playerZ = this.playerZ) {
    if (!this.initialized) return;

    const dt = Math.max(
      0,
      Math.min(Number(deltaTime) || 0, 0.1),
    );

    this.playerZ = Number.isFinite(playerZ)
      ? playerZ
      : this.playerZ;

    this._detectDistrict();

    const segmentLength = this.config.segmentLength;

    const targetAhead =
      this.playerZ +
      this.config.segmentsAhead * segmentLength;

    const targetBehind =
      this.playerZ -
      this.config.segmentsBehind * segmentLength;

    for (const segment of this.segments) {
      if (
        segment.z <
        targetBehind - this.config.recycleDistance
      ) {
        this._moveSegment(
          segment,
          targetAhead + segmentLength,
        );
      } else if (
        segment.z >
        targetAhead + this.config.recycleDistance
      ) {
        this._moveSegment(
          segment,
          targetBehind - segmentLength,
        );
      }

      segment.group.position.z = segment.z;
      segment.elapsed += dt;
    }
  }

  _detectDistrict() {
    const route =
      this.routeSystem?.getSelectedRoute?.() ??
      this.routeSystem?.getRoute?.(
        this.routeSystem?.getSelectedRouteId?.(),
      );

    const district =
      route?.district ??
      route?.name ??
      route?.title ??
      null;

    if (
      district &&
      String(district) !== this.currentDistrict
    ) {
      this.setDistrict(district);
    }
  }

  setDistrict(district) {
    const name = String(district ?? "Kano City Centre");
    const key = name.toLowerCase();

    let theme = "residential";

    if (
      key.includes("sabon") ||
      key.includes("kurmi") ||
      key.includes("market") ||
      key.includes("kantin")
    ) {
      theme = "market";
    } else if (
      key.includes("city") ||
      key.includes("centre") ||
      key.includes("center") ||
      key.includes("central") ||
      key.includes("nassarawa")
    ) {
      theme = "city";
    }

    const changed =
      name !== this.currentDistrict ||
      theme !== this.currentTheme;

    this.currentDistrict = name;
    this.currentTheme = theme;

    if (changed) {
      for (const segment of this.segments) {
        this._refreshSegmentTheme(segment);
      }

      this.eventBus?.emit?.("scenery:districtChanged", {
        district: this.currentDistrict,
        theme: this.currentTheme,
      });
    }
  }

  _createSegment(z, index) {
    const group = new THREE.Group();
    group.name = `scenery-segment-${index}`;
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

    this._clearSegmentBuildings(segment);
    this._buildBuildings(segment);
  }

  _buildGround(segment) {
    const material = this._material(
      "ground",
      0xc2b280,
      { map: this.textures.ground },
    );

    if (material.map) {
      material.map.repeat.set(20, 2);
    }

    const geometry = this._geometry(
      "ground",
      () =>
        new THREE.PlaneGeometry(
          200,
          this.config.segmentLength,
        ),
    );

    const mesh = new THREE.Mesh(geometry, material);

    mesh.rotation.x = -Math.PI / 2;
    mesh.position.y = -0.1;
    mesh.receiveShadow = true;

    segment.group.add(mesh);
    segment.props.push({ type: "ground", mesh });
  }

  _buildRoadside(segment) {
    const material = this._material(
      "shoulder",
      0xbcaaa4,
      { map: this.textures.asphalt },
    );

    if (material.map) {
      material.map.repeat.set(4, 1);
    }

    const geometry = this._geometry(
      "shoulder",
      () =>
        new THREE.PlaneGeometry(
          40,
          this.config.segmentLength,
        ),
    );

    for (const x of [-26, 26]) {
      const mesh = new THREE.Mesh(geometry, material);

      mesh.rotation.x = -Math.PI / 2;
      mesh.position.set(x, -0.05, 0);
      mesh.receiveShadow = true;

      segment.group.add(mesh);
      segment.props.push({ type: "shoulder", mesh });
    }
  }

  _buildBuildings(segment) {
    const segmentLength = this.config.segmentLength;
    const slots = 4;
    const slotWidth = segmentLength / slots;

    for (let i = 0; i < slots; i++) {
      const z =
        -segmentLength / 2 +
        i * slotWidth +
        slotWidth / 2;

      if (Math.random() < this.config.buildingDensity) {
        this._createBuilding(
          segment,
          this._pickBuildingType(),
          -18 - Math.random() * 5,
          z,
          Math.random() * 0.2 - 0.1,
        );
      }

      if (Math.random() < this.config.buildingDensity) {
        this._createBuilding(
          segment,
          this._pickBuildingType(),
          18 + Math.random() * 5,
          z,
          Math.PI + Math.random() * 0.2 - 0.1,
        );
      }
    }
  }

  _pickBuildingType() {
    const random = Math.random();

    if (this.currentTheme === "market") {
      return random < 0.7 ? "market" : "compound";
    }

    if (this.currentTheme === "city") {
      if (random < 0.4) return "highrise";
      if (random < 0.8) return "compound";
      return "mosque";
    }

    return random < 0.6 ? "compound" : "house";
  }

  _createBuilding(segment, type, x, z, rotationY) {
    const group = new THREE.Group();

    const texture =
      type === "market"
        ? this.textures.market
        : this.textures.wall;

    const material = this._material(
      `building-${type}`,
      0xe3d5b8,
      { map: texture },
    );

    if (material.map) {
      material.map.repeat.set(2, 2);
    }

    let height = 4;
    let width = 6;
    let depth = 6;

    if (type === "highrise") {
      height = 12;
      width = 8;
      depth = 8;
    } else if (type === "market") {
      height = 3;
      width = 8;
      depth = 5;
    } else if (type === "mosque") {
      height = 7;
      width = 8;
      depth = 8;
    }

    const geometry = this._geometry(
      `building-${type}`,
      () => new THREE.BoxGeometry(width, height, depth),
    );

    const building = new THREE.Mesh(geometry, material);

    building.position.y = height / 2;
    building.castShadow = true;
    building.receiveShadow = true;

    group.add(building);

    const roofGeometry = this._geometry(
      `roof-${type}`,
      () =>
        new THREE.BoxGeometry(
          width + 0.5,
          0.5,
          depth + 0.5,
        ),
    );

    const roof = new THREE.Mesh(
      roofGeometry,
      this._material("roof", 0x8b4513),
    );

    roof.position.y = height + 0.25;
    roof.castShadow = true;

    group.add(roof);

    group.position.set(x, 0, z);
    group.rotation.y = rotationY;

    segment.group.add(group);
    segment.props.push({ type: "building", mesh: group });
  }

  _buildProps(segment) {
    if (Math.random() > this.config.propDensity) return;

    const side = Math.random() > 0.5 ? 1 : -1;
    const x = side * (12 + Math.random() * 4);
    const z =
      (Math.random() - 0.5) * this.config.segmentLength;

    let prop;

    if (Math.random() > 0.5) {
      prop = new THREE.Mesh(
        this._geometry(
          "pole",
          () =>
            new THREE.CylinderGeometry(
              0.15,
              0.15,
              6,
              6,
            ),
        ),
        this._material("pole", 0x5d4037),
      );

      prop.position.y = 3;
      prop.castShadow = true;
    } else {
      const trunk = new THREE.Mesh(
        this._geometry(
          "trunk",
          () =>
            new THREE.CylinderGeometry(
              0.2,
              0.3,
              2,
              6,
            ),
        ),
        this._material("trunk", 0x795548),
      );

      trunk.position.y = 1;
      trunk.castShadow = true;

      const leaves = new THREE.Mesh(
        this._geometry(
          "leaves",
          () => new THREE.SphereGeometry(1.5, 8, 6),
        ),
        this._material("leaves", 0x558b2f),
      );

      leaves.position.y = 3;
      leaves.castShadow = true;

      prop = new THREE.Group();
      prop.add(trunk, leaves);
    }

    prop.position.x = x;
    prop.position.z = z;

    segment.group.add(prop);
    segment.props.push({ type: "prop", mesh: prop });
  }

  _clearSegmentProps(segment) {
    for (const item of segment.props) {
      segment.group.remove(item.mesh);
    }

    segment.props = [];
  }

  _clearSegmentBuildings(segment) {
    segment.props = segment.props.filter((item) => {
      if (item.type !== "building") return true;

      segment.group.remove(item.mesh);
      return false;
    });
  }

  _geometry(key, factory) {
    if (!this.sharedGeometries.has(key)) {
      this.sharedGeometries.set(key, factory());
    }

    return this.sharedGeometries.get(key);
  }

  _material(key, color, options = {}) {
    const materialKey = `${key}-${color}`;

    if (!this.sharedMaterials.has(materialKey)) {
      this.sharedMaterials.set(
        materialKey,
        new THREE.MeshStandardMaterial({
          color,
          roughness: options.roughness ?? 0.85,
          metalness: options.metalness ?? 0,
          flatShading: true,
          map: options.map ?? null,
        }),
      );
    }

    return this.sharedMaterials.get(materialKey);
  }

  dispose() {
    for (const dispose of this.disposers) {
      try {
        dispose();
      } catch {}
    }

    this.disposers.length = 0;

    for (const segment of this.segments) {
      this.scene.remove(segment.group);
    }

    this.segments.length = 0;

    for (const geometry of this.sharedGeometries.values()) {
      geometry.dispose();
    }

    for (const material of this.sharedMaterials.values()) {
      material.dispose();
    }

    for (const texture of Object.values(this.textures)) {
      texture.dispose();
    }

    this.sharedGeometries.clear();
    this.sharedMaterials.clear();
    this.textures = {};
    this.initialized = false;
  }

  destroy() {
    this.dispose();
  }
}