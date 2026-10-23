import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DRIVING_STYLES, FUEL_ECONOMY_STORAGE_KEY, passengerSeatLoad,
  calculateFuelEconomyFactor, adjustFuelConsumption, defaultFuelEconomyState,
  sanitizeFuelEconomyState, loadFuelEconomyState, saveFuelEconomyState,
  makeShiftEconomyReport, appendShiftEconomyReport,
} from '../js/KanoNorthernDriverFuelEconomy.js';

const memoryStorage = () => {
  const values = new Map();
  return { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, String(value)), values };
};

test('driving styles are explicit and smooth mode uses less fuel than balanced or fast', () => {
  assert.deepEqual(Object.keys(DRIVING_STYLES), ['smooth', 'balanced', 'fast']);
  const smooth = calculateFuelEconomyFactor({ style: 'smooth' });
  const balanced = calculateFuelEconomyFactor({ style: 'balanced' });
  const fast = calculateFuelEconomyFactor({ style: 'fast' });
  assert.ok(smooth.multiplier < balanced.multiplier);
  assert.ok(balanced.multiplier < fast.multiplier);
});

test('worn engine, body condition and tyres increase fuel use', () => {
  const healthy = calculateFuelEconomyFactor({ engine: 100, condition: 100, tyres: 100 });
  const wornEngine = calculateFuelEconomyFactor({ engine: 40, condition: 100, tyres: 100 });
  const wornBody = calculateFuelEconomyFactor({ engine: 100, condition: 40, tyres: 100 });
  const wornTyres = calculateFuelEconomyFactor({ engine: 100, condition: 100, tyres: 40 });
  assert.ok(wornEngine.multiplier > healthy.multiplier);
  assert.ok(wornBody.multiplier > healthy.multiplier);
  assert.ok(wornTyres.multiplier > healthy.multiplier);
});

test('hard acceleration and hard braking add penalties only when thresholds are met', () => {
  const calm = calculateFuelEconomyFactor({ speedKmh: 45, accelerationKmhPerSecond: 5 });
  const acceleration = calculateFuelEconomyFactor({ speedKmh: 45, throttle: true, accelerationKmhPerSecond: 40 });
  const braking = calculateFuelEconomyFactor({ speedKmh: 45, braking: true });
  assert.ok(acceleration.multiplier > calm.multiplier);
  assert.ok(braking.multiplier > calm.multiplier);
  assert.equal(acceleration.hardAcceleration, true);
  assert.equal(braking.hardBraking, true);
});

test('existing passenger seats are measured but the core passenger fuel term is not duplicated', () => {
  assert.equal(passengerSeatLoad([{ seats: 2 }, { seats: 1 }, { seats: -8 }, null]), 3);
  assert.equal(passengerSeatLoad('bad'), 0);
  const profile = calculateFuelEconomyFactor({ style: 'balanced' });
  assert.equal(profile.passengerLoadIsAlreadyIncludedInBaseRate, true);
});

test('fuel usage adjustment supports economical savings and is always bounded by the current fuel amount', () => {
  const eco = adjustFuelConsumption(0.5, { style: 'smooth', engine: 100, condition: 100, tyres: 100 });
  const rough = adjustFuelConsumption(0.5, { style: 'fast', engine: 30, condition: 30, tyres: 30, throttle: true, speedKmh: 45, accelerationKmhPerSecond: 55 });
  assert.ok(eco.adjustedFuelUsed < eco.baseFuelUsed);
  assert.ok(rough.adjustedFuelUsed > rough.baseFuelUsed);
  assert.equal(adjustFuelConsumption(0.5, { style: 'fast' }).extraFuelUsed > 0, true);
  assert.equal(adjustFuelConsumption(0, { style: 'fast' }).adjustedFuelUsed, 0);
});

test('shift report records load, harsh driving and estimated replacement-cost difference', () => {
  const report = makeShiftEconomyReport({
    day: 4, style: 'fast', baselineFuelUsed: 20, adjustedFuelUsed: 23.5,
    distance: 8.75, occupiedTicks: 4, passengerSeatTicks: 10, peakPassengerSeats: 3,
    harshAccelerations: 2, harshBrakes: 1, pricePerGaugePoint: 10, now: () => 0,
  });
  assert.equal(report.day, 4);
  assert.equal(report.extraFuelUsed, 3.5);
  assert.equal(report.estimatedReplacementCostDifference, 35);
  assert.equal(report.averagePassengerSeats, 2.5);
  assert.equal(report.peakPassengerSeats, 3);
  assert.equal(report.harshAccelerations, 2);
});

test('state sanitization and browser persistence preserve settings without NaN or unsupported styles', () => {
  const storage = memoryStorage();
  const saved = saveFuelEconomyState({ ...defaultFuelEconomyState(), style: 'smooth', totalShifts: 2 }, storage);
  assert.equal(saved.ok, true);
  assert.equal(storage.values.has(FUEL_ECONOMY_STORAGE_KEY), true);
  assert.equal(loadFuelEconomyState(storage).style, 'smooth');
  assert.equal(sanitizeFuelEconomyState({ style: 'made-up', totalShifts: -3 }).style, 'balanced');
  assert.equal(sanitizeFuelEconomyState({ totalBaselineFuelUsed: 'NaN' }).totalBaselineFuelUsed, 0);
});

test('shift reports accumulate and retain only the most recent 60 records', () => {
  let state = defaultFuelEconomyState();
  for (let day = 1; day <= 65; day += 1) {
    const report = makeShiftEconomyReport({ day, baselineFuelUsed: 1, adjustedFuelUsed: 1.1, now: () => day });
    state = appendShiftEconomyReport(state, report);
  }
  assert.equal(state.totalShifts, 65);
  assert.equal(state.history.length, 60);
  assert.equal(state.history[0].day, 6);
  assert.equal(state.lastShift.day, 65);
  assert.ok(state.totalExtraFuelUsed > 0);
});
