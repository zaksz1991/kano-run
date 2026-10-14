/**
 * FPS meter — auto-show on Low graphics, or toggle with F.
 */
export default class FpsMeterSystem {
  constructor({ eventBus = null } = {}) {
    this.eventBus = eventBus;
    this.el = null;
    this.frames = 0;
    this.acc = 0;
    this.fps = 0;
    this.visible = false;
    this._disposers = [];

    this._subscribe("performance:applied", (p) => {
      if (p?.preset === "low") this.show();
      else if (p?.preset === "high") this.hide();
    });

    if (typeof window !== "undefined") {
      window.addEventListener("keydown", (e) => {
        if (e.key === "f" || e.key === "F") {
          if (this.visible) this.hide();
          else this.show();
        }
      });
    }
  }

  show() {
    if (typeof document === "undefined") return;
    if (!this.el) {
      this.el = document.createElement("div");
      this.el.id = "kano-fps";
      Object.assign(this.el.style, {
        position: "fixed",
        top: "64px",
        right: "12px",
        zIndex: "2000",
        padding: "4px 8px",
        borderRadius: "6px",
        background: "rgba(0,0,0,0.65)",
        color: "#4ade80",
        fontFamily: "monospace",
        fontSize: "12px",
        pointerEvents: "none",
      });
      document.body.appendChild(this.el);
    }
    this.visible = true;
    this.el.style.display = "block";
  }

  hide() {
    this.visible = false;
    if (this.el) this.el.style.display = "none";
  }

  update(deltaTime) {
    if (!this.visible || !this.el) return;
    this.frames += 1;
    this.acc += Number(deltaTime) || 0;
    if (this.acc >= 0.5) {
      this.fps = Math.round(this.frames / this.acc);
      this.el.textContent = `${this.fps} FPS`;
      this.el.style.color =
        this.fps >= 50 ? "#4ade80" : this.fps >= 30 ? "#fbbf24" : "#f87171";
      this.frames = 0;
      this.acc = 0;
    }
  }

  _subscribe(name, handler) {
    if (!this.eventBus?.on) return;
    const u = this.eventBus.on(name, handler);
    if (typeof u === "function") this._disposers.push(u);
  }

  dispose() {
    this.el?.remove();
    for (const u of this._disposers) {
      try {
        u();
      } catch {}
    }
    this._disposers = [];
  }
}
