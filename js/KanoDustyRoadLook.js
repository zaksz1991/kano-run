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
  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = size; canvas.height = size;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#34383d';
  ctx.fillRect(0, 0, size, size);
  let seed = 7;
  const rand = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  for (let i = 0; i < 1800; i += 1) {
    const v = 44 + Math.floor(rand() * 26);
    ctx.fillStyle = `rgba(${v},${v + 1},${v + 4},${0.22 + rand() * 0.3})`;
    ctx.fillRect(Math.floor(rand() * size), Math.floor(rand() * size), 1 + Math.floor(rand() * 2), 1 + Math.floor(rand() * 2));
  }
  for (let i = 0; i < 14; i += 1) {
    ctx.fillStyle = 'rgba(20,22,25,0.16)';
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
