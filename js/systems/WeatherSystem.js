import GAME_CONFIG, {
  WEATHER_TYPES,
  TIME_PERIODS,
} from "../core/config.js";

const WEATHER_PRESETS = {
  clear: {
    label: "Clear",
    visibility: 1,
    roadGrip: 1,
    trafficMultiplier: 1,
    fogDensity: 0,
    rainIntensity: 0,
    windIntensity: 0,
  },
  cloudy: {
    label: "Cloudy",
    visibility: 0.95,
    roadGrip: 0.98,
    trafficMultiplier: 1,
    fogDensity: 0.015,
    rainIntensity: 0,
    windIntensity: 0.1,
  },
  rain: {
    label: "Rain",
    visibility: 0.72,
    roadGrip: 0.68,
    trafficMultiplier: 0.9,
    fogDensity: 0.025,
    rainIntensity: 0.8,
    windIntensity: 0.25,
  },
  storm: {
    label: "Thunderstorm",
    visibility: 0.48,
    roadGrip: 0.48,
    trafficMultiplier: 0.75,
    fogDensity: 0.045,
    rainIntensity: 1,
    windIntensity: 0.8,
  },
  fog: {
    label: "Fog",
    visibility: 0.4,
    roadGrip: 0.95,
    trafficMultiplier: 0.85,
    fogDensity: 0.085,
    rainIntensity: 0,
    windIntensity: 0.05,
  },
};

const TIME_PRESETS = {
  dawn: {
    label: "Dawn",
    ambient: 0.55,
    sunIntensity: 0.6,
    headlightRequired: false,
    skyTint: 0xffbd91,
  },
  morning: {
    label: "Morning",
    ambient: 0.9,
    sunIntensity: 1,
    headlightRequired: false,
    skyTint: 0xc8e4ff,
  },
  afternoon: {
    label: "Afternoon",
    ambient: 1,
    sunIntensity: 1.15,
    headlightRequired: false,
    skyTint: 0x87ceeb,
  },
  evening: {
    label: "Evening",
    ambient: 0.55,
    sunIntensity: 0.45,
    headlightRequired: true,
    skyTint: 0xf29b68,
  },
  night: {
    label: "Night",
    ambient: 0.2,
    sunIntensity: 0.08,
    headlightRequired: true,
    skyTint: 0x101a38,
  },
};

const WEATHER_ALIASES = {
  clear: "clear",
  sunny: "clear",
  cloudy: "cloudy",
  overcast: "cloudy",
  rain: "rain",
  rainy: "rain",
  storm: "storm",
  thunderstorm: "storm",
  fog: "fog",
  foggy: "fog",
};

const TIME_ALIASES = {
  dawn: "dawn",
  morning: "morning",
  afternoon: "afternoon",
  evening: "evening",
  dusk: "evening",
  night: "night",
};

export default class WeatherSystem {
  constructor({
    gameState,
    eventBus,
    initialWeather = "clear",
    initialTime = "morning",
    autoCycle = true,
    cycleDuration = 180,
    weatherChangeInterval = 240,
    seed = Date.now(),
  } = {}) {
    this.gameState = gameState ?? null;
    this.eventBus = eventBus ?? null;

    this.autoCycle = Boolean(autoCycle);
    this.cycleDuration = Math.max(30, Number(cycleDuration) || 180);
    this.weatherChangeInterval = Math.max(
      30,
      Number(weatherChangeInterval) || 240
    );

    this.randomState = Number(seed) >>> 0 || 1;
    this.elapsed = 0;
    this.weatherElapsed = 0;
    this.destroyed = false;
    this.listeners = [];

    this.weather = this.normalizeWeather(initialWeather);
    this.time = this.normalizeTime(initialTime);

    this.transition = null;
    this.lightningTimer = 0;
    this.lightningFlash = 0;

    this.current = this.buildSnapshot();

    this.bindEvents();
  }

  normalizeWeather(value) {
    const key = WEATHER_ALIASES[String(value ?? "").toLowerCase()];
    if (key) return key;

    const configured = Array.isArray(WEATHER_TYPES)
      ? WEATHER_TYPES.map((item) =>
          typeof item === "string" ? item : item?.id
        )
      : [];

    return configured.includes("clear") ? "clear" : Object.keys(WEATHER_PRESETS)[0];
  }

  normalizeTime(value) {
    const key = TIME_ALIASES[String(value ?? "").toLowerCase()];
    if (key) return key;

    const configured = Array.isArray(TIME_PERIODS)
      ? TIME_PERIODS.map((item) =>
          typeof item === "string" ? item : item?.id
        )
      : [];

    return configured.includes("morning")
      ? "morning"
      : Object.keys(TIME_PRESETS)[0];
  }

  bindEvents() {
    this.listen(this.eventBus, "run:started", () => {
      this.emit("weather:changed", this.getSnapshot());
    });

    this.listen(this.eventBus, "weather:set", (payload = {}) => {
      if (payload.weather) this.setWeather(payload.weather);
      if (payload.time) this.setTime(payload.time);
    });
  }

  listen(source, eventName, callback) {
    if (!source || typeof source.on !== "function") return;

    const unsubscribe = source.on(eventName, callback);

    if (typeof unsubscribe === "function") {
      this.listeners.push(unsubscribe);
    } else if (typeof source.off === "function") {
      this.listeners.push(() => source.off(eventName, callback));
    }
  }

  update(deltaTime) {
    if (this.destroyed) return this.getSnapshot();

    const delta = Math.max(0, Math.min(0.25, Number(deltaTime) || 0));

    if (delta === 0) return this.getSnapshot();

    this.elapsed += delta;
    this.weatherElapsed += delta;

    if (this.autoCycle) {
      this.updateTimeCycle(delta);
      this.updateWeatherCycle();
    }

    this.updateTransition(delta);
    this.updateLightning(delta);

    this.current = this.buildSnapshot();

    return this.getSnapshot();
  }

  updateTimeCycle(delta) {
    const progress = (this.elapsed % this.cycleDuration) / this.cycleDuration;
    const periods = ["dawn", "morning", "afternoon", "evening", "night"];
    const index = Math.min(
      periods.length - 1,
      Math.floor(progress * periods.length)
    );

    const nextTime = periods[index];

    if (nextTime !== this.time) {
      this.setTime(nextTime, { silent: false });
    }
  }

  updateWeatherCycle() {
    if (this.weatherElapsed < this.weatherChangeInterval) return;

    this.weatherElapsed = 0;

    const choices = ["clear", "cloudy", "rain", "fog"];
    const roll = this.random();

    let nextWeather = "clear";

    if (roll < 0.42) {
      nextWeather = "clear";
    } else if (roll < 0.66) {
      nextWeather = "cloudy";
    } else if (roll < 0.87) {
      nextWeather = "rain";
    } else {
      nextWeather = "fog";
    }

    if (this.weather === "storm" && roll < 0.6) {
      nextWeather = "rain";
    }

    if (!choices.includes(nextWeather)) {
      nextWeather = "clear";
    }

    if (nextWeather !== this.weather) {
      this.setWeather(nextWeather);
    }
  }

  updateTransition(delta) {
    if (!this.transition) return;

    this.transition.elapsed += delta;

    const progress = Math.min(
      1,
      this.transition.elapsed / this.transition.duration
    );

    this.transition.progress = progress;

    if (progress >= 1) {
      const completed = this.transition;
      this.transition = null;

      this.emit("weather:transition-complete", {
        weather: this.weather,
        time: this.time,
        previousWeather: completed.previousWeather,
        previousTime: completed.previousTime,
      });
    }
  }

  updateLightning(delta) {
    if (this.weather !== "storm") {
      this.lightningTimer = 0;
      this.lightningFlash = Math.max(0, this.lightningFlash - delta * 4);
      return;
    }

    this.lightningTimer -= delta;

    if (this.lightningTimer <= 0) {
      this.lightningTimer = 3 + this.random() * 7;

      if (this.random() > 0.45) {
        this.lightningFlash = 1;

        this.emit("weather:lightning", {
          intensity: this.lightningFlash,
          duration: 0.15 + this.random() * 0.25,
        });
      }
    }

    this.lightningFlash = Math.max(0, this.lightningFlash - delta * 5);
  }

  setWeather(value, { silent = false, transitionDuration = 2 } = {}) {
    const next = this.normalizeWeather(value);

    if (next === this.weather) return this.getSnapshot();

    const previousWeather = this.weather;
    const previousTime = this.time;

    this.weather = next;
    this.transition = {
      previousWeather,
      previousTime,
      elapsed: 0,
      duration: Math.max(0.1, Number(transitionDuration) || 2),
      progress: 0,
    };

    this.current = this.buildSnapshot();

    if (!silent) {
      this.emit("weather:changed", {
        ...this.getSnapshot(),
        previousWeather,
      });
    }

    return this.getSnapshot();
  }

  setTime(value, { silent = false, transitionDuration = 2 } = {}) {
    const next = this.normalizeTime(value);

    if (next === this.time) return this.getSnapshot();

    const previousWeather = this.weather;
    const previousTime = this.time;

    this.time = next;
    this.transition = {
      previousWeather,
      previousTime,
      elapsed: 0,
      duration: Math.max(0.1, Number(transitionDuration) || 2),
      progress: 0,
    };

    this.current = this.buildSnapshot();

    if (!silent) {
      this.emit("time:changed", {
        ...this.getSnapshot(),
        previousTime,
      });
    }

    return this.getSnapshot();
  }

  setConditions({ weather, time } = {}) {
    if (weather) this.setWeather(weather);
    if (time) this.setTime(time);

    return this.getSnapshot();
  }

  buildSnapshot() {
    const weather = WEATHER_PRESETS[this.weather] ?? WEATHER_PRESETS.clear;
    const time = TIME_PRESETS[this.time] ?? TIME_PRESETS.morning;

    return {
      weather: this.weather,
      weatherLabel: weather.label,
      time: this.time,
      timeLabel: time.label,
      visibility: weather.visibility,
      roadGrip: weather.roadGrip,
      trafficMultiplier: weather.trafficMultiplier,
      fogDensity: weather.fogDensity,
      rainIntensity: weather.rainIntensity,
      windIntensity: weather.windIntensity,
      ambientLight: time.ambient,
      sunIntensity: time.sunIntensity,
      headlightRequired: time.headlightRequired,
      skyTint: time.skyTint,
      lightningFlash: this.lightningFlash,
      transitionProgress: this.transition?.progress ?? 1,
    };
  }

  getSnapshot() {
    return { ...this.current };
  }

  getWeatherPreset(weather = this.weather) {
    const key = this.normalizeWeather(weather);
    return { ...WEATHER_PRESETS[key] };
  }

  getTimePreset(time = this.time) {
    const key = this.normalizeTime(time);
    return { ...TIME_PRESETS[key] };
  }

  getDrivingModifiers() {
    const snapshot = this.getSnapshot();

    return {
      roadGrip: snapshot.roadGrip,
      visibility: snapshot.visibility,
      trafficMultiplier: snapshot.trafficMultiplier,
      steeringMultiplier: snapshot.roadGrip < 0.7 ? 0.85 : 1,
      brakingMultiplier: snapshot.roadGrip < 0.7 ? 1.25 : 1,
      headlightRequired: snapshot.headlightRequired,
    };
  }

  random() {
    this.randomState = (1664525 * this.randomState + 1013904223) >>> 0;
    return this.randomState / 4294967296;
  }

  emit(eventName, payload) {
    if (this.eventBus && typeof this.eventBus.emit === "function") {
      this.eventBus.emit(eventName, payload);
    }

    if (this.gameState && typeof this.gameState.emit === "function") {
      this.gameState.emit(eventName, payload);
    }
  }

  reset({ weather = "clear", time = "morning" } = {}) {
    this.elapsed = 0;
    this.weatherElapsed = 0;
    this.lightningTimer = 0;
    this.lightningFlash = 0;
    this.transition = null;

    this.weather = this.normalizeWeather(weather);
    this.time = this.normalizeTime(time);
    this.current = this.buildSnapshot();

    this.emit("weather:reset", this.getSnapshot());

    return this.getSnapshot();
  }

  destroy() {
    if (this.destroyed) return;

    this.destroyed = true;

    for (const unsubscribe of this.listeners) {
      try {
        unsubscribe();
      } catch {
        // Ignore listeners that were already removed.
      }
    }

    this.listeners.length = 0;
    this.transition = null;
  }
}