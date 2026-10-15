import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { MODEL_PATHS, MODEL_SCALES } from "../core/AssetCatalog.js";
import { GAME_CONFIG } from "../core/config.js";

/**
 * Police / KAROTA chase after running a checkpoint.
 * Uses Police Car GLB when available; falls back to simple mesh.
 * Supports dynamic intensity (1-2 cars) and immersive UI feedback.
 */
export default class ChaseSystem {
  constructor({
    scene,
    eventBus = null,
    playerVehicleSystem = null,
    gameState = null,
    config = {},
  } = {}) {
    this.scene = scene;
    this.eventBus = eventBus;
    this.player = playerVehicleSystem;
    this.gameState = gameState;
    this.config = {
      duration: 35, // seconds to survive
      catchDistance: 5.0,
      escapeDistance: 120,
      policeSpeedBonus: 4.0, // m/s faster than player
      fineOnCatch: 2500,
      repHitOnCatch: 20,
      ...(GAME_CONFIG?.chase ?? {}),
      ...config,
    };

    this.state = "idle";
    this.timer = 0;
    this.intensity = 1;
    this.policeMeshes = [];
    this.policeZ = 0;
    this.policeX = 0;
    this.enabled = false;
    this._banner = null;
    this._disposers = [];
    this._loader = new GLTFLoader();
    this._policeTemplate = null;
    
    this._loadPoliceModel();

    this._subscribe("game:started", () => { this.enabled = true; });
    this._subscribe("game:stopped", () => this.reset());
    this._subscribe("game:over", () => this.reset());
    this._subscribe("chase:start", (p) => this.startChase(p));
    this._subscribe("checkpoint:chase-triggered", (p) =>
      this.startChase({ ...p, reason: p?.reason || "checkpoint" })
    );
    this._subscribe("checkpoint:cleared", (p) => {
      if (this.state === "active" && p.method === "pay") {
        this._escape("surrendered");
      }
    });
  }

  _loadPoliceModel() {
    const path =
      MODEL_PATHS?.traffic?.police ||
      MODEL_PATHS?.traffic?.car3 ||
      "/assets/models/car-kit/police.glb";

    this._loader.load(
      path,
      (gltf) => {
        const model = gltf.scene;
        const box = new THREE.Box3().setFromObject(model);
        const size = box.getSize(new THREE.Vector3());
        const maxDim = Math.max(size.x, size.y, size.z) || 1;
        const scale = (MODEL_SCALES?.traffic?.police || 1) * (4.2 / maxDim);
        model.scale.setScalar(scale);
        const box2 = new THREE.Box3().setFromObject(model);
        model.position.y -= box2.min.y;
        model.rotation.y = Math.PI;
        model.traverse((c) => {
          if (c.isMesh) {
            c.castShadow = true;
            c.receiveShadow = true;
          }
        });
        this._policeTemplate = model;
        console.info("[ChaseSystem] Police GLB ready");
      },
      undefined,
      () => {
        console.warn("[ChaseSystem] Police GLB missing — using fallback mesh");
      }
    );
  }

  startChase(payload = {}) {
    if (!this.enabled || this.state === "active") return;

    this.state = "active";
    this.timer = 0;
    this.intensity = Number(payload.intensity) || 1;

    const playerZ = Number(this.player?.position?.z) || 0;
    const playerX = Number(this.player?.position?.x) || 0;

    this.policeZ = playerZ - 20;
    this.policeX = playerX;

    this._spawnPoliceVisual();
    this._showBanner("🚨 POLICE CHASE — Escape or get caught!");
    this.eventBus?.emit?.("audio:siren", { active: true });
    this.eventBus?.emit?.("hud:wanted-level", { level: this.intensity, active: true });
    this.eventBus?.emit?.("chase:started", { intensity: this.intensity });
  }

  update(deltaTime, playerZ = 0, playerSpeed = 0) {
    if (!this.enabled || this.state !== "active") return;

    const dt = Math.min(Number(deltaTime) || 0, 0.05);
    this.timer += dt;

    const z = Number(playerZ) || 0;
    const speed = Number(playerSpeed) || 0;
    const playerX = Number(this.player?.position?.x) || 0;

    // Police aggressively match player lane and gain speed
    const chaseSpeed = speed + this.config.policeSpeedBonus * this.intensity;
    this.policeZ += chaseSpeed * dt;
    this.policeX = THREE.MathUtils.damp(this.policeX, playerX, 3.0, dt);

    // Update all police meshes
    this.policeMeshes.forEach((mesh, index) => {
      const offsetX = index === 0 ? 0 : (index % 2 === 0 ? 3.5 : -3.5);
      const offsetZ = index === 0 ? 0 : -4;
      mesh.position.set(this.policeX + offsetX, 0, this.policeZ + offsetZ);
      
      // Flashing siren effect for fallback or if model has no built-in animation
      mesh.traverse((child) => {
        if (child.isMesh && child.material.emissive) {
          const flash = Math.sin(Date.now() * 0.015 + index) > 0;
          child.material.emissive.setHex(flash ? 0xff0000 : 0x0000ff);
          child.material.emissiveIntensity = flash ? 1.5 : 0.2;
        }
      });
    });

    const gap = z - this.policeZ;

    if (gap < this.config.catchDistance) {
      this._catchPlayer();
      return;
    }

    if (gap > this.config.escapeDistance || this.timer > this.config.duration) {
      this._escape("escaped_distance");
      return;
    }

    // Live update banner stats
    if (this._banner) {
      this._banner.querySelector(".chase-gap").textContent = `Gap: ${Math.max(0, Math.round(gap))}m`;
      this._banner.querySelector(".chase-time").textContent = `Time: ${Math.max(0, Math.ceil(this.config.duration - this.timer))}s`;
    }
  }

  _spawnPoliceVisual() {
    this._clearPolice();
    if (!this.scene) return;

    // Spawn 1 or 2 cars based on intensity
    const count = this.intensity >= 2 ? 2 : 1;
    for (let i = 0; i < count; i++) {
      let g;
      if (this._policeTemplate) {
        g = this._policeTemplate.clone(true);
        g.name = `chase-police-${i}`;
      } else {
        g = new THREE.Group();
        g.name = `chase-police-${i}`;
        const body = new THREE.Mesh(
          new THREE.BoxGeometry(1.9, 1.2, 4.2),
          new THREE.MeshStandardMaterial({ color: 0xf8fafc, flatShading: true })
        );
        body.position.y = 0.7;
        body.castShadow = true;
        g.add(body);
        
        const stripe = new THREE.Mesh(
          new THREE.BoxGeometry(1.92, 0.25, 4.22),
          new THREE.MeshStandardMaterial({ color: 0x1d4ed8 })
        );
        stripe.position.y = 0.85;
        g.add(stripe);
        
        const light = new THREE.Mesh(
          new THREE.BoxGeometry(0.8, 0.2, 0.8),
          new THREE.MeshStandardMaterial({
            color: 0xef4444,
            emissive: 0xdc2626,
            emissiveIntensity: 0.8,
          })
        );
        light.position.set(0, 1.45, 0.2);
        g.add(light);
      }

      g.position.set(this.policeX, 0, this.policeZ - (i * 4));
      this.scene.add(g);
      this.policeMeshes.push(g);
    }
  }

  _catchPlayer() {
    this.state = "caught";
    this._showBanner("🚨 CAUGHT by KAROTA / Police");
    this.eventBus?.emit?.("chase:caught", { timer: this.timer });
    this.eventBus?.emit?.("checkpoint:fined", { 
      amount: this.config.fineOnCatch, 
      paid: true, 
      caught: true 
    });
    this.eventBus?.emit?.("reputation:changed", { delta: -this.config.repHitOnCatch });
    this.eventBus?.emit?.("audio:sfx", "collision");
    this.eventBus?.emit?.("audio:siren", { active: false });
    this.eventBus?.emit?.("hud:wanted-level", { level: 0, active: false });
    
    setTimeout(() => this.reset(), 2500);
  }

  _escape(reason = "escaped") {
    this.state = "escaped";
    this._showBanner("✅ You escaped the chase!");
    this.eventBus?.emit?.("chase:escaped", { timer: this.timer, reason });
    this.eventBus?.emit?.("score:bonus", { amount: 150 * this.intensity, reason: "escape" });
    this.eventBus?.emit?.("audio:siren", { active: false });
    this.eventBus?.emit?.("hud:wanted-level", { level: 0, active: false });
    
    setTimeout(() => this.reset(), 2000);
  }

  _showBanner(text) {
    this._hideBanner();
    const el = document.createElement("div");
    el.id = "chase-banner";
    el.innerHTML = `
      <div class="chase-title">${text}</div>
      <div class="chase-stats">
        <span class="chase-gap">Gap: --m</span>
        <span class="chase-time">Time: --s</span>
      </div>
    `;
    Object.assign(el.style, {
      position: "fixed",
      top: "calc(12% + env(safe-area-inset-top, 0px))",
      left: "50%",
      transform: "translateX(-50%)",
      zIndex: "2100",
      background: "rgba(127, 29, 29, 0.9)",
      backdropFilter: "blur(8px)",
      color: "#fff",
      padding: "12px 24px",
      borderRadius: "12px",
      fontFamily: "system-ui, Arial, sans-serif",
      fontWeight: "800",
      fontSize: "16px",
      border: "2px solid #fca5a5",
      pointerEvents: "none",
      textAlign: "center",
      boxShadow: "0 8px 24px rgba(0,0,0,0.5)",
      animation: "slideDown 0.3s ease-out",
    });
    
    // Inject animation CSS if not present
    if (!document.getElementById("chase-anim-css")) {
      const style = document.createElement("style");
      style.id = "chase-anim-css";
      style.textContent = `
        @keyframes slideDown { from { transform: translate(-50%, -20px); opacity: 0; } to { transform: translate(-50%, 0); opacity: 1; } }
        .chase-title { margin-bottom: 6px; font-size: 15px; letter-spacing: 0.5px; }
        .chase-stats { display: flex; gap: 16px; justify-content: center; font-size: 13px; font-weight: 600; color: #fecaca; }
      `;
      document.head.appendChild(style);
    }

    document.body.appendChild(el);
    this._banner = el;
  }

  _hideBanner() {
    this._banner?.remove();
    this._banner = null;
  }

  _clearPolice() {
    for (const mesh of this.policeMeshes) {
      this.scene?.remove(mesh);
      mesh.traverse((c) => {
        if (c.isMesh) {
          c.geometry?.dispose();
          if (Array.isArray(c.material)) c.material.forEach((m) => m.dispose());
          else c.material?.dispose();
        }
      });
    }
    this.policeMeshes = [];
  }

  reset() {
    this.state = "idle";
    this.timer = 0;
    this._clearPolice();
    this._hideBanner();
    this.eventBus?.emit?.("audio:siren", { active: false });
    this.eventBus?.emit?.("hud:wanted-level", { level: 0, active: false });
  }

  _subscribe(name, handler) {
    if (!this.eventBus?.on) return;
    const u = this.eventBus.on(name, handler);
    if (typeof u === "function") this._disposers.push(u);
  }

  dispose() {
    this.reset();
    for (const u of this._disposers) {
      try { u(); } catch {}
    }
    this._disposers = [];
  }
}