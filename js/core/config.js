export const GAME_CONFIG = Object.freeze({
  version: "4.0.0",
  name: "Kano Run",
  subtitle: "Adaidaita Sahu",
  studio: "RuffNeck Entertainment",
  developer: "Hassan Zakariya",

  world: {
    city: "Kano",
    country: "Nigeria",
    units: "metric",
    laneCount: 3,
    laneWidth: 3.2,
    roadWidth: 12,
    segmentLength: 40,
    visibleSegments: 12,
    trafficSide: "right",
  },

  driving: {
    startSpeed: 0,
    maxSpeed: 34,
    acceleration: 9,
    braking: 18,
    naturalDeceleration: 2.4,
    steeringSpeed: 5.5,
    laneChangeDuration: 0.24,
    offRoadSpeedMultiplier: 0.55,
    collisionSpeedLoss: 0.45,
    maxCondition: 100,
    maxFuel: 100,
    fuelConsumption: 0.025,
    idleFuelConsumption: 0.002,
  },

  traffic: {
    initialVehicles: 12,
    maxVehicles: 30,
    spawnDistance: 160,
    despawnDistance: 35,
    minSpawnGap: 24,
    minFollowingDistance: 12,
    collisionDistance: 3.1,
    nearMissDistance: 4.5,
    laneChangeChance: 0.08,
    updateInterval: 0.15,
    speedVariation: 0.3,
  },

  economy: {
    startingMoney: 30000,
    baseFare: 300,
    farePerKilometer: 180,
    minimumFare: 200,
    cleanTripBonus: 500,
    nearMissBonus: 25,
    collisionPenalty: 150,
    fuelPricePerUnit: 12,
    repairPricePerCondition: 20,
  },

  progression: {
    startingLevel: 1,
    startingXP: 0,
    xpPerDelivery: 100,
    xpPerKilometer: 5,
    xpPerLevel: 500,
    maximumLevel: 50,
  },

  rendering: {
    antialias: true,
    shadows: true,
    pixelRatioLimit: 1.75,
    fieldOfView: 65,
    nearPlane: 0.1,
    farPlane: 700,
    targetFPS: 60,
    maxDelta: 0.05,
    fogNear: 80,
    fogFar: 420,
  },

  weather: {
    changeInterval: 180,
    rainGrip: 0.78,
    stormGrip: 0.62,
    harmattanVisibility: 0.55,
    rainVisibility: 0.72,
    windStrength: 1.2,
  },

  passengers: {
    maximumWaiting: 5,
    pickupRadius: 7,
    deliveryRadius: 9,
    maximumOnboard: 3,
    waitTime: 90,
    spawnInterval: 18,
  },

  routes: {
    defaultRoute: "citycenter",
    minimumDistance: 1,
    maximumStops: 10,
  },

  audio: {
    masterVolume: 0.7,
    engineVolume: 0.35,
    effectsVolume: 0.8,
    radioVolume: 0.45,
  },

  storage: {
    profileKey: "kanoRunProfileV4",
    settingsKey: "kanoRunSettingsV4",
    autosaveInterval: 15000,
  },

  controls: {
    accelerate: ["ArrowUp", "KeyW"],
    brake: ["ArrowDown", "KeyS"],
    left: ["ArrowLeft", "KeyA"],
    right: ["ArrowRight", "KeyD"],
    horn: ["KeyH"],
    pause: ["Escape", "KeyP"],
    interact: ["KeyE", "Enter"],
    handbrake: ["Space"],
  },
});

export const LANE_POSITIONS = Object.freeze([-3.2, 0, 3.2]);

export const VEHICLE_TYPES = Object.freeze({
  car: {
    label: "Private Car",
    width: 1.9,
    height: 1.5,
    length: 4.2,
    minSpeed: 10,
    maxSpeed: 27,
    weight: 1,
  },

  taxi: {
    label: "Kano Taxi",
    width: 1.9,
    height: 1.6,
    length: 4.3,
    minSpeed: 8,
    maxSpeed: 24,
    weight: 1.1,
  },

  keke: {
    label: "Adaidaita Sahu",
    width: 1.5,
    height: 1.9,
    length: 2.7,
    minSpeed: 5,
    maxSpeed: 17,
    weight: 0.65,
  },

  bus: {
    label: "Passenger Bus",
    width: 2.5,
    height: 3.2,
    length: 8.5,
    minSpeed: 6,
    maxSpeed: 20,
    weight: 2.8,
  },

  motorcycle: {
    label: "Motorcycle",
    width: 0.9,
    height: 1.5,
    length: 2.1,
    minSpeed: 12,
    maxSpeed: 30,
    weight: 0.35,
  },

  truck: {
    label: "Cargo Truck",
    width: 2.6,
    height: 3.6,
    length: 8,
    minSpeed: 5,
    maxSpeed: 18,
    weight: 3.2,
  },

  police: {
    label: "Police Vehicle",
    width: 2,
    height: 1.8,
    length: 4.5,
    minSpeed: 12,
    maxSpeed: 30,
    weight: 1.2,
  },

  karota: {
    label: "KAROTA Enforcement",
    width: 2,
    height: 1.8,
    length: 4.4,
    minSpeed: 8,
    maxSpeed: 24,
    weight: 1.2,
  },

  robber: {
    label: "Suspicious Vehicle",
    width: 1.9,
    height: 1.6,
    length: 4.3,
    minSpeed: 12,
    maxSpeed: 29,
    weight: 1,
  },
});

export const WEATHER_TYPES = Object.freeze([
  "clear",
  "cloudy",
  "rain",
  "storm",
  "harmattan",
]);

export const TIME_PERIODS = Object.freeze([
  "dawn",
  "morning",
  "afternoon",
  "dusk",
  "night",
]);

export const GAME_PHASES = Object.freeze({
  LOADING: "loading",
  MENU: "menu",
  PLAYING: "playing",
  PAUSED: "paused",
  GAME_OVER: "gameover",
});

export const KANO_DISTRICTS = Object.freeze([
  {
    id: "citycenter",
    name: "Kano City Centre",
    description: "Busy central streets and commercial traffic.",
    difficulty: 1,
    unlocked: true,
    theme: "urban",
  },
  {
    id: "sabongari",
    name: "Sabon Gari",
    description: "Crowded markets and active passenger stops.",
    difficulty: 1,
    unlocked: true,
    theme: "market",
  },
  {
    id: "fagge",
    name: "Fagge",
    description: "Dense neighbourhood streets.",
    difficulty: 2,
    unlocked: true,
    theme: "residential",
  },
  {
    id: "nassarawa",
    name: "Nassarawa",
    description: "Longer roads and mixed traffic.",
    difficulty: 2,
    unlocked: true,
    theme: "urban",
  },
  {
    id: "tarauni",
    name: "Tarauni",
    description: "Residential routes with frequent stops.",
    difficulty: 2,
    unlocked: true,
    theme: "residential",
  },
  {
    id: "gwale",
    name: "Gwale",
    description: "Busy local roads and roadside commerce.",
    difficulty: 2,
    unlocked: true,
    theme: "market",
  },
  {
    id: "kumbotso",
    name: "Kumbotso",
    description: "Suburban roads with longer journeys.",
    difficulty: 3,
    unlocked: true,
    theme: "suburban",
  },
  {
    id: "ungogo",
    name: "Ungogo",
    description: "Expanding neighbourhoods and open stretches.",
    difficulty: 3,
    unlocked: true,
    theme: "suburban",
  },
  {
    id: "dawakin-kudu",
    name: "Dawakin Kudu",
    description: "Outskirts routes with changing road conditions.",
    difficulty: 4,
    unlocked: false,
    theme: "outskirts",
  },
  {
    id: "industrial",
    name: "Industrial Route",
    description: "Heavy vehicles and challenging traffic.",
    difficulty: 5,
    unlocked: false,
    theme: "industrial",
  },
]);

export const DRIVER_CATALOG = Object.freeze([
  {
    id: "ruffneck",
    name: "RuffNeck",
    unlockLevel: 1,
    fareBonus: 0,
    steeringBonus: 0,
  },
  {
    id: "musa",
    name: "Musa",
    unlockLevel: 2,
    fareBonus: 0.03,
    steeringBonus: 0.02,
  },
  {
    id: "aisha",
    name: "Aisha",
    unlockLevel: 3,
    fareBonus: 0.05,
    steeringBonus: 0.04,
  },
  {
    id: "hadiza",
    name: "Hadiza",
    unlockLevel: 5,
    fareBonus: 0.08,
    steeringBonus: 0.03,
  },
]);

export const VEHICLE_CATALOG = Object.freeze([
  {
    id: "standard",
    name: "Standard Keke",
    unlockLevel: 1,
    price: 0,
    capacity: 3,
    speedBonus: 0,
  },
  {
    id: "luxury",
    name: "Luxury Keke",
    unlockLevel: 3,
    price: 12000,
    capacity: 3,
    speedBonus: 2,
  },
  {
    id: "cargo",
    name: "Cargo Keke",
    unlockLevel: 5,
    price: 18000,
    capacity: 2,
    speedBonus: -1,
  },
  {
    id: "open",
    name: "Open Keke",
    unlockLevel: 7,
    price: 25000,
    capacity: 3,
    speedBonus: 1,
  },
  {
    id: "police",
    name: "Police Keke",
    unlockLevel: 10,
    price: 40000,
    capacity: 2,
    speedBonus: 4,
  },
  {
    id: "karota",
    name: "KAROTA Keke",
    unlockLevel: 12,
    price: 50000,
    capacity: 2,
    speedBonus: 3,
  },
]);

export const PAINT_CATALOG = Object.freeze([
  { id: "classic", name: "Classic Green", color: 0x167447, price: 0 },
  { id: "green", name: "Emerald Green", color: 0x00a86b, price: 2500 },
  { id: "blue", name: "Electric Blue", color: 0x1976d2, price: 3500 },
  { id: "white", name: "Pearl White", color: 0xf4f4f4, price: 4000 },
  { id: "red", name: "Racing Red", color: 0xd62828, price: 5000 },
  { id: "black", name: "Midnight Black", color: 0x171717, price: 6000 },
  { id: "purple", name: "Royal Purple", color: 0x7734a8, price: 7500 },
  { id: "sand", name: "Desert Sand", color: 0xc2a878, price: 4500 },
]);

export default GAME_CONFIG;