import * as THREE from "three";
import { GAME_CONFIG } from "../core/config.js";

const WEATHER_TYPES = {
  CLEAR: "clear",
  HARMATTAN: "harmattan",
  RAIN: "rain",
  STORM: "storm"
};

// Kano-specific weather presets
const WEATHER_PRESETS = {
  [WEATHER_TYPES.CLEAR]: {
    fogColor: 0xc5d4c8, // Light blue/grey
    fogDensity: 0.015,
    sunIntensity: 2.2,
    sunColor: 0xfff4e6,
    ambientIntensity: 0.6,
    gripMultiplier: 1.0,
    skyColor: 0x87ceeb
  },
  [WEATHER_TYPES.HARMATTAN]: {
    fogColor: 0xd4c4a8, // Dusty beige/orange
    fogDensity: 0.035, // Thick dust
    sunIntensity: 1.5, // Dimmed sun
    sunColor: 0xffe0b2, // Warm orange sun
    ambientIntensity: 0.5,
    gripMultiplier: 0.95, // Slightly slippery dust
    skyColor: 0xe6d5b8
  },
  [WEATHER_TYPES.RAIN]: {
    fogColor: 0x8899a6, // Grey
    fogDensity: 0.025,
    sunIntensity: 1.0, // Overcast
    sunColor: 0xccddee, // Cool blue/grey
    ambientIntensity: 0.4,
    gripMultiplier: 0.75, // Wet road
    skyColor: 0x778899
  },
  [WEATHER_TYPES.STORM]: {
    fogColor: 0x445566, // Dark grey
    fogDensity: 0.040,
    sunIntensity: 0.5, // Very dark
    sunColor: 0x8899aa,
    ambientIntensity: 0.3,
    gripMultiplier: 0.60, // Very slippery
    skyColor: 0x334455
  }
};

export default class WeatherSystem {
  constructor({ scene, eventBus = null, lightingSystem = null, config = {} } = {}) {
    if (!scene) throw new Error("WeatherSystem requires a scene.");
    
    this.scene = scene;
    this.eventBus = eventBus;
    this.lightingSystem = lightingSystem; // Optional reference to update lights directly
    this.config = { ...GAME_CONFIG?.weather ?? {}, ...config };
    
    this.currentWeather = WEATHER_TYPES.CLEAR;
    this.targetWeather = WEATHER_TYPES.CLEAR;
    this.transitionProgress = 1.0; // 1.0 means fully transitioned
    this.transitionDuration = 5.0; // Seconds to transition
    this.transitionTimer = 0.0;
    
    this.gripMultiplier = 1.0;
    this.enabled = false;
    this._disposers = [];
    this._dust = null;
    this._dustGeo = null;
    this._clock = 0;
    
    this._bindEvents();
  }

  _ensureDust() {
    if (this._dust || !this.scene) return;
    const count = 400;
    const positions = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      positions[i * 3] = (Math.random() - 0.5) * 60;
      positions[i * 3 + 1] = Math.random() * 12 + 0.5;
      positions[i * 3 + 2] = (Math.random() - 0.5) * 80;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    const mat = new THREE.PointsMaterial({
      color: 0xd4c4a8,
      size: 0.35,
      transparent: true,
      opacity: 0.35,
      depthWrite: false,
    });
    this._dust = new THREE.Points(geo, mat);
    this._dust.name = "harmattan-dust";
    this._dust.visible = false;
    this._dustGeo = geo;
    this.scene.add(this._dust);
  }

  _updateDust(dt, playerZ = 0) {
    if (!this._dust) return;
    const harmattan = this.targetWeather === "harmattan" || this.currentWeather === "harmattan";
    this._dust.visible = harmattan;
    if (!harmattan) return;
    this._dust.position.z = playerZ;
    const pos = this._dustGeo.attributes.position.array;
    for (let i = 0; i < pos.length; i += 3) {
      pos[i] += (Math.random() - 0.5) * 0.15;
      pos[i + 2] -= 4 * dt;
      if (pos[i + 2] < -40) pos[i + 2] = 40;
    }
    this._dustGeo.attributes.position.needsUpdate = true;
  }

  _bindEvents() {
    this._subscribe("game:started", () => {
      this.enabled = true;
      // Optional: Start with a random weather or specific route weather
      // this.setWeather(this.config.initialWeather || WEATHER_TYPES.CLEAR);
    });
    
    this._subscribe("game:stopped", () => {
      this.enabled = false;
    });

    // Allow external systems (like RouteSystem) to trigger weather
    this._subscribe("weather:set", (payload) => {
      if (payload && payload.type) this.setWeather(payload.type);
    });
  }

  initialize() {
    this.enabled = true;
    this._ensureDust();
    // Kano dry season bias: start clear, chance of harmattan later
    this.setWeather(this.config.initialWeather || WEATHER_TYPES.CLEAR, true);
    // Schedule mild harmattan during long runs
    this._harmattanTimer = 45 + Math.random() * 40;
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
    this._clock = (this._clock || 0) + dt;
    this._updateDust(dt, Number(playerZ) || 0);

    if (typeof this._harmattanTimer === "number") {
      this._harmattanTimer -= dt;
      if (this._harmattanTimer <= 0 && this.currentWeather === WEATHER_TYPES.CLEAR) {
        this.setWeather(WEATHER_TYPES.HARMATTAN, false);
        this._harmattanTimer = 90 + Math.random() * 60;
      } else if (this._harmattanTimer <= 0 && this.currentWeather === WEATHER_TYPES.HARMATTAN) {
        this.setWeather(WEATHER_TYPES.CLEAR, false);
        this._harmattanTimer = 50 + Math.random() * 40;
      }
    }

    if (this.transitionProgress < 1.0) {
      this.transitionTimer += deltaTime;
      this.transitionProgress = Math.min(1.0, this.transitionTimer / this.transitionDuration);
      
      // Smooth interpolation (ease-in-out)
      const t = this.transitionProgress < 0.5 
        ? 2 * this.transitionProgress * this.transitionProgress 
        : 1 - Math.pow(-2 * this.transitionProgress + 2, 2) / 2;

      this._interpolateWeather(t);

      if (this.transitionProgress >= 1.0) {
        this.currentWeather = this.targetWeather;
        this._applyPreset(WEATHER_PRESETS[this.currentWeather]);
      }
    }
  }

  _interpolateWeather(t) {
    const currentPreset = WEATHER_PRESETS[this.currentWeather];
    const targetPreset = WEATHER_PRESETS[this.targetWeather];

    // Interpolate fog
    if (this.scene.fog) {
      this.scene.fog.color.lerpColors(
        new THREE.Color(currentPreset.fogColor),
        new THREE.Color(targetPreset.fogColor),
        t
      );
      this.scene.fog.density = currentPreset.fogDensity + (targetPreset.fogDensity - currentPreset.fogDensity) * t;
    }
    if (this.scene.background && this.scene.background.isColor) {
      this.scene.background.lerpColors(
        new THREE.Color(currentPreset.skyColor),
        new THREE.Color(targetPreset.skyColor),
        t
      );
    }

    // Interpolate grip
    this.gripMultiplier = currentPreset.gripMultiplier + (targetPreset.gripMultiplier - currentPreset.gripMultiplier) * t;

    // Update lighting system if available
    if (this.lightingSystem) {
      const sunIntensity = currentPreset.sunIntensity + (targetPreset.sunIntensity - currentPreset.sunIntensity) * t;
      const ambientIntensity = currentPreset.ambientIntensity + (targetPreset.ambientIntensity - currentPreset.ambientIntensity) * t;
      
      this.lightingSystem.setLighting?.({
        sunIntensity,
        ambientIntensity
      });
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

  dispose() {
    for (const unsub of this._disposers) unsub();
    this._disposers = [];
  }
}