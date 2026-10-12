import { CONFIG } from "./config.js";

const asArray = (value) => {
  if (Array.isArray(value)) return value;
  if (value && typeof value === "object") return Object.values(value);
  return [];
};

const clamp = (value, min, max) =>
  Math.min(max, Math.max(min, value));

const random = (min, max) =>
  Math.random() * (max - min) + min;

const pick = (items) =>
  items.length ? items[Math.floor(Math.random() * items.length)] : null;

const weightedPick = (items) => {
  if (!items.length) return null;

  const total = items.reduce(
    (sum, item) => sum + Math.max(0, Number(item.weight) || 1),
    0
  );

  if (total <= 0) return pick(items);

  let roll = Math.random() * total;

  for (const item of items) {
    roll -= Math.max(0, Number(item.weight) || 1);
    if (roll <= 0) return item;
  }

  return items[items.length - 1];
};

export const DISTRICTS = asArray(CONFIG.ROUTES).map((route) => ({
  ...route,
  id: route.id,
  name: route.name || route.id,
}));

export const PASSENGER_CLASSES = asArray(CONFIG.PASSENGER_CLASSES).map(
  (passenger) => ({
    ...passenger,
    fareMultiplier: Number(
      passenger.fareMultiplier ?? passenger.fare ?? 1
    ),
    tipChance: Number(passenger.tipChance ?? passenger.tip ?? 0.1),
  })
);

export const LEVEL_BANDS = asArray(CONFIG.LEVELS);
export const WORLD_EVENTS = asArray(CONFIG.WEATHER);
export const COLLISION_TIERS = asArray(CONFIG.COLLISION_TIERS);
export const ROAD_EVENTS = asArray(CONFIG.ROAD_EVENTS);

export function getDistrict(id) {
  return DISTRICTS.find((district) => district.id === id) || DISTRICTS[0] || null;
}

export function getLevelBand(level = 1) {
  const bands = [...LEVEL_BANDS].sort(
    (a, b) => (Number(a.level) || 1) - (Number(b.level) || 1)
  );

  let selected = bands[0] || {
    level: 1,
    xp: 0,
    name: "Beginner",
  };

  for (const band of bands) {
    if ((Number(band.level) || 1) <= level) {
      selected = band;
    }
  }

  return selected;
}

export function getLevelFromXP(xp = 0) {
  const safeXP = Math.max(0, Number(xp) || 0);

  const bands = [...LEVEL_BANDS].sort(
    (a, b) => (Number(a.level) || 1) - (Number(b.level) || 1)
  );

  if (!bands.length) {
    const threshold = Number(CONFIG.ECONOMY?.xpPerLevel) || 100;
    return Math.max(1, Math.floor(safeXP / threshold) + 1);
  }

  let level = Number(bands[0].level) || 1;

  for (const band of bands) {
    const requiredXP = Number(band.xp ?? band.requiredXP ?? 0);

    if (safeXP >= requiredXP) {
      level = Number(band.level) || level;
    }
  }

  return level;
}

export function getNextLevel(xp = 0) {
  const currentLevel = getLevelFromXP(xp);

  const next = [...LEVEL_BANDS]
    .sort((a, b) => (Number(a.level) || 1) - (Number(b.level) || 1))
    .find((band) => (Number(band.level) || 1) > currentLevel);

  return next || null;
}

export function getXPProgress(xp = 0) {
  const currentLevel = getLevelFromXP(xp);
  const currentBand = getLevelBand(currentLevel);
  const nextBand = getNextLevel(xp);

  const currentXP = Number(currentBand?.xp ?? currentBand?.requiredXP ?? 0);
  const nextXP = Number(nextBand?.xp ?? nextBand?.requiredXP ?? currentXP + 100);

  const span = Math.max(1, nextXP - currentXP);
  const progress = clamp(((xp - currentXP) / span) * 100, 0, 100);

  return {
    level: currentLevel,
    currentXP,
    nextXP,
    progress,
    remainingXP: Math.max(0, nextXP - xp),
  };
}

export function chooseWeighted(items) {
  return weightedPick(asArray(items));
}

export function chooseWorldEvent() {
  return weightedPick(WORLD_EVENTS);
}

export function chooseRoadEvent() {
  return weightedPick(ROAD_EVENTS);
}

export function calculateFare({
  distance = 0,
  passenger = {},
  level = 1,
  multiplier = 1,
} = {}) {
  const economy = CONFIG.ECONOMY || {};

  const minimum = Number(economy.minimumFare) || 150;
  const perDistance = Number(economy.baseFarePerDistance) || 1.4;
  const levelBonus = Number(economy.fareBonusPerLevel) || 5;
  const maxBonus = Number(economy.maximumLevelFareBonus) || 500;

  const passengerMultiplier = Number(
    passenger.fareMultiplier ?? passenger.fare ?? 1
  );

  const fare = minimum +
    Math.max(0, distance) * perDistance +
    Math.min(maxBonus, Math.max(0, level) * levelBonus);

  return Math.max(
    minimum,
    Math.round(fare * passengerMultiplier * multiplier)
  );
}

export function calculateTip(fare, passenger = {}) {
  const chance = clamp(
    Number(passenger.tipChance ?? passenger.tip ?? 0.1),
    0,
    1
  );

  if (Math.random() > chance) return 0;

  return Math.round(Math.max(0, fare) * random(0.03, 0.2));
}

export function calculateCollision({
  speed = 0,
  vehicleType = "car",
  condition = 100,
} = {}) {
  const tier = COLLISION_TIERS.find((item) => {
    const minimum = Number(item.minSpeed ?? item.speedMin ?? 0);
    const maximum = Number(item.maxSpeed ?? item.speedMax ?? Infinity);

    return speed >= minimum && speed <= maximum;
  });

  const typeMultipliers = {
    motorcycle: 0.65,
    keke: 0.8,
    car: 1,
    taxi: 1,
    bus: 1.3,
    truck: 1.5,
    police: 1.1,
    karota: 1.1,
    robber: 1.2,
  };

  const baseDamage = Number(
    tier?.damage ?? tier?.conditionDamage
  ) || clamp(5 + speed * 0.35, 5, 35);

  const damage = clamp(
    baseDamage * (typeMultipliers[vehicleType] || 1),
    3,
    50
  );

  return {
    damage,
    remainingCondition: clamp(condition - damage, 0, 100),
    speedLoss: clamp(0.2 + speed / 100, 0.2, 0.8),
    severe: damage >= 25,
  };
}

export function calculateKarotaFine({
  speed = 0,
  offence = "traffic",
  level = 1,
} = {}) {
  const economy = CONFIG.ECONOMY || {};

  const base = Number(economy.karotaFine) || 500;
  const speedPenalty = Math.max(0, speed - 15) * 12;
  const levelPenalty = Math.max(0, level - 1) * 10;

  const offenceMultipliers = {
    traffic: 1,
    speeding: 1.5,
    reckless: 2,
    illegalParking: 1.2,
  };

  return Math.round(
    (base + speedPenalty + levelPenalty) *
    (offenceMultipliers[offence] || 1)
  );
}

export function getRadioAnnouncement({
  speed = 0,
  distance = 0,
  routeId = "citycenter",
} = {}) {
  const announcements = asArray(CONFIG.RADIO_ANNOUNCEMENTS);

  if (!announcements.length) {
    return `You are driving through ${getDistrict(routeId)?.name || "Kano"}.`;
  }

  const matching = announcements.filter((item) => {
    if (item.minSpeed != null && speed < item.minSpeed) return false;
    if (item.maxSpeed != null && speed > item.maxSpeed) return false;
    if (item.minDistance != null && distance < item.minDistance) return false;
    if (item.routeId && item.routeId !== routeId) return false;
    return true;
  });

  const announcement = weightedPick(matching.length ? matching : announcements);

  return announcement?.text ||
    announcement?.message ||
    announcement?.name ||
    "";
}

export function generateRunMissions(count = 3) {
  const templates = asArray(CONFIG.MISSION_TEMPLATES);
  if (!templates.length) return [];

  const shuffled = [...templates];

  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }

  return shuffled.slice(0, Math.min(count, shuffled.length)).map(
    (template, index) => ({
      ...template,
      id: template.id || `mission-${Date.now()}-${index}`,
      name: template.name || template.title || "Driving mission",
      target: Math.max(1, Number(template.target) || 1),
      progress: 0,
      completed: false,
    })
  );
}

export function updateMissionProgress(mission, event = {}) {
  if (!mission || mission.completed) return mission;

  const type = mission.type || mission.id;
  const amount = Math.max(0, Number(event.amount ?? 1));
  const target = Math.max(1, Number(mission.target) || 1);

  const eventType = event.type;

  if (!eventType || eventType === type) {
    mission.progress = Math.min(
      target,
      (Number(mission.progress) || 0) + amount
    );
  }

  mission.completed = mission.progress >= target;

  return mission;
}

export function getMissionProgress(mission) {
  const target = Math.max(1, Number(mission?.target) || 1);
  const progress = clamp(Number(mission?.progress) || 0, 0, target);

  return {
    progress,
    target,
    percentage: (progress / target) * 100,
    completed: Boolean(mission?.completed || progress >= target),
  };
}

export function isSafeToSpawn(
  candidate,
  traffic = [],
  minimumGap = 28
) {
  if (!candidate || !Number.isFinite(Number(candidate.lane))) {
    return false;
  }

  return !traffic.some((vehicle) => {
    if (vehicle.lane !== candidate.lane) return false;

    return Math.abs(
      Number(vehicle.z || 0) - Number(candidate.z || 0)
    ) < minimumGap;
  });
}

export function findSafeLane({
  traffic = [],
  preferredLane = 1,
  z = -90,
  minimumGap = 28,
  lanes = null,
} = {}) {
  const positions = Array.isArray(lanes) && lanes.length
    ? lanes
    : Array.isArray(CONFIG.LANES)
      ? CONFIG.LANES
      : CONFIG.LANES?.LANE_X || [-2.4, 0, 2.4];

  const indices = positions.map((_, index) => index);

  indices.sort(
    (a, b) =>
      Math.abs(a - preferredLane) - Math.abs(b - preferredLane)
  );

  return indices.find((lane) =>
    isSafeToSpawn({ lane, z }, traffic, minimumGap)
  ) ?? -1;
}

export function canSpawnVehicle(candidate, traffic = [], options = {}) {
  const minimumGap = Number(options.minimumGap) || 28;

  if (!isSafeToSpawn(candidate, traffic, minimumGap)) {
    return false;
  }

  const maximumVehicles = Number(options.maximumVehicles) || 32;
  return traffic.length < maximumVehicles;
}

export function getTrafficGap(candidate, traffic = []) {
  const sameLane = traffic.filter(
    (vehicle) => vehicle.lane === candidate?.lane
  );

  if (!sameLane.length) return Infinity;

  return Math.min(
    ...sameLane.map((vehicle) =>
      Math.abs(Number(vehicle.z || 0) - Number(candidate.z || 0))
    )
  );
}

export function hasCollision({
  playerLane,
  playerZ = 5.5,
  vehicleLane,
  vehicleZ,
  distance = 3.8,
} = {}) {
  return (
    playerLane === vehicleLane &&
    Math.abs(Number(vehicleZ) - playerZ) < distance
  );
}

export function resolveCollisionVelocity({
  playerSpeed = 0,
  vehicleSpeed = 0,
  restitution = 0.25,
} = {}) {
  const safeRestitution = clamp(restitution, 0, 1);

  return Math.max(
    0,
    playerSpeed * safeRestitution -
    Math.max(0, vehicleSpeed) * (1 - safeRestitution)
  );
}

export function clampValue(value, min, max) {
  return clamp(value, min, max);
}

const Systems = {
  DISTRICTS,
  PASSENGER_CLASSES,
  LEVEL_BANDS,
  WORLD_EVENTS,
  COLLISION_TIERS,
  ROAD_EVENTS,
  getDistrict,
  getLevelBand,
  getLevelFromXP,
  getNextLevel,
  getXPProgress,
  chooseWeighted,
  chooseWorldEvent,
  chooseRoadEvent,
  calculateFare,
  calculateTip,
  calculateCollision,
  calculateKarotaFine,
  getRadioAnnouncement,
  generateRunMissions,
  updateMissionProgress,
  getMissionProgress,
  isSafeToSpawn,
  findSafeLane,
  canSpawnVehicle,
  getTrafficGap,
  hasCollision,
  resolveCollisionVelocity,
  clampValue,
  clamp,
};

export default Systems;