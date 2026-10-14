/**
 * Makes roadside Ruffneck billboards interactive:
 * - Click / tap near billboard opens ad URL (new tab)
 * - In-game interstitial panel with "Visit" / "Close"
 * Monetization: ruffneck-entertainment.vercel.app & ruffneck-lms.vercel.app
 */
const ADS = [
  {
    id: "entertainment",
    title: "RuffNeck Entertainment",
    subtitle: "Games · Music · Culture",
    url: "https://ruffneck-entertainment.vercel.app",
    color: "#0ea5e9",
  },
  {
    id: "lms",
    title: "RuffNeck LMS",
    subtitle: "Learn · Skills · Grow",
    url: "https://ruffneck-lms.vercel.app",
    color: "#22c55e",
  },
];

export default class BillboardAdSystem {
  constructor({ eventBus = null, camera = null, scene = null } = {}) {
    this.eventBus = eventBus;
    this.camera = camera;
    this.scene = scene;
    this.enabled = false;
    this._panel = null;
    this._disposers = [];
    this._cooldown = 0;

    this._subscribe("game:started", () => {
      this.enabled = true;
    });
    this._subscribe("game:stopped", () => {
      this.enabled = false;
      this._hidePanel();
    });

    // Scenery can emit when player is near a billboard
    this._subscribe("billboard:nearby", (p) => this._prompt(p));
    this._subscribe("billboard:clicked", (p) => this._prompt(p));

    // Keyboard shortcut during drive: B = random ad (optional discovery)
    this._onKey = (e) => {
      if (!this.enabled) return;
      if (e.key === "b" || e.key === "B") {
        this._prompt({ ad: ADS[Math.floor(Math.random() * ADS.length)] });
      }
    };
    if (typeof window !== "undefined") {
      window.addEventListener("keydown", this._onKey);
    }
  }

  initialize({ camera, scene } = {}) {
    if (camera) this.camera = camera;
    if (scene) this.scene = scene;
    return this;
  }

  update(deltaTime, playerZ = 0) {
    if (!this.enabled) return;
    this._cooldown = Math.max(0, this._cooldown - (Number(deltaTime) || 0));
  }

  /** Call from Scenery when a billboard is within range */
  notifyNearby(userData = {}) {
    if (!this.enabled || this._cooldown > 0 || this._panel) return;
    const url = userData.ad || ADS[0].url;
    const ad = ADS.find((a) => url.includes(a.id) || url === a.url) || {
      ...ADS[0],
      url,
    };
    // Soft prompt less often
    if (Math.random() > 0.15) return;
    this._cooldown = 25;
    this._prompt({ ad });
  }

  _prompt({ ad } = {}) {
    const chosen = ad || ADS[Math.floor(Math.random() * ADS.length)];
    this._showPanel(chosen);
    this.eventBus?.emit?.("ad:shown", { id: chosen.id, url: chosen.url });
  }

  _showPanel(ad) {
    this._hidePanel();
    const panel = document.createElement("div");
    panel.id = "ruffneck-ad-panel";
    Object.assign(panel.style, {
      position: "fixed",
      left: "50%",
      bottom: "18%",
      transform: "translateX(-50%)",
      zIndex: "2000",
      width: "min(360px, 92vw)",
      background: "rgba(15,23,42,0.96)",
      border: `2px solid ${ad.color || "#0ea5e9"}`,
      borderRadius: "14px",
      padding: "16px 18px",
      color: "#f8fafc",
      fontFamily: "system-ui, Arial, sans-serif",
      boxShadow: "0 12px 32px rgba(0,0,0,0.45)",
    });

    panel.innerHTML = `
      <div style="font-size:11px;letter-spacing:2px;color:${ad.color};margin-bottom:4px">SPONSORED</div>
      <div style="font-size:17px;font-weight:800">${ad.title}</div>
      <div style="font-size:13px;color:#94a3b8;margin:4px 0 12px">${ad.subtitle}</div>
      <div style="display:flex;gap:8px">
        <button data-act="visit" style="flex:1;padding:10px;border:0;border-radius:8px;background:${ad.color};color:#0f172a;font-weight:700;cursor:pointer">Visit site</button>
        <button data-act="close" style="padding:10px 14px;border:0;border-radius:8px;background:#334155;color:#e2e8f0;font-weight:700;cursor:pointer">Close</button>
      </div>
    `;

    panel.querySelector('[data-act="visit"]').addEventListener("click", () => {
      try {
        window.open(ad.url, "_blank", "noopener,noreferrer");
      } catch {}
      this.eventBus?.emit?.("ad:clicked", { id: ad.id, url: ad.url });
      this._hidePanel();
    });
    panel.querySelector('[data-act="close"]').addEventListener("click", () => {
      this.eventBus?.emit?.("ad:dismissed", { id: ad.id });
      this._hidePanel();
    });

    document.body.appendChild(panel);
    this._panel = panel;
  }

  _hidePanel() {
    this._panel?.remove();
    this._panel = null;
  }

  _subscribe(name, handler) {
    if (!this.eventBus?.on) return;
    const u = this.eventBus.on(name, handler);
    if (typeof u === "function") this._disposers.push(u);
  }

  dispose() {
    this._hidePanel();
    if (typeof window !== "undefined") {
      window.removeEventListener("keydown", this._onKey);
    }
    for (const u of this._disposers) {
      try {
        u();
      } catch {}
    }
    this._disposers = [];
  }
}
