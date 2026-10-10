/**
 * Kano Run — lightweight animation system (no GLB required)
 * Suspension, steering lean, wheel spin, pedestrian bob, officer gesture
 * Game Developer: Hassan Zakariya
 */
import * as THREE from '../vendor/three.module.js';

export class AnimSystem {
  constructor() {
    this.t = 0;
  }

  tick(dt = 16) {
    this.t += dt * 0.001;
  }

  /** Apply living motion to player keke group */
  animatePlayer(player, g) {
    if (!player) return;
    const spd = g.speed || 0;
    const steer = (g.smoothLane ?? g.playerLane ?? 1) - 1; // -1..1
    const bounce = g.bounce > 0 ? Math.sin(g.bounce * 0.9) * 0.12 : 0;
    const susp = Math.sin(this.t * 14 + spd) * Math.min(0.05, spd * 0.008);
    const brakeDip = g.braking ? -0.04 : 0;

    player.position.y = bounce + susp + brakeDip;
    // Chassis lean into steer
    player.rotation.z = THREE.MathUtils.lerp(player.rotation.z || 0, -steer * 0.12, 0.15);
    player.rotation.y = THREE.MathUtils.lerp(player.rotation.y || 0, steer * 0.08, 0.12);
    // Pitch on accel/brake
    const pitch = g.braking ? 0.06 : (g.throttle > 0.7 ? -0.03 : 0);
    player.rotation.x = THREE.MathUtils.lerp(player.rotation.x || 0, pitch, 0.1);

    // Wheel spin
    const spin = spd * 0.4;
    player.traverse((ch) => {
      if (!ch.isMesh) return;
      const geo = ch.geometry;
      if (geo && geo.type === 'CylinderGeometry') {
        const p = geo.parameters;
        if (p && p.radiusTop < 0.35) ch.rotation.x += spin;
      }
    });

    // Simple "driver" look: find first small box high up and nod
    // (procedural — real GLB would use AnimationMixer)
  }

  /** Bob / walk cycle for pedestrians parented under buildings group */
  animatePedestrians(group, roadOff = 0) {
    if (!group) return;
    let i = 0;
    group.traverse((ch) => {
      if (!ch.isMesh) return;
      // head spheres bob
      if (ch.geometry && ch.geometry.type === 'SphereGeometry') {
        const base = ch.userData.baseY ?? (ch.userData.baseY = ch.position.y);
        ch.position.y = base + Math.sin(this.t * 6 + i) * 0.04;
      }
      i++;
    });
  }

  /** Officer stick wave for karota meshes */
  animateKarota(mesh) {
    if (!mesh) return;
    mesh.traverse((ch) => {
      if (ch.isMesh && ch.geometry?.type === 'CylinderGeometry') {
        const p = ch.geometry.parameters;
        if (p && p.radiusTop < 0.05) {
          ch.rotation.z = 0.3 + Math.sin(this.t * 5) * 0.35;
        }
      }
    });
  }
}
