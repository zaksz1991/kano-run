// ============================================================
// KANO LIFE — STREET RHYTHM
// Traffic density follows the in-game day cycle. These helpers are pure:
// they do not touch game state, rendering, collision rules, or randomness.
// Friday/Jumu'ah timing is simplified game flavour, not a real timetable.
// ============================================================

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

function minuteOfDayValue(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return 0;
  return ((Math.floor(number) % 1440) + 1440) % 1440;
}

/** The in-game calendar treats days 5, 12, 19, ... as Fridays. */
export function isFriday(day) {
  const value = Math.floor(Number(day));
  const normalized = Number.isFinite(value) && value >= 1 ? value : 1;
  return normalized % 7 === 5;
}

/** Approximate in-game Jumu'ah quiet window, from 13:00 to 14:15. */
export function isJumuahWindow(minuteOfDay) {
  const minute = minuteOfDayValue(minuteOfDay);
  return minute >= 13 * 60 && minute < 14 * 60 + 15;
}

/**
 * Computes a street-activity multiplier.
 * periodDensity should come from KanoDayCycle.modifiers().trafficDensity.
 */
export function streetDensity({
  periodDensity = 1,
  minuteOfDay = 0,
  day = 1,
} = {}) {
  const parsed = Number(periodDensity);
  let density = Number.isFinite(parsed) ? parsed : 1;
  density = clamp(density, 0.25, 1.6);

  if (isFriday(day)) {
    const minute = minuteOfDayValue(minuteOfDay);

    // A little more movement as people travel before the Jumu'ah window.
    if (minute >= 12 * 60 && minute < 13 * 60) {
      density = clamp(Math.max(density * 1.25, 1.2), 1.2, 1.6);
    } else if (isJumuahWindow(minute)) {
      density = 0.25;
    }
  }

  return Number(density.toFixed(3));
}

/**
 * Returns the number of background traffic actors to maintain.
 * Defaults preserve the game's original mobile/desktop pools at density 1.
 */
export function targetTrafficCount({
  mobile = true,
  baseCount,
  periodDensity = 1,
  minuteOfDay = 0,
  day = 1,
  density,
} = {}) {
  const fallbackBase = mobile ? 5 : 8;
  const requestedBase = Number(baseCount);
  const base = Number.isFinite(requestedBase) && requestedBase > 0
    ? Math.floor(requestedBase)
    : fallbackBase;

  const requestedDensity = density == null
    ? streetDensity({ periodDensity, minuteOfDay, day })
    : Number(density);
  const safeDensity = clamp(
    Number.isFinite(requestedDensity) ? requestedDensity : 1,
    0.25,
    1.6,
  );

  const minCount = Math.min(2, Math.max(1, base));
  const maxCount = mobile ? 6 : 12;
  return Math.round(clamp(base * safeDensity, minCount, maxCount));
}
