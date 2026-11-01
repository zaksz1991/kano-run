/**
 * KANO LIFE — repeatable device-side performance diagnostics.
 *
 * Open the game with ?lab=1, start driving, and keep the page visible. Each
 * scene intervention is measured between two neighbouring baseline samples.
 * GPU timing is asynchronous and uses EXT_disjoint_timer_query when available;
 * this module never calls WebGL finish() and never reports missing metrics as 0.
 */

export const KANO_PERF_LAB_CONFIG = Object.freeze({
  warmupMs: 1800,
  settleMs: 650,
  baselineSampleMs: 2000,
  interventionSampleMs: 2500,
  unstableDriftPercent: 20,
  gpuProbeMs: 2800,
  maxGpuQueries: 24,
});

const enabled = (() => {
  try { return new URLSearchParams(location.search).get('lab') === '1'; }
  catch (_) { return false; }
})();

function box() {
  let el = document.getElementById('kano-perf-lab');
  if (el) return el;
  el = document.createElement('pre');
  el.id = 'kano-perf-lab';
  el.style.cssText = 'position:fixed;left:8px;right:8px;top:70px;z-index:99999;margin:0;padding:10px;background:rgba(0,0,0,.9);color:#9dffb0;font:12px/1.4 monospace;border-radius:10px;white-space:pre-wrap;pointer-events:none;max-height:78vh;overflow:hidden';
  document.body.appendChild(el);
  return el;
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const finite = (value) => value !== null && value !== undefined && value !== '' && Number.isFinite(Number(value));
const round = (value, places = 1) => finite(value) ? Number(value).toFixed(places) : 'n/a';

function percentile(sorted, fraction) {
  if (!sorted.length) return null;
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil(sorted.length * fraction) - 1));
  return sorted[index];
}

/** Pure summary helper: timestamp input makes frame-metric tests deterministic. */
export function summarizeFrameTimestamps(timestamps, durationMs = null) {
  const values = Array.from(timestamps || []).map(Number).filter(Number.isFinite);
  const intervals = [];
  for (let index = 1; index < values.length; index += 1) {
    const gap = values[index] - values[index - 1];
    if (gap > 0 && Number.isFinite(gap)) intervals.push(gap);
  }
  const sorted = [...intervals].sort((a, b) => a - b);
  const elapsed = Number(durationMs) > 0
    ? Number(durationMs)
    : (values.length > 1 ? values[values.length - 1] - values[0] : 0);
  const fps = intervals.length && elapsed > 0 ? intervals.length / (elapsed / 1000) : null;
  const averageFrameMs = intervals.length
    ? intervals.reduce((sum, value) => sum + value, 0) / intervals.length
    : null;
  const slowFrames = intervals.filter((value) => value > 33.333).length;
  return {
    frames: values.length,
    intervals: intervals.length,
    durationMs: elapsed,
    fps,
    averageFrameMs,
    medianFrameMs: percentile(sorted, 0.5),
    p95FrameMs: percentile(sorted, 0.95),
    slowFramePercent: intervals.length ? (slowFrames / intervals.length) * 100 : null,
  };
}

/** Compare an intervention with the mean of its immediately adjacent controls. */
export function compareBracketedSamples(before, during, after, unstableThreshold = KANO_PERF_LAB_CONFIG.unstableDriftPercent) {
  const controlValues = [before?.fps, after?.fps].filter(finite).map(Number);
  const baselineFps = controlValues.length === 2
    ? (controlValues[0] + controlValues[1]) / 2
    : null;
  const duringFps = finite(during?.fps) ? Number(during.fps) : null;
  const driftPercent = controlValues.length === 2 && baselineFps > 0
    ? (Math.abs(controlValues[1] - controlValues[0]) / baselineFps) * 100
    : null;
  const valid = baselineFps !== null && duringFps !== null;
  return {
    baselineFps,
    duringFps,
    deltaFps: valid ? duringFps - baselineFps : null,
    driftPercent,
    stable: valid && Number.isFinite(driftPercent) && driftPercent <= unstableThreshold,
  };
}

function sampleFrames(durationMs) {
  return new Promise((resolve, reject) => {
    if (typeof requestAnimationFrame !== 'function') {
      reject(new Error('requestAnimationFrame is unavailable'));
      return;
    }
    const startedAt = performance.now();
    const timestamps = [];
    const tick = (timestamp) => {
      if (typeof document !== 'undefined' && document.hidden) {
        reject(new Error('benchmark interrupted because the game tab became hidden'));
        return;
      }
      timestamps.push(Number(timestamp));
      const elapsed = performance.now() - startedAt;
      if (elapsed < durationMs) {
        requestAnimationFrame(tick);
      } else {
        resolve(summarizeFrameTimestamps(timestamps, elapsed));
      }
    };
    requestAnimationFrame(tick);
  });
}

function median(values) {
  const sorted = [...values].sort((a, b) => a - b);
  if (!sorted.length) return null;
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

function temporarilyReplaceMethod(target, name, replacement) {
  const descriptor = Object.getOwnPropertyDescriptor(target, name);
  target[name] = replacement;
  return () => {
    if (descriptor) Object.defineProperty(target, name, descriptor);
    else delete target[name];
  };
}

/**
 * Measures JavaScript time spent submitting renderer.render() calls. It does
 * not synchronously wait for the GPU and returns null if no render was observed.
 */
async function probeRenderCpu(renderer, durationMs = 2500) {
  if (!renderer || typeof renderer.render !== 'function') return null;
  const original = renderer.render;
  const costs = [];
  let calls = 0;
  const restoreRender = temporarilyReplaceMethod(renderer, 'render', function perfLabRenderCpuProbe(...args) {
    const started = performance.now();
    try { return original.apply(this, args); }
    finally {
      costs.push(performance.now() - started);
      calls += 1;
    }
  });
  try { await sleep(durationMs); }
  finally { restoreRender(); }
  return calls ? { calls, averageMs: costs.reduce((sum, value) => sum + value, 0) / calls, medianMs: median(costs), p95Ms: percentile([...costs].sort((a, b) => a - b), 0.95) } : null;
}

/**
 * Collects non-blocking WebGL GPU timer queries. This intentionally reports
 * unavailable when the browser/driver does not expose the timer-query API.
 */
async function probeGpuTime(renderer, durationMs = KANO_PERF_LAB_CONFIG.gpuProbeMs) {
  if (!renderer || typeof renderer.getContext !== 'function') return null;
  let gl;
  try { gl = renderer.getContext(); } catch (_) { return null; }
  if (!gl?.getExtension) return null;

  const webgl2 = typeof gl.createQuery === 'function' && typeof gl.getQueryParameter === 'function';
  const extension = gl.getExtension(webgl2 ? 'EXT_disjoint_timer_query_webgl2' : 'EXT_disjoint_timer_query');
  if (!extension) return null;

  const queue = [];
  const results = [];
  const original = renderer.render;
  let queryCount = 0;
  let queryFailures = 0;
  let active = false;
  const maxQueries = KANO_PERF_LAB_CONFIG.maxGpuQueries;

  const disposeQuery = (query) => {
    try {
      if (webgl2) gl.deleteQuery(query);
      else extension.deleteQueryEXT(query);
    } catch (_) { /* WebGL context may have been lost. */ }
  };

  const poll = () => {
    let disjoint = false;
    try { disjoint = Boolean(gl.getParameter(extension.GPU_DISJOINT_EXT)); }
    catch (_) { queryFailures += 1; return; }
    for (let index = queue.length - 1; index >= 0; index -= 1) {
      const query = queue[index];
      let available = false;
      let nanoseconds = null;
      try {
        available = webgl2
          ? Boolean(gl.getQueryParameter(query, gl.QUERY_RESULT_AVAILABLE))
          : Boolean(extension.getQueryObjectEXT(query, extension.QUERY_RESULT_AVAILABLE_EXT));
        if (available && !disjoint) {
          nanoseconds = webgl2
            ? Number(gl.getQueryParameter(query, gl.QUERY_RESULT))
            : Number(extension.getQueryObjectEXT(query, extension.QUERY_RESULT_EXT));
        }
      } catch (_) {
        queryFailures += 1;
        available = true;
      }
      if (!available) continue;
      if (Number.isFinite(nanoseconds) && nanoseconds > 0 && !disjoint) results.push(nanoseconds / 1e6);
      else queryFailures += 1;
      disposeQuery(query);
      queue.splice(index, 1);
    }
  };

  const restoreRender = temporarilyReplaceMethod(renderer, 'render', function perfLabGpuTimerProbe(...args) {
    poll();
    let query = null;
    let started = false;
    if (!active && queryCount < maxQueries && queue.length < 4) {
      try {
        query = webgl2 ? gl.createQuery() : extension.createQueryEXT();
        if (query) {
          if (webgl2) gl.beginQuery(extension.TIME_ELAPSED_EXT, query);
          else extension.beginQueryEXT(extension.TIME_ELAPSED_EXT, query);
          active = true;
          started = true;
          queryCount += 1;
        }
      } catch (_) {
        queryFailures += 1;
        if (query) disposeQuery(query);
        query = null;
      }
    }
    try { return original.apply(this, args); }
    finally {
      if (started) {
        try {
          if (webgl2) gl.endQuery(extension.TIME_ELAPSED_EXT);
          else extension.endQueryEXT(extension.TIME_ELAPSED_EXT);
          queue.push(query);
        } catch (_) {
          queryFailures += 1;
          disposeQuery(query);
        }
        active = false;
      }
    }
  });

  try {
    await sleep(durationMs);
    // Give the GPU a few animation frames to make completed query results available.
    for (let index = 0; index < 8 && queue.length; index += 1) {
      await new Promise((resolve) => requestAnimationFrame(resolve));
      poll();
    }
  } finally {
    restoreRender();
    for (const query of queue) disposeQuery(query);
    queue.length = 0;
  }

  if (!results.length) return { supported: true, samples: 0, failures: queryFailures, averageMs: null, medianMs: null, p95Ms: null };
  const sorted = [...results].sort((a, b) => a - b);
  return {
    supported: true,
    samples: results.length,
    failures: queryFailures,
    averageMs: results.reduce((sum, value) => sum + value, 0) / results.length,
    medianMs: median(results),
    p95Ms: percentile(sorted, 0.95),
  };
}

function visibleStateUndo(nodes) {
  const previous = nodes.map((node) => [node, node.visible]);
  return () => previous.forEach(([node, visible]) => { node.visible = visible; });
}

function styleVisibilityUndo(nodes) {
  const previous = nodes.map((node) => [node, node.style.visibility]);
  return () => previous.forEach(([node, visibility]) => { node.style.visibility = visibility; });
}

function hideWhere(scene, predicate) {
  const hidden = [];
  scene.traverse((node) => {
    if (node.visible && predicate(node)) {
      node.visible = false;
      hidden.push(node);
    }
  });
  return visibleStateUndo(hidden);
}

function runLabel(row) {
  const result = row.result;
  const fps = round(result.duringFps, 1).padStart(5);
  const delta = result.deltaFps === null ? 'n/a' : `${result.deltaFps >= 0 ? '+' : ''}${round(result.deltaFps, 1)}`;
  const drift = result.driftPercent === null ? 'drift n/a' : `drift ${round(result.driftPercent, 0)}%`;
  const p95 = `p95 ${round(row.during?.p95FrameMs, 0)}ms`;
  const slow = `>33ms ${round(row.during?.slowFramePercent, 0)}%`;
  return `${row.label.padEnd(25)} ${fps} fps (${delta}) ${drift} ${p95} ${slow}${result.stable ? '' : '  UNSTABLE'}`;
}

async function run() {
  const el = box();
  const rendererState = window.__KANO_ACTIVE_RENDERER__;
  if (!rendererState?.scene || !rendererState?.renderer) {
    el.textContent = 'PERF LAB: active 3D renderer not found';
    return;
  }
  if (document.hidden) {
    el.textContent = 'PERF LAB: keep the game tab visible, then reload with ?lab=1';
    return;
  }

  const R = rendererState;
  const rows = [];
  const renderRows = () => rows.map(runLabel).join('\n');
  const show = (extra = '') => { el.textContent = `PERF LAB — paired benchmark\n${renderRows()}${extra}`; };
  const WORLD_CORE = /SAND_GROUND|VERGE|SHOULDER|KERB|LANE_MARKINGS|TWO_WAY_ROAD|FLYOVER/i;

  const tests = [
    ['people (skinned + static LOD)', () => hideWhere(R.scene, (n) => n.isSkinnedMesh || n.userData?.kanoStaticPoseLod === true)],
    ['traffic vehicles', () => {
      const nodes = [];
      for (const actor of R.trafficActors?.values?.() || []) if (actor.visible) nodes.push(actor);
      for (const batch of R._mobileTrafficBatches?.values?.() || []) if (batch.mesh?.visible) nodes.push(batch.mesh);
      for (const batch of R.__kanoTrafficInstancingLOD?.batches?.values?.() || []) if (batch.mesh?.visible) nodes.push(batch.mesh);
      const undo = visibleStateUndo(nodes);
      nodes.forEach((node) => { node.visible = false; });
      return undo;
    }],
    ['two-way road + trees', () => hideWhere(R.scene, (node) => /KANO_TWO_WAY_ROAD|TREE|PALM|VEGETATION/i.test(node.name || ''))],
    ['flyover', () => hideWhere(R.scene, (node) => /FLYOVER/i.test(node.name || '') || node.name === 'KANO_FLYOVER_GLB_DECK')],
    ['buildings/scenery', () => {
      const nodes = [...(R.world?.children || [])].filter((node) => node.visible && !WORLD_CORE.test(node.name || '') && node.type === 'Group');
      const undo = visibleStateUndo(nodes);
      nodes.forEach((node) => { node.visible = false; });
      return undo;
    }],
    ['no 3D drawing', () => temporarilyReplaceMethod(R.renderer, 'render', function perfLabSkipDraw() {})],
    ['HUD/buttons hidden', () => {
      const nodes = [];
      document.querySelectorAll('body > *:not(canvas):not(#kano-perf-lab)').forEach((node) => {
        if (node.contains(R.renderer.domElement) || node.tagName === 'SCRIPT' || node.tagName === 'STYLE') return;
        nodes.push(node);
      });
      document.querySelectorAll('#hud, #drive-controls, .hud-top').forEach((node) => nodes.push(node));
      const unique = [...new Set(nodes)];
      const undo = styleVisibilityUndo(unique);
      unique.forEach((node) => { node.style.visibility = 'hidden'; });
      return undo;
    }],
    ['lights off', () => {
      const lights = [];
      R.scene.traverse((node) => { if (node.isLight && node.visible) lights.push(node); });
      const undo = visibleStateUndo(lights);
      lights.forEach((node) => { node.visible = false; });
      return undo;
    }],
    ['fog off', () => {
      const original = R.scene.fog;
      R.scene.fog = null;
      return () => { R.scene.fog = original; };
    }],
    ['resolution x0.5', () => {
      const target = R.renderer;
      if (typeof target.getPixelRatio !== 'function' || typeof target.setPixelRatio !== 'function') {
        return () => {};
      }
      const originalRatio = target.getPixelRatio();
      target.setPixelRatio(Math.max(0.3, originalRatio * 0.5));
      const restoreSetter = temporarilyReplaceMethod(target, 'setPixelRatio', function perfLabHoldPixelRatio() {});
      return () => {
        restoreSetter();
        target.setPixelRatio(originalRatio);
      };
    }],
  ];

  const cleanupAll = [];
  try {
    el.textContent = 'PERF LAB: warming up the phone and renderer…';
    await sampleFrames(KANO_PERF_LAB_CONFIG.warmupMs);

    for (const [label, apply] of tests) {
      el.textContent = `PERF LAB: measuring ${label}…\n${renderRows()}`;
      await sleep(KANO_PERF_LAB_CONFIG.settleMs);
      const before = await sampleFrames(KANO_PERF_LAB_CONFIG.baselineSampleMs);
      let undo = () => {};
      let during;
      try {
        undo = apply() || (() => {});
        cleanupAll.push(undo);
        await sleep(KANO_PERF_LAB_CONFIG.settleMs);
        during = await sampleFrames(KANO_PERF_LAB_CONFIG.interventionSampleMs);
      } finally {
        undo();
        cleanupAll.pop();
      }
      await sleep(KANO_PERF_LAB_CONFIG.settleMs);
      const after = await sampleFrames(KANO_PERF_LAB_CONFIG.baselineSampleMs);
      rows.push({ label, before, during, after, result: compareBracketedSamples(before, during, after) });
      show();
    }
  } finally {
    for (let index = cleanupAll.length - 1; index >= 0; index -= 1) {
      try { cleanupAll[index](); } catch (_) { /* Keep the original scene alive. */ }
    }
  }

  el.textContent = `PERF LAB: measuring render submission and asynchronous GPU time…\n${renderRows()}`;
  // These probes replace renderer.render() temporarily, so they must run
  // sequentially rather than racing over the same method reference.
  const cpuProbe = await probeRenderCpu(R.renderer);
  const gpuProbe = await probeGpuTime(R.renderer);

  const stableRows = rows.filter((row) => row.result.stable && Number.isFinite(row.result.deltaFps));
  const best = stableRows.length
    ? [...stableRows].sort((a, b) => b.result.deltaFps - a.result.deltaFps)[0]
    : null;
  const gpu = (() => {
    try {
      const context = R.renderer.getContext();
      const debug = context.getExtension('WEBGL_debug_renderer_info');
      return debug ? context.getParameter(debug.UNMASKED_RENDERER_WEBGL) : context.getParameter(context.RENDERER);
    } catch (_) { return 'GPU name unavailable'; }
  })();
  const info = R.renderer.info?.render || {};
  const memory = R.renderer.info?.memory || {};
  const characterLod = window.__KANO_GLB_ANIMATION_MANAGER__?.getCharacterRenderLodDiagnostics?.();
  const lodFailureSummary = characterLod
    ? Object.entries(characterLod.staticPoseBakeFailureReasons || {}).map(([reason, count]) => `${reason}:${count}`).join(',')
    : '';
  const characterLodLine = characterLod
    ? `\ncharacter LOD: idle ${characterLod.idleCharacterRoots}, walk ${characterLod.walkCharacterRoots}; baked ${characterLod.staticPoseCharacterRoots}/${characterLod.activeCharacterRoots} roots (${characterLod.staticPoseMeshes} meshes); skinned ${characterLod.remainingSkinnedMeshes}; far idle ${characterLod.farIdleRoots}; near ${characterLod.nearIdleRoots}; mid-band ${characterLod.hysteresisIdleRoots}; loading/no-clip/failed ${characterLod.idleLoadingRoots}/${characterLod.idleNoClipRoots}/${characterLod.idleFailedRoots}; waiting distance ${characterLod.idleAwaitingDistanceRoots}; far not baked ${characterLod.idleBakeNotAttemptedRoots}; bake failed ${characterLod.staticPoseBakeFailures}${lodFailureSummary ? ` [${lodFailureSummary}]` : ''}; idle distance ${characterLod.nearestIdleDistance === null ? 'n/a' : round(characterLod.nearestIdleDistance, 1)}-${characterLod.farthestIdleDistance === null ? 'n/a' : round(characterLod.farthestIdleDistance, 1)} units`
    : '\ncharacter LOD: diagnostics unavailable';
  const trafficBatch = window.__KANO_TRAFFIC_INSTANCING__;
  const trafficBatchLine = trafficBatch
    ? `\ntraffic GLB batches: ${trafficBatch.activeBatches} batches, ${trafficBatch.batchedInstances} instances, ${trafficBatch.avoidedDrawCalls} calls avoided`
    : '';
  const cpuLine = cpuProbe
    ? `render() JS submission: avg ${round(cpuProbe.averageMs, 3)} ms, median ${round(cpuProbe.medianMs, 3)} ms, p95 ${round(cpuProbe.p95Ms, 3)} ms (${cpuProbe.calls} calls)`
    : 'render() JS submission: unavailable (no render calls observed)';
  const gpuLine = gpuProbe?.samples
    ? `GPU timer query: avg ${round(gpuProbe.averageMs, 2)} ms, median ${round(gpuProbe.medianMs, 2)} ms, p95 ${round(gpuProbe.p95Ms, 2)} ms (${gpuProbe.samples} samples)`
    : gpuProbe?.supported
      ? `GPU timer query: supported, but no valid samples (${gpuProbe.failures} discarded)`
      : 'GPU timer query: unavailable on this browser/driver';
  const sampleQuality = rows.filter((row) => row.result.stable).length;
  const bestLine = best
    ? `best stable gain: ${best.label} (${best.result.deltaFps >= 0 ? '+' : ''}${round(best.result.deltaFps, 1)} fps)`
    : 'best gain: none — all intervention comparisons were unstable or incomplete';
  show(`\n\npaired controls stable: ${sampleQuality}/${rows.length}\n${bestLine}\n${cpuLine}\n${gpuLine}\nrender calls ${finite(info.calls) ? info.calls : 'n/a'} · tris ${finite(info.triangles) ? info.triangles : 'n/a'} · geometries ${finite(memory.geometries) ? memory.geometries : 'n/a'} · textures ${finite(memory.textures) ? memory.textures : 'n/a'}${characterLodLine}${trafficBatchLine}\n${gpu}\nUnstable rows are excluded from the best-gain ranking.`);
}

if (enabled && typeof window !== 'undefined') {
  const wait = window.setInterval(() => {
    const driving = Boolean(document.getElementById('drive-controls')?.offsetParent)
      && !document.querySelector('.screen:not(.hidden)');
    if (driving && window.__KANO_ACTIVE_RENDERER__?.scene) {
      window.clearInterval(wait);
      window.setTimeout(() => run().catch((error) => {
        const output = box();
        output.textContent = `PERF LAB error: ${error?.message || error}`;
      }), 6000);
    }
  }, 1000);
}
