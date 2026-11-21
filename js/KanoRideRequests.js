/**
 * Live ride requests. A real keke ride is a conversation: the passenger in the back asks for things while you drive.
 * Every request is a small choice (hurry, stop for a minute, take a shortcut, window) that changes tip, goodwill and fatigue.
 * Never interrupts a haggle, a payment step, an event or a menu; auto-resolves if ignored.
 */
const naira = (n) => `₦${Math.round(n).toLocaleString()}`;
const pick = (a) => a[Math.floor(Math.random() * a.length)];

const REQUESTS = [
  {
    line: (p) => `${p} says: "Oga, abeg drive small fast, I dey late for work!"`,
    options: [
      ['Drive faster', 'Risky but they tip well. More tiring.', (g, s) => { s.fatigue = Math.min(100, (Number(s.fatigue) || 0) + 4); if (Math.random() < 0.65) { const t = pick([50, 80, 100]); s.fares += t; s.score += t; g.ui?.toast?.(`"Nagode, oga!" Tip ${naira(t)}.`); } else g.ui?.toast?.('You rush. Passenger holds on and says nothing.'); }],
      ['Drive normal', 'Safe and steady.', (g, s) => { if (Math.random() < 0.3) { s.kanoGoodwill = (s.kanoGoodwill || 0) - 1; g.ui?.toast?.('Passenger hisses. They wanted speed.'); } else g.ui?.toast?.('"Okay, oga. No wahala."'); }],
    ],
  },
  {
    line: (p) => `${p} says: "Please stop small, I wan buy recharge card."`,
    options: [
      ['Wait one minute', 'Costs a little time. Good for goodwill.', (g, s) => { s.kanoGoodwill = (s.kanoGoodwill || 0) + 1; s.fatigue = Math.min(100, (Number(s.fatigue) || 0) + 1); if (Math.random() < 0.5) { s.fares += 50; s.score += 50; g.ui?.toast?.(`They return smiling and give you ${naira(50)} for waiting.`); } else g.ui?.toast?.('They buy it quickly. "God bless you, oga."'); }],
      ['No stopping, oga', 'Keep the clock moving.', (g, s) => { s.kanoGoodwill = (s.kanoGoodwill || 0) - 1; g.ui?.toast?.('Passenger frowns. "Na so?"'); }],
    ],
  },
  {
    line: (p) => `${p} says: "There is go-slow ahead. I know one short cut, you wan try am?"`,
    options: [
      ['Take the shortcut', 'Could save time, could be a bad road.', (g, s) => { if (Math.random() < 0.55) { s.fares += 70; s.score += 70; g.ui?.toast?.(`Shortcut works. Passenger adds ${naira(70)}.`); } else { s.fatigue = Math.min(100, (Number(s.fatigue) || 0) + 6); g.ui?.toast?.('Rough road and potholes. Tiring, and the passenger says sorry.'); } }],
      ['Stay on the main road', 'Predictable.', (g) => g.ui?.toast?.('You stay on the main road.')],
    ],
  },
  {
    line: (p) => `${p} says: "Oga, the sun dey hot. Abeg make we drive with the side open small."`,
    options: [
      ['Open the side cover', 'Cooler for them, dustier for you.', (g, s) => { s.kanoGoodwill = (s.kanoGoodwill || 0) + 1; s.fatigue = Math.min(100, (Number(s.fatigue) || 0) + 2); g.ui?.toast?.('Passenger thanks you for the breeze.'); }],
      ['Keep it closed', 'Less dust, no extra effort.', (g) => g.ui?.toast?.('Passenger fans themselves with a handkerchief.')],
    ],
  },
  {
    line: (p) => `${p} asks: "Oga, you fit take my small bag to the next junction for me after this? I go pay."`,
    options: [
      ['Okay, I will', 'Small extra pay, small extra work.', (g, s) => { s.fares += 60; s.score += 60; s.fatigue = Math.min(100, (Number(s.fatigue) || 0) + 2); g.ui?.toast?.(`Bag delivered to the junction. ${naira(60)} added.`); }],
      ['Not my job', 'Polite refusal.', (g) => g.ui?.toast?.('"No problem, oga."')],
    ],
  },
];

let clock = 0;
let cooldown = 45;
let settled = true;

function panel() {
  let el = document.getElementById('kano-ride-panel');
  if (el) return el;
  el = document.createElement('div');
  el.id = 'kano-ride-panel';
  el.setAttribute('role', 'dialog');
  el.setAttribute('aria-label', 'Passenger request');
  el.style.cssText = 'position:fixed;left:50%;transform:translateX(-50%);bottom:max(118px,calc(env(safe-area-inset-bottom) + 110px));width:min(84vw,300px);z-index:55;background:#14202bee;color:#fff;border:2px solid #7fd6c2;border-radius:14px;padding:10px 12px;font:800 13px Arial,sans-serif;box-shadow:0 10px 30px #0008;display:none';
  document.body.append(el);
  return el;
}
function close() { const el = document.getElementById('kano-ride-panel'); if (el) { el.style.display = 'none'; el.replaceChildren(); } settled = true; }

function show(game) {
  const s = game.s;
  const req = pick(REQUESTS);
  const who = (s.passengers[0]?.name || 'Passenger').split(' · ')[0];
  const el = panel();
  el.replaceChildren();
  settled = false;
  const done = (fn) => { if (settled) return; settled = true; try { fn(game, s); } catch { /* never break the ride */ } close(); };
  const t = document.createElement('div');
  t.textContent = req.line(who);
  t.style.cssText = 'line-height:1.35';
  el.append(t);
  req.options.forEach(([label, sub, fn], i) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.style.cssText = `display:block;width:100%;margin-top:6px;min-height:42px;border-radius:9px;border:1px solid #7fd6c2;text-align:left;padding:6px 10px;touch-action:manipulation;font:900 12px Arial,sans-serif;${i === 0 ? 'background:#7fd6c2;color:#10201c' : 'background:#1f3345;color:#fff'}`;
    b.innerHTML = `${label}<br><span style="font-weight:700;opacity:.8;font-size:11px">${sub}</span>`;
    b.addEventListener('click', () => done(fn));
    el.append(b);
  });
  el.style.display = 'block';
  setTimeout(() => done((g) => g.ui?.toast?.('You nod and keep driving.')), 11000);
}

function busy() {
  for (const id of ['kano-haggle-panel', 'kano-change-panel', 'kano-ride-panel']) {
    const e = document.getElementById(id);
    if (e && e.style.display !== 'none' && e.childElementCount) return true;
  }
  return false;
}

if (typeof window !== 'undefined' && !window.__kanoRideRequests) {
  window.__kanoRideRequests = true;
  window.__kanoRideRequestNow = () => { if (window.kanoGame?.s) show(window.kanoGame); };
  setInterval(() => {
    try {
      const g = window.kanoGame;
      const s = g?.s;
      if (!s || g.state !== 'PLAY' || !s.passengers?.length || (Number(s.speed) || 0) < 8) { clock = 0; return; }
      if (!settled || busy() || s.event) return;
      clock += 1;
      if (clock >= cooldown) {
        clock = 0;
        cooldown = 55 + Math.floor(Math.random() * 55);
        show(g);
      }
    } catch { /* ignore */ }
  }, 1000);
}
