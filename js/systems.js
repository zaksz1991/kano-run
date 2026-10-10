/**
 * Kano Run 3D — road, mission, district and event systems.
 * Developer: Hassan Zakariya · RuffNeck Entertainment
 * Drop-in module for js/game.js.
 */

export const DISTRICTS = [
  'Fagge', 'Kano Municipal', 'Nassarawa', 'Tarauni', 'Gwale', 'Dala',
  'Kumbotso', 'Ungogo', 'Dawakin Kudu', 'Kura', 'Bichi', 'Gwarzo',
  'Rijiyar Zaki', 'Sabon Gari', 'Kofar Mata', 'Kofar Ruwa', 'Kofar Wambai',
  'Dangi', 'Hotoro', 'Naibawa', 'Sheka', 'Zaria Road', 'Zoo Road',
  'Bompai', 'Sharada', 'Jakara', 'Kurna', 'Dorayi', 'Panshekara', 'Yankaba'
];

const ROAD_TYPES = [
  { id: 'straight', name: 'Main Road', weight: 34, length: 1.8, choice: false },
  { id: 'curve_l', name: 'Left Bend', weight: 12, length: 1.7, choice: false },
  { id: 'curve_r', name: 'Right Bend', weight: 12, length: 1.7, choice: false },
  { id: 'junction', name: 'Kano Junction', weight: 15, length: 2.2, choice: true },
  { id: 'roundabout', name: 'Roundabout', weight: 10, length: 2.0, choice: true },
  { id: 'market', name: 'Market District', weight: 9, length: 1.8, choice: false },
  { id: 'highway', name: 'Express Road', weight: 8, length: 2.4, choice: false }
];

export const WORLD_EVENTS = [
  { id: 'rain', name: 'Rain Shower', msg: 'Rain shower! Road grip is reduced.', duration: 520, grip: 0.72 },
  { id: 'harmattan', name: 'Harmattan Dust', msg: 'Harmattan dust reduces visibility. Drive carefully.', duration: 460, grip: 0.88 },
  { id: 'traffic', name: 'Traffic Build-up', msg: 'Traffic build-up ahead. Keep your distance.', duration: 420, grip: 0.96 },
  { id: 'festival', name: 'Street Celebration', msg: 'A street celebration is underway. Watch for traffic.', duration: 400, grip: 1 },
  { id: 'clear', name: 'Clear Roads', msg: 'Traffic is moving freely. Make the most of it.', duration: 360, grip: 1 }
];

const LEVEL_BANDS = [
  { min: 1, max: 3, traffic: 0.78, event: 0.75, fine: 0.8, label: 'Rookie' },
  { min: 4, max: 7, traffic: 0.95, event: 0.9, fine: 0.95, label: 'Regular' },
  { min: 8, max: 14, traffic: 1.08, event: 1, fine: 1.05, label: 'Experienced' },
  { min: 15, max: 24, traffic: 1.2, event: 1.12, fine: 1.15, label: 'Expert' },
  { min: 25, max: Infinity, traffic: 1.32, event: 1.25, fine: 1.25, label: 'Legend' }
];

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const pick = (items) => items[Math.floor(Math.random() * items.length)];

export function getLevelBand(level = 1) {
  const n = Math.max(1, Math.floor(Number(level) || 1));
  return LEVEL_BANDS.find((band) => n >= band.min && n <= band.max) || LEVEL_BANDS[0];
}

export function pickDestination(exclude = '') {
  const options = DISTRICTS.filter((district) => district !== exclude);
  return pick(options.length ? options : DISTRICTS);
}

export function nextRoadSegment(previous = 'straight', level = 1) {
  const band = getLevelBand(level);
  let pool = ROAD_TYPES.filter((road) => road.id !== previous || road.id === 'straight');
  // Junctions become slightly more common as the player advances, but never dominate.
  pool = pool.map((road) => ({
    ...road,
    weight: road.weight * ((road.choice ? 0.85 + band.traffic * 0.12 : 1) * (road.id === 'market' ? 0.9 : 1))
  }));
  const total = pool.reduce((sum, road) => sum + road.weight, 0);
  let roll = Math.random() * total;
  let selected = pool[0];
  for (const road of pool) {
    roll -= road.weight;
    if (roll <= 0) { selected = road; break; }
  }
  const district = pickDestination();
  return {
    id: selected.id,
    name: selected.name,
    district,
    choice: !!selected.choice,
    length: selected.length,
    traffic: clamp(band.traffic * (selected.id === 'market' ? 1.08 : 1), 0.65, 1.6),
    speedLimit: selected.id === 'market' ? 18 : selected.id === 'highway' ? 80 : 45
  };
}

export function generateRunMissions(level = 1) {
  const band = getLevelBand(level);
  const missions = [
    { key: 'totalPax', text: 'Pick up passengers', n: 4 + Math.floor(level / 4), reward: 450 + level * 20 },
    { key: 'dist', text: 'Drive the distance', n: 2.5 + Math.min(5, level * 0.15), reward: 400 + level * 18 },
    { key: 'districts', text: 'Visit new districts', n: 3 + Math.floor(level / 8), reward: 500 + level * 25 },
    { key: 'dropCount', text: 'Complete passenger drop-offs', n: 3 + Math.floor(level / 5), reward: 550 + level * 20 },
    { key: 'karotaFines', text: 'Avoid KAROTA fines', n: 0, reward: 650 + level * 25, invert: true }
  ];
  // Randomise order to keep runs varied while ensuring the mission data shape stays stable.
  for (let i = missions.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [missions[i], missions[j]] = [missions[j], missions[i]];
  }
  return missions.slice(0, 3).map((mission, index) => ({
    ...mission,
    id: `run-${Date.now().toString(36)}-${index}`,
    progress: 0,
    done: false,
    reward: Math.round(mission.reward * (band.traffic > 1 ? 1.08 : 1))
  }));
}

export function collisionTier(speed = 0) {
  const v = Math.max(0, Number(speed) || 0);
  if (v < 8) return { tier: 'low', dmg: 5, shake: 7, speedMul: 0.72, steerPenalty: 8, msg: 'Minor bump — keep a safe distance.' };
  if (v < 16) return { tier: 'medium', dmg: 12, shake: 12, speedMul: 0.55, steerPenalty: 18, msg: 'Collision! Vehicle condition has dropped.' };
  if (v < 25) return { tier: 'high', dmg: 22, shake: 18, speedMul: 0.35, steerPenalty: 36, msg: 'Heavy impact! Check your vehicle condition.' };
  return { tier: 'critical', dmg: 34, shake: 24, speedMul: 0.18, steerPenalty: 58, msg: 'Critical crash! Your vehicle is badly damaged.' };
}

export function radioAnnouncement(level = 1, district = '') {
  const lines = [
    'You are listening to Kano Run Radio. Drive safely.',
    'Keep your eyes on the road and leave space between vehicles.',
    'Welcome to the streets of Kano. Respect other road users.',
    'Watch your speed near markets and busy junctions.',
    'Safe driving keeps your passengers and your keke moving.'
  ];
  const location = String(district || '').trim();
  return location ? `${pick(lines)} You are travelling through ${location}.` : pick(lines);
}

export function karotaFine(speed = 0, zone = 'road', level = 1) {
  const v = Math.max(0, Number(speed) || 0);
  const band = getLevelBand(level);
  const restricted = zone === 'market' || zone === 'junction';
  const base = restricted ? 1800 : 1200;
  const speeding = v > (restricted ? 18 : 45) ? Math.round((v - (restricted ? 18 : 45)) * 95) : 0;
  return Math.round((base + speeding) * band.fine / 100) * 100;
}

export function pickPaxClass(level = 1) {
  const n = Math.max(1, Number(level) || 1);
  const roll = Math.random();
  if (n >= 8 && roll > 0.9) return { id: 'premium', name: 'Premium passenger', fare: 2.1, patience: 1.25, tipChance: 0.4 };
  if (n >= 4 && roll > 0.72) return { id: 'business', name: 'Business passenger', fare: 1.5, patience: 1.1, tipChance: 0.25 };
  if (roll < 0.12) return { id: 'student', name: 'Student', fare: 0.8, patience: 0.9, tipChance: 0.08 };
  return { id: 'regular', name: 'Regular passenger', fare: 1, patience: 1, tipChance: 0.15 };
}

export const Systems = {
  DISTRICTS,
  WORLD_EVENTS,
  getLevelBand,
  pickDestination,
  nextRoadSegment,
  generateRunMissions,
  collisionTier,
  radioAnnouncement,
  karotaFine,
  pickPaxClass
};
