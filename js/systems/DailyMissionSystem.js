/**
 * Daily mission board — 3 rotating goals, localStorage streak.
 */
const STORAGE_KEY = "kano-run-daily-missions";

const POOL = [
  { id: "fares_3", title: "3 fares", desc: "Complete 3 passenger drop-offs", target: 3, metric: "drops", reward: 400 },
  { id: "fares_5", title: "Busy driver", desc: "Complete 5 drop-offs", target: 5, metric: "drops", reward: 700 },
  { id: "distance_5", title: "5 km run", desc: "Travel 5 km in one day", target: 5, metric: "km", reward: 500 },
  { id: "distance_10", title: "City loop", desc: "Travel 10 km today", target: 10, metric: "km", reward: 900 },
  { id: "near_miss_5", title: "Sharp eyes", desc: "Score 5 near-misses", target: 5, metric: "nearMiss", reward: 600 },
  { id: "combo_3", title: "Combo king", desc: "Reach 3x combo", target: 3, metric: "comboMax", reward: 550 },
  { id: "no_crash", title: "Clean streets", desc: "Finish a run with 0 collisions", target: 1, metric: "cleanRun", reward: 800 },
  { id: "money_2k", title: "Purse full", desc: "Earn ₦2000 fares today", target: 2000, metric: "money", reward: 1000 },
];

function todayKey() {
  const d = new Date();
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
}

function load() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch {}
  return null;
}

function save(state) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {}
}

function pickMissions(seedDay) {
  // Stable pick from day string
  let h = 0;
  for (let i = 0; i < seedDay.length; i++) h = (h * 31 + seedDay.charCodeAt(i)) >>> 0;
  const pool = [...POOL];
  const out = [];
  for (let n = 0; n < 3; n++) {
    const idx = h % pool.length;
    out.push({ ...pool[idx], progress: 0, claimed: false });
    pool.splice(idx, 1);
    h = (h * 17 + 13) >>> 0;
  }
  return out;
}

export default class DailyMissionSystem {
  constructor({ eventBus = null } = {}) {
    this.eventBus = eventBus;
    this.state = this._ensure();
    this._run = { drops: 0, km: 0, nearMiss: 0, comboMax: 0, collisions: 0, money: 0 };
    this._panel = null;
    this._disposers = [];

    this._subscribe("passenger:dropped", (p) => {
      this._run.drops += 1;
      this._run.money += Number(p?.fare) || 0;
      this._tick("drops", this._run.drops);
      this._tick("money", this._run.money);
    });
    this._subscribe("economy:fare-earned", (p) => {
      this._run.money += Number(p?.amount || p?.fare) || 0;
      this._tick("money", this._run.money);
    });
    this._subscribe("traffic:near-miss", () => {
      this._run.nearMiss += 1;
      this._tick("nearMiss", this._run.nearMiss);
    });
    this._subscribe("combo:changed", (p) => {
      const c = Number(p?.combo || p?.value) || 0;
      this._run.comboMax = Math.max(this._run.comboMax, c);
      this._tick("comboMax", this._run.comboMax);
    });
    this._subscribe("vehicle:collision", () => {
      this._run.collisions += 1;
    });
    this._subscribe("run:distance", (p) => {
      const km = Number(p?.km || p?.distance) || 0;
      this._run.km = Math.max(this._run.km, km);
      this._tick("km", this._run.km);
    });
    // Approximate km from player z if distance events sparse
    this._subscribe("game:finished", (p) => this._onRunEnd(p));
    this._subscribe("game:over", (p) => this._onRunEnd(p));
    this._subscribe("daily:open", () => this.openUI());

    this._injectFab();
  }

  _ensure() {
    const day = todayKey();
    let state = load();
    if (!state || state.day !== day) {
      const prevStreak = state?.streak || 0;
      const claimedAll = state?.missions?.every((m) => m.claimed);
      state = {
        day,
        streak: claimedAll ? prevStreak + 1 : state?.day ? 1 : 0,
        missions: pickMissions(day),
        totals: { drops: 0, km: 0, nearMiss: 0, comboMax: 0, money: 0 },
      };
      save(state);
    }
    return state;
  }

  _tick(metric, value) {
    this.state.totals[metric] = Math.max(this.state.totals[metric] || 0, value);
    // Also accumulate daily totals for drops/money
    if (metric === "drops" || metric === "money" || metric === "nearMiss") {
      // progress is total for the day from totals
    }
    for (const m of this.state.missions) {
      if (m.metric === metric && !m.claimed) {
        m.progress = metric === "comboMax" || metric === "km"
          ? value
          : (this.state.totals[metric] || 0);
      }
    }
    save(this.state);
  }

  _onRunEnd(payload = {}) {
    if (this._run.collisions === 0 && (payload.score || this._run.drops > 0)) {
      this._tick("cleanRun", 1);
    }
    const dist = Number(payload.distance || payload.km) || this._run.km;
    if (dist > 0) this._tick("km", dist / (dist > 50 ? 1000 : 1)); // accept m or km
    this._run = { drops: 0, km: 0, nearMiss: 0, comboMax: 0, collisions: 0, money: 0 };
  }

  claim(id) {
    const m = this.state.missions.find((x) => x.id === id);
    if (!m || m.claimed || m.progress < m.target) return false;
    m.claimed = true;
    save(this.state);
    this.eventBus?.emit?.("economy:reward", { amount: m.reward, source: "daily" });
    this.eventBus?.emit?.("daily:claimed", { id, reward: m.reward });
    this.eventBus?.emit?.("hud:notify", {
      text: `Mission complete +₦${m.reward}`,
      type: "reward",
    });
    return true;
  }

  _injectFab() {
    if (typeof document === "undefined") return;
    if (document.getElementById("kano-daily-fab")) return;
    const fab = document.createElement("button");
    fab.id = "kano-daily-fab";
    fab.type = "button";
    fab.title = "Daily missions";
    fab.textContent = "📋";
    Object.assign(fab.style, {
      position: "fixed",
      top: "16px",
      left: "224px",
      zIndex: "1800",
      width: "44px",
      height: "44px",
      borderRadius: "12px",
      border: "1px solid rgba(251,191,36,0.45)",
      background: "rgba(15,23,42,0.92)",
      fontSize: "18px",
      cursor: "pointer",
    });
    fab.addEventListener("click", () => this.openUI());
    document.body.appendChild(fab);
  }

  openUI() {
    this.closeUI();
    this.state = this._ensure();
    const root = document.createElement("div");
    root.id = "kano-daily-ui";
    Object.assign(root.style, {
      position: "fixed",
      inset: "0",
      zIndex: "5100",
      background: "rgba(3,9,18,0.9)",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      padding: "16px",
      fontFamily: "system-ui, Arial, sans-serif",
      color: "#f8fafc",
    });
    const panel = document.createElement("div");
    Object.assign(panel.style, {
      width: "min(420px, 100%)",
      background: "linear-gradient(145deg,#1e3a5f,#0f172a)",
      border: "1px solid rgba(251,191,36,0.4)",
      borderRadius: "16px",
      padding: "20px",
    });
    let rows = "";
    for (const m of this.state.missions) {
      const done = m.progress >= m.target;
      const pct = Math.min(100, Math.round((m.progress / m.target) * 100));
      rows += `
        <div style="margin-bottom:12px;padding:12px;border-radius:10px;background:rgba(0,0,0,0.25);border:1px solid ${done ? "#22c55e" : "#334155"}">
          <div style="font-weight:800">${m.title} <span style="color:#fbbf24;font-size:12px">+₦${m.reward}</span></div>
          <div style="font-size:12px;color:#94a3b8;margin:4px 0">${m.desc}</div>
          <div style="height:6px;background:#1e293b;border-radius:3px;overflow:hidden">
            <div style="height:100%;width:${pct}%;background:${done ? "#22c55e" : "#00b4d8"}"></div>
          </div>
          <div style="font-size:11px;margin-top:4px">${Math.min(m.progress, m.target)} / ${m.target}
            ${m.claimed ? " · CLAIMED" : done ? ` · <button data-claim="${m.id}" style="margin-left:6px;padding:4px 10px;border:0;border-radius:6px;background:#22c55e;color:#052e16;font-weight:800;cursor:pointer">Claim</button>` : ""}
          </div>
        </div>`;
    }
    panel.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">
        <div>
          <div style="font-size:12px;letter-spacing:2px;color:#fbbf24">DAILY</div>
          <div style="font-size:22px;font-weight:900">Missions</div>
          <div style="font-size:12px;color:#94a3b8">Streak: ${this.state.streak} day(s)</div>
        </div>
        <button data-close style="padding:8px 14px;border:0;border-radius:8px;background:#334155;color:#fff;font-weight:700;cursor:pointer">Close</button>
      </div>
      ${rows}
    `;
    panel.querySelector("[data-close]").onclick = () => this.closeUI();
    panel.querySelectorAll("[data-claim]").forEach((btn) => {
      btn.onclick = () => {
        this.claim(btn.getAttribute("data-claim"));
        this.openUI();
      };
    });
    root.onclick = (e) => {
      if (e.target === root) this.closeUI();
    };
    root.appendChild(panel);
    document.body.appendChild(root);
    this._panel = root;
  }

  closeUI() {
    this._panel?.remove();
    this._panel = null;
  }

  _subscribe(name, handler) {
    if (!this.eventBus?.on) return;
    const u = this.eventBus.on(name, handler);
    if (typeof u === "function") this._disposers.push(u);
  }

  dispose() {
    this.closeUI();
    document.getElementById("kano-daily-fab")?.remove();
    for (const u of this._disposers) {
      try {
        u();
      } catch {}
    }
    this._disposers = [];
  }
}
