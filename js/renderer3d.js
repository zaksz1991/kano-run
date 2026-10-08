import * as THREE from '../vendor/three.module.js';

const LANE_X = [-2.4, 0, 2.4];
const ROAD_LEN = 120;
const PLAYER_Z = 5.5;

export class Renderer3D {
constructor(game) {
this.game = game;
this.canvas = game.canvas;
this.ready = false;
this.pools = {};
this.zonePool = [];
this.coinPool = [];
this.lastCamPx = 0;
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

this.camera = new THREE.PerspectiveCamera(55, w / h, 0.1, 160);
this.camera.position.set(0, 4.5, -4.2);
this.camera.lookAt(0, 0.8, 14);

this.scene.add(new THREE.AmbientLight(0x9aacc8, 0.6));
this.sun = new THREE.DirectionalLight(0xfff1c9, 1.2);
this.sun.position.set(10, 20, 8);
this.scene.add(this.sun);
this.hemlight = new THREE.HemisphereLight(0x87b5ff, 0x3d4a32, 0.5);
this.scene.add(this.hemlight);

this.buildRoad();
this.buildCityscape();
this.player = this.makeKeke(0xfbbf24, true);
this.player.position.set(0, 0, PLAYER_Z);
this.scene.add(this.player);

// Initialize Type-Specific Pools for Performance
const poolSizes = { car: 10, keke: 6, bus: 3, truck: 2, taxi: 4, motorcycle: 5, police: 2, karota: 2 };
for (const [type, count] of Object.entries(poolSizes)) {
  this.pools[type] = [];
  for (let i = 0; i < count; i++) {
    let v;
    if (type === 'car') v = this.makeCar([0xdc2626, 0x3b82f6, 0xf8fafc, 0x1e293b][i % 4]);
    else if (type === 'keke') v = this.makeKeke(0xeab308, false);
    else if (type === 'bus') v = this.makeBus([0x2563eb, 0xdc2626, 0x22c55e][i % 3]);
    else if (type === 'truck') v = this.makeTruck([0xdc2626, 0xf59e0b][i % 2]);
    else if (type === 'taxi') v = this.makeTaxi();
    else if (type === 'motorcycle') v = this.makeMotorcycle([0xef4444, 0x3b82f6, 0x1e293b][i % 3]);
    else if (type === 'police') v = this.makeEnforcer('police');
    else if (type === 'karota') v = this.makeEnforcer('karota');
    
    v.visible = false;
    this.scene.add(v);
    this.pools[type].push(v);
  }
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
const dustCount = 80;
const dustPos = new Float32Array(dustCount * 3);
for (let i = 0; i < dustCount; i++) {
dustPos[i * 3] = (Math.random() - 0.5) * 8;
dustPos[i * 3 + 1] = Math.random() * 1.5;
dustPos[i * 3 + 2] = Math.random() * 40 + 2;
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
  new THREE.CircleGeometry(0.8, 16),
  new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.3 })
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

// Curbs
for (const sx of [-4.75, 4.75]) {
  const curb = new THREE.Mesh(
    new THREE.BoxGeometry(0.3, 0.15, ROAD_LEN),
    this.mat(0x94a3b8, { roughness: 0.8 })
  );
  curb.position.set(sx, 0.075, ROAD_LEN / 2 - 4);
  this.scene.add(curb);
}

// Dusty Shoulders
for (const sx of [-5.6, 5.6]) {
  const sh = new THREE.Mesh(
    new THREE.PlaneGeometry(2.2, ROAD_LEN),
    this.mat(0x8b7355, { roughness: 1.0 })
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
    const dash = new THREE.Mesh(new THREE.PlaneGeometry(0.12, 1.6), dashMat);
    dash.rotation.x = -Math.PI / 2;
    dash.position.set(lx, 0.025, z);
    this.laneMarks.add(dash);
  }
}
this.scene.add(this.laneMarks);
}
buildCityscape() {
this.buildings = new THREE.Group();
const colors = [0x1e293b, 0x273449, 0x334155, 0x3b4a5c, 0x1a2332, 0x445566, 0x5c4033];
const types = [
  'house', 'shop', 'house', 'market', 'house', 'mosque',
  'shop', 'petrol', 'house', 'busstop', 'shop', 'house',
  'market', 'house', 'shop', 'mosque', 'house', 'petrol',
  'school', 'house', 'shop', 'market', 'house', 'mosque'
];
for (const side of [-1, 1]) {
  for (let i = 0; i < types.length; i++) {
    const z = i * 5.2 + (side > 0 ? 2 : 0);
    const xBase = side * (6.8 + (i % 3) * 0.4);
    const kind = types[i];
    if (kind === 'mosque') this.addMosque(xBase, z, side);
    else if (kind === 'market') this.addMarketStall(xBase, z, side);
    else if (kind === 'petrol') this.addPetrol(xBase, z, side);
    else if (kind === 'busstop') this.addBusStop(xBase, z, side);
    else if (kind === 'school') this.addSchool(xBase, z, side);
    else if (kind === 'shop') this.addShop(xBase, z, side, colors[i % colors.length]);
    else this.addHouse(xBase, z, side, colors[i % colors.length]);
    
    if (i % 2 === 0) this.addStreetLight(side * 5.2, z + 1.5);
    if (i % 4 === 1) this.addBillboard(side * 5.4, z + 3);
  }
}
for (let i = 0; i < 14; i++) {
  const side = i % 2 === 0 ? -1 : 1;
  this.addPedestrian(side * 5.0, i * 7 + 4);
}
this.scene.add(this.buildings);

this.sky = new THREE.Mesh(
  new THREE.SphereGeometry(95, 16, 12, 0, Math.PI * 2, 0, Math.PI / 2),
  new THREE.MeshBasicMaterial({ color: 0x1a2744, side: THREE.BackSide })
);
this.sky.position.y = -2;
this.scene.add(this.sky);
}
addHouse(x, z, side, color) {
const bw = 1.6 + Math.random() * 1.2;
const bh = 2.2 + Math.random() * 2.5;
const bd = 1.5 + Math.random() * 1.2;
const mesh = new THREE.Mesh(new THREE.BoxGeometry(bw, bh, bd), this.mat(color, { roughness: 0.9 }));
mesh.position.set(x, bh / 2, z);
this.buildings.add(mesh);
const roof = new THREE.Mesh(new THREE.BoxGeometry(bw + 0.2, 0.15, bd + 0.2), this.mat(0x44403c, { roughness: 0.95 }));
roof.position.set(x, bh + 0.08, z);
this.buildings.add(roof);
const door = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.7, 0.08), this.mat(0x292524, { roughness: 0.8 }));
door.position.set(x - side * 0.1, 0.35, z + (side > 0 ? -bd / 2 - 0.02 : bd / 2 + 0.02));
this.buildings.add(door);
}
addShop(x, z, side, color) {
const bw = 2.0, bh = 2.4, bd = 1.6;
const mesh = new THREE.Mesh(new THREE.BoxGeometry(bw, bh, bd), this.mat(color || 0xb45309, { roughness: 0.85 }));
mesh.position.set(x, bh / 2, z);
this.buildings.add(mesh);
const awning = new THREE.Mesh(new THREE.BoxGeometry(bw + 0.3, 0.08, 0.7), this.mat(0xdc2626, { roughness: 0.7 }));
awning.position.set(x - side * 0.3, bh * 0.75, z);
this.buildings.add(awning);
const sign = new THREE.Mesh(new THREE.BoxGeometry(bw * 0.8, 0.35, 0.08), this.mat(0xfbbf24, { roughness: 0.5, emissive: 0xb45309, emissiveIntensity: 0.15 }));
sign.position.set(x - side * 0.05, bh * 0.9, z + (side > 0 ? -bd / 2 - 0.05 : bd / 2 + 0.05));
this.buildings.add(sign);
}
addSchool(x, z, side) {
const bw = 3.0, bh = 3.2, bd = 2.0;
const mesh = new THREE.Mesh(new THREE.BoxGeometry(bw, bh, bd), this.mat(0xf8fafc, { roughness: 0.8 }));
mesh.position.set(x, bh / 2, z);
this.buildings.add(mesh);
const roof = new THREE.Mesh(new THREE.BoxGeometry(bw + 0.2, 0.2, bd + 0.2), this.mat(0xdc2626, { roughness: 0.7 }));
roof.position.set(x, bh + 0.1, z);
this.buildings.add(roof);
}
addMosque(x, z, side) {
const base = new THREE.Mesh(new THREE.BoxGeometry(2.4, 2.8, 2.0), this.mat(0x0f766e, { roughness: 0.8 }));
base.position.set(x, 1.4, z);
this.buildings.add(base);
const dome = new THREE.Mesh(new THREE.SphereGeometry(0.85, 12, 10, 0, Math.PI * 2, 0, Math.PI / 2), this.mat(0xf5f5f4, { roughness: 0.4, metalness: 0.2 }));
dome.position.set(x, 2.8, z);
this.buildings.add(dome);
const minaret = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.22, 4.2, 10), this.mat(0x0d9488, { roughness: 0.75 }));
minaret.position.set(x + side * 1.1, 2.1, z - 0.6);
this.buildings.add(minaret);
const cap = new THREE.Mesh(new THREE.ConeGeometry(0.28, 0.5, 8), this.mat(0xfbbf24, { roughness: 0.4, metalness: 0.3 }));
cap.position.set(x + side * 1.1, 4.4, z - 0.6);
this.buildings.add(cap);
}
addMarketStall(x, z, side) {
for (const dx of [-0.7, 0.7]) {
const post = new THREE.Mesh(new THREE.BoxGeometry(0.1, 1.6, 0.1), this.mat(0x78716c, { roughness: 0.9 }));
post.position.set(x + dx, 0.8, z);
this.buildings.add(post);
}
const canopy = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.08, 1.4), this.mat(0xeab308, { roughness: 0.7 }));
canopy.position.set(x, 1.65, z);
this.buildings.add(canopy);
const table = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.12, 1.0), this.mat(0xa16207, { roughness: 0.85 }));
table.position.set(x, 0.7, z);
this.buildings.add(table);
for (let i = 0; i < 3; i++) {
const g = new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.25, 0.25), this.mat([0x22c55e, 0xef4444, 0x3b82f6][i], { roughness: 0.6 }));
g.position.set(x - 0.4 + i * 0.4, 0.95, z);
this.buildings.add(g);
}
}
addPetrol(x, z, side) {
const canopy = new THREE.Mesh(new THREE.BoxGeometry(3.2, 0.12, 2.2), this.mat(0xdc2626, { roughness: 0.5 }));
canopy.position.set(x, 2.4, z);
this.buildings.add(canopy);
for (const dx of [-1.2, 1.2]) {
const p = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 2.4, 8), this.mat(0xf8fafc, { roughness: 0.4, metalness: 0.3 }));
p.position.set(x + dx, 1.2, z);
this.buildings.add(p);
}
const pump = new THREE.Mesh(new THREE.BoxGeometry(0.5, 1.2, 0.4), this.mat(0x1e293b, { roughness: 0.6 }));
pump.position.set(x, 0.6, z + 0.5);
this.buildings.add(pump);
const sign = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.5, 0.1), this.mat(0xfbbf24, { roughness: 0.4, emissive: 0xb45309, emissiveIntensity: 0.2 }));
sign.position.set(x, 2.7, z);
this.buildings.add(sign);
}
addBusStop(x, z, side) {
const roof = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.08, 1.2), this.mat(0x334155, { roughness: 0.7 }));
roof.position.set(x, 2.0, z);
this.buildings.add(roof);
const back = new THREE.Mesh(new THREE.BoxGeometry(2.0, 1.4, 0.08), this.mat(0x475569, { roughness: 0.8 }));
back.position.set(x, 1.2, z - side * 0.5);
this.buildings.add(back);
const bench = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.12, 0.4), this.mat(0x78716c, { roughness: 0.85 }));
bench.position.set(x, 0.5, z);
this.buildings.add(bench);
}
addStreetLight(x, z) {
const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.06, 3.2, 6), this.mat(0x64748b, { roughness: 0.6, metalness: 0.4 }));
pole.position.set(x, 1.6, z);
this.buildings.add(pole);
const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.18, 8, 8), this.mat(0xfde047, { emissive: 0xfbbf24, emissiveIntensity: 0.8, roughness: 0.3 }));
lamp.position.set(x, 3.25, z);
this.buildings.add(lamp);
}
addBillboard(x, z) {
const pole = new THREE.Mesh(new THREE.BoxGeometry(0.1, 2.5, 0.1), this.mat(0x475569, { roughness: 0.7 }));
pole.position.set(x, 1.25, z);
this.buildings.add(pole);
const col = Math.abs(z) % 12 < 6 ? 0xe11d48 : 0x2563eb;
const board = new THREE.Mesh(new THREE.BoxGeometry(2.2, 1.1, 0.08), this.mat(col, { roughness: 0.5, emissive: col, emissiveIntensity: 0.15 }));
board.position.set(x, 2.9, z);
this.buildings.add(board);
}
addPedestrian(x, z) {
const shirtColors = [0x3b82f6, 0xec4899, 0x22c55e, 0xeab308, 0xa855f7, 0xf8fafc];
const shirt = shirtColors[Math.floor(Math.random() * shirtColors.length)];
const body = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.5, 0.2), this.mat(shirt, { roughness: 0.8 }));
body.position.set(x, 0.85, z);
this.buildings.add(body);
const head = new THREE.Mesh(new THREE.SphereGeometry(0.14, 8, 8), this.mat(0xfcd34d, { roughness: 0.7 }));
head.position.set(x, 1.25, z);
this.buildings.add(head);
for (const dx of [-0.07, 0.07]) {
const leg = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.45, 0.1), this.mat(0x1e293b, { roughness: 0.9 }));
leg.position.set(x + dx, 0.35, z);
this.buildings.add(leg);
}
}

makeKeke(bodyColor = 0xfbbf24, isPlayer = false) {
const g = new THREE.Group();
const bodyM = this.mat(bodyColor, { roughness: 0.4, metalness: 0.2 });
const dark = this.mat(0x1e293b, { roughness: 0.7 });
const roofM = this.mat(isPlayer ? 0xfde047 : 0xeab308, { roughness: 0.4 });
const chrome = this.mat(0x94a3b8, { roughness: 0.3, metalness: 0.7 });
const tire = this.mat(0x0f172a, { roughness: 0.95 });
const glass = this.mat(0x38bdf8, { roughness: 0.1, metalness: 0.5, transparent: true, opacity: 0.6 });

const chassis = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.3, 1.6), dark);
chassis.position.set(0, 0.35, 0);
g.add(chassis);

const frontBody = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.6, 0.5), bodyM);
frontBody.position.set(0, 0.7, 0.6);
frontBody.userData.isBody = true;
g.add(frontBody);

const rearBody = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.7, 1.0), bodyM);
rearBody.position.set(0, 0.75, -0.3);
rearBody.userData.isBody = true;
g.add(rearBody);

const canopy = new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.1, 1.4), roofM);
canopy.position.set(0, 1.35, -0.1);
g.add(canopy);

const lip = new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.15, 0.1), roofM);
lip.position.set(0, 1.28, 0.6);
g.add(lip);

const windshield = new THREE.Mesh(new THREE.PlaneGeometry(1.0, 0.5), glass);
windshield.position.set(0, 1.05, 0.65);
windshield.rotation.x = -0.2;
g.add(windshield);

for (const x of [-0.61, 0.61]) {
  const sideWin = new THREE.Mesh(new THREE.PlaneGeometry(0.8, 0.4), glass);
  sideWin.position.set(x, 1.0, -0.2);
  sideWin.rotation.y = x > 0 ? -Math.PI / 2 : Math.PI / 2;
  g.add(sideWin);
}

for (const x of [-0.6, 0.6]) {
  for (const z of [0.4, -0.7]) {
    const p = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.6, 0.06), dark);
    p.position.set(x, 1.0, z);
    g.add(p);
  }
}

for (const x of [-0.55, 0.55]) {
  const mirrorArm = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.04, 0.04), dark);
  mirrorArm.position.set(x, 0.95, 0.5);
  g.add(mirrorArm);
  const mirror = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.12, 0.04), chrome);
  mirror.position.set(x > 0 ? x + 0.1 : x - 0.1, 0.95, 0.5);
  g.add(mirror);
}

const lightM = this.mat(0xfde047, { roughness: 0.2, emissive: 0xfbbf24, emissiveIntensity: isPlayer ? 1.0 : 0.5 });
for (const x of [-0.3, 0.3]) {
  const hl = new THREE.Mesh(new THREE.SphereGeometry(0.1, 12, 12), lightM);
  hl.position.set(x, 0.65, 0.86);
  g.add(hl);
}

const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.6, 8), chrome);
bar.rotation.z = Math.PI / 2;
bar.position.set(0, 0.95, 0.75);
g.add(bar);

const bench = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.15, 0.4), dark);
bench.position.set(0, 0.65, -0.5);
g.add(bench);

const plate = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.12, 0.02), this.mat(0xf8fafc));
plate.position.set(0, 0.35, 0.86);
g.add(plate);

const frontWheelGroup = new THREE.Group();
frontWheelGroup.position.set(0, 0.22, 0.8);
const fw = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 0.14, 14), tire);
fw.rotation.z = Math.PI / 2;
frontWheelGroup.add(fw);
const fwHub = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 0.15, 10), chrome);
fwHub.rotation.z = Math.PI / 2;
frontWheelGroup.add(fwHub);
const fork = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.4, 0.06), chrome);
fork.position.set(0, 0.2, 0);
frontWheelGroup.add(fork);
g.add(frontWheelGroup);

for (const x of [-0.6, 0.6]) {
  const rw = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.24, 0.16, 14), tire);
  rw.rotation.z = Math.PI / 2;
  rw.position.set(x, 0.24, -0.5);
  g.add(rw);
  const rwHub = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.17, 10), chrome);
  rwHub.rotation.z = Math.PI / 2;
  rwHub.position.set(x, 0.24, -0.5);
  g.add(rwHub);
}

g.userData.kind = 'keke';
g.userData.isPlayer = isPlayer;
g.userData.steerParts = [frontWheelGroup, bar];
return g;
}

makeCar(color = 0xdc2626) {
const g = new THREE.Group();
const bodyM = this.mat(color, { roughness: 0.4, metalness: 0.3 });
const dark = this.mat(0x0f172a, { roughness: 0.85 });
const glass = this.mat(0x1e3a5f, { roughness: 0.15, metalness: 0.4 });
const body = new THREE.Mesh(new THREE.BoxGeometry(1.35, 0.38, 2.3), bodyM);
body.position.y = 0.42;
g.add(body);
const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.4, 1.15), bodyM);
cabin.position.set(0, 0.78, -0.15);
g.add(cabin);
const win = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.28, 1.0), glass);
win.position.set(0, 0.82, -0.12);
g.add(win);
const hood = new THREE.Mesh(new THREE.BoxGeometry(1.25, 0.12, 0.55), bodyM);
hood.position.set(0, 0.55, 0.85);
g.add(hood);
const lm = this.mat(0xfde047, { emissive: 0xfbbf24, emissiveIntensity: 0.5 });
for (const x of [-0.4, 0.4]) {
  const hl = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.1, 0.06), lm);
  hl.position.set(x, 0.4, 1.18);
  g.add(hl);
}
for (const [x, z] of [[-0.55, 0.75], [0.55, 0.75], [-0.55, -0.75], [0.55, -0.75]]) {
  const w = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 0.14, 12), dark);
  w.rotation.z = Math.PI / 2;
  w.position.set(x, 0.22, z);
  g.add(w);
}
g.userData.kind = 'car';
return g;
}

makeBus(color = 0x2563eb) {
const g = new THREE.Group();
const bodyM = this.mat(color, { roughness: 0.5, metalness: 0.2 });
const dark = this.mat(0x0f172a, { roughness: 0.85 });
const glass = this.mat(0x1e3a5f, { roughness: 0.15, metalness: 0.4 });
const body = new THREE.Mesh(new THREE.BoxGeometry(1.6, 1.2, 3.5), bodyM);
body.position.y = 0.9;
g.add(body);
const windows = new THREE.Mesh(new THREE.BoxGeometry(1.62, 0.5, 3.2), glass);
windows.position.y = 1.1;
g.add(windows);
for (const [x, z] of [[-0.7, 1.2], [0.7, 1.2], [-0.7, -1.2], [0.7, -1.2]]) {
  const w = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.2, 12), dark);
  w.rotation.z = Math.PI / 2;
  w.position.set(x, 0.3, z);
  g.add(w);
}
g.userData.kind = 'bus';
return g;
}

makeTruck(color = 0xdc2626) {
const g = new THREE.Group();
const cabM = this.mat(color, { roughness: 0.5, metalness: 0.2 });
const cargoM = this.mat(0x94a3b8, { roughness: 0.7, metalness: 0.1 });
const dark = this.mat(0x0f172a, { roughness: 0.85 });
const cab = new THREE.Mesh(new THREE.BoxGeometry(1.4, 1.0, 1.2), cabM);
cab.position.set(0, 0.8, 1.0);
g.add(cab);
const cargo = new THREE.Mesh(new THREE.BoxGeometry(1.5, 1.4, 2.2), cargoM);
cargo.position.set(0, 1.0, -0.6);
g.add(cargo);
for (const [x, z] of [[-0.6, 1.0], [0.6, 1.0], [-0.7, -1.0], [0.7, -1.0]]) {
  const w = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.28, 0.2, 12), dark);
  w.rotation.z = Math.PI / 2;
  w.position.set(x, 0.28, z);
  g.add(w);
}
g.userData.kind = 'truck';
return g;
}

makeTaxi() {
const g = this.makeCar(0x22c55e);
const sign = new THREE.Mesh(
  new THREE.BoxGeometry(0.4, 0.15, 0.2),
  this.mat(0xfbbf24, { emissive: 0xfbbf24, emissiveIntensity: 0.5 })
);
sign.position.set(0, 1.05, -0.1);
g.add(sign);
g.userData.kind = 'taxi';
return g;
}

makeMotorcycle(color = 0xef4444) {
const g = new THREE.Group();
const bodyM = this.mat(color, { roughness: 0.5, metalness: 0.3 });
const dark = this.mat(0x0f172a, { roughness: 0.85 });
const body = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.3, 1.0), bodyM);
body.position.set(0, 0.5, 0);
g.add(body);
const riderBody = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.5, 0.3), this.mat(0x1e293b));
riderBody.position.set(0, 0.9, -0.1);
g.add(riderBody);
const riderHead = new THREE.Mesh(new THREE.SphereGeometry(0.15, 8, 8), this.mat(0xfcd34d));
riderHead.position.set(0, 1.3, -0.1);
g.add(riderHead);
for (const z of [0.4, -0.4]) {
  const w = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.1, 12), dark);
  w.rotation.z = Math.PI / 2;
  w.position.set(0, 0.2, z);
  g.add(w);
}
g.userData.kind = 'motorcycle';
return g;
}

makeEnforcer(kind = 'police') {
const color = kind === 'karota' ? 0xf59e0b : 0x1e40af;
const g = this.makeCar(color);
const bar = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.12, 0.25), this.mat(0x1e293b, { roughness: 0.5 }));
bar.position.set(0, 1.05, -0.1);
g.add(bar);
const red = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.1, 0.2), this.mat(0xef4444, { emissive: 0xef4444, emissiveIntensity: 0.8 }));
red.position.set(-0.2, 1.05, -0.1);
g.add(red);
const blue = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.1, 0.2), this.mat(0x3b82f6, { emissive: 0x3b82f6, emissiveIntensity: 0.8 }));
blue.position.set(0.2, 1.05, -0.1);
g.add(blue);
g.userData.kind = kind;
return g;
}

makeZone(color) {
const g = new THREE.Group();
const ring = new THREE.Mesh(new THREE.RingGeometry(0.55, 0.78, 28), new THREE.MeshBasicMaterial({ color, side: THREE.DoubleSide, transparent: true, opacity: 0.9 }));
ring.rotation.x = -Math.PI / 2;
ring.position.y = 0.06;
g.add(ring);
const disc = new THREE.Mesh(new THREE.CircleGeometry(0.5, 24), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.22, side: THREE.DoubleSide }));
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

screenYToZ(y, playerY) {
const t = (playerY - y) / Math.max(playerY, 1);
return PLAYER_Z + t * 58;
}
laneToX(lane) {
return LANE_X[Math.max(0, Math.min(2, Math.round(lane)))];
}

applyPaint(paintId) {
const colors = {
classic: 0xfbbf24, ruffneck: 0xeab308, sky: 0x38bdf8,
forest: 0x22c55e, royal: 0xa855f7, ember: 0xef4444, night: 0x1e293b
};
const col = colors[paintId] || 0xfbbf24;
if (!this.player) return;
this.player.traverse((ch) => {
  if (ch.isMesh && ch.userData.isBody) {
    ch.material.color.setHex(col);
  }
});
}

applyQuality(low) {
if (!this.renderer) return;
this.renderer.setPixelRatio(low ? 1 : Math.min(window.devicePixelRatio || 1, 1.75));
this.renderer.setSize(this.canvas.clientWidth || 390, this.canvas.clientHeight || 700, false);
if (this.rain) this.rain.visible = !low;
if (this.dust && low) this.dustMat.opacity = Math.min(this.dustMat.opacity, 0.15);
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
const spd = g.speed || 3;

// Day/Night Cycle & Lighting
if (tod > 0.62) {
  this.renderer.setClearColor(0x020617, 1);
  this.scene.fog.color.setHex(0x020617);
  this.scene.fog.near = 22;
  this.scene.fog.far = 75;
  this.sun.intensity = 0.15;
  this.hemlight.intensity = 0.12;
  if (this.sky) this.sky.material.color.setHex(0x020617);
  
  if (!this.playerHeadlights) {
    this.playerHeadlights = [];
    for (const x of [-0.3, 0.3]) {
      const light = new THREE.SpotLight(0xfff1c9, 3, 25, Math.PI / 5, 0.5);
      light.position.set(x, 0.6, 1);
      light.target.position.set(x, 0, 15);
      this.player.add(light);
      this.player.add(light.target);
      this.playerHeadlights.push(light);
    }
  }
  this.playerHeadlights.forEach(l => l.intensity = 3);
} else if (tod > 0.42) {
  this.renderer.setClearColor(0x7c3aed, 1);
  this.scene.fog.color.setHex(0x4c1d95);
  this.scene.fog.near = 28;
  this.scene.fog.far = 90;
  this.sun.intensity = 0.45;
  this.hemlight.intensity = 0.25;
  if (this.sky) this.sky.material.color.setHex(0x5b21b6);
  if (this.playerHeadlights) this.playerHeadlights.forEach(l => l.intensity = 0);
} else if (tod > 0.28) {
  this.renderer.setClearColor(0x38bdf8, 1);
  this.scene.fog.color.setHex(0x7dd3fc);
  this.scene.fog.near = 35;
  this.scene.fog.far = 100;
  this.sun.intensity = 1.1;
  this.hemlight.intensity = 0.45;
  if (this.sky) this.sky.material.color.setHex(0x38bdf8);
  if (this.playerHeadlights) this.playerHeadlights.forEach(l => l.intensity = 0);
} else {
  this.renderer.setClearColor(0x7dd3fc, 1);
  this.scene.fog.color.setHex(0xbae6fd);
  this.scene.fog.near = 40;
  this.scene.fog.far = 110;
  this.sun.intensity = 1.3;
  this.hemlight.intensity = 0.55;
  if (this.sky) this.sky.material.color.setHex(0x7dd3fc);
  if (this.playerHeadlights) this.playerHeadlights.forEach(l => l.intensity = 0);
}

// Weather
if ((g.frame || 0) % 900 === 0 && g.state === 1) {
  const r = Math.random();
  this.weather = r < 0.55 ? 'clear' : r < 0.8 ? 'harmattan' : 'rain';
  if (this.weather === 'rain' && this.game.ui) this.game.ui.showMissionToast('🌧️ Rain in Kano');
  if (this.weather === 'harmattan' && this.game.ui) this.game.ui.showMissionToast('🏜️ Harmattan haze');
}

if (this.weather === 'rain') {
  this.rainMat.opacity = 0.55;
  this.dustMat.opacity = 0.08;
  this.scene.fog.near = Math.min(this.scene.fog.near, 25);
  this.sun.intensity *= 0.6;
} else if (this.weather === 'harmattan') {
  this.rainMat.opacity = 0;
  this.dustMat.opacity = 0.55;
  this.dustMat.color.setHex(0xd4c4a8);
  this.scene.fog.color.lerp(new THREE.Color(0xc4b5a0), 0.35);
  this.sun.intensity *= 0.75;
} else {
  this.rainMat.opacity = 0;
  this.dustMat.opacity = 0.2 + Math.min(0.25, spd * 0.03);
  this.dustMat.color.setHex(0xc4b5a0);
}

if (this.dust) {
  const pos = this.dust.geometry.attributes.position.array;
  for (let i = 0; i < pos.length; i += 3) {
    pos[i + 2] -= spd * 0.08;
    if (pos[i + 2] < 1) {
      pos[i] = (Math.random() - 0.5) * 8;
      pos[i + 1] = Math.random() * 1.2;
      pos[i + 2] = 35 + Math.random() * 15;
    }
  }
  this.dust.geometry.attributes.position.needsUpdate = true;
}
if (this.rain && this.rainMat.opacity > 0.05) {
  const pos = this.rain.geometry.attributes.position.array;
  for (let i = 0; i < pos.length; i += 3) {
    pos[i + 1] -= 0.45;
    pos[i + 2] -= spd * 0.05;
    if (pos[i + 1] < 0) {
      pos[i] = (Math.random() - 0.5) * 14;
      pos[i + 1] = 8 + Math.random() * 6;
      pos[i + 2] = Math.random() * 45;
    }
  }
  this.rain.geometry.attributes.position.needsUpdate = true;
}

if (this.laneMarks) this.laneMarks.position.z = -((g.roadOff || 0) * 0.08) % 3.2;
if (this.buildings) this.buildings.position.z = -((g.roadOff || 0) * 0.04) % 6.2;

// Player Keke Animation
if (this.player) {
  const tx = this.laneToX(g.playerLane);
  const lateralVel = tx - this.player.position.x;
  this.player.position.x += lateralVel * 0.22;
  this.player.position.z = PLAYER_Z;
  
  const bounceY = g.bounce > 0 ? Math.sin(g.bounce * 0.9) * 0.12 : 0;
  this.player.position.y = bounceY;
  
  this.player.rotation.y = lateralVel * 0.15;
  this.player.rotation.z = -lateralVel * 0.08;
  
  if (this.player.userData.steerParts) {
    const steerAngle = lateralVel * 0.4;
    for (const part of this.player.userData.steerParts) {
      part.rotation.y = steerAngle;
    }
  }
  
  if (this.playerShadow) {
    this.playerShadow.position.x = this.player.position.x;
    this.playerShadow.position.z = this.player.position.z;
    this.playerShadow.scale.setScalar(0.9 + Math.abs(bounceY) * 2);
  }
}

// Camera Dynamics
const px = this.player ? this.player.position.x : 0;
const lateralVelCam = px - (this.lastCamPx || 0);
this.lastCamPx = px;

const speedFactor = Math.min(1, (spd - 3) / 5);
const camZ = -4.2 - speedFactor * 1.2;
const camY = 4.0 + speedFactor * 0.6;
const camX = px * 0.65;

this.camera.position.x += (camX - this.camera.position.x) * 0.12;
this.camera.position.y += (camY - this.camera.position.y) * 0.12;
this.camera.position.z += (camZ - this.camera.position.z) * 0.12;

let sx = 0, sy = 0;
if (g.shake > 0) {
  sx = (Math.random() - 0.5) * (g.shakeMag || 4) * 0.04;
  sy = (Math.random() - 0.5) * (g.shakeMag || 4) * 0.03;
}
this.camera.position.x += sx;
this.camera.position.y += sy;

const targetRoll = -lateralVelCam * 0.08;
this.camera.rotation.z += (targetRoll - this.camera.rotation.z) * 0.1;

const targetFov = 55 + Math.min(10, speedFactor * 10);
this.camera.fov += (targetFov - this.camera.fov) * 0.05;
this.camera.updateProjectionMatrix();
this.camera.lookAt(px * 0.3, 0.8, 14);

// Traffic Rendering
const py = g.playerY || 500;
const activeVehicles = {};
for (const type in this.pools) activeVehicles[type] = 0;

for (const o of g.obs || []) {
  const type = o.type || 'car';
  const pool = this.pools[type] || this.pools.car;
  const idx = activeVehicles[type] || 0;
  if (idx >= pool.length) continue;
  
  const mesh = pool[idx++];
  activeVehicles[type] = idx;
  
  mesh.visible = true;
  mesh.position.x = this.laneToX(o.lane);
  mesh.position.z = this.screenYToZ(o.y, py);
  mesh.position.y = 0;
  
  if (type === 'keke' || type === 'motorcycle') {
    mesh.rotation.y = (this.laneToX(o.lane) - mesh.position.x) * 0.2;
  } else {
    mesh.rotation.y = 0;
  }
}

for (const type in this.pools) {
  const pool = this.pools[type];
  const used = activeVehicles[type] || 0;
  for (let i = used; i < pool.length; i++) {
    pool[i].visible = false;
  }
}

// Zones & Coins
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
  const col = z.kind === 'd' ? 0xfbbf24 : z.aishat ? 0xf472b6 : z.vip ? 0xa78bfa : 0x4ade80;
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