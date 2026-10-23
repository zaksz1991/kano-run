/**
 * Kano Life — daily fuel market and prepaid fuel ledger.
 * Fuel quantities are fuel-gauge percentage points, not litres. All naira
 * values are game-balancing values, not live station prices.
 */
export const FUEL_MARKET_STORAGE_KEY = 'kano-life-northern-driver-fuel-market-v1';
export const BASE_FUEL_PRICE_PER_GAUGE_POINT = 8;
export const FUEL_STATIONS = Object.freeze({
  major_station: Object.freeze({ id: 'major_station', label: 'Major filling station', multiplier: 1.00 }),
  independent_station: Object.freeze({ id: 'independent_station', label: 'Independent station', multiplier: 0.94 }),
  roadside_seller: Object.freeze({ id: 'roadside_seller', label: 'Roadside fuel seller', multiplier: 1.22 }),
});
const clamp = (value, min, max) => Math.max(min, Math.min(max, Number(value) || 0));
const integer = (value, min, max) => Math.floor(clamp(value, min, max));
const safeDay = value => integer(value, 1, 999999);
const money = value => Math.round(clamp(value, 0, 1_000_000_000));
const safeText = (value, max = 120) => String(value ?? '').replace(/[<>\u0000-\u001f]/g, '').trim().slice(0, max);

export function defaultFuelMarketState(fuelPercent = null) {
  return {
    version: 1,
    fuelPercent: fuelPercent == null || !Number.isFinite(Number(fuelPercent)) ? null : Math.round(clamp(fuelPercent, 0, 100) * 10) / 10,
    prepaidUnits: 0,
    totalUnitsPurchased: 0,
    totalSpent: 0,
    complaintCount: 0,
    lastComplaintDay: null,
    lastDay: 1,
    history: [],
  };
}

export function sanitizeFuelMarketState(input = {}) {
  const row = input && typeof input === 'object' ? input : {};
  const fresh = defaultFuelMarketState(row.fuelPercent);
  fresh.prepaidUnits = Math.round(clamp(row.prepaidUnits, 0, 100) * 10) / 10;
  fresh.totalUnitsPurchased = Math.round(clamp(row.totalUnitsPurchased, 0, 1_000_000) * 10) / 10;
  fresh.totalSpent = money(row.totalSpent);
  fresh.complaintCount = integer(row.complaintCount, 0, 1_000_000);
  fresh.lastComplaintDay = row.lastComplaintDay == null || !Number.isFinite(Number(row.lastComplaintDay)) ? null : safeDay(row.lastComplaintDay);
  fresh.lastDay = safeDay(row.lastDay ?? 1);
  fresh.history = Array.isArray(row.history) ? row.history.filter(item => item && typeof item === 'object').slice(-120).map(item => ({
    type: ['purchase', 'complaint', 'shift_end'].includes(item.type) ? item.type : 'shift_end',
    day: safeDay(item.day),
    at: safeText(item.at, 40),
    stationId: Object.hasOwn(FUEL_STATIONS, item.stationId) ? item.stationId : '',
    units: Math.round(clamp(item.units, 0, 100) * 10) / 10,
    cost: money(item.cost),
    pricePerGaugePoint: money(item.pricePerGaugePoint),
    fuelStart: Math.round(clamp(item.fuelStart, 0, 100) * 10) / 10,
    fuelEnd: Math.round(clamp(item.fuelEnd, 0, 100) * 10) / 10,
    complaint: safeText(item.complaint, 180),
    marketMultiplier: Math.round(clamp(item.marketMultiplier, 0.5, 2) * 1000) / 1000,
  })) : [];
  if (fresh.fuelPercent != null) fresh.prepaidUnits = Math.min(fresh.prepaidUnits, fresh.fuelPercent);
  return fresh;
}

export function loadFuelMarketState(storage = globalThis.localStorage ?? null) {
  try {
    const raw = storage?.getItem(FUEL_MARKET_STORAGE_KEY);
    if (!raw) return defaultFuelMarketState();
    const parsed = JSON.parse(raw);
    if (!parsed || parsed.version !== 1) return defaultFuelMarketState();
    return sanitizeFuelMarketState(parsed);
  } catch { return defaultFuelMarketState(); }
}

export function saveFuelMarketState(input, storage = globalThis.localStorage ?? null) {
  const state = sanitizeFuelMarketState(input);
  try {
    if (!storage) return { ok: false, reason: 'storage_unavailable', state };
    storage.setItem(FUEL_MARKET_STORAGE_KEY, JSON.stringify(state));
    return { ok: true, state };
  } catch { return { ok: false, reason: 'storage_unavailable', state }; }
}

/** Deterministic in-game price pressure for a simulated day, not a live market quote. */
export function dailyFuelPriceMultiplier(day = 1) {
  const d = safeDay(day);
  const wave = 0.08 * Math.sin(d * 1.4142) + 0.05 * Math.cos(d * 0.618);
  const scarcity = d % 11 === 7 ? 0.22 : d % 7 === 3 ? 0.10 : 0;
  return Math.round(clamp(1 + wave + scarcity, 0.82, 1.35) * 1000) / 1000;
}

export function stationPricePerGaugePoint(day = 1, stationId = 'major_station') {
  const station = FUEL_STATIONS[stationId] || FUEL_STATIONS.major_station;
  return Math.max(1, Math.round(BASE_FUEL_PRICE_PER_GAUGE_POINT * dailyFuelPriceMultiplier(day) * station.multiplier));
}

export function recordFuelPurchase(input, { day = 1, stationId = 'major_station', requestedUnits = 10, wallet = 0, now = () => Date.now() } = {}) {
  const state = sanitizeFuelMarketState(input);
  const station = FUEL_STATIONS[stationId];
  if (!station) return { ok: false, reason: 'unknown_station', state };
  if (state.fuelPercent == null) return { ok: false, reason: 'fuel_level_unknown', state };
  const request = Math.round(clamp(requestedUnits, 1, 100) * 10) / 10;
  const units = Math.round(Math.min(request, 100 - state.fuelPercent) * 10) / 10;
  if (units <= 0) return { ok: false, reason: 'tank_full', state };
  const pricePerGaugePoint = stationPricePerGaugePoint(day, stationId);
  const cost = money(units * pricePerGaugePoint);
  const availableWallet = money(wallet);
  if (cost > availableWallet) return { ok: false, reason: 'insufficient_wallet', state, required: cost, wallet: availableWallet, units, pricePerGaugePoint };
  state.fuelPercent = Math.round((state.fuelPercent + units) * 10) / 10;
  state.prepaidUnits = Math.round(Math.min(100, state.prepaidUnits + units) * 10) / 10;
  state.totalUnitsPurchased = Math.round((state.totalUnitsPurchased + units) * 10) / 10;
  state.totalSpent = money(state.totalSpent + cost);
  state.lastDay = safeDay(day);
  state.history.push({ type: 'purchase', day: safeDay(day), at: new Date(now()).toISOString(), stationId, units, cost, pricePerGaugePoint, fuelStart: Math.round((state.fuelPercent - units) * 10) / 10, fuelEnd: state.fuelPercent, marketMultiplier: dailyFuelPriceMultiplier(day) });
  state.history = state.history.slice(-120);
  return { ok: true, state: sanitizeFuelMarketState(state), station, units, cost, pricePerGaugePoint, walletAfter: availableWallet - cost };
}

export function recordFuelPriceComplaint(input, { day = 1, stationId = 'major_station', now = () => Date.now() } = {}) {
  const state = sanitizeFuelMarketState(input);
  const station = FUEL_STATIONS[stationId];
  if (!station) return { ok: false, reason: 'unknown_station', state };
  const d = safeDay(day);
  if (state.lastComplaintDay === d) return { ok: false, reason: 'already_complained_today', state };
  const pricePerGaugePoint = stationPricePerGaugePoint(d, stationId);
  state.lastComplaintDay = d;
  state.complaintCount += 1;
  state.lastDay = d;
  state.history.push({ type: 'complaint', day: d, at: new Date(now()).toISOString(), stationId, pricePerGaugePoint, complaint: 'Driver recorded a fuel-price complaint; no money or reputation is awarded.' , marketMultiplier: dailyFuelPriceMultiplier(d) });
  state.history = state.history.slice(-120);
  return { ok: true, state: sanitizeFuelMarketState(state), pricePerGaugePoint, station };
}

export function recordFuelShiftEnd(input, { day = 1, fuelStart = 100, fuelEnd = 100, prepaidAtStart = 0, now = () => Date.now() } = {}) {
  const state = sanitizeFuelMarketState(input);
  const start = Math.round(clamp(fuelStart, 0, 100) * 10) / 10;
  const end = Math.round(clamp(fuelEnd, 0, 100) * 10) / 10;
  const used = Math.round(Math.max(0, start - end) * 10) / 10;
  const prepaidUsed = Math.round(Math.min(clamp(prepaidAtStart, 0, 100), used) * 10) / 10;
  state.fuelPercent = end;
  state.prepaidUnits = Math.round(Math.max(0, state.prepaidUnits - prepaidUsed) * 10) / 10;
  state.lastDay = safeDay(day);
  state.history.push({ type: 'shift_end', day: safeDay(day), at: new Date(now()).toISOString(), units: used, fuelStart: start, fuelEnd: end });
  state.history = state.history.slice(-120);
  return { state: sanitizeFuelMarketState(state), fuelUsed: used, prepaidUsed, billableUnits: Math.round(Math.max(0, used - prepaidUsed) * 10) / 10 };
}

export default {
  FUEL_MARKET_STORAGE_KEY, BASE_FUEL_PRICE_PER_GAUGE_POINT, FUEL_STATIONS,
  defaultFuelMarketState, sanitizeFuelMarketState, loadFuelMarketState, saveFuelMarketState,
  dailyFuelPriceMultiplier, stationPricePerGaugePoint, recordFuelPurchase,
  recordFuelPriceComplaint, recordFuelShiftEnd,
};
