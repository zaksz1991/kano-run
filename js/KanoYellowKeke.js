/**
 * Real Kano kekes are yellow with a black roof. The player's keke GLB uses a colour-swatch atlas whose body swatch
 * is dark green and roof swatch brown, then the gold paint multiplied them into olive/brown mud. This recolours the
 * atlas once: dark green body -> Kano yellow, brown roof -> charcoal, bright green window -> glass blue. Other paints
 * (Arewa green, desert red ...) tint the same yellow body as before.
 */
import * as THREE from 'three';

function hsv(r, g, b) {
  const mx = Math.max(r, g, b); const mn = Math.min(r, g, b); const d = mx - mn;
  let h = 0;
  if (d) {
    if (mx === r) h = ((g - b) / d) % 6; else if (mx === g) h = (b - r) / d + 2; else h = (r - g) / d + 4;
    h *= 60; if (h < 0) h += 360;
  }
  return [h, mx ? d / mx : 0, mx];
}
function rgb(h, s, v) {
  const c = v * s; const x = c * (1 - Math.abs(((h / 60) % 2) - 1)); const m = v - c;
  const [r, g, b] = h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x] : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x];
  return [(r + m) * 255, (g + m) * 255, (b + m) * 255];
}

function recolour(map) {
  const img = map?.image;
  if (!img || !(img.width > 0)) return null;
  const size = Math.min(1024, img.width);
  const c = document.createElement('canvas'); c.width = size; c.height = size;
  const ctx = c.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(img, 0, 0, size, size);
  const data = ctx.getImageData(0, 0, size, size);
  const px = data.data;
  for (let i = 0; i < px.length; i += 4) {
    const [h, s, v] = hsv(px[i] / 255, px[i + 1] / 255, px[i + 2] / 255);
    let out = null;
    if (h >= 200 && h <= 262 && s > 0.35) out = rgb(46, 0.93, Math.min(1, 0.7 + v * 0.35));
    else if (((h >= 160 && h <= 215 && s > 0.06 && ((s < 0.55 && v > 0.55) || (s < 0.72 && v > 0.82))) || (h >= 40 && h <= 75 && s > 0.08 && s < 0.5 && v > 0.7))) out = rgb(220, 0.1, 0.1 + v * 0.08);
    else if (h >= 14 && h <= 52 && s > 0.17 && v < 0.92) out = rgb(220, 0.1, 0.12 + v * 0.1);
    if (out) { px[i] = out[0]; px[i + 1] = out[1]; px[i + 2] = out[2]; }
  }
  ctx.putImageData(data, 0, 0);
  const tex = new THREE.CanvasTexture(c);
  tex.flipY = map.flipY; tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = map.anisotropy || 1;
  tex.needsUpdate = true;
  return tex;
}

function apply(R) {
  const root = R.player;
  if (!root || R.__kanoYellowKeke) return;
  let done = false;
  root.traverse((o) => {
    if (done || !o.isMesh || o.name !== 'merged_by_material') return;
    const m = Array.isArray(o.material) ? o.material[0] : o.material;
    if (!m?.map) return;
    const tex = recolour(m.map);
    if (!tex) return;
    m.map = tex;
    m.needsUpdate = true;
    o.userData.kanoYellowKeke = true;
    R.__kanoYellowKeke = o;
    done = true;
  });
}

if (typeof window !== 'undefined' && !window.__kanoYellowKekeInstalled) {
  window.__kanoYellowKekeInstalled = true;
  setInterval(() => {
    try {
      const R = window.kanoRenderer;
      if (!R?.player) return;
      apply(R);
      const o = R.__kanoYellowKeke;
      if (o) {
        // gold (default paint) must not multiply the yellow into mud; other paints still tint.
        const g = window.kanoGame;
        const paintId = g?.save?.paint || g?.selectedPaint || 'gold';
        const m = Array.isArray(o.material) ? o.material[0] : o.material;
        if (paintId === 'gold' && m.color.getHex() !== 0xffffff) m.color.setHex(0xffffff);
      }
    } catch (_) { /* optional */ }
  }, 700);
}
