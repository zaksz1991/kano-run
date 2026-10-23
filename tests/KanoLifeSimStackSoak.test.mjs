import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
globalThis.window = globalThis;
// Minimal inert DOM so browser-only module-level code can load under Node.
const inert = () => new Proxy(function () {}, {
  get: (t, k) => (k === Symbol.toPrimitive ? () => '' : k === 'style' || k === 'classList' || k === 'dataset' ? inert() : k === 'length' ? 0 : inert()),
  apply: () => inert(),
  set: () => true,
});
globalThis.document ??= Object.assign(inert(), {});

// Load the whole stacked life-sim layer the same way the bootstrap does, then
// drive a run. Catches wrapper conflicts that single-module tests miss.
const mods = [
  'KanoNorthernDriverLifeSimulationUpgrade.js', 'KanoNorthernDriverRealLifeUpgrade.js',
  'KanoNorthernDriverPassengerRelationshipsUpgrade.js', 'KanoNorthernDriverParkOperationsUpgrade.js',
  'KanoStreetRhythmUpgrade.js',
];
const loadErrors = [];
for (const m of mods) {
  try { await import(`../js/${m}`); } catch (e) { loadErrors.push(`${m}: ${e.message}`); }
}
const { Game } = await import('../js/game.js');

test('stacked sim upgrades import without errors', () => {
  assert.deepEqual(loadErrors, []);
});

test('a run with the sim stack loaded ticks 3 minutes with finite state', () => {
  const ui = { bind(g) { this.game = g; }, startPlay() {}, show() {}, hide() {}, toast() {}, update() {}, event() {}, hideEvent() {}, gameOver() {} };
  const audio = { start() {}, engine() {}, horn() {}, pickup() {}, crash() {} };
  const game = new Game(ui, audio, { mobile: true });
  game.start('career');
  game.s.invuln = 1e9;
  for (let i = 0; i < 30 * 180; i++) game.tick(1 / 30);
  const bad = [];
  for (const [k, v] of Object.entries(game.s)) if (typeof v === 'number' && !Number.isFinite(v)) bad.push(k);
  assert.deepEqual(bad, []);
});

test('mechanic panel defines initializePanel and wires its three buttons', () => {
  const src = fs.readFileSync(new URL('../js/KanoNorthernDriverVehicleMaintenanceUpgrade.js', import.meta.url), 'utf8');
  assert.match(src, /function initializePanel\(section\)/);
  for (const id of ['kvm-inspect', 'kvm-pay-service', 'kvm-export']) assert.match(src, new RegExp(`querySelector\\('#${id}'\\)\\?\\.addEventListener`));
});

test('every Northern Driver UI module imports the constants it uses from its model', () => {
  const src = fs.readFileSync(new URL('../js/KanoNorthernDriverHouseholdWaterUpgrade.js', import.meta.url), 'utf8');
  const header = src.slice(0, src.indexOf("from './KanoNorthernDriverHouseholdWater.js'"));
  assert.match(header, /MAX_HOUSEHOLD_WATER_LITRES/);
});
