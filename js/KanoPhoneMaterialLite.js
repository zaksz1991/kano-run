/**
 * Phone GPU relief (Mali-G52 class). Loaded GLBs arrive with PBR (MeshStandard /
 * MeshPhysical) materials: every pixel runs the full PBR lighting loop, over a
 * hemisphere light, a sun and several point lights, and each variant is another
 * shader that stalls the phone for a moment when it first appears.
 *
 * On low / mid tier phones this module, every ~1.5 s:
 *   - swaps PBR materials for MeshLambert ones with the same colour, texture,
 *     transparency and vertex colours (one shared Lambert per original, so
 *     sharing is kept and far fewer shader variants exist);
 *   - shrinks very large colour textures to 512 px (low) so the phone is not
 *     holding ~190 MB of texture memory;
 *   - keeps only one point light active (the rest are the expensive part).
 * Shapes, colours and gameplay are unchanged. Desktop and 'high' phones are untouched.
 */
import * as THREE from 'three';
import { getMobileTier } from './KanoDeviceTier.js';

const SWAPPED = new WeakMap();
const SHRUNK = new WeakSet();
const INTERVAL_MS = 1500;
const MAX_NEW_PER_SWEEP = 40;

function isPhone() {
  try {
    return /Android|iPhone|iPad|Mobile/i.test(navigator.userAgent) || window.matchMedia('(pointer: coarse)').matches;
  } catch (_) { return false; }
}

function lambertFor(source) {
  let lite = SWAPPED.get(source);
  if (lite) return lite;
  lite = new THREE.MeshLambertMaterial({
    name: source.name,
    color: source.color ? source.color.clone() : new THREE.Color(0xffffff),
    map: source.map || null,
    vertexColors: Boolean(source.vertexColors),
    transparent: Boolean(source.transparent),
    opacity: source.opacity ?? 1,
    alphaTest: source.alphaTest || 0,
    side: source.side,
    emissive: source.emissive ? source.emissive.clone() : new THREE.Color(0x000000),
    emissiveMap: source.emissiveMap || null,
    emissiveIntensity: source.emissiveIntensity ?? 1,
    aoMap: source.aoMap || null,
    flatShading: Boolean(source.flatShading),
  });
  lite.userData = { ...(source.userData || {}), kanoLiteOf: source.uuid };
  // Keep PBR roughness-driven shine out; the scene is lit by hemisphere + sun.
  SWAPPED.set(source, lite);
  return lite;
}

function shrink(texture, cap) {
  if (!texture || SHRUNK.has(texture)) return;
  SHRUNK.add(texture);
  const image = texture.image;
  const w = image?.width || 0;
  const h = image?.height || 0;
  if (!w || !h || Math.max(w, h) <= cap || typeof document === 'undefined') return;
  try {
    const scale = cap / Math.max(w, h);
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(w * scale));
    canvas.height = Math.max(1, Math.round(h * scale));
    const ctx = canvas.getContext('2d');
    ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
    texture.image = canvas;
    texture.needsUpdate = true;
  } catch (_) { /* keep the original texture */ }
}

function sweep(cap) {
  const scene = window.__KANO_ACTIVE_RENDERER__?.scene;
  if (!scene) return;
  let swaps = 0;
  let pointLights = 0;
  scene.traverse((o) => {
    if (o.isPointLight) {
      pointLights += 1;
      if (pointLights > 1 && o.visible) o.visible = false;
    }
    if (!o.isMesh && !o.isSkinnedMesh) return;
    const list = Array.isArray(o.material) ? o.material : [o.material];
    let changed = false;
    const next = list.map((m) => {
      if (!m) return m;
      if (m.isMeshStandardMaterial || m.isMeshPhysicalMaterial) {
        if (swaps >= MAX_NEW_PER_SWEEP && !SWAPPED.has(m)) return m;
        if (!SWAPPED.has(m)) swaps += 1;
        changed = true;
        return lambertFor(m);
      }
      return m;
    });
    if (changed) o.material = Array.isArray(o.material) ? next : next[0];
    for (const m of next) {
      if (m?.map) shrink(m.map, cap);
      if (m?.emissiveMap) shrink(m.emissiveMap, cap);
    }
  });
}

if (typeof window !== 'undefined' && isPhone()) {
  let tier = 'low';
  try { tier = getMobileTier(); } catch (_) { /* default */ }
  if (tier !== 'high') {
    const cap = tier === 'low' ? 512 : 1024;
    window.kanoPhoneMaterialLite = { tier, cap };
    setInterval(() => { try { sweep(cap); } catch (_) { /* never break the game */ } }, INTERVAL_MS);
  }
}
