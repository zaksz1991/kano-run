/**
 * KANO LIFE — PASSENGER DEMAND & FARE RHYTHM RUNTIME INTEGRATION
 *
 * Additive Game.prototype wrappers only. It leaves main.js, game.js, renderer,
 * collision methods, and the wallet implementation untouched.
 */
import { Game } from './game.js';
import {
  effectiveFareAdjustment,
  passengerDemandProfile,
  promoteEmptyDropToPickup,
} from './KanoPassengerDemandRhythm.js';

const PATCH_KEY = Symbol.for('kano.life.passengerDemandRhythm.v1');
const DAY_FARE_MULTIPLIER_DEFAULT = 1;

function clockFor(game) {
  const cycle = game?.dayCycle
    || game?.s?.dayCycle
    || (typeof window !== 'undefined' ? window.kanoDayCycle : null)
    || null;
  const state = cycle?.state || {};
  const fallbackMinute = Number(game?.s?.gameClockMinutes);
  let minuteOfDay = Number(state.minuteOfDay);
  if (!Number.isFinite(minuteOfDay)) {
    minuteOfDay = Number.isFinite(fallbackMinute) ? fallbackMinute : 7 * 60;
  }
  const dayValue = Number(state.day);
  const day = Number.isFinite(dayValue) && dayValue >= 1 ? Math.floor(dayValue) : 1;
  let modifiers = {};
  try {
    modifiers = cycle?.modifiers?.() || {};
  } catch (_) {
    modifiers = {};
  }
  const modifierFare = Number(modifiers.fareMultiplier);
  const hasCycleFare = Number.isFinite(modifierFare);
  return {
    day,
    minuteOfDay,
    cycle,
    hasCycleFare,
    fareMultiplier: hasCycleFare ? modifierFare : DAY_FARE_MULTIPLIER_DEFAULT,
    source: hasCycleFare ? 'KanoDayCycle' : 'game-clock-fallback',
  };
}

function profileFor(game) {
  const clock = clockFor(game);
  const profile = passengerDemandProfile({
    day: clock.day,
    minuteOfDay: clock.minuteOfDay,
    periodFareMultiplier: clock.hasCycleFare ? clock.fareMultiplier : undefined,
  });
  return { ...profile, source: clock.source };
}

function promoteNewZone(game, beforeLength) {
  const zones = game?.s?.zones;
  if (!Array.isArray(zones) || zones.length <= beforeLength) return;
  const index = zones.length - 1;
  const zone = zones[index];
  if (!zone || zone.kanoDemandAdjusted) return;

  const profile = profileFor(game);
  const promoted = promoteEmptyDropToPickup(zone, {
    passengerCount: game.s?.passengers?.length || 0,
    environment: game.s?.environment || 'clear',
    pickupBias: profile.pickupBias,
    roll: Math.random(),
  });
  if (promoted) {
    Object.assign(zone, promoted);
    zone.kanoDemandPeriod = profile.period;
  }
  if (zone && !zone.kanoDemandPeriod) zone.kanoDemandPeriod = profile.period;
}

if (!Game.prototype[PATCH_KEY]) {
  Object.defineProperty(Game.prototype, PATCH_KEY, {
    value: true,
    enumerable: false,
    configurable: false,
    writable: false,
  });

  const originalSpawnZone = Game.prototype.spawnZone;
  const originalPickup = Game.prototype.pickup;

  if (typeof originalSpawnZone === 'function') {
    Game.prototype.spawnZone = function spawnZoneWithPassengerDemand(...args) {
      const beforeLength = Array.isArray(this.s?.zones) ? this.s.zones.length : 0;
      const result = originalSpawnZone.apply(this, args);
      try {
        promoteNewZone(this, beforeLength);
      } catch (error) {
        console.warn('[Kano passenger demand] Zone adjustment skipped safely.', error);
      }
      return result;
    };
  }

  if (typeof originalPickup === 'function') {
    Game.prototype.pickup = function pickupWithDemandFare(...args) {
      const stateBefore = this.s;
      const beforeLength = Array.isArray(stateBefore?.passengers) ? stateBefore.passengers.length : 0;
      const result = originalPickup.apply(this, args);
      try {
        const state = this.s;
        const passengers = state?.passengers;
        if (result !== false && Array.isArray(passengers) && passengers.length > beforeLength) {
          // The existing pickup path creates one passenger record per pickup.
          // Marking the record guarantees the multiplier is never applied twice.
          const passenger = passengers[passengers.length - 1];
          if (passenger && !passenger.kanoDemandFareApplied) {
            const profile = profileFor(this);
            const rawFare = Math.max(0, Math.floor(Number(passenger.fare) || 0));
            const adjustment = effectiveFareAdjustment(
              profile.fareMultiplier,
              Boolean(state.night),
            );
            const adjustedFare = Math.max(0, Math.floor(rawFare * adjustment));
            passenger.fare = adjustedFare;
            passenger.kanoDemandFareApplied = true;
            passenger.kanoDemandFare = {
              day: profile.day,
              minuteOfDay: profile.minuteOfDay,
              period: profile.period,
              source: profile.source,
              cycleFareMultiplier: profile.fareMultiplier,
              adjustment,
              rawFare,
              adjustedFare,
            };
          }
        }
      } catch (error) {
        // Keep original passenger pickup authoritative if telemetry fails.
        console.warn('[Kano passenger demand] Fare adjustment skipped safely.', error);
      }
      return result;
    };
  }

  Game.prototype.getKanoPassengerDemandSnapshot = function getKanoPassengerDemandSnapshot() {
    const profile = profileFor(this);
    return {
      ...profile,
      onboardPassengers: Array.isArray(this.s?.passengers) ? this.s.passengers.length : 0,
      adjustedZones: Array.isArray(this.s?.zones)
        ? this.s.zones.filter((zone) => zone?.kanoDemandAdjusted).length
        : 0,
    };
  };
}

if (typeof window !== 'undefined') {
  window.kanoPassengerDemandRhythmVersion = '1.0.0';
}

console.info('[Kano Life] Passenger demand follows the in-game clock; existing fares and wallet remain authoritative.');
