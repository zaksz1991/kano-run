/**
 * After the shift: park the keke and live the evening like a Kano keke driver.
 * Dinner (iftar in Ramadan), Maghrib and Isha prayers, home to the family, a visit to the girlfriend,
 * colleagues at the keke park, the football viewing centre with its arguments, the shayi stand and junction
 * gossip, then sleep. What you do changes hunger, tiredness, mood, family and friends, and tomorrow's tips.
 * Debates about preachers are kept friendly: nobody is mocked and the driver stays diplomatic.
 */
const KEY = 'kano-evening-life-v1';
const naira = (n) => `₦${Math.round(n).toLocaleString('en-NG')}`;
const pick = (a) => a[Math.floor(Math.random() * a.length)];
const clamp = (v, a = 0, b = 100) => Math.max(a, Math.min(b, v));
const hhmm = (m) => { m = ((Math.round(m) % 1440) + 1440) % 1440; return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`; };

const life = (() => {
  let v = { family: 60, friends: 50, mood: 55 };
  try { v = { ...v, ...JSON.parse(localStorage.getItem(KEY) || '{}') }; } catch (_) { /* optional */ }
  return v;
})();
const saveLife = () => { try { localStorage.setItem(KEY, JSON.stringify(life)); } catch (_) { /* optional */ } };
window.kanoLife = life;

const done = { day: 0, dinner: false, maghrib: false, isha: false, family: false };
const TIPS = [
  'A colleague says the CNG queue at Jaen is already long in the morning. Go early or go late.',
  'Someone says police are checking permits on Zaria Road tomorrow. Carry your papers.',
  'A colleague says Kofar Mata and Sabon Gari are busiest at sunrise; the school run pays well.',
  'A rider says rain is forecast. Puddles on Ring Road are bad, so watch your tyres.',
  'A colleague says the big market days are Tuesdays; plan long loads for then.',
];
const FOOTBALL = [
  'Arsenal fans and Manchester United fans are shouting over each other. A boy keeps changing his mind about the referee.',
  'Real Madrid against Barca: the room is split, every pass has a commentator, nobody agrees on the offside.',
  'The whole viewing centre rises when the goal goes in, and falls silent when VAR checks it.',
];
const GOSSIP = [
  'A man in a spotless white babban riga and a gold watch walks by. The group starts guessing where he tailored it and how much it cost.',
  'Two girls pass in matching lace. "That is Dubai lace, not market lace," somebody says, and the whole junction has an opinion.',
  'A young man on a new motorbike with loud music rides past. "Where did the money come from?" Everyone has a theory, nobody has the facts.',
  'You watch the junction: hawkers, achaba, a goat in a wheelbarrow and a bride in a car. This is the best seat in the city.',
];
const MALAM = [
  'Two friends at the shayi stand argue over whose mosque has the better sermon: one prefers the straight-talking style, the other the one he grew up with. You nod, sip your tea, and say they should both come to your wedding-day prayers.',
  'Somebody brings up preaching styles again. It gets loud, then someone orders more tea and the topic moves to football. You stay neutral and everybody still calls you a good man.',
];

let overlay = null;
let chip = null;
let busy = false;

function season(g) { return window.kanoSeason?.describe?.(g.dayCycle?.state?.day || 1) || {}; }
function minute(g) { return g.dayCycle?.state?.minuteOfDay ?? 1100; }

function ensureCss() {
  if (document.getElementById('kano-evening-css')) return;
  const st = document.createElement('style');
  st.id = 'kano-evening-css';
  st.textContent = `#kano-evening{position:fixed;inset:0;z-index:70;background:linear-gradient(#0b1230,#1d2347 55%,#2b2a3a);color:#fff4d8;font:600 14px/1.45 system-ui,sans-serif;display:flex;flex-direction:column;overflow:auto;padding:14px}
#kano-evening .scene{font-size:46px;text-align:center;letter-spacing:6px;animation:kev 3s ease-in-out infinite;padding:6px 0}
@keyframes kev{50%{transform:translateY(-6px)}}
#kano-evening h2{margin:2px 0 4px;font:800 18px system-ui;text-align:center;color:#ffd166}
#kano-evening .meta{text-align:center;font-size:12px;color:#aab6e8;margin-bottom:8px}
#kano-evening .stats{display:flex;gap:6px;justify-content:center;flex-wrap:wrap;margin-bottom:8px;font-size:11px}
#kano-evening .stats span{background:rgba(255,255,255,.1);padding:3px 8px;border-radius:10px}
#kano-evening .grid{display:grid;grid-template-columns:1fr 1fr;gap:8px}
#kano-evening button{min-height:54px;border-radius:12px;border:1px solid rgba(255,255,255,.3);background:rgba(255,255,255,.09);color:#fff4d8;font:700 13px system-ui;text-align:left;padding:8px 10px;touch-action:manipulation}
#kano-evening button small{display:block;font-weight:500;opacity:.8;font-size:11px}
#kano-evening button.primary{background:#ffd166;color:#1a1530;border-color:#ffd166}
#kano-evening button:disabled{opacity:.4}
#kano-evening .story{background:rgba(255,255,255,.08);border-radius:12px;padding:12px;margin:8px 0}`;
  document.head.append(st);
}

function activities(g) {
  const s = g.s; const m = minute(g); const se = season(g);
  const night = m >= 1110 || m < 300;
  const fasting = se.fasting;
  const afterMaghrib = m >= 1130 || m < 300;
  const afterIsha = m >= 1210 || m < 300;
  const list = [];
  list.push({
    id: 'dinner', scene: fasting ? '🌙🥛🌴' : '🍲🔥', label: fasting ? 'Break fast (iftar)' : 'Eat dinner',
    note: fasting ? 'dates, fura da nono, then tuwo' : 'tuwo and miyan kuka, or suya', cost: fasting ? 1500 : 2000, min: 45, ok: !done.dinner,
    run() {
      g.dayCycle?.eat?.(80); done.dinner = true; life.mood = clamp(life.mood + 6);
      return fasting ? 'You break the fast with dates and cold fura da nono, then a plate of tuwo. Alhamdulillah. The whole park goes quiet while people eat.'
        : pick(['A plate of tuwo shinkafa with miyan kuka and a piece of meat. You sit under the lamp and eat slowly.', 'Suya with onions and yaji, wrapped in newspaper, and a cold zobo. Simple, and exactly right.']);
    },
  });
  list.push({
    id: 'maghrib', scene: '🕌🌇', label: 'Pray Maghrib', note: 'window 18:50 to 20:10', cost: 0, min: 15, ok: !done.maghrib && m >= 1130 && m < 1210,
    why: done.maghrib ? 'Done' : m < 1130 ? 'Not time yet' : 'Time has passed',
    run() { done.maghrib = true; life.mood = clamp(life.mood + 5); g.dayCycle && (g.dayCycle.state.fatigue = clamp(g.dayCycle.state.fatigue - 4)); return 'You make wudu at the mosque tap and stand in the saff with the other drivers. Quiet. The day settles.'; },
  });
  list.push({
    id: 'isha', scene: '🕌🌙⭐', label: "Pray Isha'i", note: 'after 20:10', cost: 0, min: 20, ok: !done.isha && afterIsha,
    why: done.isha ? 'Done' : 'Not time yet',
    run() { done.isha = true; life.mood = clamp(life.mood + 5); return fasting ? "Isha'i, then tarawih. The imam's recitation carries over the whole street." : "You pray Isha'i with your colleagues and walk out feeling lighter."; },
  });
  list.push({
    id: 'family', scene: '🏠👩‍👧‍👦', label: 'Home to wife & kids', note: 'foodstuff and something for the children', cost: se.ramadan === 'prep' ? 6000 : 3000, min: 120, ok: night,
    run() { life.family = clamp(life.family + 14); life.mood = clamp(life.mood + 8); done.family = true;
      return se.ramadan === 'prep' ? 'You bring rice, oil and dates for Ramadan. Your wife counts the bags and smiles. The children want to know if you saw any goats on the road.'
        : 'Your wife has kept food warm. The kids climb on you and tell you everything about school. Tired, but this is what the day was for.'; },
  });
  list.push({
    id: 'girlfriend', scene: '💐🌙', label: 'Visit your girlfriend', note: 'a gift and a night out', cost: 4000, min: 120, ok: night,
    run() {
      life.mood = clamp(life.mood + 10);
      if (Math.random() < 0.3 && life.family > 20) { life.family = clamp(life.family - 18); return 'A good evening, but a neighbour saw you, and by morning the news has reached home. Expect a cold breakfast.'; }
      life.family = clamp(life.family - 4); return 'You spend an easy evening together. She likes the gift. You promise to call tomorrow.';
    },
  });
  list.push({
    id: 'friends', scene: '🛺👥🛺', label: 'Keke colleagues', note: 'sit at the park and talk shop', cost: 0, min: 60, ok: true,
    run() { life.friends = clamp(life.friends + 10); life.mood = clamp(life.mood + 4); g.s.__eveningTip = pick(TIPS);
      if (Math.random() < 0.25) { const lend = Math.min(g.s.score, 2000); if (lend >= 500) { g.s.score -= lend; life.friends = clamp(life.friends + 8); return `A colleague is short for his rent and asks you to lend him ${naira(lend)}. You do. "God will pay you."`; } }
      return `Stories, laughs, and a bit of shop talk. ${g.s.__eveningTip}`; },
  });
  list.push({
    id: 'football', scene: '⚽📺🍿', label: 'Football viewing centre', note: 'entry ₦200 · the arguments are free', cost: 200, min: 105, ok: night,
    run() { life.friends = clamp(life.friends + 6); life.mood = clamp(life.mood + 8); return pick(FOOTBALL); },
  });
  list.push({
    id: 'shayi', scene: '☕🍞🗣️', label: 'Shayi stand', note: 'sweet tea, bread and arguments', cost: 300, min: 50, ok: true,
    run() { life.friends = clamp(life.friends + 5); life.mood = clamp(life.mood + 3); return pick(MALAM); },
  });
  list.push({
    id: 'junction', scene: '🚦🧍🧍‍♀️🛵', label: 'Sit at the junction', note: 'watch the world pass by', cost: 0, min: 45, ok: true,
    run() { life.friends = clamp(life.friends + 3); life.mood = clamp(life.mood + 5); return pick(GOSSIP); },
  });
  list.push({
    id: 'sleep', scene: '😴🌙', label: 'Go home and sleep', note: 'wake at fajr for a new day', cost: 0, min: 0, ok: true, primary: true,
    run: null,
  });
  return list;
}

function render(g, story) {
  const s = g.s; const m = minute(g); const se = season(g);
  overlay.replaceChildren();
  const scene = document.createElement('div'); scene.className = 'scene'; scene.textContent = story?.scene || '🌃🛺🌙';
  const h = document.createElement('h2'); h.textContent = story ? story.title : 'Keke parked. The shift is over.';
  const meta = document.createElement('div'); meta.className = 'meta';
  meta.textContent = `${hhmm(m)} · cash ${naira(s.score)} · hunger ${Math.round(g.dayCycle?.state?.hunger ?? 0)}% · tired ${Math.round(g.dayCycle?.state?.fatigue ?? 0)}%`
    + (se.fasting ? ' · Ramadan' : se.ramadan === 'prep' ? ' · Ramadan is near' : '') + (se.election === 'final' ? ' · election week' : se.election === 'campaign' ? ' · campaign season' : '');
  const stats = document.createElement('div'); stats.className = 'stats';
  for (const [k, v] of [['Mood', life.mood], ['Family', life.family], ['Friends', life.friends]]) { const sp = document.createElement('span'); sp.textContent = `${k} ${Math.round(v)}`; stats.append(sp); }
  overlay.append(scene, h, meta, stats);
  if (story) { const d = document.createElement('div'); d.className = 'story'; d.textContent = story.text; overlay.append(d); }
  const grid = document.createElement('div'); grid.className = 'grid';
  for (const a of activities(g)) {
    const b = document.createElement('button');
    b.className = a.primary ? 'primary' : '';
    const can = a.ok && s.score >= a.cost;
    b.disabled = !can;
    b.innerHTML = '';
    b.append(a.label);
    const sm = document.createElement('small');
    sm.textContent = a.ok ? `${a.note}${a.cost ? ` · ${naira(a.cost)}` : ''}${a.min ? ` · ${a.min} min` : ''}` : (a.why || 'Not now');
    if (a.ok && s.score < a.cost) sm.textContent = `Need ${naira(a.cost)}`;
    b.append(sm);
    b.addEventListener('click', () => choose(g, a));
    grid.append(b);
  }
  overlay.append(grid);
  const back = document.createElement('button');
  back.textContent = 'BACK TO DRIVING';
  back.style.marginTop = '10px';
  back.addEventListener('click', closeOverlay);
  overlay.append(back);
}

function choose(g, a) {
  const s = g.s;
  if (a.id === 'sleep') { sleep(g); return; }
  s.score -= a.cost;
  const text = a.run();
  if (a.min) g.dayCycle?.rest?.(a.min);
  saveLife();
  render(g, { title: a.label, scene: a.scene, text });
}

function sleep(g) {
  const s = g.s; const dc = g.dayCycle;
  const m = minute(g);
  const mins = Math.min(660, ((315 - m) % 1440 + 1440) % 1440 || 360);
  const hungry = !done.dinner;
  dc?.rest?.(mins);
  if (dc) {
    dc.state.fatigue = life.mood > 70 ? 0 : 5;
    if (hungry) dc.state.hunger = Math.max(dc.state.hunger, 55);
    dc.save?.();
  }
  life.mood = clamp(life.mood - 6 + (done.family ? 6 : 0)); // moods settle overnight
  if (life.family < 25) life.mood = clamp(life.mood - 8);
  saveLife();
  const lines = ['You wake before fajr to the call to prayer and the first achaba engines.'];
  if (hungry) lines.push('You went to bed hungry, and it shows.');
  if (life.family < 25) lines.push('The house is quiet and cold. You owe your family some time.');
  if (life.family > 75) lines.push('The house feels warm. It is a good start.');
  closeOverlay();
  g.ui?.toast?.(lines.join(' '));
  Object.assign(done, { day: (dc?.state?.day || 0), dinner: false, maghrib: false, isha: false, family: false });
}

function closeOverlay() {
  busy = false;
  if (overlay) { overlay.remove(); overlay = null; }
  const g = window.kanoGame; if (g?.s) g.s.eventCooldown = 6;
}

function openEvening(g) {
  if (busy || g.state !== 'PLAY') return;
  busy = true;
  g.s.speed = 0; g.s.gas = false; g.s.brake = true;
  ensureCss();
  overlay = document.createElement('div'); overlay.id = 'kano-evening';
  document.body.append(overlay);
  const dayNow = g.dayCycle?.state?.day || 0;
  if (done.day !== dayNow) Object.assign(done, { day: dayNow, dinner: false, maghrib: false, isha: false, family: false });
  render(g, null);
  const keep = setInterval(() => { if (!overlay) { clearInterval(keep); return; } g.s.speed = 0; g.s.gas = false; g.s.eventCooldown = 99; g.s.heat = Math.max(0, (g.s.heat || 0) - 0.1); }, 120);
}

function updateChip(g) {
  if (!chip || !chip.isConnected) {
    chip = document.createElement('button');
    chip.id = 'kano-end-shift';
    chip.type = 'button';
    chip.textContent = '🌙 PARK & END SHIFT';
    chip.style.cssText = 'position:fixed;right:8px;bottom:232px;z-index:41;padding:8px 12px;border-radius:12px;font:800 12px system-ui,sans-serif;color:#1a1530;background:#ffd166;border:1px solid #fff;display:none;touch-action:manipulation';
    chip.addEventListener('click', () => openEvening(g));
    document.body.append(chip);
  }
  const m = minute(g);
  const late = (m >= 1110 || m < 300) && g.state === 'PLAY' && !busy && !g.s.event && (g.s.passengers?.length || 0) === 0;
  chip.style.display = late ? 'block' : 'none';
}

if (typeof window !== 'undefined' && !window.__kanoEveningLife) {
  window.__kanoEveningLife = true;
  window.kanoEvening = { open: () => window.kanoGame && openEvening(window.kanoGame) };
  const wait = setInterval(() => {
    const g = window.kanoGame;
    if (!g) return;
    clearInterval(wait);
    setInterval(() => { try { updateChip(g); } catch (_) { /* optional */ } }, 700);
    // Mood nudges tomorrow's tips a little.
    const origDrop = g.drop.bind(g);
    g.drop = function (...a) {
      const before = this.s.score;
      const r = origDrop(...a);
      try { const gain = this.s.score - before; if (gain > 100) this.s.score += Math.round(gain * (life.mood - 55) / 600); } catch (_) { /* optional */ }
      return r;
    };
  }, 400);
}
