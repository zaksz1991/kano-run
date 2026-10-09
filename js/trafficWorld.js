import * as THREE from '../vendor/three.module.js';

const LANES = [-2.4, 0, 2.4];
const TAU = Math.PI * 2;

function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
function fract(v) { return v - Math.floor(v); }
function seeded(v) { return fract(Math.sin(v * 12.9898) * 43758.5453); }

function vehicleHalfLength(vehicle) {
  return vehicle.userData?.isKeke ? 1.2 : 1.8;
}

function vehicleHalfWidth(vehicle) {
  return vehicle.userData?.isKeke ? 0.72 : 0.9;
}

const MIN_FOLLOW_GAP = 4.8;
const SAFE_FOLLOW_GAP = 12;

function mat(THREERef, color, roughness = 0.9, metalness = 0) {
  return new THREERef.MeshStandardMaterial({ color, roughness, metalness });
}

function box(THREERef, parent, size, pos, material) {
  const m = new THREERef.Mesh(new THREERef.BoxGeometry(...size), material);
  m.position.set(...pos);
  m.castShadow = true;
  m.receiveShadow = true;
  parent.add(m);
  return m;
}

function sphere(THREERef, parent, radius, pos, material, scale = [1, 1, 1]) {
  const m = new THREERef.Mesh(new THREERef.SphereGeometry(radius, 12, 9), material);
  m.position.set(...pos);
  m.scale.set(...scale);
  m.castShadow = true;
  m.receiveShadow = true;
  parent.add(m);
  return m;
}

function makeAmbientCar(THREERef, variant = 0) {
  const g = new THREERef.Group();
  const colors = [0x858b91, 0x4b5960, 0x9a9b92, 0x6b7376, 0xb4a98e, 0x3e4b52];
  const body = mat(THREERef, colors[variant % colors.length], 0.62, 0.04);
  const dark = mat(THREERef, 0x171c20, 0.86, 0.02);
  const glass = mat(THREERef, 0x25383e, 0.2, 0.06);
  const tire = mat(THREERef, 0x151719, 0.98, 0);
  const lamp = mat(THREERef, 0xf5e5bb, 0.3, 0, { emissive: 0xe2b86b, emissiveIntensity: 0.12 });

  box(THREERef, g, [1.78, 0.48, 3.55], [0, 0.62, 0], body);
  box(THREERef, g, [1.52, 0.62, 1.65], [0, 1.05, 0.15], glass);
  box(THREERef, g, [1.55, 0.12, 1.85], [0, 1.4, 0.12], dark);
  for (const x of [-0.78, 0.78]) {
    sphere(THREERef, g, 0.075, [x, 0.72, -1.72], lamp, [1.1, .75, .45]);
  }
  for (const z of [-1.15, 1.15]) {
    for (const x of [-0.9, 0.9]) {
      const wheel = new THREERef.Group();
      wheel.position.set(x, 0.38, z);
      wheel.rotation.z = Math.PI / 2;
      const t = new THREERef.Mesh(new THREERef.CylinderGeometry(.28, .28, .14, 14), tire);
      t.castShadow = true;
      wheel.add(t);
      g.add(wheel);
      g.userData.wheels ??= [];
      g.userData.wheels.push(wheel);
    }
  }
  return g;
}

function makeAmbientKeke(THREERef, variant = 0) {
  const g = new THREERef.Group();
  const yellow = [0xd8a927, 0xe0bb32, 0xc99720, 0xf0c43b][variant % 4];
  const body = mat(THREERef, yellow, 0.62, 0.03);
  const dark = mat(THREERef, 0x171b1e, 0.86, 0.02);
  const glass = mat(THREERef, 0x22363e, 0.22, 0.04);
  const tire = mat(THREERef, 0x17191b, 0.98, 0);
  box(THREERef, g, [1.42, .38, 2.35], [0, .75, 0], body);
  box(THREERef, g, [1.3, .12, 2.05], [0, 1.85, 0], dark);
  box(THREERef, g, [1.16, .72, .08], [0, 1.45, -0.94], glass);
  box(THREERef, g, [.08, .9, 2.02], [-.62, 1.4, 0], dark);
  box(THREERef, g, [.08, .9, 2.02], [.62, 1.4, 0], dark);
  for (const z of [-.72, .72]) {
    for (const x of [-.72, .72]) {
      const w = new THREERef.Group();
      w.position.set(x, .42, z);
      w.rotation.z = Math.PI / 2;
      const t = new THREERef.Mesh(new THREERef.CylinderGeometry(.23, .23, .14, 14), tire);
      w.add(t); g.add(w); g.userData.wheels ??= []; g.userData.wheels.push(w);
    }
  }
  return g;
}

function makePedestrian(THREERef, variant = 0) {
  const g = new THREERef.Group();
  const skin = mat(THREERef, [0x5a3828, 0x6a432d, 0x754a32, 0x81563e][variant % 4]);
  const cloth = mat(THREERef, [0x3c6071, 0x6f4c3c, 0x6f7541, 0x79506d, 0x8b7657][variant % 5]);
  const dark = mat(THREERef, 0x202326, 0.96);
  sphere(THREERef, g, .145, [0, 1.18, 0], skin, [.92, 1.05, .92]);
  box(THREERef, g, [.27, .47, .2], [0, .82, 0], cloth);
  const la = box(THREERef, g, [.075, .43, .07], [-.17, .83, 0], skin);
  const ra = box(THREERef, g, [.075, .43, .07], [.17, .83, 0], skin);
  const ll = box(THREERef, g, [.08, .5, .08], [-.075, .32, 0], dark);
  const rl = box(THREERef, g, [.08, .5, .08], [.075, .32, 0], dark);
  g.userData.parts = { la, ra, ll, rl };
  return g;
}

export class TrafficWorld {
  constructor(THREERef, renderer, options = {}) {
    this.THREE = THREERef;
    this.renderer = renderer;
    this.quality = options.quality || 'high';
    this.group = new THREERef.Group();
    this.group.name = 'ambient-kano-life';
    renderer.world.add(this.group);
    this.traffic = [];
    this.people = [];
    this.elapsed = 0;
    this.lastRoadOffset = 0;
    this.build();
  }

  build() {
    const trafficCount = this.quality === 'low' ? 5 : this.quality === 'medium' ? 8 : 12;
    const personCount = this.quality === 'low' ? 6 : this.quality === 'medium' ? 10 : 16;

    for (let i = 0; i < trafficCount; i += 1) {
      const isKeke = i % 3 === 0;
      const mesh = isKeke ? makeAmbientKeke(this.THREE, i) : makeAmbientCar(this.THREE, i);
      const direction = i % 4 === 0 ? -1 : 1;
      const lane = i % 3;
      mesh.userData.trafficId = i;
      mesh.userData.speed = (isKeke ? .9 : 1.05) + seeded(i + 4) * .65;
      mesh.userData.baseSpeed = mesh.userData.speed;
      mesh.userData.lane = lane;
      mesh.userData.homeLane = lane;
      mesh.userData.targetLane = lane;
      mesh.userData.direction = direction;
      mesh.userData.phase = seeded(i + 10) * 20;
      mesh.userData.laneCooldown = 0;
      mesh.userData.avoidUntil = 0;
      mesh.userData.speedScale = 1;
      mesh.userData.isKeke = isKeke;
      mesh.position.set(LANES[lane], .02, -28 - i * 13);
      if (mesh.userData.direction < 0) mesh.rotation.y = Math.PI;
      this.group.add(mesh);
      this.traffic.push(mesh);
    }

    for (let i = 0; i < personCount; i += 1) {
      const p = makePedestrian(this.THREE, i);
      p.userData.side = i % 2 === 0 ? -1 : 1;
      p.userData.speed = .65 + seeded(i * 4.3) * .45;
      p.userData.phase = seeded(i * 8.1) * TAU;
      p.userData.baseZ = -52 + seeded(i * 3.7) * 112;
      p.position.set(p.userData.side * (6.8 + seeded(i + 21) * 1.7), 0, p.userData.baseZ);
      p.rotation.y = p.userData.side < 0 ? 0 : Math.PI;
      this.group.add(p);
      this.people.push(p);
    }
  }

  recycleTraffic(v) {
    const dir = v.userData.direction;
    const needsRecycle = (dir > 0 && v.position.z > 34) || (dir < 0 && v.position.z < -145);
    if (!needsRecycle) return;

    const candidateLanes = [0, 1, 2].sort((a, b) => {
      const da = Math.abs(a - v.userData.homeLane);
      const db = Math.abs(b - v.userData.homeLane);
      return da - db;
    });
    const baseZ = dir > 0
      ? -145 - seeded(this.elapsed * 3 + v.userData.phase) * 48
      : 38 + seeded(this.elapsed * 2 + v.userData.phase) * 28;

    let chosenLane = v.userData.homeLane;
    let chosenZ = baseZ;
    let found = false;

    // A recycle point must be clear of traffic from BOTH directions, not just
    // vehicles travelling the same way. Never fall back to an occupied spawn.
    for (const lane of candidateLanes) {
      let testZ = baseZ;
      for (let attempt = 0; attempt < 28; attempt += 1) {
        const occupied = this.traffic.some((other) => {
          if (other === v) return false;
          const targetLane = Number.isFinite(other.userData.targetLane)
            ? other.userData.targetLane
            : other.userData.lane;
          const sharesLane =
            Math.abs(other.position.x - LANES[lane]) < 1.5 || targetLane === lane;
          return sharesLane && Math.abs(other.position.z - testZ) < SAFE_FOLLOW_GAP;
        });
        if (!occupied) {
          chosenLane = lane;
          chosenZ = testZ;
          found = true;
          break;
        }
        testZ -= dir * SAFE_FOLLOW_GAP;
      }
      if (found) break;
    }

    if (!found) {
      // Dense traffic: place the recycled vehicle beyond the entire traffic pack.
      // This preserves the pool without spawning a vehicle inside another one.
      const otherZ = this.traffic
        .filter((other) => other !== v)
        .map((other) => other.position.z)
        .filter(Number.isFinite);
      const edge = otherZ.length
        ? (dir > 0 ? Math.min(...otherZ) : Math.max(...otherZ))
        : baseZ;
      chosenLane = candidateLanes[candidateLanes.length - 1];
      chosenZ = dir > 0 ? Math.min(baseZ, edge - SAFE_FOLLOW_GAP * 2) : Math.max(baseZ, edge + SAFE_FOLLOW_GAP * 2);
    }

    v.userData.lane = chosenLane;
    v.userData.targetLane = chosenLane;
    v.userData.laneCooldown = 0.7;
    v.userData.speedScale = 0.6;
    v.userData.holdForHeadOn = false;
    v.position.x = LANES[chosenLane];
    v.position.z = chosenZ;
  }

  findOpenLane(v) {
    const current = Number.isFinite(v.userData.targetLane) ? v.userData.targetLane : v.userData.lane;
    const candidates = [0, 1, 2]
      .filter((lane) => lane !== current)
      .sort((a, b) => Math.abs(a - current) - Math.abs(b - current));

    for (const lane of candidates) {
      const x = LANES[lane];
      const blocked = this.traffic.some((other) => {
        if (other === v) return false;
        const closeAheadOrBehind = Math.abs(other.position.z - v.position.z) < 17;
        const occupiesLane = Math.abs(other.position.x - x) < 1.55 ||
          Math.abs(LANES[other.userData.targetLane ?? other.userData.lane] - x) < 0.25;
        return closeAheadOrBehind && occupiesLane;
      });
      if (!blocked) return lane;
    }
    return null;
  }

  updateTraffic(dt, gameSpeed = 1) {
    const playerSpeed = clamp(Number(gameSpeed) || 1, .25, 2.5);
    const frameStep = Math.max(0, Math.min(Number(dt) || 0, 0.05));

    for (const v of this.traffic) {
      v.userData.previousX = v.position.x;
      v.userData.previousZ = v.position.z;
      v.userData.holdForHeadOn = false;
      v.userData.laneCooldown = Math.max(0, (v.userData.laneCooldown || 0) - frameStep);
    }

    // Reserve escape space before vehicles reach one another. A cooldown must
    // never prevent an emergency avoidance manoeuvre.
    for (const v of this.traffic) {
      for (const other of this.traffic) {
        if (other === v || other.userData.direction === v.userData.direction) continue;
        if ((v.userData.trafficId || 0) < (other.userData.trafficId || 0)) continue;

        const dz = other.position.z - v.position.z;
        const gap = Math.abs(dz);
        const approaching = dz * v.userData.direction > 0;
        const sameCorridor = Math.abs(v.position.x - other.position.x) < 1.7;
        const sameTargetLane =
          v.userData.targetLane === other.userData.targetLane &&
          Math.abs(dz) < 22;
        if ((!sameCorridor && !sameTargetLane) || !approaching || gap > 22) continue;

        const lane = this.findOpenLane(v);
        if (lane !== null && lane !== v.userData.targetLane) {
          v.userData.targetLane = lane;
          v.userData.lane = lane;
          v.userData.laneCooldown = 1.25;
          v.userData.avoidUntil = this.elapsed + 1.7;
          v.userData.speedScale = Math.min(v.userData.speedScale || 1, 0.62);
        } else if (lane === null) {
          // If all lanes are occupied, both vehicles wait at a safe distance.
          // The pair is reconsidered every frame as traffic moves away.
          v.userData.holdForHeadOn = true;
          other.userData.holdForHeadOn = true;
        }
        break;
      }
    }

    for (const v of this.traffic) {
      const dir = v.userData.direction;
      const lane = Number.isFinite(v.userData.targetLane) ? v.userData.targetLane : v.userData.lane;
      const targetX = LANES[lane];
      let targetSpeedScale = v.userData.holdForHeadOn ? 0 : 1;
      let nearestAhead = null;
      let nearestGap = Infinity;

      // Same-direction traffic follows the closest vehicle in its current or target lane.
      for (const other of this.traffic) {
        if (other === v || other.userData.direction !== dir) continue;
        const otherLane = Number.isFinite(other.userData.targetLane) ? other.userData.targetLane : other.userData.lane;
        const laneAligned = Math.abs(LANES[otherLane] - targetX) < 0.3 || Math.abs(other.position.x - targetX) < 0.9;
        if (!laneAligned) continue;

        const gap = (other.position.z - v.position.z) * dir;
        if (gap > 0 && gap < nearestGap) {
          nearestGap = gap;
          nearestAhead = other;
        }
      }

      if (nearestAhead) {
        const desiredGap = SAFE_FOLLOW_GAP + vehicleHalfLength(v) + vehicleHalfLength(nearestAhead);
        if (nearestGap < desiredGap) {
          targetSpeedScale = Math.min(targetSpeedScale, clamp(
            (nearestGap - MIN_FOLLOW_GAP) / Math.max(desiredGap - MIN_FOLLOW_GAP, 1),
            0.04,
            1
          ));
        }
      }

      const oldScale = Number.isFinite(v.userData.speedScale) ? v.userData.speedScale : 1;
      v.userData.speedScale = oldScale + (targetSpeedScale - oldScale) * Math.min(frameStep * 4.5, 1);
      v.position.x += (targetX - v.position.x) * Math.min(frameStep * 3.2, 1);
      const step = dir * v.userData.speed * (5.5 + playerSpeed * 4.5) * frameStep * v.userData.speedScale;
      v.position.z += step;

      if (nearestAhead) {
        const gapNow = (nearestAhead.position.z - v.position.z) * dir;
        const minimumGap = MIN_FOLLOW_GAP + vehicleHalfLength(v) + vehicleHalfLength(nearestAhead);
        if (gapNow < minimumGap) {
          v.position.z = nearestAhead.position.z - dir * minimumGap;
          v.userData.speedScale = Math.min(v.userData.speedScale, 0.12);
        }
      }

      if (this.elapsed >= (v.userData.avoidUntil || 0) && v.userData.targetLane !== v.userData.homeLane) {
        const homeX = LANES[v.userData.homeLane];
        const homeBlocked = this.traffic.some((other) => {
          if (other === v) return false;
          return (Math.abs(other.position.x - homeX) < 1.45 || other.userData.targetLane === v.userData.homeLane) &&
            Math.abs(other.position.z - v.position.z) < 18;
        });
        if (!homeBlocked && v.userData.laneCooldown <= 0) {
          v.userData.targetLane = v.userData.homeLane;
          v.userData.lane = v.userData.homeLane;
          v.userData.laneCooldown = 1.0;
        }
      }

      const wobble = Math.sin(this.elapsed * 1.5 + v.userData.phase) * .012;
      v.rotation.z = wobble;
      for (const wheel of v.userData.wheels || []) wheel.rotation.x -= dir * frameStep * v.userData.speed * 5 * v.userData.speedScale;
      this.recycleTraffic(v);
    }

    // Final swept safety pass. It is intentionally separate from steering so
    // two vehicles cannot occupy the same space for even one rendered frame.
    for (let i = 0; i < this.traffic.length; i += 1) {
      for (let j = i + 1; j < this.traffic.length; j += 1) {
        const a = this.traffic[i];
        const b = this.traffic[j];
        const dx = Math.abs(a.position.x - b.position.x);
        const halfWidthSum = vehicleHalfWidth(a) + vehicleHalfWidth(b);
        if (dx >= halfWidthSum) continue;

        const deltaZ = b.position.z - a.position.z;
        const gap = Math.abs(deltaZ);
        const physicalGap = vehicleHalfLength(a) + vehicleHalfLength(b) + 0.45;
        if (gap >= physicalGap) continue;

        if (a.userData.direction === b.userData.direction) {
          const dir = a.userData.direction;
          const aIsTrailing = deltaZ * dir > 0;
          const follower = aIsTrailing ? a : b;
          const leader = aIsTrailing ? b : a;
          const safeGap = vehicleHalfLength(follower) + vehicleHalfLength(leader) + 0.65;
          follower.position.z = leader.position.z - dir * safeGap;
          follower.userData.speedScale = Math.min(follower.userData.speedScale, 0.12);
        } else {
          // Roll back this frame's longitudinal movement while allowing the
          // selected vehicle to finish steering out of the conflict corridor.
          const oldGap = Math.abs((b.userData.previousZ ?? b.position.z) - (a.userData.previousZ ?? a.position.z));
          if (oldGap >= physicalGap) {
            a.position.z = a.userData.previousZ;
            b.position.z = b.userData.previousZ;
          } else {
            const sign = Math.sign(deltaZ) || a.userData.direction || 1;
            const middle = (a.position.z + b.position.z) / 2;
            a.position.z = middle - sign * physicalGap / 2;
            b.position.z = middle + sign * physicalGap / 2;
          }
          a.userData.speedScale = Math.min(a.userData.speedScale, 0.08);
          b.userData.speedScale = Math.min(b.userData.speedScale, 0.08);
        }
      }
    }
  }

  updatePeople(dt, roadMotion = 1) {
    for (const p of this.people) {
      p.userData.phase += dt * p.userData.speed;
      p.position.z += (p.userData.side < 0 ? 1 : -1) * p.userData.speed * (.65 + roadMotion * .18) * dt;
      if (p.position.z > 40) p.position.z = -105;
      if (p.position.z < -110) p.position.z = 35;
      const swing = Math.sin(p.userData.phase * 4.2) * .25;
      const parts = p.userData.parts;
      parts.la.rotation.z = swing;
      parts.ra.rotation.z = -swing;
      parts.ll.rotation.z = -swing * .65;
      parts.rl.rotation.z = swing * .65;
      p.position.y = Math.abs(Math.sin(p.userData.phase * 2.1)) * .012;
    }
  }

  update(dt, gameSpeed = 1, roadOffset = 0) {
    if (!this.group) return;
    this.elapsed += dt;
    const roadDelta = Number(roadOffset) - this.lastRoadOffset;
    this.lastRoadOffset = Number(roadOffset) || 0;
    // Keep ambient roadside traffic tied to the same scrolling world as the gameplay road.
    if (Math.abs(roadDelta) > 0.0001) {
      const shift = roadDelta * 0.035;
      for (const p of this.people) p.position.z += shift;
      for (const v of this.traffic) v.position.z += shift;
    }
    this.updateTraffic(dt, gameSpeed);
    this.updatePeople(dt, gameSpeed);
  }

  dispose() {
    this.group?.parent?.remove(this.group);
    this.traffic.length = 0;
    this.people.length = 0;
  }
}

export default TrafficWorld;
