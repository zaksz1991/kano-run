// Kano Run — Advanced Game Core
import { CONFIG, STATE } from './config.js';
import { Storage } from './storage.js';
import { Audio } from './audio.js';

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const pick = list => list[Math.floor(Math.random() * list.length)];

export class Game {
  constructor(canvas, ui = null) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.ui = ui;

    this.state = STATE.START;
    this.running = true;
    this.paused = false;
    this.gameOver = false;

    this.score = 0;
    this.dist = 0;
    this.totalPax = 0;
    this.dropCount = 0;
    this.hornCount = 0;
    this.continuesLeft = CONFIG.STARTING_LIVES;
    this.combo = 0;
    this.comboTimer = 0;
    this.maxCombo = 0;
    this.nearMisses = 0;

    this.speed = CONFIG.START_SPEED;
    this.speedBoost = Storage.getSpeedBoost();
    this.hornPower = Storage.getHornPower();
    this.fareBonus = 0;

    this.capacity = Storage.getCapacity();
    this.currentPaint = Storage.getPaint();
    this.driverStyle = Storage.getDriverStyle();
    this.selectedDriver = Storage.getSelectedDriver();
    this.selectedRoute = Storage.getSelectedRoute();
    this.currentRadio = Storage.getRadioStation();
    this.money = Storage.getMoney();
    this.high = Storage.getHighScore();

    this.playerLane = 1;
    this.targetLane = 1;
    this.steer = 0;
    this.laneTarget = 0;
    this.playerY = 0;

    this.roadOff = 0;
    this.frame = 0;
    this.shake = 0;
    this.shakeMag = 0;
    this.inv = 0;
    this.bounce = 0;
    this.wheelRot = 0;

    this.weather = 'clear';
    this.weatherTimer = 0;
    this.roadCondition = 'normal';
    this.mudTimer = 0;

    this.obs = [];
    this.paxZones = [];
    this.dropZones = [];
    this.coins = [];
    this.particles = [];
    this.dust = [];
    this.weatherParticles = [];

    this.spawnTimer = 0;
    this.paxTimer = 1.8;
    this.coinTimer = 1.2;
    this.eventTimer = 10;
    this.landmarkTimer = 0;
    this.routeProgress = 0;

    this.worldEvent = null;
    this.lastmaActive = false;
    this.lastmaTimer = 0;
    this.trafficJamTimer = 0;

    this.dailyMission = null;
    this.streak = Storage.getStreak();
    this.activeMission = null;
    this.missionProgress = 0;

    this.fuel = 100;
    this.damage = 0;
    this.fuelSpent = 0;

    this.lastDriverSay = 0;
    this.width = window.innerWidth;
    this.height = window.innerHeight;

    this.route = this.getRoute();
    this.district = this.route.name;
    this.applyDriverBonuses();
    this.initDaily();
  }

  getRoute() {
    return CONFIG.ROUTES[this.selectedRoute] ||
      CONFIG.ROUTES.citycenter ||
      Object.values(CONFIG.ROUTES)[0];
  }

  resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.width = window.innerWidth;
    this.height = window.innerHeight;
    this.canvas.width = Math.floor(this.width * dpr);
    this.canvas.height = Math.floor(this.height * dpr);
    this.canvas.style.width = `${this.width}px`;
    this.canvas.style.height = `${this.height}px`;
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.playerY = this.height * .82;
  }

  start() {
    this.route = this.getRoute();
    this.state = STATE.PLAY;
    this.running = true;
    this.paused = false;
    this.gameOver = false;

    this.score = 0;
    this.dist = 0;
    this.totalPax = 0;
    this.dropCount = 0;
    this.hornCount = 0;
    this.continuesLeft = CONFIG.STARTING_LIVES;
    this.combo = 0;
    this.comboTimer = 0;
    this.maxCombo = 0;
    this.nearMisses = 0;

    this.speed = CONFIG.START_SPEED + (this.speedBoost * .7) + (this.driverSpeed || 0);
    this.fuel = 100;
    this.damage = 0;
    this.fuelSpent = 0;

    this.playerLane = 1;
    this.targetLane = 1;
    this.steer = 0;
    this.laneTarget = 0;
    this.roadOff = 0;
    this.frame = 0;
    this.shake = 0;
    this.inv = 0;

    this.obs.length = 0;
    this.paxZones.length = 0;
    this.dropZones.length = 0;
    this.coins.length = 0;
    this.particles.length = 0;
    this.dust.length = 0;
    this.weatherParticles.length = 0;

    this.spawnTimer = .25;
    this.paxTimer = 1.2;
    this.coinTimer = .9;
    this.eventTimer = 8;
    this.routeProgress = 0;

    this.worldEvent = null;
    this.lastmaActive = false;
    this.lastmaTimer = 0;
    this.trafficJamTimer = 0;

    this.activeMission = pick(CONFIG.MISSIONS);
    this.missionProgress = 0;

    this.weather = this.pickWeather();
    this.applyWeather();

    if (this.ui?.showPlaying) this.ui.showPlaying();
    if (this.ui?.updateHUD) this.ui.updateHUD(this);
    if (this.ui?.setMission && this.activeMission) this.ui.setMission(this.activeMission.text);
    if (this.ui?.setWeather) this.ui.setWeather(CONFIG.WEATHER[this.weather] || '☀️ Clear');

    try { Audio.startEngine?.(); } catch {}
  }

  restart() { this.start(); }

  continueGame() {
    this.paused = false;
    this.running = true;
    this.state = STATE.PLAY;
  }

  pause() {
    this.paused = true;
  }

  changeLane(direction) {
    if (this.state !== STATE.PLAY) return;
    this.targetLane = clamp(this.targetLane + Math.sign(direction), 0, CONFIG.LANES - 1);
  }

  horn() {
    this.hornCount++;
    this.combo = Math.min(CONFIG.COMBO_MAX, this.combo + 1);
    this.comboTimer = 3;
    this.clearNearbyTraffic();
    this.driverSay('horn');
    try { Audio.horn?.(); } catch {}
  }

  cycleRadio() {
    const stations = CONFIG.RADIO_STATIONS;
    const index = Math.max(0, stations.findIndex(s => s.id === this.currentRadio));
    this.currentRadio = stations[(index + 1) % stations.length].id;
    Storage.setRadioStation(this.currentRadio);
    this.ui?.showRadio?.(true);
    setTimeout(() => this.ui?.showRadio?.(false), 1800);
  }

  radio() { this.cycleRadio(); }

  applyDriverBonuses() {
    const driver = CONFIG.DRIVERS[this.selectedDriver] || CONFIG.DRIVERS.musa;
    const b = driver.bonus || {};
    this.driverSpeed = Number(b.speed || 0);
    this.fareBonus = Number(b.fareBonus || 0);
    this.driverHorn = Number(b.horn || 0);
    this.capacity = Math.max(3, Storage.getCapacity() + Number(b.capacity || 0));
    return b;
  }

  update(dt) {
    if (this.state !== STATE.PLAY || this.paused || this.gameOver) return;

    const seconds = Math.min(32, Number(dt) || 0) / 1000;
    this.frame++;
    this.roadOff += this.speed * seconds * 24;
    this.wheelRot += this.speed * seconds * 2;

    this.updateClock(seconds);
    this.updateMovement(seconds);
    this.updateTraffic(seconds);
    this.updatePassengers(seconds);
    this.updateCoins(seconds);
    this.updateWorldEvents(seconds);
    this.updateParticles(seconds);
    this.updateFuelAndEconomy(seconds);
    this.updateMission();
    this.updateDistrict();
    this.updateHUD();

    this.dist += this.speed * seconds * .018;
    this.routeProgress += this.speed * seconds * .12;
    this.score += Math.floor(this.speed * seconds * 2.2 * this.getComboMultiplier());

    if (this.comboTimer > 0) {
      this.comboTimer -= seconds;
      if (this.comboTimer <= 0) this.combo = 0;
    }

    if (this.score > this.high) {
      this.high = this.score;
      Storage.setHighScore(this.high);
    }

    if (this.shake > 0) this.shake -= seconds;
    if (this.inv > 0) this.inv -= seconds;
  }

  updateHUD() {
    this.ui?.updateHUD?.(this);
    this.ui?.updateRouteLabel?.();
    if (this.ui?.setMission && this.activeMission) {
      this.ui.setMission(`${this.activeMission.text} (${Math.floor(this.missionProgress)}/${this.activeMission.target})`);
    }
  }

  updateClock(seconds) {
    this.eventTimer -= seconds;
    this.weatherTimer -= seconds;
    this.landmarkTimer -= seconds;

    if (this.weatherTimer <= 0) {
      this.weather = this.pickWeather();
      this.weatherTimer = 28 + Math.random() * 35;
      this.applyWeather();
    }

    if (this.landmarkTimer <= 0) {
      const list = this.route.landmarks || [];
      if (list.length) this.ui?.showLandmark?.(pick(list));
      this.landmarkTimer = 9 + Math.random() * 9;
    }
  }

  updateMovement(seconds) {
    const max = CONFIG.MAX_SPEED + this.speedBoost * 1.5 + this.driverSpeed;
    const acceleration = 3.2 + this.speedBoost * .45;
    this.speed = clamp(this.speed + acceleration * seconds, CONFIG.START_SPEED, max);

    const target = (this.targetLane - 1);
    this.laneTarget = target;
    this.steer += (target - this.steer) * Math.min(1, seconds * 10);
    this.playerLane += (this.targetLane - this.playerLane) * Math.min(1, seconds * 8);
  }

  updateTraffic(seconds) {
    this.spawnTimer -= seconds;
    const eventTraffic = this.worldEvent?.traffic || 1;
    const routeTraffic = this.route.traffic || 1;
    const difficulty = this.route.difficulty || 1;

    if (this.spawnTimer <= 0) {
      this.spawnTraffic();
      const density = Math.max(.22, 1.05 - difficulty * .15);
      this.spawnTimer = density / (routeTraffic * eventTraffic) * (.65 + Math.random() * .5);
    }

    for (let i = this.obs.length - 1; i >= 0; i--) {
      const o = this.obs[i];
      o.z -= seconds * (.22 + this.speed * .012) * (o.relativeSpeed || 1);
      o.wobble += seconds * (o.behaviour === 'motorcycle' ? 6 : 2);

      if (o.behaviour === 'overtake') {
        o.lane += Math.sin(o.wobble) * seconds * .08;
        o.lane = clamp(o.lane, -1.15, 1.15);
      }

      if (o.z < -.12) {
        if (!o.passed) this.checkNearMiss(o);
        this.obs.splice(i, 1);
        continue;
      }

      if (o.type === 'karota' && o.z < .55 && o.z > .28 && Math.abs(o.lane - this.laneTarget) < .18) {
        this.triggerKarota();
      }

      this.checkCollision(o);
    }
  }

  spawnTraffic() {
    const pool = CONFIG.TRAFFIC_TYPES;
    const total = pool.reduce((sum, x) => sum + x.weight, 0);
    let roll = Math.random() * total;
    let selected = pool[0];

    for (const item of pool) {
      roll -= item.weight;
      if (roll <= 0) { selected = item; break; }
    }

    const routeFactor = this.route.traffic || 1;
    let lane = Math.floor(Math.random() * CONFIG.LANES) - 1;
    if (Math.random() < .18 * routeFactor) lane = clamp(lane + (Math.random() < .5 ? -1 : 1), -1, 1);

    const behaviour = Math.random() < .2 ? 'overtake' : Math.random() < .2 ? 'slow' : 'normal';
    const colors = ['#dc2626','#2563eb','#16a34a','#f97316','#64748b','#f8fafc','#111827'];

    this.obs.push({
      type: selected.type,
      lane,
      z: 1.02,
      relativeSpeed: selected.type === 'truck' ? .75 : selected.type === 'motorcycle' ? 1.18 : .9 + Math.random() * .35,
      behaviour,
      wobble: Math.random() * 10,
      color: pick(colors),
      passed: false
    });
  }

  checkCollision(o) {
    if (this.inv > 0 || !o || o.z > .18 || o.z < -.02) return;
    const hit = Math.abs(o.lane - this.laneTarget) < (o.type === 'motorcycle' ? .16 : .28);
    if (hit) this.collision(o);
  }

  checkNearMiss(o) {
    o.passed = true;
    if (Math.abs(o.lane - this.laneTarget) < .48 && Math.abs(o.lane - this.laneTarget) > .22) {
      this.nearMisses++;
      this.addCombo(1);
      this.score += 120 * this.getComboMultiplier();
      this.addMoney(25);
      this.ui?.showMissionToast?.(`Near miss +₦25 • ${this.combo}x`);
      this.shake = .12;
      this.shakeMag = 3;
    }
  }

  collision(o) {
    if (this.inv > 0) return;
    this.continuesLeft--;
    this.damage = clamp(this.damage + 22, 0, 100);
    this.inv = 1.35 + this.driverHorn * .2;
    this.shake = .4;
    this.shakeMag = 10;
    this.speed *= .62;
    this.combo = 0;
    this.addMoney(-CONFIG.COMMERCE.maintenanceCostPerCrash);
    this.driverSay('crash');

    if (this.continuesLeft <= 0 || this.damage >= 100) this.endGame();
  }

  addCombo(amount = 1) {
    this.combo = clamp(this.combo + amount, 0, CONFIG.COMBO_MAX);
    this.comboTimer = 4;
    this.maxCombo = Math.max(this.maxCombo, this.combo);
    if (this.combo > 1 && this.combo % 5 === 0) this.driverSay('combo');
  }

  getComboMultiplier() {
    if (this.combo >= 20) return 2.5;
    if (this.combo >= 12) return 2;
    if (this.combo >= 7) return 1.6;
    if (this.combo >= 4) return 1.3;
    return 1;
  }

  updatePassengers(seconds) {
    this.paxTimer -= seconds;

    if (this.paxTimer <= 0 && this.paxOnBoard < this.capacity) {
      this.spawnPassenger();
      this.paxTimer = Math.max(1.6, 4.5 / (this.route.traffic || 1)) + Math.random() * 2;
    }

    for (let i = this.paxZones.length - 1; i >= 0; i--) {
      const p = this.paxZones[i];
      p.z -= seconds * (.22 + this.speed * .012);
      if (p.z < -.1) { this.paxZones.splice(i, 1); continue; }

      if (!p.collected && p.z < .16 && Math.abs(p.lane - this.laneTarget) < .36) {
        p.collected = true;
        this.paxOnBoard++;
        this.totalPax++;
        this.addMoney(15);
        this.addCombo(1);
        this.driverSay('pickup');
        this.dropZones.push({
          lane: p.destinationLane,
          z: .9,
          type: p.type,
          completed: false
        });
      }
    }

    for (let i = this.dropZones.length - 1; i >= 0; i--) {
      const d = this.dropZones[i];
      d.z -= seconds * (.20 + this.speed * .011);
      if (d.z < -.1) { this.dropZones.splice(i, 1); continue; }

      if (!d.completed && d.z < .16 && this.paxOnBoard > 0 && Math.abs(d.lane - this.laneTarget) < .38) {
        d.completed = true;
        this.paxOnBoard--;
        this.dropCount++;
        const passenger = CONFIG.PASSENGER_TYPES.find(x => x.id === d.type) || CONFIG.PASSENGER_TYPES[0];
        const fare = Math.round(this.route.baseFare * (passenger.fareMult || 1) * (1 + this.fareBonus) * (this.worldEvent?.fare || 1));
        this.addMoney(fare);
        this.score += fare;
        this.addCombo(1);
        this.driverSay('drop');
      }
    }
  }

  spawnPassenger() {
    const p = pick(CONFIG.PASSENGER_TYPES);
    const vip = p.vip || Math.random() < .035;
    const lane = Math.floor(Math.random() * CONFIG.LANES) - 1;
    this.paxZones.push({
      lane,
      z: 1.03,
      type: p.id,
      vip,
      collected: false,
      destinationLane: Math.floor(Math.random() * CONFIG.LANES) - 1
    });
  }

  updateCoins(seconds) {
    this.coinTimer -= seconds;
    if (this.coinTimer <= 0) {
      this.coins.push({
        lane: Math.floor(Math.random() * CONFIG.LANES) - 1,
        z: 1.02,
        value: Math.random() < .15 ? 50 : 10
      });
      this.coinTimer = 1.3 + Math.random() * 2;
    }

    for (let i = this.coins.length - 1; i >= 0; i--) {
      const c = this.coins[i];
      c.z -= seconds * (.22 + this.speed * .012);
      if (c.z < -.1) { this.coins.splice(i, 1); continue; }
      if (c.z < .16 && Math.abs(c.lane - this.laneTarget) < .35) {
        this.addMoney(c.value);
        this.score += c.value;
        this.coins.splice(i, 1);
      }
    }
  }

  clearNearbyTraffic() {
    for (const o of this.obs) {
      if (o.z < .55 && Math.abs(o.lane - this.laneTarget) < (.5 + this.driverHorn * .1)) {
        o.z -= .18;
      }
    }
  }

  updateWorldEvents(seconds) {
    this.eventTimer -= seconds;

    if (this.eventTimer <= 0 && !this.worldEvent) {
      const event = pick(CONFIG.WORLD_EVENTS);
      this.worldEvent = event;
      this.eventTimer = 18 + Math.random() * 20;
      this.ui?.showMissionToast?.(`${event.name}: ${event.text}`);
      if (event.id === 'checkpoint') this.lastmaActive = true;
      if (event.id === 'trafficjam') this.trafficJamTimer = 6;
    }

    if (this.worldEvent) {
      if (this.worldEvent.id === 'trafficjam') {
        this.trafficJamTimer -= seconds;
        if (this.trafficJamTimer <= 0) this.worldEvent = null;
      } else if (Math.random() < seconds * .035) {
        this.worldEvent = null;
        this.lastmaActive = false;
      }
    }

    if (this.lastmaActive) {
      this.lastmaTimer -= seconds;
      if (this.lastmaTimer <= 0) this.lastmaTimer = 3;
    }
  }

  triggerKarota() {
    if (this.lastmaActive || Math.random() > .18) return;
    this.lastmaActive = true;
    this.lastmaTimer = 4;
    this.driverSay('karota');
    this.ui?.showMissionToast?.('KAROTA checkpoint ahead — keep moving carefully');
  }

  updateFuelAndEconomy(seconds) {
    const cost = CONFIG.COMMERCE.fuelCostPerKm;
    this.fuel = clamp(this.fuel - this.speed * seconds * .035, 0, 100);
    this.fuelSpent += this.speed * seconds * cost / 1000;

    if (this.fuel <= 0) {
      this.speed *= .995;
      if (Math.random() < seconds * .2) this.ui?.showMissionToast?.('Fuel is almost finished');
    }
  }

  updateMission() {
    if (!this.activeMission) return;
    const m = this.activeMission;
    if (m.id === 'pax5') this.missionProgress = this.totalPax;
    else if (m.id === 'dist5') this.missionProgress = this.dist;
    else if (m.id === 'score3k') this.missionProgress = this.score;
    else if (m.id === 'horn5') this.missionProgress = this.hornCount;
    else if (m.id === 'drop10') this.missionProgress = this.dropCount;
    else if (m.id === 'near5') this.missionProgress = this.nearMisses;
    else if (m.id === 'routes') this.missionProgress = Math.floor(this.routeProgress / 5);
    else if (m.id === 'survive') this.missionProgress = this.dist;

    if (this.missionProgress >= m.target) {
      this.addMoney(m.reward);
      this.ui?.showMissionToast?.(`Mission complete +₦${m.reward}`);
      this.activeMission = pick(CONFIG.MISSIONS);
      this.missionProgress = 0;
    }
  }

  updateDistrict() {
    const index = Math.floor(this.dist / 1.1) % CONFIG.DISTRICTS.length;
    this.district = CONFIG.DISTRICTS[index];
  }

  updateParticles(seconds) {
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.x += (p.vx || 0) * seconds;
      p.y += (p.vy || 0) * seconds;
      p.life -= seconds;
      if (p.life <= 0) this.particles.splice(i, 1);
    }

    for (let i = this.dust.length - 1; i >= 0; i--) {
      const p = this.dust[i];
      p.y += (p.speed || 20) * seconds;
      p.life -= seconds * .5;
      if (p.life <= 0) this.dust.splice(i, 1);
    }

    if (this.weather === 'dust' && Math.random() < seconds * 35) {
      this.dust.push({x:Math.random()*this.width,y:-10,speed:25+Math.random()*45,life:1});
    }

    if (this.weather === 'rain' || this.weather === 'storm') {
      if (Math.random() < seconds * 70) {
        this.weatherParticles.push({
          x:Math.random()*this.width,y:-10,
          vx:-20,vy:220+Math.random()*140,life:1
        });
      }
    }

    for (let i = this.weatherParticles.length - 1; i >= 0; i--) {
      const p = this.weatherParticles[i];
      p.x += p.vx * seconds;
      p.y += p.vy * seconds;
      p.life -= seconds;
      if (p.life <= 0) this.weatherParticles.splice(i, 1);
    }
  }

  pickWeather() {
    const r = Math.random();
    if (r < .58) return 'clear';
    if (r < .77) return 'dust';
    if (r < .9) return 'haze';
    if (r < .98) return 'rain';
    return 'storm';
  }

  applyWeather() {
    if (this.weather === 'rain' || this.weather === 'storm') this.roadCondition = 'wet';
    else if (this.weather === 'dust') this.roadCondition = 'dust';
    else this.roadCondition = 'normal';
    this.ui?.setWeather?.(CONFIG.WEATHER[this.weather] || '☀️ Clear');
  }

  getTimeOfDay() {
    const cycle = (this.time || 0) % CONFIG.DAY_LENGTH_MS / CONFIG.DAY_LENGTH_MS;
    if (cycle < .18) return .12;
    if (cycle < .45) return .4;
    if (cycle < .62) return .68;
    if (cycle < .78) return .8;
    return .92;
  }

  getTime() { return this.time || 0; }
  getDate() { return new Date(); }
  getDistrict() { return this.district; }

  addMoney(amount) {
    this.money = Math.max(0, Math.floor(this.money + Number(amount || 0)));
    Storage.setMoney(this.money);
  }

  spendMoney(amount) {
    if (this.money < amount) return false;
    this.addMoney(-amount);
    return true;
  }

  initDaily() {
    const today = new Date().toISOString().slice(0,10);
    if (Storage.getDailyDate() !== today) {
      const mission = pick(CONFIG.DAILY_MISSIONS);
      Storage.setDailyDate(today);
      Storage.setDailyMissionId(mission.id);
      Storage.setDailyProgress(0);
      Storage.setDailyClaimed(false);
    }
    const id = Storage.getDailyMissionId();
    this.dailyMission = CONFIG.DAILY_MISSIONS.find(x => x.id === id) || CONFIG.DAILY_MISSIONS[0];
  }

  endGame() {
    if (this.gameOver) return;
    this.gameOver = true;
    this.running = false;
    this.state = STATE.OVER;
    Storage.setHighScore(this.high);
    Storage.setMoney(this.money);
    try { Audio.stopEngine?.(); } catch {}
    this.ui?.showGameOver?.(this);
  }

  driverSay(type) {
    const lines = CONFIG.DRIVER_REACTIONS?.[type];
    if (!lines?.length || !this.ui?.showMissionToast) return;
    const now = performance.now();
    if (now - this.lastDriverSay < 900) return;
    this.lastDriverSay = now;
    const driver = CONFIG.DRIVERS[this.selectedDriver];
    this.ui.showMissionToast(`${driver?.name || 'Driver'}: "${pick(lines)}"`);
  }

  getMoney() { return this.money; }
  setPaint(id) {
    if (!CONFIG.PAINTS[id] && !CONFIG.SPONSORED_LIVERIES[id]) return false;
    this.currentPaint = id;
    Storage.setPaint(id);
    return true;
  }

  setRoute(id) {
    if (!CONFIG.ROUTES[id]) return false;
    this.selectedRoute = id;
    Storage.setSelectedRoute(id);
    this.route = CONFIG.ROUTES[id];
    return true;
  }
}

export default Game;
