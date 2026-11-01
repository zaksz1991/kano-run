import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildAdaptiveQualityPlan,
  classifyAdaptivePerformance,
  chooseAdaptiveQualityAction,
} from '../js/KanoAdaptiveQualityPolicy.js';

test('weak-phone emergency ladder lowers resolution only below the normal 1:1 floor', () => {
  const plan = buildAdaptiveQualityPlan({
    baseRatio: 1.25,
    minimumRatio: 1,
    startupRatio: 1.25,
    mobile: true,
    emergencyFloor: 0.82,
  });
  assert.equal(plan.emergencyResolution, true);
  assert.equal(plan.minimumRatio, 0.82);
  assert.ok(plan.levels.includes(1));
  assert.ok(plan.levels.some((ratio) => ratio < 1));
  assert.equal(plan.levels[0], 1.25);
  assert.ok(plan.levels.every((ratio, index, list) => index === 0 || ratio <= list[index - 1]));
  assert.ok(plan.lodDistances.length >= plan.levels.length);
});

test('normal and desktop profiles do not receive emergency sub-1.0 resolution levels', () => {
  const normal = buildAdaptiveQualityPlan({
    baseRatio: 1.5,
    minimumRatio: 1,
    startupRatio: 1.35,
    mobile: true,
  });
  const desktop = buildAdaptiveQualityPlan({
    baseRatio: 1.5,
    minimumRatio: 0.84,
    startupRatio: 1.3,
    mobile: false,
    emergencyFloor: 0.7,
  });
  assert.equal(normal.emergencyResolution, false);
  assert.ok(normal.levels.every((ratio) => ratio >= 1));
  assert.equal(desktop.emergencyResolution, false);
  assert.ok(desktop.levels.every((ratio) => ratio >= 0.84));
});

test('FPS classification isolates critical, slow, stable, headroom and missing samples', () => {
  assert.equal(classifyAdaptivePerformance(17, { mobile: true }), 'critical');
  assert.equal(classifyAdaptivePerformance(24, { mobile: true }), 'slow');
  assert.equal(classifyAdaptivePerformance(35, { mobile: true }), 'stable');
  assert.equal(classifyAdaptivePerformance(55, { mobile: true }), 'headroom');
  assert.equal(classifyAdaptivePerformance(0, { mobile: true }), 'unknown');
});

test('quality reduces only after repeated slow windows and a hold period', () => {
  const common = { fps: 17, slowWindows: 2, fastWindows: 0, levelIndex: 0, levelCount: 10, mobile: true };
  assert.equal(chooseAdaptiveQualityAction({ ...common, sinceChangeMs: 500 }), 'hold');
  assert.equal(chooseAdaptiveQualityAction({ ...common, sinceChangeMs: 800 }), 'reduce');
  assert.equal(chooseAdaptiveQualityAction({ ...common, fps: 25, sinceChangeMs: 900 }), 'hold');
  assert.equal(chooseAdaptiveQualityAction({ ...common, fps: 25, sinceChangeMs: 1300 }), 'reduce');
});

test('quality recovery requires sustained headroom and cannot exceed the highest level', () => {
  const common = { fps: 55, slowWindows: 0, fastWindows: 12, sinceChangeMs: 12000, levelCount: 10, mobile: true };
  assert.equal(chooseAdaptiveQualityAction({ ...common, levelIndex: 2 }), 'restore');
  assert.equal(chooseAdaptiveQualityAction({ ...common, levelIndex: 0 }), 'hold');
  assert.equal(chooseAdaptiveQualityAction({ ...common, fps: 40, levelIndex: 2 }), 'hold');
});
