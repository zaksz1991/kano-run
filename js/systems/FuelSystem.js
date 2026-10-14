import * as THREE from "three";

/**
 * Fuel consumption + petrol station stops (Kano-style).
 * Stations spawn ahead; stop nearby to refuel for ₦.
 */
const DEFAULTS = {
  maxFuel: 100,
  burnPerSecondAtFull: 1.8,
  stationGapMin: 380,
  stationGapMax: 620,
  firstStationZ: 280,
  interactDistance: 10,
  refuelAmount: 55,
  refuelCost: 800,
  lowFuelWarn: 25,
};

export default class FuelSystem {
  constructor({
    scene,
    eventBus = null,
    playerVehicleSystem = null,
    config = {},
  } = {}) {
    this.scene = scene;
    this.eventBus = eventBus;
    this.player = playerVehicleSystem;
    this.config = { ...DEFAULTS, ...config };

    this.fuel = this.config.maxFuel;
    this.stations = [];
    this.nextStationZ = this.config.firstStationZ;
    this.enabled = false;
    this._panel = null;
    this._disposers = [];
    this._lowWarned = false;

    this._subscribe("game:started", () => {
      this.enabled = true;
      this.fuel = this.config.maxFuel;
      this.nextStationZ = this.config.firstStationZ;
      this._lowWarned = false;
      this._clearStations();
      this._emit();
    });
    this._subscribe("game:stopped", () => {
      this.enabled = false;
      this._hidePanel();
      this._clearStations();
    });
    this._subscribe("vehicle:refueled", (p) => {
      const amt = Number(p?.liters ?? p?.amount) || this.config.refuelAmount;
      this.fuel = Math.min(this.config.maxFuel, this.fuel + amt);
      this._emit();
    });
  }

  update(deltaTime, playerZ = 0, playerSpeed = 0) {
    if (!this.enabled) return;
    const dt = Math.min(Number(deltaTime) || 0, 0.1);
    const z = Number(playerZ) || 0;
    const speed = Math.max(0, Number(playerSpeed) || 0);

    // Burn more when moving faster
    const burn =
      (speed / 20) * this.config.burnPerSecondAtFull * dt +
      (speed > 0.5 ? 0.15 * dt : 0);
    this.fuel = Math.max(0, this.fuel - burn);

    if (this.fuel <= this.config.lowFuelWarn && !this._lowWarned) {
      this._lowWarned = true;
      this.eventBus?.emit?.("fuel:low", { fuel: this.fuel });
      this.eventBus?.emit?.("hud:notify", {
        text: "Fuel low — find a petrol station",
        type: "urgent",
      });
    }
    if (this.fuel > this.config.lowFuelWarn) this._lowWarned = false;

    if (this.fuel <= 0) {
      this.eventBus?.emit?.("fuel:empty");
      // Soft limit speed via event — player system can listen
      this.eventBus?.emit?.("player:force-speed-cap", { maxSpeed: 4 });
    }

    this._emit();

    if (z + 320 > this.nextStationZ) {
      this._spawnStation(this.nextStationZ);
      this.nextStationZ +=
        this.config.stationGapMin +
        Math.random() * (this.config.stationGapMax - this.config.stationGapMin);
    }

    for (let i = this.stations.length - 1; i >= 0; i--) {
      const st = this.stations[i];
      if (st.z < z - 50) {
        this.scene.remove(st.mesh);
        this.stations.splice(i, 1);
        continue;
      }
      const dist = Math.abs(st.z - z);
      if (dist < this.config.interactDistance && speed < 6 && !st.used) {
        this._openRefuel(st);
      }
    }
  }

  _spawnStation(z) {
    const side = Math.random() > 0.5 ? 1 : -1;
    const group = new THREE.Group();
    group.name = "petrol-station";

    const canopy = new THREE.Mesh(
      new THREE.BoxGeometry(8, 0.3, 6),
      new THREE.MeshStandardMaterial({ color: 0xfbbf24, flatShading: true }),
    );
    canopy.position.set(side * 14, 4.2, 0);
    canopy.castShadow = true;
    group.add(canopy);

    for (const ox of [-2.5, 2.5]) {
      const post = new THREE.Mesh(
        new THREE.CylinderGeometry(0.15, 0.15, 4, 8),
        new THREE.MeshStandardMaterial({ color: 0x64748b }),
      );
      post.position.set(side * 14 + ox, 2, 0);
      group.add(post);
    }

    const pump = new THREE.Mesh(
      new THREE.BoxGeometry(1.2, 2.2, 1),
      new THREE.MeshStandardMaterial({ color: 0xef4444, flatShading: true }),
    );
    pump.position.set(side * 14, 1.1, 1.5);
    pump.castShadow = true;
    group.add(pump);

    const sign = new THREE.Mesh(
      new THREE.BoxGeometry(3, 1.5, 0.15),
      new THREE.MeshStandardMaterial({
        color: 0x16a34a,
        emissive: 0x14532d,
        emissiveIntensity: 0.3,
      }),
    );
    sign.position.set(side * 14, 5.5, 0);
    group.add(sign);

    group.position.z = z;
    this.scene.add(group);
    this.stations.push({ z, mesh: group, used: false, side });
  }

  _openRefuel(st) {
    if (this._panel) return;
    st.used = true;
    this.eventBus?.emit?.("game:paused");

    const need = this.config.maxFuel - this.fuel;
    const cost = this.config.refuelCost;

    const panel = document.createElement("div");
    panel.id = "fuel-station-panel";
    Object.assign(panel.style, {
      position: "fixed",
      left: "50%",
      top: "50%",
      transform: "translate(-50%, -50%)",
      zIndex: "2200",
      width: "min(320px, 92vw)",
      background: "rgba(15,23,42,0.97)",
      border: "2px solid #fbbf24",
      borderRadius: "14px",
      padding: "20px",
      color: "#f8fafc",
      fontFamily: "system-ui, Arial, sans-serif",
      textAlign: "center",
    });

    panel.innerHTML = `
      <div style="font-size:12px;letter-spacing:2px;color:#fbbf24;margin-bottom:6px">PETROL STATION</div>
      <div style="font-size:18px;font-weight:700;margin-bottom:8px">Fill tank?</div>
      <div style="font-size:13px;color:#94a3b8;margin-bottom:14px">
        Fuel: ${Math.round(this.fuel)}% · Cost: ₦${cost}
      </div>
      <div style="display:flex;flex-direction:column;gap:8px">
        <button data-act="fill" style="padding:12px;border:0;border-radius:8px;background:#22c55e;color:#052e16;font-weight:700;cursor:pointer">Refuel ₦${cost}</button>
        <button data-act="skip" style="padding:12px;border:0;border-radius:8px;background:#334155;color:#e2e8f0;font-weight:700;cursor:pointer">Drive on</button>
      </div>
    `;

    panel.querySelector('[data-act="fill"]').addEventListener("click", () => {
      this.eventBus?.emit?.("economy:spend", {
        amount: cost,
        reason: "fuel",
      });
      this.eventBus?.emit?.("vehicle:refueled", {
        liters: this.config.refuelAmount,
        amount: this.config.refuelAmount,
      });
      this.fuel = Math.min(
        this.config.maxFuel,
        this.fuel + this.config.refuelAmount,
      );
      this._emit();
      this._hidePanel();
      this.eventBus?.emit?.("game:resumed");
      this.eventBus?.emit?.("hud:notify", {
        text: "Tank filled",
        type: "success",
      });
    });
    panel.querySelector('[data-act="skip"]').addEventListener("click", () => {
      this._hidePanel();
      this.eventBus?.emit?.("game:resumed");
    });

    document.body.appendChild(panel);
    this._panel = panel;
  }

  _emit() {
    this.eventBus?.emit?.("fuel:status", {
      fuel: this.fuel,
      max: this.config.maxFuel,
      percent: Math.round((this.fuel / this.config.maxFuel) * 100),
    });
  }

  _hidePanel() {
    this._panel?.remove();
    this._panel = null;
  }

  _clearStations() {
    for (const st of this.stations) this.scene?.remove(st.mesh);
    this.stations = [];
  }

  _subscribe(name, handler) {
    if (!this.eventBus?.on) return;
    const u = this.eventBus.on(name, handler);
    if (typeof u === "function") this._disposers.push(u);
  }

  dispose() {
    this._hidePanel();
    this._clearStations();
    for (const u of this._disposers) {
      try {
        u();
      } catch {}
    }
    this._disposers = [];
  }
}
