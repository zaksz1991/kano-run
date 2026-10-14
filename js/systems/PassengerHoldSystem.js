/**
 * Freezes player keke during pick-up, negotiation, and drop-off.
 */
export default class PassengerHoldSystem {
  constructor({ eventBus = null, playerVehicleSystem = null } = {}) {
    this.eventBus = eventBus;
    this.player = playerVehicleSystem;
    this.held = false;
    this._reason = null;
    this._disposers = [];

    const hold = (reason) => this._hold(reason);
    const release = () => this._release();

    this._subscribe("passenger:boarding", () => hold("boarding"));
    this._subscribe("passenger:boarded", () => hold("boarded"));
    this._subscribe("negotiation:started", () => hold("negotiation"));
    this._subscribe("negotiation:finished", () => release());
    this._subscribe("passenger:dropping", () => hold("dropping"));
    this._subscribe("passenger:dropped", () => release());
    this._subscribe("game:resumed", () => {
      if (this._reason === "negotiation") return;
      // don't auto-release mid negotiation
    });
    this._subscribe("game:started", () => this._release());
    this._subscribe("game:stopped", () => this._release());
  }

  _hold(reason) {
    this.held = true;
    this._reason = reason;
    this.eventBus?.emit?.("player:force-speed-cap", { maxSpeed: 0.01 });
    this.eventBus?.emit?.("player:hold", { active: true, reason });
    if (this.player) {
      this.player.speed = 0;
      this.player._speedCap = 0.01;
      this.player.heldForPassenger = true;
    }
  }

  _release() {
    this.held = false;
    this._reason = null;
    this.eventBus?.emit?.("player:force-speed-cap", { maxSpeed: 0 });
    this.eventBus?.emit?.("player:hold", { active: false });
    if (this.player) {
      this.player._speedCap = 0;
      this.player.heldForPassenger = false;
    }
  }

  _subscribe(name, handler) {
    if (!this.eventBus?.on) return;
    const u = this.eventBus.on(name, handler);
    if (typeof u === "function") this._disposers.push(u);
  }

  dispose() {
    this._release();
    for (const u of this._disposers) {
      try {
        u();
      } catch {}
    }
    this._disposers = [];
  }
}
