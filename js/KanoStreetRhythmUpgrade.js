/**
 * KANO LIFE — STREET RHYTHM RUNTIME INTEGRATION
 *
 * Reconciles only the number of background traffic records. Game movement,
 * vehicle selection, collisions, road physics, renderer and traffic AI stay
 * authoritative. Extra vehicles are removed from the farthest depth first;
 * added traffic is paced out to avoid a sudden burst when rush hour begins.
 */
import { Game } from './game.js';
import { streetDensity, targetTrafficCount } from './KanoStreetRhythm.js';

const PATCH_KEY = Symbol.for('kano.life.streetRhythm.v1');
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

function dayCycleFor(game) {
  return game?.dayCycle
    || game?.s?.dayCycle
    || (typeof window !== 'undefined' ? window.kanoDayCycle : null)
    || null;
}

function rhythmSnapshot(game) {
  const cycle = dayCycleFor(game);
  const state = cycle?.state || {};
  let modifiers = {};

  try {
    modifiers = cycle?.modifiers?.() || {};
  } catch (_) {
    modifiers = {};
  }

  const dayValue = Number(state.day);
  const minuteValue = Number(state.minuteOfDay);
  const day = Number.isFinite(dayValue) && dayValue >= 1 ? Math.floor(dayValue) : 1;
  const minuteOfDay = Number.isFinite(minuteValue) ? minuteValue : 7 * 60;
  const periodDensity = Number.isFinite(Number(modifiers.trafficDensity))
    ? Number(modifiers.trafficDensity)
    : 1;
  const density = streetDensity({ periodDensity, minuteOfDay, day });
  const mobile = Boolean(game?.mobile);
  const baseCount = mobile ? 5 : 8;
  const target = targetTrafficCount({
    mobile,
    baseCount,
    periodDensity,
    minuteOfDay,
    day,
    density,
  });

  return {
    day,
    minuteOfDay,
    periodDensity,
    density,
    mobile,
    baseCount,
    target,
    isFriday: day % 7 === 5,
    isJumuahWindow: day % 7 === 5
      && minuteOfDay >= 13 * 60
      && minuteOfDay < 14 * 60 + 15,
  };
}

function farthestTrafficIndex(traffic) {
  let result = -1;
  let farthestScore = -1;
  for (let index = 0; index < traffic.length; index += 1) {
    const depth = Number(traffic[index]?.depth);
    const score = Number.isFinite(depth) ? Math.abs(depth - 0.022) : Infinity;
    if (score > farthestScore) {
      farthestScore = score;
      result = index;
    }
  }
  return result;
}

function removeFarthestTraffic(game) {
  const traffic = game?.s?.traffic;
  if (!Array.isArray(traffic) || !traffic.length) return false;
  const index = farthestTrafficIndex(traffic);
  if (index < 0) return false;
  traffic.splice(index, 1);
  return true;
}

function reconcileImmediately(game) {
  const traffic = game?.s?.traffic;
  if (!Array.isArray(traffic)) return;

  const target = rhythmSnapshot(game).target;
  let guard = 0;
  while (traffic.length > target && guard < 16) {
    if (!removeFarthestTraffic(game)) break;
    guard += 1;
  }

  // At morning/evening rush, the target can exceed the game's baseline pool.
  // Use the existing spawn method so its traffic-mix and AI wrappers still run.
  guard = 0;
  while (traffic.length < target && guard < 8 && typeof game.spawnTraffic === 'function') {
    const before = traffic.length;
    try {
      game.spawnTraffic();
    } catch (error) {
      console.warn('[Kano street rhythm] Could not add a traffic actor; keeping the current pool.', error);
      break;
    }
    if (traffic.length <= before) break;
    guard += 1;
  }

  game._kanoStreetRhythmLastTarget = target;
  game._kanoStreetRhythmElapsed = 0;
}

if (!Game.prototype[PATCH_KEY]) {
  Object.defineProperty(Game.prototype, PATCH_KEY, {
    value: true,
    enumerable: false,
    configurable: false,
    writable: false,
  });

  const originalSpawnInitial = Game.prototype.spawnInitial;
  const originalMoveTraffic = Game.prototype.moveTraffic;

  if (typeof originalSpawnInitial === 'function') {
    Game.prototype.spawnInitial = function spawnInitialWithStreetRhythm(...args) {
      const result = originalSpawnInitial.apply(this, args);
      try {
        reconcileImmediately(this);
      } catch (error) {
        console.warn('[Kano street rhythm] Initial traffic balancing was skipped safely.', error);
      }
      return result;
    };
  }

  if (typeof originalMoveTraffic === 'function') {
    Game.prototype.moveTraffic = function moveTrafficWithStreetRhythm(dt, ...args) {
      const result = originalMoveTraffic.call(this, dt, ...args);
      try {
        const traffic = this.s?.traffic;
        if (!Array.isArray(traffic)) return result;

        const snapshot = rhythmSnapshot(this);
        const elapsedStep = clamp(Number(dt) || 0, 0, 0.25);
        this._kanoStreetRhythmElapsed = Math.min(
          10,
          (Number(this._kanoStreetRhythmElapsed) || 0) + elapsedStep,
        );

        const poolIsTooLarge = traffic.length > snapshot.target;
        const poolIsTooSmall = traffic.length < snapshot.target;
        const interval = poolIsTooLarge
          ? 1.9
          : snapshot.mobile ? 3.1 : 2.0;

        if (this._kanoStreetRhythmElapsed >= interval) {
          if (poolIsTooLarge) {
            removeFarthestTraffic(this);
          } else if (poolIsTooSmall && typeof this.spawnTraffic === 'function') {
            const before = traffic.length;
            this.spawnTraffic();
            // If a spawn wrapper declines to add a vehicle, don't retry every frame.
            if (traffic.length === before) {
              this._kanoStreetRhythmElapsed = interval * 0.6;
            }
          }
          this._kanoStreetRhythmElapsed = 0;
        }

        this._kanoStreetRhythmLastTarget = snapshot.target;
        this._kanoStreetRhythmLastDensity = snapshot.density;
      } catch (error) {
        console.warn('[Kano street rhythm] Runtime balancing was skipped safely.', error);
      }
      return result;
    };
  }

  Game.prototype.getKanoStreetRhythmSnapshot = function getKanoStreetRhythmSnapshot() {
    const snapshot = rhythmSnapshot(this);
    return {
      ...snapshot,
      actualTraffic: Array.isArray(this.s?.traffic) ? this.s.traffic.length : 0,
      elapsedSinceBalance: Number((this._kanoStreetRhythmElapsed || 0).toFixed(2)),
    };
  };
}

if (typeof window !== 'undefined') {
  window.kanoStreetRhythmVersion = '1.0.0';
}

console.info('[Kano Life] Day-cycle street rhythm registered (rush hours, quieter late night, and a simplified Friday Jumu’ah window).');
