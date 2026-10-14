/**
 * Share-run card after game over — score + tribe for Naija Challenge.
 */
export default class ShareRunSystem {
  constructor({ eventBus = null } = {}) {
    this.eventBus = eventBus;
    this._panel = null;
    this._last = null;
    this._disposers = [];

    this._subscribe("game:over", (p) => this._capture(p));
    this._subscribe("game:finished", (p) => this._capture(p));
    this._subscribe("gameover:shown", (p) => {
      this._capture(p);
      setTimeout(() => this.show(), 400);
    });
    this._subscribe("share:open", () => this.show());
  }

  _capture(payload = {}) {
    let tribe = "hausa";
    let name = "Driver";
    try {
      const raw = localStorage.getItem("kano-run-naija-challenge");
      if (raw) {
        const s = JSON.parse(raw);
        tribe = s.tribe || tribe;
        name = s.playerName || name;
      }
    } catch {}
    this._last = {
      score: Math.round(Number(payload.score || payload.totalScore) || 0),
      money: Math.round(Number(payload.money || payload.fares) || 0),
      distance: Number(payload.distance || payload.km) || 0,
      tribe,
      name,
      at: Date.now(),
    };
  }

  show() {
    if (!this._last || this._last.score <= 0) return;
    this.close();
    const { score, money, distance, tribe, name } = this._last;
    const text = `Kano Run — ${name} (${tribe})\nScore ${score} · ₦${money}\n#KanoRun #NaijaChallenge`;

    const root = document.createElement("div");
    root.id = "kano-share-ui";
    Object.assign(root.style, {
      position: "fixed",
      inset: "0",
      zIndex: "5300",
      background: "rgba(3,9,18,0.85)",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      padding: "16px",
      fontFamily: "system-ui, Arial, sans-serif",
      color: "#f8fafc",
    });
    const card = document.createElement("div");
    Object.assign(card.style, {
      width: "min(360px, 100%)",
      background: "linear-gradient(160deg,#0ea5e9,#0f172a 55%)",
      borderRadius: "16px",
      padding: "22px",
      border: "1px solid rgba(255,255,255,0.15)",
      textAlign: "center",
    });
    card.innerHTML = `
      <div style="font-size:12px;letter-spacing:2px;opacity:0.9">KANO RUN</div>
      <div style="font-size:28px;font-weight:900;margin:8px 0">${score}</div>
      <div style="font-size:14px;margin-bottom:12px">${name} · ${tribe.toUpperCase()}</div>
      <div style="font-size:13px;color:#cbd5e1;margin-bottom:16px">₦${money} fares · ${distance ? distance.toFixed?.(1) || distance : "—"} km</div>
      <button data-copy style="width:100%;padding:12px;border:0;border-radius:10px;background:#f8fafc;color:#0f172a;font-weight:800;cursor:pointer;margin-bottom:8px">Copy share text</button>
      <button data-close style="width:100%;padding:10px;border:1px solid #64748b;border-radius:10px;background:transparent;color:#e2e8f0;font-weight:700;cursor:pointer">Close</button>
    `;
    card.querySelector("[data-copy]").onclick = async () => {
      try {
        await navigator.clipboard.writeText(text);
        card.querySelector("[data-copy]").textContent = "Copied!";
      } catch {
        prompt("Copy:", text);
      }
    };
    card.querySelector("[data-close]").onclick = () => this.close();
    root.onclick = (e) => {
      if (e.target === root) this.close();
    };
    root.appendChild(card);
    document.body.appendChild(root);
    this._panel = root;
  }

  close() {
    this._panel?.remove();
    this._panel = null;
  }

  _subscribe(name, handler) {
    if (!this.eventBus?.on) return;
    const u = this.eventBus.on(name, handler);
    if (typeof u === "function") this._disposers.push(u);
  }

  dispose() {
    this.close();
    for (const u of this._disposers) {
      try {
        u();
      } catch {}
    }
    this._disposers = [];
  }
}
