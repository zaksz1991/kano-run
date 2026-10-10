/**
 * Kano Run — Adaidaita Sahu
 * Central game configuration.
 * Developer: Hassan Zakariya
 */

export const DEVELOPER = Object.freeze({
  name: 'Hassan Zakariya',
  studio: 'RuffNeck Entertainment',
  game: 'Kano Run — Adaidaita Sahu'
});

export const STATE = Object.freeze({
  START: 'start',
  INTRO: 'intro',
  PLAY: 'play',
  PAUSE: 'pause',
  OVER: 'over',
  GAMEOVER: 'over',
  EVENT: 'event'
});

export const CONFIG = Object.freeze({
  VERSION: '2.0.0',
  LANES: 3,
  DEFAULT_CAPACITY: 3,
  STARTING_LIVES: 3,
  START_SPEED: 2.2,
  MAX_SPEED: 34,
  DAY_LENGTH_MS: 150000,
  STORAGE_KEYS: Object.freeze({
    money: 'kanoMoney', highScore: 'kanoHigh', paint: 'kanoPaint',
    capacity: 'kanoCap', speed: 'kanoSpeed', horn: 'kanoHorn'
  }),
  ROUTES: Object.freeze({
    citycenter: { id: 'citycenter', name: 'Kano City Centre', district: 'Kano Municipal', difficulty: 'normal', unlockLevel: 1 },
    sabongari: { id: 'sabongari', name: 'Sabon Gari Run', district: 'Sabon Gari', difficulty: 'normal', unlockLevel: 1 },
    market: { id: 'market', name: 'Kantin Kwari Market', district: 'Kantin Kwari', difficulty: 'normal', unlockLevel: 2 },
    dala: { id: 'dala', name: 'Dala Hills', district: 'Dala', difficulty: 'hard', unlockLevel: 3 },
    airport: { id: 'airport', name: 'Airport Road', district: 'Nassarawa', difficulty: 'normal', unlockLevel: 4 },
    industrial: { id: 'industrial', name: 'Bompai Industrial', district: 'Bompai', difficulty: 'hard', unlockLevel: 5 }
  }),
  DRIVERS: Object.freeze({
    ruffneck: { id: 'ruffneck', name: 'RuffNeck', title: 'Founder Driver', color: '#00b4d8', unlockLevel: 1, bonuses: { speed: 0.05, fare: 0.05 } },
    musa: { id: 'musa', name: 'Musa', title: 'Street Expert', color: '#22c55e', unlockLevel: 2, bonuses: { handling: 0.08 } },
    aisha: { id: 'aisha', name: 'Aisha', title: 'Safe Driver', color: '#f472b6', unlockLevel: 3, bonuses: { damageResistance: 0.1 } },
    hadiza: { id: 'hadiza', name: 'Hadiza', title: 'Fare Specialist', color: '#fbbf24', unlockLevel: 4, bonuses: { fare: 0.12 } }
  }),
  KEKES: Object.freeze({
    starter: { id: 'starter', name: 'Standard Adaidaita', title: 'Starter', color: '#fbbf24', unlockLevel: 1, speed: 0, capacity: 3, cost: 0 },
    ruffgold: { id: 'ruffgold', name: 'RuffGold', title: 'Premium', color: '#fbbf24', unlockLevel: 2, speed: 0.4, capacity: 3, cost: 1500 },
    sky: { id: 'sky', name: 'Sky Runner', title: 'Quick', color: '#38bdf8', unlockLevel: 3, speed: 0.8, capacity: 3, cost: 3000 },
    heavy: { id: 'heavy', name: 'Heavy Duty', title: 'Passenger Plus', color: '#22c55e', unlockLevel: 5, speed: -0.2, capacity: 4, cost: 5000 },
    night: { id: 'night', name: 'Night Rider', title: 'Night Edition', color: '#8b5cf6', unlockLevel: 7, speed: 1.1, capacity: 3, cost: 8000 },
    royal: { id: 'royal', name: 'Royal Sahu', title: 'Elite', color: '#ef4444', unlockLevel: 10, speed: 1.5, capacity: 4, cost: 12000 }
  }),
  RADIO: Object.freeze([
    { id: 'freedom', name: 'Freedom Radio' },
    { id: 'arewa', name: 'Arewa Radio' },
    { id: 'rahama', name: 'Rahama Radio' },
    { id: 'kano', name: 'Radio Kano' },
    { id: 'cool', name: 'Cool FM' },
    { id: 'express', name: 'Express Radio' }
  ]),
  MISSIONS: Object.freeze([
    { id: 'passengers3', name: 'Passenger Service', text: 'Pick up and deliver 3 passengers', target: 3, type: 'dropoffs', reward: 250 },
    { id: 'distance', name: 'Keep Moving', text: 'Drive 2 km without crashing', target: 2, type: 'distance', reward: 200 },
    { id: 'coins', name: 'Daily Earnings', text: 'Collect 10 coins', target: 10, type: 'coins', reward: 150 },
    { id: 'nearmiss', name: 'Traffic Pro', text: 'Complete 5 near misses', target: 5, type: 'nearMiss', reward: 300 }
  ]),
  ACHIEVEMENTS: Object.freeze([
    { id: 'first_fare', name: 'First Fare', description: 'Complete your first passenger drop-off', target: 1 },
    { id: 'road_runner', name: 'Road Runner', description: 'Travel 10 km in total', target: 10 },
    { id: 'combo_master', name: 'Combo Master', description: 'Reach a combo of 10', target: 10 }
  ]),
  DESTINATIONS: Object.freeze([
    'Sabon Gari', 'Kofar Mata', 'Fagge', 'Farm Centre', 'Hotoro', 'Zoo Road',
    'Naibawa', 'Tarauni', 'Dala', 'Kantin Kwari', 'Kofar Wambai', 'Kumbotso',
    'Sharada', 'Bompai', 'Gwale', 'Kabuga', 'BUK Road', 'Waje', 'Rijiyar Zaki',
    'Yankaba', 'Challawa', 'Nassarawa GRA', 'Airport Road', 'Tudun Wada', 'Unguwa Uku'
  ]),
  HONORIFICS: Object.freeze(['Oga', 'Mallam', 'Yallabai', 'Hajiya', 'Baba', 'Mama', 'Dan uwa']),
  NEGOTIATE_LINES: Object.freeze([
    'Oga, wannan kudin ya yi kadan.', 'Mallam, mu daidaita farashi.',
    'Yallabai, ku kara kadan don Allah.', 'Hajiya, mun gode da tafiya.'
  ]),
  WEATHER: Object.freeze({
    clear: '☀️ Clear', sunny: '☀️ Sunny', cloudy: '☁️ Cloudy', rain: '🌧️ Rain',
    rainy: '🌧️ Rain', dust: '🌫️ Harmattan Dust', harmattan: '🌫️ Harmattan Dust', night: '🌙 Night'
  })
});
