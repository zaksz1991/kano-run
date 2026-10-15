const TIME_PERIODS = Object.freeze([
  { id: "dawn", start: 5, end: 7 },
  { id: "morning", start: 7, end: 12 },
  { id: "afternoon", start: 12, end: 16 },
  { id: "evening", start: 16, end: 19 },
  { id: "night", start: 19, end: 5 },
]);

const LIGHTING_PRESETS = Object.freeze({
  dawn: {
    sky: "#e6a078",
    horizon: "#f7c59f",
    ambient: 0.55,
    sun: 0.65,
    fog: "#c5a18d",
    streetlights: false,
  },
  morning: {
    sky: "#76b9e8",
    horizon: "#c4e5f7",
    ambient: 0.8,
    sun: 1.1,
    fog: "#b9cbd5",
    streetlights: false,
  },
  afternoon: {
    sky: "#4f9bd5",
    horizon: "#d0e6f1",
    ambient: 0.9,
    sun: 1.25,
    fog: "#b9d0df",
    streetlights: false,
  },
  evening: {
    sky: "#d77956",
    horizon: "#f2b28a",
    ambient: 0.45,
    sun: 0.55,
    fog: "#b88b82",
    streetlights: true,
  },
  night: {
    sky: "#101a32",
    horizon: "#273852",
    ambient: 0.18,
    sun: 0.08,
    fog: "#202c40",
    streetlights: true,
  },
});

export default class DayNightSystem {
  constructor({
    scene = null,
    renderer = null,
    ambientLight = null,
    sunLight = null,
    eventBus = null,
    cycleDuration = 120000,
    initialHour = 8,
    autoCycle = true,
  } = {}) {
    this.scene = scene;
    this.renderer = renderer;
    this.ambientLight = ambientLight;
    this.sunLight = sunLight;
    this.eventBus = eventBus;

    this.cycleDuration = Math.max(60000, cycleDuration);
    this.hour = this.normalizeHour(initialHour);
    this.autoCycle = autoCycle;
    this.elapsed = 0;
    this.period = this.getPeriod(this.hour);
    this.streetlightsEnabled = false;
    this.disposed = false;

    this.applyLighting();
    this.emit("time:initialized", this.getSnapshot());
  }


  initialize(options = {}) {
    if (options && typeof options === "object") {
      if (options.scene) this.scene = options.scene;
      if (options.renderer) this.renderer = options.renderer;
      if (options.eventBus) this.eventBus = options.eventBus;
      if (options.ambientLight) this.ambientLight = options.ambientLight;
      if (options.sunLight) this.sunLight = options.sunLight;
    }

    if (this.scene && (!this.ambientLight || !this.sunLight)) {
      this.scene.traverse((obj) => {
        if (!this.ambientLight && obj.isAmbientLight) {
          this.ambientLight = obj;
        }
        if (!this.sunLight && obj.isDirectionalLight) {
          this.sunLight = obj;
        }
      });
    }

    this.applyLighting();
    return this;
  }

  normalizeHour(hour) {
    return ((Number(hour) % 24) + 24) % 24;
  }

  getPeriod(hour = this.hour) {
    if (hour >= 5 && hour < 7) return "dawn";
    if (hour >= 7 && hour < 12) return "morning";
    if (hour >= 12 && hour < 16) return "afternoon";
    if (hour >= 16 && hour < 19) return "evening";
    return "night";
  }

  update(deltaSeconds) {
    if (this.disposed || !Number.isFinite(deltaSeconds)) {
      return;
    }

    const delta = Math.max(0, Math.min(deltaSeconds, 0.1));

    if (this.autoCycle) {
      this.elapsed += delta * 1000;

      const hoursPerCycle = 24;
      this.hour = this.normalizeHour(
        this.hour +
        (delta * 1000 / this.cycleDuration) * hoursPerCycle
      );
    }

    const nextPeriod = this.getPeriod();

    if (nextPeriod !== this.period) {
      const previous = this.period;
      this.period = nextPeriod;

      const isNight = nextPeriod === "night";
      const isEvening = nextPeriod === "evening";
      this.emit("daynight:changed", {
        isNight: isNight || isEvening,
        phase: nextPeriod,
        period: nextPeriod,
        hour: this.hour,
      });
      this.emit("economy:period", {
        period: nextPeriod,
        hour: this.hour,
        isNight,
        isMorning: nextPeriod === "morning" || nextPeriod === "dawn",
        isAfternoon: nextPeriod === "afternoon",
        isEvening,
        isRush:
          (this.hour >= 7 && this.hour <= 9.5) ||
          (this.hour >= 16.5 && this.hour <= 19),
      });
      this.emit("time:period-changed", {
        previous,
        current: this.period,
        hour: this.hour,
      });
    }

    // Continuous time tick for demand systems
    this.emit("time:tick", {
      hour: this.hour,
      period: this.period,
      isNight: this.period === "night" || this.period === "evening",
    });

    this.applyLighting();
  }

  setTime(hour) {
    if (!Number.isFinite(Number(hour))) {
      return false;
    }

    const previous = this.period;

    this.hour = this.normalizeHour(Number(hour));
    this.period = this.getPeriod();

    this.applyLighting();

    this.emit("daynight:changed", {
      isNight: this.period === "night" || this.period === "evening",
      phase: this.period,
      period: this.period,
      hour: this.hour,
    });
    this.emit("economy:period", {
      period: this.period,
      hour: this.hour,
      isNight: this.period === "night",
      isMorning: this.period === "morning" || this.period === "dawn",
      isAfternoon: this.period === "afternoon",
      isEvening: this.period === "evening",
      isRush:
        (this.hour >= 7 && this.hour <= 9.5) ||
        (this.hour >= 16.5 && this.hour <= 19),
    });
    this.emit("time:changed", {
      hour: this.hour,
      period: this.period,
      previous,
    });

    return true;
  }

  setPeriod(period) {
    const valid = TIME_PERIODS.some((item) => item.id === period);

    if (!valid) {
      return false;
    }

    const hours = {
      dawn: 6,
      morning: 9,
      afternoon: 14,
      evening: 17.5,
      night: 22,
    };

    return this.setTime(hours[period]);
  }

  setAutoCycle(enabled) {
    this.autoCycle = Boolean(enabled);

    this.emit("time:auto-cycle-changed", {
      enabled: this.autoCycle,
    });
  }

  getLightingPreset() {
    const preset = LIGHTING_PRESETS[this.period];

    return {
      ...preset,
      hour: this.hour,
      period: this.period,
    };
  }

  applyLighting() {
    const preset = this.getLightingPreset();

    if (this.scene?.background?.set) {
      this.scene.background.set(preset.sky);
    }

    if (this.scene?.fog) {
      this.scene.fog.color?.set?.(preset.fog);
    }

    if (this.ambientLight) {
      this.ambientLight.intensity = preset.ambient;
    }

    if (this.sunLight) {
      this.sunLight.intensity = preset.sun;
    }

    if (this.renderer?.toneMappingExposure !== undefined) {
      this.renderer.toneMappingExposure =
        this.period === "night" ? 0.8 : 1;
    }

    this.streetlightsEnabled = preset.streetlights;

    this.emit("time:lighting-updated", {
      hour: this.hour,
      period: this.period,
      streetlightsEnabled: this.streetlightsEnabled,
      preset,
    });
  }

  getSnapshot() {
    return {
      hour: Number(this.hour.toFixed(2)),
      period: this.period,
      autoCycle: this.autoCycle,
      cycleDuration: this.cycleDuration,
      streetlightsEnabled: this.streetlightsEnabled,
      lighting: this.getLightingPreset(),
    };
  }

  emit(eventName, payload = {}) {
    this.eventBus?.emit?.(eventName, payload);
  }

  destroy() {
    this.scene = null;
    this.renderer = null;
    this.ambientLight = null;
    this.sunLight = null;
    this.eventBus = null;
    this.disposed = true;
  }
}

export {
  TIME_PERIODS,
  LIGHTING_PRESETS,
};