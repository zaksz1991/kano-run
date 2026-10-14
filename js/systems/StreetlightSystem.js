import * as THREE from "three";

/**
 * Roadside streetlights — lamps on at evening/night via time:lighting-updated.
 */
export default class StreetlightSystem {
  constructor({ scene, eventBus = null, config = {} } = {}) {
    this.scene = scene;
    this.eventBus = eventBus;
    this.config = {
      gap: 28,
      sideOffset: 9.5,
      startZ: -40,
      ahead: 400,
      behind: 80,
      ...config,
    };

    this.lights = [];
    this.lampMeshes = [];
    this.enabled = true;
    this.nightMode = false;
    this._anchorZ = 0;
    this._disposers = [];

    this._subscribe("time:lighting-updated", (p) => {
      this.nightMode = Boolean(p?.streetlightsEnabled);
      this._applyNightMode();
    });
    this._subscribe("time:period-changed", (p) => {
      this.nightMode =
        p?.current === "evening" || p?.current === "night";
      this._applyNightMode();
    });
    this._subscribe("game:started", () => {
      this._rebuildAround(0);
    });
    this._subscribe("game:stopped", () => this.clear());
  }

  update(deltaTime, playerZ = 0) {
    const z = Number(playerZ) || 0;
    if (Math.abs(z - this._anchorZ) > this.config.gap * 2) {
      this._rebuildAround(z);
    }
  }

  _rebuildAround(playerZ) {
    this.clear();
    this._anchorZ = playerZ;
    const start = playerZ - this.config.behind;
    const end = playerZ + this.config.ahead;

    for (let z = start; z < end; z += this.config.gap) {
      for (const side of [-1, 1]) {
        this._addLight(side * this.config.sideOffset, z);
      }
    }
    this._applyNightMode();
  }

  _addLight(x, z) {
    const group = new THREE.Group();
    group.position.set(x, 0, z);

    const pole = new THREE.Mesh(
      new THREE.CylinderGeometry(0.08, 0.1, 6.5, 6),
      new THREE.MeshStandardMaterial({ color: 0x475569, flatShading: true }),
    );
    pole.position.y = 3.25;
    group.add(pole);

    const arm = new THREE.Mesh(
      new THREE.BoxGeometry(1.4, 0.08, 0.08),
      new THREE.MeshStandardMaterial({ color: 0x64748b }),
    );
    arm.position.set(x > 0 ? -0.5 : 0.5, 6.3, 0);
    group.add(arm);

    const lamp = new THREE.Mesh(
      new THREE.SphereGeometry(0.22, 8, 6),
      new THREE.MeshStandardMaterial({
        color: 0xfef3c7,
        emissive: 0xfbbf24,
        emissiveIntensity: 0,
      }),
    );
    lamp.position.set(x > 0 ? -1.1 : 1.1, 6.2, 0);
    group.add(lamp);

    const pt = new THREE.PointLight(0xffe7a0, 0, 18, 2);
    pt.position.copy(lamp.position);
    group.add(pt);

    this.scene.add(group);
    this.lampMeshes.push({ group, lamp, light: pt });
  }

  _applyNightMode() {
    for (const item of this.lampMeshes) {
      if (item.lamp?.material) {
        item.lamp.material.emissiveIntensity = this.nightMode ? 0.9 : 0;
      }
      if (item.light) {
        item.light.intensity = this.nightMode ? 1.2 : 0;
      }
    }
  }

  clear() {
    for (const item of this.lampMeshes) {
      this.scene.remove(item.group);
    }
    this.lampMeshes = [];
  }

  _subscribe(name, handler) {
    if (!this.eventBus?.on) return;
    const u = this.eventBus.on(name, handler);
    if (typeof u === "function") this._disposers.push(u);
  }

  dispose() {
    this.clear();
    for (const u of this._disposers) {
      try {
        u();
      } catch {}
    }
    this._disposers = [];
  }
}
