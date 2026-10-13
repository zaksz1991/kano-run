import * as THREE from "../../vendor/three.module.js";
import { GAME_CONFIG } from "../core/config.js";

const DEFAULTS = {
  maxVehicles: 40,
  spawnDistance: 150,
  despawnDistance: 65,
  laneWidth: 3.2,
  roadWidth: 12,
  playerCollisionRadius: 1.1,
  minimumSpawnGap: 16,
  vehicleCollisionGap: 8,
  maxSpawnAttempts: 12,
};

const VEHICLE_SPECS = {
  car: {
    width: 1.8,
    height: 1.45,
    length: 4.1,
    maxSpeed: 23,
    acceleration: 2.2,
    weight: 1.2,
    color: [0xc0392b, 0x2471a3, 0xf4d03f, 0xecf0f1, 0x273746],
  },
  taxi: {
    width: 1.85,
    height: 1.5,
    length: 4.3,
    maxSpeed: 19,
    acceleration: 1.8,
    weight: 1.3,
    color: [0xf4d03f, 0xf7dc6f, 0xfdfefe],
  },
  keke: {
    width: 1.35,
    height: 1.75,
    length: 2.6,
    maxSpeed: 14,
    acceleration: 2.8,
    weight: 0.7,
    color: [0x1e8449, 0xf1c40f, 0x2471a3, 0xd35400],
  },
  bus: {
    width: 2.35,
    height: 2.8,
    length: 7.4,
    maxSpeed: 15,
    acceleration: 1.1,
    weight: 3.8,
    color: [0xf39c12, 0x2471a3, 0x1e8449, 0xf4d03f],
  },
  motorcycle: {
    width: 0.8,
    height: 1.4,
    length: 2,
    maxSpeed: 24,
    acceleration: 3.4,
    weight: 0.4,
    color: [0x17202a, 0xc0392b, 0xf4d03f],
  },
  truck: {
    width: 2.5,
    height: 3,
    length: 8,
    maxSpeed: 13,
    acceleration: 0.8,
    weight: 5,
    color: [0x95a5a6, 0xd35400, 0x566573],
  },
  police: {
    width: 1.9,
    height: 1.6,
    length: 4.4,
    maxSpeed: 25,
    acceleration: 2.8,
    weight: 1.5,
    color: [0xfdfefe, 0x2471a3],
  },
  karota: {
    width: 1.9,
    height: 1.6,
    length: 4.3,
    maxSpeed: 20,
    acceleration: 2.1,
    weight: 1.4,
    color: [0xf39c12, 0xfdfefe],
  },
};

const VEHICLE_TYPES = Object.keys(VEHICLE_SPECS);

function randomBetween(min, max) {
  return min + Math.random() * (max - min);
}

function choose(items) {
  return items[Math.floor(Math.random() * items.length)];
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function disposeVehicle(vehicle) {
  vehicle.group.traverse((object) => {
    if (!object.isMesh) return;

    object.geometry?.dispose();

    if (Array.isArray(object.material)) {
      object.material.forEach((material) => material.dispose());
    } else {
      object.material?.dispose();
    }
  });
}

export default class VehicleSystem {
  constructor({
    scene,
    camera = null,
    player = null,
    drivingSystem = null,
    collisionSystem = null,
    trafficSystem = null,
    eventBus = null,
    config = {},
  } = {}) {
    if (!scene) {
      throw new Error("VehicleSystem requires a Three.js scene.");
    }

    this.scene = scene;
    this.camera = camera;
    this.player = player;
    this.drivingSystem = drivingSystem;
    this.collisionSystem = collisionSystem;
    this.trafficSystem = trafficSystem;
    this.eventBus = eventBus;

    this.config = {
      ...DEFAULTS,
      ...(GAME_CONFIG?.traffic ?? {}),
      ...config,
    };

    this.vehicles = new Map();
    this.nextVehicleId = 1;
    this.playerZ = 0;
    this.playerLane = 1;
    this.playerSpeed = 0;
    this.spawnTimer = 0;
    this.initialized = false;
    this.paused = false;

    this.spawnWeights = {
      car: 30,
      taxi: 17,
      keke: 22,
      bus: 8,
      motorcycle: 12,
      truck: 5,
      police: 3,
      karota: 3,
    };

    this._onRunStarted = () => {
      this.paused = false;
    };

    this._onRunEnded = () => {
      this.paused = true;
    };

    this._subscribe("game:started", this._onRunStarted);
    this._subscribe("game:finished", this._onRunEnded);
    this._subscribe("game:over", this._onRunEnded);
    this._subscribe("game:paused", () => {
      this.paused = true;
    });
    this._subscribe("game:resumed", () => {
      this.paused = false;
    });
  }

  _subscribe(eventName, handler) {
    if (!this.eventBus?.on) return;

    const result = this.eventBus.on(eventName, handler);

    if (typeof result === "function") {
      this._disposers ??= [];
      this._disposers.push(result);
    } else if (this.eventBus.off) {
      this._disposers ??= [];
      this._disposers.push(() =>
        this.eventBus.off(eventName, handler),
      );
    }
  }

  initialize({
    playerZ = 0,
    playerLane = 1,
    initialVehicles = 8,
  } = {}) {
    if (this.initialized) return this;

    this.playerZ = playerZ;
    this.playerLane = clamp(playerLane, 0, 2);

    for (let i = 0; i < initialVehicles; i += 1) {
      const z =
        playerZ +
        28 +
        i * (this.config.spawnDistance / initialVehicles);

      this.spawnVehicle({
        z,
        preferredLane: i % 3,
      });
    }

    this.initialized = true;

    this.eventBus?.emit?.("vehicles:initialized", {
      count: this.vehicles.size,
    });

    return this;
  }

  update(deltaTime, state = {}) {
    if (!this.initialized || this.paused) return;

    const dt = clamp(deltaTime || 0, 0, 0.05);

    this.playerZ =
      Number.isFinite(state.playerZ)
        ? state.playerZ
        : this.playerZ;

    this.playerLane =
      Number.isFinite(state.playerLane)
        ? clamp(state.playerLane, 0, 2)
        : this.playerLane;

    this.playerSpeed =
      Number.isFinite(state.playerSpeed)
        ? Math.max(0, state.playerSpeed)
        : this.playerSpeed;

    this._updateVehicles(dt);
    this._removeDistantVehicles();
    this._spawnTraffic(dt);
  }

  spawnVehicle({
    type = null,
    z = this.playerZ + this.config.spawnDistance,
    preferredLane = null,
    speed = null,
  } = {}) {
    if (this.vehicles.size >= this.config.maxVehicles) {
      return null;
    }

    const vehicleType = type ?? this._chooseVehicleType();
    const spec = VEHICLE_SPECS[vehicleType];

    if (!spec) {
      throw new Error(`Unknown vehicle type: ${vehicleType}`);
    }

    const lane = this._findSafeLane(
      z,
      preferredLane,
      spec.length,
    );

    if (lane === null) return null;

    const vehicle = this._createVehicle(vehicleType);

    vehicle.id = `traffic-${this.nextVehicleId++}`;
    vehicle.type = vehicleType;
    vehicle.spec = spec;
    vehicle.lane = lane;
    vehicle.targetLane = lane;
    vehicle.z = z;
    vehicle.speed =
      speed ?? randomBetween(spec.maxSpeed * 0.45, spec.maxSpeed * 0.85);
    vehicle.cruiseSpeed = vehicle.speed;
    vehicle.damage = 0;
    vehicle.wanderTimer = randomBetween(2, 6);
    vehicle.changeLaneTimer = randomBetween(3, 8);
    vehicle.stopped = false;

    vehicle.group.position.set(
      this._laneX(lane),
      0,
      z,
    );

    this.vehicles.set(vehicle.id, vehicle);
    this.scene.add(vehicle.group);

    this.eventBus?.emit?.("vehicle:spawned", {
      id: vehicle.id,
      type: vehicle.type,
      lane: vehicle.lane,
      z: vehicle.z,
      speed: vehicle.speed,
    });

    return vehicle;
  }

  removeVehicle(id, reason = "removed") {
    const vehicle = this.vehicles.get(id);

    if (!vehicle) return false;

    this.scene.remove(vehicle.group);
    disposeVehicle(vehicle);
    this.vehicles.delete(id);

    this.eventBus?.emit?.("vehicle:removed", {
      id,
      type: vehicle.type,
      reason,
    });

    return true;
  }

  getVehicle(id) {
    return this.vehicles.get(id) ?? null;
  }

  getVehicles() {
    return Array.from(this.vehicles.values()).map((vehicle) => ({
      id: vehicle.id,
      type: vehicle.type,
      lane: vehicle.lane,
      targetLane: vehicle.targetLane,
      x: vehicle.group.position.x,
      y: vehicle.group.position.y,
      z: vehicle.z,
      speed: vehicle.speed,
      length: vehicle.spec.length,
      width: vehicle.spec.width,
      damage: vehicle.damage,
    }));
  }

  getSnapshot() {
    const counts = {};

    for (const vehicle of this.vehicles.values()) {
      counts[vehicle.type] = (counts[vehicle.type] ?? 0) + 1;
    }

    return {
      initialized: this.initialized,
      paused: this.paused,
      count: this.vehicles.size,
      playerZ: this.playerZ,
      playerLane: this.playerLane,
      playerSpeed: this.playerSpeed,
      counts,
    };
  }

  _updateVehicles(dt) {
    for (const vehicle of this.vehicles.values()) {
      this._updateLaneChange(vehicle, dt);
      this._updateFollowing(vehicle, dt);

      if (vehicle.stopped) {
        vehicle.speed = Math.max(0, vehicle.speed - 5 * dt);
      }

      vehicle.z -= vehicle.speed * dt;

      vehicle.group.position.x = THREE.MathUtils.damp(
        vehicle.group.position.x,
        this._laneX(vehicle.targetLane),
        5,
        dt,
      );

      vehicle.group.position.z = vehicle.z;

      this._avoidVehicleAhead(vehicle, dt);
      this._checkPlayerProximity(vehicle);
    }
  }

  _updateLaneChange(vehicle, dt) {
    vehicle.changeLaneTimer -= dt;

    if (vehicle.changeLaneTimer > 0) return;

    vehicle.changeLaneTimer = randomBetween(3, 8);

    if (Math.random() > 0.28) return;

    const candidates = [
      vehicle.lane - 1,
      vehicle.lane + 1,
    ].filter((lane) => lane >= 0 && lane <= 2);

    for (const candidate of candidates.sort(() => Math.random() - 0.5)) {
      if (
        this._isLaneSafe(
          candidate,
          vehicle.z,
          vehicle.spec.length,
          vehicle.id,
        )
      ) {
        vehicle.targetLane = candidate;
        vehicle.lane = candidate;

        this.eventBus?.emit?.("vehicle:laneChanged", {
          id: vehicle.id,
          lane: candidate,
        });

        break;
      }
    }
  }

  _updateFollowing(vehicle, dt) {
    let nearestGap = Infinity;
    let frontVehicle = null;

    for (const other of this.vehicles.values()) {
      if (other.id === vehicle.id) continue;
      if (other.lane !== vehicle.lane) continue;

      const gap = other.z - vehicle.z;

      if (
        gap > 0 &&
        gap < nearestGap
      ) {
        nearestGap = gap;
        frontVehicle = other;
      }
    }

    if (!frontVehicle) {
      vehicle.speed = THREE.MathUtils.damp(
        vehicle.speed,
        vehicle.cruiseSpeed,
        0.65,
        dt,
      );
      return;
    }

    const safeGap =
      (vehicle.spec.length + frontVehicle.spec.length) / 2 +
      this.config.vehicleCollisionGap;

    if (nearestGap < safeGap) {
      vehicle.speed = Math.max(
        0,
        vehicle.speed - 9 * dt,
      );

      if (nearestGap < safeGap * 0.65) {
        const sideLane = this._findAdjacentSafeLane(vehicle);

        if (sideLane !== null) {
          vehicle.targetLane = sideLane;
          vehicle.lane = sideLane;
        }
      }
    } else {
      vehicle.speed = THREE.MathUtils.damp(
        vehicle.speed,
        vehicle.cruiseSpeed,
        0.8,
        dt,
      );
    }
  }

  _avoidVehicleAhead(vehicle, dt) {
    const playerGap = vehicle.z - this.playerZ;

    if (playerGap < 0 || playerGap > 18) return;
    if (vehicle.lane !== this.playerLane) return;

    const relativeSpeed = this.playerSpeed - vehicle.speed;

    if (relativeSpeed <= 0) return;

    if (playerGap < 10) {
      const sideLane = this._findAdjacentSafeLane(vehicle);

      if (sideLane !== null) {
        vehicle.targetLane = sideLane;
        vehicle.lane = sideLane;
      } else {
        vehicle.speed = Math.max(
          0,
          vehicle.speed - 6 * dt,
        );
      }
    }
  }

  _checkPlayerProximity(vehicle) {
    const longitudinalGap = Math.abs(vehicle.z - this.playerZ);

    if (longitudinalGap > 4.5) return;

    if (vehicle.lane === this.playerLane) {
      this.eventBus?.emit?.("vehicle:playerThreat", {
        id: vehicle.id,
        type: vehicle.type,
        lane: vehicle.lane,
        distance: longitudinalGap,
      });
    }
  }

  _spawnTraffic(dt) {
    this.spawnTimer -= dt;

    if (this.spawnTimer > 0) return;
    if (this.vehicles.size >= this.config.maxVehicles) return;

    const densityFactor = clamp(
      this.playerSpeed / 18,
      0.45,
      1.4,
    );

    this.spawnTimer = randomBetween(0.55, 1.25) / densityFactor;

    const z =
      this.playerZ +
      randomBetween(
        this.config.spawnDistance * 0.65,
        this.config.spawnDistance,
      );

    this.spawnVehicle({
      z,
      preferredLane: Math.floor(Math.random() * 3),
    });
  }

  _removeDistantVehicles() {
    for (const vehicle of this.vehicles.values()) {
      if (
        vehicle.z <
        this.playerZ - this.config.despawnDistance
      ) {
        this.removeVehicle(vehicle.id, "behind-player");
      }
    }
  }

  _createVehicle(type) {
    const spec = VEHICLE_SPECS[type];
    const group = new THREE.Group();

    const bodyMaterial = new THREE.MeshStandardMaterial({
      color: choose(spec.color),
      roughness: 0.72,
      metalness: 0.05,
    });

    const darkMaterial = new THREE.MeshStandardMaterial({
      color: 0x252a2c,
      roughness: 0.92,
    });

    const glassMaterial = new THREE.MeshStandardMaterial({
      color: 0x78949e,
      roughness: 0.3,
      metalness: 0.05,
    });

    const wheelMaterial = new THREE.MeshStandardMaterial({
      color: 0x17191a,
      roughness: 1,
    });

    if (type === "motorcycle") {
      this._buildMotorcycle(
        group,
        spec,
        bodyMaterial,
        darkMaterial,
        wheelMaterial,
      );
    } else if (type === "keke") {
      this._buildKeke(
        group,
        spec,
        bodyMaterial,
        darkMaterial,
        glassMaterial,
        wheelMaterial,
      );
    } else {
      this._buildFourWheelVehicle(
        group,
        type,
        spec,
        bodyMaterial,
        darkMaterial,
        glassMaterial,
        wheelMaterial,
      );
    }

    group.userData.vehicleType = type;

    return {
      group,
      bodyMaterial,
      darkMaterial,
      glassMaterial,
      wheelMaterial,
    };
  }

  _buildFourWheelVehicle(
    group,
    type,
    spec,
    bodyMaterial,
    darkMaterial,
    glassMaterial,
    wheelMaterial,
  ) {
    const isLarge = type === "bus" || type === "truck";
    const bodyLength = spec.length * (isLarge ? 0.88 : 0.76);
    const bodyHeight = isLarge ? spec.height * 0.58 : spec.height * 0.48;

    this._addBox(
      group,
      "vehicle-body",
      spec.width,
      bodyHeight,
      bodyLength,
      bodyMaterial,
      0,
      bodyHeight * 0.65,
      0,
    );

    const cabinLength = isLarge
      ? spec.length * 0.36
      : spec.length * 0.42;

    const cabinWidth = spec.width * 0.83;

    this._addBox(
      group,
      "vehicle-cabin",
      cabinWidth,
      spec.height * 0.4,
      cabinLength,
      isLarge ? bodyMaterial : glassMaterial,
      0,
      bodyHeight + spec.height * 0.2,
      -spec.length * 0.04,
    );

    if (isLarge) {
      this._addBox(
        group,
        "vehicle-cargo",
        spec.width * 0.94,
        spec.height * 0.42,
        spec.length * 0.45,
        type === "truck" ? darkMaterial : bodyMaterial,
        0,
        spec.height * 0.66,
        spec.length * 0.23,
      );
    }

    this._addBox(
      group,
      "front-bumper",
      spec.width * 0.94,
      0.16,
      0.18,
      darkMaterial,
      0,
      0.25,
      -spec.length * 0.46,
    );

    this._addBox(
      group,
      "rear-bumper",
      spec.width * 0.94,
      0.16,
      0.18,
      darkMaterial,
      0,
      0.25,
      spec.length * 0.46,
    );

    this._addHeadlights(group, spec);
    this._addTailLights(group, spec);
    this._addWheels(group, spec, wheelMaterial);

    if (type === "taxi") {
      this._addBox(
        group,
        "taxi-sign",
        0.55,
        0.16,
        0.24,
        new THREE.MeshStandardMaterial({ color: 0xf4d03f }),
        0,
        spec.height * 0.88,
        0,
      );
    }

    if (type === "police") {
      this._addBox(
        group,
        "police-lightbar",
        0.8,
        0.12,
        0.24,
        new THREE.MeshStandardMaterial({ color: 0xc0392b }),
        0,
        spec.height * 0.87,
        0,
      );

      this._addBox(
        group,
        "police-lightbar-blue",
        0.35,
        0.12,
        0.24,
        new THREE.MeshStandardMaterial({ color: 0x2471a3 }),
        0.25,
        spec.height * 0.87,
        0,
      );
    }

    if (type === "karota") {
      this._addBox(
        group,
        "karota-roof-sign",
        0.9,
        0.2,
        0.3,
        new THREE.MeshStandardMaterial({ color: 0x17202a }),
        0,
        spec.height * 0.88,
        0,
      );
    }
  }

  _buildKeke(
    group,
    spec,
    bodyMaterial,
    darkMaterial,
    glassMaterial,
    wheelMaterial,
  ) {
    this._addBox(
      group,
      "keke-lower-body",
      spec.width,
      0.55,
      spec.length * 0.9,
      bodyMaterial,
      0,
      0.72,
      0,
    );

    this._addBox(
      group,
      "keke-roof",
      spec.width * 0.9,
      0.12,
      spec.length * 0.67,
      bodyMaterial,
      0,
      1.65,
      0.03,
    );

    for (const x of [-spec.width * 0.42, spec.width * 0.42]) {
      for (const z of [-0.6, 0.55]) {
        const post = new THREE.Mesh(
          new THREE.BoxGeometry(0.07, 0.85, 0.07),
          darkMaterial,
        );

        post.position.set(x, 1.2, z);
        group.add(post);
      }
    }

    this._addBox(
      group,
      "keke-front-screen",
      spec.width * 0.7,
      0.46,
      0.035,
      glassMaterial,
      0,
      1.15,
      -spec.length * 0.32,
    );

    this._addBox(
      group,
      "keke-seat",
      spec.width * 0.72,
      0.16,
      0.4,
      darkMaterial,
      0,
      0.9,
      0.1,
    );

    this._addBox(
      group,
      "keke-front-wheel-cover",
      spec.width * 0.38,
      0.3,
      0.1,
      bodyMaterial,
      0,
      0.45,
      -spec.length * 0.38,
    );

    this._addWheels(group, spec, wheelMaterial, true);
    this._addHeadlights(group, spec);
    this._addTailLights(group, spec);
  }

  _buildMotorcycle(
    group,
    spec,
    bodyMaterial,
    darkMaterial,
    wheelMaterial,
  ) {
    for (const z of [-spec.length * 0.34, spec.length * 0.34]) {
      const wheel = new THREE.Mesh(
        new THREE.CylinderGeometry(0.31, 0.31, 0.14, 12),
        wheelMaterial,
      );

      wheel.rotation.z = Math.PI / 2;
      wheel.position.set(0, 0.31, z);
      group.add(wheel);
    }

    this._addBox(
      group,
      "motorcycle-frame",
      0.28,
      0.35,
      0.95,
      darkMaterial,
      0,
      0.65,
      0,
    );

    this._addBox(
      group,
      "motorcycle-fuel-tank",
      0.38,
      0.32,
      0.42,
      bodyMaterial,
      0,
      0.85,
      -0.1,
    );

    this._addBox(
      group,
      "motorcycle-seat",
      0.3,
      0.12,
      0.48,
      darkMaterial,
      0,
      0.94,
      0.35,
    );

    this._addBox(
      group,
      "motorcycle-handlebar",
      0.78,
      0.08,
      0.1,
      darkMaterial,
      0,
      1.02,
      -0.52,
    );

    const headlight = new THREE.Mesh(
      new THREE.SphereGeometry(0.12, 8, 8),
      new THREE.MeshStandardMaterial({
        color: 0xfdf2c5,
        emissive: 0x403820,
      }),
    );

    headlight.position.set(0, 0.8, -spec.length * 0.42);
    group.add(headlight);
  }

  _addWheels(group, spec, material, threeWheeler = false) {
    const radius = spec.height > 2.3 ? 0.48 : 0.34;
    const wheelWidth = 0.18;
    const x = spec.width * 0.48;

    const zPositions = threeWheeler
      ? [-spec.length * 0.36, spec.length * 0.36]
      : [-spec.length * 0.33, spec.length * 0.33];

    for (const z of zPositions) {
      for (const side of [-1, 1]) {
        if (threeWheeler && z === zPositions[0] && side === 1) {
          continue;
        }

        const wheel = new THREE.Mesh(
          new THREE.CylinderGeometry(
            radius,
            radius,
            wheelWidth,
            12,
          ),
          material,
        );

        wheel.name = "vehicle-wheel";
        wheel.rotation.z = Math.PI / 2;
        wheel.position.set(side * x, radius, z);
        wheel.castShadow = true;

        group.add(wheel);
      }
    }
  }

  _addHeadlights(group, spec) {
    const material = new THREE.MeshStandardMaterial({
      color: 0xfdf4d0,
      emissive: 0x55472a,
    });

    for (const side of [-1, 1]) {
      this._addBox(
        group,
        "vehicle-headlight",
        0.22,
        0.14,
        0.08,
        material,
        side * spec.width * 0.32,
        0.45,
        -spec.length * 0.49,
      );
    }
  }

  _addTailLights(group, spec) {
    const material = new THREE.MeshStandardMaterial({
      color: 0xb3261e,
      emissive: 0x330400,
    });

    for (const side of [-1, 1]) {
      this._addBox(
        group,
        "vehicle-tail-light",
        0.2,
        0.13,
        0.08,
        material,
        side * spec.width * 0.32,
        0.45,
        spec.length * 0.49,
      );
    }
  }

  _addBox(
    group,
    name,
    width,
    height,
    depth,
    material,
    x,
    y,
    z,
  ) {
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(width, height, depth),
      material,
    );

    mesh.name = name;
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;

    group.add(mesh);

    return mesh;
  }

  _chooseVehicleType() {
    const entries = Object.entries(this.spawnWeights);
    const totalWeight = entries.reduce(
      (sum, [, weight]) => sum + weight,
      0,
    );

    let roll = Math.random() * totalWeight;

    for (const [type, weight] of entries) {
      roll -= weight;

      if (roll <= 0) {
        return type;
      }
    }

    return "car";
  }

  _findSafeLane(z, preferredLane, vehicleLength) {
    const lanes = [0, 1, 2];

    if (
      Number.isInteger(preferredLane) &&
      preferredLane >= 0 &&
      preferredLane <= 2
    ) {
      lanes.sort(
        (a, b) =>
          Math.abs(a - preferredLane) -
          Math.abs(b - preferredLane),
      );
    } else {
      lanes.sort(() => Math.random() - 0.5);
    }

    for (const lane of lanes) {
      if (
        this._isLaneSafe(
          lane,
          z,
          vehicleLength,
          null,
        ) &&
        !this._overlapsPlayer(lane, z, vehicleLength)
      ) {
        return lane;
      }
    }

    return null;
  }

  _isLaneSafe(lane, z, vehicleLength, excludeId = null) {
    for (const vehicle of this.vehicles.values()) {
      if (vehicle.id === excludeId) continue;

      const longitudinalGap = Math.abs(vehicle.z - z);

      const requiredGap =
        (vehicle.spec.length + vehicleLength) / 2 +
        this.config.minimumSpawnGap;

      if (
        (vehicle.lane === lane ||
          vehicle.targetLane === lane) &&
        longitudinalGap < requiredGap
      ) {
        return false;
      }
    }

    return true;
  }

  _overlapsPlayer(lane, z, vehicleLength) {
    const longitudinalGap = Math.abs(z - this.playerZ);

    const requiredGap =
      vehicleLength / 2 +
      this.config.playerCollisionRadius +
      this.config.minimumSpawnGap;

    return lane === this.playerLane && longitudinalGap < requiredGap;
  }

  _findAdjacentSafeLane(vehicle) {
    const candidates = [
      vehicle.lane - 1,
      vehicle.lane + 1,
    ].filter((lane) => lane >= 0 && lane <= 2);

    for (const lane of candidates) {
      if (
        this._isLaneSafe(
          lane,
          vehicle.z,
          vehicle.spec.length,
          vehicle.id,
        )
      ) {
        return lane;
      }
    }

    return null;
  }

  _laneX(lane) {
    const positions =
      GAME_CONFIG?.LANE_POSITIONS ??
      [-this.config.laneWidth, 0, this.config.laneWidth];

    return positions[clamp(lane, 0, positions.length - 1)];
  }

  setPlayerState({ z, lane, speed } = {}) {
    if (Number.isFinite(z)) this.playerZ = z;
    if (Number.isFinite(lane)) this.playerLane = clamp(lane, 0, 2);
    if (Number.isFinite(speed)) this.playerSpeed = Math.max(0, speed);
  }

  pause() {
    this.paused = true;
  }

  resume() {
    this.paused = false;
  }

  clear() {
    for (const id of [...this.vehicles.keys()]) {
      this.removeVehicle(id, "cleared");
    }
  }

  dispose() {
    this.clear();

    for (const dispose of this._disposers ?? []) {
      try {
        dispose();
      } catch {
        // Continue cleaning up remaining listeners.
      }
    }

    this._disposers = [];
    this.initialized = false;
  }
}

export { VEHICLE_SPECS, VEHICLE_TYPES };