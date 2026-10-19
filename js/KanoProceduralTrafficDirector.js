const clamp = (v, min, max) => Math.max(min, Math.min(max, v));
const DEFAULT_MIX = Object.freeze({ keke: 0.4, motorcycle: 0.3, car: 0.3 });
const random = (min, max) => min + Math.random() * (max - min);

/** Recycles caller-provided vehicle objects around a road; does not assume asset paths. */
export class KanoProceduralTrafficDirector {
  constructor({ scene, lanes = [-3.2, 0, 3.2], nearZ = 28, farZ = -180, poolSize = 18, mix = DEFAULT_MIX, createVehicle, onNearMiss = () => {}, onCollision = () => {}, mobile = false } = {}) {
    if (!scene || typeof createVehicle !== 'function') throw new Error('KanoProceduralTrafficDirector requires scene and createVehicle({type,laneIndex})');
    this.scene = scene; this.lanes = lanes; this.nearZ = nearZ; this.farZ = farZ;
    this.poolSize = clamp(Math.floor(poolSize), 4, mobile ? 12 : 36); this.mix = mix; this.createVehicle = createVehicle;
    this.onNearMiss = onNearMiss; this.onCollision = onCollision; this.actors = []; this.elapsed = 0; this.lastNearMissAt = -10; this.disposed = false;
    for (let i = 0; i < this.poolSize; i++) this.actors.push(this.makeActor(i));
  }
  chooseType() {
    const entries = Object.entries(this.mix).filter(([, w]) => Number(w) > 0);
    const total = entries.reduce((s, [, w]) => s + Number(w), 0) || 1;
    let roll = Math.random() * total;
    for (const [type, weight] of entries) { roll -= Number(weight); if (roll <= 0) return type; }
    return 'car';
  }
  makeActor(index) {
    const type = this.chooseType(); const laneIndex = Math.floor(Math.random() * this.lanes.length);
    const root = this.createVehicle({ type, laneIndex, index });
    if (!root || !root.position) throw new Error(`createVehicle must return a Three.js Object3D for ${type}`);
    this.scene.add(root);
    const actor = { root, type, laneIndex, speed: random(5, 18), z: random(this.farZ, this.nearZ), active: true, nearMissed: false, id: index };
    this.place(actor, actor.z); return actor;
  }
  place(actor, z) {
    actor.z = z; actor.root.position.x = this.lanes[actor.laneIndex] ?? 0; actor.root.position.z = z;
    actor.root.position.y = Number.isFinite(actor.root.position.y) ? actor.root.position.y : 0;
    actor.root.visible = true; actor.nearMissed = false;
  }
  recycle(actor) {
    actor.type = this.chooseType(); actor.laneIndex = Math.floor(Math.random() * this.lanes.length); actor.speed = random(5, 18);
    // A caller may optionally supply a setter for models that differ by vehicle type.
    if (typeof actor.root.userData?.setTrafficType === 'function') actor.root.userData.setTrafficType(actor.type);
    this.place(actor, this.farZ - random(0, 70));
  }
  update(dt, { playerZ = 0, playerX = 0, playerSpeed = 0, playerLane = null, paused = false } = {}) {
    if (this.disposed || paused || !Number.isFinite(dt) || dt <= 0) return;
    const step = Math.min(dt, 0.08); this.elapsed += step;
    for (const actor of this.actors) {
      // Traffic approaches the player; use player speed as a soft relative-speed influence.
      const relativeSpeed = actor.speed + Math.max(0, Number(playerSpeed) || 0) * 0.18;
      this.placeZ(actor, actor.z + relativeSpeed * step);
      const dz = actor.z - playerZ;
      const dx = (this.lanes[actor.laneIndex] ?? 0) - playerX;
      if (!actor.nearMissed && Math.abs(dz) < 2.4 && Math.abs(dx) < 1.35) {
        actor.nearMissed = true; try { this.onCollision({ actor, dz, dx }); } catch {}
      } else if (!actor.nearMissed && Math.abs(dz) < 6 && Math.abs(dx) < 2.0 && this.elapsed - this.lastNearMissAt > 1.2) {
        actor.nearMissed = true; this.lastNearMissAt = this.elapsed; try { this.onNearMiss({ actor, dz, dx }); } catch {}
      }
      if (actor.z > this.nearZ) this.recycle(actor);
    }
  }
  placeZ(actor, z) { actor.z = z; actor.root.position.z = z; }
  setMix(mix) { if (mix && typeof mix === 'object') this.mix = { ...mix }; }
  dispose({ removeFromScene = true, disposeGeometry = false } = {}) {
    if (this.disposed) return; this.disposed = true;
    for (const actor of this.actors) {
      if (removeFromScene) this.scene.remove(actor.root);
      // Geometry/material ownership stays with the caller by default to protect shared GLB assets.
      if (disposeGeometry) {
        actor.root.traverse?.(node => { node.geometry?.dispose?.(); if (Array.isArray(node.material)) node.material.forEach(m => m?.dispose?.()); else node.material?.dispose?.(); });
      }
    }
    this.actors.length = 0;
  }
}
