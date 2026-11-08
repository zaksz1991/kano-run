/**
 * Kano street politics.
 * Ambient radio news, street talk and rallies about the NNPP (Kwankwasiyya red cap) and APC contest for Kano.
 * Public facts only (as reported, Jan 2026): Governor Abba Kabir Yusuf, elected on the NNPP ticket in 2023,
 * joined the APC, where former governor Ganduje is a leader; Kwankwaso's NNPP is contesting 2027.
 * Nobody is quoted. The driver can wear a cap, take a flag or stay neutral; passengers react.
 */
const KEY = 'kano-politics-stance';
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

function rally(g) {
  const s = g.s;
  const r = RALLIES[Math.random() < 0.5 ? 0 : 1];
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
    else if (roll < 0.75) rally(g);
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
