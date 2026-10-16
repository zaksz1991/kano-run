/**
 * Naija Challenge — Hausa / Yoruba / Igbo top-3 + regional runs.
 * Title button dispatches window event "kano:open-naija".
 */
const STORAGE_KEY = "kano-run-naija-challenge";

const TRIBES = [
  { id: "hausa", name: "Hausa", regions: ["Kano", "Kaduna", "Sokoto"] },
  { id: "yoruba", name: "Yoruba", regions: ["Lagos", "Ibadan", "Abeokuta"] },
  { id: "igbo", name: "Igbo", regions: ["Enugu", "Onitsha", "Aba"] },
];

const REGIONS = [
  { id: "north", name: "Northern Run", tribeHint: "hausa" },
  { id: "southwest", name: "South-West Run", tribeHint: "yoruba" },
  { id: "southeast", name: "South-East Run", tribeHint: "igbo" },
  { id: "national", name: "National League", tribeHint: null },
];

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch {}
  return {
    playerName: "Driver",
    tribe: "hausa",
    region: "north",
    leaderboards: { hausa: [], yoruba: [], igbo: [] },
  };
}

function saveState(state) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {}
}

function top3(list) {
  return [...(list || [])].sort((a, b) => b.score - a.score).slice(0, 3);
}

export default class NaijaChallengeSystem {
  constructor({ eventBus = null, gameState = null } = {}) {
    this.eventBus = eventBus;
    this.gameState = gameState;
    this.state = loadState();
    this._panel = null;
    this._disposers = [];
    this._runScore = 0;
    this._runMoney = 0;
    this._runDistance = 0;

    this._onWindowNaija = () => this.openUI();
    if (typeof window !== "undefined") {
      window.addEventListener("kano:open-naija", this._onWindowNaija);
    }

    this._subscribe("naija:open", () => this.openUI());
    this._subscribe("run:finished", (p) => this._onRunEnd(p));
    this._subscribe("game:over", (p) => this._onRunEnd(p));
    this._subscribe("gameover:shown", (p) => this._onRunEnd(p));
    this._subscribe("game:started", () => {
      this._runScore = 0;
      this._runMoney = 0;
      this._runDistance = 0;
    });
    this._subscribe("economy:money-added", (p) => {
      this._runMoney += Number(p?.amount) || 0;
    });
    this._subscribe("passenger:dropped", (p) => {
      this._runScore += 50 + Math.round(Number(p?.fare) || 0);
    });
    this._subscribe("player:distance", (p) => {
      this._runDistance = Number(p?.km || p?.distanceKm) || this._runDistance;
    });
  }

  async initialize() {
    return this;
  }

  setIdentity({ name, tribe, region } = {}) {
    if (name) this.state.playerName = String(name).slice(0, 24);
    if (tribe && TRIBES.some((t) => t.id === tribe)) this.state.tribe = tribe;
    if (region && REGIONS.some((r) => r.id === region)) this.state.region = region;
    // Auto-hint tribe from region
    const reg = REGIONS.find((r) => r.id === this.state.region);
    if (reg?.tribeHint && !tribe) this.state.tribe = reg.tribeHint;
    saveState(this.state);
    this.eventBus?.emit?.("naija:identity", {
      name: this.state.playerName,
      tribe: this.state.tribe,
      region: this.state.region,
    });
  }

  _computeScore(payload = {}) {
    const fromPayload = Math.round(
      Number(payload.score ?? payload.totalScore ?? payload.runScore) || 0,
    );
    if (fromPayload > 0) return fromPayload;
    const money = Math.round(this._runMoney || Number(payload.money) || 0);
    const dist = Math.round((this._runDistance || Number(payload.distance) || 0) * 100);
    const base = this._runScore || 0;
    return Math.max(0, base + money + dist);
  }

  _onRunEnd(payload = {}) {
    const score = this._computeScore(payload);
    if (score <= 0) return;

    const tribe = this.state.tribe || "hausa";
    const entry = {
      name: this.state.playerName || "Driver",
      score,
      region: this.state.region,
      at: Date.now(),
    };

    const board = [...(this.state.leaderboards[tribe] || []), entry];
    this.state.leaderboards[tribe] = top3(board);
    saveState(this.state);

    this.eventBus?.emit?.("naija:score-submitted", {
      tribe,
      entry,
      top3: this.state.leaderboards[tribe],
      grand: this.getGrandStanding(),
    });

    this.eventBus?.emit?.("hud:notify", {
      text: `🇳🇬 ${TRIBES.find((t) => t.id === tribe)?.name || tribe} score ${score}`,
      type: "ok",
    });
  }

  getGrandStanding() {
    const summary = {};
    let combined = 0;
    let count = 0;
    for (const t of TRIBES) {
      const top = top3(this.state.leaderboards[t.id] || []);
      summary[t.id] = top;
      if (top[0]) {
        combined += top[0].score;
        count += 1;
      }
    }
    return {
      byTribe: summary,
      championScore: count ? Math.round(combined / count) : 0,
      tribesWithScores: count,
      message:
        count === 3
          ? "All three tribes have champions — National pool active"
          : `Scores in ${count}/3 tribes — play as each tribe to fill the National ranking`,
    };
  }

  openUI() {
    this.closeUI();
    const grand = this.getGrandStanding();

    const root = document.createElement("div");
    root.id = "naija-challenge-ui";
    Object.assign(root.style, {
      position: "fixed",
      inset: "0",
      zIndex: "9000",
      background: "rgba(3,9,18,0.94)",
      display: "flex",
      alignItems: "flex-end",
      justifyContent: "center",
      padding: "0",
      fontFamily: "system-ui, -apple-system, Arial, sans-serif",
      color: "#f8fafc",
    });

    const boardHtml = TRIBES.map((t) => {
      const rows = top3(this.state.leaderboards[t.id] || []);
      const list =
        rows
          .map(
            (r, i) =>
              `<div style="display:flex;justify-content:space-between;padding:6px 0;border-bottom:1px solid #1e293b">
                <span>${i + 1}. ${r.name}</span>
                <span style="color:#fbbf24;font-weight:800">${r.score}</span>
              </div>`,
          )
          .join("") ||
        `<div style="color:#64748b;font-size:13px;padding:8px 0">No scores yet</div>`;
      return `<div style="background:#0f172a;border:1px solid #334155;border-radius:12px;padding:12px;margin-bottom:10px">
        <div style="font-weight:900;color:#4ade80;margin-bottom:6px">${t.name}</div>
        ${list}
      </div>`;
    }).join("");

    const panel = document.createElement("div");
    Object.assign(panel.style, {
      width: "100%",
      maxWidth: "480px",
      maxHeight: "88dvh",
      overflow: "auto",
      background: "#0b1220",
      borderRadius: "16px 16px 0 0",
      padding: "16px 16px calc(16px + env(safe-area-inset-bottom, 0px))",
      border: "1px solid #1e293b",
    });

    panel.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">
        <div>
          <div style="font-size:11px;color:#4ade80;font-weight:800;letter-spacing:1px">NAIJA CHALLENGE</div>
          <div style="font-size:20px;font-weight:900">Tribes · Regions · Glory</div>
        </div>
        <button type="button" data-close style="width:40px;height:40px;border:0;border-radius:10px;background:#334155;color:#fff;font-size:18px">✕</button>
      </div>

      <p style="font-size:13px;color:#94a3b8;line-height:1.45;margin-bottom:12px">
        Pick your tribe. Finish runs to post scores. Top 3 per tribe — then combine champions for the National index.
      </p>

      <label style="font-size:12px;color:#94a3b8">Driver name</label>
      <input data-name value="${this.state.playerName || ""}" maxlength="24"
        style="width:100%;height:44px;margin:4px 0 10px;border-radius:10px;border:1px solid #334155;background:#020617;color:#fff;padding:0 12px;font-size:15px" />

      <label style="font-size:12px;color:#94a3b8">Tribe</label>
      <select data-tribe style="width:100%;height:44px;margin:4px 0 10px;border-radius:10px;border:1px solid #334155;background:#020617;color:#fff;padding:0 10px">
        ${TRIBES.map(
          (t) =>
            `<option value="${t.id}" ${this.state.tribe === t.id ? "selected" : ""}>${t.name}</option>`,
        ).join("")}
      </select>

      <label style="font-size:12px;color:#94a3b8">Regional challenge</label>
      <select data-region style="width:100%;height:44px;margin:4px 0 12px;border-radius:10px;border:1px solid #334155;background:#020617;color:#fff;padding:0 10px">
        ${REGIONS.map(
          (r) =>
            `<option value="${r.id}" ${this.state.region === r.id ? "selected" : ""}>${r.name}</option>`,
        ).join("")}
      </select>

      <button type="button" data-save
        style="width:100%;height:48px;border:0;border-radius:12px;background:linear-gradient(180deg,#22c55e,#16a34a);color:#052e16;font-weight:900;font-size:15px;margin-bottom:14px">
        Save identity
      </button>

      <div style="font-size:13px;font-weight:800;margin-bottom:8px">Leaderboards (Top 3)</div>
      ${boardHtml}

      <div style="margin-top:8px;padding:12px;border-radius:12px;background:#14532d33;border:1px solid #166534;font-size:13px;line-height:1.5">
        ${grand.message}<br/>
        Champion index: <b style="color:#fbbf24">${grand.championScore}</b>
      </div>
    `;

    panel.querySelector("[data-close]").onclick = () => this.closeUI();
    panel.querySelector("[data-save]").onclick = () => {
      this.setIdentity({
        name: panel.querySelector("[data-name]").value,
        tribe: panel.querySelector("[data-tribe]").value,
        region: panel.querySelector("[data-region]").value,
      });
      this.openUI();
    };
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
    if (typeof window !== "undefined") {
      window.removeEventListener("kano:open-naija", this._onWindowNaija);
    }
    for (const u of this._disposers) {
      try {
        u();
      } catch {}
    }
  }
}

export { TRIBES, REGIONS };
