import * as THREE from "three";
import { GAME_CONFIG } from "../core/config.js";

/**
 * Opening sequence — skip on mobile / after short timeout so controls never lock forever.
 * Box driver was a placeholder; mobile users skip straight to driving.
 */
export default class IntroSystem {
  constructor({
    scene,
    eventBus = null,
    cameraSystem = null,
    playerVehicleSystem = null,
    audio = null,
    config = {},
  } = {}) {
    if (!scene) throw new Error("IntroSystem requires a scene.");

    this.scene = scene;
    this.eventBus = eventBus;
    this.cameraSystem = cameraSystem;
    this.playerVehicle = playerVehicleSystem;
    this.audio = audio;
    this.config = { ...(GAME_CONFIG?.intro ?? {}), ...config };

    this.active = false;
    this.phase = "idle";
    this.timer = 0;
    this.driver = null;
    this.kekePosition = new THREE.Vector3();
    this.startPosition = new THREE.Vector3();
    this._overlay = null;
    this._disposers = [];
    this._pendingStart = false;
    this._waitTimer = 0;

    this._isMobile =
      typeof window !== "undefined" &&
      (window.innerWidth <= 900 ||
        matchMedia("(pointer: coarse)").matches);
  }

  initialize() {
    if (!this._isMobile) this._createDriverModel();
    this._subscribe("game:started", () => this.startSequence());
    this._subscribe("game:reset", () => this.reset());
    this._subscribe("game:intro-complete", () => {
      if (this.playerVehicle) this.playerVehicle.enabled = true;
    });
    return this;
  }

  _createDriverModel() {
    const group = new THREE.Group();
    group.name = "intro-driver";

    const bodyMat = new THREE.MeshStandardMaterial({
      color: 0x1e3a5f,
      roughness: 0.85,
      flatShading: true,
    });
    const headMat = new THREE.MeshStandardMaterial({
      color: 0x8d5524,
      roughness: 0.8,
      flatShading: true,
    });
    const pantsMat = new THREE.MeshStandardMaterial({
      color: 0x1f2937,
      roughness: 0.9,
      flatShading: true,
    });

    const legGeo = new THREE.BoxGeometry(0.22, 0.7, 0.22);
    const leftLeg = new THREE.Mesh(legGeo, pantsMat);
    leftLeg.position.set(-0.12, 0.35, 0);
    const rightLeg = new THREE.Mesh(legGeo, pantsMat);
    rightLeg.position.set(0.12, 0.35, 0);
    group.add(leftLeg, rightLeg);

    const torso = new THREE.Mesh(
      new THREE.BoxGeometry(0.42, 0.55, 0.28),
      bodyMat,
    );
    torso.position.set(0, 0.95, 0);
    group.add(torso);

    const head = new THREE.Mesh(new THREE.SphereGeometry(0.16, 10, 8), headMat);
    head.position.set(0, 1.4, 0);
    group.add(head);

    const cap = new THREE.Mesh(
      new THREE.CylinderGeometry(0.17, 0.17, 0.08, 12),
      new THREE.MeshStandardMaterial({ color: 0xf8fafc, roughness: 0.7 }),
    );
    cap.position.set(0, 1.55, 0);
    group.add(cap);

    group.visible = false;
    this.scene.add(group);
    this.driver = group;
  }

  _showTitle(text) {
    if (this._isMobile) return;
    document.getElementById("kano-intro-title")?.remove();
    const el = document.createElement("div");
    el.id = "kano-intro-title";
    Object.assign(el.style, {
      position: "fixed",
      left: "50%",
      top: "18%",
      transform: "translateX(-50%)",
      zIndex: "1500",
      color: "#f8fafc",
      fontFamily: "system-ui, Arial, sans-serif",
      fontSize: "18px",
      fontWeight: "700",
      textShadow: "0 2px 12px rgba(0,0,0,0.8)",
      pointerEvents: "none",
      textAlign: "center",
    });
    el.textContent = text;
    document.body.appendChild(el);
    this._overlay = el;
  }

  _hideTitle() {
    this._overlay?.remove();
    this._overlay = null;
    document.getElementById("kano-intro-title")?.remove();
  }

  startSequence() {
    this.playerVehicle =
      this.playerVehicle ??
      this.eventBus?.game?.systems?.get?.("playerVehicle") ??
      null;

    // Mobile / low-end: skip cinematic entirely
    if (this._isMobile || this.config.skipIntro) {
      this.finishIntro();
      return;
    }

    if (!this.playerVehicle?.vehicle && !this.playerVehicle?.position) {
      this._pendingStart = true;
      this._waitTimer = 0;
      return;
    }

    this._beginWalk();
  }

  _beginWalk() {
    this._pendingStart = false;
    this.active = true;
    this.phase = "walking";
    this.timer = 0;

    const pos = this.playerVehicle?.position ?? new THREE.Vector3();
    this.kekePosition.set(Number(pos.x) || 0, 0, Number(pos.z) || 0);
    this.startPosition.set(
      this.kekePosition.x - 1.2,
      0,
      this.kekePosition.z - 7,
    );

    if (this.driver) {
      this.driver.position.copy(this.startPosition);
      this.driver.visible = true;
      this.driver.rotation.y = 0;
      this.driver.scale.setScalar(1);
    }

    if (this.playerVehicle) {
      this.playerVehicle.enabled = false;
      if (this.playerVehicle.vehicle) this.playerVehicle.vehicle.visible = true;
    }

    this._showTitle("Driver approaching Adaidaita Sahu…");
    this.eventBus?.emit?.("intro:started");
  }

  update(deltaTime) {
    const dt = Math.max(0, Number(deltaTime) || 0);

    if (this._pendingStart) {
      this._waitTimer += dt;
      if (this.playerVehicle?.vehicle || this.playerVehicle?.position) {
        this._beginWalk();
      } else if (this._waitTimer > 2.5) {
        // Never block gameplay if GLB is slow
        this.finishIntro();
      }
      return;
    }

    if (!this.active) return;
    this.timer += dt;

    if (this.phase === "walking") this._updateWalking(dt);
    else if (this.phase === "entering") this._updateEntering(dt);
    else if (this.phase === "starting") this._updateStarting(dt);
  }

  _updateWalking(dt) {
    if (!this.driver) {
      this.finishIntro();
      return;
    }
    const target = this.kekePosition;
    const dir = new THREE.Vector3().subVectors(target, this.driver.position);
    dir.y = 0;
    const dist = dir.length();
    if (dist > 0.15) {
      dir.normalize();
      this.driver.position.addScaledVector(dir, 3.2 * dt);
      this.driver.rotation.y = Math.atan2(dir.x, dir.z);
      this.driver.position.y = Math.abs(Math.sin(this.timer * 12)) * 0.06;
      try {
        this.cameraSystem?.setIntroCamera?.(this.driver.position);
      } catch {}
    } else {
      this.phase = "entering";
      this.timer = 0;
      this.driver.position.y = 0;
      this._showTitle("Entering keke…");
    }
  }

  _updateEntering(dt) {
    if (!this.driver) {
      this.finishIntro();
      return;
    }
    const u = Math.min(1, this.timer / 0.9);
    this.driver.position.x = THREE.MathUtils.lerp(
      this.driver.position.x,
      this.kekePosition.x,
      u,
    );
    this.driver.position.z = THREE.MathUtils.lerp(
      this.driver.position.z,
      this.kekePosition.z,
      u,
    );
    this.driver.position.y = THREE.MathUtils.lerp(0, 0.4, u);
    this.driver.scale.setScalar(1 - u * 0.35);
    if (u >= 1) {
      this.driver.visible = false;
      this.phase = "starting";
      this.timer = 0;
      this._showTitle("Engine starting…");
      this.eventBus?.emit?.("audio:engine-start");
    }
  }

  _updateStarting(dt) {
    if (this.timer > 0.8) this.finishIntro();
  }

  finishIntro() {
    this.active = false;
    this.phase = "finished";
    this._pendingStart = false;
    this._hideTitle();
    if (this.driver) {
      this.driver.visible = false;
      this.driver.scale.setScalar(1);
    }
    if (this.playerVehicle) {
      this.playerVehicle.enabled = true;
      this.playerVehicle.setEnabled?.(true);
    }
    // Clear any hold from negotiation leftovers
    this.eventBus?.emit?.("vehicle:hold", { hold: false, reason: "intro-done" });
    this.eventBus?.emit?.("game:intro-complete");
    console.info("[IntroSystem] Controls enabled.");
  }

  reset() {
    this.active = false;
    this.phase = "idle";
    this.timer = 0;
    this._pendingStart = false;
    this._waitTimer = 0;
    if (this.driver) {
      this.driver.visible = false;
      this.driver.scale.setScalar(1);
    }
    this._hideTitle();
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
          child.geometry?.dispose?.();
          child.material?.dispose?.();
        }
      });
    }
    for (const unsub of this._disposers) {
      try {
        unsub();
      } catch {}
    }
  }
}
