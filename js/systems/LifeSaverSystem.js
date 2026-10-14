/**
 * Life Saver ×3 free, then paid continues via EconomySystem.
 * Listens for collision/game-over pressure and offers continue UI.
 */
const DEFAULTS = {
  freeContinues: 3,
  paidContinueCost: 400,
  maxPaidContinuesPerRun: 5,
  invulnSeconds: 2.5,
};

export default class LifeSaverSystem {
  constructor({
    eventBus = null,
    gameState = null,
    economySystem = null,
    config = {},
  } = {}) {
    this.eventBus = eventBus;
    this.gameState = gameState;
    this.economy = economySystem;
    this.config = { ...DEFAULTS, ...config };

    this.freeLeft = this.config.freeContinues;
    this.paidUsed = 0;
    this.enabled = false;
    this._panel = null;
    this._disposers = [];
    this._pending = false;

    this._subscribe("game:started", () => {
      this.enabled = true;
      this.freeLeft = this.config.freeContinues;
      this.paidUsed = 0;
      this._pending = false;
      this._hidePanel();
      this._emitStatus();
    });

    this._subscribe("game:stopped", () => {
      this.enabled = false;
      this._hidePanel();
    });

    // Soft fail — offer continue before full game over
    this._subscribe("playerVehicle:destroyed", (p) => this._offerContinue(p));
    this._subscribe("player:critical", (p) => this._offerContinue(p));
    this._subscribe("lives:request-continue", (p) => this._offerContinue(p));

    // If something emits game:over with recoverable flag
    this._subscribe("game:over-request-continue", (p) => this._offerContinue(p));
  }

  initialize() {
    this._emitStatus();
    return this;
  }

  getStatus() {
    return {
      freeLeft: this.freeLeft,
      paidUsed: this.paidUsed,
      paidCost: this.config.paidContinueCost,
      canPay:
        this.paidUsed < this.config.maxPaidContinuesPerRun &&
        this._balance() >= this.config.paidContinueCost,
    };
  }

  _balance() {
    if (this.economy?.getBalance) return this.economy.getBalance();
    return Number(this.gameState?.profile?.money) || 0;
  }

  _offerContinue(payload = {}) {
    if (!this.enabled || this._pending) return;
    this._pending = true;
    this.eventBus?.emit?.("game:paused");
    this._showPanel(payload);
  }

  _showPanel(payload = {}) {
    this._hidePanel();
    const status = this.getStatus();
    const free = status.freeLeft > 0;

    const panel = document.createElement("div");
    panel.id = "life-saver-panel";
    Object.assign(panel.style, {
      position: "fixed",
      left: "50%",
      top: "50%",
      transform: "translate(-50%, -50%)",
      zIndex: "2300",
      width: "min(340px, 92vw)",
      background: "rgba(15,23,42,0.97)",
      border: "2px solid #38bdf8",
      borderRadius: "14px",
      padding: "20px",
      color: "#f8fafc",
      fontFamily: "system-ui, Arial, sans-serif",
      textAlign: "center",
      boxShadow: "0 16px 40px rgba(0,0,0,0.5)",
    });

    const freeLabel = free
      ? `Free Life Savers left: <b>${status.freeLeft}</b>`
      : `No free Life Savers left`;

    panel.innerHTML = `
      <div style="font-size:12px;letter-spacing:2px;color:#38bdf8;margin-bottom:6px">LIFE SAVER</div>
      <div style="font-size:18px;font-weight:700;margin-bottom:8px">Continue driving?</div>
      <div style="font-size:13px;color:#94a3b8;margin-bottom:14px">${freeLabel}<br>Wallet: ₦${this._balance()}</div>
      <div style="display:flex;flex-direction:column;gap:8px">
        ${
          free
            ? `<button data-act="free" style="padding:12px;border:0;border-radius:8px;background:#22c55e;color:#052e16;font-weight:700;cursor:pointer">Use free Life Saver</button>`
            : `<button data-act="pay" style="padding:12px;border:0;border-radius:8px;background:#fbbf24;color:#422006;font-weight:700;cursor:pointer" ${status.canPay ? "" : "disabled"}>Pay ₦${status.paidCost} for Life Saver</button>`
        }
        <button data-act="end" style="padding:12px;border:0;border-radius:8px;background:#334155;color:#e2e8f0;font-weight:700;cursor:pointer">End trip</button>
      </div>
    `;

    panel.querySelectorAll("button").forEach((btn) => {
      btn.addEventListener("click", () => {
        const act = btn.getAttribute("data-act");
        if (act === "free") this._useFree();
        else if (act === "pay") this._usePaid();
        else this._endTrip(payload);
      });
    });

    document.body.appendChild(panel);
    this._panel = panel;
  }

  _useFree() {
    if (this.freeLeft <= 0) return;
    this.freeLeft -= 1;
    this._pending = false;
    this._hidePanel();
    this._emitStatus();
    this.eventBus?.emit?.("lives:continued", {
      type: "free",
      freeLeft: this.freeLeft,
    });
    this.eventBus?.emit?.("player:revive", {
      invulnSeconds: this.config.invulnSeconds,
    });
    this.eventBus?.emit?.("game:resumed");
  }

  _usePaid() {
    const cost = this.config.paidContinueCost;
    if (this.paidUsed >= this.config.maxPaidContinuesPerRun) return;
    if (this._balance() < cost) {
      this.eventBus?.emit?.("hud:notify", {
        text: "Not enough money for Life Saver",
        type: "urgent",
      });
      return;
    }

    this.eventBus?.emit?.("economy:spend", {
      amount: cost,
      reason: "life-saver",
    });
    // Direct economy call if spend listener is slow
    this.economy?.deductMoney?.(cost, "life-saver");

    this.paidUsed += 1;
    this._pending = false;
    this._hidePanel();
    this._emitStatus();
    this.eventBus?.emit?.("lives:continued", {
      type: "paid",
      cost,
      paidUsed: this.paidUsed,
    });
    this.eventBus?.emit?.("player:revive", {
      invulnSeconds: this.config.invulnSeconds,
    });
    this.eventBus?.emit?.("game:resumed");
  }

  _endTrip(payload = {}) {
    this._pending = false;
    this._hidePanel();
    this.eventBus?.emit?.("game:over", {
      reason: payload.reason || "no-continue",
      ...payload,
    });
  }

  _emitStatus() {
    this.eventBus?.emit?.("lives:status", this.getStatus());
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
    for (const u of this._disposers) {
      try {
        u();
      } catch {}
    }
    this._disposers = [];
  }
}
