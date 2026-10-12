import * as THREE from "../vendor/three.module.js";
import { CONFIG } from "./config.js";

const clamp = (value, min, max) =>
  Math.max(min, Math.min(max, value));

const random = (min, max) =>
  min + Math.random() * (max - min);

const COLORS = {
  road: 0x35383c,
  roadMarking: 0xf4d35e,
  pavement: 0x9b968b,
  sand: 0xc6ad7b,
  grass: 0x66794d,
  building: 0xbca88b,
  darkBuilding: 0x8b8275,
  white: 0xf1f0e8,
  black: 0x202329,
  red: 0xc73731,
  green: 0x23764b,
  blue: 0x2864a3,
  yellow: 0xe7bb36,
  orange: 0xd76b25,
  cyan: 0x00b4d8,
};

const PAINT_COLORS = {
  classic: 0x17854b,
  green: 0x17854b,
  blue: 0x2864a3,
  white: 0xf1f0e8,
  red: 0xc73731,
  black: 0x202329,
  purple: 0x7943a8,
  sand: 0xc6ad7b,
  yellow: 0xe7bb36,
};

export class Renderer3D {
  constructor(canvas, options = {}) {
    if (!canvas) {
      throw new Error("Renderer3D requires a canvas element.");
    }

    this.canvas = canvas;
    this.options = options;
    this.config = CONFIG;

    this.disposed = false;
    this.trafficMeshes = new Map();
    this.roadSegments = [];
    this.roadsideObjects = [];
    this.weatherParticles = [];
    this.animationTime = 0;

    this.lanes = this.getLanePositions();
    this.roadWidth = Number(CONFIG.GAME?.ROAD_WIDTH ?? 12);
    this.roadLength = Number(CONFIG.GAME?.ROAD_LENGTH ?? 120);
    this.playerZ = Number(CONFIG.GAME?.PLAYER_Z ?? 5.5);

    this.currentWeather = "clear";
    this.currentTimeOfDay = "day";
    this.cameraMode = "follow";
    this.quality = "high";

    this.playerVehicle = null;
    this.playerWheels = [];
    this.playerTargetX = this.lanes[1] ?? 0;

    this.createRenderer();
    this.createScene();
    this.createCamera();
    this.createLighting();
    this.createWorld();
    this.createPlayerVehicle();
    this.createWeatherSystem();

    this.resize();
  }

  getLanePositions() {
    if (Array.isArray(CONFIG.LANES)) {
      return CONFIG.LANES;
    }

    if (Array.isArray(CONFIG.LANES?.LANE_X)) {
      return CONFIG.LANES.LANE_X;
    }

    if (Array.isArray(CONFIG.LANES?.positions)) {
      return CONFIG.LANES.positions;
    }

    return [-2.4, 0, 2.4];
  }

  createRenderer() {
    this.renderer = new THREE.WebGLRenderer({
      canvas: this.canvas,
      antialias: true,
      alpha: false,
      powerPreference: "high-performance",
    });

    this.renderer.setPixelRatio(
      Math.min(window.devicePixelRatio || 1, 1.75)
    );

    this.renderer.setSize(
      Math.max(1, this.canvas.clientWidth || window.innerWidth),
      Math.max(1, this.canvas.clientHeight || window.innerHeight),
      false
    );

    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    if ("outputColorSpace" in this.renderer) {
      this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    }

    if ("toneMapping" in this.renderer) {
      this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
      this.renderer.toneMappingExposure = 1.05;
    }
  }

  createScene() {
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x9bc9e5);
    this.scene.fog = new THREE.Fog(0x9bc9e5, 65, 190);
  }

  createCamera() {
    this.camera = new THREE.PerspectiveCamera(
      65,
      1,
      0.1,
      350
    );

    this.camera.position.set(0, 6.5, 13);
    this.camera.lookAt(0, 1, -10);
  }

  createLighting() {
    this.ambientLight = new THREE.HemisphereLight(
      0xd9ecff,
      0x786044,
      2
    );

    this.scene.add(this.ambientLight);

    this.sunLight = new THREE.DirectionalLight(0xffe5ba, 2.5);
    this.sunLight.position.set(-25, 35, 18);
    this.sunLight.castShadow = true;

    this.sunLight.shadow.mapSize.set(1024, 1024);
    this.sunLight.shadow.camera.left = -30;
    this.sunLight.shadow.camera.right = 30;
    this.sunLight.shadow.camera.top = 40;
    this.sunLight.shadow.camera.bottom = -30;

    this.scene.add(this.sunLight);
    this.scene.add(this.sunLight.target);
  }

  material(color, options = {}) {
    return new THREE.MeshStandardMaterial({
      color,
      roughness: options.roughness ?? 0.82,
      metalness: options.metalness ?? 0.05,
      ...options,
    });
  }

  createWorld() {
    this.createGround();
    this.createRoad();
    this.createRoadMarkings();
    this.createRoadside();
    this.createHorizon();
  }

  createGround() {
    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(600, 600),
      this.material(COLORS.sand)
    );

    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -0.12;
    ground.position.z = -100;
    ground.receiveShadow = true;

    this.scene.add(ground);
    this.ground = ground;

    const leftShoulder = new THREE.Mesh(
      new THREE.BoxGeometry(8, 0.12, 600),
      this.material(COLORS.sand)
    );

    leftShoulder.position.set(-this.roadWidth / 2 - 4, -0.03, -100);
    this.scene.add(leftShoulder);

    const rightShoulder = leftShoulder.clone();
    rightShoulder.position.x = this.roadWidth / 2 + 4;
    this.scene.add(rightShoulder);
  }

  createRoad() {
    const road = new THREE.Mesh(
      new THREE.PlaneGeometry(this.roadWidth, 600),
      this.material(COLORS.road, { roughness: 0.96 })
    );

    road.rotation.x = -Math.PI / 2;
    road.position.set(0, -0.045, -100);
    road.receiveShadow = true;

    this.scene.add(road);
    this.road = road;

    const edgeMaterial = this.material(0xe2ded3);

    for (const side of [-1, 1]) {
      const edge = new THREE.Mesh(
        new THREE.BoxGeometry(0.13, 0.035, 600),
        edgeMaterial
      );

      edge.position.set(
        side * (this.roadWidth / 2 - 0.12),
        0.015,
        -100
      );

      this.scene.add(edge);
    }
  }

  createRoadMarkings() {
    const markingMaterial = this.material(COLORS.roadMarking);

    const laneCount = this.lanes.length;

    if (laneCount < 2) return;

    const minX = this.lanes[0];
    const maxX = this.lanes[laneCount - 1];

    for (let i = 0; i < laneCount - 1; i++) {
      const x = (this.lanes[i] + this.lanes[i + 1]) / 2;

      for (let z = -390; z < 200; z += 12) {
        const dash = new THREE.Mesh(
          new THREE.BoxGeometry(0.075, 0.025, 5.5),
          markingMaterial
        );

        dash.position.set(x, 0.012, z);
        dash.userData.baseZ = z;

        this.scene.add(dash);
        this.roadSegments.push(dash);
      }
    }

    for (const x of [minX - 1.25, maxX + 1.25]) {
      const line = new THREE.Mesh(
        new THREE.BoxGeometry(0.09, 0.025, 600),
        markingMaterial
      );

      line.position.set(x, 0.01, -100);
      this.scene.add(line);
    }
  }

  createRoadside() {
    const buildingMaterials = [
      this.material(0xc8b28d),
      this.material(0xb1a18c),
      this.material(0xddd0b8),
      this.material(0x9e927f),
      this.material(0xc9c6b6),
    ];

    for (let z = -390; z < 100; z += 17) {
      for (const side of [-1, 1]) {
        const width = random(5, 10);
        const height = random(5, 17);
        const depth = random(7, 13);

        const building = new THREE.Group();

        const body = new THREE.Mesh(
          new THREE.BoxGeometry(width, height, depth),
          pickMaterial(buildingMaterials)
        );

        body.position.y = height / 2;
        body.castShadow = true;
        body.receiveShadow = true;
        building.add(body);

        const roof = new THREE.Mesh(
          new THREE.BoxGeometry(width + 0.35, 0.35, depth + 0.35),
          this.material(0x78634c)
        );

        roof.position.y = height + 0.17;
        building.add(roof);

        const windowMaterial = this.material(0x546a77, {
          metalness: 0.15,
          roughness: 0.35,
        });

        const rows = Math.max(1, Math.floor(height / 3));

        for (let row = 0; row < rows; row++) {
          for (let column = -1; column <= 1; column++) {
            const windowMesh = new THREE.Mesh(
              new THREE.BoxGeometry(0.75, 0.9, 0.08),
              windowMaterial
            );

            windowMesh.position.set(
              column * (width / 4),
              1.8 + row * 2.5,
              depth / 2 + 0.045
            );

            building.add(windowMesh);
          }
        }

        building.position.set(
          side * (this.roadWidth / 2 + 7 + random(0, 4)),
          0,
          z + random(-3, 3)
        );

        this.scene.add(building);
        this.roadsideObjects.push(building);

        if (Math.random() < 0.5) {
          this.addRoadsideTree(
            side * (this.roadWidth / 2 + random(3, 7)),
            z + random(-5, 5)
          );
        }
      }
    }

    this.addRoadSigns();
    this.addStreetLights();
  }

  addRoadsideTree(x, z) {
    const tree = new THREE.Group();

    const trunk = new THREE.Mesh(
      new THREE.CylinderGeometry(0.16, 0.24, 2.3, 7),
      this.material(0x765033)
    );

    trunk.position.y = 1.15;
    tree.add(trunk);

    const crown = new THREE.Mesh(
      new THREE.SphereGeometry(random(1.1, 1.8), 8, 7),
      this.material(pick([0x477347, 0x597d40, 0x6d8a4c]))
    );

    crown.position.y = 3;
    crown.scale.y = 1.2;
    crown.castShadow = true;
    tree.add(crown);

    tree.position.set(x, 0, z);
    this.scene.add(tree);
    this.roadsideObjects.push(tree);
  }

  addRoadSigns() {
    const signMaterial = this.material(0x16764a);
    const postMaterial = this.material(0x777777);

    for (let z = -350; z < 70; z += 75) {
      const side = z % 2 === 0 ? -1 : 1;
      const sign = new THREE.Group();

      const post = new THREE.Mesh(
        new THREE.BoxGeometry(0.12, 2.6, 0.12),
        postMaterial
      );

      post.position.y = 1.3;
      sign.add(post);

      const board = new THREE.Mesh(
        new THREE.BoxGeometry(2.4, 1, 0.15),
        signMaterial
      );

      board.position.y = 2.7;
      sign.add(board);

      sign.position.set(
        side * (this.roadWidth / 2 + 4),
        0,
        z
      );

      this.scene.add(sign);
      this.roadsideObjects.push(sign);
    }
  }

  addStreetLights() {
    const poleMaterial = this.material(0x555b60, {
      metalness: 0.35,
    });

    const lampMaterial = new THREE.MeshStandardMaterial({
      color: 0xfff0bf,
      emissive: 0xffcc75,
      emissiveIntensity: 0.3,
    });

    for (let z = -380; z < 80; z += 38) {
      for (const side of [-1, 1]) {
        const pole = new THREE.Group();

        const vertical = new THREE.Mesh(
          new THREE.CylinderGeometry(0.075, 0.11, 6, 6),
          poleMaterial
        );

        vertical.position.y = 3;
        pole.add(vertical);

        const arm = new THREE.Mesh(
          new THREE.BoxGeometry(1.4, 0.09, 0.09),
          poleMaterial
        );

        arm.position.set(-side * 0.55, 5.8, 0);
        pole.add(arm);

        const lamp = new THREE.Mesh(
          new THREE.BoxGeometry(0.65, 0.13, 0.3),
          lampMaterial
        );

        lamp.position.set(-side * 1.15, 5.7, 0);
        pole.add(lamp);

        pole.position.set(
          side * (this.roadWidth / 2 + 2.5),
          0,
          z
        );

        this.scene.add(pole);
        this.roadsideObjects.push(pole);
      }
    }
  }

  createHorizon() {
    const skyline = new THREE.Group();

    for (let i = 0; i < 32; i++) {
      const width = random(6, 14);
      const height = random(7, 24);
      const depth = random(8, 16);

      const building = new THREE.Mesh(
        new THREE.BoxGeometry(width, height, depth),
        this.material(pick([0x9a9b91, 0xb1a38e, 0x8b928c]))
      );

      building.position.set(
        random(-120, 120),
        height / 2 - 2,
        -180 - random(0, 70)
      );

      skyline.add(building);
    }

    this.scene.add(skyline);
    this.skyline = skyline;
  }

  createVehicleModel(type = "keke", paint = "classic") {
    const group = new THREE.Group();

    const vehicleType = String(type).toLowerCase();
    const color = PAINT_COLORS[paint] ??
      this.getTrafficColor(vehicleType);

    const bodyMaterial = this.material(color, {
      roughness: 0.55,
      metalness: 0.12,
    });

    const darkMaterial = this.material(0x25282c, {
      roughness: 0.85,
    });

    const glassMaterial = this.material(0x9fc8d8, {
      roughness: 0.2,
      metalness: 0.12,
      transparent: true,
      opacity: 0.82,
    });

    const lightMaterial = this.material(0xfff1c6, {
      emissive: 0xffd889,
      emissiveIntensity: 0.25,
    });

    const tailMaterial = this.material(0x9e1e1e, {
      emissive: 0x4a0808,
      emissiveIntensity: 0.15,
    });

    const dimensions = this.getVehicleDimensions(vehicleType);
    const { width, height, length } = dimensions;

    const chassis = new THREE.Mesh(
      new THREE.BoxGeometry(width, height * 0.38, length),
      bodyMaterial
    );

    chassis.position.y = height * 0.4;
    chassis.castShadow = true;
    chassis.receiveShadow = true;
    group.add(chassis);

    if (vehicleType.includes("keke") || vehicleType === "standard" ||
        vehicleType === "luxury" || vehicleType === "cargo" ||
        vehicleType === "open") {
      this.addKekeDetails(
        group,
        bodyMaterial,
        darkMaterial,
        glassMaterial,
        width,
        height,
        length,
        vehicleType
      );
    } else if (vehicleType === "motorcycle") {
      this.addMotorcycleDetails(
        group,
        bodyMaterial,
        darkMaterial,
        glassMaterial
      );
    } else {
      this.addCarDetails(
        group,
        bodyMaterial,
        darkMaterial,
        glassMaterial,
        width,
        height,
        length,
        vehicleType
      );
    }

    this.addWheels(group, darkMaterial, dimensions, vehicleType);

    const front = new THREE.Mesh(
      new THREE.BoxGeometry(width * 0.2, 0.12, 0.08),
      lightMaterial
    );

    front.position.set(0, height * 0.36, -length / 2 - 0.015);
    group.add(front);

    const tail = new THREE.Mesh(
      new THREE.BoxGeometry(width * 0.35, 0.12, 0.08),
      tailMaterial
    );

    tail.position.set(0, height * 0.36, length / 2 + 0.015);
    group.add(tail);

    if (vehicleType === "police" || vehicleType === "karota") {
      this.addServiceLights(group, vehicleType, width, height);
    }

    if (vehicleType === "robber") {
      this.addRobberDetails(group, width, height, length);
    }

    group.userData.vehicleType = vehicleType;
    group.userData.baseHeight = 0;

    return group;
  }

  getVehicleDimensions(type) {
    if (type === "bus") {
      return { width: 2.2, height: 2.6, length: 5.8 };
    }

    if (type === "truck") {
      return { width: 2.4, height: 2.8, length: 6.5 };
    }

    if (type === "motorcycle") {
      return { width: 0.8, height: 1.35, length: 2.1 };
    }

    if (type === "keke" || type === "standard" || type === "luxury" ||
        type === "cargo" || type === "open") {
      return { width: 1.35, height: 1.8, length: 2.8 };
    }

    if (type === "police" || type === "karota") {
      return { width: 1.8, height: 1.65, length: 4.2 };
    }

    return { width: 1.8, height: 1.55, length: 4.1 };
  }

  addKekeDetails(group, body, dark, glass, width, height, length, type) {
    const roof = new THREE.Mesh(
      new THREE.BoxGeometry(width * 0.94, 0.12, length * 0.68),
      type === "luxury" ? this.material(0x20252b) : body
    );

    roof.position.set(0, height * 0.91, 0.1);
    roof.castShadow = true;
    group.add(roof);

    for (const side of [-1, 1]) {
      const support = new THREE.Mesh(
        new THREE.BoxGeometry(0.07, height * 0.46, 0.07),
        dark
      );

      support.position.set(side * width * 0.42, height * 0.66, 0.12);
      group.add(support);

      const window = new THREE.Mesh(
        new THREE.BoxGeometry(0.04, height * 0.29, length * 0.4),
        glass
      );

      window.position.set(
        side * width * 0.47,
        height * 0.68,
        0.05
      );

      group.add(window);
    }

    const frontWindow = new THREE.Mesh(
      new THREE.BoxGeometry(width * 0.65, height * 0.28, 0.055),
      glass
    );

    frontWindow.position.set(0, height * 0.69, -length * 0.36);
    group.add(frontWindow);

    if (type === "cargo") {
      const cargo = new THREE.Mesh(
        new THREE.BoxGeometry(width * 0.8, 0.55, length * 0.36),
        this.material(0x8b7252)
      );

      cargo.position.set(0, height * 0.75, length * 0.27);
      group.add(cargo);
    }

    if (type === "open") {
      const seat = new THREE.Mesh(
        new THREE.BoxGeometry(width * 0.58, 0.2, length * 0.25),
        this.material(0x3e342c)
      );

      seat.position.set(0, height * 0.48, 0.18);
      group.add(seat);
    }
  }

  addCarDetails(group, body, dark, glass, width, height, length, type) {
    const cabinLength = type === "bus" ? length * 0.78 : length * 0.52;
    const cabinHeight = type === "bus" ? height * 0.48 : height * 0.45;

    const cabin = new THREE.Mesh(
      new THREE.BoxGeometry(width * 0.78, cabinHeight, cabinLength),
      type === "truck" ? dark : body
    );

    cabin.position.set(
      0,
      height * 0.68,
      type === "truck" ? -length * 0.12 : 0.04
    );

    cabin.castShadow = true;
    group.add(cabin);

    const frontGlass = new THREE.Mesh(
      new THREE.BoxGeometry(width * 0.64, cabinHeight * 0.65, 0.055),
      glass
    );

    frontGlass.position.set(
      0,
      cabin.position.y + 0.03,
      cabin.position.z - cabinLength * 0.5 - 0.03
    );

    group.add(frontGlass);

    if (type === "bus") {
      for (let i = 0; i < 4; i++) {
        const window = new THREE.Mesh(
          new THREE.BoxGeometry(width * 0.035, 0.55, 0.7),
          glass
        );

        window.position.set(
          width * 0.4,
          height * 0.72,
          -length * 0.27 + i * length * 0.16
        );

        group.add(window);

        const opposite = window.clone();
        opposite.position.x *= -1;
        group.add(opposite);
      }
    }

    if (type === "truck") {
      const cargo = new THREE.Mesh(
        new THREE.BoxGeometry(width * 0.92, height * 0.47, length * 0.48),
        this.material(0x7c8a91)
      );

      cargo.position.set(0, height * 0.68, length * 0.23);
      cargo.castShadow = true;
      group.add(cargo);
    }

    if (type === "taxi") {
      const roofSign = new THREE.Mesh(
        new THREE.BoxGeometry(0.55, 0.16, 0.3),
        this.material(0xf2d34f)
      );

      roofSign.position.set(0, height * 0.97, 0);
      group.add(roofSign);
    }
  }

  addMotorcycleDetails(group, body, dark, glass) {
    const frame = new THREE.Mesh(
      new THREE.BoxGeometry(0.32, 0.38, 1.05),
      dark
    );

    frame.position.y = 0.6;
    group.add(frame);

    const tank = new THREE.Mesh(
      new THREE.SphereGeometry(0.28, 8, 6),
      body
    );

    tank.scale.set(1, 0.7, 1.25);
    tank.position.set(0, 0.87, -0.1);
    group.add(tank);

    const seat = new THREE.Mesh(
      new THREE.BoxGeometry(0.3, 0.13, 0.55),
      dark
    );

    seat.position.set(0, 0.94, 0.35);
    group.add(seat);

    const handle = new THREE.Mesh(
      new THREE.BoxGeometry(0.8, 0.06, 0.07),
      dark
    );

    handle.position.set(0, 1.04, -0.68);
    group.add(handle);

    const rider = new THREE.Mesh(
      new THREE.SphereGeometry(0.22, 8, 7),
      this.material(0x5a4539)
    );

    rider.position.set(0, 1.22, 0.05);
    group.add(rider);

    const helmet = new THREE.Mesh(
      new THREE.SphereGeometry(0.19, 8, 7),
      this.material(0x20252a)
    );

    helmet.position.set(0, 1.42, -0.02);
    group.add(helmet);
  }

  addWheels(group, dark, dimensions, type) {
    const { width, length } = dimensions;

    const wheelGeometry = new THREE.CylinderGeometry(
      type === "motorcycle" ? 0.32 : 0.34,
      type === "motorcycle" ? 0.32 : 0.34,
      type === "motorcycle" ? 0.18 : 0.2,
      12
    );

    const wheelPositions = type === "motorcycle"
      ? [[0, 0.34, -length * 0.34], [0, 0.34, length * 0.34]]
      : [
          [-width * 0.48, 0.34, -length * 0.31],
          [width * 0.48, 0.34, -length * 0.31],
          [-width * 0.48, 0.34, length * 0.31],
          [width * 0.48, 0.34, length * 0.31],
        ];

    wheelPositions.forEach(([x, y, z]) => {
      const wheel = new THREE.Mesh(wheelGeometry, dark);

      wheel.rotation.z = Math.PI / 2;
      wheel.position.set(x, y, z);
      wheel.castShadow = true;

      group.add(wheel);
      this.playerWheels.push(wheel);
    });
  }

  addServiceLights(group, type, width, height) {
    const lightBar = new THREE.Group();

    const base = new THREE.Mesh(
      new THREE.BoxGeometry(width * 0.45, 0.1, 0.28),
      this.material(0x222222)
    );

    lightBar.add(base);

    const red = new THREE.Mesh(
      new THREE.BoxGeometry(width * 0.18, 0.16, 0.2),
      this.material(0xff2020, {
        emissive: 0xff0000,
        emissiveIntensity: 0.6,
      })
    );

    red.position.x = -width * 0.12;
    red.position.y = 0.1;
    lightBar.add(red);

    const blue = new THREE.Mesh(
      new THREE.BoxGeometry(width * 0.18, 0.16, 0.2),
      this.material(0x247bff, {
        emissive: 0x0055ff,
        emissiveIntensity: 0.6,
      })
    );

    blue.position.x = width * 0.12;
    blue.position.y = 0.1;
    lightBar.add(blue);

    lightBar.position.set(0, height + 0.1, 0);
    group.add(lightBar);

    group.userData.serviceLights = [red, blue];
    group.userData.serviceType = type;
  }

  addRobberDetails(group, width, height, length) {
    const covering = new THREE.Mesh(
      new THREE.BoxGeometry(width * 0.4, 0.35, 0.08),
      this.material(0x181818)
    );

    covering.position.set(0, height * 0.8, -length * 0.35);
    group.add(covering);
  }

  getTrafficColor(type) {
    const colors = {
      car: COLORS.white,
      taxi: COLORS.yellow,
      bus: COLORS.orange,
      motorcycle: COLORS.black,
      truck: COLORS.blue,
      keke: COLORS.green,
      police: COLORS.white,
      karota: COLORS.green,
      robber: COLORS.black,
    };

    return colors[type] ?? COLORS.white;
  }

  createPlayerVehicle(options = {}) {
    if (this.playerVehicle) {
      this.scene.remove(this.playerVehicle);
      this.disposeObject(this.playerVehicle);
    }

    this.playerWheels = [];

    const vehicle = options.vehicle ?? "standard";
    const vehicleId = typeof vehicle === "string"
      ? vehicle
      : vehicle.id ?? vehicle.slug ?? "standard";

    const paint = options.paint ?? "classic";
    const paintId = typeof paint === "string"
      ? paint
      : paint.id ?? paint.slug ?? "classic";

    this.playerVehicle = this.createVehicleModel(vehicleId, paintId);
    this.playerVehicle.position.set(this.playerTargetX, 0, this.playerZ);
    this.playerVehicle.rotation.y = 0;

    this.scene.add(this.playerVehicle);

    return this.playerVehicle;
  }

  setPlayerLane(lane) {
    const index = clamp(
      Math.round(Number(lane) || 0),
      0,
      this.lanes.length - 1
    );

    this.playerTargetX = this.lanes[index] ?? 0;
  }

  updatePlayerVehicle(state = {}) {
    if (!this.playerVehicle) return;

    const dt = clamp(Number(state.dt ?? 0.016), 0, 0.05);

    if (Number.isFinite(state.lane)) {
      this.setPlayerLane(state.lane);
    }

    const difference = this.playerTargetX - this.playerVehicle.position.x;

    this.playerVehicle.position.x += difference * Math.min(1, dt * 9);
    this.playerVehicle.rotation.z = clamp(-difference * 0.08, -0.12, 0.12);

    if (Number.isFinite(state.speed)) {
      const speed = clamp(state.speed / 34, 0, 1);
      this.playerVehicle.position.y = Math.sin(this.animationTime * 7) * 0.015;
      this.playerVehicle.rotation.x = -speed * 0.015;
    }

    for (const wheel of this.playerWheels) {
      wheel.rotation.x += dt * (Number(state.speed ?? 0) * 0.7);
    }
  }

  addTrafficVehicle(options = {}) {
    const id = String(options.id ?? `traffic-${this.trafficMeshes.size}`);
    const type = String(options.type ?? "car").toLowerCase();

    if (this.trafficMeshes.has(id)) {
      this.removeTrafficVehicle(id);
    }

    const vehicle = this.createVehicleModel(type, this.getTrafficColor(type));
    const lane = clamp(
      Math.round(Number(options.lane ?? 1)),
      0,
      this.lanes.length - 1
    );

    vehicle.position.set(
      this.lanes[lane] ?? 0,
      0,
      Number(options.z ?? -80)
    );

    if (type === "motorcycle") {
      vehicle.scale.setScalar(0.8);
    } else if (type === "bus" || type === "truck") {
      vehicle.scale.setScalar(1.08);
    }

    vehicle.userData.trafficId = id;
    vehicle.userData.trafficType = type;
    vehicle.userData.lane = lane;
    vehicle.userData.speed = Number(options.speed ?? 10);

    this.scene.add(vehicle);
    this.trafficMeshes.set(id, vehicle);

    return vehicle;
  }

  updateTrafficVehicle(id, data = {}) {
    const vehicle = this.trafficMeshes.get(String(id));
    if (!vehicle) return;

    if (Number.isFinite(data.z)) {
      vehicle.position.z = data.z;
    }

    if (Number.isFinite(data.lane)) {
      const lane = clamp(
        Math.round(data.lane),
        0,
        this.lanes.length - 1
      );

      vehicle.userData.lane = lane;
      vehicle.position.x = this.lanes[lane] ?? 0;
    }

    if (Number.isFinite(data.speed)) {
      vehicle.userData.speed = data.speed;
    }

    const lights = vehicle.userData.serviceLights;

    if (lights) {
      const flash = Math.sin(this.animationTime * 12) > 0;
      lights[0].visible = flash;
      lights[1].visible = !flash;
    }
  }

  removeTrafficVehicle(id) {
    const key = String(id);
    const vehicle = this.trafficMeshes.get(key);

    if (!vehicle) return;

    this.scene.remove(vehicle);
    this.disposeObject(vehicle);
    this.trafficMeshes.delete(key);
  }

  clearTraffic() {
    for (const id of this.trafficMeshes.keys()) {
      this.removeTrafficVehicle(id);
    }
  }

  createWeatherSystem() {
    const geometry = new THREE.BufferGeometry();
    const count = 700;
    const positions = new Float32Array(count * 3);

    for (let i = 0; i < count; i++) {
      positions[i * 3] = random(-25, 25);
      positions[i * 3 + 1] = random(0, 22);
      positions[i * 3 + 2] = random(-100, 30);
    }

    geometry.setAttribute(
      "position",
      new THREE.BufferAttribute(positions, 3)
    );

    const material = new THREE.PointsMaterial({
      color: 0xc9e8ff,
      size: 0.09,
      transparent: true,
      opacity: 0.75,
      depthWrite: false,
    });

    this.weatherPoints = new THREE.Points(geometry, material);
    this.weatherPoints.visible = false;

    this.scene.add(this.weatherPoints);
  }

  setWeather(weather) {
    const value = String(weather ?? "clear").toLowerCase();

    this.currentWeather = value;

    const rainy = value.includes("rain") || value.includes("storm");
    const dusty = value.includes("dust") || value.includes("harmattan");
    const foggy = value.includes("fog");

    if (this.weatherPoints) {
      this.weatherPoints.visible = rainy;
      this.weatherPoints.material.size = 0.08;
      this.weatherPoints.material.color.setHex(
        rainy ? 0xc9e8ff : 0xd7c6a2
      );
    }

    const background = rainy
      ? 0x596b79
      : dusty
        ? 0xc4ad8a
        : foggy
          ? 0xabb6bb
          : 0x9bc9e5;

    this.scene.background = new THREE.Color(background);

    this.scene.fog.color.setHex(background);
    this.scene.fog.near = foggy ? 22 : dusty ? 30 : 65;
    this.scene.fog.far = foggy ? 100 : dusty ? 120 : 190;

    this.sunLight.intensity = rainy ? 1.0 : dusty ? 1.4 : 2.5;
  }

  setTimeOfDay(timeOfDay) {
    const value = String(timeOfDay ?? "day").toLowerCase();

    this.currentTimeOfDay = value;

    if (value.includes("night")) {
      this.scene.background = new THREE.Color(0x111c31);
      this.scene.fog.color.setHex(0x111c31);
      this.sunLight.intensity = 0.25;
      this.ambientLight.intensity = 0.6;
    } else if (value.includes("sunset") || value.includes("evening")) {
      this.scene.background = new THREE.Color(0xe19b72);
      this.scene.fog.color.setHex(0xe19b72);
      this.sunLight.intensity = 1.25;
      this.ambientLight.intensity = 1.1;
    } else {
      this.scene.background = new THREE.Color(0x9bc9e5);
      this.scene.fog.color.setHex(0x9bc9e5);
      this.sunLight.intensity = 2.5;
      this.ambientLight.intensity = 2;
    }

    if (value.includes("night")) {
      this.scene.fog.near = 35;
      this.scene.fog.far = 130;
    } else {
      this.scene.fog.near = 65;
      this.scene.fog.far = 190;
    }
  }

  setCameraMode(mode) {
    this.cameraMode = String(mode ?? "follow");
  }

  setQuality(quality) {
    this.quality = String(quality ?? "high");

    const pixelRatio = this.quality === "low"
      ? 1
      : this.quality === "medium"
        ? Math.min(window.devicePixelRatio || 1, 1.25)
        : Math.min(window.devicePixelRatio || 1, 1.75);

    this.renderer.setPixelRatio(pixelRatio);
    this.renderer.shadowMap.enabled = this.quality === "high";
    this.resize();
  }

  update(dt = 0.016) {
    if (this.disposed) return;

    const delta = clamp(Number(dt) || 0, 0, 0.05);

    this.animationTime += delta;

    this.updateCamera(delta);
    this.updateRoadside(delta);
    this.updateWeather(delta);
  }

  updateCamera(dt) {
    if (!this.playerVehicle) return;

    let targetY = 6.5;
    let targetZ = this.playerZ + 7.5;
    let lookY = 1.2;
    let lookZ = this.playerZ - 10;

    if (this.cameraMode === "close") {
      targetY = 4.2;
      targetZ = this.playerZ + 4.2;
      lookY = 1;
      lookZ = this.playerZ - 8;
    } else if (this.cameraMode === "high") {
      targetY = 11;
      targetZ = this.playerZ + 10;
      lookY = 0;
      lookZ = this.playerZ - 15;
    }

    const targetX = this.playerVehicle.position.x * 0.45;

    this.camera.position.x +=
      (targetX - this.camera.position.x) * Math.min(1, dt * 3.5);

    this.camera.position.y +=
      (targetY - this.camera.position.y) * Math.min(1, dt * 2.5);

    this.camera.position.z +=
      (targetZ - this.camera.position.z) * Math.min(1, dt * 2.5);

    this.camera.lookAt(
      this.playerVehicle.position.x * 0.2,
      lookY,
      lookZ
    );
  }

  updateRoadside(dt) {
    const speed = 10;

    for (const object of this.roadsideObjects) {
      object.position.z += speed * dt;

      if (object.position.z > 45) {
        object.position.z -= 490;
      }
    }
  }

  updateWeather(dt) {
    if (!this.weatherPoints?.visible) return;

    const positions = this.weatherPoints.geometry.attributes.position;

    for (let i = 0; i < positions.count; i++) {
      positions.array[i * 3 + 1] -= 16 * dt;
      positions.array[i * 3 + 2] += 5 * dt;

      if (positions.array[i * 3 + 1] < 0) {
        positions.array[i * 3 + 1] = random(12, 24);
        positions.array[i * 3] = random(-25, 25);
        positions.array[i * 3 + 2] = random(-100, 30);
      }
    }

    positions.needsUpdate = true;
  }

  render() {
    if (!this.disposed) {
      this.renderer.render(this.scene, this.camera);
    }
  }

  resize() {
    if (this.disposed || !this.renderer || !this.camera) return;

    const width = Math.max(
      1,
      this.canvas.clientWidth || window.innerWidth
    );

    const height = Math.max(
      1,
      this.canvas.clientHeight || window.innerHeight
    );

    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();

    this.renderer.setSize(width, height, false);
  }

  disposeObject(object) {
    object.traverse?.((child) => {
      if (child.geometry) {
        child.geometry.dispose();
      }

      if (child.material) {
        const materials = Array.isArray(child.material)
          ? child.material
          : [child.material];

        materials.forEach((material) => material.dispose());
      }
    });
  }

  dispose() {
    if (this.disposed) return;

    this.disposed = true;

    this.clearTraffic();

    this.scene.traverse((object) => {
      if (object.geometry) {
        object.geometry.dispose();
      }

      if (object.material) {
        const materials = Array.isArray(object.material)
          ? object.material
          : [object.material];

        materials.forEach((material) => material.dispose());
      }
    });

    this.renderer.dispose();
  }
}

function pickMaterial(materials) {
  return materials[Math.floor(Math.random() * materials.length)];
}

export default Renderer3D;