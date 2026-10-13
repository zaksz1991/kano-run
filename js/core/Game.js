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

    this.isInitialized = false;
    this.isRunning = false;
    this.isPaused = false;
    this.isDestroyed = false;

    this.animationFrame = null;
    this.previousTime = 0;
    this.accumulator = 0;
    this.fixedDelta = 1 / 60;

    this.boundFrame = this.frame.bind(this);
    this.boundResize = this.resize.bind(this);
  }

  async initialize() {
    if (this.isDestroyed) {
      throw new Error("Cannot initialize a destroyed game.");
    }

    if (this.isInitialized) {
      return this;
    }

    try {
      this.registerCoreServices();

      this.sceneManager = new SceneManager({
        config: this.config,
        services: this.services,
        events: this.events,
      });

      await this.sceneManager.initialize();

      this.registerSceneServices();
      await this.initializeSystems();

      this.input.initialize?.();
      this.saveManager.loadProfile?.();

      window.addEventListener("resize", this.boundResize);

      this.resize();

      this.isInitialized = true;

      this.events.emit?.("game:initialized", {
        game: this,
      });

      return this;
    } catch (error) {
      console.error("[Kano Run] Initialization failed:", error);
      this.destroy();
      throw error;
    }
  }

  registerCoreServices() {
    const services = {
      game: this,
      config: this.config,
      events: this.events,
      state: this.state,
      input: this.input,
      saveManager: this.saveManager,
      audio: this.audio,
      settings: this.settingsManager,
      systems: this.systems,
    };

    for (const [name, service] of Object.entries(services)) {
      this.registerService(name, service);
    }
  }

  registerSceneServices() {
    if (!this.sceneManager) return;

    const sceneServices = {
      sceneManager: this.sceneManager,
      scene: this.sceneManager.scene,
      camera: this.sceneManager.camera,
      renderer: this.sceneManager.renderer,
    };

    for (const [name, service] of Object.entries(sceneServices)) {
      if (service) {
        this.registerService(name, service);
      }
    }
  }

  registerService(name, service) {
    if (typeof this.services.register === "function") {
      this.services.register(name, service);
    } else if (typeof this.services.set === "function") {
      this.services.set(name, service);
    }
  }

  async initializeSystems() {
    const systemModules = [
      ["world", () => import("../systems/WorldSystem.js")],
      ["road", () => import("../systems/RoadSystem.js")],
      ["scenery", () => import("../systems/ScenerySystem.js")],
      ["environment", () => import("../systems/EnvironmentSystem.js")],
      ["lighting", () => import("../systems/LightingSystem.js")],
      ["dayNight", () => import("../systems/DayNightSystem.js")],
      ["weather", () => import("../systems/WeatherSystem.js")],
      ["routes", () => import("../systems/RouteSystem.js")],
      ["routeGeneration", () => import("../systems/RouteGenerationSystem.js")],
      ["vehicles", () => import("../systems/VehicleSystem.js")],
      ["playerVehicle", () => import("../systems/PlayerVehicleSystem.js")],
      ["driving", () => import("../systems/DrivingSystem.js")],
      ["traffic", () => import("../systems/TrafficSystem.js")],
      ["collision", () => import("../systems/CollisionSystem.js")],
      ["passengers", () => import("../systems/PassengerSystem.js")],
      ["economy", () => import("../systems/EconomySystem.js")],
      ["missions", () => import("../systems/MissionSystem.js")],
      ["progression", () => import("../systems/ProgressionSystem.js")],
      ["garage", () => import("../systems/GarageSystem.js")],
      ["customization", () => import("../systems/CustomizationSystem.js")],
      ["particles", () => import("../systems/ParticleSystem.js")],
      ["camera", () => import("../systems/CameraSystem.js")],
      ["minimap", () => import("../systems/MinimapSystem.js")],
      ["hud", () => import("../systems/HUDSystem.js")],
      ["touchControls", () => import("../systems/TouchControlsSystem.js")],
      ["pause", () => import("../systems/PauseSystem.js")],
      ["gameOver", () => import("../systems/GameOverSystem.js")],
    ];

    for (const [name, loadModule] of systemModules) {
      const module = await loadModule();
      const SystemClass = module.default;

      if (typeof SystemClass !== "function") {
        console.warn(`[Kano Run] Skipping invalid system: ${name}`);
        continue;
      }

      const context = {
        game: this,
        config: this.config,
        services: this.services,
        events: this.events,
        state: this.state,
        input: this.input,
        sceneManager: this.sceneManager,
        scene: this.sceneManager?.scene,
        camera: this.sceneManager?.camera,
        renderer: this.sceneManager?.renderer,
        saveManager: this.saveManager,
        audio: this.audio,
      };

      const system = new SystemClass(context);

      this.systems.set(name, system);

      this.registerService(`system:${name}`, system);

      if (typeof system.initialize === "function") {
        await system.initialize(context);
      }
    }

    this.events.emit?.("systems:initialized", {
      names: [...this.systems.keys()],
    });
  }

  async start() {
    if (this.isDestroyed) {
      throw new Error("Cannot start a destroyed game.");
    }

    if (!this.isInitialized) {
      await this.initialize();
    }

    if (this.isRunning) return this;

    this.isPaused = false;
    this.isRunning = true;
    this.previousTime = performance.now();
    this.accumulator = 0;

    for (const system of this.systems.values()) {
      system.start?.();
    }

    this.animationFrame = requestAnimationFrame(this.boundFrame);

    this.events.emit?.("game:started", {
      game: this,
    });

    return this;
  }

  frame(timestamp) {
    if (!this.isRunning || this.isDestroyed) return;

    const elapsed = Math.min(
      Math.max((timestamp - this.previousTime) / 1000, 0),
      0.1
    );

    this.previousTime = timestamp;

    if (!this.isPaused) {
      this.accumulator += elapsed;

      while (this.accumulator >= this.fixedDelta) {
        this.update(this.fixedDelta);
        this.accumulator -= this.fixedDelta;
      }

      this.render(this.accumulator / this.fixedDelta);
    }

    this.animationFrame = requestAnimationFrame(this.boundFrame);
  }

  update(delta) {
    this.state.update?.(delta);

    for (const system of this.systems.values()) {
      if (system.enabled === false) continue;

      system.update?.(delta);
    }

    this.saveManager.updateProfile?.(
      this.state.getProfile?.() ?? {},
      { autosave: true }
    );

    this.events.emit?.("game:updated", { delta });
  }

  render(interpolation = 0) {
    for (const system of this.systems.values()) {
      if (system.enabled === false) continue;

      system.render?.(interpolation);
    }

    this.sceneManager?.render?.();
  }

  pause() {
    if (!this.isRunning || this.isPaused) return;

    this.isPaused = true;

    for (const system of this.systems.values()) {
      system.pause?.();
    }

    this.events.emit?.("game:paused");
  }

  resume() {
    if (!this.isRunning || !this.isPaused) return;

    this.isPaused = false;
    this.previousTime = performance.now();

    for (const system of this.systems.values()) {
      system.resume?.();
    }

    this.events.emit?.("game:resumed");
  }

  stop() {
    if (!this.isRunning) return;

    this.isRunning = false;

    if (this.animationFrame !== null) {
      cancelAnimationFrame(this.animationFrame);
      this.animationFrame = null;
    }

    for (const system of this.systems.values()) {
      system.stop?.();
    }

    this.saveManager.save?.();

    this.events.emit?.("game:stopped");
  }

  resize() {
    if (this.isDestroyed) return;

    this.sceneManager?.resize?.();

    for (const system of this.systems.values()) {
      system.resize?.(
        window.innerWidth,
        window.innerHeight
      );
    }
  }

  getSystem(name) {
    return this.systems.get(name) ?? null;
  }

  async restart() {
    this.stop();
    this.isPaused = false;

    for (const system of this.systems.values()) {
      await system.reset?.();
    }

    await this.state.reset?.();

    return this.start();
  }

  destroy() {
    if (this.isDestroyed) return;

    this.stop();

    window.removeEventListener("resize", this.boundResize);

    for (const system of [...this.systems.values()].reverse()) {
      try {
        system.destroy?.();
      } catch (error) {
        console.error("[Kano Run] System cleanup failed:", error);
      }
    }

    this.systems.clear();

    this.input.destroy?.();
    this.audio.destroy?.();
    this.sceneManager?.destroy?.();
    this.saveManager.destroy?.();

    this.events.emit?.("game:destroyed");
    this.events.clear?.();

    this.isInitialized = false;
    this.isDestroyed = true;
  }
}