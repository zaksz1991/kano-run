/**
 * Performance lab. Open the game with ?lab=1, start driving, and wait ~50 seconds.
 * It measures the real FPS on THIS phone with parts of the scene switched off one at a
 * time (people, traffic, road, flyover, scenery, lights, fog, resolution) and prints a
 * table. One screenshot of that table tells us exactly what costs the most on your GPU.
 */
const enabled = (() => { try { return new URLSearchParams(location.search).get('lab') === '1'; } catch (_) { return false; } })();

function box() {
  let el = document.getElementById('kano-perf-lab');
  if (el) return el;
  el = document.createElement('pre');
  el.id = 'kano-perf-lab';
  el.style.cssText = 'position:fixed;left:8px;right:8px;top:70px;z-index:99999;margin:0;padding:10px;background:rgba(0,0,0,.86);color:#9dffb0;font:12px/1.35 monospace;border-radius:10px;white-space:pre-wrap;pointer-events:none';
  document.body.appendChild(el);
  return el;
}

function measure(ms) {
  return new Promise((resolve) => {
    let frames = 0;
    const start = performance.now();
    const tick = () => {
      frames += 1;
      if (performance.now() - start < ms) requestAnimationFrame(tick);
      else resolve(frames / ((performance.now() - start) / 1000));
    };
    requestAnimationFrame(tick);
  });
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function run() {
  const el = box();
  const R = window.__KANO_ACTIVE_RENDERER__;
  if (!R?.scene) { el.textContent = 'LAB: renderer not found'; return; }
  const rows = [];
  const show = (extra = '') => { el.textContent = `PERF LAB (keep driving)\n${rows.map(line).join('\n')}${extra}`; };

  const hideWhere = (predicate) => {
    const hidden = [];
    R.scene.traverse((n) => { if (n.visible && predicate(n)) { n.visible = false; hidden.push(n); } });
    return () => hidden.forEach((n) => { n.visible = true; });
  };
  const WORLD_CORE = /SAND_GROUND|VERGE|SHOULDER|KERB|LANE_MARKINGS|TWO_WAY_ROAD|FLYOVER/i;
  const tests = [
    ['people (skinned)', () => hideWhere((n) => n.isSkinnedMesh)],
    ['traffic vehicles', () => {
      const undo = [];
      for (const actor of R.trafficActors?.values?.() || []) if (actor.visible) { actor.visible = false; undo.push(actor); }
      for (const batch of R._mobileTrafficBatches?.values?.() || []) if (batch.mesh?.visible) { batch.mesh.visible = false; undo.push(batch.mesh); }
      return () => undo.forEach((n) => { n.visible = true; });
    }],
    ['two-way road + trees', () => hideWhere((n) => n.name === 'KANO_TWO_WAY_ROAD')],
    ['flyover', () => hideWhere((n) => /FLYOVER/i.test(n.name || '') || n.name === 'KANO_FLYOVER_GLB_DECK')],
    ['buildings/scenery', () => {
      const undo = [];
      for (const child of R.world?.children || []) if (child.visible && !WORLD_CORE.test(child.name || '') && child.type === 'Group') { child.visible = false; undo.push(child); }
      return () => undo.forEach((n) => { n.visible = true; });
    }],
    ['no 3D drawing at all', () => { const gl = R.renderer; const orig = gl.render; gl.render = () => {}; return () => { gl.render = orig; }; }],
    ['HUD/buttons hidden', () => {
      const undo = [];
      document.querySelectorAll('body > *:not(canvas):not(#kano-perf-lab)').forEach((n) => {
        if (n.contains(R.renderer.domElement) || n.tagName === 'SCRIPT' || n.tagName === 'STYLE') return;
        undo.push([n, n.style.visibility]); n.style.visibility = 'hidden';
      });
      document.querySelectorAll('#hud, #drive-controls, .hud-top').forEach((n) => { undo.push([n, n.style.visibility]); n.style.visibility = 'hidden'; });
      return () => undo.forEach(([n, v]) => { n.style.visibility = v; });
    }],
    ['lights off', () => {
      const undo = [];
      R.scene.traverse((n) => { if (n.isLight && n.visible) { n.visible = false; undo.push(n); } });
      return () => undo.forEach((n) => { n.visible = true; });
    }],
    ['fog off', () => { const fog = R.scene.fog; R.scene.fog = null; return () => { R.scene.fog = fog; }; }],
    ['resolution x0.5', () => {
      const gl = R.renderer; const old = gl.getPixelRatio(); const orig = gl.setPixelRatio;
      gl.setPixelRatio(Math.max(0.3, old * 0.5));
      gl.setPixelRatio = () => {};          // stop quality governors from undoing the test
      return () => { gl.setPixelRatio = orig; gl.setPixelRatio(old); };
    }],
  ];

  // Time what render() costs the CPU and how long the GPU keeps the phone waiting afterwards.
  const probeRender = async () => {
    const gl = R.renderer; const ctx = gl.getContext(); const orig = gl.render;
    let n = 0; let cpu = 0; let wait = 0;
    gl.render = function labRender(...a) {
      const t0 = performance.now(); orig.apply(this, a); const t1 = performance.now();
      try { ctx.finish(); } catch (_) { /* ignore */ }
      const t2 = performance.now(); cpu += t1 - t0; wait += t2 - t1; n += 1;
    };
    await sleep(2500);
    gl.render = orig;
    return n ? { cpu: cpu / n, wait: wait / n, n } : { cpu: 0, wait: 0, n: 0 };
  };

  const line = (r) => `${r[0].padEnd(22)} ${r[1].toFixed(1).padStart(5)} fps  (${r[2] >= 0 ? '+' : ''}${r[2].toFixed(1)})`;
  const drift = [];
  let baseNow = await measure(3000);
  drift.push(baseNow);
  for (const [label, apply] of tests) {
    el.textContent = `PERF LAB: "${label}"...\n${rows.map(line).join('\n')}`;
    const undo = apply();
    await sleep(1000);
    const fps = await measure(3000);
    undo();
    await sleep(500);
    baseNow = await measure(2000);              // fresh baseline after each test, so phone heat does not fool us
    drift.push(baseNow);
    rows.push([label, fps, fps - (drift[drift.length - 2] + baseNow) / 2]);
    show();
  }
  el.textContent = `PERF LAB: timing CPU vs GPU...\n${rows.map(line).join('\n')}`;
  const pr = await probeRender();
  const best = [...rows].sort((a, b) => b[2] - a[2])[0];
  const gpu = (() => { try { const c = document.createElement('canvas'); const g = c.getContext('webgl'); const e = g.getExtension('WEBGL_debug_renderer_info'); return g.getParameter(e.UNMASKED_RENDERER_WEBGL); } catch (_) { return '?'; } })();
  const info = R.renderer.info.render;
  show(`\n\nbaseline over time: ${drift.map((d) => d.toFixed(0)).join(' ')}\nrender() CPU: ${pr.cpu.toFixed(1)} ms  GPU wait: ${pr.wait.toFixed(1)} ms\ncalls ${info.calls} tris ${info.triangles}\nbest gain: ${best[0]} (${best[2] >= 0 ? '+' : ''}${best[2].toFixed(1)} fps)\n${gpu}\nSend this screenshot.`);
}

if (enabled && typeof window !== 'undefined') {
  const wait = window.setInterval(() => {
    const driving = Boolean(document.getElementById('drive-controls')?.offsetParent) && !document.querySelector('.screen:not(.hidden)');
    if (driving && window.__KANO_ACTIVE_RENDERER__?.scene) {
      window.clearInterval(wait);
      window.setTimeout(() => run().catch((e) => { box().textContent = `LAB error: ${e?.message || e}`; }), 6000);
    }
  }, 1000);
}
