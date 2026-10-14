import * as THREE from "three";

/**
 * Police / KAROTA chase after running a checkpoint or hitting marked unit.
 * States: idle → active → escaping → caught | escaped
 */
export default class ChaseSystem {
  constructor({
    scene,
    eventBus = null,
    playerVehicleSystem = null,
    config = {},
  } = {}) {
    this.scene = scene;
    this.eventBus = eventBus;
    this.player = playerVehicleSystem;
    this.config = {
      duration: 28,
      catchDistance: 4.5,
      escapeDistance: 85,
      policeSpeedBonus: 3.5,
      ...config,
    };

    this.state = "idle";
    this.timer = 0;
    this.intensity = 1;
    this.policeMesh = null;
    this.policeZ = 0;
    this.policeX = 0;
    this.enabled = false;
    this._banner = null;
    this._disposers = [];

    this._subscribe("game:started", () => {
      this.enabled = true;
    });
    this._subscribe("game:stopped", () => this.reset());
    this._subscribe("game:over", () => this.reset());
    this._subscribe("chase:start", (p) => this.startChase(p));
    this._subscribe("checkpoint:chase-triggered", (p) =>
      this.startChase({ ...p, reason: p?.reason || "checkpoint" }),
    );
  }

  startChase(payload = {}) {
    if (!this.enabled || this.state === "active") return;

    this.state = "active";
    this.timer = 0;
    this.intensity = Number(payload.intensity) || 1;

    const playerZ = Number(this.player?.position?.z) || 0;
    const playerX = Number(this.player?.position?.x) || 0;

    this.policeZ = playerZ - 18;
    this.policeX = playerX;

    this._spawnPoliceVisual();
    this._showBanner("POLICE CHASE — escape or get caught!");
    this.eventBus?.emit?.("audio:sfx", "warning");
    this.eventBus?.emit?.("chase:started", { intensity: this.intensity });
  }

  update(deltaTime, playerZ = 0, playerSpeed = 0) {
    if (!this.enabled || this.state !== "active") return;

    const dt = Math.min(Number(deltaTime) || 0, 0.05);
    this.timer += dt;

    const z = Number(playerZ) || 0;
    const speed = Number(playerSpeed) || 0;
    const playerX = Number(this.player?.position?.x) || 0;

    // Police closes in
    const chaseSpeed = speed + this.config.policeSpeedBonus * this.intensity;
    this.policeZ += chaseSpeed * dt;
    this.policeX = THREE.MathUtils.damp(this.policeX, playerX, 2.5, dt);

    if (this.policeMesh) {
      this.policeMesh.position.set(this.policeX, 0, this.policeZ);
    }

    const gap = z - this.policeZ;

    if (gap < this.config.catchDistance) {
      this._catchPlayer();
      return;
    }

    if (gap > this.config.escapeDistance || this.timer > this.config.duration) {
      this._escape();
      return;
    }

    // Update banner distance
    if (this._banner) {
      this._banner.textContent = `CHASE · gap ${Math.max(0, Math.round(gap))}m · ${Math.max(0, Math.ceil(this.config.duration - this.timer))}s`;
    }
  }

  _spawnPoliceVisual() {
    this._clearPolice();
    if (!this.scene) return;

    const g = new THREE.Group();
    g.name = "chase-police";

    const body = new THREE.Mesh(
      new THREE.BoxGeometry(1.9, 1.2, 4.2),
      new THREE.MeshStandardMaterial({ color: 0xf8fafc, flatShading: true }),
    );
    body.position.y = 0.7;
    body.castShadow = true;
    g.add(body);

    const stripe = new THREE.Mesh(
      new THREE.BoxGeometry(1.92, 0.25, 4.22),
      new THREE.MeshStandardMaterial({ color: 0x1d4ed8 }),
    );
    stripe.position.y = 0.85;
    g.add(stripe);

    const light = new THREE.Mesh(
      new THREE.BoxGeometry(0.8, 0.2, 0.8),
      new THREE.MeshStandardMaterial({
        color: 0xef4444,
        emissive: 0xdc2626,
        emissiveIntensity: 0.8,
      }),
    );
    light.position.set(0, 1.45, 0.2);
    g.add(light);

    g.position.set(this.policeX, 0, this.policeZ);
    this.scene.add(g);
    this.policeMesh = g;
  }

  _catchPlayer() {
    this.state = "caught";
    this._showBanner("CAUGHT by KAROTA / Police");
    this.eventBus?.emit?.("chase:caught", { timer: this.timer });
    this.eventBus?.emit?.("checkpoint:fined", {
      amount: 500,
      paid: false,
      caught: true,
    });
    this.eventBus?.emit?.("economy:spend", { amount: 500, reason: "chase-caught" });
    this.eventBus?.emit?.("audio:sfx", "collision");
    setTimeout(() => this.reset(), 2200);
  }

  _escape() {
    this.state = "escaped";
    this._showBanner("You escaped the chase!");
    this.eventBus?.emit?.("chase:escaped", { timer: this.timer });
    this.eventBus?.emit?.("score:bonus", { amount: 150, reason: "escape" });
    setTimeout(() => this.reset(), 1800);
  }

  _showBanner(text) {
    this._hideBanner();
    const el = document.createElement("div");
    el.id = "chase-banner";
    Object.assign(el.style, {
      position: "fixed",
      top: "12%",
      left: "50%",
      transform: "translateX(-50%)",
      zIndex: "2100",
      background: "rgba(127,29,29,0.92)",
      color: "#fff",
      padding: "10px 22px",
      borderRadius: "8px",
      fontFamily: "system-ui, Arial, sans-serif",
      fontWeight: "700",
      fontSize: "15px",
      border: "1px solid #fca5a5",
      pointerEvents: "none",
    });
    el.textContent = text;
    document.body.appendChild(el);
    this._banner = el;
  }

  _hideBanner() {
    this._banner?.remove();
    this._banner = null;
  }

  _clearPolice() {
    if (this.policeMesh) {
      this.scene?.remove(this.policeMesh);
      this.policeMesh = null;
    }
  }

  reset() {
    this.state = "idle";
    this.timer = 0;
    this._clearPolice();
    this._hideBanner();
  }

  _subscribe(name, handler) {
    if (!this.eventBus?.on) return;
    const u = this.eventBus.on(name, handler);
    if (typeof u === "function") this._disposers.push(u);
  }

  dispose() {
    this.reset();
    for (const u of this._disposers) {
      try {
        u();
      } catch {}
    }
    this._disposers = [];
  }
}
