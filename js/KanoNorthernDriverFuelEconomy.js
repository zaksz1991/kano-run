/**
 * Kano Life — fuel-economy model for the keke driver's working day.
 * This layer adjusts the already-existing Game.tick fuel usage rather than
 * creating a second fuel tank or a separate economy.
 */
export const FUEL_ECONOMY_STORAGE_KEY = 'kano-life-northern-driver-fuel-economy-v1';
export const DRIVING_STYLES = Object.freeze({
  smooth: Object.freeze({ id: 'smooth', label: 'Smooth & economical', multiplier: 0.90 }),
  balanced: Object.freeze({ id: 'balanced', label: 'Balanced everyday driving', multiplier: 1.00 }),
  fast: Object.freeze({ id: 'fast', label: 'Fast & aggressive', multiplier: 1.12 }),
});
const clamp = (value, min, max) => Math.max(min, Math.min(max, Number.isFinite(Number(value)) ? Number(value) : 0));
const round = (value, places = 2) => {
  const m = 10 ** places;
  return Math.round((Number(value) || 0) * m) / m;
};
const safeDay = value => Math.floor(clamp(value, 1, 999999));
const safeStyle = value => Object.hasOwn(DRIVING_STYLES, value) ? value : 'balanced';
const safeCount = value => Math.floor(clamp(value, 0, 1000000));

export function passengerSeatLoad(passengers) {
  if (!Array.isArray(passengers)) return 0;
  return Math.min(8, passengers.reduce((total, passenger) => {
    const seats = Number(passenger?.seats);
    return total + (Number.isFinite(seats) && seats > 0 ? Math.floor(seats) : 0);
  }, 0));
}

/**
 * The base game already adds fuel burn for each occupied passenger seat and
 * for speed/throttle. This helper deliberately does not duplicate that term.
 * It layers driving style, rough acceleration/braking and mechanical wear onto
 * the fuel burn that the original tick actually produced.
 */
export function calculateFuelEconomyFactor({
  style = 'balanced',
  speedKmh = 0,
  throttle = false,
  braking = false,
  reverse = false,
  accelerationKmhPerSecond = 0,
  engine = 100,
  condition = 100,
  tyres = 100,
} = {}) {
  const selected = safeStyle(style);
  const styleFactor = DRIVING_STYLES[selected].multiplier;
  const engineHealth = clamp(engine, 0, 100) / 100;
  const conditionHealth = clamp(condition, 0, 100) / 100;
  const tyreHealth = clamp(tyres, 0, 100) / 100;
  const engineFactor = 1 + (1 - engineHealth) * 0.28;
  const conditionFactor = 1 + (1 - conditionHealth) * 0.10;
  const tyreFactor = 1 + (1 - tyreHealth) * 0.08;
  const speed = clamp(speedKmh, 0, 300);
  const acceleration = clamp(Math.abs(accelerationKmhPerSecond), 0, 1000);
  const hardAcceleration = Boolean(throttle) && acceleration >= 28 && speed >= 12;
  const hardBraking = Boolean(braking) && speed >= 30;
  const reversingUnderBrake = Boolean(reverse) && Boolean(braking);
  const drivingFactor = (hardAcceleration ? 1.08 : 1)
    * (hardBraking ? 1.05 : 1)
    * (reversingUnderBrake ? 1.04 : 1);
  const raw = styleFactor * engineFactor * conditionFactor * tyreFactor * drivingFactor;
  return {
    style: selected,
    multiplier: round(clamp(raw, 0.72, 1.65), 4),
    styleFactor: round(styleFactor, 4),
    engineFactor: round(engineFactor, 4),
    conditionFactor: round(conditionFactor, 4),
    tyreFactor: round(tyreFactor, 4),
    drivingFactor: round(drivingFactor, 4),
    hardAcceleration,
    hardBraking,
    reversingUnderBrake,
    passengerLoadIsAlreadyIncludedInBaseRate: true,
  };
}

export function adjustFuelConsumption(baseFuelUsed, factors = {}) {
  const base = round(clamp(baseFuelUsed, 0, 100), 5);
  const profile = calculateFuelEconomyFactor(factors);
  const adjusted = round(clamp(base * profile.multiplier, 0, 100), 5);
  return {
    ...profile,
    baseFuelUsed: base,
    adjustedFuelUsed: adjusted,
    extraFuelUsed: round(adjusted - base, 5),
  };
}

export function defaultFuelEconomyState() {
  return {
    version: 1,
    style: 'balanced',
    totalShifts: 0,
    totalBaselineFuelUsed: 0,
    totalAdjustedFuelUsed: 0,
    totalExtraFuelUsed: 0,
    totalHarshAccelerations: 0,
    totalHarshBrakes: 0,
    lastShift: null,
    history: [],
  };
}

export function sanitizeFuelEconomyState(input = {}) {
  const row = input && typeof input === 'object' ? input : {};
  const state = defaultFuelEconomyState();
  state.style = safeStyle(row.style);
  state.totalShifts = safeCount(row.totalShifts);
  state.totalBaselineFuelUsed = round(clamp(row.totalBaselineFuelUsed, 0, 1e9));
  state.totalAdjustedFuelUsed = round(clamp(row.totalAdjustedFuelUsed, 0, 1e9));
  state.totalExtraFuelUsed = round(clamp(row.totalExtraFuelUsed, -1e9, 1e9));
  state.totalHarshAccelerations = safeCount(row.totalHarshAccelerations);
  state.totalHarshBrakes = safeCount(row.totalHarshBrakes);
  const normalizeShift = item => {
    if (!item || typeof item !== 'object') return null;
    return {
      day: safeDay(item.day),
      style: safeStyle(item.style),
      baselineFuelUsed: round(clamp(item.baselineFuelUsed, 0, 1000)),
      adjustedFuelUsed: round(clamp(item.adjustedFuelUsed, 0, 1000)),
      extraFuelUsed: round(clamp(item.extraFuelUsed, -1000, 1000)),
      estimatedReplacementCostDifference: Math.round(clamp(item.estimatedReplacementCostDifference, -1e7, 1e7)),
      distance: round(clamp(item.distance, 0, 1e7)),
      averagePassengerSeats: round(clamp(item.averagePassengerSeats, 0, 8), 1),
      peakPassengerSeats: Math.floor(clamp(item.peakPassengerSeats, 0, 8)),
      harshAccelerations: safeCount(item.harshAccelerations),
      harshBrakes: safeCount(item.harshBrakes),
      meanMultiplier: round(clamp(item.meanMultiplier, 0.5, 2), 3),
      endedAt: String(item.endedAt ?? '').slice(0, 40),
    };
  };
  state.lastShift = normalizeShift(row.lastShift);
  state.history = Array.isArray(row.history) ? row.history.slice(-60).map(normalizeShift).filter(Boolean) : [];
  return state;
}

export function loadFuelEconomyState(storage = globalThis.localStorage ?? null) {
  try {
    const raw = storage?.getItem(FUEL_ECONOMY_STORAGE_KEY);
    if (!raw) return defaultFuelEconomyState();
    const parsed = JSON.parse(raw);
    if (!parsed || parsed.version !== 1) return defaultFuelEconomyState();
    return sanitizeFuelEconomyState(parsed);
  } catch { return defaultFuelEconomyState(); }
}

export function saveFuelEconomyState(input, storage = globalThis.localStorage ?? null) {
  const state = sanitizeFuelEconomyState(input);
  try {
    if (!storage) return { ok: false, state };
    storage.setItem(FUEL_ECONOMY_STORAGE_KEY, JSON.stringify(state));
    return { ok: true, state };
  } catch { return { ok: false, state }; }
}

export function makeShiftEconomyReport({
  day = 1, style = 'balanced', baselineFuelUsed = 0, adjustedFuelUsed = 0,
  distance = 0, occupiedTicks = 0, passengerSeatTicks = 0, peakPassengerSeats = 0,
  harshAccelerations = 0, harshBrakes = 0, pricePerGaugePoint = 8,
  now = () => Date.now(),
} = {}) {
  const baseline = round(clamp(baselineFuelUsed, 0, 1000));
  const adjusted = round(clamp(adjustedFuelUsed, 0, 1000));
  const fuelDelta = round(adjusted - baseline);
  const occupied = Math.max(0, Math.floor(Number(occupiedTicks) || 0));
  const avgSeats = occupied > 0 ? clamp(passengerSeatTicks / occupied, 0, 8) : 0;
  const meanMultiplier = baseline > 0 ? clamp(adjusted / baseline, 0.5, 2) : 1;
  return {
    day: safeDay(day), style: safeStyle(style), baselineFuelUsed: baseline,
    adjustedFuelUsed: adjusted, extraFuelUsed: fuelDelta,
    estimatedReplacementCostDifference: Math.round(fuelDelta * clamp(pricePerGaugePoint, 0, 100000)),
    distance: round(clamp(distance, 0, 1e7)),
    averagePassengerSeats: round(avgSeats, 1),
    peakPassengerSeats: Math.floor(clamp(peakPassengerSeats, 0, 8)),
    harshAccelerations: safeCount(harshAccelerations), harshBrakes: safeCount(harshBrakes),
    meanMultiplier: round(meanMultiplier, 3), endedAt: new Date(now()).toISOString(),
  };
}

export function appendShiftEconomyReport(input, report) {
  const state = sanitizeFuelEconomyState(input);
  if (!report || typeof report !== 'object') return state;
  const normalized = sanitizeFuelEconomyState({ ...state, lastShift: report }).lastShift;
  if (!normalized) return state;
  state.totalShifts += 1;
  state.totalBaselineFuelUsed = round(state.totalBaselineFuelUsed + normalized.baselineFuelUsed);
  state.totalAdjustedFuelUsed = round(state.totalAdjustedFuelUsed + normalized.adjustedFuelUsed);
  state.totalExtraFuelUsed = round(state.totalExtraFuelUsed + normalized.extraFuelUsed);
  state.totalHarshAccelerations += normalized.harshAccelerations;
  state.totalHarshBrakes += normalized.harshBrakes;
  state.lastShift = normalized;
  state.history = [...state.history, normalized].slice(-60);
  return state;
}
