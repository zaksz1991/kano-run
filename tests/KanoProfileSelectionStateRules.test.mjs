import test from 'node:test';
import assert from 'node:assert/strict';
import { chooseEnabledValue, normalizeRouteId, normalizeUnlockedDriverId } from '../js/KanoProfileSelectionStateRules.js';

test('preserves a valid route ID', () => {
  assert.equal(normalizeRouteId('r2', [{ id: 'r1', name: 'A' }, { id: 'r2', name: 'B' }]), 'r2');
});
test('normalizes a saved route name or stale route to an available ID', () => {
  const routes = [{ id: 'r1', name: 'A' }, { id: 'r2', name: 'B' }];
  assert.equal(normalizeRouteId('B', routes), 'r2');
  assert.equal(normalizeRouteId('deleted-route', routes), 'r1');
});
test('never selects a locked driver when an unlocked driver exists', () => {
  const drivers = [{ id: 'ruffneck' }, { id: 'premium' }];
  assert.equal(normalizeUnlockedDriverId('premium', drivers, ['ruffneck']), 'ruffneck');
});
test('falls back to the free starter when old save has no valid unlocked driver', () => {
  assert.equal(normalizeUnlockedDriverId('missing', [{ id: 'ruffneck' }, { id: 'premium' }], []), 'ruffneck');
});
test('select normalizer skips disabled values and selects a valid fallback', () => {
  const options = [{ value: 'paid', disabled: true }, { value: 'free', disabled: false }];
  assert.equal(chooseEnabledValue('paid', options, 'free'), 'free');
});
test('select normalizer does not invent a choice for empty options', () => {
  assert.equal(chooseEnabledValue('bad', [], 'fallback'), '');
});
