import * as THREE from "three";
import { GAME_CONFIG } from "../core/config.js";

/**
 * KAROTA roadside checkpoint:
 * - Physical barrier + official signage
 * - Approach warning (audio/visual)
 * - Interactive stop panel (Pay / Negotiate / Run)
 * - Evaluates Speed AND Vehicle Condition
 * - Triggers chase and reputation loss on evasion
 */
export default class CheckpointSystem {
  constructor({
    scene,
    eventBus = null,
    playerVehicleSystem = null,
    gameState = null,
    config = {},
  } = {}) {
    if (!scene) throw new Error("CheckpointSystem requires a scene.");

    this.scene = scene;
    this.eventBus = eventBus;
    this.player = playerVehicleSystem;
    this.gameState = gameState;
    this.config = {
      speedLimit: 18, // km/h
      spawnStart: 550,
      spawnGapMin: 900,
      spawnGapMax: 1400,
      approachDistance: 60,
      stopDistance: 8,
      fineBase: 1500,
      finePerKmOver: 300,
      bribeMultiplier: 2.2,
      repHitNegotiate: 10,
      repHitRun: 35,
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
      this.nextSpawnZ = this.config.spawnStart;
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

  update(deltaTime, playerZ = 0, playerSpeed = 0, playerCondition = 100) {
    if (!this.enabled) return;

    const z = Number(playerZ) || 0;
    const speed = Number(playerSpeed) || 0;
    const condition = Number(playerCondition) || 100;

    // Spawn new checkpoints ahead
    if (!this.activeStop && z + 350 > this.nextSpawnZ) {
      this._spawnCheckpoint(this.nextSpawnZ);
      this.nextSpawnZ +=
        this.config.spawnGapMin +
        Math.random() * (this.config.spawnGapMax - this.config.spawnGapMin);
    }

    // Update existing checkpoints
    for (let i = this.checkpoints.length - 1; i >= 0; i--) {
      const cp = this.checkpoints[i];

      // Cull old checkpoints
      if (cp.z < z - 80) {
        this.scene.remove(cp.mesh);
        this.checkpoints.splice(i, 1);
        continue;
      }

      const dist = cp.z - z;

      // Approach warning
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
        this._openStop(cp, speed, condition);
      }
    }
  }

  _spawnCheckpoint(z) {
    const group = new THREE.Group();
    group.name = "karota-checkpoint";
    group.position.set(0, 0, z);

    // Red and white barrier
    const barrier = new THREE.Mesh(
      new THREE.BoxGeometry(12, 1.15, 0.45),
      new THREE.MeshStandardMaterial({ color: 0xdc2626, flatShading: true, roughness: 0.7 })
    );
    barrier.position.y = 0.55;
    barrier.castShadow = true;
    group.add(barrier);

    const stripe = new THREE.Mesh(
      new THREE.BoxGeometry(12, 0.25, 0.48),
      new THREE.MeshStandardMaterial({ color: 0xf8fafc, flatShading: true })
    );
    stripe.position.y = 0.55;
    group.add(stripe);

    // Support posts
    for (const x of [-6.2, 6.2]) {
      const post = new THREE.Mesh(
        new THREE.CylinderGeometry(0.12, 0.14, 3.4, 8),
        new THREE.MeshStandardMaterial({ color: 0xf1f5f9 })
      );
      post.position.set(x, 1.7, 0);
      post.castShadow = true;
      group.add(post);
    }

    // Official KAROTA Sign Board
    const board = new THREE.Mesh(
      new THREE.BoxGeometry(2.6, 1.2, 0.12),
      new THREE.MeshStandardMaterial({ color: 0x0f172a })
    );
    board.position.set(0, 2.8, 0);
    group.add(board);

    const label = new THREE.Mesh(
      new THREE.BoxGeometry(2.2, 0.5, 0.08),
      new THREE.MeshStandardMaterial({
        color: 0xfbbf24,
        emissive: 0xb45309,
        emissiveIntensity: 0.35,
      })
    );
    label.position.set(0, 2.8, 0.1);
    group.add(label);

    // Officer placeholder
    const officer = new THREE.Mesh(
      new THREE.CapsuleGeometry(0.25, 0.7, 4, 8),
      new THREE.MeshStandardMaterial({ color: 0x166534 })
    );
    officer.position.set(-4.5, 0.7, 1.2);
    officer.castShadow = true;
    group.add(officer);

    this.scene.add(group);
    this.checkpoints.push({ z, mesh: group, passed: false, warned: false });
  }

  _openStop(cp, playerSpeed, playerCondition) {
    cp.passed = true;
    this.activeStop = cp;
    this.pausedForStop = true;

    const overSpeed = Math.max(0, playerSpeed - this.config.speedLimit);
    const isDamaged = playerCondition < 50;
    
    // Calculate fine based on speed and condition
    let fine = this.config.fineBase + (overSpeed * this.config.finePerKmOver);
    if (isDamaged) fine += 1000; // Extra fine for unroadworthy vehicle

    fine = Math.round(fine + Math.random() * 100);

    this.eventBus?.emit?.("game:paused");
    this.eventBus?.emit?.("checkpoint:stop", {
      fine,
      speed: playerSpeed,
      condition: playerCondition,
      speedLimit: this.config.speedLimit,
    });

    this._showPanel({
      fine,
      speed: Math.round(playerSpeed),
      limit: this.config.speedLimit,
      condition: Math.round(playerCondition),
      overSpeed: overSpeed > 0,
      isDamaged,
    });
  }

  _showPanel({ fine, speed, limit, condition, overSpeed, isDamaged }) {
    this._hidePanel();
    
    // Inject CSS if not already present
    if (!document.getElementById("karota-panel-css")) {
      const style = document.createElement("style");
      style.id = "karota-panel-css";
      style.textContent = `
        #kano-karota-panel {
          position: fixed; inset: 0; z-index: 8000;
          display: flex; align-items: center; justify-content: center;
          padding: 16px; background: rgba(3, 9, 18, 0.85);
          backdrop-filter: blur(8px);
          font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
          color: #f8fafc; animation: fadeIn 0.3s ease-out;
        }
        @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
        .karota-card {
          width: min(380px, 100%);
          background: linear-gradient(160deg, #1e293b, #0f172a);
          border: 2px solid #f59e0b; border-radius: 16px;
          padding: 24px; box-shadow: 0 20px 50px rgba(0,0,0,0.6);
        }
        .karota-header {
          font-size: 12px; letter-spacing: 2px; color: #fbbf24; font-weight: 900;
          text-transform: uppercase; text-align: center; margin-bottom: 8px;
        }
        .karota-title {
          font-size: 22px; font-weight: 900; text-align: center; margin-bottom: 16px;
        }
        .karota-stats {
          background: rgba(0,0,0,0.3); border-radius: 10px; padding: 14px; margin-bottom: 16px;
        }
        .karota-stat {
          display: flex; justify-content: space-between; align-items: center;
          padding: 8px 0; border-bottom: 1px solid rgba(255,255,255,0.1);
          font-size: 14px;
        }
        .karota-stat:last-child { border-bottom: none; }
        .stat-label { color: #94a3b8; font-weight: 600; }
        .stat-value { font-weight: 800; font-variant-numeric: tabular-nums; }
        .stat-value.danger { color: #f87171; }
        .stat-value.warning { color: #fbbf24; }
        .stat-value.success { color: #4ade80; }
        
        .fine-box {
          text-align: center; margin-bottom: 20px; padding: 12px;
          background: rgba(251, 191, 36, 0.1); border: 1px solid rgba(251, 191, 36, 0.3);
          border-radius: 10px;
        }
        .fine-label { font-size: 12px; color: #94a3b8; text-transform: uppercase; letter-spacing: 1px; }
        .fine-amount { font-size: 32px; font-weight: 900; color: #fbbf24; margin-top: 4px; }
        .fine-note { font-size: 11px; color: #64748b; margin-top: 6px; line-height: 1.4; }

        .karota-actions { display: grid; gap: 10px; }
        .karota-btn {
          width: 100%; padding: 14px; border: 0; border-radius: 10px;
          font-weight: 800; font-size: 15px; cursor: pointer; text-transform: uppercase;
          transition: transform 0.1s, opacity 0.2s;
        }
        .karota-btn:active { transform: scale(0.97); }
        .karota-btn:disabled { opacity: 0.5; cursor: not-allowed; }
        .btn-pay { background: #22c55e; color: #052e16; }
        .btn-negotiate { background: transparent; border: 1px solid #38bdf8; color: #e0f2fe; }
        .btn-run { background: transparent; border: 1px solid #f87171; color: #fecaca; font-size: 13px; padding: 12px; margin-top: 4px; }
      `;
      document.head.appendChild(style);
    }

    const canAfford = (this.gameState?.profile?.money || 0) >= fine;

    const panel = document.createElement("div");
    panel.id = "kano-karota-panel";
    panel.innerHTML = `
      <div class="karota-card">
        <div class="karota-header">Kano State Road Traffic Authority</div>
        <div class="karota-title">Official Checkpoint Stop</div>
        
        <div class="karota-stats">
          <div class="karota-stat">
            <span class="stat-label">Recorded Speed</span>
            <span class="stat-value ${overSpeed ? 'danger' : 'success'}">${speed} / ${limit} km/h</span>
          </div>
          <div class="karota-stat">
            <span class="stat-label">Vehicle Condition</span>
            <span class="stat-value ${isDamaged ? 'danger' : 'success'}">${condition}%</span>
          </div>
        </div>

        <div class="fine-box">
          <div class="fine-label">Assessed Fine</div>
          <div class="fine-amount">₦${fine.toLocaleString()}</div>
          <div class="fine-note">
            ${overSpeed && isDamaged ? 'Speeding + Unroadworthy vehicle.' : overSpeed ? 'Speed limit exceeded.' : isDamaged ? 'Vehicle condition below safety standards.' : 'Random safety inspection.'}
            <br>Paying preserves your reputation.
          </div>
        </div>

        <div class="karota-actions">
          <button class="karota-btn btn-pay" data-act="pay" ${!canAfford ? 'disabled' : ''}>
            Pay Fine (₦${fine.toLocaleString()})
          </button>
          <button class="karota-btn btn-negotiate" data-act="negotiate">
            Negotiate (Risky)
          </button>
          <button class="karota-btn btn-run" data-act="run">
            🚨 Drive Off (Risk Chase)
          </button>
        </div>
      </div>
    `;

    document.body.appendChild(panel);
    this._panel = panel;

    panel.querySelectorAll("[data-act]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const act = btn.getAttribute("data-act");
        this._resolveStop(act, fine);
      });
    });
  }

  _resolveStop(action, fine) {
    this._hidePanel();
    this.activeStop = null;
    this.pausedForStop = false;

    if (action === "pay") {
      // Emit event for EconomySystem to handle deduction
      this.eventBus?.emit?.("checkpoint:fined", { amount: fine, speedOverLimit: Math.max(0, fine - this.config.fineBase) });
      this.eventBus?.emit?.("checkpoint:cleared", { method: "pay" });
    } else if (action === "negotiate") {
      // 50% chance to succeed, 50% chance to anger officer and pay full + rep hit
      const success = Math.random() > 0.5;
      if (success) {
        const reduced = Math.max(500, Math.round(fine * (0.4 + Math.random() * 0.3)));
        this.eventBus?.emit?.("checkpoint:fined", { amount: reduced, speedOverLimit: 0 });
        this.eventBus?.emit?.("reputation:changed", { delta: -this.config.repHitNegotiate });
        this.eventBus?.emit?.("checkpoint:cleared", { method: "negotiate", amount: reduced });
      } else {
        this.eventBus?.emit?.("checkpoint:fined", { amount: fine, speedOverLimit: Math.max(0, fine - this.config.fineBase) });
        this.eventBus?.emit?.("reputation:changed", { delta: -this.config.repHitNegotiate * 2 });
        this.eventBus?.emit?.("checkpoint:cleared", { method: "negotiate_failed", amount: fine });
      }
    } else {
      // Run → police chase
      this.eventBus?.emit?.("reputation:changed", { delta: -this.config.repHitRun });
      this.eventBus?.emit?.("checkpoint:chase-triggered", { reason: "ran-checkpoint", fine });
      this.eventBus?.emit?.("chase:started", { intensity: 1, reason: "karota-run" });
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
      try { unsub(); } catch {}
    }
    this._disposers = [];
  }
}