/**
 * Always-on Pause + Radio Off — top-center, above other HUD clutter.
 */
export default class GameControlsSystem {
  constructor({ eventBus = null, audio = null, game = null } = {}) {
    this.eventBus = eventBus;
    this.audio = audio;
    this.game = game;
    this.paused = false;
    this.radioOff = false;
    this.el = null;
    this._disposers = [];
    this._build();
    this._subscribe("game:started", () => this.show());
    this._subscribe("game:stopped", () => this.hide());
    this._subscribe("game:over", () => this.hide());
    if (typeof window !== "undefined") {
      window.addEventListener("keydown", this._onKey);
    }
  }

  _onKey = (e) => {
    if (e.key === "p" || e.key === "P" || e.key === "Escape") {
      if (e.key === "Escape" && this.paused) this.resume();
      else if (e.key === "p" || e.key === "P") this.togglePause();
    }
    if (e.key === "m" || e.key === "M") this.toggleRadioOff();
  };

  _build() {
    if (typeof document === "undefined") return;
    if (document.getElementById("kano-game-controls")) return;
    const bar = document.createElement("div");
    bar.id = "kano-game-controls";
    Object.assign(bar.style, {
      position: "fixed",
      top: "max(10px, env(safe-area-inset-top))",
      left: "50%",
      transform: "translateX(-50%)",
      zIndex: "6000",
      display: "none",
      gap: "8px",
      flexDirection: "row",
      alignItems: "center",
    });
    bar.style.display = "none";

    const mk = (id, label, bg) => {
      const b = document.createElement("button");
      b.id = id;
      b.type = "button";
      b.textContent = label;
      Object.assign(b.style, {
        minWidth: "72px",
        height: "40px",
        padding: "0 14px",
        borderRadius: "10px",
        border: "1px solid rgba(255,255,255,0.2)",
        background: bg,
        color: "#f8fafc",
        fontWeight: "800",
        fontSize: "13px",
        cursor: "pointer",
        fontFamily: "system-ui, Arial, sans-serif",
        boxShadow: "0 4px 16px rgba(0,0,0,0.35)",
      });
      return b;
    };

    const pauseBtn = mk("kano-btn-pause", "⏸ Pause", "rgba(15,23,42,0.92)");
    const radioBtn = mk("kano-btn-radio", "📻 Radio", "rgba(15,23,42,0.92)");
    pauseBtn.onclick = () => this.togglePause();
    radioBtn.onclick = () => this.toggleRadioOff();
    bar.append(pauseBtn, radioBtn);

    // Overlay when paused
    const overlay = document.createElement("div");
    overlay.id = "kano-pause-overlay";
    Object.assign(overlay.style, {
      position: "fixed",
      inset: "0",
      zIndex: "5900",
      display: "none",
      alignItems: "center",
      justifyContent: "center",
      background: "rgba(3,9,18,0.72)",
      fontFamily: "system-ui, Arial, sans-serif",
      color: "#f8fafc",
    });
    overlay.innerHTML = `
      <div style="text-align:center;padding:24px;border-radius:16px;background:rgba(15,23,42,0.95);border:1px solid #334155;max-width:300px">
        <div style="font-size:28px;font-weight:900;margin-bottom:8px">PAUSED</div>
        <div style="font-size:13px;color:#94a3b8;margin-bottom:16px">Press P or Resume</div>
        <button id="kano-btn-resume" type="button" style="width:100%;height:44px;border:0;border-radius:10px;background:linear-gradient(135deg,#fbbf24,#f59e0b);color:#1c1917;font-weight:900;font-size:15px;cursor:pointer">Resume</button>
      </div>`;
    document.body.appendChild(bar);
    document.body.appendChild(overlay);
    overlay.querySelector("#kano-btn-resume").onclick = () => this.resume();
    this.el = bar;
    this.overlay = overlay;
    this.pauseBtn = pauseBtn;
    this.radioBtn = radioBtn;
  }

  show() {
    if (this.el) this.el.style.display = "flex";
  }
  hide() {
    if (this.el) this.el.style.display = "none";
    this.resume();
  }

  togglePause() {
    if (this.paused) this.resume();
    else this.pause();
  }

  pause() {
    this.paused = true;
    if (this.pauseBtn) this.pauseBtn.textContent = "▶ Resume";
    if (this.overlay) this.overlay.style.display = "flex";
    this.eventBus?.emit?.("game:pause");
    this.game?.pause?.();
    // freeze time scale if present
    if (this.game) this.game.paused = true;
  }

  resume() {
    this.paused = false;
    if (this.pauseBtn) this.pauseBtn.textContent = "⏸ Pause";
    if (this.overlay) this.overlay.style.display = "none";
    this.eventBus?.emit?.("game:resume");
    this.game?.resume?.();
    if (this.game) this.game.paused = false;
  }

  toggleRadioOff() {
    this.radioOff = !this.radioOff;
    if (this.radioOff) {
      this.audio?.stopRadio?.();
      this.audio?.mute?.();
      this.eventBus?.emit?.("radio:stop");
      this.eventBus?.emit?.("radio:mute", { muted: true });
      if (this.radioBtn) {
        this.radioBtn.textContent = "📻 Off";
        this.radioBtn.style.background = "rgba(127,29,29,0.9)";
      }
    } else {
      this.audio?.unmute?.();
      this.eventBus?.emit?.("radio:mute", { muted: false });
      if (this.radioBtn) {
        this.radioBtn.textContent = "📻 Radio";
        this.radioBtn.style.background = "rgba(15,23,42,0.92)";
      }
    }
  }

  _subscribe(name, handler) {
    if (!this.eventBus?.on) return;
    const u = this.eventBus.on(name, handler);
    if (typeof u === "function") this._disposers.push(u);
  }

  dispose() {
    if (typeof window !== "undefined") {
      window.removeEventListener("keydown", this._onKey);
    }
    this.el?.remove();
    this.overlay?.remove();
    for (const u of this._disposers) {
      try {
        u();
      } catch {}
    }
  }
}
