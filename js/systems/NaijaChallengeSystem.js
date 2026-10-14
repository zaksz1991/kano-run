/**
 * Naija Challenge:
 * - Tribal leagues: Hausa, Yoruba, Igbo
 * - Top 3 per tribe stored locally
 * - Grand champion = best combined score from each tribe's top 3 average
 * - Regional challenges (North / South-West / South-East style routes)
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
    leaderboards: {
      hausa: [],
      yoruba: [],
      igbo: [],
    },
  };
}

function saveState(state) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {}
}

function top3(list) {
  return [...list]
    .sort((a, b) => b.score - a.score)
    .slice(0, 3);
}

export default class NaijaChallengeSystem {
  constructor({ eventBus = null } = {}) {
    this.eventBus = eventBus;
    this.state = loadState();
    this._panel = null;
    this._disposers = [];

    this._subscribe("run:finished", (p) => this._onRunEnd(p));
    this._subscribe("game:over", (p) => this._onRunEnd(p));
    this._subscribe("naija:open", () => this.openUI());
    this._subscribe("gameover:shown", (p) => this._onRunEnd(p));

    this._injectFab();
  }

  _injectFab() {
    if (typeof document === "undefined") return;
    if (document.getElementById("kano-naija-fab")) return;
    const fab = document.createElement("button");
    fab.id = "kano-naija-fab";
    fab.type = "button";
    fab.title = "Naija Challenge";
    fab.textContent = "🇳🇬";
    Object.assign(fab.style, {
      position: "fixed",
      top: "16px",
      left: "172px",
      zIndex: "1800",
      width: "44px",
      height: "44px",
      borderRadius: "12px",
      border: "1px solid rgba(34,197,94,0.5)",
      background: "rgba(15,23,42,0.92)",
      fontSize: "18px",
      cursor: "pointer",
    });
    fab.addEventListener("click", () => this.openUI());
    document.body.appendChild(fab);
  }

  setIdentity({ name, tribe, region } = {}) {
    if (name) this.state.playerName = String(name).slice(0, 24);
    if (tribe && TRIBES.some((t) => t.id === tribe)) this.state.tribe = tribe;
    if (region && REGIONS.some((r) => r.id === region)) this.state.region = region;
    saveState(this.state);
    this.eventBus?.emit?.("naija:identity", { ...this.state });
  }

  _onRunEnd(payload = {}) {
    const score = Math.round(
      Number(payload.score ?? payload.totalScore ?? payload.runScore) || 0,
    );
    if (score <= 0) return;

    const tribe = this.state.tribe || "hausa";
    const entry = {
      name: this.state.playerName || "Driver",
      score,
      region: this.state.region,
      at: Date.now(),
    };

    const board = this.state.leaderboards[tribe] || [];
    board.push(entry);
    this.state.leaderboards[tribe] = top3(board);
    // keep a longer list then trim
    const merged = top3([...(this.state.leaderboards[tribe] || []), entry]);
    this.state.leaderboards[tribe] = merged;
    saveState(this.state);

    this.eventBus?.emit?.("naija:score-submitted", {
      tribe,
      entry,
      top3: this.state.leaderboards[tribe],
      grand: this.getGrandStanding(),
    });
  }

  getGrandStanding() {
    // Average of each tribe's #1 score; also list all top3
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
      message:
        count === 3
          ? "All three tribes have champions — National pool active"
          : "Need top scores in Hausa, Yoruba & Igbo for full National ranking",
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
      zIndex: "5200",
      background: "rgba(3,9,18,0.92)",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      padding: "16px",
      fontFamily: "system-ui, Arial, sans-serif",
      color: "#f8fafc",
    });

    const panel = document.createElement("div");
    Object.assign(panel.style, {
      width: "min(480px, 100%)",
      maxHeight: "90vh",
      overflowY: "auto",
      background: "linear-gradient(145deg,#14532d,#081321)",
      border: "1px solid rgba(34,197,94,0.45)",
      borderRadius: "16px",
      padding: "20px",
    });

    const tribeOpts = TRIBES.map(
      (t) =>
        `<option value="${t.id}" ${this.state.tribe === t.id ? "selected" : ""}>${t.name}</option>`,
    ).join("");
    const regionOpts = REGIONS.map(
      (r) =>
        `<option value="${r.id}" ${this.state.region === r.id ? "selected" : ""}>${r.name}</option>`,
    ).join("");

    let boardsHtml = "";
    for (const t of TRIBES) {
      const rows = top3(this.state.leaderboards[t.id] || []);
      boardsHtml += `<div style="margin-bottom:12px"><div style="font-weight:800;color:#4ade80">${t.name} — Top 3</div>`;
      if (!rows.length) boardsHtml += `<div style="font-size:12px;color:#94a3b8">No scores yet</div>`;
      rows.forEach((r, i) => {
        boardsHtml += `<div style="font-size:13px">${i + 1}. ${r.name} — ${r.score}</div>`;
      });
      boardsHtml += `</div>`;
    }

    panel.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">
        <div>
          <div style="font-size:12px;letter-spacing:2px;color:#4ade80">NAIJA CHALLENGE</div>
          <div style="font-size:22px;font-weight:900">Tribal & Regional</div>
        </div>
        <button data-close style="padding:8px 14px;border:0;border-radius:8px;background:#334155;color:#fff;font-weight:700;cursor:pointer">Close</button>
      </div>
      <div style="font-size:13px;color:#cbd5e1;margin-bottom:12px">
        Pick your tribe. Your run score enters that tribe’s Top 3.
        Grand standing uses each tribe’s best drivers.
      </div>
      <label style="font-size:12px;color:#94a3b8">Display name</label>
      <input data-name value="${this.state.playerName || ""}" style="width:100%;margin:4px 0 10px;padding:10px;border-radius:8px;border:1px solid #334155;background:#0f172a;color:#fff" />
      <label style="font-size:12px;color:#94a3b8">Tribe</label>
      <select data-tribe style="width:100%;margin:4px 0 10px;padding:10px;border-radius:8px;border:1px solid #334155;background:#0f172a;color:#fff">${tribeOpts}</select>
      <label style="font-size:12px;color:#94a3b8">Regional challenge</label>
      <select data-region style="width:100%;margin:4px 0 14px;padding:10px;border-radius:8px;border:1px solid #334155;background:#0f172a;color:#fff">${regionOpts}</select>
      <button data-save style="width:100%;padding:12px;border:0;border-radius:8px;background:#22c55e;color:#052e16;font-weight:800;cursor:pointer;margin-bottom:16px">Save identity</button>
      ${boardsHtml}
      <div style="margin-top:8px;padding:12px;border-radius:10px;background:rgba(0,0,0,0.25);font-size:13px">
        <b>National pool:</b> ${grand.message}<br/>
        Champion index: <b>${grand.championScore}</b>
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
    document.getElementById("kano-naija-fab")?.remove();
    for (const u of this._disposers) {
      try {
        u();
      } catch {}
    }
    this._disposers = [];
  }
}

export { TRIBES, REGIONS };
