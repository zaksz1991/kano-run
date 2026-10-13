import { GAME_CONFIG } from "../core/config.js";

const DEFAULTS = {
  updateInterval: 0.1,
  fadeDuration: 2.0,
};

export default class HUDSystem {
  constructor({ eventBus = null, gameState = null, garageSystem = null, config = {} } = {}) {
    this.eventBus = eventBus;
    this.gameState = gameState;
    this.garageSystem = garageSystem;
    this.config = { ...DEFAULTS, ...(GAME_CONFIG?.hud ?? {}), ...config };

    this.elements = {};
    this.timers = {};
    this._disposers = [];

    this._bindEvents();
  }

  initialize() {
    this._createUI();
    this._updateGarageUI();
  }

  _bindEvents() {
    // Listen for gameplay events to update UI
    this._subscribe("passenger:spotted", (p) => this._showNotification(`"${p.text}"`, 2.0));
    this._subscribe("passenger:boarded", (p) => {
      this._showNotification(`Destination: ${p.destination}`, 3.0);
      this._updateTripUI(p.destination);
    });
    this._subscribe("passenger:shout", () => this._showNotification("AKWAI! (Stop here!)", 2.0, "urgent"));
    this._subscribe("passenger:dropped", (p) => {
      this._showNotification(`Fare: ${p.fare}`, 3.0, "success");
      this._clearTripUI();
    });

    this._subscribe("negotiation:started", (p) => this._showNegotiation(p));
    this._subscribe("negotiation:finished", (p) => this._hideNegotiation());

    this._subscribe("checkpoint:approaching", () => this._showNotification("KAROTA Checkpoint Ahead", 3.0, "warning"));
    this._subscribe("checkpoint:fined", (p) => this._showNotification(`KAROTA Fine: ₦${p.amount}`, 3.0, "urgent"));
    this._subscribe("checkpoint:cleared", () => this._showNotification("Checkpoint Cleared", 2.0, "success"));

    this._subscribe("radio:changed", (p) => this._showNotification(`Radio: ${p.station}`, 2.0));

    this._subscribe("game:started", () => this._toggleUI(true));
    this._subscribe("game:over", () => this._toggleUI(false));
  }

  _createUI() {
    // Create a clean, modern HUD container
    const container = document.createElement("div");
    container.id = "kano-hud";
    Object.assign(container.style, {
      position: "fixed", top: 0, left: 0, width: "100%", height: "100%",
      pointerEvents: "none", fontFamily: "Arial, sans-serif", zIndex: 1000
    });

    // Top Bar: Stats
    const topBar = this._createElement("div", {
      position: "absolute", top: "20px", left: "20px", display: "flex", gap: "20px",
      background: "rgba(0,0,0,0.6)", padding: "10px 20px", borderRadius: "8px", color: "#fff"
    });
    topBar.innerHTML = `
      <div><span style="color:#aaa">SPEED</span><br><b id="hud-speed">0</b> km/h</div>
      <div><span style="color:#aaa">WALLET</span><br><b id="hud-money">₦0</b></div>
      <div><span style="color:#aaa">LEVEL</span><br><b id="hud-level">1</b></div>
    `;
    container.appendChild(topBar);

    // Trip Info (Center Top)
    const tripInfo = this._createElement("div", {
      position: "absolute", top: "20px", left: "50%", transform: "translateX(-50%)",
      background: "rgba(0,180,216,0.8)", padding: "10px 30px", borderRadius: "8px",
      color: "#fff", textAlign: "center", display: "none"
    });
    tripInfo.innerHTML = `<div style="font-size:12px">CURRENT TRIP</div><b id="hud-destination" style="font-size:18px">---</b>`;
    container.appendChild(tripInfo);

    // Notification Area (Center)
    const notification = this._createElement("div", {
      position: "absolute", top: "40%", left: "50%", transform: "translate(-50%, -50%)",
      background: "rgba(0,0,0,0.8)", padding: "15px 40px", borderRadius: "12px",
      color: "#fff", fontSize: "24px", fontWeight: "bold", textAlign: "center",
      opacity: 0, transition: "opacity 0.3s ease"
    });
    container.appendChild(notification);

    // Negotiation UI (Bottom Center)
    const negotiation = this._createElement("div", {
      position: "absolute", bottom: "100px", left: "50%", transform: "translateX(-50%)",
      background: "rgba(255,255,255,0.9)", padding: "20px", borderRadius: "12px",
      color: "#000", textAlign: "center", display: "none", pointerEvents: "auto"
    });
    negotiation.innerHTML = `
      <div id="neg-dialogue" style="font-size:18px; margin-bottom:10px">...</div>
      <div style="display:flex; gap:10px; justify-content:center">
        <button id="btn-accept" style="padding:10px 20px; background:#28a745; color:#fff; border:none; border-radius:6px; cursor:pointer">Accept (E)</button>
        <button id="btn-counter" style="padding:10px 20px; background:#ffc107; color:#000; border:none; border-radius:6px; cursor:pointer">Counter (Q)</button>
      </div>
    `;
    container.appendChild(negotiation);

    document.body.appendChild(container);
    this.elements = { speed: document.getElementById("hud-speed"), money: document.getElementById("hud-money"), level: document.getElementById("hud-level"), trip: tripInfo, destination: document.getElementById("hud-destination"), notification, negotiation };
  }

  update(deltaTime) {
    // Update dynamic stats
    if (this.gameState) {
      const run = this.gameState.getRunState();
      if (this.elements.speed) this.elements.speed.textContent = Math.floor(run.speed);
      if (this.elements.money) this.elements.money.textContent = `₦${this.gameState.profile.money}`;
      if (this.elements.level) this.elements.level.textContent = this.gameState.profile.level;
    }
  }

  _showNotification(text, duration, type = "normal") {
    const el = this.elements.notification;
    if (!el) return;
    el.textContent = text;
    el.style.color = type === "urgent" ? "#ff4444" : type === "success" ? "#44ff44" : "#fff";
    el.style.opacity = 1;
    clearTimeout(this.timers.notification);
    this.timers.notification = setTimeout(() => { el.style.opacity = 0; }, duration * 1000);
  }

  _updateTripUI(destination) {
    if (this.elements.trip) this.elements.trip.style.display = "block";
    if (this.elements.destination) this.elements.destination.textContent = destination;
  }

  _clearTripUI() {
    if (this.elements.trip) this.elements.trip.style.display = "none";
  }

  _showNegotiation(payload) {
    if (!this.elements.negotiation) return;
    this.elements.negotiation.style.display = "block";
    document.getElementById("neg-dialogue").textContent = payload.dialogue;
    
    // Bind buttons (simplified for this example)
    document.getElementById("btn-accept").onclick = () => this.eventBus?.emit?.("negotiation:accept");
    document.getElementById("btn-counter").onclick = () => this.eventBus?.emit?.("negotiation:counter");
  }

  _hideNegotiation() {
    if (this.elements.negotiation) this.elements.negotiation.style.display = "none";
  }

  _toggleUI(visible) {
    const container = document.getElementById("kano-hud");
    if (container) container.style.display = visible ? "block" : "none";
  }

  _updateGarageUI() {
    // This would populate the garage screen if you have one
  }

  _createElement(tag, styles) {
    const el = document.createElement(tag);
    Object.assign(el.style, styles);
    return el;
  }

  _subscribe(event, handler) {
    if (!this.eventBus?.on) return;
    const unsub = this.eventBus.on(event, handler);
    if (typeof unsub === "function") this._disposers.push(unsub);
  }

  dispose() {
    document.getElementById("kano-hud")?.remove();
    for (const unsub of this._disposers) unsub();
    this._disposers = [];
  }
}