/**
 * KANO LIFE — Workshop Wallet Bridge
 * Connects workshop/lifecycle directors to the existing game's banked money.
 *
 * Install as js/KanoWorkshopWalletBridge.js.
 * This bridge deliberately uses the existing `save.money` + `persist()` API
 * from storage.js. It does not treat run score as banked money.
 */
import { save, persist } from './storage.js';
import { KanoWorkshopRecoveryDirector } from './KanoWorkshopRecoveryDirector.js';
import { KanoVehicleLifecycleDirector } from './KanoVehicleLifecycleDirector.js';

const COMPONENT_MAP = {
  tyre: 'tyres',
  engine: 'engine',
  cooling: 'cooling',
  brakes: 'brakes',
  suspension: 'suspension',
  electrical: 'body',
  body: 'body',
};

const safeNumber = (value, fallback = 0) =>
  Number.isFinite(Number(value)) ? Number(value) : fallback;

export class KanoWorkshopWalletBridge {
  constructor({ game, onUpdate = () => {}, onMessage = () => {} } = {}) {
    if (!game) throw new Error('KanoWorkshopWalletBridge requires the active Game instance.');
    this.game = game;
    this.onUpdate = onUpdate;
    this.onMessage = onMessage;
    this.vehicleId = 'player-keke';
    this.workshop = new KanoWorkshopRecoveryDirector({
      storageKey: 'kano-life-workshop-recovery-v1',
      onEvent: event => {
        this.onUpdate({ type: 'workshop_event', event, snapshot: this.snapshot() });
      },
    });
    this.lifecycle = new KanoVehicleLifecycleDirector({
      storageKey: 'kano-life-player-vehicle-v1',
      autoSave: true,
    });
    this.ensureVehicle();
  }

  ensureVehicle() {
    let vehicle = this.lifecycle.getVehicle(this.vehicleId);
    if (!vehicle) {
      vehicle = this.lifecycle.createVehicle({
        id: this.vehicleId,
        type: 'keke',
        name: 'Player Adaidaita Sahu',
        parts: this.partsFromGame(),
      });
    } else {
      this.syncLifecycleFromGame();
    }
    return vehicle;
  }

  partsFromGame() {
    const s = this.game.s || {};
    return {
      engine: { health: safeNumber(s.engine, 100) },
      tyres: { health: safeNumber(s.tyres, 100) },
      suspension: { health: safeNumber(s.condition, 100) },
      brakes: { health: safeNumber(s.condition, 100) },
      body: { health: safeNumber(s.condition, 100) },
      cooling: { health: 100 - safeNumber(s.heat, 0) * 0.25 },
    };
  }

  syncLifecycleFromGame() {
    const current = this.lifecycle.getVehicle(this.vehicleId);
    if (!current) return this.ensureVehicle();
    const incoming = this.partsFromGame();
    // Damage only syncs downward during play; it never silently repairs parts.
    for (const [part, value] of Object.entries(incoming)) {
      const oldHealth = current.parts[part]?.health ?? 100;
      if (value.health < oldHealth) {
        try {
          this.lifecycle.recordImpact({
            vehicleId: this.vehicleId,
            part,
            severity: Math.min(1, (oldHealth - value.health) / 24),
            collision: part === 'body' || part === 'suspension',
          });
        } catch (_) { /* preserve gameplay if optional lifecycle tracking fails */ }
      }
    }
    return this.lifecycle.getVehicle(this.vehicleId);
  }

  snapshot() {
    const vehicle = this.lifecycle.getVehicle(this.vehicleId);
    return {
      balance: Math.max(0, safeNumber(save.money, 0)),
      vehicle,
      workshops: this.workshop.listWorkshops(),
      jobs: this.workshop.listJobs({ vehicleId: this.vehicleId }),
      recoveryCalls: this.workshop.listRecoveryCalls({ vehicleId: this.vehicleId }),
      repairQuote: vehicle ? this.lifecycle.calculateRepair(this.vehicleId) : null,
    };
  }

  quoteLifecycleRepair({ parts, workshop = true, includeService = false } = {}) {
    this.syncLifecycleFromGame();
    return this.lifecycle.calculateRepair(this.vehicleId, { parts, workshop, includeService });
  }

  payLifecycleRepair({ parts, workshop = true, includeService = false } = {}) {
    this.syncLifecycleFromGame();
    const quote = this.lifecycle.calculateRepair(this.vehicleId, { parts, workshop, includeService });
    if (!quote.items.length || quote.total <= 0) {
      return { ok: false, reason: 'no_repair_needed', quote };
    }
    const balance = Math.max(0, safeNumber(save.money, 0));
    if (balance < quote.total) {
      return { ok: false, reason: 'insufficient_funds', quote, balance };
    }
    const confirmed = globalThis.confirm(
      `Confirm keke repair for ₦${quote.total.toLocaleString()}?\n` +
      quote.items.map(item => `${item.part}: ₦${item.cost.toLocaleString()}`).join('\n') +
      `\n\nBanked balance: ₦${balance.toLocaleString()}`
    );
    if (!confirmed) return { ok: false, reason: 'cancelled', quote, balance };

    // Charge only after explicit confirmation, then restore vehicle health.
    save.money = balance - quote.total;
    try {
      const result = this.lifecycle.repair({
        vehicleId: this.vehicleId,
        parts,
        workshop,
        includeService,
        paymentConfirmed: true,
      });
      persist();
      this.applyVehicleToGame(result.vehicle);
      this.onMessage(`Repair completed · ₦${quote.total.toLocaleString()} paid.`);
      this.onUpdate({ type: 'repair_paid', result, snapshot: this.snapshot() });
      return { ok: true, ...result, balance: save.money };
    } catch (error) {
      // Roll back the wallet if lifecycle repair unexpectedly fails.
      save.money = balance;
      persist();
      return { ok: false, reason: 'repair_failed', message: String(error?.message || error), quote };
    }
  }

  applyVehicleToGame(vehicle) {
    if (!vehicle || !this.game.s) return;
    const s = this.game.s;
    s.engine = vehicle.parts.engine.health;
    s.tyres = vehicle.parts.tyres.health;
    s.condition = Math.min(
      vehicle.parts.body.health,
      vehicle.parts.suspension.health,
      vehicle.parts.brakes.health,
    );
    s.heat = Math.max(0, Math.min(100, (vehicle.temperature - 82) * 2));
    if (!vehicle.breakdown) {
      s.speed = Math.min(s.speed || 0, 8);
      this.game.syncSignedSpeed?.();
    }
    this.game.ui?.update?.(s, this.game.route, this.game.driver);
  }

  requestRecovery({ severity = 'breakdown', location = 'Kano roadside', distanceKm = 3 } = {}) {
    return this.workshop.requestRecovery({
      vehicleId: this.vehicleId,
      severity,
      location,
      distanceKm,
      timeOfDay: this.game.s?.gameClockMinutes
        ? this.game.s.gameClockMinutes / 60
        : 12,
    });
  }

  payRecovery(callId) {
    const call = this.workshop.listRecoveryCalls({ vehicleId: this.vehicleId })
      .find(call => call.id === callId);
    if (!call || call.status !== 'awaiting_confirmation') {
      return { ok: false, reason: 'recovery_not_payable' };
    }
    const balance = Math.max(0, safeNumber(save.money, 0));
    if (balance < call.fee) return { ok: false, reason: 'insufficient_funds', balance, fee: call.fee };
    const confirmed = globalThis.confirm(
      `Dispatch recovery to ${call.location}?\nFee: ₦${call.fee.toLocaleString()}\nEstimated arrival: ${call.etaMinutes} minutes`
    );
    if (!confirmed) return { ok: false, reason: 'cancelled' };

    const reference = `KANO-RECOVERY-${call.id}`;
    save.money = balance - call.fee;
    try {
      const result = this.workshop.confirmRecoveryPayment(call.id, reference);
      if (!result.ok) throw new Error(result.reason || 'Could not dispatch recovery.');
      persist();
      this.onUpdate({ type: 'recovery_paid', result, snapshot: this.snapshot() });
      this.onMessage(`Recovery dispatched · ETA ${call.etaMinutes} minutes.`);
      return { ...result, balance: save.money };
    } catch (error) {
      save.money = balance;
      persist();
      return { ok: false, reason: 'recovery_payment_failed', message: String(error?.message || error) };
    }
  }
}
