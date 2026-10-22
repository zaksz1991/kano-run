import test from 'node:test';
import assert from 'node:assert/strict';
import {
  canUse2D,
  createWebGLUnavailableError,
  isWebGLUnavailableError,
  shouldRebuild3DAfterFrameError,
} from '../js/KanoRenderModePolicy.js';

test('auto quality never authorizes a 2D downgrade merely because rendering is slow', () => {
  assert.equal(canUse2D({ userSelected2D: false, webglUnavailable: false }), false);
});

test('2D is permitted when the user explicitly selects it in Settings', () => {
  assert.equal(canUse2D({ userSelected2D: true }), true);
});

test('2D is permitted for a debug audit override', () => {
  assert.equal(canUse2D({ force2d: true }), true);
});

test('only a tagged no-WebGL probe error is classified as truly unavailable', () => {
  assert.equal(isWebGLUnavailableError(createWebGLUnavailableError()), true);
  assert.equal(isWebGLUnavailableError(new Error('renderer constructor failed')), false);
  assert.equal(isWebGLUnavailableError(Object.assign(new Error('context lost'), { code: 'KANO_WEBGL_TEMPORARILY_UNAVAILABLE' })), false);
});

test('a context or frame error after 3D is running asks for a 3D rebuild, not a mode change', () => {
  assert.equal(shouldRebuild3DAfterFrameError({ renderMode: '3D', runtimeFailureCount: 1 }), false);
  assert.equal(shouldRebuild3DAfterFrameError({ renderMode: '3D', runtimeFailureCount: 2 }), true);
  assert.equal(shouldRebuild3DAfterFrameError({ renderMode: '2D', runtimeFailureCount: 4 }), false);
});
