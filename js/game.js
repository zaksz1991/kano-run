import { CONFIG } from "./config.js";
import Systems from "./systems.js";
import Audio from "./audio.js";
import Renderer3D from "./renderer3d.js";

const $ = (id) => document.getElementById(id);

const clamp = (value, min, max) =>
  Math.min(max, Math.max(min, value));

const random = (min, max) =>
  min + Math.random() * (max - min);

const pick = (items) =>
  items[Math.floor(Math.random() * items.length)];

const formatNumber = (value) =>
  Math.floor(Number(value) || 0).toLocaleString();

const DEFAULT_PROFILE = {
  version: 3,
  money: 1500,
  xp: 0,
  level: 1,
  highScore: 0,
  totalDistance: 0,
  totalPassengers: 0,
  totalRuns: 0,
  totalCoins: 0,
  totalNearMisses: 0,
  totalFines: 0,
  unlockedDrivers: ["ruffneck"],
  unlockedVehicles: ["standard"],
  unlockedPaints: ["classic"],
  achievements: [],
  dailyRewardDate: "",
  settings: {
    muted: false,
    quality: "high",
    camera: "chase",
  },
};

export class Game {
  constructor() {
    this.destroyed = false;
    this.running = false;
    this.paused = false;
    this.lastFrame = 0;
    this.elapsed = 0;
    this.spawnTimer = 0;
    this.eventTimer = 0;
    this.passengerTimer = 0;
    this.saveTimer = 0;
    this.nextTrafficId = 1;
    this.traffic = [];
    this.keys = new Set();
    this.touchControls = new Set();
    this.listeners = [];
    this.profile = this.loadProfile();
    this.selectedRoute = "citycenter";
    this.selectedDriver = "ruffneck";
    this.selectedVehicle = "standard";
    this.selectedPaint = "classic";
    this.selectedRoad = "day";
    this.selectedCamera = this.profile.settings.camera || "chase";
    this.currentScreen = "start-screen";
    this.missions = [];
    this.activeEvent = null;
    this.eventChoices = [];
    this.state = null;
    this.audio = new Audio();
    this.renderer = null;
    this.loopHandle = 0;

    this.init();
  }

  init() {
    const canvas = $("c");

    if (!canvas) {
      throw new Error('Required canvas "#c" was not found.');
    }

    this.renderer = new Renderer3D(canvas);
    this.audio.init?.();

    if (this.profile.settings.muted) {
      this.audio.mute?.();
    }

    this.bindUI();
    this.bindKeyboard();
    this.renderRouteList();
    this.renderDriverList();
    this.renderGarage();
    this.renderQuickDrivers();
    this.renderAchievements();
    this.updateProfileHUD();
    this.showScreen("start-screen");
    this.showLoadingComplete();

    this.resizeHandler = () => this.renderer?.resize?.();
    window.addEventListener("resize", this.resizeHandler);

    this.loopHandle = requestAnimationFrame((time) => this.loop(time));
  }

  loadProfile() {
    const key = CONFIG?.STORAGE_KEYS?.profile || "kanoRunProfileV3";

    try {
      const raw = localStorage.getItem(key);
      const saved = raw ? JSON.parse(raw) : {};
      const profile = {
        ...DEFAULT_PROFILE,
        ...saved,
        settings: {
          ...DEFAULT_PROFILE.settings,
          ...(saved.settings || {}),
        },
      };

      profile.unlockedDrivers = Array.isArray(profile.unlockedDrivers)
        ? profile.unlockedDrivers
        : ["ruffneck"];

      profile.unlockedVehicles = Array.isArray(profile.unlockedVehicles)
        ? profile.unlockedVehicles
        : ["standard"];

      profile.unlockedPaints = Array.isArray(profile.unlockedPaints)
        ? profile.unlockedPaints
        : ["classic"];

      profile.achievements = Array.isArray(profile.achievements)
        ? profile.achievements
        : [];

      return profile;
    } catch (error) {
      console.warn("[Kano Run] Could not load saved profile.", error);
      return structuredClone(DEFAULT_PROFILE);
    }
  }

  saveProfile() {
    const key = CONFIG?.STORAGE_KEYS?.profile || "kanoRunProfileV3";

    try {
      localStorage.setItem(key, JSON.stringify(this.profile));
    } catch (error) {
      console.warn("[Kano Run] Could not save profile.", error);
    }
  }

  listen(element, event, handler, options) {
    if (!element) return;

    element.addEventListener(event, handler, options);

    this.listeners.push(() => {
      element.removeEventListener(event, handler, options);
    });
  }

  bindUI() {
    this.listen($("start-btn"), "click", () => this.start());
    this.listen($("retry-btn"), "click", () => this.start());
    this.listen($("home-btn"), "click", () => {
      this.finishRunIfActive();
      this.showScreen("start-screen");
    });

    this.listen($("route-btn"), "click", () => {
      this.showScreen("route-screen");
      this.renderRouteList();
    });

    this.listen($("garage-btn"), "click", () => {
      this.showScreen("garage-screen");
      this.renderGarage();
    });

    this.listen($("route-back"), "click", () => {
      this.showScreen("start-screen");
    });

    this.listen($("garage-back"), "click", () => {
      this.showScreen("start-screen");
    });

    this.listen($("help-btn"), "click", () => {
      const overlay = $("help-overlay");
      if (overlay) overlay.style.display = "flex";
    });

    this.listen($("help-gotit"), "click", () => {
      const overlay = $("help-overlay");
      if (overlay) overlay.style.display = "none";
    });

    this.listen($("pause-btn"), "click", () => this.togglePause());
    this.listen($("horn-btn"), "click", () => this.horn());
    this.listen($("radio-btn"), "click", () => this.toggleRadio());
    this.listen($("cam-btn"), "click", () => this.toggleCamera());
    this.listen($("mute-btn"), "click", () => this.toggleMute());
    this.listen($("quality-btn"), "click", () => this.toggleQuality());

    this.listen($("claim-daily"), "click", () => this.claimDailyReward());
    this.listen($("share-btn"), "click", () => this.shareRun());

    this.bindControl("left-btn", "left");
    this.bindControl("right-btn", "right");
    this.bindControl("gas-btn", "gas");
    this.bindControl("brake-btn", "brake");

    this.listen(document, "click", (event) => {
      const routeButton = event.target.closest("[data-route]");
      if (routeButton) {
        const route = this.getRoute(routeButton.dataset.route);
        if (route) {
          this.selectedRoute = route.id;
          this.renderRouteList();
          this.updateSelectionStatus();
        }
      }

      const driverButton = event.target.closest("[data-driver]");
      if (driverButton) {
        this.selectDriver(driverButton.dataset.driver);
      }

      const paintButton = event.target.closest("[data-paint]");
      if (paintButton) {
        this.selectPaint(paintButton.dataset.paint);
      }

      const vehicleButton = event.target.closest("[data-vehicle]");
      if (vehicleButton) {
        this.selectVehicle(vehicleButton.dataset.vehicle);
      }
    });

    this.updateDailyRewardButton();
  }

  bindControl(id, control) {
    const element = $(id);
    if (!element) return;

    const start = (event) => {
      event.preventDefault();
      this.touchControls.add(control);
      this.audio.unlock?.();
    };

    const end = (event) => {
      event.preventDefault();
      this.touchControls.delete(control);
    };

    this.listen(element, "pointerdown", start);
    this.listen(element, "pointerup", end);
    this.listen(element, "pointercancel", end);
    this.listen(element, "pointerleave", end);
    this.listen(element, "contextmenu", (event) => event.preventDefault());
  }

  bindKeyboard() {
    this.listen(window, "keydown", (event) => {
      const key = event.key.toLowerCase();

      if (
        ["arrowleft", "arrowright", "arrowup", "arrowdown", " "].includes(key)
      ) {
        event.preventDefault();
      }

      if (event.repeat && ["p", "escape", "h", "c"].includes(key)) {
        return;
      }

      this.keys.add(key);
      this.audio.unlock?.();

      if (key === "arrowleft" || key === "a") this.touchControls.add("left");
      if (key === "arrowright" || key === "d") this.touchControls.add("right");
      if (key === "arrowup" || key === "w") this.touchControls.add("gas");
      if (key === "arrowdown" || key === "s") this.touchControls.add("brake");

      if (key === " " || key === "p" || key === "escape") {
        if (this.running) this.togglePause();
      }

      if (key === "h") this.horn();
      if (key === "c") this.toggleCamera();
      if (key === "m") this.toggleMute();
    });

    this.listen(window, "keyup", (event) => {
      const key = event.key.toLowerCase();
      this.keys.delete(key);

      if (key === "arrowleft" || key === "a") this.touchControls.delete("left");
      if (key === "arrowright" || key === "d") this.touchControls.delete("right");
      if (key === "arrowup" || key === "w") this.touchControls.delete("gas");
      if (key === "arrowdown" || key === "s") this.touchControls.delete("brake");
    });

    this.listen(window, "blur", () => {
      this.keys.clear();
      this.touchControls.clear();

      if (this.running && !this.paused) {
        this.setPaused(true);
      }
    });
  }

  showLoadingComplete() {
    const loading = $("loading-screen");
    if (loading) loading.style.display = "none";
  }

  showScreen(id) {
    const screens = [
      "start-screen",
      "route-screen",
      "garage-screen",
      "over-screen",
    ];

    for (const screenId of screens) {
      const element = $(screenId);
      if (element) {
        element.style.display = screenId === id ? "flex" : "none";
      }
    }

    this.currentScreen = id;

    const controls = $("controls");
    const hud = $("ui-overlay");

    const inGame = id === "game-container";

    if (controls) controls.style.display = inGame ? "flex" : "none";
    if (hud) hud.style.display = inGame ? "block" : "none";

    const gameContainer = $("game-container");
    if (gameContainer) {
      gameContainer.style.display =
        inGame || id === "start-screen" || id === "route-screen" || id === "garage-screen"
          ? "block"
          : "none";
    }
  }

  getRoutes() {
    return Array.isArray(CONFIG?.ROUTES) ? CONFIG.ROUTES : [];
  }

  getRoute(id) {
    return this.getRoutes().find((route) => route.id === id) || null;
  }

  getDrivers() {
    return Array.isArray(CONFIG?.DRIVERS) ? CONFIG.DRIVERS : [];
  }

  getVehicles() {
    return Array.isArray(CONFIG?.VEHICLES) ? CONFIG.VEHICLES : [];
  }

  getPaints() {
    return Array.isArray(CONFIG?.PAINTS) ? CONFIG.PAINTS : [];
  }

  getSelectedVehicle() {
    return this.getVehicles().find((vehicle) => vehicle.id === this.selectedVehicle)
      || { id: "standard", name: "Standard Keke", capacity: 3, unlockLevel: 1 };
  }

  getSelectedDriver() {
    return this.getDrivers().find((driver) => driver.id === this.selectedDriver)
      || { id: "ruffneck", name: "RuffNeck", unlockLevel: 1 };
  }

  isUnlocked(kind, id) {
    const key = {
      driver: "unlockedDrivers",
      vehicle: "unlockedVehicles",
      paint: "unlockedPaints",
    }[kind];

    return key ? this.profile[key].includes(id) : false;
  }

  getUnlockLevel(item) {
    return Number(item?.unlockLevel ?? item?.level ?? 1);
  }

  renderRouteList() {
    const container = $("route-list");
    if (!container) return;

    container.replaceChildren();

    for (const route of this.getRoutes()) {
      const button = document.createElement("button");
      button.type = "button";
      button.dataset.route = route.id;
      button.className = `route-card${route.id === this.selectedRoute ? " selected" : ""}`;

      const title = document.createElement("strong");
      title.textContent = route.name || route.id;

      const description = document.createElement("span");
      description.textContent = route.description || route.district || "Kano route";

      button.append(title, description);
      container.appendChild(button);
    }
  }

  renderQuickDrivers() {
    const container = $("quick-drivers");
    if (!container) return;

    container.replaceChildren();

    for (const driver of this.getDrivers().slice(0, 6)) {
      const button = document.createElement("button");
      button.type = "button";
      button.dataset.driver = driver.id;
      button.textContent = driver.name || driver.id;
      button.disabled = !this.isUnlocked("driver", driver.id);
      button.classList.toggle("selected", driver.id === this.selectedDriver);
      container.appendChild(button);
    }
  }

  renderDriverList() {
    const container = $("driver-list");
    if (!container) return;

    container.replaceChildren();

    for (const driver of this.getDrivers()) {
      const unlocked = this.isUnlocked("driver", driver.id);
      const button = document.createElement("button");

      button.type = "button";
      button.dataset.driver = driver.id;
      button.className = `collection-card${driver.id === this.selectedDriver ? " selected" : ""}`;
      button.disabled = !unlocked;

      const name = document.createElement("strong");
      name.textContent = driver.name || driver.id;

      const detail = document.createElement("span");
      detail.textContent = unlocked
        ? driver.description || "Available driver"
        : `Unlock at level ${this.getUnlockLevel(driver)}`;

      button.append(name, detail);
      container.appendChild(button);
    }
  }

  renderGarage() {
    this.renderDriverList();
    this.renderPaintList();
    this.renderVehicleList();
    this.updateSelectionStatus();
  }

  renderVehicleList() {
    let container = $("garage-vehicles");

    if (!container) {
      const garage = $("garage-screen");
      if (!garage) return;

      container = document.createElement("div");
      container.id = "garage-vehicles";
      container.className = "collection-grid";

      const heading = document.createElement("h3");
      heading.textContent = "Keke Garage";
      garage.insertBefore(heading, $("driver-list") || garage.firstChild);
      garage.insertBefore(container, $("driver-list") || garage.firstChild);
    }

    container.replaceChildren();

    for (const vehicle of this.getVehicles()) {
      const unlocked = this.isUnlocked("vehicle", vehicle.id);
      const button = document.createElement("button");

      button.type = "button";
      button.dataset.vehicle = vehicle.id;
      button.className = `collection-card${vehicle.id === this.selectedVehicle ? " selected" : ""}`;
      button.disabled = !unlocked;

      const name = document.createElement("strong");
      name.textContent = vehicle.name || vehicle.id;

      const detail = document.createElement("span");
      detail.textContent = unlocked
        ? `Capacity: ${vehicle.capacity ?? 3}`
        : `Unlock at level ${this.getUnlockLevel(vehicle)}`;

      button.append(name, detail);
      container.appendChild(button);
    }
  }

  renderPaintList() {
    const container = $("paint-list");
    if (!container) return;

    container.replaceChildren();

    for (const paint of this.getPaints()) {
      const unlocked = this.isUnlocked("paint", paint.id);
      const button = document.createElement("button");

      button.type = "button";
      button.dataset.paint = paint.id;
      button.className = `collection-card${paint.id === this.selectedPaint ? " selected" : ""}`;
      button.disabled = !unlocked;

      const name = document.createElement("strong");
      name.textContent = paint.name || paint.id;

      const detail = document.createElement("span");
      detail.textContent = unlocked
        ? "Available paint"
        : `Unlock at level ${this.getUnlockLevel(paint)}`;

      button.append(name, detail);
      container.appendChild(button);
    }
  }

  selectDriver(id) {
    if (!this.isUnlocked("driver", id)) {
      this.toast("This driver is still locked.");
      return;
    }

    this.selectedDriver = id;
    this.renderDriverList();
    this.renderQuickDrivers();
    this.updateSelectionStatus();
  }

  selectVehicle(id) {
    if (!this.isUnlocked("vehicle", id)) {
      this.toast("This vehicle is still locked.");
      return;
    }

    this.selectedVehicle = id;
    this.renderVehicleList();
    this.updateSelectionStatus();
  }

  selectPaint(id) {
    if (!this.isUnlocked("paint", id)) {
      this.toast("This paint is still locked.");
      return;
    }

    this.selectedPaint = id;
    this.renderPaintList();
    this.updateSelectionStatus();
  }

  updateSelectionStatus() {
    const status = $("selection-status");
    if (!status) return;

    const route = this.getRoute(this.selectedRoute);
    const driver = this.getSelectedDriver();
    const vehicle = this.getSelectedVehicle();

    status.textContent =
      `${route?.name || "Kano"} · ${driver.name || driver.id} · ${vehicle.name || vehicle.id}`;
  }

  createRunState() {
    const vehicle = this.getSelectedVehicle();
    const capacity = Math.max(1, Number(vehicle.capacity) || 3);

    return {
      speed: 0,
      maxSpeed: Number(vehicle.maxSpeed) || 34,
      lane: 1,
      distance: 0,
      score: 0,
      money: 0,
      xp: 0,
      passengers: 0,
      totalPassengers: 0,
      totalCoins: 0,
      nearMisses: 0,
      fines: 0,
      lives: 3,
      fuel: 100,
      condition: 100,
      tyres: 100,
      capacity,
      elapsed: 0,
      combo: 1,
      comboTimer: 0,
      passengerDeliveryDistance: 0,
      finished: false,
    };
  }

  start() {
    if (this.running) {
      this.setPaused(false);
      return;
    }

    this.state = this.createRunState();
    this.traffic = [];
    this.missions = Systems.generateRunMissions?.(3) || [];
    this.activeEvent = null;
    this.eventChoices = [];
    this.spawnTimer = 0.8;
    this.eventTimer = random(22, 34);
    this.passengerTimer = 7;
    this.elapsed = 0;
    this.paused = false;
    this.running = true;

    this.renderer?.clearTraffic?.();
    this.renderer?.createPlayerVehicle?.({
      vehicle: this.selectedVehicle,
      driver: this.selectedDriver,
      paint: this.selectedPaint,
    });
    this.renderer?.setPlayerLane?.(this.state.lane);
    this.renderer?.setCameraMode?.(this.selectedCamera);

    this.audio.startEngine?.();
    this.audio.startAmbience?.();
    this.showScreen("game-container");
    this.toast("Kano Run started");
    this.updateHUD();
  }

  finishRunIfActive() {
    if (this.running) this.endRun("Run ended");
  }

  loop(time) {
    if (this.destroyed) return;

    const dt = this.lastFrame
      ? clamp((time - this.lastFrame) / 1000, 0, 0.05)
      : 0;

    this.lastFrame = time;

    if (this.running && !this.paused) {
      this.update(dt);
    }

    this.renderer?.update?.(dt, this.state || {});
    this.renderer?.render?.();

    this.loopHandle = requestAnimationFrame((nextTime) => this.loop(nextTime));
  }

  update(dt) {
    const state = this.state;
    if (!state || state.finished) return;

    state.elapsed += dt;
    this.elapsed += dt;

    this.updateDriving(dt);
    this.updateDistance(dt);
    this.updateTraffic(dt);
    this.spawnTraffic(dt);
    this.updatePassengers(dt);
    this.updateEvents(dt);
    this.updateMissions(dt);
    this.updateFuelAndCondition(dt);
    this.updateUnlocks();
    this.updateHUD();

    this.saveTimer += dt;
    if (this.saveTimer >= 15) {
      this.saveTimer = 0;
      this.saveProfile();
    }

    if (state.fuel <= 0) {
      this.endRun("Out of fuel");
    } else if (state.lives <= 0) {
      this.endRun("Vehicle disabled");
    }
  }

  updateDriving(dt) {
    const state = this.state;
    const accelerating = this.touchControls.has("gas");
    const braking = this.touchControls.has("brake");
    const left = this.touchControls.has("left");
    const right = this.touchControls.has("right");

    const acceleration = accelerating ? 15 : -4.5;
    state.speed = clamp(
      state.speed + acceleration * dt,
      0,
      braking ? 8 : state.maxSpeed,
    );

    if (braking) {
      state.speed = Math.max(0, state.speed - 24 * dt);
    }

    if (left && !this.previousLeft) this.changeLane(-1);
    if (right && !this.previousRight) this.changeLane(1);

    this.previousLeft = left;
    this.previousRight = right;

    this.renderer?.setPlayerLane?.(state.lane);
    this.renderer?.updatePlayerVehicle?.({
      speed: state.speed,
      lane: state.lane,
      condition: state.condition,
    });

    this.audio.updateEngine?.(state.speed / Math.max(1, state.maxSpeed));
  }

  changeLane(direction) {
    if (!this.running || this.paused || !this.state) return;

    const laneCount = Array.isArray(CONFIG?.LANES)
      ? CONFIG.LANES.length
      : 3;

    const nextLane = clamp(this.state.lane + direction, 0, laneCount - 1);
    if (nextLane === this.state.lane) return;

    const blocked = this.traffic.some((vehicle) =>
      vehicle.lane === nextLane &&
      Math.abs(vehicle.z) < 12
    );

    if (blocked) {
      this.toast("Traffic is blocking that lane.");
      return;
    }

    this.state.lane = nextLane;
  }

  updateDistance(dt) {
    const state = this.state;
    const travelled = state.speed * dt * 0.018;

    state.distance += travelled;
    state.score += Math.floor(state.speed * dt * 1.8);
    state.fuel = Math.max(0, state.fuel - state.speed * dt * 0.0022);
    state.passengerDeliveryDistance += travelled;

    this.profile.totalDistance += travelled;

    if (state.comboTimer > 0) {
      state.comboTimer -= dt;
      if (state.comboTimer <= 0) state.combo = 1;
    }

    if (state.passengers > 0 && state.passengerDeliveryDistance >= 1.5) {
      this.deliverPassengers();
      state.passengerDeliveryDistance = 0;
    }
  }

  spawnTraffic(dt) {
    this.spawnTimer -= dt;
    if (this.spawnTimer > 0) return;

    this.spawnTimer = random(1.1, 2.2);

    const types = Array.isArray(CONFIG?.TRAFFIC_VEHICLES)
      ? CONFIG.TRAFFIC_VEHICLES
      : ["car", "keke", "taxi", "bus", "motorcycle", "truck"];

    const laneCount = Array.isArray(CONFIG?.LANES)
      ? CONFIG.LANES.length
      : 3;

    const lanes = Array.from({ length: laneCount }, (_, index) => index)
      .sort(() => Math.random() - 0.5);

    const type = pick(types);
    const lane = lanes.find((candidateLane) =>
      Systems.isSafeToSpawn?.(
        { lane: candidateLane, z: -90 },
        this.traffic,
        28,
      ) ?? true
    );

    if (lane === undefined) return;

    const id = `traffic-${this.nextTrafficId++}`;
    const vehicle = {
      id,
      type: typeof type === "string" ? type : type.id || "car",
      lane,
      z: -90,
      speed: random(3, 13),
      passed: false,
      nearMissHandled: false,
    };

    this.traffic.push(vehicle);
    this.renderer?.addTrafficVehicle?.(vehicle);
  }

  updateTraffic(dt) {
    const state = this.state;
    if (!state) return;

    for (let index = this.traffic.length - 1; index >= 0; index--) {
      const vehicle = this.traffic[index];

      vehicle.z += (state.speed + vehicle.speed) * dt * 0.48;

      this.renderer?.updateTrafficVehicle?.(vehicle.id, {
        z: vehicle.z,
        lane: vehicle.lane,
        speed: vehicle.speed,
      });

      const longitudinalGap = Math.abs(vehicle.z);
      const sameLane = vehicle.lane === state.lane;

      if (
        sameLane &&
        longitudinalGap < 3.8 &&
        state.speed > 4
      ) {
        this.handleCollision(vehicle);
        this.removeTrafficAt(index);
        continue;
      }

      if (
        !vehicle.nearMissHandled &&
        !sameLane &&
        longitudinalGap < 4 &&
        longitudinalGap > 1.2 &&
        state.speed > 12
      ) {
        vehicle.nearMissHandled = true;
        state.nearMisses++;
        state.score += 30 * state.combo;
        state.combo = Math.min(5, state.combo + 1);
        state.comboTimer = 4;
        this.profile.totalNearMisses++;
        this.toast(`Near miss! ×${state.combo}`);
      }

      if (!vehicle.passed && vehicle.z > 5) {
        vehicle.passed = true;
        state.score += 5;
      }

      if (vehicle.z > 30) {
        this.removeTrafficAt(index);
      }
    }
  }

  removeTrafficAt(index) {
    const [vehicle] = this.traffic.splice(index, 1);
    if (vehicle) this.renderer?.removeTrafficVehicle?.(vehicle.id);
  }

  handleCollision(vehicle) {
    const state = this.state;
    if (!state) return;

    const collision = Systems.calculateCollision?.({
      speed: state.speed,
      condition: state.condition,
      vehicleType: vehicle.type,
    }) || {
      damage: 18,
      remainingCondition: Math.max(0, state.condition - 18),
      speedLoss: 8,
      severe: state.speed > 20,
    };

    state.condition = clamp(
      Number(collision.remainingCondition ?? state.condition - collision.damage),
      0,
      100,
    );

    state.speed = Math.max(0, state.speed - (collision.speedLoss || 8));
    state.score = Math.max(0, state.score - 25);
    state.combo = 1;
    state.comboTimer = 0;

    if (collision.severe) {
      state.lives--;
    }

    this.audio.playCrash?.();
    this.toast(
      collision.severe
        ? "Heavy collision! Vehicle damaged."
        : "Collision! Drive carefully.",
    );

    if (state.condition <= 0) {
      state.lives = 0;
    }
  }

  updatePassengers(dt) {
    this.passengerTimer -= dt;
    if (this.passengerTimer > 0) return;

    this.passengerTimer = random(9, 16);

    const state = this.state;
    if (!state || state.passengers >= state.capacity) return;

    const boarding = Math.min(
      state.capacity - state.passengers,
      Math.random() < 0.25 ? 2 : 1,
    );

    state.passengers += boarding;
    state.totalPassengers += boarding;

    this.audio.playPickup?.();
    this.toast(
      `${boarding} passenger${boarding === 1 ? "" : "s"} boarded.`,
    );

    this.updateMissionProgress("passengers", state.totalPassengers);
  }

  deliverPassengers() {
    const state = this.state;
    if (!state || state.passengers <= 0) return;

    const count = state.passengers;
    const farePerPassenger = 100 + Math.round(state.distance * 5);
    const fare = count * farePerPassenger;
    const tip = Systems.calculateTip?.(fare) || 0;
    const earnings = fare + tip;

    state.passengers = 0;
    state.money += earnings;
    state.totalCoins += earnings;
    state.score += earnings;
    state.xp += count * 12;

    this.profile.totalCoins += earnings;

    this.audio.playCoin?.();
    this.audio.playSuccess?.();
    this.toast(`Passengers delivered: +₦${formatNumber(earnings)}`);

    this.updateMissionProgress("deliveries", 1);
  }

  updateEvents(dt) {
    this.eventTimer -= dt;

    if (this.eventTimer > 0 || this.activeEvent) return;

    this.eventTimer = random(25, 42);

    const events = Array.isArray(CONFIG?.ROAD_EVENTS)
      ? CONFIG.ROAD_EVENTS
      : [];

    if (!events.length || Math.random() > 0.55) return;

    const event = pick(events);
    this.activeEvent = event;

    const box = $("event-box");
    const title = $("event-title");
    const text = $("event-text");
    const choices = $("event-choices");

    if (title) title.textContent = event.title || event.name || "Road event";
    if (text) {
      text.textContent =
        event.description || event.text || "A situation has developed ahead.";
    }

    if (choices) {
      choices.replaceChildren();

      const options = Array.isArray(event.choices) && event.choices.length
        ? event.choices
        : [
            { label: "Continue", action: "continue" },
            { label: "Pay ₦100", action: "pay" },
          ];

      for (const option of options) {
        const button = document.createElement("button");
        button.type = "button";
        button.textContent = option.label || option.name || "Choose";

        button.addEventListener("click", () => {
          this.resolveEvent(option);
        }, { once: true });

        choices.appendChild(button);
      }
    }

    if (box) box.style.display = "block";
  }

  resolveEvent(option) {
    const state = this.state;
    if (!state || !this.activeEvent) return;

    const action = String(option?.action || option?.id || "").toLowerCase();

    if (action.includes("pay") || action.includes("fine")) {
      const cost = Math.min(state.money, Number(option.cost ?? 100));
      state.money -= cost;
      state.fines += cost;
      this.profile.totalFines += cost;
      this.toast(`Paid ₦${formatNumber(cost)}.`);
    } else if (action.includes("reward") || action.includes("help")) {
      const reward = Math.max(0, Number(option.reward ?? 150));
      state.money += reward;
      state.xp += 10;
      this.toast(`Reward: +₦${formatNumber(reward)}.`);
    } else {
      this.toast("You continued your journey.");
    }

    this.activeEvent = null;

    const box = $("event-box");
    if (box) box.style.display = "none";
  }

  updateMissions() {
    if (!Array.isArray(this.missions)) return;

    for (const mission of this.missions) {
      if (mission.completed) continue;

      const type = String(mission.type || mission.id || "").toLowerCase();

      if (type.includes("distance")) {
        this.updateMissionProgress(mission.id, this.state.distance);
      } else if (type.includes("passenger")) {
        this.updateMissionProgress(
          mission.id,
          this.state.totalPassengers,
        );
      } else if (type.includes("near")) {
        this.updateMissionProgress(
          mission.id,
          this.state.nearMisses,
        );
      } else if (type.includes("coin") || type.includes("earn")) {
        this.updateMissionProgress(
          mission.id,
          this.state.totalCoins,
        );
      }
    }
  }

  updateMissionProgress(type, value) {
    for (const mission of this.missions) {
      const missionType = String(mission.type || mission.id || "").toLowerCase();
      const matches =
        missionType === String(type).toLowerCase() ||
        missionType.includes(String(type).toLowerCase()) ||
        String(mission.id).toLowerCase() === String(type).toLowerCase();

      if (!matches || mission.completed) continue;

      const target = Math.max(1, Number(mission.target) || 1);
      mission.progress = Math.min(target, Math.max(
        Number(mission.progress) || 0,
        Number(value) || 0,
      ));

      if (mission.progress >= target) {
        mission.completed = true;

        const reward = Math.max(0, Number(mission.reward) || 200);
        this.state.money += reward;
        this.state.xp += 30;

        this.audio.playLevelUp?.();
        this.toast(`Mission complete: +₦${formatNumber(reward)}`);
      }
    }
  }

  updateFuelAndCondition(dt) {
    const state = this.state;
    if (!state) return;

    if (state.condition < 35 && state.speed > 20) {
      state.speed = Math.min(state.speed, 20);
    }

    state.tyres = clamp(state.condition + 5, 0, 100);
  }

  updateUnlocks() {
    const level = Systems.getLevelFromXP?.(this.profile.xp + this.state.xp) || 1;
    let changed = false;

    for (const [kind, key, items] of [
      ["driver", "unlockedDrivers", this.getDrivers()],
      ["vehicle", "unlockedVehicles", this.getVehicles()],
      ["paint", "unlockedPaints", this.getPaints()],
    ]) {
      for (const item of items) {
        if (
          !this.profile[key].includes(item.id) &&
          this.getUnlockLevel(item) <= level
        ) {
          this.profile[key].push(item.id);
          changed = true;
          this.toast(`Unlocked: ${item.name || item.id}`);
        }
      }
    }

    if (changed) {
      this.renderGarage();
      this.renderQuickDrivers();
    }
  }

  updateHUD() {
    const state = this.state;
    if (!state) return;

    this.setText("score", formatNumber(state.score));
    this.setText("dist", `${state.distance.toFixed(1)} km`);
    this.setText("pax", `${state.passengers}/${state.capacity}`);
    this.setText("capacity", String(state.capacity));
    this.setText("lives", String(state.lives));
    this.setText("speedo", String(Math.round(state.speed)));
    this.setText("fuel", `${Math.round(state.fuel)}%`);
    this.setText("condition", `${Math.round(state.condition)}%`);
    this.setText("tyre-status", `${Math.round(state.tyres)}%`);
    this.setText("level-label", `LEVEL ${this.getCurrentLevel()}`);

    const route = this.getRoute(this.selectedRoute);
    this.setText("route-label", route?.name || "Kano");
    this.setText("driver-label", this.getSelectedDriver().name || "Driver");
    this.setText("zone-label", route?.district || route?.area || "Kano");
    this.setText("mission-label", this.getActiveMissionLabel());

    const fuel = $("fuel");
    if (fuel) fuel.style.setProperty("--value", `${state.fuel}%`);

    const condition = $("condition");
    if (condition) condition.style.setProperty("--value", `${state.condition}%`);

    const combo = $("combo-display");
    if (combo) {
      combo.textContent = state.combo > 1 ? `×${state.combo}` : "";
    }
  }

  getCurrentLevel() {
    return Systems.getLevelFromXP?.(this.profile.xp + (this.state?.xp || 0)) || 1;
  }

  getActiveMissionLabel() {
    const mission = this.missions.find((item) => !item.completed);
    if (!mission) return "Free Drive";

    return `${mission.name || mission.title || "Mission"} ${Math.floor(
      Number(mission.progress) || 0,
    )}/${Math.floor(Number(mission.target) || 1)}`;
  }

  updateProfileHUD() {
    this.setText("hs", formatNumber(this.profile.highScore));
    this.setText("final-hs", formatNumber(this.profile.highScore));
  }

  setText(id, value) {
    const element = $(id);
    if (element) element.textContent = value;
  }

  togglePause() {
    if (!this.running) return;
    this.setPaused(!this.paused);
  }

  setPaused(paused) {
    this.paused = Boolean(paused);

    if (this.paused) {
      this.audio.stopEngine?.();
      this.toast("Paused — press P or tap pause to resume.");
    } else {
      this.audio.startEngine?.();
      this.lastFrame = 0;
      this.toast("Run resumed.");
    }

    const button = $("pause-btn");
    if (button) button.textContent = this.paused ? "Resume" : "Pause";
  }

  horn() {
    if (!this.running || this.paused) return;
    this.audio.horn?.();
    this.toast("Beep beep!");
  }

  toggleRadio() {
    if (this.audio.radioEnabled) {
      this.audio.stopRadio?.();
      this.setText("radio-label", "Radio Off");
    } else {
      this.audio.startRadio?.();
      this.setText(
        "radio-label",
        this.audio.getCurrentStation?.()?.name || "Radio On",
      );
    }
  }

  toggleCamera() {
    this.selectedCamera = this.selectedCamera === "chase" ? "driver" : "chase";
    this.renderer?.setCameraMode?.(this.selectedCamera);
    this.toast(`Camera: ${this.selectedCamera}`);
  }

  toggleMute() {
    const muted = this.audio.toggleMute?.();
    this.profile.settings.muted =
      typeof muted === "boolean" ? muted : !this.profile.settings.muted;

    this.saveProfile();
    this.toast(this.profile.settings.muted ? "Audio muted." : "Audio enabled.");
  }

  toggleQuality() {
    const quality = this.profile.settings.quality === "high" ? "low" : "high";
    this.profile.settings.quality = quality;
    this.renderer?.setQuality?.(quality);
    this.saveProfile();
    this.toast(`Graphics quality: ${quality}`);
  }

  claimDailyReward() {
    const today = new Date().toISOString().slice(0, 10);

    if (this.profile.dailyRewardDate === today) {
      this.toast("Daily reward already claimed.");
      return;
    }

    const reward = 500;
    this.profile.money += reward;
    this.profile.dailyRewardDate = today;

    this.saveProfile();
    this.updateDailyRewardButton();
    this.updateProfileHUD();
    this.toast(`Daily reward claimed: +₦${formatNumber(reward)}`);
  }

  updateDailyRewardButton() {
    const button = $("claim-daily");
    if (!button) return;

    const today = new Date().toISOString().slice(0, 10);
    const claimed = this.profile.dailyRewardDate === today;

    button.disabled = claimed;
    button.textContent = claimed ? "Reward Claimed" : "Claim Daily Reward";
  }

  renderAchievements() {
    const container = $("ach-list");
    if (!container) return;

    container.replaceChildren();

    const achievements = Array.isArray(CONFIG?.ACHIEVEMENTS)
      ? CONFIG.ACHIEVEMENTS
      : [];

    for (const achievement of achievements) {
      const item = document.createElement("div");
      item.className = "achievement-card";

      const name = document.createElement("strong");
      name.textContent = achievement.name || achievement.title || achievement.id;

      const detail = document.createElement("span");
      detail.textContent = achievement.description || "Keep driving to unlock.";

      item.append(name, detail);
      container.appendChild(item);
    }
  }

  endRun(reason = "Run complete") {
    if (!this.running || !this.state) return;

    const state = this.state;
    state.finished = true;

    this.running = false;
    this.paused = false;

    this.audio.stopEngine?.();
    this.audio.stopAmbience?.();

    this.deliverPassengers();

    const finalXP = Math.max(0, Math.floor(state.xp));
    const finalMoney = Math.max(0, Math.floor(state.money));

    this.profile.xp += finalXP;
    this.profile.money += finalMoney;
    this.profile.highScore = Math.max(this.profile.highScore, state.score);
    this.profile.totalRuns++;
    this.profile.totalPassengers += state.totalPassengers;
    this.profile.totalCoins += state.totalCoins;

    this.updateUnlocks();
    this.saveProfile();

    this.setText("final-stats", [
      reason,
      `Score: ${formatNumber(state.score)}`,
      `Distance: ${state.distance.toFixed(1)} km`,
      `Passengers: ${formatNumber(state.totalPassengers)}`,
      `Earned: ₦${formatNumber(finalMoney)}`,
      `XP earned: ${formatNumber(finalXP)}`,
    ].join("\n"));

    this.setText("final-hs", formatNumber(this.profile.highScore));
    this.updateProfileHUD();
    this.updateDailyRewardButton();
    this.showScreen("over-screen");
  }

  shareRun() {
    const state = this.state;
    if (!state) return;

    const text = [
      "I played Kano Run — Adaidaita Sahu!",
      `Score: ${formatNumber(state.score)}`,
      `Distance: ${state.distance.toFixed(1)} km`,
      "Built by RuffNeck Entertainment.",
    ].join("\n");

    if (navigator.share) {
      navigator.share({ title: "Kano Run", text }).catch(() => {});
    } else if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(text)
        .then(() => this.toast("Run results copied."))
        .catch(() => this.toast(text));
    } else {
      this.toast(text);
    }
  }

  toast(message) {
    const element = $("mission-toast");

    if (!element) {
      console.info("[Kano Run]", message);
      return;
    }

    element.textContent = String(message);
    element.classList.add("visible");
    element.style.display = "block";

    clearTimeout(this.toastTimer);

    this.toastTimer = setTimeout(() => {
      element.classList.remove("visible");
      element.style.display = "";
    }, 2400);
  }

  dispose() {
    if (this.destroyed) return;

    this.destroyed = true;
    this.running = false;

    cancelAnimationFrame(this.loopHandle);
    clearTimeout(this.toastTimer);

    for (const removeListener of this.listeners) {
      try {
        removeListener();
      } catch {
        // Continue cleanup even if a listener has already been removed.
      }
    }

    window.removeEventListener("resize", this.resizeHandler);

    this.saveProfile();
    this.audio.stopAll?.();
    this.audio.dispose?.();
    this.renderer?.dispose?.();

    this.traffic.length = 0;
    this.keys.clear();
    this.touchControls.clear();
  }
}

export default Game;