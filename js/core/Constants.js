export const GAME_VERSION = "4.0.0";

export const GAME_EVENTS = Object.freeze({
  GAME_READY: "game:ready",
  GAME_STARTED: "game:started",
  GAME_PAUSED: "game:paused",
  GAME_RESUMED: "game:resumed",
  GAME_OVER: "game:over",
  GAME_RESTARTED: "game:restarted",
  GAME_DESTROYED: "game:destroyed",

  PLAYER_CREATED: "player:created",
  PLAYER_MOVED: "player:moved",
  PLAYER_DAMAGED: "player:damaged",
  PLAYER_CRASHED: "player:crashed",
  PLAYER_RESPAWNED: "player:respawned",

  VEHICLE_SPAWNED: "vehicle:spawned",
  VEHICLE_REMOVED: "vehicle:removed",
  VEHICLE_COLLISION: "vehicle:collision",
  VEHICLE_NEAR_MISS: "vehicle:near-miss",

  PASSENGER_WAITING: "passenger:waiting",
  PASSENGER_PICKED_UP: "passenger:picked-up",
  PASSENGER_DROPPED_OFF: "passenger:dropped-off",
  PASSENGER_CANCELLED: "passenger:cancelled",

  MISSION_STARTED: "mission:started",
  MISSION_UPDATED: "mission:updated",
  MISSION_COMPLETED: "mission:completed",
  MISSION_FAILED: "mission:failed",

  MONEY_CHANGED: "economy:money-changed",
  FARE_EARNED: "economy:fare-earned",
  BONUS_EARNED: "economy:bonus-earned",
  PURCHASE_COMPLETED: "economy:purchase-completed",

  LEVEL_UP: "progression:level-up",
  XP_EARNED: "progression:xp-earned",
  ITEM_UNLOCKED: "progression:item-unlocked",

  ROUTE_CHANGED: "route:changed",
  ROUTE_COMPLETED: "route:completed",
  CHECKPOINT_REACHED: "route:checkpoint-reached",

  WEATHER_CHANGED: "weather:changed",
  TIME_CHANGED: "world:time-changed",

  GARAGE_OPENED: "garage:opened",
  VEHICLE_SELECTED: "garage:vehicle-selected",
  PAINT_CHANGED: "garage:paint-changed",

  SETTINGS_CHANGED: "settings:changed",
  AUDIO_CHANGED: "audio:changed",

  LOADING_PROGRESS: "loading:progress",
  LOADING_COMPLETED: "loading:completed",
  LOADING_ERROR: "loading:error",

  UI_SHOW: "ui:show",
  UI_HIDE: "ui:hide",
  NOTIFICATION: "ui:notification",
});

export const GAME_STATES = Object.freeze({
  BOOTING: "booting",
  LOADING: "loading",
  READY: "ready",
  PLAYING: "playing",
  PAUSED: "paused",
  GAME_OVER: "game-over",
  DESTROYED: "destroyed",
});

export const INPUT_ACTIONS = Object.freeze({
  ACCELERATE: "accelerate",
  BRAKE: "brake",
  STEER_LEFT: "steer-left",
  STEER_RIGHT: "steer-right",
  HANDBRAKE: "handbrake",
  HORN: "horn",
  PAUSE: "pause",
  INTERACT: "interact",
  CAMERA_TOGGLE: "camera-toggle",
  LOOK_BACK: "look-back",
});

export const STORAGE_KEYS = Object.freeze({
  SAVE: "kanoRunSaveV4",
  SETTINGS: "kanoRunSettingsV4",
  MONEY: "kanoMoney",
  HIGH_SCORE: "kanoHigh",
  PAINT: "kanoPaint",
  CAPACITY: "kanoCap",
  SPEED: "kanoSpeed",
  HORN: "kanoHorn",
  SELECTED_DRIVER: "kanoRunSelectedDriver",
  SELECTED_VEHICLE: "kanoRunSelectedVehicle",
  SELECTED_ROUTE: "kanoRunSelectedRoute",
});

export const WORLD = Object.freeze({
  ROAD_WIDTH: 12,
  LANE_COUNT: 3,
  LANE_WIDTH: 3.2,
  LANE_POSITIONS: [-3.2, 0, 3.2],

  ROAD_LENGTH: 180,
  ROAD_SEGMENT_LENGTH: 30,
  ROAD_SEGMENT_COUNT: 6,

  PLAYER_START_X: 0,
  PLAYER_START_Y: 0,
  PLAYER_START_Z: 5,

  SPAWN_DISTANCE: 100,
  DESPAWN_DISTANCE: 35,

  WORLD_GRAVITY: 9.81,
  FIXED_TIME_STEP: 1 / 60,
  MAX_FRAME_DELTA: 0.1,
});

export const PLAYER = Object.freeze({
  STARTING_LIVES: 3,
  STARTING_MONEY: 2500,
  STARTING_LEVEL: 1,
  STARTING_XP: 0,

  MAX_HEALTH: 100,
  COLLISION_DAMAGE: 25,
  CRASH_INVULNERABILITY_MS: 1500,

  BASE_SPEED: 5.2,
  MAX_SPEED: 34,
  ACCELERATION: 8,
  BRAKING_FORCE: 16,
  STEERING_SPEED: 7,
  FRICTION: 2.5,

  BASE_CAPACITY: 3,
  MAX_CAPACITY: 8,

  HORN_COOLDOWN_MS: 800,
});

export const TRAFFIC = Object.freeze({
  MIN_VEHICLES: 5,
  MAX_VEHICLES: 18,
  SPAWN_INTERVAL_MS: 1400,

  MIN_SPEED: 5,
  MAX_SPEED: 24,

  SAFE_FOLLOW_DISTANCE: 9,
  MIN_SPAWN_DISTANCE: 22,
  MIN_LATERAL_DISTANCE: 2.4,

  COLLISION_COOLDOWN_MS: 700,
  NEAR_MISS_DISTANCE: 2.2,
  NEAR_MISS_REWARD: 50,
});

export const ECONOMY = Object.freeze({
  BASE_FARE: 250,
  FARE_PER_KM: 180,
  CLEAN_DRIVING_BONUS: 100,
  MISSION_COMPLETION_BONUS: 500,
  PASSENGER_TIP_CHANCE: 0.25,
  MAX_DAILY_BONUS: 5000,
});

export const PROGRESSION = Object.freeze({
  XP_PER_METER: 0.02,
  XP_PER_PASSENGER: 100,
  XP_PER_MISSION: 250,
  XP_PER_CLEAN_TRIP: 75,

  XP_LEVEL_BASE: 500,
  XP_LEVEL_MULTIPLIER: 1.35,
  MAX_LEVEL: 100,
});

export const WEATHER_TYPES = Object.freeze([
  "clear",
  "cloudy",
  "rain",
  "dust",
  "fog",
]);

export const TIME_PERIODS = Object.freeze({
  DAWN: { start: 5, end: 7 },
  MORNING: { start: 7, end: 12 },
  AFTERNOON: { start: 12, end: 16 },
  EVENING: { start: 16, end: 19 },
  NIGHT: { start: 19, end: 5 },
});

export const DISTRICT_IDS = Object.freeze([
  "citycenter",
  "sabongari",
  "nassarawa",
  "fagge",
  "kumbotso",
  "tarauni",
  "gwale",
  "dawakin-kudu",
  "hotoro",
  "zaria-road",
]);

export const VEHICLE_TYPES = Object.freeze([
  "keke",
  "car",
  "taxi",
  "bus",
  "motorcycle",
  "truck",
  "police",
  "karota",
  "robber",
]);

export const VEHICLE_UNLOCK_LEVELS = Object.freeze({
  standard: 1,
  luxury: 3,
  cargo: 5,
  open: 7,
  police: 10,
  karota: 12,
});

export const PAINT_COLORS = Object.freeze({
  classic: "#fbbf24",
  green: "#16a34a",
  blue: "#2563eb",
  white: "#f8fafc",
  red: "#dc2626",
  black: "#171717",
  purple: "#9333ea",
  sand: "#c2a878",
});

export const AUDIO = Object.freeze({
  MASTER_VOLUME: 0.8,
  MUSIC_VOLUME: 0.35,
  SFX_VOLUME: 0.7,
  ENGINE_VOLUME: 0.4,
  MAX_CONCURRENT_SOUNDS: 12,
});

export const PERFORMANCE = Object.freeze({
  TARGET_FPS: 60,
  LOW_FPS_THRESHOLD: 25,
  HIGH_DPR: 2,
  LOW_DPR: 1,
  PARTICLE_LIMIT: 500,
  SHADOW_MAP_SIZE: 1024,
});

export const UI = Object.freeze({
  NOTIFICATION_DURATION_MS: 3000,
  TOAST_DURATION_MS: 2500,
  TRANSITION_DURATION_MS: 250,
  DOUBLE_TAP_WINDOW_MS: 300,
});

export default Object.freeze({
  GAME_VERSION,
  GAME_EVENTS,
  GAME_STATES,
  INPUT_ACTIONS,
  STORAGE_KEYS,
  WORLD,
  PLAYER,
  TRAFFIC,
  ECONOMY,
  PROGRESSION,
  WEATHER_TYPES,
  TIME_PERIODS,
  DISTRICT_IDS,
  VEHICLE_TYPES,
  VEHICLE_UNLOCK_LEVELS,
  PAINT_COLORS,
  AUDIO,
  PERFORMANCE,
  UI,
});