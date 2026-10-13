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
    this.timeScale = 1;
    this.targetTimeScale = 1;

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

      await this.sceneManager.initialize({
        container:
          this.options.container ??
          this.options.canvas?.parentElement ??
          document.getElementById("game-container") ??
          document.body,
      });

      this.registerSceneServices();

      await this.initializeSystems();

      this.input.initialize?.();
      this.input.enable?.();
      this.saveManager.loadProfile?.();

      window.addEventListener("resize", this.boundResize);

      this.resize();

      this.isInitialized = true;

      this.events.emit("game:initialized", {
        game: this,
      });

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
      game: this,
      config: this.config,
      events: this.events,
      eventBus: this.events,
      state: this.state,
      gameState: this.state,
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
      THREE: this.sceneManager.THREE,
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

  getSystemContext() {
    return {
      game: this,
      config: this.config,
      services: this.services,
      events: this.events,
      eventBus: this.events,
      state: this.state,
      gameState: this.state,
      input: this.input,
      saveManager: this.saveManager,
      audio: this.audio,
      settings: this.settingsManager,
      systems: this.systems,
      sceneManager: this.sceneManager,
      scene: this.sceneManager?.scene ?? null,
      camera: this.sceneManager?.camera ?? null,
      renderer: this.sceneManager?.renderer ?? null,
      THREE: this.sceneManager?.THREE ?? null,
      progressionSystem: this.systems.get("progression") ?? null,
      routeSystem: this.systems.get("routes") ?? null,
      worldSystem: this.systems.get("world") ?? null,
      roadSystem: this.systems.get("road") ?? null,
      scenerySystem: this.systems.get("scenery") ?? null,
      vehicleSystem: this.systems.get("vehicles") ?? null,
      playerVehicleSystem: this.systems.get("playerVehicle") ?? null,
      drivingSystem: this.systems.get("driving") ?? null,
      trafficSystem: this.systems.get("traffic") ?? null,
      collisionSystem: this.systems.get("collision") ?? null,
      passengerSystem: this.systems.get("passengers") ?? null,
      economySystem: this.systems.get("economy") ?? null,
      missionSystem: this.systems.get("missions") ?? null,
      garageSystem: this.systems.get("garage") ?? null,
      customizationSystem: this.systems.get("customization") ?? null,
      cameraSystem: this.systems.get("camera") ?? null,
      hudSystem: this.systems.get("hud") ?? null,
    };
  }

  async initializeSystems() {
    const systemModules = [
      ["progression", () => import("../systems/ProgressionSystem.js")],
      ["routes", () => import("../systems/RouteSystem.js")],
      ["world", () => import("../systems/WorldSystem.js")],
      ["road", () => import("../systems/RoadSystem.js")],
      ["scenery", () => import("../systems/ScenerySystem.js")],
      ["environment", () => import("../systems/EnvironmentSystem.js")],
      ["lighting", () => import("../systems/LightingSystem.js")],
      ["dayNight", () => import("../systems/DayNightSystem.js")],
      ["weather", () => import("../systems/WeatherSystem.js")],
      ["routeGeneration", () => import("../systems/RouteGenerationSystem.js")],
      ["vehicles", () => import("../systems/VehicleSystem.js")],
      ["playerVehicle", () => import("../systems/PlayerVehicleSystem.js")],
      ["driving", () => import("../systems/DrivingSystem.js")],
      ["traffic", () => import("../systems/TrafficSystem.js")],
      ["collision", () => import("../systems/CollisionSystem.js")],
      ["passengers", () => import("../systems/PassengerSystem.js")],
      ["economy", () => import("../systems/EconomySystem.js")],
      ["missions", () => import("../systems/MissionSystem.js")],
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
      if (this.isDestroyed) {
        throw new Error(`Game destroyed while initializing "${name}".`);
      }

      try {
        const module = await loadModule();
        const SystemClass = module.default;

        if (typeof SystemClass !== "function") {
          console.warn(`[Kano Run] Skip system (no default export): ${name}`);
          continue;
        }

        const context = this.getSystemContext();
        const system = new SystemClass(context);

        this.systems.set(name, system);
        this.registerService(`system:${name}`, system);

        if (typeof system.initialize === "function") {
          if (name === "world") {
            const selectedRoute = this.systems.get("routes")?.getSelectedRoute?.() ?? null;
            await system.initialize(selectedRoute);
          } else {
            await system.initialize(this.getSystemContext());
          }
        }
      } catch (err) {
        console.warn(`[Kano Run] System failed (continuing): ${name}`, err?.message || err);
      }
    }

    const finalContext = this.getSystemContext();

    for (const [name, system] of this.systems) {
      if (typeof system.setDependencies === "function") {
        system.setDependencies(finalContext);
      }

      this.events.emit("system:initialized", { name, system });
    }

    this.events.emit("systems:initialized", { names: [...this.systems.keys()] });

    try {
      const player = this.systems.get("playerVehicle");
      if (player) {
        player.initialize?.({ lane: 1, z: 0 });
        player.start?.();
      }
      const cam = this.systems.get("camera");
      if (cam && player) {
        cam.setTarget?.(player);
      }
      const road = this.systems.get("road");
      road?.initialize?.({ playerZ: 0 });
    } catch (e) {
      console.warn("[Kano Run] Player/camera bootstrap failed", e);
    }
  }

  async start() {
    if (this.isDestroyed) {
      throw new Error("Cannot start a destroyed game.");
    }

    if (!this.isInitialized) {
      await this.initialize();
    }

    if (this.isRunning) {
      return this;
    }

    this.isPaused = false;
    this.isRunning = true;

    if (this.events?.on && !this._juiceBound) {
      this._juiceBound = true;
      this.events.on("collision:near-miss", () => {
        this.targetTimeScale = 0.35;
        clearTimeout(this._slowMoTimer);
        this._slowMoTimer = setTimeout(() => {
          this.targetTimeScale = 1;
        }, 220);
      });
      this.events.on("traffic:near-miss", () => {
        this.targetTimeScale = 0.4;
        clearTimeout(this._slowMoTimer);
        this._slowMoTimer = setTimeout(() => {
          this.targetTimeScale = 1;
        }, 180);
      });
    }

    this.previousTime = performance.now();
    this.accumulator = 0;

    for (const system of this.systems.values()) {
      system.start?.();
    }

    this.animationFrame = requestAnimationFrame(this.boundFrame);

    this.events.emit("game:started", { game: this });

    return this;
  }

  frame(timestamp) {
    if (!this.isRunning || this.isDestroyed) {
      return;
    }

    const elapsed = Math.min(Math.max((timestamp - this.previousTime) / 1000, 0), 0.1);
    this.previousTime = timestamp;

    if (!this.isPaused) {
      this.accumulator += elapsed;

      this.timeScale = this.timeScale ?? 1;
      this.targetTimeScale = this.targetTimeScale ?? 1;
      const blend = 1 - Math.exp(-8 * elapsed);
      this.timeScale += (this.targetTimeScale - this.timeScale) * blend;

      while (this.accumulator >= this.fixedDelta) {
        this.update(this.fixedDelta * this.timeScale);
        this.accumulator -= this.fixedDelta;
      }

      this.render(this.accumulator / this.fixedDelta);
    }

    this.animationFrame = requestAnimationFrame(this.boundFrame);
  }

  update(delta) {
    this.state.update?.(delta);

    const player = this.systems.get("playerVehicle");
    const playerZ = Number(player?.position?.z) || 0;
    const speed = Number(player?.speed) || Number(this.state.run?.speed) || 0;

    try {
      this.state.run && (this.state.run.speed = speed);
      this.state.setSpeed?.(speed);
    } catch (e) {}

    for (const [name, system] of this.systems) {
      if (system.enabled === false) continue;

      if (name === "world") {
        system.update?.(delta, speed);
      } else if (name === "road" || name === "scenery" || name === "traffic") {
        system.update?.(delta, playerZ);
      } else {
        system.update?.(delta);
      }
    }

    this.saveManager.updateProfile?.(this.state.getProfile?.() ?? {}, { autosave: true });

    try {
      if (player && this.audio?.updateEngine) {
        this.audio.updateEngine(player.speed || 0, player.preset?.maxSpeed || 34);
      }
      
      const ratio = Math.min(
        1,
        Math.abs(player?.speed || 0) / Math.max(1, player?.preset?.maxSpeed || 34)
      );
      this.sceneManager?.post?.setSpeedAberration?.(ratio);
    } catch (e) {}

    this.events.emit("game:updated", { delta });

    // 🔥 FIX 1: Call the adaptive quality governor every frame
    this.sceneManager?.govern?.(delta);
  }

  render(interpolation = 0) {
    for (const system of this.systems.values()) {
      if (system.enabled === false) continue;
      system.render?.(interpolation);
    }

    // 🔥 FIX 2: Pass interpolation/delta to SceneManager so PostProcessing animates correctly
    this.sceneManager?.render?.(interpolation);
  }

  pause() {
    if (!this.isRunning || this.isPaused) return;
    this.isPaused = true;
    for (const system of this.systems.values()) {
      system.pause?.();
    }
    this.events.emit("game:paused");
  }

  resume() {
    if (!this.isRunning || !this.isPaused) return;
    this.isPaused = false;
    this.previousTime = performance.now();
    for (const system of this.systems.values()) {
      system.resume?.();
    }
    this.events.emit("game:resumed");
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
    this.events.emit("game:stopped");
  }

  resize() {
    if (this.isDestroyed) return;
    this.sceneManager?.resize?.();
    for (const system of this.systems.values()) {
      system.resize?.(window.innerWidth, window.innerHeight);
    }
  }

  getSystem(name) {
    return this.systems.get(name) ?? null;
  }

  async restart() {
    if (this.isDestroyed) {
      throw new Error("Cannot restart a destroyed game.");
    }
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

    if (typeof window !== "undefined") {
      window.removeEventListener("resize", this.boundResize);
    }

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
    this.state.destroy?.();
    this.services.destroy?.();

    try { this.events?.safeEmit?.("game:destroyed") ?? this.events?.emit?.("game:destroyed"); } catch (e) {}
    try { this.events?.destroy?.(); } catch (e) {}

    this.isInitialized = false;
    this.isDestroyed = true;
  }
}