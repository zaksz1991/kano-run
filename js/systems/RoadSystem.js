import * as THREE from "three";
import { GAME_CONFIG } from "../core/config.js";

const DEFAULTS = {
  segmentLength: 40,
  segmentsAhead: 12,
  segmentsBehind: 8,
  roadWidth: 12,
  laneCount: 3,
  laneWidth: 3.2,
  shoulderWidth: 0.65,
  sidewalkWidth: 3,
  roadColor: 0x414444,
  markingColor: 0xe8dfbd,
  edgeLineColor: 0xf0e9d5,
  sidewalkColor: 0x9b968a,
  shoulderColor: 0xb2a58e,
  curbHeight: 0.16,
};

const ROAD_TYPES = {
  asphalt: {
    color: 0x414444,
    roughness: 0.98,
    markingColor: 0xe8dfbd,
  },
  worn: {
    color: 0x55534b,
    roughness: 1,
    markingColor: 0xc5bfa9,
  },
  dusty: {
    color: 0x625e53,
    roughness: 1,
    markingColor: 0xd0c5a4,
  },
  highway: {
    color: 0x383c3e,
    roughness: 0.94,
    markingColor: 0xf0edda,
  },
};

function makeMaterial(color, roughness = 0.95) {
  return new THREE.MeshStandardMaterial({
    color,
    roughness,
    metalness: 0,
  });
}

export default class RoadSystem {
  constructor({
    scene,
    config = {},
    eventBus = null,
    worldSystem = null,
    routeSystem = null,
  } = {}) {
    if (!scene) {
      throw new Error("RoadSystem requires a Three.js scene.");
    }

    this.scene = scene;
    this.eventBus = eventBus;
    this.worldSystem = worldSystem;
    this.routeSystem = routeSystem;

    this.config = {
      ...DEFAULTS,
      ...(GAME_CONFIG?.world ?? {}),
      ...config,
    };

    this.segments = [];
    this.geometries = new Map();
    this.materials = new Map();
    this.disposers = [];

    this.playerZ = 0;
    this.initialized = false;
    this.roadType = "asphalt";
    this.surfaceCondition = 1;
    this.wetness = 0;
    this.dustLevel = 0;

    this._onRoadChanged = (payload) => {
      const type =
        payload?.roadType ??
        payload?.surface ??
        payload?.type;

      if (type && ROAD_TYPES[type]) {
        this.setRoadType(type);
      }
    };

    this._subscribe("road:changed", this._onRoadChanged);
    this._subscribe("route:changed", (payload) => {
      this._applyRouteSurface(payload);
    });
    this._subscribe("weather:changed", (payload) => {
      this.setWeather(payload);
    });
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

  initialize({ playerZ = 0 } = {}) {
    if (this.initialized) return this;

    this.playerZ = playerZ;

    const count =
      this.config.segmentsAhead +
      this.config.segmentsBehind +
      1;

    const firstZ =
      playerZ -
      this.config.segmentsBehind *
        this.config.segmentLength;

    for (let i = 0; i < count; i += 1) {
      this.segments.push(
        this._createSegment(
          firstZ + i * this.config.segmentLength,
          i,
        ),
      );
    }

    this.initialized = true;

    this.eventBus?.emit?.("road:initialized", {
      segmentCount: this.segments.length,
      roadWidth: this.config.roadWidth,
      laneCount: this.config.laneCount,
    });

    return this;
  }

  update(deltaTime, playerZ = this.playerZ) {
    if (!this.initialized) return;

    this.playerZ = playerZ;

    const length = this.config.segmentLength;

    const ahead =
      playerZ +
      this.config.segmentsAhead * length;

    const behind =
      playerZ -
      this.config.segmentsBehind * length;

    for (const segment of this.segments) {
      if (segment.z < behind - length) {
        this._repositionSegment(segment, ahead + length);
      } else if (segment.z > ahead + length) {
        this._repositionSegment(segment, behind - length);
      }
    }

    const dt = Math.max(0, Math.min(deltaTime || 0, 0.1));

    this._updateSurfaceTransition(dt);
  }

  _createSegment(z, index) {
    const group = new THREE.Group();
    group.position.z = z;

    const segment = {
      id: `road-${index}-${Math.round(z)}`,
      z,
      group,
      decals: [],
    };

    this.scene.add(group);

    this._addRoadSurface(segment);
    this._addShoulders(segment);
    this._addSidewalks(segment);
    this._addLaneMarkings(segment);
    this._addRoadEdges(segment);
    this._addCurbs(segment);
    this._addRoadWear(segment);

    return segment;
  }

  _repositionSegment(segment, z) {
    segment.z = z;
    segment.group.position.z = z;

    this._clearDecals(segment);
    this._addRoadWear(segment);
  }

  _addRoadSurface(segment) {
    const geometry = this._geometry(
      "road-surface",
      () =>
        new THREE.PlaneGeometry(
          this.config.roadWidth,
          this.config.segmentLength,
        ),
    );

    const mesh = new THREE.Mesh(
      geometry,
      this._material(
        `road-${this.roadType}`,
        ROAD_TYPES[this.roadType].color,
      ),
    );

    mesh.name = "road-surface";
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.y = 0;
    mesh.receiveShadow = true;

    segment.group.add(mesh);
  }

  _addShoulders(segment) {
    const length = this.config.segmentLength;
    const width = this.config.shoulderWidth;
    const xOffset = this.config.roadWidth / 2 + width / 2;

    for (const side of [-1, 1]) {
      const shoulder = new THREE.Mesh(
        this._geometry(
          "road-shoulder",
          () => new THREE.PlaneGeometry(width, length),
        ),
        this._material(
          "road-shoulder-material",
          this.config.shoulderColor,
        ),
      );

      shoulder.name = "road-shoulder";
      shoulder.rotation.x = -Math.PI / 2;
      shoulder.position.set(side * xOffset, 0.008, 0);
      shoulder.receiveShadow = true;

      segment.group.add(shoulder);
    }
  }

  _addSidewalks(segment) {
    const length = this.config.segmentLength;
    const width = this.config.sidewalkWidth;

    const centerOffset =
      this.config.roadWidth / 2 +
      this.config.shoulderWidth +
      width / 2;

    const sidewalkGeometry = this._geometry(
      "sidewalk",
      () => new THREE.PlaneGeometry(width, length),
    );

    const sidewalkMaterial = this._material(
      "sidewalk-material",
      this.config.sidewalkColor,
    );

    for (const side of [-1, 1]) {
      const sidewalk = new THREE.Mesh(
        sidewalkGeometry,
        sidewalkMaterial,
      );

      sidewalk.name = "sidewalk";
      sidewalk.rotation.x = -Math.PI / 2;
      sidewalk.position.set(side * centerOffset, 0.015, 0);
      sidewalk.receiveShadow = true;

      segment.group.add(sidewalk);
    }
  }

  _addLaneMarkings(segment) {
    const laneWidth =
      this.config.roadWidth / this.config.laneCount;

    const lineMaterial = this._material(
      "lane-marking-material",
      ROAD_TYPES[this.roadType].markingColor,
    );

    for (let lane = 1; lane < this.config.laneCount; lane += 1) {
      const x =
        -this.config.roadWidth / 2 +
        lane * laneWidth;

      for (
        let z = -this.config.segmentLength / 2 + 3;
        z < this.config.segmentLength / 2;
        z += 7
      ) {
        const dash = new THREE.Mesh(
          this._geometry(
            "lane-dash",
            () => new THREE.PlaneGeometry(0.09, 3.3),
          ),
          lineMaterial,
        );

        dash.name = "lane-marking";
        dash.rotation.x = -Math.PI / 2;
        dash.position.set(x, 0.026, z);

        segment.group.add(dash);
      }
    }
  }

  _addRoadEdges(segment) {
    const edgeMaterial = this._material(
      "road-edge-material",
      this.config.edgeLineColor,
    );

    for (const side of [-1, 1]) {
      const edge = new THREE.Mesh(
        this._geometry(
          "road-edge",
          () =>
            new THREE.PlaneGeometry(
              0.13,
              this.config.segmentLength,
            ),
        ),
        edgeMaterial,
      );

      edge.name = "road-edge";
      edge.rotation.x = -Math.PI / 2;
      edge.position.set(
        side * (this.config.roadWidth / 2 - 0.2),
        0.028,
        0,
      );

      segment.group.add(edge);
    }
  }

  _addCurbs(segment) {
    const curbMaterial = this._material(
      "curb-material",
      0xaaa69a,
    );

    const curbWidth = 0.22;
    const curbHeight = this.config.curbHeight;
    const curbX =
      this.config.roadWidth / 2 +
      this.config.shoulderWidth +
      curbWidth / 2;

    const curbGeometry = this._geometry(
      "curb",
      () =>
        new THREE.BoxGeometry(
          curbWidth,
          curbHeight,
          this.config.segmentLength,
        ),
    );

    for (const side of [-1, 1]) {
      const curb = new THREE.Mesh(
        curbGeometry,
        curbMaterial,
      );

      curb.name = "road-curb";
      curb.position.set(side * curbX, curbHeight / 2, 0);
      curb.castShadow = true;
      curb.receiveShadow = true;

      segment.group.add(curb);
    }
  }

  _addRoadWear(segment) {
    const count = 2 + Math.floor(Math.random() * 4);

    for (let i = 0; i < count; i += 1) {
      const width = 0.15 + Math.random() * 0.8;
      const length = 0.3 + Math.random() * 1.8;

      const patch = new THREE.Mesh(
        this._geometry(
          `wear-${width.toFixed(2)}-${length.toFixed(2)}`,
          () =>
            new THREE.PlaneGeometry(width, length),
        ),
        this._material(
          "road-wear-material",
          0x343736,
        ),
      );

      patch.name = "road-wear";
      patch.rotation.x = -Math.PI / 2;
      patch.position.set(
        (Math.random() - 0.5) *
          (this.config.roadWidth - 1),
        0.019,
        (Math.random() - 0.5) *
          (this.config.segmentLength - 4),
      );

      patch.material.transparent = true;
      patch.material.opacity = 0.22 + Math.random() * 0.2;

      segment.group.add(patch);
      segment.decals.push(patch);
    }
  }

  _clearDecals(segment) {
    for (const decal of segment.decals) {
      segment.group.remove(decal);
    }

    segment.decals.length = 0;
  }

  _geometry(key, factory) {
    if (!this.geometries.has(key)) {
      this.geometries.set(key, factory());
    }

    return this.geometries.get(key);
  }

  _material(key, color) {
    if (!this.materials.has(key)) {
      this.materials.set(key, makeMaterial(color));
    }

    return this.materials.get(key);
  }

  setRoadType(type) {
    if (!ROAD_TYPES[type]) return false;

    this.roadType = type;

    const roadMaterial = this._material(
      `road-${type}`,
      ROAD_TYPES[type].color,
    );

    for (const segment of this.segments) {
      const road = segment.group.children.find(
        (child) => child.name === "road-surface",
      );

      if (road) {
        road.material = roadMaterial;
      }

      for (const marking of segment.group.children) {
        if (marking.name === "lane-marking") {
          marking.material = this._material(
            `lane-marking-${type}`,
            ROAD_TYPES[type].markingColor,
          );
        }
      }
    }

    this.eventBus?.emit?.("road:typeChanged", {
      roadType: type,
    });

    return true;
  }

  setWeather(weather) {
    const type =
      typeof weather === "string"
        ? weather
        : weather?.type ?? weather?.weather ?? "clear";

    this.wetness =
      type === "rain" || type === "storm"
        ? 1
        : type === "drizzle"
          ? 0.45
          : 0;

    this.dustLevel = type === "harmattan" ? 1 : 0;

    this.eventBus?.emit?.("road:surfaceChanged", {
      roadType: this.roadType,
      wetness: this.wetness,
      dustLevel: this.dustLevel,
      gripMultiplier: this.getGripMultiplier(),
    });
  }

  _applyRouteSurface(payload) {
    const routeType =
      payload?.roadType ??
      payload?.route?.roadType ??
      payload?.route?.surface;

    if (routeType && ROAD_TYPES[routeType]) {
      this.setRoadType(routeType);
      return;
    }

    const name = String(
      payload?.district ??
      payload?.route?.district ??
      payload?.name ??
      "",
    ).toLowerCase();

    if (
      name.includes("airport") ||
      name.includes("highway") ||
      name.includes("zaria road")
    ) {
      this.setRoadType("highway");
    } else if (
      name.includes("market") ||
      name.includes("fagge") ||
      name.includes("dala")
    ) {
      this.setRoadType("worn");
    } else if (
      name.includes("kumbotso") ||
      name.includes("ungogo")
    ) {
      this.setRoadType("dusty");
    } else {
      this.setRoadType("asphalt");
    }
  }

  _updateSurfaceTransition(deltaTime) {
    const targetCondition = Math.max(
      0.45,
      1 - this.wetness * 0.18 - this.dustLevel * 0.12,
    );

    const blend = Math.min(deltaTime * 0.8, 1);

    this.surfaceCondition +=
      (targetCondition - this.surfaceCondition) * blend;
  }

  getGripMultiplier() {
    let grip = this.surfaceCondition;

    if (this.wetness > 0) {
      grip *= 1 - this.wetness * 0.3;
    }

    if (this.dustLevel > 0) {
      grip *= 1 - this.dustLevel * 0.14;
    }

    return Math.max(0.45, Math.min(1, grip));
  }

  getSnapshot() {
    return {
      initialized: this.initialized,
      roadType: this.roadType,
      segmentCount: this.segments.length,
      roadWidth: this.config.roadWidth,
      laneCount: this.config.laneCount,
      laneWidth:
        this.config.roadWidth / this.config.laneCount,
      wetness: this.wetness,
      dustLevel: this.dustLevel,
      surfaceCondition: this.surfaceCondition,
      gripMultiplier: this.getGripMultiplier(),
      playerZ: this.playerZ,
    };
  }

  dispose() {
    for (const dispose of this.disposers) {
      try {
        dispose();
      } catch {
        // Continue disposing other subscriptions.
      }
    }

    this.disposers.length = 0;

    for (const segment of this.segments) {
      this.scene.remove(segment.group);
    }

    this.segments.length = 0;

    for (const geometry of this.geometries.values()) {
      geometry.dispose();
    }

    for (const material of this.materials.values()) {
      material.dispose();
    }

    this.geometries.clear();
    this.materials.clear();
    this.initialized = false;
  }
}