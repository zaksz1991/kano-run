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

    this.phase = "intro";
    this.introTime = 0;
    this.introDuration = 6;

    this.animationFrame = null;
    this.previousTime = 0;
    this.accumulator = 0;
    this.fixedDelta = 1 / 60;

    this.timeScale = 1;
    this.targetTimeScale = 1;

    this._juiceBound = false;
    this._slowMoTimer = null;

    this.boundFrame = this.frame.bind(this);
    this.boundResize = this.resize.bind(this);
  }

  async initialize() {
    if (this.isDestroyed) {
      throw new Error("Cannot initialize a destroyed game.");
    }

    if (this.isInitialized) return this;

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

      await this.audio.initialize?.();

      await this.initializeSystems();

      this.input.initialize?.();
      this.input.enable?.();
      this.saveManager.loadProfile?.();

      if (typeof window !== "undefined") {
        window.addEventListener("resize", this.boundResize);
      }

      this.resize();

      this.isInitialized = true;

      this.events.emit("game:initialized", {
        game: this,
      });

      this.options.onReady?.(this);

      // Lobby: wait for MenuSystem START before driving phase
      this.events?.on?.("game:request-start", (payload) => {
        try {
          const player = this.systems.get("playerVehicle");
          if (payload?.vehicleType && player?.setVehicleType) {
            player.setVehicleType(payload.vehicleType, { reset: true });
          }
          if (payload?.driver && player) {
            player.driverProfile = payload.driver;
            if (payload.driver.maxSpeedBonus) {
              player.config = {
                ...player.config,
                maxSpeed:
                  (player.config.maxSpeed || 34) +
                  Number(payload.driver.maxSpeedBonus || 0),
              };
            }
          }
        } catch (e) {
          console.warn("[Kano Run] lobby apply failed", e);
        }
        if (!this.isRunning) {
          this.start();
        }
      });

      return this;
    } catch (error) {
      console.error("[Kano Run] Initialization failed:", error);

      this.stop();

      for (const system of [...this.systems.values()].reverse()) {
        this._disposeSystem(system);
      }

      this.systems.clear();

      try {
        this.sceneManager?.destroy?.();
      } catch (cleanupError) {
        console.warn(
          "[Kano Run] Scene cleanup failed:",
          cleanupError,
        );
      }

      this.sceneManager = null;
      this.isInitialized = false;

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
    const playerVehicle = this.systems.get("playerVehicle") ?? null;

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

      player: playerVehicle,
      playerVehicleSystem: playerVehicle,
      vehicleSystem: this.systems.get("vehicles") ?? null,

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
      introSystem: this.systems.get("intro") ?? null,
      negotiationSystem: this.systems.get("negotiation") ?? null,
      checkpointSystem: this.systems.get("checkpoint") ?? null,
    };
  }

  getSystemInitializationOptions(name) {
    const player = this.systems.get("playerVehicle");

    const playerZ = Number(player?.position?.z) || 0;
    const playerLane = Number.isFinite(player?.lane)
      ? player.lane
      : 1;

    switch (name) {
      case "world":
        // WorldSystem.initialize expects a district, not the
        // entire system context.
        return undefined;

      case "road":
        return { playerZ };

      case "scenery":
        return {
          playerZ,
          worldSystem: this.systems.get("world") ?? null,
          routeSystem: this.systems.get("routes") ?? null,
          weatherSystem: this.systems.get("weather") ?? null,
          eventBus: this.events,
        };

      case "playerVehicle":
        return {
          lane: playerLane,
          z: playerZ,
        };

      case "vehicles":
        return {
          playerZ,
          playerLane,
          initialVehicles: 8,
        };

      default:
        return this.getSystemContext();
    }
  }

  async loadSystem(name, loadModule, { required = false } = {}) {
    const startedAt = performance.now();

    try {
      const module = await loadModule();
      const SystemClass = module.default;

      if (typeof SystemClass !== "function") {
        throw new Error(`System "${name}" has no valid default export.`);
      }

      const system = new SystemClass(this.getSystemContext());

      this.systems.set(name, system);
      this.registerService(`system:${name}`, system);

      const initOptions = this.getSystemInitializationOptions(name);

      if (initOptions === undefined) {
        await system.initialize?.();
      } else {
        await system.initialize?.(initOptions);
      }

      console.info(
        `[Kano Run] System "${name}" initialized in ${(performance.now() - startedAt).toFixed(1)} ms`
      );

      return system;
    } catch (error) {
      const partialSystem = this.systems.get(name);

      if (partialSystem) {
        this._disposeSystem(partialSystem);
      }

      this.systems.delete(name);

      const duration = (performance.now() - startedAt).toFixed(1);

      if (required) {
        console.error(
          `[Kano Run] Required system "${name}" failed after ${duration} ms:`,
          error
        );

        throw error;
      }

      console.warn(
        `[Kano Run] Optional system "${name}" failed after ${duration} ms:`,
        error
      );

      return null;
    }
  }

  async initializeSystems() {
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
      ["negotiation", () => import("../systems/NegotiationSystem.js")],
      ["checkpoint", () => import("../systems/CheckpointSystem.js")],
      ["chase", () => import("../systems/ChaseSystem.js")],
      ["landmarks", () => import("../systems/LandmarkSystem.js")],
    ];

    for (const [name, loadModule] of criticalSystems) {
      await this.loadSystem(name, loadModule, {
        required: true,
      });
    }

    // Initialize the player before systems that depend on its state.
    const player = this.systems.get("playerVehicle");

    if (player) {
      const camera = this.systems.get("camera");
      camera?.setTarget?.(player);
    }

    const optionalSystems = [
      ["menu", () => import("../systems/MenuSystem.js")],
      ["environment", () => import("../systems/EnvironmentSystem.js")],
      ["lighting", () => import("../systems/LightingSystem.js")],
      ["dayNight", () => import("../systems/DayNightSystem.js")],
      ["weather", () => import("../systems/WeatherSystem.js")],
      ["routeGeneration", () => import("../systems/RouteGenerationSystem.js")],
      ["driving", () => import("../systems/DrivingSystem.js")],
      ["vehicles", () => import("../systems/VehicleSystem.js")],
      ["economy", () => import("../systems/EconomySystem.js")],
      ["missions", () => import("../systems/MissionSystem.js")],
      ["garage", () => import("../systems/GarageSystem.js")],
      ["customization", () => import("../systems/CustomizationSystem.js")],
      ["particles", () => import("../systems/ParticleSystem.js")],
      ["minimap", () => import("../systems/MinimapSystem.js")],
      ["hud", () => import("../systems/HUDSystem.js")],
      ["lifeSaver", () => import("../systems/LifeSaverSystem.js")],
      ["damage", () => import("../systems/DamageSystem.js")],
      ["shareRun", () => import("../systems/ShareRunSystem.js")],
      ["billboardAds", () => import("../systems/BillboardAdSystem.js")],
      ["touchControls", () => import("../systems/TouchControlsSystem.js")],
      ["pause", () => import("../systems/PauseSystem.js")],
      ["gameOver", () => import("../systems/GameOverSystem.js")],
    ];

    // Await each optional system so its dependencies are available
    // before the next system is constructed and initialized.
    for (const [name, loadModule] of optionalSystems) {
      await this.loadSystem(name, loadModule);
    }

    this.events.emit("systems:initialized", {
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
    this.phase = "intro";
    this.introTime = 0;

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

    this.events.emit("game:started", {
      game: this,
    });

    return this;
  }

  frame(timestamp) {
    if (!this.isRunning || this.isDestroyed) return;

    const elapsed = Math.min(
      Math.max((timestamp - this.previousTime) / 1000, 0),
      0.1,
    );

    this.previousTime = timestamp;

    if (!this.isPaused) {
      this.accumulator += elapsed;

      const blend = 1 - Math.exp(-8 * elapsed);

      this.timeScale +=
        (this.targetTimeScale - this.timeScale) * blend;

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

    if (this.phase === "intro") {
      this.introTime += delta;

      this.systems.get("intro")?.update?.(delta);

      if (this.introTime >= this.introDuration) {
        this.phase = "playing";

        this.systems.get("playerVehicle")?.start?.();

        this.events.emit("game:intro-complete");
      }
    } else if (this.phase === "playing") {
      const player = this.systems.get("playerVehicle");

      const playerZ = Number(player?.position?.z) || 0;
      const playerLane = Number.isFinite(player?.lane)
        ? player.lane
        : 1;
      const speed =
        Number(player?.speed) ||
        Number(this.state.run?.speed) ||
        0;

      try {
        if (this.state.run) {
          this.state.run.speed = speed;
        }

        this.state.setSpeed?.(speed);
      } catch {
        // Keep the frame running if a state implementation
        // does not expose a speed setter.
      }

      for (const [name, system] of this.systems) {
        if (system.enabled === false) continue;

        try {
          switch (name) {
            case "world":
              system.update?.(delta, speed);
              break;

            case "road":
              system.update?.(delta, playerZ);
              break;

            case "scenery":
              system.update?.(delta, playerZ);
              break;

            case "vehicles":
              system.update?.(delta, {
                playerZ,
                playerLane,
                playerSpeed: speed,
              });
              break;

            case "traffic":
              system.update?.(delta, {
                z: playerZ,
                speed,
                lane: playerLane,
                position: { z: playerZ },
              });
              break;

            case "passengers":
            case "checkpoint":
            case "chase":
            case "landmarks":
            case "weather":
            case "damage":
            case "billboardAds":
              system.update?.(delta, playerZ, speed);
              break;

            default:
              system.update?.(delta);
              break;
          }
        } catch (error) {
          console.error(
            `[Kano Run] System update failed: ${name}`,
            error,
          );
        }
      }

      this.saveManager.updateProfile?.(
        this.state.getProfile?.() ?? {},
        { autosave: true },
      );

      try {
        if (player && this.audio?.updateEngine) {
          this.audio.updateEngine(
            player.speed || 0,
            player.preset?.maxSpeed || 34,
          );
        }

        const ratio = Math.min(
          1,
          Math.abs(player?.speed || 0) /
            Math.max(1, player?.preset?.maxSpeed || 34),
        );

        this.sceneManager?.post?.setSpeedAberration?.(ratio);
      } catch {
        // Audio and post-processing must not stop gameplay.
      }

      this.events.emit("game:updated", { delta });
    }

    this.sceneManager?.govern?.(delta);
  }

  render(interpolation = 0) {
    for (const system of this.systems.values()) {
      if (system.enabled === false) continue;

      try {
        system.render?.(interpolation);
      } catch (error) {
        console.error("[Kano Run] System render failed:", error);
      }
    }

    this.sceneManager?.render?.(interpolation);
  }

  pause() {
    if (!this.isRunning || this.isPaused) return;

    this.isPaused = true;
    this.phase = "paused";

    for (const system of this.systems.values()) {
      system.pause?.();
    }

    this.events.emit("game:paused");
  }

  resume() {
    if (!this.isRunning || !this.isPaused) return;

    this.isPaused = false;
    this.phase = "playing";
    this.previousTime = performance.now();

    for (const system of this.systems.values()) {
      system.resume?.();
    }

    this.events.emit("game:resumed");
  }

  stop() {
    if (this.isRunning) {
      this.isRunning = false;

      if (this.animationFrame !== null) {
        cancelAnimationFrame(this.animationFrame);
        this.animationFrame = null;
      }

      for (const system of this.systems.values()) {
        try {
          system.stop?.();
        } catch (error) {
          console.warn("[Kano Run] System stop failed:", error);
        }
      }

      this.saveManager.save?.();

      this.events?.emit?.("game:stopped");
    }

    clearTimeout(this._slowMoTimer);
    this._slowMoTimer = null;
  }

  resize() {
    if (this.isDestroyed) return;

    this.sceneManager?.resize?.();

    if (typeof window !== "undefined") {
      for (const system of this.systems.values()) {
        system.resize?.(window.innerWidth, window.innerHeight);
      }
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
    this.phase = "intro";
    this.introTime = 0;

    for (const system of this.systems.values()) {
      await system.reset?.();
    }

    await this.state.reset?.();

    return this.start();
  }

  _disposeSystem(system) {
    if (!system) return;

    try {
      if (typeof system.destroy === "function") {
        system.destroy();
      } else if (typeof system.dispose === "function") {
        system.dispose();
      } else if (typeof system.clear === "function") {
        system.clear();
      }
    } catch (error) {
      console.error("[Kano Run] System cleanup failed:", error);
    }
  }

  destroy() {
    if (this.isDestroyed) return;

    this.stop();

    if (typeof window !== "undefined") {
      window.removeEventListener("resize", this.boundResize);
    }

    for (const system of [...this.systems.values()].reverse()) {
      this._disposeSystem(system);
    }

    this.systems.clear();

    try {
      this.input.destroy?.();
    } catch {}

    try {
      this.audio.destroy?.();
    } catch {}

    try {
      this.sceneManager?.destroy?.();
    } catch {}

    try {
      this.saveManager.destroy?.();
    } catch {}

    try {
      this.state.destroy?.();
    } catch {}

    try {
      this.services.destroy?.();
    } catch {}

    try {
      this.events?.safeEmit?.("game:destroyed") ??
        this.events?.emit?.("game:destroyed");
    } catch {}

    try {
      this.events?.destroy?.();
    } catch {}

    this.sceneManager = null;
    this.isInitialized = false;
    this.isDestroyed = true;
  }
}