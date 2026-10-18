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
    if (this.s.environment === 'market' && roll < 0.60) type = 'pickup';
    else if (this.s.environment === 'fuelQueue') type = roll < 0.43 ? 'pickup' : roll < 0.78 ? 'drop' : roll < 0.83 ? 'fuel' : 'pothole';
    else type = roll < 0.43 ? 'pickup' : roll < 0.76 ? 'drop' : roll < 0.89 ? 'fuel' : 'pothole';
    const hub = type === 'pickup' && Math.random() < 0.22;
    const lane = type === 'pickup' && !hub
      ? (Math.random() < 0.5 ? 0 : 2)
      : type === 'pickup' && hub ? 1 : Math.floor(randomBetween(0, 3));
    const dest = this.chooseZoneDestination(type);
    const seats = type === 'pickup' ? (hub ? Math.floor(randomBetween(2, 5)) : 1) : 0;
    const depth = Number.isInteger(initialIndex)
      ? 0.36 + initialIndex * 0.17
      : randomBetween(1.1, 1.3);
    this.s.zones.push({
      id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
      type,
      lane,
      depth,
      dest,
      seats,
      hub,
      label: hub ? `HUB · ${dest}` : '',
      warned: false,
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
    const types = ['keke', 'car', 'taxi', 'suv', 'motorcycle', 'police'];
    if (!this.mobile) types.push('truck', 'bus', 'karota');
    const type = choose(types);
    const lane = Math.floor(randomBetween(0, 3));
    const depth = Number.isInteger(initialIndex)
      ? 0.35 + initialIndex * 0.15
      : randomBetween(1.05, 1.35);
    this.s.traffic.push({
      id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
      type,
      lane,
      direction: this.s.roadMode === 'twoway' && lane === 0 ? -1 : 1,
      depth,
      color: choose(['#e4c24e', '#d7e1e9', '#bd5142', '#3983b9', '#36404d', '#f2f2f2']),
      passed: false,
      speed: randomBetween(0.82, 1.12),
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

    const modeSpeed = this.mode === 'timeAttack' ? 150 : this.mode === 'freeRoam' ? 118 : 125;
    const maxSpeed = modeSpeed * (this.driver.speedMod || 1);
    const cruiseSpeed = (this.mode === 'freeRoam' ? 78 : 66) * (this.driver.speedMod || 1);
    const desiredSpeed = s.gas ? maxSpeed : s.brake ? 0 : cruiseSpeed;
    const acceleration = s.brake ? 7.5 : s.gas ? 3.25 : 1.65;
    s.speed += (desiredSpeed - s.speed) * Math.min(1, acceleration * dt);
    if (s.brake) s.speed = Math.max(0, s.speed - 36 * dt);
    const steeringRate = s.environment === 'muddy' ? 4.2 : 7.5;
    s.steer += (s.targetLane - s.steer) * Math.min(1, dt * steeringRate);
    if (s.environment === 'muddy') s.speed = Math.min(s.speed, 92 * (this.driver.speedMod || 1));
    s.distance += (s.speed / 3600) * dt;
    const distanceSteps = Math.floor(s.distance * 10) - Math.floor(s.lastDailyDistance * 10);
    if (distanceSteps > 0) {
      this.dailyAdd('distance', distanceSteps / 10);
      s.lastDailyDistance = Math.floor(s.distance * 10) / 10;
    }
    s.night = (Math.floor(s.elapsed / 52) % 2) === 1;
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
    const laneIndex = s.targetLane + 1;
    const scroll = dt * (0.08 + s.speed / 310);
    for (let index = s.zones.length - 1; index >= 0; index -= 1) {
      const zone = s.zones[index];
      const aligned = zone.lane === laneIndex;
      const inInteractionRange = zone.depth <= 0.23 && zone.depth >= 0.12;

      if (zone.type === 'pothole' && aligned && inInteractionRange) {
        this.hitPothole(zone);
        s.zones.splice(index, 1);
        this.spawnZone();
        continue;
      }

      if (aligned && inInteractionRange && zone.type !== 'pothole') {
        if (s.speed > 8.5) {
          zone.depth = 0.205;
          if (!zone.warned) {
            this.ui.toast('Brake to stop · then load, drop or refuel');
            zone.warned = true;
          }
          continue;
        }
        let handled = true;
        if (zone.type === 'pickup') handled = this.pickup(zone);
        else if (zone.type === 'drop') this.drop(zone);
        else if (zone.type === 'fuel') handled = this.refuel(zone);
        if (handled) {
          s.zones.splice(index, 1);
          this.spawnZone();
          continue;
        }
        zone.depth = 0.205;
        continue;
      }

      zone.depth -= scroll;
      if (zone.depth < -0.08) {
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
    s.tyres = Math.max(0, s.tyres - 14 * (this.driver.damageTakenMod || 1));
    s.condition = Math.max(0, s.condition - 4 * (this.driver.damageTakenMod || 1));
    s.engine = Math.max(0, s.engine - 2);
    s.speed *= 0.72;
    s.steer = clamp(s.steer + (Math.random() < 0.5 ? -0.12 : 0.12), -1, 1);
    this.audio.beep?.(105, 0.14);
    this.ui.toast(`POTHOLE! Tyres damaged · ${s.potholeHits} hit${s.potholeHits === 1 ? '' : 's'}`);
  }

  moveTraffic(dt) {
    const s = this.s;
    const laneIndex = s.targetLane + 1;
    for (let index = s.traffic.length - 1; index >= 0; index -= 1) {
      const vehicle = s.traffic[index];
      const oncoming = vehicle.direction === -1;
      const trafficSlowdown = s.environment === 'juma' ? 0.68 : 1;
      vehicle.depth -= dt * (0.075 + s.speed / (oncoming ? 220 : 300)) * vehicle.speed * trafficSlowdown;
      if (!vehicle.passed && vehicle.depth <= 0.22 && vehicle.depth >= 0.105) {
        if (vehicle.lane === laneIndex && s.invuln <= 0) {
          vehicle.passed = true;
          this.hit(vehicle);
        } else if (Math.abs(vehicle.lane - laneIndex) === 1) {
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
        }
      }
      if (vehicle.depth < -0.08) {
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
    const fast = s.speed >= 95;
    const heavy = vehicle.type === 'truck' || vehicle.type === 'bus' || vehicle.type === 'suv';
    const mod = this.driver.damageTakenMod || 1;
    s.speed *= fast ? 0.42 : 0.62;
    s.condition = Math.max(0, s.condition - (heavy ? 23 : fast ? 17 : 10) * mod);
    s.engine = Math.max(0, s.engine - (heavy ? 13 : fast ? 9 : 5) * mod);
    s.tyres = Math.max(0, s.tyres - (heavy ? 10 : 6) * mod);
    s.heat = Math.min(100, s.heat + (heavy ? 15 : 8));
    s.invuln = 1.5;
    s.combo = 0;
    this.audio.crash();
    this.ui.toast(heavy ? 'Heavy collision · vehicle damaged' : 'Collision! Drive carefully');
    if (vehicle.type === 'suv' || (vehicle.type === 'car' && Math.random() < 0.22)) {
      this.beginEvent('rich');
    } else if (Math.random() < 0.09) {
      this.beginEvent('robber');
    }
    if (s.condition < 25 || s.engine < 25 || s.tyres < 25) {
      this.ui.toast('Condition critical · avoid further collisions');
    }
  }

  pickup(zone) {
    const s = this.s;
    const occupied = s.passengers.reduce((total, passenger) => total + passenger.seats, 0);
    if (occupied + zone.seats > s.capacity) {
      this.ui.toast('Keke full · drop a passenger first');
      return false;
    }

    const special = Math.random() < 0.08 * (this.driver.flags?.luck || 1);
    const female = Math.random() < 0.58;
    if (this.driver.id === 'mayen-mata' && !female && Math.random() < 0.25) {
      this.ui.toast('Mayen Mata prioritises women passengers · this pickup is skipped.');
      return true;
    }
    const vip = Math.random() < 0.12;
    const className = vip ? 'VIP' : female ? 'market woman' : 'worker';
    const fareFactor = randomBetween(1, 2.3) * (s.night ? 1.42 : 1) * (vip ? 1.5 : 1);
    const passenger = {
      name: special
        ? 'Aishat & Hibba'
        : choose(['Malam Musa', 'Hajiya Zainab', 'Amina', 'Bello', 'Fatima', 'Abubakar', 'Student Ali', 'Businessman Sani']),
      dest: zone.dest,
      seats: special ? Math.max(2, zone.seats) : zone.seats,
      fare: Math.floor(this.route.baseFare * fareFactor * (this.driver.fareMult || 1)),
      class: className,
      female,
      special,
    };
    if (this.driver.flags?.womenBonus && female) {
      passenger.fare = Math.floor(passenger.fare * this.driver.flags.womenBonus);
    }
    if (occupied + passenger.seats > s.capacity) {
      this.ui.toast('Not enough seats for this passenger group');
      return false;
    }
    s.passengers.push(passenger);
    s.boards += 1;
    this.dailyAdd('boards', 1);
    if (vip) { s.vip += 1; this.dailyAdd('vip', 1); }
    if (special) {
      s.aishat += 1;
      this.dailyAdd('aishat', 1);
      this.ui.toast('Aishat and 2-year-old Hibba boarded · Allah ya kiyaye!');
      this.missionAdd('aishat', 1);
    } else {
      this.ui.toast(`${passenger.name} boarded · ${passenger.dest}`);
    }
    if (this.driver.flags?.womenBonus && female) this.ui.toast('Mayen Mata · women passenger bonus');
    this.missionAdd('boards', 1);
    if (vip) this.missionAdd('vip', 1);
    this.audio.pickup();
    if (Math.random() < 0.2 && this.mode === 'career') {
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
    if (this.mode === 'career') {
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
    s.lifeEventTimer = randomBetween(48, 78);
    const events = ['market', 'wedding', 'harmattan', 'badRoad', 'muddy', 'fuelQueue', 'juma'];
    const event = choose(events);
    s.environment = event;
    s.environmentDuration = randomBetween(20, 32);
    const messages = {
      market: 'Market day · roadside pickups are busier',
      wedding: 'Bikin aure · wedding convoy ahead!',
      harmattan: 'Harmattan haze · visibility reduced',
      badRoad: 'BAD ROAD! Potholes ahead',
      muddy: 'Muddy stretch · grip reduced',
      fuelQueue: 'Fuel scarcity · save your fuel',
      juma: 'Juma’a traffic · drive with patience',
    };
    if (event === 'wedding') {
      for (let i = 0; i < 3; i += 1) {
        this.s.traffic.push({
          id: `${Date.now()}-wedding-${i}-${Math.random()}`,
          type: 'suv', lane: i, depth: 1.05 + i * 0.12,
          color: '#303944', passed: false, speed: 0.55,
        });
      }
    }
    if (event === 'badRoad') {
      for (let i = 0; i < 2; i += 1) {
        const lane = Math.floor(randomBetween(0, 3));
        this.s.zones.push({ id: `${Date.now()}-pothole-${i}-${Math.random()}`, type: 'pothole', prop: i === 0 ? 'dirtmound' : 'cone', lane, depth: 1.1 + i * 0.1, dest: this.route.name, seats: 0, hub: false, label: '', warned: false });
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
        s.speed = Math.max(s.speed, 60);
      }
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
