// Kano Run - Game Core
import { CONFIG } from './config.js';
import { Storage } from './storage.js';

export class Game {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d', {
      alpha: false
    });

    this.ui = null;

    this.width = 1;
    this.height = 1;

    this.running = true;
    this.paused = false;
    this.gameOver = false;

    this.state = 'menu';

    this.frame = 0;
    this.time = 0;
    this.elapsed = 0;

    this.score = 0;
    this.money = 0;
    this.coins = [];
    this.bestScore = 0;

    this.distance = 0;
    this.speed = 0;

    this.lives = 3;
    this.combo = 1;

    this.paxOnBoard = 0;
    this.capacity = 3;

    this.playerX = 0;
    this.playerY = 0;
    this.player = {
      x: 0,
      y: 0,
      speed: 0
    };

    this.laneX = 0;

    this.currentPaint = 'yellow';

    this.roadOff = 0;
    this.roadCondition = 'normal';
    this.mudTimer = 0;

    this.shake = 0;
    this.shakeMag = 0;

    this.inv = 0;

    this.obs = [];
    this.paxZones = [];
    this.dropZones = [];

    this.particles = [];
    this.dust = [];
    this.weatherParticles = [];

    this.frameTimer = 0;

    this.route = 'kano';
    this.district = 'Kano';

    this.mission = null;
    this.missionProgress = 0;

    this.weather = 'clear';

    this.BILLBOARDS = [];

    this.bestScore = this.readBestScore();
    this.money = this.readMoney();

    this.loadStorageData();

    this.resize();
  }

  readBestScore() {
    try {
      const keys = [
        'kano-run-best',
        'kanoRunBest',
        'bestScore'
      ];

      for (const key of keys) {
        const value = Number(
          localStorage.getItem(key)
        );

        if (Number.isFinite(value) && value > 0) {
          return value;
        }
      }
    } catch (_) {
      // Ignore localStorage failures.
    }

    return 0;
  }

  readMoney() {
    try {
      const keys = [
        'kano-run-money',
        'kanoRunMoney',
        'money',
        'garageMoney'
      ];

      for (const key of keys) {
        const value = Number(
          localStorage.getItem(key)
        );

        if (Number.isFinite(value) && value >= 0) {
          return value;
        }
      }
    } catch (_) {
      // Ignore localStorage failures.
    }

    return 0;
  }

  saveBestScore() {
    try {
      localStorage.setItem(
        'kano-run-best',
        String(Math.floor(this.bestScore))
      );
    } catch (_) {
      // Ignore localStorage failures.
    }
  }

  saveMoney() {
    try {
      localStorage.setItem(
        'kano-run-money',
        String(Math.floor(this.money))
      );
    } catch (_) {
      // Ignore localStorage failures.
    }
  }

  loadStorageData() {
    try {
      if (
        Storage &&
        typeof Storage.getCapacity === 'function'
      ) {
        this.capacity = Storage.getCapacity();
      }
    } catch (_) {
      this.capacity = 3;
    }

    try {
      if (
        Storage &&
        typeof Storage.getPaint === 'function'
      ) {
        const paint = Storage.getPaint();

        if (paint) {
          this.currentPaint = paint;
        }
      }
    } catch (_) {
      // Keep default paint.
    }

    try {
      if (
        Storage &&
        typeof Storage.getMoney === 'function'
      ) {
        const storedMoney = Number(
          Storage.getMoney()
        );

        if (
          Number.isFinite(storedMoney) &&
          storedMoney >= 0
        ) {
          this.money = storedMoney;
        }
      }
    } catch (_) {
      // Keep localStorage value.
    }
  }

  resize() {
    if (!this.canvas) {
      return;
    }

    const rect =
      this.canvas.getBoundingClientRect();

    const dpr = Math.min(
      window.devicePixelRatio || 1,
      2
    );

    this.width = Math.max(
      1,
      rect.width
    );

    this.height = Math.max(
      1,
      rect.height
    );

    this.canvas.width =
      Math.floor(this.width * dpr);

    this.canvas.height =
      Math.floor(this.height * dpr);

    this.ctx.setTransform(
      dpr,
      0,
      0,
      dpr,
      0,
      0
    );
  }

  start() {
    this.running = true;
    this.paused = false;
    this.gameOver = false;
    this.state = 'playing';

    this.frame = 0;
    this.time = 0;
    this.elapsed = 0;

    this.score = 0;
    this.distance = 0;
    this.speed = 0;

    this.lives = 3;
    this.combo = 1;

    this.paxOnBoard = 0;

    this.shake = 0;
    this.shakeMag = 0;
    this.inv = 0;

    this.obs.length = 0;
    this.paxZones.length = 0;
    this.dropZones.length = 0;

    this.coins.length = 0;
    this.particles.length = 0;
    this.dust.length = 0;
    this.weatherParticles.length = 0;

    this.roadOff = 0;

    this.updateCapacity();

    if (this.ui) {
      this.ui.update();
    }
  }

  restart() {
    this.start();
  }

  continueGame() {
    this.gameOver = false;
    this.running = true;
    this.paused = false;
    this.state = 'playing';

    this.inv = 1800;
    this.lives = Math.max(
      1,
      this.lives
    );

    this.speed = Math.max(
      this.speed,
      12
    );
  }

  pause() {
    this.paused = !this.paused;

    if (this.paused) {
      this.state = 'paused';
    } else if (!this.gameOver) {
      this.state = 'playing';
    }
  }

  update(dt) {
    if (
      !this.running ||
      this.paused ||
      this.gameOver
    ) {
      return;
    }

    dt = Math.min(
      40,
      Math.max(0, Number(dt) || 0)
    );

    const seconds = dt / 1000;

    this.frame += 1;
    this.time += dt;
    this.elapsed += seconds;

    this.updateMovement(dt, seconds);
    this.updateWorld(dt, seconds);
    this.updateTraffic(dt, seconds);
    this.updatePassengers(dt, seconds);
    this.updateCoins(dt, seconds);
    this.updateParticles(dt);
    this.updateEffects(dt);

    this.updateScore(seconds);

    if (this.ui) {
      this.ui.update();
    }
  }

  updateMovement(dt, seconds) {
    const acceleration = 7;
    const maxSpeed = 32;

    this.speed = Math.min(
      maxSpeed,
      this.speed + acceleration * seconds
    );

    this.distance +=
      this.speed * seconds;

    this.roadOff +=
      this.speed * dt * 0.07;

    this.playerY =
      this.height * 0.82;

    this.player.x = this.playerX;
    this.player.y = this.playerY;
    this.player.speed = this.speed;

    this.laneX = this.playerX;
  }

  updateWorld(dt, seconds) {
    if (this.mudTimer > 0) {
      this.mudTimer -= dt;

      if (this.mudTimer <= 0) {
        this.mudTimer = 0;
        this.roadCondition = 'normal';
      }
    }

    if (
      Math.floor(this.distance) > 0 &&
      Math.floor(this.distance) % 500 === 0
    ) {
      this.updateDistrict();
    }

    if (
      Math.random() <
      seconds * 0.12
    ) {
      this.spawnAmbientDust();
    }
  }

  updateTraffic(dt, seconds) {
    for (
      let i = this.obs.length - 1;
      i >= 0;
      i -= 1
    ) {
      const obstacle = this.obs[i];

      if (!obstacle) {
        this.obs.splice(i, 1);
        continue;
      }

      obstacle.z =
        (Number(obstacle.z) || 0.5) +
        this.speed *
        seconds *
        0.0008;

      if (obstacle.z > 1.15) {
        this.obs.splice(i, 1);
        continue;
      }

      if (
        obstacle.z > 0.86 &&
        obstacle.z < 1.02
      ) {
        const obstacleLane =
          Number(obstacle.lane) ||
          Number(obstacle.x) ||
          0;

        const playerLane =
          Number(this.playerX) || 0;

        if (
          Math.abs(
            obstacleLane - playerLane
          ) < 0.32 &&
          this.inv <= 0
        ) {
          this.handleCollision(
            obstacle
          );

          this.obs.splice(i, 1);
        } else if (
          Math.abs(
            obstacleLane - playerLane
          ) < 0.55
        ) {
          this.combo = Math.min(
            5,
            this.combo + 0.15
          );

          this.driverSay('nearMiss');
        }
      }
    }

    const spawnRate =
      0.8 +
      Math.min(
        1.8,
        this.distance / 2500
      );

    if (
      Math.random() <
      seconds * spawnRate
    ) {
      this.spawnTraffic();
    }
  }

  updatePassengers(dt, seconds) {
    for (
      let i = this.paxZones.length - 1;
      i >= 0;
      i -= 1
    ) {
      const zone =
        this.paxZones[i];

      if (!zone) {
        this.paxZones.splice(i, 1);
        continue;
      }

      zone.z =
        (Number(zone.z) || 0.5) +
        this.speed *
        seconds *
        0.0007;

      if (zone.z > 1.15) {
        this.paxZones.splice(i, 1);
      }
    }

    for (
      let i = this.dropZones.length - 1;
      i >= 0;
      i -= 1
    ) {
      const zone =
        this.dropZones[i];

      if (!zone) {
        this.dropZones.splice(i, 1);
        continue;
      }

      zone.z =
        (Number(zone.z) || 0.5) +
        this.speed *
        seconds *
        0.0007;

      if (zone.z > 1.15) {
        this.dropZones.splice(i, 1);
      }
    }

    if (
      Math.random() <
      seconds * 0.05
    ) {
      this.spawnPassengerZone();
    }
  }

  updateCoins(dt, seconds) {
    for (
      let i = this.coins.length - 1;
      i >= 0;
      i -= 1
    ) {
      const coin =
        this.coins[i];

      if (!coin) {
        this.coins.splice(i, 1);
        continue;
      }

      coin.z =
        (Number(coin.z) || 0.5) +
        this.speed *
        seconds *
        0.0008;

      if (coin.z > 1.15) {
        this.coins.splice(i, 1);
        continue;
      }

      if (
        coin.z > 0.9 &&
        Math.abs(
          (Number(coin.lane) || 0) -
          this.playerX
        ) < 0.35
      ) {
        this.collectCoin(i);
      }
    }

    if (
      Math.random() <
      seconds * 0.06
    ) {
      this.spawnCoin();
    }
  }

  updateParticles(dt) {
    this.updateParticleArray(
      this.particles,
      dt
    );

    this.updateParticleArray(
      this.dust,
      dt
    );

    this.updateParticleArray(
      this.weatherParticles,
      dt
    );
  }

  updateParticleArray(list, dt) {
    if (!Array.isArray(list)) {
      return;
    }

    for (
      let i = list.length - 1;
      i >= 0;
      i -= 1
    ) {
      const p = list[i];

      if (!p) {
        list.splice(i, 1);
        continue;
      }

      if (p.x !== undefined) {
        p.x +=
          Number(p.vx) || 0;
      }

      if (p.y !== undefined) {
        p.y +=
          Number(p.vy) || 0;
      }

      if (p.alpha !== undefined) {
        p.alpha -=
          (Number(p.fade) || 0.001) *
          dt;
      }

      if (
        p.life !== undefined
      ) {
        p.life -= dt;
      }

      if (
        (p.life !== undefined &&
          p.life <= 0) ||
        (p.alpha !== undefined &&
          p.alpha <= 0)
      ) {
        list.splice(i, 1);
      }
    }
  }

  updateEffects(dt) {
    if (this.inv > 0) {
      this.inv -= dt;

      if (this.inv < 0) {
        this.inv = 0;
      }
    }

    if (this.shake > 0) {
      this.shake -= dt;

      if (this.shake < 0) {
        this.shake = 0;
      }
    }
  }

  updateScore(seconds) {
    this.score +=
      this.speed *
      seconds *
      0.8 *
      this.combo;

    if (
      this.score > this.bestScore
    ) {
      this.bestScore =
        Math.floor(this.score);

      this.saveBestScore();
    }

    if (
      Math.floor(this.distance) > 0 &&
      Math.floor(this.distance) % 175 === 0
    ) {
      this.money += 1;
      this.saveMoney();
    }
  }

  spawnTraffic() {
    const lanes = [-1, 0, 1];

    const lane =
      lanes[
        Math.floor(
          Math.random() *
          lanes.length
        )
      ];

    const types = [
      'car',
      'keke',
      'car',
      'police'
    ];

    const type =
      types[
        Math.floor(
          Math.random() *
          types.length
        )
      ];

    this.obs.push({
      type,
      lane,
      x: lane,
      z: 0.05,
      color: this.randomTrafficColor()
    });
  }

  randomTrafficColor() {
    const colors = [
      '#dc2626',
      '#2563eb',
      '#16a34a',
      '#f8fafc',
      '#111827',
      '#f97316',
      '#a855f7'
    ];

    return colors[
      Math.floor(
        Math.random() *
        colors.length
      )
    ];
  }

  spawnPassengerZone() {
    const lanes = [-1, 0, 1];

    const lane =
      lanes[
        Math.floor(
          Math.random() *
          lanes.length
        )
      ];

    this.paxZones.push({
      lane,
      x: lane,
      z: 0.08
    });
  }

  spawnCoin() {
    const lanes = [-1, 0, 1];

    const lane =
      lanes[
        Math.floor(
          Math.random() *
          lanes.length
        )
      ];

    this.coins.push({
      lane,
      x: lane,
      z: 0.05
    });
  }

  spawnAmbientDust() {
    this.dust.push({
      x:
        Math.random() *
        Math.max(1, this.width),

      y:
        this.height *
          0.45 +
        Math.random() *
          this.height *
          0.45,

      vx:
        (Math.random() - 0.5) *
        0.3,

      vy:
        -0.1 -
        Math.random() * 0.2,

      size:
        1 +
        Math.random() * 3,

      alpha:
        0.1 +
        Math.random() * 0.25,

      fade:
        0.0004 +
        Math.random() * 0.0008,

      life:
        1000 +
        Math.random() * 2500,

      color:
        'rgba(210,180,130,0.8)'
    });
  }

  collectCoin(index) {
    this.coins.splice(
      index,
      1
    );

    this.money += 5;
    this.score +=
      25 * this.combo;

    this.combo =
      Math.min(
        5,
        this.combo + 0.25
      );

    this.saveMoney();

    this.spawnCollectionParticles();
  }

  spawnCollectionParticles() {
    for (let i = 0; i < 8; i += 1) {
      this.particles.push({
        x:
          this.width / 2 +
          (Math.random() - 0.5) *
            70,

        y:
          this.height * 0.75 +
          (Math.random() - 0.5) *
            50,

        vx:
          (Math.random() - 0.5) *
          1.5,

        vy:
          -Math.random() * 1.5,

        size:
          2 +
          Math.random() * 3,

        alpha: 1,
        fade: 0.002,
        life: 700,
        color: '#fbbf24'
      });
    }
  }

  handleCollision(obstacle) {
    if (this.inv > 0) {
      return;
    }

    this.lives -= 1;

    this.combo = 1;

    this.score = Math.max(
      0,
      this.score - 50
    );

    this.shake = 350;
    this.shakeMag = 12;

    this.inv = 1500;

    this.driverSay('crash');

    if (this.lives <= 0) {
      this.endGame();
    }
  }

  endGame() {
    this.gameOver = true;
    this.running = false;
    this.state = 'gameover';

    if (
      this.score >
      this.bestScore
    ) {
      this.bestScore =
        Math.floor(this.score);

      this.saveBestScore();
    }

    this.saveMoney();

    if (this.ui) {
      this.ui.update();
    }
  }

  driverSay(type) {
    const lines =
      CONFIG &&
      CONFIG.DRIVER_REACTIONS
        ? CONFIG.DRIVER_REACTIONS[type]
        : null;

    if (
      !lines ||
      !lines.length
    ) {
      return;
    }

    const line =
      lines[
        Math.floor(
          Math.random() *
          lines.length
        )
      ];

    if (
      this.ui &&
      typeof this.ui.showToast ===
        'function'
    ) {
      this.ui.showToast(line);
    }

    return line;
  }

  horn() {
    this.shake = Math.max(
      this.shake,
      80
    );

    this.shakeMag = Math.max(
      this.shakeMag,
      2
    );

    if (
      this.ui &&
      typeof this.ui.horn ===
        'function'
    ) {
      this.ui.horn();
    }
  }

  radio() {
    if (
      CONFIG &&
      CONFIG.RADIO_STATIONS &&
      CONFIG.RADIO_STATIONS.length
    ) {
      const index =
        Math.floor(
          this.frame / 600
        ) %
        CONFIG.RADIO_STATIONS.length;

      return CONFIG.RADIO_STATIONS[
        index
      ];
    }

    return 'Kano Run Radio';
  }

  lane() {
    return Math.round(
      this.playerX * 3
    );
  }

  getDistrict() {
    return this.district;
  }

  updateDistrict() {
    const districts = [
      'Kano City',
      'Sabon Gari',
      'Fagge',
      'Dala',
      'Kumbotso',
      'Nassarawa',
      'Gwale',
      'Tarauni',
      'Ungogo'
    ];

    const index =
      Math.floor(
        this.distance / 500
      ) %
      districts.length;

    this.district =
      districts[index];
  }

  getTime() {
    return this.time;
  }

  getDate() {
    return new Date();
  }

  getTimeOfDay() {
    const cycle =
      this.time % 120000;

    return cycle / 120000;
  }

  updateCapacity() {
    try {
      if (
        Storage &&
        typeof Storage.getCapacity ===
          'function'
      ) {
        this.capacity =
          Storage.getCapacity();
      }
    } catch (_) {
      this.capacity = 3;
    }

    if (
      !Number.isFinite(
        this.capacity
      ) ||
      this.capacity < 1
    ) {
      this.capacity = 3;
    }
  }

  setPaint(paint) {
    if (!paint) {
      return;
    }

    this.currentPaint = paint;

    try {
      if (
        Storage &&
        typeof Storage.setPaint ===
          'function'
      ) {
        Storage.setPaint(paint);
      }
    } catch (_) {
      // Ignore storage errors.
    }
  }

  addMoney(amount) {
    const value =
      Number(amount) || 0;

    this.money = Math.max(
      0,
      this.money + value
    );

    this.saveMoney();
  }

  spendMoney(amount) {
    const value =
      Math.max(
        0,
        Number(amount) || 0
      );

    if (
      this.money < value
    ) {
      return false;
    }

    this.money -= value;
    this.saveMoney();

    return true;
  }
}