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
  const c = document.createElement('canvas');
  c.width = 128; c.height = 256;
  const g = c.getContext('2d');
  // Wide near the keke, fading with distance: radial blob stretched into a cone-like pool.
  const grad = g.createRadialGradient(64, 235, 4, 64, 150, 125);
  grad.addColorStop(0, 'rgba(255,236,190,0.95)');
  grad.addColorStop(0.35, 'rgba(255,226,160,0.5)');
  grad.addColorStop(1, 'rgba(255,220,150,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 128, 256);
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
  const pool = new THREE.Mesh(new THREE.PlaneGeometry(9, 26), mat);
  pool.rotation.x = -Math.PI / 2;
  pool.position.set(0, 0.06, -13.5);
  pool.renderOrder = 8;
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
  renderer.player.add(group);
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
