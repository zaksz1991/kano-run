/**
 * Mobile-first chrome: compact top bar + bottom dock.
 * Collapses Daily Missions + full Radio into icon sheets.
 * Most players are on phone — desktop still works.
 */
export default class MobileUISystem {
  constructor({ eventBus = null, audio = null } = {}) {
    this.eventBus = eventBus;
    this.audio = audio;
    this._disposers = [];
    this._sheet = null;
    this._injectCss();
    this._buildChrome();
    this._subscribe("game:started", () => {
      document.body.classList.remove("kano-lobby", "kano-loading");
      document.body.classList.add("kano-playing");
      this.show();
    });
    this._subscribe("menu:open", () => {
      document.body.classList.add("kano-lobby");
      document.body.classList.remove("kano-playing");
      this.hide();
    });
    this._subscribe("game:initialized", () => {
      document.body.classList.remove("kano-loading");
    });
    this._subscribe("game:stopped", () => this.hide());
    this._subscribe("game:over", () => this.hide());
    this._subscribe("economy:balance-changed", (p) => {
      this._set("m-money", `₦${Math.round(Number(p?.balance) || 0)}`);
    });
    this._subscribe("hud:speed", (p) => {
      this._set("m-speed", `${Math.round(Number(p?.speed) || 0)}`);
    });
    this._subscribe("player:speed", (p) => {
      this._set("m-speed", `${Math.round(Number(p?.kmh || p?.speed) || 0)}`);
    });
    // Poll light HUD text if events sparse
    this._timer = setInterval(() => this._syncFromDom(), 500);
  }

  _injectCss() {
    if (typeof document === "undefined") return;
    if (document.getElementById("kano-mobile-hud-css")) return;
    const link = document.createElement("link");
    link.id = "kano-mobile-hud-css";
    link.rel = "stylesheet";
    link.href = "/css/mobile-hud.css";
    document.head.appendChild(link);

    // Inline critical rules if css file missing on CDN lag
    const st = document.createElement("style");
    st.id = "kano-mobile-hud-inline";
    st.textContent = `
      #kano-mobile-topbar, #kano-mobile-dock { display: none; }
      @media (max-width: 900px), (pointer: coarse) {
        #kano-mobile-topbar {
          display: flex !important;
          position: fixed; left: 0; right: 0;
          top: env(safe-area-inset-top, 0);
          z-index: 6800;
          padding: 6px 8px;
          gap: 6px;
          justify-content: space-between;
          align-items: flex-start;
          pointer-events: none;
          background: linear-gradient(180deg, rgba(8,12,22,0.75), transparent);
        }
        #kano-mobile-topbar * { pointer-events: auto; }
        #kano-mobile-dock {
          display: flex !important;
          position: fixed; left: 0; right: 0;
          bottom: env(safe-area-inset-bottom, 0);
          z-index: 6800;
          padding: 8px 10px 12px;
          gap: 8px;
          justify-content: center;
          align-items: center;
          background: linear-gradient(0deg, rgba(8,12,22,0.85), transparent);
        }
        .kano-chip {
          background: rgba(15,23,42,0.88);
          border: 1px solid rgba(56,189,248,0.35);
          border-radius: 10px;
          padding: 6px 10px;
          color: #f1f5f9;
          font: 700 12px system-ui, Arial, sans-serif;
          white-space: nowrap;
        }
        .kano-dock-btn {
          min-width: 64px; height: 44px;
          border-radius: 12px;
          border: 1px solid rgba(255,255,255,0.15);
          background: rgba(15,23,42,0.92);
          color: #f8fafc;
          font: 800 12px system-ui, Arial, sans-serif;
          cursor: pointer;
        }
        #kano-mobile-sheet {
          position: fixed; inset: 0; z-index: 7200;
          background: rgba(3,9,18,0.7);
          display: flex; align-items: flex-end; justify-content: center;
        }
        #kano-mobile-sheet .sheet {
          width: 100%; max-width: 420px;
          max-height: 70vh; overflow: auto;
          background: #0f172a;
          border-radius: 16px 16px 0 0;
          padding: 16px;
          color: #f8fafc;
          font-family: system-ui, Arial, sans-serif;
        }
        /* Force-hide overlapping desktop panels on phone */
        #hud-radio, .hud-radio-panel, #kano-daily-fab { display: none !important; }
        #kano-game-controls {
          top: calc(48px + env(safe-area-inset-top, 0px)) !important;
          right: 8px !important; left: auto !important; transform: none !important;
        }
      }
    `;
    document.head.appendChild(st);
  }

  _buildChrome() {
    if (typeof document === "undefined") return;
    if (document.getElementById("kano-mobile-topbar")) return;

    const top = document.createElement("div");
    top.id = "kano-mobile-topbar";
    top.innerHTML = `
      <div style="display:flex;flex-direction:column;gap:4px">
        <div class="kano-chip"><span id="m-speed">0</span> km/h</div>
        <div class="kano-chip" id="m-money">₦0</div>
      </div>
      <div style="display:flex;flex-direction:column;gap:4px;align-items:flex-end">
        <div class="kano-chip">♥ <span id="m-lives">3</span></div>
        <div class="kano-chip">⛽ <span id="m-fuel">100</span>%</div>
      </div>
    `;
    document.body.appendChild(top);

    const dock = document.createElement("div");
    dock.id = "kano-mobile-dock";
    dock.innerHTML = `
      <button type="button" class="kano-dock-btn" id="m-btn-missions">📋 Missions</button>
      <button type="button" class="kano-dock-btn" id="m-btn-radio">📻 Radio</button>
      <button type="button" class="kano-dock-btn" id="m-btn-pause">⏸ Pause</button>
    `;
    document.body.appendChild(dock);

    dock.querySelector("#m-btn-missions").onclick = () => this._openMissions();
    dock.querySelector("#m-btn-radio").onclick = () => this._openRadio();
    dock.querySelector("#m-btn-pause").onclick = () => {
      this.eventBus?.emit?.("game:pause");
      document.getElementById("kano-btn-pause")?.click();
      // fallback
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "p" }));
    };

    this.top = top;
    this.dock = dock;
    this.hide();
  }

  show() {
    const mobile = this._isMobile();
    if (this.top) this.top.style.display = mobile ? "flex" : "none";
    if (this.dock) this.dock.style.display = mobile ? "flex" : "none";
  }

  hide() {
    if (this.top) this.top.style.display = "none";
    if (this.dock) this.dock.style.display = "none";
    this._closeSheet();
  }

  _isMobile() {
    if (typeof window === "undefined") return false;
    return window.innerWidth <= 900 || matchMedia("(pointer: coarse)").matches;
  }

  _set(id, text) {
    const el = document.getElementById(id);
    if (el) el.textContent = text;
  }

  _syncFromDom() {
    // Try scrape existing HUD text if present
    const speed = document.getElementById("hud-speed")?.textContent;
    if (speed) {
      const n = parseInt(speed, 10);
      if (!Number.isNaN(n)) this._set("m-speed", String(n));
    }
  }

  _openMissions() {
    this.eventBus?.emit?.("daily:open");
    // If no daily system, show simple sheet
    if (!document.getElementById("kano-daily-ui")) {
      this._sheetHtml(
        "Daily Missions",
        `<p style="color:#94a3b8;font-size:14px;line-height:1.5">
          Complete trips, visit districts, pass KAROTA without fines.
          Progress saves on this device.
        </p>
        <button type="button" id="sheet-close" style="width:100%;height:44px;margin-top:12px;border:0;border-radius:10px;background:#fbbf24;color:#1c1917;font-weight:900">Close</button>`,
      );
    }
  }

  _openRadio() {
    this._sheetHtml(
      "Kano Radio",
      `<p style="color:#94a3b8;font-size:13px;margin-bottom:12px">Stations on this device</p>
       <button type="button" class="kano-dock-btn" data-act="play" style="width:100%;margin-bottom:8px">▶ Play / Pause</button>
       <button type="button" class="kano-dock-btn" data-act="next" style="width:100%;margin-bottom:8px">Next station</button>
       <button type="button" class="kano-dock-btn" data-act="off" style="width:100%;margin-bottom:8px;background:#7f1d1d">Radio Off</button>
       <button type="button" id="sheet-close" style="width:100%;height:44px;margin-top:8px;border:0;border-radius:10px;background:#334155;color:#fff;font-weight:800">Close</button>`,
    );
    const sheet = this._sheet;
    sheet?.querySelector('[data-act="play"]')?.addEventListener("click", () => {
      document.getElementById("hud-radio-toggle")?.click();
      this.eventBus?.emit?.("radio:toggle");
    });
    sheet?.querySelector('[data-act="next"]')?.addEventListener("click", () => {
      document.getElementById("hud-radio-next")?.click();
      this.eventBus?.emit?.("radio:next");
    });
    sheet?.querySelector('[data-act="off"]')?.addEventListener("click", () => {
      this.audio?.stopRadio?.();
      this.eventBus?.emit?.("radio:stop");
      document.getElementById("kano-btn-radio")?.click();
    });
  }

  _sheetHtml(title, body) {
    this._closeSheet();
    const root = document.createElement("div");
    root.id = "kano-mobile-sheet";
    root.innerHTML = `<div class="sheet"><div style="font-size:18px;font-weight:900;margin-bottom:10px">${title}</div>${body}</div>`;
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

  _subscribe(name, h) {
    if (!this.eventBus?.on) return;
    const u = this.eventBus.on(name, h);
    if (typeof u === "function") this._disposers.push(u);
  }

  dispose() {
    clearInterval(this._timer);
    this.hide();
    this.top?.remove();
    this.dock?.remove();
    document.getElementById("kano-mobile-hud-inline")?.remove();
    for (const u of this._disposers) {
      try {
        u();
      } catch {}
    }
  }
}
