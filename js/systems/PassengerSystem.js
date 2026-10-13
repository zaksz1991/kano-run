import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { GAME_CONFIG } from "../core/config.js";
import { MODEL_PATHS } from "../core/AssetCatalog.js";

const DEFAULTS = {
  maxWaiting: 5,
  spawnInterval: 18,
  pickupRadius: 7,
  pickupSpeedThreshold: 12,
  dropoffRadius: 9,
  minTripDistance: 150,
  maxTripDistance: 400,
  baseFare: 300,
  farePerUnit: 2.5,
};

const DESTINATIONS = [
  "Sabon Gari", "Kofar Mata", "Fagge", "Farm Centre",
  "Hotoro", "Zoo Road", "Naibawa", "Tarauni",
  "Dala", "Kantin Kwari", "Bompai", "Sharada",
];

const GREETINGS = [
  "Sannu!", "Oga!", "Mallam!", "Yallabai!", "Aboki!",
  "Baba!", "Mama!", "Hajiya!", "Driver!",
];

const CONFIRMATIONS = [
  "Akwai!", "To!", "Oya!", "Fast fast!", "Let's go!",
];

export default class PassengerSystem {
  constructor({ scene, eventBus = null, config = {}, gameState = null } = {}) {
    if (!scene) {
      throw new Error("PassengerSystem requires a scene.");
    }

    this.scene = scene;
    this.eventBus = eventBus;
    this.gameState = gameState;
    this.config = {
      ...DEFAULTS,
      ...(GAME_CONFIG?.passengers ?? {}),
      ...config,
    };

    this.passengers = new Map();
    this.currentPassenger = null;
    this.pool = [];
    this.spawnTimer = 0;
    this.tripDistance = 0;
    this.enabled = false;
    this.playerZ = 0;

    this._disposers = [];
    this._glbLoader = new GLTFLoader();
    this._passengerModelCache = null;
    this._passengerModelLoadStarted = false;
    this._disposed = false;

    this._loadPassengerModel();
  }

  _loadPassengerModel() {
    if (this._passengerModelLoadStarted || this._disposed) return;

    const path = MODEL_PATHS?.characters?.passenger;

    // A passenger GLB is optional. Use the built-in character
    // when the catalog does not define a valid model path.
    if (typeof path !== "string" || path.trim().length === 0) {
      console.info(
        "[PassengerSystem] No passenger GLB configured; using fallback characters."
      );
      return;
    }

    this._passengerModelLoadStarted = true;

    this._glbLoader.load(
      path,
      (gltf) => {
        if (this._disposed) {
          return;
        }

        this._passengerModelCache = gltf.scene;

        this._passengerModelCache.traverse((child) => {
          if (!child.isMesh) return;
          child.castShadow = true;
          child.receiveShadow = true;
        });

        console.log("[PassengerSystem] Passenger model loaded:", path);
      },
      undefined,
      (error) => {
        console.warn(
          "[PassengerSystem] Passenger model failed to load; using fallback characters.",
          error
        );
      }
    );
  }

  initialize() {
    if (this._disposed) return;

    this.enabled = true;

    this._subscribe("game:started", () => {
      this.enabled = true;
      this.reset();
    });

    this._subscribe("game:stopped", () => {
      this.enabled = false;
      this.clearAll();
    });

    this._subscribe("game:over", () => {
      this.enabled = false;
      this.clearAll();
    });

    for (let i = 0; i < 3; i++) {
      this._spawnPassenger(this.playerZ + 50 + i * 40);
    }
  }

  update(deltaTime, playerZ = 0, playerSpeed = 0, playerLane = 1) {
    if (!this.enabled || this._disposed) return;

    this.playerZ = playerZ;
    this.spawnTimer -= deltaTime;

    if (
      this.spawnTimer <= 0 &&
      this.passengers.size < this.config.maxWaiting
    ) {
      this._spawnPassenger(
        playerZ + this.config.spawnInterval * 10
      );

      this.spawnTimer =
        this.config.spawnInterval * (0.8 + Math.random() * 0.4);
    }

    for (const [id, passenger] of this.passengers) {
      if (passenger.z < playerZ - 20) {
        this._returnToPool(passenger);
        continue;
      }

      if (passenger.state === "WAITING") {
        if (passenger.mesh) {
          passenger.mesh.position.y =
            Math.abs(Math.sin(Date.now() * 0.003 + id)) * 0.1;
        }

        const distance = Math.sqrt(
          passenger.x * passenger.x +
          Math.pow(passenger.z - playerZ, 2)
        );

        if (
          distance < this.config.pickupRadius &&
          playerSpeed < this.config.pickupSpeedThreshold
        ) {
          this._boardPassenger(passenger);
        }
      }
    }

    if (this.currentPassenger) {
      this.tripDistance += playerSpeed * deltaTime;

      this.eventBus?.emit?.("passenger:trip-update", {
        destination: this.currentPassenger.destination,
        progress: Math.min(
          1,
          this.tripDistance / this.currentPassenger.tripLength
        ),
      });

      if (
        this.tripDistance >= this.currentPassenger.tripLength
      ) {
        if (!this.currentPassenger.shouted) {
          this.currentPassenger.shouted = true;

          this.eventBus?.emit?.("passenger:shout", {
            text: "Akwai! Akwai!",
            type: "urgent",
          });

          if (this.currentPassenger.mesh) {
            this.currentPassenger.mesh.rotation.x = -0.3;
          }
        }

        if (playerSpeed < 5) {
          this._dropoffPassenger();
        }
      }
    }
  }

  _createFallbackCharacter() {
    const group = new THREE.Group();

    const bodyMaterial = new THREE.MeshStandardMaterial({
      color: 0x3b82f6,
      flatShading: true,
    });

    const skinMaterial = new THREE.MeshStandardMaterial({
      color: 0x8d5524,
      flatShading: true,
    });

    const body = new THREE.Mesh(
      new THREE.CylinderGeometry(0.3, 0.4, 1.2, 8),
      bodyMaterial
    );

    body.position.y = 0.8;
    body.castShadow = true;
    body.receiveShadow = true;
    group.add(body);

    const head = new THREE.Mesh(
      new THREE.SphereGeometry(0.3, 8, 6),
      skinMaterial
    );

    head.position.y = 1.6;
    head.castShadow = true;
    head.receiveShadow = true;
    group.add(head);

    return group;
  }

  _spawnPassenger(z) {
    if (this._disposed) return;

    const side = Math.random() > 0.5 ? 1 : -1;
    const x = side * (6 + Math.random() * 2);

    const passenger = this._getFromPool();

    passenger.id = Math.random().toString(36).slice(2, 11);
    passenger.z = z;
    passenger.x = x;
    passenger.state = "WAITING";
    passenger.greeting =
      GREETINGS[Math.floor(Math.random() * GREETINGS.length)];

    const group = new THREE.Group();

    if (this._passengerModelCache) {
      const model = this._passengerModelCache.clone(true);

      // Clone materials per passenger but retain shared model geometry
      // and textures, so returning a passenger to the pool is safe.
      model.traverse((child) => {
        if (!child.isMesh) return;

        if (Array.isArray(child.material)) {
          child.material = child.material.map((material) =>
            material.clone()
          );
        } else if (child.material) {
          child.material = child.material.clone();
        }

        child.castShadow = true;
        child.receiveShadow = true;
      });

      group.add(model);
    } else {
      group.add(this._createFallbackCharacter());
    }

    group.position.set(x, 0, z);
    group.rotation.y = side > 0 ? -Math.PI / 2 : Math.PI / 2;

    this.scene.add(group);
    passenger.mesh = group;

    this.passengers.set(passenger.id, passenger);

    this.eventBus?.emit?.("passenger:spotted", {
      text: passenger.greeting,
      x,
      z,
    });
  }

  _boardPassenger(passenger) {
    this.passengers.delete(passenger.id);

    if (passenger.mesh) {
      this.scene.remove(passenger.mesh);
    }

    this.currentPassenger = passenger;
    this.currentPassenger.state = "RIDING";
    this.currentPassenger.destination =
      DESTINATIONS[Math.floor(Math.random() * DESTINATIONS.length)];

    this.currentPassenger.tripLength =
      this.config.minTripDistance +
      Math.random() *
        (this.config.maxTripDistance - this.config.minTripDistance);

    this.currentPassenger.shouted = false;
    this.tripDistance = 0;

    for (const [, other] of this.passengers) {
      if (Math.abs(other.z - passenger.z) < 20) {
        this._returnToPool(other);
      }
    }

    this.eventBus?.emit?.("passenger:boarded", {
      text: CONFIRMATIONS[
        Math.floor(Math.random() * CONFIRMATIONS.length)
      ],
      destination: this.currentPassenger.destination,
    });
  }

  _dropoffPassenger() {
    if (!this.currentPassenger) return;

    const passenger = this.currentPassenger;

    const fare = Math.floor(
      this.config.baseFare +
      this.tripDistance * this.config.farePerUnit
    );

    this.gameState?.addMoney?.(fare, "passenger_fare");
    this.gameState?.addScore?.(fare);
    this.gameState?.addXP?.(50, "delivery");

    this.eventBus?.emit?.("passenger:dropped", {
      text: "Na gode! (Thank you!)",
      fare,
    });

    this.currentPassenger = null;
    this.tripDistance = 0;

    this._spawnPassenger(this.playerZ + 100);
  }

  _getFromPool() {
    return this.pool.pop() || {};
  }

  _disposePassengerMaterials(root) {
    root.traverse((child) => {
      if (!child.isMesh || !child.material) return;

      const materials = Array.isArray(child.material)
        ? child.material
        : [child.material];

      for (const material of materials) {
        material.dispose();
      }

      // Do not dispose geometry or textures from cached GLB models.
      // Geometry can be shared across cloned passenger instances.
    });
  }

  _returnToPool(passenger) {
    if (!passenger) return;

    if (passenger.mesh) {
      this.scene.remove(passenger.mesh);
      this._disposePassengerMaterials(passenger.mesh);
      passenger.mesh = null;
    }

    this.passengers.delete(passenger.id);

    if (this.currentPassenger === passenger) {
      this.currentPassenger = null;
      this.tripDistance = 0;
    }

    this.pool.push(passenger);
  }

  clearAll() {
    for (const passenger of [...this.passengers.values()]) {
      this._returnToPool(passenger);
    }

    if (this.currentPassenger) {
      this.currentPassenger = null;
      this.tripDistance = 0;
    }
  }

  reset() {
    this.clearAll();
    this.spawnTimer = 0;
    this.enabled = true;
  }

  _subscribe(event, handler) {
    if (!this.eventBus?.on) return;

    const unsubscribe = this.eventBus.on(event, handler);

    if (typeof unsubscribe === "function") {
      this._disposers.push(unsubscribe);
    }
  }

  dispose() {
    if (this._disposed) return;

    this.clearAll();

    for (const unsubscribe of this._disposers) {
      unsubscribe();
    }

    this._disposers = [];
    this.pool = [];
    this._passengerModelCache = null;
    this._disposed = true;
  }
}