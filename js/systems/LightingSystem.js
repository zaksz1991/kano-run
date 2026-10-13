import * as THREE from "three";

export default class LightingSystem {
  constructor(sceneOrContext = {}, options = {}) {
    // Game passes a system context object: { scene, camera, THREE, ... }
    const ctx = sceneOrContext && sceneOrContext.scene
      ? sceneOrContext
      : { scene: sceneOrContext };
    const scene = ctx.scene;
    if (!scene || typeof scene.add !== "function") {
      throw new Error("LightingSystem requires a THREE.Scene instance.");
    }

    this.scene = scene;
    this.context = ctx;

    this.options = {
      ambientIntensity: 1.1,
      sunIntensity: 2.2,
      hemisphereIntensity: 1.2,
      enableShadows: true,
      shadowMapSize: 2048,
      ...(ctx.config?.lighting || {}),
      ...options,
    };

    this.lights = {};
    this.currentPeriod = "day";
    this.currentWeather = "clear";
    this.elapsedTime = 0;
    this.enabled = true;

    this.presets = {
      dawn: {
        background: 0xb8a7a0,
        fog: 0xb8a7a0,
        ambient: 0.65,
        hemisphere: 0.8,
        sun: 1.1,
        sunColor: 0xffc49b,
        groundColor: 0x7d7568,
        fogDensity: 0.009,
      },
      day: {
        background: 0x7eb6d9,
        fog: 0xc8d5c0,
        ambient: 0.95,
        hemisphere: 1.05,
        sun: 1.85,
        sunColor: 0xffe4b5,
        groundColor: 0x9a8560,
        fogDensity: 0.0045,
      },
      dusk: {
        background: 0xd4895c,
        fog: 0xc9a07a,
        ambient: 0.5,
        hemisphere: 0.65,
        sun: 0.85,
        sunColor: 0xff9a5a,
        groundColor: 0x6b5344,
        fogDensity: 0.007,
      },
      night: {
        background: 0x071426,
        fog: 0x101e31,
        ambient: 0.22,
        hemisphere: 0.35,
        sun: 0.08,
        sunColor: 0x829ac4,
        groundColor: 0x252a31,
        fogDensity: 0.004,
      },
    };

    this.weatherModifiers = {
      clear: {
        ambient: 1,
        sun: 1,
        fogDensity: 1,
        backgroundTint: 0xffffff,
      },
      cloudy: {
        ambient: 0.85,
        sun: 0.55,
        fogDensity: 1.5,
        backgroundTint: 0xc1c8d0,
      },
      rain: {
        ambient: 0.68,
        sun: 0.35,
        fogDensity: 2,
        backgroundTint: 0x9caab7,
      },
      storm: {
        ambient: 0.42,
        sun: 0.15,
        fogDensity: 3,
        backgroundTint: 0x657080,
      },
      harmattan: {
        ambient: 0.9,
        sun: 0.65,
        fogDensity: 4,
        backgroundTint: 0xd5bd91,
      },
    };

    this.createLights();
    this.applyPreset("day");
  }

  createLights() {
    const hemisphere = new THREE.HemisphereLight(
      0xb9d9ff,
      0x655544,
      this.options.hemisphereIntensity
    );

    this.scene.add(hemisphere);
    this.lights.hemisphere = hemisphere;

    const ambient = new THREE.AmbientLight(
      0xffffff,
      this.options.ambientIntensity
    );

    this.scene.add(ambient);
    this.lights.ambient = ambient;

    const sun = new THREE.DirectionalLight(
      0xfff1d0,
      this.options.sunIntensity
    );

    sun.position.set(-30, 48, -20);
    sun.target.position.set(0, 0, 15);

    sun.castShadow = this.options.enableShadows;

    if (sun.castShadow) {
      sun.shadow.mapSize.width = this.options.shadowMapSize;
      sun.shadow.mapSize.height = this.options.shadowMapSize;

      sun.shadow.camera.left = -40;
      sun.shadow.camera.right = 40;
      sun.shadow.camera.top = 50;
      sun.shadow.camera.bottom = -50;

      sun.shadow.camera.near = 1;
      sun.shadow.camera.far = 140;

      sun.shadow.bias = -0.00015;
      sun.shadow.normalBias = 0.04;
      sun.shadow.radius = 2;
    }

    this.scene.add(sun);
    this.scene.add(sun.target);

    this.lights.sun = sun;

    const fill = new THREE.DirectionalLight(0x91b9ff, 0.25);
    fill.position.set(25, 15, 30);

    this.scene.add(fill);
    this.lights.fill = fill;
  }

  applyPreset(period = "day") {
    const preset = this.presets[period] || this.presets.day;
    const weather =
      this.weatherModifiers[this.currentWeather] ||
      this.weatherModifiers.clear;

    this.currentPeriod = this.presets[period] ? period : "day";

    this.scene.background = new THREE.Color(preset.background);
    this.scene.fog = new THREE.FogExp2(
      preset.fog,
      preset.fogDensity * weather.fogDensity
    );

    this.lights.ambient.color.setHex(0xffffff);
    this.lights.ambient.intensity =
      preset.ambient * this.options.ambientIntensity * weather.ambient;

    this.lights.hemisphere.color.setHex(
      this.currentPeriod === "night" ? 0x243858 : 0xb9d9ff
    );

    this.lights.hemisphere.groundColor.setHex(preset.groundColor);
    this.lights.hemisphere.intensity =
      preset.hemisphere * this.options.hemisphereIntensity;

    this.lights.sun.color.setHex(preset.sunColor);
    this.lights.sun.intensity =
      preset.sun * this.options.sunIntensity * weather.sun;

    this.lights.fill.intensity =
      this.currentPeriod === "night" ? 0.12 : 0.25;

    this.lights.fill.color.setHex(
      this.currentPeriod === "night" ? 0x526da8 : 0x91b9ff
    );

    return this.getSnapshot();
  }

  setPeriod(period) {
    if (!this.presets[period]) {
      return false;
    }

    this.applyPreset(period);
    return true;
  }

  setWeather(weather) {
    if (!this.weatherModifiers[weather]) {
      return false;
    }

    this.currentWeather = weather;
    this.applyPreset(this.currentPeriod);

    return true;
  }

  update(deltaTime, state = {}) {
    if (!this.enabled) {
      return;
    }

    const dt = THREE.MathUtils.clamp(deltaTime || 0, 0, 0.1);
    this.elapsedTime += dt;

    if (state.period && state.period !== this.currentPeriod) {
      this.setPeriod(state.period);
    }

    if (state.weather && state.weather !== this.currentWeather) {
      this.setWeather(state.weather);
    }

    if (state.playerPosition && this.lights.sun) {
      const position = state.playerPosition;

      this.lights.sun.target.position.set(
        position.x,
        0,
        position.z + 20
      );

      this.lights.sun.position.set(
        position.x - 35,
        55,
        position.z - 25
      );
    }
  }

  setShadowsEnabled(enabled) {
    this.options.enableShadows = Boolean(enabled);
    this.lights.sun.castShadow = this.options.enableShadows;

    if (!this.options.enableShadows) {
      this.lights.sun.shadow.map?.dispose();
      this.lights.sun.shadow.map = null;
    }
  }

  setAmbientIntensity(intensity) {
    this.options.ambientIntensity = THREE.MathUtils.clamp(
      intensity,
      0,
      3
    );

    this.applyPreset(this.currentPeriod);
  }

  setSunIntensity(intensity) {
    this.options.sunIntensity = THREE.MathUtils.clamp(
      intensity,
      0,
      4
    );

    this.applyPreset(this.currentPeriod);
  }

  setEnabled(enabled) {
    this.enabled = Boolean(enabled);

    for (const light of Object.values(this.lights)) {
      light.visible = this.enabled;
    }
  }

  getSnapshot() {
    return {
      period: this.currentPeriod,
      weather: this.currentWeather,
      enabled: this.enabled,
      shadowsEnabled: this.options.enableShadows,
      ambientIntensity: this.lights.ambient.intensity,
      sunIntensity: this.lights.sun.intensity,
    };
  }

  dispose() {
    for (const light of Object.values(this.lights)) {
      this.scene.remove(light);

      if (light.shadow?.map) {
        light.shadow.map.dispose();
      }
    }

    this.lights = {};
    this.enabled = false;
  }
}