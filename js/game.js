import { CONFIG, STATE } from './config.js';
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
    this.speed = 3.6;
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
    this.keys = {};
    this.trafficJamTimer = 0;
    this.nearMissCooldown = 0;
    this.policeChase = 0;
    this.selectedRoute = Storage.getRoute() || 'citycenter';
    this.selectedDriver = Storage.getDriver() || 'ruffneck';
    this.selectedPaint = Storage.getPaint() || 'classic';
    this.radioIndex = Storage.getRadio() || 0;
    this.nearMissCount = 0;
    this.landmarkIndex = 0;
    this.karotaTimer = 0;
    this.high = Storage.getHighScore();
    this.money = Storage.getMoney();
    this.activeMission = null;
  }

  initDaily() {
    // daily mission progress tracked in activeMission already; claim is separate
    this.ui.updateDailyUI(this);
  }

  claimDaily() {
    if (Storage.isDailyClaimed()) {
      this.ui.showMissionToast('Already claimed today');
      return;
    }
    // require a completed run today via high activity: score>500 or dist>1
    const streak = Storage.claimDaily();
    const reward = 500 + Math.min(500, streak * 50);
    this.money += reward;
    Storage.setMoney(this.money);
    this.ui.showMissionToast('Daily +₦' + reward + ' · Streak ' + streak);
    this.ui.updateDailyUI(this);
  }

  getDriver() {
    return CONFIG.DRIVERS[this.selectedDriver] || CONFIG.DRIVERS.ruffneck;
  }

  getBonuses() {
    return this.getDriver().bonuses || {};
  }

  cycleRadio() {
    this.radioIndex = (this.radioIndex + 1) % CONFIG.RADIO.length;
    Storage.setRadio(this.radioIndex);
    const st = CONFIG.RADIO[this.radioIndex];
    this.ui.setRadio(st.name);
    this.ui.showMissionToast('📻 ' + st.name);
    Audio.beep(440, 0.05, 'sine', 0.03);
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
    // cycle every ~90s of play frames
    return (this.frame % 5400) / 5400;
  }

  start() {
    this.state = STATE.PLAY;
    this.score = 0;
    this.dist = 0;
    this.paxOnBoard = 0;
    this.totalPax = 0;
    this.dropCount = 0;
    this.continuesLeft = 3;
    this.paidContinuesUsed = 0;
    this.combo = 0;
    this.comboTimer = 0;
    this.speed = 3.6;
    this.frame = 0;
    this.roadOff = 0;
    this.playerLane = 1;
    this.inv = 0;
    this.bounce = 0;
    this.obs = [];
    this.paxZones = [];
    this.dropZones = [];
    this.coins = [];
    this.trafficJamTimer = 0;
    this.nearMissCooldown = 0;
    this.policeChase = 0;
    this.nearMissCount = 0;
    this.landmarkIndex = 0;
    this.karotaTimer = 0;
    this.activeMission = { ...CONFIG.MISSIONS[Math.floor(Math.random() * CONFIG.MISSIONS.length)], progress: 0 };
    this.ui.showPlaying();
    this.ui.setMission(this.activeMission.text);
    const route = CONFIG.ROUTES[this.selectedRoute];
    this.ui.setRouteLabel(route ? route.name : '');
    const drv = this.getDriver();
    this.ui.setDriverLabel(drv.name + ' · ' + drv.title);
    const st = CONFIG.RADIO[this.radioIndex] || CONFIG.RADIO[0];
    this.ui.setRadio(st.name);
    // base speed tweak from driver
    const b = this.getBonuses();
    this.speed = 3.4 + (b.speed || 0);
    Audio.startEngine();
    this.ui.updateHUD(this);
    if (this.renderer3d?.applyPaint) this.renderer3d.applyPaint(this.selectedPaint);
    this.initDaily();
    if (!Storage.getSeenTutorial()) {
      this.ui.showEvent(
        '🛵 Welcome to Kano Run',
        'Swipe lanes · Horn to push traffic\nGreen = pick up · Yellow = drop for fare\nWatch for KAROTA checkpoints!',
        [{ label: 'Got it — Drive!', action: () => { Storage.setSeenTutorial(); this.state = STATE.PLAY; this.ui.showPlaying(); } }]
      );
    }
  }

  triggerShake(frames = 12, mag = 6) {
    this.shake = frames;
    this.shakeMag = mag;
  }

  addCombo(n = 1) {
    this.combo += n;
    this.comboTimer = 160;
    if (this.combo >= 5 && this.combo % 5 === 0) this.ui.showMissionToast(`🔥 ${this.combo}x COMBO!`);
  }

  getComboMultiplier() {
    if (this.combo >= 12) return 2;
    if (this.combo >= 7) return 1.6;
    if (this.combo >= 4) return 1.3;
    if (this.combo >= 2) return 1.15;
    return 1;
  }

  changeLane(dir) {
    const n = this.playerLane + dir;
    if (n >= 0 && n < CONFIG.LANES) {
      this.playerLane = n;
      this.bounce = 10;
    }
  }

  horn() {
    Audio.horn();
    this.inv = Math.max(this.inv, 20);
    // push nearby traffic
    for (const o of this.obs) {
      if (Math.round(o.lane) === this.playerLane && Math.abs(o.y - this.playerY) < 120) {
        o.y -= 40;
      }
    }
  }

  gameOver() {
    Audio.crash();
    this.triggerShake(16, 8);
    this.state = STATE.EVENT;
    if (this.continuesLeft > 0) {
      this.ui.showEvent('💥 CRASHED!', `You still have ${this.continuesLeft} free Life Saver${this.continuesLeft > 1 ? 's' : ''} left.\nContinue from here?`, [
        { label: `Use Free Life Saver (${this.continuesLeft} left)`, action: () => this.useContinue(false) },
        { label: 'End Run', action: () => this.finalGameOver() }
      ]);
    } else {
      const cost = 350 + (this.paidContinuesUsed || 0) * 200;
      const can = this.score >= cost;
      this.ui.showEvent('💥 No Free Lives Left', can
        ? `Pay ₦${cost.toLocaleString()} from your score to continue?`
        : `Need ₦${cost.toLocaleString()} — you have ₦${this.score.toLocaleString()}.`,
        can
          ? [
              { label: `Pay ₦${cost.toLocaleString()} & Continue`, action: () => this.useContinue(true) },
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
        if (this.score < cost) { this.finalGameOver(); return; }
        this.score -= cost;
        this.paidContinuesUsed = (this.paidContinuesUsed || 0) + 1;
        this.continuesLeft = 1;
        this.ui.showMissionToast(`Paid ₦${cost.toLocaleString()} — continue!`);
      } else {
        this.continuesLeft = Math.max(0, this.continuesLeft - 1);
        this.score = Math.max(0, this.score - 80);
      }
      this.inv = 100 + (this.getBonuses().invFrames || 0);
      this.obs = [];
      this.speed = Math.min(this.speed, 5.5);
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
    this.money += Math.floor(this.score * 0.2);
    Storage.setMoney(this.money);
    if (this.score > this.high) {
      this.high = this.score;
      Storage.setHighScore(this.high);
    }
    // Leaderboard
    const route = CONFIG.ROUTES[this.selectedRoute];
    const driver = this.getDriver();
    Storage.addRun({
      score: Math.floor(this.score),
      dist: Number(this.dist.toFixed(1)),
      route: route?.name || this.selectedRoute,
      driver: driver.name,
      at: Date.now()
    });
    // Achievements
    for (const ach of (CONFIG.ACHIEVEMENTS || [])) {
      try {
        if (ach.check(this) && Storage.unlockAchievement(ach.id)) {
          this.ui.showMissionToast('🏆 ' + ach.name);
        }
      } catch {}
    }
    this.ui.showGameOver(this);
  }

  rectHit(a, b) {
    return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
  }

  boardPassenger(p) {
    const seats = p.aishat ? Math.min(2, this.capacity - this.paxOnBoard) : 1;
    this.paxOnBoard += seats;
    this.totalPax += seats;
    let pick = p.aishat ? 550 : (p.vip ? 350 : 120);
    if (p.aishat && this.getBonuses().aishatBonus) pick += this.getBonuses().aishatBonus;
    this.score += pick;
    this.addCombo(p.aishat ? 3 : (p.vip ? 2 : 1));
    Audio.pickup();
    if (p.aishat) this.ui.showMissionToast('👩‍👧 Aishat + Hibba boarded!');
    else if (p.vip) this.ui.showMissionToast('💼 VIP boarded! +₦' + pick);
    else this.ui.showMissionToast('Passenger in');
  }

  startNegotiation(p) {
    this.state = STATE.EVENT;
    Audio.negotiate();
    const low = 50;
    const fair = 120;
    this.ui.showEvent(
      '💬 Fare Negotiation',
      'Passenger: "Aboki, reduce am! I go pay ₦' + low + ' only."\nWhat do you say?',
      [
        {
          label: 'Accept ₦' + low,
          action: () => {
            this.paxOnBoard = Math.min(this.capacity, this.paxOnBoard + 1);
            this.totalPax += 1;
            this.score += low;
            this.addCombo(1);
            Audio.pickup();
            this.ui.showMissionToast('Boarded for ₦' + low);
            this.state = STATE.PLAY;
            this.ui.showPlaying();
          }
        },
        {
          label: 'Hold ₦' + fair,
          action: () => {
            if (Math.random() < 0.55) {
              this.paxOnBoard = Math.min(this.capacity, this.paxOnBoard + 1);
              this.totalPax += 1;
              this.score += fair;
              this.addCombo(2);
              Audio.pickup();
              this.ui.showMissionToast('Agreed ₦' + fair);
            } else {
              Audio.alert();
              this.ui.showMissionToast('Passenger walked away');
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
      ]
    );
  }

  startKarotaCheckpoint() {
    this.karotaTimer = 400;
    this.state = STATE.EVENT;
    Audio.alert();
    this.triggerShake(8, 4);
    const fine = 200 + Math.floor(Math.random() * 300);
    this.ui.showEvent(
      '⚠️ KAROTA Checkpoint',
      'KAROTA officer flags you down.\n"Paper? Or you go settle ₦' + fine + '?"',
      [
        {
          label: 'Pay ₦' + fine,
          action: () => {
            this.score = Math.max(0, this.score - fine);
            this.ui.showMissionToast('Paid KAROTA ₦' + fine);
            Audio.negotiate();
            this.inv = 60;
            this.state = STATE.PLAY;
            this.ui.showPlaying();
          }
        },
        {
          label: 'Talk your way out',
          action: () => {
            if (Math.random() < 0.45) {
              this.ui.showMissionToast('They waved you on');
              Audio.success();
              this.score += 80;
            } else {
              this.score = Math.max(0, this.score - fine);
              this.ui.showMissionToast('Still paid ₦' + fine);
              Audio.crash();
            }
            this.inv = 60;
            this.state = STATE.PLAY;
            this.ui.showPlaying();
          }
        },
        {
          label: 'Speed off (risk)',
          action: () => {
            if (Math.random() < 0.4) {
              this.ui.showMissionToast('Escaped!');
              this.addCombo(3);
              Audio.horn();
            } else {
              this.ui.showMissionToast('Caught — heavy fine');
              this.score = Math.max(0, this.score - fine * 2);
              this.triggerShake(12, 6);
              Audio.crash();
            }
            this.inv = 40;
            this.state = STATE.PLAY;
            this.ui.showPlaying();
          }
        }
      ]
    );
  }

  /** Min gap in screen-Y units between vehicles in same lane */
  laneClear(lane, y, gap = 130, ignore = null) {
    return !this.obs.some(o =>
      o !== ignore &&
      Math.round(o.lane) === Math.round(lane) &&
      Math.abs(o.y - y) < gap
    );
  }

  update() {
    if (this.state !== STATE.PLAY) {
      if (this.shake > 0) this.shake--;
      return;
    }
    this.frame++;
    if (this.inv > 0) this.inv--;
    if (this.bounce > 0) this.bounce--;
    if (this.shake > 0) this.shake--;
    if (this.nearMissCooldown > 0) this.nearMissCooldown--;
    if (this.policeChase > 0) this.policeChase--;
    if (this.trafficJamTimer > 0) this.trafficJamTimer--;
    if (this.comboTimer > 0) {
      this.comboTimer--;
      if (this.comboTimer <= 0) this.combo = 0;
    }

    const route = CONFIG.ROUTES[this.selectedRoute] || CONFIG.ROUTES.citycenter;
    const bonuses = this.getBonuses();
    let baseTop = 7.2 * (route.difficulty || 1) + (bonuses.speed || 0) * 3;
    if (this.trafficJamTimer > 0) baseTop *= 0.55;
    // Ruffneck night edge
    if (this.getDriver().ability === 'ruffneck' && this.getTimeOfDay() > 0.55) baseTop += 0.4;
    this.speed = Math.min(baseTop, 3.2 + this.dist * 0.018 + (bonuses.speed || 0));
    this.roadOff = (this.roadOff + this.speed * 2) % 58;
    this.dist += this.speed * 0.0055;
    const b = this.getBonuses();
    this.score += Math.floor(this.speed * 0.22 * this.getComboMultiplier() * (b.scoreMult || 1));
    Audio.updateEngine(this.speed);

    // Landmark callouts along route
    const marks = route.landmarks || [];
    if (marks.length && this.dist > (this.landmarkIndex + 1) * 2.5 && this.landmarkIndex < marks.length) {
      const name = marks[this.landmarkIndex];
      this.landmarkIndex++;
      this.ui.showMissionToast('📍 ' + name);
      Audio.success();
    }

    // KAROTA checkpoint event
    if (this.karotaTimer > 0) this.karotaTimer--;
    if (this.frame % 720 === 0 && this.dist > 1.5 && this.karotaTimer <= 0 && Math.random() < 0.4) {
      this.startKarotaCheckpoint();
      return;
    }

    this.targetX = this.laneX(this.playerLane);
    this.playerX += (this.targetX - this.playerX) * 0.25;
    this.playerY = this.canvas.clientHeight - 195;

    // ——— Traffic jam event ———
    if (this.frame % 480 === 0 && Math.random() < 0.35 && this.trafficJamTimer <= 0 && this.dist > 1) {
      this.trafficJamTimer = 150;
      this.ui.showMissionToast('🚦 TRAFFIC JAM! Slow down');
      this.triggerShake(6, 3);
    }

    // ——— Safe traffic spawn (per-lane gap + prefer non-player lane when close) ———
    if (this.frame % 48 === 0 && Math.random() < 0.72 && this.trafficJamTimer <= 0) {
      let lane = Math.floor(Math.random() * 3);
      // Prefer not stacking on player lane at spawn
      if (lane === this.playerLane && Math.random() < 0.55) {
        lane = (lane + 1 + Math.floor(Math.random() * 2)) % 3;
      }
      if (this.laneClear(lane, -80, 150)) {
        const roll = Math.random();
        let type = 'car';
        if (roll < 0.35) type = 'keke';
        else if (roll < 0.55) type = 'car';
        else if (roll < 0.7) type = 'keke';
        else if (roll < 0.82) type = 'police';
        else if (roll < 0.92) type = 'karota';
        else type = 'car';

        this.obs.push({
          type,
          lane,
          y: -80,
          w: type === 'keke' ? 46 : 52,
          h: type === 'keke' ? 64 : 74,
          speedOff: -0.3 + Math.random() * 0.5, // mostly slower than player flow
          laneCooldown: 40 + Math.floor(Math.random() * 80)
        });
      }
    }

    // Extra density during jam (spawn ahead in all lanes with gaps)
    if (this.trafficJamTimer > 80 && this.frame % 30 === 0) {
      for (let lane = 0; lane < 3; lane++) {
        if (this.laneClear(lane, -80, 160) && Math.random() < 0.5) {
          this.obs.push({
            type: Math.random() < 0.5 ? 'keke' : 'car',
            lane, y: -80, w: 50, h: 70,
            speedOff: -0.8,
            laneCooldown: 120
          });
        }
      }
    }

    if (this.frame % 95 === 0) {
      const roll = Math.random();
      this.paxZones.push({
        lane: Math.floor(Math.random() * 3),
        y: -90,
        taken: false,
        aishat: roll < 0.1,
        vip: roll >= 0.1 && roll < 0.22
      });
    }
    if (this.frame % 115 === 0) {
      this.dropZones.push({ lane: Math.floor(Math.random() * 3), y: -90, used: false });
    }
    if (this.frame % 58 === 0) {
      this.coins.push({ lane: Math.floor(Math.random() * 3), y: -60, taken: false, bob: Math.random() * 6 });
    }

    const mv = this.speed * 1.1;
    const h = this.canvas.clientHeight;

    // ——— Traffic movement + following distance + overtaking ———
    for (const o of this.obs) {
      // Find vehicle ahead in same lane (higher y = closer to player / further down screen)
      let aheadDist = 9999;
      for (const other of this.obs) {
        if (other === o) continue;
        if (Math.round(other.lane) !== Math.round(o.lane)) continue;
        if (other.y > o.y) {
          const d = other.y - o.y;
          if (d < aheadDist) aheadDist = d;
        }
      }
      // Also respect player if same lane and ahead
      if (Math.round(o.lane) === this.playerLane && this.playerY > o.y) {
        aheadDist = Math.min(aheadDist, this.playerY - o.y);
      }

      let move = mv + (o.speedOff || 0);
      // Brake if too close to vehicle ahead
      if (aheadDist < 90) move *= 0.25;
      else if (aheadDist < 130) move *= 0.55;

      o.y += move;
      if (o.laneCooldown > 0) o.laneCooldown--;

      // Overtake: change lane only if destination clear and something is blocking ahead
      if (o.laneCooldown <= 0 && aheadDist < 120 && Math.random() < 0.04) {
        const dirs = Math.random() < 0.5 ? [-1, 1] : [1, -1];
        for (const dir of dirs) {
          const nl = Math.round(o.lane) + dir;
          if (nl < 0 || nl > 2) continue;
          // Clear of other traffic
          if (!this.laneClear(nl, o.y, 110, o)) continue;
          // Don't cut into player at close range
          if (nl === this.playerLane && Math.abs(o.y - this.playerY) < 100) continue;
          o.lane = nl;
          o.laneCooldown = 70 + Math.floor(Math.random() * 50);
          break;
        }
      }

      // Police / KAROTA: occasional "notice" when near player
      if ((o.type === 'police' || o.type === 'karota') &&
          Math.round(o.lane) === this.playerLane &&
          Math.abs(o.y - this.playerY) < 160 &&
          this.policeChase <= 0 &&
          Math.random() < 0.01) {
        this.policeChase = 120;
        this.ui.showMissionToast(o.type === 'karota' ? '⚠️ KAROTA nearby — drive careful!' : '🚨 Police nearby!');
        this.triggerShake(5, 2);
      }
    }
    this.obs = this.obs.filter(o => o.y < h + 80);

    for (const p of this.paxZones) p.y += mv;
    this.paxZones = this.paxZones.filter(p => p.y < h + 40 && !p.taken);
    for (const d of this.dropZones) d.y += mv;
    this.dropZones = this.dropZones.filter(d => d.y < h + 40 && !d.used);
    for (const c of this.coins) {
      c.y += mv;
      c.bob += 0.1;
    }
    this.coins = this.coins.filter(c => c.y < h + 40 && !c.taken);

    // ——— Collisions (slightly tighter hitbox) + near miss rewards ———
    if (this.inv <= 0) {
      const pb = { x: this.playerX - 20, y: this.playerY - 32, w: 40, h: 60 };
      for (const o of this.obs) {
        const ox = this.laneX(Math.round(o.lane)) - o.w / 2;
        if (this.rectHit(pb, { x: ox, y: o.y + 8, w: o.w, h: o.h - 12 })) {
          // Police/KAROTA contact costs more message
          if (o.type === 'police' || o.type === 'karota') {
            this.ui.showMissionToast(o.type === 'karota' ? 'KAROTA got you!' : 'Police stop!');
          }
          this.gameOver();
          return;
        }

        // Near miss: adjacent lane, close in Y
        if (
          this.nearMissCooldown <= 0 &&
          Math.round(o.lane) !== this.playerLane &&
          Math.abs(Math.round(o.lane) - this.playerLane) === 1 &&
          Math.abs(o.y - this.playerY) < 36
        ) {
          this.nearMissCooldown = 45;
          this.nearMissCount = (this.nearMissCount || 0) + 1;
          const nm = Math.floor(60 * (this.getBonuses().nearMissBonus || 1));
          this.addCombo(2);
          this.score += nm;
          this.ui.showMissionToast('💨 Near miss! +₦' + nm);
        }
      }
    }

    // ——— Pickups (some negotiate fare) ———
    for (const p of this.paxZones) {
      if (p.taken) continue;
      if (Math.round(p.lane) === this.playerLane && Math.abs(p.y - this.playerY) < 50 && this.paxOnBoard < this.capacity) {
        p.taken = true;
        // Chance to negotiate (not Aishat)
        if (!p.aishat && Math.random() < 0.28) {
          this.startNegotiation(p);
          return;
        }
        this.boardPassenger(p);
      }
    }

    for (const d of this.dropZones) {
      if (d.used) continue;
      if (Math.round(d.lane) === this.playerLane && Math.abs(d.y - this.playerY) < 50 && this.paxOnBoard > 0) {
        d.used = true;
        const n = this.paxOnBoard;
        this.paxOnBoard = 0;
        this.dropCount += n;
        const fare = Math.floor(n * (route.baseFare || 140) * this.getComboMultiplier() * (this.getBonuses().fareMult || 1));
        this.score += fare;
        this.addCombo(2);
        this.ui.showMissionToast(`Drop +₦${fare}`);
      }
    }

    for (const c of this.coins) {
      if (c.taken) continue;
      if (Math.hypot(this.playerX - this.laneX(c.lane), this.playerY - c.y) < 42) {
        c.taken = true;
        this.score += 40;
        Audio.coin();
      }
    }

    if (this.activeMission) {
      const m = this.activeMission;
      if (m.type === 'drop') m.progress = this.dropCount;
      if (m.type === 'dist') m.progress = this.dist;
      if (m.type === 'score') m.progress = this.score;
      if (m.type === 'pax') m.progress = this.totalPax;
      if (m.type === 'nearmiss') m.progress = this.nearMissCount || 0;
      this.ui.setMission(`${m.text} (${Math.min(m.target, Math.floor(m.progress))}/${m.target})`);
    }

    this.ui.updateHUD(this);
  }
}

