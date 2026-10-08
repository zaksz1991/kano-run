// Phase 3 — richer Kano street visuals while preserving the Upgrade 9 renderer contract
import * as THREE from '../vendor/three.module.js';

const LANE_X = [-2.4, 0, 2.4];
const ROAD_LEN = 120;
const PLAYER_Z = 5.5;

export class Renderer3D {
  constructor(game) {
    this.game = game;
    this.canvas = game.canvas;
    this.ready = false;
    this.vehiclePool = [];
    this.zonePool = [];
    this.coinPool = [];
    this.init();
  }

  init() {
    const w = this.canvas.clientWidth || 390;
    const h = this.canvas.clientHeight || 700;
    this.renderer = new THREE.WebGLRenderer({
      canvas: this.canvas,
      antialias: true,
      powerPreference: 'high-performance'
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
    this.renderer.setSize(w, h, false);
    this.renderer.setClearColor(0x0a1020, 1);

    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.Fog(0x0a1020, 30, 100);

    this.camera = new THREE.PerspectiveCamera(50, w / h, 0.1, 160);
    this.camera.position.set(0, 6.2, -3.5);
    this.camera.lookAt(0, 0.8, 18);

    this.scene.add(new THREE.AmbientLight(0x9aacc8, 0.6));
    this.sun = new THREE.DirectionalLight(0xfff1c9, 1.1);
    this.sun.position.set(10, 20, 8);
    this.scene.add(this.sun);
    this.hemlight = new THREE.HemisphereLight(0x87b5ff, 0x3d4a32, 0.4);
    this.scene.add(this.hemlight);

    this.buildRoad();
    this.buildCityscape();

    this.player = this.makeKeke(0xfbbf24, true);
    this.player.position.set(0, 0, PLAYER_Z);
    this.scene.add(this.player);

    // Keep a fixed pool, but each slot can switch between actual vehicle silhouettes.
    for (let i = 0; i < 22; i++) {
      const v = this.makeVehicle('car', 0x64748b);
      v.visible = false;
      this.scene.add(v);
      this.vehiclePool.push(v);
    }

    for (let i = 0; i < 10; i++) {
      const z = this.makeZone(0x4ade80);
      z.visible = false;
      this.scene.add(z);
      this.zonePool.push(z);
    }

    for (let i = 0; i < 12; i++) {
      const c = this.makeCoin();
      c.visible = false;
      this.scene.add(c);
      this.coinPool.push(c);
    }

    this.initParticles();
    this.weather = 'clear';
    this.weatherTimer = 0;
    try {
      const lq = JSON.parse(localStorage.getItem('kanoLQ') || 'false');
      if (lq) this.applyQuality(true);
    } catch {}
    this.ready = true;
  }

  initParticles() {
    this.dustGeo = new THREE.BufferGeometry();
    const dustCount = 100;
    const dustPos = new Float32Array(dustCount * 3);
    for (let i = 0; i < dustCount; i++) {
      dustPos[i * 3] = (Math.random() - 0.5) * 9;
      dustPos[i * 3 + 1] = Math.random() * 1.8;
      dustPos[i * 3 + 2] = Math.random() * 46 + 2;
    }
    this.dustGeo.setAttribute('position', new THREE.BufferAttribute(dustPos, 3));
    this.dustMat = new THREE.PointsMaterial({
      color: 0xc4b5a0,
      size: 0.12,
      transparent: true,
      opacity: 0.35,
      depthWrite: false
    });
    this.dust = new THREE.Points(this.dustGeo, this.dustMat);
    this.scene.add(this.dust);

    this.rainGeo = new THREE.BufferGeometry();
    const rainCount = 400;
    const rainPos = new Float32Array(rainCount * 3);
    for (let i = 0; i < rainCount; i++) {
      rainPos[i * 3] = (Math.random() - 0.5) * 14;
      rainPos[i * 3 + 1] = Math.random() * 12;
      rainPos[i * 3 + 2] = Math.random() * 50;
    }
    this.rainGeo.setAttribute('position', new THREE.BufferAttribute(rainPos, 3));
    this.rainMat = new THREE.PointsMaterial({
      color: 0xa5c4e0,
      size: 0.08,
      transparent: true,
      opacity: 0,
      depthWrite: false
    });
    this.rain = new THREE.Points(this.rainGeo, this.rainMat);
    this.scene.add(this.rain);

    this.playerShadow = new THREE.Mesh(
      new THREE.CircleGeometry(0.7, 16),
      new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.28 })
    );
    this.playerShadow.rotation.x = -Math.PI / 2;
    this.playerShadow.position.y = 0.03;
    this.scene.add(this.playerShadow);
  }

  mat(color, opts = {}) {
    return new THREE.MeshStandardMaterial({
      color,
      roughness: opts.roughness ?? 0.55,
      metalness: opts.metalness ?? 0.15,
      emissive: opts.emissive ?? 0x000000,
      emissiveIntensity: opts.emissiveIntensity ?? 0
    });
  }

  buildRoad() {
    const road = new THREE.Mesh(
      new THREE.PlaneGeometry(9.5, ROAD_LEN),
      this.mat(0x2c3545, { roughness: 0.92, metalness: 0.08 })
    );
    road.rotation.x = -Math.PI / 2;
    road.position.set(0, 0, ROAD_LEN / 2 - 4);
    this.scene.add(road);

    const wear = new THREE.Mesh(
      new THREE.PlaneGeometry(3.2, ROAD_LEN),
      this.mat(0x243040, { roughness: 0.96, metalness: 0.04 })
    );
    wear.rotation.x = -Math.PI / 2;
    wear.position.set(0, 0.005, ROAD_LEN / 2 - 4);
    this.scene.add(wear);

    for (const sx of [-5.7, 5.7]) {
      const sh = new THREE.Mesh(
        new THREE.PlaneGeometry(2.4, ROAD_LEN),
        this.mat(0x5c5346, { roughness: 0.98 })
      );
      sh.rotation.x = -Math.PI / 2;
      sh.position.set(sx, 0.01, ROAD_LEN / 2 - 4);
      this.scene.add(sh);

      const curb = new THREE.Mesh(
        new THREE.BoxGeometry(0.25, 0.12, ROAD_LEN),
        this.mat(0x918579, { roughness: 0.9 })
      );
      curb.position.set(sx - Math.sign(sx) * 1.2, 0.07, ROAD_LEN / 2 - 4);
      this.scene.add(curb);
    }

    const lineMat = new THREE.MeshBasicMaterial({ color: 0xeab308 });
    for (const lx of [-4.5, 4.5]) {
      const line = new THREE.Mesh(new THREE.PlaneGeometry(0.14, ROAD_LEN), lineMat);
      line.rotation.x = -Math.PI / 2;
      line.position.set(lx, 0.02, ROAD_LEN / 2 - 4);
      this.scene.add(line);
    }

    const white = new THREE.MeshBasicMaterial({ color: 0xe2e8f0 });
    for (let z = 0; z < ROAD_LEN; z += 8) {
      for (const lx of [-4.35, 4.35]) {
        const tick = new THREE.Mesh(new THREE.PlaneGeometry(0.2, 0.6), white);
        tick.rotation.x = -Math.PI / 2;
        tick.position.set(lx, 0.022, z);
        this.scene.add(tick);
      }
    }

    this.laneMarks = new THREE.Group();
    const dashMat = new THREE.MeshBasicMaterial({ color: 0xfbbf24 });
    for (let z = 0; z < ROAD_LEN; z += 3.2) {
      for (const lx of [-1.2, 1.2]) {
        const dash = new THREE.Mesh(new THREE.PlaneGeometry(0.1, 1.4), dashMat);
        dash.rotation.x = -Math.PI / 2;
        dash.position.set(lx, 0.025, z);
        this.laneMarks.add(dash);
      }
    }
    this.scene.add(this.laneMarks);
  }

  buildCityscape() {
    this.buildings = new THREE.Group();
    const colors = [0x8d6246, 0xb9784f, 0x9a7b58, 0x6b7280, 0x7c5a3e, 0x5f6b73, 0x8a5f43];
    const types = [
      'house', 'shop', 'house', 'market', 'house', 'mosque',
      'shop', 'petrol', 'house', 'busstop', 'shop', 'house',
      'market', 'house', 'shop', 'mosque', 'house', 'petrol'
    ];

    for (const side of [-1, 1]) {
      this.addCompoundWall(side * 6.55, 3, side);
      for (let i = 0; i < types.length; i++) {
        const z = i * 6.5 + (side > 0 ? 2 : 0);
        const xBase = side * (6.8 + (i % 3) * 0.4);
        const kind = types[i];
        if (kind === 'mosque') this.addMosque(xBase, z, side);
        else if (kind === 'market') this.addMarketStall(xBase, z, side);
        else if (kind === 'petrol') this.addPetrol(xBase, z, side);
        else if (kind === 'busstop') this.addBusStop(xBase, z, side);
        else if (kind === 'shop') this.addShop(xBase, z, side, colors[i % colors.length]);
        else this.addHouse(xBase, z, side, colors[i % colors.length]);

        if (i % 3 === 0) this.addStreetLight(side * 5.2, z + 1.5);
        if (i % 4 === 1) this.addBillboard(side * 5.4, z + 3);
        if (i % 5 === 2) this.addTree(side * 5.3, z - 2.2, 1 + (i % 2) * 0.25);
      }
    }

    for (let i = 0; i < 12; i++) {
      const side = i % 2 === 0 ? -1 : 1;
      this.addPedestrian(side * 5.0, i * 8.2 + 4);
    }

    this.scene.add(this.buildings);

    this.sky = new THREE.Mesh(
      new THREE.SphereGeometry(95, 16, 12, 0, Math.PI * 2, 0, Math.PI / 2),
      new THREE.MeshBasicMaterial({ color: 0x1a2744, side: THREE.BackSide })
    );
    this.sky.position.y = -2;
    this.scene.add(this.sky);
  }

  addCompoundWall(x, z, side) {
    const wallMat = this.mat(0x7b6753, { roughness: 0.95 });
    const wall = new THREE.Mesh(new THREE.BoxGeometry(1.1, 1.15, 10), wallMat);
    wall.position.set(x, 0.58, z + 18);
    this.buildings.add(wall);

    const gate = new THREE.Mesh(
      new THREE.BoxGeometry(1.18, 1.55, 1.6),
      this.mat(0x4b4038, { roughness: 0.75 })
    );
    gate.position.set(x - side * 0.03, 0.78, z + 13);
    this.buildings.add(gate);
  }

  addHouse(x, z, side, color) {
    const bw = 1.7 + Math.random() * 1.15;
    const bh = 2.3 + Math.random() * 2.2;
    const bd = 1.55 + Math.random() * 1.15;

    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(bw, bh, bd),
      this.mat(color, { roughness: 0.92 })
    );
    mesh.position.set(x, bh / 2, z);
    this.buildings.add(mesh);

    const roof = new THREE.Mesh(
      new THREE.BoxGeometry(bw + 0.22, 0.16, bd + 0.22),
      this.mat(0x4b4038, { roughness: 0.96 })
    );
    roof.position.set(x, bh + 0.08, z);
    this.buildings.add(roof);

    const frontZ = z + (side > 0 ? -bd / 2 - 0.03 : bd / 2 + 0.03);

    const door = new THREE.Mesh(
      new THREE.BoxGeometry(0.35, 0.72, 0.08),
      this.mat(0x342a24, { roughness: 0.85 })
    );
    door.position.set(x, 0.36, frontZ);
    this.buildings.add(door);

    for (const wx of [-0.45, 0.45]) {
      const window = new THREE.Mesh(
        new THREE.BoxGeometry(0.3, 0.34, 0.06),
        this.mat(0x6ea8c7, {
          roughness: 0.18,
          metalness: 0.25,
          emissive: 0x18324a,
          emissiveIntensity: 0.12
        })
      );
      window.position.set(x + wx, 1.35, frontZ);
      this.buildings.add(window);
    }
  }

  addShop(x, z, side, color) {
    const bw = 2.0, bh = 2.45, bd = 1.65;

    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(bw, bh, bd),
      this.mat(color || 0xb45309, { roughness: 0.85 })
    );
    mesh.position.set(x, bh / 2, z);
    this.buildings.add(mesh);

    const awning = new THREE.Mesh(
      new THREE.BoxGeometry(bw + 0.3, 0.09, 0.72),
      this.mat(0xdc2626, { roughness: 0.72 })
    );
    awning.position.set(x, bh * 0.72, z - side * 0.28);
    this.buildings.add(awning);

    const sign = new THREE.Mesh(
      new THREE.BoxGeometry(bw * 0.84, 0.36, 0.08),
      this.mat(0xfbbf24, {
        roughness: 0.5,
        emissive: 0xb45309,
        emissiveIntensity: 0.15
      })
    );
    sign.position.set(
      x,
      bh * 0.9,
      z + (side > 0 ? -bd / 2 - 0.05 : bd / 2 + 0.05)
    );
    this.buildings.add(sign);

    const opening = new THREE.Mesh(
      new THREE.BoxGeometry(1.15, 0.92, 0.07),
      this.mat(0x241e1b, { roughness: 0.95 })
    );
    opening.position.set(
      x,
      0.66,
      z + (side > 0 ? -bd / 2 - 0.06 : bd / 2 + 0.06)
    );
    this.buildings.add(opening);
  }

  addMosque(x, z, side) {
    const base = new THREE.Mesh(
      new THREE.BoxGeometry(2.45, 2.75, 2.05),
      this.mat(0xe7e1d6, { roughness: 0.78 })
    );
    base.position.set(x, 1.38, z);
    this.buildings.add(base);

    const trim = new THREE.Mesh(
      new THREE.BoxGeometry(2.58, 0.18, 2.18),
      this.mat(0x0f766e, { roughness: 0.7 })
    );
    trim.position.set(x, 2.3, z);
    this.buildings.add(trim);

    const dome = new THREE.Mesh(
      new THREE.SphereGeometry(
        0.9,
        14,
        10,
        0,
        Math.PI * 2,
        0,
        Math.PI / 2
      ),
      this.mat(0x16a394, { roughness: 0.38, metalness: 0.15 })
    );
    dome.position.set(x, 2.8, z);
    this.buildings.add(dome);

    for (const dx of [-0.78, 0.78]) {
      const minaret = new THREE.Mesh(
        new THREE.CylinderGeometry(0.16, 0.21, 3.9, 10),
        this.mat(0xe7e1d6, { roughness: 0.75 })
      );
      minaret.position.set(x + dx * 1.1, 1.95, z - 0.62);
      this.buildings.add(minaret);

      const cap = new THREE.Mesh(
        new THREE.ConeGeometry(0.24, 0.48, 8),
        this.mat(0xfbbf24, {
          roughness: 0.4,
          metalness: 0.3
        })
      );
      cap.position.set(x + dx * 1.1, 4.12, z - 0.62);
      this.buildings.add(cap);
    }
  }

  addMarketStall(x, z, side) {
    const postM = this.mat(0x78716c, { roughness: 0.9 });

    for (const dx of [-0.78, 0.78]) {
      for (const dz of [-0.55, 0.55]) {
        const post = new THREE.Mesh(
          new THREE.BoxGeometry(0.1, 1.65, 0.1),
          postM
        );
        post.position.set(x + dx, 0.82, z + dz);
        this.buildings.add(post);
      }
    }

    const canopy = new THREE.Mesh(
      new THREE.BoxGeometry(1.9, 0.1, 1.45),
      this.mat(0xeab308, { roughness: 0.72 })
    );
    canopy.position.set(x, 1.67, z);
    this.buildings.add(canopy);

    const table = new THREE.Mesh(
      new THREE.BoxGeometry(1.5, 0.12, 1.0),
      this.mat(0xa16207, { roughness: 0.85 })
    );
    table.position.set(x, 0.7, z);
    this.buildings.add(table);

    for (let i = 0; i < 6; i++) {
      const g = new THREE.Mesh(
        new THREE.SphereGeometry(0.09 + (i % 2) * 0.02, 8, 6),
        this.mat(
          [0x22c55e, 0xef4444, 0x3b82f6, 0xf59e0b][i % 4],
          { roughness: 0.65 }
        )
      );
      g.position.set(
        x - 0.5 + (i % 3) * 0.5,
        0.85 + Math.floor(i / 3) * 0.15,
        z - 0.25 + (i % 2) * 0.4
      );
      this.buildings.add(g);
    }
  }

  addPetrol(x, z, side) {
    const canopy = new THREE.Mesh(
      new THREE.BoxGeometry(3.2, 0.12, 2.2),
      this.mat(0xdc2626, { roughness: 0.5 })
    );
    canopy.position.set(x, 2.4, z);
    this.buildings.add(canopy);

    const trim = new THREE.Mesh(
      new THREE.BoxGeometry(3.35, 0.12, 0.25),
      this.mat(0xf8fafc, { roughness: 0.38 })
    );
    trim.position.set(x, 2.31, z + 0.82);
    this.buildings.add(trim);

    for (const dx of [-1.2, 1.2]) {
      const p = new THREE.Mesh(
        new THREE.CylinderGeometry(0.12, 0.12, 2.4, 8),
        this.mat(0xf8fafc, {
          roughness: 0.4,
          metalness: 0.3
        })
      );
      p.position.set(x + dx, 1.2, z);
      this.buildings.add(p);
    }

    for (const dx of [-0.6, 0.6]) {
      const pump = new THREE.Mesh(
        new THREE.BoxGeometry(0.44, 1.18, 0.38),
        this.mat(0x1e293b, { roughness: 0.6 })
      );
      pump.position.set(x + dx, 0.59, z + 0.5);
      this.buildings.add(pump);
    }

    const sign = new THREE.Mesh(
      new THREE.BoxGeometry(1.3, 0.58, 0.12),
      this.mat(0xfbbf24, {
        roughness: 0.4,
        emissive: 0xb45309,
        emissiveIntensity: 0.2
      })
    );
    sign.position.set(x, 2.75, z);
    this.buildings.add(sign);
  }

  addBusStop(x, z, side) {
    const roof = new THREE.Mesh(
      new THREE.BoxGeometry(2.0, 0.08, 1.2),
      this.mat(0x334155, { roughness: 0.7 })
    );
    roof.position.set(x, 2.0, z);
    this.buildings.add(roof);

    const back = new THREE.Mesh(
      new THREE.BoxGeometry(2.0, 1.4, 0.08),
      this.mat(0x475569, { roughness: 0.8 })
    );
    back.position.set(x, 1.2, z - side * 0.5);
    this.buildings.add(back);

    const bench = new THREE.Mesh(
      new THREE.BoxGeometry(1.6, 0.12, 0.4),
      this.mat(0x78716c, { roughness: 0.85 })
    );
    bench.position.set(x, 0.5, z);
    this.buildings.add(bench);

    const sign = new THREE.Mesh(
      new THREE.BoxGeometry(0.12, 1.25, 0.12),
      this.mat(0x64748b, {
        roughness: 0.65,
        metalness: 0.35
      })
    );
    sign.position.set(x + side * 0.9, 0.88, z);
    this.buildings.add(sign);

    const plate = new THREE.Mesh(
      new THREE.BoxGeometry(0.6, 0.32, 0.08),
      this.mat(0x2563eb, {
        roughness: 0.55,
        emissive: 0x1d4ed8,
        emissiveIntensity: 0.1
      })
    );
    plate.position.set(x + side * 0.9, 1.45, z);
    this.buildings.add(plate);
  }

  addStreetLight(x, z) {
    const pole = new THREE.Mesh(
      new THREE.CylinderGeometry(0.05, 0.065, 3.2, 7),
      this.mat(0x64748b, {
        roughness: 0.6,
        metalness: 0.4
      })
    );
    pole.position.set(x, 1.6, z);
    this.buildings.add(pole);

    const arm = new THREE.Mesh(
      new THREE.BoxGeometry(0.36, 0.05, 0.05),
      this.mat(0x64748b, {
        roughness: 0.6,
        metalness: 0.4
      })
    );
    arm.position.set(x + (x < 0 ? 0.16 : -0.16), 3.08, z);
    this.buildings.add(arm);

    const lamp = new THREE.Mesh(
      new THREE.SphereGeometry(0.18, 8, 8),
      this.mat(0xfde047, {
        emissive: 0xfbbf24,
        emissiveIntensity: 0.6,
        roughness: 0.3
      })
    );
    lamp.position.set(x, 3.12, z);
    this.buildings.add(lamp);
  }

  addBillboard(x, z) {
    const pole = new THREE.Mesh(
      new THREE.BoxGeometry(0.1, 2.5, 0.1),
      this.mat(0x475569, { roughness: 0.7 })
    );
    pole.position.set(x, 1.25, z);
    this.buildings.add(pole);

    const col = Math.abs(z) % 12 < 6 ? 0xe11d48 : 0x2563eb;

    const board = new THREE.Mesh(
      new THREE.BoxGeometry(2.2, 1.1, 0.08),
      this.mat(col, {
        roughness: 0.5,
        emissive: col,
        emissiveIntensity: 0.12
      })
    );
    board.position.set(x, 2.9, z);
    this.buildings.add(board);

    const inset = new THREE.Mesh(
      new THREE.BoxGeometry(1.65, 0.42, 0.05),
      this.mat(0xf8fafc, { roughness: 0.55 })
    );
    inset.position.set(
      x,
      2.95,
      z + (x < 0 ? 0.06 : -0.06)
    );
    this.buildings.add(inset);
  }

  addTree(x, z, scale = 1) {
    const trunk = new THREE.Mesh(
      new THREE.CylinderGeometry(0.12, 0.16, 1.7 * scale, 8),
      this.mat(0x6b4f36, { roughness: 0.95 })
    );
    trunk.position.set(x, 0.85 * scale, z);
    this.buildings.add(trunk);

    const crown = new THREE.Mesh(
      new THREE.SphereGeometry(0.7 * scale, 10, 8),
      this.mat(0x3f7d3b, { roughness: 0.88 })
    );
    crown.scale.y = 1.15;
    crown.position.set(x, 1.95 * scale, z);
    this.buildings.add(crown);
  }

  addPedestrian(x, z) {
    const shirtColors = [
      0x2563eb,
      0xec4899,
      0x16a34a,
      0xeab308,
      0x7c3aed,
      0xf8fafc
    ];
    const shirt =
      shirtColors[Math.floor(Math.random() * shirtColors.length)];

    const skinColors = [
      0x7a4b2e,
      0x5a3524,
      0x8b5a3c
    ];
    const skin =
      skinColors[Math.floor(Math.random() * skinColors.length)];

    const body = new THREE.Mesh(
      new THREE.BoxGeometry(0.28, 0.52, 0.2),
      this.mat(shirt, { roughness: 0.82 })
    );
    body.position.set(x, 0.86, z);
    this.buildings.add(body);

    const head = new THREE.Mesh(
      new THREE.SphereGeometry(0.14, 8, 8),
      this.mat(skin, { roughness: 0.72 })
    );
    head.position.set(x, 1.27, z);
    this.buildings.add(head);

    for (const dx of [-0.07, 0.07]) {
      const leg = new THREE.Mesh(
        new THREE.BoxGeometry(0.1, 0.45, 0.1),
        this.mat(0x1e293b, { roughness: 0.9 })
      );
      leg.position.set(x + dx, 0.35, z);
      this.buildings.add(leg);
    }
  }

  makeKeke(bodyColor = 0xfbbf24, isPlayer = false) {
    const g = new THREE.Group();

    const bodyM = this.mat(bodyColor, {
      roughness: 0.43,
      metalness: 0.22
    });

    const dark = this.mat(0x172033, {
      roughness: 0.74
    });

    const roofM = this.mat(
      isPlayer ? 0xfde047 : 0xeab308,
      {
        roughness: 0.4,
        metalness: 0.08
      }
    );

    const chrome = this.mat(0xb8c4d1, {
      roughness: 0.28,
      metalness: 0.72
    });

    const tire = this.mat(0x080d17, {
      roughness: 0.97
    });

    const glass = this.mat(0x234a69, {
      roughness: 0.16,
      metalness: 0.35,
      emissive: 0x071421,
      emissiveIntensity: 0.08
    });

    const body = new THREE.Mesh(
      new THREE.BoxGeometry(1.24, 0.52, 1.38),
      bodyM
    );
    body.position.set(0, 0.56, -0.08);
    g.add(body);

    const lower = new THREE.Mesh(
      new THREE.BoxGeometry(1.34, 0.2, 1.45),
      dark
    );
    lower.position.set(0, 0.32, -0.04);
    g.add(lower);

    const stripe = new THREE.Mesh(
      new THREE.BoxGeometry(1.25, 0.08, 1.4),
      this.mat(0xca8a04, { roughness: 0.52 })
    );
    stripe.position.set(0, 0.4, -0.08);
    g.add(stripe);

    const rearSeat = new THREE.Mesh(
      new THREE.BoxGeometry(1.05, 0.18, 0.52),
      this.mat(0x5d392a, { roughness: 0.82 })
    );
    rearSeat.position.set(0, 0.76, -0.48);
    g.add(rearSeat);

    const backrest = new THREE.Mesh(
      new THREE.BoxGeometry(1.06, 0.38, 0.12),
      this.mat(0x5d392a, { roughness: 0.82 })
    );
    backrest.position.set(0, 0.97, -0.68);
    g.add(backrest);

    const canopy = new THREE.Mesh(
      new THREE.BoxGeometry(1.38, 0.11, 1.28),
      roofM
    );
    canopy.position.set(0, 1.25, -0.08);
    g.add(canopy);

    for (const x of [-0.58, 0.58]) {
      for (const z of [-0.5, 0.48]) {
        const p = new THREE.Mesh(
          new THREE.CylinderGeometry(0.035, 0.045, 0.62, 8),
          dark
        );
        p.position.set(x, 0.99, z);
        g.add(p);
      }
    }

    const wind = new THREE.Mesh(
      new THREE.BoxGeometry(1.04, 0.39, 0.06),
      glass
    );
    wind.position.set(0, 0.98, 0.6);
    g.add(wind);

    const frontFrame = new THREE.Mesh(
      new THREE.BoxGeometry(1.14, 0.08, 0.08),
      dark
    );
    frontFrame.position.set(0, 1.2, 0.61);
    g.add(frontFrame);

    const nose = new THREE.Mesh(
      new THREE.BoxGeometry(1.0, 0.4, 0.36),
      dark
    );
    nose.position.set(0, 0.58, 0.75);
    g.add(nose);

    const bumper = new THREE.Mesh(
      new THREE.BoxGeometry(1.02, 0.08, 0.14),
      chrome
    );
    bumper.position.set(0, 0.36, 0.98);
    g.add(bumper);

    const lightM = this.mat(0xfde047, {
      roughness: 0.3,
      emissive: 0xfbbf24,
      emissiveIntensity: isPlayer ? 0.95 : 0.45
    });

    for (const x of [-0.32, 0.32]) {
      const hl = new THREE.Mesh(
        new THREE.SphereGeometry(0.095, 10, 10),
        lightM
      );
      hl.position.set(x, 0.6, 0.95);
      g.add(hl);
    }

    const tailM = this.mat(0xef4444, {
      roughness: 0.4,
      emissive: 0x7f1d1d,
      emissiveIntensity: 0.45
    });

    for (const x of [-0.34, 0.34]) {
      const tl = new THREE.Mesh(
        new THREE.BoxGeometry(0.16, 0.12, 0.05),
        tailM
      );
      tl.position.set(x, 0.54, -0.78);
      g.add(tl);
    }

    const bar = new THREE.Mesh(
      new THREE.CylinderGeometry(0.03, 0.03, 0.72, 8),
      chrome
    );
    bar.rotation.z = Math.PI / 2;
    bar.position.set(0, 0.89, 0.7);
    g.add(bar);

    for (const side of [-1, 1]) {
      const mirrorStem = new THREE.Mesh(
        new THREE.BoxGeometry(0.05, 0.05, 0.25),
        chrome
      );
      mirrorStem.position.set(side * 0.54, 1.12, 0.55);
      mirrorStem.rotation.y = side * 0.28;
      g.add(mirrorStem);

      const mirror = new THREE.Mesh(
        new THREE.BoxGeometry(0.18, 0.13, 0.05),
        dark
      );
      mirror.position.set(side * 0.64, 1.18, 0.45);
      g.add(mirror);
    }

    const plate = new THREE.Mesh(
      new THREE.BoxGeometry(0.45, 0.14, 0.04),
      this.mat(0xf8fafc, { roughness: 0.62 })
    );
    plate.position.set(0, 0.36, 1.05);
    g.add(plate);

    const mkWheel = (x, z, r = 0.24) => {
      const w = new THREE.Mesh(
        new THREE.CylinderGeometry(r, r, 0.16, 14),
        tire
      );
      w.rotation.z = Math.PI / 2;
      w.position.set(x, r, z);
      g.add(w);

      const hub = new THREE.Mesh(
        new THREE.CylinderGeometry(r * 0.35, r * 0.35, 0.18, 10),
        chrome
      );
      hub.rotation.z = Math.PI / 2;
      hub.position.set(x, r, z);
      g.add(hub);
    };

    mkWheel(-0.58, -0.52, 0.245);
    mkWheel(0.58, -0.52, 0.245);
    mkWheel(0, 0.82, 0.225);

    const fork = new THREE.Mesh(
      new THREE.BoxGeometry(0.08, 0.4, 0.08),
      chrome
    );
    fork.position.set(0, 0.45, 0.8);
    fork.rotation.x = -0.16;
    g.add(fork);

    g.userData.kind = 'keke';
    g.userData.recolor = [body];

    return g;
  }

  makeCar(color = 0xdc2626) {
    const g = new THREE.Group();

    const bodyM = this.mat(color, {
      roughness: 0.38,
      metalness: 0.32
    });

    const dark = this.mat(0x0f172a, {
      roughness: 0.86
    });

    const glass = this.mat(0x24415f, {
      roughness: 0.14,
      metalness: 0.42
    });

    const body = new THREE.Mesh(
      new THREE.BoxGeometry(1.38, 0.38, 2.35),
      bodyM
    );
    body.position.y = 0.43;
    g.add(body);

    const lower = new THREE.Mesh(
      new THREE.BoxGeometry(1.46, 0.18, 2.1),
      dark
    );
    lower.position.y = 0.3;
    g.add(lower);

    const cabin = new THREE.Mesh(
      new THREE.BoxGeometry(1.2, 0.44, 1.18),
      bodyM
    );
    cabin.position.set(0, 0.78, -0.15);
    g.add(cabin);

    const win = new THREE.Mesh(
      new THREE.BoxGeometry(1.1, 0.29, 1.0),
      glass
    );
    win.position.set(0, 0.84, -0.14);
    g.add(win);

    const hood = new THREE.Mesh(
      new THREE.BoxGeometry(1.26, 0.13, 0.56),
      bodyM
    );
    hood.position.set(0, 0.56, 0.86);
    g.add(hood);

    const bumper = new THREE.Mesh(
      new THREE.BoxGeometry(1.18, 0.08, 0.13),
      this.mat(0x8a98a8, {
        roughness: 0.3,
        metalness: 0.7
      })
    );
    bumper.position.set(0, 0.33, 1.2);
    g.add(bumper);

    const lm = this.mat(0xfde047, {
      emissive: 0xfbbf24,
      emissiveIntensity: 0.55,
      roughness: 0.3
    });

    for (const x of [-0.4, 0.4]) {
      const hl = new THREE.Mesh(
        new THREE.BoxGeometry(0.18, 0.1, 0.07),
        lm
      );
      hl.position.set(x, 0.44, 1.18);
      g.add(hl);
    }

    for (const [x, z] of [
      [-0.56, 0.8],
      [0.56, 0.8],
      [-0.56, -0.78],
      [0.56, -0.78]
    ]) {
      const w = new THREE.Mesh(
        new THREE.CylinderGeometry(0.225, 0.225, 0.15, 12),
        dark
      );
      w.rotation.z = Math.PI / 2;
      w.position.set(x, 0.225, z);
      g.add(w);

      const hub = new THREE.Mesh(
        new THREE.CylinderGeometry(0.07, 0.07, 0.17, 10),
        this.mat(0x94a3b8, {
          roughness: 0.32,
          metalness: 0.65
        })
      );
      hub.rotation.z = Math.PI / 2;
      hub.position.set(x, 0.225, z);
      g.add(hub);
    }

    g.userData.kind = 'car';
    g.userData.recolor = [body, cabin, hood];

    return g;
  }

  makeTaxi() {
    const g = this.makeCar(0xf8fafc);

    const stripe = new THREE.Mesh(
      new THREE.BoxGeometry(1.41, 0.08, 1.7),
      this.mat(0x16a34a, { roughness: 0.65 })
    );
    stripe.position.set(0, 0.55, -0.05);
    g.add(stripe);

    const roof = new THREE.Mesh(
      new THREE.BoxGeometry(0.52, 0.14, 0.3),
      this.mat(0x22c55e, {
        emissive: 0x14532d,
        emissiveIntensity: 0.18,
        roughness: 0.6
      })
    );
    roof.position.set(0, 1.1, -0.18);
    g.add(roof);

    g.userData.kind = 'taxi';
    return g;
  }

  makeBus() {
    const g = new THREE.Group();

    const body = this.mat(0x0f766e, {
      roughness: 0.55,
      metalness: 0.16
    });

    const lower = this.mat(0x164e63, {
      roughness: 0.82
    });

    const glass = this.mat(0x1e3a5f, {
      roughness: 0.18,
      metalness: 0.35
    });

    const shell = new THREE.Mesh(
      new THREE.BoxGeometry(1.72, 1.12, 3.0),
      body
    );
    shell.position.y = 0.72;
    g.add(shell);

    const base = new THREE.Mesh(
      new THREE.BoxGeometry(1.8, 0.2, 2.9),
      lower
    );
    base.position.y = 0.22;
    g.add(base);

    for (const z of [-0.75, 0.05, 0.85]) {
      const win = new THREE.Mesh(
        new THREE.BoxGeometry(1.52, 0.32, 0.08),
        glass
      );
      win.position.set(0, 0.98, z);
      g.add(win);
    }

    for (const x of [-0.62, 0.62]) {
      const lamp = new THREE.Mesh(
        new THREE.BoxGeometry(0.22, 0.11, 0.06),
        this.mat(0xfde047, {
          emissive: 0xfbbf24,
          emissiveIntensity: 0.5
        })
      );
      lamp.position.set(x, 0.56, 1.52);
      g.add(lamp);
    }

    for (const [x, z] of [
      [-0.68, 1],
      [0.68, 1],
      [-0.68, -1],
      [0.68, -1]
    ]) {
      const w = new THREE.Mesh(
        new THREE.CylinderGeometry(0.25, 0.25, 0.16, 12),
        this.mat(0x0b1220, { roughness: 0.96 })
      );
      w.rotation.z = Math.PI / 2;
      w.position.set(x, 0.24, z);
      g.add(w);
    }

    g.userData.kind = 'bus';

    return g;
  }

  makeMotorcycle() {
    const g = new THREE.Group();

    const dark = this.mat(0x111827, {
      roughness: 0.9
    });

    const body = this.mat(0xef4444, {
      roughness: 0.5,
      metalness: 0.18
    });

    const chrome = this.mat(0xadb8c3, {
      roughness: 0.28,
      metalness: 0.7
    });

    for (const z of [-0.48, 0.52]) {
      const wheel = new THREE.Mesh(
        new THREE.CylinderGeometry(0.19, 0.19, 0.11, 12),
        dark
      );
      wheel.rotation.z = Math.PI / 2;
      wheel.position.set(0, 0.2, z);
      g.add(wheel);
    }

    const frame = new THREE.Mesh(
      new THREE.BoxGeometry(0.12, 0.12, 1.15),
      chrome
    );
    frame.position.set(0, 0.37, 0.02);
    g.add(frame);

    const tank = new THREE.Mesh(
      new THREE.SphereGeometry(0.26, 12, 8),
      body
    );
    tank.scale.set(0.72, 0.7, 1.15);
    tank.position.set(0, 0.54, 0.02);
    g.add(tank);

    const seat = new THREE.Mesh(
      new THREE.BoxGeometry(0.32, 0.09, 0.45),
      dark
    );
    seat.position.set(0, 0.65, -0.36);
    g.add(seat);

    const bar = new THREE.Mesh(
      new THREE.CylinderGeometry(0.025, 0.025, 0.5, 8),
      chrome
    );
    bar.rotation.z = Math.PI / 2;
    bar.position.set(0, 0.76, 0.55);
    g.add(bar);

    const headlight = new THREE.Mesh(
      new THREE.SphereGeometry(0.1, 8, 8),
      this.mat(0xfef08a, {
        emissive: 0xfbbf24,
        emissiveIntensity: 0.7
      })
    );
    headlight.position.set(0, 0.55, 0.61);
    g.add(headlight);

    g.userData.kind = 'motorcycle';

    return g;
  }

  makeTruck() {
    const g = new THREE.Group();

    const cab = this.mat(0xb91c1c, {
      roughness: 0.55,
      metalness: 0.18
    });

    const cargo = this.mat(0xd6d3d1, {
      roughness: 0.75
    });

    const dark = this.mat(0x111827, {
      roughness: 0.92
    });

    const glass = this.mat(0x24415f, {
      roughness: 0.18,
      metalness: 0.35
    });

    const cargoBox = new THREE.Mesh(
      new THREE.BoxGeometry(1.9, 1.55, 1.85),
      cargo
    );
    cargoBox.position.set(0, 1.0, -0.55);
    g.add(cargoBox);

    const cabBox = new THREE.Mesh(
      new THREE.BoxGeometry(1.9, 1.15, 0.95),
      cab
    );
    cabBox.position.set(0, 0.78, 0.86);
    g.add(cabBox);

    const wind = new THREE.Mesh(
      new THREE.BoxGeometry(1.45, 0.33, 0.06),
      glass
    );
    wind.position.set(0, 1.02, 1.36);
    g.add(wind);

    for (const z of [-0.92, 0.7]) {
      for (const x of [-0.72, 0.72]) {
        const w = new THREE.Mesh(
          new THREE.CylinderGeometry(0.26, 0.26, 0.16, 12),
          dark
        );
        w.rotation.z = Math.PI / 2;
        w.position.set(x, 0.27, z);
        g.add(w);
      }
    }

    g.userData.kind = 'truck';

    return g;
  }

  makeEnforcer(kind = 'police') {
    const color =
      kind === 'karota'
        ? 0xf59e0b
        : 0x1e40af;

    const g = this.makeCar(color);

    const bar = new THREE.Mesh(
      new THREE.BoxGeometry(0.72, 0.12, 0.25),
      this.mat(0x1e293b, { roughness: 0.5 })
    );
    bar.position.set(0, 1.06, -0.1);
    g.add(bar);

    const red = new THREE.Mesh(
      new THREE.BoxGeometry(0.28, 0.1, 0.2),
      this.mat(0xef4444, {
        emissive: 0xef4444,
        emissiveIntensity: 0.7
      })
    );
    red.position.set(-0.2, 1.06, -0.1);
    g.add(red);

    const blue = new THREE.Mesh(
      new THREE.BoxGeometry(0.28, 0.1, 0.2),
      this.mat(0x3b82f6, {
        emissive: 0x3b82f6,
        emissiveIntensity: 0.7
      })
    );
    blue.position.set(0.2, 1.06, -0.1);
    g.add(blue);

    if (kind === 'karota') {
      const stripe = new THREE.Mesh(
        new THREE.BoxGeometry(1.48, 0.1, 0.42),
        this.mat(0x111827, { roughness: 0.7 })
      );
      stripe.position.set(0, 0.56, -0.1);
      g.add(stripe);
    }

    g.userData.kind = kind;

    return g;
  }

  makeVehicle(type = 'car', color = 0x64748b) {
    switch (type) {
      case 'keke':
        return this.makeKeke(color, false);
      case 'taxi':
        return this.makeTaxi();
      case 'bus':
        return this.makeBus();
      case 'motorcycle':
        return this.makeMotorcycle();
      case 'truck':
        return this.makeTruck();
      case 'police':
        return this.makeEnforcer('police');
      case 'karota':
        return this.makeEnforcer('karota');
      default:
        return this.makeCar(color);
    }
  }

  makeZone(color) {
    const g = new THREE.Group();

    const ring = new THREE.Mesh(
      new THREE.RingGeometry(0.55, 0.78, 28),
      new THREE.MeshBasicMaterial({
        color,
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 0.9
      })
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.06;
    g.add(ring);

    const disc = new THREE.Mesh(
      new THREE.CircleGeometry(0.5, 24),
      new THREE.MeshBasicMaterial({
        color,
        transparent: true,
        opacity: 0.22,
        side: THREE.DoubleSide
      })
    );
    disc.rotation.x = -Math.PI / 2;
    disc.position.y = 0.05;
    g.add(disc);

    return g;
  }

  makeCoin() {
    const mesh = new THREE.Mesh(
      new THREE.CylinderGeometry(0.3, 0.3, 0.07, 18),
      this.mat(0xfbbf24, {
        metalness: 0.75,
        roughness: 0.22,
        emissive: 0xb45309,
        emissiveIntensity: 0.3
      })
    );
    mesh.rotation.x = Math.PI / 2;
    return mesh;
  }

  styleVehicle(mesh, type) {
    const wanted = type || 'car';
    const current = mesh.userData.currentType || 'car';

    if (current !== wanted) {
      mesh.clear();

      const rebuilt = this.makeVehicle(
        wanted,
        0x64748b
      );

      while (rebuilt.children.length) {
        mesh.add(rebuilt.children.shift());
      }

      mesh.userData.currentType = wanted;
      mesh.userData.kind = rebuilt.userData.kind;
      mesh.scale.set(1, 1, 1);
    }

    if (wanted === 'keke') {
      mesh.scale.set(0.95, 0.95, 0.82);
    } else if (wanted === 'bus') {
      mesh.scale.set(1.05, 1.05, 1.08);
    } else if (wanted === 'truck') {
      mesh.scale.set(1.0, 1.0, 1.08);
    } else if (wanted === 'motorcycle') {
      mesh.scale.set(0.95, 0.95, 0.95);
    } else if (wanted === 'police' || wanted === 'karota') {
      mesh.scale.set(1.03, 1.03, 1.03);
    } else {
      mesh.scale.set(1, 1, 1);
    }

    const colors = {
      keke: 0xeab308,
      car: 0xdc2626,
      taxi: 0xf8fafc,
      bus: 0x0f766e,
      motorcycle: 0xef4444,
      truck: 0xb91c1c,
      police: 0x1e40af,
      karota: 0xf59e0b
    };

    const col = colors[wanted] ?? colors.car;

    mesh.traverse((ch) => {
      if (!ch.isMesh || !ch.material?.color) return;
      if (ch.userData?.preserveColor) return;

      const p = ch.geometry?.parameters;

      if (
        wanted === 'taxi' &&
        p?.width > 1.2 &&
        p?.height < 0.7
      ) {
        ch.material.color.setHex(0xf8fafc);
      }

      if (
        wanted === 'keke' &&
        p?.width >= 1.0 &&
        p?.height >= 0.35
      ) {
        ch.material.color.setHex(col);
      }

      if (
        wanted === 'car' &&
        p?.width >= 1.1 &&
        p?.height >= 0.35 &&
        p?.height <= 0.6
      ) {
        ch.material.color.setHex(col);
      }
    });
  }

  screenYToZ(y, playerY) {
    const t =
      (playerY - y) /
      Math.max(playerY, 1);

    return PLAYER_Z + t * 58;
  }

  laneToX(lane) {
    return LANE_X[
      Math.max(
        0,
        Math.min(2, Math.round(lane))
      )
    ];
  }

  applyPaint(paintId) {
    const colors = {
      classic: 0xfbbf24,
      ruffneck: 0xeab308,
      sky: 0x38bdf8,
      forest: 0x22c55e,
      royal: 0xa855f7,
      ember: 0xef4444,
      night: 0x1e293b
    };

    const col = colors[paintId] || 0xfbbf24;

    if (!this.player) return;

    this.player.traverse((ch) => {
      if (
        ch.isMesh &&
        ch.material &&
        ch.material.color &&
        ch.geometry?.type === 'BoxGeometry'
      ) {
        const p = ch.geometry.parameters;

        if (
          p &&
          p.width >= 1.0 &&
          p.height >= 0.4 &&
          p.height <= 0.65
        ) {
          ch.material.color.setHex(col);
        }
      }
    });
  }

  applyQuality(low) {
    if (!this.renderer) return;

    this.renderer.setPixelRatio(
      low
        ? 1
        : Math.min(
            window.devicePixelRatio || 1,
            1.75
          )
    );

    this.renderer.setSize(
      this.canvas.clientWidth || 390,
      this.canvas.clientHeight || 700,
      false
    );

    if (this.rain) {
      this.rain.visible = !low;
    }

    if (this.dust && low) {
      this.dustMat.opacity =
        Math.min(
          this.dustMat.opacity,
          0.15
        );
    }
  }

  resize() {
    const w =
      this.canvas.clientWidth || 390;

    const h =
      this.canvas.clientHeight || 700;

    this.camera.aspect =
      w / h;

    this.camera.updateProjectionMatrix();

    this.renderer.setPixelRatio(
      Math.min(
        window.devicePixelRatio || 1,
        1.75
      )
    );

    this.renderer.setSize(
      w,
      h,
      false
    );
  }

  draw() {
    this.render();
  }

  render() {
    if (!this.ready) return;

    const g = this.game;

    const tod =
      typeof g.getTimeOfDay === 'function'
        ? g.getTimeOfDay()
        : 0.2;

    const spd =
      g.speed || 3;

    // Day / dusk / night
    if (tod > 0.62) {
      this.renderer.setClearColor(
        0x020617,
        1
      );

      this.scene.fog.color.setHex(
        0x020617
      );

      this.scene.fog.near = 22;
      this.scene.fog.far = 75;

      this.sun.intensity = 0.18;
      this.hemlight.intensity = 0.12;

      if (this.sky) {
        this.sky.material.color.setHex(
          0x020617
        );
      }
    } else if (tod > 0.42) {
      this.renderer.setClearColor(
        0x7c3aed,
        1
      );

      this.scene.fog.color.setHex(
        0x4c1d95
      );

      this.scene.fog.near = 28;
      this.scene.fog.far = 90;

      this.sun.intensity = 0.45;
      this.hemlight.intensity = 0.25;

      if (this.sky) {
        this.sky.material.color.setHex(
          0x5b21b6
        );
      }
    } else if (tod > 0.28) {
      this.renderer.setClearColor(
        0x38bdf8,
        1
      );

      this.scene.fog.color.setHex(
        0x7dd3fc
      );

      this.scene.fog.near = 35;
      this.scene.fog.far = 100;

      this.sun.intensity = 1.05;
      this.hemlight.intensity = 0.4;

      if (this.sky) {
        this.sky.material.color.setHex(
          0x38bdf8
        );
      }
    } else {
      this.renderer.setClearColor(
        0x7dd3fc,
        1
      );

      this.scene.fog.color.setHex(
        0xbae6fd
      );

      this.scene.fog.near = 40;
      this.scene.fog.far = 110;

      this.sun.intensity = 1.2;
      this.hemlight.intensity = 0.5;

      if (this.sky) {
        this.sky.material.color.setHex(
          0x7dd3fc
        );
      }
    }

    // Weather cycle
    if (
      (g.frame || 0) % 900 === 0 &&
      g.state === 1
    ) {
      const r = Math.random();

      this.weather =
        r < 0.55
          ? 'clear'
          : r < 0.8
            ? 'harmattan'
            : 'rain';

      if (this.weather === 'rain') {
        this.uiWeatherToast?.(
          '🌧️ Rain in Kano'
        );
      }

      if (this.weather === 'harmattan') {
        this.uiWeatherToast?.(
          '🏜️ Harmattan haze'
        );
      }
    }

    if (this.weather === 'rain') {
      this.rainMat.opacity = 0.55;
      this.dustMat.opacity = 0.08;

      this.scene.fog.near =
        Math.min(
          this.scene.fog.near,
          25
        );

      this.sun.intensity *= 0.6;
    } else if (
      this.weather === 'harmattan'
    ) {
      this.rainMat.opacity = 0;
      this.dustMat.opacity = 0.55;

      this.dustMat.color.setHex(
        0xd4c4a8
      );

      this.scene.fog.color.lerp(
        new THREE.Color(0xc4b5a0),
        0.35
      );

      this.sun.intensity *= 0.75;
    } else {
      this.rainMat.opacity = 0;

      this.dustMat.opacity =
        0.2 +
        Math.min(
          0.25,
          spd * 0.03
        );

      this.dustMat.color.setHex(
        0xc4b5a0
      );
    }

    // Animate dust
    if (this.dust) {
      const pos =
        this.dust.geometry
          .attributes
          .position.array;

      for (
        let i = 0;
        i < pos.length;
        i += 3
      ) {
        pos[i + 2] -=
          spd * 0.08;

        if (pos[i + 2] < 1) {
          pos[i] =
            (Math.random() - 0.5) * 8;

          pos[i + 1] =
            Math.random() * 1.2;

          pos[i + 2] =
            35 + Math.random() * 15;
        }
      }

      this.dust.geometry
        .attributes
        .position
        .needsUpdate = true;
    }

    // Animate rain
    if (
      this.rain &&
      this.rainMat.opacity > 0.05
    ) {
      const pos =
        this.rain.geometry
          .attributes
          .position.array;

      for (
        let i = 0;
        i < pos.length;
        i += 3
      ) {
        pos[i + 1] -= 0.45;
        pos[i + 2] -=
          spd * 0.05;

        if (pos[i + 1] < 0) {
          pos[i] =
            (Math.random() - 0.5) * 14;

          pos[i + 1] =
            8 + Math.random() * 6;

          pos[i + 2] =
            Math.random() * 45;
        }
      }

      this.rain.geometry
        .attributes
        .position
        .needsUpdate = true;
    }

    if (this.laneMarks) {
      this.laneMarks.position.z =
        -((g.roadOff || 0) * 0.08) %
        3.2;
    }

    if (this.buildings) {
      this.buildings.position.z =
        -((g.roadOff || 0) * 0.04) %
        6.2;
    }

    // Player keke
    if (this.player) {
      const tx =
        this.laneToX(
          g.playerLane
        );

      this.player.position.x +=
        (tx -
          this.player.position.x) *
        0.22;

      this.player.position.z =
        PLAYER_Z;

      this.player.position.y =
        g.bounce > 0
          ? Math.sin(
              g.bounce * 0.9
            ) * 0.1
          : 0;

      this.player.rotation.y =
        (tx -
          this.player.position.x) *
        0.1;

      this.player.rotation.z =
        (this.player.position.x -
          tx) *
        0.06;

      if (this.playerShadow) {
        this.playerShadow.position.x =
          this.player.position.x;

        this.playerShadow.position.z =
          this.player.position.z;

        this.playerShadow.scale.setScalar(
          0.9 +
            Math.abs(
              this.player.position.y
            ) *
              2
        );
      }
    }

    // Camera
    let sx = 0;
    let sy = 0;

    if (g.shake > 0) {
      sx =
        (Math.random() - 0.5) *
        (g.shakeMag || 4) *
        0.03;

      sy =
        (Math.random() - 0.5) *
        (g.shakeMag || 4) *
        0.02;
    }

    const px =
      this.player
        ? this.player.position.x
        : 0;

    const targetFov =
      50 +
      Math.min(
        8,
        Math.max(
          0,
          spd - 4
        ) * 1.5
      );

    this.camera.fov +=
      (targetFov -
        this.camera.fov) *
      0.05;

    this.camera.updateProjectionMatrix();

    this.camera.position.x =
      px * 0.4 + sx;

    this.camera.position.y =
      6.2 + sy;

    this.camera.position.z =
      -3.5;

    this.camera.lookAt(
      px * 0.25,
      0.9,
      16
    );

    // Traffic
    const py =
      g.playerY || 500;

    let vi = 0;

    for (const o of g.obs || []) {
      if (
        vi >=
        this.vehiclePool.length
      ) {
        break;
      }

      const mesh =
        this.vehiclePool[vi++];

      mesh.visible = true;

      mesh.position.x =
        this.laneToX(o.lane);

      mesh.position.z =
        this.screenYToZ(
          o.y,
          py
        );

      mesh.position.y = 0;

      this.styleVehicle(
        mesh,
        o.type || 'car'
      );
    }

    while (
      vi <
      this.vehiclePool.length
    ) {
      this.vehiclePool[
        vi++
      ].visible = false;
    }

    // Passenger/drop zones
    let zi = 0;

    const zones = [
      ...(g.paxZones || [])
        .filter(
          (p) => !p.taken
        )
        .map((p) => ({
          ...p,
          kind: 'p'
        })),

      ...(g.dropZones || [])
        .filter(
          (d) => !d.used
        )
        .map((d) => ({
          ...d,
          kind: 'd'
        }))
    ];

    for (const z of zones) {
      if (
        zi >=
        this.zonePool.length
      ) {
        break;
      }

      const mesh =
        this.zonePool[zi++];

      mesh.visible = true;

      mesh.position.x =
        this.laneToX(z.lane);

      mesh.position.z =
        this.screenYToZ(
          z.y,
          py
        );

      const col =
        z.kind === 'd'
          ? 0xfbbf24
          : z.aishat
            ? 0xf472b6
            : z.vip
              ? 0xa78bfa
              : 0x4ade80;

      mesh.children.forEach(
        (ch) => {
          if (ch.material) {
            ch.material.color.setHex(
              col
            );
          }
        }
      );

      const pulse =
        1 +
        Math.sin(
          (g.frame || 0) * 0.12
        ) *
          0.08;

      mesh.scale.set(
        pulse,
        1,
        pulse
      );
    }

    while (
      zi <
      this.zonePool.length
    ) {
      this.zonePool[
        zi++
      ].visible = false;
    }

    // Coins
    let ci = 0;

    for (const c of g.coins || []) {
      if (
        c.taken ||
        ci >=
          this.coinPool.length
      ) {
        continue;
      }

      const mesh =
        this.coinPool[ci++];

      mesh.visible = true;

      mesh.position.x =
        this.laneToX(c.lane);

      mesh.position.z =
        this.screenYToZ(
          c.y,
          py
        );

      mesh.position.y =
        0.55 +
        Math.sin(
          c.bob || 0
        ) *
          0.15;

      mesh.rotation.y +=
        0.1;
    }

    while (
      ci <
      this.coinPool.length
    ) {
      this.coinPool[
        ci++
      ].visible = false;
    }

    this.renderer.render(
      this.scene,
      this.camera
    );
  }
}