// Phase 1 Three.js renderer
import * as THREE from '../vendor/three.module.js';

const LANE_X = [-2.4, 0, 2.4];
const ROAD_LEN = 120;
const PLAYER_Z = 4;

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
    this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: false, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
    this.renderer.setSize(w, h, false);
    this.renderer.setClearColor(0x0a1020, 1);
    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.Fog(0x0a1020, 28, 95);
    this.camera = new THREE.PerspectiveCamera(55, w / h, 0.1, 150);
    this.camera.position.set(0, 5.2, -2.2);
    this.camera.lookAt(0, 0.5, 22);
    this.scene.add(new THREE.AmbientLight(0x8899bb, 0.55));
    this.sun = new THREE.DirectionalLight(0xffeebb, 1.05);
    this.sun.position.set(8, 18, 6);
    this.scene.add(this.sun);
    this.hemlight = new THREE.HemisphereLight(0x87b5ff, 0x334422, 0.35);
    this.scene.add(this.hemlight);
    this.buildRoad();
    this.buildCityscape();
    this.player = this.makeKeke(0xfbbf24, true);
    this.player.position.set(0, 0, PLAYER_Z);
    this.scene.add(this.player);
    for (let i = 0; i < 20; i++) {
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

  buildRoad() {
    const road = new THREE.Mesh(new THREE.PlaneGeometry(9.5, ROAD_LEN), new THREE.MeshStandardMaterial({ color: 0x2a3344, roughness: 0.92 }));
    road.rotation.x = -Math.PI / 2;
    road.position.set(0, 0, ROAD_LEN / 2 - 4);
    this.scene.add(road);
    const lineMat = new THREE.MeshBasicMaterial({ color: 0xeab308 });
    for (const lx of [-4.5, 4.5]) {
      const line = new THREE.Mesh(new THREE.PlaneGeometry(0.12, ROAD_LEN), lineMat);
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
    const colors = [0x1e293b, 0x273449, 0x334155, 0x3b4a5c];
    this.buildings = new THREE.Group();
    for (const side of [-1, 1]) {
      for (let i = 0; i < 16; i++) {
        const bw = 1.4 + Math.random() * 1.6;
        const bh = 2.5 + Math.random() * 7;
        const bd = 1.5 + Math.random() * 2;
        const mesh = new THREE.Mesh(new THREE.BoxGeometry(bw, bh, bd), new THREE.MeshStandardMaterial({ color: colors[i % colors.length], roughness: 0.88 }));
        mesh.position.set(side * (6.5 + Math.random() * 3), bh / 2, i * 6.5);
        this.buildings.add(mesh);
      }
    }
    this.scene.add(this.buildings);
    this.sky = new THREE.Mesh(new THREE.SphereGeometry(90, 16, 12, 0, Math.PI * 2, 0, Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0x1a2744, side: THREE.BackSide }));
    this.sky.position.y = -2;
    this.scene.add(this.sky);
  }

  makeKeke(bodyColor = 0xfbbf24, isPlayer = false) {
    const g = new THREE.Group();
    const bodyMat = new THREE.MeshStandardMaterial({ color: bodyColor, roughness: 0.55, metalness: 0.15 });
    const dark = new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.7 });
    const roofMat = new THREE.MeshStandardMaterial({ color: isPlayer ? 0xfde047 : 0xeab308, roughness: 0.5 });
    const body = new THREE.Mesh(new THREE.BoxGeometry(1.15, 0.55, 1.5), bodyMat);
    body.position.y = 0.55; g.add(body);
    const canopy = new THREE.Mesh(new THREE.BoxGeometry(1.25, 0.12, 1.1), roofMat);
    canopy.position.set(0, 1.15, -0.05); g.add(canopy);
    const front = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.35, 0.15), dark);
    front.position.set(0, 0.7, 0.75); g.add(front);
    const lightMat = new THREE.MeshStandardMaterial({ color: 0xfde047, emissive: 0xfbbf24, emissiveIntensity: 0.6 });
    for (const x of [-0.28, 0.28]) {
      const hl = new THREE.Mesh(new THREE.SphereGeometry(0.08, 8, 8), lightMat);
      hl.position.set(x, 0.7, 0.85); g.add(hl);
    }
    const wheelMat = new THREE.MeshStandardMaterial({ color: 0x0f172a, roughness: 0.9 });
    for (const [x, z, r] of [[-0.55, -0.45, 0.22], [0.55, -0.45, 0.22], [0, 0.7, 0.2]]) {
      const w = new THREE.Mesh(new THREE.CylinderGeometry(r, r, 0.14, 12), wheelMat);
      w.rotation.z = Math.PI / 2; w.position.set(x, r, z); g.add(w);
    }
    return g;
  }

  makeCar(color = 0xdc2626) {
    const g = new THREE.Group();
    const bodyMat = new THREE.MeshStandardMaterial({ color, roughness: 0.45, metalness: 0.25 });
    const dark = new THREE.MeshStandardMaterial({ color: 0x0f172a, roughness: 0.8 });
    const body = new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.4, 2.2), bodyMat);
    body.position.y = 0.45; g.add(body);
    const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.15, 0.35, 1.0), bodyMat);
    cabin.position.set(0, 0.75, -0.1); g.add(cabin);
    for (const [x, z] of [[-0.5, 0.7], [0.5, 0.7], [-0.5, -0.7], [0.5, -0.7]]) {
      const w = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.12, 10), dark);
      w.rotation.z = Math.PI / 2; w.position.set(x, 0.2, z); g.add(w);
    }
    return g;
  }

  makeZone(color) {
    const g = new THREE.Group();
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.55, 0.75, 24), new THREE.MeshBasicMaterial({ color, side: THREE.DoubleSide, transparent: true, opacity: 0.85 }));
    ring.rotation.x = -Math.PI / 2; ring.position.y = 0.05; g.add(ring);
    const disc = new THREE.Mesh(new THREE.CircleGeometry(0.5, 20), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.25, side: THREE.DoubleSide }));
    disc.rotation.x = -Math.PI / 2; disc.position.y = 0.04; g.add(disc);
    return g;
  }

  makeCoin() {
    const mesh = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.28, 0.06, 16), new THREE.MeshStandardMaterial({ color: 0xfbbf24, metalness: 0.7, roughness: 0.25, emissive: 0xb45309, emissiveIntensity: 0.25 }));
    mesh.rotation.x = Math.PI / 2;
    return mesh;
  }

  screenYToZ(y, playerY) {
    const t = (playerY - y) / Math.max(playerY, 1);
    return PLAYER_Z + t * 55;
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

  draw() { this.render(); }

  render() {
    if (!this.ready) return;
    const g = this.game;
    const tod = typeof g.getTimeOfDay === 'function' ? g.getTimeOfDay() : 0.2;
    if (tod > 0.55) {
      this.renderer.setClearColor(0x020617, 1);
      this.scene.fog.color.setHex(0x020617);
      this.sun.intensity = 0.25;
      if (this.sky) this.sky.material.color.setHex(0x020617);
    } else {
      this.renderer.setClearColor(0x38bdf8, 1);
      this.scene.fog.color.setHex(0x7dd3fc);
      this.sun.intensity = 1.05;
      if (this.sky) this.sky.material.color.setHex(0x38bdf8);
    }
    if (this.laneMarks) this.laneMarks.position.z = -((g.roadOff || 0) * 0.08) % 3.2;
    if (this.buildings) this.buildings.position.z = -((g.roadOff || 0) * 0.04) % 6.5;

    if (this.player) {
      const tx = this.laneToX(g.playerLane);
      this.player.position.x += (tx - this.player.position.x) * 0.22;
      this.player.position.z = PLAYER_Z;
      this.player.position.y = g.bounce > 0 ? Math.sin(g.bounce * 0.9) * 0.08 : 0;
      this.player.rotation.y = (tx - this.player.position.x) * 0.08;
    }

    let sx = 0, sy = 0;
    if (g.shake > 0) {
      sx = (Math.random() - 0.5) * (g.shakeMag || 4) * 0.03;
      sy = (Math.random() - 0.5) * (g.shakeMag || 4) * 0.02;
    }
    const px = this.player ? this.player.position.x : 0;
    this.camera.position.x = px * 0.35 + sx;
    this.camera.position.y = 5.2 + sy;
    this.camera.lookAt(px * 0.2, 0.4, 18);

    const py = g.playerY || 500;
    let vi = 0;
    for (const o of g.obs || []) {
      if (vi >= this.vehiclePool.length) break;
      const mesh = this.vehiclePool[vi++];
      mesh.visible = true;
      mesh.position.x = this.laneToX(o.lane);
      mesh.position.z = this.screenYToZ(o.y, py);
      mesh.position.y = 0;
      const col = o.type === 'karota' ? 0xf59e0b : o.type === 'police' ? 0x1e40af : o.type === 'keke' ? 0xeab308 : 0xdc2626;
      mesh.traverse((ch) => { if (ch.isMesh && ch.material?.color && ch.geometry?.type === 'BoxGeometry') ch.material.color.setHex(col); });
      mesh.scale.setScalar(o.type === 'keke' ? 0.85 : 1);
    }
    while (vi < this.vehiclePool.length) this.vehiclePool[vi++].visible = false;

    let zi = 0;
    const zones = [
      ...(g.paxZones || []).filter(p => !p.taken).map(p => ({ ...p, kind: 'p' })),
      ...(g.dropZones || []).filter(d => !d.used).map(d => ({ ...d, kind: 'd' }))
    ];
    for (const z of zones) {
      if (zi >= this.zonePool.length) break;
      const mesh = this.zonePool[zi++];
      mesh.visible = true;
      mesh.position.x = this.laneToX(z.lane);
      mesh.position.z = this.screenYToZ(z.y, py);
      const col = z.kind === 'd' ? 0xfbbf24 : z.aishat ? 0xf472b6 : 0x4ade80;
      mesh.children.forEach(ch => { if (ch.material) ch.material.color.setHex(col); });
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
      mesh.position.y = 0.5 + Math.sin(c.bob || 0) * 0.15;
      mesh.rotation.y += 0.08;
    }
    while (ci < this.coinPool.length) this.coinPool[ci++].visible = false;

    this.renderer.render(this.scene, this.camera);
  }
}
