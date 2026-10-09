import { CONFIG, STATE } from './config.js';
import { Storage } from './storage.js';
import { Audio } from './audio.js';

/*
 * Kano Run — Adaidaita Sahu
 * Game core — specification-aligned replacement
 *
 * Responsibilities:
 * - gameplay state and progression
 * - correct left/right steering
 * - keyboard + mobile-facing control methods
 * - traffic, passengers, fares and destinations
 * - negotiation and KAROTA interactions
 * - levels, missions, combos, achievements and continues
 * - opening sequence state
 * - route / driver / paint / keke / radio selection
 *
 * The renderer remains responsible for 3D presentation.
 * The audio module remains responsible for sound generation/playback.
 */

const PLAYER_Y = 500;
const LANES = 3;
const MIN_LANE = 0;
const MAX_LANE = LANES - 1;

const BASE_SPEED = 3.6;
const BASE_MAX_SPEED = 7.2;
const FRAME_MS = 1000 / 60;

const COLLISION_Y = 36;
const NEAR_MISS_Y = 92;
const PICKUP_Y = 70;
const DROPOFF_Y = 72;
const CHECKPOINT_Y = 70;

const KANО_DESTINATIONS = [
  'Sabon Gari',
  'Kofar Mata',
  'Fagge',
  'Farm Centre',
  'Hotoro',
  'Zoo Road',
  'Naibawa',
  'Tarauni',
  'Dala',
  'Kantin Kwari',
  'Kofar Wambai',
  'Kumbotso',
  'Sharada',
  'Bompai',
  'Gwale',
  'Kabuga',
  'BUK Road',
  'Waje',
  'Rijiyar Zaki',
  'Yankaba',
  'Challawa',
  'Nassarawa GRA',
  'Airport Road'
];

const PASSENGER_TYPES = [
  { id: 'standard', name: 'Passenger', seats: 1, fare: 1.0, weight: 50 },
  { id: 'student', name: 'Student', seats: 1, fare: 0.88, weight: 18 },
  { id: 'worker', name: 'Worker', seats: 1, fare: 1.08, weight: 18 },
  { id: 'market', name: 'Market Customer', seats: 1, fare: 1.05, weight: 8 },
  { id: 'elder', name: 'Elder', seats: 1, fare: 1.12, weight: 3 },
  { id: 'hajiya', name: 'Hajiya', seats: 1, fare: 1.18, weight: 3 }
];

const GREETINGS = [
  'Oga, ina kwana?',
  'Mai Gida, please slow down.',
  'Mallam, ina zuwa can.',
  'Yallabai, zan je can.',
  'Dan uwa, tsaya kadan.',
  'Aboki, akwai wuri?',
  'Driver, wannan hanyar za mu bi.',
  'Baba, tsaya a gabana.',
  'Mama, akwai wuri?',
  'Hajiya, a hankali don Allah.'
];

const KABATA_VOICES = [
  'Akwai!',
  'Akwai wuri?',
  'Driver, tsaya nan.',
  'Oga, a tsaya.',
  'Mallam, ka sauke ni nan.',
  'Yallabai, nan ne.'
];

const KEKES = {
  standard: {
    id: 'standard',
    name: 'Standard Keke',
    title: 'Everyday Adaidaita',
    color: 0xfbbf24,
    unlockLevel: 1,
    speed: 0,
    handling: 1,
    capacity: 3,
    fare: 1,
    description: 'Balanced yellow city keke.'
  },
  luxury: {
    id: 'luxury',
    name: 'Luxury Keke',
    title: 'Comfort Ride',
    color: 0xeab308,
    unlockLevel: 3,
    speed: 0.15,
    handling: 1.05,
    capacity: 3,
    fare: 1.12,
    description: 'Better comfort and fare potential.'
  },
  cargo: {
    id: 'cargo',
    name: 'Cargo Keke',
    title: 'Load Runner',
    color: 0x22c55e,
    unlockLevel: 5,
    speed: -0.2,
    handling: 0.92,
    capacity: 3,
    fare: 1.18,
    description: 'Built for heavier roadside loads.'
  },
  open: {
    id: 'open',
    name: 'Open Keke',
    title: 'Market Runner',
    color: 0x38bdf8,
    unlockLevel: 7,
    speed: 0.08,
    handling: 1.08,
    capacity: 3,
    fare: 1.1,
    description: 'Quick handling for dense market routes.'
  },
  police: {
    id: 'police',
    name: 'Police Keke',
    title: 'Enforcement Variant',
    color: 0x1e40af,
    unlockLevel: 10,
    speed: 0.25,
    handling: 1.02,
    capacity: 3,
    fare: 0.95,
    description: 'Special unlock for advanced progression.'
  },
  karota: {
    id: 'karota',
    name: 'KAROTA Keke',
    title: 'Checkpoint Variant',
    color: 0xf59e0b,
    unlockLevel: 12,
    speed: 0.18,
    handling: 1.0,
    capacity: 3,
    fare: 1.0,
    description: 'Advanced utility variant.'
  }
};

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function pick(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function weightedPick(items) {
  const total = items.reduce((sum, item) => sum + (item.weight || 1), 0);
  let r = Math.random() * total;
  for (const item of items) {
    r -= item.weight || 1;
    if (r <= 0) return item;
  }
  return items[items.length - 1];
}

function todayKey() {
  return new Date().toISOString().slice(0, 10);
}

export class Game {
  constructor(canvas, ui = null, renderer3d = null) {
    this.canvas = canvas;
    this.ctx = canvas?.getContext?.('2d') || null;
    this.ui = ui;
    this.renderer3d = renderer3d;

    // Normalize station objects before any UI method tries to display them.
    // Their properties remain intact for the garage and radio/audio logic;
    // implicit string conversion returns the readable station name instead
    // of JavaScript's default "[object Object]".
    this._installRadioDisplayCompatibility();
    this._ensureKanoRunLogo();

    this.state = STATE.START;
    this.paused = false;

    this.score = 0;
    this.money = 0;
    this.dist = 0;
    this.totalPax = 0;
    this.completedTrips = 0;
    this.paxCount = 0;
    this.capacity = 3;

    this.continuesLeft = 3;
    this.combo = 0;
    this.bestCombo = 0;
    this.nearMissCount = 0;
    this.crashes = 0;

    this.level = 1;
    this.levelProgress = 0;
    this.xp = 0;

    // The keke starts stationary. Acceleration requires an explicit gas input.
    this.speed = 0;
    this.maxSpeed = BASE_MAX_SPEED;
    this.throttle = 0;
    this.brake = 0;
    this.gasHeld = false;
    this.brakeHeld = false;
    this._externalThrottle = true;
    this._lastCrashFrame = -Infinity;

    this.frame = 0;
    this.roadOff = 0;
    this.playerLane = 1;
    this.playerX = this.laneX(this.playerLane);
    this.targetX = this.playerX;
    this.playerY = PLAYER_Y;
    this.playerZ = 0;
    this.bounce = 0;
    this.shake = 0;
    this.shakeMag = 0;

    this.obs = [];
    this.paxZones = [];
    this.dropZones = [];
    this.coins = [];
    this.checkpoints = [];

    this.currentPassengers = [];
    this.nextPassengerId = 1;
    this.nextTrafficId = 1;
    this.nextZoneId = 1;

    this.eventOpen = false;
    this.eventType = null;
    this.eventContext = null;
    this._resumeStateAfterEvent = STATE.PLAY;

    this.introSequence = {
      active: false,
      stage: 'idle',
      timer: 0,
      driverId: 'ruffneck',
      paintId: 'classic'
    };

    this.routeId = 'citycenter';
    this.selectedRoute = null;
    this.selectedDriver = 'ruffneck';
    this.selectedPaint = 'classic';
    this.selectedRadio = 'freedom';
    this.selectedKeke = 'standard';

    this.radioIndex = 0;
    this.lastRadioSwitchFrame = -999;

    this.lastSpawnFrame = 0;
    this.lastPassengerFrame = 0;
    this.lastCoinFrame = 0;
    this.lastCheckpointFrame = 0;
    this.lastLandmarkIndex = -1;

    this.karotaWanted = false;
    this.karotaHeat = 0;
    this.policeChase = 0;
    this.checkpointCooldown = 0;

    this.weatherState = 'clear';
    this.mission = null;
    this.missionIndex = 0;
    this.dailyClaimed = false;
    this.dailyReward = 500;

    this.lastDropDestination = null;
    this.lastPassenger = null;
    this.lastFare = 0;

    this._storageLoad();
    this.selectRoute(this.routeId, false);
    this.selectDriver(this.selectedDriver, false);
    this.selectPaint(this.selectedPaint, false);
    this.selectKeke(this.selectedKeke, false);
    this.selectRadio(this.selectedRadio, false);
    this.generateMission();

    this._bindKeyboard();
    this._bindDrivingControls();
  }

  _installRadioDisplayCompatibility() {
    const stations = CONFIG.RADIO || CONFIG.RADIO_STATIONS || [];
    for (const station of stations) {
      if (!station || typeof station !== 'object') continue;
      try {
        Object.defineProperty(station, Symbol.toPrimitive, {
          configurable: true,
          enumerable: false,
          value() {
            return String(this.name || this.label || this.id || 'Radio');
          }
        });
      } catch {
        // The explicit radio-bar rendering in _activateRadio is the fallback.
      }
    }
  }

  _ensureKanoRunLogo() {
    if (typeof document === 'undefined') return;
    const startScreen = document.getElementById('start-screen');
    if (!startScreen || startScreen.querySelector('[data-kano-run-brand-mark]')) return;

    const mark = document.createElement('div');
    mark.dataset.kanoRunBrandMark = 'true';
    mark.setAttribute('role', 'img');
    mark.setAttribute('aria-label', 'Kano Run logo — Adaidaita Sahu, Kano State');
    mark.style.cssText = [
      'display:flex', 'align-items:center', 'justify-content:center',
      'margin:0 auto 10px', 'width:96px', 'height:96px',
      'filter:drop-shadow(0 8px 18px rgba(0,0,0,.38))'
    ].join(';');
    mark.innerHTML = `
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120" width="96" height="96" aria-hidden="true" focusable="false">
        <defs>
          <linearGradient id="kanoRunGold" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stop-color="#fff1a8"/>
            <stop offset=".48" stop-color="#fbbf24"/>
            <stop offset="1" stop-color="#d97706"/>
          </linearGradient>
          <linearGradient id="kanoRunRoad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stop-color="#334155"/>
            <stop offset="1" stop-color="#0b1220"/>
          </linearGradient>
        </defs>
        <circle cx="60" cy="60" r="55" fill="#081525" stroke="url(#kanoRunGold)" stroke-width="4"/>
        <circle cx="60" cy="60" r="47" fill="#0f2238" stroke="#ffffff" stroke-opacity=".12" stroke-width="1.5"/>
        <path d="M27 88 49 30h11L38 88Z" fill="url(#kanoRunRoad)" stroke="#94a3b8" stroke-opacity=".55" stroke-width="1.2"/>
        <path d="m46 86 18-49h8L54 86Z" fill="#fbbf24" opacity=".9"/>
        <path d="M76 27 91 51 83 55 69 31Z" fill="#22d3ee" opacity=".95"/>
        <path d="M28 70h65" stroke="#e2e8f0" stroke-opacity=".55" stroke-width="2" stroke-dasharray="4 5"/>
        <g transform="translate(22 47)">
          <circle cx="18" cy="35" r="8" fill="#020617" stroke="#e2e8f0" stroke-width="2"/>
          <circle cx="55" cy="35" r="8" fill="#020617" stroke="#e2e8f0" stroke-width="2"/>
          <circle cx="18" cy="35" r="2.5" fill="#94a3b8"/>
          <circle cx="55" cy="35" r="2.5" fill="#94a3b8"/>
          <path d="M6 28 10 15Q12 11 18 11h23q7 0 10 6l8 11v5H7Z" fill="url(#kanoRunGold)" stroke="#fff1a8" stroke-width="1.6" stroke-linejoin="round"/>
          <path d="M20 14h17q4 0 6 4l3 6H16l2-7q.5-3 2-3Z" fill="#0e7490" stroke="#cffafe" stroke-width="1.2"/>
          <path d="M28 14v10" stroke="#cffafe" stroke-width="1.1"/>
          <path d="M8 28h49" stroke="#92400e" stroke-width="2"/>
          <rect x="4" y="25" width="6" height="5" rx="1.5" fill="#f8fafc"/>
          <rect x="54" y="25" width="6" height="5" rx="1.5" fill="#ef4444"/>
        </g>
      </svg>`;

    const title = startScreen.querySelector('h1');
    if (title) {
      title.style.letterSpacing = '.13em';
      title.style.fontWeight = '950';
      title.style.textShadow = '0 3px 0 #7c2d12, 0 0 22px rgba(251,191,36,.35)';
      title.style.marginTop = '0';
      startScreen.insertBefore(mark, title);
    } else {
      startScreen.prepend(mark);
    }
  }

  _bindDrivingControls() {
    if (typeof document === 'undefined') return;

    let controls = document.getElementById('kano-driving-controls');
    if (!controls) {
      controls = document.createElement('div');
      controls.id = 'kano-driving-controls';
      controls.setAttribute('aria-label', 'Driving controls');
      controls.style.cssText = [
        'position:fixed', 'right:14px', 'bottom:88px', 'z-index:1000',
        'display:flex', 'flex-direction:column', 'gap:10px',
        'touch-action:none', 'user-select:none', '-webkit-user-select:none'
      ].join(';');

      const makeButton = (id, label, background) => {
        const button = document.createElement('button');
        button.id = id;
        button.type = 'button';
        button.textContent = label;
        button.setAttribute('aria-label', label.toLowerCase());
        button.style.cssText = [
          'width:78px', 'height:58px', 'border:2px solid rgba(255,255,255,.8)',
          'border-radius:14px', `background:${background}`, 'color:#fff',
          'font:900 15px system-ui,sans-serif', 'letter-spacing:.4px',
          'box-shadow:0 4px 12px rgba(0,0,0,.4)', 'touch-action:none',
          'cursor:pointer', 'padding:0'
        ].join(';');
        controls.appendChild(button);
        return button;
      };

      const gas = makeButton('kano-gas-btn', 'GAS ▲', '#15803d');
      const brake = makeButton('kano-brake-btn', 'BRAKE ▼', '#b91c1c');

      const bindHold = (button, down, up) => {
        const release = (event) => {
          if (event) event.preventDefault();
          up();
          button.style.filter = '';
          button.style.transform = '';
        };
        button.addEventListener('pointerdown', (event) => {
          event.preventDefault();
          if (event.button !== undefined && event.button !== 0) return;
          down();
          button.style.filter = 'brightness(1.2)';
          button.style.transform = 'scale(.97)';
          try { button.setPointerCapture(event.pointerId); } catch {}
        });
        button.addEventListener('pointerup', release);
        button.addEventListener('pointercancel', release);
        button.addEventListener('lostpointercapture', release);
        window.addEventListener('blur', () => release());
        document.addEventListener('visibilitychange', () => {
          if (document.hidden) release();
        });
        button.addEventListener('contextmenu', (event) => event.preventDefault());
      };

      bindHold(gas, () => this.gasDown(), () => this.gasUp());
      bindHold(brake, () => this.brakeDown(), () => this.brakeUp());
      document.body.appendChild(controls);
    }
  }

  setUI(ui) {
    this.ui = ui;
    return this;
  }

  setRenderer(renderer) {
    this.renderer3d = renderer;
    return this;
  }

  _storageRead(key, fallback = null) {
    try {
      if (typeof Storage?.get === 'function') return Storage.get(key) ?? fallback;
      if (typeof Storage?.load === 'function') return Storage.load(key) ?? fallback;
      if (typeof localStorage !== 'undefined') {
        const value = localStorage.getItem(`kanoRun:${key}`);
        if (value == null) return fallback;
        try { return JSON.parse(value); } catch { return value; }
      }
    } catch {}
    return fallback;
  }

  _storageWrite(key, value) {
    try {
      if (typeof Storage?.set === 'function') {
        Storage.set(key, value);
        return;
      }
      if (typeof Storage?.save === 'function') {
        Storage.save(key, value);
        return;
      }
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem(`kanoRun:${key}`, JSON.stringify(value));
      }
    } catch {}
  }

  _storageLoad() {
    this.routeId = this._storageRead('route', this._storageRead('selectedRoute', 'citycenter'));
    this.selectedDriver = this._storageRead('driver', this._storageRead('selectedDriver', 'ruffneck'));
    this.selectedPaint = this._storageRead('paint', this._storageRead('selectedPaint', 'classic'));
    this.selectedRadio = this._storageRead('radio', this._storageRead('selectedRadio', 'freedom'));
    this.selectedKeke = this._storageRead('keke', this._storageRead('selectedKeke', 'standard'));
    this.money = Number(this._storageRead('money', 0)) || 0;

    const claimedDate = this._storageRead('dailyClaimDate', null);
    this.dailyClaimed = claimedDate === todayKey();
  }

  _saveSelection() {
    this._storageWrite('route', this.routeId);
    this._storageWrite('driver', this.selectedDriver);
    this._storageWrite('paint', this.selectedPaint);
    this._storageWrite('radio', this.selectedRadio);
    this._storageWrite('keke', this.selectedKeke);
    this._storageWrite('money', this.money);
  }

  _ui(method, ...args) {
    try {
      const fn = this.ui?.[method];
      if (typeof fn === 'function') return fn.apply(this.ui, args);
    } catch {}
    return undefined;
  }

  _audio(methodNames, ...args) {
    for (const name of methodNames) {
      try {
        const fn = Audio?.[name];
        if (typeof fn === 'function') {
          fn.apply(Audio, args);
          return true;
        }
      } catch {}
    }
    return false;
  }

  _bindKeyboard() {
    if (typeof window === 'undefined') return;

    window.addEventListener('keydown', (event) => {
      if (event.repeat) return;

      switch (event.code) {
        case 'ArrowLeft':
        case 'KeyA':
          event.preventDefault();
          this.moveLeft();
          break;
        case 'ArrowRight':
        case 'KeyD':
          event.preventDefault();
          this.moveRight();
          break;
        case 'ArrowUp':
        case 'KeyW':
        case 'Space':
          event.preventDefault();
          this.gasDown();
          break;
        case 'ArrowDown':
        case 'KeyS':
          event.preventDefault();
          this.brakeDown();
          break;
        case 'KeyP':
          event.preventDefault();
          this.togglePause();
          break;
        case 'KeyH':
          event.preventDefault();
          this.horn();
          break;
        case 'KeyR':
          event.preventDefault();
          this.nextRadio();
          break;
        default:
          break;
      }
    });

    window.addEventListener('keyup', (event) => {
      switch (event.code) {
        case 'ArrowUp':
        case 'KeyW':
        case 'Space':
          this.gasUp();
          break;
        case 'ArrowDown':
        case 'KeyS':
          this.brakeUp();
          break;
        default:
          break;
      }
    });
  }

  // Mobile/control API. All devices use the same lane logic.
  moveLeft() {
    if (this.state !== STATE.PLAY || this.paused || this.eventOpen) return;
    this.playerLane = clamp(this.playerLane - 1, MIN_LANE, MAX_LANE);
    this.targetX = this.laneX(this.playerLane);
    this._audio(['steer', 'playSteer']);
  }

  moveRight() {
    if (this.state !== STATE.PLAY || this.paused || this.eventOpen) return;
    this.playerLane = clamp(this.playerLane + 1, MIN_LANE, MAX_LANE);
    this.targetX = this.laneX(this.playerLane);
    this._audio(['steer', 'playSteer']);
  }

  left() { this.moveLeft(); }
  right() { this.moveRight(); }

  // Compatibility API used by the 3D/mobile control layer.
  // direction < 0 moves left; direction > 0 moves right.
  changeLane(direction = 0) {
    const value = Number(direction);
    if (!Number.isFinite(value) || value === 0) return;
    if (value < 0) this.moveLeft();
    else this.moveRight();
  }

  gasDown() {
    this.gasHeld = true;
    this._externalThrottle = true;
    this.throttle = 1;
  }

  gasUp() {
    this.gasHeld = false;
    this.throttle = 0;
    this._externalThrottle = true;
  }

  brakeDown() {
    this.brakeHeld = true;
    this.brake = 1;
  }

  brakeUp() {
    this.brakeHeld = false;
    this.brake = 0;
  }

  setThrottle(value) {
    this.throttle = clamp(Number(value) || 0, 0, 1);
    this._externalThrottle = true;
    if (this.throttle > 0) this.gasHeld = false;
  }

  setBrake(value) {
    this.brake = clamp(Number(value) || 0, 0, 1);
    if (this.brake > 0) this.brakeHeld = false;
  }

  pause() {
    if (this.state !== STATE.PLAY || this.eventOpen) return;
    this.paused = true;
    this._audio(['pause']);
    this.renderer3d?.setPaused?.(true);
    this._ui('showPaused');
  }

  resume() {
    if (this.state !== STATE.PLAY) return;
    this.paused = false;
    this._audio(['resume']);
    this.renderer3d?.setPaused?.(false);
    this._ui('showPlaying');
  }

  togglePause() {
    if (this.paused) this.resume();
    else this.pause();
  }

  horn() {
    this._audio(['horn', 'playHorn', 'beep'], 'horn');
    this._ui('showToast', 'HORN');
  }

  selectRoute(routeId, persist = true) {
    if (!CONFIG.ROUTES?.[routeId]) return false;
    this.routeId = routeId;
    this.selectedRoute = CONFIG.ROUTES[routeId];
    if (persist) this._saveSelection();
    this._ui('setRoute', this.selectedRoute);
    return true;
  }

  selectDriver(driverId, persist = true) {
    const driver = CONFIG.DRIVERS?.[driverId];
    if (!driver || driver.unlocked === false) return false;
    this.selectedDriver = driverId;
    if (persist) this._saveSelection();
    this._ui('setDriver', driver);
    return true;
  }

  selectPaint(paintId, persist = true) {
    if (!CONFIG.PAINTS?.[paintId]) return false;
    this.selectedPaint = paintId;
    if (persist) this._saveSelection();
    this.renderer3d?.applyPaint?.(paintId);
    this._ui('setPaint', CONFIG.PAINTS[paintId]);
    return true;
  }

  selectKeke(kekeId, persist = true) {
    const keke = KEKES[kekeId];
    if (!keke) return false;
    if (this.level < keke.unlockLevel) {
      this._ui('showToast', `${keke.name} unlocks at level ${keke.unlockLevel}.`);
      return false;
    }
    this.selectedKeke = kekeId;
    this.capacity = keke.capacity;
    if (persist) this._saveSelection();
    this._ui('setKeke', keke);
    this.renderer3d?.setKeke?.(kekeId, keke);
    return true;
  }

  selectRadio(radioId, persist = true) {
    const radios = CONFIG.RADIO || [];
    const idx = radios.findIndex((r) => r.id === radioId);
    if (idx < 0) return false;
    this.radioIndex = idx;
    this.selectedRadio = radios[idx].id;
    if (persist) this._saveSelection();
    this._activateRadio();
    return true;
  }

  nextRadio() {
    const radios = CONFIG.RADIO || [];
    if (!radios.length) return;
    this.radioIndex = (this.radioIndex + 1) % radios.length;
    this.selectedRadio = radios[this.radioIndex].id;
    this.lastRadioSwitchFrame = this.frame;
    this._saveSelection();
    this._activateRadio();
  }

  previousRadio() {
    const radios = CONFIG.RADIO || [];
    if (!radios.length) return;
    this.radioIndex = (this.radioIndex - 1 + radios.length) % radios.length;
    this.selectedRadio = radios[this.radioIndex].id;
    this.lastRadioSwitchFrame = this.frame;
    this._saveSelection();
    this._activateRadio();
  }

  _activateRadio() {
    const station = (CONFIG.RADIO || [])[this.radioIndex];
    if (!station) return;

    this._audio(
      ['setRadioStation', 'setRadio', 'playRadio', 'radio'],
      station.id,
      station.name
    );

    this._ui('setRadio', station);

    // Keep the visible radio label readable even if the legacy UI concatenates
    // the station object directly. This also preserves the existing radio icon.
    if (typeof document !== 'undefined') {
      const radioBar = document.getElementById('radio-bar');
      if (radioBar) {
        radioBar.replaceChildren();
        const icon = document.createElement('span');
        icon.setAttribute('aria-hidden', 'true');
        icon.textContent = '📻';
        const label = document.createElement('span');
        label.textContent = station.name || station.id || 'Radio';
        radioBar.append(icon, document.createTextNode(' '), label);
      }
    }

    this._ui('showToast', `📻 ${station.name}`);
  }

  getKekeCatalog() {
    return Object.values(KEKES).map((keke) => ({
      ...keke,
      unlocked: this.level >= keke.unlockLevel,
      selected: this.selectedKeke === keke.id
    }));
  }

  getDriverCatalog() {
    return Object.values(CONFIG.DRIVERS || {}).map((driver) => ({
      ...driver,
      selected: this.selectedDriver === driver.id
    }));
  }

  getRouteCatalog() {
    return Object.values(CONFIG.ROUTES || {}).map((route) => ({
      ...route,
      selected: this.routeId === route.id
    }));
  }

  start() {
    if (this.state === STATE.PLAY && !this.paused) return;

    this.state = STATE.PLAY;
    this.paused = false;
    this.eventOpen = false;
    this.eventType = null;
    this.eventContext = null;

    this.score = 0;
    this.dist = 0;
    this.totalPax = 0;
    this.completedTrips = 0;
    this.paxCount = 0;
    this.continuesLeft = 3;
    this.combo = 0;
    this.bestCombo = 0;
    this.nearMissCount = 0;
    this.crashes = 0;
    this.speed = 0;
    this.throttle = 0;
    this.brake = 0;
    this.gasHeld = false;
    this.brakeHeld = false;
    this._externalThrottle = true;
    this._lastCrashFrame = -Infinity;
    this.frame = 0;
    this.roadOff = 0;
    this.playerLane = 1;
    this.targetX = this.laneX(this.playerLane);
    this.playerX = this.targetX;
    this.obs = [];
    this.paxZones = [];
    this.dropZones = [];
    this.coins = [];
    this.checkpoints = [];
    this.currentPassengers = [];
    this.karotaHeat = 0;
    this.karotaWanted = false;
    this.policeChase = 0;
    this.checkpointCooldown = 0;

    const driver = CONFIG.DRIVERS?.[this.selectedDriver] || CONFIG.DRIVERS?.ruffneck;
    const keke = KEKES[this.selectedKeke] || KEKES.standard;

    this.capacity = keke.capacity;
    this.maxSpeed = BASE_MAX_SPEED + (driver?.bonuses?.speed || 0) + (keke.speed || 0);
    this.maxSpeed = Math.max(5.5, this.maxSpeed);

    this.introSequence = {
      active: true,
      stage: 'walk_to_keke',
      timer: 0,
      driverId: this.selectedDriver,
      paintId: this.selectedPaint
    };

    this.renderer3d?.applyPaint?.(this.selectedPaint);
    this.renderer3d?.setKeke?.(this.selectedKeke, keke);
    this.renderer3d?.startOpeningSequence?.(this.selectedDriver, this.selectedPaint, this.selectedKeke);

    this._audio(['ensure', 'start']);
    this._activateRadio();
    this._ui('showPlaying');
    this._ui('showEvent', {
      title: 'Kano Run',
      text: `RuffNeck Adaidaita Sahu — ${this.selectedRoute?.name || 'Kano Route'}\n\nYour driver walks to the keke, boards and starts the engine.`,
      actions: [
        {
          label: 'START ROUTE',
          onClick: () => {
            this.closeEvent();
          }
        }
      ]
    });
    this._ui('updateHUD', this._hudPayload());
  }

  resize() {
    const canvas = this.canvas;
    if (!canvas) return;

    const host = canvas.parentElement;
    const width = Math.max(host?.clientWidth || canvas.clientWidth || window.innerWidth || 1, 1);
    const height = Math.max(host?.clientHeight || canvas.clientHeight || window.innerHeight || 1, 1);

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const targetWidth = Math.max(Math.round(width * dpr), 1);
    const targetHeight = Math.max(Math.round(height * dpr), 1);

    if (canvas.width !== targetWidth || canvas.height !== targetHeight) {
      canvas.width = targetWidth;
      canvas.height = targetHeight;
    }

    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;

    if (this.ctx) {
      this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }

    this.renderer3d?.resize?.();
  }

  retry() {
    this.start();
  }

  restart() {
    this.start();
  }

  closeEvent() {
    this.eventOpen = false;
    this.eventType = null;
    this.eventContext = null;
    this.state = this._resumeStateAfterEvent || STATE.PLAY;
    this.paused = false;
    this.renderer3d?.setPaused?.(false);
    this._ui('hideEvent');
    this._ui('showPlaying');
  }

  showEvent(event) {
    this.eventOpen = true;
    this.state = STATE.EVENT;
    this._resumeStateAfterEvent = STATE.PLAY;
    this.eventType = event?.type || 'generic';
    this.eventContext = event?.context || null;
    this._ui('showEvent', event);
  }

  updateOpeningSequence() {
    if (!this.introSequence.active) return false;

    this.introSequence.timer += 1;

    if (this.introSequence.stage === 'walk_to_keke') {
      if (this.introSequence.timer >= 70) {
        this.introSequence.stage = 'boarding';
        this.introSequence.timer = 0;
        this.renderer3d?.updateOpeningSequence?.(this.introSequence);
        this._audio(['walk', 'playWalk']);
      }
    } else if (this.introSequence.stage === 'boarding') {
      if (this.introSequence.timer >= 48) {
        this.introSequence.stage = 'engine_start';
        this.introSequence.timer = 0;
        this.renderer3d?.updateOpeningSequence?.(this.introSequence);
      }
    } else if (this.introSequence.stage === 'engine_start') {
      if (this.introSequence.timer === 1) {
        this._audio(['engineStart', 'startEngine', 'playEngineStart']);
      }
      if (this.introSequence.timer >= 48) {
        this.introSequence.stage = 'driving';
        this.introSequence.active = false;
        this.introSequence.timer = 0;
        this._audio(['drive', 'startEngine']);
        this.renderer3d?.updateOpeningSequence?.(this.introSequence);
        this._ui('hideEvent');
      }
    }

    this.renderer3d?.updateOpeningSequence?.(this.introSequence);
    return this.introSequence.active;
  }

  update(delta = FRAME_MS) {
    if (this.state !== STATE.PLAY || this.paused) {
      this.renderer3d?.draw?.(this);
      return;
    }

    this.frame += 1;

    if (this.eventOpen || this.state === STATE.EVENT) {
      this.renderer3d?.draw?.(this);
      return;
    }

    if (this.introSequence.active) {
      this.updateOpeningSequence();
      this.renderer3d?.draw?.(this);
      this._updateHUDEveryFrame();
      return;
    }

    if (this.bounce > 0) this.bounce -= 1;
    if (this.shake > 0) this.shake -= 1;
    if (this.checkpointCooldown > 0) this.checkpointCooldown -= 1;

    this.updateDrivingSpeed();
    this.updatePlayer();

    this.roadOff += this.speed;
    this.dist += this.speed * 0.00016;
    this.xp += this.speed * 0.02;
    this.updateLevel();

    if (this.frame - this.lastSpawnFrame >= this.trafficSpawnInterval()) {
      this.spawnTraffic();
      this.lastSpawnFrame = this.frame;
    }

    if (this.frame - this.lastPassengerFrame >= this.passengerSpawnInterval()) {
      this.spawnPassengerZone();
      this.lastPassengerFrame = this.frame;
    }

    if (this.frame - this.lastCoinFrame >= 85) {
      this.spawnCoin();
      this.lastCoinFrame = this.frame;
    }

    if (this.frame - this.lastCheckpointFrame >= this.checkpointInterval()) {
      this.spawnCheckpoint();
      this.lastCheckpointFrame = this.frame;
    }

    this.updateTraffic();
    this.updatePassengerZones();
    this.updateDropZones();
    this.updateCoins();
    this.updateCheckpoints();
    this.updatePoliceChase();

    this.handleTrafficCollisions();
    this.handlePassengerInteractions();
    this.handleCoinCollection();
    this.updateMissionProgress();
    this.updateDailyProgress();
    this.updateLandmarks();

    if (this.speed > 0.2) {
      this._audio(['updateEngine'], this.speed, this.throttle, this.brake);
    }

    this.renderer3d?.draw?.(this);
    this._updateHUDEveryFrame();
  }

  draw() {
    this.renderer3d?.draw?.(this);
  }

  updateDrivingSpeed() {
    const driver = CONFIG.DRIVERS?.[this.selectedDriver] || CONFIG.DRIVERS?.ruffneck;
    const keke = KEKES[this.selectedKeke] || KEKES.standard;
    const driverSpeed = driver?.bonuses?.speed || 0;
    const throttle = this.gasHeld ? 1 : clamp(Number(this.throttle) || 0, 0, 1);
    const braking = this.brakeHeld ? 1 : clamp(Number(this.brake) || 0, 0, 1);

    // Smooth acceleration, stronger braking, and gentle coasting. No hidden cruise
    // acceleration: the player must hold GAS or set a positive throttle value.
    if (braking > 0) {
      this.speed -= (0.075 + this.speed * 0.045) * braking;
    } else if (throttle > 0) {
      const acceleration = 0.018 + throttle * 0.025;
      this.speed += acceleration * (1 + Math.max(0, driverSpeed + keke.speed) * 0.15);
    } else {
      this.speed -= 0.008 + this.speed * 0.012;
    }

    this.maxSpeed = Math.max(5.5, BASE_MAX_SPEED + driverSpeed + (keke.speed || 0));
    this.speed = clamp(this.speed, 0, this.maxSpeed);
  }

  updatePlayer() {
    this.playerX += (this.targetX - this.playerX) * 0.28;
    this.playerY = PLAYER_Y;

    if (Math.abs(this.playerX - this.targetX) > 0.05) {
      this.bounce = Math.max(this.bounce, 2);
    }
  }

  laneX(lane) {
    const laneMap = [110, 195, 280];
    return laneMap[clamp(Math.round(lane), 0, 2)];
  }

  getTimeOfDay() {
    const cycle = (this.frame % 5400) / 5400;
    return cycle;
  }

  getWeather() {
    return this.weatherState;
  }

  setWeather(weather) {
    const allowed = ['clear', 'harmattan', 'rain'];
    if (!allowed.includes(weather)) return;
    this.weatherState = weather;
  }

  trafficSpawnInterval() {
    // Leave enough reaction time, especially on mobile and at higher levels.
    return Math.max(88, 176 - this.level * 4 - Math.floor(this.speed * 2));
  }

  passengerSpawnInterval() {
    return Math.max(105, 230 - this.level * 5);
  }

  checkpointInterval() {
    return Math.max(520, 1050 - this.level * 15);
  }

  spawnTraffic() {
    if (this.obs.length >= 18) return;

    const lane = Math.floor(Math.random() * LANES);
    const types = [
      'keke', 'keke', 'car', 'car', 'taxi', 'bus',
      'motorcycle', 'truck'
    ];

    if (this.level >= 4) types.push('police');
    if (this.level >= 6) types.push('karota');

    const type = pick(types);

    const tooClose = this.obs.some(
      (o) => o.lane === lane && o.y < -120
    );

    if (tooClose) return;

    this.obs.push({
      id: this.nextTrafficId++,
      lane,
      y: -240 - Math.random() * 300,
      type,
      speedFactor: 0.82 + Math.random() * 0.34,
      scoredNearMiss: false,
      checkpoint: false
    });
  }

  spawnPassengerZone() {
    if (this.paxZones.length >= 8) return;

    const lane = Math.floor(Math.random() * LANES);
    const passenger = weightedPick(PASSENGER_TYPES);
    const destination = pick(this.destinationPool());

    const zone = {
      id: this.nextZoneId++,
      lane,
      y: -260 - Math.random() * 260,
      taken: false,
      aishat: passenger.id === 'hajiya',
      vip: passenger.id === 'elder' || passenger.id === 'worker',
      flagging: true,
      passenger,
      passengerName: passenger.name,
      destination,
      fareBase: (this.selectedRoute?.baseFare || 150) * passenger.fare,
      waitFrames: 0
    };

    this.paxZones.push(zone);
  }

  destinationPool() {
    const route = this.selectedRoute;
    const landmarks = route?.landmarks || [];
    const merged = [
      ...KANО_DESTINATIONS,
      ...landmarks
    ];
    return [...new Set(merged)];
  }

  spawnCoin() {
    if (this.coins.length >= 10) return;
    this.coins.push({
      lane: Math.floor(Math.random() * LANES),
      y: -180 - Math.random() * 520,
      taken: false,
      bob: Math.random() * Math.PI * 2,
      value: 25 + this.level * 5
    });
  }

  spawnCheckpoint() {
    if (this.checkpoints.length >= 2 || this.checkpointCooldown > 0) return;

    const lane = Math.floor(Math.random() * LANES);
    this.checkpoints.push({
      id: `karota-${this.frame}-${lane}`,
      lane,
      y: -380 - Math.random() * 180,
      type: Math.random() < 0.52 ? 'karota' : 'police',
      active: true,
      handled: false
    });
  }

  updateTraffic() {
    for (const obstacle of this.obs) {
      obstacle.y += this.speed * 1.25 * obstacle.speedFactor;
    }

    const survivors = [];
    for (const obstacle of this.obs) {
      if (obstacle.y < 700) survivors.push(obstacle);
    }
    this.obs = survivors.filter((obstacle) => !obstacle.collided);
  }

  updatePassengerZones() {
    for (const zone of this.paxZones) {
      zone.y += this.speed;
      zone.waitFrames += 1;
      if (zone.waitFrames > 120 && zone.y > PLAYER_Y + 80) {
        zone.taken = true;
      }
    }

    this.paxZones = this.paxZones.filter(
      (zone) => !zone.taken || zone.y < PLAYER_Y + 120
    );
  }

  updateDropZones() {
    for (const zone of this.dropZones) {
      zone.y += this.speed;
      if (zone.y > 700) zone.used = true;
    }
    this.dropZones = this.dropZones.filter((zone) => !zone.used);
  }

  updateCoins() {
    for (const coin of this.coins) {
      coin.y += this.speed;
      coin.bob = (coin.bob || 0) + 0.08;
    }
    this.coins = this.coins.filter((coin) => coin.y < 700 && !coin.taken);
  }

  updateCheckpoints() {
    for (const cp of this.checkpoints) {
      if (cp.handled || !cp.active) continue;
      cp.y += this.speed;

      const dx = Math.abs(this.playerX - this.laneX(cp.lane));
      const dy = Math.abs(cp.y - PLAYER_Y);
      if (
        !this.eventOpen &&
        this.checkpointCooldown <= 0 &&
        dx <= 34 &&
        dy <= CHECKPOINT_Y
      ) {
        // Mark before opening the event so the same checkpoint cannot fire twice.
        cp.handled = true;
        this.triggerCheckpointInteraction({ type: cp.type, source: cp });
      }
    }
    this.checkpoints = this.checkpoints.filter(
      (cp) => cp.y < 700 && !cp.handled
    );
  }

  updatePoliceChase() {
    if (this.policeChase <= 0) return;

    this.policeChase -= 1;
    this.karotaWanted = true;

    if (this.frame % 90 === 0) {
      this._audio(['police', 'karotaAlert', 'siren']);
      this._ui('showToast', '🚨 KAROTA is following you. Slow down and clear the checkpoint.');
    }

    if (this.policeChase === 0) {
      this.karotaWanted = false;
      this.karotaHeat = Math.max(0, this.karotaHeat - 2);
    }
  }

  handleTrafficCollisions() {
    for (const obstacle of this.obs) {
      if (obstacle.collided) continue;
      const dx = Math.abs(this.playerX - this.laneX(obstacle.lane));
      const dy = Math.abs(obstacle.y - PLAYER_Y);
      const overlapsPlayer = dx <= 34;

      if (overlapsPlayer && dy <= COLLISION_Y) {
        if (obstacle.type === 'police' || obstacle.type === 'karota') {
          obstacle.collided = true;
          this.triggerCheckpointInteraction({
            type: obstacle.type,
            source: obstacle
          });
        } else {
          this.crash(obstacle);
        }
        return;
      }

      if (
        !obstacle.scoredNearMiss &&
        dy <= NEAR_MISS_Y &&
        dy > COLLISION_Y &&
        dx > 34 &&
        dx <= 88
      ) {
        obstacle.scoredNearMiss = true;
        this.nearMissCount += 1;
        this.combo += 1;
        this.bestCombo = Math.max(this.bestCombo, this.combo);
        this.score += Math.round(25 * (1 + this.combo * 0.1));
        this.xp += 8;
        this._audio(['nearMiss', 'playNearMiss']);
        this._ui('showCombo', this.combo);
      }
    }
  }

  crash(obstacle) {
    const driver = CONFIG.DRIVERS?.[this.selectedDriver] || CONFIG.DRIVERS?.ruffneck;
    const invFrames = driver?.bonuses?.invFrames || 10;

    if (this.frame - this._lastCrashFrame < invFrames) return;

    this._lastCrashFrame = this.frame;
    if (obstacle) obstacle.collided = true;
    this.crashes += 1;
    this.continuesLeft -= 1;
    this.combo = 0;
    this.speed = Math.max(0.8, this.speed * 0.55);
    this.shake = 18;
    this.shakeMag = 8;
    this.bounce = 10;

    this._audio(['crash', 'collision', 'playCrash']);
    this._ui('showToast', 'CRASH!');

    if (this.continuesLeft > 0) {
      this.showEvent({
        type: 'continue',
        title: 'Crash',
        text: `You hit a ${obstacle?.type || 'vehicle'}. Continue the run? You have ${this.continuesLeft} Life Saver${this.continuesLeft === 1 ? '' : 's'} left.`,
        context: { obstacle },
        actions: [
          {
            label: 'CONTINUE',
            onClick: () => this.continueRun()
          },
          {
            label: 'END RUN',
            onClick: () => this.finishRun()
          }
        ]
      });
    } else {
      this.finishRun();
    }
  }

  continueRun() {
    this.eventOpen = false;
    this.eventType = null;
    this.eventContext = null;
    this.state = STATE.PLAY;
    this.paused = false;
    this.speed = Math.max(0, this.speed);
    this.throttle = 0;
    this.brake = 0;
    this.gasHeld = false;
    this.brakeHeld = false;
    this._lastCrashFrame = this.frame;
    this.renderer3d?.setPaused?.(false);
    this._audio(['continue', 'lifeSaver']);
    this._ui('hideEvent');
    this._ui('showToast', 'Life Saver used. Keep driving.');
  }

  handlePassengerInteractions() {
    if (this.currentPassengers.length > 0) {
      for (const drop of this.dropZones) {
        if (drop.used) continue;
        if (drop.lane !== this.playerLane) continue;

        const dy = Math.abs(drop.y - PLAYER_Y);
        if (dy <= DROPOFF_Y && this.speed <= 3.0) {
          this.completeDropOff(drop);
          return;
        }
      }
    }

    if (this.currentPassengers.length < this.capacity) {
      for (const zone of this.paxZones) {
        if (zone.taken) continue;
        if (zone.lane !== this.playerLane) continue;

        const dy = Math.abs(zone.y - PLAYER_Y);
        if (dy <= PICKUP_Y && this.speed <= 3.25) {
          this.startPassengerNegotiation(zone);
          return;
        }
      }
    }
  }

  startPassengerNegotiation(zone) {
    if (this.eventOpen) return;

    const greeting = GREETINGS[(this.totalPax + zone.id) % GREETINGS.length];
    const routeBase = zone.fareBase;
    const suggested = Math.max(80, Math.round(routeBase));
    const low = Math.max(60, Math.round(routeBase * 0.82));
    const high = Math.round(routeBase * 1.26);

    zone.negotiating = true;
    this.showEvent({
      type: 'fare',
      title: `${greeting}`,
      text: `${zone.passenger.name} wants to go to ${zone.destination}. Suggested fare: ₦${suggested}.\n\nChoose how you handle the fare.`,
      context: { zone },
      actions: [
        {
          label: `ACCEPT ₦${suggested}`,
          onClick: () => this.acceptPassenger(zone, suggested, 'standard')
        },
        {
          label: `NEGOTIATE ₦${high}`,
          onClick: () => this.acceptPassenger(zone, high, 'high')
        },
        {
          label: `FAIR ₦${low}`,
          onClick: () => this.acceptPassenger(zone, low, 'fair')
        },
        {
          label: 'LET THEM GO',
          onClick: () => this.rejectPassenger(zone)
        }
      ]
    });

    this._audio(['passengerCall', 'passengerHail', 'voice'], greeting);
  }

  acceptPassenger(zone, fare, mode) {
    if (!zone || zone.taken) {
      this.closeEvent();
      return;
    }

    const driver = CONFIG.DRIVERS?.[this.selectedDriver] || CONFIG.DRIVERS?.ruffneck;
    let finalFare = fare;

    if (mode === 'high') {
      const accepted = Math.random() < 0.68;
      if (!accepted) {
        finalFare = Math.max(60, Math.round(fare * 0.82));
        this._ui('showToast', 'Passenger negotiated you down.');
      }
    }

    if (zone.aishat && driver?.bonuses?.aishatBonus) {
      finalFare += driver.bonuses.aishatBonus;
    }

    finalFare *= driver?.bonuses?.fareMult || 1;
    finalFare *= KEKES[this.selectedKeke]?.fare || 1;
    finalFare = Math.max(50, Math.round(finalFare));

    if (this.currentPassengers.length >= this.capacity) {
      this._ui('showToast', 'Keke is full.');
      this.closeEvent();
      return;
    }

    zone.taken = true;
    zone.flagging = false;
    zone.negotiating = false;

    const passenger = {
      id: zone.id,
      type: zone.passenger.id,
      name: zone.passenger.name,
      seats: zone.passenger.seats,
      destination: zone.destination,
      fare: finalFare,
      boardedFrame: this.frame
    };

    this.currentPassengers.push(passenger);
    this.paxCount = this.currentPassengers.length;
    this.totalPax += 1;
    this.lastPassenger = passenger;
    this.lastFare = finalFare;

    const drop = {
      id: `drop-${zone.id}`,
      lane: this.playerLane,
      y: -260 - Math.random() * 220,
      used: false,
      destination: zone.destination,
      passengerId: passenger.id,
      fare: finalFare,
      passenger
    };

    this.dropZones.push(drop);

    this.combo += 1;
    this.bestCombo = Math.max(this.bestCombo, this.combo);
    this.score += Math.round(finalFare * 0.35);
    this.xp += 20;

    this._audio(['pickup', 'passengerPickup', 'playPickup']);
    this._ui('showToast', `${passenger.name} aboard → ${passenger.destination}`);
    this.closeEvent();
  }

  rejectPassenger(zone) {
    if (!zone) {
      this.closeEvent();
      return;
    }

    zone.taken = true;
    zone.flagging = false;
    zone.negotiating = false;
    this.combo = 0;
    this._ui('showToast', 'Passenger missed the ride.');
    this.closeEvent();
  }

  completeDropOff(drop) {
    if (!drop || drop.used) return;

    drop.used = true;
    const idx = this.currentPassengers.findIndex(
      (p) => p.id === drop.passengerId
    );

    const passenger = idx >= 0 ? this.currentPassengers[idx] : null;
    if (idx >= 0) this.currentPassengers.splice(idx, 1);

    this.paxCount = this.currentPassengers.length;
    this.completedTrips += 1;

    const routeMultiplier = this.selectedRoute?.difficulty || 1;
    const comboMultiplier = 1 + Math.min(this.combo, 10) * 0.06;
    const finalFare = Math.max(
      50,
      Math.round((passenger?.fare || drop.fare || 100) * comboMultiplier)
    );

    this.money += finalFare;
    this.score += finalFare;
    this.xp += 30 + finalFare * 0.04;

    if (this.combo > 0) this.combo += 1;
    else this.combo = 1;

    this.bestCombo = Math.max(this.bestCombo, this.combo);
    this.lastFare = finalFare;
    this.lastDropDestination = drop.destination;

    this._audio(['dropoff', 'passengerDropoff', 'playDropoff']);
    this._ui('showToast', `Akwai! Dropped at ${drop.destination}. +₦${finalFare}`);

    if (this.mission?.type === 'drop') {
      this.mission.progress += 1;
    }

    this._saveSelection();
  }

  handleCoinCollection() {
    for (const coin of this.coins) {
      if (coin.taken) continue;
      if (coin.lane !== this.playerLane) continue;
      if (Math.abs(coin.y - PLAYER_Y) > 46) continue;

      coin.taken = true;
      this.score += coin.value;
      this.money += coin.value;
      this.xp += 5;
      this._audio(['coin', 'collectCoin', 'playCoin']);
      this._ui('showToast', `+₦${coin.value}`);
    }
  }

  triggerCheckpointInteraction({ type, source }) {
    if (this.eventOpen) return;
    if (this.checkpointCooldown > 0) return;

    const fineBase = type === 'karota'
      ? 450 + this.level * 45
      : 300 + this.level * 30;

    this.checkpointCooldown = 240;
    this.eventType = type;
    this.eventContext = { source };

    this.showEvent({
      type: 'karota',
      title: type === 'karota' ? 'KAROTA CHECKPOINT' : 'POLICE CHECKPOINT',
      text: `Officer has stopped your keke. Fine: ₦${fineBase}.\n\nKeep the interaction controlled; driving away may start a pursuit.`,
      context: { source, fineBase },
      actions: [
        {
          label: `PAY ₦${fineBase}`,
          onClick: () => this.payCheckpointFine(fineBase)
        },
        {
          label: 'NEGOTIATE',
          onClick: () => this.negotiateCheckpoint(fineBase)
        },
        {
          label: 'DISPUTE',
          onClick: () => this.disputeCheckpoint(fineBase)
        },
        {
          label: 'DRIVE OFF',
          onClick: () => this.escapeCheckpoint()
        }
      ]
    });

    this._audio(type === 'karota'
      ? ['karota', 'checkpoint', 'voice']
      : ['police', 'checkpoint', 'siren']);
  }

  payCheckpointFine(fine) {
    const amount = Math.min(this.money, fine);
    this.money -= amount;
    this.score = Math.max(0, this.score - amount);
    this.karotaHeat = Math.max(0, this.karotaHeat - 2);
    this.karotaWanted = false;
    this.policeChase = 0;
    this._ui('showToast', `Fine paid: ₦${amount}`);
    this._saveSelection();
    this.closeEvent();
  }

  negotiateCheckpoint(fine) {
    const success = Math.random() < 0.52;
    if (success) {
      const reduced = Math.max(50, Math.round(fine * 0.55));
      this.money -= Math.min(this.money, reduced);
      this.karotaHeat = Math.max(0, this.karotaHeat - 1);
      this._ui('showToast', `Negotiated checkpoint fine: ₦${reduced}`);
      this._saveSelection();
      this.closeEvent();
      return;
    }

    this.karotaHeat += 1;
    this._ui('showToast', 'Negotiation failed.');
    this.closeEvent();
  }

  disputeCheckpoint(fine) {
    const successful = Math.random() < 0.36;
    if (successful) {
      this.karotaHeat = Math.max(0, this.karotaHeat - 1);
      this._ui('showToast', 'Officer released you after checking the vehicle.');
      this.closeEvent();
      return;
    }

    const surcharge = Math.round(fine * 0.25);
    this.money -= Math.min(this.money, surcharge);
    this.karotaHeat += 2;
    this._ui('showToast', `Dispute failed. Extra cost: ₦${surcharge}`);
    this._saveSelection();
    this.closeEvent();
  }

  escapeCheckpoint() {
    this.karotaHeat += 3;
    this.karotaWanted = true;
    this.policeChase = 600 + this.level * 30;
    this.speed = Math.min(this.maxSpeed, this.speed + 0.7);
    this._audio(['siren', 'policeChase']);
    this._ui('showToast', '🚨 Pursuit started — avoid the police vehicle.');
    this.closeEvent();
  }

  updateMissionProgress() {
    if (!this.mission) return;

    switch (this.mission.type) {
      case 'dist':
        this.mission.progress = this.dist;
        break;
      case 'score':
        this.mission.progress = this.score;
        break;
      case 'pax':
        this.mission.progress = this.totalPax;
        break;
      case 'drop':
        // drop count is represented by completedTrips below
        this.mission.progress = this.completedTrips;
        break;
      case 'nearmiss':
        this.mission.progress = this.nearMissCount;
        break;
      default:
        break;
    }

    if (this.mission.progress >= this.mission.target) {
      if (!this.mission.completed) {
        this.mission.completed = true;
        const reward = 350 + this.level * 75;
        this.money += reward;
        this.score += reward;
        this.xp += 100;
        this._audio(['mission', 'missionComplete']);
        this._ui('showToast', `Mission complete! +₦${reward}`);
        this.generateMission();
        this._saveSelection();
      }
    }
  }

  generateMission() {
    const base = (CONFIG.MISSIONS || [])[this.missionIndex % (CONFIG.MISSIONS?.length || 1)];
    this.missionIndex += 1;

    if (!base) {
      this.mission = {
        text: 'Drive 2 km',
        type: 'dist',
        target: 2,
        progress: 0,
        completed: false
      };
      return;
    }

    this.mission = {
      ...base,
      progress: 0,
      completed: false
    };
  }

  updateLevel() {
    const thresholds = [0, 1.2, 3, 5.5, 8.5, 12, 16, 21, 27, 34, 42, 52];
    let newLevel = 1;

    for (let i = 1; i < thresholds.length; i++) {
      if (this.dist >= thresholds[i]) newLevel = i + 1;
      else break;
    }

    if (newLevel > this.level) {
      const oldLevel = this.level;
      this.level = newLevel;
      this.maxSpeed += Math.min(0.2, (this.level - oldLevel) * 0.08);
      this.xp += 150;
      this._ui('showToast', `LEVEL UP — Level ${this.level}`);

      const nextKeke = this.getKekeCatalog().find(
        (k) => k.unlockLevel === this.level
      );
      if (nextKeke) {
        this._ui('showToast', `Unlocked: ${nextKeke.name}`);
      }
    }
  }

  updateLandmarks() {
    if (!this.selectedRoute?.landmarks?.length) return;

    const segment = Math.floor(this.dist * 0.85) % this.selectedRoute.landmarks.length;
    if (segment !== this.lastLandmarkIndex) {
      this.lastLandmarkIndex = segment;
      const landmark = this.selectedRoute.landmarks[segment];
      this._ui('showLandmark', landmark);
    }
  }

  updateDailyProgress() {
    if (!this.mission) return;
    if (this.frame % 300 !== 0) return;
    this._ui('updateDailyMission', this.getDailyStatus());
  }

  getDailyStatus() {
    return {
      claimed: this.dailyClaimed,
      reward: this.dailyReward,
      date: todayKey(),
      progress: Math.min(1, this.dist / 1.5),
      description: 'Drive 1.5 km today to unlock your daily reward.'
    };
  }

  claimDailyReward() {
    if (this.dailyClaimed) {
      this._ui('showToast', 'Daily reward already claimed today.');
      return false;
    }

    if (this.dist < 1.5 && this.state === STATE.PLAY) {
      this._ui('showToast', 'Drive 1.5 km to claim today’s reward.');
      return false;
    }

    this.dailyClaimed = true;
    this.money += this.dailyReward;
    this.score += this.dailyReward;
    this.xp += 50;
    this._storageWrite('dailyClaimDate', todayKey());
    this._saveSelection();
    this._audio(['reward', 'dailyReward']);
    this._ui('showToast', `Daily reward claimed: ₦${this.dailyReward}`);
    return true;
  }

  finishRun() {
    this.state = STATE.OVER;
    this.paused = false;
    this.eventOpen = false;
    this.continuesLeft = Math.max(0, this.continuesLeft);
    this._audio(['gameOver', 'over']);
    this._saveSelection();

    const achievementRewards = this.checkAchievements();
    const finalReward = achievementRewards;

    if (finalReward > 0) {
      this.money += finalReward;
      this.score += finalReward;
    }

    const finalStats = {
      score: Math.round(this.score),
      money: Math.round(this.money),
      dist: Number(this.dist.toFixed(2)),
      passengers: this.totalPax,
      drops: this.completedTrips,
      bestCombo: this.bestCombo,
      nearMisses: this.nearMissCount,
      level: this.level,
      route: this.selectedRoute?.name || this.routeId,
      driver: CONFIG.DRIVERS?.[this.selectedDriver]?.name || this.selectedDriver,
      keke: KEKES[this.selectedKeke]?.name || this.selectedKeke,
      achievementReward: finalReward
    };

    this._ui('showOver', finalStats);
    this._ui('updateFinalStats', finalStats);
  }

  gameOver() {
    this.finishRun();
  }

  checkAchievements() {
    let reward = 0;
    const earned = [];

    for (const achievement of CONFIG.ACHIEVEMENTS || []) {
      let passed = false;
      try {
        passed = Boolean(achievement.check?.(this));
      } catch {}
      if (!passed) continue;

      const storageKey = `achievement:${achievement.id}`;
      if (this._storageRead(storageKey, false)) continue;

      this._storageWrite(storageKey, true);
      reward += 150;
      earned.push(achievement);
    }

    if (earned.length) {
      for (const achievement of earned) {
        this._ui('showToast', `Achievement: ${achievement.name}`);
      }
    }

    return reward;
  }

  _hudPayload() {
    const radio = (CONFIG.RADIO || [])[this.radioIndex];
    return {
      score: Math.round(this.score),
      money: Math.round(this.money),
      dist: Number(this.dist.toFixed(1)),
      pax: this.paxCount,
      capacity: this.capacity,
      lives: this.continuesLeft,
      combo: this.combo,
      level: this.level,
      speed: Number(this.speed.toFixed(1)),
      mission: this.mission,
      route: this.selectedRoute,
      driver: CONFIG.DRIVERS?.[this.selectedDriver],
      keke: KEKES[this.selectedKeke],
      radio,
      weather: this.weatherState,
      karotaWanted: this.karotaWanted,
      policeChase: this.policeChase > 0,
      passengers: this.currentPassengers.map((p) => ({
        destination: p.destination,
        fare: p.fare,
        type: p.type
      }))
    };
  }

  _updateHUDEveryFrame() {
    if (this.frame % 4 !== 0) return;
    this._ui('updateHUD', this._hudPayload());
    this._ui('updateDailyMission', this.getDailyStatus());
  }

  getState() {
    return {
      state: this.state,
      paused: this.paused,
      frame: this.frame,
      score: this.score,
      money: this.money,
      dist: this.dist,
      playerLane: this.playerLane,
      playerX: this.playerX,
      playerY: this.playerY,
      speed: this.speed,
      level: this.level,
      currentPassengers: this.currentPassengers,
      obs: this.obs,
      paxZones: this.paxZones,
      dropZones: this.dropZones,
      coins: this.coins,
      checkpoints: this.checkpoints
    };
  }
}
