/**
 * Central damage authority.
 * Fatal damage always goes through Life Saver (lives:request-continue),
 * never emits game:over directly — avoids double game-over.
 */
export default class DamageSystem {
  constructor({
    eventBus = null,
    gameState = null,
    playerVehicleSystem = null,
    config = {},
  } = {}) {
    this.eventBus = eventBus;
    this.gameState = gameState;
    this.player = playerVehicleSystem;
    this.config = {
      maxCondition: 100,
      fatalThreshold: 0,
      invulnOnContinue: 2.5,
      ...config,
    };

    this.condition = this.config.maxCondition;
    this.invulnTimer = 0;
    this.fatalPending = false;
    this.enabled = false;
    this._disposers = [];

    this._subscribe("game:started", () => {
      this.enabled = true;
      this.condition = this.config.maxCondition;
      this.invulnTimer = 0;
      this.fatalPending = false;
      this._emit();
    });

    this._subscribe("game:stopped", () => {
      this.enabled = false;
      this.fatalPending = false;
    });

    this._subscribe("collision:detected", (p) => {
      this.applyDamage(Number(p?.damage) || 12, "collision");
    });

    this._subscribe("playerVehicle:hit", (p) => {
      this.applyDamage(Number(p?.damage) || 15, "hit");
    });

    this._subscribe("player:revive", (p) => {
      this.fatalPending = false;
      this.condition = Math.max(40, this.condition);
      this.invulnTimer = Number(p?.invulnSeconds) || this.config.invulnOnContinue;
      this._emit();
    });

    this._subscribe("lives:continued", () => {
      this.fatalPending = false;
      this.condition = Math.max(45, this.condition);
      this.invulnTimer = this.config.invulnOnContinue;
      this._emit();
    });

    // If user ends trip from Life Saver panel
    this._subscribe("game:over", () => {
      this.enabled = false;
      this.fatalPending = false;
    });
  }

  initialize() {
    this.condition = this.config.maxCondition;
    this._emit();
    return this;
  }

  update(deltaTime) {
    if (!this.enabled) return;
    const dt = Math.min(Number(deltaTime) || 0, 0.1);
    if (this.invulnTimer > 0) {
      this.invulnTimer = Math.max(0, this.invulnTimer - dt);
    }
  }

  applyDamage(amount, reason = "unknown") {
    if (!this.enabled || this.fatalPending) return;
    if (this.invulnTimer > 0) {
      this.eventBus?.emit?.("damage:blocked", { reason: "invulnerable" });
      return;
    }

    const dmg = Math.max(0, Number(amount) || 0);
    this.condition = Math.max(0, this.condition - dmg);

    this.eventBus?.emit?.("damage:applied", {
      amount: dmg,
      condition: this.condition,
      reason,
    });
    this._emit();

    if (this.condition <= this.config.fatalThreshold) {
      this._fatal(reason);
    }
  }

  _fatal(reason) {
    if (this.fatalPending) return;
    this.fatalPending = true;

    // Soft fail only — Life Saver owns continue vs end
    this.eventBus?.emit?.("player:critical", { reason, condition: 0 });
    this.eventBus?.emit?.("lives:request-continue", {
      reason: reason || "fatal-damage",
      condition: 0,
    });

    // Do NOT emit game:over here
  }

  heal(amount) {
    this.condition = Math.min(
      this.config.maxCondition,
      this.condition + Math.max(0, Number(amount) || 0),
    );
    this._emit();
  }

  _emit() {
    this.eventBus?.emit?.("damage:status", {
      condition: this.condition,
      max: this.config.maxCondition,
      invulnerable: this.invulnTimer > 0,
      fatalPending: this.fatalPending,
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
