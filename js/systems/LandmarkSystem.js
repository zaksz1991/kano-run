/**
 * Fires landmark / district callouts based on distance driven
 * and the selected route from RouteSystem / lobby.
 */
const FALLBACK_LANDMARKS = [
  { at: 80, name: "Leaving the rank" },
  { at: 250, name: "Kofar Mata area" },
  { at: 500, name: "Kurmi Market junction" },
  { at: 800, name: "Emir's Palace road" },
  { at: 1200, name: "Sabon Gari approach" },
  { at: 1600, name: "Zoo Road stretch" },
  { at: 2100, name: "Farm Centre" },
  { at: 2600, name: "Hotoro flyover" },
  { at: 3200, name: "Naibawa axis" },
  { at: 4000, name: "Tarauni" },
  { at: 4800, name: "Kumbotso link" },
];

export default class LandmarkSystem {
  constructor({ eventBus = null, routeSystem = null, gameState = null } = {}) {
    this.eventBus = eventBus;
    this.routeSystem = routeSystem;
    this.gameState = gameState;
    this.enabled = false;
    this.triggered = new Set();
    this.landmarks = [...FALLBACK_LANDMARKS];
    this._toast = null;
    this._disposers = [];

    this._subscribe("game:started", () => {
      this.enabled = true;
      this.triggered.clear();
      this._loadFromRoute();
    });
    this._subscribe("game:stopped", () => {
      this.enabled = false;
      this._hideToast();
    });
    this._subscribe("route:changed", (p) => {
      this._loadFromRoute(p?.route ?? p);
      this.triggered.clear();
    });
    this._subscribe("lobby:confirmed", (p) => {
      this._loadFromRoute(p?.route);
      this.triggered.clear();
    });
  }

  initialize() {
    this._loadFromRoute();
    return this;
  }

  _loadFromRoute(route) {
    const r =
      route ||
      this.routeSystem?.getSelectedRoute?.() ||
      null;

    if (r?.landmarks?.length) {
      const step = Math.max(200, Math.floor((r.distance || 3000) / (r.landmarks.length + 1)));
      this.landmarks = r.landmarks.map((name, i) => ({
        at: step * (i + 1),
        name,
      }));
      this.landmarks.unshift({ at: 60, name: r.name || "Route start" });
    } else {
      this.landmarks = [...FALLBACK_LANDMARKS];
    }
  }

  update(deltaTime, playerZ = 0) {
    if (!this.enabled) return;

    // playerZ is world Z; use as distance proxy when distance not passed
    const distance = Math.max(0, Number(playerZ) || 0);

    for (const lm of this.landmarks) {
      const key = `${lm.at}:${lm.name}`;
      if (this.triggered.has(key)) continue;
      if (distance >= lm.at) {
        this.triggered.add(key);
        this._announce(lm.name);
        this.eventBus?.emit?.("landmark:reached", {
          name: lm.name,
          distance: lm.at,
        });
      }
    }
  }

  _announce(name) {
    this._hideToast();
    const el = document.createElement("div");
    el.id = "landmark-toast";
    Object.assign(el.style, {
      position: "fixed",
      top: "22%",
      left: "50%",
      transform: "translateX(-50%)",
      zIndex: "1600",
      background: "rgba(7,18,32,0.9)",
      color: "#e0f2fe",
      padding: "10px 20px",
      borderRadius: "10px",
      border: "1px solid rgba(56,189,248,0.5)",
      fontFamily: "system-ui, Arial, sans-serif",
      fontSize: "16px",
      fontWeight: "700",
      pointerEvents: "none",
      textAlign: "center",
    });
    el.innerHTML = `<div style="font-size:11px;letter-spacing:2px;color:#38bdf8;margin-bottom:4px">LANDMARK</div>${name}`;
    document.body.appendChild(el);
    this._toast = el;
    setTimeout(() => this._hideToast(), 3200);
  }

  _hideToast() {
    this._toast?.remove();
    this._toast = null;
  }

  _subscribe(name, handler) {
    if (!this.eventBus?.on) return;
    const u = this.eventBus.on(name, handler);
    if (typeof u === "function") this._disposers.push(u);
  }

  dispose() {
    this._hideToast();
    for (const u of this._disposers) {
      try {
        u();
      } catch {}
    }
    this._disposers = [];
  }
}
