/**
 * Kano Run — Gameplay systems (structure over graphics)
 * Road network · Destinations · Missions · Collision tiers · Traffic AI
 * Radio · Levels · KAROTA · Passenger economy · World events
 * Game Developer: Hassan Zakariya
 */

import { CONFIG } from './config.js';
import { Audio } from './audio.js';

/** 1. ROAD NETWORK — segment types player drives through */
export const ROAD_TYPES = {
  straight: { id: 'straight', name: 'Straight', difficulty: 1, traffic: 1 },
  curve_l: { id: 'curve_l', name: 'Left bend', difficulty: 1.1, traffic: 1, bias: -0.15 },
  curve_r: { id: 'curve_r', name: 'Right bend', difficulty: 1.1, traffic: 1, bias: 0.15 },
  junction: { id: 'junction', name: 'T-Junction', difficulty: 1.25, traffic: 1.3, choice: true },
  roundabout: { id: 'roundabout', name: 'Roundabout', difficulty: 1.35, traffic: 1.4, choice: true },
  flyover: { id: 'flyover', name: 'Flyover', difficulty: 1.2, traffic: 0.9 },
  market: { id: 'market', name: 'Market road', difficulty: 1.4, traffic: 1.6, slow: true },
  residential: { id: 'residential', name: 'Residential', difficulty: 0.95, traffic: 0.8 },
  highway: { id: 'highway', name: 'Highway', difficulty: 1.05, traffic: 1.2 }
};

export const DISTRICTS = [
  'Sabon Gari', 'Kurmi', 'Farm Centre', 'Hotoro', 'Tarauni', 'Kabuga',
  'Fagge', 'Dala', 'Naibawa', 'Zoo Road', 'Panshekara', 'Kumbotso',
  'Gwale', 'Sharada', 'Bompai', 'Yankaba', "Emir's Palace", 'Kantin Kwari'
];

/** 9. Passenger classes */
export const PAX_CLASSES = {
  student: { id: 'student', name: 'Student', fareMult: 0.7, freq: 0.25, color: '#38bdf8' },
  trader: { id: 'trader', name: 'Trader', fareMult: 1.0, freq: 0.3, color: '#fbbf24' },
  worker: { id: 'worker', name: 'Worker', fareMult: 0.9, freq: 0.25, color: '#4ade80' },
  vip: { id: 'vip', name: 'VIP', fareMult: 2.2, freq: 0.08, color: '#a855f7' },
  tourist: { id: 'tourist', name: 'Tourist', fareMult: 1.5, freq: 0.12, color: '#f472b6' }
};

/** 7. Level bands */
export const LEVEL_BANDS = [
  { min: 1, max: 5, area: 'Beginner Area', traffic: 0.85, karota: 0.7, event: 0.8 },
  { min: 6, max: 10, area: 'City Area', traffic: 1.0, karota: 1.0, event: 1.0 },
  { min: 11, max: 15, area: 'Market Area', traffic: 1.25, karota: 1.3, event: 1.15 },
  { min: 16, max: 20, area: 'Advanced Routes', traffic: 1.4, karota: 1.4, event: 1.25 },
  { min: 21, max: 99, area: 'VIP Services', traffic: 1.5, karota: 1.2, event: 1.35 }
];

/** 10. World events */
export const WORLD_EVENTS = [
  { id: 'rain', name: 'Rainstorm', duration: 400, grip: 0.72, msg: '🌧️ Rainstorm — roads slippery' },
  { id: 'market_jam', name: 'Market congestion', duration: 350, speedCap: 3.2, msg: '🛒 Market congestion — slow traffic' },
  { id: 'fuel_scarce', name: 'Fuel shortage', duration: 500, fuelDrain: 1.6, msg: '⛽ Fuel shortage — conserve fuel' },
  { id: 'convoy', name: 'Political convoy', duration: 280, speedCap: 2.5, msg: '🚔 Convoy — yield and wait' },
  { id: 'diversion', name: 'Road diversion', duration: 300, msg: '🚧 Road diversion — follow detour' },
  { id: 'accident', name: 'Accident scene', duration: 250, speedCap: 2.8, msg: '⚠️ Accident ahead — slow down' },
  { id: 'festival', name: 'Festival traffic', duration: 450, traffic: 1.8, msg: '🎉 Festival traffic — crowded streets' }
];

export function pickPaxClass(level = 1) {
  const vipOk = level >= 20;
  const entries = Object.values(PAX_CLASSES).filter((c) => c.id !== 'vip' || vipOk);
  const total = entries.reduce((s, c) => s + c.freq, 0);
  let r = Math.random() * total;
  for (const c of entries) {
    r -= c.freq;
    if (r <= 0) return c;
  }
  return PAX_CLASSES.worker;
}

export function pickDestination() {
  const list = CONFIG.DESTINATIONS || DISTRICTS;
  return list[Math.floor(Math.random() * list.length)];
}

export function getLevelBand(level) {
  return LEVEL_BANDS.find((b) => level >= b.min && level <= b.max) || LEVEL_BANDS[0];
}

export function nextRoadSegment(prevId, level) {
  const band = getLevelBand(level);
  const pool = ['straight', 'straight', 'curve_l', 'curve_r'];
  if (level >= 3) pool.push('junction', 'residential');
  if (level >= 6) pool.push('market', 'highway');
  if (level >= 11) pool.push('roundabout', 'flyover', 'market');
  if (level >= 16) pool.push('junction', 'roundabout', 'highway');
  // avoid repeating same type too often
  let id = pool[Math.floor(Math.random() * pool.length)];
  if (id === prevId && Math.random() < 0.6) {
    id = pool[Math.floor(Math.random() * pool.length)];
  }
  return { ...ROAD_TYPES[id], district: pickDestination() };
}

export function generateRunMissions() {
  const templates = [
    { id: 'pax', text: 'Carry {n} passengers', key: 'totalPax', n: 12 + Math.floor(Math.random() * 12), reward: 500 },
    { id: 'earn', text: 'Earn ₦{n}', key: 'score', n: 3000 + Math.floor(Math.random() * 4000), reward: 400 },
    { id: 'km', text: 'Drive {n} km', key: 'dist', n: 6 + Math.floor(Math.random() * 8), reward: 350 },
    { id: 'districts', text: 'Visit {n} districts', key: 'districts', n: 3 + Math.floor(Math.random() * 3), reward: 450 },
    { id: 'nokarota', text: 'Avoid KAROTA fines this run', key: 'karotaFines', n: 0, invert: true, reward: 600 },
    { id: 'drop', text: 'Complete {n} drop-offs', key: 'dropCount', n: 8 + Math.floor(Math.random() * 8), reward: 400 }
  ];
  const shuffled = templates.sort(() => Math.random() - 0.5).slice(0, 3);
  return shuffled.map((t) => ({
    ...t,
    text: t.text.replace('{n}', String(t.n)),
    progress: 0,
    done: false
  }));
}

/** 4. Collision severity from relative speed */
export function collisionTier(speed) {
  if (speed < 2.5) return { tier: 'low', shake: 6, dmg: 4, speedMul: 0.92, steerPenalty: 0, msg: 'Bump — minor scrape' };
  if (speed < 5) return { tier: 'medium', shake: 12, dmg: 12, speedMul: 0.75, steerPenalty: 40, msg: 'Impact — body dent, slower handling' };
  if (speed < 7.5) return { tier: 'high', shake: 18, dmg: 25, speedMul: 0.55, steerPenalty: 80, msg: 'Heavy crash — smoke risk' };
  return { tier: 'critical', shake: 24, dmg: 40, speedMul: 0.35, steerPenalty: 120, msg: 'Critical hit — engine struggling' };
}

/** 6. Radio dynamic lines */
export function radioAnnouncement(ctx) {
  const lines = [];
  if (ctx.weather === 'rain') lines.push('Weather: rain across Kano. Drive slow.');
  if (ctx.roadType === 'market') lines.push('Market road congestion reported.');
  if (ctx.karotaSoon) lines.push('KAROTA checkpoint ahead. Papers ready.');
  if (ctx.mission) lines.push('Mission update: ' + ctx.mission);
  if (ctx.event) lines.push(ctx.event);
  if (ctx.district) lines.push('Approaching ' + ctx.district + '.');
  lines.push(
    'Sannu. Traffic update for ' + (ctx.district || 'Kano') + '.',
    'Adaidaita tip: three at the back, two in front.',
    'Fuel stations busy near Farm Centre.'
  );
  return lines[Math.floor(Math.random() * lines.length)];
}

/** 8. KAROTA fine calculator */
export function karotaFine(game) {
  let base = 200 + Math.floor(Math.random() * 300);
  if (game.paxOnBoard > game.capacity) base += 400;
  if (game.wantedLevel > 0) base += game.wantedLevel * 150;
  if (game.condition < 40) base += 100;
  return base;
}
