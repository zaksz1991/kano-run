import * as THREE from "three";
import { GAME_CONFIG } from "../core/config.js";

const DEFAULTS = {
  sunIntensity: 2.5,
  sunColor: 0xfff4e6, // Warm, hot sun color
  ambientIntensity: 0.6,
  skyColor: 0x87ceeb,
  groundColor: 0xc2b280, // Sandy beige for Kano ground bounce
  fogColor: 0xd4c4a8, // Dusty haze color
  fogDensity: 0.015,
  shadowMapSize: 2048,
  shadowCameraNear: 0.5,
  shadowCameraFar: 150,
  shadowCameraSize: 60,
};

export default class LightingSystem {
  constructor({
    scene,
    camera,
    eventBus = null,
    config = {},
  } = {}) {
    if (!scene) throw new Error("LightingSystem requires a scene.");

    this.scene = scene;
    this.camera = camera;
    this.eventBus = eventBus;
    this.config = { ...DEFAULTS, ...(GAME_CONFIG?.lighting ?? {}), ...config };

    this.sun = null;
    this.ambient = null;
    this.hemi = null;
    this.enabled = false;
    this.timeOfDay = 0.5; // 0 to 1 (0.5 is noon)

    this._disposers = [];
  }

  initialize() {
    this._createLights();
    this.enabled = true;
    this.eventBus?.emit?.("lighting:initialized");
  }

  _createLights() {
    // 1. Hemisphere Light (Sky/Ground bounce - crucial for outdoor feel)
    this.hemi = new THREE.HemisphereLight(
      this.config.skyColor,
      this.config.groundColor,
      this.config.ambientIntensity
    );
    this.scene.add(this.hemi);

    // 2. Directional Light (The Sun)
    this.sun = new THREE.DirectionalLight(
      this.config.sunColor,
      this.config.sunIntensity
    );
    
    // Position sun high and slightly angled for dramatic shadows
    this.sun.position.set(50, 80, 30);
    
    // Shadow Configuration
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.width = this.config.shadowMapSize;
    this.sun.shadow.mapSize.height = this.config.shadowMapSize;
    this.sun.shadow.camera.near = this.config.shadowCameraNear;
    this.sun.shadow.camera.far = this.config.shadowCameraFar;
    this.sun.shadow.camera.left = -this.config.shadowCameraSize;
    this.sun.shadow.camera.right = this.config.shadowCameraSize;
    this.sun.shadow.camera.top = this.config.shadowCameraSize;
    this.sun.shadow.camera.bottom = -this.config.shadowCameraSize;
    
    // Bias to prevent "shadow acne" on flat surfaces
    this.sun.shadow.bias = -0.0005;
    this.sun.shadow.normalBias = 0.02;

    this.scene.add(this.sun);
    this.scene.add(this.sun.target);

    // 3. Atmospheric Fog (Harmattan Dust)
    this.scene.fog = new THREE.FogExp2(
      this.config.fogColor,
      this.config.fogDensity
    );
    
    // Ensure background matches fog for seamless horizon
    this.scene.background = new THREE.Color(this.config.fogColor);
  }

  update(deltaTime, playerZ = 0) {
    if (!this.enabled || !this.sun) return;

    // Move sun and shadows to follow the player (infinite world illusion)
    // This keeps shadow resolution high near the player
    this.sun.position.x = playerZ + 50;
    this.sun.target.position.set(playerZ, 0, 0);
    this.sun.target.updateMatrixWorld();

    // Optional: Slowly rotate sun for day/night cycle
    // this.timeOfDay += deltaTime * 0.01;
    // this._updateSunPosition();
  }

  _updateSunPosition() {
    const angle = this.timeOfDay * Math.PI;
    const radius = 100;
    this.sun.position.y = Math.sin(angle) * radius;
    this.sun.position.z = Math.cos(angle) * radius;
  }

  setWeather(type = "clear") {
    if (type === "harmattan") {
      this.scene.fog.density = 0.035; // Thicker dust
      this.scene.fog.color.setHex(0xe6d5b8);
      this.scene.background.setHex(0xe6d5b8);
      this.sun.intensity = 1.8; // Dimmer sun through dust
    } else if (type === "rain") {
      this.scene.fog.density = 0.025;
      this.scene.fog.color.setHex(0x8899a6);
      this.scene.background.setHex(0x8899a6);
      this.sun.intensity = 1.2;
    } else {
      // Clear/Default
      this.scene.fog.density = this.config.fogDensity;
      this.scene.fog.color.setHex(this.config.fogColor);
      this.scene.background.setHex(this.config.fogColor);
      this.sun.intensity = this.config.sunIntensity;
    }
  }

  dispose() {
    this.scene.remove(this.sun);
    this.scene.remove(this.hemi);
    this.sun.dispose();
    this.hemi.dispose();
    for (const unsub of this._disposers) unsub();
    this._disposers = [];
  }
}