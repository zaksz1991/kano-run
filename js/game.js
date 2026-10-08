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
    this.targetSpeed = 3.6;
    this.maxSpeed = 7.2;

    this.frame = 0;
    this.roadOff = 0;

    this.playerLane = 1;
    this.playerX = 0;
    this.targetX = 0;
    this.playerY = 0;
    this.playerZ = 0;

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

    this.selectedRoute =
      Storage.getRoute?.() ||
      'citycenter';

    this.selectedDriver =
      Storage.getDriver?.() ||
      'ruffneck';

    this.selectedPaint =
      Storage.getPaint?.() ||
      'classic';

    this.radioIndex =
      Number(Storage.getRadio?.() ?? 0) || 0;

    this.nearMissCount = 0;
    this.landmarkIndex = 0;
    this.karotaTimer = 0;

    this.high =
      Number(Storage.getHighScore?.() ?? 0) || 0;

    this.money =
      Number(Storage.getMoney?.() ?? 0) || 0;

    this.activeMission = null;

    this.throttle = 1;
    this.brakeInput = 0;

    this.isPaused = false;

    this.activePassenger = null;
    this.pendingNegotiation = null;
    this.pendingDrop = null;
    this.passengerVoiceCooldown = 0;

    this.passengerAddresses = [
      'Oga',
      'Mai Gida',
      'Mallam',
      'Yallabai',
      'Yaya',
      'Baba',
      'Hajiya',
      'Mama',
      'Dan uwa',
      'Boss',
      'Madam',
      'Sister',
      'Brother',
      'Driver'
    ];

    this.destinations = [
      { name: 'Sabon Gari', min: 1.0, max: 2.8 },
      { name: 'Kofar Mata', min: 0.8, max: 2.2 },
      { name: 'Fagge', min: 0.8, max: 2.3 },
      { name: 'Naibawa', min: 1.4, max: 3.4 },
      { name: 'Zoo Road', min: 1.0, max: 2.6 },
      { name: 'Tarauni', min: 1.2, max: 3.0 },
      { name: 'Hotoro', min: 1.4, max: 3.5 },
      { name: 'Bompai', min: 1.0, max: 2.7 },
      { name: 'Dala', min: 0.8, max: 2.4 },
      { name: 'Kano Central', min: 0.7, max: 2.0 },
      { name: 'Kantin Kwari', min: 1.0, max: 2.7 },
      { name: 'Kofar Wambai', min: 0.8, max: 2.3 },
      { name: 'Farm Centre', min: 1.3, max: 3.2 },
      { name: 'Airport Road', min: 1.8, max: 4.0 },
      { name: 'Gyadi-Gyadi', min: 1.4, max: 3.2 },
      { name: 'Kofar Nassarawa', min: 0.9, max: 2.4 },
      { name: 'Dorayi', min: 1.5, max: 3.5 },
      { name: 'Challawa', min: 1.8, max: 4.0 },
      { name: 'Sheka', min: 1.6, max: 3.8 },
      { name: 'Jaiz Bank', min: 1.0, max: 2.8 },
      { name: 'Wudil Road', min: 1.5, max: 3.6 },
      { name: 'Kumbotso', min: 1.6, max: 3.8 },
      { name: 'Mando', min: 1.2, max: 3.0 },
      { name: 'Gidan Murtala', min: 1.0, max: 2.7 },
      { name: 'France Road', min: 0.9, max: 2.3 },
      { name: 'Court Road', min: 0.8, max: 2.2 },
      { name: 'Kofar Dan Agundi', min: 0.9, max: 2.4 },
      { name: 'Unguwa Uku', min: 1.4, max: 3.1 },
      { name: 'Hotoro GRA', min: 1.5, max: 3.5 },
      { name: 'Aminu Kano Way', min: 1.0, max: 2.8 }
    ];

    this.passengerTypes = [
      {
        type: 'regular',
        weight: 58,
        seats: 1,
        fareMultiplier: 1
      },
      {
        type: 'student',
        weight: 16,
        seats: 1,
        fareMultiplier: 0.9
      },
      {
        type: 'market',
        weight: 10,
        seats: 1,
        fareMultiplier: 1.05
      },
      {
        type: 'worker',
        weight: 9,
        seats: 1,
        fareMultiplier: 1.1
      },
      {
        type: 'vip',
        weight: 4,
        seats: 1,
        fareMultiplier: 1.45
      },
      {
        type: 'aishat',
        weight: 3,
        seats: 2,
        fareMultiplier: 1.35
      }
    ];

    this.weatherState = 'clear';

    this.eventCooldown = 0;
    this.trafficSpawnCooldown = 0;
    this.passengerSpawnCooldown = 120;
    this.coinSpawnCooldown = 80;

    this.lastRoadSide = 'right';

    this.introSequence = {
      active: false,
      stage: 'idle',
      frame: 0,
      duration: 0
    };

    this._externalThrottle = false;
    this._externalBrake = false;

    this._lastHudFrame = -1;

    this._bindKeyboard();
  }

  setUI(ui) {
    this.ui = ui;
    return this;
  }

  setRenderer(renderer) {
    this.renderer3d = renderer;
    return this;
  }

  _bindKeyboard() {
    this._onKeyDown = (event) => {
      const key = String(event.key || '').toLowerCase();

      if (
        key === 'arrowleft' ||
        key === 'arrowright' ||
        key === 'arrowup' ||
        key === 'arrowdown' ||
        key === ' '
      ) {
        event.preventDefault();
      }

      this.keys[key] = true;

      if (
        key === 'arrowleft' ||
        key === 'a'
      ) {
        this.changeLane(-1);
      }

      if (
        key === 'arrowright' ||
        key === 'd'
      ) {
        this.changeLane(1);
      }

      if (
        key === 'arrowup' ||
        key === 'w'
      ) {
        this._externalThrottle = true;
        this.setThrottle(1);
      }

      if (
        key === 'arrowdown' ||
        key === 's' ||
        key === ' '
      ) {
        this._externalBrake = true;
        this.setBrake(1);
      }

      if (
        key === 'p' ||
        key === 'escape'
      ) {
        this.togglePause();
      }

      if (
        key === 'h' ||
        key === 'enter'
      ) {
        this.horn();
      }

      if (key === 'r') {
        this.cycleRadio();
      }
    };

    this._onKeyUp = (event) => {
      const key = String(event.key || '').toLowerCase();

      this.keys[key] = false;

      if (
        key === 'arrowup' ||
        key === 'w'
      ) {
        this._externalThrottle = false;
      }

      if (
        key === 'arrowdown' ||
        key === 's' ||
        key === ' '
      ) {
        this._externalBrake = false;
      }
    };

    window.addEventListener(
      'keydown',
      this._onKeyDown,
      { passive: false }
    );

    window.addEventListener(
      'keyup',
      this._onKeyUp,
      { passive: false }
    );
  }

  destroy() {
    window.removeEventListener(
      'keydown',
      this._onKeyDown
    );

    window.removeEventListener(
      'keyup',
      this._onKeyUp
    );
  }

  setThrottle(value = 1) {
    this.throttle = Math.max(
      0,
      Math.min(
        1,
        Number(value) || 0
      )
    );
  }

  accelerate(active = true) {
    this.setThrottle(active ? 1 : 0);
  }

  setBrake(value = 1) {
    this.brakeInput = Math.max(
      0,
      Math.min(
        1,
        Number(value) || 0
      )
    );
  }

  brake(active = true) {
    this.setBrake(active ? 1 : 0);
  }

  togglePause() {
    if (
      this.state !== STATE.PLAY &&
      !this.isPaused
    ) {
      return;
    }

    if (this.isPaused) {
      this.resume();
    } else {
      this.pause();
    }
  }

  pause() {
    if (this.state !== STATE.PLAY) {
      return;
    }

    this.isPaused = true;

    try {
      Audio.pause?.();
    } catch {}

    this.ui?.showPause?.();
    this.renderer3d?.setPaused?.(true);
  }

  resume() {
    this.isPaused = false;

    try {
      Audio.resume?.();
    } catch {}

    this.ui?.hidePause?.();
    this.renderer3d?.setPaused?.(false);
  }

  initDaily() {
    this.ui?.updateDailyUI?.(
      Storage.getDailyStatus?.()
    );
  }

  claimDaily() {
    if (Storage.isDailyClaimed?.()) {
      this.ui?.showMissionToast?.(
        'Daily reward already claimed.'
      );
      return false;
    }

    const streak =
      Number(Storage.getDailyStreak?.() ?? 0) || 0;

    const reward =
      500 +
      Math.min(
        500,
        streak * 50
      );

    this.money += reward;

    Storage.setMoney?.(this.money);
    Storage.claimDaily?.();

    this.ui?.updateHUD?.(this);
    this.ui?.updateDailyUI?.(
      Storage.getDailyStatus?.()
    );

    this.ui?.showMissionToast?.(
      `Daily reward +₦${reward}`
    );

    return true;
  }

  getDriver() {
    return (
      CONFIG.DRIVERS?.[this.selectedDriver] ||
      CONFIG.DRIVERS?.ruffneck ||
      {
        id: 'ruffneck',
        name: 'RuffNeck',
        bonuses: {}
      }
    );
  }

  getBonuses() {
    return this.getDriver().bonuses || {};
  }

  cycleRadio() {
    if (
      !Array.isArray(CONFIG.RADIO) ||
      !CONFIG.RADIO.length
    ) {
      return;
    }

    this.radioIndex =
      (
        this.radioIndex + 1
      ) % CONFIG.RADIO.length;

    Storage.setRadio?.(
      this.radioIndex
    );

    const station =
      CONFIG.RADIO[this.radioIndex] ||
      CONFIG.RADIO[0];

    this.ui?.setRadio?.(
      station.name
    );

    this.ui?.showMissionToast?.(
      `📻 ${station.name}`
    );

    try {
      Audio.changeRadio?.(
        station,
        this.radioIndex
      );

      Audio.playRadio?.(
        station,
        this.radioIndex
      );

      Audio.setRadio?.(
        station,
        this.radioIndex
      );

      Audio.beep?.(
        440,
        0.05,
        'sine',
        0.03
      );
    } catch {}
  }

  resize() {
    if (!this.canvas?.parentElement) {
      return;
    }

    const rect =
      this.canvas.parentElement.getBoundingClientRect();

    this.canvas.style.width =
      `${rect.width}px`;

    this.canvas.style.height =
      `${rect.height}px`;

    this.renderer3d?.resize?.();
  }

  laneX(lane) {
    const width =
      this.canvas?.clientWidth || 900;

    const pad = 18;

    const laneWidth =
      (
        width -
        pad * 2
      ) /
      Math.max(
        1,
        CONFIG.LANES || 3
      );

    return (
      pad +
      lane * laneWidth +
      laneWidth / 2
    );
  }

  getTimeOfDay() {
    return (
      this.frame % 5400
    ) / 5400;
  }

  getTrafficPeriod() {
    const t = this.getTimeOfDay();

    if (t < 0.12) return 'dawn';
    if (t < 0.32) return 'morning';
    if (t < 0.52) return 'midday';
    if (t < 0.72) return 'afternoon';
    if (t < 0.88) return 'evening';

    return 'night';
  }

  getWeather() {
    return this.weatherState;
  }

  start() {
    this.state = STATE.PLAY;
    this.isPaused = false;

    this.score = 0;
    this.dist = 0;

    this.paxOnBoard = 0;
    this.totalPax = 0;
    this.dropCount = 0;

    this.continuesLeft = 3;
    this.paidContinuesUsed = 0;

    this.combo = 0;
    this.comboTimer = 0;

    this.frame = 0;
    this.roadOff = 0;

    this.playerLane = 1;
    this.playerX =
      this.laneX(
        this.playerLane
      );

    this.targetX =
      this.playerX;

    this.playerY = 0;
    this.playerZ = 0;

    this.inv = 0;
    this.bounce = 0;
    this.shake = 0;
    this.shakeMag = 0;

    this.obs.length = 0;
    this.paxZones.length = 0;
    this.dropZones.length = 0;
    this.coins.length = 0;

    this.trafficJamTimer = 0;
    this.nearMissCooldown = 0;
    this.policeChase = 0;
    this.nearMissCount = 0;

    this.landmarkIndex = 0;
    this.karotaTimer = 0;

    this.activePassenger = null;
    this.pendingNegotiation = null;
    this.pendingDrop = null;

    this.passengerVoiceCooldown = 0;

    this.eventCooldown = 300;
    this.trafficSpawnCooldown = 40;
    this.passengerSpawnCooldown = 100;
    this.coinSpawnCooldown = 70;

    this.throttle = 1;
    this.brakeInput = 0;

    this._externalThrottle = false;
    this._externalBrake = false;

    this.activeMission =
      this.randomMission();

    this.ui?.showPlaying?.();
    this.ui?.setMission?.(
      this.activeMission
    );

    this.ui?.setRouteLabel?.(
      this.getRouteName()
    );

    this.ui?.setDriverLabel?.(
      this.getDriver().name ||
      this.selectedDriver
    );

    if (
      Array.isArray(CONFIG.RADIO) &&
      CONFIG.RADIO.length
    ) {
      const station =
        CONFIG.RADIO[
          this.radioIndex
        ] ||
        CONFIG.RADIO[0];

      this.ui?.setRadio?.(
        station.name
      );

      try {
        Audio.playRadio?.(
          station,
          this.radioIndex
        );
      } catch {}
    }

    const bonuses =
      this.getBonuses();

    this.speed =
      3.4 +
      (
        Number(
          bonuses.speed
        ) || 0
      );

    this.targetSpeed =
      this.speed;

    this.maxSpeed =
      7.2 +
      (
        Number(
          bonuses.speed
        ) || 0
      );

    try {
      Audio.startEngine?.();
    } catch {}

    this.renderer3d?.applyPaint?.(
      this.selectedPaint
    );

    this.renderer3d?.startOpeningSequence?.(
      this.selectedDriver,
      this.selectedPaint
    );

    this.introSequence = {
      active: true,
      stage: 'walk_to_keke',
      frame: 0,
      duration: 210
    };

    this.initDaily();

    this.ui?.showEvent?.({
      title: 'Kano Run',
      text:
        'Left/Right steer. Hold GAS to accelerate and BRAKE to slow down. Stop for roadside passengers. Passengers call destinations, and "Akwai" means they want to get down.',
      actions: [
        {
          label: 'Start Driving',
          primary: true,
          onClick: () => {
            this.ui?.hideEvent?.();
          }
        }
      ]
    });

    this.updateHUD(true);
  }

  restart() {
    this.start();
  }

  updateOpeningSequence() {
    if (!this.introSequence?.active) {
      return;
    }

    this.introSequence.frame++;

    const f =
      this.introSequence.frame;

    if (f < 75) {
      this.introSequence.stage =
        'walk_to_keke';
    } else if (f < 120) {
      this.introSequence.stage =
        'enter_keke';
    } else if (f < 165) {
      this.introSequence.stage =
        'start_engine';
    } else if (f < 210) {
      this.introSequence.stage =
        'ready';
    } else {
      this.introSequence.stage =
        'complete';

      this.introSequence.active =
        false;
    }

    this.renderer3d?.updateOpeningSequence?.(
      this.introSequence
    );
  }

  triggerShake(amount = 4) {
    this.shake =
      Math.max(
        this.shake,
        16
      );

    this.shakeMag =
      Math.max(
        this.shakeMag,
        amount
      );
  }

  addCombo(value = 1) {
    this.combo += value;

    this.comboTimer = 300;

    return this.getComboMultiplier();
  }

  getComboMultiplier() {
    if (this.combo >= 20) return 3;
    if (this.combo >= 12) return 2.5;
    if (this.combo >= 8) return 2;
    if (this.combo >= 4) return 1.5;

    return 1;
  }

  changeLane(direction) {
    if (
      this.state !== STATE.PLAY ||
      this.isPaused ||
      this.introSequence?.active
    ) {
      return;
    }

    const lanes =
      Math.max(
        1,
        CONFIG.LANES || 3
      );

    const next =
      Math.max(
        0,
        Math.min(
          lanes - 1,
          this.playerLane + direction
        )
      );

    if (
      next === this.playerLane
    ) {
      return;
    }

    this.playerLane = next;
    this.targetX =
      this.laneX(
        this.playerLane
      );

    try {
      Audio.steer?.(
        direction
      );
    } catch {}
  }

  horn() {
    if (
      this.state !== STATE.PLAY ||
      this.isPaused
    ) {
      return;
    }

    try {
      Audio.horn?.();
    } catch {}

    this.ui?.showMissionToast?.(
      'HONK!'
    );

    for (
      const obstacle of this.obs
    ) {
      if (
        obstacle.used ||
        obstacle.lane !== this.playerLane
      ) {
        continue;
      }

      if (
        Math.abs(
          obstacle.y -
          this.playerY
        ) < 110
      ) {
        obstacle.hornReaction = 24;

        if (
          obstacle.type === 'pedestrian'
        ) {
          obstacle.y -= 10;
        }
      }
    }

    this.inv =
      Math.max(
        this.inv,
        18
      );
  }

  randomAddress() {
    return this.passengerAddresses[
      Math.floor(
        Math.random() *
        this.passengerAddresses.length
      )
    ];
  }

  randomDestination() {
    return this.destinations[
      Math.floor(
        Math.random() *
        this.destinations.length
      )
    ];
  }

  randomPassengerType() {
    const total =
      this.passengerTypes.reduce(
        (sum, item) =>
          sum + item.weight,
        0
      );

    let roll =
      Math.random() * total;

    for (
      const type of this.passengerTypes
    ) {
      roll -= type.weight;

      if (roll <= 0) {
        return type;
      }
    }

    return this.passengerTypes[0];
  }

  createPassenger() {
    const type =
      this.randomPassengerType();

    const destination =
      this.randomDestination();

    const passenger = {
      id:
        `p-${this.frame}-${Math.random()
          .toString(36)
          .slice(2, 8)}`,

      type: type.type,

      seats: type.seats,

      fareMultiplier:
        type.fareMultiplier,

      address:
        this.randomAddress(),

      destination:
        destination.name,

      distance:
        destination.min +
        Math.random() *
        (
          destination.max -
          destination.min
        ),

      lane:
        Math.floor(
          Math.random() *
          Math.max(
            1,
            CONFIG.LANES || 3
          )
        ),

      y:
        -360 -
        Math.random() * 500,

      state: 'waiting',

      called: false,
      negotiated: false,
      taken: false,
      dropped: false,

      language: 'ha',

      roadside: true,

      wave:
        Math.random() * Math.PI * 2
    };

    return passenger;
  }

  spawnPassenger() {
    if (
      this.paxZones.length >= 8
    ) {
      return;
    }

    const passenger =
      this.createPassenger();

    this.paxZones.push(
      passenger
    );

    this.passengerSpawnCooldown =
      150 +
      Math.floor(
        Math.random() * 150
      );
  }

  randomTrafficType() {
    const types = [
      'keke',
      'keke',
      'car',
      'car',
      'taxi',
      'bus',
      'motorcycle',
      'truck'
    ];

    return types[
      Math.floor(
        Math.random() *
        types.length
      )
    ];
  }

  spawnTraffic() {
    if (
      this.obs.length >= 16
    ) {
      return;
    }

    const lanes =
      Math.max(
        1,
        CONFIG.LANES || 3
      );

    let lane =
      Math.floor(
        Math.random() * lanes
      );

    const type =
      this.randomTrafficType();

    const obstacle = {
      id:
        `traffic-${this.frame}-${Math.random()
          .toString(36)
          .slice(2, 7)}`,

      type,

      lane,

      y:
        -700 -
        Math.random() * 900,

      speed:
        2.4 +
        Math.random() * 2.8,

      width:
        type === 'truck'
          ? 48
          : type === 'bus'
            ? 46
            : 38,

      height:
        type === 'truck'
          ? 100
          : type === 'bus'
            ? 110
            : 78,

      used: false,

      laneChangeTimer:
        100 +
        Math.floor(
          Math.random() * 300
        ),

      targetLane: lane,

      hornReaction: 0,

      aggressive:
        Math.random() < 0.12,

      stopped:
        false
    };

    for (
      const existing of this.obs
    ) {
      if (
        existing.lane === lane &&
        Math.abs(
          existing.y -
          obstacle.y
        ) < 160
      ) {
        lane =
          Math.floor(
            Math.random() * lanes
          );

        obstacle.lane = lane;
        obstacle.targetLane = lane;
      }
    }

    this.obs.push(
      obstacle
    );

    this.trafficSpawnCooldown =
      Math.max(
        25,
        75 -
        Math.floor(
          this.dist * 0.4
        )
      );
  }

  spawnCoin() {
    if (
      this.coins.length >= 8
    ) {
      return;
    }

    this.coins.push({
      lane:
        Math.floor(
          Math.random() *
          Math.max(
            1,
            CONFIG.LANES || 3
          )
        ),

      y:
        -300 -
        Math.random() * 700,

      value:
        25 +
        Math.floor(
          Math.random() * 5
        ) * 10,

      used: false,

      spin:
        Math.random() *
        Math.PI * 2
    });

    this.coinSpawnCooldown =
      100 +
      Math.floor(
        Math.random() * 100
      );
  }

  updateTraffic() {
    for (
      const obstacle of this.obs
    ) {
      if (obstacle.used) {
        continue;
      }

      obstacle.y +=
        (
          this.speed -
          obstacle.speed
        ) * 2.1;

      obstacle.y +=
        this.speed * 0.8;

      if (
        obstacle.hornReaction > 0
      ) {
        obstacle.hornReaction--;
        obstacle.y += 0.8;
      }

      obstacle.laneChangeTimer--;

      if (
        obstacle.laneChangeTimer <= 0
      ) {
        obstacle.laneChangeTimer =
          180 +
          Math.floor(
            Math.random() * 360
          );

        if (
          Math.random() <
          (
            obstacle.aggressive
              ? 0.42
              : 0.16
          )
        ) {
          const lanes =
            Math.max(
              1,
              CONFIG.LANES || 3
            );

          const direction =
            Math.random() < 0.5
              ? -1
              : 1;

          obstacle.targetLane =
            Math.max(
              0,
              Math.min(
                lanes - 1,
                obstacle.lane +
                direction
              )
            );
        }
      }

      if (
        obstacle.targetLane !==
        obstacle.lane
      ) {
        obstacle.lane =
          obstacle.targetLane;
      }

      if (
        obstacle.y > 600
      ) {
        obstacle.used = true;
      }
    }

    this.obs =
      this.obs.filter(
        (item) =>
          !item.used
      );
  }

  updateCoins() {
    for (
      const coin of this.coins
    ) {
      if (coin.used) {
        continue;
      }

      coin.y +=
        this.speed * 1.35;

      coin.spin +=
        0.08;

      if (
        coin.y > 500
      ) {
        coin.used = true;
        continue;
      }

      if (
        Math.abs(
          coin.y -
          this.playerY
        ) < 48 &&
        coin.lane ===
        this.playerLane
      ) {
        coin.used = true;

        const value =
          Number(coin.value) || 25;

        this.score += value;
        this.money += value;

        this.addCombo(1);

        try {
          Audio.coin?.();
        } catch {}

        this.ui?.showMissionToast?.(
          `🪙 +₦${value}`
        );
      }
    }

    this.coins =
      this.coins.filter(
        (item) =>
          !item.used
      );
  }

  getPassengerFare(passenger) {
    if (!passenger) {
      return 80;
    }

    const route =
      CONFIG.ROUTES?.[
        this.selectedRoute
      ] || {};

    const baseFare =
      Number(
        route.baseFare
      ) || 140;

    const distance =
      Number(
        passenger.distance
      ) || 1.5;

    let fare =
      baseFare +
      distance * 55;

    fare *=
      Number(
        passenger.fareMultiplier
      ) || 1;

    if (
      passenger.type === 'vip'
    ) {
      fare += 150;
    }

    if (
      passenger.type === 'aishat'
    ) {
      fare += 120;
    }

    const bonus =
      Number(
        this.getBonuses().fare
      ) || 0;

    fare *=
      1 +
      bonus;

    return Math.max(
      50,
      Math.round(
        fare / 10
      ) * 10
    );
  }

  getPassengerGreeting(passenger) {
    if (!passenger) {
      return '';
    }

    return (
      `${passenger.address}! ` +
      `${passenger.destination}!`
    );
  }

  passengerCall(passenger) {
    if (
      !passenger ||
      passenger.called
    ) {
      return;
    }

    passenger.called = true;
    passenger.state = 'calling';

    if (
      this.passengerVoiceCooldown > 0
    ) {
      return;
    }

    this.passengerVoiceCooldown = 90;

    const text =
      this.getPassengerGreeting(
        passenger
      );

    this.ui?.showMissionToast?.(
      `🗣 ${text}`
    );

    try {
      Audio.passengerVoice?.(
        text,
        passenger.language || 'ha'
      );
    } catch {}
  }

  boardPassenger(passenger) {
    if (
      !passenger ||
      passenger.taken
    ) {
      return false;
    }

    const seats =
      Number(
        passenger.seats
      ) || 1;

    if (
      this.paxOnBoard + seats >
      this.capacity
    ) {
      this.ui?.showMissionToast?.(
        'No space — the keke is full.'
      );

      return false;
    }

    passenger.taken = true;
    passenger.state = 'boarded';

    this.paxOnBoard += seats;
    this.totalPax += seats;

    const fare =
      this.getPassengerFare(
        passenger
      );

    const pickupReward =
      passenger.type === 'aishat'
        ? 550
        : passenger.type === 'vip'
          ? 350
          : Math.max(
              80,
              fare
            );

    this.score += pickupReward;

    if (
      passenger.type === 'aishat'
    ) {
      this.score += 100;
    }

    this.addCombo(
      passenger.type === 'vip'
        ? 2
        : 1
    );

    try {
      Audio.pickup?.();
    } catch {}

    this.activePassenger =
      passenger;

    const drop = {
      lane:
        Number.isFinite(
          passenger.dropLane
        )
          ? passenger.dropLane
          : Math.floor(
              Math.random() *
              Math.max(
                1,
                CONFIG.LANES || 3
              )
            ),

      y:
        -260 -
        Math.random() * 160,

      used: false,

      destination:
        passenger.destination,

      passengerCount: seats,

      passenger,

      announced: false,

      waiting: false,

      requested: false,

      akwai: false
    };

    this.dropZones.push(
      drop
    );

    this.ui?.showMissionToast?.(
      `👤 ${passenger.address} → ${passenger.destination}`
    );

    this.updateHUD(true);

    return true;
  }

  startNegotiation(passenger) {
    if (!passenger) {
      return;
    }

    this.state = STATE.EVENT;
    this.pendingNegotiation =
      passenger;

    try {
      Audio.negotiate?.();
    } catch {}

    const fairFare =
      this.getPassengerFare(
        passenger
      );

    const requestedFare =
      Math.max(
        50,
        Math.round(
          (
            fairFare * 0.65
          ) / 10
        ) * 10
      );

    this.ui?.showEvent?.({
      title:
        `${passenger.address} — ${passenger.destination}`,

      text:
        `The passenger offers ₦${requestedFare}. ` +
        `A fair fare is about ₦${fairFare}.`,

      actions: [
        {
          label:
            `Accept ₦${requestedFare}`,

          primary: true,

          onClick: () => {
            this.completeNegotiation(
              passenger,
              requestedFare,
              1
            );
          }
        },

        {
          label:
            `Hold ₦${fairFare}`,

          onClick: () => {
            if (
              Math.random() <
              0.55
            ) {
              this.completeNegotiation(
                passenger,
                fairFare,
                2
              );
            } else {
              passenger.taken = false;

              this.pendingNegotiation =
                null;

              this.state =
                STATE.PLAY;

              this.ui?.hideEvent?.();

              this.ui?.showPlaying?.();

              this.ui?.showMissionToast?.(
                `${passenger.address}: “A'a, zan jira.”`
              );
            }
          }
        },

        {
          label:
            'No deal',

          onClick: () => {
            passenger.taken = false;

            this.pendingNegotiation =
              null;

            this.state =
              STATE.PLAY;

            this.ui?.hideEvent?.();

            this.ui?.showPlaying?.();

            this.ui?.showMissionToast?.(
              `${passenger.address} walked away.`
            );
          }
        }
      ]
    });
  }

  completeNegotiation(
    passenger,
    fare,
    comboValue = 1
  ) {
    if (!passenger) {
      return false;
    }

    const seats =
      Number(
        passenger.seats
      ) || 1;

    if (
      this.paxOnBoard + seats >
      this.capacity
    ) {
      this.pendingNegotiation =
        null;

      this.state =
        STATE.PLAY;

      this.ui?.hideEvent?.();

      this.ui?.showPlaying?.();

      this.ui?.showMissionToast?.(
        'The keke is full.'
      );

      return false;
    }

    passenger.taken = true;
    passenger.negotiated = true;
    passenger.state = 'boarded';

    this.paxOnBoard += seats;
    this.totalPax += seats;

    const amount =
      Math.max(
        50,
        Number(fare) || 50
      );

    this.score += amount;

    this.addCombo(
      comboValue
    );

    try {
      Audio.pickup?.();
    } catch {}

    const drop = {
      lane:
        Number.isFinite(
          passenger.dropLane
        )
          ? passenger.dropLane
          : Math.floor(
              Math.random() *
              Math.max(
                1,
                CONFIG.LANES || 3
              )
            ),

      y:
        -260 -
        Math.random() * 160,

      used: false,

      destination:
        passenger.destination,

      passengerCount: seats,

      passenger,

      announced: false,

      waiting: false,

      requested: false,

      akwai: false
    };

    this.dropZones.push(
      drop
    );

    this.activePassenger =
      passenger;

    this.pendingNegotiation =
      null;

    this.state =
      STATE.PLAY;

    this.ui?.hideEvent?.();
    this.ui?.showPlaying?.();

    this.ui?.showMissionToast?.(
      `🤝 Agreed ₦${amount} → ${passenger.destination}`
    );

    this.updateHUD(true);

    return true;
  }

  requestPassengerStop(drop) {
    if (
      !drop ||
      drop.used ||
      !drop.passenger
    ) {
      return;
    }

    drop.requested = true;
    drop.waiting = true;
    drop.akwai = true;

    if (
      drop.announced
    ) {
      return;
    }

    drop.announced = true;

    const text =
      `Akwai! ${drop.passenger.address}, ` +
      `tsaya nan — ${drop.destination}.`;

    this.ui?.showMissionToast?.(
      `🗣 ${text}`
    );

    try {
      Audio.passengerVoice?.(
        text,
        'ha'
      );
    } catch {}
  }

  dropPassengers(drop) {
    if (
      !drop ||
      drop.used ||
      !drop.passenger
    ) {
      return false;
    }

    const passenger =
      drop.passenger;

    const count =
      Math.min(
        this.paxOnBoard,
        Number(
          drop.passengerCount
        ) || 1
      );

    if (count <= 0) {
      return false;
    }

    const distance =
      Number(
        passenger.distance
      ) || 1.5;

    let fare =
      100 +
      distance * 55;

    if (
      passenger.type === 'vip'
    ) {
      fare += 150;
    }

    if (
      passenger.type === 'aishat'
    ) {
      fare += 120;
    }

    fare *=
      Number(
        passenger.fareMultiplier
      ) || 1;

    fare = Math.max(
      50,
      Math.round(
        fare / 10
      ) * 10
    );

    const totalFare =
      Math.round(
        fare * count
      );

    const multiplier =
      this.getComboMultiplier();

    const reward =
      Math.round(
        totalFare * multiplier
      );

    this.paxOnBoard -= count;
    this.dropCount += count;

    this.score += reward;

    this.addCombo(
      count >= 2 ? 3 : 2
    );

    passenger.dropped = true;
    passenger.state = 'dropped';

    drop.used = true;
    drop.waiting = false;
    drop.requested = false;
    drop.akwai = false;

    if (
      this.activePassenger ===
      passenger
    ) {
      this.activePassenger = null;
    }

    try {
      Audio.dropoff?.();
      Audio.success?.();
    } catch {}

    this.ui?.showMissionToast?.(
      `🛑 Akwai! ${drop.destination} · ` +
      `Dropped ${count} · +₦${reward}`
    );

    this.updateHUD(true);

    return true;
  }

  updatePassengerZones() {
    for (
      const passenger of this.paxZones
    ) {
      if (
        passenger.taken ||
        passenger.dropped
      ) {
        continue;
      }

      passenger.y +=
        this.speed * 0.92;

      const distance =
        Math.abs(
          passenger.y -
          this.playerY
        );

      if (
        distance < 145 &&
        !passenger.called
      ) {
        this.passengerCall(
          passenger
        );
      }

      if (
        distance < 52 &&
        this.paxOnBoard +
        (
          Number(
            passenger.seats
          ) || 1
        ) <=
        this.capacity
      ) {
        const stopped =
          this.speed <= 1.25 ||
          (
            this.brakeInput > 0 &&
            this.speed <= 1.9
          );

        if (stopped) {
          if (
            !passenger.negotiated &&
            Math.random() < 0.55
          ) {
            passenger.negotiated = true;

            this.startNegotiation(
              passenger
            );

            return;
          }

          this.boardPassenger(
            passenger
          );

          return;
        }

        if (
          !passenger.reminderShown
        ) {
          passenger.reminderShown = true;

          this.ui?.showMissionToast?.(
            `${passenger.address}: ` +
            `"${passenger.destination}!" · ` +
            `BRAKE TO STOP`
          );
        }
      }

      if (
        passenger.y > 520
      ) {
        passenger.taken = true;
      }
    }

    this.paxZones =
      this.paxZones.filter(
        (passenger) =>
          passenger.y < 650 &&
          !passenger.taken
      );
  }

  updateDropZones() {
    for (
      const drop of this.dropZones
    ) {
      if (
        drop.used ||
        this.paxOnBoard <= 0
      ) {
        continue;
      }

      drop.y +=
        this.speed * 0.96;

      const distance =
        Math.abs(
          drop.y -
          this.playerY
        );

      if (
        distance < 110 &&
        !drop.requested
      ) {
        this.requestPassengerStop(
          drop
        );
      }

      if (
        distance < 48
      ) {
        const stopped =
          this.speed <= 1.25 ||
          (
            this.brakeInput > 0 &&
            this.speed <= 1.9
          );

        if (stopped) {
          this.dropPassengers(
            drop
          );
        } else if (
          !drop.stopReminderShown
        ) {
          drop.stopReminderShown = true;

          this.ui?.showMissionToast?.(
            `Akwai! Brake and stop at ${drop.destination}`
          );
        }
      }
    }

    this.dropZones =
      this.dropZones.filter(
        (drop) =>
          !drop.used &&
          drop.y < 700
      );
  }

  startKarotaCheckpoint() {
    if (
      this.karotaTimer > 0 ||
      this.state !== STATE.PLAY
    ) {
      return;
    }

    this.karotaTimer = 180;

    this.state = STATE.EVENT;

    try {
      Audio.alert?.();
    } catch {}

    this.triggerShake(2);

    const fine =
      200 +
      Math.min(
        150,
        Math.floor(
          this.speed
        ) * 25
      );

    this.ui?.showEvent?.({
      title: 'KAROTA CHECKPOINT',

      text:
        `An officer stops your keke. ` +
        `Possible fine: ₦${fine}.`,

      actions: [
        {
          label:
            `Pay ₦${fine}`,

          primary: true,

          onClick: () => {
            this.money =
              Math.max(
                0,
                this.money - fine
              );

            Storage.setMoney?.(
              this.money
            );

            this.karotaTimer = 0;
            this.state = STATE.PLAY;

            this.ui?.hideEvent?.();
            this.ui?.showPlaying?.();
            this.ui?.updateHUD?.(
              this
            );

            try {
              Audio.beep?.(
                520,
                0.08,
                'sine',
                0.03
              );
            } catch {}
          }
        },

        {
          label:
            'Talk your way out',

          onClick: () => {
            if (
              Math.random() <
              0.45
            ) {
              this.karotaTimer = 0;
              this.state = STATE.PLAY;

              this.ui?.hideEvent?.();
              this.ui?.showPlaying?.();

              this.ui?.showMissionToast?.(
                'KAROTA: "Toh, ka tafi."'
              );
            } else {
              const reduced =
                Math.floor(
                  fine * 0.5
                );

              this.money =
                Math.max(
                  0,
                  this.money - reduced
                );

              Storage.setMoney?.(
                this.money
              );

              this.karotaTimer = 0;
              this.state = STATE.PLAY;

              this.ui?.hideEvent?.();
              this.ui?.showPlaying?.();

              this.ui?.showMissionToast?.(
                `KAROTA: Pay ₦${reduced}.`
              );

              try {
                Audio.alert?.();
              } catch {}
            }

            this.updateHUD(true);
          }
        },

        {
          label:
            'Speed off',

          onClick: () => {
            this.policeChase = 240;
            this.karotaTimer = 0;
            this.state = STATE.PLAY;

            this.ui?.hideEvent?.();
            this.ui?.showPlaying?.();

            this.ui?.showMissionToast?.(
              '🚔 KAROTA chase! Keep moving!'
            );

            try {
              Audio.alert?.();
            } catch {}
          }
        }
      ]
    });
  }

  updateDrivingSpeed(
    route,
    bonuses
  ) {
    const difficulty =
      Number(
        route?.difficulty
      ) || 1;

    const speedBonus =
      Number(
        bonuses.speed
      ) || 0;

    const progressionLimit =
      3.2 +
      this.dist * 0.018 +
      speedBonus;

    const routeLimit =
      7.2 *
      difficulty +
      speedBonus * 3;

    let target =
      Math.min(
        progressionLimit,
        routeLimit
      );

    if (
      this.trafficJamTimer > 0
    ) {
      target *= 0.55;
    }

    if (
      this.selectedDriver ===
      'ruffneck' &&
      this.getTrafficPeriod() ===
      'night'
    ) {
      target += 0.4;
    }

    if (
      this.brakeInput > 0
    ) {
      target *=
        1 -
        (
          0.92 *
          this.brakeInput
        );
    }

    if (
      this.throttle <= 0
    ) {
      target *= 0.72;
    }

    target = Math.max(
      0.4,
      Math.min(
        this.maxSpeed,
        target
      )
    );

    this.targetSpeed =
      target;

    if (
      this.speed <
      this.targetSpeed
    ) {
      this.speed +=
        0.095 *
        this.throttle;
    } else {
      this.speed -=
        this.brakeInput > 0
          ? 0.22
          : 0.055;
    }

    if (
      this.brakeInput > 0
    ) {
      this.speed -=
        0.12 *
        this.brakeInput;
    }

    this.speed =
      Math.max(
        0,
        Math.min(
          this.maxSpeed,
          this.speed
        )
      );
  }

  rectHit(a, b) {
    return (
      a.x <
        b.x + b.width &&
      a.x + a.width >
        b.x &&
      a.y <
        b.y + b.height &&
      a.y + a.height >
        b.y
    );
  }

  checkTrafficCollision() {
    if (
      this.inv > 0
    ) {
      return;
    }

    for (
      const obstacle of this.obs
    ) {
      if (
        obstacle.used
      ) {
        continue;
      }

      if (
        obstacle.lane !==
        this.playerLane
      ) {
        continue;
      }

      const distance =
        Math.abs(
          obstacle.y -
          this.playerY
        );

      if (
        distance < 46
      ) {
        obstacle.used = true;

        this.inv = 90;

        this.speed *= 0.42;

        this.score =
          Math.max(
            0,
            this.score - 120
          );

        this.combo = 0;
        this.comboTimer = 0;

        this.triggerShake(9);

        try {
          Audio.crash?.();
        } catch {}

        this.ui?.showMissionToast?.(
          '💥 Collision! Slow down and watch traffic.'
        );

        this.gameOver();
        return;
      }

      if (
        distance < 78 &&
        this.nearMissCooldown <= 0
      ) {
        this.nearMissCooldown = 70;

        this.nearMissCount++;

        const reward =
          25 +
          Math.min(
            75,
            this.nearMissCount * 5
          );

        this.score += reward;

        this.addCombo(1);

        this.ui?.showMissionToast?.(
          `⚡ Near miss +₦${reward}`
        );
      }
    }
  }

  updateTrafficEvents() {
    if (
      this.eventCooldown > 0
    ) {
      this.eventCooldown--;
      return;
    }

    this.eventCooldown =
      420 +
      Math.floor(
        Math.random() * 500
      );

    const roll =
      Math.random();

    if (
      roll < 0.22
    ) {
      this.trafficJamTimer =
        180 +
        Math.floor(
          Math.random() * 180
        );

      this.ui?.showMissionToast?.(
        '🚦 Traffic is building ahead.'
      );

      return;
    }

    if (
      roll < 0.38
    ) {
      this.startKarotaCheckpoint();
      return;
    }

    if (
      roll < 0.52
    ) {
      this.weatherState =
        this.weatherState === 'clear'
          ? 'dust'
          : 'clear';

      this.ui?.setWeather?.(
        this.weatherState
      );

      return;
    }

    if (
      roll < 0.64
    ) {
      this.ui?.showMissionToast?.(
        '📢 Roadside crowd ahead — drive carefully.'
      );

      return;
    }

    if (
      roll < 0.74
    ) {
      this.ui?.showMissionToast?.(
        '🏗️ Road work ahead.'
      );

      return;
    }

    if (
      roll < 0.84
    ) {
      this.ui?.showMissionToast?.(
        '🕳️ Potholes ahead — slow down.'
      );

      return;
    }

    this.ui?.showMissionToast?.(
      '🕌 You are entering a busy Kano district.'
    );
  }

  randomMission() {
    const missions =
      Array.isArray(
        CONFIG.MISSIONS
      )
        ? CONFIG.MISSIONS
        : [];

    if (!missions.length) {
      return {
        title:
          'Keep Driving',

        target:
          3,

        progress:
          0
      };
    }

    return {
      ...missions[
        Math.floor(
          Math.random() *
          missions.length
        )
      ]
    };
  }

  updateMission() {
    if (
      !this.activeMission
    ) {
      return;
    }

    const mission =
      this.activeMission;

    if (
      typeof mission.progress !==
      'number'
    ) {
      mission.progress = 0;
    }

    const title =
      String(
        mission.title ||
        mission.name ||
        'Mission'
      ).toLowerCase();

    if (
      title.includes('passenger')
    ) {
      mission.progress =
        this.totalPax;
    } else if (
      title.includes('distance')
    ) {
      mission.progress =
        this.dist;
    } else if (
      title.includes('drop')
    ) {
      mission.progress =
        this.dropCount;
    } else if (
      title.includes('near')
    ) {
      mission.progress =
        this.nearMissCount;
    } else if (
      title.includes('fare')
    ) {
      mission.progress =
        this.score;
    }

    const target =
      Number(
        mission.target ||
        mission.goal ||
        1
      );

    if (
      mission.progress >=
      target &&
      !mission.completed
    ) {
      mission.completed = true;

      const reward =
        Number(
          mission.reward
        ) || 250;

      this.score += reward;
      this.money += reward;

      Storage.setMoney?.(
        this.money
      );

      this.ui?.showMissionToast?.(
        `🎯 Mission complete +₦${reward}`
      );
    }

    this.ui?.setMissionProgress?.(
      mission
    );
  }

  updateHUD(force = false) {
    if (
      !force &&
      this._lastHudFrame ===
      this.frame
    ) {
      return;
    }

    this._lastHudFrame =
      this.frame;

    this.ui?.updateHUD?.(
      this
    );
  }

  gameOver() {
    if (
      this.state === STATE.OVER
    ) {
      return;
    }

    this.state = STATE.EVENT;

    try {
      Audio.crash?.();
    } catch {}

    this.triggerShake(10);

    if (
      this.continuesLeft > 0
    ) {
      this.continuesLeft--;

      this.ui?.showEvent?.({
        title:
          'Keke damaged',

        text:
          `You have ${this.continuesLeft} free continue(s) remaining.`,

        actions: [
          {
            label:
              'Continue',

            primary: true,

            onClick: () => {
              this.useContinue(false);
            }
          },

          {
            label:
              'End Run',

            onClick: () => {
              this.finalGameOver();
            }
          }
        ]
      });

      return;
    }

    this.finalGameOver();
  }

  useContinue(isPaid = false) {
    if (
      isPaid
    ) {
      const price = 300;

      if (
        this.money < price
      ) {
        this.ui?.showMissionToast?.(
          'Not enough money for a paid continue.'
        );

        return false;
      }

      this.money -= price;

      Storage.setMoney?.(
        this.money
      );

      this.paidContinuesUsed++;
    }

    this.obs.length = 0;

    this.inv = 150;

    this.speed =
      Math.max(
        2.4,
        this.speed * 0.72
      );

    this.targetSpeed =
      this.speed;

    this.state =
      STATE.PLAY;

    this.isPaused = false;

    this.ui?.hideEvent?.();
    this.ui?.showPlaying?.();

    try {
      Audio.resume?.();
      Audio.startEngine?.();
    } catch {}

    this.updateHUD(true);

    return true;
  }

  finalGameOver() {
    this.state =
      STATE.OVER;

    this.isPaused = false;

    try {
      Audio.stopEngine?.();
      Audio.stopRadio?.();
    } catch {}

    const runBonus =
      Math.floor(
        this.score * 0.2
      );

    this.money +=
      runBonus;

    if (
      this.score >
      this.high
    ) {
      this.high =
        this.score;

      Storage.setHighScore?.(
        this.high
      );
    }

    Storage.setMoney?.(
      this.money
    );

    Storage.addRun?.({
      score:
        this.score,

      distance:
        this.dist,

      passengers:
        this.totalPax,

      drops:
        this.dropCount,

      money:
        this.money,

      route:
        this.selectedRoute,

      driver:
        this.selectedDriver
    });

    Storage.checkAchievements?.(
      this
    );

    this.ui?.showGameOver?.(
      this
    );
  }

  updatePlayer() {
    const targetLaneX =
      this.laneX(
        this.playerLane
      );

    this.targetX =
      targetLaneX;

    this.playerX +=
      (
        targetLaneX -
        this.playerX
      ) *
      0.18;

    const steeringDelta =
      targetLaneX -
      this.playerX;

    if (
      Math.abs(
        steeringDelta
      ) > 1
    ) {
      this.bounce =
        Math.min(
          8,
          this.bounce + 0.08
        );
    }

    if (
      this.speed > 5
    ) {
      this.bounce =
        Math.min(
          10,
          this.bounce + 0.12
        );
    }

    if (
      this.bounce > 0
    ) {
      this.bounce *= 0.94;
    }

    this.playerY =
      0;
  }

  update() {
    if (
      this.state !== STATE.PLAY ||
      this.isPaused
    ) {
      return;
    }

    if (
      this.introSequence?.active
    ) {
      this.updateOpeningSequence();

      if (
        this.introSequence.active
      ) {
        return;
      }
    }

    this.frame++;

    if (
      this.passengerVoiceCooldown >
      0
    ) {
      this.passengerVoiceCooldown--;
    }

    if (
      this.comboTimer > 0
    ) {
      this.comboTimer--;

      if (
        this.comboTimer <= 0
      ) {
        this.combo = 0;
      }
    }

    if (
      this.inv > 0
    ) {
      this.inv--;
    }

    if (
      this.shake > 0
    ) {
      this.shake--;

      if (
        this.shake <= 0
      ) {
        this.shakeMag = 0;
      }
    }

    if (
      this.bounce > 0
    ) {
      this.bounce *= 0.98;
    }

    if (
      this.nearMissCooldown > 0
    ) {
      this.nearMissCooldown--;
    }

    if (
      this.policeChase > 0
    ) {
      this.policeChase--;

      if (
        this.frame % 30 === 0
      ) {
        this.ui?.showMissionToast?.(
          '🚔 Police chase active!'
        );
      }
    }

    if (
      this.trafficJamTimer > 0
    ) {
      this.trafficJamTimer--;
    }

    if (
      this.karotaTimer > 0
    ) {
      this.karotaTimer--;

      if (
        this.karotaTimer <= 0 &&
        this.state === STATE.EVENT
      ) {
        this.state =
          STATE.PLAY;

        this.ui?.hideEvent?.();
        this.ui?.showPlaying?.();
      }
    }

    const route =
      CONFIG.ROUTES?.[
        this.selectedRoute
      ] ||
      CONFIG.ROUTES?.citycenter ||
      {};

    const bonuses =
      this.getBonuses();

    const gasHeld =
      !!(
        this.keys.arrowup ||
        this.keys.w
      );

    const brakeHeld =
      !!(
        this.keys.arrowdown ||
        this.keys.s ||
        this.keys[' ']
      );

    if (
      gasHeld
    ) {
      this.throttle = 1;
    } else if (
      !this._externalThrottle
    ) {
      this.throttle = 1;
    }

    if (
      brakeHeld
    ) {
      this.brakeInput = 1;
    } else if (
      !this._externalBrake
    ) {
      this.brakeInput = 0;
    }

    this.updateDrivingSpeed(
      route,
      bonuses
    );

    this.roadOff =
      (
        this.roadOff +
        this.speed * 2
      ) % 58;

    this.dist +=
      this.speed * 0.0055;

    try {
      Audio.updateEngine?.(
        this.speed,
        this.throttle,
        this.brakeInput
      );
    } catch {}

    this.updatePlayer();

    if (
      this.trafficSpawnCooldown >
      0
    ) {
      this.trafficSpawnCooldown--;
    } else {
      this.spawnTraffic();
    }

    if (
      this.passengerSpawnCooldown >
      0
    ) {
      this.passengerSpawnCooldown--;
    } else {
      this.spawnPassenger();
    }

    if (
      this.coinSpawnCooldown >
      0
    ) {
      this.coinSpawnCooldown--;
    } else {
      this.spawnCoin();
    }

    this.updateTraffic();
    this.updatePassengerZones();
    this.updateDropZones();
    this.updateCoins();

    this.checkTrafficCollision();

    if (
      this.frame % 180 === 0
    ) {
      this.updateTrafficEvents();
    }

    if (
      this.frame % 120 === 0
    ) {
      this.updateMission();
    }

    if (
      this.frame % 30 === 0
    ) {
      this.updateHUD();
    }

    this.renderer3d?.draw?.(
      this
    );

    this.renderer3d?.render?.(
      this
    );
  }

  draw() {
    this.renderer3d?.draw?.(
      this
    );

    this.renderer3d?.render?.(
      this
    );
  }

  getRouteName() {
    const route =
      CONFIG.ROUTES?.[
        this.selectedRoute
      ];

    return (
      route?.name ||
      this.selectedRoute ||
      'Kano City'
    );
  }

  setRoute(routeId) {
    if (!routeId) {
      return;
    }

    this.selectedRoute =
      routeId;

    Storage.setRoute?.(
      routeId
    );

    this.ui?.setRouteLabel?.(
      this.getRouteName()
    );
  }

  setDriver(driverId) {
    if (!driverId) {
      return;
    }

    if (
      CONFIG.DRIVERS &&
      !CONFIG.DRIVERS[driverId]
    ) {
      return;
    }

    this.selectedDriver =
      driverId;

    Storage.setDriver?.(
      driverId
    );

    this.ui?.setDriverLabel?.(
      this.getDriver().name ||
      driverId
    );
  }

  setPaint(paintId) {
    if (!paintId) {
      return;
    }

    this.selectedPaint =
      paintId;

    Storage.setPaint?.(
      paintId
    );

    this.renderer3d?.applyPaint?.(
      paintId
    );
  }

  getSnapshot() {
    return {
      state:
        this.state,

      score:
        this.score,

      money:
        this.money,

      distance:
        this.dist,

      passengers:
        this.paxOnBoard,

      capacity:
        this.capacity,

      totalPassengers:
        this.totalPax,

      drops:
        this.dropCount,

      combo:
        this.combo,

      speed:
        this.speed,

      route:
        this.selectedRoute,

      driver:
        this.selectedDriver,

      paint:
        this.selectedPaint,

      radio:
        this.radioIndex,

      weather:
        this.weatherState,

      trafficPeriod:
        this.getTrafficPeriod()
    };
  }
}