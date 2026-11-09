/**
 * Kano street politics.
 * Ambient radio news, street talk and rallies about the NNPP (Kwankwasiyya red cap) and APC contest for Kano.
 * Public facts only (as reported, Jan 2026): Governor Abba Kabir Yusuf, elected on the NNPP ticket in 2023,
 * joined the APC, where former governor Ganduje is a leader; Kwankwaso's NNPP is contesting 2027.
 * Nobody is quoted. The driver can wear a cap, take a flag or stay neutral; passengers react.
 */
import * as THREE from 'three';

const KEY = 'kano-politics-stance';
const UNITS_PER_KM = 1008;
const naira = (n) => `₦${Math.round(n).toLocaleString('en-NG')}`;
const get = () => { try { return localStorage.getItem(KEY) || ''; } catch (_) { return ''; } };
const set = (v) => { try { localStorage.setItem(KEY, v); } catch (_) { /* optional */ } };

const NEWS = [
  'Radio Kano: Governor Abba Kabir Yusuf, who won in 2023 on the NNPP ticket, joined the APC in January 2026.',
  'Radio Kano: APC leaders, including former governor Ganduje, welcomed the governor into the party ahead of 2027.',
  'Radio Kano: Kwankwaso and the NNPP say they will keep contesting Kano in 2027.',
  'Street talk: market traders are split, red cap or the new alliance. Everybody has an opinion.',
  'Radio Kano: Party offices say rallies and campaign vehicles will be on the roads more and more.',
  'Radio Kano: Keke riders say CNG queues are long and some stations are holding stock back while the price climbs.',
];
const RALLIES = [
  { side: 'NNPP', head: 'RED-CAP RALLY', color: '#e0412f', text: 'Kwankwasiyya supporters in red caps are dancing across half the road, drums and all.' },
  { side: 'APC', head: 'APC RALLY', color: '#2e9b57', text: 'APC supporters with green flags are blocking half the road, with a loudspeaker on a pickup.' },
];

let panel = null;
function host() {
  if (panel && panel.isConnected) return panel;
  panel = document.createElement('div');
  panel.id = 'kano-politics-panel';
  panel.style.cssText = 'position:fixed;left:50%;transform:translateX(-50%);bottom:68px;width:min(94vw,380px);z-index:61;color:#fff;border-radius:14px;padding:10px 12px;font:700 13px/1.35 Arial,sans-serif;box-shadow:0 6px 24px rgba(0,0,0,.55);display:none';
  document.body.append(panel);
  return panel;
}
const close = () => { if (panel) { panel.style.display = 'none'; panel.replaceChildren(); } };
function btn(label, fn, bg) {
  const b = document.createElement('button');
  b.type = 'button'; b.textContent = label;
  b.style.cssText = `flex:1 1 30%;min-height:38px;border-radius:9px;border:1px solid rgba(255,255,255,.5);font:900 12px Arial,sans-serif;color:#fff;background:${bg};touch-action:manipulation`;
  b.addEventListener('click', fn);
  return b;
}

function openRally(g, r) {
  const s = g.s;
  const el = host();
  el.style.background = 'rgba(12,16,24,.96)';
  el.style.border = `2px solid ${r.color}`;
  el.replaceChildren();
  const h = document.createElement('div');
  h.style.cssText = `font-size:11px;color:${r.color};letter-spacing:.08em`;
  h.textContent = `${r.head} AHEAD`;
  const t = document.createElement('div');
  t.style.marginTop = '4px';
  t.textContent = `${r.text} They want to know whose side you are on.`;
  const row = document.createElement('div');
  row.style.cssText = 'display:flex;flex-wrap:wrap;gap:6px;margin-top:8px';
  const done = (msg) => { g.ui?.toast?.(msg); close(); };
  row.append(
    btn(`JOIN ${r.side} +${naira(600)}`, () => {
      s.score += 600; set(r.side); s.speed = Math.min(s.speed, 14);
      done(`${r.side} agents gave you ${naira(600)}. Your keke now carries their colours.`);
    }, r.color),
    btn('STAY NEUTRAL', () => {
      s.speed = Math.min(s.speed, 10);
      done('You inch through slowly and keep your hands on the wheel. Nobody is offended.');
    }, '#33465a'),
    btn('FIND ANOTHER ROAD', () => {
      s.speed = Math.min(s.speed, 20);
      done('You take the long way round and lose a little time, no argument.');
    }, '#33465a'),
  );
  el.append(h, t, row);
  el.style.display = 'block';
  setTimeout(() => { if (panel?.style.display === 'block') close(); }, 14000);
}


// ---- The rally exists on the road: a crowd with flags that you drive up to, then the card appears. ----
let rallyStage = null;
function fitModel(model, height) {
  const box = new THREE.Box3().setFromObject(model);
  const h = box.max.y - box.min.y;
  if (!(h > 0.05)) return false;
  model.scale.multiplyScalar(height / h);
  model.position.y -= new THREE.Box3().setFromObject(model).min.y;
  return true;
}
async function buildCrowd(renderer, r) {
  const group = new THREE.Group();
  group.name = 'KANO_RALLY_CROWD';
  const models = renderer?.models;
  const keys = ['passengerMan', 'pedestrianWoman', 'passengerMan', 'pedestrian', 'passengerMan', 'pedestrianWoman', 'passengerMan', 'pedestrian'];
  const spots = [[2.0, -1], [3.1, -2.2], [4.2, -1.2], [2.6, -3.8], [3.7, -4.4], [1.6, -5.5], [4.4, -6.2], [3.0, -7.2]];
  const flagMat = new THREE.MeshLambertMaterial({ color: new THREE.Color(r.color), side: THREE.DoubleSide });
  const poleMat = new THREE.MeshLambertMaterial({ color: 0xdddddd });
  const bobbers = [];
  if (models?.load) {
    await Promise.all(keys.map(async (key, i) => {
      try {
        await models.load(key);
        const m = models.getInstance(key);
        if (!m || !fitModel(m, 1.65 + (i % 3) * 0.06)) return;
        const holder = new THREE.Group();
        holder.add(m);
        holder.position.set(spots[i][0], 0, spots[i][1]);
        holder.rotation.y = Math.PI * (0.85 + 0.3 * ((i * 37) % 10) / 10);
        group.add(holder);
        bobbers.push({ holder, phase: i * 1.3 });
        if (i % 2 === 0) { // a flag in the crowd
          const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 2.3, 5), poleMat);
          pole.position.set(spots[i][0] + 0.35, 1.15, spots[i][1]);
          const cloth = new THREE.Mesh(new THREE.PlaneGeometry(0.8, 0.5), flagMat);
          cloth.position.set(spots[i][0] + 0.75, 2.0, spots[i][1]);
          group.add(pole, cloth);
        }
      } catch (_) { /* optional model */ }
    }));
  }
  group.userData.bobbers = bobbers;
  return group;
}
function stageRally(g) {
  if (rallyStage || g.state !== 'PLAY') return;
  const r = RALLIES[Math.random() < 0.5 ? 0 : 1];
  const renderer = window.kanoRenderer;
  rallyStage = { r, atKm: g.s.distance + 0.11, group: null, shown: false };
  const mine = rallyStage;
  buildCrowd(renderer, r).then((group) => {
    if (rallyStage !== mine) return;
    mine.group = group;
    renderer?.world?.add(group);
  }).catch(() => {});
  g.ui?.toast?.(`${r.head} ahead: ${r.side === 'NNPP' ? 'red caps and drums' : 'green flags and a loudspeaker'} on the road. Slow down.`);
}
function rallyFrame() {
  try {
    const g = window.kanoGame;
    const st = rallyStage;
    if (st && g?.s) {
      const ahead = st.atKm - g.s.distance;
      if (st.group) {
        st.group.position.z = 2 - ahead * UNITS_PER_KM;
        const t = performance.now() / 1000;
        (st.group.userData.bobbers || []).forEach((b) => { b.holder.position.y = Math.abs(Math.sin(t * 3 + b.phase)) * 0.08; });
      }
      if (!st.shown && ahead < 0.035 && g.state === 'PLAY' && !g.s.event) { st.shown = true; openRally(g, st.r); }
      if (g.state !== 'PLAY' || ahead < -0.07 || ahead > 0.4) {
        if (st.group) { st.group.parent?.remove(st.group); }
        rallyStage = null;
      }
    }
  } catch (_) { /* optional */ }
  requestAnimationFrame(rallyFrame);
}
if (typeof window !== 'undefined') requestAnimationFrame(rallyFrame);

function chatter(g) {
  const stance = get();
  const party = Math.random() < 0.5 ? 'NNPP' : 'APC';
  if (!stance) g.ui?.toast?.(`A passenger says: "${party === 'NNPP' ? 'Red cap forever' : 'The new alliance is the way'}" and asks whose side you are on. You smile and say nothing.`);
  else if (party === stance) g.ui?.toast?.(`A passenger sees your ${stance} colours and agrees with you all the way.`);
  else g.ui?.toast?.(`A ${party} passenger sees your ${stance} colours and starts a long argument. Eyes on the road!`);
}

function patch(g) {
  if (g.__kanoPolitics) return;
  g.__kanoPolitics = true;
  window.kanoPolitics = { rally: () => stageRally(g), chatter: () => chatter(g), news: () => g.ui?.toast?.(NEWS[0]) };
  const origDrop = g.drop.bind(g);
  g.drop = function (...a) {
    const before = this.s.score;
    const r = origDrop(...a);
    try {
      const stance = get();
      const gain = this.s.score - before;
      if (stance && gain > 100) {
        const party = Math.random() < 0.45 ? stance : Math.random() < 0.7 ? (stance === 'NNPP' ? 'APC' : 'NNPP') : '';
        if (party === stance) { const bonus = Math.round(gain * 0.08); this.s.score += bonus; this.ui?.toast?.(`Same side · +${naira(bonus)} tip`); }
        else if (party) { const cut = Math.round(gain * 0.06); this.s.score = Math.max(0, this.s.score - cut); this.ui?.toast?.(`Other party's supporter argued the fare down · -${naira(cut)}`); }
      }
    } catch (_) { /* optional */ }
    return r;
  };
  let nextAt = 90;
  let last = performance.now();
  let acc = 0;
  let newsIdx = Math.floor(Math.random() * NEWS.length);
  setInterval(() => {
    const now = performance.now();
    const dt = (now - last) / 1000; last = now;
    const s = g.s;
    if (!s || g.state !== 'PLAY' || document.hidden || s.event) return;
    acc += dt;
    if (acc < nextAt || s.speed < 15 || (panel && panel.style.display === 'block')) return;
    acc = 0; nextAt = 150 + Math.random() * 120;
    const roll = Math.random();
    if (roll < 0.4) { g.ui?.toast?.(NEWS[newsIdx % NEWS.length]); newsIdx += 1; }
    else if (roll < 0.75) stageRally(g);
    else chatter(g);
  }, 1000);
}

if (typeof window !== 'undefined' && !window.__kanoPolitics) {
  window.__kanoPolitics = true;
  const wait = setInterval(() => {
    const g = window.kanoGame;
    if (g && typeof g.drop === 'function') { clearInterval(wait); patch(g); }
  }, 300);
}
