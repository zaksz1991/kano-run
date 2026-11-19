/**
 * Continue your last drive. While you drive, the run's key numbers are saved every few seconds and
 * whenever the page is hidden or closed (phone lock, tab switch, app swipe). On the start screen a
 * "CONTINUE LAST DRIVE" button restores cash/score, distance, fuel, tyres, engine and lives (the day clock, hunger and
 * tiredness already persist on their own). Riders on board are not restored (they are let off), and a snapshot older than 14 days is ignored. START DRIVING itself continues the saved drive; "START FRESH DRIVE" begins from zero.
 */
const KEY = 'kano-life-drive-resume-v1';
const MAX_AGE_MS = 14 * 24 * 60 * 60 * 1000;
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
  let fresh = document.getElementById('kano-fresh-drive-btn');
  if (!fresh) {
    fresh = document.createElement('button');
    fresh.id = 'kano-fresh-drive-btn';
    fresh.type = 'button';
    fresh.className = startBtn.className;
    fresh.textContent = 'START FRESH DRIVE';
    fresh.style.opacity = '0.8';
    fresh.addEventListener('click', () => { window.__kanoFreshDrive = true; clear(); startBtn.click(); });
    btn.insertAdjacentElement('afterend', fresh);
  }
}

// START DRIVING continues the saved drive: progress is never silently reset by pressing start or by an update.
function armAutoResume() {
  const startBtn = document.getElementById('start-btn');
  if (!startBtn || startBtn.dataset.kanoResumeArmed) return;
  startBtn.dataset.kanoResumeArmed = '1';
  startBtn.addEventListener('click', () => {
    const snap = window.__kanoFreshDrive ? null : load();
    window.__kanoFreshDrive = false;
    window.__kanoResumeNext = snap || null;
  }, true);
  const g = game();
  if (!g || g.__kanoResumeWrapped) return;
  g.__kanoResumeWrapped = true;
  const own = Object.prototype.hasOwnProperty.call(g, 'start');
  const ownFn = g.start;
  g.start = function kanoResumeStart(...args) {
    const base = own ? ownFn : Object.getPrototypeOf(g).start;
    const result = base.apply(this, args);
    const snap = window.__kanoResumeNext;
    if (snap && snap.s) {
      window.__kanoResumeNext = null;
      try {
        Object.assign(this.s, snap.s);
        this.s.passengers = [];
        this.s.speed = 0;
        this.ui?.toast?.('Welcome back. Your drive continues from where you stopped.');
      } catch (_) { /* optional */ }
    }
    return result;
  };
}

if (typeof window !== 'undefined' && !window.__kanoDriveResume) {
  window.__kanoDriveResume = true;
  setInterval(save, 5000);
  window.addEventListener('pagehide', save);
  document.addEventListener('visibilitychange', () => { if (document.hidden) save(); });
  setInterval(() => { try { ensureButton(); armAutoResume(); } catch (_) { /* optional */ } }, 1500);
  // A finished run (game over) ends the saved drive.
  setInterval(() => { const g = game(); if (g && g.state === 'OVER') clear(); }, 2000);
}
