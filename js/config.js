// Kano Run — Advanced Kano transport-world configuration
export const STATE = {
  START: 0,
  PLAY: 1,
  OVER: 2,
  GARAGE: 3,
  ROUTE_SELECT: 4,
  EVENT: 5
};

const route = (id, name, description, difficulty, baseFare, landmarks, zone, traffic = 1, environment = 'urban', scenery = []) => ({
  id, name, description, difficulty, baseFare, landmarks, zone, traffic, environment, scenery
});

export const CONFIG = {
  GAME_NAME: 'Kano Run',
  GAME_SUBTITLE: 'Adaidaita Sahu — Kano Transport Life',
  VERSION: '2.0.0',
  LANES: 3,
  MAX_CAPACITY_BASE: 3,
  STARTING_CAPACITY: 3,
  STARTING_LIVES: 3,
  START_SPEED: 5.2,
  MAX_SPEED: 34,
  BASE_FARE: 150,
  COMBO_MAX: 25,
  DAY_LENGTH_MS: 150000,
  STORAGE_KEYS: {
    MONEY: 'kanoMoney',
    BEST_SCORE: 'kanoHigh',
    PAINT: 'kanoPaint',
    CAPACITY: 'kanoCap',
    SPEED: 'kanoSpeed',
    HORN: 'kanoHorn'
  },

  PAINTS: {
    classic: { body:'#fbbf24', roof:'#fde047', accent:'#ca8a04', name:'Classic Yellow', price:0 },
    green: { body:'#22c55e', roof:'#4ade80', accent:'#16a34a', name:'Kano Green', price:950 },
    blue: { body:'#3b82f6', roof:'#60a5fa', accent:'#2563eb', name:'Arewa Blue', price:950 },
    white: { body:'#f1f5f9', roof:'#e2e8f0', accent:'#94a3b8', name:'Clean White', price:750 },
    red: { body:'#ef4444', roof:'#f87171', accent:'#dc2626', name:'Emir Red', price:1150 },
    black: { body:'#1e293b', roof:'#334155', accent:'#0f172a', name:'Night Black', price:1350 },
    purple: { body:'#a855f7', roof:'#c084fc', accent:'#7e22ce', name:'Royal Purple', price:1600 },
    sand: { body:'#c49a6c', roof:'#e2c39a', accent:'#8b6b45', name:'Harmattan Sand', price:1750 }
  },

  SPONSORED_LIVERIES: {
    arewa: { name:'Arewa Fresh Green', price:0, body:'#16a34a', roof:'#4ade80', accent:'#15803d', sponsored:true },
    dala: { name:'Dala Cement Orange', price:0, body:'#ea580c', roof:'#fb923c', accent:'#c2410c', sponsored:true },
    freedom: { name:'Freedom Radio Purple', price:0, body:'#7e22ce', roof:'#c084fc', accent:'#6b21a8', sponsored:true }
  },

  DRIVERS: {
    musa:{id:'musa',name:'Musa',title:'The Veteran',desc:'Experienced Kano driver with balanced handling.',color:'#eab308',bonus:{capacity:0,speed:0,horn:0,fareBonus:0},price:0},
    aisha:{id:'aisha',name:'Aisha',title:'Queen of Panshekara',desc:'Strong negotiator with better fares.',color:'#ec4899',bonus:{capacity:0,speed:0.2,horn:0,fareBonus:.15},price:1200},
    sani:{id:'sani',name:'Sani',title:'Night Rider',desc:'Fast and confident after dark.',color:'#3b82f6',bonus:{capacity:0,speed:.5,horn:0,fareBonus:0},price:1500},
    bala:{id:'bala',name:'Bala',title:'Horn Master',desc:'Traffic clears faster after a strong horn.',color:'#22c55e',bonus:{capacity:0,speed:0,horn:1,fareBonus:0},price:1800},
    hadiza:{id:'hadiza',name:'Hadiza',title:'Market Queen',desc:'Carries one extra passenger.',color:'#a855f7',bonus:{capacity:1,speed:0,horn:0,fareBonus:0},price:2000},
    usman:{id:'usman',name:'Usman',title:'Sabon Gari Hustler',desc:'Thrives in dense commercial traffic.',color:'#f97316',bonus:{capacity:0,speed:.2,horn:0,fareBonus:.08},price:1600},
    zainab:{id:'zainab',name:'Zainab',title:'Kurmi Trader',desc:'Higher rewards from market passengers.',color:'#14b8a6',bonus:{capacity:0,speed:0,horn:0,fareBonus:.2},price:2200},
    ibrahim:{id:'ibrahim',name:'Ibrahim',title:'Dala Hill Climber',desc:'Strong engine for difficult routes.',color:'#ef4444',bonus:{capacity:0,speed:.7,horn:0,fareBonus:0},price:1900},
    fatima:{id:'fatima',name:'Fatima',title:'Student Express',desc:'Quick acceleration and responsive handling.',color:'#8b5cf6',bonus:{capacity:0,speed:.5,horn:0,fareBonus:0},price:1400},
    yusuf:{id:'yusuf',name:'Yusuf',title:'KAROTA Avoider',desc:'Longer recovery after enforcement encounters.',color:'#06b6d4',bonus:{capacity:0,speed:0,horn:.5,fareBonus:0},price:2100},
    amina:{id:'amina',name:'Amina',title:'Zoo Road Regular',desc:'Extra fare on long corridors.',color:'#f43f5e',bonus:{capacity:0,speed:.3,horn:0,fareBonus:.1},price:1700},
    kabiru:{id:'kabiru',name:'Kabiru',title:'The People’s Driver',desc:'Extra passenger capacity.',color:'#84cc16',bonus:{capacity:1,speed:0,horn:0,fareBonus:0},price:2300},
    rukayya:{id:'rukayya',name:'Rukayya',title:'Harmattan Queen',desc:'Handles dusty conditions better.',color:'#d946ef',bonus:{capacity:0,speed:.25,horn:0,fareBonus:.12},price:2000}
  },

  DRIVER_STYLES: {
    classic:{name:'Classic Cap',price:0,color:'#1e293b'},
    kaftan:{name:'White Kaftan',price:600,color:'#f8fafc'},
    jalabiya:{name:'Blue Jalabiya',price:800,color:'#3b82f6'},
    modern:{name:'Modern Jacket',price:900,color:'#0f172a'},
    sport:{name:'Sport Cap',price:500,color:'#ef4444'},
    northern:{name:'Northern Kaftan',price:1000,color:'#c49a6c'}
  },

  UPGRADES: {
    capacity:{name:'Extra Seat',desc:'+1 passenger capacity',levels:[3,4,5],prices:[0,1300,2700],key:'kanoCap'},
    speed:{name:'Engine Tune',desc:'Higher top speed and acceleration',levels:[0,1,2,3],prices:[0,1600,3200,5200],key:'kanoSpeed'},
    horn:{name:'Power Horn',desc:'Stronger traffic clear and recovery',levels:[0,1,2,3],prices:[0,1100,2400,3900],key:'kanoHorn'}
  },

  ROUTES: {
    panshekara:route('panshekara','Panshekara Route','Very busy corridor with markets, junctions and heavy passenger traffic.',1.15,150,['Panshekara Market','Kumbotso Junction','Sharada','Hotoro Roundabout','Naibawa'],'west',1.15),
    kumbotso:route('kumbotso','Kumbotso Route','Industrial and residential traffic with trucks and commercial vehicles.',1.05,140,['Kumbotso','Challawa','Sharada Industrial','Naibawa','Yankaba'],'southwest',1.05),
    sabongari:route('sabongari','Sabon Gari Route','Commercial heart of Kano with dense pedestrians and chaotic traffic.',1.3,170,['Sabon Gari Market','Kantin Kwari','Wapa','France Road','Ado Bayero Mall'],'central',1.35),
    citycenter:route('citycenter','City Centre / Emir Palace','Historic Kano core with tight roads and frequent enforcement.',1.2,180,["Emir's Palace",'Kurmi Market','Dala Hill','Kofar Mata Dye Pits','City Walls'],'central',1.3),
    zoo:route('zoo','Zoo Road / Hotoro','Long high-speed corridor suited to distance runs.',1.0,140,['Zoo Road','Hotoro','Naibawa','Kawo','Ungogo'],'north',1.05),
    tarauni:route('tarauni','Tarauni / Hotoro North','Dense residential and market traffic with constant stops.',1.1,145,['Tarauni Market','Hotoro North','Kawaji','Yan Awaki','Gama'],'north',1.15),
    nassarawa:route('nassarawa','Nassarawa GRA / Airport Road','Mixed elite, airport and commercial traffic.',1.05,160,['Nassarawa GRA','Airport Road','Katsina Road','Badawa','Kurnar Asabe'],'east',1.0),
    gwale:route('gwale','Gwale / Kofar Ruwa','Old city edge with busy markets and narrow streets.',1.2,155,['Gwale','Kofar Ruwa','Kofar Wambai','Jakara','Mandawari'],'west',1.2),
    fajir:route('fajir','Fagge / Kantin Kwari','Textile-market chaos with high passenger turnover.',1.35,175,['Kantin Kwari','Fagge','Wapa','France Road','Sabon Gari'],'central',1.4),
    dakata:route('dakata','Dakata / Yankaba','Eastern corridor with growing traffic and market activity.',1.0,135,['Dakata','Yankaba','Naibawa','Hotoro','Sharada'],'east',1.05),
    rijiyarzaki:route('rijiyarzaki','Rijiyar Zaki / Kabuga','Western approach with mixed traffic and residential streets.',.95,130,['Rijiyar Zaki','Kabuga','Jaen','Dorayi','Unguwa Uku'],'west',.95),
    kofarmata:route('kofarmata','Kofar Mata / Dye Pits','Historic tourist and local corridor with tight roads.',1.15,165,['Kofar Mata Dye Pits','Kurmi Market','Dala Hill',"Emir's Palace",'Jakara'],'central',1.2),
    bungudu:route('bungudu','Bompai / Industrial Layout','Factory traffic, heavy trucks and commercial kekes.',1.1,140,['Bompai','Industrial Layout','Sharada','Challawa','Hotoro'],'east',1.25),
    yanawaki:route('yanawaki','Yan Awaki / Gama','Dense residential corridor with frequent passenger stops.',1.25,150,['Yan Awaki','Gama','Tarauni','Kawaji','Hotoro North'],'north',1.2),
    unguwauku:route('unguwauku','Unguwa Uku / Dorayi','Southern corridor with busy evening traffic.',1.05,140,['Unguwa Uku','Dorayi','Jaen','Kabuga','Rijiyar Zaki'],'southwest',1.05),

    kawaji:route('kawaji','Kawaji / Gidan Ruwa','Residential-commercial corridor with school and market traffic.',1.1,145,['Kawaji','Gidan Ruwa','Tarauni','Hotoro North'],'north',1.15),
    naibawa:route('naibawa','Naibawa / Zaria Road','Motor-park corridor with buses, trucks and heavy pickups.',1.3,165,['Naibawa Motor Park','Zaria Road','Kofar Nassarawa','Hotoro'],'north',1.35),
    challawa:route('challawa','Challawa / Sharada Industrial','Industrial route with slow trucks and factory workers.',1.25,155,['Challawa Industrial','Sharada','Kumbotso','Naibawa'],'southwest',1.3),
    wudil:route('wudil','Wudil Road Junction','Outer-city route with faster traffic and long open stretches.',1.05,170,['Wudil Road Junction','Kumbotso','Naibawa','Panshekara'],'south',1.0),
    gwarzo:route('gwarzo','Gwarzo Road Corridor','Busy northern approach with mixed vehicles.',1.2,160,['Gwarzo Road','Ungogo','Kawo','Tarauni'],'north',1.2),
    katsina:route('katsina','Katsina Road Corridor','Long mixed-use road with buses and commercial traffic.',1.15,160,['Katsina Road','Badawa','Nassarawa','Kofar Nassarawa'],'east',1.15),
    hadejia:route('hadejia','Hadejia Road Corridor','Urban edge route with markets and motorcycles.',1.1,150,['Hadejia Road','Dakata','Yankaba','Kawo'],'east',1.1),
    airport:route('airport','Airport Road Express','Faster premium route with airport passengers and taxis.',1.2,190,['Airport Road','Nassarawa GRA','Badawa','Katsina Road'],'east',1.05),
    jaen:route('jaen','Jaen / Kabuga Loop','Residential loop with schools and neighbourhood stops.',1.0,135,['Jaen','Kabuga','Dorayi','Unguwa Uku'],'west',1.0),
    dorayi:route('dorayi','Dorayi / Rijiyar Zaki','Southern-western corridor with evening congestion.',1.15,145,['Dorayi','Rijiyar Zaki','Kabuga','Jaen'],'west',1.1),
    kawar:route('kawar','Kofar Wambai / Mandawari','Traditional market streets and narrow passages.',1.35,175,['Kofar Wambai','Mandawari','Jakara','Kofar Ruwa'],'central',1.45),
    jakara:route('jakara','Jakara / Kofar Ruwa','Dense old-city route with pedestrians and market activity.',1.3,165,['Jakara River','Kofar Ruwa','Gwale','Kofar Wambai'],'central',1.35),
    stadium:route('stadium','Sani Abacha Stadium / Nassarawa','Event-day traffic and large passenger surges.',1.25,175,['Sani Abacha Stadium','Nassarawa','Badawa','Airport Road'],'east',1.3),
    bayero:route('bayero','Bayero University / Old Campus','Student corridor with peak-time traffic.',1.15,155,['Bayero University','Kofar Kabuga','Tarauni','Kawaji'],'north',1.2),
    marketloop:route('marketloop','Kantin Kwari / Sabon Gari Loop','High-turnover commercial loop designed for passenger income.',1.4,185,['Kantin Kwari Market','Sabon Gari','Wapa','France Road'],'central',1.5),
    outerkano:route('outerkano','Outer Kano Challenge','Long mixed corridor combining open roads and dense junctions.',1.5,210,['Panshekara','Kumbotso','Naibawa','Tarauni','Ungogo'],'outer',1.4),
    kofarnassarawa:route('kofarnassarawa','Kofar Nassarawa / Government House','Civic and commercial corridor with broad junctions and formal public buildings.',1.08,165,['Kofar Nassarawa','Government House area','Murtala Mohammed Way','Nassarawa GRA'],'central',1.05,'civic',['government-buildings','wide-junctions','street-lights']),
    waje:route('waje','Waje / Kofar Mazugal','Historic neighbourhood streets linking old-city gates and local trading lanes.',1.22,155,['Waje','Kofar Mazugal','Yakasai','Kofar Mata'],'central',1.22,'old-city',['city-gates','mud-wall-compounds','market-stalls']),
    gidanmakama:route('gidanmakama','Gidan Makama Museum Circuit','Heritage-focused circuit around traditional architecture and old-city landmarks.',1.12,175,['Gidan Makama Museum','Emir Palace area','Kurmi Market','Kofar Wambai'],'central',1.12,'heritage',['traditional-architecture','museum-courtyard','old-city']),
    murtalalibrary:route('murtalalibrary','Murtala Library / State Secretariat','Institutional road with offices, bus stops, and weekday commuter demand.',1.02,155,['Murtala Mohammed Library','State Secretariat area','Kofar Nassarawa','Nassarawa'],'central',1.0,'civic',['public-buildings','bus-stops','wide-road']),
    farmcentre:route('farmcentre','Farm Centre / Badawa','Retail and residential corridor with electronics shops and busy roadside loading.',1.14,160,['Farm Centre','Badawa','Nassarawa GRA','Airport Road'],'east',1.15,'commercial',['retail-blocks','parking-bays','junctions']),
    adoayero:route('adoayero','Ado Bayero Mall / Zoo Road','Modern retail corridor with mall frontage, parking access, and mixed commuter traffic.',1.0,175,['Ado Bayero Mall','Zoo Road','Nassarawa GRA','Airport Road'],'east',1.0,'modern-retail',['shopping-mall','parking-lots','wide-road']),
    bukroad:route('bukroad','BUK Road / New Site','Student and university corridor with campus walls, bus stops, and peak-hour traffic.',1.15,160,['BUK Road','Bayero University New Site','Gwarzo Road','Ungogo'],'north',1.18,'university',['campus-gates','student-stops','hostel-streets']),
    oldbuk:route('oldbuk','BUK Old Campus / Kabuga','Older university approach with neighbourhood commerce and student pickups.',1.1,155,['Bayero University Old Campus','Kabuga','Jaen','Tarauni'],'north',1.12,'university',['campus-wall','bookshops','student-stops']),
    ungogo:route('ungogo','Ungogo / Gwarzo Road Edge','Northern urban edge with open gaps between settlements and roadside businesses.',1.0,160,['Ungogo','Gwarzo Road','Kawo','Rijiyar Zaki'],'north',0.95,'urban-edge',['open-ground','scattered-houses','roadside-shops']),
    kawo:route('kawo','Kawo / Northern Approach','Northern approach road with longer straights, junctions, and inter-town traffic.',1.08,165,['Kawo','Gwarzo Road','Ungogo','Tarauni'],'north',1.0,'highway-edge',['long-straights','road-signs','fuel-station']),
    yankaba:route('yankaba','Yankaba Produce Market','Produce-market corridor with loading activity, handcarts, and commercial vehicles.',1.28,170,['Yankaba Market','Dakata','Naibawa','Hadejia Road'],'east',1.32,'produce-market',['produce-stalls','loading-trucks','market-canopies']),
    sharada:route('sharada','Sharada Industrial Estate','Factory and warehouse corridor with delivery trucks and shift-change traffic.',1.2,160,['Sharada Industrial Estate','Challawa','Bompai','Kumbotso'],'southwest',1.28,'industrial',['warehouses','factory-gates','heavy-trucks']),
    bompai:route('bompai','Bompai Industrial / Commercial','Industrial estate with warehouses, office blocks, and freight movements.',1.16,160,['Bompai Industrial Layout','Sharada','Naibawa','Kofar Nassarawa'],'east',1.22,'industrial',['warehouses','loading-yards','office-blocks']),
    challawa:route('challawa','Challawa Industrial / Dam Road','Industrial outskirts with freight traffic and more open roadside terrain.',1.25,165,['Challawa Industrial Area','Challawa Dam approach','Kumbotso','Panshekara'],'southwest',1.24,'industrial-edge',['factory-fences','open-ground','freight-trucks']),
    zariaroad:route('zariaroad','Zaria Road / Naibawa Link','Major approach road connecting residential districts with transport and trading areas.',1.12,160,['Zaria Road','Naibawa','Kofar Nassarawa','Hotoro'],'north',1.14,'arterial',['wide-carriageway','bus-stops','commercial-frontage']),
    hadjiaroad:route('hadjiaroad','Hadejia Road / Dakata Link','Eastern corridor with roadside workshops, retail clusters, and mixed vehicle traffic.',1.12,155,['Hadejia Road','Dakata','Yankaba','Naibawa'],'east',1.12,'arterial',['workshops','roadside-retail','junctions']),
    gandu:route('gandu','Gandun Albasa / Dorayi','Residential neighbourhood circuit with schools, local shops, and frequent passenger stops.',1.05,145,['Gandun Albasa','Dorayi','Jaen','Unguwa Uku'],'southwest',1.05,'residential',['schools','local-shops','compound-walls']),
    kofarruwa:route('kofarruwa','Kofar Ruwa / Jakara Edge','Old-city edge with drainage crossings, dense trading lanes, and narrow junctions.',1.24,160,['Kofar Ruwa','Jakara River','Gwale','Kofar Wambai'],'west',1.25,'old-city',['drainage-crossing','narrow-lanes','market-stalls']),
    yakasai:route('yakasai','Yakasai / Mandawari Loop','Traditional trading neighbourhood with closely packed compounds and small markets.',1.26,165,['Yakasai','Mandawari','Kofar Wambai','Kofar Mata'],'central',1.3,'traditional-market',['compact-compounds','small-markets','old-city']),
    kanoouterring:route('kanoouterring','Kano Outer-City Connector','A longer mixed route shifting from dense urban streets to open peri-urban roads.',1.18,190,['Kumbotso','Panshekara','Naibawa','Ungogo','Kawo'],'outer',1.08,'peri-urban',['urban-edge','open-road','scattered-settlements'])

  },

  DISTRICTS: [
    'Kano City','Sabon Gari','Fagge','Dala','Kumbotso','Nassarawa','Gwale','Tarauni',
    'Ungogo','Panshekara','Naibawa','Bompai','Sharada','Hotoro','Kawaji','Dakata',
    'Yankaba','Kabuga','Dorayi','Gama','Yan Awaki','Kofar Wambai','Kofar Ruwa','Jakara',
    'Airport Road','Zaria Road','Katsina Road','Hadejia Road','Challawa','Bayero University'
  ],

  TRAFFIC_TYPES: [
    {type:'car',weight:28},{type:'keke',weight:26},{type:'motorcycle',weight:15},
    {type:'bus',weight:9},{type:'truck',weight:8},{type:'taxi',weight:7},
    {type:'police',weight:3},{type:'karota',weight:2},{type:'ambulance',weight:1},{type:'obstacle',weight:1}
  ],

  PASSENGER_TYPES: [
    {id:'worker',label:'Worker',color:'#64748b',fareMult:1.0,gender:'male'},
    {id:'business',label:'Business Man',color:'#1e40af',fareMult:1.25,gender:'male'},
    {id:'hijab',label:'Hajiya',color:'#0d9488',fareMult:1.1,gender:'female'},
    {id:'lady',label:'Lady',color:'#ec4899',fareMult:1.15,gender:'female'},
    {id:'youth',label:'Youth',color:'#8b5cf6',fareMult:.95,gender:'male'},
    {id:'trader',label:'Trader',color:'#d97706',fareMult:1.2,gender:'male'},
    {id:'student',label:'Student',color:'#2563eb',fareMult:1.05,gender:'mixed'},
    {id:'vip',label:'VIP Passenger',color:'#fbbf24',fareMult:2.0,gender:'mixed',vip:true},
    {id:'lowpay',label:'No Change',color:'#f87171',fareMult:.35,gender:'female',lowPay:true},
    {id:'free',label:'Abeg Free',color:'#fb7185',fareMult:0,gender:'female',lowPay:true}
  ],

  RADIO_STATIONS: [
    {id:'freedom',name:'Freedom Radio 99.5 FM',freq:'99.5'},
    {id:'arewa',name:'Arewa Radio 93.1 FM',freq:'93.1'},
    {id:'cool',name:'Cool FM Kano',freq:'96.9'},
    {id:'dala',name:'Dala FM 88.5',freq:'88.5'},
    {id:'wazobia',name:'Wazobia 95.1 FM Kano',freq:'95.1'},
    {id:'liberty',name:'Liberty Radio 103.3',freq:'103.3'},
    {id:'pyramid',name:'Pyramid FM Kano',freq:'102.7'}
  ],

  WEATHER: {
    clear:'☀️ Clear',
    dust:'🌬️ Harmattan Dust',
    haze:'🌫️ Haze',
    rain:'🌧️ Rain',
    storm:'⛈️ Storm'
  },

  WORLD_EVENTS: [
    {id:'market',name:'Market Rush',text:'Market activity is heavy. Passenger demand and pedestrian traffic increase.',traffic:1.35,fare:1.15},
    {id:'school',name:'School Rush',text:'Students are moving between schools and neighbourhoods.',traffic:1.25,fare:1.05},
    {id:'rain',name:'Rainfall',text:'Rain makes the road slippery and visibility lower.',traffic:.9,fare:1.2},
    {id:'checkpoint',name:'KAROTA Checkpoint',text:'Enforcement activity is high on this corridor.',traffic:1.1,fare:1.0},
    {id:'festival',name:'City Celebration',text:'Crowds are gathering. Passenger demand is unusually high.',traffic:1.45,fare:1.3},
    {id:'trafficjam',name:'Traffic Jam',text:'A bottleneck is slowing traffic ahead.',traffic:1.6,fare:1.05}
  ],

  MISSIONS: [
    {id:'pax5',text:'Carry 5 passengers',target:5,reward:500},
    {id:'dist5',text:'Drive 5 km',target:5,reward:700},
    {id:'score3k',text:'Earn ₦3000 this run',target:3000,reward:650},
    {id:'horn5',text:'Use horn 5 times',target:5,reward:350},
    {id:'drop10',text:'Drop 10 passengers',target:10,reward:600},
    {id:'near5',text:'Perform 5 near misses',target:5,reward:800},
    {id:'routes',text:'Drive through 4 route segments',target:4,reward:900},
    {id:'survive',text:'Survive 7 km',target:7,reward:1200}
  ],

  DAILY_MISSIONS: [
    {id:'daily_pax',text:'Carry 12 passengers today',target:12,reward:800,type:'pax'},
    {id:'daily_dist',text:'Drive 8 km today',target:8,reward:750,type:'dist'},
    {id:'daily_score',text:'Earn ₦6000 in one run',target:6000,reward:900,type:'score'},
    {id:'daily_drop',text:'Drop 15 passengers today',target:15,reward:850,type:'drop'},
    {id:'daily_horn',text:'Use horn 12 times today',target:12,reward:600,type:'horn'},
    {id:'daily_route',text:'Complete 3 different routes',target:3,reward:1000,type:'routes'}
  ],

  LANDMARKS: [
    'Kurmi Market',"Emir's Palace",'Dala Hill','Kofar Mata Dye Pits','Ancient City Walls',
    'Sabon Gari','Ado Bayero Mall','Sani Abacha Stadium','Bayero University',
    'Kantin Kwari Market','Sharada Industrial Area','Kumbotso Bridge','Panshekara Junction',
    'Tarauni Market','Gama Quarters','Kabuga Junction','Rijiyar Zaki','Bompai',
    'Kofar Ruwa','Jakara River','Murtala Mohammed Library','Kano State History Museum',
    'Triumph Publishing Company','Gandun Albasa','Kofar Nassarawa','Dorayi Quarters',
    'Jaen','Unguwa Uku','Hotoro North','Kawaji','Yankaba','Challawa Industrial',
    'Wudil Road Junction','Gwarzo Road','Zaria Road','Katsina Road','Hadejia Road',
    'Kano Emirate Council','Gidan Makama Museum','Kofar Mazugal','Mandawari','Yakasai','Dakata'
  ],

  NEGOTIATION: {
    passenger:['Driver, how much to the junction?','I will pay ₦100 only!','Last week it was cheaper!','Abeg reduce am small','I no get change o','Drop me for the next stop'],
    driver:['My friend, that is the price','Fuel is expensive these days','Okay, enter make we go','No change? I go find am','KAROTA dey around, no waste time','God go bless you, enter'],
    disagreement:['I no go pay that amount!','Driver you dey craze?','I go report you to KAROTA!','Take this ₦80 or leave am']
  },

  KAROTA_LINES: {
    officer:['Park well! Where is your particulars?','This keke no get paper?','You dey overspeed!','Come down make we talk!','Your road worthiness expire!'],
    driver:['Officer I dey go market!','I get all my papers!','Abeg no waste my time!','I just renew am last week!','Oga wetin I do?'],
    quarrel:['You this KAROTA people too much!','Every day na checkpoint!','I no go give you anything!','God go judge una!']
  },

  DRIVER_REACTIONS: {
    pickup:['Enter, my friend!','God bless you!','Wazobia!','Let’s go!','One more!','Kano style!','Sharp sharp!'],
    passenger:['Enter, my friend!','Oya enter!','Make we move!'],
    drop:['Thank you!','Safe journey!','Come again!','Next passenger!','Allah ya sakawa!','Oya next!'],
    dropoff:['Thank you!','Safe journey!','Oya next!'],
    nearMiss:['Almost!','Close one!','Watch it!','Haba!','Too close!'],
    combo:['We are on fire!','Keep it coming!','Kano no dey carry last!','Unstoppable!'],
    crash:['Astaghfirullah!','Not again!','Why me?!','Traffic in this place!'],
    horn:['Make way!','Oga move!','Kai!'],
    karota:['Ah KAROTA again!','Easy, easy!']
  },

  BILLBOARDS: [
    {id:'bb1',brand:'Centre of Commerce',text:'Centre of Commerce 🇳🇬',color:'#eab308',active:true},
    {id:'bb2',brand:'Arewa Fresh',text:'Arewa Fresh – Drink Local',color:'#22c55e',active:true},
    {id:'bb3',brand:'Kano Solid Minerals',text:'Kano Solid Minerals',color:'#3b82f6',active:true},
    {id:'bb4',brand:'Dala Cement',text:'Dala Cement – Build Strong',color:'#f97316',active:true},
    {id:'bb5',brand:'Freedom Radio',text:'Freedom Radio 99.5 FM',color:'#a855f7',active:true}
  ],

  STREAK:{rewards:[0,200,400,700,1100,1600,2200]},
  COMMERCE:{fuelCostPerKm:14,maintenanceCostPerCrash:120,bonusMultiplier:.08}
};

// Compatibility layer for the current gameplay engine.
CONFIG.RADIO = CONFIG.RADIO_STATIONS || [];
CONFIG.ACHIEVEMENTS = CONFIG.ACHIEVEMENTS || [
  { id:'first_trip', name:'First Fare', description:'Complete your first passenger trip', target:1 },
  { id:'coin_collector', name:'Street Collector', description:'Collect 10 coins', target:10 },
  { id:'safe_driver', name:'Safe Driver', description:'Complete a run without crashing', target:1 },
  { id:'route_master', name:'Route Master', description:'Complete multiple route runs', target:5 }
];
for (const driver of Object.values(CONFIG.DRIVERS || {})) {
  driver.bonuses = driver.bonuses || driver.bonus || {};
  driver.bonuses.speed = Number(driver.bonuses.speed) || 0;
  driver.bonuses.invFrames = Number(driver.bonuses.invFrames) || 18;
  driver.unlocked = driver.price === 0 || driver.unlocked !== false;
}
if (!CONFIG.DRIVERS.ruffneck) {
  CONFIG.DRIVERS.ruffneck = { id:'ruffneck', name:'RuffNeck Driver', title:'Kano Local', desc:'Balanced starter driver.', color:'#2f5870', price:0, unlocked:true, bonuses:{capacity:0,speed:0,horn:0,fareBonus:0,invFrames:18} };
}
CONFIG.MISSIONS = [
  { id:'first_passengers', text:'Pick up 3 passengers', type:'pax', target:3, reward:350 },
  { id:'checkpoint_run', text:'Reach the next checkpoint', type:'dist', target:0.75, reward:250 },
  { id:'earn_fare', text:'Earn ₦1,000 in fares', type:'score', target:1000, reward:400 },
  { id:'safe_distance', text:'Drive 1.5 km safely', type:'dist', target:1.5, reward:500 },
  { id:'drop_passengers', text:'Complete 4 passenger trips', type:'drop', target:4, reward:600 },
  { id:'near_misses', text:'Complete 3 safe near-misses', type:'nearmiss', target:3, reward:450 }
];
// Explicit environment descriptors let the renderer choose distinct scenery palettes.
for (const r of Object.values(CONFIG.ROUTES)) {
  if (!r.environment) {
    if (['central','west'].includes(r.zone)) r.environment = 'old-city';
    else if (['southwest'].includes(r.zone)) r.environment = 'industrial-edge';
    else if (['outer'].includes(r.zone)) r.environment = 'peri-urban';
    else if (['east'].includes(r.zone)) r.environment = 'commercial';
    else r.environment = 'residential';
  }
  r.scenery = Array.isArray(r.scenery) ? r.scenery : [];
}
