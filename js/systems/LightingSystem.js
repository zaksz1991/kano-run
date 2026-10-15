import * as THREE from "three";
import { GAME_CONFIG } from "../core/config.js";

const DEFAULTS = {
  sunIntensity: 1.8,
  ambientIntensity: 0.6,
  hemiIntensity: 0.8,
  shadowMapSize: 1024, // 🔥 Mobile optimized: 1024 is sharp enough and saves VRAM
  shadowCameraNear: 0.5,
  shadowCameraFar: 120,
  shadowCameraSize: 50,
  // Kano-specific palette
  daySkyColor: 0x87ceeb,
  dayGroundColor: 0xc2b280,
  sunsetSkyColor: 0xfd5e5e,
  sunsetGroundColor: 0x8b7355,
  nightSkyColor: 0x0a0e27,
  nightGroundColor: 0x1a1f3a,
  harmattanSkyColor: 0xd4c4a8,
  harmattanGroundColor: 0xb8a888,
};

export default class LightingSystem {
  constructor({ scene, camera, renderer, eventBus = null, config = {} } = {}) {
    if (!scene) throw new Error("LightingSystem requires a scene.");
    if (!renderer) throw new Error("LightingSystem requires a renderer.");

    this.scene = scene;
    this.camera = camera;
    this.renderer = renderer;
    this.eventBus = eventBus;
    this.config = { ...DEFAULTS, ...(GAME_CONFIG?.lighting ?? {}), ...config };

    this.sun = null;
    this.ambient = null;
    this.hemi = null;
    this.moon = null;
    this.enabled = false;
    this.timeOfDay = 0.5; // 0 to 1 (0.5 is noon)
    this.currentPhase = "day";
    
    this.targetExposure = 1.2;
    this.currentExposure = 1.2;

    this._disposers = [];
  }

  initialize() {
    this._createLights();
    this._setupRenderer();
    this._bindEvents();
    this.enabled = true;
    this.eventBus?.emit?.("lighting:initialized");
  }

  _setupRenderer() {
    // 🔥 CRITICAL: Proper tone mapping for realistic, bright mobile lighting
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = this.targetExposure;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  }

  _bindEvents() {
    this._subscribe("daynight:timeUpdate", (payload) => {
      this.timeOfDay = payload.dayProgress;
      this._updateLightingForTime();
    });

    this._subscribe("weather:changed", (payload) => {
      this.setWeather(payload.type || "clear");
    });
  }

  _createLights() {
    // 1. Hemisphere Light (Sky/Ground bounce - crucial for outdoor feel)
    this.hemi = new THREE.HemisphereLight(
      this.config.daySkyColor,
      this.config.dayGroundColor,
      this.config.hemiIntensity
    );
    this.scene.add(this.hemi);

    // 2. Directional Light (The Sun)
    this.sun = new THREE.DirectionalLight(0xfff4e6, this.config.sunIntensity);
    this.sun.position.set(50, 100, 30);
    
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.width = this.config.shadowMapSize;
    this.sun.shadow.mapSize.height = this.config.shadowMapSize;
    this.sun.shadow.camera.near = this.config.shadowCameraNear;
    this.sun.shadow.camera.far = this.config.shadowCameraFar;
    this.sun.shadow.camera.left = -this.config.shadowCameraSize;
    this.sun.shadow.camera.right = this.config.shadowCameraSize;
    this.sun.shadow.camera.top = this.config.shadowCameraSize;
    this.sun.shadow.camera.bottom = -this.config.shadowCameraSize;
    
    // Softer, artifact-free shadows
    this.sun.shadow.bias = -0.0005;
    this.sun.shadow.normalBias = 0.02;

    this.scene.add(this.sun);
    this.scene.add(this.sun.target);

    // 3. Ambient Light (fill light for shadows)
    this.ambient = new THREE.AmbientLight(0x404040, this.config.ambientIntensity);
    this.scene.add(this.ambient);

    // 4. Moon (for night)
    this.moon = new THREE.DirectionalLight(0x6688cc, 0.3);
    this.moon.position.set(-50, 80, -30);
    this.moon.castShadow = false;
    this.moon.visible = false;
    this.scene.add(this.moon);

    // 5. Atmospheric Fog
    this.scene.fog = new THREE.FogExp2(this.config.daySkyColor, 0.012);
    this.scene.background = new THREE.Color(this.config.daySkyColor);
  }

  update(deltaTime, playerZ = 0) {
    if (!this.enabled) return;

    // Move sun and shadows to follow the player (keeps shadow resolution high)
    if (this.sun) {
      this.sun.position.x = playerZ + 50;
      this.sun.target.position.set(playerZ, 0, 0);
      this.sun.target.updateMatrixWorld();
    }

    // Smooth exposure transitions
    if (Math.abs(this.currentExposure - this.targetExposure) > 0.001) {
      this.currentExposure += (this.targetExposure - this.currentExposure) * 5 * deltaTime;
      this.renderer.toneMappingExposure = this.currentExposure;
    }
  }

  _updateLightingForTime() {
    const t = this.timeOfDay;
    let skyColor, groundColor, sunIntensity, exposure, phase;

    if (t < 0.2 || t > 0.8) {
      // Night (8 PM - 6 AM)
      skyColor = new THREE.Color(this.config.nightSkyColor);
      groundColor = new THREE.Color(this.config.nightGroundColor);
      sunIntensity = 0;
      exposure = 0.5;
      phase = "night";
      if (this.moon) { this.moon.visible = true; this.moon.intensity = 0.4; }
    } else if (t < 0.3 || t > 0.7) {
      // Sunset/Sunrise
      skyColor = new THREE.Color(this.config.sunsetSkyColor);
      groundColor = new THREE.Color(this.config.sunsetGroundColor);
      sunIntensity = 0.8;
      exposure = 0.9;
      phase = "sunset";
      if (this.moon) this.moon.visible = false;
    } else {
      // Day (8 AM - 6 PM)
      skyColor = new THREE.Color(this.config.daySkyColor);
      groundColor = new THREE.Color(this.config.dayGroundColor);
      sunIntensity = this.config.sunIntensity;
      exposure = 1.2; // 🔥 BRIGHT for daytime
      phase = "day";
      if (this.moon) this.moon.visible = false;
    }

    // Smooth interpolation
    if (this.hemi) {
      this.hemi.color.lerp(skyColor, 0.05);
      this.hemi.groundColor.lerp(groundColor, 0.05);
    }
    if (this.sun) {
      this.sun.intensity = THREE.MathUtils.lerp(this.sun.intensity, sunIntensity, 0.05);
      const angle = (t - 0.5) * Math.PI;
      this.sun.position.y = Math.sin(angle) * 100;
      this.sun.position.z = Math.cos(angle) * 50;
    }
    if (this.ambient) {
      const ambInt = phase === "night" ? 0.2 : this.config.ambientIntensity;
      this.ambient.intensity = THREE.MathUtils.lerp(this.ambient.intensity, ambInt, 0.05);
    }
    if (this.scene.fog) {
      const fogColor = phase === "night" ? this.config.nightSkyColor : phase === "sunset" ? this.config.sunsetSkyColor : this.config.daySkyColor;
      this.scene.fog.color.lerp(new THREE.Color(fogColor), 0.05);
    }
    if (this.scene.background && this.scene.background.isColor) {
      this.scene.background.lerp(skyColor, 0.05);
    }

    this.targetExposure = exposure;

    if (phase !== this.currentPhase) {
      this.currentPhase = phase;
      this.eventBus?.emit?.("lighting:phaseChanged", { phase, timeOfDay: t });
      this.eventBus?.emit?.("daynight:changed", { isNight: phase === "night", phase, timeOfDay: t });
    }
  }

  setWeather(type = "clear") {
    if (type === "harmattan") {
      if (this.scene.fog) { this.scene.fog.density = 0.025; this.scene.fog.color.setHex(this.config.harmattanSkyColor); }
      if (this.scene.background) this.scene.background.setHex(this.config.harmattanSkyColor);
      if (this.sun) this.sun.intensity = 1.2;
      this.targetExposure = 0.9;
    } else if (type === "rain") {
      if (this.scene.fog) { this.scene.fog.density = 0.018; this.scene.fog.color.setHex(0x667788); }
      if (this.scene.background) this.scene.background.setHex(0x667788);
      if (this.sun) this.sun.intensity = 0.6;
      this.targetExposure = 0.6;
    } else {
      if (this.scene.fog) { this.scene.fog.density = 0.012; this.scene.fog.color.setHex(this.config.daySkyColor); }
      if (this.scene.background) this.scene.background.setHex(this.config.daySkyColor);
      if (this.sun) this.sun.intensity = this.config.sunIntensity;
      this.targetExposure = 1.2;
    }
  }

  _subscribe(event, handler) {
    if (!this.eventBus?.on) return;
    const unsub = this.eventBus.on(event, handler);
    if (typeof unsub === "function") this._disposers.push(unsub);
  }

  dispose() {
    this.scene.remove(this.sun);
    this.scene.remove(this.hemi);
    this.scene.remove(this.ambient);
    this.scene.remove(this.moon);
    this.sun?.dispose(); this.hemi?.dispose(); this.ambient?.dispose(); this.moon?.dispose();
    for (const unsub of this._disposers) unsub();
    this._disposers = [];
  }
}