/**
 * KEKE NAPEP RACE CHALLENGE - keke napeps only.
 * Five AI keke napeps (your own keke GLBs) line up beside you on a 2 km sprint. 3-2-1-GO, live position chip,
 * contact with a rival scrapes both, finish line banner, prize money by position (added to run fares).
 * Start it from the start screen or the street menu.
 */
import * as THREE from 'three';

const UNITS_PER_KM = 1008;
const RACE_KM = 2.0;
const GRID_KM = 0.012;
const LANES = [-3.0, -1.5, 0, 1.5, 3.0];
const PRIZE = [12000, 7000, 4000, 2000, 1000, 500];
const NAMES = ['You', 'Auwal', 'Danladi', 'Bashir', 'Ladi', 'Sani'];
const KEKE_KEYS = ['keke'];
const game = () => window.kanoGame || window.__KANO_ACTIVE_GAME__;

let race = null;       // active race
let wantRace = false;  // armed from a button, waits for PLAY
let chip = null;
let banner = null;

function el(id, css) {
  let e = document.getElementById(id);
  if (e) return e;
  e = document.createElement('div');
  e.id = id;
  e.style.cssText = css;
  document.body.appendChild(e);
  return e;
}
const ensureChip = () => (chip = el('kano-race-chip',
  'position:fixed;left:50%;top:150px;transform:translateX(-50%);z-index:46;padding:7px 14px;border-radius:14px;'
  + 'font:900 15px/1.25 system-ui,sans-serif;color:#fff;background:rgba(20,24,30,.94);border:2px solid #ffc63d;'
  + 'pointer-events:none;display:none;white-space:nowrap;text-align:center'));
const ensureBanner = () => (banner = el('kano-race-banner',
  'position:fixed;left:50%;top:38%;transform:translate(-50%,-50%);z-index:60;font:900 64px/1 system-ui,sans-serif;'
  + 'color:#ffc63d;text-shadow:0 4px 18px #000,0 0 6px #000;pointer-events:none;display:none;text-align:center'));

function fit(model, height) {
  const box = new THREE.Box3().setFromObject(model);
  const h = box.max.y - box.min.y;
  if (!(h > 0.05)) return false;
  model.scale.multiplyScalar(height / h);
  const low = new THREE.Box3().setFromObject(model);
  model.position.y -= low.min.y;
  return true;
}

async function buildRacer(models, i) {
  const holder = new THREE.Group();
  try {
    await models.load('keke');
    const m = models.getInstance('keke');
    if (m && fit(m, 1.75)) {
      m.rotation.y = Math.PI;      // face down the road (-z)
      holder.add(m);
    }
  } catch (_) { /* fall through */ }
  if (!holder.children.length) return null;
  holder.userData.racer = i;
  return holder;
}

function placeBanner(text, ms) {
  const b = ensureBanner();
  b.textContent = text;
  b.style.display = 'block';
  clearTimeout(b._t);
  if (ms) b._t = setTimeout(() => { b.style.display = 'none'; }, ms);
}

function makeFinishArch(z) {
  const g = new THREE.Group();
  const white = new THREE.MeshBasicMaterial({ color: 0xf6f6f2 });
  const black = new THREE.MeshBasicMaterial({ color: 0x111111 });
  for (let r = 0; r < 2; r += 1) {
    for (let c = 0; c < 20; c += 1) {
      const t = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.5), (r + c) % 2 ? white : black);
      t.rotation.x = -Math.PI / 2; t.position.set(-4.75 + c * 0.5, 0.06, r * 0.5);
      g.add(t);
    }
  }
  for (const x of [-5.4, 5.4]) {
    const p = new THREE.Mesh(new THREE.BoxGeometry(0.25, 5, 0.25), new THREE.MeshBasicMaterial({ color: 0xffc63d }));
    p.position.set(x, 2.5, 0); g.add(p);
  }
  const bar = new THREE.Mesh(new THREE.BoxGeometry(11, 0.9, 0.2), new THREE.MeshBasicMaterial({ color: 0x14181e }));
  bar.position.set(0, 4.7, 0); g.add(bar);
  const cv = document.createElement('canvas'); cv.width = 512; cv.height = 64;
  const x = cv.getContext('2d');
  x.fillStyle = '#14181e'; x.fillRect(0, 0, 512, 64);
  x.fillStyle = '#ffc63d'; x.font = '900 44px system-ui,sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle';
  x.fillText('FINISH · KEKE RACE', 256, 34);
  const tex = new THREE.CanvasTexture(cv);
  const face = new THREE.Mesh(new THREE.PlaneGeometry(10.6, 0.85), new THREE.MeshBasicMaterial({ map: tex }));
  face.position.set(0, 4.7, 0.12); face.rotation.y = Math.PI; g.add(face);
  const face2 = face.clone(); face2.position.z = -0.12; face2.rotation.y = 0; g.add(face2);
  g.position.z = z;
  return g;
}

async function startRace(g, R) {
  const s = g.s;
  if (!R?.models?.load) { g.ui?.toast?.('Race needs the 3D world. Switch rendering to 3D.'); return; }
  try { R.setLifeScene?.('road'); } catch (_) { /* optional */ }
  s.event = null; s.eventCooldown = Math.max(s.eventCooldown || 0, 40);
  const base = s.distance;
  const group = new THREE.Group();
  group.name = 'KANO_KEKE_RACE';
  const racers = [];
  for (let i = 1; i <= 5; i += 1) {
    const mesh = await buildRacer(R.models, i);
    if (!mesh) continue;
    group.add(mesh);
    racers.push({
      name: NAMES[i], mesh, lane: LANES[(i + 1) % 5] === 0 ? LANES[i % 5] : LANES[(i + 1) % 5],
      km: base + GRID_KM + (i % 2 ? 0.004 : 0), x: 0, base: 41 + i * 2.4 + Math.random() * 4,
      v: 0, mood: Math.random() * 6, finished: false, time: 0,
    });
  }
  if (!racers.length) { g.ui?.toast?.('Race keke models are still loading. Try again in a moment.'); return; }
  // Distinct lanes (player owns the middle)
  const free = LANES.filter((l) => Math.abs(l) > 0.2);
  racers.forEach((r, i) => { r.lane = free[i % free.length] + (i >= free.length ? 0.6 : 0); r.x = r.lane; });
  const finishKm = base + RACE_KM;
  const arch = makeFinishArch(2 - (finishKm - s.distance) * UNITS_PER_KM);
  group.add(arch);
  R.world.add(group);
  race = {
    group, arch, racers, base, finishKm, t: 0, countdown: 3.4, go: false, done: false, place: 0,
    playerTime: 0, finishedList: [], lastBump: 0,
  };
  s.speed = 0; s.signedSpeed = 0;
  g.ui?.toast?.('🏁 KEKE RACE · 2 km sprint · keke napeps only · 3rd place or better wins prize money');
}

function standings(g) {
  const list = [{ name: 'You', km: g.s.distance, me: true, time: race.playerTime, fin: race.playerFin }];
  for (const r of race.racers) list.push({ name: r.name, km: r.km, time: r.time, fin: r.finished });
  list.sort((a, b) => {
    if (a.fin && b.fin) return a.time - b.time;
    if (a.fin) return -1; if (b.fin) return 1;
    return b.km - a.km;
  });
  return list;
}

function finish(g) {
  const list = standings(g);
  const pos = list.findIndex((x) => x.me) + 1;
  const prize = PRIZE[pos - 1] || 0;
  g.s.fares = (g.s.fares || 0) + prize;
  g.s.score = (g.s.score || 0) + prize;
  const medal = pos === 1 ? '🥇' : pos === 2 ? '🥈' : pos === 3 ? '🥉' : '🏁';
  placeBanner(`${medal} ${pos}${['st', 'nd', 'rd'][pos - 1] || 'th'} PLACE`, 4200);
  g.ui?.toast?.(`🏁 Race finished: ${pos}/${list.length} in ${race.playerTime.toFixed(1)}s · prize ₦${prize.toLocaleString()}`);
  race.done = true;
  setTimeout(() => cleanup(), 6000);
}

function cleanup() {
  if (race?.group) {
    race.group.parent?.remove(race.group);
    race.group.traverse?.((o) => { o.geometry?.dispose?.(); });
  }
  race = null;
  if (chip) chip.style.display = 'none';
  if (banner) banner.style.display = 'none';
}

let last = performance.now();
function frame() {
  const now = performance.now();
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  try {
    const g = game();
    const R = window.kanoRenderer;
    if (wantRace && g?.state === 'PLAY' && g.s && R?.world && !race) {
      wantRace = false;
      startRace(g, R);
    }
    if (race && (!g || g.state === 'OVER' || g.state === 'MENU' || g.state === 'START')) cleanup();
    if (race && g?.state === 'PLAY') {
      const s = g.s;
      const c = ensureChip();
      if (race.countdown > 0) {
        race.countdown -= dt;
        s.speed = 0; s.signedSpeed = 0;
        const n = Math.ceil(race.countdown - 0.4);
        placeBanner(n > 0 ? String(n) : 'GO!', 0);
        if (race.countdown <= 0.4 && !race.go) { race.go = true; setTimeout(() => { if (banner) banner.style.display = 'none'; }, 900); }
        if (race.countdown <= 0) race.countdown = 0;
      }
      if (race.go) {
        if (!race.done) race.t += dt;
        const pSpeed = Math.abs(s.signedSpeed ?? s.speed ?? 0);
        const myKm = s.distance;
        for (const r of race.racers) {
          if (r.finished) { r.v = Math.max(r.v - 30 * dt, 0); }
          else {
            // Rubber-banding: stay close enough to fight, never impossible.
            const gap = myKm - r.km;
            r.mood += dt * 0.7;
            let target = r.base + Math.sin(r.mood) * 3.2 + Math.max(-4, Math.min(8, gap * 120));
            target = Math.max(32, Math.min(70, target));
            r.v += (target - r.v) * Math.min(1, dt * 1.4);
          }
          r.km += (r.v * dt) / 3600;
          if (!r.finished && r.km >= race.finishKm) { r.finished = true; r.time = race.t; }
          // Contact: same lane, close in depth
          const dz = (r.km - myKm) * UNITS_PER_KM;
          const px = R.player?.position.x || 0;
          if (Math.abs(dz) < 3.4 && Math.abs(r.x - px) < 1.3 && race.t - race.lastBump > 1.1 && !race.done) {
            race.lastBump = race.t;
            s.speed *= 0.82; if (Number.isFinite(s.signedSpeed)) s.signedSpeed *= 0.82;
            s.condition = Math.max(0, (s.condition ?? 100) - 0.6);
            s.crashShake = Math.max(s.crashShake || 0, 0.45);
            r.v *= 0.9;
            r.lane = r.lane + (r.x >= px ? 1.4 : -1.4);
            r.lane = Math.max(-3.2, Math.min(3.2, r.lane));
            g.ui?.toast?.('💢 Contact with ' + r.name + '!');
          }
          r.x += (r.lane - r.x) * Math.min(1, dt * 4);
        }
        if (!race.playerFin && myKm >= race.finishKm) { race.playerFin = true; race.playerTime = race.t; finish(g); }
        else if (!race.playerFin) race.playerTime = race.t;
      }
      // Position everything in the world
      for (const r of race.racers) {
        const z = 2 - (r.km - s.distance) * UNITS_PER_KM;
        r.mesh.position.set(r.x, 0, z);
        r.mesh.visible = z > -420 && z < 40;
        r.mesh.rotation.z = Math.sin(race.t * 5 + r.mood) * 0.012;
      }
      race.arch.position.z = 2 - (race.finishKm - s.distance) * UNITS_PER_KM;
      race.arch.visible = race.arch.position.z > -420 && race.arch.position.z < 40;
      if (!race.done) {
        const list = standings(g);
        const pos = list.findIndex((x) => x.me) + 1;
        const left = Math.max(0, (race.finishKm - s.distance) * 1000);
        c.style.display = 'block';
        c.innerHTML = `🏁 KEKE RACE · <span style="color:#ffc63d">P${pos}/${list.length}</span><br><span style="font:700 11px system-ui;opacity:.85">${Math.round(left)} m to finish · ${race.t.toFixed(1)}s</span>`;
      } else c.style.display = 'none';
    }
  } catch (_) { /* optional */ }
  requestAnimationFrame(frame);
}

function addButtons() {
  const mk = (cls) => {
    const b = document.createElement('button');
    b.type = 'button'; b.className = cls; b.id = 'kano-race-start-' + cls.split(' ')[0];
    b.textContent = '🏁 KEKE NAPEP RACE CHALLENGE';
    b.addEventListener('click', () => {
      wantRace = true;
      const g = game();
      if (g?.state === 'PLAY') { document.getElementById('resume-btn')?.click(); return; }
      document.getElementById('start-btn')?.click();
    });
    return b;
  };
  const startExtra = document.querySelector('.start-extra');
  if (startExtra && !document.getElementById('kano-race-start-secondary')) startExtra.appendChild(mk('secondary'));
  const menuActions = document.querySelector('#menu-screen .menu-actions');
  if (menuActions && !document.getElementById('kano-race-start-menuitem')) {
    const b = mk('menuitem'); b.textContent = '🏁 START KEKE RACE'; menuActions.insertBefore(b, menuActions.firstChild);
  }
}

if (typeof window !== 'undefined' && !window.__kanoKekeRace) {
  window.__kanoKekeRace = true;
  window.kanoRace = { start: () => { wantRace = true; }, current: () => race, finish: () => race && finish(game()) };
  const tryButtons = () => { try { addButtons(); } catch (_) { /* optional */ } };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', tryButtons);
  else tryButtons();
  setInterval(tryButtons, 2000);
  requestAnimationFrame(frame);
}
