import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { getMobileRatios, getMobileRenderBudget, getRenderSharpness, RENDER_SHARPNESS_KEY } from '../js/KanoDeviceTier.js';

const store = new Map();
globalThis.localStorage = { getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)), removeItem: (k) => store.delete(k) };

test('sharpness defaults to standard and leaves device budgets unchanged', () => {
  store.clear();
  assert.equal(getRenderSharpness(), 'standard');
  assert.deepEqual(getMobileRatios('mid'), { max: 1.5, start: 1.35, min: 1 });
  assert.deepEqual(getMobileRenderBudget('low'), { max: 1.25, start: 1.1, min: 0.9 });
});

test('sharp and max raise start and floor for every tier and stay ordered', () => {
  for (const mode of ['sharp', 'max']) {
    store.set(RENDER_SHARPNESS_KEY, mode);
    for (const tier of ['high', 'mid', 'low']) {
      const r = getMobileRenderBudget(tier);
      assert.ok(r.min <= r.start && r.start <= r.max, `${mode}/${tier}`);
      assert.ok(r.start >= 1.6 && r.min >= 1.0, `${mode}/${tier} not sharper`);
    }
  }
  store.clear();
});

test('invalid stored value falls back to standard', () => {
  store.set(RENDER_SHARPNESS_KEY, 'ultra');
  assert.equal(getRenderSharpness(), 'standard');
  store.clear();
});

test('phone comfort module is loaded by index.html and compacts the road guide', () => {
  assert.match(fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8'), /KanoPhoneComfortUpgrade\.js/);
  const src = fs.readFileSync(new URL('../js/KanoPhoneComfortUpgrade.js', import.meta.url), 'utf8');
  assert.match(src, /kano-road-navigation/);
  assert.match(src, /sharpness-select/);
});
