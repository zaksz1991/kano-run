/**
 * KANO LIFE — WORKSHOP WALLET BRIDGE
 *
 * Connects:
 * - The active Game instance.
 * - The existing banked wallet in storage.js.
 * - Vehicle lifecycle and component health.
 * - Workshop and roadside recovery systems.
 *
 * IMPORTANT:
 * - Uses save.money and persist() for banked funds.
 * - Never uses run score as banked money.
 * - Requires explicit payment confirmation.
 * - Synchronises real component health without inventing damage.
 * - Does not render or move vehicles.
 */

import { save, persist } from './storage.js';

import {
  KanoWorkshopRecoveryDirector,
} from './KanoWorkshopRecoveryDirector.js';

import {
  KanoVehicleLifecycleDirector,
} from './KanoVehicleLifecycleDirector.js';

// ============================================================
// COMPONENT MAPPING
// ============================================================

const COMPONENT_MAP = {
  tyre: 'tyres',
  tyres: 'tyres',
  engine: 'engine',
  cooling: 'cooling',
  brakes: 'brakes',
  suspension: 'suspension',
  electrical: 'body',
  body: 'body',
};

const safeNumber = (value, fallback = 0) =>
  Number.isFinite(Number(value))
    ? Number(value)
    : fallback;

const clamp = (value, min, max) =>
  Math.min(max, Math.max(min, value));

const formatMoney = (amount) =>
  `₦${Math.max(0, safeNumber(amount)).toLocaleString()}`;

// ============================================================
// BRIDGE
// ============================================================

export class KanoWorkshopWalletBridge {
  constructor({
    game,
    onUpdate = () => {},
    onMessage = () => {},
  } = {}) {
    if (!game) {
      throw new Error(
        'KanoWorkshopWalletBridge requires the active Game instance.',
      );
    }

    this.game = game;
    this.onUpdate = onUpdate;
    this.onMessage = onMessage;

    this.vehicleId = 'player-keke';

    this._syncing = false;
    this._lastSyncAt = 0;

    this.workshop = new KanoWorkshopRecoveryDirector({
      storageKey: 'kano-life-workshop-recovery-v1',

      onEvent: (event) => {
        this._emitUpdate({
          type: 'workshop_event',
          event,
        });
      },
    });

    this.lifecycle = new KanoVehicleLifecycleDirector({
      storageKey: 'kano-life-player-vehicle-v1',
      autoSave: true,
    });

    this.ensureVehicle();
  }

  // ==========================================================
  // SAFE CALLBACKS
  // ==========================================================

  _emitUpdate(payload = {}) {
    try {
      this.onUpdate({
        ...payload,
        snapshot: this.snapshot(),
      });
    } catch (error) {
      console.warn(
        '[Kano Life] Workshop update callback failed:',
        error,
      );
    }
  }

  _message(message) {
    try {
      this.onMessage(String(message));
    } catch (error) {
      console.warn(
        '[Kano Life] Workshop message callback failed:',
        error,
      );
    }
  }

  // ==========================================================
  // PLAYER VEHICLE
  // ==========================================================

  ensureVehicle() {
    let vehicle = this.lifecycle.getVehicle(
      this.vehicleId,
    );

    if (!vehicle) {
      vehicle = this.lifecycle.createVehicle({
        id: this.vehicleId,
        type: 'keke',
        name: 'Player Adaidaita Sahu',
        parts: this.partsFromGame(),
      });
    } else {
      this.syncLifecycleFromGame();
      vehicle = this.lifecycle.getVehicle(
        this.vehicleId,
      );
    }

    return vehicle;
  }

  // ==========================================================
  // READ GAME HEALTH
  //
  // The current game state exposes:
  // s.engine, s.tyres, s.condition and s.heat.
  //
  // Since the game may not expose individual brake,
  // suspension, body and cooling health, those values are
  // derived conservatively from the available game fields.
  // ==========================================================

  partsFromGame() {
    const state = this.game?.s || {};

    const engine = clamp(
      safeNumber(state.engine, 100),
      0,
      100,
    );

    const tyres = clamp(
      safeNumber(state.tyres, 100),
      0,
      100,
    );

    const condition = clamp(
      safeNumber(state.condition, 100),
      0,
      100,
    );

    const heat = clamp(
      safeNumber(state.heat, 0),
      0,
      100,
    );

    return {
      engine: {
        health: engine,
      },

      tyres: {
        health: tyres,
      },

      suspension: {
        health: condition,
      },

      brakes: {
        health: condition,
      },

      body: {
        health: condition,
      },

      cooling: {
        health: clamp(
          100 - heat * 0.25,
          0,
          100,
        ),
      },
    };
  }

  // ==========================================================
  // SYNCHRONISE GAME HEALTH INTO LIFECYCLE
  //
  // Requires syncPartHealth() in
  // KanoVehicleLifecycleDirector.js.
  //
  // This records the actual health values. It does not call
  // recordImpact(), because doing so would apply extra damage.
  // ==========================================================

  syncLifecycleFromGame() {
    if (this._syncing) {
      return this.lifecycle.getVehicle(
        this.vehicleId,
      );
    }

    let vehicle = this.lifecycle.getVehicle(
      this.vehicleId,
    );

    if (!vehicle) {
      return this.lifecycle.createVehicle({
        id: this.vehicleId,
        type: 'keke',
        name: 'Player Adaidaita Sahu',
        parts: this.partsFromGame(),
      });
    }

    this._syncing = true;

    try {
      const incoming = this.partsFromGame();

      const result = this.lifecycle.syncPartHealth({
        vehicleId: this.vehicleId,
        parts: incoming,
      });

      vehicle = result?.vehicle ||
        this.lifecycle.getVehicle(
          this.vehicleId,
        );

      this._lastSyncAt = Date.now();

      return vehicle;
    } catch (error) {
      console.warn(
        '[Kano Life] Vehicle health synchronisation failed:',
        error,
      );

      return this.lifecycle.getVehicle(
        this.vehicleId,
      );
    } finally {
      this._syncing = false;
    }
  }

  // ==========================================================
  // BALANCE
  // ==========================================================

  getBalance() {
    return Math.max(
      0,
      safeNumber(save.money, 0),
    );
  }

  // ==========================================================
  // SNAPSHOT FOR THE WORKSHOP UI
  // ==========================================================

  snapshot() {
    const vehicle = this.lifecycle.getVehicle(
      this.vehicleId,
    );

    let repairQuote = null;

    if (vehicle) {
      try {
        repairQuote = this.lifecycle.calculateRepair(
          this.vehicleId,
        );
      } catch (_) {
        repairQuote = null;
      }
    }

    return {
      balance: this.getBalance(),

      vehicle,

      workshops: this.workshop.listWorkshops(),

      jobs: this.workshop.listJobs({
        vehicleId: this.vehicleId,
      }),

      recoveryCalls: this.workshop.listRecoveryCalls({
        vehicleId: this.vehicleId,
      }),

      repairQuote,
    };
  }

  // ==========================================================
  // REPAIR QUOTE
  // ==========================================================

  quoteLifecycleRepair({
    parts,
    workshop = true,
    includeService = false,
  } = {}) {
    this.syncLifecycleFromGame();

    return this.lifecycle.calculateRepair(
      this.vehicleId,
      {
        parts,
        workshop,
        includeService,
      },
    );
  }

  // ==========================================================
  // PAY FOR VEHICLE REPAIRS
  //
  // Payment comes from save.money, not run score.
  // ==========================================================

  payLifecycleRepair({
    parts,
    workshop = true,
    includeService = false,
  } = {}) {
    this.syncLifecycleFromGame();

    const quote = this.lifecycle.calculateRepair(
      this.vehicleId,
      {
        parts,
        workshop,
        includeService,
      },
    );

    if (
      !quote.items.length ||
      quote.total <= 0
    ) {
      return {
        ok: false,
        reason: 'no_repair_needed',
        quote,
      };
    }

    const balance = this.getBalance();

    if (balance < quote.total) {
      return {
        ok: false,
        reason: 'insufficient_funds',
        quote,
        balance,
        shortfall: quote.total - balance,
      };
    }

    if (typeof globalThis.confirm !== 'function') {
      return {
        ok: false,
        reason: 'confirmation_unavailable',
        quote,
        balance,
      };
    }

    const itemLines = quote.items
      .map(
        (item) =>
          `${item.part}: ${formatMoney(item.cost)}`,
      )
      .join('\n');

    const confirmed = globalThis.confirm(
      `Confirm keke repair?\n\n` +
      `${itemLines}\n\n` +
      `Total: ${formatMoney(quote.total)}\n` +
      `Banked balance: ${formatMoney(balance)}`,
    );

    if (!confirmed) {
      return {
        ok: false,
        reason: 'cancelled',
        quote,
        balance,
      };
    }

    // Preserve the existing banked balance for rollback.
    const previousBalance = balance;

    save.money = balance - quote.total;

    try {
      const result = this.lifecycle.repair({
        vehicleId: this.vehicleId,
        parts,
        workshop,
        includeService,
        paymentConfirmed: true,
      });

      // Apply the repaired component health to gameplay.
      this.applyVehicleToGame(result.vehicle);

      // Persist the wallet after the repair succeeds.
      persist();

      this._message(
        `Repair completed. ${formatMoney(quote.total)} paid.`,
      );

      this._emitUpdate({
        type: 'repair_paid',
        result,
      });

      return {
        ok: true,
        ...result,
        balance: this.getBalance(),
      };
    } catch (error) {
      // Restore the balance if repair processing fails.
      save.money = previousBalance;

      try {
        persist();
      } catch (_) {
        // Preserve the original repair error.
      }

      return {
        ok: false,
        reason: 'repair_failed',
        message: String(
          error?.message || error,
        ),
        quote,
        balance: previousBalance,
      };
    }
  }

  // ==========================================================
  // APPLY LIFECYCLE HEALTH TO GAMEPLAY
  // ==========================================================

  applyVehicleToGame(vehicle) {
    if (!vehicle || !this.game?.s) {
      return false;
    }

    const state = this.game.s;
    const parts = vehicle.parts || {};

    if (parts.engine) {
      state.engine = clamp(
        safeNumber(parts.engine.health, 100),
        0,
        100,
      );
    }

    if (parts.tyres) {
      state.tyres = clamp(
        safeNumber(parts.tyres.health, 100),
        0,
        100,
      );
    }

    const conditionParts = [
      parts.body,
      parts.suspension,
      parts.brakes,
    ]
      .filter(Boolean)
      .map((part) =>
        clamp(
          safeNumber(part.health, 100),
          0,
          100,
        ),
      );

    if (conditionParts.length > 0) {
      state.condition = Math.min(
        ...conditionParts,
      );
    }

    // Convert engine temperature to the game's heat scale.
    state.heat = clamp(
      (
        safeNumber(vehicle.temperature, 82) -
        82
      ) * 2,
      0,
      100,
    );

    if (vehicle.breakdown) {
      state.engine = Math.min(
        safeNumber(state.engine, 100),
        18,
      );
    }

    try {
      this.game.syncSignedSpeed?.();

      this.game.ui?.update?.(
        state,
        this.game.route,
        this.game.driver,
      );
    } catch (error) {
      console.warn(
        '[Kano Life] Could not refresh vehicle UI:',
        error,
      );
    }

    return true;
  }

  // ==========================================================
  // WORKSHOP REPAIR QUOTE
  // ==========================================================

  quoteWorkshopRepair({
    workshopId,
    component = 'engine',
    severity = 0.5,
    urgency = 'normal',
    roadside = false,
  } = {}) {
    const mappedComponent =
      COMPONENT_MAP[component] || component;

    return this.workshop.quoteRepair({
      workshopId,
      vehicleId: this.vehicleId,
      component: mappedComponent,
      severity,
      urgency,
      roadside,
    });
  }

  // ==========================================================
  // BOOK A WORKSHOP REPAIR
  //
  // This method prepares a quote/job only.
  // It does not deduct money.
  // ==========================================================

  bookWorkshopRepair(
    quote,
    {
      paymentConfirmed = false,
    } = {},
  ) {
    if (!quote) {
      return {
        ok: false,
        reason: 'missing_quote',
      };
    }

    if (!paymentConfirmed) {
      return {
        ok: false,
        reason: 'payment_not_confirmed',
      };
    }

    return this.workshop.bookRepair(
      quote,
      {
        paymentConfirmed: true,
      },
    );
  }

  // ==========================================================
  // REQUEST ROADSIDE RECOVERY
  // ==========================================================

  requestRecovery({
    severity = 'breakdown',
    location = 'Kano roadside',
    distanceKm = 3,
  } = {}) {
    return this.workshop.requestRecovery({
      vehicleId: this.vehicleId,
      severity,
      location,
      distanceKm,

      timeOfDay:
        this.game?.s?.gameClockMinutes != null
          ? this.game.s.gameClockMinutes / 60
          : 12,
    });
  }

  // ==========================================================
  // PAY FOR ROADSIDE RECOVERY
  // ==========================================================

  payRecovery(callId) {
    const calls = this.workshop.listRecoveryCalls({
      vehicleId: this.vehicleId,
    });

    const call = calls.find(
      (item) => item.id === callId,
    );

    if (
      !call ||
      call.status !== 'awaiting_confirmation'
    ) {
      return {
        ok: false,
        reason: 'recovery_not_payable',
      };
    }

    const balance = this.getBalance();
    const fee = Math.max(
      0,
      safeNumber(call.fee, 0),
    );

    if (balance < fee) {
      return {
        ok: false,
        reason: 'insufficient_funds',
        balance,
        fee,
        shortfall: fee - balance,
      };
    }

    if (typeof globalThis.confirm !== 'function') {
      return {
        ok: false,
        reason: 'confirmation_unavailable',
      };
    }

    const confirmed = globalThis.confirm(
      `Dispatch recovery to ${call.location}?\n\n` +
      `Fee: ${formatMoney(fee)}\n` +
      `Estimated arrival: ${call.etaMinutes} minutes\n` +
      `Banked balance: ${formatMoney(balance)}`,
    );

    if (!confirmed) {
      return {
        ok: false,
        reason: 'cancelled',
      };
    }

    const previousBalance = balance;

    const reference =
      `KANO-RECOVERY-${call.id}`;

    save.money = balance - fee;

    try {
      const result =
        this.workshop.confirmRecoveryPayment(
          call.id,
          reference,
        );

      if (!result || result.ok === false) {
        throw new Error(
          result?.reason ||
          'Could not dispatch recovery.',
        );
      }

      persist();

      this._emitUpdate({
        type: 'recovery_paid',
        result,
      });

      this._message(
        `Recovery dispatched. Estimated arrival: ${call.etaMinutes} minutes.`,
      );

      return {
        ok: true,
        ...result,
        balance: this.getBalance(),
      };
    } catch (error) {
      save.money = previousBalance;

      try {
        persist();
      } catch (_) {
        // Preserve the original error.
      }

      return {
        ok: false,
        reason: 'recovery_payment_failed',
        message: String(
          error?.message || error,
        ),
        balance: previousBalance,
      };
    }
  }

  // ==========================================================
  // WORKSHOP AND RECOVERY STATUS
  // ==========================================================

  getWorkshopStatus() {
    return {
      workshops: this.workshop.listWorkshops(),

      jobs: this.workshop.listJobs({
        vehicleId: this.vehicleId,
      }),

      recoveryCalls: this.workshop.listRecoveryCalls({
        vehicleId: this.vehicleId,
      }),
    };
  }

  // ==========================================================
  // CLEANUP
  // ==========================================================

  destroy() {
    this._syncing = false;
    this.onUpdate = () => {};
    this.onMessage = () => {};
  }
}

export default KanoWorkshopWalletBridge;