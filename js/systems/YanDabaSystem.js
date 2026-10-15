export default class YanDabaSystem {
  constructor({ eventBus = null, config = {} } = {}) {
    this.eventBus = eventBus;
    this.config = { minGap: 180, maxGap: 420, nightChance: 0.35, dayChance: 0.06, ...config };
    this.enabled = false;
    this.isNight = false;
    this.nextZ = 200;
    this._disposers = [];
    this.eventBus?.on?.("game:started", () => { this.enabled = true; this.nextZ = 250; });
    this.eventBus?.on?.("game:stopped", () => { this.enabled = false; });
    this.eventBus?.on?.("daynight:changed", (p) => { this.isNight = Boolean(p?.isNight || p?.phase === "night"); });
  }
  async initialize() { return this; }
  update(dt = 0, playerZ = 0) {
    if (!this.enabled) return;
    const z = Number(playerZ) || 0;
    if (z < this.nextZ) return;
    this.nextZ = z + this.config.minGap + Math.random() * (this.config.maxGap - this.config.minGap);
    if (Math.random() > (this.isNight ? this.config.nightChance : this.config.dayChance)) return;
    this._trigger();
  }
  _trigger() {
    const loss = 300 + Math.floor(Math.random() * 900);
    const root = document.createElement("div");
    root.id = "kano-yandaba";
    Object.assign(root.style, { position: "fixed", inset: "0", zIndex: "8200", display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(20,5,5,0.85)", fontFamily: "system-ui,Arial,sans-serif", color: "#fecaca", padding: "16px" });
    root.innerHTML = `<div style="width:min(340px,100%);background:#1c0a0a;border:2px solid #f87171;border-radius:14px;padding:18px;text-align:center"><div style="font-size:11px;letter-spacing:2px;font-weight:800;color:#f87171">YAN DABA</div><div style="font-size:20px;font-weight:900;margin:8px 0;color:#fff">Phone snatch attempt!</div><div style="font-size:13px;color:#fca5a5;margin-bottom:14px">Drive through or lose cash.</div><button data-a="drive" style="width:100%;padding:12px;margin-bottom:8px;border:0;border-radius:10px;background:#22c55e;color:#052e16;font-weight:900">Drive through</button><button data-a="lose" style="width:100%;padding:12px;border:1px solid #f87171;border-radius:10px;background:transparent;color:#fecaca;font-weight:700">Lose ₦${loss}</button></div>`;
    const finish = (drive) => {
      root.remove();
      this.eventBus?.emit?.("game:resume");
      if (drive) {
        if (Math.random() < 0.35) {
          const hit = Math.round(loss * 0.4);
          this.eventBus?.emit?.("economy:spend", { amount: hit, reason: "yandaba_damage" });
          this.eventBus?.emit?.("hud:notify", { text: `Escaped — ₦${hit} lost`, type: "warn" });
        } else this.eventBus?.emit?.("hud:notify", { text: "Escaped the Yan Daba", type: "ok" });
      } else {
        this.eventBus?.emit?.("economy:spend", { amount: loss, reason: "yandaba_robbery" });
        this.eventBus?.emit?.("hud:notify", { text: `Robbed — ₦${loss}`, type: "urgent" });
      }
    };
    root.querySelector('[data-a="drive"]').onclick = () => finish(true);
    root.querySelector('[data-a="lose"]').onclick = () => finish(false);
    document.body.appendChild(root);
    this.eventBus?.emit?.("game:pause");
  }
  dispose() { document.getElementById("kano-yandaba")?.remove(); }
}
