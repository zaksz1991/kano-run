import * as THREE from '../vendor/three.module.js';

const LANES = [-2.4, 0, 2.4];
const TAU = Math.PI * 2;

function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
function fract(v) { return v - Math.floor(v); }
function seeded(v) { return fract(Math.sin(v * 12.9898) * 43758.5453); }

function mat(THREERef, color, roughness = 0.9, metalness = 0) {
  return new THREERef.MeshStandardMaterial({ color, roughness, metalness });
}

function box(THREERef, parent, size, pos, material) {
  const m = new THREERef.Mesh(new THREERef.BoxGeometry(...size), material);
  m.position.set(...pos);
  m.castShadow = true;
  m.receiveShadow = true;
  parent.add(m);
  return m;
}

function sphere(THREERef, parent, radius, pos, material, scale = [1, 1, 1]) {
  const m = new THREERef.Mesh(new THREERef.SphereGeometry(radius, 12, 9), material);
  m.position.set(...pos);
  m.scale.set(...scale);
  m.castShadow = true;
  m.receiveShadow = true;
  parent.add(m);
  return m;
}

function makeAmbientCar(THREERef, variant = 0) {
  const g = new THREERef.Group();
  const colors = [0x858b91, 0x4b5960, 0x9a9b92, 0x6b7376, 0xb4a98e, 0x3e4b52];
  const body = mat(THREERef, colors[variant % colors.length], 0.62, 0.04);
  const dark = mat(THREERef, 0x171c20, 0.86, 0.02);
  const glass = mat(THREERef, 0x25383e, 0.2, 0.06);
  const tire = mat(THREERef, 0x151719, 0.98, 0);
  const lamp = mat(THREERef, 0xf5e5bb, 0.3, 0, { emissive: 0xe2b86b, emissiveIntensity: 0.12 });

  box(THREERef, g, [1.78, 0.48, 3.55], [0, 0.62, 0], body);
  box(THREERef, g, [1.52, 0.62, 1.65], [0, 1.05, 0.15], glass);
  box(THREERef, g, [1.55, 0.12, 1.85], [0, 1.4, 0.12], dark);
  for (const x of [-0.78, 0.78]) {
    sphere(THREERef, g, 0.075, [x, 0.72, -1.72], lamp, [1.1, .75, .45]);
  }
  for (const z of [-1.15, 1.15]) {
    for (const x of [-0.9, 0.9]) {
      const wheel = new THREERef.Group();
      wheel.position.set(x, 0.38, z);
      wheel.rotation.z = Math.PI / 2;
      const t = new THREERef.Mesh(new THREERef.CylinderGeometry(.28, .28, .14, 14), tire);
      t.castShadow = true;
      wheel.add(t);
      g.add(wheel);
      g.userData.wheels ??= [];
      g.userData.wheels.push(wheel);
    }
  }
  return g;
}

function makeAmbientKeke(THREERef, variant = 0) {
  const g = new THREERef.Group();
  const yellow = [0xd8a927, 0xe0bb32, 0xc99720, 0xf0c43b][variant % 4];
  const body = mat(THREERef, yellow, 0.62, 0.03);
  const dark = mat(THREERef, 0x171b1e, 0.86, 0.02);
  const glass = mat(THREERef, 0x22363e, 0.22, 0.04);
  const tire = mat(THREERef, 0x17191b, 0.98, 0);
  box(THREERef, g, [1.42, .38, 2.35], [0, .75, 0], body);
  box(THREERef, g, [1.3, .12, 2.05], [0, 1.85, 0], dark);
  box(THREERef, g, [1.16, .72, .08], [0, 1.45, -0.94], glass);
  box(THREERef, g, [.08, .9, 2.02], [-.62, 1.4, 0], dark);
  box(THREERef, g, [.08, .9, 2.02], [.62, 1.4, 0], dark);
  for (const z of [-.72, .72]) {
    for (const x of [-.72, .72]) {
      const w = new THREERef.Group();
      w.position.set(x, .42, z);
      w.rotation.z = Math.PI / 2;
      const t = new THREERef.Mesh(new THREERef.CylinderGeometry(.23, .23, .14, 14), tire);
      w.add(t); g.add(w); g.userData.wheels ??= []; g.userData.wheels.push(w);
    }
  }
  return g;
}

function makePedestrian(THREERef, variant = 0) {
  const g = new THREERef.Group();
  const skin = mat(THREERef, [0x5a3828, 0x6a432d, 0x754a32, 0x81563e][variant % 4]);
  const cloth = mat(THREERef, [0x3c6071, 0x6f4c3c, 0x6f7541, 0x79506d, 0x8b7657][variant % 5]);
  const dark = mat(THREERef, 0x202326, 0.96);
  sphere(THREERef, g, .145, [0, 1.18, 0], skin, [.92, 1.05, .92]);
  box(THREERef, g, [.27, .47, .2], [0, .82, 0], cloth);
  const la = box(THREERef, g, [.075, .43, .07], [-.17, .83, 0], skin);
  const ra = box(THREERef, g, [.075, .43, .07], [.17, .83, 0], skin);
  const ll = box(THREERef, g, [.08, .5, .08], [-.075, .32, 0], dark);
  const rl = box(THREERef, g, [.08, .5, .08], [.075, .32, 0], dark);
  g.userData.parts = { la, ra, ll, rl };
  return g;
}

export class TrafficWorld {
  constructor(THREERef, renderer, options = {}) {
    this.THREE = THREERef;
    this.renderer = renderer;
    this.quality = options.quality || 'high';
    this.group = new THREERef.Group();
    this.group.name = 'ambient-kano-life';
    renderer.world.add(this.group);
    this.traffic = [];
    this.people = [];
    this.elapsed = 0;
    this.lastRoadOffset = 0;
    this.build();
  }

  build() {
    const trafficCount = this.quality === 'low' ? 5 : this.quality === 'medium' ? 8 : 12;
    const personCount = this.quality === 'low' ? 6 : this.quality === 'medium' ? 10 : 16;

    for (let i = 0; i < trafficCount; i += 1) {
      const isKeke = i % 3 === 0;
      const mesh = isKeke ? makeAmbientKeke(this.THREE, i) : makeAmbientCar(this.THREE, i);
      mesh.userData.speed = (isKeke ? .9 : 1.05) + seeded(i + 4) * .65;
      mesh.userData.lane = i % 3;
      mesh.userData.direction = i % 4 === 0 ? -1 : 1;
      mesh.userData.phase = seeded(i + 10) * 20;
      mesh.position.set(LANES[mesh.userData.lane], .02, -28 - i * 13);
      if (mesh.userData.direction < 0) mesh.rotation.y = Math.PI;
      this.group.add(mesh);
      this.traffic.push(mesh);
    }

    for (let i = 0; i < personCount; i += 1) {
      const p = makePedestrian(this.THREE, i);
      p.userData.side = i % 2 === 0 ? -1 : 1;
      p.userData.speed = .65 + seeded(i * 4.3) * .45;
      p.userData.phase = seeded(i * 8.1) * TAU;
      p.userData.baseZ = -52 + seeded(i * 3.7) * 112;
      p.position.set(p.userData.side * (6.8 + seeded(i + 21) * 1.7), 0, p.userData.baseZ);
      p.rotation.y = p.userData.side < 0 ? 0 : Math.PI;
      this.group.add(p);
      this.people.push(p);
    }
  }

  recycleTraffic(v) {
    const dir = v.userData.direction;
    if (dir > 0 && v.position.z > 34) {
      v.position.z = -125 - seeded(this.elapsed * 3 + v.userData.phase) * 45;
      v.userData.lane = Math.floor(seeded(this.elapsed + v.userData.phase) * 3);
      v.position.x = LANES[v.userData.lane];
    } else if (dir < 0 && v.position.z < -145) {
      v.position.z = 30 + seeded(this.elapsed * 2 + v.userData.phase) * 30;
      v.userData.lane = Math.floor(seeded(this.elapsed + v.userData.phase + 8) * 3);
      v.position.x = LANES[v.userData.lane];
    }
  }

  updateTraffic(dt, gameSpeed = 1) {
    const playerSpeed = clamp(Number(gameSpeed) || 1, .25, 2.5);
    for (const v of this.traffic) {
      const dir = v.userData.direction;
      const lane = v.userData.lane;
      const targetX = LANES[lane];
      v.position.x += (targetX - v.position.x) * Math.min(dt * 1.8, 1);
      v.position.z += dir * v.userData.speed * (5.5 + playerSpeed * 4.5) * dt;
      const wobble = Math.sin(this.elapsed * 1.5 + v.userData.phase) * .012;
      v.rotation.z = wobble;
      for (const wheel of v.userData.wheels || []) wheel.rotation.x -= dir * dt * v.userData.speed * 5;
      this.recycleTraffic(v);
    }
  }

  updatePeople(dt, roadMotion = 1) {
    for (const p of this.people) {
      p.userData.phase += dt * p.userData.speed;
      p.position.z += (p.userData.side < 0 ? 1 : -1) * p.userData.speed * (.65 + roadMotion * .18) * dt;
      if (p.position.z > 40) p.position.z = -105;
      if (p.position.z < -110) p.position.z = 35;
      const swing = Math.sin(p.userData.phase * 4.2) * .25;
      const parts = p.userData.parts;
      parts.la.rotation.z = swing;
      parts.ra.rotation.z = -swing;
      parts.ll.rotation.z = -swing * .65;
      parts.rl.rotation.z = swing * .65;
      p.position.y = Math.abs(Math.sin(p.userData.phase * 2.1)) * .012;
    }
  }

  update(dt, gameSpeed = 1, roadOffset = 0) {
    if (!this.group) return;
    this.elapsed += dt;
    const roadDelta = Number(roadOffset) - this.lastRoadOffset;
    this.lastRoadOffset = Number(roadOffset) || 0;
    // Keep ambient roadside traffic tied to the same scrolling world as the gameplay road.
    if (Math.abs(roadDelta) > 0.0001) {
      const shift = roadDelta * 0.035;
      for (const p of this.people) p.position.z += shift;
      for (const v of this.traffic) v.position.z += shift;
    }
    this.updateTraffic(dt, gameSpeed);
    this.updatePeople(dt, gameSpeed);
  }

  dispose() {
    this.group?.parent?.remove(this.group);
    this.traffic.length = 0;
    this.people.length = 0;
  }
}

export default TrafficWorld;
