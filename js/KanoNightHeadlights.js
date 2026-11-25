/**
 * Night driving: the keke throws a warm pool of light on the road ahead, and two small glow
 * points mark the lamps. Built from additive textured planes (no dynamic lights) so it costs
 * almost nothing on a phone GPU. Strength follows the game clock: off by day, full from 19:30
 * to 05:00, easing in at dusk and out at dawn.
 */
import * as THREE from 'three';
import { Renderer3D } from './renderer3d.js';

const KEY = '__kanoNightHeadlights';

function nightStrength(state) {
  if (typeof window !== 'undefined' && window.__kanoForceNight) return 1;
  const m = Number(state?.gameClockMinutes);
  if (!Number.isFinite(m)) return state?.night ? 1 : 0;
  const t = ((m % 1440) + 1440) % 1440;
  if (t >= 19.5 * 60 || t < 5 * 60) return 1;
  if (t >= 18 * 60) return (t - 18 * 60) / 90;          // dusk ramp
  if (t < 6.25 * 60) return 1 - (t - 5 * 60) / 75;      // dawn ramp
  return 0;
}

function poolTexture() {
  // A straight, centred beam: strongest just ahead of the lamps, fading smoothly to nothing
  // at the start, the sides and the far end (no hard edges, no flare to either side).
  const W = 64, H = 128;
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const g = c.getContext('2d');
  const img = g.createImageData(W, H);
  for (let y = 0; y < H; y += 1) {
    const v = y / (H - 1);                       // 0 = far end, 1 = at the keke
    const along = Math.pow(1 - Math.abs(v - 0.72) / (v < 0.72 ? 0.72 : 0.28), 1.3);
    for (let x = 0; x < W; x += 1) {
      const u = Math.abs((x / (W - 1)) * 2 - 1);
      const across = Math.pow(Math.max(0, 1 - u * u), 1.6);
      const a = Math.max(0, along) * across;
      const i = (y * W + x) * 4;
      img.data[i] = 255; img.data[i + 1] = 232; img.data[i + 2] = 176; img.data[i + 3] = Math.round(a * 235);
    }
  }
  g.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function build(renderer) {
  const group = new THREE.Group();
  group.name = 'KANO_NIGHT_HEADLIGHTS';
  const mat = new THREE.MeshBasicMaterial({
    map: poolTexture(), transparent: true, opacity: 0, depthWrite: false,
    blending: THREE.AdditiveBlending, toneMapped: false, fog: false,
  });
  const pool = new THREE.Mesh(new THREE.PlaneGeometry(5.2, 24), mat);
  pool.rotation.x = -Math.PI / 2;
  pool.position.set(0, 0.06, -12.4);
  pool.renderOrder = -5;
  pool.frustumCulled = false;
  group.add(pool);
  const glowMat = new THREE.SpriteMaterial({
    map: poolTexture(), color: 0xfff1cc, transparent: true, opacity: 0, depthWrite: false,
    blending: THREE.AdditiveBlending, toneMapped: false, fog: false,
  });
  const glows = [-0.38, 0.38].map((x) => {
    const sprite = new THREE.Sprite(glowMat);
    sprite.scale.set(0.5, 0.5, 1);
    sprite.position.set(x, 0.62, -1.25);
    group.add(sprite);
    return sprite;
  });
  return { group, mat, glowMat, glows };
}

if (typeof window !== 'undefined' && Renderer3D?.prototype && !Renderer3D.prototype[KEY]) {
  Object.defineProperty(Renderer3D.prototype, KEY, { value: true });
  const draw = Renderer3D.prototype.draw;
  Renderer3D.prototype.draw = function drawWithNightHeadlights(state, dt, ...rest) {
    try {
      if (this.player && !this.__kanoNightLights) this.__kanoNightLights = build(this);
      const k = this.__kanoNightLights;
      if (k) {
        // The keke group can be rebuilt after the lights were attached; follow the live one.
        // Lights live on the scene (adding children to the keke group alters how the keke renders) and follow it.
        if (this.scene && k.group.parent !== this.scene) this.scene.add(k.group);
        if (this.player) { k.group.position.copy(this.player.position); k.group.quaternion.copy(this.player.quaternion); }
        const strength = this.lifeScene === 'road' ? nightStrength(state) : 0;
        k.group.visible = strength > 0.01;
        k.mat.opacity = 0.95 * strength;
        k.glowMat.opacity = 0.9 * strength;
      }
    } catch (error) {
      this.__kanoNightLights = null;
      console.warn('[Kano Life] Night headlights skipped safely.', error);
    }
    return draw.call(this, state, dt, ...rest);
  };
}
