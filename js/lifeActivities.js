/**
 * Kano Life — Northern / Hausa street activities
 * Event-driven moments during a drive (not a full multiplayer sim).
 */
import { STATE } from './config.js';
import { Audio } from './audio.js';

const ACTIVITIES = [
  {
    id: 'jumaa',
    weight: 1.2,
    minDist: 0.8,
    title: '🕌 Juma\'a Traffic',
    text: 'Friday prayers ending near the mosque. Road is packed with worshippers.',
    choices: [
      { label: 'Wait patiently', effect: (g) => { g.speed *= 0.4; g.score += 40; g.ui.showMissionToast('Respect — +₦40'); } },
      { label: 'Find side lane', effect: (g) => { g.addCombo?.(1); g.score += 80; g.ui.showMissionToast('Side lane clear'); } },
    ],
  },
  {
    id: 'market',
    weight: 1.4,
    minDist: 0.5,
    title: '🛒 Market Day',
    text: 'Sabon Gari / Kurmi crowd spills into the road. Women with baskets, traders, okadas.',
    choices: [
      { label: 'Pick market passengers (+fare)', effect: (g) => {
        const n = Math.min(2, (g.capacity || 3) - (g.paxOnBoard || 0));
        if (n > 0) { g.paxOnBoard = (g.paxOnBoard || 0) + n; g.totalPax = (g.totalPax || 0) + n; g.score += 200 * n; }
        g.ui.showMissionToast(n ? `Market load +${n}` : 'Keke full');
      }},
      { label: 'Horn through carefully', effect: (g) => { g.score += 50; g.ui.showMissionToast('Horn — path opens'); Audio.horn?.(); } },
    ],
  },
  {
    id: 'karota_life',
    weight: 1.0,
    minDist: 1.2,
    title: '⚠️ KAROTA Stop',
    text: 'KAROTA officer: "Paper? Or settle small?" Northern checkpoint hustle.',
    choices: [
      { label: 'Settle ₦250', effect: (g) => { g.score = Math.max(0, g.score - 250); g.inv = 50; g.ui.showMissionToast('Settled'); } },
      { label: 'Talk (Hausa respect)', effect: (g) => {
        if (Math.random() < 0.5) { g.score += 100; g.ui.showMissionToast('Sannu — waved on'); }
        else { g.score = Math.max(0, g.score - 300); g.ui.showMissionToast('Still paid ₦300'); }
        g.inv = 40;
      }},
      { label: 'Risk accelerate', effect: (g) => {
        if (Math.random() < 0.35) { g.addCombo?.(3); g.ui.showMissionToast('Escaped!'); }
        else { g.score = Math.max(0, g.score - 500); g.triggerShake?.(14, 7); g.ui.showMissionToast('Caught — heavy fine'); }
      }},
    ],
  },
  {
    id: 'wedding',
    weight: 0.7,
    minDist: 2.0,
    title: '💍 Wedding Convoy',
    text: 'Aure convoy — decorated cars, music, family blocking a lane. Common in Kano weekends.',
    choices: [
      { label: 'Yield & wave', effect: (g) => { g.speed *= 0.5; g.score += 60; g.ui.showMissionToast('Barka da aure!'); } },
      { label: 'Squeeze past', effect: (g) => {
        if (Math.random() < 0.6) { g.score += 90; g.ui.showMissionToast('Squeezed through'); }
        else { g.triggerShake?.(10, 5); g.score = Math.max(0, g.score - 80); g.ui.showMissionToast('Side mirror scrape'); }
      }},
    ],
  },
  {
    id: 'fuel_q',
    weight: 0.9,
    minDist: 1.5,
    title: '⛽ Fuel Queue',
    text: 'Petrol station queue snakes onto the road. Black-market jerrycans on the shoulder.',
    choices: [
      { label: 'Join queue (+fuel)', effect: (g) => {
        g.fuel = Math.min(100, (g.fuel || 50) + 35);
        g.speed *= 0.3;
        g.ui.showMissionToast('Fuel +35%');
      }},
      { label: 'Skip — keep driving', effect: (g) => { g.score += 30; g.ui.showMissionToast('Skipped queue'); } },
    ],
  },
  {
    id: 'sallah',
    weight: 0.5,
    minDist: 3.0,
    title: '🌙 Sallah Mood',
    text: 'Festive traffic — new clothes, family visits, slower open vehicles full of kids.',
    choices: [
      { label: 'Enjoy the vibe', effect: (g) => { g.score += 120; g.addCombo?.(2); g.ui.showMissionToast('Sallah bonus'); } },
    ],
  },
  {
    id: 'rain_season',
    weight: 0.8,
    minDist: 1.0,
    title: '🌧️ Sudden Downpour',
    text: 'Kano rain turns laterite shoulders to mud. Visibility drops.',
    choices: [
      { label: 'Slow down', effect: (g) => { g.speed *= 0.55; g.ui.showMissionToast('Safe in the rain'); if (g.renderer3d) g.renderer3d.weather = 'rain'; } },
      { label: 'Push speed', effect: (g) => {
        if (Math.random() < 0.4) { g.score += 70; g.ui.showMissionToast('Risk paid off'); }
        else { g.triggerShake?.(12, 6); g.ui.showMissionToast('Skid!'); }
      }},
    ],
  },
  {
    id: 'yan_daba',
    weight: 0.6,
    minDist: 2.5,
    title: '🕶️ Suspicious Keke',
    text: 'A keke with tinted sides lingers near you. Yan daba rumor on this stretch.',
    choices: [
      { label: 'Change lane & horn', effect: (g) => { g.playerLane = (g.playerLane + 1) % 3; Audio.horn?.(); g.ui.showMissionToast('Distance kept'); } },
      { label: 'Ignore', effect: (g) => {
        if (Math.random() < 0.25) { g.score = Math.max(0, g.score - 150); g.ui.showMissionToast('Fare dispute — lost ₦150'); }
        else g.ui.showMissionToast('Nothing happened');
      }},
    ],
  },
  {
    id: 'school_run',
    weight: 1.0,
    minDist: 0.6,
    title: '🎒 School Run',
    text: 'Parents and kids at the gate. Short trips, small fares, lots of stops.',
    choices: [
      { label: 'Load school kids', effect: (g) => {
        const n = Math.min(2, (g.capacity || 3) - (g.paxOnBoard || 0));
        if (n) { g.paxOnBoard += n; g.totalPax += n; g.score += 90 * n; g.ui.showMissionToast(`School run +${n}`); }
        else g.ui.showMissionToast('Full');
      }},
      { label: 'Pass', effect: (g) => { g.ui.showMissionToast('Passed school gate'); } },
    ],
  },
  {
    id: 'radio_gist',
    weight: 0.8,
    minDist: 0.3,
    title: '📻 Radio Gist',
    text: 'Freedom Radio / Arewa FM — politics, football, and traffic report for Zoo Road.',
    choices: [
      { label: 'Turn it up', effect: (g) => { g.cycleRadio?.(); g.score += 25; g.ui.showMissionToast('Radio up'); } },
      { label: 'Focus on road', effect: (g) => { g.ui.showMissionToast('Eyes on road'); } },
    ],
  },
];

export class LifeActivities {
  constructor(game) {
    this.game = game;
    this.cooldown = 0;
    this.seen = new Set();
  }

  reset() {
    this.cooldown = 180;
    this.seen.clear();
  }

  update() {
    const g = this.game;
    if (g.state !== STATE.PLAY) return;
    if (this.cooldown > 0) { this.cooldown--; return; }
    if ((g.frame || 0) % 90 !== 0) return;
    if (Math.random() > 0.22) return;

    const dist = g.dist || 0;
    const pool = ACTIVITIES.filter(a => dist >= a.minDist);
    if (!pool.length) return;

    // Prefer unseen
    let pick = pool.filter(a => !this.seen.has(a.id));
    if (!pick.length) pick = pool;
    // Weighted
    const total = pick.reduce((s, a) => s + a.weight, 0);
    let r = Math.random() * total;
    let activity = pick[0];
    for (const a of pick) {
      r -= a.weight;
      if (r <= 0) { activity = a; break; }
    }

    this.seen.add(activity.id);
    this.cooldown = 280 + Math.floor(Math.random() * 120);
    this.trigger(activity);
  }

  trigger(activity) {
    const g = this.game;
    g.state = STATE.EVENT;
    Audio.alert?.();
    const choices = activity.choices.map((c) => ({
      label: c.label,
      action: () => {
        try { c.effect(g); } catch (e) { console.warn(e); }
        g.state = STATE.PLAY;
        g.ui.showPlaying?.();
        g.inv = Math.max(g.inv || 0, 30);
      },
    }));
    g.ui.showEvent(activity.title, activity.text, choices);
  }
}
