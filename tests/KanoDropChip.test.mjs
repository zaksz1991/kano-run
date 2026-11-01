import test from 'node:test';
import assert from 'node:assert/strict';
import { dropChipText } from '../js/KanoDropChip.js';

test('chip names the exact drop-off and its distance', () => {
  const text = dropChipText([{ name: 'Student Ali', dest: 'Kofar Mata' }], [{ type: 'drop', dest: 'Kofar Mata', depth: 0.5 }]);
  assert.match(text, /Kofar Mata/);
  assert.match(text, /44 m/);
});
test('with no passenger it points at the next pickup', () => {
  const text = dropChipText([], [{ type: 'pickup', stopName: 'Sabon Gari', dest: 'Dakata', depth: 0.7 }]);
  assert.match(text, /Sabon Gari → Dakata/);
});
