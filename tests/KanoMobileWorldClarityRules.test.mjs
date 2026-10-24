import test from 'node:test';
import assert from 'node:assert/strict';
import {
  chooseMobileClarityFloor,
  clampRequestedMobileRatio,
  getClarityTextureSettings,
  normalizeSharpness,
  shouldUseMipmapFiltering,
} from '../js/KanoMobileWorldClarityRules.js';

test('standard clarity floor stays native-CSS-scale when frame pacing is healthy', () => {
  assert.equal(chooseMobileClarityFloor({ fps: 60 }), 1.0);
});

test('standard clarity floor eases down only in the soft-performance band', () => {
  assert.equal(chooseMobileClarityFloor({ fps: 44 }), 0.88);
});

test('emergency slowdown allows a lower ratio to protect playability', () => {
  assert.equal(chooseMobileClarityFloor({ fps: 30 }), 0.62);
});

test('sharp setting has a higher stable-frame floor than standard', () => {
  assert.equal(chooseMobileClarityFloor({ fps: 60, sharpness: 'sharp' }), 1.1);
  assert.equal(chooseMobileClarityFloor({ fps: 60, sharpness: 'standard' }), 1.0);
});

test('max setting remains capped by the current device budget', () => {
  assert.equal(clampRequestedMobileRatio(0.8, { fps: 60, sharpness: 'max', minimumRatio: 0.58, maximumRatio: 1.1 }), 1.1);
});

test('ratio remains within the adaptive controller bounds', () => {
  assert.equal(clampRequestedMobileRatio(0.6, { fps: 60, minimumRatio: 0.58, maximumRatio: 0.92 }), 0.92);
});

test('unknown sharpness values use standard rather than an unsafe multiplier', () => {
  assert.equal(normalizeSharpness('unknown'), 'standard');
});

test('ordinary image textures can use mipmap filtering', () => {
  assert.equal(shouldUseMipmapFiltering({ generateMipmaps: true }), true);
  assert.equal(getClarityTextureSettings({ generateMipmaps: true }).minFilter, 'linear-mipmap-linear');
});

test('data, video and compressed textures avoid forced mipmap filtering', () => {
  assert.equal(shouldUseMipmapFiltering({ isDataTexture: true }), false);
  assert.equal(shouldUseMipmapFiltering({ isVideoTexture: true }), false);
  assert.equal(shouldUseMipmapFiltering({ isCompressedTexture: true }), false);
});

test('texture anisotropy stays bounded to four', () => {
  assert.equal(getClarityTextureSettings({}, 99).anisotropy, 4);
  assert.equal(getClarityTextureSettings({}, 2).anisotropy, 2);
});
