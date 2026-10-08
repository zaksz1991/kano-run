// Game configuration and constants
export const CONFIG = {
  LANES: 3,
  MAX_CAPACITY_BASE: 3,

  PAINTS: {
    classic: { body: '#fbbf24', roof: '#fde047', accent: '#ca8a04', name: 'Classic Yellow', price: 0 },
    green:   { body: '#22c55e', roof: '#4ade80', accent: '#16a34a', name: 'Kano Green', price: 950 },
    blue:    { body: '#3b82f6', roof: '#60a5fa', accent: '#2563eb', name: 'Arewa Blue', price: 950 },
    white:   { body: '#f1f5f9', roof: '#e2e8f0', accent: '#94a3b8', name: 'Clean White', price: 750 },
    red:     { body: '#ef4444', roof: '#f87171', accent: '#dc2626', name: 'Emir Red', price: 1150 },
    black:   { body: '#1e293b', roof: '#334155', accent: '#0f172a', name: 'Night Black', price: 1350 },
    purple:  { body: '#a855f7', roof: '#c084fc', accent: '#7e22ce', name: 'Royal Purple', price: 1600 }
  },

  // Driver appearance (Dressing mode)
  // Selectable drivers (characters)
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
      ability: 'dust_proof',
      price: 2000
    },
    baba: {
      id: 'baba', name: 'Baba', title: 'The Old Master',
      desc: 'Drives carefully. Safer, slightly slower.',
      color: '#a8a29e', price: 1100,
      bonus: { capacity: 0, speed: -0.2, horn: 0 },
      ability: 'careful'
    },
    mama: {
      id: 'mama', name: 'Mama', title: 'Mama Keke',
      desc: 'Trusted by passengers. Better fares.',
      color: '#f472b6', price: 1250,
      bonus: { capacity: 0, speed: -0.1, horn: 0, fareBonus: 0.18 },
      ability: 'trusted'
    },
    mayen: {
      id: 'mayen', name: 'Mayen Mata', title: 'Mayen Mata',
      desc: 'Only likes to carry women.',
      color: '#e11d48', price: 2600,
      bonus: { capacity: 0, speed: 0.2, horn: 0, fareBonus: 0.08 },
      ability: 'women_only'
    },
    uztaz: {
      id: 'uztaz', name: 'Uztaz', title: 'Uztaz',
      desc: 'Careful with women. Avoids low-pay drama.',
      color: '#0369a1', price: 2400,
      bonus: { capacity: 0, speed: 0.1, horn: 0, fareBonus: 0.05 },
      ability: 'careful_women'
    },
    ruffneck: {
      id: 'ruffneck', name: 'Ruffneck', title: 'Ruffneck',
      desc: 'Best overall. Max speed, horn, capacity & fares. Signature driver.',
      color: '#e11d48', price: 0,
      bonus: { capacity: 2, speed: 1.2, horn: 2, fareBonus: 0.30 },
      ability: 'ruffneck'
    }
  },

  DRIVER_STYLES: {
    classic: { name: 'Classic Cap', price: 0, color: '#1e293b' },
    kaftan:  { name: 'White Kaftan', price: 600, color: '#f8fafc' },
    jalabiya:{ name: 'Blue Jalabiya', price: 800, color: '#3b82f6' },
    modern:  { name: 'Modern Jacket', price: 900, color: '#0f172a' },
    sport:   { name: 'Sport Cap', price: 500, color: '#ef4444' }
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

// Popular & busy Kano routes
  ROUTES: {
    panshekara: {
      id: 'panshekara',
      name: 'Panshekara Route',
      description: 'Very busy southern corridor, heavy keke and passenger traffic',
      difficulty: 1.15,
      landmarks: ['Panshekara Market', 'Panshekara Junction', 'Kumbotso Bridge', 'Sharada', 'Naibawa'],
      baseFare: 150
    },
    kumbotso: {
      id: 'kumbotso',
      name: 'Kumbotso Route',
      description: 'LGA HQ stretch — industrial + residential mix',
      difficulty: 1.05,
      landmarks: ['Kumbotso Town', 'Challawa', 'Sharada Industrial', 'Naibawa Motor Park', 'Yankaba'],
      baseFare: 140
    },
    sabongari: {
      id: 'sabongari',
      name: 'Sabon Gari Route',
      description: 'Commercial heart — chaotic, profitable, dense traffic',
      difficulty: 1.3,
      landmarks: ['Sabon Gari Market', 'Kantin Kwari', 'Wapa', 'France Road', 'Ado Bayero Mall'],
      baseFare: 170
    },
    citycenter: {
      id: 'citycenter',
      name: 'City Centre / Emir Palace',
      description: 'Historic core — heavy KAROTA, landmarks, tourists',
      difficulty: 1.2,
      landmarks: ["Emir's Palace", 'Kurmi Market', 'Dala Hill', 'Kofar Mata', 'Gidan Rumfa'],
      baseFare: 180
    },
    zoo: {
      id: 'zoo',
      name: 'Zoo Road / Hotoro',
      description: 'Long busy artery — distance runs and flyover traffic',
      difficulty: 1.0,
      landmarks: ['Zoo Road Flyover', 'Hotoro Roundabout', 'Naibawa', 'Kawo', 'Ungogo'],
      baseFare: 140
    },
    tarauni: {
      id: 'tarauni',
      name: 'Tarauni / Hotoro North',
      description: 'Dense residential + market traffic',
      difficulty: 1.1,
      landmarks: ['Tarauni Market', 'Hotoro North', 'Kawaji', 'Yan Awaki', 'Gama Quarters'],
      baseFare: 145
    },
    nassarawa: {
      id: 'nassarawa',
      name: 'Nassarawa GRA / Airport Road',
      description: 'GRA + airport corridor — smoother but policed',
      difficulty: 0.95,
      landmarks: ['Nassarawa GRA', 'Airport Road', 'Silver Jubilee', 'Triquia', 'Farm Centre'],
      baseFare: 160
    },
    gwale: {
      id: 'gwale',
      name: 'Gwale / Kofar Ruwa',
      description: 'Old city edge — markets and city gates',
      difficulty: 1.1,
      landmarks: ['Gwale', 'Kofar Ruwa', 'Jakara', 'Mandawari', 'Yakasai'],
      baseFare: 145
    },
    fajir: {
      id: 'fajir',
      name: 'Fagge / Kantin Kwari',
      description: 'Textile and trade hub — very busy daytime',
      difficulty: 1.25,
      landmarks: ['Fagge', 'Kantin Kwari Market', 'Wapa', 'Sabon Titi', 'Triumph'],
      baseFare: 165
    },
    dakata: {
      id: 'dakata',
      name: 'Dakata / Yankaba',
      description: 'Eastern residential belt — steady passenger flow',
      difficulty: 1.0,
      landmarks: ['Dakata', 'Yankaba', 'Hotoro', 'Kawaji', 'Naibawa'],
      baseFare: 135
    },
    rijiyarzaki: {
      id: 'rijiyarzaki',
      name: 'Rijiyar Zaki / Kabuga',
      description: 'Western approach — Kabuga junction pressure',
      difficulty: 1.05,
      landmarks: ['Rijiyar Zaki', 'Kabuga Junction', 'BUK Road', 'Janbulo', 'Goron Dutse'],
      baseFare: 140
    },
    kofarmata: {
      id: 'kofarmata',
      name: 'Kofar Mata / Dye Pits',
      description: 'Heritage tourism + dye pits traffic',
      difficulty: 1.1,
      landmarks: ['Kofar Mata Gate', 'Kofar Mata Dye Pits', 'Kurmi Market', 'City Walls', 'Dala'],
      baseFare: 155
    },
    bungudu: {
      id: 'bungudu',
      name: 'Bompai / Industrial Layout',
      description: 'Industrial layout — workers and trucks',
      difficulty: 1.05,
      landmarks: ['Bompai', 'Industrial Layout', 'Sharada', 'Challawa', 'Zoo Road'],
      baseFare: 140
    },
    yanawaki: {
      id: 'yanawaki',
      name: 'Yan Awaki / Gama',
      description: 'Busy residential corridors east of centre',
      difficulty: 1.1,
      landmarks: ['Yan Awaki', 'Gama Quarters', 'Tarauni', 'Hotoro North', 'Kawaji'],
      baseFare: 140
    },
    unguwauku: {
      id: 'unguwauku',
      name: 'Unguwa Uku / Dorayi',
      description: 'South-west residential — growing traffic',
      difficulty: 1.0,
      landmarks: ['Unguwa Uku', 'Dorayi', 'Jaen', 'Kabuga', 'Rijiyar Zaki'],
      baseFare: 135
    },
    // ——— expanded to ~50 real Kano corridors ———
    naibawa: {
      id: 'naibawa',
      name: 'Naibawa Motor Park Route',
      description: 'Major park — intercity and intra-city loading',
      difficulty: 1.2,
      landmarks: ['Naibawa Motor Park', 'Hotoro', 'Panshekara Junction', 'Zoo Road', 'Yankaba'],
      baseFare: 150
    },
    sharada: {
      id: 'sharada',
      name: 'Sharada Industrial Route',
      description: 'Factories and worker shifts — peak morning/evening',
      difficulty: 1.1,
      landmarks: ['Sharada Industrial', 'Challawa', 'Kumbotso', 'Bompai', 'Zoo Road'],
      baseFare: 140
    },
    challawa: {
      id: 'challawa',
      name: 'Challawa Route',
      description: 'Industrial south — trucks and keke mix',
      difficulty: 1.05,
      landmarks: ['Challawa Industrial', 'Sharada', 'Kumbotso', 'Panshekara', 'Naibawa'],
      baseFare: 135
    },
    kawaji: {
      id: 'kawaji',
      name: 'Kawaji Route',
      description: 'Residential east — school and market runs',
      difficulty: 1.0,
      landmarks: ['Kawaji', 'Hotoro North', 'Yankaba', 'Dakata', 'Gama'],
      baseFare: 130
    },
    jaen: {
      id: 'jaen',
      name: 'Jaen Route',
      description: 'South-west quarters — steady local traffic',
      difficulty: 0.95,
      landmarks: ['Jaen', 'Dorayi', 'Unguwa Uku', 'Kabuga', 'Rijiyar Zaki'],
      baseFare: 130
    },
    dorayi: {
      id: 'dorayi',
      name: 'Dorayi Route',
      description: 'Expanding residential — evening peak',
      difficulty: 1.0,
      landmarks: ['Dorayi Quarters', 'Jaen', 'Unguwa Uku', 'Kabuga Junction', 'BUK'],
      baseFare: 135
    },
    kabuga: {
      id: 'kabuga',
      name: 'Kabuga Junction Route',
      description: 'Critical junction — congestion and police checks',
      difficulty: 1.15,
      landmarks: ['Kabuga Junction', 'Rijiyar Zaki', 'BUK Road', 'Goron Dutse', 'Janbulo'],
      baseFare: 145
    },
    buk: {
      id: 'buk',
      name: 'BUK / Bayero University Route',
      description: 'Campus traffic — students and staff peaks',
      difficulty: 1.0,
      landmarks: ['Bayero University', 'BUK Road', 'Kabuga', 'Rijiyar Zaki', 'New Campus'],
      baseFare: 140
    },
    hotoro: {
      id: 'hotoro',
      name: 'Hotoro Roundabout Route',
      description: 'Major node linking Zoo Road and east Kano',
      difficulty: 1.15,
      landmarks: ['Hotoro Roundabout', 'Zoo Road', 'Naibawa', 'Tarauni', 'Yankaba'],
      baseFare: 145
    },
    zaria: {
      id: 'zaria',
      name: 'Zaria Road Route',
      description: 'Southern highway approach — long distance feel',
      difficulty: 1.05,
      landmarks: ['Zaria Road', 'Panshekara', 'Kumbotso', 'Naibawa', 'Challawa'],
      baseFare: 150
    },
    katsina: {
      id: 'katsina',
      name: 'Katsina Road Route',
      description: 'North-west corridor toward Katsina',
      difficulty: 1.0,
      landmarks: ['Katsina Road', 'Kabuga', 'Rijiyar Zaki', 'Goron Dutse', 'Dala'],
      baseFare: 145
    },
    hadejia: {
      id: 'hadejia',
      name: 'Hadejia Road Route',
      description: 'Eastern approach — markets and motor parks',
      difficulty: 1.05,
      landmarks: ['Hadejia Road', 'Yankaba', 'Dakata', 'Hotoro', 'Naibawa'],
      baseFare: 140
    },
    gwarzo: {
      id: 'gwarzo',
      name: 'Gwarzo Road Route',
      description: 'Western road — intercity and local mix',
      difficulty: 1.0,
      landmarks: ['Gwarzo Road', 'Kabuga', 'BUK', 'Rijiyar Zaki', 'Janbulo'],
      baseFare: 140
    },
    wudil: {
      id: 'wudil',
      name: 'Wudil Road Junction',
      description: 'South-east junction — market days heavy',
      difficulty: 1.05,
      landmarks: ['Wudil Road Junction', 'Yankaba', 'Dakata', 'Hotoro', 'Naibawa'],
      baseFare: 140
    },
    gandun: {
      id: 'gandun',
      name: 'Gandun Albasa Route',
      description: 'Inner residential — narrow streets feel',
      difficulty: 1.1,
      landmarks: ['Gandun Albasa', 'Gwale', 'Kofar Nassarawa', 'City Centre', 'Kurmi'],
      baseFare: 145
    },
    kofarnassarawa: {
      id: 'kofarnassarawa',
      name: 'Kofar Nassarawa Route',
      description: 'Historic gate area — old city traffic',
      difficulty: 1.15,
      landmarks: ['Kofar Nassarawa', 'Gandun Albasa', 'Gwale', "Emir's Palace", 'Kurmi Market'],
      baseFare: 150
    },
    mandawari: {
      id: 'mandawari',
      name: 'Mandawari Route',
      description: 'Old city quarter — dense and slow',
      difficulty: 1.15,
      landmarks: ['Mandawari', 'Yakasai', 'Kofar Ruwa', 'Jakara', 'Gwale'],
      baseFare: 145
    },
    yakasai: {
      id: 'yakasai',
      name: 'Yakasai Route',
      description: 'Traditional quarter near the walls',
      difficulty: 1.1,
      landmarks: ['Yakasai', 'Mandawari', 'City Walls', 'Kofar Mata', 'Dala Hill'],
      baseFare: 145
    },
    dala: {
      id: 'dala',
      name: 'Dala Hill Route',
      description: 'Iconic hill area — tourists and locals',
      difficulty: 1.1,
      landmarks: ['Dala Hill', 'Dala Quarters', 'City Walls', 'Kofar Mata', 'Kurmi Market'],
      baseFare: 150
    },
    kurmi: {
      id: 'kurmi',
      name: 'Kurmi Market Route',
      description: 'Ancient market — maximum daytime chaos',
      difficulty: 1.35,
      landmarks: ['Kurmi Market', "Emir's Palace", 'Kofar Mata', 'Gidan Rumfa', 'City Centre'],
      baseFare: 175
    },
    kofarruwa: {
      id: 'kofarruwa',
      name: 'Kofar Ruwa Route',
      description: 'Gate and riverside approach',
      difficulty: 1.1,
      landmarks: ['Kofar Ruwa', 'Jakara River', 'Gwale', 'Mandawari', 'City Walls'],
      baseFare: 145
    },
    farmcentre: {
      id: 'farmcentre',
      name: 'Farm Centre Route',
      description: 'Retail and office strip — midday busy',
      difficulty: 0.95,
      landmarks: ['Farm Centre', 'Nassarawa', 'Airport Road', 'Ado Bayero Mall', 'Triquia'],
      baseFare: 155
    },
    adobayero: {
      id: 'adobayero',
      name: 'Ado Bayero Mall Route',
      description: 'Mall and France Road commercial belt',
      difficulty: 1.1,
      landmarks: ['Ado Bayero Mall', 'France Road', 'Sabon Gari', 'Kantin Kwari', 'Wapa'],
      baseFare: 160
    },
    stadium: {
      id: 'stadium',
      name: 'Sani Abacha Stadium Route',
      description: 'Match-day spikes; otherwise moderate',
      difficulty: 1.0,
      landmarks: ['Sani Abacha Stadium', 'Zoo Road', 'Hotoro', 'Nassarawa', 'Farm Centre'],
      baseFare: 145
    },
    bompai2: {
      id: 'bompai2',
      name: 'Bompai Quarters Route',
      description: 'Mixed residential-industrial',
      difficulty: 1.0,
      landmarks: ['Bompai Quarters', 'Industrial Layout', 'Zoo Road', 'Sharada', 'Hotoro'],
      baseFare: 140
    },
    janbulo: {
      id: 'janbulo',
      name: 'Janbulo Route',
      description: 'West-side residential corridor',
      difficulty: 0.95,
      landmarks: ['Janbulo', 'Kabuga', 'Rijiyar Zaki', 'Goron Dutse', 'Gwarzo Road'],
      baseFare: 135
    },
    gorondutse: {
      id: 'gorondutse',
      name: 'Goron Dutse Route',
      description: 'Hillside area — scenic but busy junctions',
      difficulty: 1.05,
      landmarks: ['Goron Dutse', 'Kabuga', 'Dala', 'Katsina Road', 'City Walls'],
      baseFare: 140
    },
    silverjubilee: {
      id: 'silverjubilee',
      name: 'Silver Jubilee Route',
      description: 'Nassarawa-side commercial strip',
      difficulty: 0.95,
      landmarks: ['Silver Jubilee', 'Nassarawa GRA', 'Airport Road', 'Farm Centre', 'Triquia'],
      baseFare: 150
    },
    triquia: {
      id: 'triquia',
      name: 'Triquia / Zoo Road Link',
      description: 'Link roads between GRA and Zoo Road',
      difficulty: 1.0,
      landmarks: ['Triquia', 'Zoo Road', 'Nassarawa', 'Stadium', 'Farm Centre'],
      baseFare: 145
    },
    wapa: {
      id: 'wapa',
      name: 'Wapa Route',
      description: 'Trade zone near Sabon Gari',
      difficulty: 1.25,
      landmarks: ['Wapa', 'Sabon Gari', 'Kantin Kwari', 'France Road', 'Fagge'],
      baseFare: 165
    },
    france: {
      id: 'france',
      name: 'France Road Route',
      description: 'Dense commercial street — slow crawl',
      difficulty: 1.3,
      landmarks: ['France Road', 'Ado Bayero Mall', 'Sabon Gari', 'Wapa', 'Kantin Kwari'],
      baseFare: 170
    },
    sabontiti: {
      id: 'sabontiti',
      name: 'Sabon Titi Route',
      description: 'Busy link in Fagge area',
      difficulty: 1.15,
      landmarks: ['Sabon Titi', 'Fagge', 'Kantin Kwari', 'Triumph', 'Wapa'],
      baseFare: 155
    },
    triumph: {
      id: 'triumph',
      name: 'Triumph Publishing Route',
      description: 'Known local landmark corridor',
      difficulty: 1.1,
      landmarks: ['Triumph', 'Sabon Gari', 'Fagge', 'Kantin Kwari', 'City Centre'],
      baseFare: 150
    },
    jakara: {
      id: 'jakara',
      name: 'Jakara River Route',
      description: 'Along the old river / drainage axis',
      difficulty: 1.1,
      landmarks: ['Jakara River', 'Kofar Ruwa', 'Gwale', 'Mandawari', 'City Walls'],
      baseFare: 145
    },
    municipal: {
      id: 'municipal',
      name: 'Kano Municipal Route',
      description: 'Core municipal area — mixed traffic',
      difficulty: 1.15,
      landmarks: ['Kano Municipal', 'City Centre', 'Kurmi', "Emir's Palace", 'Gwale'],
      baseFare: 155
    },
    kofarmaza: {
      id: 'kofarmaza',
      name: 'Kofar Mazugal Route',
      description: 'Historic gate corridor',
      difficulty: 1.1,
      landmarks: ['Kofar Mazugal', 'City Walls', 'Dala', 'Gwale', 'Kurmi Market'],
      baseFare: 150
    },
    gidanmakama: {
      id: 'gidanmakama',
      name: 'Gidan Makama Museum Route',
      description: 'Museum and heritage strip',
      difficulty: 1.05,
      landmarks: ['Gidan Makama Museum', 'City Centre', "Emir's Palace", 'Kurmi', 'Kofar Mata'],
      baseFare: 155
    },
    library: {
      id: 'library',
      name: 'Murtala Library Route',
      description: 'Library and education-area traffic',
      difficulty: 0.95,
      landmarks: ['Murtala Mohammed Library', 'Nassarawa', 'City Centre', 'Stadium', 'Farm Centre'],
      baseFare: 145
    },
    ungogo: {
      id: 'ungogo',
      name: 'Ungogo Route',
      description: 'Northern LGA approach',
      difficulty: 1.0,
      landmarks: ['Ungogo', 'Kawo', 'Zoo Road', 'Hotoro', 'Naibawa'],
      baseFare: 140
    },
    kawo: {
      id: 'kawo',
      name: 'Kawo Route',
      description: 'Link toward Ungogo and north',
      difficulty: 1.0,
      landmarks: ['Kawo', 'Ungogo', 'Zoo Road', 'Hotoro Roundabout', 'Naibawa'],
      baseFare: 140
    },
    gama: {
      id: 'gama',
      name: 'Gama Quarters Route',
      description: 'Eastern quarters — local passengers',
      difficulty: 1.05,
      landmarks: ['Gama Quarters', 'Yan Awaki', 'Tarauni', 'Hotoro North', 'Kawaji'],
      baseFare: 135
    },
    hotoronorth: {
      id: 'hotoronorth',
      name: 'Hotoro North Route',
      description: 'Dense north-of-Hotoro residential',
      difficulty: 1.1,
      landmarks: ['Hotoro North', 'Tarauni', 'Kawaji', 'Yankaba', 'Gama'],
      baseFare: 140
    },
    yankaba: {
      id: 'yankaba',
      name: 'Yankaba Route',
      description: 'East-side residential and market link',
      difficulty: 1.05,
      landmarks: ['Yankaba', 'Dakata', 'Hotoro', 'Naibawa', 'Hadejia Road'],
      baseFare: 135
    },
    kofarwambai: {
      id: 'kofarwambai',
      name: 'Kofar Wambai Route',
      description: 'Old city gate — heritage traffic',
      difficulty: 1.1,
      landmarks: ['Kofar Wambai', 'City Walls', 'Kurmi Market', 'Gwale', 'Dala'],
      baseFare: 150
    },
    kofarnaisa: {
      id: 'kofarnaisa',
      name: "Kofar Na'isa Route",
      description: 'Historic gate near the palace axis',
      difficulty: 1.15,
      landmarks: ["Kofar Na'isa", "Emir's Palace", 'Gidan Rumfa', 'City Centre', 'Kurmi'],
      baseFare: 155
    },
    gidanrumfa: {
      id: 'gidanrumfa',
      name: 'Gidan Rumfa Route',
      description: 'Palace complex surroundings',
      difficulty: 1.2,
      landmarks: ['Gidan Rumfa', "Emir's Palace", "Kofar Na'isa", 'Kurmi Market', 'City Centre'],
      baseFare: 160
    }
  },


  // Kano radio stations
  RADIO_STATIONS: [
    { id: 'freedom', name: 'Freedom Radio 99.5 FM', freq: '99.5' },
    { id: 'arewa', name: 'Arewa Radio 93.1 FM', freq: '93.1' },
    { id: 'cool', name: 'Cool FM Kano', freq: '96.9' },
    { id: 'dala', name: 'Dala FM 88.5', freq: '88.5' },
    { id: 'wazobia', name: 'Wazobia 95.1 FM Kano', freq: '95.1' },
    { id: 'liberty', name: 'Liberty Radio 103.3', freq: '103.3' },
    { id: 'pyramid', name: 'Pyramid FM Kano', freq: '102.7' }
  ],

  // Dialogue lines for negotiation
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

  // Virtual billboards / brand placements (for monetization)
  BILLBOARDS: [
    { id: 'ruffneck_ent', brand: 'Ruffneck Entertainment', text: 'Ruffneck Entertainment', color: '#e11d48', active: true, url: 'https://ruffneck-entertainment.vercel.app' },
    { id: 'ruffneck_lms', brand: 'Ruffneck LMS', text: 'Ruffneck LMS – Learn', color: '#2563eb', active: true, url: 'https://ruffneck-lms.vercel.app' },
    { id: 'bb1', brand: 'Centre of Commerce', text: 'Centre of Commerce 🇳🇬', color: '#eab308', active: true, url: null },
    { id: 'bb2', brand: 'Arewa Fresh', text: 'Arewa Fresh – Drink Local', color: '#22c55e', active: false, url: null },
    { id: 'bb3', brand: 'Kano Solid Minerals', text: 'Kano Solid Minerals', color: '#3b82f6', active: false, url: null },
    { id: 'bb4', brand: 'Dala Cement', text: 'Dala Cement – Build Strong', color: '#f97316', active: false, url: null },
    { id: 'bb5', brand: 'Freedom Radio', text: 'Freedom Radio 99.5 FM', color: '#a855f7', active: false, url: null }
  ],

  // Sponsored liveries (brands can buy keke skins)
  SPONSORED_LIVERIES: {
    classic: { name: 'Classic Yellow', price: 0, body: '#fbbf24', roof: '#fde047', accent: '#ca8a04' },
    ruffneck: { name: 'Ruffneck Red', price: 0, body: '#e11d48', roof: '#fb7185', accent: '#9f1239', sponsored: true },
    ruffneck_lms: { name: 'Ruffneck LMS Blue', price: 0, body: '#2563eb', roof: '#60a5fa', accent: '#1d4ed8', sponsored: true },
    arewa:   { name: 'Arewa Fresh Green', price: 0, body: '#16a34a', roof: '#4ade80', accent: '#15803d', sponsored: true },
    dala:    { name: 'Dala Cement Orange', price: 0, body: '#ea580c', roof: '#fb923c', accent: '#c2410c', sponsored: true },
    freedom: { name: 'Freedom Radio Purple', price: 0, body: '#7e22ce', roof: '#c084fc', accent: '#6b21a8', sponsored: true }
  },

  STREAK: {
    rewards: [0, 200, 400, 700, 1100, 1600, 2200]  // reward for day 1,2,3...
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

  AISHAT_LINES: [
    "Aishat: Driver, me and my daughter Hibba — drop us safe o!",
    "Hibba: (giggles) Keke!",
    "Aishat: Hibba, sit well. Driver abeg no speed too much.",
    "Aishat: Thank you, God bless you and this keke."
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
  EVENT: 5   // for negotiation / payment scenes
};
