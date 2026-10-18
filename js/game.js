/**
 * Kano Run 3D — Core game logic
 * Game Developer: Hassan Zakariya
 * Spec: real driving controls, intro sequence, passengers/destinations,
 * fare negotiation, KAROTA, traffic AI — preserves missions/storage/HUD.
 */
import { CONFIG, STATE, DEVELOPER, NAIJA_CHALLENGE } from './config.js';
import { Storage } from './storage.js';
import { Audio } from './audio.js';
import { LifeActivities } from './lifeActivities.js';
import {
  nextRoadSegment,
  generateRunMissions,
  collisionTier,
  radioAnnouncement,
  karotaFine,
  pickPaxClass,
  pickDestination,
  pickHonorific,
  getLevelBand,
  WORLD_EVENTS,
  DISTRICTS,
  biomeForDistance
} from './systems.js';

/** Match renderer 3-lane highway */
const LANE_WORLD_X = [-2.2, 0, 2.2];

export class Game {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = null;
    this.ui = null;
    this.life = new LifeActivities(this);
    this.dialect = 'hausa';
    this.gameMode = 'career'; // career | timeattack | freeroam
    this.roadSlope = 0;
    this.renderer3d = null;

    this.state = STATE.START;
    this.score = 0;
    this.dist = 0;
    this.paxOnBoard = 0;
    this.totalPax = 0;
    this.dropCount = 0;
    this.capacity = 3;
    this.continuesLeft = 3;
    this.paidContinuesUsed = 0;
    this.combo = 0;
    this.comboTimer = 0;
    this.speed = 0;
    this.throttle = 0; // 0..1 gas
    this.braking = false;
    this.frame = 0;
    this.roadOff = 0;
    this.playerLane = 1;
    // —— Systems state ——
    this.roadSegment = null;
    this.segmentDist = 0;
    this.visitedDistricts = [];
    this.runMissions = [];
    this.wantedLevel = 0;
    this.karotaFines = 0;
    this.worldEvent = null;
    this.worldEventTimer = 0;
    this.steerPenalty = 0;
    this.fuelPickups = 0;
    this.bestCombo = 0;
    this.pendingJunction = null;
    this.playerX = 0;
    this.targetX = 0;
    this.playerY = 0;
    this.inv = 0;
    this.bounce = 0;
    this.shake = 0;
    this.shakeMag = 0;
    this.obs = [];
    this.paxZones = [];
    this.dropZones = [];
    this.coins = [];
    this.fuelPads = [];
    this.trafficJamTimer = 0;
    this.nearMissCooldown = 0;
    this.policeChase = 0;
    this.karotaTimer = 0;
    this.landmarkIndex = 0;
    this.nearMissCount = 0;
    this.introT = 0;
    this.fuel = 100;
    this.zoneType = 'road'; // road | junction | market
    this.zoneTimer = 0;
    this.parkOnly = false; // true inside market/junction regulation
    this.cabinCam = false;
    this.weatherGrip = 1;
    this.heatComplaints = 0;
    this.lastHonkFrame = 0;
    this.lifeTipsShown = 0;
    this.pickupCooldown = 0;
    this.stoppedFrames = 0;
    this.condition = 100; // overall vehicle health 0-100
    this.damageBody = 0;
    this.damageEngine = 0;
    this.damageTyres = 0;
    this.puncture = false;
    this.tireWearAccum = 0;
    this.level = 1;

    this.selectedRoute = Storage.getRoute() || 'citycenter';
    this.selectedDriver = Storage.getDriver() || 'ruffneck';
    this.selectedPaint = Storage.getPaint() || 'classic';
    this.selectedKeke = Storage.get('kanoKeke', 'starter') || 'starter';
    this.selectedRoadMode = Storage.get('kanoRoadMode', 'twoway') || 'twoway';
    this.radioIndex = Storage.getRadio() || 0;
    this.high = Storage.getHighScore();
    this.money = Storage.getMoney();
    this.activeMission = null;

    // Onboard passengers with destinations
    this.onboard = []; // { dest, seats, fare }
    this.passengersWaiting = []; // roadside people with dest
  }

  resize() {
    const r = this.canvas.parentElement.getBoundingClientRect();
    this.canvas.style.width = r.width + 'px';
    this.canvas.style.height = r.height + 'px';
    if (this.renderer3d?.resize) this.renderer3d.resize();
  }

  laneX(l) {
    const pad = 18;
    const lw = (this.canvas.clientWidth - pad * 2) / CONFIG.LANES;
    return pad + l * lw + lw / 2;
  }

  getTimeOfDay() {
    return (this.frame % 5400) / 5400;
  }

  /** 0 morning rush → 0.25 midday → 0.5 evening → night */
  isPeakHour() {
    const t = this.getTimeOfDay();
    return (t > 0.05 && t < 0.18) || (t > 0.45 && t < 0.58);
  }

  fareScale() {
    // Night fares higher (Kano late trips); peak modest bump; midday softer
    const t = this.getTimeOfDay();
    if (t > 0.62) return 1.55; // deep night
    if (t > 0.5) return 1.35;  // evening / night
    if (this.isPeakHour()) return 1.15;
    if (t > 0.25 && t < 0.4) return 0.92;
    return 1;
  }

  getDriver() {
    return CONFIG.DRIVERS[this.selectedDriver] || CONFIG.DRIVERS.ruffneck;
  }

  getKeke() {
    return CONFIG.KEKES[this.selectedKeke] || CONFIG.KEKES.starter;
  }

  /** Unlock kekes as the player levels up (safe no-op if already unlocked) */
  unlockKekeByProgress() {
    const order = ['starter', 'ruffgold', 'sky', 'heavy', 'night', 'royal'];
    const need = [1, 2, 3, 5, 7, 10];
    const lvl = this.level || 1;
    let unlocked = [];
    try {
      unlocked = Storage.get('kanoUnlockedKekes', ['starter']) || ['starter'];
    } catch (e) {
      unlocked = ['starter'];
    }
    if (!Array.isArray(unlocked)) unlocked = ['starter'];
    let changed = false;
    for (let i = 0; i < order.length; i++) {
      if (lvl >= need[i] && unlocked.indexOf(order[i]) < 0) {
        unlocked.push(order[i]);
        changed = true;
        if (CONFIG.KEKES && CONFIG.KEKES[order[i]]) {
          this.ui?.showMissionToast?.('🛵 Unlocked: ' + CONFIG.KEKES[order[i]].name);
        }
      }
    }
    if (changed) {
      try { Storage.set('kanoUnlockedKekes', unlocked); } catch (e) {}
    }
  }

  getBonuses() {
    const d = this.getDriver().bonuses || {};
    const k = this.getKeke();
    return {
      ...d,
      speed: (d.speed || 0) + (k.speed || 0),
      capacity: k.capacity || 3
    };
  }

  cycleRadio() {
    this.radioIndex = (this.radioIndex + 1) % CONFIG.RADIO.length;
    Storage.setRadio(this.radioIndex);
    const st = CONFIG.RADIO[this.radioIndex];
    this.ui.setRadio(st.name);
    this.ui.showMissionToast('📻 ' + st.name);
    Audio.radioTune();
    Audio.startRadioBed();
  }

  /** Begin run — always PLAY with immediate forward motion */
  start() {
    // Skip long intro — go straight to driving so keke always moves
    this.state = STATE.PLAY;
    this.introT = 999;
    this.fuel = 100;
    this.zoneType = 'road'; // road | junction | market
    this.zoneTimer = 0;
    this.parkOnly = false; // true inside market/junction regulation
    this.cabinCam = false;
    this.weatherGrip = 1;
    this.heatComplaints = 0;
    this.lastHonkFrame = 0;
    this.lifeTipsShown = 0;
    this.pickupCooldown = 0;
    this.stoppedFrames = 0;
    this.condition = 100; // overall vehicle health 0-100
    this.damageBody = 0;
    this.damageEngine = 0;
    this.damageTyres = 0;
    this.score = 0;
    this.dist = 0;
    this.paxOnBoard = 0;
    this.totalPax = 0;
    this.dropCount = 0;
    this.continuesLeft = 3;
    this.paidContinuesUsed = 0;
    this.combo = 0;
    this.comboTimer = 0;
    this.speed = 3.5;
    this.throttle = 0.7;
    this.braking = false;
    this.frame = 0;
    // Mode setup
    this.runTime = 0;
    this.raceFinished = false;
    this.matchStreak = 0;
    this.matchFails = 0;
    this.fuelChallengeActive = false;
    if (this.gameMode === 'timeattack') {
      this.raceTargetKm = 3.5;
      this.raceBest = null;
      try { this.raceBest = Storage.get('kanoTA_' + (this.selectedRoute || 'city'), null); } catch (e) {}
      this.ui?.showMissionToast?.('⏱️ Time Attack — ' + this.raceTargetKm + ' km · beat the clock');
    } else if (this.gameMode === 'fuel') {
      this.raceTargetKm = 4.0;
      this.fuel = 42; // tight tank — skill challenge
      this.fuelChallengeActive = true;
      this.ui?.showMissionToast?.('⛽ Fuel Challenge — start 42% · reach 4 km without dry-out');
    } else if (this.gameMode === 'matchdrop') {
      this.raceTargetKm = 0;
      this.matchStreak = 0;
      this.ui?.showMissionToast?.('📍 Match Drop — drop only at passenger destination');
    } else if (this.gameMode === 'potholes') {
      this.raceTargetKm = 3.0;
      this.potholeHits = 0;
      this.potholeMax = 8;
      this.ui?.showMissionToast?.('🕳️ Potholes — reach 3 km with under 8 hits');
    } else if (this.gameMode === 'freeroam') {
      this.raceTargetKm = 0;
      this.ui?.showMissionToast?.('🧭 Free roam — no timer pressure');
    } else {
      this.raceTargetKm = 0;
    }
    this.roadOff = 0;
    this.playerLane = 1;
    this.smoothLane = 1;
    this.playerLaneX = 0;
    if (this.controls) this.controls.reset(1);
    // Systems reset
    this.roadSegment = nextRoadSegment('straight', 1);
    this.segmentDist = 0;
    this.visitedDistricts = [this.roadSegment.district];
    this.runMissions = generateRunMissions();
    this.wantedLevel = 0;
    this.karotaFines = 0;
    this.worldEvent = null;
    this.worldEventTimer = 0;
    this.steerPenalty = 0;
    this.fuelPickups = 0;
    this.bestCombo = 0;
    this.pendingJunction = null;
    this.activeMission = this.runMissions[0] || this.activeMission;
    this.inv = 0;
    this.bounce = 0;
    this.obs = [];
    // Seed traffic so the road is never empty at start
    for (let i = 0; i < 8; i++) {
      const types = ['car', 'keke', 'taxi', 'motorcycle', 'bus', 'truck', 'keke', 'car'];
      const type = types[i % types.length];
      this.obs.push({
        type,
        lane: i % 3,
        y: -40 - i * 70,
        w: type === 'motorcycle' ? 36 : type === 'bus' || type === 'truck' ? 56 : 50,
        h: type === 'motorcycle' ? 50 : 70,
        speedOff: -0.5 + Math.random() * 0.4,
        opposite: false,
        robber: false,
        laneCooldown: 30
      });
    }
    this.paxZones = [];
    this.dropZones = [];
    this.coins = [];
    this.fuelPads = [];
    this.onboard = [];
    this.passengersWaiting = [];
    this.trafficJamTimer = 0;
    this.nearMissCooldown = 0;
    this.policeChase = 0;
    this.karotaTimer = 0;
    this.landmarkIndex = 0;
    this.nearMissCount = 0;
    this.level = 1;
    this.roadCondition = 'clear';
    this.roadCondTimer = 0;
    this.destinationsServed = [];

    const b = this.getBonuses();
    this.capacity = b.capacity || CONFIG.DEFAULT_CAPACITY || 5;

    this.activeMission = {
      ...CONFIG.MISSIONS[Math.floor(Math.random() * CONFIG.MISSIONS.length)],
      progress: 0
    };

    this.ui.showPlaying();
    this.ui.setMission(this.activeMission.text);
    const route = CONFIG.ROUTES[this.selectedRoute];
    this.ui.setRouteLabel(route ? route.name : '');
    const drv = this.getDriver();
    this.ui.setDriverLabel(drv.name + ' · ' + drv.title);
    const st = CONFIG.RADIO[this.radioIndex] || CONFIG.RADIO[0];
    this.ui.setRadio(st.name);
    if (this.renderer3d?.applyPaint) this.renderer3d.applyPaint(this.selectedPaint);
    if (this.renderer3d) this.renderer3d.introPhase = 0;

    this.throttle = 0.5;
    this.speed = 2.2;
    this.braking = false;
    this.state = STATE.PLAY;
    try {
      Audio.ensure();
      Audio.startEngine();
    this.life?.reset?.();
      Audio.startRadioBed();
      const st = (CONFIG.RADIO && CONFIG.RADIO[this.radioIndex]) || { name: 'Radio Kano' };
      Audio.speak(st.name + '. Sannu da aiki.', { rate: 0.95 });
    } catch (e) {}
    this.ui.showMissionToast('Driving! GAS = faster · BRAKE = stop');
    if (this.renderer3d) this.renderer3d.introPhase = 3;
    try { Storage.setSeenTutorial(); Storage.set('kanoSkipIntro', true); } catch (e) {}
    this.life?.update?.();
    this.ui.updateHUD(this);
    this.initDaily();
  }

  finishIntro() {
    this.state = STATE.PLAY;
    this.throttle = 0.55;
    this.speed = 2.8;
    Audio.startEngine();
    Audio.startRadioBed();
    try { Storage.setSeenTutorial(); Storage.set('kanoSkipIntro', true); } catch (e) {}
    const tips = [
      'Sannu da aiki — hold GAS to go faster',
      'Road is moving — steer and avoid traffic',
      'Watch KAROTA at junctions',
      'Brake almost stop to load passengers'
    ];
    this.ui.showMissionToast(tips[Math.floor(Math.random() * tips.length)]);
    try { Audio.speak('Sannu da aiki', { rate: 0.92, pitch: 1 }); } catch (e) {}
    if (this.renderer3d) this.renderer3d.introPhase = 3;
  }

  togglePause() {
    if (this.state === STATE.PLAY) {
      this.state = STATE.PAUSE;
      this.speed = 0;
      this.throttle = 0;
      try { Audio.stopEngine(); Audio.stopSample?.(Audio._radioEl); } catch (e) {}
      this.ui.showMissionToast('Paused');
      this.ui.setPauseUI(true);
    } else if (this.state === STATE.PAUSE) {
      this.state = STATE.PLAY;
      try { Audio.startEngine(); } catch (e) {}
      this.ui.setPauseUI(false);
      this.ui.showMissionToast('Resumed');
    } else if (this.state === STATE.INTRO) {
      // allow skip intro via pause
      this.finishIntro();
    }
  }

  /** Radio ON / OFF toggle */
  toggleRadio() {
    this.radioOn = !this.radioOn;
    if (this.radioOn) {
      const list = CONFIG.RADIO || [{ name: 'Radio Kano' }];
      const st = list[this.radioIndex || 0];
      try {
        Audio.ensure();
        Audio.radioTune(st.name);
      } catch (e) {}
      this.ui.setRadio?.(st.name + ' · ON');
      this.ui.showMissionToast('📻 Radio ON — ' + st.name);
    } else {
      try {
        Audio.stopRadioBed();
        Audio.stopSample?.(Audio._radioEl);
      } catch (e) {}
      this.ui.setRadio?.('Radio OFF');
      this.ui.showMissionToast('📻 Radio OFF');
    }
  }

  recalcCondition() {
    // Weighted wear
    this.condition = Math.max(0, Math.min(100,
      100 - this.damageBody * 0.35 - this.damageEngine * 0.4 - this.damageTyres * 0.25
    ));
  }

  applyDamage(kind, amount) {
    if (kind === 'body') this.damageBody = Math.min(100, this.damageBody + amount);
    else if (kind === 'engine') this.damageEngine = Math.min(100, this.damageEngine + amount);
    else if (kind === 'tyres') this.damageTyres = Math.min(100, this.damageTyres + amount);
    else {
      this.damageBody = Math.min(100, this.damageBody + amount * 0.5);
      this.damageEngine = Math.min(100, this.damageEngine + amount * 0.3);
    }
    this.recalcCondition();
    if (this.renderer3d?.setDamageVisual) this.renderer3d.setDamageVisual(this.condition);
  }

  repairVehicle(level = 'full') {
    if (level === 'full') {
      this.damageBody = 0;
      this.damageEngine = 0;
      this.damageTyres = 0;
      this.puncture = false;
      this.tireWearAccum = 0;
    } else if (level === 'quick') {
      this.damageBody = Math.max(0, this.damageBody - 25);
      this.damageEngine = Math.max(0, this.damageEngine - 20);
      this.damageTyres = Math.max(0, this.damageTyres - 20);
      if (this.damageTyres < 50) this.puncture = false;
    } else if (level === 'tyres') {
      this.damageTyres = 0;
      this.puncture = false;
      this.tireWearAccum = 0;
    }
    this.recalcCondition();
    if (this.renderer3d?.setDamageVisual) this.renderer3d.setDamageVisual(this.condition);
  }

  /** Sudden puncture — flat until tyres repaired */
  triggerPuncture(reason) {
    if (this.puncture) return;
    this.puncture = true;
    this.damageTyres = Math.min(100, this.damageTyres + 35 + Math.random() * 20);
    this.recalcCondition();
    this.speed *= 0.4;
    this.triggerShake(10, 5);
    Audio.brake();
    Audio.speak('Puncture. Flat tyre.', { rate: 0.95 });
    this.ui.showMissionToast('💥 Puncture! ' + (reason || 'Flat tyre') + ' — limp to mechanic');
    if (this.renderer3d?.setDamageVisual) this.renderer3d.setDamageVisual(this.condition);
  }

  toggleCabin() {
    if (this.renderer3d?.cycleCamera) {
      const mode = this.renderer3d.cycleCamera();
      this.cabinCam = mode === 'driver';
      this.cameraMode = mode;
      const labels = {
        chase: 'Chase camera',
        driver: 'Driver view',
        passenger: 'Passenger seat',
        road: 'Road / hood view'
      };
      this.ui.showMissionToast(labels[mode] || mode);
      this.ui.setCamLabel?.(mode);
    } else {
      this.cabinCam = !this.cabinCam;
      this.ui.showMissionToast(this.cabinCam ? 'Driver view' : 'Chase view');
    }
  }

  setThrottle(v) {
    this.throttle = Math.max(0, Math.min(1, v));
  }

  setBrake(on) {
    const was = this.braking;
    this.braking = !!on;
    if (on && !was && this.speed > 2) Audio.brake();
  }

  /** Hausa honorific for negotiation (not only Aboki) */
  honorific(genderHint) {
    try {
      return pickHonorific(genderHint);
    } catch (e) {
      const list = ['Oga', 'Mai Gida', 'Mallam', 'Yallabai', 'Dan uwa', 'Aboki', 'Driver', 'Baba', 'Mama', 'Hajiya'];
      return list[Math.floor(Math.random() * list.length)];
    }
  }

  /** World X for lane index — matches renderer wide road */
  laneX(lane) {
    const i = Math.max(0, Math.min(2, Math.round(lane)));
    return LANE_WORLD_X[i] ?? 0;
  }

  randomDest() {
    return pickDestination();
  }

  /** Prefer Controls module; dir < 0 = left, dir > 0 = right */
  changeLane(dir) {
    if (this.state !== STATE.PLAY && this.state !== STATE.INTRO) return;
    // Damaged steering: delayed / unreliable
    if (this.steerPenalty > 60 && Math.random() < 0.35) {
      this.ui.showMissionToast('Steering damaged!');
      return;
    }
    if (this.controls) {
      if (dir < 0) this.controls.steerLeft();
      else this.controls.steerRight();
      return;
    }
    const n = this.playerLane + dir;
    if (n >= 0 && n < CONFIG.LANES) {
      this.playerLane = n;
      this.bounce = 10;
    }
  }

  cycleRadio() {
    // Tap radio: if off → turn on; if on → next station
    if (this.radioOn === false) {
      this.radioOn = true;
    }
    const list = CONFIG.RADIO || [
      { name: 'Freedom Radio' }, { name: 'Arewa Radio' }, { name: 'Rahama Radio' },
      { name: 'Radio Kano' }, { name: 'Cool FM' }, { name: 'Express Radio' }
    ];
    this.radioIndex = ((this.radioIndex || 0) + 1) % list.length;
    const st = list[this.radioIndex];
    this.radioOn = true;
    this.ui.setRadio?.(st.name + ' · ON');
    try {
      Audio.ensure();
      Audio.radioTune(st.name);
    } catch (e) {}
    this.ui.showMissionToast('📻 ' + st.name);
  }

  horn() {
    if (this.state !== STATE.PLAY) return;
    Audio.horn();
    try { Audio.speakHausa?.('horn'); } catch (e) {}
    this.inv = Math.max(this.inv, 18);
    for (const o of this.obs) {
      if (Math.round(o.lane) === this.playerLane && Math.abs(o.y - this.playerY) < 120) {
        o.y -= 36;
        // 5. Traffic reacts to horn — accelerate away
        o.speed = (o.speed || 1) * 1.15;
      }
    }
  }

  // ——— 1. ROAD NETWORK ———
  updateRoadNetwork() {
    if (!this.roadSegment) this.roadSegment = nextRoadSegment('straight', this.level || 1);
    const need = this.roadSegment.choice ? 2.2 : 1.6 + Math.random() * 0.8;
    if (this.segmentDist < need) return;

    if (this.roadSegment.choice && !this.pendingJunction) {
      this.pendingJunction = true;
      this.state = STATE.EVENT;
      this.throttle = 0.2;
      const distA = pickDestination();
      const distB = pickDestination();
      this.ui.showEvent(
        '🛤️ ' + (this.roadSegment.name || 'Junction'),
        'Choose route · current district: ' + (this.roadSegment.district || 'Kano'),
        [
          {
            label: '← LEFT · ' + distA,
            action: () => this.resolveJunction('left', distA)
          },
          {
            label: 'STRAIGHT · keep going',
            action: () => this.resolveJunction('straight', this.roadSegment.district)
          },
          {
            label: 'RIGHT → · ' + distB,
            action: () => this.resolveJunction('right', distB)
          }
        ]
      );
      return;
    }

    if (!this.pendingJunction) {
      this.advanceSegment();
    }
  }

  resolveJunction(choice, district) {
    this.pendingJunction = false;
    this.segmentDist = 0;
    this.roadSegment = nextRoadSegment(choice === 'straight' ? 'straight' : (choice === 'left' ? 'curve_l' : 'curve_r'), this.level || 1);
    this.roadSegment.district = district || this.roadSegment.district;
    if (district && this.visitedDistricts.indexOf(district) < 0) {
      this.visitedDistricts.push(district);
      this.score += 80;
      this.ui.showMissionToast('📍 Entered ' + district);
    }
    this.state = STATE.PLAY;
    this.ui.hideEvent?.();
    this.ui.showPlaying?.();
    this.ui.setRouteLabel?.(this.roadSegment.name + ' · ' + this.roadSegment.district);
  }

  advanceSegment() {
    const prev = this.roadSegment?.id || 'straight';
    this.roadSegment = nextRoadSegment(prev, this.level || 1);
    this.segmentDist = 0;
    const d = this.roadSegment.district;
    if (d && this.visitedDistricts.indexOf(d) < 0) {
      this.visitedDistricts.push(d);
      this.score += 50;
    }
    this.ui.setRouteLabel?.(this.roadSegment.name + ' · ' + d);
    if (this.roadSegment.id === 'market') {
      this.zoneType = 'market';
      this.parkOnly = true;
    } else if (this.roadSegment.id === 'junction' || this.roadSegment.id === 'roundabout') {
      this.zoneType = 'junction';
      this.parkOnly = false;
    } else {
      this.zoneType = 'road';
      this.parkOnly = false;
    }
  }

  // ——— 10. WORLD EVENTS ———
  updateWorldEvents() {
    if (this.worldEventTimer > 0) {
      this.worldEventTimer--;
      if (this.worldEventTimer <= 0) {
        this.worldEvent = null;
        this.weatherGrip = 1;
        this.ui.showMissionToast('Event cleared');
      }
      return;
    }
    const band = getLevelBand(this.level || 1);
    if (this.frame % 700 === 0 && this.dist > 1.5 && Math.random() < 0.28 * (band.event || 1)) {
      const ev = WORLD_EVENTS[Math.floor(Math.random() * WORLD_EVENTS.length)];
      this.worldEvent = ev;
      this.worldEventTimer = ev.duration;
      if (ev.grip) this.weatherGrip = ev.grip;
      this.ui.showMissionToast(ev.msg);
      try { Audio.speak(ev.msg.replace(/[^\w\s.,'-]/g, ''), { rate: 0.95 }); } catch (e) {}
    }
  }

  // ——— 3. MISSIONS ———
  tickRunMissions() {
    if (!this.runMissions || !this.runMissions.length) return;
    const stats = {
      totalPax: this.totalPax,
      score: this.score,
      dist: this.dist,
      districts: this.visitedDistricts.length,
      karotaFines: this.karotaFines,
      dropCount: this.dropCount
    };
    for (const m of this.runMissions) {
      if (m.done) continue;
      const val = stats[m.key] ?? 0;
      if (m.invert) {
        // success if still 0 at end — checked on over; during run just track
        m.progress = val;
      } else {
        m.progress = val;
        if (val >= m.n) {
          m.done = true;
          this.score += m.reward;
          this.ui.showMissionToast('✅ Mission: ' + m.text + ' +₦' + m.reward);
          Audio.success();
        }
      }
    }
    // show first incomplete as active (safe numbers only)
    const next = this.runMissions.find((m) => !m.done);
    if (next) {
      const prog = Math.floor(Number(next.progress) || 0);
      const need = Number(next.n) || 1;
      this.activeMission = {
        text: next.text,
        progress: prog,
        target: need,
        type: next.key === 'dropCount' ? 'drop' : next.key === 'dist' ? 'dist' : next.key === 'totalPax' ? 'pax' : 'score'
      };
      this.ui.setMission?.(next.text + ' (' + prog + '/' + need + ')');
    }
  }

  // ——— 4. COLLISION TIERS ———
  applyCollisionImpact(hitObj = null) {
    const isRich = !!(hitObj && (hitObj.rich || hitObj.type === 'suv' || hitObj.type === 'luxury' || hitObj.paxClass === 'vip'));
    if (isRich) {
      this.startRichManDrama(hitObj);
      return;
    }
    const tier = collisionTier(this.speed);
    this.triggerShake(Math.min(3, (tier.shake || 2) * 0.3), Math.min(3, (tier.shake || 2) / 3));
    this.applyDamage('body', (tier.dmg || 8) * 0.45);
    this.applyDamage('engine', (tier.dmg || 8) * 0.2);
    if (tier.tier === 'high' || tier.tier === 'critical') {
      this.applyDamage('tyres', (tier.dmg || 8) * 0.15);
    }
    const mul = typeof tier.speedMul === 'number' ? tier.speedMul : 0.7;
    this.speed = Math.max(1.2, (Number(this.speed) || 2.5) * mul);
    this.steerPenalty = tier.steerPenalty || 0;
    this.ui.showMissionToast(tier.msg || 'Hit!');
    Audio.crash();
    if (this.renderer3d?.setDamageVisual) this.renderer3d.setDamageVisual(this.condition);
  }

  /** Drama: keke vs rich man's car */
  startRichManDrama(hitObj = null) {
    this.state = STATE.EVENT;
    this.speed = 0;
    this.throttle = 0;
    this.braking = true;
    this.triggerShake(14, 8);
    Audio.crash();
    Audio.alert?.();
    try { if (navigator.vibrate) navigator.vibrate([60, 40, 80, 40, 120]); } catch (e) {}
    const fine = 2500 + Math.floor(Math.random() * 4500);
    const plate = hitObj?.plate || ('KN-' + (100 + Math.floor(Math.random() * 899)));
    this.ui.showEvent(
      '🚗💥 Rich man\'s car!',
      'You clipped a luxury ride (' + plate + ').\n' +
      'Owner: "Kai keke driver! My Lexus!"\n' +
      'Crowd gathers… police may come.\nDemand: ₦' + fine.toLocaleString(),
      [
        {
          label: 'Pay ₦' + fine.toLocaleString(),
          action: () => {
            this.score = Math.max(0, this.score - fine);
            this.condition = Math.max(5, (this.condition || 100) - 12);
            this.ui.showMissionToast('Settled with big man −₦' + fine.toLocaleString());
            this.inv = 90;
            this.state = STATE.PLAY;
            this.braking = false;
            this.ui.showPlaying();
          }
        },
        {
          label: 'Argue (Hausa drama)',
          action: () => {
            const arg = this.dialectLine?.('argue') || 'Kai! Ba ni da laifi!';
            this.ui.showMissionToast(arg);
            if (Math.random() < 0.45) {
              const half = Math.floor(fine * 0.45);
              this.score = Math.max(0, this.score - half);
              this.ui.showMissionToast('Reduced to ₦' + half.toLocaleString());
            } else {
              this.wantedLevel = (this.wantedLevel || 0) + 0.35;
              this.score = Math.max(0, this.score - fine);
              this.ui.showMissionToast('He called KAROTA — full fine + heat');
              this.karotaTimer = 0;
            }
            this.condition = Math.max(5, (this.condition || 100) - 8);
            this.inv = 70;
            this.state = STATE.PLAY;
            this.braking = false;
            this.ui.showPlaying();
          }
        },
        {
          label: 'Escape (risk)',
          action: () => {
            this.triggerShake(10, 6);
            if (Math.random() < 0.4) {
              this.wantedLevel = (this.wantedLevel || 0) + 0.5;
              this.ui.showMissionToast('Escaped — but you are wanted');
              this.addCombo?.(2);
            } else {
              this.score = Math.max(0, this.score - fine * 1.2);
              this.continuesLeft = Math.max(0, (this.continuesLeft || 1) - 1);
              this.ui.showMissionToast('Caught — heavy fine + life');
            }
            this.inv = 50;
            this.state = STATE.PLAY;
            this.braking = false;
            this.ui.showPlaying();
          }
        }
      ]
    );
  }

  hitPothole() {
    this.potholeHits = (this.potholeHits || 0) + 1;
    this.triggerShake(8, 5);
    this.applyDamage('tyres', 6 + Math.random() * 8);
    this.applyDamage('body', 3);
    this.speed = Math.max(1.0, (this.speed || 2) * 0.55);
    Audio.crash();
    this.ui.showMissionToast('🕳️ Pothole! (' + this.potholeHits + (this.gameMode === 'potholes' ? '/' + (this.potholeMax || 8) : '') + ')');
    if (this.gameMode === 'potholes' && this.potholeHits >= (this.potholeMax || 8)) {
      this.ui.showMissionToast('🕳️ Too many potholes — challenge failed');
      this.gameOver?.();
    }
  }

  triggerShake(frames = 12, mag = 6) {
    this.shake = frames;
    this.shakeMag = mag;
  }

  addCombo(n = 1) {
    this.combo += n;
    this.comboTimer = 160;
    if (this.combo >= 5 && this.combo % 5 === 0) {
      this.ui.showMissionToast('🔥 ' + this.combo + 'x COMBO!');
    }
  }

  getComboMultiplier() {
    if (this.combo >= 12) return 2;
    if (this.combo >= 7) return 1.6;
    if (this.combo >= 4) return 1.3;
    if (this.combo >= 2) return 1.15;
    return 1;
  }

  initDaily() {
    this.ui.updateDailyUI?.(this);
  }

  claimDaily() {
    if (Storage.isDailyClaimed()) {
      this.ui.showMissionToast('Already claimed today');
      return;
    }
    const streak = Storage.claimDaily();
    const reward = 500 + Math.min(500, streak * 50);
    this.money += reward;
    Storage.setMoney(this.money);
    this.ui.showMissionToast('Daily +₦' + reward + ' · Streak ' + streak);
    this.ui.updateDailyUI?.(this);
  }

  honorific() {
    const h = CONFIG.HONORIFICS;
    return h[Math.floor(Math.random() * h.length)];
  }

  randomDest() {
    const d = CONFIG.DESTINATIONS;
    return d[Math.floor(Math.random() * d.length)];
  }

  // ——— Opening / crash / continue ———
  gameOver() {
    Audio.crash();
    this.applyDamage('body', 18 + Math.random() * 12);
    this.applyDamage('engine', 10 + Math.random() * 10);
    this.applyDamage('tyres', 6 + Math.random() * 8);
    this.triggerShake(16, 8);
    try { if (navigator.vibrate) navigator.vibrate(80); } catch {}
    this.state = STATE.EVENT;
    this.throttle = 0;

    if (this.continuesLeft > 0) {
      this.ui.showEvent(
        '💥 CRASHED!',
        'You still have ' + this.continuesLeft + ' free Life Saver' +
          (this.continuesLeft > 1 ? 's' : '') + ' left.\nContinue from here?',
        [
          { label: 'Use Free Life Saver (' + this.continuesLeft + ' left)', action: () => this.useContinue(false) },
          { label: 'End Run', action: () => this.finalGameOver() }
        ]
      );
    } else {
      const cost = 350 + (this.paidContinuesUsed || 0) * 200;
      const can = this.score >= cost;
      this.ui.showEvent(
        '💥 No Free Lives Left',
        can
          ? 'Pay ₦' + cost.toLocaleString() + ' from your score to continue?'
          : 'Need ₦' + cost.toLocaleString() + ' — you have ₦' + this.score.toLocaleString() + '.',
        can
          ? [
              { label: 'Pay ₦' + cost.toLocaleString() + ' & Continue', action: () => this.useContinue(true) },
              { label: 'End Run', action: () => this.finalGameOver() }
            ]
          : [{ label: 'End Run', action: () => this.finalGameOver() }]
      );
    }
  }

  useContinue(isPaid) {
    try {
      if (isPaid) {
        const cost = 350 + (this.paidContinuesUsed || 0) * 200;
        if (this.score < cost) {
          this.finalGameOver();
          return;
        }
        this.score -= cost;
        this.paidContinuesUsed = (this.paidContinuesUsed || 0) + 1;
        this.continuesLeft = 1;
        this.ui.showMissionToast('Paid ₦' + cost.toLocaleString() + ' — continue!');
      } else {
        this.continuesLeft = Math.max(0, this.continuesLeft - 1);
        this.score = Math.max(0, this.score - 80);
      }
      this.inv = 100 + (this.getBonuses().invFrames || 0);
      this.obs = [];
      this.speed = 0;
      this.throttle = 0.2;
      this.ui.hideEvent();
      this.state = STATE.PLAY;
      this.ui.showPlaying();
      this.ui.updateHUD(this);
      Audio.startEngine();
    } catch (e) {
      console.error(e);
      this.finalGameOver();
    }
  }

  finalGameOver() {
    this.state = STATE.OVER;
    Audio.stopEngine();
    Audio.stopRadioBed();
    this.money += Math.floor(this.score * 0.2);
    Storage.setMoney(this.money);
    if (this.score > this.high) {
      this.high = this.score;
      Storage.setHighScore(this.high);
    }
    const route = CONFIG.ROUTES[this.selectedRoute];
    const driver = this.getDriver();
    Storage.addRun({
      score: Math.floor(this.score),
      dist: Number(this.dist.toFixed(1)),
      route: route?.name || this.selectedRoute,
      driver: driver.name,
      at: Date.now()
    });
    for (const ach of CONFIG.ACHIEVEMENTS || []) {
      try {
        if (ach.check(this) && Storage.unlockAchievement(ach.id)) {
          this.ui.showMissionToast('🏆 ' + ach.name);
        }
      } catch {}
    }
    Storage.set('kanoLastRun', {
      score: Math.floor(this.score),
      dist: Number(this.dist.toFixed(1)),
      level: this.level,
      drops: this.dropCount,
      dests: (this.destinationsServed || []).slice(-6),
      driver: this.getDriver().name,
      tribe: this.dialect || 'hausa',
      mode: this.gameMode || 'career'
    });
    // Naija Challenge — top 3 per tribe, grand standing by sum of top 3
    try {
      const tribe = this.dialect || 'hausa';
      Storage.submitTribalScore(tribe, {
        score: Math.floor(this.score),
        dist: Number(this.dist.toFixed(1)),
        name: this.getDriver()?.name || 'Driver',
        mode: this.gameMode || 'career'
      });
      const stand = Storage.tribalGrandStanding();
      this._lastTribal = stand;
      if (stand[0]) {
        const lead = stand[0];
        this.ui.showMissionToast(
          '🇳🇬 ' + lead.label + ' leads · top3 sum ₦' + lead.total.toLocaleString()
        );
      }
    } catch (e) { console.warn('tribal', e); }
    this.ui.showGameOver(this);
  }

  /** Grand winners panel data for UI */
  getNaijaGrandWinners() {
    try { return Storage.tribalGrandStanding(); } catch (e) { return []; }
  }

  rectHit(a, b) {
    return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
  }

  laneClear(lane, y, gap = 130, ignore = null) {
    return !this.obs.some(
      (o) =>
        o !== ignore &&
        Math.round(o.lane) === Math.round(lane) &&
        Math.abs(o.y - y) < gap
    );
  }

  // ——— Passengers ———
  boardWaiting(p) {
    // Realistic keke: 2 front (beside driver) + 3 back = 5
    let seats = p.seats || 1;
    if (p.aishat) seats = Math.min(2, seats);
    if (p.size === 'big' || p.size === 'tall' || p.size === 'fat') seats = 2;
    if (this.paxOnBoard + seats > this.capacity) {
      this.ui.showMissionToast(p.size && p.size !== 'normal' ? 'No space for big passenger!' : 'Keke full! (5 max)');
      return false;
    }
    this.paxOnBoard += seats;
    this.totalPax += seats;
    const mult = p.fareMult || (p.vip ? 2.2 : 1);
    const base = p.agreedFare || (p.aishat ? 550 : 120);
    const fare = Math.floor(base * mult);
    this.onboard.push({
      dest: p.dest || this.randomDest(),
      seats,
      fare,
      size: p.size || 'normal',
      paxClass: p.paxClass || 'worker',
      name: p.aishat ? 'Aishat' : (p.paxClassName || (p.vip ? 'VIP' : 'Passenger'))
    });
    let pick = fare;
    if (p.aishat && this.getBonuses().aishatBonus) pick += this.getBonuses().aishatBonus;
    this.score += Math.floor(pick * 0.25 * this.fareScale());
    this.addCombo(p.aishat ? 3 : p.vip ? 2 : 1);
    Audio.pickup();
    Audio.voicePickup();
      if (Math.random() < 0.2 && this.paxOnBoard > 0) {
        const bf = Math.floor(140 * (this.fareScale?.() || 1));
        setTimeout(() => { if (this.state === STATE.PLAY) this.startFareArgument(bf); }, 400);
      }
    Audio.voiceSannu();
    this.pickupCooldown = 50;
    if (p.aishat) this.ui.showMissionToast('Aishat + Hibba → ' + (p.dest || 'town'));
    else if (p.size === 'big' || p.size === 'fat' || p.size === 'tall')
      this.ui.showMissionToast('Tight fit (' + p.size + ') → ' + (p.dest || '?') + ' · ₦' + fare);
    else {
      const cls = p.paxClassName || (p.vip ? 'VIP' : 'Passenger');
      this.ui.showMissionToast(cls + ' → ' + (p.dest || '?') + ' · ₦' + fare);
    }
    return true;
  }

  startNegotiation(p) {
    this.state = STATE.EVENT;
    Audio.negotiate();
    const arg = this.dialectLine('argue');
    if (arg) this.ui?.showMissionToast?.(arg);
    const h = this.honorific();
    const dest = p.dest || this.randomDest();
    p.dest = dest;
    const low = 60 + Math.floor(Math.random() * 40);
    const fair = 110 + Math.floor(Math.random() * 50);
    const lineTpl = CONFIG.NEGOTIATE_LINES[Math.floor(Math.random() * CONFIG.NEGOTIATE_LINES.length)];
    const line = lineTpl.replace(/\{h\}/g, h).replace(/\{low\}/g, String(low)).replace(/\{dest\}/g, dest);

    this.ui.showEvent('💬 Fare — ' + dest, line, [
      {
        label: 'Accept ₦' + low,
        action: () => {
          p.agreedFare = low;
          this.boardWaiting(p);
          this.state = STATE.PLAY;
          this.ui.showPlaying();
        }
      },
      {
        label: 'Hold ₦' + fair,
        action: () => {
          if (Math.random() < 0.55) {
            p.agreedFare = fair;
            this.boardWaiting(p);
          } else {
            Audio.alert();
            this.ui.showMissionToast(h + ' walked away');
          }
          this.state = STATE.PLAY;
          this.ui.showPlaying();
        }
      },
      {
        label: 'No deal',
        action: () => {
          this.ui.showMissionToast('No boarding');
          this.state = STATE.PLAY;
          this.ui.showPlaying();
        }
      }
    ]);
  }

  tryDropOff() {
    if (this.paxOnBoard <= 0 || this.onboard.length === 0) return;
    if (this.speed > 1.4) {
      this.ui.showMissionToast('📍 Hold BRAKE to stop at drop point');
      return;
    }
    // Active drop zone dest (if any) for match challenge
    const zone = (this.dropZones || []).find((d) => !d.used && Math.round(d.lane) === Math.round(this.playerLane));
    const zoneDest = (zone?.dest || zone?.label || '').toLowerCase();

    const p = this.onboard.shift();
    this.paxOnBoard = Math.max(0, this.paxOnBoard - (p.seats || 1));
    this.dropCount += p.seats || 1;
    const route = CONFIG.ROUTES[this.selectedRoute] || {};
    let fare = Math.floor(
      (p.fare || route.baseFare || 140) *
        this.getComboMultiplier() *
        (this.getBonuses().fareMult || 1) *
        this.fareScale()
    );
    const marks = (route.landmarks || []).map(s => s.toLowerCase());
    const dest = (p.dest || '').toLowerCase();
    let bonusNote = '';
    const destMatchZone = zoneDest && dest && (
      zoneDest.includes(dest.slice(0, 4)) || dest.includes(zoneDest.slice(0, 4)) ||
      zoneDest === dest
    );
    const destMatchRoute = dest && (marks.some(m => m.includes(dest.slice(0, 5)) || dest.includes(m.slice(0, 5))) ||
        (route.name || '').toLowerCase().includes(dest.slice(0, 5)));

    if (this.gameMode === 'matchdrop') {
      if (destMatchZone || destMatchRoute) {
        fare = Math.floor(fare * 1.75);
        this.matchStreak = (this.matchStreak || 0) + 1;
        bonusNote = ' ★ MATCH x' + this.matchStreak;
        this.addCombo?.(2);
      } else {
        fare = Math.floor(fare * 0.35);
        this.matchFails = (this.matchFails || 0) + 1;
        this.matchStreak = 0;
        bonusNote = ' ✗ wrong stop';
        this.ui.showMissionToast('Wrong drop — needed ' + (p.dest || '?'));
      }
    } else if (destMatchZone || destMatchRoute) {
      fare = Math.floor(fare * 1.35);
      bonusNote = ' ★ dest match';
    }
    this.score += fare;
    this.destinationsServed = this.destinationsServed || [];
    this.destinationsServed.push(p.dest || 'stop');
    this.addCombo(2);
    Audio.pickup();
    Audio.voiceDrop();
    this.ui.showMissionToast((this.dialectLine('drop') || 'Akwai!') + ' (' + (p.dest || 'stop') + ') +₦' + fare + bonusNote);
    Audio.voiceAkwai();
  }

  startYanDaba() {
    this.state = STATE.EVENT;
    this.throttle = 0;
    Audio.alert();
    Audio.voiceYanDaba();
    this.triggerShake(10, 5);
    try { if (navigator.vibrate) navigator.vibrate([40, 40, 80]); } catch (e) {}
    const loss = 150 + Math.floor(Math.random() * 400);
    this.ui.showEvent(
      'Yan Daba Checkpoint',
      'Bad boys block the road!\n"Bring phone! Bring money!"\nThey search passengers…',
      [
        {
          label: 'Hand over ₦' + loss,
          action: () => {
            this.score = Math.max(0, this.score - loss);
            this.ui.showMissionToast('Robbed of ₦' + loss);
            Audio.crash();
            this.inv = 80;
            this.state = STATE.PLAY;
            this.ui.showPlaying();
          }
        },
        {
          label: 'Speed away (risk)',
          action: () => {
            if (Math.random() < 0.4) {
              this.ui.showMissionToast('Escaped Yan Daba!');
              this.addCombo(3);
              Audio.horn();
              this.policeChase = 100;
            } else {
              this.score = Math.max(0, this.score - Math.floor(loss * 1.5));
              this.ui.showMissionToast('Caught — lost more');
              Audio.crash();
              this.triggerShake(14, 7);
            }
            this.inv = 50;
            this.state = STATE.PLAY;
            this.ui.showPlaying();
          }
        },
        {
          label: 'Call for help',
          action: () => {
            if (Math.random() < 0.5) {
              this.ui.showMissionToast('People gathered — they fled');
              Audio.success();
              this.score += 50;
            } else {
              this.score = Math.max(0, this.score - loss);
              this.ui.showMissionToast('Too late — ₦' + loss + ' gone');
              Audio.crash();
            }
            this.inv = 60;
            this.state = STATE.PLAY;
            this.ui.showPlaying();
          }
        }
      ]
    );
  }

  startKarotaCheckpoint() {
    this.karotaTimer = 480;
    this.state = STATE.EVENT;
    this.speed = 0;
    this.throttle = 0;
    this.braking = true;
    Audio.alert();
    Audio.siren();
    Audio.voiceKarota();
    this.triggerShake(6, 3);
    const fine = 150 + Math.floor(Math.random() * 250);
    const h = this.honorific();
    const spots = [
      'junction',
      'market frontage',
      'busy roadside',
      'no-parking zone',
      'crowded loading point',
      'flyover underpass'
    ];
    const spot = spots[Math.floor(Math.random() * spots.length)];
    const reasons = [
      'No parking / loading here — move!',
      'Keke no dey stop for this junction!',
      'You block the road — fine!',
      'Papers and badge — KAROTA check!',
      'Wrong stop near market — settle!'
    ];
    const reason = reasons[Math.floor(Math.random() * reasons.length)];
    this.ui.showEvent(
      'KAROTA Checkpoint',
      'Uniformed KAROTA at the ' + spot + '.\n"' + h + '! ' + reason + '"\nFine about ₦' + fine + '.',
      [
        {
          label: 'Pay ₦' + fine,
          action: () => {
            this.score = Math.max(0, this.score - fine);
            this.ui.showMissionToast('Paid KAROTA ₦' + fine);
            Audio.negotiate();
            this.inv = 70;
            this.state = STATE.PLAY;
            this.ui.showPlaying();
          }
        },
        {
          label: 'Apologize & move',
          action: () => {
            if (Math.random() < 0.55) {
              this.ui.showMissionToast('KAROTA waved you on');
              Audio.success();
              this.score += 40;
            } else {
              this.score = Math.max(0, this.score - fine);
              this.ui.showMissionToast('Still fined ₦' + fine);
              Audio.crash();
            }
            this.inv = 70;
            this.state = STATE.PLAY;
            this.ui.showPlaying();
          }
        },
        {
          label: 'Argue (risk)',
          action: () => {
            if (Math.random() < 0.3) {
              this.ui.showMissionToast('They let you go');
              this.addCombo(2);
              Audio.horn();
            } else {
              this.ui.showMissionToast('Extra fine — attitude');
              this.score = Math.max(0, this.score - Math.floor(fine * 1.8));
              this.triggerShake(10, 5);
              Audio.crash();
            }
            this.inv = 50;
            this.state = STATE.PLAY;
            this.ui.showPlaying();
          }
        }
      ]
    );
  }



  /** Driver vs passenger fare argument — keke is already stopped (EVENT) */
  startFareArgument(baseFare) {
    this.state = STATE.EVENT;
    this.speed = 0;
    this.throttle = 0;
    this.braking = true;
    this.triggerShake?.(5, 3);
    const want = Math.floor(baseFare * (0.55 + Math.random() * 0.25));
    const ask = Math.floor(baseFare * (1.05 + Math.random() * 0.35));
    const argue = this.dialectLine('argue') || 'Kai! Farashi ya yi tsada!';
    const fareQ = this.dialectLine('fare') || 'Naira nawa?';
    this.ui.showEvent(
      '💬 Fare argument',
      fareQ + '\nPassenger: "₦' + want + ' only!"\nYou: "₦' + ask + '!"\n' + argue,
      [
        {
          label: 'Accept ₦' + want,
          action: () => {
            this.score += want;
            this.ui.showMissionToast((this.dialectLine('ok') || 'Ok') + ' +₦' + want);
            this.state = STATE.PLAY;
            this.braking = false;
            this.ui.showPlaying();
          }
        },
        {
          label: 'Hold for ₦' + ask,
          action: () => {
            if (Math.random() < 0.55) {
              this.score += ask;
              this.ui.showMissionToast('Settled ₦' + ask);
            } else {
              this.ui.showMissionToast('Passenger walked away');
              if (this.paxOnBoard > 0) {
                this.paxOnBoard = Math.max(0, this.paxOnBoard - 1);
                if (this.onboard?.length) this.onboard.shift();
              }
            }
            this.state = STATE.PLAY;
            this.braking = false;
            this.ui.showPlaying();
          }
        },
        {
          label: 'Shout & drive (risk)',
          action: () => {
            this.triggerShake?.(8, 4);
            if (Math.random() < 0.4) {
              this.score += ask;
              this.wantedLevel = (this.wantedLevel || 0) + 0.2;
              this.ui.showMissionToast('Forced ₦' + ask + ' — heat up');
            } else {
              this.score = Math.max(0, this.score - 80);
              this.ui.showMissionToast('Crowd sided with passenger −₦80');
            }
            this.state = STATE.PLAY;
            this.braking = false;
            this.ui.showPlaying();
          }
        }
      ]
    );
  }


  cycleGameMode() {
    const order = ['career', 'timeattack', 'fuel', 'matchdrop', 'potholes', 'freeroam'];
    const i = order.indexOf(this.gameMode || 'career');
    this.gameMode = order[(i + 1) % order.length];
    const labels = {
      career: '💼 Career — fares, missions, KAROTA',
      timeattack: '⏱️ Time Attack — 3.5 km race',
      fuel: '⛽ Fuel Gauge Challenge — manage tank',
      matchdrop: '📍 Match Drop — pick dest = drop dest',
      potholes: '🕳️ Potholes Challenge — survive bad roads',
      freeroam: '🧭 Free roam — explore Kano'
    };
    this.ui?.showMissionToast?.(labels[this.gameMode] || this.gameMode);
    return this.gameMode;
  }

  finishTimeAttack() {
    if (this.raceFinished) return;
    this.raceFinished = true;
    this.state = STATE.EVENT;
    this.speed = 0;
    const sec = Math.max(1, Math.floor((this.runTime || 0) / 60));
    const t = (this.runTime || 0) / 60;
    let medal = 'Bronze';
    if (t <= 95) medal = 'Gold';
    else if (t <= 125) medal = 'Silver';
    const key = 'kanoTA_' + (this.selectedRoute || 'city');
    let best = null;
    try { best = Storage.get(key, null); } catch (e) {}
    const isBest = best == null || t < best;
    if (isBest) {
      try { Storage.set(key, t); } catch (e) {}
    }
    const msg = 'Time Attack done\n' +
      medal + ' · ' + t.toFixed(1) + 's for ' + (this.raceTargetKm || 3.5) + ' km\n' +
      (isBest ? '🏆 New best!' : ('Best: ' + Number(best).toFixed(1) + 's'));
    this.ui.showEvent('🏁 ' + medal, msg, [
      {
        label: 'Again',
        action: () => {
          this.gameMode = 'timeattack';
          this.start();
          this.ui.showPlaying();
        }
      },
      {
        label: 'Career mode',
        action: () => {
          this.gameMode = 'career';
          this.start();
          this.ui.showPlaying();
        }
      }
    ]);
    this.score += medal === 'Gold' ? 800 : medal === 'Silver' ? 400 : 150;
  }

  cycleDialect() {
    const order = ['hausa', 'yoruba', 'igbo'];
    const i = order.indexOf(this.dialect || 'hausa');
    this.dialect = order[(i + 1) % order.length];
    const d = (typeof NAIJA_CHALLENGE !== 'undefined' && NAIJA_CHALLENGE[this.dialect])
      ? NAIJA_CHALLENGE[this.dialect]
      : { label: this.dialect, greet: 'Sannu' };
    this.ui?.showMissionToast?.('🇳🇬 Naija Challenge: ' + d.label + ' — ' + (d.greet || ''));
    return this.dialect;
  }

  dialectLine(key) {
    try {
      const pack = NAIJA_CHALLENGE?.[this.dialect || 'hausa'];
      return pack?.[key] || null;
    } catch (e) { return null; }
  }

  // ——— Main loop ———
  update(dt) {
    if (this.state === STATE.START || this.state === STATE.OVER || this.state === STATE.EVENT) {
      // Keke fully stops while negotiating / at checkpoint
      this.speed = 0;
      this.throttle = 0;
      this.braking = true;
      if (this.shake > 0) this.shake--;
      return;
    }
    // Opening sequence: walk → board → start engine
    if (this.state === STATE.INTRO) {
      this.introT = (this.introT || 0) + 1;
      if (this.renderer3d) {
        this.renderer3d.introPhase = this.introT < 40 ? 0 : this.introT < 80 ? 1 : 2;
      }
      if (this.introT === 1) this.ui.showMissionToast('Walking to your keke…');
      if (this.introT === 40) this.ui.showMissionToast('Getting in…');
      if (this.introT === 80) {
        this.ui.showMissionToast('Engine on — Sannu da aiki!');
        try { Audio.startEngine(); } catch (e) {}
      }
      if (this.introT >= 110) {
        this.finishIntro();
      }
      return;
    }

    if (this.state === STATE.PAUSE) {
      if (this.shake > 0) this.shake--;
      return;
    }

    // INTRO sequence: walk → enter → engine
    if (this.state === STATE.INTRO) {
      this.introT++;
      if (this.renderer3d) {
        if (this.introT < 50) this.renderer3d.introPhase = 0;
        else if (this.introT < 100) this.renderer3d.introPhase = 1;
        else if (this.introT < 140) this.renderer3d.introPhase = 2;
        else this.renderer3d.introPhase = 3;
      }
      if (this.introT === 50) this.ui.showMissionToast('Approaching keke…');
      if (this.introT === 100) this.ui.showMissionToast('Getting in…');
      if (this.introT === 140) {
        Audio.startEngine();
        this.ui.showMissionToast('Starting engine…');
      }
      if (this.introT >= 90) this.finishIntro();
      this.targetX = this.laneX(this.playerLane);
      this.playerX += (this.targetX - this.playerX) * 0.2;
      this.playerY = this.canvas.clientHeight - 195;
      return;
    }

    // PLAY
    this.frame++;
    // Gentle highway undulation (not a full heightmap)
    this.runTime = (this.runTime || 0) + 1;
    if (this.gameMode === 'timeattack' && !this.raceFinished && this.raceTargetKm > 0) {
      if ((this.dist || 0) >= this.raceTargetKm) {
        this.finishTimeAttack();
        return;
      }
      if (this.frame % 90 === 0) {
        const left = Math.max(0, this.raceTargetKm - (this.dist || 0));
        const t = ((this.runTime || 0) / 60).toFixed(0);
        this.ui?.showMissionToast?.('⏱️ ' + t + 's · ' + left.toFixed(2) + ' km left');
      }
    }
    this.roadSlope = Math.sin((this.dist || 0) * 0.35) * 0.04
      + Math.sin((this.dist || 0) * 1.1) * 0.025
      + ((this.roadSegment?.id === 'bridge' || this.roadSegment?.slope) ? 0.06 : 0);
    if (this.inv > 0) this.inv--;
    if (this.bounce > 0) this.bounce--;
    if (this.shake > 0) this.shake--;
    if (this.nearMissCooldown > 0) this.nearMissCooldown--;
    if (this.policeChase > 0) this.policeChase--;
    if (this.trafficJamTimer > 0) this.trafficJamTimer--;
    if (this.karotaTimer > 0) this.karotaTimer--;
    if (this.comboTimer > 0) {
      this.comboTimer--;
      if (this.comboTimer <= 0) this.combo = 0;
    }

    const route = CONFIG.ROUTES[this.selectedRoute] || CONFIG.ROUTES.citycenter;
    const bonuses = this.getBonuses();

    // ——— MOVEMENT — calmer city pace ———
    if (typeof this.throttle !== 'number' || this.throttle < 0.15) this.throttle = 0.5;
    this.braking = !!this.braking;

    const loadFactor = 1 - Math.min(0.2, (this.paxOnBoard / Math.max(1, this.capacity)) * 0.2);
    // Cruise ~35–50 km/h feel; gas up to ~70
    const top = (4.2 + (bonuses.speed || 0) * 1.5) * loadFactor;
    let targetSpeed = this.braking ? 0 : (1.8 + this.throttle * (top - 1.8));
    if (!this.braking && targetSpeed < 1.8) targetSpeed = 1.8;
    if (this.trafficJamTimer > 0 && !this.braking) targetSpeed = Math.max(1.2, targetSpeed * 0.5);

    this.speed += (targetSpeed - this.speed) * (this.braking ? 0.22 : 0.1);
    if (this.braking) this.speed *= 0.82;
    if (!this.braking) this.speed = Math.max(1.8, this.speed);
    // Fuel
    if (this.speed > 0.25) {
      this.fuel = Math.max(0, this.fuel - 0.008 * (0.4 + this.throttle + this.paxOnBoard * 0.03));
    }
    if (this.fuel <= 0) {
      if (this.gameMode === 'fuel' && this.fuelChallengeActive) {
        this.fuelChallengeActive = false;
        this.ui.showMissionToast('⛽ Tank empty — Fuel Challenge failed');
        this.gameOver?.();
        return;
      }
      this.speed = Math.min(this.speed, 2.2);
      if (this.frame % 70 === 0) this.ui.showMissionToast('Out of fuel — limp mode');
    } else if (this.fuel < 18 && this.frame % 100 === 0) {
      this.ui.showMissionToast(this.gameMode === 'fuel' ? '⛽ CRITICAL — find petrol NOW' : 'Low fuel — find petrol');
      Audio.voiceLowFuel();
    }
    // Fuel challenge win at target km with fuel left
    if (this.gameMode === 'potholes' && this.raceTargetKm > 0 && (this.dist || 0) >= this.raceTargetKm && this.potholeHits < (this.potholeMax || 8)) {
      const bonus = Math.floor(400 + (this.potholeMax - this.potholeHits) * 80);
      this.score += bonus;
      this.state = STATE.EVENT;
      this.speed = 0;
      this.ui.showEvent('🕳️ Potholes cleared', 'Hits: ' + this.potholeHits + '/' + this.potholeMax + '\nBonus ₦' + bonus, [
        { label: 'Again', action: () => { this.gameMode = 'potholes'; this.start(); this.ui.showPlaying(); } },
        { label: 'Career', action: () => { this.gameMode = 'career'; this.start(); this.ui.showPlaying(); } }
      ]);
      this.raceTargetKm = 0;
      return;
    }
    if (this.gameMode === 'fuel' && this.fuelChallengeActive && this.raceTargetKm > 0 && (this.dist || 0) >= this.raceTargetKm) {
      this.fuelChallengeActive = false;
      const bonus = Math.floor(300 + this.fuel * 8);
      this.score += bonus;
      this.ui.showMissionToast('⛽ Fuel Challenge cleared! +₦' + bonus + ' (tank ' + Math.floor(this.fuel) + '%)');
      this.state = STATE.EVENT;
      this.speed = 0;
      this.ui.showEvent('⛽ Fuel Challenge', 'Reached ' + this.raceTargetKm + ' km with ' + Math.floor(this.fuel) + '% fuel.\nBonus ₦' + bonus, [
        { label: 'Again', action: () => { this.gameMode = 'fuel'; this.start(); this.ui.showPlaying(); } },
        { label: 'Career', action: () => { this.gameMode = 'career'; this.start(); this.ui.showPlaying(); } }
      ]);
      return;
    }
    if (!Number.isFinite(this.speed)) this.speed = 1.8;
    this.speed = Math.max(this.braking ? 0 : 1.8, Math.min(this.speed, 7));

    // Condition warnings
    if (this.condition < 25 && this.frame % 120 === 0) {
      this.ui.showMissionToast('Keke condition critical — find mechanic');
    } else if (this.condition < 50 && this.frame % 200 === 0) {
      this.ui.showMissionToast('Keke needs maintenance');
    }

    if (this.speed < 0.35) {
      this.stoppedFrames = (this.stoppedFrames || 0) + 1;
      if (this.stoppedFrames === 90) this.ui.showMissionToast('Waiting for passengers…');
    } else {
      this.stoppedFrames = 0;
    }
    if (this.pickupCooldown > 0) this.pickupCooldown--;

    // Travel progress — moderate
    const move = Math.max(this.speed, this.braking ? 0 : 1.8);
    this.roadOff = (this.roadOff + move * 1.6) % 10000;
    const kmPerFrame = move * 0.0015;
    this.dist += kmPerFrame;
    this.meters = (this.meters || 0) + kmPerFrame * 1000;
    this.segmentDist += kmPerFrame;
    this.score += Math.floor(this.speed * 0.08 * this.getComboMultiplier() * (bonuses.scoreMult || 1));
    Audio.updateEngine(this.speed);
    if (this.combo > this.bestCombo) this.bestCombo = this.combo;

    // —— 1. ROAD NETWORK: advance segment / offer junction choice ——
    this.updateRoadNetwork();

    // —— 10. WORLD EVENTS ——
    this.updateWorldEvents();

    // —— 6. RADIO dynamic content ——
    if (this.frame > 0 && this.frame % 850 === 0) {
      const line = radioAnnouncement({
        district: this.roadSegment?.district,
        roadType: this.roadSegment?.id,
        weather: this.renderer3d?.weather,
        karotaSoon: this.karotaTimer <= 0 && Math.random() < 0.4,
        mission: this.activeMission?.text,
        event: this.worldEvent?.msg
      });
      try { Audio.speak(line, { rate: 0.92, volume: 0.7 }); } catch (e) {}
      this.ui.showMissionToast('📻 ' + line);
    }

    // —— 3. Mission progress ——
    this.tickRunMissions();

    // Level band label
    const band = getLevelBand(this.level || 1);
    if (this.frame % 120 === 0) this.ui.setLevel?.(this.level + ' · ' + band.area);

    // Steer penalty decay
    if (this.steerPenalty > 0) this.steerPenalty--;

    // Event modifiers on speed
    if (this.worldEvent?.speedCap) {
      this.speed = Math.min(this.speed, this.worldEvent.speedCap);
    }
    if (this.roadSegment?.slow) {
      this.speed = Math.min(this.speed, 4.2);
    }
    if (this.worldEvent?.fuelDrain && this.speed > 0.25) {
      this.fuel = Math.max(0, this.fuel - 0.006 * this.worldEvent.fuelDrain);
    }

    // Weather grip
    const w = this.renderer3d?.weather || 'clear';
    if (w === 'rain') this.weatherGrip = 0.88;
    else if (w === 'harmattan') this.weatherGrip = 0.94;
    else this.weatherGrip = 1;

    // Level from distance — slower progression (every ~8 km)
    const newLevel = 1 + Math.floor(this.dist / 8);
    if (newLevel > this.level) {
      this.level = newLevel;
      this.ui.showMissionToast('📶 Level ' + this.level);
      Audio.success();
      try { this.unlockKekeByProgress(); } catch (e) {}
    }
    this.ui.setLevel?.(this.level);
    this.ui.setOnboardDest?.(this.onboard);

    // Kano district progression (Sabon Gari → Emir Palace District)
    const district = biomeForDistance(this.dist);
    if (district && district.id !== this.currentBiomeId) {
      this.currentBiomeId = district.id;
      this.currentDistrict = district;
      if (Array.isArray(this.visitedDistricts) && !this.visitedDistricts.includes(district.name)) {
        this.visitedDistricts.push(district.name);
      }
      this.ui.showMissionToast(district.msg || ('📍 ' + district.name));
      this.ui.setRouteLabel?.(district.name);
      try { this.renderer3d?.applyWorldBiome?.(district); } catch (e) {}
      Audio.success();
      if (district.landmarks?.length) {
        const tip = district.landmarks[Math.floor(Math.random() * district.landmarks.length)];
        setTimeout(() => { try { this.ui.showMissionToast('📌 ' + tip); } catch (e) {} }, 1200);
      }
    }

    // Landmarks along selected route
    const marks = route.landmarks || [];
    if (marks.length && this.dist > (this.landmarkIndex + 1) * 4 && this.landmarkIndex < marks.length) {
      const name = marks[this.landmarkIndex++];
      this.ui.showMissionToast('📍 ' + name);
      Audio.success();
    }

    // Approach warning for pick / drop checkpoints
    for (const p of this.paxZones) {
      if (p.taken) continue;
      const dy = p.y - this.playerY;
      if (dy > -180 && dy < -40 && Math.round(p.lane) === this.playerLane && this.frame % 40 === 0) {
        this.ui.showMissionToast('🟢 STOP PAD ahead — brake to pick up → ' + (p.dest || 'town'));
      }
    }
    for (const d of this.dropZones) {
      if (d.used) continue;
      const dy = d.y - this.playerY;
      if (dy > -180 && dy < -40 && Math.round(d.lane) === this.playerLane && this.frame % 45 === 0) {
        this.ui.showMissionToast('📍 DROP CHECKPOINT ahead — BRAKE to stop & drop');
      }
    }

    // KAROTA — denser in market / junction / gate districts
    const bandK = getLevelBand(this.level || 1);
    const distK = this.currentDistrict?.karota || 1;
    // KAROTA less frequent — checkpoints every ~1.5–2 min feel, not constant
    const karotaChance = 0.22 * (bandK.karota || 1) * distK *
      (this.roadSegment?.id === 'market' || this.roadSegment?.id === 'junction' || this.currentDistrict?.market ? 1.25 : 1);
    if (this.frame % 520 === 0 && this.dist > 1.2 && this.karotaTimer <= 0 && Math.random() < karotaChance) {
      this.startKarotaCheckpoint();
      return;
    }

    // Yan Daba — rare criminal ambush (not common)
    if (this.frame % 1800 === 0 && this.dist > 4 && Math.random() < 0.12) {
      this.startYanDaba();
      return;
    }

    // Traffic jam
    if (this.frame % 500 === 0 && Math.random() < 0.32 && this.trafficJamTimer <= 0 && this.dist > 1) {
      this.trafficJamTimer = 140;
      this.ui.showMissionToast('🚦 TRAFFIC JAM!');
      this.triggerShake(5, 3);
    }

    // Mud / bad road
    if (this.roadCondTimer > 0) this.roadCondTimer--;
    else this.roadCondition = 'clear';
    if (this.frame % 420 === 0 && Math.random() < 0.3 && this.roadCondTimer <= 0 && this.dist > 0.8) {
      this.roadCondition = Math.random() < 0.5 ? 'muddy' : 'bad';
      this.roadCondTimer = 130;
      this.ui.showMissionToast(this.roadCondition === 'muddy' ? '🟤 MUDDY ROAD!' : '⚠️ BAD ROAD!');
    }
    if (this.roadCondition === 'muddy') this.speed *= 0.97;
    if (this.roadCondition === 'bad') {
      this.speed *= 0.98;
      if (this.frame % 20 === 0) this.bounce = Math.max(this.bounce, 6);
      if (this.frame % 40 === 0 && this.speed > 2) {
        this.applyDamage('tyres', 1.2 + Math.random());
        if (this.damageTyres > 40 && this.frame % 80 === 0) {
          this.ui.showMissionToast('Tyres wearing on bad road');
        }
      }
    }

    // Gradual tire wear from speed + load + road
    if (this.speed > 1 && !this.puncture) {
      const wear = 0.008 * this.speed * (1 + this.paxOnBoard * 0.08) *
        (this.roadCondition === 'bad' ? 2.2 : this.roadCondition === 'muddy' ? 1.4 : 1);
      this.tireWearAccum = (this.tireWearAccum || 0) + wear;
      if (this.tireWearAccum >= 1) {
        const add = Math.floor(this.tireWearAccum);
        this.tireWearAccum -= add;
        this.applyDamage('tyres', add * 0.35);
      }
      // Puncture risk rises with tyre damage and bad road
      const risk = (this.damageTyres / 100) * 0.0015 *
        (this.roadCondition === 'bad' ? 3 : 1) *
        (this.speed > 6 ? 1.5 : 1);
      if (Math.random() < risk) {
        this.triggerPuncture(this.roadCondition === 'bad' ? 'nail / pothole' : 'worn tyre');
      }
    }

    // Flat tyre limp mode
    if (this.puncture) {
      this.speed = Math.min(this.speed, 2.8);
      if (this.frame % 50 === 0) this.bounce = Math.max(this.bounce, 8);
      if (this.frame % 100 === 0) this.ui.showMissionToast('Flat tyre — max crawl speed');
    }

    this.targetX = this.laneX(this.playerLane);
    this.playerX += (this.targetX - this.playerX) * 0.25;
    this.playerY = this.canvas.clientHeight - 195;

    // Dense Kano traffic — keep several vehicles on screen
    const chase = this.policeChase > 0;
    const peak = this.isPeakHour();
    const dens = this.currentDistrict?.traffic || 1;
    const spawnEvery = chase ? 14 : peak ? 18 : Math.max(12, Math.floor(22 / dens));
    const spawnChance = chase ? 0.95 : peak ? 0.9 : 0.75;
    const maxObs = 14;
    if (this.obs.length < maxObs && this.frame % spawnEvery === 0 && Math.random() < spawnChance && this.trafficJamTimer <= 0) {
      // Spawn 1–2 vehicles per tick when sparse
      const batch = this.obs.length < 5 ? 2 : 1;
      for (let b = 0; b < batch && this.obs.length < maxObs; b++) {
        let lane = Math.floor(Math.random() * 3);
        if (lane === this.playerLane && Math.random() < 0.4) lane = (lane + 1) % 3;
        if (!this.laneClear(lane, -80 - b * 40, 120)) continue;
        let types = ['car', 'keke', 'keke', 'taxi', 'motorcycle', 'motorcycle', 'bus', 'truck', 'police', 'karota', 'robber'];
        if (chase) types = ['police', 'karota', 'car', 'police', 'keke'];
        if (this.currentDistrict?.market) types.push('keke', 'motorcycle', 'taxi');
        if (this.currentDistrict?.industrial) types.push('truck', 'truck', 'bus');
        const type = types[Math.floor(Math.random() * types.length)];
        const roadMode = (CONFIG.ROAD_MODES && CONFIG.ROAD_MODES[this.selectedRoadMode]) || { oppositeChance: 0.35 };
        const opposite = roadMode.oppositeChance > 0 && Math.random() < roadMode.oppositeChance;
        this.obs.push({
          type,
          lane: opposite ? 0 : lane,
          y: -80 - b * 50 - Math.random() * 30,
          w: type === 'motorcycle' ? 36 : type === 'bus' || type === 'truck' ? 56 : 50,
          h: type === 'motorcycle' ? 50 : 70,
          speedOff: opposite ? 0.9 + Math.random() * 0.6 : -0.9 + Math.random() * 0.5,
          opposite: !!opposite,
          robber: type === 'robber',
          laneCooldown: 40 + Math.floor(Math.random() * 60)
        });
      }
    }

    // Highlighted pick-up checkpoints (green stop pads)
    if (this.frame % 90 === 0 && this.paxZones.length < 6) {
      const roll = Math.random();
      const sizes = ['normal', 'normal', 'normal', 'tall', 'fat', 'big'];
      const isPark = true; // marked stop pad = legal park
      const paxClass = pickPaxClass(this.level || 1);
      const dest = pickDestination(this.currentDistrict);
      this.paxZones.push({
        lane: Math.floor(Math.random() * 3),
        y: -90,
        taken: false,
        aishat: roll < 0.09,
        vip: paxClass.id === 'vip' || (roll >= 0.09 && roll < 0.14),
        paxClass: paxClass.id,
        paxClassName: paxClass.name,
        fareMult: paxClass.fareMult,
        dest,
        label: dest || 'Stop',
        seats: roll < 0.09 ? 2 : 1,
        size: sizes[Math.floor(Math.random() * sizes.length)],
        flagging: true,
        isPark,
        checkpoint: true
      });
    }
    // Yellow drop checkpoints — prefer destinations of onboard passengers
    if (this.frame % 110 === 0 && this.onboard.length > 0 && this.dropZones.length < 4) {
      // Match challenge: first onboard dest is the correct drop label
      const prefer = this.onboard[0]?.dest || pickDestination();
      const lanePref = this.gameMode === 'matchdrop'
        ? Math.round(this.playerLane || 1)
        : Math.floor(Math.random() * 3);
      this.dropZones.push({
        lane: lanePref,
        y: -90,
        used: false,
        akwai: true,
        dest: prefer,
        label: prefer || 'Akwai',
        checkpoint: true,
        mustMatch: this.gameMode === 'matchdrop'
      });
    }
    if (this.frame % 140 === 0 && Math.random() < 0.4) {
      this.coins.push({ lane: Math.floor(Math.random() * 3), y: -60, taken: false, bob: Math.random() * 6 });
    }
    // Fuel stations — more often in Fuel Challenge
    const fuelEvery = this.gameMode === 'fuel' ? 100 : 220;
    const fuelChance = this.gameMode === 'fuel' ? 0.72 : 0.28;
    if (this.frame % fuelEvery === 0 && Math.random() < fuelChance && (this.fuelPads || []).length < 3) {
      this.fuelPads = this.fuelPads || [];
      this.fuelPads.push({
        lane: Math.floor(Math.random() * 3),
        y: -70,
        taken: false,
        amount: this.gameMode === 'fuel' ? (18 + Math.floor(Math.random() * 16)) : (12 + Math.floor(Math.random() * 14))
      });
    }
    // Potholes on road
    this.potholes = this.potholes || [];
    const potEvery = this.gameMode === 'potholes' ? 70 : 160;
    const potChance = this.gameMode === 'potholes' ? 0.85 : 0.25;
    if (this.frame % potEvery === 0 && Math.random() < potChance && this.potholes.length < 5) {
      this.potholes.push({
        lane: Math.floor(Math.random() * 3),
        y: -50,
        hit: false
      });
    }
    // Occasional rich / luxury traffic
    if (this.frame % 200 === 0 && Math.random() < 0.35 && this.dist > 0.4) {
      this.obs.push({
        lane: Math.floor(Math.random() * 3),
        y: -100,
        w: 40,
        h: 55,
        type: Math.random() < 0.5 ? 'suv' : 'car',
        rich: true,
        plate: 'KN-' + (100 + Math.floor(Math.random() * 899)),
        speed: 0.85 + Math.random() * 0.3
      });
    }

    const mv = this.speed * 1.1;
    const h = this.canvas.clientHeight;

    // Traffic AI — stop / queue / overtake / merge (structure, not graphics)
    for (const o of this.obs) {
      let aheadDist = 9999;
      for (const other of this.obs) {
        if (other === o) continue;
        if (Math.round(other.lane) !== Math.round(o.lane)) continue;
        if (other.y > o.y) aheadDist = Math.min(aheadDist, other.y - o.y);
      }
      if (Math.round(o.lane) === this.playerLane && this.playerY > o.y) {
        aheadDist = Math.min(aheadDist, this.playerY - o.y);
      }
      let move = mv + (o.speedOff || 0);
      // Queue / stop
      if (aheadDist < 70) move *= 0.05;
      else if (aheadDist < 90) move *= 0.22;
      else if (aheadDist < 130) move *= 0.5;
      // Junction / market slowdown
      if (this.roadSegment?.id === 'junction' || this.roadSegment?.id === 'roundabout') move *= 0.7;
      if (this.roadSegment?.slow) move *= 0.65;
      if (this.worldEvent?.id === 'convoy') move *= 0.4;
      o.y += move;
      // Overtake / merge when blocked
      if (o.laneCooldown > 0) o.laneCooldown--;
      else if (aheadDist < 100 && Math.random() < 0.04) {
        const alt = Math.round(o.lane) === 0 ? 1 : Math.round(o.lane) === 2 ? 1 : (Math.random() < 0.5 ? 0 : 2);
        if (this.laneClear(alt, o.y - 40, 100)) {
          o.lane = alt;
          o.laneCooldown = 60 + Math.floor(Math.random() * 40);
        }
      }
      if (o.laneCooldown > 0) o.laneCooldown--;
      if (o.laneCooldown <= 0 && aheadDist < 120 && Math.random() < 0.04) {
        for (const dir of Math.random() < 0.5 ? [-1, 1] : [1, -1]) {
          const nl = Math.round(o.lane) + dir;
          if (nl < 0 || nl > 2) continue;
          if (!this.laneClear(nl, o.y, 110, o)) continue;
          if (nl === this.playerLane && Math.abs(o.y - this.playerY) < 100) continue;
          o.lane = nl;
          o.laneCooldown = 70;
          break;
        }
      }
      if (
        (o.type === 'police' || o.type === 'karota') &&
        Math.round(o.lane) === this.playerLane &&
        Math.abs(o.y - this.playerY) < 160 &&
        this.policeChase <= 0 &&
        Math.random() < 0.008
      ) {
        this.policeChase = 120;
        this.ui.showMissionToast(o.type === 'karota' ? '⚠️ KAROTA nearby!' : '🚨 Police nearby!');
        Audio.siren();
      }
    }
    this.obs = this.obs.filter((o) => o.y < h + 80);

    for (const p of this.paxZones) p.y += mv;
    this.paxZones = this.paxZones.filter((p) => p.y < h + 40 && !p.taken);
    for (const d of this.dropZones) d.y += mv;
    this.dropZones = this.dropZones.filter((d) => d.y < h + 40 && !d.used);
    for (const c of this.coins) {
      c.y += mv;
      c.bob += 0.1;
    }
    this.coins = this.coins.filter((c) => c.y < h + 40 && !c.taken);
    this.fuelPads = this.fuelPads || [];
    for (const f of this.fuelPads) f.y += mv;
    // Collect fuel — must be nearly stopped on same lane
    for (const f of this.fuelPads) {
      if (f.taken) continue;
      if (Math.round(f.lane) === Math.round(this.playerLane) && Math.abs(f.y - this.playerY) < 50) {
        if (this.speed > 1.6) {
          if (this.frame % 40 === 0) this.ui.showMissionToast('⛽ Brake at green fuel pad');
          continue;
        }
        f.taken = true;
        const add = f.amount || 15;
        this.fuel = Math.min(100, (this.fuel || 0) + add);
        this.fuelPickups = (this.fuelPickups || 0) + 1;
        this.score += 25;
        this.ui.showMissionToast('⛽ +' + add + '% fuel · tank ' + Math.floor(this.fuel) + '%');
        Audio.pickup?.();
      }
    }
    this.fuelPads = this.fuelPads.filter((f) => f.y < h + 40 && !f.taken);
    this.potholes = this.potholes || [];
    for (const pot of this.potholes) pot.y += mv;
    for (const pot of this.potholes) {
      if (pot.hit) continue;
      if (Math.round(pot.lane) === Math.round(this.playerLane) && Math.abs(pot.y - this.playerY) < 42) {
        if (this.speed > 1.2) {
          pot.hit = true;
          this.hitPothole();
        }
      }
    }
    this.potholes = this.potholes.filter((p) => p.y < h + 40 && !p.hit);

    // Collisions — only when obstacle is near the keke (not far ahead)
    if (this.inv <= 0 && this.speed > 0.5) {
      const pb = { x: this.playerX - 16, y: this.playerY - 28, w: 32, h: 48 };
      for (const o of this.obs) {
        // Ignore far traffic — must be close in screen Y
        const dy = Math.abs(o.y - this.playerY);
        if (dy > 55) continue;
        if (Math.round(o.lane) !== this.playerLane) continue;
        const ox = this.laneX(Math.round(o.lane)) - o.w / 2;
        if (this.rectHit(pb, { x: ox, y: o.y + 12, w: o.w * 0.7, h: o.h * 0.55 })) {
          if (o.robber || o.type === 'robber') {
            const theft = 80 + Math.floor(Math.random() * 180);
            this.score = Math.max(0, this.score - theft);
            this.ui.showMissionToast('Robber keke! -₦' + theft);
            Audio.alert();
            o.y = 9999;
            this.inv = 50;
            // Robbers never auto-end the run
            continue;
          }
          this.applyCollisionImpact(o);
          o.y += 80; // push away so no multi-hit
          this.inv = 45;
          // Only end run if keke is almost destroyed
          if (this.condition < 8) {
            this.gameOver();
            return;
          }
          continue;
        }
        if (
          this.nearMissCooldown <= 0 &&
          Math.round(o.lane) !== this.playerLane &&
          Math.abs(Math.round(o.lane) - this.playerLane) === 1 &&
          Math.abs(o.y - this.playerY) < 36
        ) {
          this.nearMissCooldown = 45;
          this.nearMissCount++;
          const nm = Math.floor(60 * (bonuses.nearMissBonus || 1));
          this.addCombo(2);
          this.score += nm;
          this.ui.showMissionToast('💨 Near miss! +₦' + nm);
        }
      }
    }

    // Pick up — nearly stop (real park), clear destination, less spam negotiate
    for (const p of this.paxZones) {
      if (p.taken) continue;
      if (Math.round(p.lane) === this.playerLane && Math.abs(p.y - this.playerY) < 48) {
        if (this.speed > 1.35) {
          if (this.frame % 50 === 0) this.ui.showMissionToast('Brake to stop · then load');
          continue;
        }
        if (this.pickupCooldown > 0) continue;
        if (this.paxOnBoard >= this.capacity) continue;
        // Illegal loading when park-only zone and not a marked park stop
        if (this.parkOnly && !p.isPark) {
          p.taken = true;
          if (Math.random() < 0.55) {
            this.ui.showMissionToast('KAROTA: No loading here!');
            Audio.alert();
            this.score = Math.max(0, this.score - (80 + Math.floor(Math.random() * 120)));
            // chance of full checkpoint
            if (Math.random() < 0.35) {
              this.startKarotaCheckpoint();
              return;
            }
          } else {
            // sneaky board
            p.agreedFare = 100 + Math.floor(Math.random() * 40);
            this.boardWaiting(p);
          }
          continue;
        }
        p.taken = true;
        // Rare negotiation only — most board at normal fare
        if (!p.aishat && !p.vip && Math.random() < 0.15) {
          this.startNegotiation(p);
          return;
        }
        const dest = p.dest || this.randomDest();
        p.dest = dest;
        p.agreedFare = p.vip ? 280 + Math.floor(Math.random() * 80) : p.aishat ? 450 + Math.floor(Math.random() * 100) : 130 + Math.floor(Math.random() * 50);
        this.boardWaiting(p);
      }
    }

    // Akwai drop zones — slow required
    for (const d of this.dropZones) {
      if (d.used) continue;
      if (
        Math.round(d.lane) === this.playerLane &&
        Math.abs(d.y - this.playerY) < 52 &&
        this.paxOnBoard > 0
      ) {
        if (this.speed > 2.2) {
          if (this.frame % 40 === 0) this.ui.showMissionToast('Akwai! Brake to drop');
          continue;
        }
        d.used = true;
        this.tryDropOff();
      }
    }

    for (const c of this.coins) {
      if (c.taken) continue;
      if (Math.hypot(this.playerX - this.laneX(c.lane), this.playerY - c.y) < 42) {
        c.taken = true;
        if (c.petrol) {
          this.fuel = Math.min(100, this.fuel + 45);
          this.ui.showMissionToast('⛽ Refueled');
          Audio.success();
          Audio.voiceRefuel();
        } else if (c.repair) {
          // Mechanic: pay from score for repair
          const cost = this.condition >= 85 ? 0 : 120 + Math.floor((100 - this.condition) * 3);
          if (cost === 0 && !this.puncture) {
            this.ui.showMissionToast('Mechanic: keke still fine');
          } else if (this.score >= cost || this.puncture) {
            const pay = this.puncture ? Math.max(cost, 150) : cost;
            if (this.score >= pay) {
              this.score -= pay;
              this.repairVehicle('full');
              this.ui.showMissionToast(
                (this.puncture ? '🔧 New tyre + repair — ₦' : '🔧 Repaired — ₦') + pay
              );
              Audio.success();
              Audio.speak('Tyres fixed. Keke ready.', { rate: 0.95 });
            } else {
              this.repairVehicle('tyres');
              this.score = Math.max(0, this.score - 80);
              this.ui.showMissionToast('🔧 Tyre only fixed — ₦80');
              Audio.success();
            }
          } else {
            this.repairVehicle('quick');
            this.ui.showMissionToast('🔧 Quick fix only — need ₦' + cost + ' for full');
            Audio.negotiate();
          }
        } else {
          this.score += 40;
          Audio.coin();
        }
      }
    }

    if (this.activeMission) {
      const m = this.activeMission;
      if (m.type === 'drop') m.progress = this.dropCount || 0;
      if (m.type === 'dist') m.progress = this.dist || 0;
      if (m.type === 'score') m.progress = this.score || 0;
      if (m.type === 'pax') m.progress = this.totalPax || 0;
      if (m.type === 'nearmiss') m.progress = this.nearMissCount || 0;
      const prog = Math.floor(Number(m.progress) || 0);
      const need = Number(m.target) || Number(m.n) || 10;
      const label = String(m.text || 'Mission').replace(/\s*\(\d+\/\d+\)\s*$/, '');
      this.ui.setMission(label + ' (' + prog + '/' + need + ')');
    }

    this.ui.updateHUD(this);
    this.ui.setFuel?.(this.fuel);
    this.ui.setZone?.(this.zoneType);
    this.ui.setCondition?.(this.condition);
    this.ui.setTyreStatus?.(this.puncture, this.damageTyres);
  }
}


export { DEVELOPER };
