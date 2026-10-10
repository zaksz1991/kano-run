/**
 * Kano Run 3D — Core game logic
 * Game Developer: Hassan Zakariya
 * Spec: real driving controls, intro sequence, passengers/destinations,
 * fare negotiation, KAROTA, traffic AI — preserves missions/storage/HUD.
 */
import { CONFIG, STATE, DEVELOPER } from './config.js';
import { Storage } from './storage.js';
import { Audio } from './audio.js';

export class Game {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = null;
    this.ui = null;
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
    // Evening/night slightly higher; midday lower competition
    const t = this.getTimeOfDay();
    if (t > 0.55) return 1.2;
    if (this.isPeakHour()) return 1.1;
    if (t > 0.25 && t < 0.4) return 0.9;
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
    // Skip intro always so the game never feels frozen
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
    this.roadOff = 0;
    this.playerLane = 1;
    this.inv = 0;
    this.bounce = 0;
    this.obs = [];
    this.paxZones = [];
    this.dropZones = [];
    this.coins = [];
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

    this.throttle = 0.7;
    this.speed = 3.5;
    this.state = STATE.PLAY;
    try { Audio.startEngine(); Audio.startRadioBed(); } catch (e) {}
    this.ui.showMissionToast('Driving! GAS = faster · BRAKE = stop');
    if (this.renderer3d) this.renderer3d.introPhase = 3;
    try { Storage.setSeenTutorial(); Storage.set('kanoSkipIntro', true); } catch (e) {}
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
      Audio.stopEngine();
      this.ui.showMissionToast('Paused');
      this.ui.setPauseUI(true);
    } else if (this.state === STATE.PAUSE) {
      this.state = STATE.PLAY;
      Audio.startEngine();
      this.ui.setPauseUI(false);
      this.ui.showMissionToast('Resumed');
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

  changeLane(dir) {
    if (this.state !== STATE.PLAY && this.state !== STATE.INTRO) return;
    const n = this.playerLane + dir;
    if (n >= 0 && n < CONFIG.LANES) {
      this.playerLane = n;
      this.bounce = 10;
    }
  }

  horn() {
    if (this.state !== STATE.PLAY) return;
    Audio.horn();
    this.inv = Math.max(this.inv, 18);
    for (const o of this.obs) {
      if (Math.round(o.lane) === this.playerLane && Math.abs(o.y - this.playerY) < 120) {
        o.y -= 36;
      }
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
      driver: this.getDriver().name
    });
    this.ui.showGameOver(this);
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
    const fare = p.agreedFare || (p.vip ? 350 : p.aishat ? 550 : 120);
    this.onboard.push({
      dest: p.dest || this.randomDest(),
      seats,
      fare,
      size: p.size || 'normal',
      name: p.aishat ? 'Aishat' : p.vip ? 'VIP' : 'Passenger'
    });
    let pick = fare;
    if (p.aishat && this.getBonuses().aishatBonus) pick += this.getBonuses().aishatBonus;
    this.score += Math.floor(pick * 0.25 * this.fareScale());
    this.addCombo(p.aishat ? 3 : p.vip ? 2 : 1);
    Audio.pickup();
    Audio.voicePickup();
    Audio.voiceSannu();
    this.pickupCooldown = 50;
    if (p.aishat) this.ui.showMissionToast('Aishat + Hibba → ' + (p.dest || 'town'));
    else if (p.size === 'big' || p.size === 'fat' || p.size === 'tall')
      this.ui.showMissionToast('Tight fit (' + p.size + ') → ' + (p.dest || '?') + ' · ₦' + fare);
    else this.ui.showMissionToast((p.vip ? 'VIP' : 'Passenger') + ' → ' + (p.dest || '?') + ' · ₦' + fare);
    return true;
  }

  startNegotiation(p) {
    this.state = STATE.EVENT;
    Audio.negotiate();
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
    if (this.speed > 2.2) {
      this.ui.showMissionToast('Akwai! Almost stop to drop');
      return;
    }
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
    // Destination match bonus — landmark / route name
    const marks = (route.landmarks || []).map(s => s.toLowerCase());
    const dest = (p.dest || '').toLowerCase();
    let bonusNote = '';
    if (dest && (marks.some(m => m.includes(dest.slice(0, 5)) || dest.includes(m.slice(0, 5))) ||
        (route.name || '').toLowerCase().includes(dest.slice(0, 5)))) {
      fare = Math.floor(fare * 1.35);
      bonusNote = ' ★ route match';
    }
    this.score += fare;
    this.destinationsServed = this.destinationsServed || [];
    this.destinationsServed.push(p.dest || 'stop');
    this.addCombo(2);
    Audio.pickup();
    Audio.voiceDrop();
    this.ui.showMissionToast('Akwai! (' + (p.dest || 'stop') + ') +₦' + fare + bonusNote);
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
    this.karotaTimer = 320;
    this.state = STATE.EVENT;
    this.throttle = 0;
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

  // ——— Main loop ———
  update() {
    if (this.state === STATE.START || this.state === STATE.OVER || this.state === STATE.EVENT) {
      if (this.shake > 0) this.shake--;
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

    // Forward motion: always crawl unless braking (endless-runner feel + gas boost)
    const loadFactor = 1 - Math.min(0.22, (this.paxOnBoard / Math.max(1, this.capacity)) * 0.22);
    const dmgFactor = 1 - Math.min(0.4, (100 - (this.condition || 100)) / 100 * 0.45);
    const tyreGrip = 1 - Math.min(0.25, (this.damageTyres || 0) / 100 * 0.25);
    const top = (7.2 * (route.difficulty || 1) + (bonuses.speed || 0) * 2.5) * loadFactor * dmgFactor;
    // Base cruise so the road always moves; GAS raises speed, BRAKE stops
    const baseCruise = this.braking ? 0 : 3.2;
    let targetSpeed = baseCruise + Math.max(0.35, this.throttle) * (top - baseCruise);
    if (this.braking) targetSpeed = 0;
    if (this.trafficJamTimer > 0) targetSpeed *= 0.5;
    if (this.parkOnly) targetSpeed = Math.min(targetSpeed, 3.8);
    if (this.getDriver().ability === 'ruffneck' && this.getTimeOfDay() > 0.55) targetSpeed += 0.3;
    const accel = (0.08 + this.throttle * 0.14) * loadFactor * this.weatherGrip * dmgFactor * (1 - (this.damageEngine || 0) / 280);
    if (this.speed < targetSpeed) this.speed += accel;
    else this.speed += (targetSpeed - this.speed) * 0.14;
    if (this.braking) this.speed *= 0.78 * this.weatherGrip * tyreGrip;
    // Fuel
    if (this.speed > 0.25) {
      this.fuel = Math.max(0, this.fuel - 0.008 * (0.4 + this.throttle + this.paxOnBoard * 0.03));
    }
    if (this.fuel <= 0) {
      this.speed = Math.min(this.speed, 2.2);
      if (this.frame % 70 === 0) this.ui.showMissionToast('Out of fuel — limp mode');
    } else if (this.fuel < 18 && this.frame % 100 === 0) {
      this.ui.showMissionToast('Low fuel — find petrol');
      Audio.voiceLowFuel();
    }
    this.speed = Math.max(0, Math.min(this.speed, 11));

    // Condition warnings
    if (this.condition < 25 && this.frame % 120 === 0) {
      this.ui.showMissionToast('Keke condition critical — find mechanic');
    } else if (this.condition < 50 && this.frame % 200 === 0) {
      this.ui.showMissionToast('Keke needs maintenance');
    }
    if (this.damageEngine > 60 && this.throttle > 0.5 && Math.random() < 0.02) {
      this.speed *= 0.75;
      this.ui.showMissionToast('Engine struggling');
      Audio.brake();
    }

    if (this.speed < 0.35) {
      this.stoppedFrames = (this.stoppedFrames || 0) + 1;
      if (this.stoppedFrames === 90) this.ui.showMissionToast('Waiting for passengers…');
    } else {
      this.stoppedFrames = 0;
    }
    if (this.pickupCooldown > 0) this.pickupCooldown--;

    // Stronger scroll so movement is clearly visible
    this.roadOff = (this.roadOff + this.speed * 3.2) % 58;
    this.dist += this.speed * 0.006;
    this.score += Math.floor(this.speed * 0.08 * this.getComboMultiplier() * (bonuses.scoreMult || 1));
    Audio.updateEngine(this.speed);

    // Weather grip
    const w = this.renderer3d?.weather || 'clear';
    if (w === 'rain') this.weatherGrip = 0.88;
    else if (w === 'harmattan') this.weatherGrip = 0.94;
    else this.weatherGrip = 1;

    // Level from distance
    const newLevel = 1 + Math.floor(this.dist / 2.5);
    if (newLevel > this.level) {
      this.level = newLevel;
      this.ui.showMissionToast('📶 Level ' + this.level);
      Audio.success();
      try { this.unlockKekeByProgress(); } catch (e) {}
    }
    this.ui.setLevel?.(this.level);
    this.ui.setOnboardDest?.(this.onboard);

    // Landmarks
    const marks = route.landmarks || [];
    if (marks.length && this.dist > (this.landmarkIndex + 1) * 2.5 && this.landmarkIndex < marks.length) {
      const name = marks[this.landmarkIndex++];
      this.ui.showMissionToast('📍 ' + name);
      Audio.success();
    }

    // KAROTA — common at junctions, markets, crowded roads (keke regulators)
    if (this.frame % 380 === 0 && this.dist > 0.8 && this.karotaTimer <= 0 && Math.random() < 0.55) {
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

    // Spawn traffic (denser during police chase)
    const chase = this.policeChase > 0;
    const peak = this.isPeakHour();
    const spawnEvery = chase ? 28 : peak ? 36 : 55;
    const spawnChance = chase ? 0.9 : peak ? 0.85 : 0.55;
    if (this.frame % spawnEvery === 0 && Math.random() < spawnChance && this.trafficJamTimer <= 0) {
      let lane = Math.floor(Math.random() * 3);
      if (lane === this.playerLane && Math.random() < 0.5) lane = (lane + 1) % 3;
      if (this.laneClear(lane, -80, 150)) {
        let types = ['car', 'keke', 'keke', 'taxi', 'bus', 'motorcycle', 'truck', 'police', 'karota', 'robber'];
        if (chase) types = ['police', 'karota', 'car', 'police', 'keke'];
        const type = types[Math.floor(Math.random() * types.length)];
        const roadMode = (CONFIG.ROAD_MODES && CONFIG.ROAD_MODES[this.selectedRoadMode]) || { oppositeChance: 0.35 };
        const opposite = roadMode.oppositeChance > 0 && Math.random() < roadMode.oppositeChance;
        this.obs.push({
          type,
          lane: opposite ? 0 : lane,
          y: -80,
          w: type === 'motorcycle' ? 36 : type === 'bus' || type === 'truck' ? 56 : 50,
          h: type === 'motorcycle' ? 50 : 70,
          speedOff: opposite ? 0.9 + Math.random() * 0.6 : -0.9 + Math.random() * 0.5,
          opposite: !!opposite,
          robber: type === 'robber',
          laneCooldown: 50 + Math.floor(Math.random() * 80)
        });
      }
    }

    // Waiting passengers (must slow to pick)
    if (this.frame % 100 === 0) {
      const roll = Math.random();
      const sizes = ['normal', 'normal', 'normal', 'tall', 'fat', 'big'];
      const isPark = Math.random() < 0.45 || this.parkOnly;
      this.paxZones.push({
        lane: Math.floor(Math.random() * 3),
        y: -90,
        taken: false,
        aishat: roll < 0.09,
        vip: roll >= 0.09 && roll < 0.2,
        dest: this.randomDest(),
        seats: roll < 0.09 ? 2 : 1,
        size: sizes[Math.floor(Math.random() * sizes.length)],
        flagging: true,
        isPark
      });
    }
    if (this.frame % 120 === 0) {
      this.dropZones.push({ lane: Math.floor(Math.random() * 3), y: -90, used: false, akwai: true });
    }
    if (this.frame % 140 === 0 && Math.random() < 0.4) {
      this.coins.push({ lane: Math.floor(Math.random() * 3), y: -60, taken: false, bob: Math.random() * 6 });
    }

    const mv = this.speed * 1.1;
    const h = this.canvas.clientHeight;

    // Traffic AI
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
      if (aheadDist < 90) move *= 0.22;
      else if (aheadDist < 130) move *= 0.5;
      o.y += move;
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

    // Collisions
    if (this.inv <= 0 && this.speed > 0.5) {
      const pb = { x: this.playerX - 20, y: this.playerY - 32, w: 40, h: 60 };
      for (const o of this.obs) {
        const ox = this.laneX(Math.round(o.lane)) - o.w / 2;
        if (this.rectHit(pb, { x: ox, y: o.y + 10, w: o.w * 0.85, h: o.h - 16 })) {
          if (o.robber || o.type === 'robber') {
            const theft = 100 + Math.floor(Math.random() * 250);
            this.score = Math.max(0, this.score - theft);
            this.ui.showMissionToast('Robber keke! -₦' + theft);
            Audio.alert();
            o.y = 9999;
            if (Math.random() < 0.35) {
              this.gameOver();
              return;
            }
            this.inv = 40;
            continue;
          }
          // Low-speed scrape survives; high-speed = crash
          if (this.speed < 2.2) {
            this.speed *= 0.5;
            this.score = Math.max(0, this.score - 30);
            this.applyDamage('body', 8 + Math.random() * 6);
            if (Math.random() < 0.12) this.applyDamage('tyres', 10);
            if (Math.random() < 0.06) this.triggerPuncture('scrape hit tyre');
            this.triggerShake(6, 3);
            Audio.brake();
            this.inv = 25;
            this.ui.showMissionToast('Scrape — body damage');
            o.y += 40;
            continue;
          }
          this.gameOver();
          return;
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

    // Pick up — must be SLOW; park rules in market/junction
    for (const p of this.paxZones) {
      if (p.taken) continue;
      if (Math.round(p.lane) === this.playerLane && Math.abs(p.y - this.playerY) < 52) {
        if (this.speed > 2.4) {
          if (this.frame % 40 === 0) this.ui.showMissionToast('Almost stop to load — like real park');
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
        if (!p.aishat && Math.random() < 0.32) {
          this.startNegotiation(p);
          return;
        }
        p.agreedFare = p.vip ? 300 + Math.floor(Math.random()*100) : p.aishat ? 400 + Math.floor(Math.random()*150) : 100 + Math.floor(Math.random() * 80);
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
      if (m.type === 'drop') m.progress = this.dropCount;
      if (m.type === 'dist') m.progress = this.dist;
      if (m.type === 'score') m.progress = this.score;
      if (m.type === 'pax') m.progress = this.totalPax;
      if (m.type === 'nearmiss') m.progress = this.nearMissCount || 0;
      this.ui.setMission(
        m.text + ' (' + Math.min(m.target, Math.floor(m.progress)) + '/' + m.target + ')'
      );
    }

    this.ui.updateHUD(this);
    this.ui.setFuel?.(this.fuel);
    this.ui.setZone?.(this.zoneType);
    this.ui.setCondition?.(this.condition);
    this.ui.setTyreStatus?.(this.puncture, this.damageTyres);
  }
}


export { DEVELOPER };
