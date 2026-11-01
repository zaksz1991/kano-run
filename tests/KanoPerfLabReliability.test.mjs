import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  summarizeFrameTimestamps,
  compareBracketedSamples,
  KANO_PERF_LAB_CONFIG,
} from '../js/KanoPerfLab.js';

const perfLabSource = fs.readFileSync(new URL('../js/KanoPerfLab.js', import.meta.url), 'utf8');
const animationSource = fs.readFileSync(new URL('../js/KanoAnimationTrafficUpgrade.js', import.meta.url), 'utf8');

 test('frame summary reports elapsed-time FPS, median, p95 and slow-frame ratio', () => {
  const result = summarizeFrameTimestamps([0, 16, 32, 67, 83], 83);
  assert.equal(result.frames, 5);
  assert.equal(result.intervals, 4);
  assert.ok(Math.abs(result.fps - (4 / 0.083)) < 0.001);
  assert.equal(result.medianFrameMs, 16);
  assert.equal(result.p95FrameMs, 35);
  assert.equal(result.slowFramePercent, 25);
});

test('invalid or insufficient frame samples remain unavailable rather than becoming fake zero metrics', () => {
  const result = summarizeFrameTimestamps([10], 1000);
  assert.equal(result.fps, null);
  assert.equal(result.averageFrameMs, null);
  assert.equal(result.medianFrameMs, null);
  assert.equal(result.p95FrameMs, null);
  assert.equal(result.slowFramePercent, null);
});

test('intervention is compared with the mean of its neighbouring baseline samples', () => {
  const result = compareBracketedSamples({ fps: 20 }, { fps: 25 }, { fps: 18 });
  assert.equal(result.baselineFps, 19);
  assert.equal(result.deltaFps, 6);
  assert.ok(Math.abs(result.driftPercent - (2 / 19) * 100) < 0.0001);
  assert.equal(result.stable, true);
});

test('large baseline drift marks the comparison unstable and excludes ranking eligibility', () => {
  const result = compareBracketedSamples({ fps: 20 }, { fps: 30 }, { fps: 10 });
  assert.equal(result.stable, false);
  assert.equal(result.driftPercent, (10 / 15) * 100);
});

test('missing baseline or intervention samples remain null and cannot be ranked as zero FPS', () => {
  const result = compareBracketedSamples({ fps: null }, { fps: null }, { fps: undefined });
  assert.equal(result.baselineFps, null);
  assert.equal(result.duringFps, null);
  assert.equal(result.deltaFps, null);
  assert.equal(result.stable, false);
});

test('benchmark uses warm-up and bracketed controls with a configurable stability threshold', () => {
  assert.ok(KANO_PERF_LAB_CONFIG.warmupMs >= 1000);
  assert.ok(KANO_PERF_LAB_CONFIG.baselineSampleMs >= 1500);
  assert.ok(KANO_PERF_LAB_CONFIG.interventionSampleMs >= 2000);
  assert.match(perfLabSource, /const before = await sampleFrames/);
  assert.match(perfLabSource, /const after = await sampleFrames/);
  assert.match(perfLabSource, /p95 \$\{round\(row\.during\?\.p95FrameMs/);
  assert.ok(perfLabSource.includes('const slow = `>33ms ${round(row.during?.slowFramePercent'));
  assert.match(perfLabSource, /rows\.filter\(\(row\) => row\.result\.stable/);
  assert.match(perfLabSource, /const cpuProbe = await probeRenderCpu/);
  assert.match(perfLabSource, /const gpuProbe = await probeGpuTime/);
});

test('GPU timing uses asynchronous disjoint timer queries and never blocks with finish()', () => {
  assert.match(perfLabSource, /EXT_disjoint_timer_query_webgl2/);
  assert.match(perfLabSource, /QUERY_RESULT_AVAILABLE/);
  assert.match(perfLabSource, /GPU_DISJOINT_EXT/);
  assert.doesNotMatch(perfLabSource, /\.finish\s*\(/);
  assert.match(perfLabSource, /GPU timer query: unavailable on this browser\/driver/);
});

test('render submission timing reports unavailable when no render calls are observed', () => {
  assert.match(perfLabSource, /return calls \?/);
  assert.match(perfLabSource, /render\(\) JS submission: unavailable \(no render calls observed\)/);
  assert.doesNotMatch(perfLabSource, /GPU wait: 0\.0 ms/);
});

test('scene interventions restore original object visibility and inline style visibility', () => {
  assert.match(perfLabSource, /function visibleStateUndo/);
  assert.match(perfLabSource, /function styleVisibilityUndo/);
  assert.match(perfLabSource, /finally\s*\{\s*undo\(\)/);
  assert.match(perfLabSource, /cleanupAll/);
});

test('road-and-tree benchmark label includes tree and vegetation name filters', () => {
  assert.match(perfLabSource, /two-way road \+ trees/);
  assert.match(perfLabSource, /KANO_TWO_WAY_ROAD\|TREE\|PALM\|VEGETATION/);
});

test('character LOD report separates idle, walking, distance bands and bake failures', () => {
  assert.match(animationSource, /idleCharacterRoots/);
  assert.match(animationSource, /walkCharacterRoots/);
  assert.match(animationSource, /farIdleRoots/);
  assert.match(animationSource, /nearIdleRoots/);
  assert.match(animationSource, /hysteresisIdleRoots/);
  assert.match(animationSource, /idleWithoutMixerRoots/);
  assert.match(animationSource, /idleLoadingRoots/);
  assert.match(animationSource, /idleNoClipRoots/);
  assert.match(animationSource, /idleFailedRoots/);
  assert.match(animationSource, /staticPoseBakeFailureReasons/);
  assert.match(perfLabSource, /waiting distance \$\{characterLod\.idleAwaitingDistanceRoots/);
  assert.match(perfLabSource, /far not baked \$\{characterLod\.idleBakeNotAttemptedRoots/);
});

test('failed static-pose bakes are memoized instead of retried every mobile update', () => {
  assert.match(animationSource, /staticPoseBakeAttempted: false/);
  assert.match(animationSource, /!entry\.staticPoseBakeAttempted/);
  assert.match(animationSource, /entry\.staticPoseBakeFailure = result\.reason/);
});

test('static-pose LOD can be retried after a previously baked character returns to full detail', () => {
  assert.match(animationSource, /entry\.staticPoseBakeAttempted = false;\s*entry\.staticPoseBakeFailure = null;/);
});
