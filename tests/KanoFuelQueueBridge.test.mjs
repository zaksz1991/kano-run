import test from 'node:test';
import assert from 'node:assert/strict';
import { fuelPlan, stationPrice } from '../js/KanoFuelQueueBridge.js';

test('fuel cost scales with litres and stops at what the driver can afford', () => {
  const full = fuelPlan(50, 10000, 100);
  assert.equal(full.litres, 6);
  assert.equal(full.cost, 600);
  assert.equal(full.short, false);
  const poor = fuelPlan(50, 300, 100);
  assert.equal(poor.cost, 300);
  assert.equal(poor.short, true);
  assert.equal(fuelPlan(50, 0, 100).litres, 0);
});

test('queue conditions raise the station price', () => {
  assert.ok(stationPrice('fuelQueue', 3) > stationPrice('clear', 3));
  assert.ok(stationPrice('clear', 7) > 80 && stationPrice('clear', 7) < 125);
});
