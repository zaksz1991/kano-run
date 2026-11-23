/**
 * Crisp on-screen tags for pick-up, drop-off and fuel points.
 * The 3D roadside boards are small and soften on phones that render at a reduced resolution, so each stop
 * also gets a sharp HTML tag that follows it down the road: what it is, where, and how far.
 */
import * as THREE from 'three';

const KEY = Symbol.for('kano.life.zoneTags.v1');
if (!window[KEY]) {
  window[KEY] = true;
  const layer = document.createElement('div');
  layer.id = 'kano-zone-tags';
  layer.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:25;overflow:hidden';
  const style = document.createElement('style');
  style.textContent = '.kzt{position:absolute;left:0;top:0;transform-origin:50% 100%;padding:5px 9px 6px;border-radius:10px;background:rgba(10,13,18,.92);'
    + 'font:800 12px/1.25 Arial,sans-serif;color:#f4efe3;max-width:176px;border:2px solid var(--c);box-shadow:0 4px 14px #0009;will-change:transform}'
    + '.kzt b{display:block;font:900 10px Arial;letter-spacing:.14em;color:var(--c)}'
    + '.kzt span{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.kzt u{text-decoration:none}.kzt i{font-style:normal;opacity:.7;margin-left:6px;font-weight:700}'
    + '.kzt:after{content:"";position:absolute;left:50%;bottom:-8px;margin-left:-6px;border:6px solid transparent;border-top-color:var(--c);border-bottom:0}';
  document.head.append(style);
  document.body.append(layer);

  const KINDS = {
    pickup: { c: '#2fe08d', head: 'PICK UP' },
    drop: { c: '#ff9a3c', head: 'DROP OFF' },
    fuel: { c: '#4aa8ff', head: 'FUEL' },
  };
  const pool = [];
  const v = new THREE.Vector3();
  let last = 0;

  const chip = (i) => {
    if (!pool[i]) { const e = document.createElement('div'); e.className = 'kzt'; e.innerHTML = '<b></b><span><u></u></span>'; layer.append(e); pool[i] = e; }
    return pool[i];
  };
  const hideFrom = (n) => { for (let i = n; i < pool.length; i++) pool[i].style.display = 'none'; };

  function tick(now) {
    requestAnimationFrame(tick);
    if (now - last < 50) return;
    last = now;
    try {
      const game = window.kanoGame; const R = window.kanoRenderer;
      if (!game || !R || game.state !== 'PLAY' || window.kanoBoardingCamera?.w > 0.02 || !R.camera || !R.zoneActors) { hideFrom(0); return; }
      const rect = (R.renderer?.domElement || document.body).getBoundingClientRect();
      const list = [];
      for (const z of game.s.zones || []) {
        const kind = KINDS[z.type];
        const depth = Number(z.depth);
        if (!kind || !(depth > 0.02 && depth < 0.95)) continue;
        const actor = R.zoneActors.get(z.id);
        if (!actor || actor.visible === false) continue;
        list.push({ z, kind, depth, actor });
      }
      list.sort((a, b) => a.depth - b.depth);
      let n = 0;
      const used = [];
      for (const it of list) {
        if (n >= 4) break;
        it.actor.getWorldPosition(v); v.y += 3.4;
        v.project(R.camera);
        if (v.z > 1 || v.z < -1) continue;
        const x = rect.left + (v.x * 0.5 + 0.5) * rect.width;
        const y0 = rect.top + (-v.y * 0.5 + 0.5) * rect.height;
        const y = Math.max(304, y0);
        if (y > rect.height - 190) continue;
        const cx = Math.max(100, Math.min(rect.width - 100, x));
        if (used.some((u) => Math.abs(u.x - cx) < 130 && Math.abs(u.y - y) < 56)) continue;
        used.push({ x: cx, y });
        const e = chip(n++);
        const full = String(it.z.label || '').replace(/^(PICK UP|DROP OFF|DROP-OFF|FUEL STATION)\s*[·:-]\s*/i, '');
        e.style.setProperty('--c', it.kind.c);
        e.firstChild.textContent = `${it.kind.head} · ${Math.round(it.depth * 88)} m`;
        e.querySelector('u').textContent = full;
        const s = Math.max(0.72, Math.min(1.1, 1.15 - it.depth * 0.5));
        e.style.display = 'block';
        e.style.transform = `translate(${Math.round(cx)}px,${Math.round(y)}px) translate(-50%,-100%) scale(${s.toFixed(2)})`;
      }
      hideFrom(n);
    } catch { hideFrom(0); }
  }
  requestAnimationFrame(tick);
}
