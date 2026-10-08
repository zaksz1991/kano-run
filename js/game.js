// Core game logic
import { CONFIG, STATE } from './config.js';
import { Storage } from './storage.js';
import { Audio } from './audio.js';

export class Game {
  constructor(canvas, ui) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.ui = ui;
    this.dpr = 1;

    this.state = STATE.START;
    this.score = 0;
    this.dist = 0;
    this.paxOnBoard = 0;
    this.totalPax = 0;
    this.dropCount = 0;
    this.hornCount = 0;
    this.continuesLeft = 3;
    this.paidContinuesUsed = 0;
    this.combo = 0;
    this.comboTimer = 0;
    this.maxCombo = 0;
    this.nearMissCooldown = 0;
    this.shake = 0;
    this.shakeMag = 0;
    this.vipActive = false;
    this.trafficJamTimer = 0;
    this.karotaCheckpoint = 0;
    this.mudTimer = 0;
    this.roadCondition = 'normal';
    this.karotaCheckpoint = 0;
    this.mudTimer = 0;
    this.roadCondition = 'normal';
    this.lastmaTimer = 0;
    this.lastmaActive = false;
    this.lastmaTimer = 0;
    this.lastmaActive = false;
    this.vipActive = false;
    this.trafficJamTimer = 0;
    this.karotaCheckpoint = 0;
    this.mudTimer = 0;
    this.roadCondition = 'normal';
    this.karotaCheckpoint = 0;
    this.mudTimer = 0;
    this.roadCondition = 'normal';
    this.lastmaTimer = 0;
    this.lastmaActive = false;
    this.lastmaTimer = 0;
    this.lastmaActive = false;
    this.shake = 0;
    this.shakeMag = 0;
    this.vipActive = false;
    this.trafficJamTimer = 0;
    this.karotaCheckpoint = 0;
    this.mudTimer = 0;
    this.roadCondition = 'normal';
    this.karotaCheckpoint = 0;
    this.mudTimer = 0;
    this.roadCondition = 'normal';
    this.lastmaTimer = 0;
    this.lastmaActive = false;
    this.lastmaTimer = 0;
    this.lastmaActive = false;
    this.vipActive = false;
    this.trafficJamTimer = 0;
    this.karotaCheckpoint = 0;
    this.mudTimer = 0;
    this.roadCondition = 'normal';
    this.karotaCheckpoint = 0;
    this.mudTimer = 0;
    this.roadCondition = 'normal';
    this.lastmaTimer = 0;
    this.lastmaActive = false;
    this.lastmaTimer = 0;
    this.lastmaActive = false;

    this.speed = 3.6;
    this.frame = 0;
    this.roadOff = 0;
    this.playerLane = 1;
    this.playerX = 0;
    this.targetX = 0;
    this.playerY = 0;
    this.inv = 0;
    this.bounce = 0;
    this.wheelRot = 0;

    this.capacity = Storage.getCapacity();
    this.speedBoost = Storage.getSpeedBoost();
    this.hornPower = Storage.getHornPower();
    this.currentPaint = Storage.getPaint();
    this.driverStyle = Storage.getDriverStyle();
    this.selectedDriver = Storage.getSelectedDriver();
    this.selectedRoute = Storage.getSelectedRoute();
    this.currentRadio = Storage.getRadioStation();
    this.money = Storage.getMoney();
    this.high = Storage.getHighScore();
    this.eventCooldown = 0;
    this.karotaCooldown = 0;
    this.fareBonus = 0;
    this.driverAbility = 'none';
    this.obs = [];
    this.paxZones = [];
    this.dropZones = [];
    this.coins = [];
    this.particles = [];
    this.dust = [];
    this.weatherParticles = [];
    this.weather = 'clear';
    this.keys = {};
    this.mission = null;
  }

  driverSay(type) {
    const lines = CONFIG.DRIVER_REACTIONS && CONFIG.DRIVER_REACTIONS[type];
    if (!lines || !lines.length) return;
    const line = lines[Math.floor(Math.random() * lines.length)];
    const driver = CONFIG.DRIVERS[this.selectedDriver];
    const name = driver ? driver.name : 'Driver';
    this.ui.showMissionToast(`${name}: "${line}"`);
  }

  triggerShake(frames = 12, mag = 6) {
    this.shake = frames;
    this.shakeMag = mag;
  }

  addCombo(amount = 1) {
    this.combo += amount;
    this.comboTimer = 180;
    if (this.combo > this.maxCombo) this.maxCombo = this.combo;
    if (this.combo >= 5 && this.combo % 5 === 0) {
      this.ui.showMissionToast(`🔥 ${this.combo}x COMBO!`);
      Audio.missionComplete();
      if (Math.random() < 0.7) this.driverSay('combo');
    }
  }

  getComboMultiplier() {
    if (this.combo >= 20) return 2.5;
    if (this.combo >= 12) return 2.0;
    if (this.combo >= 7) return 1.6;
    if (this.combo >= 4) return 1.3;
    if (this.combo >= 2) return 1.15;
    return 1.0;
  }

  resize() {
    const r = this.canvas.parentElement.getBoundingClientRect();
    this.dpr = Math.min(devicePixelRatio || 1, 2);
    this.canvas.width = r.width * this.dpr;
    this.canvas.height = r.height * this.dpr;
    this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    this.canvas.style.width = r.width + 'px';
    this.canvas.style.height = r.height + 'px';
  }

  laneX(l) {
    const pad = 18;
    const lw = (this.canvas.clientWidth - pad * 2) / CONFIG.LANES;
    return pad + l * lw + lw / 2;
  }

  start() {
    this.state = STATE.PLAY;
    this.score = 0;
    this.dist = 0;
    this.paxOnBoard = 0;
    this.totalPax = 0;
    this.dropCount = 0;
    this.hornCount = 0;
    this.continuesLeft = 3;
    this.paidContinuesUsed = 0;
    this.combo = 0;
    this.comboTimer = 0;
    this.maxCombo = 0;
    this.nearMissCooldown = 0;
    this.shake = 0;
    this.shakeMag = 0;
    this.vipActive = false;
    this.trafficJamTimer = 0;
    this.karotaCheckpoint = 0;
    this.mudTimer = 0;
    this.roadCondition = 'normal';
    this.karotaCheckpoint = 0;
    this.mudTimer = 0;
    this.roadCondition = 'normal';
    this.lastmaTimer = 0;
    this.lastmaActive = false;
    this.lastmaTimer = 0;
    this.lastmaActive = false;
    this.vipActive = false;
    this.trafficJamTimer = 0;
    this.karotaCheckpoint = 0;
    this.mudTimer = 0;
    this.roadCondition = 'normal';
    this.karotaCheckpoint = 0;
    this.mudTimer = 0;
    this.roadCondition = 'normal';
    this.lastmaTimer = 0;
    this.lastmaActive = false;
    this.lastmaTimer = 0;
    this.lastmaActive = false;
    this.shake = 0;
    this.shakeMag = 0;
    this.vipActive = false;
    this.trafficJamTimer = 0;
    this.karotaCheckpoint = 0;
    this.mudTimer = 0;
    this.roadCondition = 'normal';
    this.karotaCheckpoint = 0;
    this.mudTimer = 0;
    this.roadCondition = 'normal';
    this.lastmaTimer = 0;
    this.lastmaActive = false;
    this.lastmaTimer = 0;
    this.lastmaActive = false;
    this.vipActive = false;
    this.trafficJamTimer = 0;
    this.karotaCheckpoint = 0;
    this.mudTimer = 0;
    this.roadCondition = 'normal';
    this.karotaCheckpoint = 0;
    this.mudTimer = 0;
    this.roadCondition = 'normal';
    this.lastmaTimer = 0;
    this.lastmaActive = false;
    this.lastmaTimer = 0;
    this.lastmaActive = false;
    this.speed = 3.6 + this.speedBoost * 0.35;
    this.frame = 0;
    this.playerLane = 1;
    this.inv = 0;
    this.bounce = 0;
    this.obs = [];
    this.paxZones = [];
    this.dropZones = [];
    this.coins = [];
    this.particles = [];
    this.dust = [];
    this.weatherParticles = [];
    this.roadOff = 0;
    this.landmarkT = 0;
    this.wheelRot = 0;
    this.weather = 'clear';
    this.weatherTimer = 0;
    this.capacity = Storage.getCapacity();
    this.applyDriverBonuses();

    this.activeMission = {
      ...CONFIG.MISSIONS[Math.floor(Math.random() * CONFIG.MISSIONS.length)],
      progress: 0
    };

    this.ui.showPlaying();
    this.ui.setMission(this.activeMission.text);
    this.ui.setWeather(CONFIG.WEATHER.clear);
    if (this.radioOn) this.ui.showRadio(true);

    Audio.startEngine();
    this.initDaily();
    this.ui.updateHUD(this);
    this.ui.updateDailyUI(this);
  }

  gameOver() {
    Audio.crash();
    this.triggerShake(18, 9);

    this.state = STATE.EVENT;

    if (this.continuesLeft > 0) {
      // Free Life Savers remaining
      this.ui.showEvent(
        '💥 CRASHED!',
        `You still have ${this.continuesLeft} free Life Saver${this.continuesLeft > 1 ? 's' : ''} left.\nContinue from here?`,
        [
          {
            label: `Use Free Life Saver (${this.continuesLeft} left)`,
            action: () => this.useContinue(false)
          },
          {
            label: 'End Run',
            action: () => this.finalGameOver()
          }
        ]
      );
    } else {
      // No free lives left — offer paid continue
      const cost = this.getContinueCost();
      const canAfford = this.score >= cost;

      this.ui.showEvent(
        '💥 CRASHED! No Free Lives Left',
        canAfford
          ? `Pay ₦${cost.toLocaleString()} from your score to get another Life Saver?`
          : `You need ₦${cost.toLocaleString()} to buy another Life Saver.\nYou only have ₦${this.score.toLocaleString()}.`,
        canAfford
          ? [
              {
                label: `Pay ₦${cost.toLocaleString()} & Continue`,
                action: () => this.useContinue(true)
              },
              {
                label: 'End Run',
                action: () => this.finalGameOver()
              }
            ]
          : [
              {
                label: 'End Run',
                action: () => this.finalGameOver()
              }
            ]
      );
    }
  }

  getContinueCost() {
    const paidUsed = this.paidContinuesUsed || 0;
    return 350 + (paidUsed * 200);
  }

  useContinue(isPaid) {
    try {
      if (isPaid) {
        const cost = this.getContinueCost();
        if (this.score < cost) {
          this.ui.showMissionToast('Not enough score to continue');
          this.finalGameOver();
          return;
        }
        this.score -= cost;
        this.paidContinuesUsed = (this.paidContinuesUsed || 0) + 1;
        this.continuesLeft = 1; // grant one life back for HUD
        this.ui.showMissionToast(`Paid ₦${cost.toLocaleString()} — continue!`);
      } else {
        this.continuesLeft = Math.max(0, this.continuesLeft - 1);
        this.score = Math.max(0, this.score - 80);
      }

      this.inv = 120;
      this.obs = [];
      this.speed = Math.min(this.speed, 6.5); // calm speed after continue
      this.paxZones = this.paxZones.filter(p => p.y > this.playerY - 80);
      this.dropZones = this.dropZones.filter(d => d.y > this.playerY - 80);
      this.ui.hideEvent();
      this.state = STATE.PLAY;
      this.ui.showPlaying();
      this.ui.updateHUD(this);
      Audio.startEngine();
    } catch (e) {
      console.error('useContinue error', e);
      this.finalGameOver();
    }
  }

  finalGameOver() {
    this.state = STATE.OVER;
    Audio.stopEngine();

    this.money += Math.floor(this.score * 0.2);
    Storage.setMoney(this.money);

    if (this.score > this.high) {
      this.high = this.score;
      Storage.setHighScore(this.high);
    }

    this.ui.showGameOver(this);
  }

  changeLane(dir) {
    const next = this.playerLane + dir;
    if (next >= 0 && next < CONFIG.LANES) {
      this.playerLane = next;
      this.bounce = 10;
      Audio.laneChange();
    }
  }

  horn() {
    if (this.state !== STATE.PLAY) return;
    const range = 170 + this.hornPower * 45;

    this.obs = this.obs.filter(o => {
      if (Math.round(o.lane) === this.playerLane && Math.abs(o.y - this.playerY) < range) {
        this.score += 55;
        this.spawnParticles(this.laneX(o.lane), o.y + 30, '#fbbf24', 9);
        return false;
      }
      return true;
    });

    this.inv = (this.driverAbility === "ruffneck" ? 40 : this.driverAbility === "ghost" ? 32 : (this.driverAbility === "careful" ? 26 : 18)) + this.hornPower * 5;
    this.hornCount++;
    if (this.activeMission?.id === 'horn3') {
      this.activeMission.progress = this.hornCount;
      this.checkMission();
    }
    Audio.horn(this.hornPower);
  }

  toggleRadio() {
    this.radioOn = !this.radioOn;
    this.ui.showRadio(this.radioOn);
    if (this.radioOn) Audio.radioOn();
  }

  spawnParticles(x, y, color, n = 6) {
    for (let i = 0; i < n; i++) {
      this.particles.push({
        x, y,
        vx: (Math.random() - 0.5) * 6.5,
        vy: (Math.random() - 0.5) * 6 - 2,
        life: 24 + Math.random() * 22,
        max: 46,
        color,
        size: 2.4 + Math.random() * 3.8
      });
    }
  }

  spawnDust(x, y) {
    this.dust.push({
      x: x + (Math.random() - 0.5) * 22,
      y: y + 22,
      vx: (Math.random() - 0.5) * 1.8,
      vy: -0.6 - Math.random() * 1.2,
      life: 18 + Math.random() * 16,
      size: 2.5 + Math.random() * 4
    });
  }

  updateWeather() {
    this.weatherTimer++;
    if (this.weatherTimer > 450) {
      this.weatherTimer = 0;
      const r = Math.random();
      if (r < 0.55) this.weather = 'clear';
      else if (r < 0.8) this.weather = 'dust';
      else this.weather = 'haze';
      this.ui.setWeather(CONFIG.WEATHER[this.weather]);
    }

    if (this.weather === 'dust' && this.frame % 3 === 0) {
      this.weatherParticles.push({
        x: Math.random() * this.canvas.clientWidth,
        y: -10,
        vx: -1.2 - Math.random() * 1.5,
        vy: 1.5 + Math.random() * 2,
        life: 60 + Math.random() * 40,
        size: 1.5 + Math.random() * 2.5
      });
    }
    if (this.weather === 'haze' && this.frame % 8 === 0) {
      this.weatherParticles.push({
        x: Math.random() * this.canvas.clientWidth,
        y: Math.random() * this.canvas.clientHeight * 0.5,
        vx: -0.3,
        vy: 0.2,
        life: 80,
        size: 8 + Math.random() * 12,
        haze: true
      });
    }

    this.weatherParticles.forEach(p => {
      p.x += p.vx;
      p.y += p.vy;
      p.life--;
    });
    this.weatherParticles = this.weatherParticles.filter(p => p.life > 0);
  }

  checkMission() {
    if (!this.activeMission) return;

    const m = this.activeMission;
    if (m.id === 'pax5') m.progress = this.totalPax;
    if (m.id === 'dist3') m.progress = this.dist;
    if (m.id === 'score2k') m.progress = this.score;
    if (m.id === 'horn3') m.progress = this.hornCount;
    if (m.id === 'drop10') m.progress = this.dropCount;

    if (m.progress >= m.target) {
      this.score += m.reward;
      this.ui.showMissionToast(`Mission complete! +₦${m.reward}`);
      Audio.missionComplete();
      this.activeMission = null;
      this.ui.setMission('Mission done!');
    } else {
      this.ui.setMission(`${m.text} (${Math.floor(m.progress)}/${m.target})`);
    }
  }

  update(dt) {
    if (this.state !== STATE.PLAY) return;

    this.frame++;
    if (this.inv > 0) this.inv--;
    if (this.bounce > 0) this.bounce--;

    const baseTop = 8.5 + this.speedBoost * 0.7 + (this.driverAbility === "aggressive" ? 0.4 : 0);
    this.speed = Math.min(baseTop, 3.8 + this.speedBoost * 0.4 + this.dist * 0.025);
    this.roadOff = (this.roadOff + this.speed * 2.15) % 58;
    this.dist += this.speed * 0.0069;
    this.score += Math.floor(this.speed * 0.28);
    this.wheelRot += this.speed * 0.28;

    Audio.updateEngine(this.speed);
    this.updateWeather();
    this.applyAbilityEffects();
    if (this.trafficJamTimer > 0) {
      this.trafficJamTimer--;
      this.speed *= 0.72;
    }

    // LASTMA checkpoint logic
    if (this.lastmaTimer > 0) {
      this.lastmaTimer--;
      if (this.lastmaActive && this.speed > 9.5) {
        // Speeding through checkpoint → fine
        this.lastmaActive = false;
        const fine = 350 + Math.floor(Math.random() * 250);
        this.score = Math.max(0, this.score - fine);
        this.ui.showMissionToast(`🚨 LASTMA FINE! -₦${fine}`);
        this.triggerShake(14, 7);
        Audio.crash();
      }
      if (this.lastmaTimer <= 0 && this.lastmaActive) {
        // Successfully slowed down
        this.lastmaActive = false;
        this.score += 180;
        this.ui.showMissionToast('✅ Checkpoint cleared! +₦180');
        Audio.coin();
      }
    }
    if (this.comboTimer > 0) {
      this.comboTimer--;
      if (this.comboTimer <= 0) this.combo = 0;
    }
    if (this.nearMissCooldown > 0) this.nearMissCooldown--;
    if (this.shake > 0) this.shake--;
    if (this.eventCooldown > 0) this.eventCooldown--;
    if (this.karotaCooldown > 0) this.karotaCooldown--;
    this.tryTriggerEvent();
    if (this.frame % 180 === 0) this.spawnEnforcer();

    this.targetX = this.laneX(this.playerLane);
    this.playerX += (this.targetX - this.playerX) * 0.24;
    this.playerY = this.canvas.clientHeight - 195 +
      (this.bounce > 0 ? Math.sin(this.bounce * 0.85) * 3.2 : 0);

    if (this.frame % 5 === 0) this.spawnDust(this.playerX, this.playerY);

    // Spawns
    if (this.frame % Math.max(17, 46 - Math.floor(this.speed * 2.3)) === 0 && Math.random() < 0.76) {
      const lane = Math.floor(Math.random() * 3);
      this.obs.push({
        lane, targetLane: lane,
        y: -105,
        type: Math.random() < 0.57 ? 'keke' : (Math.random() < 0.55 ? 'car' : 'cart'),
        w: 48, h: 64,
        speedOff: (Math.random() - 0.5) * 0.9,
        laneChangeTimer: 90 + Math.random() * 130
      });
    }
    if (this.frame % (this.driverAbility === "popular" ? 65 : 90) === 0) {
      const isVIP = Math.random() < 0.11;
      let pType = CONFIG.PASSENGER_TYPES[Math.floor(Math.random() * CONFIG.PASSENGER_TYPES.length)];

      // Mayen Mata: strongly prefer female passengers
      if (this.driverAbility === 'women_only') {
        const females = CONFIG.PASSENGER_TYPES.filter(t => t.gender === 'female');
        if (Math.random() < 0.85 && females.length) {
          pType = females[Math.floor(Math.random() * females.length)];
        }
      }

      // Uztaz: avoid low-pay female types more often
      if (this.driverAbility === 'careful_women' && pType.lowPay && Math.random() < 0.7) {
        const safe = CONFIG.PASSENGER_TYPES.filter(t => !t.lowPay);
        pType = safe[Math.floor(Math.random() * safe.length)];
      }

      this.paxZones.push({
        lane: Math.floor(Math.random() * 3),
        y: -85,
        taken: false,
        vip: isVIP,
        pType: isVIP ? null : pType
      });
    }

    // Special: Aishat + daughter Hibba (popular passengers)
    if (this.frame % 380 === 0 && Math.random() < 0.55) {
      this.paxZones.push({
        lane: Math.floor(Math.random() * 3),
        y: -90,
        taken: false,
        vip: false,
        aishat: true,
        pType: { id: 'aishat', label: 'Aishat', color: '#f472b6', fareMult: 1.5, gender: 'female' }
      });
    }

    // Traffic jam
    if (this.frame % 520 === 0 && Math.random() < 0.4 && this.trafficJamTimer <= 0) {
      this.trafficJamTimer = 160;
      this.ui.showMissionToast('🚦 TRAFFIC JAM! Slow down!');
      this.triggerShake(8, 3);
    }

    // KAROTA Checkpoint
    if (this.frame % 680 === 0 && Math.random() < 0.45 && this.karotaCheckpoint <= 0) {
      this.karotaCheckpoint = 200;
      this.triggerShake(10, 5);
      this.startKarotaCheckpoint();
    }

    // Muddy / bad road sections
    if (this.frame % 400 === 0 && Math.random() < 0.35 && this.mudTimer <= 0) {
      this.mudTimer = 140;
      this.roadCondition = Math.random() < 0.5 ? 'muddy' : 'bad';
      this.ui.showMissionToast(this.roadCondition === 'muddy' ? '🟤 MUDDY ROAD!' : '⚠️ BAD ROAD!');
    }

    // LASTMA Checkpoint
    if (this.frame % 680 === 0 && Math.random() < 0.35 && this.lastmaTimer <= 0 && this.dist > 1.2) {
      this.lastmaTimer = 200;
      this.lastmaActive = true;
      this.ui.showMissionToast('🚨 LASTMA CHECKPOINT! Slow down or get fined!');
      this.triggerShake(10, 4);
    }
    if (this.frame % 115 === 0) this.dropZones.push({ lane: Math.floor(Math.random() * 3), y: -85, used: false });
    if (this.frame % 62 === 0) this.coins.push({ lane: Math.floor(Math.random() * 3), y: -55, taken: false, bob: Math.random() * Math.PI * 2 });

    const mv = this.speed * 1.15;

    // Move obstacles with simple AI
    for (const o of this.obs) {
      o.y += mv + o.speedOff;
      o.laneChangeTimer--;
      if (o.laneChangeTimer <= 0 && Math.random() < 0.28) {
        const dir = Math.random() < 0.5 ? -1 : 1;
        const nl = Math.round(o.lane) + dir;
        if (nl >= 0 && nl < 3) o.targetLane = nl;
        o.laneChangeTimer = 110 + Math.random() * 110;
      }
      if (o.lane !== o.targetLane) {
        o.lane += (o.targetLane - o.lane) * 0.07;
        if (Math.abs(o.lane - o.targetLane) < 0.04) o.lane = o.targetLane;
      }
    }

    this.paxZones.forEach(p => p.y += mv);
    this.dropZones.forEach(d => d.y += mv);
    this.coins.forEach(c => { c.y += mv; c.bob += 0.13; });

    this.particles.forEach(p => { p.x += p.vx; p.y += p.vy; p.vy += 0.09; p.life--; });
    this.particles = this.particles.filter(p => p.life > 0);
    this.dust.forEach(d => { d.x += d.vx; d.y += d.vy; d.life--; });
    this.dust = this.dust.filter(d => d.life > 0);

    const h = this.canvas.clientHeight;
    this.obs = this.obs.filter(o => o.y < h + 75);
    this.paxZones = this.paxZones.filter(p => p.y < h + 55 && !p.taken);
    this.dropZones = this.dropZones.filter(d => d.y < h + 55 && !d.used);
    this.coins = this.coins.filter(c => c.y < h + 45 && !c.taken);

    // Collisions
    const pb = { x: this.playerX - 25, y: this.playerY - 40, w: 50, h: 76 };

    if (this.inv <= 0) {
      for (const o of this.obs) {
        const ox = this.laneX(Math.round(o.lane)) - o.w / 2;
        if (this.rectHit(pb, { x: ox, y: o.y, w: o.w, h: o.h })) {
          this.spawnParticles(this.playerX, this.playerY, '#ef4444', 16);
          this.gameOver();
          return;
        }
      }
    }

    for (const p of this.paxZones) {
      if (p.taken || this.paxOnBoard >= this.capacity) continue;
      const px = this.laneX(p.lane) - 24;
      if (this.rectHit(pb, { x: px, y: p.y, w: 48, h: 48 })) {
        // Aishat + Hibba special pickup
        if (p.aishat) {
          p.taken = true;
          // Mother + child take 2 seats if capacity allows
          const seats = Math.min(2, Math.max(1, this.capacity - this.paxOnBoard));
          this.paxOnBoard = Math.min(this.capacity, this.paxOnBoard + seats);
          this.totalPax += seats;
          this.score += 550;
          this.spawnParticles(this.laneX(p.lane), p.y + 22, '#f472b6', 14);
          this.spawnParticles(this.laneX(p.lane), p.y + 10, '#fde68a', 10);
          this.addCombo(3);
          const line = (CONFIG.AISHAT_LINES && CONFIG.AISHAT_LINES.length)
            ? CONFIG.AISHAT_LINES[Math.floor(Math.random() * CONFIG.AISHAT_LINES.length)]
            : 'Aishat & Hibba boarded!';
          this.ui.showMissionToast('👩‍👧 ' + line);
          this.ui.showMissionToast('Aishat + Hibba! +₦550');
          Audio.pickup();
          this.checkMission();
          return;
        }

        // Mayen Mata refuses male passengers
        if (this.driverAbility === 'women_only' && p.pType && p.pType.gender === 'male' && !p.vip) {
          p.taken = true; // remove zone
          this.ui.showMissionToast('Mayen Mata: "I no dey carry man!"');
          this.spawnParticles(this.laneX(p.lane), p.y + 22, '#f87171', 6);
          return;
        }

        p.taken = true;
        this.paxOnBoard++;
        this.totalPax++;

        if (p.vip) {
          this.score += 420;
          this.spawnParticles(this.laneX(p.lane), p.y + 22, '#fbbf24', 16);
          this.spawnParticles(this.laneX(p.lane), p.y + 10, '#f97316', 10);
          this.ui.showMissionToast('👑 VIP PASSENGER! +₦420');
          this.addCombo(2);
          const vipLine = CONFIG.VIP_LINES[Math.floor(Math.random() * CONFIG.VIP_LINES.length)];
          this.ui.showMissionToast(vipLine);
        } else if (p.pType && p.pType.lowPay) {
          // Female passengers who want to pay little or nothing
          const mult = p.pType.fareMult || 0;
          const pay = Math.floor(150 * mult);
          this.score += pay;
          this.spawnParticles(this.laneX(p.lane), p.y + 22, '#f87171', 8);
          if (pay === 0) {
            this.ui.showMissionToast('Passenger: "Abeg, I no get change" (₦0)');
          } else {
            this.ui.showMissionToast(`Passenger: "I only get ₦${pay}"`);
          }
          this.addCombo(1);
          // Small chance of argument unless Uztaz
          if (this.driverAbility !== 'careful_women' && Math.random() < 0.35) {
            this.ui.showMissionToast('Driver: "Haba! At least give something!"');
          }
        } else {
          const mult = (p.pType && p.pType.fareMult) ? p.pType.fareMult : 1;
          this.score += Math.floor(150 * mult);
          this.spawnParticles(this.laneX(p.lane), p.y + 22, (p.pType && p.pType.color) || '#4ade80', 8);
          this.addCombo(1);
        }
        Audio.pickup();
        if (Math.random() < 0.45) this.driverSay('pickup');
        this.checkMission();
      }
    }

    for (const d of this.dropZones) {
      if (d.used || this.paxOnBoard <= 0) continue;
      const dx = this.laneX(d.lane) - 24;
      if (this.rectHit(pb, { x: dx, y: d.y, w: 48, h: 48 })) {
        d.used = true;
        const dropped = this.paxOnBoard;
        this.paxOnBoard = 0;
        this.dropCount += dropped;
        const mult = this.getComboMultiplier();
        this.score += Math.floor(dropped * 290 * (1 + (this.fareBonus || 0)) * mult);
        this.addCombo(dropped);
        if (Math.random() < 0.5) this.driverSay('drop');
        const pCount = 12 + Math.min(this.combo, 20);
        this.spawnParticles(this.laneX(d.lane), d.y + 22, '#fbbf24', pCount);
        if (this.combo >= 8) this.spawnParticles(this.playerX, this.playerY, '#f97316', 10);
        Audio.drop();
        this.checkMission();
      }
    }

    for (const c of this.coins) {
      if (c.taken) continue;
      if (Math.hypot(this.playerX - this.laneX(c.lane), this.playerY - c.y) < 43) {
        c.taken = true;
        this.score += 75;
        this.spawnParticles(this.laneX(c.lane), c.y, '#fbbf24', 7);
        Audio.coin();
      }
    }

    // Landmarks
    this.landmarkT++;
    if (this.landmarkT > 310) {
      this.landmarkT = 0;
      const name = CONFIG.LANDMARKS[Math.floor(Math.random() * CONFIG.LANDMARKS.length)];
      this.ui.showLandmark(name);
    }

    this.checkMission();
    this.updateDailyProgress();
    this.checkNearMiss();
    this.ui.updateHUD(this);
  }

  cycleRadio() {
    const stations = CONFIG.RADIO_STATIONS;
    const idx = stations.findIndex(s => s.id === this.currentRadio);
    const next = stations[(idx + 1) % stations.length];
    this.currentRadio = next.id;
    Storage.setRadioStation(next.id);
    this.radioOn = true;
    this.ui.showRadio(true);
    this.ui.updateRadioBar();
    Audio.radioOn();
  }

  // Trigger random negotiation or payment event
  tryTriggerEvent() {
    if (this.eventCooldown > 0 || this.state !== STATE.PLAY) return;
    if (this.paxOnBoard > 0 && Math.random() < 0.008) {
      this.eventCooldown = 400;
      const isDisagree = Math.random() < (this.driverAbility === "smooth_talker" ? 0.18 : 0.4);
      if (isDisagree) {
        const line = CONFIG.NEGOTIATION.disagreement[Math.floor(Math.random()*CONFIG.NEGOTIATION.disagreement.length)];
        this.ui.showEvent('Payment Disagreement', line, [
          { label: 'Accept lower fare (-₦50)', action: () => { this.score = Math.max(0, this.score - 50); } },
          { label: 'Force full payment', action: () => { this.score += 80; } },
          { label: 'Kick passenger out', action: () => { this.paxOnBoard = Math.max(0, this.paxOnBoard - 1); } }
        ]);
      } else {
        const pLine = CONFIG.NEGOTIATION.passenger[Math.floor(Math.random()*CONFIG.NEGOTIATION.passenger.length)];
        const dLine = CONFIG.NEGOTIATION.driver[Math.floor(Math.random()*CONFIG.NEGOTIATION.driver.length)];
        this.ui.showEvent('Passenger Negotiation', pLine + '\n\nDriver: ' + dLine, [
          { label: 'Agree & continue', action: () => { this.score += 40; } },
          { label: 'Haggle harder', action: () => { this.score += Math.random() > 0.5 ? 90 : -20; } }
        ]);
      }
    }
  }

  // Spawn KAROTA / Police as special obstacles
  spawnEnforcer() {
    if (this.karotaCooldown > 0) return;
    if (Math.random() < 0.15) {
      this.karotaCooldown = 300;
      const lane = Math.floor(Math.random() * 3);
      this.obs.push({
        lane, targetLane: lane,
        y: -110,
        type: Math.random() < 0.6 ? 'karota' : 'police',
        w: 50, h: 68,
        speedOff: -0.3,
        laneChangeTimer: 999,
        isEnforcer: true
      });
    }
  }

  checkNearMiss() {
    if (this.nearMissCooldown > 0 || this.inv > 0) return;
    const pb = { x: this.playerX - 28, y: this.playerY - 45, w: 56, h: 85 };
    for (const o of this.obs) {
      const ox = this.laneX(Math.round(o.lane)) - o.w / 2;
      const dist = Math.abs((ox + o.w/2) - this.playerX) + Math.abs((o.y + o.h/2) - this.playerY);
      // Close but not hitting
      if (dist < 95 && dist > 55 && Math.round(o.lane) === this.playerLane) {
        this.nearMissCooldown = 40;
        this.score += Math.floor(60 * this.getComboMultiplier());
        this.addCombo(1);
        this.spawnParticles(this.playerX, this.playerY - 20, '#38bdf8', 8);
        this.ui.showMissionToast('NEAR MISS! +₦' + Math.floor(60 * this.getComboMultiplier()));
        this.triggerShake(6, 3);
        if (Math.random() < 0.6) this.driverSay('nearMiss');
        Audio.coin();
        break;
      }
    }
  }

  rectHit(a, b) {
    return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
  }

  getTimeOfDay() {
    return Math.min(1, this.dist / 7.2);
  }

  // ========== DAILY MISSIONS & STREAK ==========
  getToday() {
    return new Date().toISOString().slice(0, 10);
  }

  applyDriverBonuses() {
    const driver = CONFIG.DRIVERS[this.selectedDriver] || CONFIG.DRIVERS.musa;
    const bonus = driver.bonus || {};
    this.capacity = (Storage.getCapacity() || 3) + (bonus.capacity || 0);
    this.speedBoost = (Storage.getSpeedBoost() || 0) + (bonus.speed || 0);
    this.hornPower = (Storage.getHornPower() || 0) + (bonus.horn || 0);
    this.fareBonus = bonus.fareBonus || 0;
    this.driverAbility = driver.ability || 'none';
    if (this.driverAbility === 'efficient' && this.score < 50) {
      this.score += 80;
    }
  }

  applyAbilityEffects() {
    const ability = this.driverAbility || 'none';
    if (ability === 'night_owl' && this.getTimeOfDay() > 0.55) {
      this.speed = Math.min(this.speed + 0.35, 14);
    }
    if ((ability === 'dust_proof' || ability === 'focused') && (this.weather === 'dust' || this.weather === 'haze')) {
      this.speed = Math.min(this.speed + 0.28, 13.5);
    }
    if (ability === 'chaos_bonus' && ['sabongari', 'fajir', 'gwale'].includes(this.selectedRoute)) {
      if (this.frame % 40 === 0) this.score += 8;
    }
    if (ability === 'route_master' && ['zoo', 'panshekara', 'kumbotso'].includes(this.selectedRoute)) {
      if (this.frame % 50 === 0) this.score += 6;
    }
    if (ability === 'careful') {
      this.speed = Math.max(3.8, this.speed * 0.97);
    }
    if (ability === 'eager' && this.frame % 30 === 0) {
      this.speed = Math.min(this.speed + 0.08, 13.8);
    }
    if (ability === 'ruffneck') {
      if (this.frame % 25 === 0) this.score += 12;
      this.speed = Math.min(this.speed + 0.03, 9.2);
      if (this.getTimeOfDay() > 0.55) this.speed = Math.min(this.speed + 0.08, 9.2);
    }
  }

  initDaily() {
    const today = this.getToday();
    const storedDate = Storage.getDailyDate();

    if (storedDate !== today) {
      // New day — pick a random daily mission
      const missions = CONFIG.DAILY_MISSIONS;
      const pick = missions[Math.floor(Math.random() * missions.length)];
      Storage.setDailyDate(today);
      Storage.setDailyMissionId(pick.id);
      Storage.setDailyProgress(0);
      Storage.setDailyClaimed(false);
      this.dailyMission = { ...pick, progress: 0 };
    } else {
      const id = Storage.getDailyMissionId();
      const m = CONFIG.DAILY_MISSIONS.find(x => x.id === id) || CONFIG.DAILY_MISSIONS[0];
      this.dailyMission = {
        ...m,
        progress: Storage.getDailyProgress()
      };
    }

    // Streak check
    const last = Storage.getLastPlayDate();
    if (last !== today) {
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      const yStr = yesterday.toISOString().slice(0, 10);
      if (last === yStr) {
        Storage.setStreak(Storage.getStreak() + 1);
      } else if (last !== today) {
        Storage.setStreak(1);
      }
      Storage.setLastPlayDate(today);
    }
    this.streak = Storage.getStreak();
  }

  updateDailyProgress() {
    if (!this.dailyMission || Storage.isDailyClaimed()) return;

    const m = this.dailyMission;
    let prog = m.progress;

    if (m.type === 'pax') prog = Math.max(prog, this.totalPax);
    if (m.type === 'dist') prog = Math.max(prog, this.dist);
    if (m.type === 'score') prog = Math.max(prog, this.score);
    if (m.type === 'drop') prog = Math.max(prog, this.dropCount);
    if (m.type === 'horn') prog = Math.max(prog, this.hornCount);

    m.progress = prog;
    Storage.setDailyProgress(prog);

    if (prog >= m.target && !Storage.isDailyClaimed()) {
      // Ready to claim
      this.ui.showMissionToast(`Daily Mission Complete! Claim ₦${m.reward}`);
    }
  }

  claimDaily() {
    if (!this.dailyMission || Storage.isDailyClaimed()) return;
    if (this.dailyMission.progress < this.dailyMission.target) return;

    this.money += this.dailyMission.reward;
    Storage.setMoney(this.money);
    Storage.setDailyClaimed(true);

    // Streak bonus
    const streakBonus = CONFIG.STREAK.rewards[Math.min(this.streak, CONFIG.STREAK.rewards.length - 1)] || 0;
    if (streakBonus > 0) {
      this.money += streakBonus;
      Storage.setMoney(this.money);
      this.ui.showMissionToast(`Daily claimed + Streak x${this.streak} bonus ₦${streakBonus}!`);
    } else {
      this.ui.showMissionToast(`Daily Mission claimed! +₦${this.dailyMission.reward}`);
    }
    Audio.missionComplete();
    this.ui.updateStartMoney();
  }

}
