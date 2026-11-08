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
  if (level <= 1) return;
  world.traverse((object) => {
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
