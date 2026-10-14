/**
 * Share trip summary after game over (Web Share API + clipboard fallback).
 */
export default class ShareRunSystem {
  constructor({ eventBus = null } = {}) {
    this.eventBus = eventBus;
    this._disposers = [];
    this._lastSnapshot = null;
    this._btn = null;

    this._subscribe("game:over", (p) => this._onGameOver(p));
    this._subscribe("gameover:shown", (p) => this._onGameOver(p));
    this._subscribe("run:finished", (p) => {
      this._lastSnapshot = { ...(this._lastSnapshot || {}), ...p };
    });
  }

  _onGameOver(payload = {}) {
    this._lastSnapshot = { ...(this._lastSnapshot || {}), ...payload };
    this._ensureShareButton();
  }

  _ensureShareButton() {
    if (typeof document === "undefined") return;
    if (document.getElementById("kano-share-run-btn")) return;

    // Attach under game-over panel if present
    const host =
      document.getElementById("kano-run-game-over") || document.body;

    const btn = document.createElement("button");
    btn.id = "kano-share-run-btn";
    btn.type = "button";
    btn.textContent = "Share run";
    Object.assign(btn.style, {
      position: "fixed",
      bottom: "24px",
      left: "50%",
      transform: "translateX(-50%)",
      zIndex: "10050",
      padding: "12px 22px",
      borderRadius: "10px",
      border: "none",
      background: "#00b4d8",
      color: "#061421",
      fontWeight: "800",
      fontSize: "14px",
      cursor: "pointer",
      boxShadow: "0 8px 24px rgba(0,0,0,0.35)",
    });
    btn.addEventListener("click", () => this.share());
    host.appendChild(btn);
    this._btn = btn;

    // Hide when game over closes - simple timeout cleanup on restart
    this._subscribe("game:started", () => {
      this._btn?.remove();
      this._btn = null;
    });
  }

  buildText(snapshot = {}) {
    const s = { ...this._lastSnapshot, ...snapshot };
    const score = Math.round(Number(s.score ?? s.totalScore) || 0);
    const dist = Number(s.distanceKm ?? s.distance) || 0;
    const distLabel =
      dist > 50 ? `${Math.round(dist)} m` : `${dist.toFixed?.(1) || dist} km`;
    const money = Math.round(Number(s.earnings ?? s.runEarnings ?? s.money) || 0);
    const deliveries = Math.round(
      Number(s.deliveries ?? s.passengersDelivered) || 0,
    );

    return [
      "Kano Run — Adaidaita Sahu",
      `Score: ${score}`,
      `Distance: ${distLabel}`,
      `Passengers: ${deliveries}`,
      money ? `Earnings: ₦${money}` : null,
      "Play: https://kano-run.vercel.app",
      "#KanoRun #KekeNapep",
    ]
      .filter(Boolean)
      .join("\n");
  }

  async share(snapshot = {}) {
    const text = this.buildText(snapshot);
    const data = {
      title: "My Kano Run trip",
      text,
      url: "https://kano-run.vercel.app",
    };

    try {
      if (navigator.share) {
        await navigator.share(data);
        this.eventBus?.emit?.("share:completed", { method: "native" });
        return true;
      }
    } catch (err) {
      if (err?.name === "AbortError") return false;
    }

    try {
      await navigator.clipboard.writeText(text);
      this.eventBus?.emit?.("share:completed", { method: "clipboard" });
      this._toast("Trip copied — paste anywhere to share");
      return true;
    } catch {
      this._toast("Could not share — copy failed");
      return false;
    }
  }

  _toast(msg) {
    const el = document.createElement("div");
    Object.assign(el.style, {
      position: "fixed",
      bottom: "80px",
      left: "50%",
      transform: "translateX(-50%)",
      zIndex: "10060",
      background: "rgba(7,18,32,0.95)",
      color: "#e0f2fe",
      padding: "10px 16px",
      borderRadius: "8px",
      fontSize: "13px",
      fontFamily: "system-ui, Arial, sans-serif",
    });
    el.textContent = msg;
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 2500);
  }

  _subscribe(name, handler) {
    if (!this.eventBus?.on) return;
    const u = this.eventBus.on(name, handler);
    if (typeof u === "function") this._disposers.push(u);
  }

  dispose() {
    this._btn?.remove();
    for (const u of this._disposers) {
      try {
        u();
      } catch {}
    }
    this._disposers = [];
  }
}
