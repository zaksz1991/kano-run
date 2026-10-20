// ============================================================
// KANO LIFE — DAY CYCLE (clock, prayer periods, hunger, fatigue)
// File: js/KanoDayCycle.js
//
// Additive layer. It owns ONLY: time of day, day count, hunger, fatigue.
// It never touches the game's wallet, fuel, or distance, so there is no
// second economy. Gameplay effects are exposed through modifiers() and the
// onEvent callback; the game decides whether to apply them.
//
// Prayer times are approximate Kano values for gameplay flavour, not a
// religious timetable.
// ============================================================

const clamp = (v, min, max) => Math.max(min, Math.min(max, v));

export const PERIODS = Object.freeze([
  { id: 'fajr',    from: 5 * 60 + 15,  label: { en: 'Fajr · early morning', ha: 'Asuba' } },
  { id: 'morning', from: 7 * 60,       label: { en: 'Morning rush',         ha: 'Safiya' } },
  { id: 'midday',  from: 10 * 60 + 30, label: { en: 'Midday',               ha: 'Rana' } },
  { id: 'zuhr',    from: 13 * 60 + 15, label: { en: 'Zuhr · after prayer',  ha: 'Azahar' } },
  { id: 'asr',     from: 16 * 60 + 30, label: { en: 'Evening rush',         ha: 'Láasar' } },
  { id: 'maghrib', from: 18 * 60 + 50, label: { en: 'Maghrib · dusk',       ha: 'Magariba' } },
  { id: 'isha',    from: 20 * 60 + 10, label: { en: 'Night',                ha: 'Ishaʼi' } },
  { id: 'late',    from: 22 * 60 + 30, label: { en: 'Late night',           ha: 'Dare' } },
]);

// Fare and street activity by period. Values are multipliers around 1.
const MODIFIERS = Object.freeze({
  fajr:    { fareMultiplier: 0.9,  trafficDensity: 0.5, visibility: 0.8 },
  morning: { fareMultiplier: 1.2,  trafficDensity: 1.3, visibility: 1 },
  midday:  { fareMultiplier: 1,    trafficDensity: 1,   visibility: 1 },
  zuhr:    { fareMultiplier: 0.95, trafficDensity: 0.8, visibility: 1 },
  asr:     { fareMultiplier: 1.25, trafficDensity: 1.4, visibility: 1 },
  maghrib: { fareMultiplier: 1.1,  trafficDensity: 1,   visibility: 0.75 },
  isha:    { fareMultiplier: 1,    trafficDensity: 0.7, visibility: 0.6 },
  late:    { fareMultiplier: 0.8,  trafficDensity: 0.4, visibility: 0.5 },
});

const SHIFT_START_MINUTE = 7 * 60; // the morning routine ends around 06:50
const DEFAULTS = Object.freeze({ day: 1, minuteOfDay: SHIFT_START_MINUTE, hunger: 10, fatigue: 5, started: false });
// Hysteresis: warn when crossing HIGH, re-arm only after dropping below LOW.
const THRESHOLDS = Object.freeze({
  hunger:  { high: 70, low: 55, critical: 90 },
  fatigue: { high: 70, low: 55, critical: 90 },
});

export function periodAt(minuteOfDay) {
  const m = ((minuteOfDay % 1440) + 1440) % 1440;
  let current = PERIODS[PERIODS.length - 1]; // before Fajr counts as late night
  for (const p of PERIODS) if (m >= p.from) current = p;
  return current;
}

export function formatClock(minuteOfDay) {
  const m = Math.floor(((minuteOfDay % 1440) + 1440) % 1440);
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
}

export class KanoDayCycle {
  /**
   * @param {object} o
   * @param {number} o.gameMinutesPerSecond  clock speed; 0.5 => one day ~ 48 real minutes
   * @param {string} o.storageKey            localStorage key, or null to disable persistence
   * @param {(event:{type:string,detail?:object})=>void} o.onEvent
   */
  constructor({ gameMinutesPerSecond = 0.5, storageKey = 'kano-day-cycle-v1', onEvent = () => {}, storage } = {}) {
    this.rate = Math.max(0.01, gameMinutesPerSecond);
    this.storageKey = storageKey;
    this.onEvent = onEvent;
    this.storage = storage ?? (typeof localStorage !== 'undefined' ? localStorage : null);
    this.state = { ...DEFAULTS, ...this.#load() };
    this.#sanitise();
    this.level = { hunger: 0, fatigue: 0 };
    this.lastPeriod = periodAt(this.state.minuteOfDay).id;
    this.sinceSave = 0;
    this.destroyed = false;
  }

  #sanitise() {
    const s = this.state;
    s.day = Math.max(1, Math.floor(Number(s.day)) || 1);
    s.minuteOfDay = ((Number(s.minuteOfDay) || DEFAULTS.minuteOfDay) % 1440 + 1440) % 1440;
    s.hunger = clamp(Number(s.hunger) || 0, 0, 100);
    s.fatigue = clamp(Number(s.fatigue) || 0, 0, 100);
    s.started = s.started === true;
  }

  #load() {
    try {
      const raw = this.storage?.getItem(this.storageKey);
      const parsed = raw ? JSON.parse(raw) : null;
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
    } catch { return {}; }
  }

  save() {
    try { this.storage?.setItem(this.storageKey, JSON.stringify(this.state)); return true; } catch { return false; }
  }

  #emit(type, detail = {}) { try { this.onEvent({ type, detail, snapshot: this.snapshot() }); } catch { /* UI errors must not stop the sim */ } }

  /** Advance the sim. Call once per frame while the run is active. */
  update(dt, { speedKmh = 0, passengerOnboard = false } = {}) {
    if (this.destroyed || !Number.isFinite(dt) || dt <= 0) return;
    const sec = Math.min(dt, 0.25);
    const s = this.state;
    const moving = Math.max(0, Number(speedKmh) || 0) > 2;

    s.minuteOfDay += sec * this.rate;
    while (s.minuteOfDay >= 1440) {
      s.minuteOfDay -= 1440;
      s.day += 1;
      this.#emit('new_day', { day: s.day });
    }

    // Per game-minute rates, so changing the clock speed keeps the pacing consistent.
    const gm = sec * this.rate;
    s.hunger = clamp(s.hunger + gm * 0.09, 0, 100);
    if (moving) s.fatigue = clamp(s.fatigue + gm * (passengerOnboard ? 0.11 : 0.08), 0, 100);

    const period = periodAt(s.minuteOfDay).id;
    if (period !== this.lastPeriod) {
      this.lastPeriod = period;
      this.#emit('period_change', { period });
    }
    for (const key of ['hunger', 'fatigue']) this.#checkThreshold(key);

    this.sinceSave += sec;
    if (this.sinceSave >= 10) { this.sinceSave = 0; this.save(); }
  }

  // Level per stat: 0 ok, 1 high, 2 critical. Only upward transitions emit events;
  // the level drops back only below the LOW mark, so a value hovering near 70 cannot spam warnings.
  #checkThreshold(key) {
    const v = this.state[key];
    const t = THRESHOLDS[key];
    const level = this.level[key];
    if (v >= t.critical && level < 2) {
      this.level[key] = 2;
      this.#emit(`${key}_critical`, { value: Math.round(v) });
    } else if (v >= t.high && level < 1) {
      this.level[key] = 1;
      this.#emit(`${key}_high`, { value: Math.round(v) });
    } else if (v < t.low) {
      this.level[key] = 0;
    } else if (v < t.critical && level === 2) {
      this.level[key] = 1;
    }
  }

  /**
   * Start of a driving shift (after the morning routine). Each shift is a new day of the career:
   * the clock resets to the start of the shift, fatigue resets after a night's sleep, and hunger
   * depends on breakfast. `breakfastCost` of 0 / `breakfast` false means breakfast was skipped.
   */
  beginShift({ breakfast = false, breakfastCost = 0 } = {}) {
    const s = this.state;
    if (s.started) s.day += 1;
    s.started = true;
    s.minuteOfDay = SHIFT_START_MINUTE;
    s.fatigue = 5;
    s.hunger = breakfast ? clamp(30 - (Number(breakfastCost) || 0) / 15, 0, 30) : 35;
    this.level = { hunger: 0, fatigue: 0 };
    this.lastPeriod = periodAt(s.minuteOfDay).id;
    this.#emit('shift_started', { day: s.day, hunger: Math.round(s.hunger) });
    this.save();
  }

  /** Caller charges the wallet; this only applies the effect. */
  eat(hungerRelief = 35) {
    this.state.hunger = clamp(this.state.hunger - Math.max(0, Number(hungerRelief) || 0), 0, 100);
    this.#emit('ate', { hunger: Math.round(this.state.hunger) });
    this.save();
  }

  /** Skips time and reduces fatigue. Caller decides whether resting is allowed (e.g. not mid-trip). */
  rest(minutes = 60) {
    const m = Math.max(0, Number(minutes) || 0);
    this.state.fatigue = clamp(this.state.fatigue - m * 0.5, 0, 100);
    this.state.minuteOfDay += m;
    while (this.state.minuteOfDay >= 1440) { this.state.minuteOfDay -= 1440; this.state.day += 1; }
    this.#emit('rested', { minutes: m });
    this.save();
  }

  /** Effects the game MAY apply. 1 means no change. */
  modifiers() {
    const base = MODIFIERS[periodAt(this.state.minuteOfDay).id];
    const f = this.state.fatigue;
    const h = this.state.hunger;
    return {
      ...base,
      // Tired drivers steer less precisely; hungry drivers lose a little focus (never below 0.7).
      steeringResponse: clamp(1 - Math.max(0, f - 60) / 100, 0.7, 1),
      tipMultiplier: clamp(1 - Math.max(0, h - 70) / 200, 0.85, 1),
    };
  }

  snapshot(lang = 'en') {
    const s = this.state;
    const p = periodAt(s.minuteOfDay);
    return {
      day: s.day,
      clock: formatClock(s.minuteOfDay),
      minuteOfDay: s.minuteOfDay,
      period: p.id,
      periodLabel: p.label[lang] || p.label.en,
      hunger: Math.round(s.hunger),
      fatigue: Math.round(s.fatigue),
    };
  }

  reset() { this.state = { ...DEFAULTS }; this.level = { hunger: 0, fatigue: 0 }; this.save(); }
  dispose() { if (this.destroyed) return; this.save(); this.destroyed = true; }
}
