/**
 * Kano Run — Kano-specific world & gameplay systems
 * Game Developer: Hassan Zakariya
 */
import { CONFIG } from './config.js';

export const ROAD_TYPES = {
  straight: { id: 'straight', name: 'Straight road', difficulty: 1, traffic: 1 },
  curve_l: { id: 'curve_l', name: 'Left bend', difficulty: 1.1, traffic: 1, bias: -0.15 },
  curve_r: { id: 'curve_r', name: 'Right bend', difficulty: 1.1, traffic: 1, bias: 0.15 },
  junction: { id: 'junction', name: 'T-Junction', difficulty: 1.25, traffic: 1.3, choice: true },
  roundabout: { id: 'roundabout', name: 'Roundabout', difficulty: 1.35, traffic: 1.4, choice: true },
  flyover: { id: 'flyover', name: 'Flyover', difficulty: 1.2, traffic: 0.9 },
  market: { id: 'market', name: 'Market road', difficulty: 1.4, traffic: 1.6, slow: true },
  residential: { id: 'residential', name: 'Residential', difficulty: 0.95, traffic: 0.8 },
  highway: { id: 'highway', name: 'Highway', difficulty: 1.05, traffic: 1.2 },
  industrial: { id: 'industrial', name: 'Industrial road', difficulty: 1.2, traffic: 1.3 }
};

/** Real Kano district progression */
export const KANO_DISTRICTS = [
  { id: 'sabongari', name: 'Sabon Gari', minKm: 0,
    sky: 0x6ec5f0, fog: 0x8ec8e8, fogNear: 16, fogFar: 65, sun: 1.25, hem: 0.55,
    density: 1.8, market: true, traffic: 1.5, karota: 1.3,
    msg: '📍 Sabon Gari — commercial chaos', landmarks: ['Lagos Street', 'Singer Market', 'Beirut Road'] },
  { id: 'farmcentre', name: 'Farm Centre', minKm: 3,
    sky: 0x7dd3fc, fog: 0xa5d8ef, fogNear: 17, fogFar: 70, sun: 1.2, hem: 0.5,
    density: 1.4, traffic: 1.2, karota: 1.1,
    msg: '📍 Farm Centre', landmarks: ['Farm Centre Junction', 'Murtala Way'] },
  { id: 'zooroad', name: 'Zoo Road', minKm: 6,
    sky: 0x38bdf8, fog: 0x7dd3fc, fogNear: 18, fogFar: 75, sun: 1.3, hem: 0.55,
    density: 1.3, traffic: 1.35, karota: 1.2,
    msg: '📍 Zoo Road — long busy artery', landmarks: ['Zoo Road Flyover'] },
  { id: 'tarauni', name: 'Tarauni', minKm: 9,
    sky: 0x67e8f9, fog: 0xa5f3fc, fogNear: 16, fogFar: 68, sun: 1.15, hem: 0.5,
    density: 1.5, residential: true, traffic: 1.1, karota: 1.0,
    msg: '📍 Tarauni — dense residential', landmarks: ['Tarauni Market', 'Kawaji'] },
  { id: 'hotoro', name: 'Hotoro', minKm: 12,
    sky: 0x0ea5e9, fog: 0x38bdf8, fogNear: 17, fogFar: 72, sun: 1.2, hem: 0.5,
    density: 1.4, traffic: 1.25, karota: 1.15,
    msg: '📍 Hotoro', landmarks: ['Hotoro NNPC', 'Hotoro GRA'] },
  { id: 'naibawa', name: 'Naibawa', minKm: 15,
    sky: 0xf59e0b, fog: 0xd97706, fogNear: 14, fogFar: 58, sun: 1.1, hem: 0.45,
    density: 1.7, market: true, traffic: 1.45, karota: 1.35,
    msg: '📍 Naibawa Market area', landmarks: ['Naibawa Market'] },
  { id: 'yankaba', name: 'Yankaba', minKm: 18,
    sky: 0x7dd3fc, fog: 0xbae6fd, fogNear: 16, fogFar: 68, sun: 1.15, hem: 0.5,
    density: 1.35, market: true, traffic: 1.2, karota: 1.1,
    msg: '📍 Yankaba', landmarks: ['Yankaba Market'] },
  { id: 'kofarmata', name: 'Kofar Mata', minKm: 21,
    sky: 0x93c5fd, fog: 0xbfdbfe, fogNear: 15, fogFar: 62, sun: 1.1, hem: 0.48,
    density: 1.5, traffic: 1.2, karota: 1.2,
    msg: '📍 Kofar Mata — eastern gate', landmarks: ['Kofar Mata Gate'] },
  { id: 'kurmi', name: 'Kurmi Market', minKm: 24,
    sky: 0xfbbf24, fog: 0xd97706, fogNear: 12, fogFar: 50, sun: 1.05, hem: 0.42,
    density: 2.2, market: true, traffic: 1.7, karota: 1.5, slow: true,
    msg: '📍 Kurmi Market — ancient market chaos', landmarks: ['Kurmi Market'] },
  { id: 'dangi', name: 'Dangi Roundabout', minKm: 28,
    sky: 0x38bdf8, fog: 0x0ea5e9, fogNear: 16, fogFar: 70, sun: 1.2, hem: 0.5,
    density: 1.3, traffic: 1.4, karota: 1.3, junction: true,
    msg: '📍 Dangi Roundabout', landmarks: ['Dangi Roundabout'] },
  { id: 'kabuga', name: 'Kabuga', minKm: 32,
    sky: 0x7dd3fc, fog: 0xa5f3fc, fogNear: 17, fogFar: 72, sun: 1.2, hem: 0.52,
    density: 1.4, residential: true, traffic: 1.15, karota: 1.0,
    msg: '📍 Kabuga — student traffic', landmarks: ['Kabuga', 'BUK Road'] },
  { id: 'gwale', name: 'Gwale', minKm: 36,
    sky: 0x67e8f9, fog: 0xa5f3fc, fogNear: 16, fogFar: 68, sun: 1.15, hem: 0.5,
    density: 1.45, residential: true, traffic: 1.1, karota: 1.05,
    msg: '📍 Gwale', landmarks: ['Gwale'] },
  { id: 'sharada', name: 'Sharada Industrial', minKm: 40,
    sky: 0x64748b, fog: 0x475569, fogNear: 13, fogFar: 55, sun: 0.9, hem: 0.35,
    density: 1.2, industrial: true, traffic: 1.4, karota: 1.15,
    msg: '📍 Sharada Industrial', landmarks: ['Sharada', 'Challawa'] },
  { id: 'kumbotso', name: 'Kumbotso', minKm: 45,
    sky: 0x94a3b8, fog: 0x64748b, fogNear: 15, fogFar: 65, sun: 1.0, hem: 0.4,
    density: 1.25, industrial: true, traffic: 1.3, karota: 1.1,
    msg: '📍 Kumbotso', landmarks: ['Kumbotso'] },
  { id: 'airport', name: 'Airport Road', minKm: 50,
    sky: 0x38bdf8, fog: 0x0ea5e9, fogNear: 20, fogFar: 90, sun: 1.35, hem: 0.58,
    density: 1.0, traffic: 1.15, karota: 0.9, highway: true,
    msg: '📍 Airport Road', landmarks: ['Airport Road'] },
  { id: 'nassarawa', name: 'Nassarawa GRA', minKm: 55,
    sky: 0x7dd3fc, fog: 0xbae6fd, fogNear: 18, fogFar: 80, sun: 1.25, hem: 0.55,
    density: 1.1, traffic: 1.0, karota: 0.85,
    msg: '📍 Nassarawa GRA', landmarks: ['Nassarawa GRA'] },
  { id: 'emir', name: "Emir Palace District", minKm: 60,
    sky: 0xfcd34d, fog: 0xf59e0b, fogNear: 14, fogFar: 60, sun: 1.15, hem: 0.48,
    density: 1.6, market: true, traffic: 1.3, karota: 1.4,
    msg: "📍 Emir's Palace District", landmarks: ["Emir's Palace", 'Dala Hill'] }
];

export const WORLD_BIOMES = KANO_DISTRICTS;

export function districtForDistance(distKm) {
  let cur = KANO_DISTRICTS[0];
  for (const d of KANO_DISTRICTS) {
    if (distKm >= d.minKm) cur = d;
  }
  return cur;
}

export function biomeForDistance(distKm) {
  return districtForDistance(distKm);
}

export const DISTRICTS = KANO_DISTRICTS.map((d) => d.name).concat([
  'Kantin Kwari', 'Kofar Wambai', 'Panshekara', 'Bompai', 'Kawo', 'Ungogo', 'Challawa', 'Wapa'
]);

export const PAX_CLASSES = {
  student: { id: 'student', name: 'Student', fareMult: 0.75, freq: 0.22, color: '#38bdf8' },
  trader: { id: 'trader', name: 'Trader', fareMult: 1.0, freq: 0.28, color: '#fbbf24' },
  worker: { id: 'worker', name: 'Worker', fareMult: 0.9, freq: 0.24, color: '#4ade80' },
  vip: { id: 'vip', name: 'VIP', fareMult: 2.2, freq: 0.08, color: '#a855f7' },
  tourist: { id: 'tourist', name: 'Tourist', fareMult: 1.5, freq: 0.1, color: '#f472b6' },
  hajiya: { id: 'hajiya', name: 'Hajiya', fareMult: 1.1, freq: 0.08, color: '#e879f9' }
};

export const LEVEL_BANDS = [
  { min: 1, max: 5, area: 'Inner Kano', traffic: 0.9, karota: 0.85, event: 0.8 },
  { min: 6, max: 12, area: 'City Corridors', traffic: 1.05, karota: 1.0, event: 1.0 },
  { min: 13, max: 20, area: 'Market & Gates', traffic: 1.25, karota: 1.3, event: 1.15 },
  { min: 21, max: 30, area: 'Outer Districts', traffic: 1.35, karota: 1.25, event: 1.2 },
  { min: 31, max: 99, area: 'Cross-Kano Master', traffic: 1.45, karota: 1.35, event: 1.3 }
];

export const WORLD_EVENTS = [
  { id: 'rain', name: 'Rainstorm', duration: 400, grip: 0.72, msg: '🌧️ Rain over Kano — roads slippery' },
  { id: 'market_jam', name: 'Market congestion', duration: 350, speedCap: 3.2, msg: '🛒 Market jam — Sabon Gari style' },
  { id: 'fuel_scarce', name: 'Fuel shortage', duration: 500, fuelDrain: 1.6, msg: '⛽ Fuel queue at NNPC' },
  { id: 'convoy', name: 'Political convoy', duration: 280, speedCap: 2.5, msg: '🚔 Convoy — yield' },
  { id: 'diversion', name: 'Road diversion', duration: 300, msg: '🚧 KAROTA diversion' },
  { id: 'accident', name: 'Accident scene', duration: 250, speedCap: 2.8, msg: '⚠️ Accident — slow down' },
  { id: 'jumaah', name: "Juma'ah traffic", duration: 400, traffic: 1.6, msg: "🕌 Juma'ah — mosque traffic" },
  { id: 'harmattan', name: 'Harmattan dust', duration: 450, grip: 0.9, msg: '🏜️ Harmattan haze' }
];

export const HONORIFICS = [
  'Oga', 'Mai Gida', 'Mallam', 'Yallabai', 'Dan uwa', 'Aboki',
  'Driver', 'Baba', 'Mama', 'Hajiya', 'Ustaz', 'Dan gari'
];

export function pickHonorific(genderHint) {
  if (genderHint === 'f') {
    const f = ['Mama', 'Hajiya', 'Yallabai', 'Mallama'];
    return f[Math.floor(Math.random() * f.length)];
  }
  return HONORIFICS[Math.floor(Math.random() * HONORIFICS.length)];
}

export function pickPaxClass(level = 1) {
  const vipOk = level >= 8;
  const entries = Object.values(PAX_CLASSES).filter((c) => c.id !== 'vip' || vipOk);
  const total = entries.reduce((s, c) => s + c.freq, 0);
  let r = Math.random() * total;
  for (const c of entries) {
    r -= c.freq;
    if (r <= 0) return c;
  }
  return PAX_CLASSES.worker;
}

export function pickDestination(district) {
  if (district?.landmarks?.length && Math.random() < 0.45) {
    return district.landmarks[Math.floor(Math.random() * district.landmarks.length)];
  }
  const list = CONFIG.DESTINATIONS || DISTRICTS;
  return list[Math.floor(Math.random() * list.length)];
}

export function getLevelBand(level) {
  return LEVEL_BANDS.find((b) => level >= b.min && level <= b.max) || LEVEL_BANDS[0];
}

export function nextRoadSegment(prevId, level, district) {
  let pool = Object.keys(ROAD_TYPES);
  if (district?.market) pool = ['market', 'junction', 'straight', 'curve_l', 'curve_r', 'market'];
  else if (district?.industrial) pool = ['industrial', 'straight', 'highway', 'junction'];
  else if (district?.residential) pool = ['residential', 'straight', 'curve_l', 'curve_r', 'junction'];
  else if (district?.highway) pool = ['highway', 'straight', 'flyover'];
  else if (district?.junction) pool = ['roundabout', 'junction', 'straight'];
  const id = pool[Math.floor(Math.random() * pool.length)];
  const t = ROAD_TYPES[id] || ROAD_TYPES.straight;
  return {
    ...t,
    district: district?.name || pickDestination(),
    length: 1.2 + Math.random() * 1.8
  };
}

export function generateRunMissions() {
  return [
    { key: 'dropCount', n: 10, text: 'Drop 10 passengers', reward: 400, done: false, progress: 0 },
    { key: 'dist', n: 8, text: 'Drive 8 km across Kano', reward: 500, done: false, progress: 0 },
    { key: 'totalPax', n: 15, text: 'Carry 15 passengers', reward: 350, done: false, progress: 0 },
    { key: 'districts', n: 4, text: 'Visit 4 districts', reward: 450, done: false, progress: 0 }
  ];
}

export function collisionTier(speed) {
  const s = Number(speed) || 0;
  if (s < 2.5) return { tier: 'low', dmg: 6, shake: 2, msg: 'Bump', speedMul: 0.85, steerPenalty: 0 };
  if (s < 4.5) return { tier: 'medium', dmg: 12, shake: 3, msg: 'Hit!', speedMul: 0.7, steerPenalty: 8 };
  if (s < 7) return { tier: 'high', dmg: 20, shake: 4, msg: 'Hard crash!', speedMul: 0.55, steerPenalty: 12 };
  return { tier: 'critical', dmg: 28, shake: 5, msg: 'Severe impact!', speedMul: 0.4, steerPenalty: 16 };
}

export function radioAnnouncement(ctx = {}) {
  const lines = [
    ctx.district ? `Traffic update: busy around ${ctx.district}` : 'Traffic update across Kano metro',
    ctx.karotaSoon ? 'KAROTA checkpoint reported ahead — papers ready' : 'Roads open, drive carefully',
    ctx.mission ? `Driver tip: ${ctx.mission}` : 'Watch for passengers at stop pads',
    ctx.event || 'Arewa weather — harmattan haze possible this week',
    'Freedom Radio — stay safe on Zoo Road and Hotoro'
  ];
  return lines[Math.floor(Math.random() * lines.length)];
}

export function karotaFine(overload, wanted) {
  let base = 200 + Math.floor(Math.random() * 250);
  if (overload) base += 150;
  if (wanted > 0) base += wanted * 80;
  return base;
}
