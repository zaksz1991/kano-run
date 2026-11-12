/**
 * KAROTA pursuit. Choosing RUN at a checkpoint used to just add "wanted heat" and nothing followed. Now a KAROTA
 * pickup (your own GLB) gives chase from behind with a siren and a rear-view gap bar:
 *   - it starts ~45 m back and gets faster the longer the chase lasts (48 -> 74 km/h)
 *   - stay faster than it and open a 300 m gap -> you lose them
 *   - slow down (traffic, potholes, junctions) and it closes in, pulls alongside, cuts in front and BOOKS you:
 *     stopped for a few seconds, fine N2,500 and more wanted heat
 *   - after 45 s they give up
 */
import * as THREE from 'three';

const UNITS_PER_KM = 1008;
const START_GAP_KM = 0.045;
const ESCAPE_GAP_KM = 0.3;
const CAUGHT_GAP_KM = 0.006;
const MAX_CHASE_S = 45;
const FINE = 2500;
const game = () => window.kanoGame || window.__KANO_ACTIVE_GAME__;
let chase = null;
let flash = null;
let audio = null;

function ensureUi() {
  if (!document.getElementById('kano-chase-css')) {
    const st = document.createElement('style');
    st.id = 'kano-chase-css';
    st.textContent = `
#kano-chase-flash{position:fixed;inset:0;z-index:43;pointer-events:none;display:none;box-shadow:inset 0 0 70px 14px rgba(255,40,40,.55);animation:kanoSiren .5s steps(1) infinite}
@keyframes kanoSiren{0%{box-shadow:inset 0 0 70px 14px rgba(255,40,40,.55)}50%{box-shadow:inset 0 0 70px 14px rgba(50,110,255,.6)}}
#kano-chase-chip{padding:7px 10px;border-radius:12px;background:rgba(20,10,10,.95);border:2px solid #ff5a4a;color:#fff;font:900 12px/1.3 system-ui,sans-serif;display:none;pointer-events:none}
#kano-chase-chip .bar{height:7px;border-radius:4px;background:rgba(255,255,255,.18);margin-top:5px;overflow:hidden}
#kano-chase-chip .fill{height:100%;background:linear-gradient(90deg,#ff5a4a,#ffd35a)}`;
    document.head.appendChild(st);
  }
  if (!flash) { flash = document.createElement('div'); flash.id = 'kano-chase-flash'; document.body.appendChild(flash); }
  let chip = document.getElementById('kano-chase-chip');
  if (!chip) { chip = document.createElement('div'); chip.id = 'kano-chase-chip'; document.body.appendChild(chip); }
  return chip;
}

function siren(on) {
  try {
    if (!on) { audio?.osc?.stop(); audio?.ctx?.close(); audio = null; return; }
    if (audio) return;
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    const osc = ctx.createOscillator(); const gain = ctx.createGain();
    osc.type = 'square'; gain.gain.value = 0.025;
    osc.connect(gain); gain.connect(ctx.destination); osc.start();
    audio = { ctx, osc, t: 0 };
  } catch (_) { audio = null; }
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

async function startChase(g) {
  if (chase) return;
  const R = window.kanoRenderer;
  const s = g.s;
  chase = { gap: START_GAP_KM, t: 0, v: 48, x: R?.player?.position?.x || 0, node: null, state: 'chase', parkT: 0 };
  ensureUi();
  siren(true);
  g.ui?.toast?.('🚔 KAROTA is chasing you! Keep your speed up and avoid traffic.');
  try {
    if (R?.models?.load) {
      await R.models.load('karota');
      const m = R.models.getInstance('karota');
      if (m && fit(m, 1.9)) {
        const holder = new THREE.Group();
        holder.add(m);
        // light bar: two small emissive blocks that alternate red / blue
        const mk = (c) => new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.18, 0.3), new THREE.MeshBasicMaterial({ color: c }));
        const red = mk(0xff2a2a); red.position.set(-0.35, 2.15, 0);
        const blue = mk(0x2a6bff); blue.position.set(0.35, 2.15, 0);
        holder.add(red, blue);
        holder.userData.lights = [red, blue];
        R.world.add(holder);
        if (chase) chase.node = holder;
      }
    }
  } catch (_) { /* chase still works without the model */ }
  s.heat = Math.min(100, (s.heat || 0) + 4);
}

function endChase(g, outcome) {
  const c = chase;
  chase = null;
  siren(false);
  if (flash) flash.style.display = 'none';
  const chip = document.getElementById('kano-chase-chip');
  if (chip) chip.style.display = 'none';
  if (c?.node) { c.node.parent?.remove(c.node); c.node.traverse?.((o) => o.geometry?.dispose?.()); }
  if (!g) return;
  if (outcome === 'escaped') { g.ui?.toast?.('You lost KAROTA. Heat cools off slowly.'); g.s.heat = Math.max(0, g.s.heat - 12); }
  if (outcome === 'gaveup') { g.ui?.toast?.('KAROTA gave up the chase.'); g.s.heat = Math.max(0, g.s.heat - 6); }
}

let last = performance.now();
function frame() {
  const now = performance.now();
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  try {
    const g = game();
    const R = window.kanoRenderer;
    if (g && !g.__kanoChaseHook && typeof g.resolveEvent === 'function') {
      g.__kanoChaseHook = true;
      const orig = g.resolveEvent.bind(g);
      g.resolveEvent = function (action, ...rest) {
        const wasKarota = this.s?.event === 'karota';
        const out = orig(action, ...rest);
        if (wasKarota && action === 'run') startChase(this);
        return out;
      };
      window.kanoChase = { start: () => startChase(g), current: () => chase };
    }
    if (chase && g) {
      if (g.state === 'OVER' || g.state === 'INTRO' || g.state === 'MENU') { endChase(null, 'cancel'); }
      else if (g.state === 'PLAY' && !g.s.event) {
        const s = g.s;
        const chip = ensureUi();
        const sp = Math.abs(s.signedSpeed ?? s.speed ?? 0);
        if (chase.state === 'chase') {
          chase.t += dt;
          chase.v = Math.min(74, 48 + chase.t * 1.2);
          chase.gap += ((sp - chase.v) / 3600) * dt;     // km
          const gapM = Math.max(0, Math.round(chase.gap * 1000));
          flash.style.display = 'block';
          chip.style.display = 'block';
          chip.innerHTML = `🚔 KAROTA BEHIND YOU · ${gapM} m<div class="bar"><div class="fill" style="width:${Math.max(0, Math.min(100, (1 - chase.gap / ESCAPE_GAP_KM) * 100))}%"></div></div>`;
          if (audio?.osc) { audio.t += dt; audio.osc.frequency.value = (Math.floor(audio.t / 0.45) % 2) ? 700 : 950; }
          if (chase.gap >= ESCAPE_GAP_KM) endChase(g, 'escaped');
          else if (chase.t > MAX_CHASE_S) endChase(g, 'gaveup');
          else if (chase.gap <= CAUGHT_GAP_KM) {
            chase.state = 'booked';
            chase.parkT = 0;
            s.score = Math.max(0, (s.score || 0) - FINE);
            s.heat = Math.min(100, (s.heat || 0) + 8);
            g.ui?.toast?.(`🚔 KAROTA cornered you · fined ₦${FINE.toLocaleString()}`);
          }
        } else if (chase.state === 'booked') {
          chase.parkT += dt;
          s.speed = 0; s.signedSpeed = 0; s.gas = false;
          chip.innerHTML = '🚔 BOOKED · wait while the officer writes the ticket…';
          if (chase.parkT > 3.5) endChase(g, 'booked');
        }
        if (chase?.node && R?.player) {
          const px = R.player.position.x || 0;
          chase.x += (px - chase.x) * Math.min(1, dt * 1.6);
          let z = 2 + chase.gap * UNITS_PER_KM;
          let x = chase.x;
          if (chase.state === 'booked') { z = 2 - 7 * Math.min(1, chase.parkT / 1.2); x = px + 1.8 * (1 - Math.min(1, chase.parkT / 1.2)); }
          chase.node.position.set(x, 0, z);
          chase.node.visible = z < 60;
          const [r, b] = chase.node.userData.lights || [];
          if (r && b) { const on = Math.floor(now / 250) % 2 === 0; r.visible = on; b.visible = !on; }
        }
      }
    }
  } catch (_) { /* optional */ }
  requestAnimationFrame(frame);
}

if (typeof window !== 'undefined' && !window.__kanoKarotaChase) {
  window.__kanoKarotaChase = true;
  requestAnimationFrame(frame);
}
