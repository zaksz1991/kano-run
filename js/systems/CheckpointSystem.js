import * as THREE from "three";
import { GAME_CONFIG } from "../core/config.js";

/**
 * KAROTA roadside checkpoint:
 * - physical barrier + sign
 * - approach warning
 * - interactive stop panel (pay fine / negotiate / run)
 * - chase trigger on run / high speed
 */
export default class CheckpointSystem {
  constructor({
    scene,
    eventBus = null,
    playerVehicleSystem = null,
    config = {},
  } = {}) {
    if (!scene) throw new Error("CheckpointSystem requires a scene.");

    this.scene = scene;
    this.eventBus = eventBus;
    this.player = playerVehicleSystem;
    this.config = {
      speedLimit: 12,
      spawnStart: 220,
      spawnGapMin: 420,
      spawnGapMax: 620,
      approachDistance: 55,
      stopDistance: 6,
      fineBase: 200,
      ...(GAME_CONFIG?.checkpoint ?? {}),
      ...config,
    };

    this.checkpoints = [];
    this.nextSpawnZ = this.config.spawnStart;
    this.enabled = false;
    this.pausedForStop = false;
    this.activeStop = null;
    this._panel = null;
    this._disposers = [];

    this._subscribe("game:started", () => {
      this.enabled = true;
    });
    this._subscribe("game:stopped", () => {
      this.enabled = false;
      this.clear();
    });
    this._subscribe("game:over", () => {
      this.enabled = false;
      this.clear();
    });
    this._subscribe("game:resumed", () => {
      if (!this.activeStop) this.pausedForStop = false;
    });
  }

  update(deltaTime, playerZ = 0, playerSpeed = 0) {
    if (!this.enabled) return;

    const z = Number(playerZ) || 0;
    const speed = Number(playerSpeed) || 0;

    if (!this.activeStop && z + 350 > this.nextSpawnZ) {
      this._spawnCheckpoint(this.nextSpawnZ);
      this.nextSpawnZ +=
        this.config.spawnGapMin +
        Math.random() * (this.config.spawnGapMax - this.config.spawnGapMin);
    }

    for (let i = this.checkpoints.length - 1; i >= 0; i--) {
      const cp = this.checkpoints[i];

      if (cp.z < z - 60) {
        this.scene.remove(cp.mesh);
        this.checkpoints.splice(i, 1);
        continue;
      }

      const dist = cp.z - z;

      if (dist > 0 && dist < this.config.approachDistance && !cp.warned) {
        cp.warned = true;
        this.eventBus?.emit?.("checkpoint:approaching", {
          z: cp.z,
          speedLimit: this.config.speedLimit,
        });
        this.eventBus?.emit?.("audio:sfx", "whistle");
      }

      // Interactive stop when close and not already resolved
      if (
        !cp.passed &&
        !this.activeStop &&
        Math.abs(dist) < this.config.stopDistance
      ) {
        this._openStop(cp, speed);
      }
    }
  }

  _spawnCheckpoint(z) {
    const group = new THREE.Group();
    group.name = "karota-checkpoint";
    group.position.set(0, 0, z);

    const barrier = new THREE.Mesh(
      new THREE.BoxGeometry(12, 1.15, 0.45),
      new THREE.MeshStandardMaterial({
        color: 0xdc2626,
        flatShading: true,
        roughness: 0.7,
      }),
    );
    barrier.position.y = 0.55;
    barrier.castShadow = true;
    group.add(barrier);

    // White stripe
    const stripe = new THREE.Mesh(
      new THREE.BoxGeometry(12, 0.25, 0.48),
      new THREE.MeshStandardMaterial({ color: 0xf8fafc, flatShading: true }),
    );
    stripe.position.y = 0.55;
    group.add(stripe);

    for (const x of [-6.2, 6.2]) {
      const post = new THREE.Mesh(
        new THREE.CylinderGeometry(0.12, 0.14, 3.4, 8),
        new THREE.MeshStandardMaterial({ color: 0xf1f5f9 }),
      );
      post.position.set(x, 1.7, 0);
      post.castShadow = true;
      group.add(post);
    }

    const board = new THREE.Mesh(
      new THREE.BoxGeometry(2.4, 1.1, 0.12),
      new THREE.MeshStandardMaterial({ color: 0x0f172a }),
    );
    board.position.set(0, 2.6, 0);
    group.add(board);

    const label = new THREE.Mesh(
      new THREE.BoxGeometry(2.0, 0.45, 0.08),
      new THREE.MeshStandardMaterial({
        color: 0xfbbf24,
        emissive: 0xb45309,
        emissiveIntensity: 0.35,
      }),
    );
    label.position.set(0, 2.6, 0.1);
    group.add(label);

    // Officer placeholder
    const officer = new THREE.Mesh(
      new THREE.CapsuleGeometry(0.25, 0.7, 4, 8),
      new THREE.MeshStandardMaterial({ color: 0x166534 }),
    );
    officer.position.set(-4.5, 0.7, 1.2);
    officer.castShadow = true;
    group.add(officer);

    this.scene.add(group);
    this.checkpoints.push({
      z,
      mesh: group,
      passed: false,
      warned: false,
    });
  }

  _openStop(cp, playerSpeed) {
    cp.passed = true;
    this.activeStop = cp;
    this.pausedForStop = true;

    const overSpeed = Math.max(0, playerSpeed - this.config.speedLimit);
    const fine = Math.round(
      this.config.fineBase + overSpeed * 45 + Math.random() * 80,
    );

    this.eventBus?.emit?.("game:paused");
    this.eventBus?.emit?.("checkpoint:stop", {
      fine,
      speed: playerSpeed,
      speedLimit: this.config.speedLimit,
    });

    this._showPanel({
      fine,
      speed: Math.round(playerSpeed),
      limit: this.config.speedLimit,
      overSpeed: overSpeed > 0,
    });
  }

  _showPanel({ fine, speed, limit, overSpeed }) {
    this._hidePanel();

    const panel = document.createElement("div");
    panel.id = "karota-stop-panel";
    Object.assign(panel.style, {
      position: "fixed",
      left: "50%",
      top: "50%",
      transform: "translate(-50%, -50%)",
      zIndex: "2200",
      width: "min(360px, 92vw)",
      background: "rgba(15, 23, 42, 0.97)",
      border: "2px solid #fbbf24",
      borderRadius: "14px",
      padding: "20px",
      color: "#f8fafc",
      fontFamily: "system-ui, Arial, sans-serif",
      textAlign: "center",
      boxShadow: "0 16px 40px rgba(0,0,0,0.5)",
    });

    panel.innerHTML = `
      <div style="font-size:12px;letter-spacing:2px;color:#fbbf24;margin-bottom:6px">KAROTA CHECKPOINT</div>
      <div style="font-size:18px;font-weight:700;margin-bottom:8px">Stop for inspection</div>
      <div style="font-size:13px;color:#94a3b8;margin-bottom:14px">
        Your speed: <b style="color:#fff">${speed}</b> · Limit: <b>${limit}</b>
        ${overSpeed ? '<br><span style="color:#f87171">Over speed — fine applies</span>' : '<br><span style="color:#4ade80">Within limit</span>'}
      </div>
      <div style="font-size:22px;font-weight:800;margin-bottom:16px">Fine: ₦${fine}</div>
      <div style="display:flex;flex-direction:column;gap:8px">
        <button data-act="pay" style="padding:12px;border:0;border-radius:8px;background:#22c55e;color:#052e16;font-weight:700;cursor:pointer">Pay fine</button>
        <button data-act="negotiate" style="padding:12px;border:0;border-radius:8px;background:#fbbf24;color:#422006;font-weight:700;cursor:pointer">Negotiate</button>
        <button data-act="run" style="padding:12px;border:0;border-radius:8px;background:#ef4444;color:#fff;font-weight:700;cursor:pointer">Run (chase risk)</button>
      </div>
    `;

    panel.querySelectorAll("button").forEach((btn) => {
      btn.addEventListener("click", () => {
        const act = btn.getAttribute("data-act");
        this._resolveStop(act, fine);
      });
    });

    document.body.appendChild(panel);
    this._panel = panel;
  }

  _resolveStop(action, fine) {
    this._hidePanel();
    const cp = this.activeStop;
    this.activeStop = null;
    this.pausedForStop = false;

    if (action === "pay") {
      this.eventBus?.emit?.("checkpoint:fined", { amount: fine, paid: true });
      this.eventBus?.emit?.("economy:spend", { amount: fine, reason: "karota" });
      this.eventBus?.emit?.("checkpoint:cleared", { method: "pay" });
    } else if (action === "negotiate") {
      const reduced = Math.max(50, Math.round(fine * (0.45 + Math.random() * 0.25)));
      this.eventBus?.emit?.("checkpoint:fined", {
        amount: reduced,
        paid: true,
        negotiated: true,
      });
      this.eventBus?.emit?.("economy:spend", {
        amount: reduced,
        reason: "karota-negotiated",
      });
      this.eventBus?.emit?.("checkpoint:cleared", { method: "negotiate", amount: reduced });
    } else {
      // Run → police chase
      this.eventBus?.emit?.("checkpoint:chase-triggered", {
        reason: "ran-checkpoint",
        fine,
      });
      this.eventBus?.emit?.("chase:start", {
        intensity: 1,
        reason: "karota-run",
      });
      this.eventBus?.emit?.("audio:sfx", "warning");
    }

    this.eventBus?.emit?.("game:resumed");
  }

  _hidePanel() {
    this._panel?.remove();
    this._panel = null;
  }

  clear() {
    this._hidePanel();
    this.activeStop = null;
    this.pausedForStop = false;
    for (const cp of this.checkpoints) {
      this.scene.remove(cp.mesh);
    }
    this.checkpoints = [];
    this.nextSpawnZ = this.config.spawnStart;
  }

  _subscribe(event, handler) {
    if (!this.eventBus?.on) return;
    const unsub = this.eventBus.on(event, handler);
    if (typeof unsub === "function") this._disposers.push(unsub);
  }

  dispose() {
    this.clear();
    for (const unsub of this._disposers) {
      try {
        unsub();
      } catch {}
    }
    this._disposers = [];
  }
}
