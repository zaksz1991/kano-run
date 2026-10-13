const ENVIRONMENT_CONFIG = Object.freeze({
  fog: {
    clear: { near: 90, far: 260, density: 0 },
    cloudy: { near: 70, far: 220, density: 0.002 },
    rain: { near: 35, far: 140, density: 0.008 },
    storm: { near: 20, far: 90, density: 0.015 },
    harmattan: { near: 12, far: 65, density: 0.025 },
  },

  grip: {
    clear: 1,
    cloudy: 0.98,
    rain: 0.78,
    storm: 0.58,
    harmattan: 0.9,
  },

  visibility: {
    clear: 1,
    cloudy: 0.9,
    rain: 0.68,
    storm: 0.45,
    harmattan: 0.4,
  },

  wind: {
    clear: 0.2,
    cloudy: 1.2,
    rain: 2.5,
    storm: 6,
    harmattan: 3.5,
  },

  particleLimits: {
    rain: 900,
    storm: 1500,
    harmattan: 500,
  },
});

const WEATHER_TYPES = Object.freeze([
  "clear",
  "cloudy",
  "rain",
  "storm",
  "harmattan",
]);

export default class EnvironmentSystem {
  constructor({
    scene = null,
    eventBus = null,
    weatherSystem = null,
    dayNightSystem = null,
    random = Math.random,
  } = {}) {
    this.scene = scene;
    this.eventBus = eventBus;
    this.weatherSystem = weatherSystem;
    this.dayNightSystem = dayNightSystem;
    this.random = random;

    this.weather = "clear";
    this.windSpeed = ENVIRONMENT_CONFIG.wind.clear;
    this.visibility = 1;
    this.roadGrip = 1;
    this.particleIntensity = 0;
    this.lightningTimer = 0;
    this.lightningFlash = 0;
    this.disposed = false;

    this.unsubscribeWeather = null;

    if (this.eventBus?.on) {
      this.unsubscribeWeather = this.eventBus.on(
        "weather:changed",
        (payload) => {
          const nextWeather =
            typeof payload === "string"
              ? payload
              : payload?.weather ?? payload?.type;

          if (nextWeather) {
            this.setWeather(nextWeather);
          }
        }
      );
    }

    this.setWeather("clear");
    this.emit("environment:ready", this.getSnapshot());
  }

  setWeather(weather) {
    if (!WEATHER_TYPES.includes(weather)) {
      return {
        ok: false,
        error: `Unsupported weather: ${weather}`,
      };
    }

    const previous = this.weather;

    this.weather = weather;
    this.windSpeed = ENVIRONMENT_CONFIG.wind[weather];
    this.visibility = ENVIRONMENT_CONFIG.visibility[weather];
    this.roadGrip = ENVIRONMENT_CONFIG.grip[weather];

    this.particleIntensity = {
      clear: 0,
      cloudy: 0,
      rain: 0.55,
      storm: 1,
      harmattan: 0.35,
    }[weather];

    this.applyFog();

    if (previous !== weather) {
      this.emit("environment:weather-changed", {
        previous,
        current: weather,
        visibility: this.visibility,
        roadGrip: this.roadGrip,
        windSpeed: this.windSpeed,
      });
    }

    return {
      ok: true,
      snapshot: this.getSnapshot(),
    };
  }

  applyFog() {
    if (!this.scene?.fog) {
      return;
    }

    const fog = ENVIRONMENT_CONFIG.fog[this.weather];

    if (fog) {
      if ("near" in this.scene.fog) {
        this.scene.fog.near = fog.near;
      }

      if ("far" in this.scene.fog) {
        this.scene.fog.far = fog.far;
      }

      this.scene.fog.density = fog.density;
    }
  }

  update(deltaSeconds) {
    if (this.disposed || !Number.isFinite(deltaSeconds)) {
      return;
    }

    const delta = Math.max(0, Math.min(deltaSeconds, 0.1));

    if (this.weather === "storm") {
      this.updateLightning(delta);
    } else {
      this.lightningFlash = Math.max(
        0,
        this.lightningFlash - delta * 5
      );
    }

    this.updateWind(delta);
  }

  updateLightning(delta) {
    this.lightningTimer -= delta;

    this.lightningFlash = Math.max(
      0,
      this.lightningFlash - delta * 8
    );

    if (this.lightningTimer <= 0) {
      this.lightningTimer = 4 + this.random() * 12;

      if (this.random() < 0.65) {
        this.lightningFlash = 1;

        this.emit("environment:lightning", {
          intensity: this.lightningFlash,
          duration: 0.12,
        });
      }
    }
  }

  updateWind(delta) {
    if (this.weather !== "storm" && this.weather !== "harmattan") {
      return;
    }

    if (this.random() < delta * 0.15) {
      this.emit("environment:wind-gust", {
        strength: this.windSpeed * (1 + this.random()),
        weather: this.weather,
      });
    }
  }

  getDrivingModifiers() {
    const hour = this.dayNightSystem?.hour ?? 12;
    const isNight = hour >= 19 || hour < 5;

    let visibility = this.visibility;

    if (isNight) {
      visibility *= 0.75;
    }

    if (this.weather === "storm") {
      visibility *= 0.8;
    }

    return {
      roadGrip: this.roadGrip,
      visibility: Math.max(0.2, Math.min(1, visibility)),
      windSpeed: this.windSpeed,
      brakingMultiplier: 1 + (1 - this.roadGrip) * 0.8,
      steeringMultiplier: this.roadGrip,
      isNight,
      weather: this.weather,
    };
  }

  getSnapshot() {
    return {
      weather: this.weather,
      windSpeed: this.windSpeed,
      visibility: this.visibility,
      roadGrip: this.roadGrip,
      particleIntensity: this.particleIntensity,
      lightningFlash: this.lightningFlash,
      fog: {
        ...ENVIRONMENT_CONFIG.fog[this.weather],
      },
      driving: this.getDrivingModifiers(),
    };
  }

  emit(eventName, payload = {}) {
    this.eventBus?.emit?.(eventName, payload);
  }

  destroy() {
    if (typeof this.unsubscribeWeather === "function") {
      this.unsubscribeWeather();
    }

    this.scene = null;
    this.eventBus = null;
    this.weatherSystem = null;
    this.dayNightSystem = null;
    this.disposed = true;
  }
}

export {
  ENVIRONMENT_CONFIG,
  WEATHER_TYPES,
};