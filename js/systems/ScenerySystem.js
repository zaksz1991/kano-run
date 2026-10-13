import * as THREE from "../../vendor/three.module.js";
import { GAME_CONFIG } from "../core/config.js";

const DEFAULTS = {
  segmentLength: 40,
  segmentsAhead: 8,
  segmentsBehind: 3,
  roadWidth: 12,
  sidewalkWidth: 3,
  propSpacing: 8,
  maxPropsPerSegment: 18,
  recycleDistance: 90,
};

const PALETTES = {
  city: {
    ground: 0x9b927c,
    building: [0xc9b89a, 0xd9c9ad, 0xb7a78f, 0xeadcc5],
    roof: [0x756b5e, 0x8d7664, 0x5d5a54],
    vegetation: [0x54764b, 0x6b874d, 0x829457],
  },
  residential: {
    ground: 0xb1a18a,
    building: [0xd9c7a8, 0xe5d6bb, 0xc2b095, 0xc7c1a9],
    roof: [0x8a5948, 0x9b7358, 0x6e6255],
    vegetation: [0x477044, 0x66874c, 0x829957],
  },
  market: {
    ground: 0xa58e6c,
    building: [0xd5b88c, 0xcaa47b, 0xe0c69c, 0xb89c76],
    roof: [0x7c4939, 0x9c573e, 0x5f5547],
    vegetation: [0x4d7544, 0x72864b, 0x8d9657],
  },
  industrial: {
    ground: 0x8c897e,
    building: [0xa5a39a, 0xb8b4a8, 0x8d958f, 0xc1b8a5],
    roof: [0x565d5b, 0x696e69, 0x7a7061],
    vegetation: [0x53694b, 0x64744c, 0x79824e],
  },
  outskirts: {
    ground: 0xb4a178,
    building: [0xd8c7a2, 0xe3d5b7, 0xcbb68d, 0xbca984],
    roof: [0x936e4d, 0x7f654b, 0x756653],
    vegetation: [0x637b3d, 0x7f9144, 0x9b9a4e],
  },
};

const DISTRICT_THEMES = {
  "Kano City Centre": "city",
  "Sabon Gari": "market",
  "Kurmi Market": "market",
  "Kofar Mata": "market",
  "Fagge": "residential",
  "Nassarawa": "residential",
  "Tarauni": "residential",
  "Hotoro": "residential",
  "Kumbotso": "outskirts",
  "Ungogo": "outskirts",
  "Dala": "residential",
  "Gwale": "residential",
  "Bompai": "industrial",
  "Sharada": "industrial",
  "Zaria Road": "outskirts",
  "Airport Road": "outskirts",
};

function randomBetween(min, max) {
  return min + Math.random() * (max - min);
}

function choose(items) {
  return items[Math.floor(Math.random() * items.length)];
}

function disposeObject(object) {
  object.traverse((child) => {
    if (!child.isMesh) return;

    child.geometry?.dispose();

    if (Array.isArray(child.material)) {
      child.material.forEach((material) => material.dispose());
    } else {
      child.material?.dispose();
    }
  });
}

function makeMaterial(color, roughness = 0.92) {
  return new THREE.MeshStandardMaterial({
    color,
    roughness,
    metalness: 0.02,
  });
}

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

    this.playerZ = 0;
    this.initialized = false;
    this.currentDistrict = "Kano City Centre";
    this.currentTheme = "city";

    this._handleRouteChanged = (payload) => {
      const district =
        payload?.district ??
        payload?.name ??
        payload?.route?.district ??
        payload?.route?.name;

      if (district) {
        this.setDistrict(district);
      }
    };

    this._subscribe("route:changed", this._handleRouteChanged);
    this._subscribe("routeChanged", this._handleRouteChanged);
    this._subscribe("district:changed", this._handleRouteChanged);
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

  initialize({
    playerZ = 0,
    district = null,
  } = {}) {
    if (this.initialized) return this;

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

    for (let i = 0; i < totalSegments; i += 1) {
      const segment = this._createSegment(
        firstZ + i * this.config.segmentLength,
        i,
      );

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
    const targetAhead =
      playerZ +
      this.config.segmentsAhead * segmentLength;

    const targetBehind =
      playerZ -
      this.config.segmentsBehind * segmentLength;

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
    this.currentTheme =
      DISTRICT_THEMES[this.currentDistrict] ?? "residential";

    for (const segment of this.segments) {
      this._refreshSegmentTheme(segment);
    }

    this.eventBus?.emit?.("scenery:districtChanged", {
      district: this.currentDistrict,
      theme: this.currentTheme,
    });
  }

  getDistrict() {
    return this.currentDistrict;
  }

  getTheme() {
    return this.currentTheme;
  }

  getSnapshot() {
    return {
      initialized: this.initialized,
      district: this.currentDistrict,
      theme: this.currentTheme,
      segmentCount: this.segments.length,
      playerZ: this.playerZ,
    };
  }

  _detectDistrict() {
    const route = this.routeSystem;

    if (!route) return;

    let district = null;

    if (typeof route.getCurrentDistrict === "function") {
      district = route.getCurrentDistrict();
    } else if (typeof route.getSnapshot === "function") {
      const snapshot = route.getSnapshot();

      district =
        snapshot?.district ??
        snapshot?.currentDistrict ??
        snapshot?.route?.district;
    } else {
      district =
        route.currentDistrict ??
        route.selectedDistrict ??
        route.activeRoute?.district;
    }

    if (district && district !== this.currentDistrict) {
      this.setDistrict(
        typeof district === "string"
          ? district
          : district.name ?? district.title ?? "Kano City Centre",
      );
    }
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
    this._buildRoadFurniture(segment);
    this._refreshSegmentTheme(segment);

    return segment;
  }

  _moveSegment(segment, newZ) {
    segment.z = newZ;
    segment.group.position.z = newZ;
    segment.elapsed = 0;

    this._clearSegmentProps(segment);
    this._buildRoadside(segment);
    this._buildRoadFurniture(segment);
    this._refreshSegmentTheme(segment);
  }

  _buildGround(segment) {
    const length = this.config.segmentLength;
    const groundWidth = 180;

    const ground = this._mesh(
      "ground",
      new THREE.PlaneGeometry(groundWidth, length),
      makeMaterial(0xb4a178),
    );

    ground.rotation.x = -Math.PI / 2;
    ground.position.set(0, -0.08, 0);
    ground.receiveShadow = true;

    segment.group.add(ground);

    const road = this._mesh(
      "road",
      new THREE.PlaneGeometry(this.config.roadWidth, length),
      makeMaterial(0x454747, 0.98),
    );

    road.rotation.x = -Math.PI / 2;
    road.position.set(0, 0, 0);
    road.receiveShadow = true;

    segment.group.add(road);

    const shoulderWidth = 0.65;

    for (const side of [-1, 1]) {
      const shoulder = this._mesh(
        "shoulder",
        new THREE.PlaneGeometry(shoulderWidth, length),
        makeMaterial(0xb0a28a),
      );

      shoulder.rotation.x = -Math.PI / 2;
      shoulder.position.set(
        side * (this.config.roadWidth / 2 + shoulderWidth / 2),
        0.006,
        0,
      );

      segment.group.add(shoulder);

      const sidewalk = this._mesh(
        "sidewalk",
        new THREE.PlaneGeometry(this.config.sidewalkWidth, length),
        makeMaterial(0x9d9789),
      );

      sidewalk.rotation.x = -Math.PI / 2;
      sidewalk.position.set(
        side *
          (this.config.roadWidth / 2 +
            shoulderWidth +
            this.config.sidewalkWidth / 2),
        0.012,
        0,
      );

      segment.group.add(sidewalk);
    }

    this._buildLaneMarkings(segment);
  }

  _buildLaneMarkings(segment) {
    const length = this.config.segmentLength;
    const halfRoad = this.config.roadWidth / 2;

    const edgeMaterial = makeMaterial(0xe5dfc9, 0.85);

    for (const side of [-1, 1]) {
      const line = this._mesh(
        "edge-line",
        new THREE.PlaneGeometry(0.12, length),
        edgeMaterial,
      );

      line.rotation.x = -Math.PI / 2;
      line.position.set(side * (halfRoad - 0.18), 0.025, 0);

      segment.group.add(line);
    }

    const laneMaterial = makeMaterial(0xe4d9a9, 0.9);
    const laneOffsets = [-2, 2];

    for (const x of laneOffsets) {
      for (
        let z = -length / 2 + 3;
        z < length / 2;
        z += 7
      ) {
        const dash = this._mesh(
          "lane-dash",
          new THREE.PlaneGeometry(0.075, 3.4),
          laneMaterial,
        );

        dash.rotation.x = -Math.PI / 2;
        dash.position.set(x, 0.028, z);

        segment.group.add(dash);
      }
    }
  }

  _buildRoadside(segment) {
    const palette = this._getPalette();
    const length = this.config.segmentLength;
    const spacing = this.config.propSpacing;

    for (const side of [-1, 1]) {
      for (
        let localZ = -length / 2 + 3;
        localZ < length / 2;
        localZ += spacing
      ) {
        if (Math.random() > 0.92) continue;

        const x = side * randomBetween(10, 26);
        const z = localZ + randomBetween(-1.5, 1.5);
        const roll = Math.random();

        if (roll < 0.22) {
          this._addBuilding(segment, x, z, side, palette);
        } else if (roll < 0.44) {
          this._addTree(segment, x, z, palette);
        } else if (roll < 0.58) {
          this._addWall(segment, x, z, side, palette);
        } else if (roll < 0.72) {
          this._addStreetStall(segment, x, z, side, palette);
        } else if (roll < 0.84) {
          this._addStreetLight(segment, x, z);
        } else {
          this._addRoadsideSign(segment, x, z, side);
        }
      }
    }
  }

  _buildRoadFurniture(segment) {
    const length = this.config.segmentLength;

    for (const side of [-1, 1]) {
      const curbX =
        side *
        (this.config.roadWidth / 2 +
          this.config.sidewalkWidth +
          0.35);

      for (
        let z = -length / 2 + 4;
        z < length / 2;
        z += 12
      ) {
        const post = this._mesh(
          "bollard",
          this._geometry("cylinder", () =>
            new THREE.CylinderGeometry(0.09, 0.12, 0.8, 8),
          ),
          makeMaterial(0xd6c6a8),
        );

        post.position.set(curbX, 0.4, z);
        segment.group.add(post);
      }
    }
  }

  _addBuilding(segment, x, z, side, palette) {
    const width = randomBetween(4, 9);
    const depth = randomBetween(4, 9);
    const height = randomBetween(3.2, 10);

    const building = new THREE.Group();
    building.position.set(x, 0, z);

    const body = this._mesh(
      "building-body",
      this._geometry("box", () =>
        new THREE.BoxGeometry(width, height, depth),
      ),
      makeMaterial(choose(palette.building)),
    );

    body.position.y = height / 2;
    body.castShadow = true;
    body.receiveShadow = true;

    building.add(body);

    const roofHeight = randomBetween(0.18, 0.5);

    const roof = this._mesh(
      "building-roof",
      this._geometry("box", () =>
        new THREE.BoxGeometry(width + 0.3, roofHeight, depth + 0.3),
      ),
      makeMaterial(choose(palette.roof)),
    );

    roof.position.y = height + roofHeight / 2;
    roof.castShadow = true;

    building.add(roof);

    this._addWindows(building, width, height, depth, side);

    if (this.currentTheme === "market" && Math.random() > 0.5) {
      this._addBuildingSign(building, width, height, depth, side);
    }

    segment.group.add(building);
    segment.props.push(building);
  }

  _addWindows(building, width, height, depth, side) {
    const rows = Math.min(4, Math.floor(height / 2));
    const columns = Math.max(1, Math.floor(width / 2.5));

    const windowMaterial = makeMaterial(0x7e999b, 0.48);
    const windowWidth = 0.55;
    const windowHeight = 0.7;

    const frontZ = -side * (depth / 2 + 0.015);

    for (let row = 0; row < rows; row += 1) {
      for (let col = 0; col < columns; col += 1) {
        const windowMesh = this._mesh(
          "window",
          this._geometry("box", () =>
            new THREE.BoxGeometry(
              windowWidth,
              windowHeight,
              0.045,
            ),
          ),
          windowMaterial,
        );

        const availableWidth = Math.max(0.5, width - 1);
        const spacing = availableWidth / columns;

        windowMesh.position.set(
          -width / 2 + spacing * (col + 0.5),
          1.1 + row * 1.65,
          frontZ,
        );

        building.add(windowMesh);
      }
    }
  }

  _addBuildingSign(building, width, height, depth, side) {
    const sign = this._mesh(
      "shop-sign",
      this._geometry("box", () =>
        new THREE.BoxGeometry(
          Math.min(width * 0.85, 5),
          0.5,
          0.12,
        ),
      ),
      makeMaterial(choose([0x9e4433, 0x35634d, 0x8e713c])),
    );

    sign.position.set(
      0,
      Math.min(height - 0.4, 2.6),
      -side * (depth / 2 + 0.09),
    );

    building.add(sign);
  }

  _addTree(segment, x, z, palette) {
    const tree = new THREE.Group();
    tree.position.set(x, 0, z);

    const trunkHeight = randomBetween(1.5, 2.6);
    const canopyRadius = randomBetween(1.1, 2.1);

    const trunk = this._mesh(
      "tree-trunk",
      this._geometry("cylinder", () =>
        new THREE.CylinderGeometry(0.15, 0.24, trunkHeight, 7),
      ),
      makeMaterial(0x725137),
    );

    trunk.position.y = trunkHeight / 2;
    trunk.castShadow = true;

    tree.add(trunk);

    const canopy = this._mesh(
      "tree-canopy",
      this._geometry("sphere", () =>
        new THREE.IcosahedronGeometry(canopyRadius, 1),
      ),
      makeMaterial(choose(palette.vegetation)),
    );

    canopy.position.y = trunkHeight + canopyRadius * 0.55;
    canopy.scale.y = 0.85;
    canopy.castShadow = true;

    tree.add(canopy);

    segment.group.add(tree);
    segment.props.push(tree);
  }

  _addWall(segment, x, z, side, palette) {
    const wall = this._mesh(
      "compound-wall",
      this._geometry("box", () =>
        new THREE.BoxGeometry(
          randomBetween(5, 10),
          randomBetween(1.2, 2.2),
          0.4,
        ),
      ),
      makeMaterial(choose(palette.building)),
    );

    wall.position.set(x, 0.85, z);
    wall.rotation.y = side * randomBetween(-0.08, 0.08);
    wall.castShadow = true;

    segment.group.add(wall);
    segment.props.push(wall);
  }

  _addStreetStall(segment, x, z, side) {
    const stall = new THREE.Group();
    stall.position.set(x, 0, z);

    const width = randomBetween(1.6, 2.6);
    const height = randomBetween(1.5, 2);

    const counter = this._mesh(
      "stall-counter",
      this._geometry("box", () =>
        new THREE.BoxGeometry(width, 0.8, 1.1),
      ),
      makeMaterial(0x8c6340),
    );

    counter.position.y = 0.4;
    counter.castShadow = true;

    stall.add(counter);

    const canopy = this._mesh(
      "stall-canopy",
      this._geometry("box", () =>
        new THREE.BoxGeometry(width + 0.4, 0.12, 1.5),
      ),
      makeMaterial(choose([0xa94c38, 0x3e6d50, 0xd0a13b])),
    );

    canopy.position.y = height;
    canopy.castShadow = true;

    stall.add(canopy);

    for (const postX of [-width / 2, width / 2]) {
      const post = this._mesh(
        "stall-post",
        this._geometry("cylinder", () =>
          new THREE.CylinderGeometry(0.045, 0.045, height, 6),
        ),
        makeMaterial(0x594633),
      );

      post.position.set(postX, height / 2, 0);
      stall.add(post);
    }

    segment.group.add(stall);
    segment.props.push(stall);
  }

  _addStreetLight(segment, x, z) {
    const light = new THREE.Group();
    light.position.set(x, 0, z);

    const pole = this._mesh(
      "street-light-pole",
      this._geometry("cylinder", () =>
        new THREE.CylinderGeometry(0.07, 0.1, 5.5, 8),
      ),
      makeMaterial(0x626766, 0.75),
    );

    pole.position.y = 2.75;
    pole.castShadow = true;

    light.add(pole);

    const arm = this._mesh(
      "street-light-arm",
      this._geometry("box", () =>
        new THREE.BoxGeometry(1.1, 0.09, 0.09),
      ),
      makeMaterial(0x626766, 0.75),
    );

    arm.position.set(-0.45, 5.25, 0);
    light.add(arm);

    const lamp = this._mesh(
      "street-light-lamp",
      this._geometry("box", () =>
        new THREE.BoxGeometry(0.4, 0.16, 0.28),
      ),
      makeMaterial(0xe4d9b2, 0.5),
    );

    lamp.position.set(-0.95, 5.2, 0);
    light.add(lamp);

    segment.group.add(light);
    segment.props.push(light);
  }

  _addRoadsideSign(segment, x, z, side) {
    const sign = new THREE.Group();
    sign.position.set(x, 0, z);

    const post = this._mesh(
      "sign-post",
      this._geometry("cylinder", () =>
        new THREE.CylinderGeometry(0.07, 0.07, 2, 6),
      ),
      makeMaterial(0x66635b),
    );

    post.position.y = 1;
    sign.add(post);

    const board = this._mesh(
      "sign-board",
      this._geometry("box", () =>
        new THREE.BoxGeometry(1.5, 0.85, 0.12),
      ),
      makeMaterial(choose([0x35624d, 0x245d76, 0x9b4935])),
    );

    board.position.set(0, 2, 0);
    board.rotation.y = side * 0.08;
    sign.add(board);

    segment.group.add(sign);
    segment.props.push(sign);
  }

  _refreshSegmentTheme(segment) {
    segment.theme = this.currentTheme;

    const palette = this._getPalette();

    for (const child of segment.group.children) {
      if (child.name === "ground") {
        child.material = this._material(
          `ground-${this.currentTheme}`,
          palette.ground,
        );
      }
    }
  }

  _getPalette() {
    return PALETTES[this.currentTheme] ?? PALETTES.residential;
  }

  _clearSegmentProps(segment) {
    for (const prop of segment.props) {
      segment.group.remove(prop);
      disposeObject(prop);
    }

    segment.props.length = 0;
  }

  _mesh(name, geometry, material) {
    const mesh = new THREE.Mesh(geometry, material);
    mesh.name = name;
    return mesh;
  }

  _geometry(key, factory) {
    if (!this.sharedGeometries.has(key)) {
      this.sharedGeometries.set(key, factory());
    }

    return this.sharedGeometries.get(key);
  }

  _material(key, color) {
    if (!this.sharedMaterials.has(key)) {
      this.sharedMaterials.set(key, makeMaterial(color));
    }

    return this.sharedMaterials.get(key);
  }

  setWeather(weather) {
    const name =
      typeof weather === "string"
        ? weather
        : weather?.type ?? weather?.weather ?? "clear";

    const isStorm = name === "storm" || name === "rain";
    const isHarmattan = name === "harmattan";

    for (const material of this.sharedMaterials.values()) {
      material.needsUpdate = true;
    }

    this.eventBus?.emit?.("scenery:weatherChanged", {
      weather: name,
      reducedVisibility: isStorm || isHarmattan,
    });
  }

  dispose() {
    for (const dispose of this.disposers) {
      try {
        dispose();
      } catch {
        // Continue releasing remaining resources.
      }
    }

    this.disposers.length = 0;

    for (const segment of this.segments) {
      this._clearSegmentProps(segment);
      this.scene.remove(segment.group);
      disposeObject(segment.group);
    }

    this.segments.length = 0;

    for (const geometry of this.sharedGeometries.values()) {
      geometry.dispose();
    }

    for (const material of this.sharedMaterials.values()) {
      material.dispose();
    }

    this.sharedGeometries.clear();
    this.sharedMaterials.clear();
    this.initialized = false;
  }
}