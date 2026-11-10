/**
 * Removes mid-drive hitches caused by shader compilation. Each model type is compiled by the
 * GPU the first time it is drawn, which on a phone shows up as a freeze the moment a new
 * vehicle or person first appears. This module quietly compiles every cached model's shaders
 * in the background (compileAsync, so it never blocks a frame) as soon as the models load.
 * Display-neutral: temporary instances are never drawn and are removed right after.
 */
import * as THREE from 'three';
import { Renderer3D } from './renderer3d.js';

const KEY = '__kanoShaderWarmup';

if (typeof window !== 'undefined' && Renderer3D?.prototype && !Renderer3D.prototype[KEY]) {
  Object.defineProperty(Renderer3D.prototype, KEY, { value: true });
  const draw = Renderer3D.prototype.draw;
  let frame = 0;
  Renderer3D.prototype.draw = function drawWithShaderWarmup(state, dt, ...rest) {
    try {
      frame += 1;
      if (frame % 90 === 0) warm(this);
    } catch (error) {
      this.__kanoWarmDisabled = true;
    }
    return draw.call(this, state, dt, ...rest);
  };

  function warm(renderer) {
    if (renderer.__kanoWarmDisabled || renderer.__kanoWarmBusy) return;
    const gl = renderer.renderer;
    const cache = renderer.models?.cache;
    if (!gl?.compileAsync || !cache?.size || !renderer.scene || !renderer.camera) return;
    renderer.__kanoWarmed ||= new Set();
    const keys = [...cache.keys()].filter((key) => !renderer.__kanoWarmed.has(key)).slice(0, 3);
    if (!keys.length) return;
    const holder = new THREE.Group();
    holder.name = 'KANO_SHADER_WARMUP';
    holder.position.set(0, -500, 0);
    const clones = [];
    for (const key of keys) {
      renderer.__kanoWarmed.add(key);
      const instance = renderer.models.getInstance?.(key);
      if (instance) { holder.add(instance); clones.push(instance); }
    }
    if (!clones.length) return;
    renderer.scene.add(holder);
    renderer.__kanoWarmBusy = true;
    const done = () => {
      renderer.scene.remove(holder);
      holder.traverse((node) => {
        const list = Array.isArray(node.material) ? node.material : (node.material ? [node.material] : []);
        for (const material of list) material.dispose?.();   // cloned materials only; geometry/textures are shared
      });
      renderer.__kanoWarmBusy = false;
    };
    Promise.resolve(gl.compileAsync(holder, renderer.camera, renderer.scene)).then(done, done);
  }
}
