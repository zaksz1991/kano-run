/**
 * Kano traffic-light junctions with real compliance rules.
 * Signalised junctions appear every ~3 km. Each has its own cycle: GREEN 45-60 s, then RED 45-60 s, with a live
 * countdown chip as you approach. Signal poles come from your own trafficLight GLB; cross traffic uses your own
 * vehicle GLBs. Rules:
 *  - RED: stop behind the white line. Waiting is the honest cost of obeying the law.
 *  - Run the red at speed and cross traffic is already moving: you are hit (damage, shake, fine, heat, upset passenger).
 *  - Jump it in the first 3 s of red (cross traffic hasn't started): near miss + fine only.
 *  - Last 4 s of green shows AMBER so you can decide early.
 */
import * as THREE from 'three';

const UNITS_PER_KM = 1008;
const PERIOD_KM = 3.1;
const OFFSET_KM = 0.8;
const SHOW_KM = 0.28;
const LINE_KM = 0.008;      // stop line sits 8 m before the junction centre
const CROSS_KEYS = ['car', 'keke', 'taxi', 'motorcycle', 'truck', 'keke'];
const CROSS_H = { car: 1.5, keke: 1.7, taxi: 1.5, motorcycle: 1.3, truck: 2.6 };
const game = () => window.kanoGame || window.__KANO_ACTIVE_GAME__;
const t0 = performance.now();
const now = () => (performance.now() - t0) / 1000;

const hash = (n) => { const x = Math.sin(n * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); };

function cycleOf(i) {
  const green = 45 + Math.floor(hash(i + 1) * 16);
  const red = 45 + Math.floor(hash(i + 7) * 16);
  return { green, red, off: hash(i + 13) * (green + red) };
}

/** Phase of junction i at the current moment. */
export function signalPhase(i, t = now()) {
  if (typeof window !== 'undefined' && window.__kanoSignalForce) return window.__kanoSignalForce;
  const c = cycleOf(i);
  const len = c.green + c.red;
  const p = (t + c.off) % len;
  if (p < c.green) {
    const left = c.green - p;
    return { state: left <= 4 ? 'amber' : 'green', left: Math.ceil(left), redAge: 0 };
  }
  const left = len - p;
  return { state: 'red', left: Math.ceil(left), redAge: p - c.green };
}

let J = null;       // {index, atKm, group, lamps, cross[], crossTimer, handled, waited}
let chip = null;
let busy = false;

function ensureChip() {
  if (chip && chip.isConnected) return chip;
  chip = document.createElement('div');
  chip.id = 'kano-signal-chip';
  chip.style.cssText = 'position:fixed;left:36%;top:186px;transform:translateX(-50%);z-index:45;padding:7px 14px;'
    + 'border-radius:14px;font:900 15px/1.2 system-ui,sans-serif;color:#fff;background:rgba(20,24,30,.94);'
    + 'border:2px solid #888;pointer-events:none;display:none;white-space:nowrap;text-align:center';
  document.body.appendChild(chip);
  return chip;
}

function fit(model, height) {
  const box = new THREE.Box3().setFromObject(model);
  const h = box.max.y - box.min.y;
  if (!(h > 0.05)) return false;
  model.scale.multiplyScalar(height / h);
  const low = new THREE.Box3().setFromObject(model);
  model.position.y -= low.min.y;
  return true;
}

async function grab(models, key, height) {
  try {
    await models.load(key);
    const m = models.getInstance(key);
    if (!m || !fit(m, height)) return null;
    const holder = new THREE.Group();
    holder.add(m);
    return holder;
  } catch (_) { return null; }
}

async function build(renderer, index) {
  const group = new THREE.Group();
  group.name = 'KANO_SIGNAL_JUNCTION';
  const models = renderer?.models;
  const lamps = {};
  const mat = (c) => new THREE.MeshBasicMaterial({ color: c, side: THREE.DoubleSide });
  // Stop line + crossing stripes (paint on the road)
  const line = new THREE.Mesh(new THREE.PlaneGeometry(6.4, 0.35), mat(0xf4f4f0));
  line.rotation.x = -Math.PI / 2; line.position.set(1.5, 0.05, 9);
  group.add(line);
  for (let k = 0; k < 7; k += 1) {
    const s = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 2.2), mat(0xf4f4f0));
    s.rotation.x = -Math.PI / 2; s.position.set(-1.2 + k * 0.9, 0.05, 6.6);
    group.add(s);
  }
  // Signal heads: your GLB pole on both sides, plus a lit lamp face the driver reads.
  if (models?.load) {
    const left = await grab(models, 'trafficLight', 4.4);
    const right = await grab(models, 'trafficLight', 4.4);
    if (left) { left.position.set(-5.0, 0, 8); left.rotation.y = Math.PI; group.add(left); }
    if (right) { right.position.set(5.6, 0, 8); right.rotation.y = Math.PI; group.add(right); }
  }
  [-4.7, 5.3].forEach((x, n) => {
    const housing = new THREE.Mesh(new THREE.BoxGeometry(0.85, 2.3, 0.3), mat(0x15181c));
    housing.position.set(x, 5.0, 8.3);
    group.add(housing);
    ['red', 'amber', 'green'].forEach((name, k) => {
      const lamp = new THREE.Mesh(new THREE.CircleGeometry(0.28, 16), mat(0x222222));
      lamp.position.set(x, 5.75 - k * 0.7, 8.57);
      group.add(lamp);
      (lamps[name] = lamps[name] || []).push(lamp);
    });
  });
  // Cross-traffic pool from your own vehicle GLBs
  const cross = [];
  if (models?.load) {
    for (let k = 0; k < 4; k += 1) {
      const key = CROSS_KEYS[(index + k) % CROSS_KEYS.length];
      const m = await grab(models, key, CROSS_H[key] || 1.6);
      if (!m) continue;
      m.visible = false;
      m.userData = { key, active: false, x: 0, vx: 0 };
      group.add(m);
      cross.push(m);
    }
  }
  return { group, lamps, cross };
}

function paintLamps(lamps, state) {
  const on = { red: 0xff2a1f, amber: 0xffb020, green: 0x27e05a };
  for (const name of ['red', 'amber', 'green']) {
    for (const l of lamps[name] || []) l.material.color.setHex(state === name ? on[name] : 0x222222);
  }
}

function launchCross(c, fromLeft, vx) {
  c.visible = true;
  c.userData.active = true;
  c.userData.vx = fromLeft ? vx : -vx;
  c.userData.x = fromLeft ? -16 : 18;
  c.position.set(c.userData.x, 0, 0);
  c.rotation.y = fromLeft ? Math.PI / 2 : -Math.PI / 2;
}

function runRed(g, j, ph, speedKmh, dKm) {
  const s = g.s;
  const fine = 1500;
  s.score = Math.max(0, (s.score || 0) - fine);
  s.heat = Math.min(100, (s.heat || 0) + 6);
  if (ph.redAge < 3) {
    g.ui?.toast?.(`🚦 Red light jumped · near miss! Fined ₦${fine.toLocaleString()}`);
    s.crashShake = Math.max(s.crashShake || 0, 0.25);
    return;
  }
  // Cross traffic is already flowing: aim a real vehicle at the keke so the crash is visible.
  const free = j.cross.find((c) => !c.userData.active) || j.cross[0];
  const t = Math.max(0.35, (dKm * 1000) / Math.max(2, speedKmh / 3.6));
  const fromLeft = Math.random() < 0.5;
  const px = 1.5;
  const startX = fromLeft ? -16 : 18;
  if (free) {
    launchCross(free, fromLeft, Math.min(26, Math.max(8, Math.abs(px - startX) / t)));
    free.userData.target = { x: px, kind: free.userData.key };
  }
  j.pendingHit = { at: now() + t, kind: free?.userData.key || 'car', fine };
}

function applyCrash(g, j) {
  const s = g.s;
  const kind = ['truck', 'car', 'taxi', 'keke'].includes(j.pendingHit.kind) ? j.pendingHit.kind : 'car';
  const vehicle = { type: kind === 'taxi' ? 'car' : kind, speedKmh: 38, direction: 1, lane: 1 };
  try { g.hit(vehicle); } catch (_) { /* optional */ }
  s.condition = Math.max(0, s.condition - 8);
  s.engine = Math.max(0, (s.engine ?? 100) - 4);
  s.speed *= 0.2;
  s.crashShake = Math.max(s.crashShake || 0, 1);
  s.heat = Math.min(100, (s.heat || 0) + 10);
  g.syncSignedSpeed?.();
  g.ui?.toast?.(`💥 T-boned running the red! Cross traffic had green · fine ₦${j.pendingHit.fine.toLocaleString()} · passenger is furious`);
  if (Array.isArray(s.passengers)) s.passengers.forEach((p) => { if (p && Number.isFinite(p.patience)) p.patience = Math.max(0, p.patience - 30); });
  if (Number.isFinite(s.satisfaction)) s.satisfaction = Math.max(0, s.satisfaction - 12);
  j.pendingHit = null;
}

/** Other drivers obey the light too: they slow, stop in a queue behind the line, and set off on green. */
const KM_PER_DEPTH = 88 / UNITS_PER_KM;
function holdTraffic(g, state, lineAheadKm) {
  const list = (g.s.traffic || []).filter((v) => v && v.direction !== -1 && Number.isFinite(v.depth));
  if (state === 'green') {
    for (const v of list) if (v.signalOrig) { v.speedKmh = v.signalOrig; v.signalOrig = 0; }
    return;
  }
  const byLane = {};
  for (const v of list) {
    const a = v.depth * KM_PER_DEPTH;
    if (a < 0 || a > lineAheadKm + 0.004 || lineAheadKm - a > 0.18) {
      if (v.signalOrig && a > lineAheadKm) { v.speedKmh = v.signalOrig; v.signalOrig = 0; }
      continue;
    }
    (byLane[v.lane] = byLane[v.lane] || []).push([a, v]);
  }
  for (const arr of Object.values(byLane)) {
    arr.sort((x, y) => y[0] - x[0]);       // nearest the line first
    arr.forEach(([a, v], rank) => {
      if (!v.signalOrig) v.signalOrig = Math.max(14, v.speedKmh || 20);
      const gap = lineAheadKm - rank * 0.006 - a;
      const want = gap <= 0.0008 ? 0 : v.signalOrig * Math.min(1, gap / 0.05);
      v.speedKmh = Math.min(v.speedKmh, Math.max(0, want));
      if (gap <= 0.0008) v.speedKmh = 0;
    });
  }
}

function cleanup() {
  if (J?.group) {
    J.group.parent?.remove(J.group);
    J.group.traverse?.((o) => { o.geometry?.dispose?.(); });
  }
  const gg = game();
  for (const v of gg?.s?.traffic || []) if (v.signalOrig) { v.speedKmh = v.signalOrig; v.signalOrig = 0; }
  J = null;
  busy = false;
  if (chip) chip.style.display = 'none';
}

function nextJunction(dist) {
  const i = Math.max(0, Math.ceil((dist - OFFSET_KM + 0.02) / PERIOD_KM));
  return { index: i, atKm: OFFSET_KM + i * PERIOD_KM };
}

let last = now();
function frame() {
  const dt = Math.min(0.1, Math.max(0, now() - last));
  last = now();
  try {
    const g = game();
    const R = window.kanoRenderer;
    if (g && R?.world && g.state === 'PLAY' && g.s) {
      const s = g.s;
      if (!J && !busy && s.distance > 0.15 && !s.event) {
        const n = nextJunction(s.distance);
        if (n.atKm - s.distance < SHOW_KM && n.atKm - s.distance > 0.1) {
          busy = true;
          build(R, n.index).then((b) => {
            if (!busy) return;
            J = { ...n, ...b, crossTimer: 0, handled: false, waitedAtRed: false, pendingHit: null };
            R.world.add(b.group);
          }).catch(() => { busy = false; });
        }
      }
      if (J) {
        const dKm = J.atKm - s.distance;
        J.group.position.z = 2 - dKm * UNITS_PER_KM;
        const ph = signalPhase(J.index);
        paintLamps(J.lamps, ph.state);
        const el = ensureChip();
        const speed = Math.abs(s.signedSpeed ?? s.speed ?? 0);
        // Cross traffic runs while we are red; it pours in at red start + 2 s.
        J.crossTimer -= dt;
        if (ph.state === 'red' && ph.redAge > 2 && J.crossTimer <= 0 && !J.pendingHit) {
          const free = J.cross.find((c) => !c.userData.active);
          if (free) launchCross(free, Math.random() < 0.5, 9 + Math.random() * 6);
          J.crossTimer = 2.2 + Math.random() * 2;
        }
        for (const c of J.cross) {
          if (!c.userData.active) continue;
          c.userData.x += c.userData.vx * dt;
          c.position.x = c.userData.x;
          if (c.userData.x < -20 || c.userData.x > 22) { c.userData.active = false; c.visible = false; }
        }
        if (J.pendingHit && now() >= J.pendingHit.at) applyCrash(g, J);
        // Chip
        if (dKm > -0.02 && dKm < SHOW_KM) {
          el.style.display = 'block';
          const colour = { green: '#27e05a', amber: '#ffb020', red: '#ff4a3d' }[ph.state];
          el.style.borderColor = colour;
          const dist = Math.max(0, Math.round((dKm - LINE_KM) * 1000));
          const word = ph.state === 'red' ? 'RED' : ph.state === 'amber' ? 'AMBER' : 'GREEN';
          const hint = ph.state === 'red'
            ? (dKm > LINE_KM ? 'stop at the line' : 'wait for green')
            : ph.state === 'amber' ? 'prepare to stop' : 'go';
          el.innerHTML = `<span style="color:${colour}">🚦 ${word} ${ph.left}s</span><br><span style="font:700 11px system-ui;opacity:.85">${dist} m · ${hint}</span>`;
        } else el.style.display = 'none';
        holdTraffic(g, ph.state, dKm - LINE_KM);
        // Compliance check when crossing the stop line
        if (!J.handled && dKm <= LINE_KM) {
          J.handled = true;
          if (ph.state === 'red') {
            if (speed > 6) runRed(g, J, ph, speed, Math.max(0.002, dKm + 0.008));
          } else if (ph.state === 'amber' && speed > 5) {
            // amber is legal to cross, nothing happens
          }
        }
        if (s.distance < J.atKm - SHOW_KM - 0.1 || dKm < -0.2 || g.state === 'OVER') cleanup();
      }
    } else if (J && (!g || g.state !== 'PLAY')) cleanup();
  } catch (_) { /* optional */ }
  requestAnimationFrame(frame);
}

if (typeof window !== 'undefined' && !window.__kanoTrafficSignals) {
  window.__kanoTrafficSignals = true;
  window.kanoSignals = { phase: signalPhase, current: () => J, cycleOf };
  requestAnimationFrame(frame);
}
