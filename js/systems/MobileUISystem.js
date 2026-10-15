/**
 * Mobile-first chrome: compact top bar + bottom driving dock.
 * Aggressively hides all old desktop panels to prevent overlap.
 * Direct InputManager integration for zero-latency touch controls.
 */
export default class MobileUISystem {
  constructor({ eventBus = null, input = null, gameState = null, audio = null } = {}) {
    this.eventBus = eventBus;
    this.input = input;
    this.gameState = gameState;
    this.audio = audio;
    
    this._disposers = [];
    this._sheet = null;
    this.container = null;
    this.elements = {};
    this.isMobile = typeof window !== "undefined" && (window.innerWidth <= 900 || matchMedia("(pointer: coarse)").matches);

    this._injectCss();
    this._buildUI();
    this._bindEvents();
    this._bindTouchControls();
    this._hideOldDesktopPanels();

    this._subscribe("game:started", () => {
      document.body.classList.remove("kano-lobby", "kano-loading");
      document.body.classList.add("kano-playing");
      this.show();
      this._hideOldDesktopPanels();
    });
    this._subscribe("menu:open", () => {
      document.body.classList.add("kano-lobby");
      document.body.classList.remove("kano-playing");
      this.hide();
    });
    this._subscribe("game:stopped", () => this.hide());
    this._subscribe("game:over", () => this.hide());
  }

  _injectCss() {
    if (typeof document === "undefined") return;
    if (document.getElementById("kano-mobile-ui-css")) return;

    const st = document.createElement("style");
    st.id = "kano-mobile-ui-css";
    st.textContent = `
      #kano-mobile-ui {
        position: fixed; inset: 0; pointer-events: none; z-index: 6800;
        font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
        color: #f8fafc; text-shadow: 0 2px 4px rgba(0,0,0,0.9);
        padding: env(safe-area-inset-top, 8px) env(safe-area-inset-right, 8px) env(safe-area-inset-bottom, 8px) env(safe-area-inset-left, 8px);
        display: none; flex-direction: column; justify-content: space-between;
      }
      .kano-playing #kano-mobile-ui { display: flex !important; }

      /* Top Bar */
      .ui-top {
        display: flex; justify-content: space-between; align-items: flex-start; padding: 8px;
        gap: 8px;
      }
      .ui-panel {
        background: rgba(15, 23, 42, 0.85); backdrop-filter: blur(8px);
        border: 1px solid rgba(56, 189, 248, 0.3); border-radius: 10px;
        padding: 8px 12px; display: flex; flex-direction: column; gap: 6px; min-width: 100px;
        box-shadow: 0 4px 12px rgba(0,0,0,0.4); pointer-events: auto;
      }
      .ui-row { display: flex; align-items: center; gap: 8px; font-size: 13px; font-weight: 700; }
      .ui-icon { width: 18px; text-align: center; font-size: 14px; }
      .ui-value { margin-left: auto; font-variant-numeric: tabular-nums; }

      /* Bottom Dock (Driving Controls) */
      .ui-bottom {
        display: flex; justify-content: space-between; align-items: flex-end; padding: 12px; gap: 16px;
      }
      .control-group { display: flex; gap: 12px; pointer-events: auto; }
      .control-btn {
        width: 68px; height: 68px; border-radius: 50%; border: 2px solid rgba(255,255,255,0.25);
        background: rgba(15, 23, 42, 0.7); backdrop-filter: blur(4px);
        display: flex; align-items: center; justify-content: center;
        font-size: 26px; color: #fff; user-select: none; touch-action: none;
        transition: transform 0.08s ease, background 0.08s ease, border-color 0.08s ease;
        -webkit-tap-highlight-color: transparent;
      }
      .control-btn:active, .control-btn.active {
        background: rgba(255, 255, 255, 0.35); transform: scale(0.90); border-color: #fff;
      }
      .control-btn.horn { 
        width: 56px; height: 56px; font-size: 22px; 
        background: rgba(251, 191, 36, 0.3); border-color: rgba(251, 191, 36, 0.6); 
      }
      .control-btn.accel { 
        background: rgba(46, 204, 113, 0.35); border-color: rgba(46, 204, 113, 0.7); 
        width: 80px; height: 80px; font-size: 32px;
      }
      .control-btn.brake { 
        background: rgba(231, 76, 60, 0.35); border-color: rgba(231, 76, 60, 0.7); 
        width: 80px; height: 80px; font-size: 32px;
      }

      /* Meta Dock (Missions, Radio, Pause) - positioned ABOVE driving controls */
      .meta-dock {
        display: flex; gap: 8px; pointer-events: auto; margin-bottom: 12px;
      }
      .meta-btn {
        min-width: 56px; height: 40px; border-radius: 8px;
        border: 1px solid rgba(255,255,255,0.15); background: rgba(15,23,42,0.85);
        color: #f8fafc; font: 700 11px system-ui, Arial, sans-serif;
        cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 4px;
      }
      .meta-btn:active { background: rgba(255,255,255,0.2); }

      /* Bottom Sheet */
      #kano-mobile-sheet {
        position: fixed; inset: 0; z-index: 7200; pointer-events: none;
        background: rgba(3,9,18,0.7); display: none; align-items: flex-end; justify-content: center;
      }
      #kano-mobile-sheet.active { display: flex; pointer-events: auto; }
      #kano-mobile-sheet .sheet {
        width: 100%; max-width: 420px; max-height: 65vh; overflow: auto;
        background: #0f172a; border-radius: 16px 16px 0 0; padding: 20px;
        color: #f8fafc; font-family: system-ui, Arial, sans-serif; pointer-events: auto;
        border-top: 2px solid #38bdf8;
      }

      /* 🔥 AGGRESSIVELY HIDE OLD DESKTOP PANELS ON MOBILE */
      @media (pointer: coarse), (max-width: 900px) {
        #hud-radio, .hud-radio-panel, #kano-daily-fab,
        #kano-daily-ui, .daily-missions-panel,
        #hud-top-left, #hud-top-right,
        .hud-panel, .hud-radio-panel,
        #kano-game-controls,
        [class*="daily"], [class*="mission-popup"],
        [id*="daily"], [id*="radio-panel"] {
          display: none !important;
          opacity: 0 !important;
          pointer-events: none !important;
        }
      }

      /* Responsive adjustments for very small screens (320px - 360px) */
      @media (max-width: 360px) {
        .control-btn { width: 60px; height: 60px; font-size: 22px; }
        .control-btn.accel, .control-btn.brake { width: 72px; height: 72px; font-size: 28px; }
        .ui-panel { min-width: 85px; padding: 6px 8px; }
        .ui-row { font-size: 11px; }
      }
    `;
    document.head.appendChild(st);
    this._disposers.push(() => st.remove());
  }

  _buildUI() {
    if (typeof document === "undefined") return;
    if (document.getElementById("kano-mobile-ui")) return;

    this.container = document.createElement("div");
    this.container.id = "kano-mobile-ui";

    // 🔹 Top Left: Money, Fuel, Reputation
    const topLeft = document.createElement("div");
    topLeft.className = "ui-panel";
    topLeft.innerHTML = `
      <div class="ui-row"><span class="ui-icon">💰</span> <span id="m-money" class="ui-value">₦0</span></div>
      <div class="ui-row"><span class="ui-icon">⛽</span> <span id="m-fuel" class="ui-value">100%</span></div>
      <div class="ui-row"><span class="ui-icon">⭐</span> <span id="m-rep" class="ui-value">Lvl 1</span></div>
    `;

    // 🔹 Top Right: Speed, Time, Weather
    const topRight = document.createElement("div");
    topRight.className = "ui-panel";
    topRight.style.textAlign = "right";
    topRight.innerHTML = `
      <div class="ui-row" style="justify-content:flex-end;"><span id="m-speed" class="ui-value" style="margin-left:0; font-size:18px; font-weight:800;">0</span> <span style="font-size:11px; opacity:0.8; margin-top:2px;">km/h</span></div>
      <div class="ui-row" style="justify-content:flex-end;"><span class="ui-icon">🕒</span> <span id="m-time" class="ui-value">12:00</span></div>
      <div class="ui-row" style="justify-content:flex-end;"><span class="ui-icon" id="m-weather-icon">️</span> <span id="m-weather" class="ui-value">Sunny</span></div>
    `;

    const topBar = document.createElement("div");
    topBar.className = "ui-top";
    topBar.appendChild(topLeft);
    topBar.appendChild(topRight);

    // 🔹 Bottom: Meta Dock + Driving Controls
    const bottomBar = document.createElement("div");
    bottomBar.className = "ui-bottom";

    // Left: Steering
    const steerGroup = document.createElement("div");
    steerGroup.className = "control-group";
    steerGroup.innerHTML = `
      <div class="control-btn" data-action="left">◀</div>
      <div class="control-btn" data-action="right">▶</div>
    `;

    // Right: Horn, Brake, Accelerate + Meta buttons ABOVE
    const actionGroup = document.createElement("div");
    actionGroup.className = "control-group";
    actionGroup.style.flexDirection = "column";
    actionGroup.style.alignItems = "flex-end";
    actionGroup.innerHTML = `
      <div class="meta-dock">
        <button type="button" class="meta-btn" id="m-btn-missions">📋 Missions</button>
        <button type="button" class="meta-btn" id="m-btn-radio">📻 Radio</button>
        <button type="button" class="meta-btn" id="m-btn-pause">⏸</button>
      </div>
      <div class="control-group">
        <div class="control-btn horn" data-action="horn">📢</div>
        <div class="control-btn brake" data-action="brake">🛑</div>
        <div class="control-btn accel" data-action="accelerate"></div>
      </div>
    `;

    bottomBar.appendChild(steerGroup);
    bottomBar.appendChild(actionGroup);

    this.container.appendChild(topBar);
    this.container.appendChild(bottomBar);
    document.body.appendChild(this.container);

    this.elements = {
      money: document.getElementById("m-money"),
      fuel: document.getElementById("m-fuel"),
      rep: document.getElementById("m-rep"),
      speed: document.getElementById("m-speed"),
      time: document.getElementById("m-time"),
      weather: document.getElementById("m-weather"),
      weatherIcon: document.getElementById("m-weather-icon"),
    };

    // Meta button bindings
    document.getElementById("m-btn-missions").onclick = () => this._openMissions();
    document.getElementById("m-btn-radio").onclick = () => this._openRadio();
    document.getElementById("m-btn-pause").onclick = () => {
      this.eventBus?.emit?.("game:pause");
    };
  }

  _bindTouchControls() {
    const buttons = this.container.querySelectorAll(".control-btn");
    buttons.forEach((btn) => {
      const action = btn.dataset.action;
      if (!action) return;

      const startAction = (e) => {
        e.preventDefault();
        btn.classList.add("active");
        if (this.input && typeof this.input.setKey === "function") {
          this.input.setKey(action, true);
        } else {
          this.eventBus?.emit?.(`input:${action}`, { active: true });
        }
        if (action === "horn") {
          this.eventBus?.emit?.("audio:horn");
          setTimeout(() => btn.classList.remove("active"), 150);
        }
      };

      const endAction = (e) => {
        e.preventDefault();
        btn.classList.remove("active");
        if (action !== "horn") {
          if (this.input && typeof this.input.setKey === "function") {
            this.input.setKey(action, false);
          } else {
            this.eventBus?.emit?.(`input:${action}`, { active: false });
          }
        }
      };

      btn.addEventListener("touchstart", startAction, { passive: false });
      btn.addEventListener("touchend", endAction, { passive: false });
      btn.addEventListener("touchcancel", endAction, { passive: false });
      btn.addEventListener("mousedown", startAction);
      btn.addEventListener("mouseup", endAction);
      btn.addEventListener("mouseleave", endAction);
    });
  }

  _bindEvents() {
    this._subscribe("economy:balance-changed", (p) => {
      if (this.elements.money) this.elements.money.textContent = `₦${Math.round(Number(p?.balance) || 0).toLocaleString()}`;
    });
    
    this._subscribe("playerVehicle:updated", (p) => {
      if (this.elements.speed) this.elements.speed.textContent = Math.round(p.speed || 0);
      if (this.elements.fuel) this.elements.fuel.textContent = `${Math.round(p.fuel || 0)}%`;
    });

    this._subscribe("progression:updated", (p) => {
      if (this.elements.rep) this.elements.rep.textContent = `Lvl ${p.level || 1}`;
    });

    this._subscribe("daynight:timeUpdate", (p) => {
      if (this.elements.time) {
        const h = String(p.hour).padStart(2, "0");
        const m = String(p.minute).padStart(2, "0");
        this.elements.time.textContent = `${h}:${m}`;
      }
    });

    this._subscribe("weather:changed", (p) => {
      if (this.elements.weather) this.elements.weather.textContent = (p.type || "Clear").charAt(0).toUpperCase() + (p.type || "Clear").slice(1);
      if (this.elements.weatherIcon) {
        const icons = { clear: "☀️", sunny: "☀️", cloudy: "", harmattan: "🌫️", rain: "🌧️", storm: "️", night: "🌙" };
        this.elements.weatherIcon.textContent = icons[p.type] || "☀️";
      }
    });
    
    if (this.gameState?.profile) {
      if (this.elements.money) this.elements.money.textContent = `₦${(this.gameState.profile.money || 0).toLocaleString()}`;
      if (this.elements.rep) this.elements.rep.textContent = `Lvl ${this.gameState.profile.level || 1}`;
    }
  }

  show() {
    if (this.container) this.container.style.display = this.isMobile ? "flex" : "none";
    this._hideOldDesktopPanels();
  }

  hide() {
    if (this.container) this.container.style.display = "none";
    this._closeSheet();
  }

  _openMissions() {
    this.eventBus?.emit?.("daily:open");
    if (!document.getElementById("kano-daily-ui")) {
      this._sheetHtml(
        "Daily Missions",
        `<p style="color:#94a3b8;font-size:14px;line-height:1.5;margin-bottom:16px">
          Complete trips, visit districts, pass KAROTA without fines.
          Progress saves on this device.
        </p>
        <button type="button" id="sheet-close" style="width:100%;height:44px;border:0;border-radius:10px;background:#fbbf24;color:#1c1917;font-weight:900;font-size:16px">Close</button>`,
      );
    }
  }

  _openRadio() {
    this._sheetHtml(
      "Kano Radio",
      `<p style="color:#94a3b8;font-size:13px;margin-bottom:16px">Stations on this device</p>
       <button type="button" class="meta-btn" data-act="play" style="width:100%;height:44px;margin-bottom:8px;font-size:14px">▶ Play / Pause</button>
       <button type="button" class="meta-btn" data-act="next" style="width:100%;height:44px;margin-bottom:8px;font-size:14px">Next station</button>
       <button type="button" class="meta-btn" data-act="off" style="width:100%;height:44px;margin-bottom:8px;background:#7f1d1d;border-color:#991b1b;font-size:14px">Radio Off</button>
       <button type="button" id="sheet-close" style="width:100%;height:44px;margin-top:8px;border:0;border-radius:10px;background:#334155;color:#fff;font-weight:800;font-size:16px">Close</button>`,
    );
    
    const sheet = this._sheet;
    sheet?.querySelector('[data-act="play"]')?.addEventListener("click", () => {
      this.eventBus?.emit?.("radio:toggle");
    });
    sheet?.querySelector('[data-act="next"]')?.addEventListener("click", () => {
      this.eventBus?.emit?.("radio:next");
    });
    sheet?.querySelector('[data-act="off"]')?.addEventListener("click", () => {
      this.audio?.stopRadio?.();
      this.eventBus?.emit?.("radio:stop");
    });
  }

  _sheetHtml(title, body) {
    this._closeSheet();
    const root = document.createElement("div");
    root.id = "kano-mobile-sheet";
    root.className = "active";
    root.innerHTML = `<div class="sheet"><div style="font-size:18px;font-weight:900;margin-bottom:16px">${title}</div>${body}</div>`;
    root.addEventListener("click", (e) => {
      if (e.target === root) this._closeSheet();
    });
    document.body.appendChild(root);
    root.querySelector("#sheet-close")?.addEventListener("click", () => this._closeSheet());
    this._sheet = root;
  }

  _closeSheet() {
    this._sheet?.remove();
    this._sheet = null;
  }

  // 🔥 CRITICAL: Hide all old desktop panels that cause overlap
  _hideOldDesktopPanels() {
    if (typeof document === "undefined") return;
    
    const selectorsToHide = [
      "#hud-radio", ".hud-radio-panel", "#kano-daily-fab",
      "#kano-daily-ui", ".daily-missions-panel",
      "#hud-top-left", "#hud-top-right",
      ".hud-panel",
      "#kano-game-controls",
      "[class*='daily']", "[class*='mission-popup']",
      "[id*='daily']", "[id*='radio-panel']",
      "#radio-kano-panel", ".radio-panel",
    ];

    selectorsToHide.forEach(selector => {
      try {
        const elements = document.querySelectorAll(selector);
        elements.forEach(el => {
          if (el && !el.id?.includes("kano-mobile")) {
            el.style.display = "none";
            el.style.opacity = "0";
            el.style.pointerEvents = "none";
          }
        });
      } catch {}
    });
  }

  _subscribe(name, h) {
    if (!this.eventBus?.on) return;
    const u = this.eventBus.on(name, h);
    if (typeof u === "function") this._disposers.push(u);
  }

  dispose() {
    this.hide();
    this.container?.remove();
    for (const u of this._disposers) {
      try { u(); } catch {}
    }
    this._disposers = [];
  }
}