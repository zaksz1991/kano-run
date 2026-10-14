/**
 * Runtime performance toggles for mobile / low-end devices.
 * - Shadows on/off
 * - Draw distance (fog far + scenery)
 * - Pixel ratio cap
 */
const STORAGE_KEY = "kano-run-perf";

const PRESETS = {
  high: { shadows: true, pixelRatio: 2, fogFar: 220, sceneryAhead: 12, label: "High" },
  medium: { shadows: true, pixelRatio: 1.5, fogFar: 160, sceneryAhead: 9, label: "Medium" },
  low: { shadows: false, pixelRatio: 1, fogFar: 110, sceneryAhead: 6, label: "Low" },
};

function loadPreset() {
  try {
    const id = localStorage.getItem(STORAGE_KEY) || "medium";
    return PRESETS[id] ? id : "medium";
  } catch {
    return "medium";
  }
}

export default class PerformanceSystem {
  constructor({
    eventBus = null,
    renderer = null,
    scene = null,
    scenerySystem = null,
  } = {}) {
    this.eventBus = eventBus;
    this.renderer = renderer;
    this.scene = scene;
    this.scenery = scenerySystem;
    this.presetId = loadPreset();
    this._disposers = [];

    this._subscribe("game:booted", (p) => {
      if (p?.renderer) this.renderer = p.renderer;
      if (p?.scene) this.scene = p.scene;
      this.apply(this.presetId);
    });
    this._subscribe("performance:set", (p) => {
      if (p?.preset) this.apply(p.preset);
    });

    // Auto low on small screens
    if (typeof window !== "undefined" && window.innerWidth < 768) {
      if (!localStorage.getItem(STORAGE_KEY)) this.presetId = "low";
    }

    this._injectToggle();
    // Apply after short delay when renderer may exist
    setTimeout(() => this.apply(this.presetId), 800);
  }

  _injectToggle() {
    if (typeof document === "undefined") return;
    if (document.getElementById("kano-perf-fab")) return;
    const fab = document.createElement("button");
    fab.id = "kano-perf-fab";
    fab.type = "button";
    fab.title = "Graphics quality";
    fab.textContent = "⚙";
    Object.assign(fab.style, {
      position: "fixed",
      top: "16px",
      left: "120px",
      zIndex: "1800",
      width: "44px",
      height: "44px",
      borderRadius: "12px",
      border: "1px solid rgba(148,163,184,0.5)",
      background: "rgba(15,23,42,0.92)",
      fontSize: "18px",
      cursor: "pointer",
    });
    fab.addEventListener("click", () => this.cycle());
    document.body.appendChild(fab);
  }

  cycle() {
    const order = ["high", "medium", "low"];
    const i = order.indexOf(this.presetId);
    const next = order[(i + 1) % order.length];
    this.apply(next);
    this.eventBus?.emit?.("hud:notify", {
      text: `Graphics: ${PRESETS[next].label}`,
      type: "normal",
    });
  }

  apply(presetId = "medium") {
    const preset = PRESETS[presetId] || PRESETS.medium;
    this.presetId = presetId;
    try {
      localStorage.setItem(STORAGE_KEY, presetId);
    } catch {}

    if (this.renderer) {
      const maxPR = Math.min(window.devicePixelRatio || 1, preset.pixelRatio);
      this.renderer.setPixelRatio(maxPR);
      this.renderer.shadowMap.enabled = preset.shadows;
    }

    if (this.scene?.fog) {
      if ("far" in this.scene.fog) this.scene.fog.far = preset.fogFar;
      if ("near" in this.scene.fog) this.scene.fog.near = Math.min(40, preset.fogFar * 0.25);
    }

    // Hint scenery system
    if (this.scenery?.config) {
      this.scenery.config.segmentsAhead = preset.sceneryAhead;
    }

    this.eventBus?.emit?.("performance:applied", {
      preset: presetId,
      ...preset,
    });
  }

  _subscribe(name, handler) {
    if (!this.eventBus?.on) return;
    const u = this.eventBus.on(name, handler);
    if (typeof u === "function") this._disposers.push(u);
  }

  dispose() {
    document.getElementById("kano-perf-fab")?.remove();
    for (const u of this._disposers) {
      try {
        u();
      } catch {}
    }
    this._disposers = [];
  }
}

export { PRESETS };
