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
  const show = (extra = '') => { el.textContent = `PERF LAB (keep driving)\n${rows.map((r) => `${r[0].padEnd(24)} ${r[1].toFixed(1)} fps`).join('\n')}${extra}`; };

  const hideWhere = (predicate) => {
    const hidden = [];
    R.scene.traverse((n) => { if (n.visible && predicate(n)) { n.visible = false; hidden.push(n); } });
    return () => hidden.forEach((n) => { n.visible = true; });
  };
  const WORLD_CORE = /SAND_GROUND|VERGE|SHOULDER|KERB|LANE_MARKINGS|TWO_WAY_ROAD|FLYOVER/i;
  const tests = [
    ['baseline', () => () => {}],
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
    ['ALL world (road only)', () => {
      const undo = [];
      for (const child of R.world?.children || []) if (child.visible && !/SAND_GROUND|LANE_MARKINGS/i.test(child.name || '')) { child.visible = false; undo.push(child); }
      return () => undo.forEach((n) => { n.visible = true; });
    }],
    ['lights off', () => {
      const undo = [];
      R.scene.traverse((n) => { if (n.isLight && n.visible) { n.visible = false; undo.push(n); } });
      return () => undo.forEach((n) => { n.visible = true; });
    }],
    ['fog off', () => { const fog = R.scene.fog; R.scene.fog = null; return () => { R.scene.fog = fog; }; }],
    ['resolution x0.5', () => {
      const gl = R.renderer; const old = gl.getPixelRatio();
      gl.setPixelRatio(Math.max(0.3, old * 0.5));
      return () => gl.setPixelRatio(old);
    }],
  ];

  for (const [label, apply] of tests) {
    el.textContent = `PERF LAB: measuring "${label}"...\n${rows.map((r) => `${r[0].padEnd(24)} ${r[1].toFixed(1)} fps`).join('\n')}`;
    const undo = apply();
    await sleep(1200);          // let shaders recompile before timing
    const fps = await measure(3500);
    undo();
    await sleep(600);
    rows.push([label, fps]);
  }
  const base = rows[0][1];
  const best = [...rows.slice(1)].sort((a, b) => b[1] - a[1])[0];
  show(`\n\nGPU: ${(() => { try { const c = document.createElement('canvas'); const g = c.getContext('webgl'); const e = g.getExtension('WEBGL_debug_renderer_info'); return g.getParameter(e.UNMASKED_RENDERER_WEBGL); } catch (_) { return '?'; } })()}\nBiggest gain: ${best[0]} (+${(best[1] - base).toFixed(1)} fps)\nSend this screenshot.`);
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
