// ============================================================
// KANO LIFE — WORKSHOP WALLET BRIDGE
// File: js/KanoWorkshopWalletBridge.js
//
// Connects the active game, vehicle lifecycle, workshops,
// roadside recovery, and the player's existing wallet.
//
// Responsibilities:
// - Keep the existing game wallet as the source of funds.
// - Require explicit confirmation before charging.
// - Coordinate repair and recovery payments.
// - Synchronise vehicle condition without treating estimated
//   condition values as independently measured damage.
// - Guard against duplicate payment operations.
// - Report persistence failures instead of silently ignoring
//   them.
// ============================================================

import { save, persist } from './storage.js';

import KanoWorkshopRecoveryDirector from './KanoWorkshopRecoveryDirector.js';
import KanoVehicleLifecycleDirector from './KanoVehicleLifecycleDirector.js';

const VEHICLE_ID = 'player-keke';

const RECOVERY_STORAGE_KEY =
  'kano-life-workshop-recovery-v1';

const LIFECYCLE_STORAGE_KEY =
  'kano-life-player-vehicle-v1';

const COMPONENT_MAP = Object.freeze({
  tyre: 'tyre',
  tyres: 'tyre',
  engine: 'engine',
  cooling: 'cooling',
  brakes: 'brakes',
  suspension: 'suspension',
  electrical: 'electrical',
  body: 'body',
});

const COMPONENT_NAMES = Object.freeze({
  tyre: 'Tyre / tube',
  tyres: 'Tyre / tube',
  engine: 'Engine',
  cooling: 'Cooling system',
  brakes: 'Brakes',
  suspension: 'Suspension',
  electrical: 'Electrical system',
  body: 'Bodywork',
});

const clamp = (value, min, max) =>
  Math.min(max, Math.max(min, Number(value) || 0));

const money = (value) =>
  Math.max(0, Math.round(Number(value) || 0));

const clone = (value) => {
  if (value == null) return value;

  try {
    return JSON.parse(JSON.stringify(value));
  } catch {
    return value;
  }
};

const normaliseComponent = (component) => {
  const key = String(component || '')
    .trim()
    .toLowerCase();

  return COMPONENT_MAP[key] || null;
};

const makePaymentReference = (operation) =>
  `KANO-${operation}-${Date.now().toString(36)}-${Math.random()
    .toString(36)
    .slice(2, 8)}`;

export class KanoWorkshopWalletBridge {
  constructor({ game, onUpdate } = {}) {
    this.game = game || null;

    this.onUpdate =
      typeof onUpdate === 'function'
        ? onUpdate
        : () => {};

    this.destroyed = false;
    this.busyOperations = new Set();
    this.lastError = null;
    this.lastSyncAt = null;
    this.lastTransaction = null;

    this.workshop = new KanoWorkshopRecoveryDirector({
      storageKey: RECOVERY_STORAGE_KEY,
      onEvent: (event) => {
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
    this.syncLifecycleFromGame();
  }

  // ----------------------------------------------------------
  // Basic state and event helpers
  // ----------------------------------------------------------

  _assertActive() {
    if (this.destroyed) {
      throw new Error(
        'KanoWorkshopWalletBridge has been destroyed.',
      );
    }
  }

  _emitUpdate(detail = {}) {
    if (this.destroyed) return;

    try {
      this.onUpdate({
        ...detail,
        snapshot: this.snapshot(),
      });
    } catch (error) {
      console.error(
        '[KanoWorkshopWalletBridge] Update callback failed:',
        error,
      );
    }
  }

  _setError(error) {
    this.lastError = String(
      error?.message || error || 'Unknown workshop error.',
    );

    this._emitUpdate({
      type: 'error',
      message: this.lastError,
    });
  }

  _beginOperation(key) {
    this._assertActive();

    if (this.busyOperations.has(key)) {
      return false;
    }

    this.busyOperations.add(key);
    return true;
  }

  _endOperation(key) {
    this.busyOperations.delete(key);
  }

  // ----------------------------------------------------------
  // Vehicle lifecycle
  // ----------------------------------------------------------

  ensureVehicle() {
    this._assertActive();

    const existing = this.lifecycle.getVehicle?.(VEHICLE_ID);

    if (existing) {
      return existing;
    }

    if (typeof this.lifecycle.createVehicle === 'function') {
      return this.lifecycle.createVehicle({
        id: VEHICLE_ID,
        type: 'adaidaita-sahu',
        name: 'Player Keke',
      });
    }

    return this.lifecycle.getVehicle?.(VEHICLE_ID) || null;
  }

  getVehicle() {
    this._assertActive();

    return this.lifecycle.getVehicle?.(VEHICLE_ID) || null;
  }

  // ----------------------------------------------------------
  // Game health readings
  // ----------------------------------------------------------

  partsFromGame() {
    this._assertActive();

    const state = this.game?.s || {};

    const engine = clamp(state.engine ?? 100, 0, 100);
    const tyres = clamp(state.tyres ?? 100, 0, 100);
    const condition = clamp(state.condition ?? 100, 0, 100);
    const heat = clamp(state.heat ?? 0, 0, 100);

    // These are estimates based on aggregate game state.
    // They are not independent damage measurements.
    return {
      engine,
      tyre: tyres,
      cooling: clamp(100 - heat, 0, 100),
      brakes: condition,
      suspension: condition,
      electrical: condition,
      body: condition,
    };
  }

  syncLifecycleFromGame({ force = false } = {}) {
    this._assertActive();

    const vehicle = this.getVehicle();

    if (!vehicle) {
      return {
        ok: false,
        reason: 'vehicle_not_found',
      };
    }

    if (!this.game?.s) {
      return {
        ok: true,
        skipped: true,
        reason: 'game_state_unavailable',
      };
    }

    const readings = this.partsFromGame();
    const currentParts = vehicle.parts || {};

    const hasRecordedPartDamage = Object.values(currentParts).some(
      (part) => {
        const health =
          typeof part === 'number'
            ? part
            : Number(part?.health);

        return Number.isFinite(health) && health < 99;
      },
    );

    // Do not overwrite existing, more granular lifecycle damage
    // with aggregate condition estimates during routine updates.
    if (hasRecordedPartDamage && !force) {
      this.lastSyncAt = Date.now();

      return {
        ok: true,
        skipped: true,
        reason: 'preserving_lifecycle_part_health',
      };
    }

    const result = this.lifecycle.syncPartHealth({
      vehicleId: VEHICLE_ID,
      parts: readings,
    });

    this.lastSyncAt = Date.now();

    return {
      ok: true,
      result,
      parts: readings,
      estimated: true,
      at: this.lastSyncAt,
    };
  }

  // ----------------------------------------------------------
  // Wallet
  // ----------------------------------------------------------

  getBalance() {
    const value = Number(save?.money);

    return Number.isFinite(value)
      ? Math.max(0, Math.floor(value))
      : 0;
  }

  async _persistWallet() {
    if (typeof persist !== 'function') {
      throw new Error('Wallet persistence is unavailable.');
    }

    await persist();

    return true;
  }

  async _chargeWallet(amount, operation) {
    this._assertActive();

    const cost = money(amount);

    if (cost <= 0) {
      return {
        ok: false,
        reason: 'invalid_amount',
      };
    }

    const balanceBefore = this.getBalance();

    if (balanceBefore < cost) {
      return {
        ok: false,
        reason: 'insufficient_funds',
        required: cost,
        balance: balanceBefore,
      };
    }

    const moneyBefore = save.money;

    try {
      save.money = balanceBefore - cost;

      await this._persistWallet();

      let operationResult;

      try {
        operationResult = await operation();
      } catch (error) {
        throw error;
      }

      if (!operationResult?.ok) {
        throw new Error(
          operationResult?.reason ||
            'The workshop operation was not accepted.',
        );
      }

      this.lastTransaction = {
        amount: cost,
        balanceBefore,
        balanceAfter: this.getBalance(),
        at: Date.now(),
        status: 'completed',
      };

      this.lastError = null;

      this._emitUpdate({
        type: 'wallet_transaction_completed',
        transaction: this.lastTransaction,
      });

      return {
        ok: true,
        result: operationResult,
        balance: this.getBalance(),
        transaction: { ...this.lastTransaction },
      };
    } catch (error) {
      // Restore the in-memory wallet and try to persist the
      // rollback. The caller must also reverse its own pending
      // workshop state when the director has already changed it.
      save.money = moneyBefore;

      let rollbackPersisted = false;

      try {
        await this._persistWallet();
        rollbackPersisted = true;
      } catch (rollbackError) {
        console.error(
          '[KanoWorkshopWalletBridge] Wallet rollback persistence failed:',
          rollbackError,
        );
      }

      this.lastTransaction = {
        amount: cost,
        balanceBefore,
        balanceAfter: this.getBalance(),
        at: Date.now(),
        status: 'failed',
        rollbackPersisted,
      };

      this._setError(error);

      return {
        ok: false,
        reason: 'transaction_failed',
        message: String(error?.message || error),
        balance: this.getBalance(),
        rollbackPersisted,
      };
    }
  }

  _confirmPayment({ title, amount, description }) {
    if (typeof globalThis.confirm !== 'function') {
      return false;
    }

    const formatted = money(amount).toLocaleString('en-NG');

    return globalThis.confirm(
      `${title}\n\n${description}\n\n` +
        `Amount: ₦${formatted}\n` +
        `Available balance: ₦${this.getBalance().toLocaleString('en-NG')}\n\n` +
        'Confirm payment?',
    );
  }

  // ----------------------------------------------------------
  // Repair quotations
  // ----------------------------------------------------------

  quoteWorkshopRepair({
    component,
    workshopId,
    severity = 0.5,
    urgency = 'normal',
    roadside = false,
  } = {}) {
    this._assertActive();

    const normalized = normaliseComponent(component);

    if (!normalized) {
      return {
        ok: false,
        reason: 'unknown_component',
      };
    }

    const workshops = this.workshop.listWorkshops({
      openOnly: true,
    });

    const selectedWorkshop =
      workshopId ||
      workshops
        .sort((a, b) => b.quality - a.quality)[0]?.id;

    if (!selectedWorkshop) {
      return {
        ok: false,
        reason: 'no_workshop_available',
      };
    }

    return this.workshop.quoteRepair({
      workshopId: selectedWorkshop,
      vehicleId: VEHICLE_ID,
      component: normalized,
      severity,
      urgency,
      roadside,
    });
  }

  // ----------------------------------------------------------
  // Lifecycle repair
  // ----------------------------------------------------------

  async payLifecycleRepair({
    parts,
    workshop = true,
    includeService = false,
  } = {}) {
    this._assertActive();

    const operationKey = 'lifecycle-repair';

    if (!this._beginOperation(operationKey)) {
      return {
        ok: false,
        reason: 'operation_in_progress',
      };
    }

    try {
      this.syncLifecycleFromGame();

      const quote = this.lifecycle.calculateRepair(
        VEHICLE_ID,
        {
          parts,
          workshop,
          includeService,
        },
      );

      if (!quote || !Array.isArray(quote.items)) {
        return {
          ok: false,
          reason: 'invalid_repair_quote',
        };
      }

      if (quote.items.length === 0 || money(quote.total) <= 0) {
        return {
          ok: true,
          reason: 'no_repair_needed',
          quote,
          balance: this.getBalance(),
        };
      }

      const confirmed = this._confirmPayment({
        title: 'KANO LIFE — VEHICLE REPAIR',
        amount: quote.total,
        description:
          `Repair ${quote.items.length} vehicle item(s) at the workshop.`,
      });

      if (!confirmed) {
        return {
          ok: false,
          reason: 'payment_cancelled',
          quote,
          balance: this.getBalance(),
        };
      }

      const transaction = await this._chargeWallet(
        quote.total,
        async () => {
          const result = this.lifecycle.repair({
            vehicleId: VEHICLE_ID,
            parts,
            workshop,
            includeService,
            paymentConfirmed: true,
          });

          if (!result?.ok) {
            return {
              ok: false,
              reason: result?.reason || 'repair_failed',
            };
          }

          return result;
        },
      );

      if (!transaction.ok) {
        return {
          ok: false,
          reason: transaction.reason,
          message: transaction.message,
          quote,
          balance: this.getBalance(),
        };
      }

      this.applyVehicleToGame(transaction.result.vehicle);

      this._emitUpdate({
        type: 'lifecycle_repair_completed',
        result: transaction.result,
      });

      return {
        ok: true,
        ...transaction.result,
        quote,
        balance: this.getBalance(),
      };
    } catch (error) {
      this._setError(error);

      return {
        ok: false,
        reason: 'repair_error',
        message: String(error?.message || error),
      };
    } finally {
      this._endOperation(operationKey);
    }
  }

  // ----------------------------------------------------------
  // Workshop repair booking
  // ----------------------------------------------------------

  async bookWorkshopRepair(
    quote,
    { paymentConfirmed = false } = {},
  ) {
    this._assertActive();

    if (!quote?.ok) {
      return {
        ok: false,
        reason: 'invalid_quote',
      };
    }

    const operationKey = `workshop-repair-${quote.quoteId}`;

    if (!this._beginOperation(operationKey)) {
      return {
        ok: false,
        reason: 'operation_in_progress',
      };
    }

    try {
      const amount = money(quote.totalCost);

      if (!paymentConfirmed) {
        return this.workshop.bookRepair(quote, {
          paymentConfirmed: false,
        });
      }

      const confirmed = this._confirmPayment({
        title: 'KANO LIFE — WORKSHOP BOOKING',
        amount,
        description:
          `Pay ${quote.workshopName} for ${quote.componentLabel}.`,
      });

      if (!confirmed) {
        return {
          ok: false,
          reason: 'payment_cancelled',
        };
      }

      const reference = makePaymentReference('REPAIR');

      return await this._chargeWallet(amount, async () => {
        const booking = this.workshop.bookRepair(quote, {
          paymentConfirmed: true,
          paymentReference: reference,
        });

        if (!booking?.ok) {
          return {
            ok: false,
            reason: booking?.reason || 'booking_failed',
          };
        }

        if (booking.persisted === false) {
          return {
            ok: false,
            reason: 'workshop_persistence_failed',
          };
        }

        return booking;
      });
    } catch (error) {
      this._setError(error);

      return {
        ok: false,
        reason: 'booking_error',
        message: String(error?.message || error),
      };
    } finally {
      this._endOperation(operationKey);
    }
  }

  // ----------------------------------------------------------
  // Roadside recovery request
  // ----------------------------------------------------------

  requestRecovery({
    severity = 'breakdown',
    location = 'Kano roadside',
    distanceKm = 3,
  } = {}) {
    this._assertActive();

    const result = this.workshop.requestRecovery({
      vehicleId: VEHICLE_ID,
      location,
      severity,
      distanceKm,
      timeOfDay: new Date().getHours(),
    });

    if (!result?.ok) {
      this.lastError = result?.reason || 'recovery_request_failed';
      return result;
    }

    this._emitUpdate({
      type: 'recovery_requested',
      call: result.call,
    });

    return result;
  }

  // ----------------------------------------------------------
  // Roadside recovery payment
  // ----------------------------------------------------------

  async payRecovery(callId) {
    this._assertActive();

    const call = this.workshop
      .listRecoveryCalls({ vehicleId: VEHICLE_ID })
      .find((item) => item.id === String(callId));

    if (!call) {
      return {
        ok: false,
        reason: 'recovery_not_found',
      };
    }

    if (call.status !== 'awaiting_confirmation') {
      return {
        ok: false,
        reason: 'invalid_recovery_state',
        status: call.status,
      };
    }

    const operationKey = `recovery-${call.id}`;

    if (!this._beginOperation(operationKey)) {
      return {
        ok: false,
        reason: 'operation_in_progress',
      };
    }

    try {
      const confirmed = this._confirmPayment({
        title: 'KANO LIFE — ROADSIDE RECOVERY',
        amount: call.fee,
        description:
          `${call.workshopName} will dispatch assistance to ${call.location}.`,
      });

      if (!confirmed) {
        return {
          ok: false,
          reason: 'payment_cancelled',
          call,
          balance: this.getBalance(),
        };
      }

      const reference = makePaymentReference('RECOVERY');

      const transaction = await this._chargeWallet(
        call.fee,
        async () => {
          const result = this.workshop.confirmRecoveryPayment(
            call.id,
            reference,
          );

          if (!result?.ok) {
            return {
              ok: false,
              reason: result?.reason || 'recovery_dispatch_failed',
            };
          }

          if (result.persisted === false) {
            // Restore the pending state in memory. This is a
            // best-effort rollback because browser storage and
            // wallet persistence are not a single atomic system.
            call.status = 'awaiting_confirmation';
            delete call.paymentReference;
            delete call.dispatchedAt;

            this.workshop.save();

            return {
              ok: false,
              reason: 'recovery_persistence_failed',
            };
          }

          return result;
        },
      );

      if (!transaction.ok) {
        return {
          ok: false,
          reason: transaction.reason,
          message: transaction.message,
          call: this.workshop.getRecoveryCall(call.id),
          balance: this.getBalance(),
        };
      }

      const updatedCall = transaction.result.call;

      this._emitUpdate({
        type: 'recovery_dispatched',
        call: updatedCall,
      });

      return {
        ok: true,
        call: updatedCall,
        balance: this.getBalance(),
        transaction: transaction.transaction,
      };
    } catch (error) {
      this._setError(error);

      return {
        ok: false,
        reason: 'recovery_payment_error',
        message: String(error?.message || error),
      };
    } finally {
      this._endOperation(operationKey);
    }
  }

  // ----------------------------------------------------------
  // Apply lifecycle health to the active game
  // ----------------------------------------------------------

  applyVehicleToGame(vehicle = this.getVehicle()) {
    this._assertActive();

    if (!vehicle || !this.game?.s) {
      return {
        ok: false,
        reason: 'game_or_vehicle_unavailable',
      };
    }

    const state = this.game.s;
    const parts = vehicle.parts || {};

    const readHealth = (key, fallback) => {
      const item = parts[key];

      const value =
        typeof item === 'number'
          ? item
          : Number(item?.health);

      return Number.isFinite(value)
        ? clamp(value, 0, 100)
        : fallback;
    };

    state.engine = readHealth('engine', state.engine ?? 100);
    state.tyres = readHealth(
      'tyre',
      readHealth('tyres', state.tyres ?? 100),
    );

    const conditionParts = [
      readHealth('body', state.condition ?? 100),
      readHealth('suspension', state.condition ?? 100),
      readHealth('brakes', state.condition ?? 100),
    ];

    state.condition = Math.min(...conditionParts);

    if (vehicle.breakdown) {
      state.engine = Math.min(state.engine, 18);
    }

    try {
      this.game.refreshUI?.();
      this.game.updateHUD?.();
      this.game.renderHUD?.();
    } catch (error) {
      console.warn(
        '[KanoWorkshopWalletBridge] Game UI refresh failed:',
        error,
      );
    }

    this._emitUpdate({
      type: 'vehicle_applied_to_game',
      vehicle,
    });

    return {
      ok: true,
      vehicle,
    };
  }

  // ----------------------------------------------------------
  // Snapshot for the workshop panel
  // ----------------------------------------------------------

  snapshot() {
    if (this.destroyed) {
      return {
        destroyed: true,
        balance: 0,
        vehicle: null,
        workshops: [],
        jobs: [],
        recoveryCalls: [],
        repairQuote: null,
        lastSyncAt: this.lastSyncAt,
        lastError: this.lastError,
        lastTransaction: clone(this.lastTransaction),
      };
    }

    let vehicle = null;

    try {
      vehicle = this.getVehicle();
    } catch {
      vehicle = null;
    }

    return {
      destroyed: false,
      balance: this.getBalance(),
      vehicle: clone(vehicle),
      workshops: this.workshop.listWorkshops({
        openOnly: false,
      }),
      jobs: this.workshop.listJobs({
        vehicleId: VEHICLE_ID,
      }),
      recoveryCalls: this.workshop.listRecoveryCalls({
        vehicleId: VEHICLE_ID,
      }),
      repairQuote: null,
      lastSyncAt: this.lastSyncAt,
      lastError: this.lastError,
      lastTransaction: clone(this.lastTransaction),
      busy: [...this.busyOperations],
    };
  }

  // ----------------------------------------------------------
  // Cleanup
  // ----------------------------------------------------------

  destroy() {
    if (this.destroyed) return;

    this.destroyed = true;

    try {
      this.workshop?.dispose?.();
    } catch (error) {
      console.warn(
        '[KanoWorkshopWalletBridge] Workshop disposal failed:',
        error,
      );
    }

    try {
      this.lifecycle?.dispose?.();
    } catch (error) {
      console.warn(
        '[KanoWorkshopWalletBridge] Lifecycle disposal failed:',
        error,
      );
    }

    this.game = null;
    this.onUpdate = () => {};
    this.busyOperations.clear();
  }
}

export default KanoWorkshopWalletBridge;