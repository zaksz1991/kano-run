/** Kano Run 3D — config. Developer: RuffNeck */
export const STATE = {
  START: 0,
  INTRO: 1,
  PLAY: 2,
  PAUSE: 3,
  OVER: 4,
  EVENT: 5
};

export const DEVELOPER = 'RuffNeck';

export const CONFIG = {
  LANES: 3,

  DESTINATIONS: [
    'Sabon Gari', 'Kofar Mata', 'Fagge', 'Farm Centre', 'Hotoro',
    'Zoo Road', 'Naibawa', 'Tarauni', 'Dala', 'Kantin Kwari',
    'Kofar Wambai', 'Panshekara', 'Kumbotso', 'Gwale', 'Sharada',
    "Emir's Palace", 'Kurmi Market', 'Bompai', 'Yankaba', 'Kabuga'
  ],

  HONORIFICS: [
    'Oga', 'Mai Gida', 'Mallam', 'Yallabai', 'Dan uwa',
    'Aboki', 'Driver', 'Baba', 'Mama', 'Hajiya', 'Sannu'
  ],

  NEGOTIATE_LINES: [
    '{h}, reduce am small!',
    '{h}, ₦{low} only — please!',
    'Mu je {dest}? {h}, how much?',
    '{h}, I no get plenty money today.',
    'Akwai change? {h}, make we agree ₦{low}.',
    '{h}, normal fare to {dest} how much?'
  ],

  ROUTES: {
    panshekara: { id: 'panshekara', name: 'Panshekara Route', description: 'Busy southern corridor', difficulty: 1.15, landmarks: ['Panshekara Market', 'Kumbotso', 'Naibawa'], baseFare: 150 },
    sabongari: { id: 'sabongari', name: 'Sabon Gari Route', description: 'Commercial chaos', difficulty: 1.3, landmarks: ['Sabon Gari Market', 'Kantin Kwari', 'Wapa'], baseFare: 170 },
    citycenter: { id: 'citycenter', name: 'City Centre / Emir Palace', description: 'Historic core', difficulty: 1.2, landmarks: ["Emir's Palace", 'Kurmi Market', 'Dala Hill'], baseFare: 180 },
    zoo: { id: 'zoo', name: 'Zoo Road / Hotoro', description: 'Long busy artery', difficulty: 1.0, landmarks: ['Zoo Road Flyover', 'Hotoro', 'Naibawa'], baseFare: 140 },
    kumbotso: { id: 'kumbotso', name: 'Kumbotso Route', description: 'Industrial + residential', difficulty: 1.05, landmarks: ['Kumbotso', 'Sharada', 'Challawa'], baseFare: 140 },
    fajir: { id: 'fajir', name: 'Fagge / Kantin Kwari', description: 'Textile hub', difficulty: 1.25, landmarks: ['Fagge', 'Kantin Kwari', 'Wapa'], baseFare: 165 },
    nassarawa: { id: 'nassarawa', name: 'Nassarawa GRA / Airport', description: 'GRA corridor', difficulty: 0.95, landmarks: ['Nassarawa GRA', 'Airport Road', 'Farm Centre'], baseFare: 160 },
    kurmi: { id: 'kurmi', name: 'Kurmi Market Route', description: 'Ancient market chaos', difficulty: 1.35, landmarks: ['Kurmi Market', "Emir's Palace", 'Kofar Mata'], baseFare: 175 },
    tarauni: { id: 'tarauni', name: 'Tarauni / Hotoro North', description: 'Dense residential', difficulty: 1.1, landmarks: ['Tarauni', 'Hotoro North', 'Kawaji'], baseFare: 145 },
    gwale: { id: 'gwale', name: 'Gwale / Kabuga', description: 'Student & market traffic', difficulty: 1.15, landmarks: ['Gwale', 'Kabuga', 'BUK Road'], baseFare: 150 },
    dala: { id: 'dala', name: 'Dala Hill Route', description: 'Historic hill area', difficulty: 1.2, landmarks: ['Dala Hill', 'Kofar Dawanau', 'Kurmi'], baseFare: 155 },
    sharada: { id: 'sharada', name: 'Sharada Industrial', description: 'Trucks & workers', difficulty: 1.25, landmarks: ['Sharada', 'Challawa', 'Kumbotso'], baseFare: 160 },
    farmcentre: { id: 'farmcentre', name: 'Farm Centre / Naibawa', description: 'Commercial strip', difficulty: 1.05, landmarks: ['Farm Centre', 'Naibawa', 'Zoo Road'], baseFare: 145 },
    kofarmata: { id: 'kofarmata', name: 'Kofar Mata / Wudil Rd', description: 'Eastern gateway', difficulty: 1.1, landmarks: ['Kofar Mata', 'Wudil Road', 'Yankaba'], baseFare: 150 },
    hotoro: { id: 'hotoro', name: 'Hotoro / NNPC', description: 'Eastern express mix', difficulty: 1.08, landmarks: ['Hotoro', 'NNPC', 'Naibawa'], baseFare: 148 },
    waje: { id: 'waje', name: 'Kano Municipal / Waje', description: 'City municipal core', difficulty: 1.22, landmarks: ['Waje', 'Sabon Gari', 'Fagge'], baseFare: 165 }
  },

  DRIVERS: {
    ruffneck: {
      id: 'ruffneck', name: 'RuffNeck', title: 'Top Driver',
      ability: 'ruffneck', desc: 'Best overall — score boost, night edge',
      unlocked: true,
      bonuses: { scoreMult: 1.15, speed: 0.15, invFrames: 12 }
    },
    baba: {
      id: 'baba', name: 'Baba', title: 'Elder Careful',
      ability: 'careful', desc: 'Careful driving — stronger near-miss pay',
      unlocked: true,
      bonuses: { scoreMult: 1.0, speed: -0.1, invFrames: 28, nearMissBonus: 1.5 }
    },
    mama: {
      id: 'mama', name: 'Mama', title: 'Steady Hand',
      ability: 'steady', desc: 'Better drop fares',
      unlocked: true,
      bonuses: { scoreMult: 1.05, fareMult: 1.25, speed: 0, invFrames: 16 }
    },
    mayen: {
      id: 'mayen', name: 'Mayen Mata', title: 'Ladies First',
      ability: 'ladies', desc: 'Aishat + Hibba bonus',
      unlocked: true,
      bonuses: { scoreMult: 1.05, aishatBonus: 200, speed: 0.05, invFrames: 10 }
    },
    uztaz: {
      id: 'uztaz', name: 'Uztaz', title: 'Respectful',
      ability: 'respect', desc: 'Safer pickups, solid fares',
      unlocked: true,
      bonuses: { scoreMult: 1.0, speed: -0.05, invFrames: 22, fareMult: 1.1 }
    },
    sani: {
      id: 'sani', name: 'Sani', title: 'Speed Demon',
      ability: 'aggressive', desc: 'Higher top speed',
      unlocked: true,
      bonuses: { scoreMult: 1.08, speed: 0.35, invFrames: 6 }
    }
  },

  KEKES: {
    starter: { id: 'starter', name: 'Street Classic', color: 0xfbbf24, speed: 0, capacity: 3, unlocked: true },
    ruffgold: { id: 'ruffgold', name: 'RuffNeck Gold', color: 0xeab308, speed: 0.1, capacity: 3, unlocked: true },
    sky: { id: 'sky', name: 'Sky Runner', color: 0x38bdf8, speed: 0.15, capacity: 3, unlocked: true },
    heavy: { id: 'heavy', name: 'Load Master', color: 0x22c55e, speed: -0.05, capacity: 4, unlocked: true },
    night: { id: 'night', name: 'Night Shadow', color: 0x1e293b, speed: 0.2, capacity: 3, unlocked: true },
    royal: { id: 'royal', name: 'Royal Purple', color: 0xa855f7, speed: 0.12, capacity: 3, unlocked: true }
  },

  PAINTS: {
    classic: { id: 'classic', name: 'Classic Yellow', color: 0xfbbf24 },
    ruffneck: { id: 'ruffneck', name: 'RuffNeck Gold', color: 0xeab308 },
    sky: { id: 'sky', name: 'Sky Blue', color: 0x38bdf8 },
    forest: { id: 'forest', name: 'Forest Green', color: 0x22c55e },
    royal: { id: 'royal', name: 'Royal Purple', color: 0xa855f7 },
    ember: { id: 'ember', name: 'Ember Red', color: 0xef4444 },
    night: { id: 'night', name: 'Night Black', color: 0x1e293b }
  },

  RADIO: [
    { id: 'freedom', name: 'Freedom Radio 99.5 FM' },
    { id: 'express', name: 'Express Radio 90.3 FM' },
    { id: 'arewa', name: 'Arewa Radio 93.1 FM' },
    { id: 'cool', name: 'Cool FM Kano 96.9' },
    { id: 'rahama', name: 'Rahama Radio 97.3 FM' },
    { id: 'wazobia', name: 'Wazobia FM Kano' },
    { id: 'vision', name: 'Vision FM 92.1' },
    { id: 'kano', name: 'Radio Kano AM' }
  ],

  MISSIONS: [
    { text: 'Drop 8 passengers', type: 'drop', target: 8 },
    { text: 'Drive 3 km', type: 'dist', target: 3 },
    { text: 'Score ₦1500', type: 'score', target: 1500 },
    { text: 'Pick 12 passengers', type: 'pax', target: 12 },
    { text: 'Near miss ×5', type: 'nearmiss', target: 5 }
  ],

  ACHIEVEMENTS: [
    { id: 'first_km', name: 'First Kilometre', desc: 'Drive 1 km in a run', check: g => g.dist >= 1 },
    { id: 'fare_king', name: 'Fare King', desc: 'Score ₦3000 in a run', check: g => g.score >= 3000 },
    { id: 'combo_5', name: 'Combo Starter', desc: 'Reach 5x combo', check: g => g.combo >= 5 },
    { id: 'pax_10', name: 'Full Load', desc: 'Carry 10+ passengers', check: g => g.totalPax >= 10 },
    { id: 'near_3', name: 'Close Call', desc: '3 near misses', check: g => (g.nearMissCount || 0) >= 3 },
    { id: 'survivor', name: 'Survivor', desc: 'Use a Life Saver', check: g => g.continuesLeft < 3 }
  ]
};
