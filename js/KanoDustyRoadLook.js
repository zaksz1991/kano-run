/**
 * Kano road look, matched to the player's reference photos of the new Kano roads: dark clean
 * charcoal tar (thin crisp white dashes and yellow edge lines come from the road paint), the
 * planted median with black-and-white kerbs and lamp posts, and a pale paved footpath on the
 * outer edge. Visual only: lanes, collisions, stops and fares are untouched.
 */
import * as THREE from 'three';
import { Renderer3D } from './renderer3d.js';

const PATCH = Symbol.for('kano.life.dustyRoadLook.v1');

let asphaltTexture = null;
function dustyAsphalt() {
  if (asphaltTexture) return asphaltTexture;
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = size; canvas.height = size;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#34383d';
  ctx.fillRect(0, 0, size, size);
  let seed = 7;
  const rand = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  // aggregate speckle (coarse + fine)
  for (let i = 0; i < 7000; i += 1) {
    const v = 40 + Math.floor(rand() * 34);
    ctx.fillStyle = `rgba(${v},${v + 1},${v + 4},${0.2 + rand() * 0.32})`;
    ctx.fillRect(Math.floor(rand() * size), Math.floor(rand() * size), 1 + Math.floor(rand() * 2), 1 + Math.floor(rand() * 2));
  }
  // worn pale grit
  for (let i = 0; i < 260; i += 1) {
    ctx.fillStyle = `rgba(150,148,140,${0.06 + rand() * 0.1})`;
    ctx.fillRect(Math.floor(rand() * size), Math.floor(rand() * size), 1, 1);
  }
  // darker bitumen smears
  for (let i = 0; i < 18; i += 1) {
    ctx.fillStyle = 'rgba(18,20,23,0.07)';
    ctx.fillRect(Math.floor(rand() * size), Math.floor(rand() * size), 8 + Math.floor(rand() * 34), 2 + Math.floor(rand() * 6));
  }
  // oil / diesel drip stains
  for (let i = 0; i < 4; i += 1) {
    const x = rand() * size, y = rand() * size, r = 5 + rand() * 9;
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, 'rgba(10,11,13,0.38)'); g.addColorStop(1, 'rgba(10,11,13,0)');
    ctx.fillStyle = g; ctx.fillRect(x - r, y - r, r * 2, r * 2);
  }
  // patched repairs: slightly different tar with a hard edge
  for (let i = 0; i < 2; i += 1) {
    const w = 30 + rand() * 40, h = 14 + rand() * 24, x = rand() * (size - w), y = rand() * (size - h);
    ctx.fillStyle = 'rgba(26,28,31,0.34)'; ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = 'rgba(86,88,92,0.35)'; ctx.lineWidth = 1; ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
  }
  // hairline cracks
  ctx.strokeStyle = 'rgba(14,15,17,0.5)'; ctx.lineWidth = 1;
  for (let i = 0; i < 5; i += 1) {
    let x = rand() * size, y = rand() * size;
    ctx.beginPath(); ctx.moveTo(x, y);
    for (let k = 0; k < 6; k += 1) { x += (rand() - 0.5) * 22; y += (rand() - 0.5) * 22; ctx.lineTo(x, y); }
    ctx.stroke();
  }
  // small pot-hole shadows
  for (let i = 0; i < 1; i += 1) {
    const x = rand() * size, y = rand() * size, rx = 4 + rand() * 4, ry = 3 + rand() * 3;
    ctx.fillStyle = 'rgba(8,9,10,0.4)'; ctx.beginPath(); ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = 'rgba(110,108,102,0.35)'; ctx.beginPath(); ctx.ellipse(x, y - 0.8, rx + 0.6, ry + 0.6, 0, Math.PI, Math.PI * 2); ctx.stroke();
  }
  asphaltTexture = new THREE.CanvasTexture(canvas);
  asphaltTexture.wrapS = THREE.RepeatWrapping;
  asphaltTexture.wrapT = THREE.RepeatWrapping;
  asphaltTexture.colorSpace = THREE.SRGBColorSpace;
  asphaltTexture.anisotropy = 4;
  return asphaltTexture;
}

function applyTexture(material, repeat) {
  if (!material) return;
  const base = dustyAsphalt();
  if (material.map && material.map.userData?.kanoDusty) return;
  const map = base.clone();
  map.needsUpdate = true;
  map.userData = { kanoDusty: true };
  map.repeat.set(repeat[0], repeat[1]);
  material.map = map;
  material.color?.set(0xffffff);
  material.needsUpdate = true;
}

const LOOP_FAR = 215;
const KERB_STEP = 2.9;

function buildFootpath(renderer, k) {
  if (k.__kanoFootpath) return;
  const mat = (color, rough) => {
    const m = renderer.material(color, rough);
    m.userData = m.userData || {};
    m.userData.kanoNoShift = true;
    return m;
  };
  // pale paved footpath beyond the oncoming carriageway (x -15.2 to -17.6), as in the photos
  const path = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 250), mat(0xb8b4aa, 1));
  path.rotation.x = -Math.PI / 2;
  path.position.set(-16.4, 0.02, -92);
  path.name = 'KANO_FOOTPATH_PAVING';
  k.group.add(path);
  // navy-and-white kerb blocks along the road edge of the footpath
  const positions = [];
  for (let z = 10; z > -LOOP_FAR; z -= KERB_STEP) positions.push(z);
  const geometry = new THREE.BoxGeometry(0.26, 0.2, KERB_STEP - 0.06);
  const mesh = new THREE.InstancedMesh(geometry, mat(0xffffff, 0.95), positions.length);
  const dummy = new THREE.Object3D();
  const navy = new THREE.Color(0x202326); const white = new THREE.Color(0xf1efe6);
  positions.forEach((z, i) => {
    dummy.position.set(-15.35, 0.1, z); dummy.updateMatrix();
    mesh.setMatrixAt(i, dummy.matrix); mesh.setColorAt(i, i % 2 ? white : navy);
  });
  mesh.instanceMatrix.needsUpdate = true;
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  mesh.frustumCulled = false;
  const root = new THREE.Group();
  root.add(mesh);
  root.userData.period = KERB_STEP * 2;
  k.group.add(root);
  k.roots.push(root);   // scrolls with the rest of the two-way road
  k.__kanoFootpath = true;
}

function recolour(renderer) {
  const world = renderer.world;
  if (!world) return;
  // player's carriageway
  const road = world.children.find((c) => c.geometry?.parameters?.width === 10 && c.geometry?.parameters?.height === 250);
  if (road) applyTexture(road.material, road.material?.map ? [road.material.map.repeat.x, road.material.map.repeat.y] : [3, 64]);
  const k = renderer.__kanoTwoWay;
  if (k) {
    applyTexture(k.asphaltMaterial, [2.4, 64]);
    k.hasMap = true; // stop the original code from putting its dark texture back
    buildFootpath(renderer, k);
  }
  const right = world.getObjectByName('KANO_RIGHT_SAND_VERGE');
  if (right?.material && right.material.color.getHex() !== 0xb4b1a8) { right.material.color.set(0xb4b1a8); if (right.material.map) right.material.map = null; right.material.needsUpdate = true; }
}

if (typeof window !== 'undefined' && Renderer3D?.prototype && !Renderer3D.prototype[PATCH]) {
  Object.defineProperty(Renderer3D.prototype, PATCH, { value: true });
  const draw = Renderer3D.prototype.draw;
  let last = 0;
  if (typeof draw === 'function') {
    Renderer3D.prototype.draw = function drawWithDustyRoad(...args) {
      const now = performance.now();
      if (now - last > 1000) {
        last = now;
        try { if (this.lifeScene === 'road') recolour(this); } catch (error) { console.warn('[Kano Life] Dusty road look skipped safely.', error); }
      }
      return draw.apply(this, args);
    };
  }
}
