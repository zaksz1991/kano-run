/**
 * Kano Run 3D — config with 60 routes
 * Game Developer: Hassan Zakariya
 */
export const STATE = {
  START: 0, INTRO: 1, PLAY: 2, PAUSE: 3, OVER: 4, EVENT: 5
};
export const DEVELOPER = 'Hassan Zakariya';

function r(id, name, description, difficulty, landmarks, baseFare) {
  return { id, name, description, difficulty, landmarks, baseFare };
}

const ROUTE_LIST = [
  r('citycenter', 'City Centre / Emir Palace', 'Historic core', 1.2, ["Emir's Palace", 'Kurmi Market', 'Dala Hill'], 180),
  r('sabongari', 'Sabon Gari Route', 'Commercial chaos', 1.3, ['Sabon Gari Market', 'Kantin Kwari', 'Wapa'], 170),
  r('panshekara', 'Panshekara Route', 'Southern corridor', 1.15, ['Panshekara Market', 'Kumbotso', 'Naibawa'], 150),
  r('zoo', 'Zoo Road / Hotoro', 'Long busy artery', 1.0, ['Zoo Road Flyover', 'Hotoro', 'Naibawa'], 140),
  r('kumbotso', 'Kumbotso Route', 'Industrial + residential', 1.05, ['Kumbotso', 'Sharada', 'Challawa'], 140),
  r('fajir', 'Fagge / Kantin Kwari', 'Textile hub', 1.25, ['Fagge', 'Kantin Kwari', 'Wapa'], 165),
  r('nassarawa', 'Nassarawa GRA / Airport', 'GRA corridor', 0.95, ['Nassarawa GRA', 'Airport Road', 'Farm Centre'], 160),
  r('kurmi', 'Kurmi Market Route', 'Ancient market', 1.35, ['Kurmi Market', "Emir's Palace", 'Kofar Mata'], 175),
  r('tarauni', 'Tarauni / Hotoro North', 'Dense residential', 1.1, ['Tarauni', 'Hotoro North', 'Kawaji'], 145),
  r('gwale', 'Gwale / Kabuga', 'Student & market', 1.15, ['Gwale', 'Kabuga', 'BUK Road'], 150),
  r('dala', 'Dala Hill Route', 'Historic hill', 1.2, ['Dala Hill', 'Kofar Dawanau', 'Kurmi'], 155),
  r('sharada', 'Sharada Industrial', 'Trucks & workers', 1.25, ['Sharada', 'Challawa', 'Kumbotso'], 160),
  r('farmcentre', 'Farm Centre / Naibawa', 'Commercial strip', 1.05, ['Farm Centre', 'Naibawa', 'Zoo Road'], 145),
  r('kofarmata', 'Kofar Mata / Wudil Rd', 'Eastern gateway', 1.1, ['Kofar Mata', 'Wudil Road', 'Yankaba'], 150),
  r('hotoro', 'Hotoro / NNPC', 'Eastern express', 1.08, ['Hotoro', 'NNPC', 'Naibawa'], 148),
  r('waje', 'Kano Municipal / Waje', 'Municipal core', 1.22, ['Waje', 'Sabon Gari', 'Fagge'], 165),
  r('kofarnassarawa', 'Kofar Nassarawa', 'Gate corridor', 1.12, ['Kofar Nassarawa', 'City Centre', 'Fagge'], 155),
  r('kofarwambai', 'Kofar Wambai Route', 'Market gate', 1.18, ['Kofar Wambai', 'Kurmi', 'Sabon Gari'], 158),
  r('brigade', 'Brigade / Bompai', 'East industrial', 1.1, ['Brigade', 'Bompai', 'Yankaba'], 150),
  r('yankaba', 'Yankaba Route', 'Eastern residential', 1.05, ['Yankaba', 'Hotoro', 'Kofar Mata'], 142),
  r('kabuga', 'Kabuga / BUK', 'Campus traffic', 1.12, ['Kabuga', 'BUK', 'Gwale'], 148),
  r('buk', 'Bayero University Road', 'Student route', 1.08, ['BUK Gate', 'Kabuga', 'New Campus'], 145),
  r('aminukano', 'Aminu Kano Way', 'Major artery', 1.15, ['Aminu Kano Way', 'Zoo Road', 'Hotoro'], 155),
  r('ibrahimtaiwo', 'Ibrahim Taiwo Road', 'Central strip', 1.2, ['Ibrahim Taiwo', 'City Centre', 'Sabon Gari'], 160),
  r('murtala', 'Murtala Muhammad Way', 'Busy dual road', 1.18, ['Murtala Way', 'Farm Centre', 'Naibawa'], 155),
  r('gandu', 'Gandu / Rijiyar Zaki', 'Southwest mix', 1.05, ['Gandu', 'Rijiyar Zaki', 'Kabuga'], 140),
  r('rijiyarzaki', 'Rijiyar Zaki Route', 'Residential west', 1.0, ['Rijiyar Zaki', 'Kabuga', 'Gwale'], 138),
  r('kawo', 'Kawo / Ungogo', 'Northern edge', 1.08, ['Kawo', 'Ungogo', 'Dala'], 142),
  r('ungogo', 'Ungogo Route', 'LGA corridor', 1.05, ['Ungogo', 'Kawo', 'Dala'], 140),
  r('challawa', 'Challawa Industrial', 'Factory traffic', 1.28, ['Challawa', 'Sharada', 'Kumbotso'], 162),
  r('naibawa', 'Naibawa Market Route', 'Market congestion', 1.22, ['Naibawa Market', 'Zoo Road', 'Hotoro'], 152),
  r('kawaji', 'Kawaji / Tarauni', 'Dense housing', 1.1, ['Kawaji', 'Tarauni', 'Hotoro'], 145),
  r('courtroad', 'Court Road', 'Downtown access', 1.15, ['Court Road', 'City Centre', 'Fagge'], 150),
  r('gidanmurtala', 'Gidan Murtala', 'Landmark route', 1.1, ['Gidan Murtala', 'City Centre', 'Sabon Gari'], 148),
  r('airport', 'Airport Road', 'Airport corridor', 0.98, ['Airport', 'Nassarawa', 'Farm Centre'], 165),
  r('wudilroad', 'Wudil Road', 'Southeast exit', 1.08, ['Wudil Road', 'Kofar Mata', 'Yankaba'], 145),
  r('zariaroad', 'Zaria Road', 'Southern highway', 1.12, ['Zaria Road', 'Panshekara', 'Kumbotso'], 150),
  r('katsinaroad', 'Katsina Road', 'Northwest exit', 1.1, ['Katsina Road', 'Dala', 'Ungogo'], 148),
  r('hadejia', 'Hadejia Road', 'Northeast exit', 1.1, ['Hadejia Road', 'Hotoro', 'Yankaba'], 148),
  r('bompai', 'Bompai Industrial', 'Factories & trucks', 1.25, ['Bompai', 'Brigade', 'Sharada'], 158),
  r('sharadaroad', 'Sharada Road', 'Industrial belt', 1.2, ['Sharada', 'Challawa', 'Kumbotso'], 155),
  r('danbatta', 'Danbatta Corridor', 'Long northern run', 1.05, ['Danbatta', 'Ungogo', 'Kawo'], 155),
  r('geyawa', 'Geyawa Route', 'Outer residential', 1.0, ['Geyawa', 'Ungogo', 'Kawo'], 140),
  r('kofarmai', 'Kofar Mai Route', 'Old city gate', 1.18, ['Kofar Mai', 'Kurmi', 'Dala'], 152),
  r('kofardawanau', 'Kofar Dawanau', 'Grain market gate', 1.2, ['Kofar Dawanau', 'Dala', 'Kurmi'], 155),
  r('kofarrua', 'Kofar Rua Route', 'Historic gate', 1.15, ['Kofar Rua', 'City Centre', 'Dala'], 150),
  r('kofargadonka', 'Kofar Gadon Ka', 'Old wall route', 1.12, ['Kofar Gadon Ka', 'Gwale', 'City Centre'], 148),
  r('kofarkudu', 'Kofar Kudu', 'South gate', 1.14, ['Kofar Kudu', 'Panshekara', 'City Centre'], 150),
  r('fanisau', 'Fanisau Route', 'Outer Kano', 1.0, ['Fanisau', 'Ungogo', 'Airport'], 145),
  r('tokarawa', 'Tokarawa Route', 'Northeast suburb', 1.05, ['Tokarawa', 'Hotoro', 'Yankaba'], 142),
  r('dorayi', 'Dorayi / Kabuga West', 'Western sprawl', 1.08, ['Dorayi', 'Kabuga', 'Gandu'], 145),
  r('hotorogr', 'Hotoro GRA', 'Eastern GRA', 0.95, ['Hotoro GRA', 'Hotoro', 'Farm Centre'], 160),
  r('nassarawamarket', 'Nassarawa Market', 'Market run', 1.2, ['Nassarawa Market', 'Nassarawa GRA', 'Sabon Gari'], 155),
  r('wapanew', 'Wapa / New Market', 'Textile chaos', 1.28, ['Wapa', 'Kantin Kwari', 'Fagge'], 168),
  r('singer', 'Singer Market Area', 'Trade district', 1.22, ['Singer', 'Sabon Gari', 'Fagge'], 160),
  r('france', 'France Road', 'Central commercial', 1.18, ['France Road', 'Sabon Gari', 'City Centre'], 155),
  r('lagosstreet', 'Lagos Street', 'Sabon Gari core', 1.3, ['Lagos Street', 'Sabon Gari', 'Kantin Kwari'], 170),
  r('beirut', 'Beirut Road', 'Dense trade strip', 1.25, ['Beirut Road', 'Sabon Gari', 'Fagge'], 165),
  r('abujanroad', 'Abuja Road', 'Link corridor', 1.1, ['Abuja Road', 'Zoo Road', 'Farm Centre'], 150),
  r('ringroad', 'Kano Ring Road', 'Outer ring', 1.05, ['Ring Road', 'Hotoro', 'Panshekara'], 155)
];

const ROUTES = {};
ROUTE_LIST.forEach((x) => { ROUTES[x.id] = x; });

export const CONFIG = {
  LANES: 3,
  DEFAULT_CAPACITY: 5,
  ROAD_MODES: {
    oneway: { id: 'oneway', name: 'One-way', desc: 'Traffic with you only', oppositeChance: 0 },
    twoway: { id: 'twoway', name: 'Two-way', desc: 'Oncoming traffic', oppositeChance: 0.35 }
  },
  DESTINATIONS: [
    'Sabon Gari', 'Kofar Mata', 'Fagge', 'Farm Centre', 'Hotoro', 'Zoo Road', 'Naibawa',
    'Tarauni', 'Dala', 'Kantin Kwari', 'Kofar Wambai', 'Panshekara', 'Kumbotso', 'Gwale',
    'Sharada', "Emir's Palace", 'Kurmi Market', 'Bompai', 'Yankaba', 'Kabuga',
    'Kofar Nassarawa', 'Brigade', 'Gidan Murtala', 'Murtala Muhammad Way', 'Ibrahim Taiwo Road',
    'Aminu Kano Way', 'Court Road', 'Gandu', 'Rijiyar Zaki', 'Kawo', 'Ungogo', 'Challawa', 'Wapa', 'Airport Road'
  ],
  HONORIFICS: ['Oga', 'Mai Gida', 'Mallam', 'Yallabai', 'Dan uwa', 'Aboki', 'Driver', 'Baba', 'Mama', 'Hajiya', 'Ustaz', 'Sannu'],
  NEGOTIATE_LINES: [
    '{h}, reduce am small!',
    '{h}, ₦{low} only — please!',
    'Mu je {dest}? {h}, how much?',
    '{h}, I no get plenty money today.',
    'Akwai change? {h}, make we agree ₦{low}.',
    '{h}, normal fare to {dest} how much?'
  ],
  ROUTES,
  DRIVERS: {
    ruffneck: { id: 'ruffneck', name: 'RuffNeck', title: 'Top Driver', ability: 'ruffneck', desc: 'Best overall', unlocked: true, bonuses: { scoreMult: 1.15, speed: 0.15, invFrames: 12 } },
    baba: { id: 'baba', name: 'Baba', title: 'Elder Careful', ability: 'careful', desc: 'Careful driving', unlocked: true, bonuses: { scoreMult: 1.0, speed: -0.1, invFrames: 28, nearMissBonus: 1.5 } },
    mama: { id: 'mama', name: 'Mama', title: 'Steady Hand', ability: 'steady', desc: 'Better drop fares', unlocked: true, bonuses: { scoreMult: 1.05, fareMult: 1.25, speed: 0, invFrames: 16 } },
    mayen: { id: 'mayen', name: 'Mayen Mata', title: 'Ladies First', ability: 'ladies', desc: 'Aishat + Hibba bonus', unlocked: true, bonuses: { scoreMult: 1.05, aishatBonus: 200, speed: 0.05, invFrames: 10 } },
    uztaz: { id: 'uztaz', name: 'Uztaz', title: 'Respectful', ability: 'respect', desc: 'Safer pickups', unlocked: true, bonuses: { scoreMult: 1.0, speed: -0.05, invFrames: 22, fareMult: 1.1 } },
    sani: { id: 'sani', name: 'Sani', title: 'Speed Demon', ability: 'aggressive', desc: 'Higher top speed', unlocked: true, bonuses: { scoreMult: 1.08, speed: 0.35, invFrames: 6 } }
  },
  KEKES: {
    starter: { id: 'starter', name: 'Street Classic', color: 0xfbbf24, speed: 0, capacity: 5, unlocked: true, role: 'Everyday Adaidaita Sahu', accel: 1, grip: 1, fuelUse: 1 },
    ruffgold: { id: 'ruffgold', name: 'RuffNeck Gold', color: 0xeab308, speed: 0.12, capacity: 5, unlocked: true, role: 'Top driver ride', accel: 1.1, grip: 1.05, fuelUse: 1.05 },
    market: { id: 'market', name: 'Market Runner', color: 0xf97316, speed: -0.05, capacity: 5, unlocked: true, role: 'Kurmi / Sabon Gari loads', accel: 0.9, grip: 1.1, fuelUse: 0.95 },
    kabuga: { id: 'kabuga', name: 'Kabuga Express', color: 0x38bdf8, speed: 0.18, capacity: 5, unlocked: true, role: 'Student corridor speed', accel: 1.15, grip: 0.95, fuelUse: 1.1 },
    airport: { id: 'airport', name: 'Airport Shuttle', color: 0x22c55e, speed: 0.1, capacity: 5, unlocked: true, role: 'Airport Road long haul', accel: 1.05, grip: 1.08, fuelUse: 0.9 },
    night: { id: 'night', name: 'Night Rider', color: 0x1e293b, speed: 0.22, capacity: 5, unlocked: true, role: 'Night runs', accel: 1.12, grip: 1.0, fuelUse: 1.08 },
    vip: { id: 'vip', name: 'VIP Transport', color: 0xa855f7, speed: 0.08, capacity: 4, unlocked: true, role: 'VIP fares', accel: 1.0, grip: 1.12, fuelUse: 1.0, fareMult: 1.35 }
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
    { id: 'first_km', name: 'First Kilometre', desc: 'Drive 1 km', check: (g) => g.dist >= 1 },
    { id: 'fare_king', name: 'Fare King', desc: 'Score ₦3000', check: (g) => g.score >= 3000 },
    { id: 'combo_5', name: 'Combo Starter', desc: 'Reach 5x combo', check: (g) => g.combo >= 5 },
    { id: 'pax_10', name: 'Full Load', desc: 'Carry 10+ passengers', check: (g) => g.totalPax >= 10 },
    { id: 'near_3', name: 'Close Call', desc: '3 near misses', check: (g) => (g.nearMissCount || 0) >= 3 },
    { id: 'survivor', name: 'Survivor', desc: 'Use a Life Saver', check: (g) => g.continuesLeft < 3 }
  ]
};
