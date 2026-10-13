import * as THREE from "three";
import { GAME_CONFIG } from "../core/config.js";

const DEFAULTS = {
  maxWaiting: 5,
  spawnInterval: 18, // Seconds between spawns
  pickupRadius: 7,
  pickupSpeedThreshold: 12, // Must be below this speed to pick up
  dropoffRadius: 9,
  minTripDistance: 150,
  maxTripDistance: 400,
  baseFare: 300,
  farePerUnit: 2.5,
};

// Authentic Kano Destinations & Dialogue
const DESTINATIONS = [
  "Sabon Gari", "Kofar Mata", "Fagge", "Farm Centre", 
  "Hotoro", "Zoo Road", "Naibawa", "Tarauni", 
  "Dala", "Kantin Kwari", "Bompai", "Sharada"
];

const GREETINGS = [
  "Sannu!", "Oga!", "Mallam!", "Yallabai!", 
  "Aboki!", "Baba!", "Mama!", "Hajiya!", "Driver!"
];

const CONFIRMATIONS = [
  "Akwai!", "To!", "Oya!", "Fast fast!", "Let's go!"
];

const PASSENGER_TYPES = [
  { name: "Mallam", color: 0xf8f9fa, height: 1.8, width: 0.6 }, // White robe
  { name: "Youth", color: 0x3b82f6, height: 1.7, width: 0.5 }, // Jeans/Shirt
  { name: "Market Woman", color: 0xec4899, height: 1.6, width: 0.7 }, // Wrapper
  { name: "Student", color: 0x10b981, height: 1.65, width: 0.5 }, // Green/Uniform
];

export default class PassengerSystem {
  constructor({
    scene,
    eventBus = null,
    config = {},
    gameState = null,
  } = {}) {
    if (!scene) throw new Error("PassengerSystem requires a scene.");

    this.scene = scene;
    this.eventBus = eventBus;
    this.gameState = gameState;
    this.config = { ...DEFAULTS, ...(GAME_CONFIG?.passengers ?? {}), ...config };

    this.passengers = new Map(); // Active roadside passengers
    this.currentPassenger = null; // Passenger currently in the keke
    this.pool = []; // Object pool for performance
    this.spawnTimer = 0;
    this.tripDistance = 0;
    this.dropoffZone = null;
    this.enabled = false;
    this.playerZ = 0;

    this._disposers = [];
  }

  initialize() {
    this.enabled = true;
    this._subscribe("game:started", () => { this.enabled = true; this.reset(); });
    this._subscribe("game:stopped", () => { this.enabled = false; this.clearAll(); });
    this._subscribe("game:over", () => { this.enabled = false; this.clearAll(); });
    
    // Initial spawn
    for (let i = 0; i < 3; i++) {
      this._spawnPassenger(this.playerZ + 50 + i * 40);
    }
  }

  update(deltaTime, playerZ = 0, playerSpeed = 0, playerLane = 1) {
    if (!this.enabled) return;

    this.playerZ = playerZ;
    this.spawnTimer -= deltaTime;

    // 1. Manage Roadside Passengers
    if (this.spawnTimer <= 0 && this.passengers.size < this.config.maxWaiting) {
      this._spawnPassenger(playerZ + this.config.spawnInterval * 10); // Spawn ahead
      this.spawnTimer = this.config.spawnInterval * (0.8 + Math.random() * 0.4);
    }

    // 2. Update Existing Passengers (Animation & Culling)
    for (const [id, p] of this.passengers) {
      // Cull if too far behind
      if (p.z < playerZ - 20) {
        this._returnToPool(p);
        continue;
      }

      // Simple "Waving" animation if waiting
      if (p.state === "WAITING") {
        p.mesh.rotation.z = Math.sin(Date.now() * 0.005 + id) * 0.2;
        
        // Check for Pickup Interaction
        const dist = Math.sqrt(Math.pow(p.x - 0, 2) + Math.pow(p.z - playerZ, 2)); // Simplified distance
        // Note: In a real lane system, check lane alignment. Here we check Z proximity.
        if (dist < this.config.pickupRadius && playerSpeed < this.config.pickupSpeedThreshold) {
          this._boardPassenger(p);
        }
      }
    }

    // 3. Manage Current Passenger (In Keke)
    if (this.currentPassenger) {
      this.tripDistance += playerSpeed * deltaTime;
      
      // Update HUD with destination info
      this.eventBus?.emit?.("passenger:trip-update", {
        destination: this.currentPassenger.destination,
        progress: Math.min(1, this.tripDistance / this.currentPassenger.tripLength),
      });

      // Check for Dropoff
      if (this.tripDistance >= this.currentPassenger.tripLength) {
        if (!this.currentPassenger.shouted) {
          this.currentPassenger.shouted = true;
          this.eventBus?.emit?.("passenger:shout", { 
            text: "Akwai! Akwai!", 
            type: "urgent" 
          });
          // Visual cue: Passenger leans forward
          if (this.currentPassenger.mesh) {
            this.currentPassenger.mesh.rotation.x = -0.3;
          }
        }

        // Player must stop/slow down to drop off
        if (playerSpeed < 5) {
          this._dropoffPassenger();
        }
      }
    }
  }

  _spawnPassenger(z) {
    const type = PASSENGER_TYPES[Math.floor(Math.random() * PASSENGER_TYPES.length)];
    const side = Math.random() > 0.5 ? 1 : -1; // Left or Right side of road
    const x = side * (6 + Math.random() * 2); // Offset from road center

    const p = this._getFromPool();
    p.id = Math.random().toString(36).substr(2, 9);
    p.z = z;
    p.x = x;
    p.state = "WAITING";
    p.type = type;
    p.greeting = GREETINGS[Math.floor(Math.random() * GREETINGS.length)];

    // Build Visuals (Low Poly Stylized)
    const group = new THREE.Group();
    
    // Body
    const bodyGeo = new THREE.CylinderGeometry(type.width * 0.4, type.width * 0.5, type.height * 0.6, 8);
    const bodyMat = new THREE.MeshStandardMaterial({ color: type.color, flatShading: true, roughness: 0.8 });
    const body = new THREE.Mesh(bodyGeo, bodyMat);
    body.position.y = type.height * 0.3;
    body.castShadow = true;
    group.add(body);

    // Head
    const headGeo = new THREE.SphereGeometry(type.width * 0.45, 8, 6);
    const headMat = new THREE.MeshStandardMaterial({ color: 0x8d5524, flatShading: true }); // Skin tone
    const head = new THREE.Mesh(headGeo, headMat);
    head.position.y = type.height * 0.6 + type.width * 0.4;
    head.castShadow = true;
    group.add(head);

    // Position in world
    group.position.set(x, 0, z);
    // Face the road
    group.rotation.y = side > 0 ? -Math.PI / 2 : Math.PI / 2;

    this.scene.add(group);
    p.mesh = group;
    p.body = body;

    this.passengers.set(p.id, p);

    // Emit event for Audio/UI
    this.eventBus?.emit?.("passenger:spotted", { 
      text: p.greeting, 
      x: x, 
      z: z 
    });
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

    // Clear other waiting passengers nearby (they saw you get taken)
    for (const [id, other] of this.passengers) {
      if (Math.abs(other.z - p.z) < 20) {
        this._returnToPool(other);
      }
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
    
    // Reward Player
    this.gameState?.addMoney?.(fare, "passenger_fare");
    this.gameState?.addScore?.(fare);
    this.gameState?.addXP?.(50, "delivery");

    this.eventBus?.emit?.("passenger:dropped", {
      text: "Na gode! (Thank you!)",
      fare: fare,
    });

    this.currentPassenger = null;
    this.tripDistance = 0;
    
    // Spawn a new one ahead immediately to keep flow
    this._spawnPassenger(this.playerZ + 100);
  }

  _getFromPool() {
    return this.pool.pop() || {};
  }

  _returnToPool(p) {
    if (p.mesh) {
      this.scene.remove(p.mesh);
      // Dispose geometries/materials if not pooling them deeply
      p.mesh.traverse(child => {
        if (child.isMesh) {
          child.geometry.dispose();
          child.material.dispose();
        }
      });
    }
    this.passengers.delete(p.id);
    this.pool.push(p);
  }

  clearAll() {
    for (const p of this.passengers.values()) this._returnToPool(p);
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
    const unsub = this.eventBus.on(event, handler);
    if (typeof unsub === "function") this._disposers.push(unsub);
  }

  dispose() {
    this.clearAll();
    for (const unsub of this._disposers) unsub();
    this._disposers = [];
  }
}