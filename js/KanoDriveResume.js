/**
 * Continue your last drive. While you drive, the run's key numbers are saved every few seconds and
 * whenever the page is hidden or closed (phone lock, tab switch, app swipe). On the start screen a
 * "CONTINUE LAST DRIVE" button restores cash/score, distance, fuel, tyres, engine and lives (the day clock, hunger and
 * tiredness already persist on their own). Riders on board are not restored (they are let off), and a snapshot older than 12 h is ignored.
 */
const KEY = 'kano-life-drive-resume-v1';
const MAX_AGE_MS = 12 * 60 * 60 * 1000;
const FIELDS = ['score', 'fares', 'distance', 'fuel', 'condition', 'engine', 'tyres', 'engineTemp', 'drops', 'boards',
  'matchedDrops', 'checkpoints', 'refills', 'combo', 'streak', 'safeTripStreak', 'passengerTrust', 'morale', 'heat',
  'lives', 'continues', 'potholeHits', 'collisions', 'nearMisses', 'elapsed', 'time', 'kanoWorldDistanceKm'];

function game() { return window.kanoGame || window.__KANO_ACTIVE_GAME__; }

function save() {
  try {
    const g = game();
    if (!g || g.state !== 'PLAY' || !g.s || !(g.s.elapsed > 8)) return;
    const snap = { at: Date.now(), mode: g.mode, s: {} };
    for (const key of FIELDS) { const v = g.s[key]; if (Number.isFinite(v)) snap.s[key] = v; }
    localStorage.setItem(KEY, JSON.stringify(snap));
  } catch (_) { /* optional */ }
}

function load() {
  try {
    const snap = JSON.parse(localStorage.getItem(KEY) || 'null');
    if (!snap || !snap.s || Date.now() - snap.at > MAX_AGE_MS) return null;
    return snap;
  } catch (_) { return null; }
}

function clear() { try { localStorage.removeItem(KEY); } catch (_) { /* optional */ } }

function restore(snap) {
  const g = game();
  if (!g) return;
  g.start(snap.mode || 'career');
  Object.assign(g.s, snap.s);
  g.s.passengers = [];
  g.s.speed = 0;
  try { g.ui?.toast?.('Welcome back. Your last drive continues from where you stopped.'); } catch (_) { /* optional */ }
}

function ensureButton() {
  const screen = document.getElementById('start-screen');
  const startBtn = document.getElementById('start-btn');
  let btn = document.getElementById('kano-continue-drive-btn');
  const snap = load();
  if (!screen || !startBtn || !snap) { if (btn) btn.remove(); return; }
  if (btn) return;
  btn = document.createElement('button');
  btn.id = 'kano-continue-drive-btn';
  btn.type = 'button';
  btn.className = startBtn.className;
  const km = (snap.s.distance || 0).toFixed(1);
  btn.textContent = `CONTINUE LAST DRIVE · ${km} km · ₦${Math.round(snap.s.score || 0).toLocaleString()}`;
  btn.addEventListener('click', () => { const s = load(); if (s) restore(s); });
  startBtn.insertAdjacentElement('afterend', btn);
}

if (typeof window !== 'undefined' && !window.__kanoDriveResume) {
  window.__kanoDriveResume = true;
  setInterval(save, 5000);
  window.addEventListener('pagehide', save);
  document.addEventListener('visibilitychange', () => { if (document.hidden) save(); });
  setInterval(() => { try { ensureButton(); } catch (_) { /* optional */ } }, 1500);
  // A finished run (game over) ends the saved drive.
  setInterval(() => { const g = game(); if (g && g.state === 'OVER') clear(); }, 2000);
}
