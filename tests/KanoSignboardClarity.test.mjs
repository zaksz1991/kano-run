import test from 'node:test';
import assert from 'node:assert/strict';
import {
  KANO_SIGNBOARD_TEXTURE_PROFILE,
  getKanoSignboardTextureProfile,
  isKanoSignboardTextureProfileValid,
} from '../js/KanoSignboardClarityRules.js';

test('sign texture profile increases source detail moderately over 1200x300', () => {
  assert.equal(KANO_SIGNBOARD_TEXTURE_PROFILE.width, 1536);
  assert.equal(KANO_SIGNBOARD_TEXTURE_PROFILE.height, 384);
  assert.ok(KANO_SIGNBOARD_TEXTURE_PROFILE.width * KANO_SIGNBOARD_TEXTURE_PROFILE.height < 600_000);
});

test('title font is larger than the previous 92px setting', () => {
  assert.ok(KANO_SIGNBOARD_TEXTURE_PROFILE.titleFontSize > 92);
  assert.ok(KANO_SIGNBOARD_TEXTURE_PROFILE.subtitleFontSize > 39);
});

test('text positions fit within the sign canvas', () => {
  assert.ok(KANO_SIGNBOARD_TEXTURE_PROFILE.titleY < KANO_SIGNBOARD_TEXTURE_PROFILE.subtitleY);
  assert.ok(KANO_SIGNBOARD_TEXTURE_PROFILE.subtitleY < KANO_SIGNBOARD_TEXTURE_PROFILE.height);
});

test('texture profile stays within a conservative anisotropy ceiling', () => {
  assert.equal(getKanoSignboardTextureProfile({ maxAnisotropy: 2 }).anisotropy, 2);
  assert.equal(getKanoSignboardTextureProfile({ maxAnisotropy: 8 }).anisotropy, 4);
  assert.equal(getKanoSignboardTextureProfile({ maxAnisotropy: 0 }).anisotropy, 1);
});

test('unknown anisotropy limit falls back safely', () => {
  assert.equal(getKanoSignboardTextureProfile({ maxAnisotropy: NaN }).anisotropy, 4);
});

test('valid profile is accepted', () => {
  assert.equal(isKanoSignboardTextureProfileValid(KANO_SIGNBOARD_TEXTURE_PROFILE), true);
});

test('invalid dimensions and text positions are rejected', () => {
  assert.equal(isKanoSignboardTextureProfileValid(null), false);
  assert.equal(isKanoSignboardTextureProfileValid({ ...KANO_SIGNBOARD_TEXTURE_PROFILE, width: 1 }), false);
  assert.equal(isKanoSignboardTextureProfileValid({ ...KANO_SIGNBOARD_TEXTURE_PROFILE, subtitleY: 500 }), false);
});
