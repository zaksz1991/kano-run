/**
 * Optional on-screen performance read-out for real phones. Off by default.
 * Turn it on by opening the game with ?perf=1 (or by tapping the top-left
 * corner 5 times quickly). Shows FPS, draw calls, triangles, canvas size, pixel
 * ratio and the phone's GPU name, so a screenshot gives exact numbers.
 */
import * as THREE from 'three';
import { getMobileTier } from './KanoDeviceTier.js';

const KEY = 'kano-perf-overlay';
let box = null;
let timer = 0;
const stats = { calls: 0, tris: 0, frames: 0, last: 0, fps: 0, drawsPerFrame: 0, trisPerFrame: 0 };
let hooked = false;

function hookGl() {
  if (hooked || typeof WebGLRenderingContext === 'undefined') return;
  hooked = true;
  for (const C of [WebGLRenderingContext, typeof WebGL2RenderingContext !== 'undefined' ? WebGL2RenderingContext : null]) {
    if (!C) continue;
    const de = C.prototype.drawElements;
    const da = C.prototype.drawArrays;
    const dei = C.prototype.drawElementsInstanced;
    C.prototype.drawElements = function (mode, count, ...rest) { stats.calls += 1; stats.tris += count / 3; return de.call(this, mode, count, ...rest); };
    C.prototype.drawArrays = function (mode, first, count) { stats.calls += 1; stats.tris += count / 3; return da.call(this, mode, first, count); };
    if (dei) C.prototype.drawElementsInstanced = function (mode, count, type, offset, n) { stats.calls += 1; stats.tris += (count / 3) * n; return dei.call(this, mode, count, type, offset, n); };
  }
}

function gpuName() {
  try {
    const canvas = document.querySelector('canvas');
    const gl = canvas && (canvas.getContext('webgl2') || canvas.getContext('webgl'));
    const ext = gl && gl.getExtension('WEBGL_debug_renderer_info');
    return ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : 'unknown';
  } catch (_) { return 'unknown'; }
}


let topLines = '';
let breakdownAt = 0;
function captureBreakdown() {
  const renderer = typeof window !== 'undefined' ? window.__KANO_ACTIVE_RENDERER__ : null;
  if (!renderer?.scene) return;
  const seen = new Set();
  const original = THREE.Frustum.prototype.intersectsObject;
  THREE.Frustum.prototype.intersectsObject = function (object) { seen.add(object); return original.call(this, object); };
  setTimeout(() => {
    THREE.Frustum.prototype.intersectsObject = original;
    const visible = (n) => { for (let p = n; p; p = p.parent) if (!p.visible) return false; return true; };
    const groups = {};
    for (const node of seen) {
      if (!node.geometry || !visible(node)) continue;
      let top = node;
      while (top.parent && top.parent !== renderer.scene && top.parent !== renderer.world) top = top.parent;
      const found = (() => { for (let q = node; q; q = q.parent) { if (q.userData?.modelPath) return String(q.userData.modelPath).split('/').pop(); } return ''; })();
      let key = found || top.name || top.userData?.modelKey || top.type;
      if (top.children?.length > 15) {
        let q = node;
        while (q.parent && q.parent !== top) q = q.parent;
        key += '>' + (q.name || q.userData?.modelKey || q.type);
      }
      const geo = node.geometry;
      const index = geo.index ? geo.index.count : geo.attributes.position.count;
      const tris = (index / 3) * (node.isInstancedMesh ? node.count : 1);
      const entry = groups[key] || (groups[key] = { tris: 0, meshes: 0 });
      entry.tris += tris;
      entry.meshes += Array.isArray(node.material) ? node.material.length : 1;
    }
    topLines = Object.entries(groups).sort((a, b) => b[1].tris - a[1].tris).slice(0, 8)
      .map(([k, v]) => `${k.slice(0, 26)} ${Math.round(v.tris / 1000)}k/${v.meshes}`).join('\n');
  }, 350);
}

function frame(now) {
  stats.frames += 1;
  if (!stats.last) stats.last = now;
  if (now - stats.last >= 1000) {
    stats.fps = Math.round((stats.frames * 1000) / (now - stats.last));
    stats.drawsPerFrame = Math.round(stats.calls / Math.max(1, stats.frames));
    stats.trisPerFrame = Math.round(stats.tris / Math.max(1, stats.frames));
    stats.frames = 0; stats.calls = 0; stats.tris = 0; stats.last = now;
    if (box && now - breakdownAt > 3000) { breakdownAt = now; captureBreakdown(); }
    if (box) {
      const canvas = document.querySelector('canvas');
      box.textContent = `FPS ${stats.fps}\nDraws/frame ${stats.drawsPerFrame}\nTris/frame ${stats.trisPerFrame}\nCanvas ${canvas ? `${canvas.width}x${canvas.height}` : '?'}\nDPR ${window.devicePixelRatio}\nTier ${(() => { try { return getMobileTier(); } catch (_) { return '?'; } })()}\nGPU ${gpuName()}\nTOP (tris/draws)\n${topLines}`;
    }
  }
  timer = requestAnimationFrame(frame);
}

export function showPerfOverlay(on = true) {
  if (typeof document === 'undefined') return;
  try { localStorage.setItem(KEY, on ? '1' : '0'); } catch (_) { /* optional */ }
  if (!on) { if (box) box.remove(); box = null; cancelAnimationFrame(timer); return; }
  if (box) return;
  hookGl();
  box = document.createElement('pre');
  box.style.cssText = 'position:fixed;left:6px;bottom:140px;z-index:99999;margin:0;padding:6px 8px;background:rgba(0,0,0,.72);color:#9dffb0;font:11px/1.3 ui-monospace,monospace;border-radius:6px;pointer-events:none;white-space:pre-wrap;max-width:70vw';
  document.body.append(box);
  stats.last = 0;
  timer = requestAnimationFrame(frame);
}

function init() {
  if (typeof window === 'undefined') return;
  let want = false;
  try { want = /[?&]perf=1/.test(location.search) || localStorage.getItem(KEY) === '1'; } catch (_) { /* optional */ }
  if (want) showPerfOverlay(true);
  let taps = [];
  window.addEventListener('pointerdown', (e) => {
    if (e.clientX > 80 || e.clientY > 80) return;
    const now = performance.now();
    taps = taps.filter((t) => now - t < 1800);
    taps.push(now);
    if (taps.length >= 5) { taps = []; showPerfOverlay(!box); }
  }, { passive: true });
  window.kanoPerfOverlay = showPerfOverlay;
}
init();
