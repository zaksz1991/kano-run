/**
 * Applies smoother acceleration, brake, and steer feel at run start.
 */
export default class PhysicsTuningSystem {
  constructor({ eventBus = null, playerVehicleSystem = null } = {}) {
    this.eventBus = eventBus;
    this.player = playerVehicleSystem;
    this._disposers = [];

    this._subscribe("game:started", () => this.apply());
    this._subscribe("garage:applySelections", (p) => this.apply(p));
  }

  apply(payload = {}) {
    const player = this.player;
    if (!player) return;

    const bonus = payload.driverBonus || {};
    const stats = payload.vehicleStats || {};

    // Baseline feel
    player.accelRate = (stats.acceleration || 10) * 0.55 * (bonus.speed || 1);
    player.brakeRate = 14;
    player.coastRate = 3.5;
    player.steerRate = 2.8 * (bonus.handling || stats.handling || 1);
    player.maxSpeed = Math.min(34, (stats.maxSpeed || 26) * (bonus.speed || 1));

    // Grip / slip lightly
    player.lateralDamping = 6;

    this.eventBus?.emit?.("physics:applied", {
      maxSpeed: player.maxSpeed,
      accelRate: player.accelRate,
    });
  }

  _subscribe(name, handler) {
    if (!this.eventBus?.on) return;
    const u = this.eventBus.on(name, handler);
    if (typeof u === "function") this._disposers.push(u);
  }

  dispose() {
    for (const u of this._disposers) {
      try {
        u();
      } catch {}
    }
    this._disposers = [];
  }
}
