import GAME_CONFIG from "./config.js";
import EventBus from "./EventBus.js";
import GameState from "./GameState.js";
import InputManager from "./InputManager.js";
import SaveManager from "./SaveManager.js";
import ServiceContainer from "./ServiceContainer.js";
import SceneManager from "./SceneManager.js";
import AudioManager from "./AudioManager.js";
import SettingsManager from "./SettingsManager.js";

export default class Game {
  constructor(options = {}) {
    this.options = options;
    this.config = options.config ?? GAME_CONFIG;

    this.events = new EventBus();
    this.services = new ServiceContainer();

    this.state = new GameState();
    this.input = new InputManager();
    this.saveManager = new SaveManager();
    this.audio = new AudioManager();
    this.settingsManager = new SettingsManager();

    this.sceneManager = null;
    this.systems = new Map();

    // Game State & Phase Management (For Opening Sequence & Gameplay)
    this.isInitialized = false;
    this.isRunning = false;
    this.isPaused = false;
    this.isDestroyed = false;
    
    this.phase = "intro"; // 'intro', 'playing', 'paused', 'gameover'
    this.introTime = 0;
    this.introDuration = 6.0; // Seconds for the opening sequence (walking to keke)

    // Loop
    this.animationFrame = null;
    this.previousTime = 0;
    this.accumulator = 0;
    this.fixedDelta = 1 / 60;
    this.timeScale = 1;
    this.targetTimeScale = 1;

    this.boundFrame = this.frame.bind(this);
    this.boundResize = this.resize.bind(this);
  }

  async initialize() {
    if (this.isDestroyed) throw new Error("Cannot initialize a destroyed game.");
    if (this.isInitialized) return this;

    try {
      this.registerCoreServices();

      this.sceneManager = new SceneManager({
        config: this.config,
        services: this.services,
        events: this.events,
      });

      await this.sceneManager.initialize({
        container: this.options.container ?? this.options.canvas?.parentElement ?? document.getElementById("game-container") ?? document.body,
      });

      this.registerSceneServices();
      await this.initializeSystems();

      this.input.initialize?.();
      this.input.enable?.();
      this.saveManager.loadProfile?.();

      window.addEventListener("resize", this.boundResize);
      this.resize();

      this.isInitialized = true;
      this.events.emit("game:initialized", { game: this });
      this.options.onReady?.(this);

      return this;
    } catch (error) {
      console.error("[Kano Run] Initialization failed:", error);
      try {
        this.stop?.();
        for (const system of [...this.systems.values()].reverse()) {
          try { system.destroy?.(); } catch (e) {}
        }
        this.systems.clear();
        try { this.sceneManager?.destroy?.(); } catch (e) {}
        this.sceneManager = null;
        this.isInitialized = false;
      } catch (cleanupErr) {
        console.warn("[Kano Run] Soft cleanup failed:", cleanupErr);
      }
      this.options.onError?.(error);
      throw error;
    }
  }

  registerCoreServices() {
    const services = {
      game: this, config: this.config, events: this.events, eventBus: this.events,
      state: this.state, gameState: this.state, input: this.input,
      saveManager: this.saveManager, audio: this.audio, settings: this.settingsManager, systems: this.systems,
    };
    for (const [name, service] of Object.entries(services)) {
      this.registerService(name, service);
    }
  }

  registerSceneServices() {
    if (!this.sceneManager) return;
    const sceneServices = {
      sceneManager: this.sceneManager, scene: this.sceneManager.scene,
      camera: this.sceneManager.camera, renderer: this.sceneManager.renderer, THREE: this.sceneManager.THREE,
    };
    for (const [name, service] of Object.entries(sceneServices)) {
      if (service) this.registerService(name, service);
    }
  }

  registerService(name, service) {
    if (typeof this.services.register === "function") this.services.register(name, service);
    else if (typeof this.services.set === "function") this.services.set(name, service);
  }

  getSystemContext() {
    return {
      game: this, config: this.config, services: this.services, events: this.events, eventBus: this.events,
      state: this.state, gameState: this.state, input: this.input, saveManager: this.saveManager,
      audio: this.audio, settings: this.settingsManager, systems: this.systems,
      sceneManager: this.sceneManager, scene: this.sceneManager?.scene ?? null,
      camera: this.sceneManager?.camera ?? null, renderer: this.sceneManager?.renderer ?? null, THREE: this.sceneManager?.THREE ?? null,
      progressionSystem: this.systems.get("progression") ?? null, routeSystem: this.systems.get("routes") ?? null,
      worldSystem: this.systems.get("world") ?? null, roadSystem: this.systems.get("road") ?? null,
      scenerySystem: this.systems.get("scenery") ?? null, vehicleSystem: this.systems.get("vehicles") ?? null,
      playerVehicleSystem: this.systems.get("playerVehicle") ?? null, drivingSystem: this.systems.get("driving") ?? null,
      trafficSystem: this.systems.get("traffic") ?? null, collisionSystem: this.systems.get("collision") ?? null,
      passengerSystem: this.systems.get("passengers") ?? null, economySystem: this.systems.get("economy") ?? null,
      missionSystem: this.systems.get("missions") ?? null, garageSystem: this.systems.get("garage") ?? null,
      customizationSystem: this.systems.get("customization") ?? null, cameraSystem: this.systems.get("camera") ?? null,
      hudSystem: this.systems.get("hud") ?? null, introSystem: this.systems.get("intro") ?? null,
    };
  }

  async initializeSystems() {
    // 🔥 CRITICAL SYSTEMS: Loaded first to ensure gameplay and intro work
    const criticalSystems = [
      ["progression", () => import("../systems/ProgressionSystem.js")],
      ["routes", () => import("../systems/RouteSystem.js")],
      ["world", () => import("../systems/WorldSystem.js")],
      ["road", () => import("../systems/RoadSystem.js")],
      ["scenery", () => import("../systems/ScenerySystem.js")],
      ["playerVehicle", () => import("../systems/PlayerVehicleSystem.js")],
      ["camera", () => import("../systems/CameraSystem.js")],
      ["traffic", () => import("../systems/TrafficSystem.js")],
      ["collision", () => import("../systems/CollisionSystem.js")],
      ["passengers", () => import("../systems/PassengerSystem.js")],
      ["intro", () => import("../systems/IntroSystem.js")],
    ];

    const criticalPromises = criticalSystems.map(async ([name, loadModule]) => {
      const module = await loadModule();
      return { name, module: module.default };
    });

    const loadedCritical = await Promise.all(criticalPromises);
    for (const { name, module } of loadedCritical) {
      const system = new module(this.getSystemContext());
      this.systems.set(name, system);
      this.registerService(`system:${name}`, system);
      await system.initialize?.(this.getSystemContext());
    }

    //  SECONDARY SYSTEMS: Loaded in background (non-blocking)
    const remainingSystems = [
      ["environment", () => import("../systems/EnvironmentSystem.js")],
      ["lighting", () => import("../systems/LightingSystem.js")],
      ["dayNight", () => import("../systems/DayNightSystem.js")],
      ["weather", () => import("../systems/WeatherSystem.js")],
      ["routeGeneration", () => import("../systems/RouteGenerationSystem.js")],
      ["vehicles", () => import("../systems/VehicleSystem.js")],
      ["driving", () => import("../systems/DrivingSystem.js")],
      ["economy", () => import("../systems/EconomySystem.js")],
      ["missions", () => import("../systems/MissionSystem.js")],
      ["garage", () => import("../systems/GarageSystem.js")],
      ["customization", () => import("../systems/CustomizationSystem.js")],
      ["particles", () => import("../systems/ParticleSystem.js")],
      ["minimap", () => import("../systems/MinimapSystem.js")],
      ["hud", () => import("../systems/HUDSystem.js")],
      ["touchControls", () => import("../systems/TouchControlsSystem.js")],
      ["pause", () => import("../systems/PauseSystem.js")],
      ["gameOver", () => import("../systems/GameOverSystem.js")],
    ];

    remainingSystems.forEach(async ([name, loadModule]) => {
      try {
        const module = await loadModule();
        const SystemClass = module.default;
        const system = new SystemClass(this.getSystemContext());
        this.systems.set(name, system);
        this.registerService(`system:${name}`, system);
        await system.initialize?.(this.getSystemContext());
      } catch (err) {
        console.warn(`[Kano Run] System failed (continuing): ${name}`, err);
      }
    });

    // Bootstrap player and camera
    try {
      const player = this.systems.get("playerVehicle");
      if (player) {
        player.initialize?.({ lane: 1, z: 0 });
        // Note: We don't call player.start() yet; that happens after the intro
      }
      const cam = this.systems.get("camera");
      if (cam && player) cam.setTarget?.(player);
      
      const road = this.systems.get("road");
      road?.initialize?.({ playerZ: 0 });
    } catch (e) {
      console.warn("[Kano Run] Player/camera bootstrap failed", e);
    }

    this.events.emit("systems:initialized", { names: [...this.systems.keys()] });
  }

  async start() {
    if (this.isDestroyed) throw new Error("Cannot start a destroyed game.");
    if (!this.isInitialized) await this.initialize();
    if (this.isRunning) return this;

    this.isPaused = false;
    this.isRunning = true;
    this.phase = "intro"; // Start with opening sequence
    this.introTime = 0;

    // Bind juice events
    if (this.events?.on && !this._juiceBound) {
      this._juiceBound = true;
      this.events.on("collision:near-miss", () => {
        this.targetTimeScale = 0.35;
        clearTimeout(this._slowMoTimer);
        this._slowMoTimer = setTimeout(() => { this.targetTimeScale = 1; }, 220);
      });
      this.events.on("traffic:near-miss", () => {
        this.targetTimeScale = 0.4;
        clearTimeout(this._slowMoTimer);
        this._slowMoTimer = setTimeout(() => { this.targetTimeScale = 1; }, 180);
      });
    }

    this.previousTime = performance.now();
    this.accumulator = 0;

    for (const system