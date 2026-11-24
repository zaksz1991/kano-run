/**
 * Night: every street lamp gets a warm halo on its head, strength following the game clock.
 * One shared additive sprite material, one sprite per pole, no dynamic lights.
 */
import * as THREE from 'three';
import { Renderer3D } from './renderer3d.js';

const KEY = '__kanoNightLampGlow';

function strength(state) {
  const m = Number(state?.gameClockMinutes);
  if (!Number.isFinite(m)) return state?.night ? 1 : 0;
  const t = ((m % 1440) + 1440) % 1440;
  if (t >= 19.2 * 60 || t < 5.2 * 60) return 1;
  if (t >= 17.8 * 60) return (t - 17.8 * 60) / 84;
  if (t < 6.2 * 60) return 1 - (t - 5.2 * 60) / 60;
  return 0;
}

let mat = null;
function material() {
  if (mat) return mat;
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(32, 32, 1, 32, 32, 32);
  grad.addColorStop(0, 'rgba(255,240,200,1)');
  grad.addColorStop(0.25, 'rgba(255,214,140,0.55)');
  grad.addColorStop(1, 'rgba(255,200,120,0)');
  g.fillStyle = grad; g.fillRect(0, 0, 64, 64);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  mat = new THREE.SpriteMaterial({ map: tex, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false, fog: false });
  return mat;
}

if (typeof window !== 'undefined' && Renderer3D?.prototype && !Renderer3D.prototype[KEY]) {
  Object.defineProperty(Renderer3D.prototype, KEY, { value: true });
  const draw = Renderer3D.prototype.draw;
  Renderer3D.prototype.draw = function drawWithLampGlow(state, dt, ...rest) {
    try {
      const k = this.lifeScene === 'road' ? strength(state) : 0;
      const m = material();
      m.opacity = k;
      if (k > 0.01) {
        for (const pole of this.streetLights || []) {
          if (!pole || pole.userData.kanoLampGlow) continue;
          const box = new THREE.Box3().setFromObject(pole);
          const sprite = new THREE.Sprite(m);
          sprite.scale.set(6.5, 6.5, 1);
          const wp = new THREE.Vector3(); pole.getWorldPosition(wp);
          const top = Number.isFinite(box.max.y) && box.max.y > 2 ? box.max.y : 5.5;
          sprite.position.set(0, (top - wp.y) / (pole.scale?.y || 1) - 0.3, 0);
          sprite.renderOrder = 9;
          pole.add(sprite);
          pole.userData.kanoLampGlow = sprite;
        }
      }
    } catch (error) {
      console.warn('[Kano Life] Lamp glow skipped safely.', error);
    }
    return draw.call(this, state, dt, ...rest);
  };
}
