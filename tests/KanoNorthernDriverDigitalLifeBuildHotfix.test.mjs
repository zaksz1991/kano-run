import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../js/KanoNorthernDriverDigitalLifeUpgrade.js', import.meta.url), 'utf8');

test('digital-life resolved status message quotes the apostrophe safely', () => {
  assert.match(source, /\? "Today's decision has been recorded\./);
  assert.doesNotMatch(source, /\? 'Today's decision has been recorded\./);
});

test('digital-life UI still registers without replacing core game modules', () => {
  assert.match(source, /function install\(\)/);
  assert.match(source, /window\.kanoNorthernDriverDigitalLife\s*=/);
  assert.doesNotMatch(source, /from ['"]\.\/game\.js['"]/);
});
