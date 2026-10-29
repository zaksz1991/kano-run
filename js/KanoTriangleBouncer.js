/**
 * Last-line safety for phones. Every few seconds it looks for any single loaded model
 * (a scene root named "Sketchfab_Scene", or a GLB root with a model path) that is far
 * heavier than a phone can draw. Oversized instanced copies are cut down to a safe count;
 * an oversized single model is hidden. Roads, ground and the flyover are never touched.
 * It only runs on phones / weak GPUs and logs what it did in window.kanoBouncerLog.
 */
const LIMIT = 20000;
const SAFE = /road|ground|flyover|asphalt|sand|kano_|KWANKWASIYYA|world|terrain|sky/i;

function isPhone() {
  try {
    return /Android|iPhone|iPad|Mobile/i.test(navigator.userAgent) || window.matchMedia('(pointer: coarse)').matches;
  } catch (_) { return false; }
}

function trisOf(node) {
  let total = 0;
  node.traverse((c) => {
    if (!c.geometry || !c.visible) return;
    const g = c.geometry;
    const per = (g.index ? g.index.count : g.attributes.position.count) / 3;
    total += per * (c.isInstancedMesh ? c.count : 1);
  });
  return total;
}

function sweep() {
  const scene = window.__KANO_ACTIVE_RENDERER__?.scene;
  if (!scene) return;
  window.kanoBouncerLog = window.kanoBouncerLog || [];
  const candidates = [];
  scene.traverse((n) => {
    if (!n.visible) return;
    const name = String(n.name || '');
    if (name === 'Sketchfab_Scene' || n.userData?.modelPath) candidates.push(n);
  });
  for (const n of candidates) {
    if (!n.visible) continue;
    const t = trisOf(n);
    if (t <= LIMIT) continue;
    const path = [];
    for (let q = n; q; q = q.parent) path.push(q.name || q.type);
    const chain = path.join('<');
    if (SAFE.test(chain)) continue;
    let reduced = false;
    n.traverse((c) => {
      if (c.isInstancedMesh && c.count > 1) {
        const per = (c.geometry.index ? c.geometry.index.count : c.geometry.attributes.position.count) / 3;
        const keep = Math.max(1, Math.floor(LIMIT / Math.max(1, per)));
        if (c.count > keep) { c.count = keep; reduced = true; }
      }
    });
    if (!reduced || trisOf(n) > LIMIT * 1.5) n.visible = false;
    window.kanoBouncerLog.push({ tris: Math.round(t), chain: chain.slice(0, 120), action: n.visible ? 'reduced' : 'hidden' });
    if (window.kanoBouncerLog.length > 20) window.kanoBouncerLog.shift();
    try { console.warn('[TriangleBouncer]', Math.round(t), chain); } catch (_) { /* optional */ }
  }
}

if (typeof window !== 'undefined' && isPhone()) {
  setInterval(() => { try { sweep(); } catch (_) { /* never break the game */ } }, 3000);
}
