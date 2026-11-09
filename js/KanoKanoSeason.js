/**
 * Kano seasons: the general election and Ramadan, tied to the real calendar (sped up as the game days pass).
 * INEC scheduled the 2027 presidential poll for 16 January 2027 (Feb 2026 timetable); Ramadan 2027 starts about 8 Feb.
 * Both dates can move, so this is only the world's background mood, not a prediction.
 *  - Election: workers who came to Kano to hustle start leaving for home (more people paying to reach motor parks),
 *    tension on the roads, more checkpoints, shops closing early, CNG queues longer.
 *  - Ramadan: stocking up for the fast (foodstuff, dates, fura), iftar rush before maghrib, tarawih at night.
 */
const DAY_MS = 86400000;
const ELECTION = Date.UTC(2027, 0, 16);
const RAMADAN = Date.UTC(2027, 1, 8);
const RAMADAN_DAYS = 30;
const SPEED = 3; // one game day moves the calendar three days

export function describe(gameDay = 1, nowMs = Date.now()) {
  const eff = nowMs + (Math.max(1, gameDay) - 1) * SPEED * DAY_MS;
  const dE = Math.round((ELECTION - eff) / DAY_MS);
  const dR = Math.round((RAMADAN - eff) / DAY_MS);
  let election = 'none';
  if (dE > 0 && dE <= 14) election = 'final';
  else if (dE > 0 && dE <= 60) election = 'campaign';
  else if (dE <= 0 && dE > -5) election = 'polling';
  else if (dE <= -5 && dE > -30) election = 'aftermath';
  let ramadan = 'none';
  if (dR > 0 && dR <= 40) ramadan = 'prep';
  else if (dR <= 0 && dR > -RAMADAN_DAYS) ramadan = 'fasting';
  else if (dR <= -RAMADAN_DAYS && dR > -RAMADAN_DAYS - 4) ramadan = 'eid';
  const fleeFare = { none: 1, campaign: 1.04, final: 1.14, polling: 1.22, aftermath: 1.04 }[election];
  const cngBoost = (ramadan === 'prep' ? 0.12 : ramadan === 'fasting' ? 0.18 : 0) + (election === 'final' || election === 'polling' ? 0.2 : election === 'campaign' ? 0.08 : 0);
  return { election, ramadan, dE, dR, fleeFare, cngBoost, fasting: ramadan === 'fasting' };
}

const LINES = {
  campaign: [
    'Motor park: more people are queuing for buses home. "Let me go back before the politics heats up."',
    'Radio Kano: campaign vehicles and party caps are everywhere. Keke riders say traffic is thicker near rally grounds.',
    'Street talk: traders from the south are sending their families home early, just in case.',
  ],
  final: [
    'Election week is close. Passengers with bags and mattresses ask for Sabon Gari and the motor parks, and pay more to get there quickly.',
    'Shops on the main road are closing early. Nobody wants to be caught outside when tension rises.',
    'Radio: security agencies say they will be on the roads. Expect more checkpoints.',
  ],
  polling: [
    'Polling days: movement is restricted in places and the roads are quiet. Only essential trips, and police stop everyone.',
    'Radio: results are being collated. People wait, listen and pray for peace.',
  ],
  aftermath: [
    'After the vote: some who left are still away, and the market is slowly filling up again.',
  ],
  prep: [
    'Ramadan is coming. Passengers crowd Kantin Kwari and Sabon Gari market for dates, rice, oil, sugar and onions.',
    'Everybody is stocking up: the price of foodstuff climbs a little each week and rides to the market pay well.',
    'Passenger: "Take me to the market, my wife wants everything before Ramadan, I carry big load."',
  ],
  fasting: [
    'Ramadan: the day runs quiet and slow, then everyone rushes home before maghrib for iftar.',
    'Fura da nono, dates and kunun at every corner at sunset. After isha comes tarawih.',
  ],
  eid: ['Sallah is here. New clothes, family visits and long rides to the Eid prayer ground.'],
};


// ---- Election travellers: people who came to Kano to hustle, leaving before the vote. ----
let travellerPanel = null;
function travellerOffer(game) {
  const day = game.dayCycle?.state?.day || 1;
  const d = describe(day);
  if (d.election !== 'campaign' && d.election !== 'final' && d.election !== 'polling') return;
  if (travellerPanel && travellerPanel.isConnected) return;
  const s = game.s;
  const urgent = d.election !== 'campaign';
  const pay = Math.round((1500 + Math.random() * 1500 + (urgent ? 1200 : 0)) / 50) * 50;
  const from = ['Onitsha', 'Aba', 'Owerri', 'Enugu', 'Lagos', 'Ibadan'][Math.floor(Math.random() * 6)];
  const el = document.createElement('div');
  travellerPanel = el;
  el.style.cssText = 'position:fixed;left:50%;transform:translateX(-50%);bottom:68px;width:min(94vw,380px);z-index:61;background:rgba(12,16,24,.96);color:#fff;border:2px solid #f2c14e;border-radius:14px;padding:10px 12px;font:700 13px/1.35 Arial,sans-serif;box-shadow:0 6px 24px rgba(0,0,0,.55)';
  const h = document.createElement('div'); h.style.cssText = 'font-size:11px;color:#f2c14e;letter-spacing:.08em'; h.textContent = 'TRAVELLER WITH BAGS';
  const t = document.createElement('div'); t.style.marginTop = '4px';
  t.textContent = `A man with two big bags waves you down: "I came to Kano to hustle. I'm going back to ${from} before the election. Take me to the motor park, I'll pay ${naira(pay)}."`;
  const row = document.createElement('div'); row.style.cssText = 'display:flex;gap:6px;margin-top:8px';
  const mk = (label, fn, bg) => { const b = document.createElement('button'); b.type = 'button'; b.textContent = label; b.style.cssText = `flex:1;min-height:38px;border-radius:9px;border:1px solid rgba(255,255,255,.5);font:900 12px Arial,sans-serif;color:#fff;background:${bg}`; b.addEventListener('click', () => { fn(); el.remove(); }); return b; };
  row.append(
    mk(`TAKE HIM +${naira(pay)}`, () => {
      s.score += pay; s.speed = Math.min(s.speed, 12);
      if (game.dayCycle?.state) game.dayCycle.state.fatigue = Math.min(100, game.dayCycle.state.fatigue + 2);
      game.ui?.toast?.(`You drop him at the motor park. "God bless you. Kano is a good place, I just won't stay for the noise." ${naira(pay)} earned.`);
    }, '#c28a14'),
    mk('NOT NOW', () => game.ui?.toast?.('He finds another keke. There are many leaving today.'), '#33465a'),
  );
  el.append(h, t, row);
  document.body.append(el);
  setTimeout(() => el.remove(), 12000);
}
const naira = (n) => `₦${Math.round(n).toLocaleString('en-NG')}`;

const priceNote = new Map();
function ride(game) {
  const s = game.s;
  if (!s) return;
  const day = game.dayCycle?.state?.day || 1;
  const d = describe(day);
  const pool = [...(LINES[d.election] || []), ...(LINES[d.ramadan] || [])];
  if (pool.length) game.ui?.toast?.(pool[Math.floor(Math.random() * pool.length)]);
}

if (typeof window !== 'undefined' && !window.kanoSeason) {
  window.kanoSeason = { describe };
  const wait = setInterval(() => {
    const g = window.kanoGame;
    if (!g || typeof g.drop !== 'function') return;
    clearInterval(wait);
    const origDrop = g.drop.bind(g);
    g.drop = function (...a) {
      const before = this.s.score;
      const r = origDrop(...a);
      try {
        const d = describe(this.dayCycle?.state?.day || 1);
        const minute = this.dayCycle?.state?.minuteOfDay ?? 600;
        let f = d.fleeFare;
        if (d.ramadan === 'prep') f *= 1.04;
        if (d.fasting && minute >= 990 && minute <= 1130) f *= 1.1; // iftar rush
        if (d.fasting && minute >= 780 && minute < 990) f *= 0.94;  // quiet fasting afternoon
        const gain = this.s.score - before;
        if (gain > 100 && Math.abs(f - 1) > 0.015) this.s.score += Math.round(gain * (f - 1));
      } catch (_) { /* optional */ }
      return r;
    };
    window.kanoSeason.travellerOffer = () => travellerOffer(g);
    // Ramadan: at maghrib the road empties for a while as everyone stops to break the fast.
    let iftarUntil = 0; let lastMinute = -1; let sahurDay = -1; let iftarDay = -1;
    const origSpawn = g.spawnTraffic?.bind(g);
    if (origSpawn) {
      g.spawnTraffic = function (...a) {
        if (performance.now() < iftarUntil) return undefined;
        return origSpawn(...a);
      };
    }
    setInterval(() => {
      try {
        const st = g.dayCycle?.state;
        if (!st || g.state !== 'PLAY') return;
        const d = describe(st.day);
        const m = st.minuteOfDay;
        if (d.fasting && m >= 1130 && m < 1180 && iftarDay !== st.day) {
          iftarDay = st.day; iftarUntil = performance.now() + 45000;
          g.s.traffic && g.s.traffic.splice(0, Math.floor(g.s.traffic.length * 0.7));
          g.ui?.toast?.('Maghrib. The call to prayer rises from every mosque and the road goes quiet. Everyone stops to break the fast.');
        }
        if (d.fasting && m >= 300 && m < 360 && sahurDay !== st.day) {
          sahurDay = st.day;
          g.ui?.toast?.('Fajr in Ramadan: some riders finished sahur only minutes ago. The fast begins.');
        }
        lastMinute = m;
      } catch (_) { /* optional */ }
    }, 2000);
    let acc = 0; let last = performance.now();
    let accT = 0;
    setInterval(() => {
      const now = performance.now(); const dtS = (now - last) / 1000; acc += dtS; accT += dtS; last = now;
      const s = g.s;
      if (s && g.state === 'PLAY' && !document.hidden && !s.event && accT > 240 && s.speed > 10) { accT = 0; travellerOffer(g); return; }
      if (!s || g.state !== 'PLAY' || document.hidden || s.event || acc < 210 + Math.random() * 60) return;
      acc = 0;
      ride(g);
    }, 4000);
  }, 400);
}
