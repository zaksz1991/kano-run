import { GAME_CONFIG } from "../core/config.js";

const DEFAULTS = {
  updateInterval: 0.1,
  fadeDuration: 2.0,
};

function safeText(value, fallback = "") {
  if (value === undefined || value === null) return fallback;
  const text = String(value);
  if (text === "undefined" || text === "null" || text === "NaN") return fallback;
  return text;
}

export default class HUDSystem {
  constructor({
    eventBus = null,
    gameState = null,
    garageSystem = null,
    audio = null,
    config = {},
  } = {}) {
    this.eventBus = eventBus;
    this.gameState = gameState;
    this.garageSystem = garageSystem;
    this.audio = audio;

    this.config = {
      ...DEFAULTS,
      ...(GAME_CONFIG?.hud ?? {}),
      ...config,
    };

    this.elements = {};
    this.timers = {};
    this._disposers = [];

    this.radioIndex = 0;
    this.radioPlaying = false;
    this.radioMuted = Boolean(this.audio?.isMuted);

    this.radioStations = Array.isArray(this.audio?.radioStations)
      ? this.audio.radioStations
      : [];

    this._radioKeyHandler = null;

    this._bindEvents();
    this._bindRadioKeyboardShortcuts();
  }

  initialize() {
    this._createUI();
    this._updateGarageUI();
    this._updateRadioUI();
  }

  _bindEvents() {
    this._subscribe("passenger:spotted", (p) => {
      const text = safeText(
        p?.text || p?.message,
        "Passenger waiting by the road",
      );
      this._showNotification(`"${text}"`, 2.0);
    });

    this._subscribe("passenger:boarded", (p) => {
      const destination = safeText(p?.destination || p?.dest, "Nearby stop");
      this._showNotification(`Destination: ${destination}`, 3.0);
      this._updateTripUI(destination);
    });

    this._subscribe("passenger:shout", (p) => {
      const message = safeText(p?.message, "AKWAI! (Stop here!)");
      this._showNotification(message, 2.0, "urgent");
    });

    this._subscribe("passenger:dropped", (p) => {
      const fare = Number.isFinite(p?.fare) ? p.fare : 0;
      this._showNotification(`Fare: ₦${fare}`, 3.0, "success");
      this._clearTripUI();
    });

    this._subscribe("negotiation:started", (p) => {
      this._showNegotiation(p);
    });

    this._subscribe("negotiation:finished", () => {
      this._hideNegotiation();
    });

    this._subscribe("checkpoint:approaching", () => {
      this._showNotification("KAROTA Checkpoint Ahead", 3.0, "warning");
    });

    this._subscribe("checkpoint:fined", (p) => {
      const amount = Number.isFinite(p?.amount) ? p.amount : 0;
      this._showNotification(`KAROTA Fine: ₦${amount}`, 3.0, "urgent");
    });

    this._subscribe("checkpoint:cleared", () => {
      this._showNotification("Checkpoint Cleared", 2.0, "success");
    });

    this._subscribe("radio:changed", (p) => {
      const station = safeText(p?.station, "Radio");
      this._showNotification(`Radio: ${station}`, 2.0);
    });

    this._subscribe("game:started", () => {
      this._toggleUI(true);
    });

    this._subscribe("game:over", () => {
      this._toggleUI(false);
    });

    this._subscribe("missions:updated", (p) => {
      this._renderMissions(p?.active || []);
    });

    this._subscribe("mission:completed", (p) => {
      this._showNotification(
        p?.mission?.description || "Mission complete!",
        3.0,
        "success",
      );
    });

    this._subscribe("lives:status", (p) => {
      if (this.elements.lives) {
        this.elements.lives.textContent = String(
          Number(p?.freeLeft) >= 0 ? p.freeLeft : 0,
        );
      }
    });

    this._subscribe("lives:continued", (p) => {
      this._showNotification(
        p?.type === "paid" ? "Paid Life Saver used" : "Life Saver used",
        2.0,
        "success",
      );
    });

    this._subscribe("damage:status", (p) => {
      if (this.elements.condition) {
        const c = Math.round(Number(p?.condition) || 0);
        this.elements.condition.textContent = `${c}%`;
      }
    });

    this._subscribe("hud:notify", (p) => {
      this._showNotification(p?.text || "", 2.2, p?.type || "normal");
    });

    this._subscribe("economy:balance-changed", (p) => {
      if (this.elements.money) {
        const bal = Number(p?.balance);
        this.elements.money.textContent = `₦${Number.isFinite(bal) ? Math.floor(bal) : 0}`;
      }
    });

    this._subscribe("economy:money-spent", (p) => {
      const amt = Number(p?.amount) || 0;
      if (amt > 0) {
        this._showNotification(`Paid ₦${amt}`, 2.0, "urgent");
      }
    });

    this._subscribe("economy:money-added", (p) => {
      const amt = Number(p?.amount) || 0;
      if (amt > 0) {
        this._showNotification(`+₦${amt}`, 1.8, "success");
      }
    });

    this._subscribe("mission:completed", (p) => {
      const name = p?.mission?.description || "Mission complete";
      this._showNotification(name, 3.0, "success");
    });

    this._subscribe("landmark:reached", (p) => {
      // LandmarkSystem shows its own toast; optional quiet HUD tick
    });
  }

  _createUI() {
    document.getElementById("kano-hud")?.remove();

    const container = document.createElement("div");
    container.id = "kano-hud";

    Object.assign(container.style, {
      position: "fixed",
      inset: "0",
      width: "100%",
      height: "100%",
      pointerEvents: "none",
      fontFamily: "Arial, sans-serif",
      zIndex: "1000",
      color: "#fff",
    });

    const topBar = this._createElement("div", {
      position: "absolute",
      top: "20px",
      left: "20px",
      display: "flex",
      gap: "20px",
      background: "rgba(7, 18, 32, 0.88)",
      padding: "12px 20px",
      border: "1px solid rgba(0, 180, 216, 0.45)",
      borderRadius: "10px",
      color: "#fff",
      backdropFilter: "blur(8px)",
    });

    topBar.innerHTML = `
      <div>
        <span style="color:#00b4d8;font-size:11px">SPEED</span>
        <br>
        <b id="hud-speed">0</b> km/h
      </div>
      <div>
        <span style="color:#00b4d8;font-size:11px">WALLET</span>
        <br>
        <b id="hud-money">₦0</b>
      </div>
      <div>
        <span style="color:#00b4d8;font-size:11px">LEVEL</span>
        <br>
        <b id="hud-level">1</b>
      </div>
    `;

    container.appendChild(topBar);

    const tripInfo = this._createElement("div", {
      position: "absolute",
      top: "20px",
      left: "50%",
      transform: "translateX(-50%)",
      background: "rgba(0, 120, 150, 0.94)",
      padding: "10px 30px",
      borderRadius: "8px",
      border: "1px solid rgba(255,255,255,0.2)",
      color: "#fff",
      textAlign: "center",
      display: "none",
    });

    tripInfo.innerHTML = `
      <div style="font-size:11px;letter-spacing:2px">CURRENT TRIP</div>
      <b id="hud-destination" style="font-size:18px">---</b>
    `;

    container.appendChild(tripInfo);

    const notification = this._createElement("div", {
      position: "absolute",
      top: "40%",
      left: "50%",
      transform: "translate(-50%, -50%)",
      background: "rgba(7, 18, 32, 0.94)",
      padding: "15px 30px",
      border: "1px solid rgba(0, 180, 216, 0.5)",
      borderRadius: "12px",
      color: "#fff",
      fontSize: "22px",
      fontWeight: "bold",
      textAlign: "center",
      opacity: "0",
      transition: "opacity 0.3s ease",
    });

    container.appendChild(notification);

    const negotiation = this._createElement("div", {
      position: "absolute",
      bottom: "100px",
      left: "50%",
      transform: "translateX(-50%)",
      background: "rgba(255,255,255,0.96)",
      padding: "20px",
      borderRadius: "12px",
      color: "#111",
      textAlign: "center",
      display: "none",
      pointerEvents: "auto",
      minWidth: "260px",
    });

    negotiation.innerHTML = `
      <div id="neg-dialogue" style="font-size:18px;margin-bottom:12px">...</div>
      <div style="display:flex;gap:10px;justify-content:center">
        <button id="btn-accept" style="padding:10px 20px;background:#16803d;color:#fff;border:0;border-radius:6px;cursor:pointer">Accept (E)</button>
        <button id="btn-counter" style="padding:10px 20px;background:#fbbf24;color:#111;border:0;border-radius:6px;cursor:pointer">Counter (Q)</button>
      </div>
    `;

    container.appendChild(negotiation);

    const radio = this._createElement("div", {
      position: "absolute",
      right: "20px",
      bottom: "20px",
      width: "min(300px, calc(100vw - 40px))",
      boxSizing: "border-box",
      padding: "14px",
      background: "rgba(7, 18, 32, 0.94)",
      border: "1px solid rgba(0, 180, 216, 0.6)",
      borderRadius: "12px",
      boxShadow: "0 8px 28px rgba(0,0,0,0.35)",
      pointerEvents: "auto",
      backdropFilter: "blur(10px)",
    });

    radio.innerHTML = `
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px">
        <span style="color:#00b4d8;font-size:11px;font-weight:bold;letter-spacing:2px">KANO RADIO</span>
        <span id="hud-radio-status" style="color:#9ca3af;font-size:10px">READY</span>
      </div>
      <div id="hud-radio-station" style="font-size:17px;font-weight:bold;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;margin-bottom:12px">Radio Kano</div>
      <div style="display:flex;gap:8px;align-items:center;justify-content:center;margin-bottom:12px">
        <button id="hud-radio-prev" aria-label="Previous station" style="flex:1">◀ PREV</button>
        <button id="hud-radio-toggle" aria-label="Play or pause radio" style="flex:1.3;background:#00b4d8;color:#071220">▶ PLAY</button>
        <button id="hud-radio-next" aria-label="Next station" style="flex:1">NEXT ▶</button>
      </div>
      <div style="display:flex;gap:10px;align-items:center;font-size:11px;color:#cbd5e1">
        <label for="hud-radio-volume">VOL</label>
        <input id="hud-radio-volume" type="range" min="0" max="100" value="40" aria-label="Radio volume" style="flex:1;min-width:0;accent-color:#00b4d8;cursor:pointer">
        <span id="hud-radio-volume-value">40%</span>
      </div>
      <div style="margin-top:9px;color:#94a3b8;font-size:10px;text-align:center;letter-spacing:0.5px">R PLAY/PAUSE · N NEXT · B PREVIOUS · M MUTE</div>
    `;

    const buttonStyle = {
      padding: "9px 5px",
      background: "#172b42",
      color: "#fff",
      border: "1px solid #31506c",
      borderRadius: "6px",
      fontSize: "10px",
      fontWeight: "bold",
      cursor: "pointer",
    };

    radio.querySelectorAll("button").forEach((button) => {
      Object.assign(button.style, buttonStyle);
      button.addEventListener("mouseenter", () => {
        button.style.filter = "brightness(1.2)";
      });
      button.addEventListener("mouseleave", () => {
        button.style.filter = "none";
      });
    });

    container.appendChild(radio);

    // Mission panel
    const missions = this._createElement("div", {
      position: "absolute",
      left: "20px",
      bottom: "20px",
      width: "min(280px, calc(100vw - 40px))",
      background: "rgba(7, 18, 32, 0.92)",
      border: "1px solid rgba(0, 180, 216, 0.45)",
      borderRadius: "12px",
      padding: "12px",
      pointerEvents: "auto",
      maxHeight: "40vh",
      overflowY: "auto",
    });
    missions.innerHTML = `
      <div style="color:#00b4d8;font-size:11px;font-weight:bold;letter-spacing:2px;margin-bottom:8px">DAILY MISSIONS</div>
      <div id="hud-missions-list" style="font-size:12px;color:#cbd5e1"></div>
    `;
    container.appendChild(missions);

    // Life savers badge
    const lives = this._createElement("div", {
      position: "absolute",
      top: "20px",
      right: "20px",
      background: "rgba(7, 18, 32, 0.88)",
      border: "1px solid rgba(56,189,248,0.45)",
      borderRadius: "10px",
      padding: "10px 14px",
      color: "#fff",
      fontSize: "13px",
    });
    lives.innerHTML = `LIFE SAVERS <b id="hud-lives">3</b>`;
    container.appendChild(lives);

    document.body.appendChild(container);

    this.elements = {
      container,
      speed: container.querySelector("#hud-speed"),
      money: container.querySelector("#hud-money"),
      level: container.querySelector("#hud-level"),
      trip: tripInfo,
      destination: container.querySelector("#hud-destination"),
      notification,
      negotiation,
      radio,
      radioStation: container.querySelector("#hud-radio-station"),
      radioStatus: container.querySelector("#hud-radio-status"),
      radioToggle: container.querySelector("#hud-radio-toggle"),
      radioPrev: container.querySelector("#hud-radio-prev"),
      radioNext: container.querySelector("#hud-radio-next"),
      radioVolume: container.querySelector("#hud-radio-volume"),
      radioVolumeValue: container.querySelector("#hud-radio-volume-value"),
      missionsList: container.querySelector("#hud-missions-list"),
      lives: container.querySelector("#hud-lives"),
    };

    this._bindRadioControls();
    this._bindNegotiationControls();
  }

  _bindRadioControls() {
    const { radioToggle, radioPrev, radioNext, radioVolume, radioVolumeValue } =
      this.elements;

    if (radioPrev) {
      radioPrev.addEventListener("click", () => {
        this._changeRadioStation(-1);
      });
    }

    if (radioNext) {
      radioNext.addEventListener("click", () => {
        this._changeRadioStation(1);
      });
    }

    if (radioToggle) {
      radioToggle.addEventListener("click", () => {
        this._toggleRadioPlayback();
      });
    }

    if (radioVolume) {
      radioVolume.addEventListener("input", () => {
        const volume = Number(radioVolume.value) / 100;
        this.audio?.setRadioVolume?.(volume);
        if (radioVolumeValue) {
          radioVolumeValue.textContent = `${Math.round(volume * 100)}%`;
        }
      });
    }
  }

  _bindRadioKeyboardShortcuts() {
    this._radioKeyHandler = (event) => {
      if (event.repeat || event.ctrlKey || event.altKey || event.metaKey) {
        return;
      }

      const target = event.target;
      if (
        target instanceof HTMLElement &&
        (target.isContentEditable ||
          ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName))
      ) {
        return;
      }

      switch (event.key.toLowerCase()) {
        case "r":
          event.preventDefault();
          this._toggleRadioPlayback();
          break;
        case "n":
          event.preventDefault();
          this._changeRadioStation(1);
          break;
        case "b":
          event.preventDefault();
          this._changeRadioStation(-1);
          break;
        case "m":
          event.preventDefault();
          this._toggleRadioMute();
          break;
        default:
          break;
      }
    };

    window.addEventListener("keydown", this._radioKeyHandler);
  }

  _toggleRadioPlayback() {
    if (!this.audio) {
      this._showNotification("Radio audio is unavailable", 2.5, "urgent");
      return;
    }

    if (this.radioPlaying) {
      this.audio.stopRadio?.();
      this.radioPlaying = false;
      this._updateRadioUI();
      return;
    }

    const station = this.radioStations[this.radioIndex];
    if (!station) {
      this._showNotification("No radio stations configured", 2.5, "urgent");
      return;
    }

    try {
      const started = this.audio.startRadio?.(station.id);
      this.radioPlaying = started !== false;
      if (!this.radioPlaying) {
        this._showNotification(
          "Radio unavailable. Check audio initialization.",
          3,
          "urgent",
        );
      }
    } catch (error) {
      this.radioPlaying = false;
      console.warn("[Kano Run] Radio playback failed:", error);
      this._showNotification("Unable to start radio", 2.5, "urgent");
    }

    this._updateRadioUI();
  }

  _toggleRadioMute() {
    if (!this.audio?.toggleMute) {
      this._showNotification("Radio mute is unavailable", 2, "urgent");
      return;
    }

    try {
      this.audio.toggleMute();
      this.radioMuted = Boolean(this.audio.isMuted);
      this._updateRadioUI();
      this._showNotification(
        this.radioMuted ? "Radio muted" : "Radio unmuted",
        1.5,
      );
    } catch (error) {
      console.warn("[Kano Run] Radio mute failed:", error);
      this._showNotification("Unable to toggle radio mute", 2, "urgent");
    }
  }

  _changeRadioStation(direction) {
    if (!this.radioStations.length) {
      this._showNotification("No radio stations configured", 2.5, "urgent");
      return;
    }

    const count = this.radioStations.length;
    this.radioIndex = (this.radioIndex + direction + count) % count;
    const station = this.radioStations[this.radioIndex];

    if (this.radioPlaying && this.audio) {
      try {
        const started = this.audio.startRadio?.(station.id);
        this.radioPlaying = started !== false;
      } catch (error) {
        this.radioPlaying = false;
        console.warn("[Kano Run] Station change failed:", error);
      }
    }

    this._updateRadioUI();
    this._showNotification(
      `Radio: ${safeText(station?.name, "Station")}`,
      1.8,
    );
  }

  _updateRadioUI() {
    const station = this.radioStations[this.radioIndex];

    if (this.elements.radioStation) {
      this.elements.radioStation.textContent = safeText(
        station?.name,
        "Radio unavailable",
      );
    }

    if (this.elements.radioStatus) {
      if (this.radioMuted) {
        this.elements.radioStatus.textContent = "● MUTED";
        this.elements.radioStatus.style.color = "#fbbf24";
      } else {
        this.elements.radioStatus.textContent = this.radioPlaying
          ? "● ON AIR"
          : "● STANDBY";
        this.elements.radioStatus.style.color = this.radioPlaying
          ? "#4ade80"
          : "#9ca3af";
      }
    }

    if (this.elements.radioToggle) {
      this.elements.radioToggle.textContent = this.radioPlaying
        ? "Ⅱ PAUSE"
        : "▶ PLAY";
      const unavailable = !this.audio || this.radioStations.length === 0;
      this.elements.radioToggle.disabled = unavailable;
      this.elements.radioToggle.style.opacity = unavailable ? "0.5" : "1";
    }
  }

  _bindNegotiationControls() {
    const accept = this.elements.container?.querySelector("#btn-accept");
    const counter = this.elements.container?.querySelector("#btn-counter");

    accept?.addEventListener("click", () => {
      this.eventBus?.emit?.("negotiation:accept");
    });

    counter?.addEventListener("click", () => {
      this.eventBus?.emit?.("negotiation:counter");
    });
  }

  update(deltaTime) {
    if (!this.gameState) return;

    const run = this.gameState.getRunState?.();

    if (run && this.elements.speed) {
      this.elements.speed.textContent = String(
        Math.floor(Number(run.speed) || 0),
      );
    }

    if (this.elements.money) {
      const money = Number(this.gameState.profile?.money);
      this.elements.money.textContent = `₦${Number.isFinite(money) ? money : 0}`;
    }

    if (this.elements.level) {
      const level = Number(this.gameState.profile?.level);
      this.elements.level.textContent = String(
        Number.isFinite(level) ? level : 1,
      );
    }
  }

  _showNotification(text, duration = 2, type = "normal") {
    const el = this.elements.notification;
    if (!el) return;

    const safe = safeText(text, "");
    if (!safe.trim()) return;

    el.textContent = safe;

    const colors = {
      urgent: "#ff6464",
      success: "#4ade80",
      warning: "#fbbf24",
      normal: "#ffffff",
    };

    el.style.color = colors[type] ?? colors.normal;
    el.style.opacity = "1";

    clearTimeout(this.timers.notification);

    this.timers.notification = setTimeout(() => {
      el.style.opacity = "0";
    }, Math.max(0.1, duration) * 1000);
  }

  _updateTripUI(destination) {
    if (this.elements.trip) {
      this.elements.trip.style.display = "block";
    }

    if (this.elements.destination) {
      this.elements.destination.textContent = safeText(destination, "---");
    }
  }

  _clearTripUI() {
    if (this.elements.trip) {
      this.elements.trip.style.display = "none";
    }
  }

  _showNegotiation(payload = {}) {
    if (!this.elements.negotiation) return;

    this.elements.negotiation.style.display = "block";

    const dialogue = this.elements.container?.querySelector("#neg-dialogue");
    if (dialogue) {
      dialogue.textContent = safeText(
        payload.dialogue,
        "Negotiate the fare",
      );
    }
  }

  _hideNegotiation() {
    if (this.elements.negotiation) {
      this.elements.negotiation.style.display = "none";
    }
  }

  _toggleUI(visible) {
    if (this.elements.container) {
      this.elements.container.style.display = visible ? "block" : "none";
    }
  }

  _updateGarageUI() {
    // Reserved for existing garage UI integration.
  }

  _createElement(tag, styles) {
    const el = document.createElement(tag);
    Object.assign(el.style, styles);
    return el;
  }

  _subscribe(event, handler) {
    if (!this.eventBus?.on) return;

    const unsubscribe = this.eventBus.on(event, handler);

    if (typeof unsubscribe === "function") {
      this._disposers.push(unsubscribe);
    } else if (typeof this.eventBus.off === "function") {
      this._disposers.push(() => this.eventBus.off(event, handler));
    }
  }


  _renderMissions(list = []) {
    const el = this.elements.missionsList;
    if (!el) return;
    if (!list.length) {
      el.innerHTML = '<div style="opacity:0.7">No active missions</div>';
      return;
    }
    el.innerHTML = list
      .map((m) => {
        const pct = Math.min(100, Math.round(Number(m.progressPercent) || 0));
        const done = m.completed ? "✓ " : "";
        let claim = "";
        if (m.completed && !m.claimed) {
          claim =
            '<button data-claim="' +
            m.id +
            '" style="margin-top:6px;padding:6px 10px;border:0;border-radius:6px;background:#fbbf24;color:#422006;font-weight:700;font-size:11px;cursor:pointer">Claim ₦' +
            (m.moneyReward || 0) +
            "</button>";
        } else if (m.claimed) {
          claim =
            '<div style="margin-top:4px;color:#4ade80;font-size:11px">Claimed</div>';
        }
        return (
          '<div style="margin-bottom:10px" data-mission="' +
          m.id +
          '"><div>' +
          done +
          (m.description || m.templateId || "Mission") +
          '</div><div style="height:6px;background:#1e293b;border-radius:4px;margin-top:4px"><div style="height:100%;width:' +
          pct +
          '%;background:#22c55e;border-radius:4px"></div></div>' +
          claim +
          "</div>"
        );
      })
      .join("");

    el.querySelectorAll("[data-claim]").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        const id = btn.getAttribute("data-claim");
        this.eventBus?.emit?.("mission:claim", { missionId: id });
        btn.disabled = true;
        btn.textContent = "Claiming…";
      });
    });
  }

  dispose() {
    clearTimeout(this.timers.notification);

    if (this._radioKeyHandler) {
      window.removeEventListener("keydown", this._radioKeyHandler);
      this._radioKeyHandler = null;
    }

    this.elements.container?.remove();

    for (const unsubscribe of this._disposers) {
      try {
        unsubscribe();
      } catch {
        // Ignore already-removed listeners.
      }
    }

    this._disposers = [];
    this.elements = {};
  }
}
