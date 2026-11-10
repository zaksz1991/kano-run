import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { cycleOf, signalPhase } from '../js/KanoTrafficSignalRules.mjs';

test('every junction cycles green 45-60 s and red 45-60 s', () => {
  for (let i = 0; i < 200; i += 1) {
    const c = cycleOf(i);
    assert.ok(c.green >= 45 && c.green <= 60, `green ${c.green}`);
    assert.ok(c.red >= 45 && c.red <= 60, `red ${c.red}`);
  }
});

test('phase sequence is green, amber (last 4 s), then red, and repeats', () => {
  const c = cycleOf(3);
  const seen = new Set();
  for (let t = 0; t < (c.green + c.red) * 2; t += 0.5) seen.add(signalPhase(3, t).state);
  assert.deepEqual([...seen].sort(), ['amber', 'green', 'red']);
  const len = c.green + c.red;
  for (const t of [0, 7, 31, 90]) assert.equal(signalPhase(3, t).state, signalPhase(3, t + len).state);
});

test('countdown never exceeds the configured phase length', () => {
  for (let t = 0; t < 400; t += 1) {
    const p = signalPhase(5, t);
    assert.ok(p.left >= 1 && p.left <= 60);
  }
});

test('deploy completeness: every relative import in js/ resolves to a file', () => {
  const root = path.resolve('js');
  const missing = [];
  const walk = (dir) => fs.readdirSync(dir, { withFileTypes: true }).forEach((e) => {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) return walk(full);
    if (!/\.(m?js)$/.test(e.name)) return;
    const src = fs.readFileSync(full, 'utf8');
    for (const m of src.matchAll(/(?:from\s+|import\s*\(?\s*|import\s+)['"](\.[^'"]+)['"]/g)) {
      if (!fs.existsSync(path.resolve(path.dirname(full), m[1]))) missing.push(`${e.name} -> ${m[1]}`);
    }
  });
  walk(root);
  assert.deepEqual(missing, []);
});
