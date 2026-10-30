/**
 * Gentle road bends. The game's road is a straight 1-D strip, so the bend is a
 * pure view effect: every vertex is pushed sideways in camera space by
 * k * depth^2 (the classic "curved world" shader). The road, kerbs, flyover,
 * traffic and scenery all bend together, so nothing separates; driving, lanes
 * and collisions are untouched because the keke sits at depth ~0.
 *
 * It only touches the built-in vertex projection chunk and a shared uniform, so
 * it costs nothing measurable on the GPU.
 */
import * as THREE from 'three';
import { Renderer3D } from './renderer3d.js';

const SHARED = { value: 0 };
const PATCHED = Symbol.for('kano.life.curvedWorld.v1');

if (!THREE.ShaderChunk[PATCHED] && THREE.ShaderChunk.project_vertex && THREE.ShaderChunk.fog_pars_vertex) {
  THREE.ShaderChunk.fog_pars_vertex += '\nuniform float kanoCurve;\n';
  THREE.ShaderChunk.project_vertex = THREE.ShaderChunk.project_vertex.replace(
    'mvPosition = modelViewMatrix * mvPosition;',
    'mvPosition = modelViewMatrix * mvPosition;\n\tmvPosition.x += kanoCurve * mvPosition.z * mvPosition.z;',
  );
  const original = THREE.Material.prototype.onBeforeCompile;
  THREE.Material.prototype.onBeforeCompile = function kanoCurveBeforeCompile(shader, renderer) {
    if (shader?.uniforms) shader.uniforms.kanoCurve = SHARED;
    return original.call(this, shader, renderer);
  };
  Object.defineProperty(THREE.ShaderChunk, PATCHED, { value: true, enumerable: false });
}

let phase = 0;
let eased = 0;
const MAX_BEND = 0.00055; // about 5.5 m sideways at 100 m on the biggest bend

if (typeof window !== 'undefined') window.kanoCurvedWorld = { shared: SHARED, off: () => { SHARED.value = 0; Renderer3D.prototype.__kanoCurveOff = true; } };

if (!Renderer3D.prototype[PATCHED]) {
  const draw = Renderer3D.prototype.draw;
  if (typeof draw === 'function') {
    Renderer3D.prototype.draw = function drawWithCurvedWorld(state, deltaSeconds, ...args) {
      try {
        if (!this.__kanoCurveFlushed && this.scene) {
          // Materials compiled before this module loaded need one recompile to bend.
          this.__kanoCurveFlushed = true;
          this.scene.traverse((o) => {
            const m = o.material;
            (Array.isArray(m) ? m : [m]).forEach((x) => { if (x) x.needsUpdate = true; });
          });
        }
        const dt = Math.max(0, Math.min(0.05, Number(deltaSeconds) || 0));
        const road = this.lifeScene === 'road' && !Renderer3D.prototype.__kanoCurveOff;
        const speed = Math.abs(Number(state?.speed) || 0);
        phase += speed * dt * 0.0016;
        // Two slow sines so bends vary in length and direction, with long straights.
        const wave = Math.sin(phase) * 0.7 + Math.sin(phase * 0.43 + 1.3) * 0.5;
        const shaped = Math.sign(wave) * Math.max(0, Math.abs(wave) - 0.25) / 0.95;
        const target = road ? Math.max(-1, Math.min(1, shaped)) * MAX_BEND : 0;
        eased += (target - eased) * Math.min(1, dt * 1.2);
        SHARED.value = typeof window !== 'undefined' && typeof window.kanoCurvedWorld?.force === 'number' ? window.kanoCurvedWorld.force : eased;
      } catch (_) { SHARED.value = 0; }
      return draw.call(this, state, deltaSeconds, ...args);
    };
  }
  Object.defineProperty(Renderer3D.prototype, PATCHED, { value: true, configurable: false });
}
