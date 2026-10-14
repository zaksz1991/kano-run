const STORAGE_KEY = "kano-run-tutorial-done";

const STEPS = [
  {
    id: "welcome",
    title: "Welcome to Kano Run",
    body: "Drive an Adaidaita Sahu through Kano. Pick up passengers, dodge traffic, watch for KAROTA.",
  },
  {
    id: "controls",
    title: "Controls",
    body: "Steer left/right · Gas · Brake. On mobile use the on-screen pads. Keyboard: arrows / WASD.",
  },
  {
    id: "passengers",
    title: "Passengers & fares",
    body: "Stop at Akwai signs, negotiate fares, drop passengers at their stop for ₦.",
  },
  {
    id: "danger",
    title: "KAROTA & fuel",
    body: "Checkpoints may fine you. Keep fuel up — empty tank means limp mode until a petrol station.",
  },
  {
    id: "extras",
    title: "Garage & achievements",
    body: "Press G for garage paints · M for achievements · B for a sponsored tip. Good luck, driver!",
  },
];

export default class TutorialSystem {
  constructor({ eventBus = null } = {}) {
    this.eventBus = eventBus;
    this.step = 0;
    this.root = null;
    this._disposers = [];

    this._subscribe("game:started", () => {
      // Show only before first run completes tutorial
    });
    this._subscribe("ui:tutorial-open", () => this.show(0));
    this._subscribe("menu:ready", () => this.maybeShow());

    // Auto on load
    if (typeof window !== "undefined") {
      setTimeout(() => this.maybeShow(), 600);
    }
  }

  maybeShow() {
    try {
      if (localStorage.getItem(STORAGE_KEY) === "1") return;
    } catch {
      return;
    }
    this.show(0);
  }

  show(index = 0) {
    this.step = index;
    this._render();
  }

  _render() {
    this.hide();
    const s = STEPS[this.step];
    if (!s) {
      this.finish();
      return;
    }

    const root = document.createElement("div");
    root.id = "kano-tutorial";
    Object.assign(root.style, {
      position: "fixed",
      inset: "0",
      zIndex: "6000",
      background: "rgba(3,9,18,0.88)",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      padding: "20px",
      fontFamily: "system-ui, Arial, sans-serif",
      color: "#f8fafc",
    });

    const panel = document.createElement("div");
    Object.assign(panel.style, {
      width: "min(400px, 100%)",
      background: "linear-gradient(145deg,#14243a,#081321)",
      border: "1px solid rgba(0,180,216,0.45)",
      borderRadius: "16px",
      padding: "22px",
    });

    panel.innerHTML = `
      <div style="font-size:11px;letter-spacing:2px;color:#00b4d8;margin-bottom:6px">TIP ${this.step + 1}/${STEPS.length}</div>
      <div style="font-size:20px;font-weight:900;margin-bottom:10px">${s.title}</div>
      <div style="font-size:14px;line-height:1.55;color:#cbd5e1;margin-bottom:18px">${s.body}</div>
      <div style="display:flex;gap:8px;justify-content:flex-end">
        <button data-skip style="padding:10px 14px;border:0;border-radius:8px;background:#334155;color:#e2e8f0;font-weight:700;cursor:pointer">Skip</button>
        <button data-next style="padding:10px 16px;border:0;border-radius:8px;background:#00b4d8;color:#061421;font-weight:800;cursor:pointer">
          ${this.step >= STEPS.length - 1 ? "Start driving" : "Next"}
        </button>
      </div>
    `;

    panel.querySelector("[data-skip]").addEventListener("click", () => this.finish());
    panel.querySelector("[data-next]").addEventListener("click", () => {
      if (this.step >= STEPS.length - 1) this.finish();
      else {
        this.step += 1;
        this._render();
      }
    });

    root.appendChild(panel);
    document.body.appendChild(root);
    this.root = root;
  }

  finish() {
    this.hide();
    try {
      localStorage.setItem(STORAGE_KEY, "1");
    } catch {}
    this.eventBus?.emit?.("tutorial:finished");
  }

  hide() {
    this.root?.remove();
    this.root = null;
  }

  _subscribe(name, handler) {
    if (!this.eventBus?.on) return;
    const u = this.eventBus.on(name, handler);
    if (typeof u === "function") this._disposers.push(u);
  }

  dispose() {
    this.hide();
    for (const u of this._disposers) {
      try {
        u();
      } catch {}
    }
    this._disposers = [];
  }
}
