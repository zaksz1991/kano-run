// Kano Run - Game Core
import { CONFIG } from './config.js';
import { Storage } from './storage.js';

export class Game {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');

    this.ui = null;

    this.running = true;
    this.paused = false;
    this.gameOver = false;
    this.state = 'menu';

    // Core player state
    this.score = 0;
    this.money = this.readMoney();
    this.coins = 0;
    this.bestScore = this.readBestScore();

    this.distance = 0;
    this.speed = CONFIG.START_SPEED || 8;
    this.maxSpeed = CONFIG.MAX_SPEED || 32;

    this.lives = CONFIG.STARTING_LIVES || 3;
    this.combo = 0;

    this.paxOnBoard = 0;
    this.capacity = this.readCapacity();

    // Vehicle
    this.playerX = 0;
    this.playerY = 0;
    this.laneX = 0;

    this.currentPaint = this.readPaint();
    this.driver = this.readDriver();

    // World
    this.roadOff = 0;
    this.roadCondition = 'normal';
    this.mudTimer = 0;

    this.shake = 0;
    this.shakeMag = 0;
    this.inv = 0;

    // Entities
    this.obs = [];
    this.paxZones = [];
    this.dropZones = [];
    this.coins = [];
    this.particles = [];
    this.dust = [];
    this.weatherParticles = [];

    // Route / environment
    this.route = CONFIG.ROUTES?.[0] || {
      id: 'kano-city',
      name: 'Kano City',
      difficulty: 1
    };

    this.district = CONFIG.DISTRICTS?.[0] || 'Kano City';

    this.mission = null;
    this.weather = CONFIG.WEATHER?.[0] || {
      id: 'clear',
      name: 'Clear',
      visibility: 1
    };

    this.BILLBOARDS = CONFIG.BILLBOARDS || [];

    // Upgrades
    this.engineLevel = this.readUpgrade('engine');
    this.hornLevel = this.readUpgrade('horn');
    this.handlingLevel = this.readUpgrade('handling');

    this.time = 0;
    this.spawnTimer = 0;
    this.passengerTimer = 0;
    this.coinTimer = 0;
    this.dustTimer = 0;

    this.nearMisses = 0;
    this.passengersDelivered = 0;

    this.lastDriverSay = 0;
  }

  /* ---------------------------------------------------------
     STORAGE
  --------------------------------------------------------- */

  readMoney() {
    try {
      const stored = localStorage.getItem(
        CONFIG.STORAGE_KEYS?.MONEY || 'kano-run-money'
      );

      if (stored === null) {
        return 5000;
      }

      const value = Number(stored);

      return Number.isFinite(value) ? Math.max(0, value) : 5000;
    } catch {
      return 5000;
    }
  }

  saveMoney() {
    try {
      localStorage.setItem(
        CONFIG.STORAGE_KEYS?.MONEY || 'kano-run-money',
        String(Math.max(0, Math.floor(this.money)))
      );
    } catch {
      // Ignore localStorage failures.
    }
  }

  readBestScore() {
    try {
      if (typeof Storage?.getBestScore === 'function') {
        const value = Number(Storage.getBestScore());
        return Number.isFinite(value) ? value : 0;
      }

      const key =
        CONFIG.STORAGE_KEYS?.BEST_SCORE || 'kano-run-best';

      const value = Number(localStorage.getItem(key));

      return Number.isFinite(value) ? value : 0;
    } catch {
      return 0;
    }
  }

  saveBestScore() {
    try {
      if (typeof Storage?.setBestScore === 'function') {
        Storage.setBestScore(this.bestScore);
        return;
      }

      const key =
        CONFIG.STORAGE_KEYS?.BEST_SCORE || 'kano-run-best';

      localStorage.setItem(key, String(this.bestScore));
    } catch {
      // Ignore storage failures.
    }
  }

  readCapacity() {
    try {
      if (typeof Storage?.getCapacity === 'function') {
        const value = Number(Storage.getCapacity());

        if (Number.isFinite(value) && value > 0) {
          return value;
        }
      }

      const key =
        CONFIG.STORAGE_KEYS?.CAPACITY || 'kano-run-capacity';

      const value = Number(localStorage.getItem(key));

      return Number.isFinite(value) && value > 0
        ? value
        : CONFIG.STARTING_CAPACITY || 3;
    } catch {
      return CONFIG.STARTING_CAPACITY || 3;
    }
  }

  readPaint() {
    try {
      if (typeof Storage?.getPaint === 'function') {
        return Storage.getPaint() || 'yellow';
      }

      return (
        localStorage.getItem(
          CONFIG.STORAGE_KEYS?.PAINT || 'kano-run-paint'
        ) || 'yellow'
      );
    } catch {
      return 'yellow';
    }
  }

  readDriver() {
    try {
      if (typeof Storage?.getDriver === 'function') {
        return Storage.getDriver() || 'hassan';
      }

      return (
        localStorage.getItem(
          CONFIG.STORAGE_KEYS?.DRIVER || 'kano-run-driver'
        ) || 'hassan'
      );
    } catch {
      return 'hassan';
    }
  }

  readUpgrade(type) {
    try {
      const key =
        CONFIG.STORAGE_KEYS?.[
          String(type).toUpperCase()
        ] || `kano-run-${type}`;

      const value = Number(localStorage.getItem(key));

      return Number.isFinite(value) && value > 0 ? value : 1;
    } catch {
      return 1;
    }
  }

  /* ---------------------------------------------------------
     CANVAS
  --------------------------------------------------------- */

  resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);

    const width = window.innerWidth;
    const height = window.innerHeight;

    this.canvas.width = Math.floor(width * dpr);
    this.canvas.height = Math.floor(height * dpr);

    this.canvas.style.width = `${width}px`;
    this.canvas.style.height = `${height}px`;

    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    this.width = width;
    this.height = height;

    this.playerX = width / 2;
    this.playerY = height * 0.78;
    this.laneX = this.playerX;
  }

  /* ---------------------------------------------------------
     GAME STATE
  --------------------------------------------------------- */

  start() {
    this.running = true;
    this.paused = false;
    this.gameOver = false;
    this.state = 'playing';

    this.score = 0;
    this.coins = 0;
    this.distance = 0;
    this.speed = CONFIG.START_SPEED || 8;

    this.lives = CONFIG.STARTING_LIVES || 3;
    this.combo = 0;

    this.paxOnBoard = 0;

    this.obs.length = 0;
    this.paxZones.length = 0;
    this.dropZones.length = 0;
    this.coins.length = 0;
    this.particles.length = 0;
    this.dust.length = 0;
    this.weatherParticles.length = 0;

    this.shake = 0;
    this.shakeMag = 0;
    this.inv = 0;

    this.spawnTimer = 0;
    this.passengerTimer = 0;
    this.coinTimer = 0;
    this.dustTimer = 0;

    this.nearMisses = 0;
    this.passengersDelivered = 0;

    this.time = 0;

    if (this.ui && typeof this.ui.update === 'function') {
      this.ui.update();
    }
  }

  restart() {
    this.start();
  }

  continueGame() {
    this.paused = false;
    this.running = true;
    this.state = 'playing';
  }

  pause() {
    this.paused = true;
    this.state = 'paused';
  }

  /* ---------------------------------------------------------
     MAIN UPDATE
  --------------------------------------------------------- */

  update(dt) {
    if (!this.running || this.paused || this.gameOver) {
      return;
    }

    const delta = Math.min(Number(dt) || 0, 32);
    const seconds = delta / 1000;

    this.time += delta;

    this.updateEffects(seconds);
    this.updateMovement(seconds);
    this.updateWorld(seconds);
    this.updateTraffic(seconds);
    this.updatePassengers(seconds);
    this.updateCoins(seconds);
    this.updateParticles(seconds);
    this.updateDistrict();

    this.distance += this.speed * seconds * 2.2;

    this.score += Math.floor(this.speed * seconds * 1.5);

    if (this.score > this.bestScore) {
      this.bestScore = this.score;
      this.saveBestScore();
    }

    if (this.ui && typeof this.ui.update === 'function') {
      this.ui.update();
    }
  }

  /* ---------------------------------------------------------
     MOVEMENT
  --------------------------------------------------------- */

  updateMovement(seconds) {
    const engine = CONFIG.UPGRADES?.engine;
    const handling = CONFIG.UPGRADES?.handling;

    const engineBonus =
      engine?.levels?.[this.engineLevel - 1]?.bonus || 0;

    const handlingBonus =
      handling?.levels?.[this.handlingLevel - 1]?.bonus || 0;

    const acceleration =
      4.5 + engineBonus * 10;

    if (this.speed < this.maxSpeed + engineBonus * 8) {
      this.speed += acceleration * seconds;
    }

    this.speed = Math.min(
      this.speed,
      this.maxSpeed + engineBonus * 8
    );

    const handlingStrength =
      260 + handlingBonus * 260;

    if (this.leftPressed) {
      this.playerX -= handlingStrength * seconds;
    }

    if (this.rightPressed) {
      this.playerX += handlingStrength * seconds;
    }

    const margin = Math.max(40, this.width * 0.08);

    this.playerX = Math.max(
      margin,
      Math.min(this.width - margin, this.playerX)
    );

    this.laneX = this.playerX;
  }

  setSteering(direction) {
    if (direction < 0) {
      this.leftPressed = true;
      this.rightPressed = false;
    } else if (direction > 0) {
      this.leftPressed = false;
      this.rightPressed = true;
    } else {
      this.leftPressed = false;
      this.rightPressed = false;
    }
  }

  lane(direction) {
    this.setSteering(direction);
  }

  /* ---------------------------------------------------------
     WORLD
  --------------------------------------------------------- */

  updateWorld(seconds) {
    this.roadOff += this.speed * seconds * 18;

    if (this.roadOff > 100000) {
      this.roadOff %= 1000;
    }

    if (this.mudTimer > 0) {
      this.mudTimer -= seconds;

      if (this.mudTimer <= 0) {
        this.roadCondition = 'normal';
      }
    }
  }

  updateDistrict() {
    const districts = CONFIG.DISTRICTS || [];

    if (!districts.length) {
      return;
    }

    const index =
      Math.floor(this.distance / 900) % districts.length;

    this.district = districts[index];
  }

  getDistrict() {
    return this.district;
  }

  /* ---------------------------------------------------------
     TRAFFIC
  --------------------------------------------------------- */

  updateTraffic(seconds) {
    this.spawnTimer -= seconds;

    const difficulty =
      Number(this.route?.difficulty) || 1;

    const spawnInterval =
      Math.max(
        0.35,
        1.15 - difficulty * 0.08 - this.distance / 30000
      );

    if (this.spawnTimer <= 0) {
      this.spawnTraffic();
      this.spawnTimer = spawnInterval;
    }

    for (let i = this.obs.length - 1; i >= 0; i--) {
      const obj = this.obs[i];

      obj.y +=
        (obj.speed || this.speed * 0.8) *
        seconds *
        12;

      if (obj.y > this.height + 180) {
        this.checkNearMiss(obj);
        this.obs.splice(i, 1);
        continue;
      }

      this.checkCollision(obj);
    }
  }

  spawnTraffic() {
    const types = CONFIG.TRAFFIC_TYPES || [
      { type: 'car', weight: 45 },
      { type: 'keke', weight: 30 },
      { type: 'police', weight: 10 },
      { type: 'truck', weight: 8 },
      { type: 'bus', weight: 7 }
    ];

    let total = 0;

    for (const item of types) {
      total += item.weight || 0;
    }

    let roll = Math.random() * total;
    let selected = types[0]?.type || 'car';

    for (const item of types) {
      roll -= item.weight || 0;

      if (roll <= 0) {
        selected = item.type;
        break;
      }
    }

    const roadWidth = this.width * 0.62;
    const left = this.width * 0.19;

    const laneCount = 4;
    const laneWidth = roadWidth / laneCount;

    const lane =
      Math.floor(Math.random() * laneCount);

    const x =
      left +
      laneWidth * lane +
      laneWidth / 2;

    this.obs.push({
      type: selected,
      x,
      y: -120,
      width:
        selected === 'truck'
          ? 62
          : selected === 'bus'
            ? 58
            : 46,
      height:
        selected === 'truck'
          ? 100
          : selected === 'bus'
            ? 105
            : 72,
      speed:
        this.speed *
        (0.55 + Math.random() * 0.55),
      passed: false
    });
  }

  checkNearMiss(obj) {
    if (!obj || obj.passed) {
      return;
    }

    obj.passed = true;

    const dx = Math.abs(this.playerX - obj.x);

    if (dx < 75 && dx > 35) {
      this.nearMisses += 1;
      this.combo = Math.min(
        (this.combo || 0) + 1,
        CONFIG.COMBO_MAX || 5
      );

      this.score += 100 * Math.max(1, this.combo);

      this.driverSay('nearMiss');
      this.addMoney(25);

      this.shake = 0.08;
      this.shakeMag = 3;
    }
  }

  checkCollision(obj) {
    if (this.inv > 0 || !obj) {
      return;
    }

    const playerY = this.playerY || this.height * 0.78;

    const dx = Math.abs(this.playerX - obj.x);
    const dy = Math.abs(playerY - obj.y);

    const hitX = dx < 48;
    const hitY = dy < 70;

    if (hitX && hitY) {
      this.collision(obj);
    }
  }

  collision(obj) {
    if (this.inv > 0) {
      return;
    }

    this.lives -= 1;
    this.combo = 0;

    this.inv = 1.2;
    this.shake = 0.35;
    this.shakeMag = 10;

    this.speed *= 0.55;

    this.driverSay('crash');

    if (this.lives <= 0) {
      this.endGame();
    }
  }

  /* ---------------------------------------------------------
     PASSENGERS
  --------------------------------------------------------- */

  updatePassengers(seconds) {
    this.passengerTimer -= seconds;

    if (this.passengerTimer <= 0) {
      this.spawnPassengerZone();

      this.passengerTimer =
        4.5 + Math.random() * 4;
    }

    for (let i = this.paxZones.length - 1; i >= 0; i--) {
      const zone = this.paxZones[i];

      zone.y += this.speed * seconds * 10;

      if (zone.y > this.height + 120) {
        this.paxZones.splice(i, 1);
        continue;
      }

      if (
        !zone.collected &&
        Math.abs(this.playerX - zone.x) < 55 &&
        Math.abs(this.playerY - zone.y) < 80
      ) {
        this.collectPassenger(zone);
      }
    }

    for (let i = this.dropZones.length - 1; i >= 0; i--) {
      const zone = this.dropZones[i];

      zone.y += this.speed * seconds * 10;

      if (zone.y > this.height + 120) {
        this.dropZones.splice(i, 1);
        continue;
      }

      if (
        !zone.completed &&
        this.paxOnBoard > 0 &&
        Math.abs(this.playerX - zone.x) < 60 &&
        Math.abs(this.playerY - zone.y) < 85
      ) {
        this.dropPassenger(zone);
      }
    }
  }

  spawnPassengerZone() {
    if (this.paxOnBoard >= this.capacity) {
      return;
    }

    const roadWidth = this.width * 0.62;
    const left = this.width * 0.19;

    this.paxZones.push({
      x:
        left +
        Math.random() * roadWidth,
      y: -80,
      width: 42,
      height: 42,
      collected: false,
      type: this.randomPassengerType()
    });
  }

  randomPassengerType() {
    const list =
      CONFIG.PASSENGER_TYPES || [];

    if (!list.length) {
      return 'worker';
    }

    return list[
      Math.floor(Math.random() * list.length)
    ].id;
  }

  collectPassenger(zone) {
    if (
      !zone ||
      zone.collected ||
      this.paxOnBoard >= this.capacity
    ) {
      return;
    }

    zone.collected = true;
    this.paxOnBoard += 1;

    this.driverSay('passenger');

    const roadWidth = this.width * 0.62;
    const left = this.width * 0.19;

    this.dropZones.push({
      x:
        left +
        Math.random() * roadWidth,
      y: -220 - Math.random() * 300,
      width: 48,
      height: 48,
      completed: false,
      type: zone.type
    });

    this.addMoney(10);
  }

  dropPassenger(zone) {
    if (!zone || zone.completed) {
      return;
    }

    zone.completed = true;

    if (this.paxOnBoard > 0) {
      this.paxOnBoard -= 1;
    }

    const passenger =
      (CONFIG.PASSENGER_TYPES || []).find(
        item => item.id === zone.type
      );

    const multiplier =
      passenger?.fareMultiplier || 1;

    const fare = Math.round(
      (CONFIG.BASE_FARE || 50) *
      multiplier
    );

    this.addMoney(fare);

    this.score += fare;

    this.passengersDelivered += 1;

    this.combo = Math.min(
      (this.combo || 0) + 1,
      CONFIG.COMBO_MAX || 5
    );

    this.driverSay('dropoff');
  }

  /* ---------------------------------------------------------
     COINS
  --------------------------------------------------------- */

  updateCoins(seconds) {
    this.coinTimer -= seconds;

    if (this.coinTimer <= 0) {
      this.spawnCoin();

      this.coinTimer =
        1.5 + Math.random() * 2.5;
    }

    for (let i = this.coins.length - 1; i >= 0; i--) {
      const coin = this.coins[i];

      coin.y += this.speed * seconds * 11;

      if (coin.y > this.height + 80) {
        this.coins.splice(i, 1);
        continue;
      }

      if (
        Math.abs(this.playerX - coin.x) < 45 &&
        Math.abs(this.playerY - coin.y) < 60
      ) {
        this.collectCoin(coin);
        this.coins.splice(i, 1);
      }
    }
  }

  spawnCoin() {
    const roadWidth = this.width * 0.62;
    const left = this.width * 0.19;

    this.coins.push({
      x:
        left +
        Math.random() * roadWidth,
      y: -40,
      value: 10
    });
  }

  collectCoin(coin) {
    const value = coin?.value || 10;

    this.coinsCollected =
      (this.coinsCollected || 0) + 1;

    this.score += value;

    this.addMoney(value);
  }

  /* ---------------------------------------------------------
     PARTICLES / EFFECTS
  --------------------------------------------------------- */

  updateParticles(seconds) {
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];

      p.x += (p.vx || 0) * seconds;
      p.y += (p.vy || 0) * seconds;

      p.life =
        (p.life ?? 1) -
        seconds;

      if (p.life <= 0) {
        this.particles.splice(i, 1);
      }
    }

    for (let i = this.dust.length - 1; i >= 0; i--) {
      const p = this.dust[i];

      p.y += (p.speed || 30) * seconds;
      p.life =
        (p.life ?? 1) -
        seconds * 0.5;

      if (p.life <= 0) {
        this.dust.splice(i, 1);
      }
    }

    this.dustTimer -= seconds;

    if (this.dustTimer <= 0) {
      this.spawnDust();
      this.dustTimer = 0.08;
    }
  }

  spawnDust() {
    this.dust.push({
      x:
        Math.random() * this.width,
      y: -10,
      speed:
        20 + Math.random() * 50,
      life:
        0.8 + Math.random() * 0.8
    });
  }

  updateEffects(seconds) {
    if (this.inv > 0) {
      this.inv -= seconds;

      if (this.inv < 0) {
        this.inv = 0;
      }
    }

    if (this.shake > 0) {
      this.shake -= seconds;

      if (this.shake < 0) {
        this.shake = 0;
      }
    }
  }

  /* ---------------------------------------------------------
     MONEY / SCORE
  --------------------------------------------------------- */

  addMoney(amount) {
    const value = Number(amount);

    if (!Number.isFinite(value)) {
      return;
    }

    this.money = Math.max(
      0,
      Math.floor(this.money + value)
    );

    this.saveMoney();
  }

  spendMoney(amount) {
    const value = Number(amount);

    if (
      !Number.isFinite(value) ||
      value < 0 ||
      this.money < value
    ) {
      return false;
    }

    this.money -= value;
    this.money = Math.max(
      0,
      Math.floor(this.money)
    );

    this.saveMoney();

    return true;
  }

  getMoney() {
    return this.money;
  }

  updateCapacity() {
    const capacityUpgrade =
      CONFIG.UPGRADES?.capacity;

    const level =
      Number(
        localStorage.getItem(
          CONFIG.STORAGE_KEYS?.CAPACITY ||
          'kano-run-capacity'
        )
      ) || 1;

    const upgrade =
      capacityUpgrade?.levels?.[
        Math.max(0, level - 1)
      ];

    const driver =
      (CONFIG.DRIVERS || []).find(
        item => item.id === this.driver
      );

    this.capacity =
      upgrade?.capacity ||
      driver?.capacity ||
      CONFIG.STARTING_CAPACITY ||
      3;
  }

  setPaint(paint) {
    this.currentPaint = paint || 'yellow';

    try {
      localStorage.setItem(
        CONFIG.STORAGE_KEYS?.PAINT ||
        'kano-run-paint',
        this.currentPaint
      );
    } catch {
      // Ignore storage failures.
    }
  }

  /* ---------------------------------------------------------
     DRIVER / AUDIO COMPATIBILITY
  --------------------------------------------------------- */

  driverSay(type) {
    const lines =
      CONFIG.DRIVER_REACTIONS?.[type];

    if (!Array.isArray(lines) || !lines.length) {
      return;
    }

    const now = performance.now();

    if (now - this.lastDriverSay < 1200) {
      return;
    }

    this.lastDriverSay = now;

    const line =
      lines[
        Math.floor(Math.random() * lines.length)
      ];

    if (
      this.ui &&
      typeof this.ui.showMessage === 'function'
    ) {
      this.ui.showMessage(line);
    }
  }

  horn() {
    if (
      this.ui &&
      typeof this.ui.horn === 'function'
    ) {
      this.ui.horn();
    }
  }

  radio() {
    if (
      this.ui &&
      typeof this.ui.openRadio === 'function'
    ) {
      this.ui.openRadio();
    }
  }

  /* ---------------------------------------------------------
     TIME / ENVIRONMENT
  --------------------------------------------------------- */

  getTime() {
    return this.time;
  }

  getDate() {
    return new Date();
  }

  getTimeOfDay() {
    const dayLength =
      CONFIG.DAY_LENGTH_MS || 120000;

    const cycle =
      (this.time % dayLength) /
      dayLength;

    if (cycle < 0.2) {
      return 'morning';
    }

    if (cycle < 0.55) {
      return 'day';
    }

    if (cycle < 0.7) {
      return 'sunset';
    }

    return 'night';
  }

  /* ---------------------------------------------------------
     GAME OVER
  --------------------------------------------------------- */

  endGame() {
    this.running = false;
    this.gameOver = true;
    this.paused = false;
    this.state = 'gameover';

    if (this.score > this.bestScore) {
      this.bestScore = this.score;
      this.saveBestScore();
    }

    this.saveMoney();

    if (
      this.ui &&
      typeof this.ui.showGameOver === 'function'
    ) {
      this.ui.showGameOver();
    }
  }
}

export default Game;