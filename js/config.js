// Kano Run - Game Configuration

export const STATE = {
  MENU: 'menu',
  PLAYING: 'playing',
  PAUSED: 'paused',
  GAME_OVER: 'gameover',
  ROUTES: 'routes',
  GARAGE: 'garage',
  DRESSING: 'dressing',
  RADIO: 'radio'
};

export const CONFIG = {
  GAME_NAME: 'Kano Run',
  GAME_SUBTITLE: 'Adaidaita Sahu',

  VERSION: '1.0.0',

  STARTING_LIVES: 3,
  STARTING_CAPACITY: 3,

  MAX_SPEED: 32,
  START_SPEED: 8,

  BASE_FARE: 50,
  COMBO_MAX: 5,

  ROUTES: [
    {
      id: 'kano-city',
      name: 'Kano City',
      description: 'Busy city streets, markets and dense traffic.',
      difficulty: 1
    },
    {
      id: 'sabongari',
      name: 'Sabon Gari',
      description: 'Commercial streets with heavy traffic and pedestrians.',
      difficulty: 2
    },
    {
      id: 'fagge',
      name: 'Fagge',
      description: 'Fast-moving urban traffic and busy roadside activity.',
      difficulty: 2
    },
    {
      id: 'dala',
      name: 'Dala',
      description: 'Historic Kano streets with tight roads and obstacles.',
      difficulty: 3
    },
    {
      id: 'tarauni',
      name: 'Tarauni',
      description: 'Longer roads with increasing traffic density.',
      difficulty: 3
    },
    {
      id: 'ungogo',
      name: 'Ungogo',
      description: 'Outer-city roads with mixed traffic and open stretches.',
      difficulty: 3
    }
  ],

  DISTRICTS: [
    'Kano City',
    'Sabon Gari',
    'Fagge',
    'Dala',
    'Kumbotso',
    'Nassarawa',
    'Gwale',
    'Tarauni',
    'Ungogo'
  ],

  PAINTS: [
    {
      id: 'yellow',
      name: 'Kano Yellow',
      color: '#eab308',
      price: 0
    },
    {
      id: 'green',
      name: 'Northern Green',
      color: '#16a34a',
      price: 500
    },
    {
      id: 'blue',
      name: 'Kano Blue',
      color: '#2563eb',
      price: 750
    },
    {
      id: 'red',
      name: 'Red Fire',
      color: '#dc2626',
      price: 1000
    },
    {
      id: 'black',
      name: 'Midnight',
      color: '#171717',
      price: 1500
    },
    {
      id: 'white',
      name: 'Clean White',
      color: '#f8fafc',
      price: 1800
    }
  ],

  DRIVERS: [
    {
      id: 'hassan',
      name: 'Hassan',
      title: 'City Runner',
      desc: 'Balanced driver for everyday Kano traffic.',
      color: '#f59e0b',
      capacity: 3
    },
    {
      id: 'kabiru',
      name: 'Kabiru',
      title: "The People's Driver",
      desc: 'Everyone wants to ride with him. +1 capacity.',
      color: '#84cc16',
      capacity: 4
    },
    {
      id: 'sani',
      name: 'Sani',
      title: 'Road Master',
      desc: 'Experienced on difficult roads. Better handling.',
      color: '#3b82f6',
      capacity: 3
    },
    {
      id: 'mustapha',
      name: 'Mustapha',
      title: 'Speed Runner',
      desc: 'Fast and aggressive. Higher top speed.',
      color: '#ef4444',
      capacity: 3
    }
  ],

  UPGRADES: {
    engine: {
      id: 'engine',
      name: 'Engine',
      description: 'Increase acceleration and top speed.',
      levels: [
        {
          level: 1,
          price: 0,
          bonus: 0
        },
        {
          level: 2,
          price: 1000,
          bonus: 0.1
        },
        {
          level: 3,
          price: 2500,
          bonus: 0.2
        },
        {
          level: 4,
          price: 5000,
          bonus: 0.35
        }
      ]
    },

    capacity: {
      id: 'capacity',
      name: 'Passenger Capacity',
      description: 'Carry more passengers and earn larger fares.',
      levels: [
        {
          level: 1,
          price: 0,
          capacity: 3
        },
        {
          level: 2,
          price: 1500,
          capacity: 4
        },
        {
          level: 3,
          price: 3500,
          capacity: 5
        },
        {
          level: 4,
          price: 7000,
          capacity: 6
        }
      ]
    },

    horn: {
      id: 'horn',
      name: 'Horn',
      description: 'Upgrade your horn for stronger traffic response.',
      levels: [
        {
          level: 1,
          price: 0,
          power: 1
        },
        {
          level: 2,
          price: 750,
          power: 1.25
        },
        {
          level: 3,
          price: 1800,
          power: 1.5
        }
      ]
    },

    handling: {
      id: 'handling',
      name: 'Handling',
      description: 'Improve steering response and lane control.',
      levels: [
        {
          level: 1,
          price: 0,
          bonus: 0
        },
        {
          level: 2,
          price: 1200,
          bonus: 0.15
        },
        {
          level: 3,
          price: 2800,
          bonus: 0.3
        },
        {
          level: 4,
          price: 5500,
          bonus: 0.5
        }
      ]
    }
  },

  TRAFFIC_TYPES: [
    {
      type: 'car',
      weight: 45
    },
    {
      type: 'keke',
      weight: 30
    },
    {
      type: 'police',
      weight: 10
    },
    {
      type: 'truck',
      weight: 8
    },
    {
      type: 'bus',
      weight: 7
    }
  ],

  TRAFFIC_COLORS: [
    '#dc2626',
    '#2563eb',
    '#16a34a',
    '#f8fafc',
    '#111827',
    '#f97316',
    '#a855f7',
    '#64748b'
  ],

  OBSTACLES: [
    {
      type: 'karota',
      name: 'KAROTA Checkpoint',
      danger: 0.7
    },
    {
      type: 'pothole',
      name: 'Pothole',
      danger: 0.55
    },
    {
      type: 'barrier',
      name: 'Road Barrier',
      danger: 0.8
    },
    {
      type: 'construction',
      name: 'Road Construction',
      danger: 0.75
    }
  ],

  PASSENGER_TYPES: [
    {
      id: 'worker',
      name: 'Worker',
      fareMultiplier: 1
    },
    {
      id: 'student',
      name: 'Student',
      fareMultiplier: 0.8
    },
    {
      id: 'business',
      name: 'Business Passenger',
      fareMultiplier: 1.4
    },
    {
      id: 'family',
      name: 'Family',
      fareMultiplier: 1.25
    },
    {
      id: 'visitor',
      name: 'Visitor',
      fareMultiplier: 1.5
    }
  ],

  MISSIONS: [
    {
      id: 'first-fare',
      title: 'First Fare',
      description: 'Pick up and successfully deliver your first passenger.',
      target: 1,
      reward: 100
    },
    {
      id: 'five-passengers',
      title: 'Busy Driver',
      description: 'Deliver five passengers.',
      target: 5,
      reward: 300
    },
    {
      id: 'distance-1000',
      title: 'Kano Cruiser',
      description: 'Drive 1,000 metres.',
      target: 1000,
      reward: 500
    },
    {
      id: 'distance-5000',
      title: 'Long Haul',
      description: 'Drive 5,000 metres.',
      target: 5000,
      reward: 1500
    },
    {
      id: 'near-misses',
      title: 'Traffic Master',
      description: 'Perform ten near misses without crashing.',
      target: 10,
      reward: 750
    },
    {
      id: 'coins',
      title: 'Street Collector',
      description: 'Collect twenty road coins.',
      target: 20,
      reward: 500
    }
  ],

  DAILY_MISSIONS: [
    {
      id: 'daily-distance',
      title: 'Daily Kano Drive',
      description: 'Drive 2,000 metres today.',
      target: 2000,
      reward: 750
    },
    {
      id: 'daily-fares',
      title: 'Daily Passenger Run',
      description: 'Complete ten passenger trips.',
      target: 10,
      reward: 1000
    },
    {
      id: 'daily-coins',
      title: 'Daily Collector',
      description: 'Collect fifteen coins.',
      target: 15,
      reward: 500
    }
  ],

  RADIO_STATIONS: [
    'Kano Run Radio',
    'Arewa FM',
    'City Drive',
    'Hausa Beats',
    'Northern Traffic',
    'Kano Street Mix'
  ],

  BILLBOARDS: [
    {
      text: 'KANO RUN',
      color: '#fbbf24'
    },
    {
      text: 'Sannu Driver',
      color: '#16a34a'
    },
    {
      text: 'Kano City',
      color: '#2563eb'
    },
    {
      text: 'Arewa',
      color: '#dc2626'
    },
    {
      text: 'Safe Driving',
      color: '#f8fafc'
    },
    {
      text: 'Adaidaita Sahu',
      color: '#eab308'
    }
  ],

  DRIVER_REACTIONS: {
    start: [
      'Bismillah. Kano Run!',
      'Mu tafi!',
      'Let us move.',
      'Kano streets, here we come.'
    ],

    nearMiss: [
      'Kai! That was close.',
      'Sannu! Watch the road.',
      'Kai, kai, kai!',
      'That one nearly finished us.',
      'Easy, easy!'
    ],

    crash: [
      'Ah! Watch the road.',
      'Kai! What happened?',
      'That was a bad one.',
      'Need to drive carefully.',
      'Subhanallah!'
    ],

    checkpoint: [
      'KAROTA ahead.',
      'Watch the checkpoint.',
      'Slow down near the officers.'
    ],

    passenger: [
      'Welcome aboard.',
      'Sannu. Where are you going?',
      'Hop in.',
      'Let us get you there.'
    ],

    dropoff: [
      'Mun isa.',
      'We have arrived.',
      'Thank you.',
      'Safe journey.'
    ]
  },

  WEATHER: [
    {
      id: 'clear',
      name: 'Clear',
      visibility: 1
    },
    {
      id: 'harmattan',
      name: 'Harmattan',
      visibility: 0.72
    },
    {
      id: 'dust',
      name: 'Dusty',
      visibility: 0.6
    },
    {
      id: 'rain',
      name: 'Rain',
      visibility: 0.65
    },
    {
      id: 'night',
      name: 'Night',
      visibility: 0.55
    }
  ],

  DAY_LENGTH_MS: 120000,

  SKY: {
    DAY_TOP: '#55a8d9',
    DAY_BOTTOM: '#d9edf4',
    SUNSET_TOP: '#d8794e',
    SUNSET_BOTTOM: '#f4c27b',
    NIGHT_TOP: '#071426',
    NIGHT_BOTTOM: '#263c58'
  },

  STORAGE_KEYS: {
    BEST_SCORE: 'kano-run-best',
    MONEY: 'kano-run-money',
    CAPACITY: 'kano-run-capacity',
    PAINT: 'kano-run-paint',
    DRIVER: 'kano-run-driver',
    ENGINE: 'kano-run-engine',
    HORN: 'kano-run-horn',
    HANDLING: 'kano-run-handling',
    DAILY_MISSION: 'kano-run-daily-mission'
  }
};

export default CONFIG;