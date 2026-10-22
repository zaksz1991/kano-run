import {
  ROUTES,
  DRIVERS,
  RADIO,
  DIALECT,
  MODES,
  MISSION_POOL,
  DAILY_MISSION_POOL,
  ACHIEVEMENTS,
} from './config.js';

import {
  save,
  persist,
  bankRun,
  submitTribe,
  tribeStanding,
  updateBestTime,
  unlockAchievement,
  dailyLoginStatus,
  addDailyMissionProgress,
} from './storage.js';

const randomBetween = (min, max) =>
  min + Math.random() * (max - min);

const choose = (items) =>
  items[Math.floor(Math.random() * items.length)];

const clamp = (value, min, max) =>
  Math.max(min, Math.min(max, value));

const VALID_MODES = new Set([
  'career',
  'timeAttack',
  'fuel',
  'matchDrop',
  'potholes',
  'freeRoam',
]);

const ADDITIVE_MISSION_KEYS = new Set([
  'drops',
  'boards',
  'fares',
  'matchedDrops',
  'nearMisses',
  'checkpoints',
  'refills',
  'vip',
  'aishat',
  'horns',
  'richDramas',
]);

const REVERSE_MAX_SPEED = 12;
const REVERSE_ENGAGE_SPEED = 1.5;

// Pothole contact threshold and swept collision range.
const POTHOLE_IMPACT_DEPTH = 0.005;
const POTHOLE_CONTACT_MIN = -0.025;
const POTHOLE_CONTACT_MAX = 0.012;

// Road-object depth uses a consistent scale throughout the game.
const ROAD_DEPTH_SCALE = 316.8;

// ==========================================================
// COLLISION VISUAL FEEDBACK
// ==========================================================

function showCollisionFlash(type, severity = 0.4, side = 0) {
  if (typeof document === 'undefined') return;

  const id = 'kano-collision-flash';
  let overlay = document.getElementById(id);

  if (!overlay) {
    overlay = document.createElement('div');
    overlay.id = id;
    overlay.setAttribute('aria-hidden', 'true');
    Object.assign(overlay.style, {
      position: 'fixed',
      inset: '0',
      zIndex: '9998',
      pointerEvents: 'none',
      opacity: '0',
      transition: 'opacity 90ms ease-out',
      background: 'transparent',
      boxSizing: 'border-box',
    });
    document.body.appendChild(overlay);
  }

  const strength = Math.max(0.18, Math.min(1, Number(severity) || 0.4));
  const pothole = type === 'pothole';

  overlay.style.boxShadow = pothole
    ? `inset 0 0 ${18 + 42 * strength}px ${4 + 12 * strength}px rgba(255, 190, 40, ${0.14 + 0.3 * strength})`
    : `inset 0 0 ${28 + 68 * strength}px ${6 + 18 * strength}px rgba(255, 45, 35, ${0.16 + 0.38 * strength})`;

  overlay.style.border = pothole
    ? `3px solid rgba(255, 195, 55, ${0.2 + 0.45 * strength})`
    : `4px solid rgba(255, 55, 45, ${0.22 + 0.52 * strength})`;

  if (!pothole && side !== 0) {
    const edge = side < 0 ? 'left' : 'right';
    overlay.style.background = `linear-gradient(to ${edge}, rgba(255, 55, 45, ${0.1 + 0.2 * strength}), transparent 38%)`;
  } else {
    overlay.style.background = 'transparent';
  }

  overlay.style.opacity = String(0.72 + 0.25 * strength);

  if (overlay._collisionTimer) clearTimeout(overlay._collisionTimer);

  overlay._collisionTimer = setTimeout(() => {
    overlay.style.opacity = '0';
    overlay._collisionTimer = setTimeout(() => {
      overlay.style.boxShadow = 'none';
      overlay.style.border = '0';
      overlay.style.background = 'transparent';
    }, 180);
  }, pothole ? 110 : 145);
}

export class Game {
  constructor(ui, audio, { mobile = false } = {}) {
    this.ui = ui;
    this.audio = audio;
    this.mobile = mobile;
    // Optional adapter; main.js will attach the live cycle during the life-simulation integration.
    this.dayCycle = null;
    this.pendingBreak = null;

    this.state = 'INTRO';
    this.mode = 'career';
    this.route = ROUTES[0];

    this.driver =
      DRIVERS.find((item) => item.id === save.driverId) ||
      DRIVERS[0];

    this.resetRun();
    this.ui.bind(this);
  }

  // ==========================================================
  // RUN RESET
  // ==========================================================

  resetRun() {
    const capacity = Math.max(
      3,
      5 + (this.driver.capacityMod || 0),
    );

    this.s = {
      score: 0,
      fares: 0,

      breakfastEaten: null,
      breakfastCost: 0,

      morale: 75,
      fareMood: 1,
      guardedOvernight: false,

      // Forward journey distance only.
      distance: 0,

      // Speedometer magnitude is always non-negative.
      // signedSpeed determines the direction of travel.
      speed: 0,
      signedSpeed: 0,

      reverse: false,
      reverseSpeed: REVERSE_MAX_SPEED,

      fuel: this.mode === 'fuel' ? 42 : 100,
      condition: 100,
      engine: 100,
      tyres: 100,

      passengers: [],
      capacity,

      drops: 0,
      boards: 0,
      nearMisses: 0,
      matchedDrops: 0,
      checkpoints: 0,
      refills: 0,
      vip: 0,
      aishat: 0,

      combo: 0,
      streak: 0,
      safeTripStreak: 0,
      passengerTrust: 50,
      horns: 0,
      richDramas: 0,

      collisions: 0,
      cleanDistance: 0,
      safeSpeedSeconds: 0,
      heat: 0,

      lives: 3,
      continues: 0,
      paidContinueCost: 1200,

      potholeHits: 0,

      elapsed: 0,
      time: 0,

      steer: 0,
      targetLane: 0,

      gas: false,
      brake: false,

      night: false,
      camber: 0,
      mode: this.mode,

      zones: [],
      traffic: [],

      missionProgress: {},
      missions: [],
      event: null,

      invuln: 0,
      runEnded: false,

      radio: RADIO[save.radioIndex % RADIO.length] || RADIO[0],

      dialect: DIALECT[save.dialect]
        ? save.dialect
        : 'hausa',

      camera: save.camera || 'chase',
      paint: save.paint || '#f5c542',

      driver: this.driver.name,
      route: this.route.name,

      level: 1,
      comboTimer: 0,
      refillCooldown: 0,
      toastCooldown: 0,

      karotaTimer: randomBetween(92, 115),
      lifeEventTimer: randomBetween(45, 75),
      eventCooldown: 0,

      lifeActivityTimer: randomBetween(105, 145),
      lastLifeActivity: '',

      pullOverSide: 0,
      crashShake: 0,

      environment: 'clear',
      environmentDuration: 0,

      roadMode: save.roadMode || 'oneway',

      runStartedAt: 0,
      lastDailyDistance: 0,
      lastDailyCombo: 0,
    };

    this.pendingBreak = null;
    this.spawnInitial();
    this.chooseMissions();
  }

  // ==========================================================
  // REVERSE GEAR
  // ==========================================================

  /**
   * Engage or disengage reverse.
   *
   * A gear change is permitted only when the vehicle is nearly
   * stationary. Forward speed is positive; reverse speed is
   * represented by a negative signedSpeed.
   */
  setReverse(value) {
    if (this.state !== 'PLAY' || this.s.event) {
      return false;
    }

    const s = this.s;
    const engage = Boolean(value);

    if (engage === s.reverse) {
      return true;
    }

    if (s.speed > REVERSE_ENGAGE_SPEED) {
      this.ui.toast(
        engage
          ? 'Slow down and stop before engaging reverse'
          : 'Stop reversing before selecting forward gear',
      );

      return false;
    }

    s.speed = 0;
    s.signedSpeed = 0;

    s.gas = false;
    s.brake = false;

    s.reverse = engage;
    s.pullOverSide = 0;

    this.ui.toast(
      engage
        ? 'REVERSE GEAR · Hold BRAKE to reverse'
        : 'FORWARD GEAR · Press GAS to move forward',
    );

    this.ui.update(s, this.route, this.driver);

    return true;
  }

  toggleReverse() {
    return this.setReverse(!this.s.reverse);
  }

  /**
   * Synchronise the speedometer magnitude with direction.
   */
  syncSignedSpeed() {
    const s = this.s;

    s.speed = Math.max(
      0,
      Number(s.speed) || 0,
    );

    s.signedSpeed = s.reverse
      ? -s.speed
      : s.speed;

    return s.signedSpeed;
  }

  // ==========================================================
  // INITIAL ROAD OBJECTS
  // ==========================================================

  spawnInitial() {
    for (let index = 0; index < 5; index += 1) {
      this.spawnZone(index);
    }

    const trafficCount = this.mobile ? 5 : 8;

    for (let index = 0; index < trafficCount; index += 1) {
      this.spawnTraffic(index);
    }
  }

  spawnZone(initialIndex = null) {
    const roll = Math.random();

    let type;

    if (
      (
        this.s.environment === 'market' ||
        this.s.environment === 'schoolGate'
      ) &&
      roll < 0.62
    ) {
      type = 'pickup';
    } else if (
      this.s.environment === 'rainPuddles' &&
      roll < 0.42
    ) {
      type = 'pothole';
    } else if (this.s.environment === 'fuelQueue') {
      type =
        roll < 0.38
          ? 'pickup'
          : roll < 0.64
            ? 'drop'
            : roll < 0.82
              ? 'fuel'
              : 'pothole';
    } else {
      type =
        roll < 0.34
          ? 'pickup'
          : roll < 0.61
            ? 'drop'
            : roll < 0.76
              ? 'fuel'
              : 'pothole';
    }

    const side = Math.random() < 0.5 ? -1 : 1;

    const hub =
      type === 'pickup' &&
      Math.random() < 0.32;

    const lane = type === 'pothole'
      ? Math.floor(randomBetween(0, 3))
      : side < 0
        ? 0
        : 2;

    const dest = this.chooseZoneDestination(type);

    const seats = type === 'pickup'
      ? hub
        ? Math.floor(randomBetween(2, 5))
        : 1
      : 0;

    const depth = Number.isInteger(initialIndex)
      ? 0.52 + initialIndex * 0.15
      : randomBetween(1.05, 1.30);

    const label = hub
      ? `GENERAL CHECKPOINT · KEKE STOP · ${dest}`
      : type === 'pickup'
        ? `PICK UP · ${dest}`
        : type === 'drop'
          ? `DROP OFF · ${dest}`
          : type === 'fuel'
            ? 'FUEL STOP'
            : 'BAD ROAD';

    this.s.zones.push({
      id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,

      type,
      lane,
      side,

      roadside: type !== 'pothole',

      depth,
      dest,
      seats,
      hub,
      label,

      warned: false,
      retryAt: 0,
    });
  }

  chooseZoneDestination(type) {
    if (
      type === 'drop' &&
      this.s.passengers.length
    ) {
      const matchChance = this.mode === 'matchDrop'
        ? 0.82
        : 0.68;

      if (Math.random() < matchChance) {
        return choose(this.s.passengers).dest;
      }
    }

    if (
      type === 'drop' &&
      Math.random() < 0.58
    ) {
      return this.route.name;
    }

    return choose(ROUTES).name;
  }

  spawnTraffic(initialIndex = null) {
    const types = [
      'keke',
      'car',
      'taxi',
      'suv',
      'motorcycle',
      'keke',
      'car',
    ];

    if (!this.mobile) {
      types.push(
        'truck',
        'bus',
        'police',
        'karota',
      );
    }

    const type = choose(types);

    const lane = Math.floor(
      randomBetween(0, 3),
    );

    const direction =
      this.s.roadMode === 'twoway' && lane === 0
        ? -1
        : 1;

    const depth = Number.isInteger(initialIndex)
      ? 0.68 + initialIndex * 0.12
      : randomBetween(1.02, 1.34);

    const speedKmh = direction === -1
      ? randomBetween(24, 43)
      : randomBetween(16, 34);

    this.s.traffic.push({
      id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,

      type,
      lane,
      direction,
      depth,
      speedKmh,

      color: choose([
        '#e4c24e',
        '#d7e1e9',
        '#bd5142',
        '#3983b9',
        '#36404d',
        '#f2f2f2',
      ]),

      passed: false,
      speed: randomBetween(0.92, 1.08),
    });
  }

  // ==========================================================
  // MISSIONS
  // ==========================================================

  chooseMissions() {
    this.s.missions = this.mode === 'career'
      ? [...MISSION_POOL]
        .sort(() => Math.random() - 0.5)
        .slice(0, 3)
        .map((mission) => ({
          ...mission,
          done: false,
        }))
      : [];

    for (const mission of this.s.missions) {
      this.s.missionProgress[mission.id] = 0;
    }
  }

  // ==========================================================
  // START AND MODES
  // ==========================================================

  start(mode = this.mode) {
    if (!VALID_MODES.has(mode)) {
      mode = 'career';
    }

    this.mode = mode;

    this.route =
      ROUTES.find((route) => route.id === save.routeId) ||
      this.route ||
      ROUTES[0];

    this.driver =
      DRIVERS.find((driver) => driver.id === save.driverId) ||
      this.driver ||
      DRIVERS[0];

    this.resetRun();

    this.state = 'PLAY';
    this.s.runStartedAt = Date.now();

    this.audio.start();
    this.ui.startPlay();

    this.ui.toast(
      `${DIALECT[this.s.dialect].greet} ${this.route.name} — ka tafi!`,
    );

    this.checkDaily();
  }

  checkDaily() {
    dailyLoginStatus();

    this.ui.refreshDailyLogin?.();
    this.ui.refreshDailyMissions?.();
  }

  dailyAdd(key, amount) {
    const newlyReady = addDailyMissionProgress(
      key,
      amount,
      DAILY_MISSION_POOL,
    );

    for (const mission of newlyReady) {
      this.ui.toast(
        `DAILY MISSION READY · ${mission.text} · claim ₦${mission.reward.toLocaleString()} in the menu`,
      );
    }

    if (newlyReady.length) {
      this.ui.refreshDailyMissions?.();
    }
  }

  setMode(mode) {
    if (!VALID_MODES.has(mode)) return;

    this.start(mode);

    this.ui.toast(
      `${MODES[mode]?.label || 'Free roam'} started`,
    );
  }

  // ==========================================================
  // STEERING AND PEDALS
  // ==========================================================

  lane(direction) {
    if (this.state !== 'PLAY' || this.s.event) {
      return;
    }

    this.s.targetLane = clamp(
      this.s.targetLane + Math.sign(direction),
      -1,
      1,
    );
  }

  gas(value) {
    if (this.state !== 'PLAY' || this.s.event) {
      return;
    }

    const s = this.s;
    const applyingThrottle = Boolean(value);

    if (applyingThrottle && s.reverse) {
      // Do not instantly change from reverse to forward while moving.
      if (s.speed > REVERSE_ENGAGE_SPEED) {
        s.gas = false;
        s.brake = false;

        this.ui.toast(
          'Stop reversing before selecting forward gear',
        );

        return;
      }

      s.gas = false;
      s.brake = false;

      s.speed = 0;
      s.reverse = false;
      s.signedSpeed = 0;

      this.ui.toast(
        'FORWARD GEAR · Accelerating forward',
      );
    }

    s.gas = applyingThrottle;

    if (applyingThrottle) {
      s.brake = false;
    }
  }

  brake(value) {
    if (this.state !== 'PLAY' || this.s.event) {
      return;
    }

    const s = this.s;

    s.brake = Boolean(value);

    if (s.brake) {
      s.gas = false;
    }

    // Forward gear: BRAKE slows the keke.
    // Reverse gear: BRAKE is the reverse accelerator.
  }

  horn() {
    if (this.state !== 'PLAY' || this.s.event) {
      return;
    }

    this.audio.horn();

    const close = this.s.traffic.some((vehicle) => (
      vehicle.depth > 0.72 &&
      Math.abs(
        vehicle.lane - (this.s.targetLane + 1),
      ) <= 1
    ));

    if (close) {
      this.s.horns += 1;

      this.ui.toast(
        this.s.dialect === 'hausa'
          ? 'Peeep! Ka ji ƙaho!'
          : 'Horn sounded!',
      );

      this.missionAdd('horns', 1);
    }
  }

  menu() {
    if (this.state === 'PLAY') {
      this.state = 'MENU';

      this.s.gas = false;
      this.s.brake = false;

      // Keep the existing speed magnitude for the resume action,
      // but freeze the renderer while the game is paused.
      this.s.signedSpeed = 0;

      this.audio.engine(0);

      this.ui.refreshDailyLogin?.();
      this.ui.refreshDailyMissions?.();

      this.ui.show('menu-screen');
    } else if (this.state === 'MENU') {
      this.state = 'PLAY';

      this.syncSignedSpeed();

      this.ui.hide('menu-screen');
    }
  }

  // ==========================================================
  // MAIN SIMULATION LOOP
  // ==========================================================

  tick(deltaSeconds) {
    if (
      this.state !== 'PLAY' ||
      this.s.event
    ) {
      return;
    }

    const dt = clamp(
      Number(deltaSeconds) || 0,
      0,
      0.045,
    );

    const s = this.s;

    s.elapsed += dt;
    s.time += dt;

    s.invuln = Math.max(0, s.invuln - dt);
    s.refillCooldown = Math.max(0, s.refillCooldown - dt);
    s.toastCooldown = Math.max(0, s.toastCooldown - dt);
    s.eventCooldown = Math.max(0, s.eventCooldown - dt);
    s.comboTimer = Math.max(0, s.comboTimer - dt);

    if (s.comboTimer === 0) {
      s.combo = 0;
    }

    const modeSpeed =
      this.mode === 'timeAttack'
        ? 150
        : this.mode === 'freeRoam'
          ? 36
          : 38;

    // Mechanical wear now has a practical effect on road performance.
    // A damaged engine reduces top speed; poor overall condition adds a
    // smaller penalty without making the keke unusable too early.
    const engineHealth = clamp((s.engine ?? 100) / 100, 0, 1);
    const vehicleCondition = clamp((s.condition ?? 100) / 100, 0, 1);
    const mechanicalPower =
      0.58 + 0.42 * engineHealth;
    const conditionPower =
      0.82 + 0.18 * vehicleCondition;

    const maxSpeed =
      modeSpeed *
      (this.driver.speedMod || 1) *
      mechanicalPower *
      conditionPower;

    const reverseMax = Math.min(
      (s.reverseSpeed || REVERSE_MAX_SPEED) *
        (0.75 + 0.25 * engineHealth),
      REVERSE_MAX_SPEED,
    );

    // ----------------------------------------------------------
    // SPEED
    // ----------------------------------------------------------

    if (s.reverse) {
      // Reverse accelerates only while the brake is held.
      if (s.fuel > 0 && s.brake) {
        s.speed +=
          (reverseMax - s.speed) *
          Math.min(1, 2.6 * dt);
      } else {
        // Coasting in reverse steadily reduces reverse speed.
        s.speed = Math.max(
          0,
          s.speed - 8.5 * dt,
        );
      }

      s.speed = Math.min(
        s.speed,
        reverseMax,
      );
    } else {
      const desiredSpeed =
        s.gas && s.fuel > 0
          ? maxSpeed
          : 0;

      const acceleration = s.brake
        ? 5.8
        : s.gas && s.fuel > 0
          ? this.mode === 'timeAttack'
            ? 1.8
            : 1.0
          : 1.6;

      const engineResponse = 0.62 + 0.38 * engineHealth;
      s.speed +=
        (desiredSpeed - s.speed) *
        Math.min(1, acceleration * engineResponse * dt);

      if (s.brake) {
        s.speed = Math.max(
          0,
          s.speed - 31 * dt,
        );
      }
    }

    // ----------------------------------------------------------
    // STEERING
    // ----------------------------------------------------------

    const tyreHandling =
      0.48 + 0.52 * clamp((s.tyres ?? 100) / 100, 0, 1);

    let steeringResponse = 1;
    try {
      const requestedResponse = Number(this.dayCycle?.modifiers?.()?.steeringResponse);
      if (Number.isFinite(requestedResponse) && requestedResponse > 0) {
        steeringResponse = clamp(requestedResponse, 0.7, 1);
      }
    } catch { /* Ignore a failing optional day-cycle adapter. */ }

    const steeringRate = (
      s.environment === 'muddy'
        ? 4.1
        : 6.6
    ) * tyreHandling * steeringResponse;

    s.steer +=
      (s.targetLane - s.steer) *
      Math.min(1, dt * steeringRate);

    s.crashShake = Math.max(
      0,
      s.crashShake - dt * 2.5,
    );

    if (
      s.speed > 7.5 ||
      Math.abs(s.steer - s.targetLane) > 0.4
    ) {
      s.pullOverSide = 0;
    }

    // ----------------------------------------------------------
    // ENVIRONMENT SPEED LIMITS
    // ----------------------------------------------------------

    if (!s.reverse) {
      if (s.environment === 'muddy') {
        s.speed = Math.min(
          s.speed,
          36 * (this.driver.speedMod || 1),
        );
      }

      if (s.environment === 'rainPuddles') {
        s.speed = Math.min(
          s.speed,
          38 * (this.driver.speedMod || 1),
        );
      }

      if (
        s.environment === 'schoolGate' ||
        s.environment === 'mosqueJunction'
      ) {
        s.speed = Math.min(
          s.speed,
          28 * (this.driver.speedMod || 1),
        );
      }
    }

    this.syncSignedSpeed();

    // Reverse travel does not count as forward career distance.
    if (
      !s.reverse &&
      s.signedSpeed > 0
    ) {
      s.distance +=
        (s.signedSpeed / 3600) * dt;
    }

    // ----------------------------------------------------------
    // DAILY DISTANCE
    // ----------------------------------------------------------

    const distanceSteps =
      Math.floor(s.distance * 10) -
      Math.floor(s.lastDailyDistance * 10);

    if (distanceSteps > 0) {
      this.dailyAdd(
        'distance',
        distanceSteps / 10,
      );

      s.lastDailyDistance =
        Math.floor(s.distance * 10) / 10;
    }

    // ----------------------------------------------------------
    // TIME AND LEVEL
    // ----------------------------------------------------------

    s.gameClockMinutes =
      (408 + s.elapsed * 1.1) % 1440;

    s.night =
      s.gameClockMinutes < 360 ||
      s.gameClockMinutes >= 1140;

    s.level = 1 + Math.floor(s.distance / 1.5);

    const passengers = s.passengers.reduce(
      (total, passenger) =>
        total + passenger.seats,
      0,
    );

    // ----------------------------------------------------------
    // FUEL
    // ----------------------------------------------------------

    const fuelBase =
      this.mode === 'fuel'
        ? 0.045
        : 0.095;

    const fuelRate =
      fuelBase +
      s.speed / 1650 +
      passengers * 0.007 +
      (
        s.gas || (s.reverse && s.brake)
          ? 0.035
          : 0
      );

    s.fuel = Math.max(
      0,
      s.fuel - dt * fuelRate,
    );

    if (s.fuel <= 0) {
      s.speed = Math.max(
        0,
        s.speed - 28 * dt,
      );

      this.syncSignedSpeed();

      if (this.mode === 'fuel') {
        this.finishRun(
          'Fuel challenge failed · tank empty',
        );

        return;
      }

      if (s.toastCooldown <= 0) {
        this.ui.toast(DIALECT[s.dialect].fuel);
        s.toastCooldown = 3.5;
      }
    }

    // ----------------------------------------------------------
    // ENVIRONMENT EFFECTS
    // ----------------------------------------------------------

    if (s.environment !== 'clear') {
      s.environmentDuration = Math.max(
        0,
        s.environmentDuration - dt,
      );

      if (s.environmentDuration === 0) {
        s.environment = 'clear';
      }
    }

    if (
      s.condition <= 0 ||
      s.engine <= 0 ||
      s.tyres <= 0
    ) {
      this.endRun('Keke breakdown');
      return;
    }

    // ----------------------------------------------------------
    // ROAD OBJECTS AND TRAFFIC
    // ----------------------------------------------------------

    this.moveZones(dt);

    const collisionsBeforeTraffic = s.collisions;

    this.moveTraffic(dt);

    if (s.collisions === collisionsBeforeTraffic) {
      if (!s.reverse && s.signedSpeed > 0) {
        s.cleanDistance +=
          (s.signedSpeed / 3600) * dt;
      }

      s.safeSpeedSeconds =
        !s.reverse && s.speed >= 95
          ? s.safeSpeedSeconds + dt
          : 0;
    } else {
      s.cleanDistance = 0;
      s.safeSpeedSeconds = 0;
    }

    this.missionAdd(
      'noCollisionKm',
      s.cleanDistance,
    );

    this.missionAdd(
      'safeSpeedSeconds',
      s.safeSpeedSeconds,
    );

    if (this.state !== 'PLAY') return;

    // ----------------------------------------------------------
    // PROGRESSION AND UI
    // ----------------------------------------------------------

    this.updateEnvironment(dt);
    this.checkProgress(dt);
    this.missionUpdate();

    this.audio.engine(s.signedSpeed);

    this.ui.update(
      s,
      this.route,
      this.driver,
    );

    if (
      this.mode === 'timeAttack' &&
      s.distance >= 3.5
    ) {
      const medal = s.elapsed <= 95
        ? 'Gold'
        : s.elapsed <= 125
          ? 'Silver'
          : 'Bronze';

      updateBestTime(
        this.route.id,
        s.elapsed,
      );

      if (medal === 'Gold') {
        save.goldTimes =
          (save.goldTimes || 0) + 1;
      }

      this.finishRun(
        `${medal} medal · Time Attack complete`,
      );

      return;
    }

    if (
      this.mode === 'fuel' &&
      s.distance >= 4
    ) {
      s.score += Math.floor(s.fuel * 35);

      this.finishRun(
        'Fuel challenge complete',
      );

      return;
    }

    if (
      this.mode === 'potholes' &&
      s.distance >= 3
    ) {
      this.finishRun(
        s.potholeHits < 8
          ? 'Road survived · Potholes Challenge'
          : 'Too many potholes',
      );
    }
  }

  // ==========================================================
  // ROAD OBJECTS — DIRECTION-AWARE MOVEMENT
  // ==========================================================

  moveZones(dt) {
    const s = this.s;

    const movingForward =
      !s.reverse &&
      s.signedSpeed > 0.05;

    // Forward speed decreases depth.
    // Reverse speed increases depth.
    const signedScroll =
      dt * (s.signedSpeed / ROAD_DEPTH_SCALE);

    for (
      let index = s.zones.length - 1;
      index >= 0;
      index -= 1
    ) {
      const zone = s.zones[index];

      // Save the old depth to detect collisions that occur
      // between two simulation frames.
      const previousDepth = zone.depth;

      // Update depth before performing interaction checks.
      zone.depth -= signedScroll;

      const targetForZone = zone.lane - 1;

      const aligned =
        Math.abs(s.steer - targetForZone) <=
        (
          zone.type === 'pothole'
            ? 0.42
            : 0.48
        );

      const inRoadsideInteractionRange =
        zone.depth <= 0.19 &&
        zone.depth >= 0.055;

      const inApproachRange =
        zone.depth <= 0.34 &&
        zone.depth > 0.19;

      const permittedStopSpeed =
        zone.hub ? 6.5 : 12;

      // --------------------------------------------------------
      // ROADSIDE STOP WARNING
      // --------------------------------------------------------

      if (
        movingForward &&
        inApproachRange &&
        zone.type !== 'pothole' &&
        aligned &&
        s.speed > permittedStopSpeed &&
        !zone.warned &&
        (zone.retryAt || 0) <= s.elapsed
      ) {
        this.ui.toast(
          zone.hub
            ? 'GENERAL CHECKPOINT AHEAD · brake and pull into the stop'
            : 'Roadside stop ahead · slow and pull to the shoulder',
        );

        zone.warned = true;
        zone.retryAt = s.elapsed + 3.2;
      }

      // --------------------------------------------------------
      // POTHOLE COLLISION
      //
      // A pothole remains visible as it approaches.
      // It causes damage only at the contact plane, not anywhere
      // inside the broad roadside interaction zone.
      //
      // Swept collision checks prevent fast vehicles from skipping
      // the contact plane between successive frames.
      // --------------------------------------------------------

      if (
        movingForward &&
        zone.type === 'pothole' &&
        aligned &&
        s.speed > 0.5
      ) {
        const crossedImpactPlane =
          previousDepth > POTHOLE_IMPACT_DEPTH &&
          zone.depth <= POTHOLE_IMPACT_DEPTH;

        const insideContactBand =
          zone.depth <= POTHOLE_CONTACT_MAX &&
          zone.depth >= POTHOLE_CONTACT_MIN;

        if (
          crossedImpactPlane ||
          insideContactBand
        ) {
          this.hitPothole(zone);

          s.zones.splice(index, 1);

          this.spawnZone();

          continue;
        }
      }

      // --------------------------------------------------------
      // PASSENGERS, FUEL, AND ROADSIDE INTERACTIONS
      //
      // These actions are available only while moving forward.
      // Reversing past an object must not automatically pick up
      // passengers, drop fares, or refuel.
      // --------------------------------------------------------

      if (
        movingForward &&
        zone.type !== 'pothole' &&
        aligned &&
        inRoadsideInteractionRange &&
        s.speed <= permittedStopSpeed
      ) {
        s.pullOverSide =
          zone.side ||
          (zone.lane === 0 ? -1 : 1);

        let handled = true;

        if (zone.type === 'pickup') {
          handled = this.pickup(zone);
        } else if (zone.type === 'drop') {
          this.drop(zone);
        } else if (zone.type === 'fuel') {
          handled = this.refuel(zone);
        }

        if (handled) {
          s.zones.splice(index, 1);

          this.spawnZone();

          continue;
        }
      }

      // --------------------------------------------------------
      // REMOVE OBJECTS OUTSIDE THE ACTIVE WORLD
      // --------------------------------------------------------

      if (
        zone.depth < -0.08 ||
        zone.depth > 1.9
      ) {
        s.zones.splice(index, 1);

        this.spawnZone();
      }
    }
  }

  // ==========================================================
  // FUEL STATION
  // ==========================================================

  refuel() {
    const s = this.s;

    if (s.refillCooldown > 0) {
      return false;
    }

    if (s.fuel >= 98) {
      this.ui.toast('Tank is nearly full');
      return true;
    }

    s.fuel = Math.min(
      100,
      s.fuel + 42,
    );

    s.refills += 1;

    this.dailyAdd('refills', 1);

    s.refillCooldown = 3;

    this.missionAdd('refills', 1);

    this.ui.toast(
      'Fuel filled · Alhamdulillah',
    );

    this.audio.pickup();

    return true;
  }

  // ==========================================================
  // POTHOLE DAMAGE
  // ==========================================================

  hitPothole() {
    const s = this.s;

    s.potholeHits += 1;

    const severity =
      s.environment === 'badRoad'
        ? 1.15
        : s.environment === 'muddy'
          ? 1.25
          : 1;

    const damageModifier =
      this.driver.damageTakenMod || 1;

    s.tyres = Math.max(
      0,
      s.tyres -
        7.5 *
        severity *
        damageModifier,
    );

    s.condition = Math.max(
      0,
      s.condition -
        2.2 *
        severity *
        damageModifier,
    );

    s.engine = Math.max(
      0,
      s.engine -
        0.8 *
        severity,
    );

    s.speed *= 0.86;

    this.syncSignedSpeed();

    s.crashShake = Math.max(
      s.crashShake || 0,
      0.24 * severity,
    );

    showCollisionFlash('pothole', severity);

    s.steer = clamp(
      s.steer +
        (Math.random() < 0.5 ? -0.055 : 0.055),
      -1,
      1,
    );

    this.audio.beep?.(105, 0.14);

    this.ui.toast(
      `POTHOLE! Tyres damaged · ${s.potholeHits} hit${s.potholeHits === 1 ? '' : 's'}`,
    );
  }

  // ==========================================================
  // TRAFFIC MOVEMENT AND COLLISIONS
  // ==========================================================

  moveTraffic(dt) {
    const s = this.s;

    const playerLane = s.steer + 1;

    for (
      let index = s.traffic.length - 1;
      index >= 0;
      index -= 1
    ) {
      const vehicle = s.traffic[index];

      const previousDepth = vehicle.depth;

      const trafficSpeed =
        Number.isFinite(vehicle.speedKmh)
          ? vehicle.speedKmh
          : vehicle.direction === -1
            ? 30
            : 22;

      const roadFactor =
        s.environment === 'juma'
          ? 0.78
          : s.environment === 'muddy'
            ? 0.84
            : 1;

      // Direction -1 represents oncoming traffic.
      const trafficSignedSpeed =
        vehicle.direction === -1
          ? -trafficSpeed
          : trafficSpeed;

      const closingSpeed =
        s.signedSpeed - trafficSignedSpeed;

      vehicle.depth -=
        (closingSpeed / ROAD_DEPTH_SCALE) *
        dt *
        roadFactor;

      const impactDepth = 0.022;

      const crossedImpactPlane =
        closingSpeed > 0 &&
        previousDepth > impactDepth &&
        vehicle.depth <= impactDepth;

      const insideContactBand =
        vehicle.depth <= 0.035 &&
        vehicle.depth >= 0.012;

      const laneGap = Math.abs(
        vehicle.lane - playerLane,
      );

      const approachingContact =
        crossedImpactPlane ||
        (
          insideContactBand &&
          closingSpeed > 6
        );

      if (
        !vehicle.passed &&
        approachingContact
      ) {
        if (
          laneGap <= 0.38 &&
          s.invuln <= 0
        ) {
          vehicle.passed = true;

          this.hit(vehicle);
        } else if (
          laneGap <= 0.82 &&
          closingSpeed > 4
        ) {
          vehicle.passed = true;

          s.nearMisses += 1;

          this.dailyAdd('nearMisses', 1);

          s.combo = Math.min(
            20,
            s.combo + 1,
          );

          s.comboTimer = 5.5;

          const bonus = Math.floor(
            80 * this.comboMultiplier(),
          );

          s.score += bonus;

          this.ui.toast(
            `Near miss! +₦${bonus.toLocaleString()} · combo ×${s.combo}`,
          );

          this.missionAdd('nearMisses', 1);
          this.missionAdd('combo', s.combo);
        } else {
          vehicle.passed = true;
        }
      }

      if (
        vehicle.depth < -0.12 ||
        vehicle.depth > 1.9
      ) {
        s.traffic.splice(index, 1);

        this.spawnTraffic();
      }
    }
  }

  comboMultiplier() {
    const combo = this.s.combo;

    if (combo >= 12) return 2;
    if (combo >= 8) return 1.6;
    if (combo >= 5) return 1.3;
    if (combo >= 3) return 1.15;

    return 1;
  }

  // ==========================================================
  // TRAFFIC DAMAGE
  // ==========================================================

  hit(vehicle) {
    const s = this.s;

    s.collisions += 1;

    s.cleanDistance = 0;
    s.safeSpeedSeconds = 0;

    const trafficSpeed =
      Number.isFinite(vehicle.speedKmh)
        ? vehicle.speedKmh
        : 25;

    const trafficSignedSpeed =
      vehicle.direction === -1
        ? -trafficSpeed
        : trafficSpeed;

    const relativeSpeed = Math.abs(
      s.signedSpeed - trafficSignedSpeed,
    );

    const heavy = [
      'truck',
      'bus',
    ].includes(vehicle.type);

    const luxury =
      vehicle.type === 'suv' ||
      vehicle.type === 'car';

    const damageModifier =
      this.driver.damageTakenMod || 1;

    const severity = clamp(
      (relativeSpeed - 4) / 48,
      0.08,
      1.1,
    );

    const bodyBase = heavy
      ? 15
      : vehicle.type === 'keke'
        ? 5
        : 7.5;

    s.speed *=
      1 - (heavy ? 0.28 : 0.16) * severity;

    s.condition = Math.max(
      0,
      s.condition -
        bodyBase *
        severity *
        damageModifier,
    );

    s.engine = Math.max(
      0,
      s.engine -
        (heavy ? 5.5 : 2.2) *
        severity *
        damageModifier,
    );

    s.tyres = Math.max(
      0,
      s.tyres -
        (heavy ? 4.5 : 1.8) *
        severity *
        damageModifier,
    );

    s.heat = Math.min(
      100,
      s.heat + (heavy ? 8 : 3) * severity,
    );

    s.invuln = 1.15;
    s.combo = 0;

    s.crashShake = Math.max(
      s.crashShake,
      clamp(relativeSpeed / 65, 0.2, 1),
    );

    showCollisionFlash('traffic', severity, vehicle.lane - (s.steer + 1));

    s.steer = clamp(
      s.steer +
        (Math.random() < 0.5 ? -1 : 1) *
        0.06 *
        severity,
      -1,
      1,
    );

    this.syncSignedSpeed();

    this.audio.crash();

    this.ui.toast(
      heavy
        ? 'Heavy bump · check the keke, then keep going'
        : 'Traffic scrape · ease off and recover',
    );

    if (
      luxury &&
      relativeSpeed > 32 &&
      Math.random() < 0.12
    ) {
      this.beginEvent('rich');
    } else if (Math.random() < 0.035) {
      this.beginEvent('robber');
    }

    if (
      s.condition < 25 ||
      s.engine < 25 ||
      s.tyres < 25
    ) {
      this.ui.toast(
        'Vehicle needs attention · look for a roadside mechanic',
      );
    }
  }

  // ==========================================================
  // PASSENGER PICKUP
  // ==========================================================

  pickup(zone) {
    const s = this.s;

    const occupied = s.passengers.reduce(
      (total, passenger) =>
        total + passenger.seats,
      0,
    );

    const special =
      Boolean(zone.hub) &&
      Math.random() <
        0.10 * (this.driver.flags?.luck || 1);

    const female = Math.random() < 0.58;

    const largePassenger =
      Boolean(zone.hub) &&
      !special &&
      Math.random() < 0.30;

    const groupPickup =
      Boolean(zone.hub) &&
      !special &&
      !largePassenger;

    const vip = Math.random() < 0.10;

    const requestedSeats = zone.hub
      ? special || largePassenger
        ? 2
        : clamp(zone.seats || 2, 2, 4)
      : 1;

    if (occupied + requestedSeats > s.capacity) {
      this.ui.toast(
        zone.hub
          ? 'Checkpoint group needs more seats · clear space first'
          : 'Keke full · drop a passenger first',
      );

      return false;
    }

    if (
      this.driver.id === 'mayen-mata' &&
      !female &&
      Math.random() < 0.25
    ) {
      this.ui.toast(
        'Mayen Mata prioritises women passengers · this pickup is skipped.',
      );

      return true;
    }

    const className = special
      ? 'family passenger'
      : groupPickup
        ? 'checkpoint group'
        : largePassenger
          ? 'large passenger'
          : vip
            ? 'VIP'
            : female
              ? 'market woman'
              : 'worker';

    const fareFactor =
      randomBetween(1.0, 1.7) *
      (s.night ? 1.25 : 1) *
      (vip ? 1.45 : 1) *
      (zone.hub ? 1.15 : 1) *
      (s.breakfastEaten ? 1.05 : 1) *
      (s.fareMood || 1);

    const passenger = {
      name: special
        ? 'Aishat & 2-year-old Hibba'
        : largePassenger
          ? choose([
            'Malam Lawan (large passenger)',
            'Hajiya Hauwa (large passenger)',
          ])
          : groupPickup
            ? choose([
              'Hajiya Zainab and family',
              'Two market traders',
              'Three students',
              'Malam Musa and his children',
            ])
            : choose([
              'Malam Musa',
              'Hajiya Zainab',
              'Amina',
              'Bello',
              'Fatima',
              'Abubakar',
              'Student Ali',
              'Businessman Sani',
            ]),

      dest: zone.dest,
      seats: requestedSeats,

      fare: Math.floor(
        this.route.baseFare *
        fareFactor *
        (this.driver.fareMult || 1),
      ),

      class: className,
      female,
      special,
      group: Boolean(zone.hub),

      // Record the road conditions when this passenger boards.
      // A safe trip is rewarded only if no new collision, pothole
      // strike, or near-miss occurs before this passenger is dropped.
      tripStart: {
        collisions: s.collisions || 0,
        potholeHits: s.potholeHits || 0,
        nearMisses: s.nearMisses || 0,
        fuel: Number.isFinite(s.fuel) ? s.fuel : 100,
        distance: Number.isFinite(s.distance) ? s.distance : 0,
        tyres: Number.isFinite(s.tyres) ? s.tyres : 100,
        engine: Number.isFinite(s.engine) ? s.engine : 100,
        condition: Number.isFinite(s.condition) ? s.condition : 100,
      },
    };

    if (
      this.driver.flags?.womenBonus &&
      female
    ) {
      passenger.fare = Math.floor(
        passenger.fare *
        this.driver.flags.womenBonus,
      );
    }

    s.passengers.push(passenger);
    s.boards += 1;

    this.dailyAdd('boards', 1);

    if (vip) {
      s.vip += 1;

      this.dailyAdd('vip', 1);
    }

    if (special) {
      s.aishat += 1;

      this.dailyAdd('aishat', 1);

      this.ui.toast(
        'Aishat and little Hibba boarded · Allah ya kiyaye!',
      );

      this.missionAdd('aishat', 1);
    } else if (largePassenger) {
      this.ui.toast(
        `GENERAL CHECKPOINT · ${passenger.name} boarded · 2 seats used`,
      );
    } else if (groupPickup) {
      this.ui.toast(
        `KEKE STOP · ${passenger.name} loaded (${passenger.seats} seats)`,
      );
    } else {
      this.ui.toast(
        `${passenger.name} boarded · ${passenger.dest}`,
      );
    }

    if (
      this.driver.flags?.womenBonus &&
      female
    ) {
      this.ui.toast(
        'Mayen Mata · women passenger bonus',
      );
    }

    this.missionAdd('boards', 1);

    if (vip) {
      this.missionAdd('vip', 1);
    }

    this.audio.pickup();

    if (
      Math.random() < 0.12 &&
      this.mode === 'career'
    ) {
      window.setTimeout(() => {
        if (
          this.state === 'PLAY' &&
          !this.s.event
        ) {
          this.beginEvent('fare');
        }
      }, 0);
    }

    return true;
  }

  // ==========================================================
  // PASSENGER DROP-OFF
  // ==========================================================

  drop(zone) {
    const s = this.s;

    if (!s.passengers.length) {
      this.ui.toast('No passengers onboard');

      return true;
    }

    const passenger = s.passengers[0];

    const matched =
      passenger.dest === zone.dest;

    let fare = passenger.fare;
    let destinationMasteryBonus = 0;
    let fuelEconomyBonus = 0;
    let trustedDriverBonus = 0;
    let marketServiceBonus = 0;
    let vehicleCareBonus = 0;
    let passengerGratitudeTip = 0;

    // The cycle is optional until main.js wires the live day-loop. A missing
    // or malformed adapter must never alter the established fare calculation.
    let dayFareMultiplier = 1;
    try {
      const requestedMultiplier = Number(this.dayCycle?.modifiers?.()?.fareMultiplier);
      if (Number.isFinite(requestedMultiplier) && requestedMultiplier > 0) {
        dayFareMultiplier = clamp(requestedMultiplier, 0.5, 2);
      }
    } catch { /* Ignore a failing optional day-cycle adapter. */ }
    fare = Math.floor(fare * dayFareMultiplier);

    const tripStart = passenger.tripStart || {};
    const safeTrip =
      (s.collisions || 0) <= (tripStart.collisions ?? (s.collisions || 0)) &&
      (s.potholeHits || 0) <= (tripStart.potholeHits ?? (s.potholeHits || 0)) &&
      (s.nearMisses || 0) <= (tripStart.nearMisses ?? (s.nearMisses || 0));

    // Reward fuel-conscious journeys without requiring a special game mode.
    const fuelAtBoarding = Number.isFinite(tripStart.fuel) ? tripStart.fuel : s.fuel;
    const fuelUsed = Math.max(0, fuelAtBoarding - s.fuel);
    const tripDistance = Math.max(0, s.distance - (tripStart.distance ?? s.distance));
    const economicalFuelLimit = 1.25 + tripDistance * 8.5;
    const fuelEfficientTrip = tripDistance >= 0.025 && fuelUsed <= economicalFuelLimit;

    // Reward drivers who finish a passenger trip without abusing the keke.
    const vehicleWearDuringTrip =
      Math.max(0, (tripStart.tyres ?? s.tyres) - s.tyres) +
      Math.max(0, (tripStart.engine ?? s.engine) - s.engine) +
      Math.max(0, (tripStart.condition ?? s.condition) - s.condition);
    const vehicleCarefulTrip = safeTrip && vehicleWearDuringTrip <= 2 && s.tyres >= 55 && s.engine >= 55;
    if (vehicleCarefulTrip) {
      vehicleCareBonus = Math.min(350, Math.max(35, Math.floor(fare * 0.05)));
      fare += vehicleCareBonus;
      s.score += vehicleCareBonus;
      this.ui.toast(`Keke care bonus · +₦${vehicleCareBonus.toLocaleString()} · protected your vehicle`);
    }

    // Passenger trust grows with careful trips and falls after rough journeys.
    // The fare adjustment is deliberately modest and bounded.
    s.passengerTrust = clamp(
      (Number.isFinite(s.passengerTrust) ? s.passengerTrust : 50) + (safeTrip ? 4 : -6),
      0,
      100,
    );
    const trustFareRate = 0.9 + (s.passengerTrust / 100) * 0.3;
    fare = Math.floor(fare * trustFareRate);

    if (matched) {
      s.streak += 1;

      this.dailyAdd('streak', s.streak);
    } else {
      s.streak = 0;
    }

    if (this.mode === 'matchDrop') {
      fare = Math.floor(
        fare * (matched ? 1.75 : 0.35),
      );

      if (matched) {
        s.matchedDrops += 1;

        this.dailyAdd('matchedDrops', 1);

        this.ui.toast(
          `Correct destination! ×${s.streak}`,
        );
      } else {
        this.ui.toast(
          'Wrong stop · reduced fare',
        );
      }
    } else if (matched) {
      fare = Math.floor(fare * 1.25);

      s.matchedDrops += 1;

      this.dailyAdd('matchedDrops', 1);
    }

    // Reward learning destination patterns through consecutive correct drop-offs.
    // Milestones trigger once per streak and reset naturally after a wrong stop.
    if (matched && [3, 5, 8, 12].includes(s.streak)) {
      const milestoneRates = { 3: 0.08, 5: 0.12, 8: 0.16, 12: 0.20 };
      destinationMasteryBonus = Math.max(
        60,
        Math.floor(passenger.fare * milestoneRates[s.streak]),
      );
      fare += destinationMasteryBonus;
    }

    // A fuel-efficient trip earns a modest fare bonus, separate from the
    // safe-driving reward so players can benefit from both systems.
    if (fuelEfficientTrip) {
      fuelEconomyBonus = Math.min(500, Math.max(30, Math.floor(fare * 0.08)));
      fare += fuelEconomyBonus;
      s.score += fuelEconomyBonus;
      this.ui.toast(`Fuel-smart trip · +₦${fuelEconomyBonus.toLocaleString()} · saved ${fuelUsed.toFixed(1)} fuel`);
    }

    // Market-hub passengers reward reliable service: only a correctly matched,
    // incident-free trip earns this extra Kano market-service payment.
    if (passenger.group && matched && safeTrip) {
      marketServiceBonus = Math.min(450, Math.max(40, Math.floor(fare * 0.07)));
      fare += marketServiceBonus;
      s.score += marketServiceBonus;
      this.ui.toast(`Market service bonus · +₦${marketServiceBonus.toLocaleString()} · safe delivery to the hub`);
    }

    // Highly trusted drivers earn a loyalty payment for completing a safe
    // passenger trip. The cap keeps this reward useful without inflating fares.
    if (safeTrip && s.passengerTrust >= 80) {
      trustedDriverBonus = Math.min(600, Math.max(50, Math.floor(fare * 0.06)));
      fare += trustedDriverBonus;
      s.score += trustedDriverBonus;
      this.ui.toast(`Trusted-driver loyalty · +₦${trustedDriverBonus.toLocaleString()} · passengers trust your keke`);
    }

    // A passenger may leave a small gratitude tip when the destination is
    // correct, the trip is incident-free, and trust has been earned. This is
    // intentionally deterministic and modest, avoiding surprise wallet costs.
    if (matched && safeTrip && s.passengerTrust >= 65) {
      passengerGratitudeTip = Math.min(200, Math.max(20, Math.floor(passenger.fare * 0.04)));
      fare += passengerGratitudeTip;
      s.score += passengerGratitudeTip;
      this.ui.toast(`Passenger gratitude tip · +₦${passengerGratitudeTip.toLocaleString()} · respectful, safe service`);
    }

    // Reward considerate driving and build a consecutive safe-trip chain.
    // The chain bonus is capped so it remains useful without overpowering fares.
    if (safeTrip) {
      s.safeTripStreak = Math.min(10, (s.safeTripStreak || 0) + 1);
      const baseSafeBonus = Math.max(25, Math.floor(fare * 0.12));
      const chainRate = Math.min(0.10, Math.max(0, s.safeTripStreak - 1) * 0.02);
      const chainBonus = Math.floor(fare * chainRate);
      const safeTripBonus = baseSafeBonus + chainBonus;
      fare += safeTripBonus;
      s.score += safeTripBonus;
      const chainText = s.safeTripStreak > 1
        ? ` · safe streak ${s.safeTripStreak} (+₦${chainBonus.toLocaleString()} chain)`
        : '';
      const trustTier = s.passengerTrust >= 80
        ? 'trusted driver'
        : s.passengerTrust >= 60
          ? 'good reputation'
          : 'building trust';
      this.ui.toast(`Safe trip · +₦${safeTripBonus.toLocaleString()} · trust ${s.passengerTrust}/100 (${trustTier})${chainText}`);
    } else {
      if ((s.safeTripStreak || 0) >= 2) {
        this.ui.toast(`Safe-trip streak ended at ${s.safeTripStreak} · passenger trust ${s.passengerTrust}/100`);
      } else {
        this.ui.toast(`Rough trip · passenger trust ${s.passengerTrust}/100 · drive more carefully`);
      }
      s.safeTripStreak = 0;
    }

    s.passengers.shift();

    s.drops += 1;

    this.dailyAdd('drops', 1);
    this.dailyAdd('fares', fare);

    s.fares += fare;

    s.score += Math.floor(
      fare * (s.night ? 1.15 : 1),
    );

    s.combo = Math.min(
      20,
      s.combo + 1,
    );

    s.comboTimer = 5;

    s.heat = Math.max(
      0,
      s.heat - 2,
    );

    const masteryText = destinationMasteryBonus > 0
      ? ` · route mastery +₦${destinationMasteryBonus.toLocaleString()} (${s.streak} correct stops)`
      : '';
    const fuelEconomyText = fuelEconomyBonus > 0
      ? ` · fuel-smart +₦${fuelEconomyBonus.toLocaleString()}`
      : '';
    const trustedDriverText = trustedDriverBonus > 0
      ? ` · loyalty +₦${trustedDriverBonus.toLocaleString()}`
      : '';
    const marketServiceText = marketServiceBonus > 0
      ? ` · market service +₦${marketServiceBonus.toLocaleString()}`
      : '';
    const vehicleCareText = vehicleCareBonus > 0
      ? ` · keke care +₦${vehicleCareBonus.toLocaleString()}`
      : '';
    const gratitudeText = passengerGratitudeTip > 0
      ? ` · gratitude tip +₦${passengerGratitudeTip.toLocaleString()}`
      : '';
    this.ui.toast(
      `${passenger.name} dropped · +₦${fare.toLocaleString()}${masteryText}${fuelEconomyText}${trustedDriverText}${marketServiceText}${vehicleCareText}${gratitudeText}`,
    );

    this.missionAdd('drops', 1);
    this.missionAdd('fares', fare);

    if (matched) {
      this.missionAdd('matchedDrops', 1);
    }

    this.audio.pickup();

    return true;
  }

  // ==========================================================
  // PROGRESSION
  // ==========================================================

  checkProgress(dt = 0) {
    const s = this.s;

    if (
      s.fuel < 18 &&
      s.toastCooldown <= 0
    ) {
      this.ui.toast(
        DIALECT[s.dialect].fuel,
      );

      s.toastCooldown = 4;
    }

    this.missionAdd('distance', s.distance);
    this.missionAdd('condition', s.condition);

    s.lifeActivityTimer = Math.max(
      0,
      (s.lifeActivityTimer || 0) - dt,
    );

    if (
      this.mode !== 'timeAttack' &&
      s.distance >= 0.35 &&
      s.lifeActivityTimer <= 0 &&
      !s.event &&
      s.eventCooldown <= 0
    ) {
      s.lifeActivityTimer = randomBetween(105, 150);

      const activities = [
        'schoolRun',
        'marketDelivery',
        'vulcanizer',
        'fuelQueueLife',
        'weddingLife',
        'waterSeller',
        'goatCrossing',
      ];

      const next = activities.filter(
        (name) => name !== s.lastLifeActivity,
      );

      const activity = choose(
        next.length ? next : activities,
      );

      s.lastLifeActivity = activity;

      this.beginEvent(activity);

      if (
        s.event ||
        this.state !== 'PLAY'
      ) {
        return;
      }
    }

    if (
      this.mode === 'career' &&
      !s.event &&
      this.state === 'PLAY'
    ) {
      s.karotaTimer -= dt;

      if (
        s.karotaTimer <= 0 &&
        s.eventCooldown <= 0
      ) {
        s.karotaTimer = randomBetween(90, 118);

        if (
          s.heat >= 15 ||
          Math.random() < 0.6
        ) {
          this.beginEvent('karota');
        }
      }
    }
  }

  // ==========================================================
  // DAY-CYCLE BREAK REQUESTS
  // ==========================================================

  offerBreak(type) {
    if (!['mealBreak', 'restBreak'].includes(type)) return false;
    // Keep the request queued if a dialogue is already active; it will be
    // offered at the next safe opportunity once the cycle is connected.
    this.pendingBreak = type;
    return true;
  }

  // ==========================================================
  // ENVIRONMENT EVENTS
  // ==========================================================

  updateEnvironment(dt) {
    const s = this.s;

    // A requested meal/rest stop waits until ordinary street events clear.
    // It is deliberately dormant without a dayCycle adapter.
    if (
      this.dayCycle &&
      this.pendingBreak &&
      this.state === 'PLAY' &&
      !s.event &&
      s.eventCooldown <= 0
    ) {
      const requestedBreak = this.pendingBreak;
      this.beginEvent(requestedBreak);
      if (s.event === requestedBreak) {
        this.pendingBreak = null;
        return;
      }
    }

    s.lifeEventTimer -= dt;

    if (
      s.lifeEventTimer > 0 ||
      this.mode === 'timeAttack'
    ) {
      return;
    }

    s.lifeEventTimer = randomBetween(72, 104);

    const events = [
      'market',
      'wedding',
      'harmattan',
      'badRoad',
      'muddy',
      'fuelQueue',
      'juma',
      'schoolGate',
      'mosqueJunction',
      'rainPuddles',
    ];

    const event = choose(events);

    s.environment = event;

    s.environmentDuration = randomBetween(18, 28);

    const messages = {
      market: 'Market day · roadside pickups are busier',
      wedding: 'Bikin aure · wedding convoy ahead!',
      harmattan: 'Harmattan haze · visibility reduced',
      badRoad: 'BAD ROAD! Potholes ahead',
      muddy: 'Muddy stretch · grip reduced',
      fuelQueue: 'Fuel scarcity · save your fuel',
      juma: 'Juma’a traffic · drive with patience',
      schoolGate: 'School run rush · children near the gate, ease off',
      mosqueJunction: 'Mosque junction is busy · give people room to cross',
      rainPuddles: 'Rain puddles and broken drains · slow down, watch the edge',
    };

    if (event === 'wedding') {
      for (let index = 0; index < 3; index += 1) {
        s.traffic.push({
          id: `${Date.now()}-wedding-${index}-${Math.random()}`,

          type: 'suv',
          lane: index,
          direction: 1,

          depth: 1.05 + index * 0.12,
          speedKmh: 12 + index * 2,

          color: '#303944',

          passed: false,
          speed: 1,
        });
      }
    }

    if (
      event === 'badRoad' ||
      event === 'rainPuddles'
    ) {
      const count =
        event === 'rainPuddles'
          ? 1
          : 2;

      for (let index = 0; index < count; index += 1) {
        const lane = Math.floor(
          randomBetween(0, 3),
        );

        s.zones.push({
          id: `${Date.now()}-pothole-${index}-${Math.random()}`,

          type: 'pothole',

          prop: index === 0
            ? 'dirtmound'
            : 'cone',

          lane,

          side: lane === 0 ? -1 : 1,

          roadside: false,

          depth: 1.1 + index * 0.1,

          dest: this.route.name,
          seats: 0,

          hub: false,
          label: '',

          warned: false,
          retryAt: 0,
        });
      }
    }

    this.ui.toast(messages[event]);
  }

  // ==========================================================
  // MISSION HELPERS
  // ==========================================================

  missionAdd(key, value) {
    if (
      !Number.isFinite(value) ||
      value <= 0
    ) {
      return;
    }

    this.updateMissions(key, value);
  }

  missionUpdate() {
    const s = this.s;

    if (s.combo > s.lastDailyCombo) {
      this.dailyAdd('combo', s.combo);

      s.lastDailyCombo = s.combo;
    }

    for (const mission of s.missions) {
      if (
        mission.done ||
        mission.terminal
      ) {
        continue;
      }

      let value = s[mission.key] ?? 0;

      if (mission.key === 'distance') {
        value = s.distance;
      }

      if (mission.key === 'combo') {
        value = s.combo;
      }

      if (mission.key === 'streak') {
        value = s.streak;
      }

      if (mission.key === 'noCollisionKm') {
        value = s.cleanDistance;
      }

      if (mission.key === 'safeSpeedSeconds') {
        value = s.safeSpeedSeconds;
      }

      if (mission.key === 'cleanKm') {
        value =
          s.distance >= 1 &&
          s.condition >= 80
            ? 1
            : 0;
      }

      this.updateOneMission(
        mission,
        value,
      );
    }
  }

  updateMissions(key, value) {
    for (const mission of this.s.missions) {
      if (
        mission.key !== key ||
        mission.done
      ) {
        continue;
      }

      const previous =
        this.s.missionProgress[mission.id] || 0;

      const progress =
        ADDITIVE_MISSION_KEYS.has(key)
          ? previous + value
          : Math.max(previous, value);

      this.s.missionProgress[mission.id] = progress;

      this.updateOneMission(
        mission,
        progress,
      );
    }
  }

  updateOneMission(mission, value) {
    this.s.missionProgress[mission.id] = Math.max(
      this.s.missionProgress[mission.id] || 0,
      value,
    );

    if (
      this.s.missionProgress[mission.id] < mission.target ||
      mission.done
    ) {
      return;
    }

    mission.done = true;

    this.s.score += mission.reward;

    this.ui.toast(
      `MISSION COMPLETE · +₦${mission.reward.toLocaleString()}`,
    );
  }

  // ==========================================================
  // EVENTS
  // ==========================================================

  beginEvent(type) {
    const s = this.s;

    if (
      s.event ||
      this.state !== 'PLAY' ||
      s.eventCooldown > 0
    ) {
      return;
    }

    s.event = type;

    s.gas = false;
    s.brake = false;

    s.speed = 0;
    s.signedSpeed = 0;

    s.reverse = false;

    s.eventCooldown = 6;

    const dialect =
      DIALECT[s.dialect] || DIALECT.hausa;

    const events = {
      fare: {
        kicker: 'FARE NEGOTIATION',
        title: 'Kai, kuɗin ya yi yawa!',
        copy: `${dialect.fare} The passenger offers less than your asking price.`,
        choices: [
          ['ACCEPT LOW', 'low'],
          ['HOLD FARE', 'hold'],
          ['SHOUT & DRIVE', 'shout'],
        ],
      },

      karota: {
        kicker: 'KAROTA CHECKPOINT',
        title: 'KAROTA checkpoint',
        copy: 'An tsaya! Officers are checking permits. Pay, talk, or try to run.',
        choices: [
          ['PAY ₦700', 'pay'],
          ['TALK', 'talk'],
          ['RUN', 'run'],
        ],
      },

      rich: {
        kicker: 'RICH MAN DRAMA',
        title: 'Kai! Luxury motor!',
        copy: `A luxury vehicle has been scratched. Plate: KNO ${Math.floor(randomBetween(100, 999))} XX. Settle the matter or escape.`,
        choices: [
          ['PAY ₦3,500', 'payRich'],
          ['ARGUE', 'argue'],
          ['ESCAPE', 'escape'],
        ],
      },

      robber: {
        kicker: 'STREET DRAMA',
        title: 'Robber keke!',
        copy: 'A robber blocks your way and demands cash. Respond and continue the run.',
        choices: [
          ['GIVE ₦500', 'robPay'],
          ['HORN & ESCAPE', 'robRun'],
        ],
      },

      schoolRun: {
        kicker: 'SCHOOL GATE · MORNING RUSH',
        title: 'A parent needs a school run.',
        copy: 'A parent and two children are trying to reach school before the gate gets busy. This is a real fare, not a compulsory mission.',
        choices: [
          ['TAKE SCHOOL RUN', 'takeSchoolRun'],
          ['PASS THIS TIME', 'skipLife'],
        ],
      },

      marketDelivery: {
        kicker: 'MARKET ERRAND',
        title: 'Malam needs help with a market load.',
        copy: 'A trader at the roadside wants a short trip to Kurmi Market with a small load. It uses one seat and pays a better fare.',
        choices: [
          ['TAKE THE LOAD', 'takeMarketLoad'],
          ['PASS THIS TIME', 'skipLife'],
        ],
      },

      vulcanizer: {
        kicker: 'ROADSIDE VULCANIZER',
        title: 'Tyre man has a free bay.',
        copy: 'A vulcanizer beside the road can check the tyres before they get worse. Repairing costs in-game earnings; continuing is allowed.',
        choices: [
          ['REPAIR · ₦200', 'repairTyres'],
          ['KEEP DRIVING', 'skipLife'],
        ],
      },

      fuelQueueLife: {
        kicker: 'PETROL STATION QUEUE',
        title: 'The fuel queue is moving slowly.',
        copy: 'A nearby filling station has a short queue. Buy a little fuel now or keep your place in traffic and move on.',
        choices: [
          ['BUY FUEL · ₦250', 'buyFuel'],
          ['SKIP QUEUE', 'skipLife'],
        ],
      },

      weddingLife: {
        kicker: 'BIKIN AURE · WEDDING CONVOY',
        title: 'A wedding convoy is turning ahead.',
        copy: 'Decorated cars and family members are moving through the junction. Give them room or pass carefully.',
        choices: [
          ['YIELD RESPECTFULLY', 'yieldWedding'],
          ['PASS CAREFULLY', 'passWedding'],
          ['KEEP MOVING', 'skipLife'],
        ],
      },

      waterSeller: {
        kicker: 'ROADSIDE KIOSK',
        title: 'Pure water and phone top-up.',
        copy: 'A roadside seller has cold sachet water and phone credit. A short stop can improve the next customer interaction.',
        choices: [
          ['WATER + TOP-UP · ₦100', 'buyWater'],
          ['SKIP', 'skipLife'],
        ],
      },

      goatCrossing: {
        kicker: 'OUTSKIRTS · ANIMAL CROSSING',
        title: 'Goats are crossing near the shoulder.',
        copy: 'A small herd is moving across the road near the outskirts. Slow down for a moment or sound the horn and pass cautiously.',
        choices: [
          ['SLOW DOWN', 'slowForGoats'],
          ['HORN CAREFULLY', 'hornForGoats'],
          ['CONTINUE CAREFULLY', 'skipLife'],
        ],
      },

      mealBreak: {
        kicker: 'ROADSIDE FOOD STOP',
        title: 'Take a short food break?',
        copy: 'Choose a local meal to restore hunger. The cost comes from the current run earnings.',
        choices: [
          ['SUYA · ₦350', 'eatSuya'],
          ['KOSAI · ₦150', 'eatKosai'],
          ['FURA DA NONO · ₦200', 'drinkFura'],
          ['KEEP DRIVING', 'skipBreak'],
        ],
      },

      restBreak: {
        kicker: 'DRIVER REST STOP',
        title: 'Rest before the next trip?',
        copy: 'Tea costs money; sitting in the shade is free. Rest reduces fatigue and advances the day clock.',
        choices: [
          ['TEA & REST · ₦150', 'restTea'],
          ['REST IN SHADE · FREE', 'restShade'],
          ['KEEP DRIVING', 'skipBreak'],
        ],
      },
    };

    const event = events[type];

    if (!event) {
      s.event = null;
      this.state = 'PLAY';

      return;
    }

    this.state = 'EVENT';

    this.ui.event(
      event.kicker,
      event.title,
      event.copy,
      event.choices.map(([label, action]) => ({
        label,
        action,
      })),
    );
  }

  resolveEvent(action) {
    const s = this.s;
    const type = s.event;

    if (
      !type ||
      this.state !== 'EVENT'
    ) {
      return;
    }

    s.event = null;
    this.state = 'PLAY';

    if (type === 'mealBreak') {
      const mealOptions = {
        eatSuya: { cost: 350, relief: 50, label: 'Suya' },
        eatKosai: { cost: 150, relief: 30, label: 'Kosai' },
        drinkFura: { cost: 200, relief: 20, label: 'Fura da nono' },
      };
      const meal = mealOptions[action];
      if (meal) {
        if (s.score < meal.cost) {
          this.ui.toast(`Not enough run earnings for ${meal.label.toLowerCase()}`);
        } else {
          s.score -= meal.cost;
          try { this.dayCycle?.eat?.(meal.relief); } catch { /* keep gameplay usable if an optional adapter fails */ }
          this.ui.toast(`${meal.label} stop · -₦${meal.cost}`);
        }
      }
    } else if (type === 'restBreak') {
      if (action === 'restTea') {
        if (s.score < 150) {
          this.ui.toast('Not enough run earnings for tea');
        } else {
          s.score -= 150;
          try { this.dayCycle?.rest?.(25); } catch { /* optional adapter */ }
          this.ui.toast('Tea break · -₦150 · fatigue reduced');
        }
      } else if (action === 'restShade') {
        try { this.dayCycle?.rest?.(50); } catch { /* optional adapter */ }
        this.ui.toast('Rested in the shade · free stop');
      }
    } else if (type === 'fare') {
      if (action === 'low') {
        const passenger = s.passengers[0];

        if (passenger) {
          passenger.fare = Math.floor(
            passenger.fare * 0.65,
          );
        }

        this.ui.toast(
          'An karɓa · fare reduced',
        );
      } else if (action === 'hold') {
        s.heat += 3;

        this.ui.toast(
          'Passenger agreed to your fare',
        );
      } else {
        s.heat +=
          this.driver.flags?.lowScandal
            ? 5
            : 14;

        s.condition = Math.max(
          0,
          s.condition - 4,
        );

        this.ui.toast(
          DIALECT[s.dialect].argue,
        );
      }
    } else if (type === 'karota') {
      if (action === 'pay') {
        s.score = Math.max(
          0,
          s.score - 700,
        );

        s.heat = Math.max(
          0,
          s.heat - 15,
        );

        this.ui.toast(
          'KAROTA checkpoint settled',
        );
      } else if (action === 'talk') {
        if (
          Math.random() <
          (
            this.driver.flags?.careful
              ? 0.82
              : 0.68
          )
        ) {
          s.heat = Math.max(
            0,
            s.heat - 10,
          );

          this.ui.toast(
            'An fahimta · proceed',
          );
        } else {
          s.score = Math.max(
            0,
            s.score - 250,
          );

          s.heat += 8;

          this.ui.toast(
            'Talk failed · small fine',
          );
        }
      } else {
        s.heat = Math.min(
          100,
          s.heat + 32,
        );

        s.condition = Math.max(
          0,
          s.condition - 8,
        );

        s.speed = Math.max(
          s.speed,
          65,
        );

        this.ui.toast(
          'Escaped KAROTA · wanted heat rising',
        );
      }

      s.checkpoints += 1;

      this.missionAdd('checkpoints', 1);
      this.dailyAdd('checkpoints', 1);
    } else if (type === 'rich') {
      if (action === 'payRich') {
        s.score = Math.max(
          0,
          s.score - 3500,
        );

        s.heat = Math.max(
          0,
          s.heat - 8,
        );
      } else if (action === 'argue') {
        if (Math.random() < 0.45) {
          s.score = Math.max(
            0,
            s.score - 900,
          );

          this.ui.toast(
            DIALECT[s.dialect].argue,
          );
        } else {
          s.score = Math.max(
            0,
            s.score - 2500,
          );

          s.heat += 15;
        }
      } else {
        s.heat = Math.min(
          100,
          s.heat + 35,
        );

        s.condition = Math.max(
          0,
          s.condition - 12,
        );

        s.speed = Math.max(
          s.speed,
          70,
        );
      }
    } else if (type === 'robber') {
      if (action === 'robPay') {
        s.score = Math.max(
          0,
          s.score - 500,
        );
      } else {
        s.heat = Math.min(
          100,
          s.heat + 7,
        );

        s.speed = Math.max(
          s.speed,
          40,
        );
      }
    } else if (type === 'schoolRun') {
      if (action === 'takeSchoolRun') {
        const occupied = s.passengers.reduce(
          (total, passenger) =>
            total + passenger.seats,
          0,
        );

        if (occupied + 2 <= s.capacity) {
          const fare = Math.floor(
            this.route.baseFare * 1.65,
          );

          s.passengers.push({
            name: 'School run · parent and children',

            dest: choose([
              'BUK Gate',
              'Aminu Kano Teaching Hospital',
              'Tarauni',
            ]),

            seats: 2,
            fare,

            class: 'school run',

            female: false,
            special: false,
            group: true,
          });

          s.boards += 1;

          this.dailyAdd('boards', 1);
          this.missionAdd('boards', 1);

          this.ui.toast(
            `School run accepted · 2 seats · +₦${fare.toLocaleString()} on arrival`,
          );
        } else {
          this.ui.toast(
            'Keke is full · the school run can wait for another driver',
          );
        }
      }
    } else if (type === 'marketDelivery') {
      if (action === 'takeMarketLoad') {
        const occupied = s.passengers.reduce(
          (total, passenger) =>
            total + passenger.seats,
          0,
        );

        if (occupied + 1 <= s.capacity) {
          const fare = Math.floor(
            this.route.baseFare * 1.85,
          );

          s.passengers.push({
            name: 'Malam Kabiru’s market load',

            dest: 'Kurmi Market',

            seats: 1,
            fare,

            class: 'market delivery',

            female: false,
            special: false,
            cargo: true,
          });

          s.boards += 1;

          this.dailyAdd('boards', 1);
          this.missionAdd('boards', 1);

          this.ui.toast(
            `Market load accepted · destination Kurmi Market · +₦${fare.toLocaleString()} on delivery`,
          );
        } else {
          this.ui.toast(
            'No space for the market load · pass the job',
          );
        }
      }
    } else if (type === 'vulcanizer') {
      if (action === 'repairTyres') {
        if (s.score >= 200) {
          s.score -= 200;

          s.tyres = Math.min(
            100,
            s.tyres + 24,
          );

          s.condition = Math.min(
            100,
            s.condition + 5,
          );

          s.speed = Math.min(
            s.speed,
            8,
          );

          this.ui.toast(
            'Vulcanizer checked the tyres · back on the road',
          );
        } else {
          this.ui.toast(
            'Not enough run earnings for the repair · keep driving carefully',
          );
        }
      }
    } else if (type === 'fuelQueueLife') {
      if (action === 'buyFuel') {
        if (s.score >= 250) {
          s.score -= 250;

          s.fuel = Math.min(
            100,
            s.fuel + 28,
          );

          this.ui.toast(
            'Fuel topped up · filling station queue cleared',
          );
        } else {
          this.ui.toast(
            'Not enough run earnings for the fuel top-up',
          );
        }
      }
    } else if (type === 'weddingLife') {
      if (action === 'yieldWedding') {
        s.score += 45;

        s.speed = Math.min(
          s.speed,
          7,
        );

        this.ui.toast(
          'Barka da aure · you gave the convoy room',
        );
      } else if (action === 'passWedding') {
        if (Math.random() < 0.8) {
          this.ui.toast(
            'Passed the convoy carefully',
          );
        } else {
          s.condition = Math.max(
            0,
            s.condition - 2,
          );

          s.score = Math.max(
            0,
            s.score - 80,
          );

          this.ui.toast(
            'Mirror scrape · slow down near the convoy',
          );
        }
      }
    } else if (type === 'waterSeller') {
      if (action === 'buyWater') {
        if (s.score >= 100) {
          s.score -= 100;

          s.morale = Math.min(
            100,
            (s.morale ?? 75) + 15,
          );

          s.fareMood = Math.min(
            1.12,
            (s.fareMood ?? 1) + 0.02,
          );

          this.ui.toast(
            'Water and phone top-up bought · morale lifted',
          );
        } else {
          this.ui.toast(
            'Keep your cash for fuel and repairs',
          );
        }
      }
    } else if (type === 'goatCrossing') {
      if (action === 'slowForGoats') {
        s.speed = Math.min(
          s.speed,
          6,
        );

        s.score += 25;

        this.ui.toast(
          'The goats crossed safely · careful driving bonus',
        );
      } else if (action === 'hornForGoats') {
        s.speed = Math.min(
          s.speed,
          12,
        );

        this.audio.horn();

        this.ui.toast(
          'Horn sounded · goats moved to the shoulder',
        );
      }
    }

    if (type === 'rich') {
      s.richDramas += 1;

      this.missionAdd('richDramas', 1);
      this.dailyAdd('richDramas', 1);
    }

    // Events stop the keke and return the player to forward gear.
    // Preserve any speed deliberately set by the event result.
    s.reverse = false;

    this.syncSignedSpeed();

    s.invuln = 2;

    this.ui.hideEvent();

    this.ui.update(
      s,
      this.route,
      this.driver,
    );
  }

  // ==========================================================
  // RUN ENDING
  // ==========================================================

  endRun(reason) {
    this.finishOrContinue(reason, true);
  }

  finishRun(reason) {
    this.finishOrContinue(reason, false);
  }

  finishOrContinue(reason, allowContinue) {
    const s = this.s;

    if (s.runEnded) return;

    s.runEnded = true;

    s.gas = false;
    s.brake = false;

    s.speed = 0;
    s.signedSpeed = 0;

    s.reverse = false;

    this.state = 'OVER';

    this.audio.engine(0);

    const canContinue =
      allowContinue &&
      (
        s.lives > 0 ||
        save.money >= s.paidContinueCost
      );

    if (canContinue) {
      this.ui.gameOver({
        reason,
        earned: 0,
        run: s,
        best: save.highScore,
        standing: tribeStanding(),
        board: save.tribes[s.dialect] || [],
        soft: true,
      });

      return;
    }

    this.completeTerminalMissions();

    if (s.fuel >= 30) {
      this.dailyAdd('endFuel', 1);
    }

    if (s.condition >= 75) {
      this.dailyAdd('endCondition', 1);
    }

    if (
      s.distance >= 3 &&
      s.potholeHits < 8
    ) {
      this.dailyAdd('potholesClean', 1);
    }

    const earned = bankRun({
      score: s.score,
      fares: s.fares,
      distance: s.distance,
      driver: this.driver.name,
      mode: this.mode,
    });

    const board = submitTribe({
      score: s.score,
      distance: s.distance,
      driver: this.driver.name,
      mode: this.mode,
    }, s.dialect);

    save.tribeSubmits =
      (save.tribeSubmits || 0) + 1;

    for (const achievement of ACHIEVEMENTS) {
      const runRecord = {
        ...s,

        goldTimes: save.goldTimes || 0,
        tribeSubmits: save.tribeSubmits,
      };

      if (
        achievement.test(runRecord) &&
        unlockAchievement(achievement.id)
      ) {
        this.ui.toast(
          `Achievement unlocked: ${achievement.name}`,
        );
      }
    }

    persist();

    this.ui.gameOver({
      reason,
      earned,
      run: s,
      best: save.highScore,
      standing: tribeStanding(),
      board,
      soft: false,
    });
  }

  completeTerminalMissions() {
    for (const mission of this.s.missions) {
      if (
        !mission.terminal ||
        mission.done
      ) {
        continue;
      }

      let qualifies = false;

      if (mission.terminal === 'fuel') {
        qualifies =
          this.s.fuel >= mission.threshold;
      } else if (mission.terminal === 'condition') {
        qualifies =
          this.s.condition >= mission.threshold;
      } else if (mission.terminal === 'cleanPotholes') {
        qualifies =
          this.s.distance >= mission.distance &&
          this.s.potholeHits < mission.maxHits;
      }

      if (qualifies) {
        this.updateOneMission(
          mission,
          mission.target,
        );
      }
    }
  }

  // ==========================================================
  // CONTINUE RUN
  // ==========================================================

  continueRun(paid = false) {
    if (this.state !== 'OVER') return;

    const s = this.s;

    if (!paid && s.lives > 0) {
      s.lives -= 1;
    } else if (paid) {
      if (save.money < s.paidContinueCost) {
        this.ui.toast(
          'Not enough banked money for a continue',
        );

        return;
      }

      save.money -= s.paidContinueCost;

      s.paidContinueCost = Math.floor(
        s.paidContinueCost * 1.8,
      );

      s.continues += 1;

      persist();
    } else {
      this.ui.toast(
        'No life savers remain',
      );

      return;
    }

    s.runEnded = false;
    s.invuln = 4;

    s.condition = Math.max(
      35,
      s.condition,
    );

    s.engine = Math.max(
      35,
      s.engine,
    );

    s.tyres = Math.max(
      35,
      s.tyres,
    );

    s.fuel = Math.max(
      16,
      s.fuel,
    );

    s.speed = 0;
    s.signedSpeed = 0;

    s.reverse = false;

    s.gas = false;
    s.brake = false;
    s.event = null;

    this.state = 'PLAY';

    this.ui.hide('over-screen');
    this.ui.hideEvent();
    this.ui.startPlay();

    this.ui.toast(
      'Life saver used · 4 seconds invulnerable',
    );
  }
}