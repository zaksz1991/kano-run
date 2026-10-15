/**
 * Phase 2 — Fare negotiation UI
 * Passenger names destination; driver picks Low / Fair / High.
 */

export default class NegotiationSystem {
  constructor({ eventBus = null } = {}) {
    this.eventBus = eventBus;
    this.panel = null;
    this._disposers = [];
    this._subscribe("negotiation:started", (p) => this.open(p));
    this._subscribe("game:stopped", () => this.close());
    this._subscribe("game:over", () => this.close());
  }

  open(payload = {}) {
    this.close();
    const dest = payload.destination || "Kano";
    const low = Math.round(Number(payload.lowFare) || 120);
    const mid = Math.round(Number(payload.midFare) || 200);
    const high = Math.round(Number(payload.highFare) || 300);
    const msg =
      payload.message ||
      `Sannu Oga! Ina neman ${dest}.`;

    const root = document.createElement("div");
    root.id = "kano-negotiate-panel";
    Object.assign(root.style, {
      position: "fixed",
      left: "50%",
      bottom: "max(100px, calc(env(safe-area-inset-bottom) + 90px))",
      transform: "translateX(-50%)",
      zIndex: "7500",
      width: "min(360px, 94vw)",
      padding: "14px",
      borderRadius: "14px",
      background: "rgba(15,23,42,0.96)",
      border: "1px solid rgba(56,189,248,0.45)",
      color: "#f8fafc",
      fontFamily: "system-ui, Arial, sans-serif",
      boxShadow: "0 12px 40px rgba(0,0,0,0.45)",
    });
    root.innerHTML = `
      <div style="font-size:12px;color:#38bdf8;font-weight:800;letter-spacing:1px">PASSENGER</div>
      <div style="font-size:15px;font-weight:700;margin:6px 0 12px;line-height:1.35">${msg}</div>
      <div style="font-size:12px;color:#94a3b8;margin-bottom:8px">Choose your fare to ${dest}</div>
      <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px">
        <button data-fare="${low}" data-tier="low" style="padding:12px 6px;border:0;border-radius:10px;background:#334155;color:#e2e8f0;font-weight:800;cursor:pointer">Low<br>₦${low}</button>
        <button data-fare="${mid}" data-tier="mid" style="padding:12px 6px;border:0;border-radius:10px;background:#0ea5e9;color:#0f172a;font-weight:900;cursor:pointer">Fair<br>₦${mid}</button>
        <button data-fare="${high}" data-tier="high" style="padding:12px 6px;border:0;border-radius:10px;background:#fbbf24;color:#1c1917;font-weight:900;cursor:pointer">High<br>₦${high}</button>
      </div>
      <button data-reject style="width:100%;margin-top:8px;padding:10px;border:1px solid #64748b;border-radius:10px;background:transparent;color:#94a3b8;font-weight:700;cursor:pointer">No deal</button>
    `;
    root.querySelectorAll("[data-fare]").forEach((btn) => {
      btn.onclick = () => {
        const fare = Number(btn.getAttribute("data-fare"));
        const tier = btn.getAttribute("data-tier");
        // Low fare: 55% accept, mid 90%, high 100% but passenger may grumble
        const roll = Math.random();
        const accept =
          tier === "high" ? true : tier === "mid" ? roll < 0.9 : roll < 0.55;
        if (accept) {
          this.eventBus?.emit?.("negotiation:finished", {
            accepted: true,
            fare,
            tier,
            destination: dest,
          });
          this.eventBus?.emit?.("negotiation:accepted", { fare, tier });
        } else {
          this.eventBus?.emit?.("hud:notify", {
            text: "Passenger: Kai! Add small money",
            type: "warn",
          });
          this.eventBus?.emit?.("negotiation:finished", {
            accepted: false,
            fare,
            tier,
          });
          this.eventBus?.emit?.("negotiation:rejected", { fare, tier });
        }
        this.close();
      };
    });
    root.querySelector("[data-reject]").onclick = () => {
      this.eventBus?.emit?.("negotiation:finished", { accepted: false });
      this.eventBus?.emit?.("negotiation:rejected", {});
      this.close();
    };
    document.body.appendChild(root);
    this.panel = root;
  }

  close() {
    this.panel?.remove();
    this.panel = null;
  }

  _subscribe(name, h) {
    if (!this.eventBus?.on) return;
    const u = this.eventBus.on(name, h);
    if (typeof u === "function") this._disposers.push(u);
  }

  dispose() {
    this.close();
    for (const u of this._disposers) {
      try {
        u();
      } catch {}
    }
  }
}
