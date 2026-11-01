/**
 * Real Kano road look, from the player's keke-window photos: pale dusty grey asphalt (not
 * near-black), a concrete median apron carrying a row of grey/white concrete jersey barriers
 * (with the existing lamp posts and trees), and a dusty sand roadside. Visual only: lanes,
 * collisions, stops and fares are untouched.
 */
import * as THREE from 'three';
import { Renderer3D } from './renderer3d.js';

const PATCH = Symbol.for('kano.life.dustyRoadLook.v1');
const MEDIAN_X = -6.2;
const LOOP_FAR = 215;
const BARRIER_STEP = 2.9;

let asphaltTexture = null;
function dustyAsphalt() {
  if (asphaltTexture) return asphaltTexture;
  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = size; canvas.height = size;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#625f5a';
  ctx.fillRect(0, 0, size, size);
  let seed = 7;
  const rand = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  for (let i = 0; i < 1800; i += 1) {
    const v = 78 + Math.floor(rand() * 50);
    ctx.fillStyle = `rgba(${v},${v - 3},${v - 10},${0.25 + rand() * 0.35})`;
    ctx.fillRect(Math.floor(rand() * size), Math.floor(rand() * size), 1 + Math.floor(rand() * 2), 1 + Math.floor(rand() * 2));
  }
  for (let i = 0; i < 14; i += 1) {
    ctx.fillStyle = 'rgba(40,38,34,0.14)';
    ctx.fillRect(Math.floor(rand() * size), Math.floor(rand() * size), 6 + Math.floor(rand() * 22), 2 + Math.floor(rand() * 5));
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

function buildBarriers(renderer, k) {
  if (k.__dustyBarriers) return;
  const material = renderer.material(0xffffff, 0.95);
  material.userData = material.userData || {};
  material.userData.kanoNoShift = true;
  const positions = [];
  for (let z = 10; z > -LOOP_FAR; z -= BARRIER_STEP) positions.push(z);
  const geometry = new THREE.BoxGeometry(0.52, 0.78, BARRIER_STEP - 0.06);
  const mesh = new THREE.InstancedMesh(geometry, material, positions.length);
  mesh.name = 'KANO_MEDIAN_JERSEY_BARRIERS';
  const dummy = new THREE.Object3D();
  const colours = [new THREE.Color(0x8f8d88), new THREE.Color(0xe9e5da)];
  positions.forEach((z, i) => {
    dummy.position.set(MEDIAN_X, 0.16 + 0.39, z);
    dummy.updateMatrix();
    mesh.setMatrixAt(i, dummy.matrix);
    mesh.setColorAt(i, colours[i % 2]);
  });
  mesh.instanceMatrix.needsUpdate = true;
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  mesh.frustumCulled = false;
  const root = new THREE.Group();
  root.add(mesh);
  root.userData.period = BARRIER_STEP * 2;
  k.group.add(root);
  k.roots.push(root); // scrolls with the rest of the two-way road
  k.__dustyBarriers = root;
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
    k.group.traverse((o) => {
      if (o.isMesh && !o.isInstancedMesh && o.geometry?.parameters?.width === 1.7 && o.geometry?.parameters?.height === 0.16) {
        o.material.color.set(0xb1ab9b);
        if (o.material.map) o.material.map = null;
      }
    });
    buildBarriers(renderer, k);
  }
  const left = world.getObjectByName('KANO_LEFT_SAND_VERGE');
  if (left?.material && left.material.color.getHex() !== 0xb9b2a2) { left.material.color.set(0xb9b2a2); if (left.material.map) left.material.map = null; left.material.needsUpdate = true; }
  const right = world.getObjectByName('KANO_RIGHT_SAND_VERGE');
  if (right?.material && right.material.color.getHex() !== 0xbdae8e) { right.material.color.set(0xbdae8e); if (right.material.map) right.material.map = null; right.material.needsUpdate = true; }
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
