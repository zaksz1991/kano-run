import { GAME_CONFIG } from "../core/config.js";

const DEFAULT_DRIVERS = [
  { id: "ruffneck", name: "RuffNeck", bonus: { speed: 1.08, handling: 1.05, fare: 1.1 }, unlocked: true },
  { id: "baba", name: "Baba", bonus: { speed: 0.92, handling: 1.2, fare: 1.05 }, unlocked: true },
  { id: "mama", name: "Mama", bonus: { speed: 0.95, handling: 1.15, fare: 1.12 }, unlocked: true },
  { id: "mayen_mata", name: "Mayen Mata", bonus: { speed: 1.05, handling: 1.0, fare: 1.15 }, unlocked: false },
  { id: "uztaz", name: "Uztaz", bonus: { speed: 0.9, handling: 1.25, fare: 1.0 }, unlocked: false },
  { id: "area_boy", name: "Area Boy", bonus: { speed: 1.18, handling: 0.88, fare: 0.95 }, unlocked: false },
];

const DEFAULT_KEKES = [
  { id: "standard", name: "Standard Adaidaita", stats: { maxSpeed: 25, acceleration: 10, handling: 1.0, fuelCapacity: 100 }, unlocked: true },
  { id: "luxury", name: "Luxury Adaidaita", stats: { maxSpeed: 29, acceleration: 12, handling: 1.12, fuelCapacity: 115 }, unlocked: false },
  { id: "cargo", name: "Cargo Adaidaita", stats: { maxSpeed: 22, acceleration: 8, handling: 0.85, fuelCapacity: 120 }, unlocked: false },
  { id: "open", name: "Open Top", stats: { maxSpeed: 27, acceleration: 11, handling: 1.05, fuelCapacity: 95 }, unlocked: false },
];

const DEFAULT_PAINTS = [
  { id: "classic", name: "Napep Yellow", color: 0xfbbf24, unlocked: true },
  { id: "green", name: "Kano Green", color: 0x16a34a, unlocked: true },
  { id: "blue", name: "Union Blue", color: 0x2563eb, unlocked: false },
  { id: "red", name: "Challenge Red", color: 0xdc2626, unlocked: false },
  { id: "white", name: "Clean White", color: 0xf8fafc, unlocked: false },
  { id: "black", name: "Night Black", color: 0x1e293b, unlocked: false },
  { id: "orange", name: "Harmattan Orange", color: 0xea580c, unlocked: false },
];

function hexCss(n) {
  return "#" + (Number(n) >>> 0).toString(16).padStart(6, "0");
}

export default class GarageSystem {
  constructor({ eventBus = null, gameState = null, saveManager = null, config = {} } = {}) {
    this.eventBus = eventBus;
    this.gameState = gameState;
    this.saveManager = saveManager;
    this.config = { ...(GAME_CONFIG?.garage ?? {}), ...config };

    this.drivers = DEFAULT_DRIVERS.map((d) => ({ ...d, bonus: { ...d.bonus } }));
    this.vehicles = DEFAULT_KEKES.map((v) => ({ ...v, stats: { ...v.stats } }));
    this.paints = DEFAULT_PAINTS.map((p) => ({ ...p }));

    this.selectedDriver = "ruffneck";
    this.selectedVehicle = "standard";
    this.selectedPaint = "classic";

    this._panel = null;
    this._disposers = [];
    this._onWindowGarage = () => this.openUI();
    if (typeof window !== "undefined") {
      window.addEventListener("kano:open-garage", this._onWindowGarage);
    }
    this._bindEvents();
  }

  _bindEvents() {
    this._subscribe("garage:selectDriver", (id) => this.selectDriver(id));
    this._subscribe("garage:selectVehicle", (id) => this.selectVehicle(id));
    this._subscribe("garage:selectPaint", (id) => this.selectPaint(id));
    this._subscribe("garage:open", () => this.openUI());
    this._subscribe("garage:close", () => this.closeUI());
    this._subscribe("game:started", () => {
      this.closeUI();
      this.applySelections();
    });
  }

  initialize() {
    if (this.saveManager) {
      const profile = this.saveManager.getProfile?.() || this.gameState?.profile || {};
      if (profile.unlockedDrivers) this._mergeUnlocks(this.drivers, profile.unlockedDrivers);
      if (profile.unlockedVehicles) this._mergeUnlocks(this.vehicles, profile.unlockedVehicles);
      if (profile.unlockedPaints) this._mergeUnlocks(this.paints, profile.unlockedPaints);
      if (profile.selectedDriver) this.selectedDriver = profile.selectedDriver;
      if (profile.selectedVehicle) this.selectedVehicle = profile.selectedVehicle;
      if (profile.selectedPaint) this.selectedPaint = profile.selectedPaint;
    }
    this._emitUpdate();
    this._injectFab();
    return this;
  }

  _injectFab() {
    if (typeof document === "undefined") return;
    if (document.getElementById("kano-garage-fab")) return;
    const fab = document.createElement("button");
    fab.id = "kano-garage-fab";
    fab.type = "button";
    fab.title = "Garage (G)";
    fab.textContent = "🎨";
    Object.assign(fab.style, {
      position: "fixed",
      top: "16px",
      left: "68px",
      zIndex: "1800",
      width: "44px",
      height: "44px",
      borderRadius: "12px",
      border: "1px solid rgba(0,180,216,0.5)",
      background: "rgba(15,23,42,0.92)",
      fontSize: "20px",
      cursor: "pointer",
    });
    fab.addEventListener("click", () => this.openUI());
    document.body.appendChild(fab);

    this._onKey = (e) => {
      if (e.key === "g" || e.key === "G") {
        if (this._panel) this.closeUI();
        else this.openUI();
      }
    };
    window.addEventListener("keydown", this._onKey);
  }

  openUI() {
    this.closeUI();
    const paint = this.paints.find((p) => p.id === this.selectedPaint);
    const color = hexCss(paint?.color ?? 0xfbbf24);

    const root = document.createElement("div");
    root.id = "kano-garage-ui";
    const isMobile = typeof window !== "undefined" && (window.innerWidth <= 900 || matchMedia("(pointer: coarse)").matches);
    Object.assign(root.style, {
      position: "fixed",
      inset: "0",
      zIndex: "9000",
      background: "rgba(3,9,18,0.92)",
      display: "flex",
      alignItems: isMobile ? "flex-end" : "center",
      justifyContent: "center",
      padding: isMobile ? "0" : "16px",
      fontFamily: "system-ui, Arial, sans-serif",
      color: "#f8fafc",
    });

    const panel = document.createElement("div");
    Object.assign(panel.style, {
      width: isMobile ? "100%" : "min(520px, 100%)",
      maxHeight: isMobile ? "88dvh" : "90vh",
      overflowY: "auto",
      background: "linear-gradient(145deg,#14243a,#081321)",
      border: "1px solid rgba(0,180,216,0.4)",
      borderRadius: isMobile ? "16px 16px 0 0" : "16px",
      padding: isMobile ? "16px 16px calc(16px + env(safe-area-inset-bottom, 0px))" : "20px",
    });

    panel.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px">
        <div>
          <div style="font-size:12px;letter-spacing:2px;color:#00b4d8">GARAGE</div>
          <div style="font-size:22px;font-weight:900">Adaidaita Sahu</div>
        </div>
        <button data-close style="padding:8px 14px;border:0;border-radius:8px;background:#334155;color:#fff;font-weight:700;cursor:pointer">Close</button>
      </div>
      <div style="display:flex;gap:16px;flex-wrap:wrap;margin-bottom:16px;align-items:center">
        <div data-preview style="width:120px;height:90px;border-radius:12px;background:${color};border:2px solid #fff;box-shadow:0 8px 24px rgba(0,0,0,0.35);position:relative">
          <div style="position:absolute;bottom:8px;left:10px;right:10px;height:14px;background:rgba(0,0,0,0.25);border-radius:4px"></div>
          <div style="position:absolute;top:12px;left:16px;right:16px;height:36px;background:rgba(255,255,255,0.35);border-radius:6px 6px 2px 2px"></div>
        </div>
        <div style="flex:1;min-width:160px">
          <div style="font-weight:800" data-paint-name>${paint?.name || "Paint"}</div>
          <div style="font-size:12px;color:#94a3b8">Live paint preview · pick a colour below</div>
        </div>
      </div>
      <div style="font-size:11px;letter-spacing:1px;color:#94a3b8;margin-bottom:6px">PAINT</div>
      <div data-paints style="display:flex;flex-wrap:wrap;gap:8px;margin-bottom:16px"></div>
      <div style="font-size:11px;letter-spacing:1px;color:#94a3b8;margin-bottom:6px">DRIVER</div>
      <div data-drivers style="display:flex;flex-direction:column;gap:6px;margin-bottom:16px"></div>
      <div style="font-size:11px;letter-spacing:1px;color:#94a3b8;margin-bottom:6px">KEKE</div>
      <div data-vehicles style="display:flex;flex-direction:column;gap:6px"></div>
    `;

    const paintsEl = panel.querySelector("[data-paints]");
    for (const p of this.paints) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.title = p.name + (p.unlocked ? "" : " (locked)");
      Object.assign(btn.style, {
        width: "36px",
        height: "36px",
        borderRadius: "8px",
        border: p.id === this.selectedPaint ? "2px solid #fff" : "2px solid transparent",
        background: hexCss(p.color),
        cursor: p.unlocked ? "pointer" : "not-allowed",
        opacity: p.unlocked ? "1" : "0.35",
      });
      if (p.unlocked) {
        btn.addEventListener("click", () => {
          this.selectPaint(p.id);
          const preview = panel.querySelector("[data-preview]");
          const name = panel.querySelector("[data-paint-name]");
          if (preview) preview.style.background = hexCss(p.color);
          if (name) name.textContent = p.name;
          paintsEl.querySelectorAll("button").forEach((b) => {
            b.style.border = "2px solid transparent";
          });
          btn.style.border = "2px solid #fff";
        });
      }
      paintsEl.appendChild(btn);
    }

    const driversEl = panel.querySelector("[data-drivers]");
    for (const d of this.drivers) {
      const row = document.createElement("button");
      row.type = "button";
      row.disabled = !d.unlocked;
      row.textContent = `${d.name}${d.id === this.selectedDriver ? " ✓" : ""}${d.unlocked ? "" : " 🔒"}`;
      Object.assign(row.style, {
        textAlign: "left",
        padding: "10px 12px",
        borderRadius: "8px",
        border: d.id === this.selectedDriver ? "1px solid #00b4d8" : "1px solid #334155",
        background: d.id === this.selectedDriver ? "rgba(0,180,216,0.15)" : "rgba(255,255,255,0.04)",
        color: "#f8fafc",
        cursor: d.unlocked ? "pointer" : "not-allowed",
        fontWeight: "600",
      });
      if (d.unlocked) {
        row.addEventListener("click", () => {
          this.selectDriver(d.id);
          this.openUI();
        });
      }
      driversEl.appendChild(row);
    }

    const vehiclesEl = panel.querySelector("[data-vehicles]");
    for (const v of this.vehicles) {
      const row = document.createElement("button");
      row.type = "button";
      row.disabled = !v.unlocked;
      row.textContent = `${v.name}${v.id === this.selectedVehicle ? " ✓" : ""}${v.unlocked ? "" : " 🔒"}`;
      Object.assign(row.style, {
        textAlign: "left",
        padding: "10px 12px",
        borderRadius: "8px",
        border: v.id === this.selectedVehicle ? "1px solid #00b4d8" : "1px solid #334155",
        background: v.id === this.selectedVehicle ? "rgba(0,180,216,0.15)" : "rgba(255,255,255,0.04)",
        color: "#f8fafc",
        cursor: v.unlocked ? "pointer" : "not-allowed",
        fontWeight: "600",
      });
      if (v.unlocked) {
        row.addEventListener("click", () => {
          this.selectVehicle(v.id);
          this.openUI();
        });
      }
      vehiclesEl.appendChild(row);
    }

    panel.querySelector("[data-close]").addEventListener("click", () => this.closeUI());
    root.addEventListener("click", (e) => {
      if (e.target === root) this.closeUI();
    });
    root.appendChild(panel);
    document.body.appendChild(root);
    this._panel = root;
  }

  closeUI() {
    this._panel?.remove();
    this._panel = null;
  }

  selectDriver(id) {
    const driver = this.drivers.find((d) => d.id === id);
    if (!driver || !driver.unlocked) return false;
    this.selectedDriver = id;
    this._saveSelection();
    this._emitUpdate();
    return true;
  }

  selectVehicle(id) {
    const vehicle = this.vehicles.find((v) => v.id === id);
    if (!vehicle || !vehicle.unlocked) return false;
    this.selectedVehicle = id;
    this._saveSelection();
    this._emitUpdate();
    return true;
  }

  selectPaint(id) {
    const paint = this.paints.find((p) => p.id === id);
    if (!paint || !paint.unlocked) return false;
    this.selectedPaint = id;
    this._saveSelection();
    this._emitUpdate();
    this.eventBus?.emit?.("garage:paint-preview", { color: paint.color, id });
    return true;
  }

  unlockDriver(id) {
    const driver = this.drivers.find((d) => d.id === id);
    if (driver && !driver.unlocked) {
      driver.unlocked = true;
      this._saveUnlocks();
      this._emitUpdate();
      this.eventBus?.emit?.("garage:unlocked", { type: "driver", id });
    }
  }

  unlockVehicle(id) {
    const vehicle = this.vehicles.find((v) => v.id === id);
    if (vehicle && !vehicle.unlocked) {
      vehicle.unlocked = true;
      this._saveUnlocks();
      this._emitUpdate();
      this.eventBus?.emit?.("garage:unlocked", { type: "vehicle", id });
    }
  }

  unlockPaint(id) {
    const paint = this.paints.find((p) => p.id === id);
    if (paint && !paint.unlocked) {
      paint.unlocked = true;
      this._saveUnlocks();
      this._emitUpdate();
      this.eventBus?.emit?.("garage:unlocked", { type: "paint", id });
    }
  }

  getGarageData() {
    return {
      drivers: this.drivers,
      vehicles: this.vehicles,
      paints: this.paints,
      selected: {
        driver: this.selectedDriver,
        vehicle: this.selectedVehicle,
        paint: this.selectedPaint,
      },
    };
  }

  applySelections() {
    const driver = this.drivers.find((d) => d.id === this.selectedDriver);
    const vehicle = this.vehicles.find((v) => v.id === this.selectedVehicle);
    const paint = this.paints.find((p) => p.id === this.selectedPaint);

    this.eventBus?.emit?.("garage:applySelections", {
      driverBonus: driver?.bonus || {},
      vehicleStats: vehicle?.stats || {},
      paintColor: paint?.color || 0xfbbf24,
    });
  }

  _mergeUnlocks(list, unlockedIds) {
    list.forEach((item) => {
      if (unlockedIds.includes(item.id)) item.unlocked = true;
    });
  }

  _saveSelection() {
    if (this.saveManager) {
      this.saveManager.setValue?.("selectedDriver", this.selectedDriver);
      this.saveManager.setValue?.("selectedVehicle", this.selectedVehicle);
      this.saveManager.setValue?.("selectedPaint", this.selectedPaint);
    }
    if (this.gameState?.profile) {
      this.gameState.profile.selectedDriver = this.selectedDriver;
      this.gameState.profile.selectedVehicle = this.selectedVehicle;
      this.gameState.profile.selectedPaint = this.selectedPaint;
    }
  }

  _saveUnlocks() {
    if (this.saveManager) {
      this.saveManager.setValue?.(
        "unlockedDrivers",
        this.drivers.filter((d) => d.unlocked).map((d) => d.id),
      );
      this.saveManager.setValue?.(
        "unlockedVehicles",
        this.vehicles.filter((v) => v.unlocked).map((v) => v.id),
      );
      this.saveManager.setValue?.(
        "unlockedPaints",
        this.paints.filter((p) => p.unlocked).map((p) => p.id),
      );
    }
  }

  _emitUpdate() {
    this.eventBus?.emit?.("garage:updated", this.getGarageData());
  }

  _subscribe(event, handler) {
    if (!this.eventBus?.on) return;
    const unsub = this.eventBus.on(event, handler);
    if (typeof unsub === "function") this._disposers.push(unsub);
  }

  dispose() {
    if (typeof window !== "undefined" && this._onWindowGarage) {
      window.removeEventListener("kano:open-garage", this._onWindowGarage);
    }

    this.closeUI();
    document.getElementById("kano-garage-fab")?.remove();
    if (this._onKey) window.removeEventListener("keydown", this._onKey);
    for (const unsub of this._disposers) {
      try {
        unsub();
      } catch {}
    }
    this._disposers = [];
  }
}
