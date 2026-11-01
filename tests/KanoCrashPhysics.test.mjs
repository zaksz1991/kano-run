import test from 'node:test';
import assert from 'node:assert/strict';
import { crashOutcome } from '../js/KanoCrashPhysics.js';

test('a parked truck stops the keke far harder than a motorbike', () => {
  const truck = crashOutcome({ playerKmh: 60, otherKmh: 0, playerMass: 590, otherMass: 8500 });
  const bike = crashOutcome({ playerKmh: 60, otherKmh: 0, playerMass: 590, otherMass: 190 });
  assert.ok(truck.playerAfterKmh < 5);
  assert.ok(bike.playerAfterKmh > 35);
  assert.ok(truck.massRatio > bike.massRatio);
});

test('a slower car ahead only takes off part of the keke speed and never speeds it up', () => {
  const car = crashOutcome({ playerKmh: 50, otherKmh: 30, playerMass: 590, otherMass: 1300 });
  assert.ok(car.playerAfterKmh < 50 && car.playerAfterKmh > 25);
});
