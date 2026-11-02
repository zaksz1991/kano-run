/**
 * Texture-memory leak guard. Every skinned character (pedestrians, passengers, riders)
 * uploads a small "bone texture" to the GPU. When a character is removed from the scene
 * three.js does NOT free that texture unless skeleton.dispose() is called, so a live phone
 * session piles up thousands of textures (2,226 in the lab report) until frames stall.
 *
 * Every skeleton that creates a bone texture is registered the moment it does, and a sweep
 * every 2 s frees the texture of each one whose bones no longer belong to any scene.
 * three.js rebuilds the texture automatically if the character is ever shown again.
 */
import * as THREE from 'three';

const SWEEP_MS = 2000;
const PATCH = Symbol.for('kano.life.skeletonLeakGuard.v2');
const tracked = new Set();
const stats = { freed: 0, tracked: 0 };

function inScene(skeleton) {
  let node = skeleton.bones?.[0];
  if (!node) return false;
  while (node.parent) node = node.parent;
  return Boolean(node.isScene);
}

if (typeof window !== 'undefined' && THREE.Skeleton?.prototype && !THREE.Skeleton.prototype[PATCH]) {
  Object.defineProperty(THREE.Skeleton.prototype, PATCH, { value: true });
  const original = THREE.Skeleton.prototype.computeBoneTexture;
  THREE.Skeleton.prototype.computeBoneTexture = function computeBoneTextureTracked(...args) {
    const result = original.apply(this, args);
    tracked.add(this);
    return result;
  };
  window.kanoSkeletonLeak = stats;
  window.setInterval(() => {
    for (const skeleton of tracked) {
      if (inScene(skeleton)) continue;
      tracked.delete(skeleton);
      try { skeleton.dispose(); stats.freed += 1; } catch (_) { /* already gone */ }
    }
    stats.tracked = tracked.size;
  }, SWEEP_MS);
}
