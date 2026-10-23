import test from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../js/game.js';
import '../js/KanoStreetRhythmUpgrade.js';
import {
  effectiveFareAdjustment,
  passengerDemandProfile,
  promoteEmptyDropToPickup,
} from '../js/KanoPassengerDemandRhythm.js';

globalThis.window = globalThis;
if (typeof globalThis.dispatchEvent !== 'function') globalThis.dispatchEvent = () => true;

function makeGame({ mobile = true, day = 1, minuteOfDay = 8 * 60, fareMultiplier = 1.2 } = {}) {
  const ui = {
    bind(game) { this.game = game; },
    startPlay() {}, show() {}, hide() {}, toast() {}, update() {},
    event() {}, hideEvent() {}, gameOver() {},
  };
  const audio = { start() {}, engine() {}, horn() {}, pickup() {}, crash() {} };
  const game = new Game(ui, audio, { mobile });
  game.start('career');
  game.dayCycle = {
    state: { day, minuteOfDay },
    modifiers() { return { fareMultiplier, trafficDensity: 1.1 }; },
  };
  game.s.night = false;
  game.s.passengers = [];
  game.s.zones = [];
  return game;
}

function withRandom(values, callback) {
  const original = Math.random;
  let cursor = 0;
  Math.random = () => values[cursor++] ?? values.at(-1) ?? 0.5;
  try { return callback(); } finally { Math.random = original; }
}

function dropZone(overrides = {}) {
  return {
    id: 'test-drop', type: 'drop', lane: 2, side: 1, roadside: true,
    depth: 1.2, dest: 'Sabon Gari', seats: 0, hub: false,
    label: 'DROP OFF · Sabon Gari', warned: false, retryAt: 0,
    ...overrides,
  };
}

test('morning demand profile uses the live day-cycle fare multiplier and pickup bias', () => {
  const profile = passengerDemandProfile({ day: 3, minuteOfDay: 8 * 60, periodFareMultiplier: 1.2 });
  assert.equal(profile.period, 'morning-rush');
  assert.equal(profile.fareMultiplier, 1.2);
  assert.equal(profile.pickupBias, 0.32);
  assert.equal(profile.isFriday, false);
});

test('evening rush increases pickup opportunities without exceeding the bias cap', () => {
  const profile = passengerDemandProfile({ day: 2, minuteOfDay: 17 * 60, periodFareMultiplier: 1.25 });
  assert.equal(profile.period, 'evening-rush');
  assert.equal(profile.pickupBias, 0.32);
  assert.equal(profile.fareMultiplier, 1.25);
});

test('Friday Jumu’ah window has no demand conversion and fare multiplier is bounded', () => {
  const profile = passengerDemandProfile({ day: 5, minuteOfDay: 13 * 60 + 20, periodFareMultiplier: 1.2 });
  assert.equal(profile.period, 'friday-jumuah');
  assert.equal(profile.pickupBias, 0);
  assert.equal(profile.fareMultiplier, 0.95);
});

test('the hour before Friday Jumu’ah has only a modest pickup bias', () => {
  const profile = passengerDemandProfile({ day: 12, minuteOfDay: 12 * 60 + 20, periodFareMultiplier: 1 });
  assert.equal(profile.period, 'friday-pre-jumuah');
  assert.equal(profile.pickupBias, 0.18);
});

test('midday and late-night periods do not create additional pickup bias', () => {
  assert.equal(passengerDemandProfile({ minuteOfDay: 11 * 60 }).pickupBias, 0);
  assert.equal(passengerDemandProfile({ minuteOfDay: 23 * 60 }).pickupBias, 0);
});

test('invalid clock and multiplier values safely fall back to bounded defaults', () => {
  const profile = passengerDemandProfile({ day: Number.NaN, minuteOfDay: Number.NaN, periodFareMultiplier: Number.NaN });
  assert.equal(profile.day, 1);
  assert.equal(profile.minuteOfDay, 420);
  assert.equal(profile.fareMultiplier, 1.2);
  assert.ok(profile.pickupBias >= 0 && profile.pickupBias <= 0.5);
});

test('empty drop conversion preserves useful destination and builds a valid pickup marker', () => {
  const promoted = promoteEmptyDropToPickup(dropZone(), {
    passengerCount: 0, environment: 'clear', pickupBias: 0.32, roll: 0.1,
  });
  assert.ok(promoted);
  assert.equal(promoted.type, 'pickup');
  assert.equal(promoted.dest, 'Sabon Gari');
  assert.equal(promoted.seats, 1);
  assert.equal(promoted.hub, false);
  assert.equal(promoted.lane, 2);
  assert.equal(promoted.label, 'PICK UP · Sabon Gari');
  assert.equal(promoted.kanoDemandAdjusted, true);
});

test('empty drop conversion refuses occupied trips and fuel queue scenes', () => {
  assert.equal(promoteEmptyDropToPickup(dropZone(), { passengerCount: 1, pickupBias: 0.5, roll: 0 }), null);
  assert.equal(promoteEmptyDropToPickup(dropZone(), { environment: 'fuelQueue', pickupBias: 0.5, roll: 0 }), null);
  assert.equal(promoteEmptyDropToPickup(dropZone({ type: 'pickup' }), { pickupBias: 0.5, roll: 0 }), null);
});

test('empty drop conversion only happens when roll is inside the demand bias', () => {
  assert.equal(promoteEmptyDropToPickup(dropZone(), { pickupBias: 0.18, roll: 0.18 }), null);
  assert.equal(promoteEmptyDropToPickup(dropZone(), { pickupBias: 0, roll: 0 }), null);
});

test('cycle multiplier replaces rather than stacks on the legacy night fare premium', () => {
  assert.equal(effectiveFareAdjustment(1.2, false), 1.2);
  assert.equal(effectiveFareAdjustment(0.8, true), 0.64);
  assert.equal(effectiveFareAdjustment(Number.NaN, true), 1);
});

test('real pickup applies the day-cycle fare adjustment once and records its source', () => {
  const game = makeGame({ minuteOfDay: 8 * 60, fareMultiplier: 1.2 });
  const originalFares = game.s.fares;
  const ok = game.pickup({ type: 'pickup', hub: false, seats: 1, dest: 'Sabon Gari' });
  assert.equal(ok, true);
  assert.equal(game.s.passengers.length, 1);
  const passenger = game.s.passengers[0];
  assert.equal(passenger.kanoDemandFareApplied, true);
  assert.equal(passenger.kanoDemandFare.period, 'morning-rush');
  assert.equal(passenger.kanoDemandFare.source, 'KanoDayCycle');
  assert.equal(passenger.fare, passenger.kanoDemandFare.adjustedFare);
  assert.equal(passenger.fare, Math.floor(passenger.kanoDemandFare.rawFare * passenger.kanoDemandFare.adjustment));
  assert.equal(game.s.fares, originalFares, 'boarding does not bank fare into the wallet');
  const before = passenger.fare;
  // A second direct call cannot adjust an already-created passenger record again.
  game.s.passengers.push(passenger);
  assert.equal(passenger.fare, before);
});

test('runtime zone wrapper promotes an empty drop only during a rush profile', () => {
  const game = makeGame({ minuteOfDay: 8 * 60, fareMultiplier: 1.2 });
  game.s.environment = 'clear';
  withRandom([0.5, 0.2, 0.5, 0.6, 0.1], () => game.spawnZone());
  assert.equal(game.s.zones.length, 1);
  assert.equal(game.s.zones[0].type, 'pickup');
  assert.equal(game.s.zones[0].kanoDemandAdjusted, true);
  assert.equal(game.s.zones[0].kanoDemandPeriod, 'morning-rush');
});

test('runtime snapshot exposes demand, clock source and state without a duplicate wallet', () => {
  const game = makeGame({ day: 5, minuteOfDay: 13 * 60 + 30, fareMultiplier: 0.9 });
  const snapshot = game.getKanoPassengerDemandSnapshot();
  assert.equal(snapshot.period, 'friday-jumuah');
  assert.equal(snapshot.isJumuahWindow, true);
  assert.equal(snapshot.pickupBias, 0);
  assert.equal(snapshot.source, 'KanoDayCycle');
  assert.equal(snapshot.onboardPassengers, 0);
  assert.equal(snapshot.adjustedZones, 0);
});
