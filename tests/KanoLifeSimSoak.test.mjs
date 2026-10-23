import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { Game } from '../js/game.js';

globalThis.window = globalThis;

function harness() {
  const ui = { bind(g) { this.game = g; }, startPlay() {}, show() {}, hide() {}, toast() {}, update() {}, event() {}, hideEvent() {}, gameOver() {} };
  const audio = { start() {}, engine() {}, horn() {}, pickup() {}, crash() {} };
  return new Game(ui, audio, { mobile: true });
}

function scanNaN(obj, path, seen, bad, depth = 0) {
  if (depth > 4 || !obj || typeof obj !== 'object' || seen.has(obj)) return;
  seen.add(obj);
  for (const [k, v] of Object.entries(obj)) {
    if (typeof v === 'number' && !Number.isFinite(v)) bad.push(`${path}.${k}=${v}`);
    else if (v && typeof v === 'object' && !Array.isArray(v)) scanNaN(v, `${path}.${k}`, seen, bad, depth + 1);
  }
}

test('core run survives 5 simulated minutes of driving with sane state', () => {
  const game = harness();
  game.start('career');
  game.s.invuln = 1e9;
  const dt = 1 / 30;
  for (let i = 0; i < 30 * 300; i++) {
    game.input = game.input || {};
    game.tick ? game.tick(dt) : game.update(dt);
    if (game.state === 'GAME_OVER' || game.mode === 'GAME_OVER') break;
  }
  const bad = [];
  scanNaN(game.s, 's', new Set(), bad);
  assert.deepEqual(bad, [], `non-finite state: ${bad.slice(0, 8).join(', ')}`);
  assert.ok(Number.isFinite(game.s.distance ?? 0));
});

test('every Northern Driver sim module is reachable from index.html through the import graph', () => {
  const root = new URL('../', import.meta.url).pathname;
  const seen = new Set();
  const stack = [...fs.readFileSync(root + 'index.html', 'utf8').matchAll(/src="\/?(js\/[^"]+)"/g)].map((m) => m[1]);
  while (stack.length) {
    const f = stack.pop();
    if (seen.has(f) || !fs.existsSync(root + f)) continue;
    seen.add(f);
    const dir = f.split('/').slice(0, -1).join('/');
    for (const m of fs.readFileSync(root + f, 'utf8').matchAll(/(?:import|from)\s*\(?\s*['"](\.[^'"]+)['"]/g)) {
      const parts = (dir + '/' + m[1]).split('/');
      const out = [];
      for (const p of parts) { if (p === '..') out.pop(); else if (p !== '.') out.push(p); }
      stack.push(out.join('/'));
    }
  }
  const sim = fs.readdirSync(root + 'js').filter((f) => /^KanoNorthernDriver.*\.js$/.test(f));
  const orphans = sim.filter((f) => !seen.has('js/' + f) && !/Model\.js$|Data\.js$/.test(f));
  assert.deepEqual(orphans, [], `unreachable sim modules: ${orphans.join(', ')}`);
});

test('day-period changes show a street-life toast cue', () => {
  const main = fs.readFileSync(new URL('../js/main.js', import.meta.url), 'utf8');
  assert.match(main, /type === 'period_change'/);
  for (const id of ['fajr', 'morning', 'zuhr', 'asr', 'maghrib', 'isha']) assert.match(main, new RegExp(`${id}: '`));
});
