import test from 'node:test';
import assert from 'node:assert/strict';
import { ROUTES, DRIVERS, PAINTS, MISSION_POOL, DAILY_MISSION_POOL } from '../js/config.js';
import { Game } from '../js/game.js';
import { save, submitTribe, tribeStanding, getDailyMissions, addDailyMissionProgress, claimDailyMission, normaliseSave } from '../js/storage.js';
import { purchaseDriver, purchasePaint, selectDriver, selectPaint } from '../js/progression.js';
import { projectRoadDepth } from '../js/renderer2d.js';

// Some gameplay events use window.setTimeout in browsers. Node-based tests use
// the same timer API so the gameplay module can be exercised without a DOM.
globalThis.window = globalThis;

function createHarness() {
  const calls = { toasts: [], events: [], results: [] };
  const ui = {
    bind(game) { this.game = game; },
    startPlay() { calls.started = true; },
    show(id) { calls.shown = id; },
    hide(id) { calls.hidden = id; },
    toast(message) { calls.toasts.push(String(message)); },
    update() {},
    event(...args) { calls.events.push(args); },
    hideEvent() { calls.eventHidden = true; },
    gameOver(result) { calls.results.push(result); },
  };
  const audio = {
    start() {}, engine() {}, horn() {}, pickup() {}, crash() {},
  };
  const game = new Game(ui, audio, { mobile: true });
  return { game, ui, audio, calls };
}

test('Kano route and driver catalog meets minimum content size', () => {
  assert.ok(ROUTES.length >= 60, `expected 60+ routes, got ${ROUTES.length}`);
  assert.ok(DRIVERS.length >= 7, `expected 7 drivers, got ${DRIVERS.length}`);
  assert.ok(ROUTES.some((route) => route.name === 'Kumbotso'));
  assert.ok(ROUTES.some((route) => route.name === 'Kurmi Market'));
});

test('run starts and ticking updates distance without missing-method exceptions', () => {
  const { game } = createHarness();
  game.start('career');
  game.s.invuln = 60;
  game.gas(true);
  for (let frame = 0; frame < 240; frame += 1) game.tick(1 / 60);
  assert.equal(game.state, 'PLAY');
  assert.ok(game.s.distance > 0);
  assert.ok(Number.isFinite(game.s.speed));
  assert.ok(game.s.zones.length > 0);
  assert.ok(game.s.traffic.length > 0);
});

test('mode selection resets the run and applies the selected mode', () => {
  const { game } = createHarness();
  game.start('career');
  game.s.distance = 2.7;
  game.setMode('fuel');
  assert.equal(game.mode, 'fuel');
  assert.equal(game.s.mode, 'fuel');
  assert.equal(game.s.distance, 0);
  assert.equal(game.s.fuel, 42);
  assert.equal(game.state, 'PLAY');
});

test('collision applies damage once and enables invulnerability frames', () => {
  const { game } = createHarness();
  game.start('career');
  const before = game.s.condition;
  game.hit({ type: 'car' });
  assert.ok(game.s.condition < before);
  assert.ok(game.s.invuln > 0);
});

test('drop removes one passenger and records fare progress', () => {
  const { game } = createHarness();
  game.start('career');
  game.s.passengers = [{ name: 'Amina', dest: game.route.name, seats: 1, fare: 500, class: 'worker' }];
  game.s.speed = 0; game.s.signedSpeed = 0;
  const fareBefore = game.s.fares;
  assert.equal(game.drop({ dest: game.route.name }), true);
  assert.equal(game.s.passengers.length, 0);
  assert.equal(game.s.drops, 1);
  assert.ok(game.s.fares > fareBefore);
});

test('paid continue cannot leave the player stuck on the over screen', () => {
  const { game, calls } = createHarness();
  game.start('career');
  game.state = 'OVER';
  game.s.runEnded = true;
  game.s.lives = 0;
  game.s.paidContinueCost = 400;
  save.money = Math.max(save.money || 0, 1500);
  game.continueRun(true);
  assert.equal(game.state, 'PLAY');
  assert.equal(game.s.runEnded, false);
  assert.ok(game.s.invuln >= 4);
  assert.equal(calls.hidden, 'over-screen');
});


test('run mission counters accumulate events instead of stalling at one', () => {
  const { game } = createHarness();
  game.start('career');
  const targets = [
    { id: 'test-drops', key: 'drops', target: 3, reward: 50 },
    { id: 'test-boards', key: 'boards', target: 2, reward: 50 },
    { id: 'test-fares', key: 'fares', target: 1000, reward: 50 },
    { id: 'test-near', key: 'nearMisses', target: 3, reward: 50 },
    { id: 'test-horns', key: 'horns', target: 2, reward: 50 },
  ];
  game.s.missions = targets.map((mission) => ({ ...mission, done: false }));
  game.s.missionProgress = {};
  for (let index = 0; index < 3; index += 1) game.missionAdd('drops', 1);
  for (let index = 0; index < 2; index += 1) game.missionAdd('boards', 1);
  game.missionAdd('fares', 500);
  game.missionAdd('fares', 500);
  for (let index = 0; index < 3; index += 1) game.missionAdd('nearMisses', 1);
  game.missionAdd('horns', 1);
  game.missionAdd('horns', 1);
  assert.ok(game.s.missions.every((mission) => mission.done), 'each repeated action should complete its target');
  assert.equal(game.s.missionProgress['test-drops'], 3);
  assert.equal(game.s.missionProgress['test-boards'], 2);
  assert.equal(game.s.missionProgress['test-fares'], 1000);
  assert.equal(game.s.missionProgress['test-near'], 3);
  assert.equal(game.s.missionProgress['test-horns'], 2);
});

test('combo and clean-distance missions track a peak rather than adding repeated snapshots', () => {
  const { game } = createHarness();
  game.start('career');
  game.s.missions = [
    { id: 'test-combo', key: 'combo', target: 4, reward: 50, done: false },
    { id: 'test-clean', key: 'noCollisionKm', target: 1.5, reward: 50, done: false },
  ];
  game.s.missionProgress = {};
  game.missionAdd('combo', 2);
  game.missionAdd('combo', 3);
  game.missionAdd('combo', 1);
  game.missionAdd('noCollisionKm', 0.5);
  game.missionAdd('noCollisionKm', 1.0);
  game.missionAdd('noCollisionKm', 0.4);
  assert.equal(game.s.missionProgress['test-combo'], 3);
  assert.equal(game.s.missionProgress['test-clean'], 1.0);
  assert.equal(game.s.missions.every((mission) => !mission.done), true);
});

test('tribal leaderboards keep only the top three scores', () => {
  save.tribes.hausa = [];
  submitTribe({ score: 100, distance: 1, driver: 'A', mode: 'career' }, 'hausa');
  submitTribe({ score: 900, distance: 2, driver: 'B', mode: 'career' }, 'hausa');
  submitTribe({ score: 500, distance: 3, driver: 'C', mode: 'career' }, 'hausa');
  submitTribe({ score: 200, distance: 4, driver: 'D', mode: 'career' }, 'hausa');
  assert.deepEqual(save.tribes.hausa.map((row) => row.score), [900, 500, 200]);
  assert.ok(tribeStanding()[0].total >= 1600);
});


test('each KAROTA choice counts exactly one resolved checkpoint', () => {
  const { game } = createHarness();
  game.start('career');
  game.state = 'EVENT';
  game.s.event = 'karota';
  game.s.missions = [{ id: 'karota1', key: 'checkpoints', target: 1, reward: 50, done: false }];
  game.s.missionProgress = {};
  const before = game.s.checkpoints;
  game.resolveEvent('pay');
  assert.equal(game.s.checkpoints, before + 1);
  assert.equal(game.s.missionProgress.karota1, 1);
});

test('forced final completion submits the run without offering another continue', () => {
  const { game, calls } = createHarness();
  game.start('timeAttack');
  game.finishRun('Bronze medal');
  assert.equal(game.state, 'OVER');
  assert.equal(calls.results.length, 1);
  assert.equal(calls.results[0].soft, false);
  assert.equal(calls.results[0].reason, 'Bronze medal');
});


test('garage unlocks drivers and paint only when funds cover the price', () => {
  const before = {
    money: save.money,
    unlocks: [...save.unlocks],
    unlockedPaints: [...save.unlockedPaints],
    driverId: save.driverId,
    paint: save.paint,
    paintId: save.paintId,
  };
  try {
    save.money = 100;
    save.unlocks = save.unlocks.filter((id) => id !== 'dan-yaro');
    const denied = purchaseDriver('dan-yaro');
    assert.equal(denied.ok, false);
    assert.equal(save.unlocks.includes('dan-yaro'), false);

    save.money = 5000;
    const boughtDriver = purchaseDriver('dan-yaro');
    assert.equal(boughtDriver.ok, true);
    assert.equal(save.driverId, 'dan-yaro');
    assert.equal(save.money, 2800);
    assert.equal(selectDriver('mayen-mata').ok, false);

    const boughtPaint = purchasePaint('arewa-green');
    assert.equal(boughtPaint.ok, true);
    assert.equal(save.paint, PAINTS.find((paint) => paint.id === 'arewa-green').color);
    assert.equal(save.money, 1900);
    assert.equal(selectPaint('gold').ok, true);
    assert.equal(save.paintId, 'gold');
  } finally {
    save.money = before.money;
    save.unlocks = before.unlocks;
    save.unlockedPaints = before.unlockedPaints;
    save.driverId = before.driverId;
    save.paint = before.paint;
    save.paintId = before.paintId;
  }
});

test('daily missions persist progress and pay each reward only once', () => {
  const previousDaily = save.daily;
  const previousMoney = save.money;
  const pool = [{ id: 'test-drops', text: 'Drop two passengers', target: 2, key: 'drops', reward: 300 }];
  try {
    save.daily = { ...save.daily, missionDate: '', missionIds: [], progress: {}, claimedMissions: [] };
    assert.equal(getDailyMissions(pool).length, 1);
    assert.deepEqual(addDailyMissionProgress('drops', 1, pool), []);
    const ready = addDailyMissionProgress('drops', 1, pool);
    assert.equal(ready.length, 1);
    assert.equal(ready[0].claimable, true);
    const walletBefore = save.money;
    const claim = claimDailyMission('test-drops', pool);
    assert.equal(claim.ok, true);
    assert.equal(save.money, walletBefore + 300);
    assert.equal(claimDailyMission('test-drops', pool).ok, false);
  } finally {
    save.daily = previousDaily;
    save.money = previousMoney;
  }
});

test('two-way route configuration creates oncoming traffic in the opposing lane', () => {
  const oldRoadMode = save.roadMode;
  try {
    save.roadMode = 'twoway';
    const { game } = createHarness();
    assert.ok(game.s.traffic.every((vehicle) => vehicle.direction === (vehicle.lane === 0 ? -1 : 1)));
  } finally {
    save.roadMode = oldRoadMode;
  }
});

test('time attack finishes at the 3.5 km target with a medal result', () => {
  const { game, calls } = createHarness();
  game.start('timeAttack');
  game.s.distance = 3.499;
  game.s.speed = 150; game.s.signedSpeed = 150;
  game.s.invuln = 60;
  game.tick(0.045);
  assert.equal(game.state, 'OVER');
  assert.match(calls.results[0].reason, /Gold medal|Silver medal|Bronze medal/);
  assert.equal(calls.results[0].soft, false);
});

test('potholes damage tyres and are counted by the challenge', () => {
  const { game } = createHarness();
  game.start('potholes');
  game.s.speed = 70; game.s.signedSpeed = 70;
  game.s.zones = [{ id: 'test-pothole', type: 'pothole', lane: 1, depth: 0.008, dest: game.route.name, seats: 0, hub: false, label: '', warned: false }];
  const tyresBefore = game.s.tyres;
  game.moveZones(1 / 60);
  assert.equal(game.s.potholeHits, 1);
  assert.ok(game.s.tyres < tyresBefore);
  assert.ok(game.s.speed < 70);
});

test('Match Drop applies the wrong-stop penalty when destination does not match', () => {
  const { game } = createHarness();
  game.start('matchDrop');
  game.s.passengers = [{ name: 'Amina', dest: 'Kumbotso', seats: 1, fare: 1000, class: 'worker' }];
  game.s.speed = 0; game.s.signedSpeed = 0;
  game.s.streak = 2;
  game.drop({ dest: game.route.name });
  assert.equal(game.s.matchedDrops, 0);
  assert.equal(game.s.streak, 0);
  assert.equal(game.s.fares, 350);
});

test('Potholes Challenge fails after eight hits at the 3 km finish', () => {
  const { game, calls } = createHarness();
  game.start('potholes');
  game.s.distance = 2.999;
  game.s.speed = 150; game.s.signedSpeed = 150;
  game.s.potholeHits = 8;
  game.s.invuln = 60;
  game.tick(0.045);
  assert.equal(game.state, 'OVER');
  assert.equal(calls.results[0].reason, 'Too many potholes');
});


test('mission pool covers driving skill, street pressure and end-run conditions', () => {
  assert.ok(MISSION_POOL.length >= 24);
  for (const id of ['safeSpeed', 'cleanRoad', 'horn3', 'richDrama', 'endFuel', 'endCondition', 'potholesClean', 'streak3']) {
    assert.ok(MISSION_POOL.some((mission) => mission.id === id), `missing mission ${id}`);
  }
});

test('terminal missions award only when end-run thresholds are met', () => {
  const { game } = createHarness();
  game.start('career');
  game.s.missions = MISSION_POOL.filter((mission) => ['endFuel', 'endCondition', 'potholesClean'].includes(mission.id))
    .map((mission) => ({ ...mission, done: false }));
  game.s.missionProgress = {};
  game.s.fuel = 35;
  game.s.condition = 82;
  game.s.distance = 3.2;
  game.s.potholeHits = 7;
  const scoreBefore = game.s.score;
  game.completeTerminalMissions();
  assert.ok(game.s.missions.every((mission) => mission.done));
  assert.equal(game.s.score - scoreBefore, game.s.missions.reduce((sum, mission) => sum + mission.reward, 0));
});

test('clean-distance and safe-speed mission trackers advance during a clear run', () => {
  const { game } = createHarness();
  game.start('career');
  game.s.traffic = [];
  game.s.zones = [];
  game.s.speed = 110; game.s.signedSpeed = 110;
  game.s.invuln = 60;
  game.tick(0.045);
  assert.ok(game.s.cleanDistance > 0);
  assert.ok(game.s.safeSpeedSeconds > 0);
});


test('matched destination streak advances in Career, completes run mission and updates the daily streak mission', () => {
  const previousDaily = save.daily;
  const dateParts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Africa/Lagos', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(new Date());
  const dateFields = Object.fromEntries(dateParts.map((part) => [part.type, part.value]));
  const todayWAT = `${dateFields.year}-${dateFields.month}-${dateFields.day}`;
  try {
    save.daily = { ...save.daily, missionDate: todayWAT, missionIds: ['streak3'], progress: {}, claimedMissions: [] };
    const { game } = createHarness();
    game.start('career');
    game.s.missions = [{ ...MISSION_POOL.find((mission) => mission.id === 'streak3'), done: false }];
    game.s.missionProgress = {};
    game.s.speed = 0; game.s.signedSpeed = 0;
    for (let index = 0; index < 3; index += 1) {
      game.s.passengers = [{ name: 'Amina', dest: 'Kumbotso', seats: 1, fare: 400, class: 'worker' }];
      game.drop({ dest: 'Kumbotso' });
    }
    game.missionUpdate();
    assert.equal(game.s.streak, 3);
    assert.equal(game.s.missions[0].done, true);
    assert.equal(save.daily.progress.streak3, 3);
  } finally {
    save.daily = previousDaily;
  }
});

test('corrupted browser saves are normalized to safe routes, paint, dialect, radio and settings', () => {
  const clean = normaliseSave({
    money: -100,
    highScore: 'not-a-number',
    routeId: 'not-a-route',
    driverId: 'not-a-driver',
    paintId: 'not-a-paint',
    paint: 'javascript:alert(1)',
    radioIndex: 'bad',
    dialect: 'made-up',
    camera: 'teleport',
    roadMode: 'wrong-way?',
    muted: 'yes',
    unlocks: ['not-a-driver'],
    unlockedPaints: ['fake-paint'],
    tribes: { hausa: [{ score: '999999' }, { score: 20 }], yoruba: [], igbo: [] },
    bestTimes: { 'route-1': -5, 'not-a-route': 10 },
    settings: { quality: 'ultra', shake: 'yes' },
    daily: { streak: -4, progress: { clean: 4, bad: Infinity } },
  });
  assert.equal(clean.money, 0);
  assert.equal(clean.highScore, 0);
  assert.equal(clean.routeId, ROUTES[0].id);
  assert.ok(DRIVERS.some((driver) => driver.id === clean.driverId));
  assert.match(clean.paint, /^#[0-9a-f]{6}$/i);
  assert.equal(clean.radioIndex, 0);
  assert.equal(clean.dialect, 'hausa');
  assert.equal(clean.camera, 'chase');
  assert.equal(clean.roadMode, 'oneway');
  assert.equal(clean.muted, false);
  assert.deepEqual(clean.tribes.hausa.map((entry) => entry.score), [20]);
  assert.deepEqual(clean.bestTimes, {});
  assert.equal(clean.settings.quality, 'auto');
  assert.equal(clean.settings.shake, true);
  assert.equal(clean.daily.streak, 0);
  assert.deepEqual(clean.daily.progress, { clean: 4 });
});


test('Career starts at a calmer urban cruise and gas stays below racing-game speeds', () => {
  const { game } = createHarness();
  game.start('career');
  game.gas(false);
  game.s.invuln = 100;
  for (let frame = 0; frame < 180; frame += 1) game.tick(1 / 60);
  assert.ok(game.s.speed < 1, `keke should stop coasting when throttle is released, got ${game.s.speed} km/h`);
  game.gas(true);
  for (let frame = 0; frame < 180; frame += 1) game.tick(1 / 60);
  assert.ok(game.s.speed > 35 && game.s.speed < 50, `accelerated city speed was ${game.s.speed} km/h`);
  game.start('timeAttack');
  game.s.invuln = 100;
  game.gas(true);
  for (let frame = 0; frame < 180; frame += 1) game.tick(1 / 60);
  assert.ok(game.s.speed > 125 && game.s.speed <= 170, `Time Attack should reach its separate race-mode speed: ${game.s.speed} km/h`);
});

test('roadside pickup zones stop advancing when the keke is fully stopped', () => {
  const { game } = createHarness();
  game.start('career');
  game.s.speed = 0; game.s.signedSpeed = 0;
  const before = game.s.zones.map((zone) => zone.depth);
  game.moveZones(1.5);
  const after = game.s.zones.map((zone) => zone.depth);
  assert.deepEqual(after, before, 'a stationary driver must be able to wait at a pickup without the pad drifting away');
});


test('same-direction traffic recedes when faster than the keke; overtaking and oncoming traffic close gaps', () => {
  const { game } = createHarness();
  game.start('career');
  game.s.traffic = [{ id: 'receding', type: 'car', lane: 1, direction: 1, depth: 1, speedKmh: 24, passed: false }];
  game.s.speed = 0; game.s.signedSpeed = 0;
  game.moveTraffic(1);
  assert.ok(game.s.traffic[0].depth > 1, 'stationary keke should watch same-way traffic pull away');
  game.s.traffic = [{ id: 'overtake', type: 'car', lane: 1, direction: 1, depth: 1, speedKmh: 12, passed: false }];
  game.s.speed = 38; game.s.signedSpeed = 38;
  game.moveTraffic(1);
  assert.ok(game.s.traffic[0].depth < 1, 'faster player should close the gap to slower traffic');
  game.s.traffic = [{ id: 'oncoming', type: 'car', lane: 0, direction: -1, depth: 1, speedKmh: 32, passed: false }];
  game.s.speed = 22; game.s.signedSpeed = 22;
  game.moveTraffic(1);
  assert.ok(game.s.traffic[0].depth < 1, 'oncoming vehicle should close the gap from the opposing lane');
});

test('collision damage scales with relative speed and low-speed scrapes remain recoverable', () => {
  const { game } = createHarness();
  game.start('career');
  game.s.speed = 20; game.s.signedSpeed = 20;
  const before = game.s.condition;
  game.hit({ type: 'car', direction: 1, speedKmh: 19 });
  assert.ok(before - game.s.condition < 1.5, 'near-matching traffic speeds should cause a light scrape');
  assert.ok(game.s.invuln > 0, 'contact must still grant recovery frames');
});

test('all passenger and fuel zones are roadside stops; potholes stay in a travel lane', () => {
  const { game } = createHarness();
  game.start('career');
  for (const zone of game.s.zones) {
    if (zone.type === 'pothole') continue;
    assert.ok(zone.lane === 0 || zone.lane === 2, `stop lane ${zone.lane} should be an outer lane`);
    assert.ok(zone.side === -1 || zone.side === 1);
    assert.equal(zone.roadside, true);
  }
});


test('ordinary roadside pickups use one seat; large and group passengers appear at General Checkpoint only', () => {
  const { game } = createHarness();
  game.start('career');
  const originalRandom = Math.random;
  try {
    Math.random = () => 0.99;
    assert.equal(game.pickup({ hub: false, seats: 1, dest: 'Kurmi Market' }), true);
    assert.equal(game.s.passengers[0].seats, 1, 'a roadside pickup is a single seat');
    assert.doesNotMatch(game.s.passengers[0].name, /large passenger/i);
    game.s.passengers = [];
    assert.equal(game.pickup({ hub: true, seats: 3, dest: 'Sabon Gari' }), true);
    assert.equal(game.s.passengers[0].seats, 3, 'the General Checkpoint loads a group by the marked seat count');
    assert.match(game.s.passengers[0].class, /checkpoint group/);
    game.s.passengers = [];
    const values = [0.99, 0.99, 0.1, 0.99, 0.99, 0.99, 0.99, 0.99];
    Math.random = () => values.length ? values.shift() : 0.99;
    assert.equal(game.pickup({ hub: true, seats: 4, dest: 'Kumbotso' }), true);
    assert.equal(game.s.passengers[0].seats, 2, 'a large individual uses two seats at the checkpoint');
    assert.match(game.s.passengers[0].class, /large passenger/);
  } finally {
    Math.random = originalRandom;
  }
});

test('roadside pickup is forgiving at walking speed, while checkpoint groups require a real stop', () => {
  const { game } = createHarness();
  game.start('career');
  game.s.zones = [{ id: 'shoulder-pickup', type: 'pickup', lane: 2, side: 1, roadside: true, depth: 0.1, dest: 'Hotoro', seats: 1, hub: false, label: 'PICK UP', warned: false, retryAt: 0 }];
  game.s.steer = 1;
  game.s.targetLane = 1;
  game.s.speed = 10; game.s.signedSpeed = 10;
  game.moveZones(0.001);
  assert.equal(game.s.passengers.length, 1, 'single roadside pickup accepts a slow roll under 12 km/h');
  assert.equal(game.s.pullOverSide, 1);

  game.s.passengers = [];
  game.s.zones = [{ id: 'general-checkpoint', type: 'pickup', lane: 2, side: 1, roadside: true, depth: 0.1, dest: 'Sabon Gari', seats: 3, hub: true, label: 'GENERAL CHECKPOINT', warned: false, retryAt: 0 }];
  game.s.speed = 9; game.s.signedSpeed = 9;
  game.moveZones(0.001);
  assert.equal(game.s.passengers.length, 0, 'group boarding must wait until almost stopped');
});

test('2D depth projection places a collision at the visible player-keke height', () => {
  const impactT = projectRoadDepth(0.022);
  const farT = projectRoadDepth(1.25);
  const projectedY = 0.36 + (1.02 - 0.36) * impactT * impactT;
  assert.ok(Math.abs(projectedY - 0.585) < 0.012, `impact rendered at ${(projectedY * 100).toFixed(1)}% screen height`);
  assert.ok(farT < 0.06, 'far traffic stays near the horizon');
});
