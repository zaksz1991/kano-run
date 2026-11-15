/**
 * Two-way mode: the keke's left lane carries oncoming traffic, so the middle of the road gets a solid double
 * yellow centre line between that lane and the keke's own two lanes. One-way mode has no centre line.
 */
import * as THREE from 'three';
import { Renderer3D } from './renderer3d.js';

const CENTRE_X = -1.5;   // boundary between the oncoming lane (x -3) and the keke's lanes

function build(renderer) {
  const group = new THREE.Group();
  group.name = 'KANO_CENTRE_LINE';
  const material = new THREE.MeshBasicMaterial({ color: 0xe9b800, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 });
  material.userData.kanoNoShift = true;
  for (const dx of [-0.13, 0.13]) {
    const line = new THREE.Mesh(new THREE.PlaneGeometry(0.11, 250), material);
    line.rotation.x = -Math.PI / 2;
    line.position.set(CENTRE_X + dx, 0.03, -92);
    line.frustumCulled = false;
    group.add(line);
  }
  renderer.world.add(group);
  return group;
}

if (typeof Renderer3D?.prototype?.draw === 'function' && !Renderer3D.prototype.__kanoCentreLinePatched) {
  Renderer3D.prototype.__kanoCentreLinePatched = true;
  const original = Renderer3D.prototype.draw;
  Renderer3D.prototype.draw = function kanoCentreLineDraw(state, ...rest) {
    try {
      const road = this.world && (!this.lifeScene || this.lifeScene === 'road');
      const twoWay = state?.roadMode === 'twoway';
      if (road && twoWay && !this.__kanoCentreLine) this.__kanoCentreLine = build(this);
      if (this.__kanoCentreLine) this.__kanoCentreLine.visible = Boolean(road && twoWay);
    } catch (e) { /* decorative only */ }
    return original.call(this, state, ...rest);
  };
}
