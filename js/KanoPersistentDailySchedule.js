/**
 * KANO LIFE — PERSISTENT DAILY SCHEDULE BRIDGE
 *
 * Preserves the simulated world clock across runs and browser sessions,
 * drives the existing World & Life time-of-day bridge, varies the existing
 * instanced market crowd by time-of-day, and schedules one existing life event
 * per in-game day phase in Career / Free Roam.
 *
 * This module is imported by KanoAtmosphere.js before Game instances are made.
 * It does not replace the driving simulation or create a second game loop.
 */
import { Game } from './game.js';
import { save, persist } from './storage.js';
import { KanoSceneUpgrade } from './KanoSceneUpgrade.js';

const DEFAULT_CLOCK_MINUTES = 408; // 06:48, matching the existing game start.
const MINUTES_PER_ACTIVE_SECOND = 1.1; // Retains the existing in-game clock speed.
const CLOCK_DAY = 1440;
const SAVE_INTERVAL_SECONDS = 10;
const MANUAL_CLOCKS = {
  morning: 8 * 60,
  afternoon: 14 * 60,
  evening: 18 * 60,
  night: 22 * 60,
};
const PHASES = new Set(['morning', 'afternoon', 'evening', 'night']);
const GAME_EVENT_FOR_PHASE = {
  morning: 'schoolRun',
  afternoon: 'waterSeller',
  evening: 'weddingLife',
  night: 'goatCrossing',
};

const moduloDay = (value) => ((Number(value) % CLOCK_DAY) + CLOCK_DAY) % CLOCK_DAY;
const clampInteger = (value, fallback, min, max) => {
  const number = Number(value);
  return Number.isFinite(number) ? Math.min(max, Math.max(min, Math.floor(number))) : fallback;
};

function ensureLifestyle() {
  // Mutate the existing object rather than allocating a new one every frame.
  // KanoAtmosphere keeps a reference to this same settings object.
  let life = save.lifestyle;
  if (!life || typeof life !== 'object' || Array.isArray(life)) {
    life = {};
    save.lifestyle = life;
  }
  if (!(['auto', ...PHASES].includes(life.timeOfDay))) life.timeOfDay = 'auto';
  if (!(['hotDry', 'harmattan', 'rainy', 'cool'].includes(life.season))) life.season = 'hotDry';
  const currentTime = Number(life.worldClockMinutes);
  life.worldClockMinutes = Number.isFinite(currentTime) ? moduloDay(currentTime) : DEFAULT_CLOCK_MINUTES;
  const dayNumber = Number(life.worldDayNumber);
  life.worldDayNumber = Number.isFinite(dayNumber) ? clampInteger(dayNumber, 1, 1, 999999) : 1;
  if (!Array.isArray(life.dailyEventHistory)) life.dailyEventHistory = [];
  else {
    if (life.dailyEventHistory.some((entry) => typeof entry !== 'string')) {
      life.dailyEventHistory = life.dailyEventHistory.filter((entry) => typeof entry === 'string');
    }
    if (life.dailyEventHistory.length > 48) life.dailyEventHistory = life.dailyEventHistory.slice(-48);
  }
  return life;
}

function getChoice(bridge) {
  const fromOwner = bridge?.owner?.settings?.timeOfDay;
  const fromSave = save.lifestyle?.timeOfDay;
  const choice = PHASES.has(fromOwner) || fromOwner === 'auto'
    ? fromOwner
    : PHASES.has(fromSave) || fromSave === 'auto'
      ? fromSave
      : 'auto';
  return choice;
}

function phaseForMinutes(minutes) {
  const hour = Math.floor(moduloDay(minutes) / 60);
  if (hour >= 5 && hour < 11) return 'morning';
  if (hour >= 11 && hour < 16) return 'afternoon';
  if (hour >= 16 && hour < 19) return 'evening';
  return 'night';
}

function activePhase(minutes, bridge = null) {
  const choice = getChoice(bridge);
  return choice === 'auto' ? phaseForMinutes(minutes) : choice;
}

function isNight(minutes) {
  const hour = Math.floor(moduloDay(minutes) / 60);
  return hour < 5 || hour >= 19;
}

function defineHidden(target, name, value) {
  try {
    Object.defineProperty(target, name, {
      value,
      writable: true,
      configurable: true,
      enumerable: false,
    });
  } catch {
    target[name] = value;
  }
}

function computeRunTime(state) {
  const life = ensureLifestyle();
  if (!state || !Number.isFinite(Number(state.__kanoScheduleStartMinutes))) {
    const bridge = state?.__kanoClockBridge;
    const minutes = Number.isFinite(Number(bridge?.autoMinutes))
      ? moduloDay(bridge.autoMinutes)
      : Number.isFinite(Number(state?.gameClockMinutes))
        ? moduloDay(state.gameClockMinutes)
        : life.worldClockMinutes;
    return { minutes, dayNumber: life.worldDayNumber, totalMinutes: minutes };
  }

  const start = Number(state.__kanoScheduleStartMinutes);
  const elapsed = Math.max(0, Number(state.elapsed) || 0);
  const totalMinutes = start + elapsed * MINUTES_PER_ACTIVE_SECOND;
  const wrapCount = Math.floor(totalMinutes / CLOCK_DAY);
  const baseDay = clampInteger(state.__kanoScheduleBaseDay, life.worldDayNumber, 1, 999999);
  return {
    minutes: moduloDay(totalMinutes),
    dayNumber: Math.min(999999, baseDay + wrapCount),
    totalMinutes,
  };
}

function persistWorldClock(game, force = false) {
  const state = game?.s;
  const life = ensureLifestyle();
  if (!state) {
    try { persist(); } catch (error) {
      console.warn('[Kano Life] Could not save daily schedule.', error);
    }
    return { minutes: life.worldClockMinutes, dayNumber: life.worldDayNumber };
  }

  const current = computeRunTime(state);
  life.worldClockMinutes = current.minutes;
  life.worldDayNumber = current.dayNumber;
  state.__kanoScheduleClockMinutes = current.minutes;
  state.__kanoScheduleCurrentDay = current.dayNumber;
  const now = Date.now();
  if (!force && now - (Number(state.__kanoScheduleLastSaveAt) || 0) < SAVE_INTERVAL_SECONDS * 1000) {
    return current;
  }
  state.__kanoScheduleLastSaveAt = now;
  save.lifestyle = life;
  try {
    persist();
  } catch (error) {
    console.warn('[Kano Life] Could not persist the world clock.', error);
  }
  return current;
}

function synchronizeClockBridge(state) {
  if (!state) return computeRunTime(state);
  const current = computeRunTime(state);
  const bridge = state.__kanoClockBridge;
  if (bridge && typeof bridge === 'object') {
    bridge.autoMinutes = current.minutes;
    bridge.autoNight = isNight(current.minutes);
  }
  state.__kanoScheduleClockMinutes = current.minutes;
  state.__kanoScheduleCurrentDay = current.dayNumber;
  return current;
}

function installClockBridge(state, startMinutes, baseDay) {
  defineHidden(state, '__kanoScheduleStartMinutes', moduloDay(startMinutes));
  defineHidden(state, '__kanoScheduleBaseDay', clampInteger(baseDay, 1, 1, 999999));
  defineHidden(state, '__kanoScheduleClockMinutes', moduloDay(startMinutes));
  defineHidden(state, '__kanoScheduleCurrentDay', clampInteger(baseDay, 1, 1, 999999));
  defineHidden(state, '__kanoScheduleLastSaveAt', Date.now());

  const bridge = {
    owner: null,
    autoMinutes: moduloDay(startMinutes),
    autoNight: isNight(startMinutes),
    persistentDailySchedule: true,
  };
  try {
    Object.defineProperty(state, '__kanoClockBridge', {
      value: bridge,
      writable: true,
      configurable: true,
      enumerable: false,
    });
    Object.defineProperty(state, 'gameClockMinutes', {
      configurable: true,
      enumerable: true,
      get() {
        const choice = getChoice(bridge);
        if (choice === 'auto') return bridge.autoMinutes;
        return MANUAL_CLOCKS[choice] ?? bridge.autoMinutes;
      },
      set(_incomingValue) {
        // The core game still assigns its historic 06:48-based clock here.
        // Ignore that hard-coded value and calculate from this run's saved start.
        const current = computeRunTime(state);
        bridge.autoMinutes = current.minutes;
        bridge.autoNight = isNight(current.minutes);
        state.__kanoScheduleClockMinutes = current.minutes;
        state.__kanoScheduleCurrentDay = current.dayNumber;
      },
    });
    Object.defineProperty(state, 'night', {
      configurable: true,
      enumerable: true,
      get() {
        const choice = getChoice(bridge);
        return choice === 'auto' ? bridge.autoNight : choice === 'night';
      },
      set(_incomingValue) {
        const current = computeRunTime(state);
        bridge.autoMinutes = current.minutes;
        bridge.autoNight = isNight(current.minutes);
      },
    });
  } catch (error) {
    console.warn('[Kano Life] Persistent clock bridge could not be installed.', error);
    state.gameClockMinutes = moduloDay(startMinutes);
    state.night = isNight(startMinutes);
  }

  const initialPhase = activePhase(startMinutes, bridge);
  defineHidden(state, '__kanoScheduleLastPhase', initialPhase);
  defineHidden(state, '__kanoScheduleLastDay', clampInteger(baseDay, 1, 1, 999999));
  defineHidden(state, '__kanoScheduleLastAnyEventElapsed', -Infinity);
  defineHidden(state, '__kanoScheduleEventElapsed', 0);
}

function dispatch(name, detail) {
  try {
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent(name, { detail }));
    }
  } catch {
    // Optional instrumentation must never interrupt gameplay.
  }
}

function eventForPhase(phase, life) {
  if (phase === 'afternoon') {
    return life.season === 'hotDry' ? 'waterSeller' : 'marketDelivery';
  }
  return GAME_EVENT_FOR_PHASE[phase] || null;
}

function trySchedulePhaseEvent(game, state, current, phase) {
  if (!game || !state || game.state !== 'PLAY' || state.event) return;
  if (!['career', 'freeRoam'].includes(game.mode)) return;
  if ((Number(state.elapsed) || 0) < 25) return;
  if ((Number(state.eventCooldown) || 0) > 0) return;
  if ((Number(state.elapsed) || 0) - (Number(state.__kanoScheduleLastAnyEventElapsed) || 0) < 18) return;

  const life = ensureLifestyle();
  const eventType = eventForPhase(phase, life);
  if (!eventType) return;
  const eventKey = `${current.dayNumber}:${phase}`;
  if (life.dailyEventHistory.includes(eventKey)) return;

  try {
    game.beginEvent(eventType);
    if (game.state !== 'EVENT' || state.event !== eventType) return;
    life.dailyEventHistory.push(eventKey);
    life.dailyEventHistory = life.dailyEventHistory.slice(-48);
    life.lastScheduledLifeEvent = { day: current.dayNumber, phase, type: eventType };
    save.lifestyle = life;
    persistWorldClock(game, true);
    dispatch('kano:scheduled-life-event', {
      day: current.dayNumber,
      phase,
      type: eventType,
      gameClockMinutes: current.minutes,
    });
  } catch (error) {
    console.warn('[Kano Life] Scheduled life event failed safely.', error);
  }
}

function installGamePatches() {
  const proto = Game?.prototype;
  if (!proto || proto.__kanoPersistentDailyScheduleV1) return;

  const originalResetRun = proto.resetRun;
  if (typeof originalResetRun === 'function') {
    proto.resetRun = function resetRunWithPersistentClock(...args) {
      if (this.s) persistWorldClock(this, true);
      const life = ensureLifestyle();
      const startMinutes = moduloDay(life.worldClockMinutes ?? DEFAULT_CLOCK_MINUTES);
      const baseDay = clampInteger(life.worldDayNumber, 1, 1, 999999);
      const result = originalResetRun.apply(this, args);
      if (this.s) {
        installClockBridge(this.s, startMinutes, baseDay);
        if (typeof window !== 'undefined') window.__KANO_DAILY_SCHEDULE_GAME__ = this;
        persistWorldClock(this, true);
      }
      return result;
    };
  }

  const originalBeginEvent = proto.beginEvent;
  if (typeof originalBeginEvent === 'function') {
    proto.beginEvent = function beginEventWithScheduleStamp(...args) {
      const result = originalBeginEvent.apply(this, args);
      if (this.s?.event && this.state === 'EVENT') {
        this.s.__kanoScheduleLastAnyEventElapsed = Number(this.s.elapsed) || 0;
      }
      return result;
    };
  }

  const originalTick = proto.tick;
  if (typeof originalTick === 'function') {
    proto.tick = function tickWithPersistentDailySchedule(deltaSeconds, ...args) {
      const wasActivelyPlaying = this.state === 'PLAY' && !this.s?.event;
      const result = originalTick.call(this, deltaSeconds, ...args);
      const state = this.s;
      if (!state) return result;

      const previousDay = Number(state.__kanoScheduleLastDay) || ensureLifestyle().worldDayNumber;
      const current = synchronizeClockBridge(state);
      const bridge = state.__kanoClockBridge;
      const phase = activePhase(current.minutes, bridge);
      const previousPhase = state.__kanoScheduleLastPhase || phase;

      if (phase !== previousPhase) {
        state.__kanoScheduleLastPhase = phase;
        dispatch('kano:daily-phase-change', {
          day: current.dayNumber,
          from: previousPhase,
          to: phase,
          gameClockMinutes: current.minutes,
        });
      }

      if (current.dayNumber !== previousDay) {
        state.__kanoScheduleLastDay = current.dayNumber;
        persistWorldClock(this, true);
        dispatch('kano:daily-day-change', {
          day: current.dayNumber,
          previousDay,
          gameClockMinutes: current.minutes,
        });
      }

      if (wasActivelyPlaying) {
        state.__kanoScheduleSaveAccumulator = (Number(state.__kanoScheduleSaveAccumulator) || 0) + Math.max(0, Math.min(0.05, Number(deltaSeconds) || 0));
        if (state.__kanoScheduleSaveAccumulator >= SAVE_INTERVAL_SECONDS) {
          state.__kanoScheduleSaveAccumulator = 0;
          persistWorldClock(this, true);
        }
      }

      trySchedulePhaseEvent(this, state, current, phase);
      return result;
    };
  }

  Object.defineProperty(proto, '__kanoPersistentDailyScheduleV1', { value: true });
}

function installCrowdSchedulePatch() {
  const proto = KanoSceneUpgrade?.prototype;
  if (!proto || proto.__kanoScheduleCrowdPatch) return;
  const originalUpdate = proto.update;
  if (typeof originalUpdate !== 'function') return;

  proto.update = function updateWithClockAwareCrowds(deltaSeconds, state, ...args) {
    const result = originalUpdate.call(this, deltaSeconds, state, ...args);
    try {
      const currentState = state || this.game?.s || {};
      const clock = computeRunTime(currentState);
      const phase = activePhase(clock.minutes, currentState.__kanoClockBridge);
      const season = ensureLifestyle().season;
      const profileKey = `${phase}:${season}`;
      const walkers = Array.isArray(this.walkers) ? this.walkers : [];
      const crowdCount = walkers.length;

      const profiles = {
        morning: { speed: 1.00, density: 0.88 },
        afternoon: { speed: season === 'hotDry' ? 0.68 : 0.82, density: season === 'hotDry' ? 0.58 : 0.76 },
        evening: { speed: 1.12, density: 1.00 },
        night: { speed: 0.72, density: 0.42 },
      };
      const profile = profiles[phase] || profiles.morning;
      const baseSpeeds = this.__kanoScheduleWalkerBaseSpeeds || (this.__kanoScheduleWalkerBaseSpeeds = new WeakMap());
      const assignedProfiles = this.__kanoScheduleWalkerAssignedProfiles || (this.__kanoScheduleWalkerAssignedProfiles = new WeakMap());
      const profileChanged = this.__kanoScheduleCrowdProfileKey !== profileKey;
      for (const walker of walkers) {
        if (!walker || typeof walker !== 'object' || !Number.isFinite(Number(walker.speed))) continue;
        if (!baseSpeeds.has(walker)) baseSpeeds.set(walker, Number(walker.speed));
        if (profileChanged || assignedProfiles.get(walker) !== profileKey) {
          walker.speed = baseSpeeds.get(walker) * profile.speed;
          assignedProfiles.set(walker, profileKey);
        }
      }

      const needsCountUpdate = profileChanged || this.__kanoScheduleCrowdBaseCount !== crowdCount;
      if (needsCountUpdate && crowdCount > 0) {
        const visibleWalkers = Math.max(1, Math.min(crowdCount, Math.round(crowdCount * profile.density)));
        const meshes = [this.crowdTorso, this.crowdHead, this.crowdArms, this.crowdLegs];
        const baseCounts = this.__kanoScheduleMeshBaseCounts || (this.__kanoScheduleMeshBaseCounts = new WeakMap());
        for (const mesh of meshes) {
          if (!mesh || typeof mesh !== 'object' || !('count' in mesh)) continue;
          if (!baseCounts.has(mesh)) {
            const capacity = Math.max(0, Number(mesh.instanceMatrix?.count) || Number(mesh.count) || 0);
            baseCounts.set(mesh, capacity);
          }
          const capacity = baseCounts.get(mesh);
          if (capacity <= 0) continue;
          const instancesPerWalker = capacity / crowdCount;
          mesh.count = Math.max(0, Math.min(capacity, Math.floor(visibleWalkers * instancesPerWalker)));
        }
        this.__kanoScheduleCrowdBaseCount = crowdCount;
      }
      this.__kanoScheduleCrowdProfileKey = profileKey;
    } catch (error) {
      console.warn('[Kano Life] Clock-aware crowd adjustment skipped safely.', error);
    }
    return result;
  };
  Object.defineProperty(proto, '__kanoScheduleCrowdPatch', { value: true });
}

installGamePatches();
installCrowdSchedulePatch();
ensureLifestyle();

if (typeof window !== 'undefined' && !window.__KANO_DAILY_SCHEDULE_LIFECYCLE__) {
  window.__KANO_DAILY_SCHEDULE_LIFECYCLE__ = true;
  const saveCurrent = () => {
    const game = window.__KANO_DAILY_SCHEDULE_GAME__;
    if (game) persistWorldClock(game, true);
    else {
      try { persist(); } catch { /* Ignore browser shutdown races. */ }
    }
  };
  window.addEventListener('pagehide', saveCurrent);
  window.addEventListener('beforeunload', saveCurrent);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') saveCurrent();
  });

  window.KanoDailySchedule = Object.freeze({
    getStatus() {
      const game = window.__KANO_DAILY_SCHEDULE_GAME__;
      const life = ensureLifestyle();
      const current = game?.s ? computeRunTime(game.s) : {
        minutes: moduloDay(life.worldClockMinutes),
        dayNumber: life.worldDayNumber,
      };
      const hour = Math.floor(current.minutes / 60);
      const minute = Math.floor(current.minutes % 60);
      const time = `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
      return {
        day: current.dayNumber,
        time,
        phase: activePhase(current.minutes, game?.s?.__kanoClockBridge),
        mode: life.timeOfDay || 'auto',
        season: life.season,
        savedLocally: true,
        storageKey: 'kano-life-save-v4',
      };
    },
    saveNow() {
      const game = window.__KANO_DAILY_SCHEDULE_GAME__;
      if (game) persistWorldClock(game, true);
      else { try { persist(); } catch { /* Save unavailable during shutdown. */ } }
      return this.getStatus();
    },
  });
}

export { phaseForMinutes, computeRunTime, persistWorldClock };
