/**
 * Buildings on the far side of the oncoming carriageway, as in the Kano road photos (shop fronts and
 * pastel houses right at the road edge). Uses your own building GLBs. A handful only, so phones stay fast.
 * Visual only, scrolling at exactly the road's speed.
 */
import * as THREE from 'three';
import { Renderer3D } from './renderer3d.js';

const X = -19.5;
const PERIOD = 200;
const SPACING = 40;

function build(renderer) {
  const root = new THREE.Group();
  root.name = 'KANO_LEFT_FRONTAGE';
  const inner = new THREE.Group();
  inner.userData.period = PERIOD;
  root.add(inner);
  renderer.world.add(root);
  const count = renderer.mobile ? 4 : 8;
  const place = () => {
    if (!renderer.models?.cache?.has('building')) return false;
    for (let i = 0; i < count; i += 1) {
      const m = renderer.models.getInstance('building');
      if (!m) return true;
      m.traverse((o) => {
        if (!o.isMesh) return;
        const mats = Array.isArray(o.material) ? o.material : [o.material];
        const cloned = mats.map((mt) => { const c = mt.clone(); c.userData = { ...(c.userData || {}), kanoNoShift: true }; return c; });
        o.material = Array.isArray(o.material) ? cloned : cloned[0];
      });
      m.scale.multiplyScalar(1.9 + (i % 3) * 0.2);
      m.position.set(X - (i % 2) * 1.5, 0, 6 - i * SPACING);
      m.rotation.y = Math.PI / 2;
      inner.add(m);
    }
    return true;
  };
  return { root, inner, placed: false, place };
}

function update(renderer, state, dt) {
  const k = renderer.__kanoLeftFrontage;
  if (!k) return;
  if (!k.placed) k.placed = k.place();
  const signed = Number.isFinite(state?.signedSpeed)
    ? state.signedSpeed
    : state?.reverse ? -Math.abs(Number(state?.speed) || 0) : Math.abs(Number(state?.speed) || 0);
  const scroll = signed * Math.max(0, Math.min(0.05, dt)) * 0.28;
  k.inner.position.z = (((k.inner.position.z + scroll) % PERIOD) + PERIOD) % PERIOD;
  k.root.visible = renderer.lifeScene === 'road';
}

if (typeof window !== 'undefined' && Renderer3D?.prototype && !Renderer3D.prototype.__kanoLeftFrontage) {
  Object.defineProperty(Renderer3D.prototype, '__kanoLeftFrontage', { value: true, writable: true, configurable: true });
  const draw = Renderer3D.prototype.draw;
  if (typeof draw === 'function') {
    Renderer3D.prototype.draw = function drawWithLeftFrontage(state, dt, ...rest) {
      try {
        if (!this.__kanoLeftFrontageBuilt && this.world && this.lifeScene === 'road') {
          this.__kanoLeftFrontageBuilt = true;
          this.__kanoLeftFrontage = build(this);
        }
        if (this.__kanoLeftFrontage) update(this, state, Number(dt) || 0.016);
      } catch (error) {
        console.warn('[Kano Life] Left frontage skipped safely.', error);
        this.__kanoLeftFrontage = null;
      }
      return draw.call(this, state, dt, ...rest);
    };
  }
}
