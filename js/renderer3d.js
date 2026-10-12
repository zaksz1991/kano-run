// js/systems.js
// Kano Run — world systems, missions, traffic safety, collisions, and road events.

export const DISTRICTS = [
  {
    id: "citycenter",
    name: "Kano City Centre",
    description: "Busy streets, markets, and constant traffic.",
    traffic: 1.2,
    police: 0.7,
    passengers: 1.2,
    reward: 1.0,
  },
  {
    id: "market",
    name: "Kurmi Market",
    description: "Crowded market roads with frequent stops.",
    traffic: 1.35,
    police: 0.5,
    passengers: 1.5,
    reward: 1.15,
  },
  {
    id: "sabon-gari",
    name: "Sabon Gari",
    description: "Commercial streets with mixed traffic.",
    traffic: 1.25,
    police: 0.65,
    passengers: 1.3,
    reward: 1.1,
  },
  {
    id: "residential",
    name: "Residential District",
    description: "Quieter roads and shorter passenger trips.",
    traffic: 0.75,
    police: 0.4,
    passengers: 0.8,
    reward: 0.9,
  },
  {
    id: "industrial",
    name: "Industrial District",
    description: "Heavy vehicles and long-distance fares.",
    traffic: 0.95,
    police: 0.8,
    passengers: 0.7,
    reward: 1.25,
  },
  {
    id: "highway",
    name: "Kano Expressway",
    description: "Fast roads with high-speed traffic.",
    traffic: 0.85,
    police: 0.9,
    passengers: 0.65,
    reward: 1.35,
  },
];

export const PASSENGER_CLASSES = [
  { id: "regular", name: "Regular Passenger", fare: 1, tip: 0.05 },
  { id: "business", name: "Business Passenger", fare: 1.5, tip: 0.15 },
  { id: "student", name: "Student", fare: 0.8, tip: 0.03 },
  { id: "tourist", name: "Visitor", fare: 1.8, tip: 0.2 },
  { id: "urgent", name: "Urgent Passenger", fare: 2, tip: 0.1 },
];

export const LEVEL_BANDS = [
  { level: 1, name: "Rookie Driver", xp: 0, reward: 0 },
  { level: 2, name: "Street Driver", xp: 500, reward: 250 },
  { level: 3, name: "Experienced Driver", xp: 1500, reward: 500 },
  { level: 4, name: "Professional Driver", xp: 3500, reward: 1000 },
  { level: 5, name: "Kano Veteran", xp: 7000, reward: 2000 },
  { level: 6, name: "Transport Legend", xp: 12000, reward: 3500 },
];

export const WORLD_EVENTS = [
  {
    id: "clear",
    name: "Clear Weather",
    weight: 45,
    speedMultiplier: 1,
    visibility: 1,
    rewardMultiplier: 1,
  },
  {
    id: "rain",
    name: "Rainfall",
    weight: 20,
    speedMultiplier: 0.82,
    visibility: 0.78,
    rewardMultiplier: 1.15,
  },
  {
    id: "harmattan",
    name: "Harmattan",
    weight: 15,
    speedMultiplier: 0.9,
    visibility: 0.72,
    rewardMultiplier: 1.1,
  },
  {
    id: "rushhour",
    name: "Rush Hour",
    weight: 20,
    speedMultiplier: 0.85,
    visibility: 1,
    rewardMultiplier: 1.25,
  },
];

export const COLLISION_TIERS = {
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
};

export const ROAD_EVENTS = [
  { id: "checkpoint", name: "KAROTA Checkpoint", weight: 15 },
  { id: "roadwork", name: "Roadworks Ahead", weight: 15 },
  { id: "market_crowd", name: "Market Crowd", weight: 20 },
  { id: "open_road", name: "Open Road", weight: 25 },
  { id: "passenger", name: "Passenger Waiting", weight: 25 },
];

export function getDistrict(districtId) {
  return (
    DISTRICTS.find((district) => district.id === districtId) ||
    DISTRICTS[0]
  );
}

export function getLevelBand(level = 1) {
  const safeLevel = Math.max(1, Number(level) || 1);
  let selected = LEVEL_BANDS[0];

  for (const band of LEVEL_BANDS) {
    if (safeLevel >= band.level) selected = band;
  }

  return selected;
}

export function getLevelFromXP(xp = 0) {
  const safeXP = Math.max(0, Number(xp) || 0);
  let selected = LEVEL_BANDS[0];

  for (const band of LEVEL_BANDS) {
    if (safeXP >= band.xp) selected = band;
  }

  return selected.level;
}

export function getNextLevel(level = 1) {
  const currentLevel = Math.max(1, Number(level) || 1);

  return (
    LEVEL_BANDS.find((band) => band.level > currentLevel) || null
  );
}

export function getXPProgress(xp = 0) {
  const safeXP = Math.max(0, Number(xp) || 0);
  const current = [...LEVEL_BANDS]
    .reverse()
    .find((band) => safeXP >= band.xp) || LEVEL_BANDS[0];

  const next = LEVEL_BANDS.find((band) => band.xp > safeXP);

  if (!next) {
    return {
      level: current.level,
      currentXP: safeXP,
      levelXP: current.xp,
      nextLevelXP: null,
      progress: 1,
    };
  }

  const span = next.xp - current.xp;
  const progress = span > 0 ? (safeXP - current.xp) / span : 1;

  return {
    level: current.level,
    currentXP: safeXP,
    levelXP: current.xp,
    nextLevelXP: next.xp,
    progress: Math.max(0, Math.min(1, progress)),
  };
}

export function chooseWeighted(items, random = Math.random) {
  if (!Array.isArray(items) || items.length === 0) return null;

  const validItems = items.filter(
    (item) => Number.isFinite(item.weight) && item.weight > 0
  );

  if (validItems.length === 0) {
    return items[Math.floor(random() * items.length)] || null;
  }

  const totalWeight = validItems.reduce(
    (total, item) => total + item.weight,
    0
  );

  let roll = random() * totalWeight;

  for (const item of validItems) {
    roll -= item.weight;
    if (roll <= 0) return item;
  }

  return validItems[validItems.length - 1];
}

export function chooseWorldEvent(random = Math.random) {
  return chooseWeighted(WORLD_EVENTS, random);
}

export function chooseRoadEvent(random = Math.random) {
  return chooseWeighted(ROAD_EVENTS, random);
}

export function calculateFare({
  distance = 1,
  passengerClass = "regular",
  district = "citycenter",
  eventMultiplier = 1,
  level = 1,
} = {}) {
  const passenger =
    PASSENGER_CLASSES.find((item) => item.id === passengerClass) ||
    PASSENGER_CLASSES[0];

  const area = getDistrict(district);
  const safeDistance = Math.max(0, Number(distance) || 0);
  const safeLevel = Math.max(1, Number(level) || 1);

  const baseFare = Math.max(50, safeDistance * 100);
  const levelBonus = 1 + Math.min(0.3, (safeLevel - 1) * 0.03);

  return Math.round(
    baseFare *
      passenger.fare *
      area.reward *
      Math.max(0.1, Number(eventMultiplier) || 1) *
      levelBonus
  );
}

export function calculateCollision({
  impact = 0,
  speed = 0,
} = {}) {
  const safeImpact = Math.max(0, Math.min(1, Number(impact) || 0));
  const safeSpeed = Math.max(0, Number(speed) || 0);

  const normalizedImpact = Math.min(
    1,
    safeImpact * 0.7 + Math.min(1, safeSpeed / 40) * 0.3
  );

  let tier = COLLISION_TIERS.minor;

  if (normalizedImpact >= COLLISION_TIERS.severe.minImpact) {
    tier = COLLISION_TIERS.severe;
  } else if (
    normalizedImpact >= COLLISION_TIERS.moderate.minImpact
  ) {
    tier = COLLISION_TIERS.moderate;
  }

  return {
    tier: normalizedImpact >= 0.65
      ? "severe"
      : normalizedImpact >= 0.3
        ? "moderate"
        : "minor",
    damage: tier.damage,
    moneyPenalty: tier.moneyPenalty,
    message: tier.message,
    impact: normalizedImpact,
  };
}

export function calculateKarotaFine({
  speed = 0,
  limit = 30,
  hasLicense = true,
  ignoredCheckpoint = false,
} = {}) {
  const safeSpeed = Math.max(0, Number(speed) || 0);
  const safeLimit = Math.max(1, Number(limit) || 30);
  const excess = Math.max(0, safeSpeed - safeLimit);

  let fine = 0;

  if (excess > 0) {
    fine += Math.round(excess * 20);
  }

  if (!hasLicense) fine += 1000;
  if (ignoredCheckpoint) fine += 500;

  return {
    fine,
    speeding: excess > 0,
    excessSpeed: Math.round(excess),
    message:
      fine > 0
        ? `KAROTA fine: ₦${fine.toLocaleString("en-NG")}`
        : "No traffic violation.",
  };
}

export function getRadioAnnouncement(eventId) {
  const announcements = {
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
      "A passenger is waiting nearby. Keep an eye out for pickup points.",
    ],
  };

  const options = announcements[eventId];

  if (!options || options.length === 0) return "";

  return options[Math.floor(Math.random() * options.length)];
}

export function generateRunMissions({
  count = 3,
  level = 1,
  random = Math.random,
} = {}) {
  const safeCount = Math.max(1, Math.min(10, Math.floor(count) || 3));
  const safeLevel = Math.max(1, Number(level) || 1);

  const templates = [
    {
      id: "complete_trips",
      title: "Reliable Driver",
      description: "Complete {target} passenger trips.",
      metric: "trips",
      base: 3,
      scale: 1,
      reward: 250,
      xp: 100,
    },
    {
      id: "earn_fares",
      title: "Daily Hustle",
      description: "Earn ₦{target} from fares.",
      metric: "earnings",
      base: 1000,
      scale: 500,
      reward: 300,
      xp: 120,
    },
    {
      id: "avoid_collisions",
      title: "Safe Journey",
      description: "Drive {target} metres without a collision.",
      metric: "safeDistance",
      base: 500,
      scale: 250,
      reward: 350,
      xp: 150,
    },
    {
      id: "collect_bonuses",
      title: "Bonus Hunter",
      description: "Collect {target} road bonuses.",
      metric: "bonuses",
      base: 3,
      scale: 1,
      reward: 250,
      xp: 100,
    },
    {
      id: "reach_destination",
      title: "Destination Expert",
      description: "Reach {target} destinations.",
      metric: "destinations",
      base: 2,
      scale: 1,
      reward: 300,
      xp: 120,
    },
    {
      id: "drive_distance",
      title: "Road Warrior",
      description: "Travel {target} metres.",
      metric: "distance",
      base: 1500,
      scale: 500,
      reward: 350,
      xp: 150,
    },
  ];

  const pool = templates
    .map((template) => ({
      ...template,
      target: template.base + (safeLevel - 1) * template.scale,
      reward: template.reward + (safeLevel - 1) * 50,
      xp: template.xp + (safeLevel - 1) * 20,
    }))
    .sort(() => random() - 0.5);

  return pool.slice(0, Math.min(safeCount, pool.length)).map((mission) => ({
    ...mission,
    description: mission.description.replace(
      "{target}",
      mission.target.toLocaleString("en-NG")
    ),
    progress: 0,
    completed: false,
  }));
}

export function updateMissionProgress(missions, metric, amount = 1) {
  if (!Array.isArray(missions)) return [];

  const increment = Math.max(0, Number(amount) || 0);

  return missions.map((mission) => {
    if (
      mission.metric !== metric ||
      mission.completed ||
      !Number.isFinite(mission.target)
    ) {
      return mission;
    }

    const progress = Math.min(
      mission.target,
      Math.max(0, Number(mission.progress) || 0) + increment
    );

    return {
      ...mission,
      progress,
      completed: progress >= mission.target,
    };
  });
}

export function getMissionProgress(mission) {
  const target = Math.max(1, Number(mission?.target) || 1);
  const progress = Math.max(0, Number(mission?.progress) || 0);

  return {
    progress,
    target,
    percentage: Math.max(0, Math.min(100, (progress / target) * 100)),
    completed: Boolean(mission?.completed) || progress >= target,
  };
}

export function isSafeToSpawn({
  candidateZ,
  existingVehicles = [],
  minGap = 12,
  candidateLane,
} = {}) {
  if (!Number.isFinite(candidateZ)) return false;

  const safeGap = Math.max(1, Number(minGap) || 12);

  return !existingVehicles.some((vehicle) => {
    if (!vehicle || vehicle.active === false) return false;

    const z = Number(vehicle.z ?? vehicle.position?.z);

    if (!Number.isFinite(z)) return false;

    const sameLane =
      candidateLane == null ||
      vehicle.lane == null ||
      vehicle.lane === candidateLane;

    return sameLane && Math.abs(z - candidateZ) < safeGap;
  });
}

export function findSafeLane({
  lanes = [-1, 0, 1],
  candidateZ,
  existingVehicles = [],
  minGap = 12,
  random = Math.random,
} = {}) {
  if (!Array.isArray(lanes) || lanes.length === 0) return null;

  const shuffled = [...lanes].sort(() => random() - 0.5);

  return (
    shuffled.find((lane) =>
      isSafeToSpawn({
        candidateZ,
        existingVehicles,
        minGap,
        candidateLane: lane,
      })
    ) ?? null
  );
}

export function canSpawnVehicle({
  candidateZ,
  existingVehicles = [],
  minGap = 12,
  candidateLane,
  maxVehicles = 20,
} = {}) {
  const activeVehicles = existingVehicles.filter(
    (vehicle) => vehicle && vehicle.active !== false
  );

  if (activeVehicles.length >= Math.max(1, maxVehicles)) return false;

  return isSafeToSpawn({
    candidateZ,
    existingVehicles: activeVehicles,
    minGap,
    candidateLane,
  });
}

export function getTrafficGap({
  speed = 0,
  difficulty = 1,
  minimum = 10,
  maximum = 34,
} = {}) {
  const safeSpeed = Math.max(0, Number(speed) || 0);
  const safeDifficulty = Math.max(0.5, Number(difficulty) || 1);

  return Math.max(
    minimum,
    Math.min(maximum, (10 + safeSpeed * 0.45) / safeDifficulty)
  );
}

export function hasCollision(
  first,
  second,
  padding = 0
) {
  if (!first || !second) return false;

  const ax = Number(first.x ?? first.position?.x);
  const az = Number(first.z ?? first.position?.z);
  const bx = Number(second.x ?? second.position?.x);
  const bz = Number(second.z ?? second.position?.z);

  if (![ax, az, bx, bz].every(Number.isFinite)) return false;

  const aWidth = Math.max(
    0.1,
    Number(first.width ?? first.radius * 2) || 1
  );
  const aLength = Math.max(
    0.1,
    Number(first.length ?? first.depth) || 2
  );
  const bWidth = Math.max(
    0.1,
    Number(second.width ?? second.radius * 2) || 1
  );
  const bLength = Math.max(
    0.1,
    Number(second.length ?? second.depth) || 2
  );

  const extra = Math.max(0, Number(padding) || 0);

  return (
    Math.abs(ax - bx) < (aWidth + bWidth) / 2 + extra &&
    Math.abs(az - bz) < (aLength + bLength) / 2 + extra
  );
}

export function resolveCollisionVelocity({
  playerSpeed = 0,
  obstacleSpeed = 0,
  impactFactor = 0.5,
} = {}) {
  const player = Math.max(0, Number(playerSpeed) || 0);
  const obstacle = Math.max(0, Number(obstacleSpeed) || 0);
  const factor = Math.max(
    0,
    Math.min(1, Number(impactFactor) || 0)
  );

  return Math.max(0, player - Math.max(1, (player - obstacle) * factor));
}

export function clamp(value, minimum, maximum) {
  const number = Number(value);

  if (!Number.isFinite(number)) return minimum;

  return Math.max(minimum, Math.min(maximum, number));
}