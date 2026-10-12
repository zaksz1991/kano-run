// js/config.js
// Kano Run — Adaidaita Sahu
// Central game configuration, content, progression and persistent state.

export const VERSION = "3.0.0";

export const DEVELOPER = Object.freeze({
  name: "Hassan Zakariya",
  studio: "RuffNeck Entertainment",
  website: "https://ruffneck-entertainment.vercel.app",
  game: "Kano Run — Adaidaita Sahu",
  version: VERSION,
});

export const STORAGE_KEYS = Object.freeze({
  money: "kanoMoney",
  highScore: "kanoHigh",
  paint: "kanoPaint",
  capacity: "kanoCap",
  speed: "kanoSpeed",
  horn: "kanoHorn",
  state: "kanoRunState",
  settings: "kanoRunSettings",
  driver: "kanoRunDriver",
  vehicle: "kanoRunVehicle",
  route: "kanoRunRoute",
  achievements: "kanoRunAchievements",
  missions: "kanoRunMissions",
  statistics: "kanoRunStatistics",
  version: "kanoRunVersion",
});

export const GAME = Object.freeze({
  title: "Kano Run",
  subtitle: "Adaidaita Sahu",
  version: VERSION,

  lanes: 3,
  lanePositions: [-2.4, 0, 2.4],

  startingMoney: 1500,
  startingLives: 3,
  startingLevel: 1,
  startingXP: 0,

  startingSpeed: 5.2,
  maximumSpeed: 34,
  acceleration: 7,
  braking: 13,
  friction: 2.5,

  dayLengthMs: 150000,
  targetFPS: 60,

  playerZ: 5.5,
  roadWidth: 9,
  roadLength: 160,

  maximumTraffic: 24,
  minimumTrafficGap: 12,
  maximumTrafficGap: 34,

  collisionCooldownMs: 1200,
  passengerPickupDistance: 5,
  passengerDropoffDistance: 8,

  xpPerTrip: 100,
  xpPerBonus: 25,
  xpPerDistance: 1,

  currency: "NGN",
  currencySymbol: "₦",
  locale: "en-NG",
});

export const STATE = {
  money: GAME.startingMoney,
  highScore: 0,
  score: 0,

  xp: GAME.startingXP,
  level: GAME.startingLevel,

  lives: GAME.startingLives,
  speed: GAME.startingSpeed,

  selectedDriver: "ruffneck",
  selectedVehicle: "standard",
  selectedPaint: "classic",
  selectedRoute: "citycenter",

  vehicleCapacity: 3,
  speedUpgrade: 0,

  distance: 0,
  passengersDelivered: 0,
  passengersCollected: 0,
  collisions: 0,
  bonusesCollected: 0,

  paused: false,
  running: false,
  gameOver: false,

  weather: "clear",
  radioEnabled: true,
  soundEnabled: true,

  sessionStartedAt: null,
};

export const LANES = Object.freeze([
  { id: 0, x: -2.4, name: "Left" },
  { id: 1, x: 0, name: "Centre" },
  { id: 2, x: 2.4, name: "Right" },
]);

// -----------------------------------------------------------------------------
// ROUTES
// -----------------------------------------------------------------------------

const ROUTE_DEFINITIONS = [
  ["citycenter", "Kano City Centre", "Central Kano streets", 1.0, 1.0, 1],
  ["kurmi-market", "Kurmi Market", "Busy traditional market roads", 1.25, 1.2, 2],
  ["sabon-gari", "Sabon Gari", "Commercial streets and mixed traffic", 1.15, 1.1, 2],
  ["residential", "Residential District", "Quieter neighbourhood roads", 0.75, 0.9, 1],
  ["industrial", "Industrial District", "Factories and heavy vehicles", 0.95, 1.25, 3],
  ["highway", "Kano Expressway", "Fast-moving expressway traffic", 0.85, 1.35, 4],
  ["nassarawa", "Nassarawa", "Urban roads and residential traffic", 1.0, 1.05, 2],
  ["fagge", "Fagge", "Crowded streets and local commerce", 1.3, 1.1, 2],
  ["dawakin-kudu", "Dawakin Kudu", "Suburban roads and passenger stops", 0.8, 1.0, 3],
  ["tarauni", "Tarauni", "Residential and commercial routes", 0.95, 1.05, 2],
  ["gwale", "Gwale", "Busy neighbourhood roads", 1.05, 1.0, 2],
  ["kumbotso", "Kumbotso", "Outer-city roads and junctions", 0.8, 1.15, 3],
  ["ungogo", "Ungogo", "Suburban streets and open roads", 0.8, 1.1, 3],
  ["dutse", "Dutse Road", "Long connecting roads", 0.85, 1.2, 3],
  ["zaria-road", "Zaria Road", "Busy arterial road", 1.05, 1.2, 3],
  ["bompai", "Bompai", "Industrial traffic and warehouses", 0.95, 1.25, 3],
  ["sharada", "Sharada", "Industrial estate and freight traffic", 0.9, 1.3, 4],
  ["challawa", "Challawa", "Industrial roads and heavy vehicles", 0.85, 1.3, 4],
  ["hotoro", "Hotoro", "Commercial roads and junctions", 1.0, 1.1, 2],
  ["gyadi-gyadi", "Gyadi-Gyadi", "Residential and connecting streets", 0.8, 1.0, 2],
  ["badawa", "Badawa", "Neighbourhood passenger routes", 0.8, 0.95, 2],
  ["dorayi", "Dorayi", "Residential streets", 0.75, 0.95, 2],
  ["giginyu", "Giginyu", "Urban neighbourhood roads", 0.85, 1.0, 2],
  ["kano-zoo", "Kano Zoo Road", "Visitor traffic and local roads", 0.9, 1.15, 2],
  ["stadium", "Stadium District", "Event traffic and busy junctions", 1.2, 1.2, 3],
  ["airport-road", "Airport Road", "Airport connections and fast traffic", 0.9, 1.3, 3],
  ["airport", "Mallam Aminu Kano Airport", "Airport access roads", 0.85, 1.4, 4],
  ["railway", "Railway District", "Commercial and transport connections", 1.05, 1.1, 2],
  ["sabongari-market", "Sabon Gari Market", "Dense shopping district", 1.35, 1.15, 3],
  ["dawanau", "Dawanau Road", "Long-distance commercial traffic", 0.85, 1.25, 3],
  ["gwarzo-road", "Gwarzo Road", "Mixed urban and suburban traffic", 0.9, 1.15, 3],
  ["madobi-road", "Madobi Road", "Outer-city connecting roads", 0.8, 1.1, 3],
  ["hadejia-road", "Hadejia Road", "Commercial arterial traffic", 0.95, 1.2, 3],
  ["bayero", "Bayero University", "Campus traffic and student pickups", 0.85, 1.0, 2],
  ["auditorium", "University District", "Campus roads and pedestrian activity", 0.9, 1.0, 2],
  ["palace", "Emir's Palace District", "Historic district and local traffic", 0.9, 1.1, 3],
  ["old-city", "Kano Old City", "Narrow traditional streets", 1.25, 1.05, 3],
  ["dala-hill", "Dala Hill", "Historic routes and steep-road scenery", 0.8, 1.15, 4],
  ["kurmi-gates", "Ancient City Gates", "Traditional city approaches", 1.1, 1.1, 3],
  ["farm-centre", "Farm Centre", "Shopping traffic and busy junctions", 1.15, 1.1, 3],
  ["gidan-makama", "Gidan Makama", "Historic neighbourhood roads", 0.9, 1.05, 3],
  ["kofar-ruwa", "Kofar Ruwa", "Commercial traffic and passenger stops", 1.2, 1.1, 3],
  ["kofar-nassarawa", "Kofar Nassarawa", "Busy junctions and local commerce", 1.15, 1.1, 3],
  ["kofar-kudu", "Kofar Kudu", "Historic roads and city traffic", 1.0, 1.1, 3],
  ["ring-road", "Kano Ring Road", "Long urban bypass", 0.85, 1.3, 4],
  ["northern-bypass", "Northern Bypass", "High-speed bypass traffic", 0.7, 1.4, 5],
  ["southern-bypass", "Southern Bypass", "Fast traffic and long routes", 0.75, 1.4, 5],
  ["night-market", "Night Market", "Evening commerce and dense traffic", 1.3, 1.2, 4],
  ["festival-route", "Festival Route", "Crowds, events and temporary road closures", 1.4, 1.25, 5],
  ["grand-tour", "Grand Kano Tour", "A demanding route across Kano", 1.15, 1.5, 6],
];

export const ROUTES = Object.freeze(
  ROUTE_DEFINITIONS.map(
    ([id, name, description, traffic, reward, unlockLevel], index) =>
      Object.freeze({
        id,
        name,
        description,
        traffic,
        reward,
        unlockLevel,
        index,
        unlockedByDefault: unlockLevel === 1,
      })
  )
);

// -----------------------------------------------------------------------------
// DRIVERS
// -----------------------------------------------------------------------------

export const DRIVERS = Object.freeze([
  {
    id: "ruffneck",
    name: "RuffNeck",
    description: "The default Kano Run driver.",
    unlockLevel: 1,
    price: 0,
    color: "#00b4d8",
    unlockedByDefault: true,
  },
  {
    id: "musa",
    name: "Musa",
    description: "A steady driver who knows the city.",
    unlockLevel: 1,
    price: 0,
    color: "#27864b",
    unlockedByDefault: true,
  },
  {
    id: "aisha",
    name: "Aisha",
    description: "A focused driver with quick reactions.",
    unlockLevel: 2,
    price: 1500,
    color: "#e85d9e",
  },
  {
    id: "hadiza",
    name: "Hadiza",
    description: "A confident urban route specialist.",
    unlockLevel: 3,
    price: 2500,
    color: "#8b5cf6",
  },
  {
    id: "baba",
    name: "Baba",
    description: "An experienced veteran of Kano roads.",
    unlockLevel: 3,
    price: 3000,
    color: "#b7793e",
  },
  {
    id: "mama",
    name: "Mama",
    description: "A dependable driver for busy streets.",
    unlockLevel: 4,
    price: 3500,
    color: "#f59e0b",
  },
  {
    id: "mayen",
    name: "Mayen",
    description: "A determined driver built for long routes.",
    unlockLevel: 5,
    price: 5000,
    color: "#ef4444",
  },
  {
    id: "uztaz",
    name: "Uztaz",
    description: "A disciplined driver who values safe journeys.",
    unlockLevel: 5,
    price: 5000,
    color: "#64748b",
  },
  {
    id: "sani",
    name: "Sani",
    description: "A street-smart driver with city experience.",
    unlockLevel: 6,
    price: 6500,
    color: "#14b8a6",
  },
]);

// -----------------------------------------------------------------------------
// VEHICLES
// -----------------------------------------------------------------------------

export const VEHICLES = Object.freeze([
  {
    id: "standard",
    name: "Standard Adaidaita Sahu",
    type: "keke",
    description: "A dependable three-wheeler for daily passenger trips.",
    unlockLevel: 1,
    price: 0,
    capacity: 3,
    speed: 18,
    acceleration: 1,
    handling: 1,
    durability: 1,
    width: 1.45,
    length: 2.4,
    color: "#fbbf24",
    unlockedByDefault: true,
  },
  {
    id: "luxury",
    name: "Luxury Keke",
    type: "keke",
    description: "An upgraded passenger vehicle with improved handling.",
    unlockLevel: 3,
    price: 7000,
    capacity: 4,
    speed: 21,
    acceleration: 1.05,
    handling: 1.1,
    durability: 1.05,
    width: 1.5,
    length: 2.5,
  },
  {
    id: "cargo",
    name: "Cargo Keke",
    type: "keke",
    description: "A utility three-wheeler for cargo and delivery jobs.",
    unlockLevel: 5,
    price: 11000,
    capacity: 2,
    speed: 17,
    acceleration: 0.9,
    handling: 0.9,
    durability: 1.4,
    width: 1.65,
    length: 2.8,
  },
  {
    id: "open",
    name: "Open Keke",
    type: "keke",
    description: "A lightweight vehicle with responsive acceleration.",
    unlockLevel: 7,
    price: 15000,
    capacity: 3,
    speed: 23,
    acceleration: 1.2,
    handling: 1.15,
    durability: 0.9,
    width: 1.4,
    length: 2.35,
  },
  {
    id: "police",
    name: "Traffic Patrol Keke",
    type: "police",
    description: "A special patrol vehicle for traffic-related missions.",
    unlockLevel: 10,
    price: 25000,
    capacity: 2,
    speed: 25,
    acceleration: 1.15,
    handling: 1.1,
    durability: 1.2,
    width: 1.5,
    length: 2.6,
  },
  {
    id: "karota",
    name: "KAROTA Patrol",
    type: "karota",
    description: "A traffic enforcement vehicle for special missions.",
    unlockLevel: 12,
    price: 35000,
    capacity: 2,
    speed: 26,
    acceleration: 1.1,
    handling: 1.15,
    durability: 1.3,
    width: 1.6,
    length: 2.8,
  },
]);

export const TRAFFIC_VEHICLES = Object.freeze([
  {
    id: "car",
    name: "Private Car",
    type: "car",
    width: 1.8,
    length: 4.2,
    speedMin: 8,
    speedMax: 24,
    weight: 25,
  },
  {
    id: "keke",
    name: "Traffic Keke",
    type: "keke",
    width: 1.45,
    length: 2.4,
    speedMin: 5,
    speedMax: 16,
    weight: 25,
  },
  {
    id: "taxi",
    name: "Taxi",
    type: "taxi",
    width: 1.8,
    length: 4.3,
    speedMin: 7,
    speedMax: 22,
    weight: 15,
  },
  {
    id: "bus",
    name: "Passenger Bus",
    type: "bus",
    width: 2.2,
    length: 6.5,
    speedMin: 5,
    speedMax: 17,
    weight: 12,
  },
  {
    id: "motorcycle",
    name: "Motorcycle",
    type: "motorcycle",
    width: 0.8,
    length: 1.9,
    speedMin: 10,
    speedMax: 28,
    weight: 15,
  },
  {
    id: "truck",
    name: "Heavy Truck",
    type: "truck",
    width: 2.4,
    length: 7,
    speedMin: 4,
    speedMax: 14,
    weight: 5,
  },
  {
    id: "police",
    name: "Police Vehicle",
    type: "police",
    width: 1.9,
    length: 4.5,
    speedMin: 9,
    speedMax: 25,
    weight: 2,
  },
  {
    id: "karota",
    name: "KAROTA Vehicle",
    type: "karota",
    width: 1.9,
    length: 4.5,
    speedMin: 7,
    speedMax: 20,
    weight: 2,
  },
  {
    id: "robber",
    name: "Robber Vehicle",
    type: "robber",
    width: 1.8,
    length: 4.2,
    speedMin: 12,
    speedMax: 27,
    weight: 1,
  },
]);

// -----------------------------------------------------------------------------
// PAINT JOBS
// -----------------------------------------------------------------------------

export const PAINTS = Object.freeze([
  {
    id: "classic",
    name: "Kano Classic",
    color: "#fbbf24",
    price: 0,
    unlockLevel: 1,
    unlockedByDefault: true,
  },
  {
    id: "green",
    name: "Arewa Green",
    color: "#168447",
    price: 1500,
    unlockLevel: 1,
  },
  {
    id: "blue",
    name: "Kano Blue",
    color: "#1976d2",
    price: 2000,
    unlockLevel: 2,
  },
  {
    id: "white",
    name: "Pearl White",
    color: "#f5f5f5",
    price: 2500,
    unlockLevel: 2,
  },
  {
    id: "red",
    name: "Street Red",
    color: "#dc2626",
    price: 3000,
    unlockLevel: 3,
  },
  {
    id: "black",
    name: "Midnight Black",
    color: "#222222",
    price: 4000,
    unlockLevel: 4,
  },
  {
    id: "purple",
    name: "Royal Purple",
    color: "#7e22ce",
    price: 5000,
    unlockLevel: 5,
  },
  {
    id: "sand",
    name: "Desert Sand",
    color: "#c2a878",
    price: 3500,
    unlockLevel: 3,
  },
]);

// -----------------------------------------------------------------------------
// UPGRADES
// -----------------------------------------------------------------------------

export const UPGRADES = Object.freeze({
  speed: Object.freeze({
    id: "speed",
    name: "Engine Upgrade",
    description: "Increase maximum vehicle speed.",
    maxLevel: 5,
    basePrice: 2500,
    priceMultiplier: 1.8,
    effectPerLevel: 0.08,
  }),

  handling: Object.freeze({
    id: "handling",
    name: "Handling Upgrade",
    description: "Improve steering response.",
    maxLevel: 5,
    basePrice: 2000,
    priceMultiplier: 1.7,
    effectPerLevel: 0.1,
  }),

  brakes: Object.freeze({
    id: "brakes",
    name: "Brake Upgrade",
    description: "Reduce stopping distance.",
    maxLevel: 5,
    basePrice: 1800,
    priceMultiplier: 1.65,
    effectPerLevel: 0.1,
  }),

  durability: Object.freeze({
    id: "durability",
    name: "Body Reinforcement",
    description: "Reduce collision damage.",
    maxLevel: 5,
    basePrice: 3000,
    priceMultiplier: 1.9,
    effectPerLevel: 0.12,
  }),

  capacity: Object.freeze({
    id: "capacity",
    name: "Passenger Capacity",
    description: "Increase passenger capacity where supported.",
    maxLevel: 3,
    basePrice: 3500,
    priceMultiplier: 2,
    effectPerLevel: 1,
  }),
});

// -----------------------------------------------------------------------------
// WORLD AND WEATHER
// -----------------------------------------------------------------------------

export const WEATHER = Object.freeze([
  {
    id: "clear",
    name: "Clear Weather",
    weight: 45,
    speedMultiplier: 1,
    visibility: 1,
    rewardMultiplier: 1,
    grip: 1,
  },
  {
    id: "rain",
    name: "Rainfall",
    weight: 20,
    speedMultiplier: 0.82,
    visibility: 0.78,
    rewardMultiplier: 1.15,
    grip: 0.75,
  },
  {
    id: "harmattan",
    name: "Harmattan",
    weight: 15,
    speedMultiplier: 0.9,
    visibility: 0.72,
    rewardMultiplier: 1.1,
    grip: 0.9,
  },
  {
    id: "rushhour",
    name: "Rush Hour",
    weight: 20,
    speedMultiplier: 0.85,
    visibility: 1,
    rewardMultiplier: 1.25,
    grip: 1,
  },
]);

export const TIME_OF_DAY = Object.freeze({
  day: {
    id: "day",
    name: "Daytime",
    ambientIntensity: 1,
    trafficMultiplier: 1,
  },
  evening: {
    id: "evening",
    name: "Evening",
    ambientIntensity: 0.65,
    trafficMultiplier: 1.15,
  },
  night: {
    id: "night",
    name: "Night",
    ambientIntensity: 0.3,
    trafficMultiplier: 0.85,
  },
});

// -----------------------------------------------------------------------------
// ECONOMY AND PASSENGERS
// -----------------------------------------------------------------------------

export const PASSENGER_CLASSES = Object.freeze([
  { id: "regular", name: "Regular Passenger", fareMultiplier: 1, tipChance: 0.05 },
  { id: "business", name: "Business Passenger", fareMultiplier: 1.5, tipChance: 0.15 },
  { id: "student", name: "Student", fareMultiplier: 0.8, tipChance: 0.03 },
  { id: "tourist", name: "Visitor", fareMultiplier: 1.8, tipChance: 0.2 },
  { id: "urgent", name: "Urgent Passenger", fareMultiplier: 2, tipChance: 0.1 },
]);

export const ECONOMY = Object.freeze({
  minimumFare: 50,
  baseFarePerDistance: 100,
  maximumLevelFareBonus: 0.3,
  fareBonusPerLevel: 0.03,

  bonusMinimum: 50,
  bonusMaximum: 500,

  collisionMinorPenalty: 0,
  collisionModeratePenalty: 50,
  collisionSeverePenalty: 150,

  speedingFinePerUnit: 20,
  unlicensedFine: 1000,
  ignoredCheckpointFine: 500,

  tripXP: 100,
  bonusXP: 25,
  safeDrivingXP: 10,
});

// -----------------------------------------------------------------------------
// PROGRESSION
// -----------------------------------------------------------------------------

export const LEVELS = Object.freeze([
  { level: 1, name: "Rookie Driver", xp: 0, reward: 0 },
  { level: 2, name: "Street Driver", xp: 500, reward: 250 },
  { level: 3, name: "Experienced Driver", xp: 1500, reward: 500 },
  { level: 4, name: "Professional Driver", xp: 3500, reward: 1000 },
  { level: 5, name: "Kano Veteran", xp: 7000, reward: 2000 },
  { level: 6, name: "Transport Legend", xp: 12000, reward: 3500 },
  { level: 7, name: "Road Master", xp: 19000, reward: 5000 },
  { level: 8, name: "Arewa Champion", xp: 29000, reward: 7500 },
  { level: 9, name: "Kano Icon", xp: 42000, reward: 10000 },
  { level: 10, name: "Transport Tycoon", xp: 60000, reward: 15000 },
]);

export const ACHIEVEMENTS = Object.freeze([
  {
    id: "first_trip",
    name: "First Passenger",
    description: "Complete your first passenger trip.",
    metric: "passengersDelivered",
    target: 1,
    reward: 250,
    xp: 50,
  },
  {
    id: "ten_trips",
    name: "Reliable Driver",
    description: "Complete ten passenger trips.",
    metric: "passengersDelivered",
    target: 10,
    reward: 1000,
    xp: 200,
  },
  {
    id: "distance_5000",
    name: "Road Explorer",
    description: "Travel 5,000 metres.",
    metric: "distance",
    target: 5000,
    reward: 1000,
    xp: 250,
  },
  {
    id: "bonus_25",
    name: "Bonus Hunter",
    description: "Collect 25 bonuses.",
    metric: "bonusesCollected",
    target: 25,
    reward: 1500,
    xp: 300,
  },
  {
    id: "safe_driver",
    name: "Safe Driver",
    description: "Complete five trips without a collision.",
    metric: "safeTrips",
    target: 5,
    reward: 2000,
    xp: 400,
  },
]);

// -----------------------------------------------------------------------------
// MISSIONS AND ROAD EVENTS
// -----------------------------------------------------------------------------

export const ROAD_EVENTS = Object.freeze([
  { id: "checkpoint", name: "KAROTA Checkpoint", weight: 15 },
  { id: "roadwork", name: "Roadworks Ahead", weight: 15 },
  { id: "market_crowd", name: "Market Crowd", weight: 20 },
  { id: "open_road", name: "Open Road", weight: 25 },
  { id: "passenger", name: "Passenger Waiting", weight: 25 },
]);

export const MISSION_TEMPLATES = Object.freeze([
  {
    id: "complete_trips",
    title: "Reliable Driver",
    description: "Complete {target} passenger trips.",
    metric: "trips",
    baseTarget: 3,
    targetPerLevel: 1,
    reward: 250,
    xp: 100,
  },
  {
    id: "earn_fares",
    title: "Daily Hustle",
    description: "Earn ₦{target} from fares.",
    metric: "earnings",
    baseTarget: 1000,
    targetPerLevel: 500,
    reward: 300,
    xp: 120,
  },
  {
    id: "avoid_collisions",
    title: "Safe Journey",
    description: "Drive {target} metres without a collision.",
    metric: "safeDistance",
    baseTarget: 500,
    targetPerLevel: 250,
    reward: 350,
    xp: 150,
  },
  {
    id: "collect_bonuses",
    title: "Bonus Hunter",
    description: "Collect {target} road bonuses.",
    metric: "bonuses",
    baseTarget: 3,
    targetPerLevel: 1,
    reward: 250,
    xp: 100,
  },
  {
    id: "reach_destination",
    title: "Destination Expert",
    description: "Reach {target} destinations.",
    metric: "destinations",
    baseTarget: 2,
    targetPerLevel: 1,
    reward: 300,
    xp: 120,
  },
  {
    id: "drive_distance",
    title: "Road Warrior",
    description: "Travel {target} metres.",
    metric: "distance",
    baseTarget: 1500,
    targetPerLevel: 500,
    reward: 350,
    xp: 150,
  },
]);

// -----------------------------------------------------------------------------
// COLLISIONS AND TRAFFIC
// -----------------------------------------------------------------------------

export const COLLISION_TIERS = Object.freeze({
  minor: {
    minImpact: 0,
    maxImpact: 0.3,
    damage: 1,
    moneyPenalty: 0,
    message: "Minor bump. Watch the road.",
  },

  moderate: {
    minImpact: 0.3,
    maxImpact: 0.65,
    damage: 1,
    moneyPenalty: 50,
    message: "Collision! Drive more carefully.",
  },

  severe: {
    minImpact: 0.65,
    maxImpact: 1,
    damage: 2,
    moneyPenalty: 150,
    message: "Heavy collision! Reduce your speed.",
  },
});

export const TRAFFIC = Object.freeze({
  maximumVehicles: 24,
  minimumSpawnGap: 12,
  maximumSpawnGap: 34,

  minimumLaneChangeCooldown: 1.2,
  minimumVehicleSpeed: 4,
  maximumVehicleSpeed: 28,

  preventOverlappingSpawns: true,
  preventSameLaneRearEndSpawns: true,
  avoidOccupiedLanes: true,

  collisionPadding: 0.15,
  collisionCooldownMs: 1200,
});

// -----------------------------------------------------------------------------
// CONTROLS
// -----------------------------------------------------------------------------

export const CONTROLS = Object.freeze({
  keyboard: Object.freeze({
    left: ["ArrowLeft", "KeyA"],
    right: ["ArrowRight", "KeyD"],
    accelerate: ["ArrowUp", "KeyW"],
    brake: ["ArrowDown", "KeyS"],
    pause: ["Escape", "KeyP"],
    horn: ["KeyH"],
    radio: ["KeyR"],
  }),

  mobile: Object.freeze({
    enabled: true,
    leftButton: "left",
    rightButton: "right",
    accelerateButton: "accelerate",
    brakeButton: "brake",
    pauseButton: "pause",
    hornButton: "horn",
  }),
});

// -----------------------------------------------------------------------------
// RADIO
// -----------------------------------------------------------------------------

export const RADIO_STATIONS = Object.freeze([
  {
    id: "arewa",
    name: "Arewa Radio",
    description: "Northern Nigerian atmosphere and announcements.",
    color: "#168447",
  },
  {
    id: "dala",
    name: "Dala FM",
    description: "Kano-inspired radio identity.",
    color: "#00b4d8",
  },
  {
    id: "freedom",
    name: "Freedom Radio",
    description: "Local traffic updates and city announcements.",
    color: "#fbbf24",
  },
]);

export const RADIO_ANNOUNCEMENTS = Object.freeze({
  clear: [
    "The road is clear. Drive safely, Kano.",
    "Good conditions today. Keep your eyes on the road.",
  ],

  rain: [
    "Rain is falling. Slow down and keep your distance.",
    "Wet roads ahead. Avoid sudden braking.",
  ],

  harmattan: [
    "Harmattan conditions. Visibility may be reduced.",
    "Dust in the air. Keep a safe distance from other vehicles.",
  ],

  rushhour: [
    "Rush hour traffic. Allow extra time for your journey.",
    "Traffic is building up. Stay patient and drive carefully.",
  ],

  checkpoint: [
    "KAROTA checkpoint ahead. Follow traffic instructions.",
  ],

  roadwork: [
    "Roadworks ahead. Reduce speed and follow the road markings.",
  ],

  market_crowd: [
    "Busy market area ahead. Watch for pedestrians.",
  ],

  open_road: [
    "The road ahead is open. Maintain a safe speed.",
  ],

  passenger: [
    "A passenger is waiting nearby. Watch for pickup points.",
  ],
});

// -----------------------------------------------------------------------------
// VISUALS AND PERFORMANCE
// -----------------------------------------------------------------------------

export const VISUALS = Object.freeze({
  backgroundColor: 0x87ceeb,
  fogColor: 0xc9d9e8,
  fogNear: 35,
  fogFar: 180,

  roadColor: 0x30343b,
  roadMarkingColor: 0xf5f5f5,
  laneMarkingColor: 0xfbbf24,

  ambientLightIntensity: 0.8,
  sunLightIntensity: 1.6,

  shadowMapEnabled: true,
  antialias: true,

  pixelRatioLimit: 1.75,

  roadSegmentLength: 40,
  roadSegmentCount: 5,

  roadsideSpacing: 12,
  roadsideVariation: true,
});

export const PERFORMANCE = Object.freeze({
  targetFPS: 60,
  maximumPixelRatio: 1.75,
  maximumParticles: 250,
  maximumTrafficMeshes: 32,
  maximumEffects: 40,

  disposeInactiveObjects: true,
  reuseVehicleMeshes: true,
  reuseParticleObjects: true,
});

// -----------------------------------------------------------------------------
// SETTINGS
// -----------------------------------------------------------------------------

export const DEFAULT_SETTINGS = Object.freeze({
  masterVolume: 0.7,
  musicVolume: 0.55,
  effectsVolume: 0.8,

  soundEnabled: true,
  radioEnabled: true,

  vibrationEnabled: true,
  showFPS: false,

  quality: "high",
  controlScheme: "auto",

  cameraShake: true,
  subtitles: true,
});

// -----------------------------------------------------------------------------
// COMBINED CONFIGURATION
// -----------------------------------------------------------------------------

export const CONFIG = Object.freeze({
  VERSION,
  DEVELOPER,
  GAME,
  LANES,

  ROUTES,
  DRIVERS,
  VEHICLES,
  TRAFFIC_VEHICLES,
  PAINTS,
  UPGRADES,

  WEATHER,
  TIME_OF_DAY,

  PASSENGER_CLASSES,
  ECONOMY,

  LEVELS,
  ACHIEVEMENTS,

  ROAD_EVENTS,
  MISSION_TEMPLATES,
  COLLISION_TIERS,
  TRAFFIC,

  CONTROLS,

  RADIO_STATIONS,
  RADIO_ANNOUNCEMENTS,

  VISUALS,
  PERFORMANCE,
  DEFAULT_SETTINGS,

  STORAGE_KEYS,
});

export default CONFIG;