import * as THREE from "three";

/**
 * Kano landmark / brand images on roadside billboards.
 * Uses public/assets/models/brand/*
 */
const BRANDS = [
  { file: "/assets/models/brand/kano-flyover.jpg", label: "Kano Flyover" },
  { file: "/assets/models/brand/kano-gate.jpg", label: "Kano Gate" },
  { file: "/assets/models/brand/kano-interchange.webp", label: "Interchange" },
  { file: "/assets/models/brand/kano-palace-gate.webp", label: "Palace Gate" },
  { file: "/assets/models/brand/kano-welcome.webp", label: "Welcome to Kano" },
  { file: "/assets/models/brand/keke-fleet.jpg", label: "Keke Fleet" },
  { file: "/assets/models/brand/keke-side.jpg", label: "Adaidaita" },
  { file: "/assets/models/brand/keke-street.webp", label: "Kano Streets" },
];

export default class LandmarkBillboardSystem {
  constructor({ scene, eventBus = null, config = {} } = {}) {
    this.scene = scene;
    this.eventBus = eventBus;
    this.config = {
      gap: 180,
      firstZ: 120,
      sideOffset: 14,
      ...config,
    };
    this.boards = [];
    this.textures = [];
    this.nextZ = this.config.firstZ;
    this.enabled = false;
    this._loader = new THREE.TextureLoader();
    this._disposers = [];
    this._ready = false;

    this._subscribe("game:started", () => {
      this.enabled = true;
      this.clear();
      this.nextZ = this.config.firstZ;
      this._preload();
    });
    this._subscribe("game:stopped", () => {
      this.enabled = false;
      this.clear();
    });
  }

  _preload() {
    let left = BRANDS.length;
    BRANDS.forEach((b, i) => {
      this._loader.load(
        encodeURI(b.file),
        (tex) => {
          tex.colorSpace = THREE.SRGBColorSpace;
          this.textures[i] = tex;
          left -= 1;
          if (left <= 0) this._ready = true;
        },
        undefined,
        () => {
          left -= 1;
          if (left <= 0) this._ready = true;
        },
      );
    });
  }

  update(deltaTime, playerZ = 0) {
    if (!this.enabled) return;
    const z = Number(playerZ) || 0;

    if (this._ready && z + 250 > this.nextZ) {
      this._spawn(this.nextZ);
      this.nextZ += this.config.gap + Math.random() * 40;
    }

    for (let i = this.boards.length - 1; i >= 0; i--) {
      if (this.boards[i].z < z - 40) {
        this.scene.remove(this.boards[i].mesh);
        this.boards.splice(i, 1);
      }
    }

    // Landmark callout when near
    for (const board of this.boards) {
      if (!board.called && Math.abs(board.z - z) < 12) {
        board.called = true;
        this.eventBus?.emit?.("landmark:reached", {
          name: board.label,
          z: board.z,
        });
        this.eventBus?.emit?.("hud:notify", {
          text: board.label,
          type: "landmark",
        });
      }
    }
  }

  _spawn(z) {
    const idx = Math.floor(Math.random() * BRANDS.length);
    const brand = BRANDS[idx];
    const tex = this.textures[idx];
    const side = Math.random() > 0.5 ? 1 : -1;

    const group = new THREE.Group();
    // Poles
    for (const ox of [-1.6, 1.6]) {
      const pole = new THREE.Mesh(
        new THREE.CylinderGeometry(0.12, 0.14, 5, 8),
        new THREE.MeshStandardMaterial({ color: 0x64748b }),
      );
      pole.position.set(ox, 2.5, 0);
      group.add(pole);
    }
    // Board
    const mat = tex
      ? new THREE.MeshStandardMaterial({
          map: tex,
          roughness: 0.85,
        })
      : new THREE.MeshStandardMaterial({ color: 0x0ea5e9 });
    const board = new THREE.Mesh(new THREE.PlaneGeometry(5.5, 3.2), mat);
    board.position.set(0, 5.2, 0);
    group.add(board);
    // Back
    const back = new THREE.Mesh(
      new THREE.PlaneGeometry(5.5, 3.2),
      new THREE.MeshStandardMaterial({ color: 0x1e293b }),
    );
    back.position.set(0, 5.2, -0.05);
    back.rotation.y = Math.PI;
    group.add(back);

    group.position.set(side * this.config.sideOffset, 0, z);
    group.rotation.y = side > 0 ? -0.35 : 0.35;
    this.scene.add(group);
    this.boards.push({
      z,
      mesh: group,
      label: brand.label,
      called: false,
    });
  }

  clear() {
    for (const b of this.boards) this.scene.remove(b.mesh);
    this.boards = [];
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
