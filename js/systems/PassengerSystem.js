import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { GAME_CONFIG } from "../core/config.js";
import { MODEL_PATHS, MODEL_SCALES } from "../core/AssetCatalog.js";

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

const DESTINATIONS = ["Sabon Gari", "Kofar Mata", "Fagge", "Farm Centre", "Hotoro", "Zoo Road", "Naibawa", "Tarauni", "Dala", "Kantin Kwari", "Bompai", "Sharada"];
const GREETINGS = ["Sannu!", "Oga!", "Mallam!", "Yallabai!", "Aboki!", "Baba!", "Mama!", "Hajiya!", "Driver!"];
const CONFIRMATIONS = ["Akwai!", "To!", "Oya!", "Fast fast!", "Let's go!"];

export default class PassengerSystem {
  constructor({ scene, eventBus = null, config = {}, gameState = null } = {}) {
    if (!scene) throw new Error("PassengerSystem requires a scene.");

    this.scene = scene;
    this.eventBus = eventBus;
    this.gameState = gameState;
    this.config = { ...DEFAULTS, ...(GAME_CONFIG?.passengers ?? {}), ...config };

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
    
    // Preload passenger model
    this._loadPassengerModel();
  }

  _loadPassengerModel() {
    const path = MODEL_PATHS.characters.passenger;
    this._glbLoader.load(path, (gltf) => {
      this._passengerModelCache = gltf.scene;
      console.log("[PassengerSystem] Passenger model loaded successfully.");
    }, undefined, (err) => {
      console.warn("[PassengerSystem] Failed to load passenger model, using fallback.", err);
    });
  }

  initialize() {
    this.enabled = true;
    this._subscribe("game:started", () => { this.enabled = true; this.reset(); });
    this._subscribe("game:stopped", () => { this.enabled = false; this.clearAll(); });
    this._subscribe("game:over", () => { this.enabled = false; this.clearAll(); });
    
    for (let i = 0; i < 3; i++) this._spawnPassenger(this.playerZ + 50 + i * 40);
  }

  update(deltaTime, playerZ = 0, playerSpeed = 0, playerLane = 1) {
    if (!this.enabled) return;

    this.playerZ = playerZ;
    this.spawnTimer -= deltaTime;

    if (this.spawnTimer <= 0 && this.passengers.size < this.config.maxWaiting) {
      this._spawnPassenger(playerZ + this.config.spawnInterval * 10);
      this.spawnTimer = this.config.spawnInterval * (0.8 + Math.random() * 0.4);
    }

    for (const [id, p] of this.passengers) {
      if (p.z < playerZ - 20) { this._returnToPool(p); continue; }

      if (p.state === "WAITING") {
        // Simple idle animation (bobbing)
        if (p.mesh) p.mesh.position.y = Math.abs(Math.sin(Date.now() * 0.003 + id)) * 0.1;
        
        const dist = Math.sqrt(Math.pow(p.x - 0, 2) + Math.pow(p.z - playerZ, 2));
        if (dist < this.config.pickupRadius && playerSpeed < this.config.pickupSpeedThreshold) {
          this._boardPassenger(p);
        }
      }
    }

    if (this.currentPassenger) {
      this.tripDistance += playerSpeed * deltaTime;
      
      this.eventBus?.emit?.("passenger:trip-update", {
        destination: this.currentPassenger.destination,
        progress: Math.min(1, this.tripDistance / this.currentPassenger.tripLength),
      });

      if (this.tripDistance >= this.currentPassenger.tripLength) {
        if (!this.currentPassenger.shouted) {
          this.currentPassenger.shouted = true;
          this.eventBus?.emit?.("passenger:shout", { text: "Akwai! Akwai!", type: "urgent" });
          if (this.currentPassenger.mesh) this.currentPassenger.mesh.rotation.x = -0.3;
        }

        if (playerSpeed < 5) this._dropoffPassenger();
      }
    }
  }

  _spawnPassenger(z) {
    const side = Math.random() > 0.5 ? 1 : -1;
    const x = side * (6 + Math.random() * 2);

    const p = this._getFromPool();
    p.id = Math.random().toString(36).substr(2, 9);
    p.z = z;
    p.x = x;
    p.state = "WAITING";
    p.greeting = GREETINGS[Math.floor(Math.random() * GREETINGS.length)];

    // Create visual representation
    const group = new THREE.Group();
    
    if (this._passengerModelCache) {
      const model = this._passengerModelCache.clone(true);
      model.traverse(child => {
        if (child.isMesh) {
          child.castShadow = true;
          child.receiveShadow = true;
        }
      });
      group.add(model);
    } else {
      // Fallback primitive
      const body = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.4, 1.2, 8), new THREE.MeshStandardMaterial({ color: 0x3b82f6, flatShading: true }));
      body.position.y = 0.6;
      body.castShadow = true;
      group.add(body);
      const head = new THREE.Mesh(new THREE.SphereGeometry(0.3, 8, 6), new THREE.MeshStandardMaterial({ color: 0x8d5524, flatShading: true }));
      head.position.y = 1.4;
      head.castShadow = true;
      group.add(head);
    }

    group.position.set(x, 0, z);
    group.rotation.y = side > 0 ? -Math.PI / 2 : Math.PI / 2;

    this.scene.add(group);
    p.mesh = group;

    this.passengers.set(p.id, p);

    this.eventBus?.emit?.("passenger:spotted", { text: p.greeting, x: x, z: z });
  }

  _boardPassenger(p) {
    this.passengers.delete(p.id);
    this.scene.remove(p.mesh);
    
    this.currentPassenger = p;
    this.currentPassenger.state = "RIDING";
    this.currentPassenger.destination = DESTINATIONS[Math.floor(Math.random() * DESTINATIONS.length)];
    this.currentPassenger.tripLength = this.config.minTripDistance + Math.random() * (this.config.maxTripDistance - this.config.minTripDistance);
    this.currentPassenger.shouted = false;
    this.tripDistance = 0;

    for (const [id, other] of this.passengers) {
      if (Math.abs(other.z - p.z) < 20) this._returnToPool(other);
    }

    this.eventBus?.emit?.("passenger:boarded", {
      text: CONFIRMATIONS[Math.floor(Math.random() * CONFIRMATIONS.length)],
      destination: this.currentPassenger.destination,
    });
  }

  _dropoffPassenger() {
    if (!this.currentPassenger) return;

    const p = this.currentPassenger;
    const fare = Math.floor(this.config.baseFare + (this.tripDistance * this.config.farePerUnit));
    
    this.gameState?.addMoney?.(fare, "passenger_fare");
    this.gameState?.addScore?.(fare);
    this.gameState?.addXP?.(50, "delivery");

    this.eventBus?.emit?.("passenger:dropped", { text: "Na gode! (Thank you!)", fare: fare });

    this.currentPassenger = null;
    this.tripDistance = 0;
    
    this._spawnPassenger(this.playerZ + 100);
  }

  _getFromPool() { return this.pool.pop() || {}; }

  _returnToPool(p) {
    if (p.mesh) {
      this.scene.remove(p.mesh);
      p.mesh.traverse(child => {
        if (child.isMesh) { child.geometry.dispose(); child.material.dispose(); }
      });
    }
    this.passengers.delete(p.id);
    this.pool.push(p);
  }

  clearAll() {
    for (const p of this.passengers.values()) this._returnToPool(p);
    if (this.currentPassenger) { this.currentPassenger = null; this.tripDistance = 0; }
  }

  reset() { this.clearAll(); this.spawnTimer = 0; this.enabled = true; }

  _subscribe(event, handler) {
    if (!this.eventBus?.on) return;
    const unsub = this.eventBus.on(event, handler);
    if (typeof unsub === "function") this._disposers.push(unsub);
  }

  dispose() {
    this.clearAll();
    for (const unsub of this._disposers) unsub();
    this._disposers = [];
  }
}