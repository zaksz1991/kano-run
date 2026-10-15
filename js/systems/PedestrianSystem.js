import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { GAME_CONFIG } from "../core/config.js";
import { MODEL_PATHS, MODEL_SCALES } from "../core/AssetCatalog.js";

/**
 * Sidewalk pedestrians and interactive bus stop passengers.
 * Uses actual Kano-specific GLB models with strict mobile performance limits.
 */
export default class PedestrianSystem {
  constructor({ scene, eventBus = null, playerVehicleSystem = null, config = {} } = {}) {
    this.scene = scene;
    this.eventBus = eventBus;
    this.player = playerVehicleSystem;
    this.config = {
      maxCount: 18, // Strict limit for mobile performance
      sideOffset: 11,
      walkSpeed: 1.4,
      spawnGap: 45,
      boardingDistance: 4.5,
      ...config,
    };
    
    this.peds = [];
    this.enabled = false;
    this._nextZ = 30;
    this._disposers = [];
    this._glbLoader = new GLTFLoader();
    this._modelTemplates = [];

    this._bindEvents();
    this._loadModels();
  }

  _bindEvents() {
    this._subscribe("game:started", () => {
      this.enabled = true;
      this.clear();
      this._nextZ = 20;
      // Pre-spawn a few ambient walkers
      for (let i = 0; i < 6; i++) this._spawn(this._nextZ + i * 25, "walking");
    });
    this._subscribe("game:stopped", () => {
      this.enabled = false;
      this.clear();
    });
  }

  _loadModels() {
    const models = MODEL_PATHS.passengersBoot || [
      "/assets/models/pedestrian-passengers/passenger.glb",
      "/assets/models/pedestrian-passengers/hijab_muslim_woman.glb",
      "/assets/models/pedestrian-passengers/Man.glb",
    ];

    models.forEach(path => {
      this._glbLoader.load(
        path,
        (gltf) => {
          const model = gltf.scene;
          // Optimize: bake shadows and disable frustum culling for small characters
          model.traverse((child) => {
            if (child.isMesh) {
              child.castShadow = true;
              child.receiveShadow = true;
            }
          });
          this._modelTemplates.push(model);
          console.log(`[PedestrianSystem] Loaded character: ${path}`);
        },
        undefined,
        (err) => console.warn(`[PedestrianSystem] Failed to load ${path}`, err)
      );
    });
  }

  update(deltaTime, playerZ = 0) {
    if (!this.enabled) return;
    const dt = Math.min(Number(deltaTime) || 0, 0.05);
    const z = Number(playerZ) || 0;
    const playerSpeed = this.player?.speed || 0;
    const playerX = this.player?.position?.x || 0;
    const isPlayerStopped = playerSpeed < 1.5;

    // Spawn new pedestrians ahead
    if (this._nextZ < z + 250 && this.peds.length < this.config.maxCount) {
      // 30% chance to spawn a waiting passenger at a "bus stop", 70% ambient walker
      const type = Math.random() < 0.3 ? "waiting" : "walking";
      this._spawn(this._nextZ, type);
      this._nextZ += this.config.spawnGap + Math.random() * 20;
    }

    const time = this._clock(dt);

    for (let i = this.peds.length - 1; i >= 0; i--) {
      const p = this.peds[i];

      if (p.state === "walking") {
        p.z += p.dir * p.speed * dt;
        p.mesh.position.z = p.z;
        // Walk bob animation
        p.mesh.position.y = Math.abs(Math.sin(p.phase + time * 8)) * 0.06;
        p.mesh.rotation.y = p.dir > 0 ? 0 : Math.PI;
      } 
      else if (p.state === "waiting") {
        // Idle animation (breathing/bobbing)
        p.mesh.position.y = Math.abs(Math.sin(p.phase + time * 2)) * 0.02;
        p.mesh.rotation.y = p.dir > 0 ? 0 : Math.PI; // Face the road
        
        // Boarding logic
        if (isPlayerStopped && Math.abs(p.z - z) < this.config.boardingDistance) {
          this._boardPassenger(p, i, playerX, z);
          continue; // Skip rest of loop for this ped
        }
      }
      else if (p.state === "boarding") {
        // Lerp visually into the keke
        p.mesh.position.x = THREE.MathUtils.lerp(p.mesh.position.x, playerX, dt * 5);
        p.mesh.position.z = THREE.MathUtils.lerp(p.mesh.position.z, z - 0.5, dt * 5);
        
        if (Math.abs(p.mesh.position.z - (z - 0.5)) < 0.3) {
          p.mesh.visible = false; // Hide while riding to save draw calls
          p.state = "riding";
        }
      }
      else if (p.state === "riding") {
        // Track distance for fare calculation
        p.distanceTraveled += Math.abs(z - p.lastPlayerZ);
        p.lastPlayerZ = z;
        
        // Auto-exit after a random distance (simulating destination reached)
        if (p.distanceTraveled > p.destinationDistance) {
          this._exitPassenger(p, i, z, playerX);
        }
      }
      else if (p.state === "exiting") {
        p.mesh.visible = true;
        // Walk away animation
        p.walkTimer += dt;
        p.mesh.position.x += p.walkDirection * this.config.walkSpeed * dt;
        p.mesh.position.y = Math.abs(Math.sin(p.walkTimer * 8)) * 0.06;
        
        if (p.walkTimer > 2.5) {
          this.scene.remove(p.mesh);
          this.peds.splice(i, 1);
          continue;
        }
      }

      // Cull out of bounds
      if (p.z < z - 50 || p.z > z + 300) {
        this.scene.remove(p.mesh);
        this.peds.splice(i, 1);
      }
    }
  }

  _clock(dt) {
    this._t = (this._t || 0) + dt;
    return this._t;
  }

  _spawn(z, state = "walking") {
    if (this._modelTemplates.length === 0) return;

    const side = Math.random() > 0.5 ? 1 : -1;
    const template = this._modelTemplates[Math.floor(Math.random() * this._modelTemplates.length)];
    const group = template.clone(true);
    
    // Stagger them slightly on the sidewalk
    const offsetX = side * this.config.sideOffset + (Math.random() - 0.5) * 1.5;
    group.position.set(offsetX, 0, z);
    
    this.scene.add(group);
    
    const ped = {
      mesh: group,
      z,
      side,
      state,
      dir: Math.random() > 0.5 ? 1 : -1,
      speed: this.config.walkSpeed * (0.7 + Math.random() * 0.6),
      phase: Math.random() * Math.PI * 2,
      distanceTraveled: 0,
      lastPlayerZ: z,
      destinationDistance: 300 + Math.random() * 600, // Random trip length
      walkTimer: 0,
      walkDirection: side,
    };

    if (state === "waiting") {
      // Face the road to flag down the Keke
      ped.dir = side > 0 ? -1 : 1; 
      ped.mesh.rotation.y = ped.dir > 0 ? 0 : Math.PI;
    }

    this.peds.push(ped);
  }

  _boardPassenger(ped, index, playerX, playerZ) {
    ped.state = "boarding";
    ped.lastPlayerZ = playerZ;
    this.eventBus?.emit?.("passenger:boarded", { id: ped.mesh.uuid });
    this.eventBus?.emit?.("audio:sfx", "pickup"); // Play coin/pickup sound
  }

  _exitPassenger(ped, index, playerZ, playerX) {
    ped.state = "exiting";
    ped.mesh.visible = true;
    ped.mesh.position.set(playerX + (ped.walkDirection * 2.5), 0, playerZ);
    ped.walkTimer = 0;

    // Calculate and award fare (Base 200 + 80 per km)
    const distanceKm = ped.distanceTraveled / 1000;
    const fare = Math.round(200 + (distanceKm * 80));

    this.eventBus?.emit?.("passenger:dropped", { 
      id: ped.mesh.uuid, 
      fare, 
      distance: ped.distanceTraveled,
      destination: "Market" 
    });
    this.eventBus?.emit?.("economy:fare-earned", { amount: fare });
    this.eventBus?.emit?.("audio:sfx", "coin");
  }

  clear() {
    for (const p of this.peds) this.scene.remove(p.mesh);
    this.peds = [];
    this._t = 0;
  }

  _subscribe(name, handler) {
    if (!this.eventBus?.on) return;
    const u = this.eventBus.on(name, handler);
    if (typeof u === "function") this._disposers.push(u);
  }

  dispose() {
    this.clear();
    for (const u of this._disposers) {
      try { u(); } catch {}
    }
    this._disposers = [];
  }
}