import * as THREE from "three";
import { GAME_CONFIG } from "../core/config.js";

const WEATHER_TYPES = {
  CLEAR: "clear",
  SUNNY: "sunny",
  CLOUDY: "cloudy",
  HARMATTAN: "harmattan",
  RAIN: "rain",
  STORM: "storm"
};

// Kano-specific weather presets
const WEATHER_PRESETS = {
  [WEATHER_TYPES.CLEAR]: {
    fogColor: 0xc5d4c8, fogDensity: 0.015, sunIntensity: 2.2, sunColor: 0xfff4e6,
    ambientIntensity: 0.6, gripMultiplier: 1.0, skyColor: 0x87ceeb,
    rainIntensity: 0, dustIntensity: 0,
  },
  [WEATHER_TYPES.SUNNY]: {
    fogColor: 0xdce9f2, fogDensity: 0.01, sunIntensity: 2.5, sunColor: 0xfff8e7,
    ambientIntensity: 0.7, gripMultiplier: 1.0, skyColor: 0x5dade2,
    rainIntensity: 0, dustIntensity: 0,
  },
  [WEATHER_TYPES.CLOUDY]: {
    fogColor: 0xa8b4bc, fogDensity: 0.02, sunIntensity: 1.2, sunColor: 0xd0d8e0,
    ambientIntensity: 0.5, gripMultiplier: 0.98, skyColor: 0x8a9aaa,
    rainIntensity: 0, dustIntensity: 0,
  },
  [WEATHER_TYPES.HARMATTAN]: {
    fogColor: 0xd4c4a8, fogDensity: 0.035, sunIntensity: 1.5, sunColor: 0xffe0b2,
    ambientIntensity: 0.5, gripMultiplier: 0.95, skyColor: 0xe6d5b8,
    rainIntensity: 0, dustIntensity: 0.6,
  },
  [WEATHER_TYPES.RAIN]: {
    fogColor: 0x8899a6, fogDensity: 0.025, sunIntensity: 1.0, sunColor: 0xccddee,
    ambientIntensity: 0.4, gripMultiplier: 0.75, skyColor: 0x778899,
    rainIntensity: 0.8, dustIntensity: 0,
  },
  [WEATHER_TYPES.STORM]: {
    fogColor: 0x445566, fogDensity: 0.040, sunIntensity: 0.5, sunColor: 0x8899aa,
    ambientIntensity: 0.3, gripMultiplier: 0.60, skyColor: 0x334455,
    rainIntensity: 1.0, dustIntensity: 0,
  }
};

export default class WeatherSystem {
  constructor({ scene, eventBus = null, lightingSystem = null, config = {} } = {}) {
    if (!scene) throw new Error("WeatherSystem requires a scene.");
    
    this.scene = scene;
    this.eventBus = eventBus;
    this.lightingSystem = lightingSystem;
    this.config = { ...GAME_CONFIG?.weather ?? {}, ...config };
    
    this.currentWeather = WEATHER_TYPES.CLEAR;
    this.targetWeather = WEATHER_TYPES.CLEAR;
    this.transitionProgress = 1.0;
    this.transitionDuration = 5.0;
    this.transitionTimer = 0.0;
    
    this.gripMultiplier = 1.0;
    this.enabled = false;
    this._disposers = [];
    
    this._dust = null;
    this._dustGeo = null;
    this._rain = null;
    this._rainGeo = null;
    this._clock = 0;
    this._lightningTimer = 0;
    this._isLightning = false;
    
    this._bindEvents();
    this._createParticles();
  }

  _createParticles() {
    // 1. Harmattan Dust (Slow, drifting, beige)
    const dustCount = 1500;
    const dustPos = new Float32Array(dustCount * 3);
    for (let i = 0; i < dustCount; i++) {
      dustPos[i * 3] = (Math.random() - 0.5) * 120;
      dustPos[i * 3 + 1] = Math.random() * 20;
      dustPos[i * 3 + 2] = (Math.random() - 0.5) * 120;
    }
    const dustGeo = new THREE.BufferGeometry();
    dustGeo.setAttribute("position", new THREE.BufferAttribute(dustPos, 3));
    const dustMat = new THREE.PointsMaterial({
      color: 0xd4c4a8, size: 0.35, transparent: true, opacity: 0,
      depthWrite: false, blending: THREE.AdditiveBlending,
    });
    this._dust = new THREE.Points(dustGeo, dustMat);
    this._dust.name = "harmattan-dust";
    this._dust.frustumCulled = false; // Prevent popping
    this._dustGeo = dustGeo;
    this.scene.add(this._dust);

    // 2. Rain (Fast, vertical streaks, grey)
    const rainCount = 4000;
    const rainPos = new Float32Array(rainCount * 3);
    for (let i = 0; i < rainCount; i++) {
      rainPos[i * 3] = (Math.random() - 0.5) * 100;
      rainPos[i * 3 + 1] = Math.random() * 40;
      rainPos[i * 3 + 2] = (Math.random() - 0.5) * 100;
    }
    const rainGeo = new THREE.BufferGeometry();
    rainGeo.setAttribute("position", new THREE.BufferAttribute(rainPos, 3));
    const rainMat = new THREE.PointsMaterial({
      color: 0xaaaaaa, size: 0.15, transparent: true, opacity: 0,
      depthWrite: false, blending: THREE.AdditiveBlending,
    });
    this._rain = new THREE.Points(rainGeo, rainMat);
    this._rain.name = "rain";
    this._rain.frustumCulled = false;
    this._rainGeo = rainGeo;
    this.scene.add(this._rain);
  }

  _bindEvents() {
    this._subscribe("game:started", () => {
      this.enabled = true;
      this.setWeather(this.config.initialWeather || WEATHER_TYPES.CLEAR, true);
      this._harmattanTimer = 60 + Math.random() * 60; // Random time until first harmattan
    });
    
    this._subscribe("game:stopped", () => {
      this.enabled = false;
    });

    this._subscribe("weather:set", (payload) => {
      if (payload && payload.type) this.setWeather(payload.type);
    });
  }

  initialize() {
    this.enabled = true;
  }

  setWeather(type, instant = false) {
    if (!WEATHER_PRESETS[type]) {
      console.warn(`WeatherSystem: Unknown weather type "${type}".`);
      return;
    }

    if (this.currentWeather === type && this.transitionProgress >= 1.0) return;

    this.targetWeather = type;
    this.transitionProgress = instant ? 1.0 : 0.0;
    this.transitionTimer = 0.0;
    
    if (instant) {
      this._applyPreset(WEATHER_PRESETS[type]);
      this.currentWeather = type;
    }

    this.eventBus?.emit?.("weather:changed", { type, instant });
  }

  update(deltaTime, playerZ = 0) {
    if (!this.enabled) return;

    const dt = Math.min(Number(deltaTime) || 0, 0.1);
    this._clock += dt;

    // Dynamic weather shifts (Kano dry season bias)
    if (typeof this._harmattanTimer === "number") {
      this._harmattanTimer -= dt;
      if (this._harmattanTimer <= 0) {
        if (this.currentWeather === WEATHER_TYPES.CLEAR || this.currentWeather === WEATHER_TYPES.SUNNY) {
          this.setWeather(WEATHER_TYPES.HARMATTAN, false);
          this._harmattanTimer = 90 + Math.random() * 60;
        } else if (this.currentWeather === WEATHER_TYPES.HARMATTAN) {
          this.setWeather(WEATHER_TYPES.CLEAR, false);
          this._harmattanTimer = 60 + Math.random() * 40;
        }
      }
    }

    // Handle smooth transitions
    if (this.transitionProgress < 1.0) {
      this.transitionTimer += dt;
      this.transitionProgress = Math.min(1.0, this.transitionTimer / this.transitionDuration);
      const t = this.transitionProgress < 0.5 
        ? 2 * this.transitionProgress * this.transitionProgress 
        : 1 - Math.pow(-2 * this.transitionProgress + 2, 2) / 2;
      this._interpolateWeather(t);

      if (this.transitionProgress >= 1.0) {
        this.currentWeather = this.targetWeather;
        this._applyPreset(WEATHER_PRESETS[this.currentWeather]);
      }
    }

    // Animate Particles
    this._updateParticles(dt, playerZ);

    // Storm Lightning Effect
    if (this.currentWeather === WEATHER_TYPES.STORM || this.targetWeather === WEATHER_TYPES.STORM) {
      this._lightningTimer -= dt;
      if (this._lightningTimer <= 0) {
        this._isLightning = true;
        this._lightningTimer = 0.15; // Flash duration
        setTimeout(() => { this._isLightning = false; }, 150);
        this._lightningTimer = 3 + Math.random() * 8; // Next flash in 3-11s
      }
    }
  }

  _updateParticles(dt, playerZ) {
    const currentPreset = WEATHER_PRESETS[this.currentWeather];
    const targetPreset = WEATHER_PRESETS[this.targetWeather];
    const t = this.transitionProgress;

    // 1. Dust Animation
    const targetDustOpacity = THREE.MathUtils.lerp(currentPreset.dustIntensity, targetPreset.dustIntensity, t) * 0.6;
    if (this._dust) {
      this._dust.material.opacity = THREE.MathUtils.lerp(this._dust.material.opacity, targetDustOpacity, dt * 2);
      if (this._dust.material.opacity > 0.01) {
        this._dust.position.z = playerZ; // Follow player
        const pos = this._dustGeo.attributes.position.array;
        for (let i = 0; i < pos.length; i += 3) {
          pos[i] += (Math.random() - 0.5) * 0.15; // Drift X
          pos[i + 2] -= 3 * dt; // Move forward relative to camera
          if (pos[i + 2] < -60) pos[i + 2] = 60; // Wrap around
        }
        this._dustGeo.attributes.position.needsUpdate = true;
      }
    }

    // 2. Rain Animation
    const targetRainOpacity = THREE.MathUtils.lerp(currentPreset.rainIntensity, targetPreset.rainIntensity, t) * 0.8;
    if (this._rain) {
      this._rain.material.opacity = THREE.MathUtils.lerp(this._rain.material.opacity, targetRainOpacity, dt * 2);
      if (this._rain.material.opacity > 0.01) {
        this._rain.position.z = playerZ; // Follow player
        const pos = this._rainGeo.attributes.position.array;
        const speed = this.currentWeather === WEATHER_TYPES.STORM ? 25.0 : 18.0;
        for (let i = 0; i < pos.length; i += 3) {
          pos[i + 1] -= speed * dt; // Fall down
          if (pos[i + 1] < 0) {
            pos[i + 1] = 40; // Reset to top
            pos[i] = (Math.random() - 0.5) * 100;
            pos[i + 2] = (Math.random() - 0.5) * 100;
          }
        }
        this._rainGeo.attributes.position.needsUpdate = true;
      }
    }
  }

  _interpolateWeather(t) {
    const currentPreset = WEATHER_PRESETS[this.currentWeather];
    const targetPreset = WEATHER_PRESETS[this.targetWeather];

    if (this.scene.fog) {
      this.scene.fog.color.lerpColors(
        new THREE.Color(currentPreset.fogColor),
        new THREE.Color(targetPreset.fogColor),
        t
      );
      this.scene.fog.density = currentPreset.fogDensity + (targetPreset.fogDensity - currentPreset.fogDensity) * t;
    }
    
    if (this.scene.background && this.scene.background.isColor) {
      const currentSky = new THREE.Color(currentPreset.skyColor);
      const targetSky = new THREE.Color(targetPreset.skyColor);
      
      // Apply lightning flash brightness
      const flashMultiplier = this._isLightning ? 2.5 : 1.0;
      
      this.scene.background.lerpColors(
        currentSky.multiplyScalar(flashMultiplier),
        targetSky.multiplyScalar(flashMultiplier),
        t
      );
    }

    this.gripMultiplier = currentPreset.gripMultiplier + (targetPreset.gripMultiplier - currentPreset.gripMultiplier) * t;
    this._emitGrip();

    if (this.lightingSystem) {
      const sunIntensity = (currentPreset.sunIntensity + (targetPreset.sunIntensity - currentPreset.sunIntensity) * t) * (this._isLightning ? 3.0 : 1.0);
      const ambientIntensity = (currentPreset.ambientIntensity + (targetPreset.ambientIntensity - currentPreset.ambientIntensity) * t) * (this._isLightning ? 2.0 : 1.0);
      
      this.lightingSystem.setLighting?.({ sunIntensity, ambientIntensity });
    }
  }

  _applyPreset(preset) {
    if (this.scene.fog) {
      this.scene.fog.color.setHex(preset.fogColor);
      this.scene.fog.density = preset.fogDensity;
    }
    if (this.scene.background && this.scene.background.isColor) {
      this.scene.background.setHex(preset.skyColor);
    }
    this.gripMultiplier = preset.gripMultiplier;
    this._emitGrip();

    if (this.lightingSystem) {
      this.lightingSystem.setLighting?.({
        sunIntensity: preset.sunIntensity,
        ambientIntensity: preset.ambientIntensity
      });
    }
  }

  getGripMultiplier() {
    return this.gripMultiplier;
  }

  getCurrentWeather() {
    return this.currentWeather;
  }

  _subscribe(event, handler) {
    if (!this.eventBus?.on) return;
    const unsub = this.eventBus.on(event, handler);
    if (typeof unsub === "function") this._disposers.push(unsub);
  }

  _emitGrip() {
    this.eventBus?.emit?.("weather:changed", {
      type: this.currentWeather,
      weather: this.currentWeather,
      gripMultiplier: this.gripMultiplier ?? 1,
    });
    this.eventBus?.emit?.("driving:grip", {
      multiplier: this.gripMultiplier ?? 1,
    });
  }

  dispose() {
    if (this._dust) {
      this.scene.remove(this._dust);
      this._dust.geometry.dispose();
      this._dust.material.dispose();
    }
    if (this._rain) {
      this.scene.remove(this._rain);
      this._rain.geometry.dispose();
      this._rain.material.dispose();
    }
    for (const unsub of this._disposers) {
      try { unsub(); } catch {}
    }
    this._disposers = [];
  }
}