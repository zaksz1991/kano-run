// ============================================================
// KANO LIFE — PASSENGER DEMAND & FARE RHYTHM
// Pure helpers for time-of-day work demand and fare modifiers.
// No rendering, wallet writes, random calls, or game-state mutation here.
// Times are simplified in-game schedule flavour, not live market prices.
// ============================================================

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

function safeMinute(value, fallback = 7 * 60) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  return ((Math.floor(numeric) % 1440) + 1440) % 1440;
}

function safeDay(value) {
  const numeric = Math.floor(Number(value));
  return Number.isFinite(numeric) && numeric >= 1 ? numeric : 1;
}

function fallbackFareMultiplier(minuteOfDay) {
  const minute = safeMinute(minuteOfDay);
  if (minute >= 22 * 60 + 30) return 0.8;
  if (minute >= 20 * 60 + 10) return 1;
  if (minute >= 18 * 60 + 50) return 1.1;
  if (minute >= 16 * 60 + 30) return 1.25;
  if (minute >= 13 * 60 + 15) return 0.95;
  if (minute >= 10 * 60 + 30) return 1;
  if (minute >= 7 * 60) return 1.2;
  return 0.9;
}

/**
 * Describe passenger demand for one in-game moment.
 * periodFareMultiplier should be KanoDayCycle.modifiers().fareMultiplier when
 * available. Pickup bias only converts an otherwise-useless drop marker into
 * a pickup when the driver has no onboard passengers.
 */
export function passengerDemandProfile({
  day = 1,
  minuteOfDay = 7 * 60,
  periodFareMultiplier,
} = {}) {
  const currentDay = safeDay(day);
  const minute = safeMinute(minuteOfDay);
  const friday = currentDay % 7 === 5;
  const jumuah = friday && minute >= 13 * 60 && minute < 14 * 60 + 15;
  const preJumuah = friday && minute >= 12 * 60 && minute < 13 * 60;

  let period = 'fajr';
  let pickupBias = 0;
  if (jumuah) {
    period = 'friday-jumuah';
  } else if (preJumuah) {
    period = 'friday-pre-jumuah';
    pickupBias = 0.18;
  } else if (minute >= 22 * 60 + 30) {
    period = 'late-night';
  } else if (minute >= 20 * 60 + 10) {
    period = 'night';
  } else if (minute >= 18 * 60 + 50) {
    period = 'maghrib-evening';
  } else if (minute >= 16 * 60 + 30) {
    period = 'evening-rush';
    pickupBias = 0.32;
  } else if (minute >= 13 * 60 + 15) {
    period = 'zuhr-afternoon';
  } else if (minute >= 10 * 60 + 30) {
    period = 'midday';
  } else if (minute >= 7 * 60) {
    period = 'morning-rush';
    pickupBias = 0.32;
  }

  const suppliedFare = Number(periodFareMultiplier);
  let fareMultiplier = Number.isFinite(suppliedFare)
    ? suppliedFare
    : fallbackFareMultiplier(minute);

  // Friday Jumu'ah is intentionally modelled as a quieter opportunity window,
  // not as a real prayer timetable or a requirement to stop working.
  if (jumuah) fareMultiplier = Math.min(fareMultiplier, 0.95);
  fareMultiplier = clamp(fareMultiplier, 0.8, 1.25);

  return {
    day: currentDay,
    minuteOfDay: minute,
    period,
    isFriday: friday,
    isJumuahWindow: jumuah,
    fareMultiplier: Number(fareMultiplier.toFixed(3)),
    pickupBias: Number(pickupBias.toFixed(3)),
  };
}

/**
 * Convert a drop marker into a passenger pickup only when it cannot serve an
 * onboard passenger and the active time band indicates stronger demand.
 * Return null when the marker must remain unchanged.
 */
export function promoteEmptyDropToPickup(zone, {
  passengerCount = 0,
  environment = 'clear',
  pickupBias = 0,
  roll = 1,
} = {}) {
  if (!zone || zone.type !== 'drop') return null;
  if (Math.max(0, Math.floor(Number(passengerCount) || 0)) > 0) return null;
  if (String(environment || '').toLowerCase() === 'fuelqueue') return null;

  const bias = clamp(Number.isFinite(Number(pickupBias)) ? Number(pickupBias) : 0, 0, 0.5);
  const randomRoll = Number.isFinite(Number(roll)) ? Number(roll) : 1;
  if (bias <= 0 || randomRoll >= bias) return null;

  const side = Number(zone.side) < 0 ? -1 : 1;
  const destination = String(zone.dest || 'nearby stop').slice(0, 60);
  return {
    ...zone,
    type: 'pickup',
    lane: side < 0 ? 0 : 2,
    side,
    roadside: true,
    seats: 1,
    hub: false,
    label: `PICK UP · ${destination}`,
    kanoDemandAdjusted: true,
  };
}

/** Prevent the original night fare premium being applied twice. */
export function effectiveFareAdjustment(cycleFareMultiplier, gameNight = false) {
  const parsed = Number(cycleFareMultiplier);
  if (!Number.isFinite(parsed)) return 1;
  const targetTotal = clamp(parsed, 0.8, 1.25);
  const originalNightFactor = gameNight ? 1.25 : 1;
  return Number(clamp(targetTotal / originalNightFactor, 0.64, 1.25).toFixed(4));
}
