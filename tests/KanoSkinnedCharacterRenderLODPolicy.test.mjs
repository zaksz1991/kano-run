import test from 'node:test';
import assert from 'node:assert/strict';
import {
  chooseSkinnedCharacterRenderMode,
  KANO_CHARACTER_STATIC_POSE_ENTER_DISTANCE,
  KANO_CHARACTER_STATIC_POSE_EXIT_DISTANCE,
} from '../js/KanoSkinnedCharacterRenderLOD.js';

test('static-pose LOD is only considered for mobile idle characters', () => {
  assert.equal(chooseSkinnedCharacterRenderMode({ mobile: false, role: 'idle', distanceSquared: 10_000 }), 'skinned');
  assert.equal(chooseSkinnedCharacterRenderMode({ mobile: true, role: 'walk', distanceSquared: 10_000 }), 'skinned');
  assert.equal(chooseSkinnedCharacterRenderMode({ mobile: true, role: 'idle', distanceSquared: 100 }), 'skinned');
});

test('far idle characters enter static-pose rendering at the configured distance', () => {
  const threshold = KANO_CHARACTER_STATIC_POSE_ENTER_DISTANCE ** 2;
  assert.equal(chooseSkinnedCharacterRenderMode({ mobile: true, role: 'idle', distanceSquared: threshold - 1 }), 'skinned');
  assert.equal(chooseSkinnedCharacterRenderMode({ mobile: true, role: 'idle', distanceSquared: threshold }), 'static-pose');
});

test('static-pose LOD uses hysteresis before restoring skeletal rendering', () => {
  const exit = KANO_CHARACTER_STATIC_POSE_EXIT_DISTANCE ** 2;
  assert.equal(KANO_CHARACTER_STATIC_POSE_ENTER_DISTANCE > KANO_CHARACTER_STATIC_POSE_EXIT_DISTANCE, true);
  assert.equal(chooseSkinnedCharacterRenderMode({ mobile: true, role: 'idle', distanceSquared: exit + 1, staticPoseActive: true }), 'static-pose');
  assert.equal(chooseSkinnedCharacterRenderMode({ mobile: true, role: 'idle', distanceSquared: exit, staticPoseActive: true }), 'skinned');
});

test('missing camera distance fails safe to the original skinned model', () => {
  assert.equal(chooseSkinnedCharacterRenderMode({ mobile: true, role: 'idle', distanceSquared: NaN }), 'skinned');
  assert.equal(chooseSkinnedCharacterRenderMode({ mobile: true, role: 'idle', distanceSquared: Infinity, staticPoseActive: true }), 'skinned');
});
