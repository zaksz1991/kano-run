import { CONFIG, STATE } from './config.js';
import { Storage } from './storage.js';
import { Audio } from './audio.js';

/*
 * Kano Run — Adaidaita Sahu
 * Specification-aligned game core
 *
 * This file owns:
 * - gameplay state
 * - steering/control behavior
 * - throttle + braking
 * - traffic
 * - passenger pickup/drop-off
 * - fares and negotiation
 * - Kano destinations
 * - KAROTA / police checkpoints
 * - pursuit state
 * - levels and keke progression
 * - missions, achievements, combos
 * - continues/lives
 * - daily reward
 * - route / driver / paint / radio selection
 * - opening-sequence state
 *
 * Three.js presentation remains in renderer3d.js.
 * Sound generation/playback remains in audio.js.
 */

const PLAYER_Y = 500;

const BASE_SPEED = 3.6;
const MIN_SPEED = 0.25;
const BASE_MAX_SPEED = 7.2;

const LANES = 3;
const MIN_LANE = 0;
const MAX_LANE = LANES - 1;

const COLLISION_Y_FRONT = 22;
const COLLISION_Y_BACK = 9;
const COLLISION_X = 34;

const NEAR_MISS_Y = 55;
const NEAR_MISS_X = 88;

const PICKUP_DISTANCE = 58;
const DROPOFF_DISTANCE = 58;
const CHECKPOINT_DISTANCE = 52;

const STOP_SPEED = 1.65;

const FRAME_MS = 1000 / 60;

/* -------------------------------------------------------------------------- */
/* Kano destinations                                                          */
/* -------------------------------------------------------------------------- */

const KANO_DESTINATIONS = [
  'Sabon Gari',
  'Kofar Mata',
  'Fagge',
  'Farm Centre',
  'Hotoro',
  'Zoo Road',
  'Naibawa',
  'Tarauni',
  'Dala',
  'Kantin Kwari',
  'Kofar Wambai',
  'Kumbotso',
  'Sharada',
  'Bompai',
  'Gwale',
  'Kabuga',
  'BUK Road',
  'Waje',
  'Rijiyar Zaki',
  'Yankaba',
  'Challawa',
  'Nassarawa GRA',
  'Airport Road',
  'Naibawa Bus Stop',
  'Tudun Wada',
  'Panshekara',
  'Kofar Dawanau',
  'Kofar Nassarawa'
];

/* -------------------------------------------------------------------------- */
/* Passenger profiles                                                         */
/* -------------------------------------------------------------------------- */

const PASSENGER_TYPES = [
  {
    id: 'standard',
    name: 'Passenger',
    seats: 1,
    fareMultiplier: 1.0,
    weight: 46
  },
  {
    id: 'student',
    name: 'Student',
    seats: 1,
    fareMultiplier: 0.86,
    weight: 16
  },
  {
    id: 'worker',
    name: 'Worker',
    seats: 1,
    fareMultiplier: 1.08,
    weight: 15
  },
  {
    id: 'market',
    name: 'Market Customer',
    seats: 1,
    fareMultiplier: 1.06,
    weight: 10
  },
  {
    id: 'elder',
    name: 'Elder',
    seats: 1,
    fareMultiplier: 1.15,
    weight: 5
  },
  {
    id: 'hajiya',
    name: 'Hajiya',
    seats: 1,
    fareMultiplier: 1.18,
    weight: 4
  },
  {
    id: 'family',
    name: 'Family Pair',
    seats: 2,
    fareMultiplier: 1.26,
    weight: 4
  }
];

/* -------------------------------------------------------------------------- */
/* Natural passenger / roadside lines                                         */
/* -------------------------------------------------------------------------- */

const PASSENGER_CALLS = [
  'Oga, tsaya kadan.',
  'Mai Gida, a tsaya.',
  'Mallam, akwai wuri?',
  'Yallabai, tsaya mana.',
  'Dan uwa, ka tsaya.',
  'Aboki, akwai wuri?',
  'Driver, tsaya nan.',
  'Baba, ka tsaya.',
  'Mama, akwai wuri?',
  'Hajiya tana jira.',
  'Oga, ina zuwa can.',
  'Mallam, wannan hanya zan bi.'
];

const DESTINATION_LINES = [
  'Zan je',
  'Ina son zuwa',
  'Don Allah ka kai ni',
  'Mu tafi',
  'A kai ni'
];

const AKWAI_LINES = [
  'Akwai!',
  'Akwai wuri?',
  'Driver, tsaya nan.',
  'Oga, a tsaya.',
  'Mallam, ka sauke ni nan.',
  'Yallabai, nan ne.',
  'Akwai, nan zan sauka.'
];

const PASSENGER_NEGOTIATION_STYLES = [
  {
    name: 'budget',
    askMultiplier: 0.82,
    acceptChance: 0.88
  },
  {
    name: 'normal',
    askMultiplier: 0.94,
    acceptChance: 0.74
  },
  {
    name: 'firm',
    askMultiplier: 1.06,
    acceptChance: 0.62
  },
  {
    name: 'premium',
    askMultiplier: 1.18,
    acceptChance: 0.56
  }
];

const CHECKPOINT_PHRASES = [
  'Oga, takardu.',
  'Driver, a tsaya.',
  'Mallam, wane route kake?',
  'KAROTA inspection.',
  'Police checkpoint.'
];

/* -------------------------------------------------------------------------- */
/* Keke progression                                                           */
/* -------------------------------------------------------------------------- */

const KEKES = {
  standard: {
    id: 'standard',
    name: 'Standard Keke',
    title: 'Everyday Adaidaita',
    color: 0xfbbf24,
    unlockLevel: 1,
    speedBonus: 0,
    handling: 1.0,
    capacity: 3,
    fareMultiplier: 1.0,
    description: 'Balanced city keke for normal Kano routes.'
  },

  luxury: {
    id: 'luxury',
    name: 'Luxury Keke',
    title: 'Comfort Ride',
    color: 0xeab308,
    unlockLevel: 3,
    speedBonus: 0.15,
    handling: 1.06,
    capacity: 3,
    fareMultiplier: 1.14,
    description: 'Cleaner ride with improved comfort and fare value.'
  },

  cargo: {
    id: 'cargo',
    name: 'Cargo Keke',
    title: 'Load Runner',
    color: 0x22c55e,
    unlockLevel: 5,
    speedBonus: -0.18,
    handling: 0.93,
    capacity: 3,
    fareMultiplier: 1.18,
    description: 'Designed for heavier roadside loads and market work.'
  },

  open: {
    id: 'open',
    name: 'Open Keke',
    title: 'Market Runner',
    color: 0x38bdf8,
    unlockLevel: 7,
    speedBonus: 0.12,
    handling: 1.1,
    capacity: 3,
    fareMultiplier: 1.1,
    description: 'Quick handling for dense market routes.'
  },

  police: {
    id: 'police',
    name: 'Police Keke',
    title: 'Enforcement Variant',
    color: 0x1e40af,
    unlockLevel: 10,
    speedBonus: 0.26,
    handling: 1.03,
    capacity: 3,
    fareMultiplier: 0.95,
    description: 'Advanced enforcement-themed unlock.'
  },

  karota: {
    id: 'karota',
    name: 'KAROTA Keke',
    title: 'Checkpoint Variant',
    color: 0xf59e0b,
    unlockLevel: 12,
    speedBonus: 0.2,
    handling: 1.0,
    capacity: 3,
    fareMultiplier: 1.02,
    description: 'Advanced utility variant.'
  }
};

/* -------------------------------------------------------------------------- */
/* Utility functions                                                          */
/* -------------------------------------------------------------------------- */

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function pick(array) {
  if (!array.length) return null;
  return array[Math.floor(Math.random() * array.length)];
}

function weightedPick(items) {
  const total = items.reduce(
    (sum, item) => sum + (item.weight || 1),
    0
  );

  if (total <= 0) return items[0];

  let roll = Math.random() * total;

  for (const item of items) {
    roll -= item.weight || 1;
    if (roll <= 0) return item;
  }

  return items[items.length - 1];
}

function unique(array) {
  return [...new Set(array)];
}

function todayKey() {
  return new Date().toISOString().slice(0, 10);
}

/* -------------------------------------------------------------------------- */
/* Game                                                                       */
/* -------------------------------------------------------------------------- */

export class Game {
  constructor(canvas) {
    this.canvas = canvas;

    /*
     * Do not create a 2D rendering context here.
     * The game uses the existing Three.js/WebGL renderer.
     */
    this.ctx = null;

    this.ui = null;
    this.renderer3d = null;

    this.state = STATE.START;
    this.paused = false;

    /* Economy / score */
    this.score = 0;
    this.money = 0;
    this.high = 0;

    /* Distance / progression */
    this.dist = 0;
    this.level = 1;
    this.xp = 0;
    this.completedTrips = 0;

    /* Passenger state */
    this.capacity = 3;
    this.paxCount = 0;
    this.totalPax = 0;
    this.currentPassengers = [];
    this.lastPassenger = null;
    this.lastFare = 0;
    this.lastDropDestination = null;

    /* Lives / crash state */
    this.continuesLeft = 3;
    this.paidContinuesUsed = 0;
    this.crashes = 0;
    this.lastCrashFrame = -9999;

    /* Combo */
    this.combo = 0;
    this.bestCombo = 0;
    this.comboTimer = 0;
    this.nearMissCount = 0;
    this.nearMissCooldown = 0;

    /* Driving */
    this.speed = BASE_SPEED;
    this.maxSpeed = BASE_MAX_SPEED;
    this.throttle = 1;
    this.brake = 0;

    this.gasHeld = false;
    this.brakeHeld = false;

    /*
     * Before a control surface explicitly sets throttle,
     * the game preserves the established automatic cruise behavior.
     */
    this._externalThrottle = false;

    /* Road / player */
    this.frame = 0;
    this.roadOff = 0;

    this.playerLane = 1;
    this.playerX = this.laneX(this.playerLane);
    this.targetX = this.playerX;
    this.playerY = PLAYER_Y;
    this.playerZ = 0;

    this.bounce = 0;
    this.shake = 0;
    this.shakeMag = 0;
    this.inv = 0;

    /* Objects */
    this.obs = [];
    this.paxZones = [];
    this.dropZones = [];
    this.coins = [];
    this.checkpoints = [];

    /* IDs */
    this.nextTrafficId = 1;
    this.nextPassengerId = 1;
    this.nextCheckpointId = 1;

    /* Traffic */
    this.trafficJamTimer = 0;
    this.lastTrafficSpawn = 0;
    this.lastPassengerSpawn = 0;
    this.lastCoinSpawn = 0;
    this.lastCheckpointSpawn = 0;

    /* Police / KAROTA */
    this.policeChase = 0;
    this.karotaHeat = 0;
    this.karotaWanted = false;
    this.checkpointCooldown = 0;

    /* Route / driver / keke / paint / radio */
    this.selectedRoute = 'citycenter';
    this.selectedDriver = 'ruffneck';
    this.selectedPaint = 'classic';
    this.selectedKeke = 'standard';
    this.radioIndex = 0;

    /* Environment */
    this.weatherState = 'clear';

    /* Mission */
    this.activeMission = null;
    this.missionIndex = 0;

    /* Events */
    this.eventOpen = false;
    this.eventType = null;
    this.eventContext = null;
    this._resumeStateAfterEvent = STATE.PLAY;

    /* Opening sequence */
    this.introSequence = {
      active: false,
      stage: 'idle',
      timer: 0,
      driverId: 'ruffneck',
      paintId: 'classic',
      kekeId: 'standard'
    };

    /* Daily reward */
    this.dailyClaimed = false;
    this.dailyReward = 500;

    this._loadStorage();

    this.selectRoute(this.selectedRoute, false);
    this.selectDriver(this.selectedDriver, false);
    this.selectPaint(this.selectedPaint, false);
    this.selectKeke(this.selectedKeke, false);
    this.selectRadioByIndex(this.radioIndex, false);

    this.generateMission();
  }

  /* ---------------------------------------------------------------------- */
  /* Existing integration                                                    */
  /* ---------------------------------------------------------------------- */

  setUI(ui) {
    this.ui = ui;
    return this;
  }

  setRenderer(renderer) {
    this.renderer3d = renderer;
    return this;
  }

  resize() {
    const parent = this.canvas?.parentElement;

    if (parent) {
      const rect = parent.getBoundingClientRect();

      if (rect.width > 0) {
        this.canvas.style.width = `${rect.width}px`;
      }

      if (rect.height > 0) {
        this.canvas.style.height = `${rect.height}px`;
      }
    }

    this.renderer3d?.resize?.();
  }

  /* ---------------------------------------------------------------------- */
  /* Safe UI/audio bridges                                                   */
  /* ---------------------------------------------------------------------- */

  _ui(method, ...args) {
    try {
      const fn = this.ui?.[method];

      if (typeof fn === 'function') {
        return fn.apply(this.ui, args);
      }
    } catch (error) {
      console.error(`UI error in ${method}:`, error);
    }

    return undefined;
  }

  _audio(methods, ...args) {
    const list = Array.isArray(methods) ? methods : [methods];

    for (const name of list) {
      try {
        const fn = Audio?.[name];

        if (typeof fn === 'function') {
          fn.apply(Audio, args);
          return true;
        }
      } catch (error) {
        console.error(`Audio error in ${name}:`, error);
      }
    }

    return false;
  }

  /* ---------------------------------------------------------------------- */
  /* Storage                                                                  */
  /* ---------------------------------------------------------------------- */

  _loadStorage() {
    try {
      this.selectedRoute =
        Storage?.getRoute?.() ||
        this._localGet('route', 'citycenter');

      this.selectedDriver =
        Storage?.getDriver?.() ||
        this._localGet('driver', 'ruffneck');

      this.selectedPaint =
        Storage?.getPaint?.() ||
        this._localGet('paint', 'classic');

      const storedRadio =
        Storage?.getRadio?.();

      if (
        Number.isFinite(Number(storedRadio))
      ) {
        this.radioIndex = Number(storedRadio);
      } else {
        this.radioIndex = 0;
      }

      this.money =
        Number(
          Storage?.getMoney?.() ??
          this._localGet('money', 0)
        ) || 0;

      this.high =
        Number(
          Storage?.getHighScore?.() ??
          this._localGet('high', 0)
        ) || 0;

      /*
       * selected keke may exist in a newer Storage implementation.
       * Fall back safely to standard.
       */
      this.selectedKeke =
        Storage?.getKeke?.() ||
        this._localGet('keke', 'standard') ||
        'standard';

      const dailyClaimed =
        Storage?.isDailyClaimed?.();

      if (
        typeof dailyClaimed === 'boolean'
      ) {
        this.dailyClaimed = dailyClaimed;
      } else {
        this.dailyClaimed =
          this._localGet(
            'dailyClaimed',
            false
          ) === true;
      }
    } catch (error) {
      console.error('Storage load failed:', error);
    }

    if (!CONFIG.ROUTES?.[this.selectedRoute]) {
      this.selectedRoute = 'citycenter';
    }

    if (!CONFIG.DRIVERS?.[this.selectedDriver]) {
      this.selectedDriver = 'ruffneck';
    }

    if (!CONFIG.PAINTS?.[this.selectedPaint]) {
      this.selectedPaint = 'classic';
    }

    if (!KEKES[this.selectedKeke]) {
      this.selectedKeke = 'standard';
    }
  }

  _localGet(key, fallback) {
    try {
      if (typeof localStorage === 'undefined') {
        return fallback;
      }

      const value =
        localStorage.getItem(
          `kanoRun:${key}`
        );

      if (value == null) {
        return fallback;
      }

      try {
        return JSON.parse(value);
      } catch {
        return value;
      }
    } catch {
      return fallback;
    }
  }

  _localSet(key, value) {
    try {
      if (typeof localStorage === 'undefined') {
        return;
      }

      localStorage.setItem(
        `kanoRun:${key}`,
        JSON.stringify(value)
      );
    } catch {}
  }

  _persistSelection() {
    try {
      Storage?.setRoute?.(this.selectedRoute);
      Storage?.setDriver?.(this.selectedDriver);
      Storage?.setPaint?.(this.selectedPaint);
      Storage?.setRadio?.(this.radioIndex);
      Storage?.setKeke?.(this.selectedKeke);
      Storage?.setMoney?.(this.money);
    } catch (error) {
      console.error('Selection save failed:', error);
    }

    this._localSet(
      'route',
      this.selectedRoute
    );

    this._localSet(
      'driver',
      this.selectedDriver
    );

    this._localSet(
      'paint',
      this.selectedPaint
    );

    this._localSet(
      'radio',
      this.radioIndex
    );

    this._localSet(
      'keke',
      this.selectedKeke
    );

    this._localSet(
      'money',
      this.money
    );
  }

  /* ---------------------------------------------------------------------- */
  /* Basic game information                                                  */
  /* ---------------------------------------------------------------------- */

  getDriver() {
    return (
      CONFIG.DRIVERS?.[this.selectedDriver] ||
      CONFIG.DRIVERS?.ruffneck
    );
  }

  getBonuses() {
    return this.getDriver()?.bonuses || {};
  }

  getKeke() {
    return (
      KEKES[this.selectedKeke] ||
      KEKES.standard
    );
  }

  getWeather() {
    return this.weatherState;
  }

  setWeather(weather) {
    if (
      !['clear', 'harmattan', 'rain']
        .includes(weather)
    ) {
      return false;
    }

    this.weatherState = weather;
    return true;
  }

  getTimeOfDay() {
    return (
      (this.frame % 5400) /
      5400
    );
  }

  getComboMultiplier() {
    if (this.combo >= 12) return 2.0;
    if (this.combo >= 8) return 1.65;
    if (this.combo >= 5) return 1.4;
    if (this.combo >= 3) return 1.2;
    if (this.combo >= 2) return 1.1;
    return 1;
  }

  /* ---------------------------------------------------------------------- */
  /* Route / driver / paint / keke / radio                                  */
  /* ---------------------------------------------------------------------- */

  selectRoute(routeId, persist = true) {
    if (!CONFIG.ROUTES?.[routeId]) {
      return false;
    }

    this.selectedRoute = routeId;

    if (persist) {
      this._persistSelection();
    }

    const route =
      CONFIG.ROUTES[routeId];

    this._ui('setRouteLabel', route.name);
    this._ui('setRoute', route);

    return true;
  }

  selectDriver(driverId, persist = true) {
    const driver =
      CONFIG.DRIVERS?.[driverId];

    if (!driver) {
      return false;
    }

    if (
      driver.unlocked === false
    ) {
      return false;
    }

    this.selectedDriver = driverId;

    if (persist) {
      this._persistSelection();
    }

    this._ui(
      'setDriverLabel',
      `${driver.name} · ${driver.title}`
    );

    this._ui(
      'setDriver',
      driver
    );

    this.renderer3d?.setDriver?.(
      driverId,
      driver
    );

    return true;
  }

  selectPaint(paintId, persist = true) {
    if (!CONFIG.PAINTS?.[paintId]) {
      return false;
    }

    this.selectedPaint = paintId;

    if (persist) {
      this._persistSelection();
    }

    this.renderer3d?.applyPaint?.(
      paintId
    );

    this._ui(
      'setPaint',
      CONFIG.PAINTS[paintId]
    );

    return true;
  }

  selectKeke(kekeId, persist = true) {
    const keke =
      KEKES[kekeId];

    if (!keke) {
      return false;
    }

    if (
      this.level <
      keke.unlockLevel
    ) {
      this._ui(
        'showMissionToast',
        `${keke.name} unlocks at level ${keke.unlockLevel}.`
      );

      return false;
    }

    this.selectedKeke = kekeId;
    this.capacity = keke.capacity;

    if (persist) {
      this._persistSelection();
    }

    this.renderer3d?.setKeke?.(
      kekeId,
      keke
    );

    this._ui(
      'setKeke',
      keke
    );

    return true;
  }

  getKekeCatalog() {
    return Object.values(KEKES)
      .map((keke) => ({
        ...keke,
        unlocked:
          this.level >=
          keke.unlockLevel,
        selected:
          this.selectedKeke ===
          keke.id
      }));
  }

  getDriverCatalog() {
    return Object.values(
      CONFIG.DRIVERS || {}
    ).map((driver) => ({
      ...driver,
      selected:
        this.selectedDriver ===
        driver.id
    }));
  }

  getRouteCatalog() {
    return Object.values(
      CONFIG.ROUTES || {}
    ).map((route) => ({
      ...route,
      selected:
        this.selectedRoute ===
        route.id
    }));
  }

  selectRadioByIndex(
    index,
    persist = true
  ) {
    const stations =
      CONFIG.RADIO || [];

    if (!stations.length) {
      return false;
    }

    this.radioIndex =
      (
        Number(index) || 0
      ) % stations.length;

    if (
      this.radioIndex < 0
    ) {
      this.radioIndex +=
        stations.length;
    }

    const station =
      stations[
        this.radioIndex
      ];

    this.selectedRadio =
      station.id;

    if (persist) {
      this._persistSelection();
    }

    this._activateRadio(
      false
    );

    return true;
  }

  cycleRadio() {
    const stations =
      CONFIG.RADIO || [];

    if (!stations.length) {
      return;
    }

    this.selectRadioByIndex(
      this.radioIndex + 1
    );
  }

  nextRadio() {
    this.cycleRadio();
  }

  previousRadio() {
    this.selectRadioByIndex(
      this.radioIndex - 1
    );
  }

  _activateRadio(
    announce = true
  ) {
    const station =
      CONFIG.RADIO?.[
        this.radioIndex
      ];

    if (!station) {
      return;
    }

    this._audio(
      [
        'setRadioStation',
        'setRadio',
        'playRadio',
        'radio'
      ],
      station.id,
      station.name
    );

    this._ui(
      'setRadio',
      station.name
    );

    if (announce) {
      this._ui(
        'showMissionToast',
        `📻 ${station.name}`
      );
    }
  }

  /* ---------------------------------------------------------------------- */
  /* Lane / driving controls                                                 */
  /* ---------------------------------------------------------------------- */

  laneX(lane) {
    const width =
      this.canvas?.clientWidth ||
      390;

    const center =
      width / 2;

    const laneWidth =
      Math.min(
        88,
        width / 3.45
      );

    return (
      center +
      (
        clamp(
          Math.round(lane),
          MIN_LANE,
          MAX_LANE
        ) - 1
      ) *
        laneWidth
    );
  }

  changeLane(direction) {
    const dir =
      Number(direction) < 0
        ? -1
        : Number(direction) > 0
          ? 1
          : 0;

    if (!dir) {
      return false;
    }

    /*
     * LEFT always decreases lane index.
     * RIGHT always increases lane index.
     */
    const next =
      clamp(
        this.playerLane + dir,
        MIN_LANE,
        MAX_LANE
      );

    if (
      next ===
      this.playerLane
    ) {
      return false;
    }

    this.playerLane =
      next;

    this.targetX =
      this.laneX(
        this.playerLane
      );

    this.bounce =
      Math.max(
        this.bounce,
        8
      );

    this._audio(
      ['steer', 'playSteer']
    );

    return true;
  }

  moveLeft() {
    return this.changeLane(-1);
  }

  moveRight() {
    return this.changeLane(1);
  }

  steerLeft() {
    return this.moveLeft();
  }

  steerRight() {
    return this.moveRight();
  }

  left() {
    return this.moveLeft();
  }

  right() {
    return this.moveRight();
  }

  gasDown() {
    this.gasHeld = true;
    this._externalThrottle = true;
    this.throttle = 1;
  }

  gasUp() {
    this.gasHeld = false;
  }

  brakeDown() {
    this.brakeHeld = true;
    this.brake = 1;
  }

  brakeUp() {
    this.brakeHeld = false;
    this.brake = 0;
  }

  accelerate() {
    this.gasDown();
  }

  releaseAccelerate() {
    this.gasUp();
  }

  brake() {
    this.brakeDown();
  }

  releaseBrake() {
    this.brakeUp();
  }

  setThrottle(value) {
    this.throttle =
      clamp(
        Number(value) || 0,
        0,
        1
      );

    this._externalThrottle = true;
  }

  setBrake(value) {
    this.brake =
      clamp(
        Number(value) || 0,
        0,
        1
      );
  }

  pause() {
    if (
      this.state !==
        STATE.PLAY ||
      this.eventOpen
    ) {
      return;
    }

    this.paused = true;

    this.renderer3d?.setPaused?.(
      true
    );

    this._audio(
      ['pause']
    );

    this._ui(
      'showPaused'
    );
  }

  resume() {
    if (
      this.state !==
      STATE.PLAY
    ) {
      return;
    }

    this.paused = false;

    this.renderer3d?.setPaused?.(
      false
    );

    this._audio(
      ['resume']
    );

    this._ui(
      'showPlaying'
    );
  }

  togglePause() {
    if (this.paused) {
      this.resume();
    } else {
      this.pause();
    }
  }

  horn() {
    this._audio(
      [
        'horn',
        'playHorn',
        'beep'
      ]
    );

    /*
     * Horn temporarily makes the player harder to hit
     * and nudges nearby traffic away from the current lane.
     */
    this.inv =
      Math.max(
        this.inv,
        12
      );

    for (const obstacle of this.obs) {
      if (
        obstacle.lane ===
          this.playerLane &&
        Math.abs(
          obstacle.y -
            this.playerY
        ) < 125
      ) {
        obstacle.y -= 18;
      }
    }

    this._ui(
      'showMissionToast',
      'HORN'
    );
  }

  /* ---------------------------------------------------------------------- */
  /* Start / restart                                                          */
  /* ---------------------------------------------------------------------- */

  start() {
    if (
      this.state ===
        STATE.PLAY &&
      !this.paused
    ) {
      return;
    }

    this.state = STATE.PLAY;
    this.paused = false;

    this.eventOpen = false;
    this.eventType = null;
    this.eventContext = null;

    this.score = 0;
    this.dist = 0;
    this.totalPax = 0;
    this.completedTrips = 0;
    this.paxCount = 0;

    this.continuesLeft = 3;
    this.paidContinuesUsed = 0;
    this.crashes = 0;

    this.combo = 0;
    this.bestCombo = 0;
    this.comboTimer = 0;

    this.nearMissCount = 0;
    this.nearMissCooldown = 0;

    this.speed =
      BASE_SPEED;

    this.frame = 0;
    this.roadOff = 0;

    this.playerLane = 1;
    this.playerX =
      this.laneX(
        this.playerLane
      );
    this.targetX =
      this.playerX;

    this.playerY =
      PLAYER_Y;

    this.bounce = 0;
    this.inv = 0;

    this.obs = [];
    this.paxZones = [];
    this.dropZones = [];
    this.coins = [];
    this.checkpoints = [];
    this.currentPassengers = [];

    this.nextTrafficId = 1;
    this.nextPassengerId = 1;
    this.nextCheckpointId = 1;

    this.trafficJamTimer = 0;
    this.lastTrafficSpawn = 0;
    this.lastPassengerSpawn = 0;
    this.lastCoinSpawn = 0;
    this.lastCheckpointSpawn = 0;

    this.policeChase = 0;
    this.karotaHeat = 0;
    this.karotaWanted = false;
    this.checkpointCooldown = 0;

    this.lastPassenger = null;
    this.lastFare = 0;
    this.lastDropDestination = null;

    const driver =
      this.getDriver();

    const keke =
      this.getKeke();

    this.capacity =
      keke.capacity;

    this.maxSpeed =
      Math.max(
        5.5,
        BASE_MAX_SPEED +
          (
            driver?.bonuses?.speed ||
            0
          ) +
          (
            keke?.speedBonus ||
            0
          )
      );

    this.introSequence = {
      active: true,
      stage: 'walk_to_keke',
      timer: 0,
      driverId:
        this.selectedDriver,
      paintId:
        this.selectedPaint,
      kekeId:
        this.selectedKeke
    };

    this.renderer3d?.applyPaint?.(
      this.selectedPaint
    );

    this.renderer3d?.setDriver?.(
      this.selectedDriver,
      driver
    );

    this.renderer3d?.setKeke?.(
      this.selectedKeke,
      keke
    );

    /*
     * Do not start the engine before the opening sequence.
     * The renderer receives the full sequence and is responsible
     * for the 3D walking / boarding presentation.
     */
    this._audio(
      [
        'ensure',
        'unlock'
      ]
    );

    this._activateRadio(
      false
    );

    this._ui(
      'showPlaying'
    );

    this._ui(
      'setMission',
      this.missionLabel()
    );

    const route =
      this.getSelectedRoute();

    this._ui(
      'setRouteLabel',
      route?.name || ''
    );

    this._ui(
      'setDriverLabel',
      `${driver?.name || 'RuffNeck'} · ${driver?.title || 'Top Driver'}`
    );

    this._ui(
      'updateHUD',
      this
    );

    /*
     * Opening sequence instruction.
     * The actual driving phase begins only after engine_start completes.
     */
    this._ui(
      'showEvent',
      {
        title: 'Kano Run',
        text:
          `${driver?.name || 'RuffNeck'} is getting ready for the route.\n\n` +
          'Watch the driver walk to the keke, board, start the engine and begin the run.',
        actions: [
          {
            label: 'START',
            onClick: () => {
              /*
               * Do not cancel the sequence.
               * This only closes the explanatory overlay.
               */
              this.closeEvent();
            }
          }
        ]
      }
    );
  }

  retry() {
    this.start();
  }

  restart() {
    this.start();
  }

  /* ---------------------------------------------------------------------- */
  /* Event handling                                                           */
  /* ---------------------------------------------------------------------- */

  showEvent(event) {
    this.eventOpen = true;
    this._resumeStateAfterEvent =
      STATE.PLAY;

    this.state =
      STATE.EVENT;

    this.eventType =
      event?.type ||
      'generic';

    this.eventContext =
      event?.context ||
      null;

    this._ui(
      'showEvent',
      event
    );
  }

  closeEvent() {
    this.eventOpen = false;
    this.eventType = null;
    this.eventContext = null;

    /*
     * Opening sequence events should return directly to PLAY.
     */
    this.state =
      this._resumeStateAfterEvent ||
      STATE.PLAY;

    this.paused = false;

    this.renderer3d?.setPaused?.(
      false
    );

    this._ui(
      'hideEvent'
    );

    this._ui(
      'showPlaying'
    );
  }

  /* ---------------------------------------------------------------------- */
  /* Opening sequence                                                         */
  /* ---------------------------------------------------------------------- */

  updateOpeningSequence() {
    const sequence =
      this.introSequence;

    if (!sequence.active) {
      return false;
    }

    sequence.timer += 1;

    if (
      sequence.stage ===
      'walk_to_keke'
    ) {
      /*
       * First phase:
       * driver approaches the keke.
       */
      if (
        sequence.timer === 1
      ) {
        this._audio(
          [
            'walk',
            'playWalk'
          ]
        );
      }

      if (
        sequence.timer >= 72
      ) {
        sequence.stage =
          'boarding';

        sequence.timer = 0;

        this._audio(
          [
            'boarding',
            'board',
            'playBoarding'
          ]
        );
      }
    } else if (
      sequence.stage ===
      'boarding'
    ) {
      if (
        sequence.timer >= 52
      ) {
        sequence.stage =
          'engine_start';

        sequence.timer = 0;
      }
    } else if (
      sequence.stage ===
      'engine_start'
    ) {
      if (
        sequence.timer === 1
      ) {
        this._audio(
          [
            'engineStart',
            'playEngineStart',
            'startEngine'
          ]
        );
      }

      if (
        sequence.timer >= 52
      ) {
        sequence.stage =
          'driving';

        sequence.active = false;
        sequence.timer = 0;

        this._audio(
          [
            'drive',
            'startEngine'
          ]
        );

        this._ui(
          'hideEvent'
        );
      }
    }

    this.renderer3d?.updateOpeningSequence?.(
      sequence
    );

    return sequence.active;
  }

  /* ---------------------------------------------------------------------- */
  /* Main update loop                                                        */
  /* ---------------------------------------------------------------------- */

  update(delta = FRAME_MS) {
    if (
      this.state ===
        STATE.EVENT ||
      this.state ===
        STATE.OVER ||
      this.paused
    ) {
      this.renderer3d?.draw?.(
        this
      );

      return;
    }

    if (
      this.state !==
      STATE.PLAY
    ) {
      this.renderer3d?.draw?.(
        this
      );

      return;
    }

    this.frame += 1;

    if (this.inv > 0) {
      this.inv -= 1;
    }

    if (this.bounce > 0) {
      this.bounce -= 1;
    }

    if (this.shake > 0) {
      this.shake -= 1;
    }

    if (
      this.nearMissCooldown > 0
    ) {
      this.nearMissCooldown -= 1;
    }

    if (
      this.checkpointCooldown > 0
    ) {
      this.checkpointCooldown -= 1;
    }

    if (
      this.comboTimer > 0
    ) {
      this.comboTimer -= 1;

      if (
        this.comboTimer <= 0
      ) {
        this.combo = 0;
      }
    }

    /*
     * Opening sequence takes priority.
     */
    if (
      this.introSequence.active
    ) {
      this.updateOpeningSequence();

      this.renderer3d?.draw?.(
        this
      );

      this._updateHUD();
      return;
    }

    this.updateDrivingSpeed();
    this.updatePlayer();

    this.roadOff =
      (
        this.roadOff +
        this.speed
      ) % 58;

    this.dist +=
      this.speed *
      0.00016;

    this.xp +=
      this.speed *
      0.018;

    this.updateLevel();

    /*
     * Passive score for staying alive.
     */
    const scoreGain =
      this.speed *
      0.12 *
      this.getComboMultiplier() *
      (
        this.getBonuses()?.scoreMult ||
        1
      );

    this.score +=
      scoreGain;

    /* Traffic */
    if (
      this.frame -
        this.lastTrafficSpawn >=
      this.trafficSpawnInterval()
    ) {
      this.spawnTraffic();
      this.lastTrafficSpawn =
        this.frame;
    }

    /* Passenger pickup zones */
    if (
      this.frame -
        this.lastPassengerSpawn >=
      this.passengerSpawnInterval()
    ) {
      this.spawnPassengerZone();
      this.lastPassengerSpawn =
        this.frame;
    }

    /* Coins */
    if (
      this.frame -
        this.lastCoinSpawn >=
      88
    ) {
      this.spawnCoin();
      this.lastCoinSpawn =
        this.frame;
    }

    /* Checkpoints */
    if (
      this.frame -
        this.lastCheckpointSpawn >=
      this.checkpointInterval()
    ) {
      this.spawnCheckpoint();
      this.lastCheckpointSpawn =
        this.frame;
    }

    /*
     * Traffic jam occasionally raises density.
     */
    if (
      this.trafficJamTimer > 0
    ) {
      this.trafficJamTimer -= 1;
    }

    if (
      this.frame % 600 === 0 &&
      this.dist > 1 &&
      this.trafficJamTimer <= 0 &&
      Math.random() < 0.36
    ) {
      this.trafficJamTimer = 170;

      this._ui(
        'showMissionToast',
        '🚦 TRAFFIC JAM — slow down'
      );

      this.triggerShake(
        5,
        2
      );
    }

    /* Update entities */
    this.updateTraffic();
    this.updatePassengerZones();
    this.updateDropZones();
    this.updateCoins();
    this.updateCheckpoints();
    this.updatePoliceChase();

    /*
     * Actual interaction order:
     * 1. checkpoint
     * 2. traffic collision
     * 3. passengers
     * 4. coins
     */
    if (
      this.handleCheckpointInteraction()
    ) {
      this.renderer3d?.draw?.(
        this
      );

      return;
    }

    if (
      this.handleTrafficCollisions()
    ) {
      this.renderer3d?.draw?.(
        this
      );

      return;
    }

    if (
      this.handlePassengerInteractions()
    ) {
      this.renderer3d?.draw?.(
        this
      );

      return;
    }

    this.handleCoinCollection();

    this.updateMissionProgress();
    this.updateLandmarks();
    this.updateDailyProgress();

    this._audio(
      [
        'updateEngine'
      ],
      this.speed,
      this.throttle,
      this.brake
    );

    this.renderer3d?.draw?.(
      this
    );

    this._updateHUD();
  }

  /* ---------------------------------------------------------------------- */
  /* Driving speed                                                           */
  /* ---------------------------------------------------------------------- */

  updateDrivingSpeed() {
    const driver =
      this.getDriver();

    const keke =
      this.getKeke();

    const driverBonus =
      driver?.bonuses?.speed ||
      0;

    const kekeBonus =
      keke?.speedBonus ||
      0;

    const cruiseSpeed =
      BASE_SPEED +
      driverBonus +
      kekeBonus;

    const usingGas =
      this.gasHeld ||
      (
        !this._externalThrottle &&
        !this.brakeHeld &&
        this.brake <= 0
      );

    if (
      this.brakeHeld ||
      this.brake > 0
    ) {
      this.speed -=
        0.18 +
        this.speed * 0.024;
    } else if (
      usingGas
    ) {
      const throttle =
        this.gasHeld
          ? 1
          : this.throttle;

      this.speed +=
        0.028 +
        throttle * 0.024;
    } else {
      /*
       * Coast rather than stopping instantly.
       */
      this.speed -=
        0.024;
    }

    /*
     * Normal cruising floor.
     * This preserves the established automatic-driving behavior
     * until a user deliberately applies brake/coast controls.
     */
    if (
      !this.brakeHeld &&
      this.brake <= 0 &&
      usingGas &&
      this.speed <
        cruiseSpeed * 0.76
    ) {
      this.speed +=
        0.017;
    }

    /*
     * Traffic jams naturally cap speed.
     */
    let limit =
      this.maxSpeed;

    if (
      this.trafficJamTimer > 0
    ) {
      limit *=
        0.58;
    }

    /*
     * Police pursuit can push acceleration.
     */
    if (
      this.policeChase > 0
    ) {
      limit +=
        0.25;
    }

    this.speed =
      clamp(
        this.speed,
        MIN_SPEED,
        limit
      );
  }

  updatePlayer() {
    const keke =
      this.getKeke();

    const handling =
      clamp(
        keke?.handling || 1,
        0.75,
        1.25
      );

    const interpolation =
      clamp(
        0.20 +
          (
            handling -
            1
          ) *
            0.10,
        0.12,
        0.30
      );

    this.playerX +=
      (
        this.targetX -
        this.playerX
      ) *
      interpolation;

    this.playerY =
      PLAYER_Y;
  }

  /* ---------------------------------------------------------------------- */
  /* Traffic                                                                  */
  /* ---------------------------------------------------------------------- */

  trafficSpawnInterval() {
    return Math.max(
      36,
      88 -
        this.level * 3 -
        Math.floor(
          this.speed
        ) * 2
    );
  }

  spawnTraffic() {
    if (
      this.obs.length >=
      18
    ) {
      return;
    }

    const candidateLanes =
      [0, 1, 2]
        .sort(
          () =>
            Math.random() -
            0.5
        );

    let selectedLane =
      candidateLanes[0];

    /*
     * Prefer a lane which does not immediately block
     * the player at the spawn edge.
     */
    for (
      const lane of
      candidateLanes
    ) {
      const safe =
        !this.obs.some(
          (o) =>
            o.lane ===
              lane &&
            o.y <
              -120
        );

      if (safe) {
        selectedLane =
          lane;
        break;
      }
    }

    const pool = [
      'keke',
      'keke',
      'car',
      'car',
      'taxi',
      'bus',
      'motorcycle',
      'truck'
    ];

    if (
      this.level >=
      3
    ) {
      pool.push(
        'police'
      );
    }

    if (
      this.level >=
      5
    ) {
      pool.push(
        'karota'
      );
    }

    const type =
      pick(pool);

    const obstacle = {
      id:
        this.nextTrafficId++,
      type,
      lane:
        selectedLane,
      y:
        -270 -
        Math.random() *
          330,
      speedFactor:
        0.78 +
        Math.random() *
          0.38,
      laneCooldown:
        50 +
        Math.floor(
          Math.random() *
            80
        ),
      scoredNearMiss:
        false,
      checkpoint:
        false
    };

    this.obs.push(
      obstacle
    );
  }

  updateTraffic() {
    for (
      const obstacle of
      this.obs
    ) {
      let move =
        this.speed *
          1.12 *
          (
            obstacle.speedFactor ||
            1
          );

      /*
       * Police / KAROTA vehicles become more active during pursuit.
       */
      if (
        this.policeChase > 0 &&
        (
          obstacle.type ===
            'police' ||
          obstacle.type ===
            'karota'
        )
      ) {
        move +=
          0.55;
      }

      /*
       * Follow distance from the vehicle ahead.
       */
      let ahead =
        Infinity;

      for (
        const other of
        this.obs
      ) {
        if (
          other ===
          obstacle
        ) {
          continue;
        }

        if (
          other.lane !==
          obstacle.lane
        ) {
          continue;
        }

        if (
          other.y >
          obstacle.y
        ) {
          const gap =
            other.y -
            obstacle.y;

          if (
            gap <
            ahead
          ) {
            ahead = gap;
          }
        }
      }

      if (
        ahead <
        80
      ) {
        move *=
          0.28;
      } else if (
        ahead <
        115
      ) {
        move *=
          0.52;
      }

      obstacle.y +=
        move;

      if (
        obstacle.laneCooldown >
        0
      ) {
        obstacle.laneCooldown -=
          1;
      }

      /*
       * Believable lane changes.
       * Vehicles may overtake only when destination lane is safe.
       */
      if (
        obstacle.laneCooldown <=
          0 &&
        ahead <
          105 &&
        Math.random() <
          0.025
      ) {
        const directions =
          Math.random() <
          0.5
            ? [-1, 1]
            : [1, -1];

        for (
          const direction of
          directions
        ) {
          const newLane =
            obstacle.lane +
            direction;

          if (
            newLane <
              0 ||
            newLane >
              2
          ) {
            continue;
          }

          const occupied =
            this.obs.some(
              (other) =>
                other !==
                  obstacle &&
                other.lane ===
                  newLane &&
                Math.abs(
                  other.y -
                    obstacle.y
                ) <
                  105
            );

          if (occupied) {
            continue;
          }

          /*
           * Do not cut across the player at close range.
           */
          if (
            newLane ===
              this.playerLane &&
            Math.abs(
              obstacle.y -
                this.playerY
            ) <
              100
          ) {
            continue;
          }

          obstacle.lane =
            newLane;

          obstacle.laneCooldown =
            75 +
            Math.floor(
              Math.random() *
                90
            );

          break;
        }
      }
    }

    this.obs =
      this.obs.filter(
        (obstacle) =>
          obstacle.y <
          760
      );
  }

  /* ---------------------------------------------------------------------- */
  /* Collision model                                                         */
  /* ---------------------------------------------------------------------- */

  handleTrafficCollisions() {
    if (
      this.inv > 0
    ) {
      return false;
    }

    for (
      const obstacle of
      this.obs
    ) {
      const dx =
        Math.abs(
          this.laneX(
            obstacle.lane
          ) -
          this.playerX
        );

      /*
       * Collision requires BOTH horizontal and longitudinal overlap.
       * This is deliberately tighter than the old lane-only collision.
       */
      const vehicleHalfWidth =
        obstacle.type ===
          'keke'
          ? 22
          : obstacle.type ===
              'motorcycle'
            ? 15
            : 27;

      const xHit =
        dx <=
        COLLISION_X +
          vehicleHalfWidth;

      const relativeY =
        obstacle.y -
        this.playerY;

      const yHit =
        relativeY >=
          -COLLISION_Y_FRONT &&
        relativeY <=
          COLLISION_Y_BACK;

      if (
        xHit &&
        yHit
      ) {
        /*
         * Enforcement vehicles produce checkpoint interaction,
         * not an ordinary vehicle crash.
         */
        if (
          obstacle.type ===
            'police' ||
          obstacle.type ===
            'karota'
        ) {
          this.triggerCheckpointInteraction({
            type:
              obstacle.type,
            source:
              obstacle
          });

          return true;
        }

        this.crash(
          obstacle
        );

        return true;
      }

      /*
       * Near miss requires the player to genuinely pass
       * beside the vehicle, not simply occupy its lane.
       */
      const nearY =
        Math.abs(
          relativeY
        ) <=
        NEAR_MISS_Y;

      const nearX =
        dx <=
          NEAR_MISS_X &&
        dx >
          COLLISION_X +
            vehicleHalfWidth;

      if (
        !obstacle.scoredNearMiss &&
        nearY &&
        nearX
      ) {
        obstacle.scoredNearMiss =
          true;

        this.nearMissCount +=
          1;

        this.addCombo(
          1
        );

        const reward =
          Math.round(
            45 *
              (
                1 +
                this.combo *
                  0.08
              ) *
              (
                this.getBonuses()
                  ?.nearMissBonus ||
                1
              )
          );

        this.score +=
          reward;

        this.xp +=
          8;

        this._audio(
          [
            'nearMiss',
            'playNearMiss'
          ]
        );

        this._ui(
          'showMissionToast',
          `💨 Near miss +₦${reward}`
        );
      }
    }

    return false;
  }

  rectHit(a, b) {
    return (
      a.x <
        b.x +
          b.w &&
      a.x +
        a.w >
        b.x &&
      a.y <
        b.y +
          b.h &&
      a.y +
        a.h >
        b.y
    );
  }

  crash(obstacle = null) {
    const driver =
      this.getDriver();

    const invFrames =
      driver?.bonuses?.invFrames ||
      12;

    if (
      this.frame -
        this.lastCrashFrame <
      invFrames
    ) {
      return;
    }

    this.lastCrashFrame =
      this.frame;

    this.crashes +=
      1;

    this.continuesLeft =
      Math.max(
        0,
        this.continuesLeft -
          1
      );

    this.combo = 0;
    this.comboTimer = 0;

    this.speed =
      Math.max(
        1.6,
        this.speed *
          0.48
      );

    this.shake =
      18;

    this.shakeMag =
      8;

    this.bounce =
      10;

    this._audio(
      [
        'crash',
        'collision',
        'playCrash'
      ]
    );

    this._ui(
      'showMissionToast',
      '💥 CRASH!'
    );

    if (
      this.continuesLeft >
      0
    ) {
      this.showEvent({
        type:
          'continue',
        title:
          '💥 Crash',
        text:
          `You hit a ${obstacle?.type || 'vehicle'}.\n\n` +
          `You have ${this.continuesLeft} Life Saver${
            this.continuesLeft === 1
              ? ''
              : 's'
          } remaining.`,
        context: {
          obstacle
        },
        actions: [
          {
            label:
              `USE LIFE SAVER (${this.continuesLeft})`,
            onClick:
              () =>
                this.useContinue()
          },
          {
            label:
              'END RUN',
            onClick:
              () =>
                this.finishRun()
          }
        ]
      });
    } else {
      this.finishRun();
    }
  }

  gameOver() {
    this.crash();
  }

  useContinue() {
    this.eventOpen =
      false;

    this.eventType =
      null;

    this.eventContext =
      null;

    this.state =
      STATE.PLAY;

    this.paused =
      false;

    this.speed =
      Math.max(
        2.7,
        this.speed
      );

    const invFrames =
      this.getBonuses()
        ?.invFrames ||
      12;

    this.inv =
      100 +
      invFrames;

    this.obs = [];

    this.policeChase =
      0;

    this.karotaWanted =
      false;

    this.renderer3d?.setPaused?.(
      false
    );

    this._audio(
      [
        'continue',
        'lifeSaver'
      ]
    );

    this._ui(
      'hideEvent'
    );

    this._ui(
      'showPlaying'
    );

    this._ui(
      'showMissionToast',
      'Life Saver used — keep driving.'
    );
  }

  /* ---------------------------------------------------------------------- */
  /* Passenger spawning                                                       */
  /* ---------------------------------------------------------------------- */

  passengerSpawnInterval() {
    return Math.max(
      120,
      235 -
        this.level *
          4
    );
  }

  spawnPassengerZone() {
    if (
      this.paxZones.length >=
      8
    ) {
      return;
    }

    /*
     * Prefer a roadside lane that isn't immediately blocked.
     */
    let lane =
      Math.floor(
        Math.random() * 3
      );

    for (
      let attempts = 0;
      attempts < 3;
      attempts += 1
    ) {
      const candidate =
        Math.floor(
          Math.random() *
            3
        );

      const blocked =
        this.paxZones.some(
          (zone) =>
            zone.lane ===
              candidate &&
            zone.y <
              -130
        );

      if (!blocked) {
        lane =
          candidate;
        break;
      }
    }

    const profile =
      weightedPick(
        PASSENGER_TYPES
      );

    const route =
      this.getSelectedRoute();

    const destination =
      pick(
        this.destinationPool()
      );

    const isAishat =
      profile.id ===
      'hajiya';

    const isVip =
      profile.id ===
        'elder' ||
      profile.id ===
        'worker' ||
      profile.id ===
        'family';

    const zone = {
      id:
        this.nextPassengerId++,

      lane,

      y:
        -270 -
        Math.random() *
          360,

      taken:
        false,

      flagging:
        true,

      aishat:
        isAishat,

      vip:
        isVip,

      passenger:
        profile,

      passengerName:
        profile.name,

      destination,

      seats:
        profile.seats,

      fareBase:
        Math.max(
          80,
          (
            route?.baseFare ||
            140
          ) *
            (
              profile.fareMultiplier ||
              1
            )
        ),

      greeting:
        pick(
          PASSENGER_CALLS
        ),

      flagPhase:
        Math.random() *
          Math.PI *
          2,

      waitFrames:
        0,

      negotiating:
        false
    };

    this.paxZones.push(
      zone
    );
  }

  updatePassengerZones() {
    for (
      const zone of
      this.paxZones
    ) {
      zone.y +=
        this.speed;

      zone.waitFrames +=
        1;

      zone.flagPhase +=
        0.08;

      /*
       * Passenger eventually gives up.
       */
      if (
        zone.waitFrames >
          170 &&
        zone.y >
          this.playerY +
            70
      ) {
        zone.taken =
          true;
      }
    }

    this.paxZones =
      this.paxZones.filter(
        (zone) =>
          !zone.taken ||
          zone.y <
            this.playerY +
              120
      );
  }

  /* ---------------------------------------------------------------------- */
  /* Passenger interaction                                                    */
  /* ---------------------------------------------------------------------- */

  handlePassengerInteractions() {
    /*
     * Drop-off comes first.
     */
    if (
      this.currentPassengers.length >
      0
    ) {
      for (
        const drop of
        this.dropZones
      ) {
        if (
          drop.used
        ) {
          continue;
        }

        if (
          drop.lane !==
          this.playerLane
        ) {
          continue;
        }

        const distance =
          Math.abs(
            drop.y -
              this.playerY
          );

        /*
         * Passenger explicitly requires a controlled stop.
         */
        if (
          distance <=
            DROPOFF_DISTANCE &&
          this.speed <=
            STOP_SPEED
        ) {
          this.completeDropOff(
            drop
          );

          return true;
        }
      }
    }

    /*
     * Pickup.
     */
    if (
      this.currentPassengers.length >=
      this.capacity
    ) {
      return false;
    }

    for (
      const zone of
      this.paxZones
    ) {
      if (
        zone.taken ||
        zone.negotiating
      ) {
        continue;
      }

      if (
        zone.lane !==
        this.playerLane
      ) {
        continue;
      }

      const passengerSeats =
        zone.seats ||
        1;

      if (
        this.currentPassengers.length +
          passengerSeats >
        this.capacity
      ) {
        this._ui(
          'showMissionToast',
          'Keke is full.'
        );

        continue;
      }

      const distance =
        Math.abs(
          zone.y -
            this.playerY
        );

      if (
        distance <=
          PICKUP_DISTANCE &&
        this.speed <=
          STOP_SPEED
      ) {
        this.startPassengerNegotiation(
          zone
        );

        return true;
      }
    }

    return false;
  }

  startPassengerNegotiation(
    zone
  ) {
    if (
      this.eventOpen ||
      !zone ||
      zone.taken
    ) {
      return;
    }

    zone.negotiating =
      true;

    const style =
      pick(
        PASSENGER_NEGOTIATION_STYLES
      ) ||
      PASSENGER_NEGOTIATION_STYLES[0];

    const base =
      Math.max(
        80,
        Math.round(
          zone.fareBase
        )
      );

    const requested =
      Math.max(
        60,
        Math.round(
          base *
            style.askMultiplier
        )
      );

    const normal =
      Math.max(
        70,
        Math.round(
          base
        )
      );

    const premium =
      Math.max(
        90,
        Math.round(
          base *
            1.22
        )
      );

    const greeting =
      zone.greeting ||
      pick(
        PASSENGER_CALLS
      );

    const destinationLine =
      pick(
        DESTINATION_LINES
      ) ||
      'Zan je';

    this.showEvent({
      type:
        'fare',
      title:
        '💬 Fare Negotiation',
      text:
        `${greeting}\n\n` +
        `${destinationLine} ${zone.destination}.\n` +
        `Passenger: ${zone.passenger.name}\n\n` +
        `Choose how you handle the fare.`,
      context: {
        zone
      },
      actions: [
        {
          label:
            `ACCEPT ₦${requested.toLocaleString()}`,
          onClick:
            () =>
              this.acceptPassenger(
                zone,
                requested,
                'requested',
                style
              )
        },
        {
          label:
            `HOLD ₦${normal.toLocaleString()}`,
          onClick:
            () =>
              this.acceptPassenger(
                zone,
                normal,
                'normal',
                style
              )
        },
        {
          label:
            `ASK ₦${premium.toLocaleString()}`,
          onClick:
            () =>
              this.acceptPassenger(
                zone,
                premium,
                'premium',
                style
              )
        },
        {
          label:
            'LET THEM GO',
          onClick:
            () =>
              this.rejectPassenger(
                zone
              )
        }
      ]
    });

    this._audio(
      [
        'passengerCall',
        'passengerHail',
        'voice'
      ],
      greeting
    );
  }

  acceptPassenger(
    zone,
    fare,
    mode,
    style
  ) {
    if (
      !zone ||
      zone.taken
    ) {
      this.closeEvent();
      return;
    }

    const keke =
      this.getKeke();

    const driver =
      this.getDriver();

    const baseFare =
      Number(fare) ||
      zone.fareBase ||
      100;

    let finalFare =
      baseFare;

    /*
     * High asks can be negotiated down.
     */
    if (
      mode ===
      'premium'
    ) {
      const chance =
        style?.acceptChance ||
        0.55;

      if (
        Math.random() >
        chance
      ) {
        finalFare =
          Math.round(
            baseFare *
              0.86
          );

        this._ui(
          'showMissionToast',
          'Passenger negotiated the fare.'
        );
      }
    }

    if (
      zone.aishat &&
      driver?.bonuses?.aishatBonus
    ) {
      finalFare +=
        Number(
          driver.bonuses.aishatBonus
        ) ||
        0;
    }

    finalFare *=
      driver?.bonuses?.fareMult ||
      1;

    finalFare *=
      keke?.fareMultiplier ||
      1;

    finalFare =
      Math.max(
        50,
        Math.round(
          finalFare
        )
      );

    const seats =
      zone.seats ||
      1;

    if (
      this.currentPassengers.length +
        seats >
      this.capacity
    ) {
      this._ui(
        'showMissionToast',
        'Keke is full.'
      );

      zone.negotiating =
        false;

      this.closeEvent();
      return;
    }

    zone.taken =
      true;

    zone.flagging =
      false;

    zone.negotiating =
      false;

    const passenger = {
      id:
        zone.id,

      type:
        zone.passenger.id,

      name:
        zone.passenger.name,

      seats,

      destination:
        zone.destination,

      fare:
        finalFare,

      boardedFrame:
        this.frame
    };

    this.currentPassengers.push(
      passenger
    );

    this.paxCount =
      this.currentPassengers.length;

    this.totalPax +=
      seats;

    this.lastPassenger =
      passenger;

    this.lastFare =
      finalFare;

    /*
     * Destination becomes a real drop point in the future road flow.
     */
    this.dropZones.push({
      id:
        `drop-${zone.id}`,

      lane:
        this.playerLane,

      y:
        -390 -
        Math.random() *
          320,

      used:
        false,

      destination:
        zone.destination,

      passengerId:
        passenger.id,

      fare:
        finalFare,

      passenger
    });

    this.addCombo(
      zone.aishat
        ? 3
        : zone.vip
          ? 2
          : 1
    );

    this.score +=
      Math.round(
        finalFare *
          0.30
      );

    this.xp +=
      20;

    this._audio(
      [
        'pickup',
        'passengerPickup',
        'playPickup'
      ]
    );

    const title =
      zone.aishat
        ? 'Hajiya boarded'
        : zone.vip
          ? `${zone.passenger.name} boarded`
          : 'Passenger boarded';

    this._ui(
      'showMissionToast',
      `${title} → ${zone.destination} · ₦${finalFare}`
    );

    this.closeEvent();
  }

  rejectPassenger(
    zone
  ) {
    if (!zone) {
      this.closeEvent();
      return;
    }

    zone.taken =
      true;

    zone.flagging =
      false;

    zone.negotiating =
      false;

    this.combo = 0;

    this._audio(
      [
        'passengerReject',
        'walk'
      ]
    );

    this._ui(
      'showMissionToast',
      'Passenger walked away.'
    );

    this.closeEvent();
  }

  /* ---------------------------------------------------------------------- */
  /* Drop-off                                                                 */
  /* ---------------------------------------------------------------------- */

  updateDropZones() {
    for (
      const drop of
      this.dropZones
    ) {
      drop.y +=
        this.speed;
    }

    this.dropZones =
      this.dropZones.filter(
        (drop) =>
          !drop.used &&
          drop.y <
            760
      );
  }

  completeDropOff(
    drop
  ) {
    if (
      !drop ||
      drop.used
    ) {
      return;
    }

    drop.used =
      true;

    const index =
      this.currentPassengers.findIndex(
        (passenger) =>
          passenger.id ===
          drop.passengerId
      );

    const passenger =
      index >= 0
        ? this.currentPassengers[
            index
          ]
        : null;

    if (
      index >= 0
    ) {
      this.currentPassengers.splice(
        index,
        1
      );
    }

    this.paxCount =
      this.currentPassengers.length;

    this.completedTrips +=
      1;

    const comboMultiplier =
      1 +
      Math.min(
        10,
        this.combo
      ) *
        0.055;

    const fare =
      Math.max(
        50,
        Math.round(
          (
            passenger?.fare ||
            drop.fare ||
            100
          ) *
            comboMultiplier
        )
      );

    this.lastFare =
      fare;

    this.lastDropDestination =
      drop.destination;

    this.money +=
      fare;

    this.score +=
      fare;

    this.xp +=
      35 +
      Math.round(
        fare *
          0.04
      );

    this.addCombo(
      1
    );

    this._audio(
      [
        'dropoff',
        'passengerDropoff',
        'playDropoff'
      ]
    );

    this._ui(
      'showMissionToast',
      `Akwai! ${drop.destination} · +₦${fare}`
    );

    /*
     * Preserve the existing persistence model.
     */
    try {
      Storage?.setMoney?.(
        this.money
      );
    } catch {}

    this._localSet(
      'money',
      this.money
    );
  }

  /* ---------------------------------------------------------------------- */
  /* Coins                                                                    */
  /* ---------------------------------------------------------------------- */

  spawnCoin() {
    if (
      this.coins.length >=
      10
    ) {
      return;
    }

    this.coins.push({
      lane:
        Math.floor(
          Math.random() * 3
        ),

      y:
        -190 -
        Math.random() *
          520,

      taken:
        false,

      bob:
        Math.random() *
        Math.PI *
        2,

      value:
        25 +
        this.level *
          5
    });
  }

  updateCoins() {
    for (
      const coin of
      this.coins
    ) {
      coin.y +=
        this.speed;

      coin.bob =
        (
          coin.bob || 0
        ) +
        0.09;
    }

    this.coins =
      this.coins.filter(
        (coin) =>
          !coin.taken &&
          coin.y <
            760
      );
  }

  handleCoinCollection() {
    for (
      const coin of
      this.coins
    ) {
      if (
        coin.taken
      ) {
        continue;
      }

      const dx =
        Math.abs(
          this.laneX(
            coin.lane
          ) -
          this.playerX
        );

      const dy =
        Math.abs(
          coin.y -
          this.playerY
        );

      if (
        dx <= 42 &&
        dy <= 50
      ) {
        coin.taken =
          true;

        const value =
          Number(
            coin.value
          ) ||
          25;

        this.score +=
          value;

        this.money +=
          value;

        this.xp +=
          5;

        this._audio(
          [
            'coin',
            'collectCoin',
            'playCoin'
          ]
        );

        this._ui(
          'showMissionToast',
          `+₦${value}`
        );
      }
    }
  }

  /* ---------------------------------------------------------------------- */
  /* KAROTA / police checkpoints                                             */
  /* ---------------------------------------------------------------------- */

  checkpointInterval() {
    return Math.max(
      520,
      980 -
        this.level *
          18
    );
  }

  spawnCheckpoint() {
    if (
      this.checkpoints.length >=
      2 ||
      this.checkpointCooldown >
        0
    ) {
      return;
    }

    const lane =
      Math.floor(
        Math.random() * 3
      );

    this.checkpoints.push({
      id:
        this.nextCheckpointId++,

      lane,

      y:
        -380 -
        Math.random() *
          200,

      type:
        Math.random() <
        0.55
          ? 'karota'
          : 'police',

      active:
        true,

      handled:
        false,

      phrase:
        pick(
          CHECKPOINT_PHRASES
        )
    });
  }

  updateCheckpoints() {
    for (
      const checkpoint of
      this.checkpoints
    ) {
      checkpoint.y +=
        this.speed;
    }

    this.checkpoints =
      this.checkpoints.filter(
        (checkpoint) =>
          checkpoint.y <
            760 &&
          !checkpoint.handled
      );
  }

  handleCheckpointInteraction() {
    if (
      this.eventOpen ||
      this.checkpointCooldown >
        0
    ) {
      return false;
    }

    for (
      const checkpoint of
      this.checkpoints
    ) {
      if (
        !checkpoint.active ||
        checkpoint.handled
      ) {
        continue;
      }

      if (
        checkpoint.lane !==
        this.playerLane
      ) {
        continue;
      }

      const distance =
        Math.abs(
          checkpoint.y -
          this.playerY
        );

      /*
       * Checkpoint interaction requires controlled slowdown.
       */
      if (
        distance <=
          CHECKPOINT_DISTANCE &&
        this.speed <=
          STOP_SPEED
      ) {
        checkpoint.handled =
          true;

        this.triggerCheckpointInteraction({
          type:
            checkpoint.type,
          source:
            checkpoint
        });

        return true;
      }
    }

    return false;
  }

  triggerCheckpointInteraction({
    type,
    source
  }) {
    if (
      this.eventOpen
    ) {
      return;
    }

    const fine =
      type ===
      'karota'
        ? 250 +
          this.level *
            45
        : 200 +
          this.level *
            35;

    this.checkpointCooldown =
      280;

    this.showEvent({
      type:
        'karota',
      title:
        type ===
        'karota'
          ? '⚠️ KAROTA CHECKPOINT'
          : '🚨 POLICE CHECKPOINT',

      text:
        `${source?.phrase || 'Driver, a tsaya.'}\n\n` +
        `Officer requests inspection.\n` +
        `Current fine: ₦${fine.toLocaleString()}\n\n` +
        `Slow, stop and choose how you respond.`,

      context: {
        type,
        source,
        fine
      },

      actions: [
        {
          label:
            `PAY ₦${fine.toLocaleString()}`,
          onClick:
            () =>
              this.payCheckpointFine(
                fine
              )
        },

        {
          label:
            'NEGOTIATE',
          onClick:
            () =>
              this.negotiateCheckpoint(
                fine
              )
        },

        {
          label:
            'DISPUTE',
          onClick:
            () =>
              this.disputeCheckpoint(
                fine
              )
        },

        {
          label:
            'DRIVE OFF',
          onClick:
            () =>
              this.escapeCheckpoint()
        }
      ]
    });

    this._audio(
      type === 'karota'
        ? [
            'karota',
            'checkpoint',
            'voice'
          ]
        : [
            'police',
            'checkpoint',
            'siren'
          ]
    );
  }

  payCheckpointFine(
    fine
  ) {
    const amount =
      Math.min(
        this.money,
        fine
      );

    this.money -=
      amount;

    this.score =
      Math.max(
        0,
        this.score -
          amount
      );

    this.karotaHeat =
      Math.max(
        0,
        this.karotaHeat -
          2
      );

    this.karotaWanted =
      false;

    this.policeChase =
      0;

    this._ui(
      'showMissionToast',
      `Checkpoint fine paid: ₦${amount.toLocaleString()}`
    );

    this._audio(
      [
        'negotiate',
        'checkpointPay'
      ]
    );

    this._persistSelection();

    this.closeEvent();
  }

  negotiateCheckpoint(
    fine
  ) {
    const chance =
      0.52 -
      Math.min(
        0.14,
        this.karotaHeat *
          0.02
      );

    if (
      Math.random() <
      chance
    ) {
      const reduced =
        Math.max(
          60,
          Math.round(
            fine *
              0.55
          )
        );

      const amount =
        Math.min(
          this.money,
          reduced
        );

      this.money -=
        amount;

      this.score =
        Math.max(
          0,
          this.score -
            amount
        );

      this.karotaHeat =
        Math.max(
          0,
          this.karotaHeat -
            1
        );

      this._ui(
        'showMissionToast',
        `Negotiated checkpoint: ₦${amount.toLocaleString()}`
      );

      this._audio(
        [
          'negotiate',
          'success'
        ]
      );

      this._persistSelection();

      this.closeEvent();

      return;
    }

    this.karotaHeat +=
      1;

    this._ui(
      'showMissionToast',
      'Negotiation failed.'
    );

    this._audio(
      [
        'alert'
      ]
    );

    this.closeEvent();
  }

  disputeCheckpoint(
    fine
  ) {
    const success =
      Math.random() <
      0.36;

    if (
      success
    ) {
      this.karotaHeat =
        Math.max(
          0,
          this.karotaHeat -
            1
        );

      this._ui(
        'showMissionToast',
        'Officer released you after inspection.'
      );

      this._audio(
        [
          'success'
        ]
      );

      this.closeEvent();

      return;
    }

    const surcharge =
      Math.round(
        fine *
          0.25
      );

    const amount =
      Math.min(
        this.money,
        surcharge
      );

    this.money -=
      amount;

    this.score =
      Math.max(
        0,
        this.score -
          amount
      );

    this.karotaHeat +=
      2;

    this._ui(
      'showMissionToast',
      `Dispute failed. Extra cost ₦${amount.toLocaleString()}`
    );

    this._audio(
      [
        'alert',
        'crash'
      ]
    );

    this._persistSelection();

    this.closeEvent();
  }

  escapeCheckpoint() {
    this.karotaHeat +=
      3;

    this.karotaWanted =
      true;

    this.policeChase =
      600 +
      this.level *
        35;

    this.speed =
      Math.min(
        this.maxSpeed,
        this.speed +
          0.5
      );

    this._audio(
      [
        'siren',
        'policeChase',
        'horn'
      ]
    );

    this._ui(
      'showMissionToast',
      '🚨 Pursuit started — avoid the police.'
    );

    this.closeEvent();
  }

  updatePoliceChase() {
    if (
      this.policeChase <=
      0
    ) {
      return;
    }

    this.policeChase -=
      1;

    this.karotaWanted =
      true;

    if (
      this.frame % 90 ===
      0
    ) {
      this._audio(
        [
          'siren',
          'police'
        ]
      );

      this._ui(
        'showMissionToast',
        '🚨 Police/KAROTA pursuit active'
      );
    }

    /*
     * Pursuit gradually cools down.
     */
    if (
      this.policeChase <=
      80
    ) {
      this.karotaHeat =
        Math.max(
          0,
          this.karotaHeat -
            0.02
        );
    }

    if (
      this.policeChase <=
      0
    ) {
      this.policeChase =
        0;

      this.karotaWanted =
        false;

      this.karotaHeat =
        Math.max(
          0,
          this.karotaHeat -
            2
        );

      this._ui(
        'showMissionToast',
        'Pursuit cleared.'
      );
    }
  }

  /* ---------------------------------------------------------------------- */
  /* Missions                                                                 */
  /* ---------------------------------------------------------------------- */

  generateMission() {
    const list =
      CONFIG.MISSIONS || [];

    if (!list.length) {
      this.activeMission = {
        text:
          'Drive 2 km',
        type:
          'dist',
        target:
          2,
        progress:
          0,
        completed:
          false
      };

      return;
    }

    const source =
      list[
        this.missionIndex %
        list.length
      ];

    this.missionIndex +=
      1;

    this.activeMission = {
      ...source,
      progress:
        0,
      completed:
        false
    };
  }

  missionLabel() {
    const mission =
      this.activeMission;

    if (!mission) {
      return '🎯 Ready';
    }

    return (
      `${mission.text} ` +
      `(${Math.min(
        mission.target,
        Math.floor(
          Number(
            mission.progress
          ) || 0
        )
      )}/${mission.target})`
    );
  }

  updateMissionProgress() {
    const mission =
      this.activeMission;

    if (!mission) {
      return;
    }

    const missionText =
      String(
        mission.text ||
        ''
      ).toLowerCase();

    if (
      mission.type ===
      'dist'
    ) {
      mission.progress =
        this.dist;
    } else if (
      mission.type ===
      'score'
    ) {
      mission.progress =
        this.score;
    } else if (
      mission.type ===
      'pax'
    ) {
      mission.progress =
        this.totalPax;
    } else if (
      mission.type ===
      'drop'
    ) {
      /*
       * "Drop 5 with combo" requires the
       * successful drop to have occurred while combo > 0.
       * Standard drop missions simply count completed trips.
       */
      if (
        missionText.includes(
          'combo'
        )
      ) {
        mission.progress =
          this.combo >= 2
            ? this.completedTrips
            : mission.progress;
      } else {
        mission.progress =
          this.completedTrips;
      }
    } else if (
      mission.type ===
      'nearmiss'
    ) {
      mission.progress =
        this.nearMissCount;
    }

    this._ui(
      'setMission',
      this.missionLabel()
    );

    if (
      mission.progress >=
        mission.target &&
      !mission.completed
    ) {
      mission.completed =
        true;

      const reward =
        350 +
        this.level *
          75;

      this.money +=
        reward;

      this.score +=
        reward;

      this.xp +=
        100;

      this._audio(
        [
          'mission',
          'missionComplete',
          'success'
        ]
      );

      this._ui(
        'showMissionToast',
        `🏆 Mission complete +₦${reward.toLocaleString()}`
      );

      this.generateMission();

      this._ui(
        'setMission',
        this.missionLabel()
      );

      this._persistSelection();
    }
  }

  /* ---------------------------------------------------------------------- */
  /* Levels / progression                                                     */
  /* ---------------------------------------------------------------------- */

  updateLevel() {
    const thresholds = [
      0,
      1.2,
      3,
      5.5,
      8.5,
      12,
      16,
      21,
      27,
      34,
      42,
      52,
      64,
      78,
      94
    ];

    let nextLevel =
      1;

    for (
      let index = 1;
      index <
        thresholds.length;
      index += 1
    ) {
      if (
        this.dist >=
        thresholds[index]
      ) {
        nextLevel =
          index + 1;
      } else {
        break;
      }
    }

    if (
      nextLevel <=
      this.level
    ) {
      return;
    }

    const oldLevel =
      this.level;

    this.level =
      nextLevel;

    this.xp +=
      150 *
      (
        this.level -
        oldLevel
      );

    this.maxSpeed =
      Math.min(
        9.0,
        this.maxSpeed +
          (
            this.level -
            oldLevel
          ) *
            0.06
      );

    this._ui(
      'showMissionToast',
      `LEVEL ${this.level} — Kano route getting harder`
    );

    const newlyUnlocked =
      Object.values(
        KEKES
      ).find(
        (keke) =>
          keke.unlockLevel ===
          this.level
      );

    if (
      newlyUnlocked
    ) {
      this._ui(
        'showMissionToast',
        `🔓 Unlocked: ${newlyUnlocked.name}`
      );
    }
  }

  /* ---------------------------------------------------------------------- */
  /* Landmarks                                                                */
  /* ---------------------------------------------------------------------- */

  updateLandmarks() {
    const route =
      this.getSelectedRoute();

    const landmarks =
      route?.landmarks || [];

    if (
      !landmarks.length
    ) {
      return;
    }

    const index =
      Math.floor(
        this.dist *
          0.85
      ) %
      landmarks.length;

    if (
      index ===
      this._lastLandmarkIndex
    ) {
      return;
    }

    this._lastLandmarkIndex =
      index;

    this._ui(
      'showLandmark',
      landmarks[index]
    );
  }

  getSelectedRoute() {
    return (
      CONFIG.ROUTES?.[
        this.selectedRoute
      ] ||
      CONFIG.ROUTES?.citycenter
    );
  }

  destinationPool() {
    return unique([
      ...KANO_DESTINATIONS,
      ...(
        this.getSelectedRoute()
          ?.landmarks || []
      )
    ]);
  }

  /* ---------------------------------------------------------------------- */
  /* Daily reward                                                             */
  /* ---------------------------------------------------------------------- */

  initDaily() {
    this._ui(
      'updateDailyUI',
      this
    );

    this._ui(
      'updateDailyMission',
      this.getDailyStatus()
    );
  }

  updateDailyProgress() {
    if (
      this.frame % 300 !==
      0
    ) {
      return;
    }

    this._ui(
      'updateDailyMission',
      this.getDailyStatus()
    );
  }

  getDailyStatus() {
    return {
      claimed:
        this.dailyClaimed,

      reward:
        this.dailyReward,

      date:
        todayKey(),

      progress:
        Math.min(
          1,
          this.dist /
            1.5
        ),

      description:
        'Drive 1.5 km today to unlock your daily reward.'
    };
  }

  claimDaily() {
    if (
      this.dailyClaimed
    ) {
      this._ui(
        'showMissionToast',
        'Daily reward already claimed today.'
      );

      return false;
    }

    if (
      this.dist <
        1.5
    ) {
      this._ui(
        'showMissionToast',
        'Drive 1.5 km to unlock today’s reward.'
      );

      return false;
    }

    this.dailyClaimed =
      true;

    this.money +=
      this.dailyReward;

    this.score +=
      this.dailyReward;

    this.xp +=
      50;

    try {
      Storage?.claimDaily?.();
      Storage?.setMoney?.(
        this.money
      );
    } catch {}

    this._localSet(
      'dailyClaimed',
      true
    );

    this._localSet(
      'money',
      this.money
    );

    this._audio(
      [
        'reward',
        'dailyReward',
        'success'
      ]
    );

    this._ui(
      'showMissionToast',
      `Daily reward +₦${this.dailyReward.toLocaleString()}`
    );

    this._ui(
      'updateDailyUI',
      this
    );

    return true;
  }

  claimDailyReward() {
    return this.claimDaily();
  }

  /* ---------------------------------------------------------------------- */
  /* Combo                                                                    */
  /* ---------------------------------------------------------------------- */

  addCombo(amount = 1) {
    this.combo +=
      amount;

    this.comboTimer =
      160;

    this.bestCombo =
      Math.max(
        this.bestCombo,
        this.combo
      );

    if (
      this.combo >=
        5 &&
      this.combo %
        5 ===
        0
    ) {
      this._ui(
        'showMissionToast',
        `🔥 ${this.combo}x COMBO`
      );
    }

    this._ui(
      'showCombo',
      this.combo
    );
  }

  /* ---------------------------------------------------------------------- */
  /* Weather                                                                  */
  /* ---------------------------------------------------------------------- */

  updateWeather() {
    if (
      this.frame % 900 !==
      0
    ) {
      return;
    }

    const roll =
      Math.random();

    if (
      roll <
      0.56
    ) {
      this.weatherState =
        'clear';
    } else if (
      roll <
      0.80
    ) {
      this.weatherState =
        'harmattan';

      this._ui(
        'showMissionToast',
        '🏜️ Harmattan haze over Kano'
      );
    } else {
      this.weatherState =
        'rain';

      this._ui(
        'showMissionToast',
        '🌧️ Rain in Kano'
      );
    }
  }

  /* ---------------------------------------------------------------------- */
  /* Final run / achievements                                                */
  /* ---------------------------------------------------------------------- */

  checkAchievements() {
    let reward =
      0;

    for (
      const achievement of
      CONFIG.ACHIEVEMENTS ||
      []
    ) {
      let earned =
        false;

      try {
        earned =
          Boolean(
            achievement.check?.(
              this
            )
          );
      } catch {
        earned =
          false;
      }

      if (!earned) {
        continue;
      }

      let already =
        false;

      try {
        already =
          Boolean(
            Storage?.getAchievement?.(
              achievement.id
            )
          );
      } catch {}

      if (
        already
      ) {
        continue;
      }

      let unlocked =
        false;

      try {
        unlocked =
          Boolean(
            Storage?.unlockAchievement?.(
              achievement.id
            )
          );
      } catch {}

      if (
        unlocked ||
        !already
      ) {
        reward +=
          150;

        this._ui(
          'showMissionToast',
          `🏆 ${achievement.name}`
        );
      }
    }

    return reward;
  }

  finishRun() {
    if (
      this.state ===
      STATE.OVER
    ) {
      return;
    }

    this.state =
      STATE.OVER;

    this.paused =
      false;

    this.eventOpen =
      false;

    this._audio(
      [
        'stopEngine'
      ]
    );

    const achievementReward =
      this.checkAchievements();

    if (
      achievementReward >
      0
    ) {
      this.money +=
        achievementReward;

      this.score +=
        achievementReward;
    }

    /*
     * Convert score into persistent garage money,
     * preserving the game's established economy.
     */
    const runPayout =
      Math.floor(
        this.score *
          0.20
      );

    this.money +=
      runPayout;

    if (
      this.score >
      this.high
    ) {
      this.high =
        Math.floor(
          this.score
        );

      try {
        Storage?.setHighScore?.(
          this.high
        );
      } catch {}

      this._localSet(
        'high',
        this.high
      );
    }

    try {
      Storage?.setMoney?.(
        this.money
      );
    } catch {}

    this._localSet(
      'money',
      this.money
    );

    const route =
      this.getSelectedRoute();

    const driver =
      this.getDriver();

    try {
      Storage?.addRun?.({
        score:
          Math.floor(
            this.score
          ),

        dist:
          Number(
            this.dist.toFixed(
              2
            )
          ),

        route:
          route?.name ||
          this.selectedRoute,

        driver:
          driver?.name ||
          this.selectedDriver,

        at:
          Date.now()
      });
    } catch {}

    const stats = {
      score:
        Math.round(
          this.score
        ),

      money:
        Math.round(
          this.money
        ),

      dist:
        Number(
          this.dist.toFixed(
            2
          )
        ),

      passengers:
        this.totalPax,

      drops:
        this.completedTrips,

      bestCombo:
        this.bestCombo,

      nearMisses:
        this.nearMissCount,

      crashes:
        this.crashes,

      level:
        this.level,

      route:
        route?.name ||
        this.selectedRoute,

      driver:
        driver?.name ||
        this.selectedDriver,

      keke:
        this.getKeke()?.name ||
        this.selectedKeke,

      payout:
        runPayout,

      achievementReward
    };

    /*
     * Support both the current UI API and a future showOver API.
     */
    if (
      typeof this.ui?.showGameOver ===
      'function'
    ) {
      this.ui.showGameOver(
        this
      );
    } else {
      this._ui(
        'showOver',
        stats
      );

      this._ui(
        'updateFinalStats',
        stats
      );
    }
  }

  /* ---------------------------------------------------------------------- */
  /* HUD                                                                      */
  /* ---------------------------------------------------------------------- */

  _hudPayload() {
    const route =
      this.getSelectedRoute();

    const driver =
      this.getDriver();

    const keke =
      this.getKeke();

    const radio =
      CONFIG.RADIO?.[
        this.radioIndex
      ];

    return {
      score:
        Math.round(
          this.score
        ),

      money:
        Math.round(
          this.money
        ),

      dist:
        Number(
          this.dist.toFixed(
            1
          )
        ),

      pax:
        this.paxCount,

      capacity:
        this.capacity,

      lives:
        this.continuesLeft,

      combo:
        this.combo,

      level:
        this.level,

      speed:
        Number(
          this.speed.toFixed(
            1
          )
        ),

      mission:
        this.activeMission,

      route,

      driver,

      keke,

      radio,

      weather:
        this.weatherState,

      karotaWanted:
        this.karotaWanted,

      policeChase:
        this.policeChase >
        0,

      passengers:
        this.currentPassengers.map(
          (
            passenger
          ) => ({
            destination:
              passenger.destination,

            fare:
              passenger.fare,

            type:
              passenger.type,

            seats:
              passenger.seats
          })
        )
    };
  }

  _updateHUD() {
    if (
      this.frame %
        4 !==
      0
    ) {
      return;
    }

    this._ui(
      'updateHUD',
      this
    );

    this._ui(
      'setMission',
      this.missionLabel()
    );

    this._ui(
      'setRouteLabel',
      this.getSelectedRoute()
        ?.name || ''
    );
  }

  /* ---------------------------------------------------------------------- */
  /* Public state                                                             */
  /* ---------------------------------------------------------------------- */

  getState() {
    return {
      state:
        this.state,

      paused:
        this.paused,

      frame:
        this.frame,

      score:
        this.score,

      money:
        this.money,

      high:
        this.high,

      dist:
        this.dist,

      level:
        this.level,

      playerLane:
        this.playerLane,

      playerX:
        this.playerX,

      playerY:
        this.playerY,

      speed:
        this.speed,

      capacity:
        this.capacity,

      paxCount:
        this.paxCount,

      totalPax:
        this.totalPax,

      combo:
        this.combo,

      bestCombo:
        this.bestCombo,

      currentPassengers:
        this.currentPassengers,

      obs:
        this.obs,

      paxZones:
        this.paxZones,

      dropZones:
        this.dropZones,

      coins:
        this.coins,

      checkpoints:
        this.checkpoints,

      weather:
        this.weatherState,

      route:
        this.selectedRoute,

      driver:
        this.selectedDriver,

      keke:
        this.selectedKeke,

      paint:
        this.selectedPaint,

      radioIndex:
        this.radioIndex,

      policeChase:
        this.policeChase,

      karotaWanted:
        this.karotaWanted
    };
  }
}