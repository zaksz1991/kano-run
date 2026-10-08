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
    this.selectedRoute = Storage.getRoute() || 'citycenter';
    this.high = Storage.getHighScore();
    this.money = Storage.getMoney();
    this.activeMission = null;
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
    this.activeMission = { ...CONFIG.MISSIONS[Math.floor(Math.random() * CONFIG.MISSIONS.length)], progress: 0 };
    this.ui.showPlaying();
    this.ui.setMission(this.activeMission.text);
    const route = CONFIG.ROUTES[this.selectedRoute];
    this.ui.setRouteLabel(route ? route.name : '');
    Audio.startEngine();
    this.ui.updateHUD(this);
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
      this.inv = 120;
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
    this.ui.showGameOver(this);
  }

  rectHit(a, b) {
    return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
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
    if (this.comboTimer > 0) {
      this.comboTimer--;
      if (this.comboTimer <= 0) this.combo = 0;
    }

    const route = CONFIG.ROUTES[this.selectedRoute] || CONFIG.ROUTES.citycenter;
    const baseTop = 7.8 * (route.difficulty || 1);
    this.speed = Math.min(baseTop, 3.4 + this.dist * 0.02);
    this.roadOff = (this.roadOff + this.speed * 2) % 58;
    this.dist += this.speed * 0.0055;
    this.score += Math.floor(this.speed * 0.22 * this.getComboMultiplier());

    this.targetX = this.laneX(this.playerLane);
    this.playerX += (this.targetX - this.playerX) * 0.25;
    this.playerY = this.canvas.clientHeight - 195;

    // spawn traffic with spacing
    if (this.frame % 42 === 0 && Math.random() < 0.7) {
      const lane = Math.floor(Math.random() * 3);
      // don't spawn on top of another in same lane near top
      const blocked = this.obs.some(o => Math.round(o.lane) === lane && o.y < 120);
      if (!blocked) {
        const types = ['car', 'keke', 'keke', 'car', 'police', 'karota', 'keke'];
        this.obs.push({
          type: types[Math.floor(Math.random() * types.length)],
          lane,
          y: -80,
          w: 50,
          h: 70,
          speedOff: (Math.random() - 0.5) * 0.8
        });
      }
    }
    if (this.frame % 90 === 0) {
      this.paxZones.push({ lane: Math.floor(Math.random() * 3), y: -90, taken: false, aishat: Math.random() < 0.12 });
    }
    if (this.frame % 110 === 0) {
      this.dropZones.push({ lane: Math.floor(Math.random() * 3), y: -90, used: false });
    }
    if (this.frame % 55 === 0) {
      this.coins.push({ lane: Math.floor(Math.random() * 3), y: -60, taken: false, bob: Math.random() * 6 });
    }

    const mv = this.speed * 1.12;
    const h = this.canvas.clientHeight;

    for (const o of this.obs) {
      o.y += mv + (o.speedOff || 0);
      // mild AI: only change lane if target clear
      if (this.frame % 90 === 0 && Math.random() < 0.15) {
        const dir = Math.random() < 0.5 ? -1 : 1;
        const nl = Math.round(o.lane) + dir;
        if (nl >= 0 && nl < 3) {
          const clear = !this.obs.some(other => other !== o && Math.round(other.lane) === nl && Math.abs(other.y - o.y) < 100);
          if (clear) o.lane = nl;
        }
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

    // collisions
    if (this.inv <= 0) {
      const pb = { x: this.playerX - 24, y: this.playerY - 38, w: 48, h: 72 };
      for (const o of this.obs) {
        const ox = this.laneX(Math.round(o.lane)) - o.w / 2;
        if (this.rectHit(pb, { x: ox, y: o.y, w: o.w, h: o.h })) {
          this.gameOver();
          return;
        }
        // near miss
        if (Math.round(o.lane) !== this.playerLane && Math.abs(o.y - this.playerY) < 40 && Math.abs(this.laneX(o.lane) - this.playerX) < 70) {
          this.addCombo(1);
        }
      }
    }

    // pickups
    for (const p of this.paxZones) {
      if (p.taken) continue;
      if (Math.round(p.lane) === this.playerLane && Math.abs(p.y - this.playerY) < 50 && this.paxOnBoard < this.capacity) {
        p.taken = true;
        const seats = p.aishat ? Math.min(2, this.capacity - this.paxOnBoard) : 1;
        this.paxOnBoard += seats;
        this.totalPax += seats;
        this.score += p.aishat ? 550 : 120;
        this.addCombo(p.aishat ? 3 : 1);
        Audio.pickup();
        if (p.aishat) this.ui.showMissionToast('👩‍👧 Aishat + Hibba boarded!');
      }
    }

    for (const d of this.dropZones) {
      if (d.used) continue;
      if (Math.round(d.lane) === this.playerLane && Math.abs(d.y - this.playerY) < 50 && this.paxOnBoard > 0) {
        d.used = true;
        const n = this.paxOnBoard;
        this.paxOnBoard = 0;
        this.dropCount += n;
        const fare = Math.floor(n * (route.baseFare || 140) * this.getComboMultiplier());
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

    // mission progress
    if (this.activeMission) {
      const m = this.activeMission;
      if (m.type === 'drop') m.progress = this.dropCount;
      if (m.type === 'dist') m.progress = this.dist;
      if (m.type === 'score') m.progress = this.score;
      if (m.type === 'pax') m.progress = this.totalPax;
      this.ui.setMission(`${m.text} (${Math.min(m.target, Math.floor(m.progress))}/${m.target})`);
    }

    this.ui.updateHUD(this);
  }
}
