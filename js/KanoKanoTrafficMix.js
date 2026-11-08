/**
 * Kano road mix: about 50% keke napep, 20% motorcycle (okada/achaba) and 30% everything else
 * (cars, taxis, SUVs, trucks/lorries, buses). Assigned in shuffled batches of ten so the mix holds at any moment.
 * Only the vehicle type changes, so every vehicle still renders from its own GLB model.
 */
const BAG = ['keke', 'keke', 'keke', 'keke', 'keke', 'motorcycle', 'motorcycle'];
const OTHERS = [['car', 3], ['taxi', 2], ['suv', 2], ['truck', 1.4], ['bus', 1.1]];

function pickOther(heavyUsed) {
  const pool = OTHERS.filter(([t]) => !(heavyUsed && (t === 'truck' || t === 'bus')));
  const total = pool.reduce((a, [, w]) => a + w, 0);
  let r = Math.random() * total;
  for (const [t, w] of pool) { r -= w; if (r <= 0) return t; }
  return 'car';
}

function newBatch() {
  const batch = [...BAG];
  let heavy = false;
  for (let i = 0; i < 3; i += 1) {
    const t = pickOther(heavy);
    if (t === 'truck' || t === 'bus') heavy = true;
    batch.push(t);
  }
  for (let i = batch.length - 1; i > 0; i -= 1) { const j = Math.floor(Math.random() * (i + 1)); [batch[i], batch[j]] = [batch[j], batch[i]]; }
  return batch;
}

if (typeof window !== 'undefined' && !window.__kanoTrafficMix) {
  window.__kanoTrafficMix = true;
  const wait = setInterval(() => {
    const g = window.kanoGame;
    if (!g || typeof g.spawnTraffic !== 'function') return;
    clearInterval(wait);
    const orig = g.spawnTraffic.bind(g);
    let bag = [];
    g.spawnTraffic = function (...a) {
      const before = new Set(this.s.traffic || []);
      const r = orig(...a);
      for (const v of this.s.traffic || []) {
        if (before.has(v) || !v) continue;
        if (!bag.length) bag = newBatch();
        v.type = bag.pop();
      }
      return r;
    };
    window.kanoTrafficMixAudit = () => {
      const c = {}; const t = window.kanoGame?.s?.traffic || [];
      t.forEach((v) => { c[v.type] = (c[v.type] || 0) + 1; });
      return { total: t.length, counts: c };
    };
  }, 400);
}
