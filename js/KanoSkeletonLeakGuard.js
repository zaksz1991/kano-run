/**
 * Texture-memory leak guard. Every skinned character (pedestrians, passengers, riders)
 * uploads a small "bone texture" to the GPU. When a character is removed from the scene
 * three.js does NOT free that texture unless skeleton.dispose() is called, so a live phone
 * session slowly piles up thousands of textures (2,226 in the lab report) until frames
 * stall. This sweeper frees the bone texture of every skeleton that has left the scene.
 * three.js recreates it automatically if the character is ever shown again.
 */
const SWEEP_MS = 2000;

function start() {
  const tracked = new Set();
  window.kanoSkeletonLeak = { freed: 0, tracked: 0 };
  window.setInterval(() => {
    const R = window.__KANO_ACTIVE_RENDERER__;
    const scene = R?.scene;
    if (!scene) return;
    const live = new Set();
    scene.traverse((n) => { if (n.isSkinnedMesh && n.skeleton) live.add(n.skeleton); });
    for (const sk of live) tracked.add(sk);
    for (const sk of tracked) {
      if (live.has(sk)) continue;
      tracked.delete(sk);
      try { sk.dispose(); window.kanoSkeletonLeak.freed += 1; } catch (_) { /* already gone */ }
    }
    window.kanoSkeletonLeak.tracked = tracked.size;
  }, SWEEP_MS);
}

if (typeof window !== 'undefined' && !window.__kanoSkeletonLeakGuard) {
  window.__kanoSkeletonLeakGuard = true;
  start();
}
