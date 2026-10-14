const ACHIEVEMENTS = [
  {
    id: "first_fare",
    title: "First Fare",
    desc: "Collect your first passenger fare",
    icon: "₦",
  },
  {
    id: "near_miss_5",
    title: "Close Call",
    desc: "5 near misses in one run",
    icon: "⚡",
  },
  {
    id: "landmark_3",
    title: "Tour Guide",
    desc: "Pass 3 landmarks",
    icon: "🗺",
  },
  {
    id: "escape_artist",
    title: "Escape Artist",
    desc: "Escape a police chase",
    icon: "🚔",
  },
  {
    id: "full_tank",
    title: "Full Tank",
    desc: "Refuel at a petrol station",
    icon: "⛽",
  },
  {
    id: "night_rider",
    title: "Night Rider",
    desc: "Drive during night period",
    icon: "🌙",
  },
  {
    id: "karota_clean",
    title: "Clean Papers",
    desc: "Clear a KAROTA stop",
    icon: "📋",
  },
  {
    id: "share_run",
    title: "Show Off",
    desc: "Share a trip result",
    icon: "📤",
  },
];

const STORAGE_KEY = "kano-run-achievements";

function loadUnlocked() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveUnlocked(list) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
  } catch {}
}

export default class AchievementSystem {
  constructor({ eventBus = null } = {}) {
    this.eventBus = eventBus;
    this.unlocked = new Set(loadUnlocked());
    this._run = { nearMisses: 0, landmarks: 0 };
    this._disposers = [];
    this._toast = null;

    this._subscribe("economy:fare-earned", () => this.unlock("first_fare"));
    this._subscribe("economy:money-added", (p) => {
      if (p?.reason === "passenger_fare") this.unlock("first_fare");
    });
    this._subscribe("passenger:dropped", () => this.unlock("first_fare"));

    this._subscribe("collision:near-miss", () => {
      this._run.nearMisses += 1;
      if (this._run.nearMisses >= 5) this.unlock("near_miss_5");
    });
    this._subscribe("traffic:near-miss", () => {
      this._run.nearMisses += 1;
      if (this._run.nearMisses >= 5) this.unlock("near_miss_5");
    });

    this._subscribe("landmark:reached", () => {
      this._run.landmarks += 1;
      if (this._run.landmarks >= 3) this.unlock("landmark_3");
    });

    this._subscribe("chase:escaped", () => this.unlock("escape_artist"));
    this._subscribe("vehicle:refueled", () => this.unlock("full_tank"));
    this._subscribe("time:period-changed", (p) => {
      if (p?.current === "night") this.unlock("night_rider");
    });
    this._subscribe("checkpoint:cleared", () => this.unlock("karota_clean"));
    this._subscribe("share:completed", () => this.unlock("share_run"));

    this._subscribe("game:started", () => {
      this._run = { nearMisses: 0, landmarks: 0 };
    });
  }

  unlock(id) {
    if (this.unlocked.has(id)) return false;
    const def = ACHIEVEMENTS.find((a) => a.id === id);
    if (!def) return false;

    this.unlocked.add(id);
    saveUnlocked([...this.unlocked]);

    this._showUnlock(def);
    this.eventBus?.emit?.("achievement:unlocked", { ...def });
    return true;
  }

  _showUnlock(def) {
    this._toast?.remove();
    const el = document.createElement("div");
    el.id = "achievement-toast";
    Object.assign(el.style, {
      position: "fixed",
      top: "14%",
      right: "16px",
      zIndex: "2500",
      width: "min(280px, 90vw)",
      background: "linear-gradient(145deg,#1e3a5f,#0f172a)",
      border: "1px solid #fbbf24",
      borderRadius: "12px",
      padding: "14px 16px",
      color: "#f8fafc",
      fontFamily: "system-ui, Arial, sans-serif",
      boxShadow: "0 12px 32px rgba(0,0,0,0.4)",
      pointerEvents: "none",
    });
    el.innerHTML = `
      <div style="font-size:11px;letter-spacing:2px;color:#fbbf24;margin-bottom:4px">ACHIEVEMENT</div>
      <div style="font-size:18px;font-weight:800">${def.icon} ${def.title}</div>
      <div style="font-size:12px;color:#94a3b8;margin-top:4px">${def.desc}</div>
    `;
    document.body.appendChild(el);
    this._toast = el;
    setTimeout(() => {
      el.remove();
      if (this._toast === el) this._toast = null;
    }, 4000);
  }

  getUnlocked() {
    return ACHIEVEMENTS.filter((a) => this.unlocked.has(a.id));
  }

  getAll() {
    return ACHIEVEMENTS.map((a) => ({
      ...a,
      unlocked: this.unlocked.has(a.id),
    }));
  }

  _subscribe(name, handler) {
    if (!this.eventBus?.on) return;
    const u = this.eventBus.on(name, handler);
    if (typeof u === "function") this._disposers.push(u);
  }

  dispose() {
    this._toast?.remove();
    for (const u of this._disposers) {
      try {
        u();
      } catch {}
    }
    this._disposers = [];
  }
}

export { ACHIEVEMENTS };
