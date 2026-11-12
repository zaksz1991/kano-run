/**
 * Sharper road signs and billboards.
 * Sign boards are canvas textures with default filtering, so they smear at the shallow angles you see them from
 * while driving. This raises anisotropic filtering on every canvas texture (signs, billboards, shop boards)
 * so lettering stays readable further out. No geometry change and only a small GPU cost.
 */
const TARGET = 8;
let tick = 0;

function sharpen() {
  const R = window.kanoRenderer;
  const world = R?.world;
  const gl = R?.renderer;
  if (!world || !gl) return;
  const max = Math.max(1, gl.capabilities?.getMaxAnisotropy?.() || 1);
  const level = Math.min(TARGET, max);
  world.traverse((object) => {
    // Make sign/billboard faces ~30% larger so lettering is readable from further away (once per mesh).
    const w = object.geometry?.parameters?.width;
    if (object.isMesh && !object.userData.kanoSignBoosted && object.material?.map?.isCanvasTexture
        && object.geometry?.type === 'PlaneGeometry' && w >= 1.5 && w <= 8) {
      object.userData.kanoSignBoosted = true;
      object.scale.multiplyScalar(1.5);
    }
    if (level <= 1) return;
    const mats = object.material ? (Array.isArray(object.material) ? object.material : [object.material]) : [];
    for (const material of mats) {
      const map = material?.map;
      if (map && map.isCanvasTexture && map.anisotropy < level) {
        map.anisotropy = level;
        map.needsUpdate = true;
      }
    }
  });
}

if (typeof window !== 'undefined' && !window.__kanoSignClarity) {
  window.__kanoSignClarity = true;
  setInterval(() => {
    tick += 1;
    if (document.hidden) return;
    try { sharpen(); } catch (_) { /* optional */ }
  }, 2500);
}

/* ---- Sign reader: tiny lettering is unreadable at phone resolution, so the nearest sign ahead is also shown
        as large text on screen. Text is captured when the sign texture is painted. ---- */
let signs = [];
let signsAt = 0;
let reader = null;
const v = { x: 0, y: 0, z: 0 };

function ensureReader() {
  if (reader && reader.isConnected) return reader;
  reader = document.createElement('div');
  reader.id = 'kano-sign-reader';
  reader.style.cssText = 'position:fixed;left:8px;top:246px;max-width:48vw;z-index:44;padding:8px 12px;border-radius:12px;'
    + 'background:rgba(20,40,30,.93);border:2px solid #f6d45d;color:#fff;font:800 15px/1.25 system-ui,sans-serif;'
    + 'pointer-events:none;display:none;box-shadow:0 2px 8px rgba(0,0,0,.4)';
  document.body.appendChild(reader);
  return reader;
}

function readSigns() {
  const R = window.kanoRenderer;
  const g = window.kanoGame;
  if (!R?.world || !R.camera || !g || g.state !== 'PLAY') { if (reader) reader.style.display = 'none'; return; }
  const now = performance.now();
  if (now - signsAt > 3000) {
    signsAt = now;
    signs = [];
    R.world.traverse((o) => {
      if (o.isMesh && o.material?.map?.isCanvasTexture && o.geometry?.type === 'PlaneGeometry'
          && o.material.map.image?.__kanoTexts?.length) signs.push(o);
    });
  }
  R.world.updateMatrixWorld();
  const cam = R.camera.matrixWorld.elements;
  const cx = cam[12]; const cy = cam[13]; const cz = cam[14];
  let best = null; let bestD = 26;
  for (const o of signs) {
    const e = o.matrixWorld.elements;
    const dz = cz - e[14];
    if (dz < 3 || dz > 26) continue;                    // ahead of the keke, not yet passed
    if (Math.abs(e[12] - cx) > 15) continue;
    const nz = e[10];                                   // local +z facing: towards the driver when positive
    if (nz < 0.3 * Math.hypot(e[8], e[9], e[10])) continue;
    const d = Math.hypot(e[12] - cx, e[13] - cy, dz);
    if (d < bestD) { bestD = d; best = o; }
  }
  const el = ensureReader();
  if (!best) { el.style.display = 'none'; return; }
  const text = best.material.map.image.__kanoTexts.slice(0, 3).join(' · ').slice(0, 60);
  if (el.textContent !== text) el.textContent = text;
  el.style.display = 'block';
}

if (typeof window !== 'undefined' && !window.__kanoSignReader) {
  window.__kanoSignReader = true;
  setInterval(() => { if (!document.hidden) { try { readSigns(); } catch (_) { /* optional */ } } }, 250);
}
