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
    let acc = 0; let last = performance.now();
    setInterval(() => {
      const now = performance.now(); acc += (now - last) / 1000; last = now;
      const s = g.s;
      if (!s || g.state !== 'PLAY' || document.hidden || s.event || acc < 210 + Math.random() * 60) return;
      acc = 0;
      ride(g);
    }, 4000);
  }, 400);
}
