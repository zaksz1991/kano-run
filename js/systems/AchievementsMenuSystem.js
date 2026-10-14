import { ACHIEVEMENTS } from "./AchievementSystem.js";

const STORAGE_KEY = "kano-run-achievements";

function loadUnlocked() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return new Set(raw ? JSON.parse(raw) : []);
  } catch {
    return new Set();
  }
}

/**
 * Full achievements screen — open from lobby or press M.
 */
export default class AchievementsMenuSystem {
  constructor({ eventBus = null } = {}) {
    this.eventBus = eventBus;
    this.root = null;
    this.visible = false;
    this._disposers = [];

    this._subscribe("ui:achievements-open", () => this.show());
    this._subscribe("ui:achievements-close", () => this.hide());
    this._subscribe("menu:open-achievements", () => this.show());
    this._subscribe("game:started", () => this.hide());

    this._onKey = (e) => {
      if (e.key === "m" || e.key === "M") {
        if (this.visible) this.hide();
        else this.show();
      }
      if (e.key === "Escape" && this.visible) this.hide();
    };
    if (typeof window !== "undefined") {
      window.addEventListener("keydown", this._onKey);
    }

    this._injectLobbyButton();
  }

  _injectLobbyButton() {
    if (typeof document === "undefined") return;
    // Floating button always available
    if (document.getElementById("kano-achievements-fab")) return;
    const fab = document.createElement("button");
    fab.id = "kano-achievements-fab";
    fab.type = "button";
    fab.title = "Achievements (M)";
    fab.textContent = "🏆";
    Object.assign(fab.style, {
      position: "fixed",
      top: "16px",
      left: "16px",
      zIndex: "1800",
      width: "44px",
      height: "44px",
      borderRadius: "12px",
      border: "1px solid rgba(251,191,36,0.5)",
      background: "rgba(15,23,42,0.92)",
      fontSize: "20px",
      cursor: "pointer",
      boxShadow: "0 4px 16px rgba(0,0,0,0.35)",
    });
    fab.addEventListener("click", () => this.show());
    document.body.appendChild(fab);
  }

  show() {
    this.hide();
    const unlocked = loadUnlocked();
    const list = ACHIEVEMENTS.map((a) => ({
      ...a,
      unlocked: unlocked.has(a.id),
    }));
    const count = list.filter((a) => a.unlocked).length;

    const root = document.createElement("div");
    root.id = "kano-achievements-menu";
    Object.assign(root.style, {
      position: "fixed",
      inset: "0",
      zIndex: "5000",
      background: "rgba(3,9,18,0.92)",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      padding: "20px",
      fontFamily: "system-ui, Arial, sans-serif",
      color: "#f8fafc",
    });

    const panel = document.createElement("div");
    Object.assign(panel.style, {
      width: "min(480px, 100%)",
      maxHeight: "85vh",
      overflowY: "auto",
      background: "linear-gradient(145deg,#14243a,#081321)",
      border: "1px solid rgba(251,191,36,0.45)",
      borderRadius: "16px",
      padding: "22px",
    });

    panel.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px">
        <div>
          <div style="font-size:12px;letter-spacing:2px;color:#fbbf24">KANO RUN</div>
          <div style="font-size:24px;font-weight:900">Achievements</div>
          <div style="font-size:13px;color:#94a3b8">${count} / ${list.length} unlocked</div>
        </div>
        <button data-close style="padding:8px 14px;border:0;border-radius:8px;background:#334155;color:#fff;font-weight:700;cursor:pointer">Close</button>
      </div>
      <div data-list style="display:flex;flex-direction:column;gap:10px"></div>
    `;

    const listEl = panel.querySelector("[data-list]");
    for (const a of list) {
      const row = document.createElement("div");
      Object.assign(row.style, {
        display: "flex",
        gap: "12px",
        alignItems: "center",
        padding: "12px",
        borderRadius: "10px",
        background: a.unlocked
          ? "rgba(34,197,94,0.12)"
          : "rgba(255,255,255,0.04)",
        border: a.unlocked
          ? "1px solid rgba(34,197,94,0.35)"
          : "1px solid rgba(255,255,255,0.06)",
        opacity: a.unlocked ? "1" : "0.55",
      });
      row.innerHTML = `
        <div style="font-size:28px;width:40px;text-align:center">${a.icon}</div>
        <div style="flex:1">
          <div style="font-weight:800">${a.title}</div>
          <div style="font-size:12px;color:#94a3b8">${a.desc}</div>
        </div>
        <div style="font-size:11px;font-weight:700;color:${a.unlocked ? "#4ade80" : "#64748b"}">
          ${a.unlocked ? "UNLOCKED" : "LOCKED"}
        </div>
      `;
      listEl.appendChild(row);
    }

    panel.querySelector("[data-close]").addEventListener("click", () => this.hide());
    root.addEventListener("click", (e) => {
      if (e.target === root) this.hide();
    });

    root.appendChild(panel);
    document.body.appendChild(root);
    this.root = root;
    this.visible = true;
  }

  hide() {
    this.root?.remove();
    this.root = null;
    this.visible = false;
  }

  _subscribe(name, handler) {
    if (!this.eventBus?.on) return;
    const u = this.eventBus.on(name, handler);
    if (typeof u === "function") this._disposers.push(u);
  }

  dispose() {
    this.hide();
    if (typeof window !== "undefined") {
      window.removeEventListener("keydown", this._onKey);
    }
    document.getElementById("kano-achievements-fab")?.remove();
    for (const u of this._disposers) {
      try {
        u();
      } catch {}
    }
    this._disposers = [];
  }
}
