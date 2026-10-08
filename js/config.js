export const STATE = { START: 0, PLAY: 1, OVER: 2, EVENT: 3 };

export const CONFIG = {
  LANES: 3,

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
    bungudu: { id: 'bungudu', name: 'Bompai / Bungudu', description: 'Industrial east', difficulty: 1.18, landmarks: ['Bompai', 'Bungudu', 'Challawa'], baseFare: 155 },
    RijiyarZaki: { id: 'RijiyarZaki', name: 'Rijiyar Zaki Route', description: 'Western approach', difficulty: 1.0, landmarks: ['Rijiyar Zaki', 'Kabuga', 'BUK'], baseFare: 140 },
    waje: { id: 'waje', name: 'Kano Municipal / Waje', description: 'City municipal core', difficulty: 1.22, landmarks: ['Waje', 'Sabon Gari', 'Fagge'], baseFare: 165 },
    hotoro: { id: 'hotoro', name: 'Hotoro / NNPC', description: 'Eastern express mix', difficulty: 1.08, landmarks: ['Hotoro', 'NNPC', 'Naibawa'], baseFare: 148 }
  },

  DRIVERS: {
    ruffneck: {
      id: 'ruffneck', name: 'Ruffneck', title: 'Top Driver',
      ability: 'ruffneck', desc: 'Best overall — score boost, night vision',
      color: 0xfbbf24, unlocked: true,
      bonuses: { scoreMult: 1.15, speed: 0.15, invFrames: 10 }
    },
    baba: {
      id: 'baba', name: 'Baba', title: 'Elder Careful',
      ability: 'careful', desc: 'Drives carefully — wider near-miss window, fewer crashes feel',
      color: 0x94a3b8, unlocked: true,
      bonuses: { scoreMult: 1.0, speed: -0.1, invFrames: 25, nearMissBonus: 1.5 }
    },
    mama: {
      id: 'mama', name: 'Mama', title: 'Steady Hand',
      ability: 'steady', desc: 'Steady income — better fares',
      color: 0xf472b6, unlocked: true,
      bonuses: { scoreMult: 1.05, fareMult: 1.25, speed: 0, invFrames: 15 }
    },
    mayen: {
      id: 'mayen', name: 'Mayen Mata', title: 'Ladies First',
      ability: 'ladies', desc: 'Prefers women passengers — Aishat bonus',
      color: 0xec4899, unlocked: true,
      bonuses: { scoreMult: 1.05, aishatBonus: 200, speed: 0.05, invFrames: 10 }
    },
    uztaz: {
      id: 'uztaz', name: 'Uztaz', title: 'Respectful',
      ability: 'respect', desc: 'Careful with women — safe pickups',
      color: 0x22c55e, unlocked: true,
      bonuses: { scoreMult: 1.0, speed: -0.05, invFrames: 20, fareMult: 1.1 }
    },
    sani: {
      id: 'sani', name: 'Sani', title: 'Speed Demon',
      ability: 'aggressive', desc: 'Faster top speed — riskier',
      color: 0xef4444, unlocked: true,
      bonuses: { scoreMult: 1.08, speed: 0.35, invFrames: 5 }
    }
  },

  RADIO: [
    { id: 'freedom', name: 'Freedom Radio 99.5 FM' },
    { id: 'express', name: 'Express Radio 90.3 FM' },
    { id: 'arewa', name: 'Arewa Radio 93.1 FM' },
    { id: 'cool', name: 'Cool FM Kano 96.9' },
    { id: 'rahama', name: 'Rahama Radio 97.3 FM' },
    { id: 'wazobia', name: 'Wazobia FM Kano' },
    { id: 'vision', name: 'Vision FM 92.1' },
    { id: 'ashir', name: 'Radio Kano AM' }
  ],

  PAINTS: {
    classic: { id: 'classic', name: 'Classic Yellow', color: 0xfbbf24 },
    ruffneck: { id: 'ruffneck', name: 'Ruffneck Gold', color: 0xeab308 },
    sky: { id: 'sky', name: 'Sky Blue', color: 0x38bdf8 },
    forest: { id: 'forest', name: 'Forest Green', color: 0x22c55e },
    royal: { id: 'royal', name: 'Royal Purple', color: 0xa855f7 },
    ember: { id: 'ember', name: 'Ember Red', color: 0xef4444 },
    night: { id: 'night', name: 'Night Black', color: 0x1e293b }
  },

  ACHIEVEMENTS: [
    { id: 'first_km', name: 'First Kilometre', desc: 'Drive 1 km in a run', check: g => g.dist >= 1 },
    { id: 'fare_king', name: 'Fare King', desc: 'Score ₦3000 in a run', check: g => g.score >= 3000 },
    { id: 'combo_5', name: 'Combo Starter', desc: 'Reach 5x combo', check: g => g.combo >= 5 },
    { id: 'pax_10', name: 'Full Load', desc: 'Carry 10+ passengers total', check: g => g.totalPax >= 10 },
    { id: 'near_3', name: 'Close Call', desc: '3 near misses in a run', check: g => (g.nearMissCount || 0) >= 3 },
    { id: 'survivor', name: 'Survivor', desc: 'Use a Life Saver and finish', check: g => g.continuesLeft < 3 }
  ],

  MISSIONS: [
    { text: 'Drop 8 passengers', type: 'drop', target: 8 },
    { text: 'Drive 3 km', type: 'dist', target: 3 },
    { text: 'Score ₦1500', type: 'score', target: 1500 },
    { text: 'Pick 12 passengers', type: 'pax', target: 12 },
    { text: 'Near miss ×5', type: 'nearmiss', target: 5 },
    { text: 'Drop 5 with combo', type: 'drop', target: 5 }
  ]
};
