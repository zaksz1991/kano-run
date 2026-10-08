// Phase 2 — vehicle quality + clearer player keke
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

    // Higher camera, look slightly down so full keke is visible
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

    // Pool mixed vehicle types
    for (let i = 0; i < 22; i++) {
      const v = this.makeCar(0x64748b);
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

    this.ready = true;
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
      this.mat(0x2a3344, { roughness: 0.95, metalness: 0.05 })
    );
    road.rotation.x = -Math.PI / 2;
    road.position.set(0, 0, ROAD_LEN / 2 - 4);
    this.scene.add(road);

    // shoulders
    for (const sx of [-5.7, 5.7]) {
      const sh = new THREE.Mesh(
        new THREE.PlaneGeometry(2.4, ROAD_LEN),
        this.mat(0x3d4a3a, { roughness: 0.98 })
      );
      sh.rotation.x = -Math.PI / 2;
      sh.position.set(sx, 0.01, ROAD_LEN / 2 - 4);
      this.scene.add(sh);
    }

    const lineMat = new THREE.MeshBasicMaterial({ color: 0xeab308 });
    for (const lx of [-4.5, 4.5]) {
      const line = new THREE.Mesh(new THREE.PlaneGeometry(0.14, ROAD_LEN), lineMat);
      line.rotation.x = -Math.PI / 2;
      line.position.set(lx, 0.02, ROAD_LEN / 2 - 4);
      this.scene.add(line);
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
    const colors = [0x1e293b, 0x273449, 0x334155, 0x3b4a5c, 0x1a2332, 0x445566];
    this.buildings = new THREE.Group();
    for (const side of [-1, 1]) {
      for (let i = 0; i < 18; i++) {
        const bw = 1.5 + Math.random() * 1.8;
        const bh = 2.8 + Math.random() * 8;
        const bd = 1.6 + Math.random() * 2.2;
        const mesh = new THREE.Mesh(
          new THREE.BoxGeometry(bw, bh, bd),
          this.mat(colors[i % colors.length], { roughness: 0.9 })
        );
        mesh.position.set(side * (6.6 + Math.random() * 3.2), bh / 2, i * 6.2 + Math.random());
        this.buildings.add(mesh);

        // window glow strip
        if (bh > 4.5) {
          const win = new THREE.Mesh(
            new THREE.PlaneGeometry(bw * 0.65, bh * 0.45),
            new THREE.MeshBasicMaterial({
              color: 0xfde047,
              transparent: true,
              opacity: 0.12 + Math.random() * 0.12
            })
          );
          win.position.set(mesh.position.x - side * 0.02, bh * 0.5, mesh.position.z);
          this.buildings.add(win);
        }
      }
    }
    this.scene.add(this.buildings);

    this.sky = new THREE.Mesh(
      new THREE.SphereGeometry(95, 16, 12, 0, Math.PI * 2, 0, Math.PI / 2),
      new THREE.MeshBasicMaterial({ color: 0x1a2744, side: THREE.BackSide })
    );
    this.sky.position.y = -2;
    this.scene.add(this.sky);
  }

  /** Recognizable Adaidaita Sahu (3-wheeler) */
  makeKeke(bodyColor = 0xfbbf24, isPlayer = false) {
    const g = new THREE.Group();
    const bodyM = this.mat(bodyColor, { roughness: 0.45, metalness: 0.2 });
    const dark = this.mat(0x1e293b, { roughness: 0.7 });
    const roofM = this.mat(isPlayer ? 0xfde047 : 0xeab308, { roughness: 0.4 });
    const chrome = this.mat(0x94a3b8, { roughness: 0.3, metalness: 0.7 });
    const tire = this.mat(0x0f172a, { roughness: 0.95 });

    // Main cabin body
    const body = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.5, 1.35), bodyM);
    body.position.set(0, 0.55, -0.05);
    g.add(body);

    // Accent stripe
    const stripe = new THREE.Mesh(
      new THREE.BoxGeometry(1.22, 0.08, 1.36),
      this.mat(0xca8a04, { roughness: 0.5 })
    );
    stripe.position.set(0, 0.38, -0.05);
    g.add(stripe);

    // Roof / canopy
    const canopy = new THREE.Mesh(new THREE.BoxGeometry(1.35, 0.1, 1.2), roofM);
    canopy.position.set(0, 1.22, -0.08);
    g.add(canopy);

    // Canopy front lip
    const lip = new THREE.Mesh(new THREE.BoxGeometry(1.35, 0.08, 0.12), roofM);
    lip.position.set(0, 1.15, 0.5);
    g.add(lip);

    // Side pillars
    for (const x of [-0.55, 0.55]) {
      const p = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.55, 0.07), dark);
      p.position.set(x, 0.95, 0.45);
      g.add(p);
      const p2 = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.55, 0.07), dark);
      p2.position.set(x, 0.95, -0.45);
      g.add(p2);
    }

    // Windshield frame
    const wind = new THREE.Mesh(
      new THREE.BoxGeometry(1.05, 0.38, 0.06),
      this.mat(0x38bdf8, { roughness: 0.2, metalness: 0.3 })
    );
    wind.position.set(0, 0.95, 0.58);
    g.add(wind);

    // Front nose / panel
    const nose = new THREE.Mesh(new THREE.BoxGeometry(0.95, 0.38, 0.35), dark);
    nose.position.set(0, 0.58, 0.72);
    g.add(nose);

    // Headlights
    const lightM = this.mat(0xfde047, {
      roughness: 0.3,
      emissive: 0xfbbf24,
      emissiveIntensity: isPlayer ? 0.85 : 0.4
    });
    for (const x of [-0.3, 0.3]) {
      const hl = new THREE.Mesh(new THREE.SphereGeometry(0.09, 10, 10), lightM);
      hl.position.set(x, 0.58, 0.92);
      g.add(hl);
    }

    // Handlebars
    const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.7, 8), chrome);
    bar.rotation.z = Math.PI / 2;
    bar.position.set(0, 0.85, 0.7);
    g.add(bar);

    // Rear passenger bench
    const bench = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.18, 0.45), dark);
    bench.position.set(0, 0.72, -0.45);
    g.add(bench);

    // Number plate
    const plate = new THREE.Mesh(
      new THREE.BoxGeometry(0.45, 0.14, 0.03),
      this.mat(0xf8fafc, { roughness: 0.6 })
    );
    plate.position.set(0, 0.35, 0.9);
    g.add(plate);

    // Wheels: 2 rear + 1 front
    const mkWheel = (x, z, r = 0.24) => {
      const w = new THREE.Mesh(new THREE.CylinderGeometry(r, r, 0.16, 14), tire);
      w.rotation.z = Math.PI / 2;
      w.position.set(x, r, z);
      g.add(w);
      // hub
      const hub = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.35, r * 0.35, 0.18, 10), chrome);
      hub.rotation.z = Math.PI / 2;
      hub.position.set(x, r, z);
      g.add(hub);
      return w;
    };
    mkWheel(-0.58, -0.5, 0.24);
    mkWheel(0.58, -0.5, 0.24);
    mkWheel(0, 0.78, 0.22);

    // Front fork
    const fork = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.4, 0.08), chrome);
    fork.position.set(0, 0.45, 0.78);
    g.add(fork);

    g.userData.kind = 'keke';
    return g;
  }

  /** Better sedan / generic car */
  makeCar(color = 0xdc2626) {
    const g = new THREE.Group();
    const bodyM = this.mat(color, { roughness: 0.4, metalness: 0.3 });
    const dark = this.mat(0x0f172a, { roughness: 0.85 });
    const glass = this.mat(0x1e3a5f, { roughness: 0.15, metalness: 0.4 });

    const body = new THREE.Mesh(new THREE.BoxGeometry(1.35, 0.38, 2.3), bodyM);
    body.position.y = 0.42;
    g.add(body);

    // Cabin
    const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.4, 1.15), bodyM);
    cabin.position.set(0, 0.78, -0.15);
    g.add(cabin);

    // Windows
    const win = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.28, 1.0), glass);
    win.position.set(0, 0.82, -0.12);
    g.add(win);

    // Hood slope hint
    const hood = new THREE.Mesh(new THREE.BoxGeometry(1.25, 0.12, 0.55), bodyM);
    hood.position.set(0, 0.55, 0.85);
    g.add(hood);

    // Lights
    const lm = this.mat(0xfde047, { emissive: 0xfbbf24, emissiveIntensity: 0.5 });
    for (const x of [-0.4, 0.4]) {
      const hl = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.1, 0.06), lm);
      hl.position.set(x, 0.4, 1.18);
      g.add(hl);
    }

    // Wheels
    for (const [x, z] of [[-0.55, 0.75], [0.55, 0.75], [-0.55, -0.75], [0.55, -0.75]]) {
      const w = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 0.14, 12), dark);
      w.rotation.z = Math.PI / 2;
      w.position.set(x, 0.22, z);
      g.add(w);
    }

    g.userData.kind = 'car';
    g.userData.recolor = [body, cabin, hood];
    return g;
  }

  /** Police / KAROTA variant */
  makeEnforcer(kind = 'police') {
    const color = kind === 'karota' ? 0xf59e0b : 0x1e40af;
    const g = this.makeCar(color);
    // Light bar
    const bar = new THREE.Mesh(
      new THREE.BoxGeometry(0.7, 0.12, 0.25),
      this.mat(0x1e293b, { roughness: 0.5 })
    );
    bar.position.set(0, 1.05, -0.1);
    g.add(bar);
    const red = new THREE.Mesh(
      new THREE.BoxGeometry(0.28, 0.1, 0.2),
      this.mat(0xef4444, { emissive: 0xef4444, emissiveIntensity: 0.7 })
    );
    red.position.set(-0.2, 1.05, -0.1);
    g.add(red);
    const blue = new THREE.Mesh(
      new THREE.BoxGeometry(0.28, 0.1, 0.2),
      this.mat(0x3b82f6, { emissive: 0x3b82f6, emissiveIntensity: 0.7 })
    );
    blue.position.set(0.2, 1.05, -0.1);
    g.add(blue);
    g.userData.kind = kind;
    return g;
  }

  makeZone(color) {
    const g = new THREE.Group();
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(0.55, 0.78, 28),
      new THREE.MeshBasicMaterial({ color, side: THREE.DoubleSide, transparent: true, opacity: 0.9 })
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.06;
    g.add(ring);
    const disc = new THREE.Mesh(
      new THREE.CircleGeometry(0.5, 24),
      new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.22, side: THREE.DoubleSide })
    );
    disc.rotation.x = -Math.PI / 2;
    disc.position.y = 0.05;
    g.add(disc);
    return g;
  }

  makeCoin() {
    const mesh = new THREE.Mesh(
      new THREE.CylinderGeometry(0.3, 0.3, 0.07, 18),
      this.mat(0xfbbf24, { metalness: 0.75, roughness: 0.22, emissive: 0xb45309, emissiveIntensity: 0.3 })
    );
    mesh.rotation.x = Math.PI / 2;
    return mesh;
  }

  /** Swap pool mesh to match obstacle type */
  styleVehicle(mesh, type) {
    // Rebuild is expensive — instead hide all children and show prebuilt if we stored variants
    // Simpler: recolor + scale
    const col =
      type === 'karota' ? 0xf59e0b :
      type === 'police' ? 0x1e40af :
      type === 'keke' ? 0xeab308 :
      type === 'car' ? 0xdc2626 : 0x64748b;

    mesh.traverse((ch) => {
      if (ch.isMesh && ch.material && ch.material.color && ch.geometry) {
        const t = ch.geometry.type;
        if (t === 'BoxGeometry') {
          // skip glass-ish (small height windows)
          const p = ch.geometry.parameters;
          if (p && p.height && p.height < 0.3 && p.depth && p.depth < 1.1) return;
          ch.material.color.setHex(col);
        }
      }
    });

    if (type === 'keke') mesh.scale.set(0.9, 0.9, 0.75);
    else if (type === 'police' || type === 'karota') mesh.scale.set(1.05, 1.05, 1.05);
    else mesh.scale.set(1, 1, 1);
  }

  screenYToZ(y, playerY) {
    const t = (playerY - y) / Math.max(playerY, 1);
    return PLAYER_Z + t * 58;
  }

  laneToX(lane) {
    return LANE_X[Math.max(0, Math.min(2, Math.round(lane)))];
  }

  resize() {
    const w = this.canvas.clientWidth || 390;
    const h = this.canvas.clientHeight || 700;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
    this.renderer.setSize(w, h, false);
  }

  draw() {
    this.render();
  }

  render() {
    if (!this.ready) return;
    const g = this.game;
    const tod = typeof g.getTimeOfDay === 'function' ? g.getTimeOfDay() : 0.2;

    if (tod > 0.55) {
      this.renderer.setClearColor(0x020617, 1);
      this.scene.fog.color.setHex(0x020617);
      this.sun.intensity = 0.28;
      if (this.sky) this.sky.material.color.setHex(0x020617);
    } else if (tod > 0.38) {
      this.renderer.setClearColor(0x1e1b4b, 1);
      this.scene.fog.color.setHex(0x312e81);
      this.sun.intensity = 0.55;
      if (this.sky) this.sky.material.color.setHex(0x312e81);
    } else {
      this.renderer.setClearColor(0x38bdf8, 1);
      this.scene.fog.color.setHex(0x7dd3fc);
      this.sun.intensity = 1.1;
      if (this.sky) this.sky.material.color.setHex(0x38bdf8);
    }

    if (this.laneMarks) this.laneMarks.position.z = -((g.roadOff || 0) * 0.08) % 3.2;
    if (this.buildings) this.buildings.position.z = -((g.roadOff || 0) * 0.04) % 6.2;

    // Player keke
    if (this.player) {
      const tx = this.laneToX(g.playerLane);
      this.player.position.x += (tx - this.player.position.x) * 0.22;
      this.player.position.z = PLAYER_Z;
      this.player.position.y = g.bounce > 0 ? Math.sin(g.bounce * 0.9) * 0.1 : 0;
      this.player.rotation.y = (tx - this.player.position.x) * 0.1;
      this.player.rotation.z = (this.player.position.x - tx) * 0.06;
    }

    // Camera follow — framed to show full vehicle
    let sx = 0, sy = 0;
    if (g.shake > 0) {
      sx = (Math.random() - 0.5) * (g.shakeMag || 4) * 0.03;
      sy = (Math.random() - 0.5) * (g.shakeMag || 4) * 0.02;
    }
    const px = this.player ? this.player.position.x : 0;
    this.camera.position.x = px * 0.4 + sx;
    this.camera.position.y = 6.2 + sy;
    this.camera.position.z = -3.5;
    this.camera.lookAt(px * 0.25, 0.9, 16);

    const py = g.playerY || 500;
    let vi = 0;
    for (const o of g.obs || []) {
      if (vi >= this.vehiclePool.length) break;
      const mesh = this.vehiclePool[vi++];
      mesh.visible = true;
      mesh.position.x = this.laneToX(o.lane);
      mesh.position.z = this.screenYToZ(o.y, py);
      mesh.position.y = 0;
      this.styleVehicle(mesh, o.type || 'car');
    }
    while (vi < this.vehiclePool.length) this.vehiclePool[vi++].visible = false;

    let zi = 0;
    const zones = [
      ...(g.paxZones || []).filter((p) => !p.taken).map((p) => ({ ...p, kind: 'p' })),
      ...(g.dropZones || []).filter((d) => !d.used).map((d) => ({ ...d, kind: 'd' }))
    ];
    for (const z of zones) {
      if (zi >= this.zonePool.length) break;
      const mesh = this.zonePool[zi++];
      mesh.visible = true;
      mesh.position.x = this.laneToX(z.lane);
      mesh.position.z = this.screenYToZ(z.y, py);
      const col = z.kind === 'd' ? 0xfbbf24 : z.aishat ? 0xf472b6 : 0x4ade80;
      mesh.children.forEach((ch) => {
        if (ch.material) ch.material.color.setHex(col);
      });
      const pulse = 1 + Math.sin((g.frame || 0) * 0.12) * 0.08;
      mesh.scale.set(pulse, 1, pulse);
    }
    while (zi < this.zonePool.length) this.zonePool[zi++].visible = false;

    let ci = 0;
    for (const c of g.coins || []) {
      if (c.taken || ci >= this.coinPool.length) continue;
      const mesh = this.coinPool[ci++];
      mesh.visible = true;
      mesh.position.x = this.laneToX(c.lane);
      mesh.position.z = this.screenYToZ(c.y, py);
      mesh.position.y = 0.55 + Math.sin(c.bob || 0) * 0.15;
      mesh.rotation.y += 0.1;
    }
    while (ci < this.coinPool.length) this.coinPool[ci++].visible = false;

    this.renderer.render(this.scene, this.camera);
  }
}
