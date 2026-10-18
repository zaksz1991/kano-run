import {
  ROUTES, DRIVERS, RADIO, DIALECT, MODES, MISSION_POOL, DAILY_MISSION_POOL, ACHIEVEMENTS,
} from './config.js';
import {
  save, persist, bankRun, submitTribe, tribeStanding,
  updateBestTime, unlockAchievement, dailyLoginStatus, addDailyMissionProgress,
} from './storage.js';

const randomBetween = (min, max) => min + Math.random() * (max - min);
const choose = (items) => items[Math.floor(Math.random() * items.length)];
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

const VALID_MODES = new Set([
  'career', 'timeAttack', 'fuel', 'matchDrop', 'potholes', 'freeRoam',
]);

// These mission keys describe events or totals earned over the run. Their
// values are increments; all other keys are peak/current-value objectives.
const ADDITIVE_MISSION_KEYS = new Set([
  'drops', 'boards', 'fares', 'matchedDrops', 'nearMisses', 'checkpoints',
  'refills', 'vip', 'aishat', 'horns', 'richDramas',
]);

export class Game {
  constructor(ui, audio, { mobile = false } = {}) {
    this.ui = ui;
    this.audio = audio;
    this.mobile = mobile;
    this.state = 'INTRO';
    this.mode = 'career';
    this.route = ROUTES[0];
    this.driver = DRIVERS.find((item) => item.id === save.driverId) || DRIVERS[0];
    this.resetRun();
    this.ui.bind(this);
  }

  resetRun() {
    const capacity = Math.max(3, 5 + (this.driver.capacityMod || 0));
    this.s = {
      score: 0,
      fares: 0,
      breakfastEaten: false,
      breakfastCost: 0,
      morale: 75,
      fareMood: 1,
      guardedOvernight: false,
      distance: 0,
      speed: 0,
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
      dialect: DIALECT[save.dialect] ? save.dialect : 'hausa',
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
    this.spawnInitial();
    this.chooseMissions();
  }

  spawnInitial() {
    for (let index = 0; index < 5; index += 1) this.spawnZone(index);
    const trafficCount = this.mobile ? 5 : 8;
    for (let index = 0; index < trafficCount; index += 1) this.spawnTraffic(index);
  }

  spawnZone(initialIndex = null) {
    const roll = Math.random();
    let type;
    if ((this.s.environment === 'market' || this.s.environment === 'schoolGate') && roll < 0.62) type = 'pickup';
    else if (this.s.environment === 'rainPuddles' && roll < 0.42) type = 'pothole';
    else if (this.s.environment === 'fuelQueue') type = roll < 0.38 ? 'pickup' : roll < 0.64 ? 'drop' : roll < 0.82 ? 'fuel' : 'pothole';
    else type = roll < 0.34 ? 'pickup' : roll < 0.61 ? 'drop' : roll < 0.76 ? 'fuel' : 'pothole';

    // Passenger/fuel stops live on a shoulder pull-in, never in the centre of a live lane.
    const side = Math.random() < 0.5 ? -1 : 1;
    const hub = type === 'pickup' && Math.random() < 0.32;
    const lane = type === 'pothole'
      ? Math.floor(randomBetween(0, 3))
      : (side < 0 ? 0 : 2);
    const dest = this.chooseZoneDestination(type);
    const seats = type === 'pickup' ? (hub ? Math.floor(randomBetween(2, 5)) : 1) : 0;
    const depth = Number.isInteger(initialIndex)
      ? 0.52 + initialIndex * 0.15
      : randomBetween(1.05, 1.30);
    const label = hub ? `GENERAL CHECKPOINT · KEKE STOP · ${dest}`
      : type === 'pickup' ? `PICK UP · ${dest}`
        : type === 'drop' ? `DROP OFF · ${dest}`
          : type === 'fuel' ? 'FUEL STOP' : 'BAD ROAD';
    this.s.zones.push({
      id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
      type, lane, side, roadside: type !== 'pothole', depth, dest, seats, hub,
      label, warned: false, retryAt: 0,
    });
  }

  chooseZoneDestination(type) {
    if (type === 'drop' && this.s.passengers.length) {
      const matchChance = this.mode === 'matchDrop' ? 0.82 : 0.68;
      if (Math.random() < matchChance) return choose(this.s.passengers).dest;
    }
    if (type === 'drop' && Math.random() < 0.58) return this.route.name;
    return choose(ROUTES).name;
  }

  spawnTraffic(initialIndex = null) {
    const types = ['keke', 'car', 'taxi', 'suv', 'motorcycle', 'keke', 'car'];
    if (!this.mobile) types.push('truck', 'bus', 'police', 'karota');
    const type = choose(types);
    const lane = Math.floor(randomBetween(0, 3));
    // In Nigeria's normal left-driving flow, traffic stays with us by default.
    // Two-way mode reserves the far-right lane for visible oncoming traffic.
    const direction = this.s.roadMode === 'twoway' && lane === 0 ? -1 : 1;
    const depth = Number.isInteger(initialIndex)
      ? 0.68 + initialIndex * 0.12
      : randomBetween(1.02, 1.34);
    const speedKmh = direction === -1
      ? randomBetween(24, 43)
      : randomBetween(16, 34);
    this.s.traffic.push({
      id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
      type, lane, direction, depth, speedKmh,
      color: choose(['#e4c24e', '#d7e1e9', '#bd5142', '#3983b9', '#36404d', '#f2f2f2']),
      passed: false,
      speed: randomBetween(0.92, 1.08),
    });
  }

  chooseMissions() {
    this.s.missions = this.mode === 'career'
      ? [...MISSION_POOL]
        .sort(() => Math.random() - 0.5)
        .slice(0, 3)
        .map((mission) => ({ ...mission, done: false }))
      : [];
    for (const mission of this.s.missions) this.s.missionProgress[mission.id] = 0;
  }

  start(mode = this.mode) {
    if (!VALID_MODES.has(mode)) mode = 'career';
    this.mode = mode;
    this.route = ROUTES.find((route) => route.id === save.routeId) || this.route || ROUTES[0];
    this.driver = DRIVERS.find((driver) => driver.id === save.driverId) || this.driver || DRIVERS[0];
    this.resetRun();
    this.state = 'PLAY';
    this.s.runStartedAt = Date.now();
    this.audio.start();
    this.ui.startPlay();
    this.ui.toast(`${DIALECT[this.s.dialect].greet} ${this.route.name} — ka tafi!`);
    this.checkDaily();
  }

  checkDaily() {
    dailyLoginStatus();
    this.ui.refreshDailyLogin?.();
    this.ui.refreshDailyMissions?.();
  }

  dailyAdd(key, amount) {
    const newlyReady = addDailyMissionProgress(key, amount, DAILY_MISSION_POOL);
    for (const mission of newlyReady) {
      this.ui.toast(`DAILY MISSION READY · ${mission.text} · claim ₦${mission.reward.toLocaleString()} in the menu`);
    }
    if (newlyReady.length) this.ui.refreshDailyMissions?.();
  }

  setMode(mode) {
    if (!VALID_MODES.has(mode)) return;
    this.start(mode);
    this.ui.toast(`${MODES[mode]?.label || 'Free roam'} started`);
  }

  lane(direction) {
    if (this.state !== 'PLAY' || this.s.event) return;
    this.s.targetLane = clamp(this.s.targetLane + Math.sign(direction), -1, 1);
  }

  gas(value) {
    if (this.state === 'PLAY') {
      this.s.gas = Boolean(value);
      if (value) this.s.brake = false;
    }
  }

  brake(value) {
    if (this.state === 'PLAY') {
      this.s.brake = Boolean(value);
      if (value) this.s.gas = false;
    }
  }

  horn() {
    if (this.state !== 'PLAY') return;
    this.audio.horn();
    const close = this.s.traffic.some((vehicle) => (
      vehicle.depth > 0.72
      && Math.abs(vehicle.lane - (this.s.targetLane + 1)) <= 1
    ));
    if (close) {
      this.s.horns += 1;
      this.ui.toast(this.s.dialect === 'hausa' ? 'Peeep! Ka ji ƙaho!' : 'Horn sounded!');
      this.missionAdd('horns', 1);
    }
  }

  menu() {
    if (this.state === 'PLAY') {
      this.state = 'MENU';
      this.s.gas = false;
      this.s.brake = false;
      this.audio.engine(0);
      this.ui.refreshDailyLogin?.();
      this.ui.refreshDailyMissions?.();
      this.ui.show('menu-screen');
    } else if (this.state === 'MENU') {
      this.state = 'PLAY';
      this.ui.hide('menu-screen');
    }
  }

  tick(deltaSeconds) {
    if (this.state !== 'PLAY' || this.s.event) return;
    const dt = clamp(Number(deltaSeconds) || 0, 0, 0.045);
    const s = this.s;
    s.elapsed += dt;
    s.time += dt;
    s.invuln = Math.max(0, s.invuln - dt);
    s.refillCooldown = Math.max(0, s.refillCooldown - dt);
    s.toastCooldown = Math.max(0, s.toastCooldown - dt);
    s.eventCooldown = Math.max(0, s.eventCooldown - dt);
    s.comboTimer = Math.max(0, s.comboTimer - dt);
    if (s.comboTimer === 0) s.combo = 0;

    // A working Kano keke should cruise calmly between stops, not feel like a racing bike.
    // Gas gives a decisive but believable rise; Time Attack remains the fast mode.
    const modeSpeed = this.mode === 'timeAttack' ? 150 : this.mode === 'freeRoam' ? 36 : 38;
    const maxSpeed = modeSpeed * (this.driver.speedMod || 1);
    const desiredSpeed = s.gas ? maxSpeed : 0;
    const acceleration = s.brake ? 5.8 : s.gas ? (this.mode === 'timeAttack' ? 1.8 : 1.0) : 1.6;
    s.speed += (desiredSpeed - s.speed) * Math.min(1, acceleration * dt);
    if (s.brake) s.speed = Math.max(0, s.speed - 31 * dt);
    const tyreHandling = 0.62 + 0.38 * (s.tyres / 100);
    const steeringRate = (s.environment === 'muddy' ? 4.1 : 6.6) * tyreHandling;
    s.steer += (s.targetLane - s.steer) * Math.min(1, dt * steeringRate);
    s.crashShake = Math.max(0, s.crashShake - dt * 2.5);
    if (s.speed > 7.5 || Math.abs(s.steer - s.targetLane) > 0.4) s.pullOverSide = 0;
    if (s.environment === 'muddy') s.speed = Math.min(s.speed, 36 * (this.driver.speedMod || 1));
    if (s.environment === 'rainPuddles') s.speed = Math.min(s.speed, 38 * (this.driver.speedMod || 1));
    if (s.environment === 'schoolGate' || s.environment === 'mosqueJunction') s.speed = Math.min(s.speed, 28 * (this.driver.speedMod || 1));
    s.distance += (s.speed / 3600) * dt;
    const distanceSteps = Math.floor(s.distance * 10) - Math.floor(s.lastDailyDistance * 10);
    if (distanceSteps > 0) {
      this.dailyAdd('distance', distanceSteps / 10);
      s.lastDailyDistance = Math.floor(s.distance * 10) / 10;
    }
    // In-game clock advances from the morning departure rather than flipping
    // between night and day every few seconds. A complete day is about 22 real minutes.
    s.gameClockMinutes = (408 + s.elapsed * 1.1) % 1440;
    s.night = s.gameClockMinutes < 360 || s.gameClockMinutes >= 1140;
    s.level = 1 + Math.floor(s.distance / 1.5);

    const passengers = s.passengers.reduce((total, passenger) => total + passenger.seats, 0);
    const fuelBase = this.mode === 'fuel' ? 0.045 : 0.095;
    const fuelRate = fuelBase + s.speed / 1650 + passengers * 0.007 + (s.gas ? 0.035 : 0);
    s.fuel = Math.max(0, s.fuel - dt * fuelRate);
    if (s.fuel <= 0) {
      s.speed = Math.max(0, s.speed - 28 * dt);
      if (this.mode === 'fuel') {
        this.finishRun('Fuel challenge failed · tank empty');
        return;
      }
      if (s.toastCooldown <= 0) {
        this.ui.toast(DIALECT[s.dialect].fuel);
        s.toastCooldown = 3.5;
      }
    }

    if (s.environment !== 'clear') {
      s.environmentDuration = Math.max(0, s.environmentDuration - dt);
      if (s.environmentDuration === 0) s.environment = 'clear';
    }

    if (s.condition <= 0 || s.engine <= 0 || s.tyres <= 0) {
      this.endRun('Keke breakdown');
      return;
    }

    this.moveZones(dt);
    const collisionsBeforeTraffic = s.collisions;
    this.moveTraffic(dt);
    if (s.collisions === collisionsBeforeTraffic) {
      s.cleanDistance += Math.max(0, s.speed / 3600) * dt;
      s.safeSpeedSeconds = s.speed >= 95 ? s.safeSpeedSeconds + dt : 0;
    } else {
      s.cleanDistance = 0;
      s.safeSpeedSeconds = 0;
    }
    this.missionAdd('noCollisionKm', s.cleanDistance);
    this.missionAdd('safeSpeedSeconds', s.safeSpeedSeconds);
    if (this.state !== 'PLAY') return;
    this.updateEnvironment(dt);
    this.checkProgress(dt);
    this.missionUpdate();
    this.audio.engine(s.speed);
    this.ui.update(s, this.route, this.driver);

    if (this.mode === 'timeAttack' && s.distance >= 3.5) {
      const medal = s.elapsed <= 95 ? 'Gold' : s.elapsed <= 125 ? 'Silver' : 'Bronze';
      updateBestTime(this.route.id, s.elapsed);
      if (medal === 'Gold') save.goldTimes = (save.goldTimes || 0) + 1;
      this.finishRun(`${medal} medal · Time Attack complete`);
      return;
    }
    if (this.mode === 'fuel' && s.distance >= 4) {
      s.score += Math.floor(s.fuel * 35);
      this.finishRun('Fuel challenge complete');
      return;
    }
    if (this.mode === 'potholes' && s.distance >= 3) {
      this.finishRun(s.potholeHits < 8 ? 'Road survived · Potholes Challenge' : 'Too many potholes');
      return;
    }
  }

  moveZones(dt) {
    const s = this.s;
    const scroll = dt * (Math.max(0, s.speed) / 316.8);
    const steerTarget = s.targetLane;

    for (let index = s.zones.length - 1; index >= 0; index -= 1) {
      const zone = s.zones[index];
      const targetForZone = zone.lane - 1;
      const aligned = Math.abs(s.steer - targetForZone) <= (zone.type === 'pothole' ? 0.42 : 0.48);
      const inInteractionRange = zone.depth <= 0.19 && zone.depth >= 0.055;
      const approachRange = zone.depth <= 0.34 && zone.depth > 0.19;
      const permittedStopSpeed = zone.hub ? 6.5 : 12;

      if (approachRange && zone.type !== 'pothole' && aligned && s.speed > permittedStopSpeed && !zone.warned && zone.retryAt <= s.elapsed) {
        this.ui.toast(zone.hub ? 'GENERAL CHECKPOINT AHEAD · brake and pull into the stop' : 'Roadside stop ahead · slow and pull to the shoulder');
        zone.warned = true;
        zone.retryAt = s.elapsed + 3.2;
      }

      if (zone.type === 'pothole' && aligned && inInteractionRange) {
        this.hitPothole(zone);
        s.zones.splice(index, 1);
        this.spawnZone();
        continue;
      }

      if (zone.type !== 'pothole' && aligned && inInteractionRange && s.speed <= permittedStopSpeed) {
        // Pull well onto the verge, rather than stopping in the middle of a traffic lane.
        s.pullOverSide = zone.side || (zone.lane === 0 ? -1 : 1);
        let handled = true;
        if (zone.type === 'pickup') handled = this.pickup(zone);
        else if (zone.type === 'drop') this.drop(zone);
        else if (zone.type === 'fuel') handled = this.refuel(zone);
        if (handled) {
          s.zones.splice(index, 1);
          this.spawnZone();
          continue;
        }
      }

      // Markers always travel with the world. Missing a stop does not freeze the road
      // or trap a player in a forced lane/stop condition.
      zone.depth -= scroll;
      if (zone.depth < -0.08 || zone.depth > 1.55) {
        s.zones.splice(index, 1);
        this.spawnZone();
      }
    }
  }

  refuel() {
    const s = this.s;
    if (s.refillCooldown > 0) return false;
    if (s.fuel >= 98) {
      this.ui.toast('Tank is nearly full');
      return true;
    }
    s.fuel = Math.min(100, s.fuel + 42);
    s.refills += 1;
    this.dailyAdd('refills', 1);
    s.refillCooldown = 3;
    this.missionAdd('refills', 1);
    this.ui.toast('Fuel filled · Alhamdulillah');
    this.audio.pickup();
    return true;
  }

  hitPothole() {
    const s = this.s;
    s.potholeHits += 1;
    const severity = this.s.environment === 'badRoad' ? 1.15 : this.s.environment === 'muddy' ? 1.25 : 1;
    s.tyres = Math.max(0, s.tyres - 7.5 * severity * (this.driver.damageTakenMod || 1));
    s.condition = Math.max(0, s.condition - 2.2 * severity * (this.driver.damageTakenMod || 1));
    s.engine = Math.max(0, s.engine - 0.8 * severity);
    s.speed *= 0.86;
    s.crashShake = Math.max(s.crashShake || 0, 0.24 * severity);
    s.steer = clamp(s.steer + (Math.random() < 0.5 ? -0.055 : 0.055), -1, 1);
    this.audio.beep?.(105, 0.14);
    this.ui.toast(`POTHOLE! Tyres damaged · ${s.potholeHits} hit${s.potholeHits === 1 ? '' : 's'}`);
  }

  moveTraffic(dt) {
    const s = this.s;
    const playerLane = s.steer + 1;

    for (let index = s.traffic.length - 1; index >= 0; index -= 1) {
      const vehicle = s.traffic[index];
      const previousDepth = vehicle.depth;
      const trafficSpeed = Number.isFinite(vehicle.speedKmh)
        ? vehicle.speedKmh
        : (vehicle.direction === -1 ? 30 : 22);
      const oncoming = vehicle.direction === -1;
      const roadFactor = s.environment === 'juma' ? 0.78 : s.environment === 'muddy' ? 0.84 : 1;
      // depth is metres/88. Same-direction vehicles only approach when the player
      // is actually closing the gap; faster traffic recedes. Oncoming traffic closes
      // at the sum of both speeds. This fixes the old unconditional head-on motion.
      const closingSpeed = oncoming ? s.speed + trafficSpeed : s.speed - trafficSpeed;
      vehicle.depth -= (closingSpeed / 316.8) * dt * roadFactor;
      const impactDepth = 0.022; // aligned with the visible bumper-to-bumper contact point
      const crossedImpactPlane = previousDepth > impactDepth && vehicle.depth <= impactDepth;
      const insideContactBand = vehicle.depth <= 0.035 && vehicle.depth >= 0.012;
      const laneGap = Math.abs(vehicle.lane - playerLane);

      if (!vehicle.passed && (crossedImpactPlane || insideContactBand && closingSpeed > 6)) {
        if (laneGap <= 0.38 && s.invuln <= 0) {
          vehicle.passed = true;
          this.hit(vehicle);
        } else if (laneGap <= 0.82 && closingSpeed > 4) {
          vehicle.passed = true;
          s.nearMisses += 1;
          this.dailyAdd('nearMisses', 1);
          s.combo = Math.min(20, s.combo + 1);
          s.comboTimer = 5.5;
          const bonus = Math.floor(80 * this.comboMultiplier());
          s.score += bonus;
          this.ui.toast(`Near miss! +₦${bonus.toLocaleString()} · combo ×${s.combo}`);
          this.missionAdd('nearMisses', 1);
          this.missionAdd('combo', s.combo);
        } else {
          vehicle.passed = true;
        }
      }

      if (vehicle.depth < -0.12 || vehicle.depth > 1.58) {
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

  hit(vehicle) {
    const s = this.s;
    s.collisions += 1;
    s.cleanDistance = 0;
    s.safeSpeedSeconds = 0;
    const oncoming = vehicle.direction === -1;
    const trafficSpeed = Number.isFinite(vehicle.speedKmh) ? vehicle.speedKmh : 25;
    const relativeSpeed = oncoming ? s.speed + trafficSpeed : Math.abs(s.speed - trafficSpeed);
    const heavy = ['truck', 'bus'].includes(vehicle.type);
    const luxury = vehicle.type === 'suv' || vehicle.type === 'car';
    const mod = this.driver.damageTakenMod || 1;
    const severity = clamp((relativeSpeed - 4) / 48, 0.08, 1.1);
    const bodyBase = heavy ? 15 : vehicle.type === 'keke' ? 5 : 7.5;

    // Low-speed scrapes are recoverable. High-relative-speed impacts cost more,
    // but one bump should not instantly ruin an otherwise good run.
    s.speed *= 1 - (heavy ? 0.28 : 0.16) * severity;
    s.condition = Math.max(0, s.condition - bodyBase * severity * mod);
    s.engine = Math.max(0, s.engine - (heavy ? 5.5 : 2.2) * severity * mod);
    s.tyres = Math.max(0, s.tyres - (heavy ? 4.5 : 1.8) * severity * mod);
    s.heat = Math.min(100, s.heat + (heavy ? 8 : 3) * severity);
    s.invuln = 1.15;
    s.combo = 0;
    s.crashShake = Math.max(s.crashShake, clamp(relativeSpeed / 65, 0.2, 1));
    s.steer = clamp(s.steer + (Math.random() < 0.5 ? -1 : 1) * 0.06 * severity, -1, 1);
    this.audio.crash();
    this.ui.toast(heavy ? 'Heavy bump · check the keke, then keep going' : 'Traffic scrape · ease off and recover');

    if (luxury && relativeSpeed > 32 && Math.random() < 0.12) {
      this.beginEvent('rich');
    } else if (Math.random() < 0.035) {
      this.beginEvent('robber');
    }
    if (s.condition < 25 || s.engine < 25 || s.tyres < 25) {
      this.ui.toast('Vehicle needs attention · look for a roadside mechanic');
    }
  }

  pickup(zone) {
    const s = this.s;
    const occupied = s.passengers.reduce((total, passenger) => total + passenger.seats, 0);
    const special = Boolean(zone.hub) && Math.random() < 0.10 * (this.driver.flags?.luck || 1);
    const female = Math.random() < 0.58;
    // Ordinary shoulder stops board one seat only. A marked General Checkpoint
    // can board either one large passenger, Aishat+Hibba, or a 2-4 person group.
    const largePassenger = Boolean(zone.hub) && !special && Math.random() < 0.30;
    const groupPickup = Boolean(zone.hub) && !special && !largePassenger;
    const vip = Math.random() < 0.10;
    const requestedSeats = zone.hub ? (special || largePassenger ? 2 : clamp(zone.seats || 2, 2, 4)) : 1;
    if (occupied + requestedSeats > s.capacity) {
      this.ui.toast(zone.hub ? 'Checkpoint group needs more seats · clear space first' : 'Keke full · drop a passenger first');
      return false;
    }
    if (this.driver.id === 'mayen-mata' && !female && Math.random() < 0.25) {
      this.ui.toast('Mayen Mata prioritises women passengers · this pickup is skipped.');
      return true;
    }
    const className = special ? 'family passenger' : groupPickup ? 'checkpoint group' : largePassenger ? 'large passenger' : vip ? 'VIP' : female ? 'market woman' : 'worker';
    const fareFactor = randomBetween(1.0, 1.7) * (s.night ? 1.25 : 1) * (vip ? 1.45 : 1) * (zone.hub ? 1.15 : 1) * (s.breakfastEaten ? 1.05 : 1) * (s.fareMood || 1);
    const passenger = {
      name: special ? 'Aishat & 2-year-old Hibba'
        : largePassenger ? choose(['Malam Lawan (large passenger)', 'Hajiya Hauwa (large passenger)'])
        : groupPickup ? choose(['Hajiya Zainab and family', 'Two market traders', 'Three students', 'Malam Musa and his children'])
            : choose(['Malam Musa', 'Hajiya Zainab', 'Amina', 'Bello', 'Fatima', 'Abubakar', 'Student Ali', 'Businessman Sani']),
      dest: zone.dest,
      seats: requestedSeats,
      fare: Math.floor(this.route.baseFare * fareFactor * (this.driver.fareMult || 1)),
      class: className, female, special, group: Boolean(zone.hub),
    };
    if (this.driver.flags?.womenBonus && female) passenger.fare = Math.floor(passenger.fare * this.driver.flags.womenBonus);
    s.passengers.push(passenger);
    s.boards += 1;
    this.dailyAdd('boards', 1);
    if (vip) { s.vip += 1; this.dailyAdd('vip', 1); }
    if (special) {
      s.aishat += 1;
      this.dailyAdd('aishat', 1);
      this.ui.toast('Aishat and little Hibba boarded · Allah ya kiyaye!');
      this.missionAdd('aishat', 1);
    } else if (largePassenger) {
      this.ui.toast(`GENERAL CHECKPOINT · ${passenger.name} boarded · 2 seats used`);
    } else if (groupPickup) {
      this.ui.toast(`KEKE STOP · ${passenger.name} loaded (${passenger.seats} seats)`);
    } else {
      this.ui.toast(`${passenger.name} boarded · ${passenger.dest}`);
    }
    if (this.driver.flags?.womenBonus && female) this.ui.toast('Mayen Mata · women passenger bonus');
    this.missionAdd('boards', 1);
    if (vip) this.missionAdd('vip', 1);
    this.audio.pickup();
    if (Math.random() < 0.12 && this.mode === 'career') {
      window.setTimeout(() => {
        if (this.state === 'PLAY' && !s.event) this.beginEvent('fare');
      }, 0);
    }
    return true;
  }

  drop(zone) {
    const s = this.s;
    if (!s.passengers.length) {
      this.ui.toast('No passengers onboard');
      return true;
    }
    const passenger = s.passengers[0];
    // Match Drop is destination-based, not route-origin-based. A stop only
    // counts as correct when it matches the passenger's actual destination.
    const matched = passenger.dest === zone.dest;
    let fare = passenger.fare;
    if (matched) {
      s.streak += 1;
      this.dailyAdd('streak', s.streak);
    } else {
      s.streak = 0;
    }

    if (this.mode === 'matchDrop') {
      fare = Math.floor(fare * (matched ? 1.75 : 0.35));
      if (matched) {
        s.matchedDrops += 1;
        this.dailyAdd('matchedDrops', 1);
        this.ui.toast(`Correct destination! ×${s.streak} streak`);
      } else {
        this.ui.toast('Wrong stop · reduced fare');
      }
    } else if (matched) {
      fare = Math.floor(fare * 1.25);
      s.matchedDrops += 1;
      this.dailyAdd('matchedDrops', 1);
    }
    s.passengers.shift();
    s.drops += 1;
    this.dailyAdd('drops', 1);
    this.dailyAdd('fares', fare);
    s.fares += fare;
    s.score += Math.floor(fare * (s.night ? 1.15 : 1));
    s.combo = Math.min(20, s.combo + 1);
    s.comboTimer = 5;
    s.heat = Math.max(0, s.heat - 2);
    this.ui.toast(`${passenger.name} dropped · +₦${fare.toLocaleString()}`);
    this.missionAdd('drops', 1);
    this.missionAdd('fares', fare);
    if (matched) this.missionAdd('matchedDrops', 1);
    this.audio.pickup();
    return true;
  }

  checkProgress(dt = 0) {
    const s = this.s;
    if (s.fuel < 18 && s.toastCooldown <= 0) {
      this.ui.toast(DIALECT[s.dialect].fuel);
      s.toastCooldown = 4;
    }
    this.missionAdd('distance', s.distance);
    this.missionAdd('condition', s.condition);
    // Everyday Kano work happens between fares, but it should never become a modal every minute.
    s.lifeActivityTimer = Math.max(0, (s.lifeActivityTimer || 0) - dt);
    if (this.mode !== 'timeAttack' && s.distance >= 0.35 && s.lifeActivityTimer <= 0 && !s.event && s.eventCooldown <= 0) {
      s.lifeActivityTimer = randomBetween(105, 150);
      const activities = ['schoolRun', 'marketDelivery', 'vulcanizer', 'fuelQueueLife', 'weddingLife', 'waterSeller', 'goatCrossing'];
      const next = activities.filter((name) => name !== s.lastLifeActivity);
      const activity = choose(next.length ? next : activities);
      s.lastLifeActivity = activity;
      this.beginEvent(activity);
      if (s.event || this.state !== 'PLAY') return;
    }
    if (this.mode === 'career' && !s.event && this.state === 'PLAY') {
      s.karotaTimer -= dt;
      if (s.karotaTimer <= 0 && s.eventCooldown <= 0) {
        s.karotaTimer = randomBetween(90, 118);
        if (s.heat >= 15 || Math.random() < 0.6) this.beginEvent('karota');
      }
    }
  }

  updateEnvironment(dt) {
    const s = this.s;
    s.lifeEventTimer -= dt;
    if (s.lifeEventTimer > 0 || this.mode === 'timeAttack') return;
    s.lifeEventTimer = randomBetween(72, 104);
    const events = ['market', 'wedding', 'harmattan', 'badRoad', 'muddy', 'fuelQueue', 'juma', 'schoolGate', 'mosqueJunction', 'rainPuddles'];
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
      for (let i = 0; i < 3; i += 1) {
        this.s.traffic.push({
          id: `${Date.now()}-wedding-${i}-${Math.random()}`,
          type: 'suv', lane: i, direction: 1, depth: 1.05 + i * 0.12,
          speedKmh: 12 + i * 2, color: '#303944', passed: false, speed: 1,
        });
      }
    }
    if (event === 'badRoad' || event === 'rainPuddles') {
      for (let i = 0; i < (event === 'rainPuddles' ? 1 : 2); i += 1) {
        const lane = Math.floor(randomBetween(0, 3));
        this.s.zones.push({ id: `${Date.now()}-pothole-${i}-${Math.random()}`, type: 'pothole', prop: i === 0 ? 'dirtmound' : 'cone', lane, side: lane === 0 ? -1 : 1, roadside: false, depth: 1.1 + i * 0.1, dest: this.route.name, seats: 0, hub: false, label: '', warned: false });
      }
    }
    this.ui.toast(messages[event]);
  }

  missionAdd(key, value) {
    if (!Number.isFinite(value) || value <= 0) return;
    this.updateMissions(key, value);
  }

  missionUpdate() {
    if (this.s.combo > this.s.lastDailyCombo) {
      this.dailyAdd('combo', this.s.combo);
      this.s.lastDailyCombo = this.s.combo;
    }
    for (const mission of this.s.missions) {
      if (mission.done || mission.terminal) continue;
      let value = this.s[mission.key] ?? 0;
      if (mission.key === 'distance') value = this.s.distance;
      if (mission.key === 'combo') value = this.s.combo;
      if (mission.key === 'streak') value = this.s.streak;
      if (mission.key === 'noCollisionKm') value = this.s.cleanDistance;
      if (mission.key === 'safeSpeedSeconds') value = this.s.safeSpeedSeconds;
      if (mission.key === 'cleanKm') value = this.s.distance >= 1 && this.s.condition >= 80 ? 1 : 0;
      this.updateOneMission(mission, value);
    }
  }

  updateMissions(key, value) {
    for (const mission of this.s.missions) {
      if (mission.key !== key || mission.done) continue;
      const previous = this.s.missionProgress[mission.id] || 0;
      const progress = ADDITIVE_MISSION_KEYS.has(key)
        ? previous + value
        : Math.max(previous, value);
      this.s.missionProgress[mission.id] = progress;
      this.updateOneMission(mission, progress);
    }
  }

  updateOneMission(mission, value) {
    this.s.missionProgress[mission.id] = Math.max(this.s.missionProgress[mission.id] || 0, value);
    if (this.s.missionProgress[mission.id] < mission.target || mission.done) return;
    mission.done = true;
    this.s.score += mission.reward;
    this.ui.toast(`MISSION COMPLETE · +₦${mission.reward.toLocaleString()}`);
  }

  beginEvent(type) {
    const s = this.s;
    if (s.event || this.state !== 'PLAY' || s.eventCooldown > 0) return;
    s.event = type;
    s.gas = false;
    s.brake = false;
    s.speed = 0;
    s.eventCooldown = 6;
    const dialect = DIALECT[s.dialect] || DIALECT.hausa;
    const events = {
      fare: {
        kicker: 'FARE NEGOTIATION',
        title: 'Kai, kuɗin ya yi yawa!',
        copy: `${dialect.fare} The passenger offers less than your asking price.`,
        choices: [['ACCEPT LOW', 'low'], ['HOLD FARE', 'hold'], ['SHOUT & DRIVE', 'shout']],
      },
      karota: {
        kicker: 'KAROTA CHECKPOINT',
        title: 'KAROTA checkpoint',
        copy: 'An tsaya! Officers are checking permits. Pay, talk, or try to run.',
        choices: [['PAY ₦700', 'pay'], ['TALK', 'talk'], ['RUN', 'run']],
      },
      rich: {
        kicker: 'RICH MAN DRAMA',
        title: 'Kai! Luxury motor!',
        copy: `A luxury vehicle has been scratched. Plate: KNO ${Math.floor(randomBetween(100, 999))} XX. Settle the matter or escape.`,
        choices: [['PAY ₦3,500', 'payRich'], ['ARGUE', 'argue'], ['ESCAPE', 'escape']],
      },
      robber: {
        kicker: 'STREET DRAMA',
        title: 'Robber keke!',
        copy: 'A robber blocks your way and demands cash. Respond and continue the run.',
        choices: [['GIVE ₦500', 'robPay'], ['HORN & ESCAPE', 'robRun']],
      },
      schoolRun: {
        kicker: 'SCHOOL GATE · MORNING RUSH',
        title: 'A parent needs a school run.',
        copy: 'A parent and two children are trying to reach school before the gate gets busy. This is a real fare, not a compulsory mission.',
        choices: [['TAKE SCHOOL RUN', 'takeSchoolRun'], ['PASS THIS TIME', 'skipLife']],
      },
      marketDelivery: {
        kicker: 'MARKET ERRAND',
        title: 'Malam needs help with a market load.',
        copy: 'A trader at the roadside wants a short trip to Kurmi Market with a small load. It uses one seat and pays a better fare.',
        choices: [['TAKE THE LOAD', 'takeMarketLoad'], ['PASS THIS TIME', 'skipLife']],
      },
      vulcanizer: {
        kicker: 'ROADSIDE VULCANIZER',
        title: 'Tyre man has a free bay.',
        copy: 'A vulcanizer beside the road can check the tyres before they get worse. Repairing costs in-game earnings; continuing is allowed.',
        choices: [['REPAIR · ₦200', 'repairTyres'], ['KEEP DRIVING', 'skipLife']],
      },
      fuelQueueLife: {
        kicker: 'PETROL STATION QUEUE',
        title: 'The fuel queue is moving slowly.',
        copy: 'A nearby filling station has a short queue. Buy a little fuel now or keep your place in traffic and move on.',
        choices: [['BUY FUEL · ₦250', 'buyFuel'], ['SKIP QUEUE', 'skipLife']],
      },
      weddingLife: {
        kicker: 'BIKIN AURE · WEDDING CONVOY',
        title: 'A wedding convoy is turning ahead.',
        copy: 'Decorated cars and family members are moving through the junction. Give them room or pass carefully.',
        choices: [['YIELD RESPECTFULLY', 'yieldWedding'], ['PASS CAREFULLY', 'passWedding'], ['KEEP MOVING', 'skipLife']],
      },
      waterSeller: {
        kicker: 'ROADSIDE KIOSK',
        title: 'Pure water and phone top-up.',
        copy: 'A roadside seller has cold sachet water and phone credit. A short stop can improve the next customer interaction.',
        choices: [['WATER + TOP-UP · ₦100', 'buyWater'], ['SKIP', 'skipLife']],
      },
      goatCrossing: {
        kicker: 'OUTSKIRTS · ANIMAL CROSSING',
        title: 'Goats are crossing near the shoulder.',
        copy: 'A small herd is moving across the road near the outskirts. Slow down for a moment or sound the horn and pass cautiously.',
        choices: [['SLOW DOWN', 'slowForGoats'], ['HORN CAREFULLY', 'hornForGoats'], ['CONTINUE CAREFULLY', 'skipLife']],
      },
    };
    const event = events[type];
    if (!event) {
      s.event = null;
      this.state = 'PLAY';
      return;
    }
    this.state = 'EVENT';
    this.ui.event(event.kicker, event.title, event.copy, event.choices.map(([label, action]) => ({ label, action })));
  }

  resolveEvent(action) {
    const s = this.s;
    const type = s.event;
    if (!type || this.state !== 'EVENT') return;
    s.event = null;
    this.state = 'PLAY';
    if (type === 'fare') {
      if (action === 'low') {
        const passenger = s.passengers[0];
        if (passenger) passenger.fare = Math.floor(passenger.fare * 0.65);
        this.ui.toast('An karɓa · fare reduced');
      } else if (action === 'hold') {
        s.heat += 3;
        this.ui.toast('Passenger agreed to your fare');
      } else {
        s.heat += this.driver.flags?.lowScandal ? 5 : 14;
        s.condition = Math.max(0, s.condition - 4);
        this.ui.toast(DIALECT[s.dialect].argue);
      }
    } else if (type === 'karota') {
      if (action === 'pay') {
        s.score = Math.max(0, s.score - 700);
        s.heat = Math.max(0, s.heat - 15);
        this.ui.toast('KAROTA checkpoint settled');
      } else if (action === 'talk') {
        if (Math.random() < (this.driver.flags?.careful ? 0.82 : 0.68)) {
          s.heat = Math.max(0, s.heat - 10);
          this.ui.toast('An fahimta · proceed');
        } else {
          s.score = Math.max(0, s.score - 250);
          s.heat += 8;
          this.ui.toast('Talk failed · small fine');
        }
      } else {
        s.heat = Math.min(100, s.heat + 32);
        s.condition = Math.max(0, s.condition - 8);
        s.speed = Math.max(s.speed, 65);
        this.ui.toast('Escaped KAROTA · wanted heat rising');
      }
      s.checkpoints += 1;
      this.missionAdd('checkpoints', 1);
      this.dailyAdd('checkpoints', 1);
    } else if (type === 'rich') {
      if (action === 'payRich') {
        s.score = Math.max(0, s.score - 3500);
        s.heat = Math.max(0, s.heat - 8);
      } else if (action === 'argue') {
        if (Math.random() < 0.45) {
          s.score = Math.max(0, s.score - 900);
          this.ui.toast(DIALECT[s.dialect].argue);
        } else {
          s.score = Math.max(0, s.score - 2500);
          s.heat += 15;
        }
      } else {
        s.heat = Math.min(100, s.heat + 35);
        s.condition = Math.max(0, s.condition - 12);
        s.speed = Math.max(s.speed, 70);
      }
    } else if (type === 'robber') {
      if (action === 'robPay') s.score = Math.max(0, s.score - 500);
      else {
        s.heat = Math.min(100, s.heat + 7);
        s.speed = Math.max(s.speed, 40);
      }
    } else if (type === 'schoolRun') {
      if (action === 'takeSchoolRun') {
        const occupied = s.passengers.reduce((total, passenger) => total + passenger.seats, 0);
        if (occupied + 2 <= s.capacity) {
          const fare = Math.floor(this.route.baseFare * 1.65);
          s.passengers.push({ name: 'School run · parent and children', dest: choose(['BUK Gate', 'Aminu Kano Teaching Hospital', 'Tarauni']), seats: 2, fare, class: 'school run', female: false, special: false, group: true });
          s.boards += 1; this.dailyAdd('boards', 1); this.missionAdd('boards', 1);
          this.ui.toast(`School run accepted · 2 seats · +₦${fare.toLocaleString()} on arrival`);
        } else this.ui.toast('Keke is full · the school run can wait for another driver');
      }
    } else if (type === 'marketDelivery') {
      if (action === 'takeMarketLoad') {
        const occupied = s.passengers.reduce((total, passenger) => total + passenger.seats, 0);
        if (occupied + 1 <= s.capacity) {
          const fare = Math.floor(this.route.baseFare * 1.85);
          s.passengers.push({ name: 'Malam Kabiru’s market load', dest: 'Kurmi Market', seats: 1, fare, class: 'market delivery', female: false, special: false, cargo: true });
          s.boards += 1; this.dailyAdd('boards', 1); this.missionAdd('boards', 1);
          this.ui.toast(`Market load accepted · destination Kurmi Market · +₦${fare.toLocaleString()} on delivery`);
        } else this.ui.toast('No space for the market load · pass the job');
      }
    } else if (type === 'vulcanizer') {
      if (action === 'repairTyres') {
        if (s.score >= 200) {
          s.score -= 200;
          s.tyres = Math.min(100, s.tyres + 24);
          s.condition = Math.min(100, s.condition + 5);
          s.speed = Math.min(s.speed, 8);
          this.ui.toast('Vulcanizer checked the tyres · back on the road');
        } else this.ui.toast('Not enough run earnings for the repair · keep driving carefully');
      }
    } else if (type === 'fuelQueueLife') {
      if (action === 'buyFuel') {
        if (s.score >= 250) {
          s.score -= 250;
          s.fuel = Math.min(100, s.fuel + 28);
          this.ui.toast('Fuel topped up · filling station queue cleared');
        } else this.ui.toast('Not enough run earnings for the fuel top-up');
      }
    } else if (type === 'weddingLife') {
      if (action === 'yieldWedding') { s.score += 45; s.speed = Math.min(s.speed, 7); this.ui.toast('Barka da aure · you gave the convoy room'); }
      else if (action === 'passWedding') { if (Math.random() < 0.8) this.ui.toast('Passed the convoy carefully'); else { s.condition = Math.max(0, s.condition - 2); s.score = Math.max(0, s.score - 80); this.ui.toast('Mirror scrape · slow down near the convoy'); } }
    } else if (type === 'waterSeller') {
      if (action === 'buyWater') { if (s.score >= 100) { s.score -= 100; s.morale = Math.min(100, (s.morale ?? 75) + 15); s.fareMood = Math.min(1.12, (s.fareMood ?? 1) + 0.02); this.ui.toast('Water and phone top-up bought · morale lifted'); } else this.ui.toast('Keep your cash for fuel and repairs'); }
    } else if (type === 'goatCrossing') {
      if (action === 'slowForGoats') { s.speed = Math.min(s.speed, 6); s.score += 25; this.ui.toast('The goats crossed safely · careful driving bonus'); }
      else if (action === 'hornForGoats') { s.speed = Math.min(s.speed, 12); this.audio.horn(); this.ui.toast('Horn sounded · goats moved to the shoulder'); }
    }
    if (type === 'rich') {
      s.richDramas += 1;
      this.missionAdd('richDramas', 1);
      this.dailyAdd('richDramas', 1);
    }
    s.invuln = 2;
    this.ui.hideEvent();
    this.ui.update(s, this.route, this.driver);
  }

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
    this.state = 'OVER';
    this.audio.engine(0);

    const canContinue = allowContinue && (s.lives > 0 || save.money >= s.paidContinueCost);
    if (canContinue) {
      this.ui.gameOver({
        reason, earned: 0, run: s, best: save.highScore,
        standing: tribeStanding(), board: save.tribes[s.dialect] || [], soft: true,
      });
      return;
    }

    this.completeTerminalMissions();
    if (s.fuel >= 30) this.dailyAdd('endFuel', 1);
    if (s.condition >= 75) this.dailyAdd('endCondition', 1);
    if (s.distance >= 3 && s.potholeHits < 8) this.dailyAdd('potholesClean', 1);

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
    save.tribeSubmits = (save.tribeSubmits || 0) + 1;
    for (const achievement of ACHIEVEMENTS) {
      const runRecord = {
        ...s,
        goldTimes: save.goldTimes || 0,
        tribeSubmits: save.tribeSubmits,
      };
      if (achievement.test(runRecord) && unlockAchievement(achievement.id)) {
        this.ui.toast(`Achievement unlocked: ${achievement.name}`);
      }
    }
    persist();
    this.ui.gameOver({ reason, earned, run: s, best: save.highScore, standing: tribeStanding(), board, soft: false });
  }

  completeTerminalMissions() {
    for (const mission of this.s.missions) {
      if (!mission.terminal || mission.done) continue;
      let qualifies = false;
      if (mission.terminal === 'fuel') qualifies = this.s.fuel >= mission.threshold;
      else if (mission.terminal === 'condition') qualifies = this.s.condition >= mission.threshold;
      else if (mission.terminal === 'cleanPotholes') qualifies = this.s.distance >= mission.distance && this.s.potholeHits < mission.maxHits;
      if (qualifies) this.updateOneMission(mission, mission.target);
    }
  }

  continueRun(paid = false) {
    if (this.state !== 'OVER') return;
    const s = this.s;
    if (!paid && s.lives > 0) {
      s.lives -= 1;
    } else if (paid) {
      if (save.money < s.paidContinueCost) {
        this.ui.toast('Not enough banked money for a continue');
        return;
      }
      save.money -= s.paidContinueCost;
      s.paidContinueCost = Math.floor(s.paidContinueCost * 1.8);
      s.continues += 1;
      persist();
    } else {
      this.ui.toast('No life savers remain');
      return;
    }
    s.runEnded = false;
    s.invuln = 4;
    s.condition = Math.max(35, s.condition);
    s.engine = Math.max(35, s.engine);
    s.tyres = Math.max(35, s.tyres);
    s.fuel = Math.max(16, s.fuel);
    s.speed = 0;
    s.event = null;
    this.state = 'PLAY';
    this.ui.hide('over-screen');
    this.ui.hideEvent();
    this.ui.startPlay();
    this.ui.toast('Life saver used · 4 seconds invulnerable');
  }
}
