import test from 'node:test';
import assert from 'node:assert/strict';
import {
  FUEL_STATIONS,
  defaultFuelMarketState,
  sanitizeFuelMarketState,
  dailyFuelPriceMultiplier,
  stationPricePerGaugePoint,
  recordFuelPurchase,
  recordFuelPriceComplaint,
  recordFuelShiftEnd,
} from '../js/KanoNorthernDriverFuelMarket.js';
import { KanoNorthernDriverLifeSimulation } from '../js/KanoNorthernDriverLifeSimulation.js';

const storageMock = () => {
  const map = new Map();
  return { getItem: key => map.get(key) ?? null, setItem: (key, value) => map.set(key, String(value)) };
};

test('daily fuel index is deterministic and stays within the declared gameplay bounds', () => {
  for (let day = 1; day <= 300; day += 1) {
    const value = dailyFuelPriceMultiplier(day);
    assert.ok(value >= 0.82 && value <= 1.35);
    assert.equal(value, dailyFuelPriceMultiplier(day));
  }
});

test('station quotes apply deterministic differences while remaining gameplay values', () => {
  const major = stationPricePerGaugePoint(5, 'major_station');
  const independent = stationPricePerGaugePoint(5, 'independent_station');
  const roadside = stationPricePerGaugePoint(5, 'roadside_seller');
  assert.ok(independent <= major);
  assert.ok(roadside >= major);
  assert.deepEqual(Object.keys(FUEL_STATIONS).sort(), ['independent_station', 'major_station', 'roadside_seller']);
});

test('purchase fills no more than the tank capacity and consumes existing-wallet budget', () => {
  const initial = defaultFuelMarketState(92);
  const result = recordFuelPurchase(initial, { day: 1, stationId: 'major_station', requestedUnits: 20, wallet: 1000, now: () => 0 });
  assert.equal(result.ok, true);
  assert.equal(result.units, 8);
  assert.equal(result.state.fuelPercent, 100);
  assert.equal(result.state.prepaidUnits, 8);
  assert.equal(result.cost, result.units * result.pricePerGaugePoint);
  assert.equal(result.walletAfter, 1000 - result.cost);
});

test('purchase refuses insufficient wallet or full tank without mutating input', () => {
  const initial = defaultFuelMarketState(95);
  const insufficient = recordFuelPurchase(initial, { day: 1, requestedUnits: 10, wallet: 1 });
  assert.equal(insufficient.ok, false);
  assert.equal(insufficient.reason, 'insufficient_wallet');
  assert.equal(initial.fuelPercent, 95);
  const full = recordFuelPurchase(defaultFuelMarketState(100), { requestedUnits: 10, wallet: 1000 });
  assert.equal(full.ok, false);
  assert.equal(full.reason, 'tank_full');
});

test('fuel price complaint can be logged only once per simulated day and grants no reward', () => {
  const state = defaultFuelMarketState(50);
  const first = recordFuelPriceComplaint(state, { day: 4, stationId: 'roadside_seller', now: () => 0 });
  assert.equal(first.ok, true);
  assert.equal(first.state.complaintCount, 1);
  const repeated = recordFuelPriceComplaint(first.state, { day: 4, stationId: 'roadside_seller', now: () => 1 });
  assert.equal(repeated.ok, false);
  assert.equal(repeated.reason, 'already_complained_today');
  assert.equal(first.state.totalSpent, 0);
});

test('shift-end accounting consumes prepaid credits once and persists tank fuel', () => {
  const initial = { ...defaultFuelMarketState(80), prepaidUnits: 10 };
  const result = recordFuelShiftEnd(initial, { day: 2, fuelStart: 80, fuelEnd: 65, prepaidAtStart: 10, now: () => 0 });
  assert.equal(result.fuelUsed, 15);
  assert.equal(result.prepaidUsed, 10);
  assert.equal(result.billableUnits, 5);
  assert.equal(result.state.prepaidUnits, 0);
  assert.equal(result.state.fuelPercent, 65);
});

test('career settlement excludes prepaid fuel from repeat charges and applies price pressure only to billable units', () => {
  const simulation = new KanoNorthernDriverLifeSimulation({ storage: storageMock(), now: () => 1234 });
  simulation.beginShift({ runStartedAt: 1234, fuel: 80, condition: 100, engine: 100, tyres: 100 }, 1, 'career');
  const active = simulation.state.activeShift;
  active.fuel = 70; // 10 of the 80 starting gauge points were purchased in advance.
  active.fuelGaugeAtShiftStart = 80;
  active.prepaidFuelAtStart = 10;
  active.fuelPriceMultiplier = 1.25;
  const result = simulation.settleShift({
    earned: 500,
    gameState: { runStartedAt: 1234, fuel: 60, condition: 100, engine: 100, tyres: 100, drops: 0, distance: 0, collisions: 0 },
    wallet: 1000,
    dayNumber: 1,
    mode: 'career',
  });
  assert.equal(result.ok, true);
  assert.equal(result.report.fuelUsed, 20);
  assert.equal(result.report.prepaidFuelUnitsUsed, 10);
  assert.equal(result.report.fuelBilledUnits, 10);
  assert.equal(result.report.fuelCost.due, 100); // 10 points x baseline 8 x 1.25 market multiplier.
});

test('legacy state is sanitised without throwing or inventing fuel credits', () => {
  const state = sanitizeFuelMarketState({ version: 0, fuelPercent: 120, prepaidUnits: 300, history: 'bad' });
  assert.equal(state.fuelPercent, 100);
  assert.equal(state.prepaidUnits, 100);
  assert.deepEqual(state.history, []);
});
