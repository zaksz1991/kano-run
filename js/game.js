// Game configuration and constants
export const CONFIG = {
  LANES: 3,
  MAX_CAPACITY_BASE: 3,

  PAINTS: {
    classic: { body: '#fbbf24', roof: '#fde047', accent: '#ca8a04', name: 'Classic Yellow', price: 0 },
    green: { body: '#22c55e', roof: '#4ade80', accent: '#16a34a', name: 'Kano Green', price: 950 },
    blue: { body: '#3b82f6', roof: '#60a5fa', accent: '#2563eb', name: 'Arewa Blue', price: 950 },
    white: { body: '#f1f5f9', roof: '#e2e8f0', accent: '#94a3b8', name: 'Clean White', price: 750 },
    red: { body: '#ef4444', roof: '#f87171', accent: '#dc2626', name: 'Emir Red', price: 1150 },
    black: { body: '#1e293b', roof: '#334155', accent: '#0f172a', name: 'Night Black', price: 1350 },
    purple: { body: '#a855f7', roof: '#c084fc', accent: '#7e22ce', name: 'Royal Purple', price: 1600 }
  },

  DRIVERS: {
    musa: {
      id: 'musa',
      name: 'Musa',
      title: 'The Veteran',
      desc: '20 years on Kano roads. Steady & experienced.',
      color: '#eab308',
      bonus: { capacity: 0, speed: 0, horn: 0 },
      price: 0
    },
    aisha: {
      id: 'aisha',
      name: 'Aisha',
      title: 'Queen of Panshekara',
      desc: 'Fast negotiator. Better passenger tips.',
      color: '#ec4899',
      bonus: { capacity: 0, speed: 0, horn: 0, fareBonus: 0.15 },
      price: 1200
    },
    sani: {
      id: 'sani',
      name: 'Sani',
      title: 'Night Rider',
      desc: 'Loves night runs. Slight speed boost.',
      color: '#3b82f6',
      bonus: { capacity: 0, speed: 0.4, horn: 0 },
      price: 1500
    },
    bala: {
      id: 'bala',
      name: 'Bala',
      title: 'The Horn Master',
      desc: 'Powerful horn. Clears traffic better.',
      color: '#22c55e',
      bonus: { capacity: 0, speed: 0, horn: 1 },
      price: 1800
    },
    hadiza: {
      id: 'hadiza',
      name: 'Hadiza',
      title: 'Market Queen',
      desc: 'Extra passenger capacity. Perfect for busy routes.',
      color: '#a855f7',
      bonus: { capacity: 1, speed: 0, horn: 0 },
      price: 2000
    },
    usman: {
      id: 'usman',
      name: 'Usman',
      title: 'Sabon Gari Hustler',
      desc: 'Thrives in chaos. Bonus score on Sabon Gari route.',
      color: '#f97316',
      bonus: { capacity: 0, speed: 0.2, horn: 0, fareBonus: 0.08 },
      price: 1600
    },
    zainab: {
      id: 'zainab',
      name: 'Zainab',
      title: 'Kurmi Trader',
      desc: 'Knows every market. Higher drop rewards.',
      color: '#14b8a6',
      bonus: { capacity: 0, speed: 0, horn: 0, fareBonus: 0.20 },
      price: 2200
    },
    ibrahim: {
      id: 'ibrahim',
      name: 'Ibrahim',
      title: 'Dala Hill Climber',
      desc: 'Strong engine. Better on long distance runs.',
      color: '#ef4444',
      bonus: { capacity: 0, speed: 0.6, horn: 0 },
      price: 1900
    },
    fatima: {
      id: 'fatima',
      name: 'Fatima',
      title: 'Student Express',
      desc: 'Young & quick. Slightly higher top speed.',
      color: '#8b5cf6',
      bonus: { capacity: 0, speed: 0.5, horn: 0 },
      price: 1400
    },
    yusuf: {
      id: 'yusuf',
      name: 'Yusuf',
      title: 'KAROTA Avoider',
      desc: 'Expert at dodging enforcers. Longer invincibility.',
      color: '#06b6d4',
      bonus: { capacity: 0, speed: 0, horn: 0.5 },
      price: 2100
    },
    amina: {
      id: 'amina',
      name: 'Amina',
      title: 'Zoo Road Regular',
      desc: 'Loves long stretches. Bonus on Zoo/Hotoro route.',
      color: '#f43f5e',
      bonus: { capacity: 0, speed: 0.3, horn: 0, fareBonus: 0.10 },
      price: 1700
    },
    kabiru: {
      id: 'kabiru',
      name: 'Kabiru',
      title: "The People's Driver",
      desc: 'Everyone wants to ride with him. +1 capacity.',
      color: '#84cc16',
      bonus: { capacity: 1, speed: 0, horn: 0 },
      price: 2300
    },
    rukayya: {
      id: 'rukayya',
      name: 'Rukayya',
      title: 'Harmattan Queen',
      desc: 'Unfazed by dust. Better performance in bad weather.',
      color: '#d946ef',
      bonus: { capacity: 0, speed: 0.25, horn: 0, fareBonus: 0.12 },
      price: 2000
    }
  },

  DRIVER_STYLES: {
    classic: { name: 'Classic Cap', price: 0, color: '#1e293b' },
    kaftan: { name: 'White Kaftan', price: 600, color: '#f8fafc' },
    jalabiya: { name: 'Blue Jalabiya', price: 800, color: '#3b82f6' },
    modern: { name: 'Modern Jacket', price: 900, color: '#0f172a' },
    sport: { name: 'Sport Cap', price: 500, color: '#ef4444' }
  },

  UPGRADES: {
    capacity: {
      name: 'Extra Seat',
      desc: '+1 passenger capacity',
      levels: [3, 4, 5],
      prices: [0, 1300, 2700],
      key: 'kanoCap'
    },
    speed: {
      name: 'Engine Tune',
      desc: 'Higher top speed',
      levels: [0, 1, 2],
      prices: [0, 1600, 3200],
      key: 'kanoSpeed'
    },
    horn: {
      name: 'Power Horn',
      desc: 'Wider clear + longer invuln',
      levels: [0, 1, 2],
      prices: [0, 1100, 2400],
      key: 'kanoHorn'
    }
  },

  ROUTES: {
    panshekara: {
      id: 'panshekara',
      name: 'Panshekara Route',
      description: 'Very busy corridor, heavy passenger traffic',
      difficulty: 1.15,
      landmarks: ['Panshekara Market', 'Kumbotso Junction', 'Sharada', 'Hotoro Roundabout', 'Zoo Road Flyover', 'Naibawa'],
      baseFare: 150
    },
    kumbotso: {
      id: 'kumbotso',
      name: 'Kumbotso Route',
      description: 'Industrial + residential, medium-heavy traffic',
      difficulty: 1.05,
      landmarks: ['Kumbotso', 'Challawa', 'Sharada Industrial', 'Naibawa', 'Yankaba'],
      baseFare: 140
    },
    sabongari: {
      id: 'sabongari',
      name: 'Sabon Gari Route',
      description: 'Commercial heart of Kano — chaotic and profitable',
      difficulty: 1.3,
      landmarks: ['Sabon Gari Market', 'Kantin Kwari', 'Wapa', 'France Road', 'Ado Bayero Mall', 'Triumph'],
      baseFare: 170
    },
    citycenter: {
      id: 'citycenter',
      name: 'City Centre / Emir Palace',
      description: 'Historic core + heavy KAROTA presence',
      difficulty: 1.2,
      landmarks: ["Emir's Palace", 'Kurmi Market', 'Dala Hill', 'Kofar Mata Dye Pits', 'Gidan Rumfa', "Kofar Na'isa", 'City Walls'],
      baseFare: 180
    },
    zoo: {
      id: 'zoo',
      name: 'Zoo Road / Hotoro',
      description: 'Long busy stretch, good for distance runs',
      difficulty: 1.0,
      landmarks: ['Zoo Road', 'Hotoro', 'Naibawa', 'Kawo', 'Ungogo'],
      baseFare: 140
    },
    tarauni: {
      id: 'tarauni',
      name: 'Tarauni / Hotoro North',
      description: 'Dense residential + market traffic',
      difficulty: 1.1,
      landmarks: ['Tarauni Market', 'Hotoro North', 'Kawaji', 'Yan Awaki', 'Gama'],
      baseFare: 145
    },
    nassarawa: {
      id: 'nassarawa',
      name: 'Nassarawa GRA / Airport Road',
      description: 'Mix of elite and commercial traffic',
      difficulty: 1.05,
      landmarks: ['Nassarawa GRA', 'Airport Road', 'Katsina Road', 'Badawa', 'Kurnar Asabe'],
      baseFare: 160
    },
    gwale: {
      id: 'gwale',
      name: 'Gwale / Kofar Ruwa',
      description: 'Old city edge, very busy markets',
      difficulty: 1.2,
      landmarks: ['Gwale', 'Kofar Ruwa', 'Kofar Wambai', 'Jakara', 'Mandawari'],
      baseFare: 155
    },
    fajir: {
      id: 'fajir',
      name: 'Fagge / Kantin Kwari',
      description: 'Textile market chaos — high reward',
      difficulty: 1.35,
      landmarks: ['Kantin Kwari', 'Fagge', 'Wapa', 'France Road', 'Sabon Gari'],
      baseFare: 175
    },
    dakata: {
      id: 'dakata',
      name: 'Dakata / Yankaba',
      description: 'Eastern corridor, growing traffic',
      difficulty: 1.0,
      landmarks: ['Dakata', 'Yankaba', 'Naibawa', 'Hotoro', 'Sharada'],
      baseFare: 135
    },
    rijiyarzaki: {
      id: 'rijiyarzaki',
      name: 'Rijiyar Zaki / Kabuga',
      description: 'Western approach, mixed traffic',
      difficulty: 0.95,
      landmarks: ['Rijiyar Zaki', 'Kabuga', 'Jaen', 'Dorayi', 'Unguwa Uku'],
      baseFare: 130
    },
    kofarmata: {
      id: 'kofarmata',
      name: 'Kofar Mata / Dye Pits',
      description: 'Tourist + local traffic, tight roads',
      difficulty: 1.15,
      landmarks: ['Kofar Mata Dye Pits', 'Kurmi Market', 'Dala Hill', "Emir's Palace", 'Jakara'],
      baseFare: 165
    },
    bungudu: {
      id: 'bungudu',
      name: 'Bompai / Industrial Layout',
      description: 'Factory area, trucks + kekes',
      difficulty: 1.1,
      landmarks: ['Bompai', 'Industrial Layout', 'Sharada', 'Challawa', 'Hotoro'],
      baseFare: 140
    },
    yanawaki: {
      id: 'yanawaki',
      name: 'Yan Awaki / Gama',
      description: 'Very dense residential, constant stops',
      difficulty: 1.25,
      landmarks: ['Yan Awaki', 'Gama', 'Tarauni', 'Kawaji', 'Hotoro North'],
      baseFare: 150
    },
    unguwauku: {
      id: 'unguwauku',
      name: 'Unguwa Uku / Dorayi',
      description: 'Southern corridor, busy evenings',
      difficulty: 1.05,
      landmarks: ['Unguwa Uku', 'Dorayi', 'Jaen', 'Kabuga', 'Rijiyar Zaki'],
      baseFare: 140
    }
  },

  RADIO_STATIONS: [
    { id: 'freedom', name: 'Freedom Radio 99.5 FM', freq: '99.5' },
    { id: 'arewa', name: 'Arewa Radio 93.1 FM', freq: '93.1' },
    { id: 'cool', name: 'Cool FM Kano', freq: '96.9' },
    { id: 'dala', name: 'Dala FM 88.5', freq: '88.5' },
    { id: 'wazobia', name: 'Wazobia 95.1 FM Kano', freq: '95.1' },
    { id: 'liberty', name: 'Liberty Radio 103.3', freq: '103.3' },
    { id: 'pyramid', name: 'Pyramid FM Kano', freq: '102.7' }
  ],

  NEGOTIATION: {
    passenger: [
      "Driver, how much to the junction?",
      "I will pay ₦100 only!",
      "Last week it was cheaper!",
      "Abeg reduce am small",
      "You wan collect all my money?",
      "I no get change o",
      "Drop me for the next stop"
    ],
    driver: [
      "My friend, ₦150 is the price",
      "Fuel is expensive these days",
      "Okay, enter make we go",
      "No change? I go find am",
      "You wan drop? Pay first!",
      "KAROTA dey around, no waste time",
      "God go bless you, enter"
    ],
    disagreement: [
      "I no go pay that amount!",
      "Driver you dey craze?",
      "I go report you to KAROTA!",
      "Take this ₦80 or leave am",
      "Last warning, pay or come down!"
    ]
  },

  LANDMARKS: [
    'Kurmi Market', 'Dala Hill', "Emir's Palace", 'Kofar Mata Dye Pits',
    'Ancient City Walls', 'Sabon Gari', "Kofar Na'isa Gate", 'Gidan Rumfa',
    'Ado Bayero Mall', 'Sani Abacha Stadium', 'Bayero University',
    'Kofar Wambai', 'Kofar Mata Gate', 'Kano Municipal', 'Zoo Road Flyover',
    'Hotoro Roundabout', 'Naibawa Motor Park', 'Kantin Kwari Market',
    'Sharada Industrial Area', 'Kumbotso Bridge', 'Panshekara Junction',
    'Tarauni Market', 'Yan Awaki', 'Gama Quarters', 'Kabuga Junction',
    'Rijiyar Zaki', 'Bompai', 'Kofar Ruwa', 'Jakara River',
    'Murtala Mohammed Library', 'Kano State History Museum',
    'Triumph Publishing Company', 'Kano City Walls Restoration',
    'Gandun Albasa', 'Kofar Nassarawa', 'Dorayi Quarters', 'Jaen',
    'Unguwa Uku', 'Hotoro North', 'Kawaji', 'Yankaba',
    'Challawa Industrial', 'Wudil Road Junction', 'Gwarzo Road',
    'Zaria Road', 'Katsina Road', 'Hadejia Road',
    'Kano Emirate Council', 'Gidan Makama Museum', 'Kofar Mazugal',
    'Sabon Titi', 'Mandawari', 'Yakasai', 'Dakata'
  ],

  MISSIONS: [
    { id: 'pax5', text: 'Carry 5 passengers', target: 5, reward: 500 },
    { id: 'dist3', text: 'Drive 3.5 km', target: 3.5, reward: 450 },
    { id: 'score2k', text: 'Earn ₦3000 this run', target: 3000, reward: 650 },
    { id: 'horn3', text: 'Use horn 5 times', target: 5, reward: 350 },
    { id: 'drop10', text: 'Drop 10 passengers', target: 10, reward: 600 },
    { id: 'avoid_karota', text: 'Avoid KAROTA for 2 km', target: 2, reward: 700 }
  ],

  DAILY_MISSIONS: [
    { id: 'daily_pax', text: 'Carry 12 passengers today', target: 12, reward: 800, type: 'pax' },
    { id: 'daily_dist', text: 'Drive 8 km today', target: 8, reward: 750, type: 'dist' },
    { id: 'daily_score', text: 'Earn ₦6000 in one run', target: 6000, reward: 900, type: 'score' },
    { id: 'daily_drop', text: 'Drop 15 passengers today', target: 15, reward: 850, type: 'drop' },
    { id: 'daily_horn', text: 'Use horn 12 times today', target: 12, reward: 600, type: 'horn' },
    { id: 'daily_route', text: 'Complete a run on 3 different routes', target: 3, reward: 1000, type: 'routes' }
  ],

  BILLBOARDS: [
    { id: 'bb1', brand: 'Centre of Commerce', text: 'Centre of Commerce 🇳🇬', color: '#eab308', active: true },
    { id: 'bb2', brand: 'Arewa Fresh', text: 'Arewa Fresh – Drink Local', color: '#22c55e', active: true },
    { id: 'bb3', brand: 'Kano Solid Minerals', text: 'Kano Solid Minerals', color: '#3b82f6', active: true },
    { id: 'bb4', brand: 'Dala Cement', text: 'Dala Cement – Build Strong', color: '#f97316', active: true },
    { id: 'bb5', brand: 'Freedom Radio', text: 'Freedom Radio 99.5 FM', color: '#a855f7', active: true }
  ],

  SPONSORED_LIVERIES: {
    classic: { name: 'Classic Yellow', price: 0, body: '#fbbf24', roof: '#fde047', accent: '#ca8a04' },
    arewa: { name: 'Arewa Fresh Green', price: 0, body: '#16a34a', roof: '#4ade80', accent: '#15803d', sponsored: true },
    dala: { name: 'Dala Cement Orange', price: 0, body: '#ea580c', roof: '#fb923c', accent: '#c2410c', sponsored: true },
    freedom: { name: 'Freedom Radio Purple', price: 0, body: '#7e22ce', roof: '#c084fc', accent: '#6b21a8', sponsored: true }
  },

  STREAK: {
    rewards: [0, 200, 400, 700, 1100, 1600, 2200]
  },

  KAROTA_LINES: {
    officer: [
      "Park well! Where is your particulars?",
      "This keke no get paper?",
      "You dey overspeed!",
      "Come down make we talk!",
      "Your road worthiness expire!"
    ],
    driver: [
      "Officer I dey go market!",
      "I get all my papers!",
      "Abeg no waste my time!",
      "I just renew am last week!",
      "Oga wetin I do?"
    ],
    quarrel: [
      "You this KAROTA people too much!",
      "Every day na checkpoint!",
      "I no go give you anything!",
      "Una only dey worry poor man!",
      "God go judge una!"
    ]
  },

  PASSENGER_TYPES: [
    { id: 'worker', label: 'Worker', color: '#64748b', fareMult: 1.0, gender: 'male' },
    { id: 'business', label: 'Business Man', color: '#1e40af', fareMult: 1.25, gender: 'male' },
    { id: 'hijab', label: 'Hajiya', color: '#0d9488', fareMult: 1.1, gender: 'female' },
    { id: 'lady', label: 'Lady', color: '#ec4899', fareMult: 1.15, gender: 'female' },
    { id: 'youth', label: 'Youth', color: '#8b5cf6', fareMult: 0.95, gender: 'male' },
    { id: 'trader', label: 'Trader', color: '#d97706', fareMult: 1.2, gender: 'male' },
    { id: 'girl', label: 'Young Lady', color: '#f472b6', fareMult: 1.05, gender: 'female' },
    { id: 'lowpay', label: 'No Change', color: '#f87171', fareMult: 0.25, gender: 'female', lowPay: true },
    { id: 'free', label: 'Abeg Free', color: '#fb7185', fareMult: 0.0, gender: 'female', lowPay: true }
  ],

  VIP_LINES: [
    "Big man coming! Treat him well!",
    "This one go pay well!",
    "VIP passenger, no wahala!",
    "Oga level passenger!"
  ],

  DRIVER_REACTIONS: {
    pickup: [
      "Enter, my friend!", "God bless you!", "Wazobia!", "Let's go!",
      "One more!", "Kano style!", "Sharp sharp!"
    ],
    drop: [
      "Thank you!", "Safe journey!", "Come again!", "Next passenger!",
      "Allah ya sakawa!", "Oya next!"
    ],
    nearMiss: [
      "Almost!", "Close one!", "Watch it!", "Haba!", "Too close!"
    ],
    combo: [
      "We are on fire!", "Keep it coming!", "Kano no dey carry last!",
      "This is how we roll!", "Unstoppable!"
    ],
    crash: [
      "Astaghfirullah!", "Not again!", "Why me?!", "Traffic in this place!"
    ]
  },

  WEATHER: {
    clear: '☀️ Clear',
    dust: '🌬️ Harmattan Dust',
    haze: '🌫️ Haze'
  }
};

export const STATE = {
  START: 0,
  PLAY: 1,
  OVER: 2,
  GARAGE: 3,
  ROUTE_SELECT: 4,
  EVENT: 5
};