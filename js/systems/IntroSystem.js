import * as THREE from "three";
import { GAME_CONFIG } from "../core/config.js";

export default class IntroSystem {
  constructor({
    scene,
    eventBus = null,
    cameraSystem = null,
    playerVehicleSystem = null,
    config = {},
  } = {}) {
    if (!scene) throw new Error("IntroSystem requires a scene.");

    this.scene = scene;
    this.eventBus = eventBus;
    this.cameraSystem = cameraSystem;
    this.playerVehicle = playerVehicleSystem;
    this.config = { ...GAME_CONFIG?.intro ?? {}, ...config };

    this.active = false;
    this.phase = "idle"; // idle, walking, entering, starting, finished
    this.timer = 0;
    this.duration = 6.0; // Total intro length in seconds

    this.driver = null;
    this.kekePosition = new THREE.Vector3(0, 0, 0);
    this.startPosition = new THREE.Vector3(0, 0, -8); // Start 8 units behind keke

    this._disposers = [];
  }

  initialize() {
    this._createDriverModel();
    this._subscribe("game:started", () => this.startSequence());
    this._subscribe("game:reset", () => this.reset());
  }

  _createDriverModel() {
    // Placeholder procedural driver (Capsule-like shape)
    // In the future, replace this with GLTFLoader to load a real character model
    const group = new THREE.Group();
    group.name = "intro-driver";

    const bodyMat = new THREE.MeshStandardMaterial({ color: 0x2c3e50, roughness: 0.8, flatShading: true });
    const headMat = new THREE.MeshStandardMaterial({ color: 0x8d5524, roughness: 0.8, flatShading: true });
    const pantsMat = new THREE.MeshStandardMaterial({ color: 0x34495e, roughness: 0.8, flatShading: true });

    // Legs
    const legGeo = new THREE.BoxGeometry(0.3, 0.8, 0.3);
    const leftLeg = new THREE.Mesh(legGeo, pantsMat);
    leftLeg.position.set(-0.15, 0.4, 0);
    leftLeg.castShadow = true;
    const rightLeg = new THREE.Mesh(legGeo, pantsMat);
    rightLeg.position.set(0.15, 0.4, 0);
    rightLeg.castShadow = true;
    group.add(leftLeg, rightLeg);

    // Torso
    const torsoGeo = new THREE.BoxGeometry(0.5, 0.7, 0.3);
    const torso = new THREE.Mesh(torsoGeo, bodyMat);
    torso.position.set(0, 1.15, 0);
    torso.castShadow = true;
    group.add(torso);

    // Head
    const headGeo = new THREE.SphereGeometry(0.2, 8, 6);
    const head = new THREE.Mesh(headGeo, headMat);
    head.position.set(0, 1.7, 0);
    head.castShadow = true;
    group.add(head);

    group.visible = false;
    this.scene.add(group);
    this.driver = group;
  }

  startSequence() {
    if (!this.playerVehicle || !this.playerVehicle.vehicle) return;

    this.active = true;
    this.phase = "walking";
    this.timer = 0;

    // Get Keke position
    this.kekePosition.copy(this.playerVehicle.position);
    this.startPosition.set(this.kekePosition.x, 0, this.kekePosition.z - 8);

    // Setup Driver
    this.driver.position.copy(this.startPosition);
    this.driver.visible = true;
    this.driver.rotation.y = 0; // Face forward (+Z)

    // Disable player controls during intro
    if (this.playerVehicle) this.playerVehicle.enabled = false;

    this.eventBus?.emit?.("intro:started");
  }

  update(deltaTime) {
    if (!this.active) return;

    this.timer += deltaTime;

    if (this.phase === "walking") {
      this._updateWalking(deltaTime);
    } else if (this.phase === "entering") {
      this._updateEntering(deltaTime);
    } else if (this.phase === "starting") {
      this._updateStarting(deltaTime);
    }
  }

  _updateWalking(dt) {
    // Move driver towards keke
    const speed = 2.5; // Walking speed
    this.driver.position.z += speed * dt;

    // Simple bobbing animation for walking
    this.driver.position.y = Math.abs(Math.sin(this.timer * 10)) * 0.05;

    // Camera follows driver from behind/side
    if (this.cameraSystem && this.cameraSystem.setIntroCamera) {
      this.cameraSystem.setIntroCamera(this.driver.position);
    }

    // Transition to entering when close to keke
    if (this.driver.position.z >= this.kekePosition.z - 1.5) {
      this.phase = "entering";
      this.timer = 0;
      this.driver.position.y = 0;
    }
  }

  _updateEntering(dt) {
    // Fade out driver or play "enter" animation
    if (this.timer > 0.5) {
      this.driver.visible = false;
      this.phase = "starting";
      this.timer = 0;
      
      // Play engine start sound
      this.eventBus?.emit?.("audio:engine-start");
    }
  }

  _updateStarting(dt) {
    // Camera shakes slightly or zooms in on Keke
    if (this.timer > 1.5) {
      this.finishIntro();
    }
  }

  finishIntro() {
    this.active = false;
    this.phase = "finished";
    this.driver.visible = false;

    // Re-enable player controls
    if (this.playerVehicle) this.playerVehicle.enabled = true;

    // Signal Game.js to start the actual gameplay loop
    this.eventBus?.emit?.("game:intro-complete");
    
    console.log("[IntroSystem] Sequence finished. Gameplay started.");
  }

  reset() {
    this.active = false;
    this.phase = "idle";
    this.timer = 0;
    if (this.driver) this.driver.visible = false;
  }

  _subscribe(eventName, handler) {
    if (!this.eventBus?.on) return;
    const result = this.eventBus.on(eventName, handler);
    if (typeof result === "function") this._disposers.push(result);
  }

  dispose() {
    this.reset();
    if (this.driver) {
      this.scene.remove(this.driver);
      this.driver.traverse((child) => {
        if (child.isMesh) {
          child.geometry.dispose();
          child.material.dispose();
        }
      });
    }
    for (const unsub of this._disposers) unsub();
    this._disposers = [];
  }
}