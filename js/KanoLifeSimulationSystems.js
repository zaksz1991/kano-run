/**
 * KANO LIFE — Simulation Systems Facade
 * Coordinates the additive fare, daily-rhythm, and fuel-queue directors.
 * The host game remains authoritative for UI, game clock, wallet, vehicle fuel,
 * vehicle movement, and passenger lifecycle. This facade never mutates those.
 */
import { KanoFareHagglingDirector } from './KanoFareHagglingDirector.js';
import { KanoDailyRhythmDirector } from './KanoDailyRhythmDirector.js';
import { KanoFuelQueueDirector } from './KanoFuelQueueDirector.js';

const clamp = (n, min, max) => Math.min(max, Math.max(min, Number(n) || 0));

export class KanoLifeSimulationSystems {
  constructor(options = {}) {
    this.fares = new KanoFareHagglingDirector(options.fares);
    this.rhythm = new KanoDailyRhythmDirector(options.rhythm);
    this.fuel = new KanoFuelQueueDirector(options.fuel);
    this.worldState = null;
    this.listeners = new Set();
    this.unsubscribers = [
      this.fares.onChange(event => this._emit('fare', event)),
    ];
  }

  onChange(listener) {
    if (typeof listener !== 'function') throw new TypeError('listener must be a function');
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /** Feed this from the in-game clock; never uses the device's wall clock. */
  updateWorld({ weekday, time, location = 'road', demand = 0.5 } = {}) {
    const result = this.rhythm.evaluate({ weekday, time, location, demand });
    if (!result.ok) return result;
    this.worldState = result;
    this.fares.options.demandMultiplier = clamp(result.effects.passengerDemandMultiplier / (result.marketDay ? 1.24 : 1), 0.6, 2.5);
    this.fares.options.marketDayMultiplier = result.marketDay ? 1.24 : 1;
    this._emit('world_state', result);
    return result;
  }

  /** Quote/negotiation receives the current simulation factors unless overridden. */
  startPassengerNegotiation(input = {}) {
    const world = this.worldState;
    const enriched = {
      ...input,
      demandMultiplier: input.demandMultiplier ?? (world ? world.effects.passengerDemandMultiplier / (world.marketDay ? 1.24 : 1) : undefined),
      marketDayMultiplier: input.marketDayMultiplier ?? (world?.marketDay ? 1.24 : 1),
      timeMultiplier: input.timeMultiplier ?? (world?.fridayJummah ? 0.92 : 1),
    };
    return this.fares.startNegotiation(enriched);
  }

  quotePassengerFare(input = {}) {
    const world = this.worldState;
    return this.fares.quoteFare({
      ...input,
      demandMultiplier: input.demandMultiplier ?? (world ? world.effects.passengerDemandMultiplier / (world.marketDay ? 1.24 : 1) : undefined),
      marketDayMultiplier: input.marketDayMultiplier ?? (world?.marketDay ? 1.24 : 1),
      timeMultiplier: input.timeMultiplier ?? (world?.fridayJummah ? 0.92 : 1),
    });
  }

  /** Thin wrappers make station operations observable without moving vehicles. */
  joinFuelQueue(vehicle) { return this._fuelAction('fuel_queue_joined', () => this.fuel.joinQueue(vehicle)); }
  leaveFuelQueue(vehicleId) { return this._fuelAction('fuel_queue_left', () => this.fuel.leaveQueue(vehicleId)); }
  startFuelService() { return this._fuelAction('fuel_service_started', () => this.fuel.startNext()); }
  tickFuelStation(minutes) { return this._fuelAction('fuel_station_tick', () => this.fuel.tick(minutes)); }

  async settlePassengerFare(passengerId, walletCommit) {
    const result = await this.fares.settle(passengerId, walletCommit);
    this._emit('fare_settlement', result);
    return result;
  }

  async settleFuel(vehicleId, walletPayment) {
    const result = await this.fuel.settle(vehicleId, walletPayment);
    this._emit('fuel_settlement', result);
    return result;
  }

  snapshot() {
    return {
      world: this.worldState ? structuredCloneSafe(this.worldState) : null,
      activeNegotiations: this.fares.getActive(),
      fuelStation: this.fuel.snapshot(),
    };
  }

  destroy() {
    for (const unsubscribe of this.unsubscribers) unsubscribe();
    this.unsubscribers = [];
    this.listeners.clear();
  }

  _fuelAction(type, action) {
    const result = action();
    this._emit(type, result);
    return result;
  }

  _emit(type, detail) {
    const event = { type, detail };
    for (const listener of this.listeners) {
      try { listener(event); } catch (_) { /* listener errors must not break simulation */ }
    }
    return event;
  }
}

function structuredCloneSafe(value) {
  return JSON.parse(JSON.stringify(value));
}

export default KanoLifeSimulationSystems;
