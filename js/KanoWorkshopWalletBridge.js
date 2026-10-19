/**
 * KANO LIFE — WORKSHOP WALLET BRIDGE
 *
 * Responsibilities:
 * - Connects the active Game instance to vehicle lifecycle systems.
 * - Uses save.money and persist() for banked funds.
 * - Synchronises game vehicle health without inventing damage.
 * - Quotes and processes lifecycle repairs.
 * - Quotes workshop jobs and manages roadside recovery.
 * - Requires explicit confirmation before charging the player.
 * - Protects wallet consistency when operations fail.
 * - Supports clean disposal.
 *
 * Does not render, move, or directly simulate vehicles.
 */

import { save, persist } from './storage.js';

import {
  KanoWorkshopRecoveryDirector,
} from './KanoWorkshopRecoveryDirector.js';

import {
  KanoVehicleLifecycleDirector,
} from './KanoVehicleLifecycleDirector.js';

// ============================================================
// CONFIGURATION
// ============================================================

const VEHICLE_ID = 'player-keke';

const RECOVERY_STORAGE_KEY =
  'kano-life-workshop-recovery-v1';

const LIFECYCLE_STORAGE_KEY =
  'kano-life-player-vehicle-v1';

const COMPONENT_MAP = Object.freeze({
  tyre: 'tyres',
  tyres: 'tyres',
  engine: 'engine',
  cooling: 'cooling',
  brakes: 'brakes',
  suspension: 'suspension',
  electrical: 'body',
  body: 'body',
});

const COMPONENT_NAMES = Object.freeze({
  engine: 'Engine',
  tyres: 'Tyres',
  cooling: 'Cooling system',
  brakes: 'Brakes',
  suspension: 'Suspension',
  body: 'Body',
});

const clamp = (value, min, max) =>
  Math.min(max, Math.max(min, value));

const safeNumber = (value, fallback = 0) => {
  if (
    value === null ||
    value === undefined ||
    value === ''
  ) {
    return fallback;
  }

  const parsed = Number(value);

  return Number.isFinite(parsed)
    ? parsed
    : fallback;
};

const formatMoney = (amount) =>
  `₦${Math.round(
    Math.max(0, safeNumber(amount, 0)),
  ).toLocaleString('en-NG')}`;

const normaliseHealth = (value, fallback = 100) =>
  clamp(safeNumber(value, fallback), 0, 100);

const normaliseComponent = (component) => {
  const key = String(component || '')
    .trim()
    .toLowerCase();

  return COMPONENT_MAP[key] || key;
};

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

    this.vehicleId = VEHICLE_ID;

    this._syncing = false;
    this._destroyed = false;
    this._lastSyncAt = 0;
    this._lastError = null;

    this.workshop = new KanoWorkshopRecoveryDirector({
      storageKey: RECOVERY_STORAGE_KEY,

      onEvent: (event) => {
        if (this._destroyed) return;

        this._emitUpdate({
          type: 'workshop_event',
          event,
        });
      },
    });

    this.lifecycle = new KanoVehicleLifecycleDirector({
      storageKey: LIFECYCLE_STORAGE_KEY,
      autoSave: true,
    });

    this.ensureVehicle();
  }

  // ==========================================================
  // LIFECYCLE GUARDS
  // ==========================================================

  _assertActive() {
    if (this._destroyed) {
      throw new Error(
        'KanoWorkshopWalletBridge has been destroyed.',
      );
    }
  }

  _emitUpdate(payload = {}) {
    if (this._destroyed) return;

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
    if (this._destroyed) return;

    try {
      this.onMessage(String(message));
    } catch (error) {
      console.warn(
        '[Kano Life] Workshop message callback failed:',
        error,
      );
    }
  }

  _failure(reason, extra = {}) {
    return {
      ok: false,
      reason,
      ...extra,
    };
  }

  // ==========================================================
  // PLAYER VEHICLE
  // ==========================================================

  ensureVehicle() {
    this._assertActive();

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
      vehicle = this.syncLifecycleFromGame() || vehicle;
    }

    return vehicle;
  }

  getVehicle() {
    this._assertActive();

    return this.lifecycle.getVehicle(
      this.vehicleId,
    );
  }

  // ==========================================================
  // READ GAME HEALTH
  //
  // Known game fields:
  // - game.s.engine
  // - game.s.tyres
  // - game.s.condition
  // - game.s.heat
  //
  // Missing component-specific values are estimated from the
  // general condition field. The estimates are not presented
  // as independently measured component damage.
  // ==========================================================

  partsFromGame() {
    const state = this.game?.s || {};

    const engine = normaliseHealth(state.engine);
    const tyres = normaliseHealth(state.tyres);
    const condition = normaliseHealth(state.condition);

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
        health: clamp(100 - heat * 0.25, 0, 100),
      },
    };
  }

  // ==========================================================
  // SYNCHRONISE GAME HEALTH INTO LIFECYCLE
  //
  // Requires lifecycle.syncPartHealth().
  // Does not call recordImpact(), because the game already
  // calculates its own damage.
  // ==========================================================

  syncLifecycleFromGame() {
    if (this._destroyed) return null;

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

    if (
      typeof this.lifecycle.syncPartHealth !== 'function'
    ) {
      this._lastError =
        'Lifecycle director is missing syncPartHealth().';

      console.warn(
        `[Kano Life] ${this._lastError}`,
      );

      return vehicle;
    }

    this._syncing = true;

    try {
      const result = this.lifecycle.syncPartHealth({
        vehicleId: this.vehicleId,
        parts: this.partsFromGame(),
      });

      vehicle = result?.vehicle ||
        this.lifecycle.getVehicle(this.vehicleId);

      this._lastSyncAt = Date.now();
      this._lastError = null;

      return vehicle;
    } catch (error) {
      this._lastError = String(
        error?.message || error,
      );

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
  // BANKED WALLET
  // ==========================================================

  getBalance() {
    return Math.max(
      0,
      safeNumber(save.money, 0),
    );
  }

  _setBalance(amount) {
    save.money = Math.max(
      0,
      safeNumber(amount, 0),
    );
  }

  _persistWallet() {
    persist();
  }

  /**
   * Runs a wallet transaction.
   *
   * The operation must return successfully before the wallet
   * change is considered complete. If persistence fails, the
   * previous in-memory balance is restored and persistence
   * is attempted again.
   *
   * Note: this cannot automatically roll back side effects
   * already committed by an external director.
   */
  _chargeWallet(amount, operation) {
    this._assertActive();

    const charge = Math.max(
      0,
      safeNumber(amount, 0),
    );

    const previousBalance = this.getBalance();

    if (previousBalance < charge) {
      return this._failure('insufficient_funds', {
        balance: previousBalance,
        fee: charge,
        shortfall: charge - previousBalance,
      });
    }

    this._setBalance(previousBalance - charge);

    let result;

    try {
      result = operation();

      if (!result || result.ok === false) {
        throw new Error(
          result?.reason || 'Payment operation failed.',
        );
      }

      this._persistWallet();

      return {
        ok: true,
        result,
        balance: this.getBalance(),
      };
    } catch (error) {
      this._setBalance(previousBalance);

      try {
        this._persistWallet();
      } catch (rollbackError) {
        console.error(
          '[Kano Life] Wallet rollback persistence failed:',
          rollbackError,
        );
      }

      return this._failure('payment_failed', {
        message: String(error?.message || error),
        balance: previousBalance,
      });
    }
  }

  _confirmPayment({
    title,
    items = [],
    total,
    balance = this.getBalance(),
    extraLines = [],
  }) {
    if (typeof globalThis.confirm !== 'function') {
      return {
        available: false,
        confirmed: false,
      };
    }

    const itemLines = items.map((item) => {
      const label =
        COMPONENT_NAMES[item.part] ||
        String(item.part || 'Repair');

      return `${label}: ${formatMoney(item.cost)}`;
    });

    const message = [
      title,
      '',
      ...itemLines,
      ...extraLines,
      '',
      `Total: ${formatMoney(total)}`,
      `Banked balance: ${formatMoney(balance)}`,
    ].join('\n');

    return {
      available: true,
      confirmed: globalThis.confirm(message),
    };
  }

  // ==========================================================
  // WORKSHOP SNAPSHOT
  // ==========================================================

  snapshot() {
    if (this._destroyed) {
      return {
        destroyed: true,
        balance: this.getBalance(),
        vehicle: null,
        workshops: [],
        jobs: [],
        recoveryCalls: [],
        repairQuote: null,
      };
    }

    const vehicle = this.lifecycle.getVehicle(
      this.vehicleId,
    );

    let repairQuote = null;

    if (vehicle) {
      try {
        repairQuote = this.lifecycle.calculateRepair(
          this.vehicleId,
        );
      } catch (error) {
        console.warn(
          '[Kano Life] Could not calculate repair quote:',
          error,
        );
      }
    }

    return {
      destroyed: false,
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
      lastSyncAt: this._lastSyncAt,
      lastError: this._lastError,
    };
  }

  // ==========================================================
  // LIFECYCLE REPAIR QUOTE
  // ==========================================================

  quoteLifecycleRepair({
    parts,
    workshop = true,
    includeService = false,
  } = {}) {
    this._assertActive();

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
  // PAY FOR LIFECYCLE REPAIRS
  // ==========================================================

  payLifecycleRepair({
    parts,
    workshop = true,
    includeService = false,
  } = {}) {
    this._assertActive();

    this.syncLifecycleFromGame();

    let quote;

    try {
      quote = this.lifecycle.calculateRepair(
        this.vehicleId,
        {
          parts,
          workshop,
          includeService,
        },
      );
    } catch (error) {
      return this._failure('repair_quote_failed', {
        message: String(error?.message || error),
      });
    }

    if (
      !quote ||
      !Array.isArray(quote.items) ||
      quote.items.length === 0 ||
      safeNumber(quote.total, 0) <= 0
    ) {
      return this._failure('no_repair_needed', {
        quote,
      });
    }

    const balance = this.getBalance();
    const total = safeNumber(quote.total, 0);

    if (balance < total) {
      return this._failure('insufficient_funds', {
        quote,
        balance,
        shortfall: total - balance,
      });
    }

    const confirmation = this._confirmPayment({
      title: 'Confirm keke repair?',
      items: quote.items,
      total,
      balance,
    });

    if (!confirmation.available) {
      return this._failure(
        'confirmation_unavailable',
        { quote, balance },
      );
    }

    if (!confirmation.confirmed) {
      return this._failure('cancelled', {
        quote,
        balance,
      });
    }

    const transaction = this._chargeWallet(
      total,
      () => {
        const result = this.lifecycle.repair({
          vehicleId: this.vehicleId,
          parts,
          workshop,
          includeService,
          paymentConfirmed: true,
        });

        if (!result || result.ok === false) {
          throw new Error(
            result?.reason || 'Lifecycle repair failed.',
          );
        }

        const repairedVehicle =
          result.vehicle ||
          this.lifecycle.getVehicle(this.vehicleId);

        if (!repairedVehicle) {
          throw new Error(
            'Repair completed without a retrievable vehicle record.',
          );
        }

        this.applyVehicleToGame(repairedVehicle);

        return {
          ...result,
          vehicle: repairedVehicle,
        };
      },
    );

    if (!transaction.ok) {
      return {
        ...transaction,
        reason: 'repair_payment_failed',
        quote,
      };
    }

    this._message(
      `Repair completed. ${formatMoney(total)} paid.`,
    );

    this._emitUpdate({
      type: 'repair_paid',
      result: transaction.result,
    });

    return {
      ok: true,
      ...transaction.result,
      balance: this.getBalance(),
      quote,
    };
  }

  // ==========================================================
  // APPLY LIFECYCLE HEALTH TO GAMEPLAY
  // ==========================================================

  applyVehicleToGame(vehicle) {
    if (this._destroyed || !vehicle || !this.game?.s) {
      return false;
    }

    const state = this.game.s;
    const parts = vehicle.parts || {};

    if (parts.engine) {
      state.engine = normaliseHealth(
        parts.engine.health,
      );
    }

    if (parts.tyres) {
      state.tyres = normaliseHealth(
        parts.tyres.health,
      );
    }

    const conditionParts = [
      parts.body,
      parts.suspension,
      parts.brakes,
    ]
      .filter(Boolean)
      .map((part) =>
        normaliseHealth(part.health),
      );

    if (conditionParts.length > 0) {
      state.condition = Math.min(
        ...conditionParts,
      );
    }

    // Preserve a valid game heat value unless the lifecycle
    // record exposes a finite temperature.
    if (
      Number.isFinite(Number(vehicle.temperature))
    ) {
      state.heat = clamp(
        (Number(vehicle.temperature) - 82) * 2,
        0,
        100,
      );
    }

    if (vehicle.breakdown) {
      state.engine = Math.min(
        normaliseHealth(state.engine),
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
    this._assertActive();

    return this.workshop.quoteRepair({
      workshopId,
      vehicleId: this.vehicleId,
      component: normaliseComponent(component),
      severity: clamp(
        safeNumber(severity, 0.5),
        0,
        1,
      ),
      urgency,
      roadside: Boolean(roadside),
    });
  }

  // ==========================================================
  // BOOK WORKSHOP REPAIR
  //
  // Booking alone does not deduct money. The calling UI must
  // complete its own payment flow before booking.
  // ==========================================================

  bookWorkshopRepair(
    quote,
    {
      paymentConfirmed = false,
    } = {},
  ) {
    this._assertActive();

    if (!quote) {
      return this._failure('missing_quote');
    }

    if (!paymentConfirmed) {
      return this._failure('payment_not_confirmed');
    }

    return this.workshop.bookRepair(
      quote,
      {
        paymentConfirmed: true,
      },
    );
  }

  // ==========================================================
  // ROADSIDE RECOVERY REQUEST
  // ==========================================================

  requestRecovery({
    severity = 'breakdown',
    location = 'Kano roadside',
    distanceKm = 3,
  } = {}) {
    this._assertActive();

    return this.workshop.requestRecovery({
      vehicleId: this.vehicleId,
      severity,
      location,
      distanceKm: Math.max(
        0,
        safeNumber(distanceKm, 3),
      ),
      timeOfDay:
        this.game?.s?.gameClockMinutes != null
          ? safeNumber(
              this.game.s.gameClockMinutes,
              720,
            ) / 60
          : 12,
    });
  }

  // ==========================================================
  // PAY FOR ROADSIDE RECOVERY
  // ==========================================================

  payRecovery(callId) {
    this._assertActive();

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
      return this._failure('recovery_not_payable');
    }

    const balance = this.getBalance();
    const fee = Math.max(
      0,
      safeNumber(call.fee, 0),
    );

    if (balance < fee) {
      return this._failure('insufficient_funds', {
        balance,
        fee,
        shortfall: fee - balance,
      });
    }

    const confirmation = this._confirmPayment({
      title: `Dispatch recovery to ${call.location || 'your location'}?`,
      total: fee,
      balance,
      extraLines: [
        `Estimated arrival: ${safeNumber(call.etaMinutes, 0)} minutes`,
      ],
    });

    if (!confirmation.available) {
      return this._failure(
        'confirmation_unavailable',
      );
    }

    if (!confirmation.confirmed) {
      return this._failure('cancelled');
    }

    const reference = `KANO-RECOVERY-${call.id}`;

    const transaction = this._chargeWallet(
      fee,
      () => {
        const result =
          this.workshop.confirmRecoveryPayment(
            call.id,
            reference,
          );

        if (!result || result.ok === false) {
          throw new Error(
            result?.reason ||
            'Could not confirm recovery payment.',
          );
        }

        return result;
      },
    );

    if (!transaction.ok) {
      return {
        ...transaction,
        reason: 'recovery_payment_failed',
      };
    }

    this._emitUpdate({
      type: 'recovery_paid',
      result: transaction.result,
    });

    this._message(
      `Recovery dispatched. Estimated arrival: ${safeNumber(call.etaMinutes, 0)} minutes.`,
    );

    return {
      ok: true,
      ...transaction.result,
      balance: this.getBalance(),
    };
  }

  // ==========================================================
  // WORKSHOP AND RECOVERY STATUS
  // ==========================================================

  getWorkshopStatus() {
    this._assertActive();

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
    if (this._destroyed) return;

    this._destroyed = true;
    this._syncing = false;

    this.onUpdate = () => {};
    this.onMessage = () => {};

    try {
      this.workshop.dispose?.();
    } catch (error) {
      console.warn(
        '[Kano Life] Recovery director cleanup failed:',
        error,
      );
    }

    try {
      this.lifecycle.dispose?.();
    } catch (error) {
      console.warn(
        '[Kano Life] Vehicle lifecycle cleanup failed:',
        error,
      );
    }

    this.game = null;
  }
}

export default KanoWorkshopWalletBridge;