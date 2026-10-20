// ============================================================
// KANO LIFE — WORKSHOP WALLET BRIDGE
// File: js/KanoWorkshopWalletBridge.js
//
// Connects the active game, vehicle lifecycle, workshops,
// roadside recovery, and the player's existing wallet.
//
// Transaction safeguards:
// - The existing game wallet remains the source of funds.
// - Payment requires explicit player confirmation.
// - Wallet persistence must succeed before an operation runs.
// - Failed operations restore wallet and director snapshots
//   where the directors support state import/export.
// - Failed director persistence triggers compensation.
// - Duplicate payment operations are guarded.
// - Estimated game-condition readings do not overwrite
//   granular lifecycle damage during routine synchronisation.
// ============================================================

import { save, persist } from './storage.js';

import KanoWorkshopRecoveryDirector from './KanoWorkshopRecoveryDirector.js';
import KanoVehicleLifecycleDirector from './KanoVehicleLifecycleDirector.js';

const VEHICLE_ID = 'player-keke';

const RECOVERY_STORAGE_KEY = 'kano-life-workshop-recovery-v1';
const LIFECYCLE_STORAGE_KEY = 'kano-life-player-vehicle-v1';

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
  const key = String(component || '').trim().toLowerCase();
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
      typeof onUpdate === 'function' ? onUpdate : () => {};

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

    if (this.busyOperations.has(key)) return false;

    this.busyOperations.add(key);
    return true;
  }

  _endOperation(key) {
    this.busyOperations.delete(key);
  }

  // ----------------------------------------------------------
  // Director snapshots and compensation
  // ----------------------------------------------------------

  _captureDirectorState(director) {
    if (
      !director ||
      typeof director.exportState !== 'function'
    ) {
      return {
        supported: false,
        state: null,
      };
    }

    try {
      return {
        supported: true,
        state: clone(director.exportState()),
      };
    } catch (error) {
      console.warn(
        '[KanoWorkshopWalletBridge] Could not capture director state:',
        error,
      );

      return {
        supported: false,
        state: null,
      };
    }
  }

  _restoreDirectorState(director, snapshot) {
    if (
      !director ||
      !snapshot?.supported ||
      typeof director.importState !== 'function'
    ) {
      return {
        ok: false,
        reason: 'director_snapshot_restore_unavailable',
      };
    }

    try {
      const restored = director.importState(
        clone(snapshot.state),
      );

      if (restored?.ok === false) {
        return {
          ok: false,
          reason: restored.reason || 'director_restore_rejected',
        };
      }

      if (typeof director.save === 'function') {
        const saved = director.save();

        if (saved === false) {
          return {
            ok: false,
            reason: 'director_rollback_persistence_failed',
          };
        }
      }

      return {
        ok: true,
      };
    } catch (error) {
      console.error(
        '[KanoWorkshopWalletBridge] Director rollback failed:',
        error,
      );

      return {
        ok: false,
        reason: String(error?.message || error),
      };
    }
  }

  async _rollbackTransaction({
    director,
    directorSnapshot,
    walletMoneyBefore,
  }) {
    let directorRollback = {
      ok: true,
      skipped: true,
    };

    if (directorSnapshot?.supported) {
      directorRollback = this._restoreDirectorState(
        director,
        directorSnapshot,
      );
    }

    save.money = walletMoneyBefore;

    let walletRollbackPersisted = false;

    try {
      walletRollbackPersisted = this._persistWallet();
    } catch (error) {
      console.error(
        '[KanoWorkshopWalletBridge] Wallet rollback persistence failed:',
        error,
      );
    }

    return {
      walletRollbackPersisted,
      directorRollback,
      rollbackComplete:
        walletRollbackPersisted && directorRollback.ok,
    };
  }

  // ----------------------------------------------------------
  // Vehicle lifecycle
  // ----------------------------------------------------------

  ensureVehicle() {
    this._assertActive();

    const existing = this.lifecycle.getVehicle?.(VEHICLE_ID);

    if (existing) return existing;

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

    // These values are aggregate estimates, not independent
    // measurements of every component.
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

    if (hasRecordedPartDamage && !force) {
      this.lastSyncAt = Date.now();

      return {
        ok: true,
        skipped: true,
        reason: 'preserving_lifecycle_part_health',
      };
    }

    const before = this._captureDirectorState(this.lifecycle);

    const result = this.lifecycle.syncPartHealth({
      vehicleId: VEHICLE_ID,
      parts: readings,
    });

    if (!result?.ok) {
      if (before.supported) {
        this._restoreDirectorState(this.lifecycle, before);
      }

      return {
        ok: false,
        reason: result?.reason || 'lifecycle_sync_failed',
        result,
      };
    }

    if (result.persisted === false) {
      const rollback = before.supported
        ? this._restoreDirectorState(this.lifecycle, before)
        : {
            ok: false,
            reason: 'director_snapshot_restore_unavailable',
          };

      this.lastError = 'Vehicle condition could not be saved.';

      return {
        ok: false,
        reason: 'lifecycle_persistence_failed',
        rollback,
      };
    }

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

  _persistWallet() {
    if (typeof persist !== 'function') {
      throw new Error('Wallet persistence is unavailable.');
    }

    const result = persist();

    if (result === false) {
      throw new Error('Wallet could not be saved.');
    }

    return true;
  }

  async _chargeWallet(
    amount,
    operation,
    {
      director = null,
      directorSnapshot = null,
    } = {},
  ) {
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

      // Do not execute a paid operation if the debit cannot
      // be persisted.
      this._persistWallet();

      const operationResult = await operation();

      if (!operationResult?.ok) {
        throw new Error(
          operationResult?.reason ||
            'The workshop operation was not accepted.',
        );
      }

      if (operationResult.persisted === false) {
        throw new Error(
          operationResult.reason ||
            'The workshop operation could not be saved.',
        );
      }

      this.lastTransaction = {
        amount: cost,
        balanceBefore,
        balanceAfter: this.getBalance(),
        at: Date.now(),
        status: 'completed',
        reference: operationResult.paymentReference || null,
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
      const rollback = await this._rollbackTransaction({
        director,
        directorSnapshot,
        walletMoneyBefore: moneyBefore,
      });

      this.lastTransaction = {
        amount: cost,
        balanceBefore,
        balanceAfter: this.getBalance(),
        at: Date.now(),
        status: 'failed',
        rollbackPersisted: rollback.walletRollbackPersisted,
        rollbackComplete: rollback.rollbackComplete,
        directorRollback: rollback.directorRollback,
      };

      const failure = new Error(
        String(error?.message || error),
      );

      failure.rollback = rollback;

      this._setError(failure);

      return {
        ok: false,
        reason: 'transaction_failed',
        message: failure.message,
        balance: this.getBalance(),
        rollbackPersisted: rollback.walletRollbackPersisted,
        rollbackComplete: rollback.rollbackComplete,
        directorRollback: rollback.directorRollback,
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
      [...workshops].sort((a, b) => b.quality - a.quality)[0]?.id;

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
      const sync = this.syncLifecycleFromGame();

      if (!sync.ok) {
        return {
          ok: false,
          reason: sync.reason || 'lifecycle_sync_failed',
        };
      }

      const quote = this.lifecycle.calculateRepair(VEHICLE_ID, {
        parts,
        workshop,
        includeService,
      });

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

      const lifecycleSnapshot =
        this._captureDirectorState(this.lifecycle);

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

          if (result.persisted === false) {
            return {
              ok: false,
              reason: 'lifecycle_persistence_failed',
            };
          }

          return result;
        },
        {
          director: this.lifecycle,
          directorSnapshot: lifecycleSnapshot,
        },
      );

      if (!transaction.ok) {
        return {
          ok: false,
          reason: transaction.reason,
          message: transaction.message,
          rollbackComplete: transaction.rollbackComplete,
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
      if (!paymentConfirmed) {
        return this.workshop.bookRepair(quote, {
          paymentConfirmed: false,
        });
      }

      const amount = money(quote.totalCost);

      if (amount <= 0) {
        return {
          ok: false,
          reason: 'invalid_amount',
        };
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

      const workshopSnapshot =
        this._captureDirectorState(this.workshop);

      const reference = makePaymentReference('REPAIR');

      const transaction = await this._chargeWallet(
        amount,
        async () => {
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

          return {
            ...booking,
            paymentReference: reference,
          };
        },
        {
          director: this.workshop,
          directorSnapshot: workshopSnapshot,
        },
      );

      if (!transaction.ok) {
        return transaction;
      }

      this._emitUpdate({
        type: 'workshop_repair_booked',
        booking: transaction.result,
      });

      return transaction;
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

    const operationKey = 'recovery-request';

    if (!this._beginOperation(operationKey)) {
      return {
        ok: false,
        reason: 'operation_in_progress',
      };
    }

    try {
      const snapshot = this._captureDirectorState(this.workshop);

      const result = this.workshop.requestRecovery({
        vehicleId: VEHICLE_ID,
        location,
        severity,
        distanceKm,
        timeOfDay: new Date().getHours(),
      });

      if (!result?.ok || result.persisted === false) {
        if (snapshot.supported) {
          this._restoreDirectorState(this.workshop, snapshot);
        }

        const failure = {
          ok: false,
          reason: result?.reason ||
            'recovery_request_persistence_failed',
        };

        this.lastError = failure.reason;
        return failure;
      }

      this._emitUpdate({
        type: 'recovery_requested',
        call: result.call,
      });

      return result;
    } catch (error) {
      this._setError(error);

      return {
        ok: false,
        reason: 'recovery_request_error',
        message: String(error?.message || error),
      };
    } finally {
      this._endOperation(operationKey);
    }
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

      const workshopSnapshot =
        this._captureDirectorState(this.workshop);

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
            return {
              ok: false,
              reason: 'recovery_persistence_failed',
            };
          }

          return {
            ...result,
            paymentReference: reference,
          };
        },
        {
          director: this.workshop,
          directorSnapshot: workshopSnapshot,
        },
      );

      if (!transaction.ok) {
        return {
          ok: false,
          reason: transaction.reason,
          message: transaction.message,
          rollbackComplete: transaction.rollbackComplete,
          call: this.workshop.getRecoveryCall?.(call.id) || null,
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
        busy: [],
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