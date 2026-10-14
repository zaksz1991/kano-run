import * as THREE from "three";

/**
 * Sidewalk pedestrians that walk along the road edge.
 */
export default class PedestrianSystem {
  constructor({ scene, eventBus = null, config = {} } = {}) {
    this.scene = scene;
    this.eventBus = eventBus;
    this.config = {
      maxCount: 14,
      sideOffset: 11,
      walkSpeed: 1.4,
      spawnGap: 40,
      ...config,
    };
    this.peds = [];
    this.enabled = false;
    this._nextZ = 30;
    this._disposers = [];

    this._subscribe("game:started", () => {
      this.enabled = true;
      this.clear();
      this._nextZ = 20;
      for (let i = 0; i < 6; i++) this._spawn(this._nextZ + i * 25);
    });
    this._subscribe("game:stopped", () => {
      this.enabled = false;
      this.clear();
    });
  }

  update(deltaTime, playerZ = 0) {
    if (!this.enabled) return;
    const dt = Math.min(Number(deltaTime) || 0, 0.05);
    const z = Number(playerZ) || 0;

    if (this._nextZ < z + 200 && this.peds.length < this.config.maxCount) {
      this._spawn(this._nextZ);
      this._nextZ += this.config.spawnGap + Math.random() * 20;
    }

    for (let i = this.peds.length - 1; i >= 0; i--) {
      const p = this.peds[i];
      p.z += p.dir * p.speed * dt;
      p.mesh.position.z = p.z;
      // Walk bob
      p.mesh.position.y = Math.abs(Math.sin(p.phase + this._clock(dt) * 8)) * 0.06;
      p.mesh.rotation.y = p.dir > 0 ? 0 : Math.PI;

      if (p.z < z - 40 || p.z > z + 280) {
        this.scene.remove(p.mesh);
        this.peds.splice(i, 1);
      }
    }
  }

  _clock(dt) {
    this._t = (this._t || 0) + dt;
    return this._t;
  }

  _spawn(z) {
    const side = Math.random() > 0.5 ? 1 : -1;
    const group = new THREE.Group();
    const body = new THREE.Mesh(
      new THREE.CapsuleGeometry(0.22, 0.55, 4, 6),
      new THREE.MeshStandardMaterial({
        color: [0x1e3a5f, 0x166534, 0x7c2d12, 0x4c1d95, 0x0f172a][
          Math.floor(Math.random() * 5)
        ],
        flatShading: true,
      }),
    );
    body.position.y = 0.85;
    body.castShadow = true;
    group.add(body);
    const head = new THREE.Mesh(
      new THREE.SphereGeometry(0.16, 8, 6),
      new THREE.MeshStandardMaterial({ color: 0x8d5524, flatShading: true }),
    );
    head.position.y = 1.45;
    group.add(head);

    // Some with hijab-like scarf
    if (Math.random() > 0.55) {
      const scarf = new THREE.Mesh(
        new THREE.SphereGeometry(0.18, 8, 6, 0, Math.PI * 2, 0, Math.PI / 2),
        new THREE.MeshStandardMaterial({ color: 0xf8fafc, flatShading: true }),
      );
      scarf.position.y = 1.5;
      group.add(scarf);
    }

    group.position.set(side * this.config.sideOffset, 0, z);
    this.scene.add(group);
    this.peds.push({
      mesh: group,
      z,
      side,
      dir: Math.random() > 0.5 ? 1 : -1,
      speed: this.config.walkSpeed * (0.7 + Math.random() * 0.6),
      phase: Math.random() * Math.PI * 2,
    });
  }

  clear() {
    for (const p of this.peds) this.scene.remove(p.mesh);
    this.peds = [];
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
