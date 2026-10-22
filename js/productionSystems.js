import * as THREE from 'three';
import { save, persist } from './storage.js';

// ============================================================
// KANO LIFE — PRODUCTION SIMULATION SYSTEMS
// File: js/productionSystems.js
//
// Modular, opt-in systems for Kano Life's existing Game / UI / Renderer3D.
// Do not run duplicate built-in traffic or audio alongside these systems.
// Wire the integration points documented at the end into main.js/game.js.
// ============================================================

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const damp = (current, target, lambda, dt) =>
  THREE.MathUtils.lerp(current, target, 1 - Math.exp(-lambda * dt));
const KPH_TO_MPS = 1 / 3.6;

export const KANO_STATES = Object.freeze({
  HOME_COMPOUND: 'HOME_COMPOUND',
  ROADSIDE_MAISHAY: 'ROADSIDE_MAISHAY',
  KEKE_PARK: 'KEKE_PARK',
  THE_SHIFT: 'THE_SHIFT',
});

const STATE_SEQUENCE = [
  KANO_STATES.HOME_COMPOUND,
  KANO_STATES.ROADSIDE_MAISHAY,
  KANO_STATES.KEKE_PARK,
  KANO_STATES.THE_SHIFT,
];

// ------------------------------------------------------------
// RESOURCE OWNERSHIP
// Only dispose resources created by this module. Cached GLB geometry,
// shared textures and shared materials must be marked as shared and kept.
// ------------------------------------------------------------

function markOwned(resource) {
  if (resource) {
    resource.userData ||= {};
    resource.userData.kanoOwnedResource = true;
  }
  return resource;
}

function ownedMaterial(color, options = {}) {
  return markOwned(new THREE.MeshStandardMaterial({ color, ...options }));
}

function ownedMesh(geometry, material) {
  markOwned(geometry);
  if (Array.isArray(material)) material.forEach(markOwned);
  else markOwned(material);
  const mesh = new THREE.Mesh(geometry, material);
  mesh.userData.kanoOwnedGeometry = true;
  mesh.userData.kanoOwnedMaterial = true;
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  return mesh;
}

export function disposeOwnedSceneTree(root) {
  if (!root) return;

  const disposedGeometries = new Set();
  const disposedMaterials = new Set();
  const disposedTextures = new Set();

  root.traverse((object) => {
    if (object.geometry && (
      object.userData?.kanoOwnedGeometry ||
      object.geometry.userData?.kanoOwnedResource
    )) {
      if (!disposedGeometries.has(object.geometry)) {
        disposedGeometries.add(object.geometry);
        object.geometry.dispose();
      }
    }

    const materials = Array.isArray(object.material)
      ? object.material
      : object.material ? [object.material] : [];

    for (const material of materials) {
      if (!material || !(
        object.userData?.kanoOwnedMaterial ||
        material.userData?.kanoOwnedResource
      )) continue;

      if (disposedMaterials.has(material)) continue;
      disposedMaterials.add(material);

      for (const value of Object.values(material)) {
        if (value?.isTexture && value.userData?.kanoOwnedResource && !disposedTextures.has(value)) {
          disposedTextures.add(value);
          value.dispose();
        }
      }
      material.dispose();
    }

    if (object.isInstancedMesh) {
      object.dispose?.();
    }
  });

  root.parent?.remove(root);
}

// ============================================================
// 1. EXPLICIT MORNING-TO-SHIFT STATE MACHINE
// ============================================================

export class GameStateManager {
  constructor({ scene = null, stageBuilders = {}, onTransition = () => {} } = {}) {
    this.scene = scene;
    this.stageBuilders = stageBuilders;
    this.onTransition = onTransition;
    this.state = null;
    this.stageRoot = null;
    this.enteredAt = performance.now();
    this.disposed = false;
    this.transition(KANO_STATES.HOME_COMPOUND, { initial: true });
  }

  transition(nextState, payload = {}) {
    if (this.disposed) throw new Error('GameStateManager has been disposed.');
    if (!STATE_SEQUENCE.includes(nextState)) {
      throw new RangeError(`Invalid Kano Life state: ${nextState}`);
    }
    if (nextState === this.state) return false;

    const previousState = this.state;
    if (this.stageRoot) {
      disposeOwnedSceneTree(this.stageRoot);
      this.stageRoot = null;
    }

    this.state = nextState;
    this.enteredAt = performance.now();

    if (this.scene && nextState !== KANO_STATES.THE_SHIFT) {
      const builder = this.stageBuilders[nextState] || buildMorningStage;
      const root = builder(nextState, payload);
      if (root && root.isObject3D) {
        this.stageRoot = root;
        this.scene.add(root);
      }
    }

    this.onTransition({ previousState, state: nextState, payload });
    window.dispatchEvent(new CustomEvent('kano:production-state-change', {
      detail: { previousState, state: nextState },
    }));
    return true;
  }

  advance(payload = {}) {
    const index = STATE_SEQUENCE.indexOf(this.state);
    const next = STATE_SEQUENCE[Math.min(index + 1, STATE_SEQUENCE.length - 1)];
    return next === this.state ? false : this.transition(next, payload);
  }

  reset(payload = {}) {
    return this.transition(KANO_STATES.HOME_COMPOUND, payload);
  }

  dispose() {
    if (this.disposed) return;
    disposeOwnedSceneTree(this.stageRoot);
    this.stageRoot = null;
    this.disposed = true;
  }
}

function buildMorningStage(state) {
  const root = new THREE.Group();
  root.name = `KANO_LIFE_STAGE_${state}`;
  root.userData.kanoOwnedResource = true;

  const ground = ownedMesh(
    new THREE.PlaneGeometry(24, 22),
    ownedMaterial(state === KANO_STATES.ROADSIDE_MAISHAY ? 0xb7a078 : 0x9e967e),
  );
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -0.12;
  root.add(ground);

  const wallMat = ownedMaterial(0xc6ae83);
  const darkMat = ownedMaterial(0x5e4934);
  const roofMat = ownedMaterial(0x8e7250);
  const metalMat = ownedMaterial(0x56666a, { metalness: 0.35, roughness: 0.75 });
  const foodMat = ownedMaterial(0x9b4d28);

  if (state === KANO_STATES.HOME_COMPOUND) {
    const wall = ownedMesh(new THREE.BoxGeometry(12, 3.2, 0.3), wallMat);
    wall.position.set(0, 1.45, -5.4);
    root.add(wall);

    const door = ownedMesh(new THREE.BoxGeometry(1.2, 2.2, 0.12), darkMat);
    door.position.set(2, 1.0, -5.18);
    root.add(door);

    const well = new THREE.Group();
    const ring = ownedMesh(new THREE.CylinderGeometry(0.68, 0.74, 0.75, 16), roofMat);
    ring.position.y = 0.37;
    well.add(ring);
    const water = ownedMesh(new THREE.CircleGeometry(0.58, 16), ownedMaterial(0x287f91, { roughness: 0.35 }));
    water.rotation.x = -Math.PI / 2;
    water.position.y = 0.76;
    well.add(water);
    well.position.set(-3.2, 0, -0.4);
    root.add(well);

    const bucket = ownedMesh(new THREE.CylinderGeometry(0.22, 0.17, 0.42, 12), metalMat);
    bucket.position.set(-1.75, 0.22, 1.1);
    root.add(bucket);
  } else if (state === KANO_STATES.ROADSIDE_MAISHAY) {
    const counter = ownedMesh(new THREE.BoxGeometry(5.4, 1.05, 1.1), darkMat);
    counter.position.set(0, 0.58, -1.8);
    root.add(counter);

    const canopy = ownedMesh(new THREE.BoxGeometry(6.1, 0.18, 2.2), roofMat);
    canopy.position.set(0, 2.55, -1.8);
    root.add(canopy);

    for (const x of [-2.65, 2.65]) {
      const post = ownedMesh(new THREE.CylinderGeometry(0.07, 0.09, 2.1, 8), metalMat);
      post.position.set(x, 1.46, -1.8);
      root.add(post);
    }

    for (const x of [-1.35, 0, 1.35]) {
      const pot = ownedMesh(new THREE.CylinderGeometry(0.26, 0.2, 0.34, 12), foodMat);
      pot.position.set(x, 1.28, -1.55);
      root.add(pot);
    }
  } else if (state === KANO_STATES.KEKE_PARK) {
    const roof = ownedMesh(new THREE.BoxGeometry(9, 0.25, 5.4), roofMat);
    roof.position.set(0, 3.05, -1.7);
    root.add(roof);

    for (const x of [-4.2, 4.2]) {
      for (const z of [-3.8, 0.2]) {
        const post = ownedMesh(new THREE.CylinderGeometry(0.1, 0.12, 3, 8), metalMat);
        post.position.set(x, 1.5, z);
        root.add(post);
      }
    }

    const pad = ownedMesh(new THREE.BoxGeometry(4.2, 0.12, 2.4), ownedMaterial(0x68766d));
    pad.position.set(0, 0.05, -1.6);
    root.add(pad);
  }

  return root;
}

// ============================================================
// 2. FRAME-RATE-INDEPENDENT KEKE KINEMATICS
// ============================================================

export class KekeKinematics {
  constructor({ chassis, frontWheelPivot = null, rearWheels = [], wheelRadius = 0.29, wheelbase = 1.9 } = {}) {
    if (!chassis?.isObject3D) throw new TypeError('KekeKinematics requires a chassis Object3D.');
    this.chassis = chassis;
    this.frontWheelPivot = frontWheelPivot;
    this.rearWheels = rearWheels.filter((wheel) => wheel?.isObject3D);
    this.wheelRadius = Math.max(0.05, wheelRadius);
    this.wheelbase = Math.max(0.5, wheelbase);
    this.roll = 0;
    this.rollVelocity = 0;
    this.pitch = 0;
    this.pitchVelocity = 0;
    this.baseRotationZ = chassis.rotation.z;
    this.baseRotationX = chassis.rotation.x;
  }

  update({ dt, signedSpeedKmh = 0, steering = 0, throttle = false, brake = false, drift = false } = {}) {
    const delta = clamp(Number(dt) || 0, 0, 0.05);
    if (delta <= 0) return;

    const signedKmh = Number.isFinite(signedSpeedKmh) ? signedSpeedKmh : 0;
    const velocity = Math.abs(signedKmh) * KPH_TO_MPS;
    const steer = clamp(Number(steering) || 0, -1, 1);
    const steeringAngle = steer * 0.48;
    const lateralAcceleration = (velocity * velocity / this.wheelbase) * Math.tan(steeringAngle);
    const targetRoll = clamp(-Math.atan(lateralAcceleration / 9.81) * 0.72, -0.17, 0.17) * (drift ? 1.25 : 1);

    // Critically damped spring approximates body-roll inertia without physics-engine allocation.
    const rollAcceleration = (targetRoll - this.roll) * 34 - this.rollVelocity * 9.5;
    this.rollVelocity += rollAcceleration * delta;
    this.roll += this.rollVelocity * delta;

    const longitudinalLoad = throttle ? -0.035 : brake ? 0.055 : 0;
    const targetPitch = clamp(longitudinalLoad * clamp(velocity / 8, 0, 1), -0.045, 0.065);
    const pitchAcceleration = (targetPitch - this.pitch) * 28 - this.pitchVelocity * 8;
    this.pitchVelocity += pitchAcceleration * delta;
    this.pitch += this.pitchVelocity * delta;

    this.chassis.rotation.z = this.baseRotationZ + this.roll;
    this.chassis.rotation.x = this.baseRotationX + this.pitch;

    if (this.frontWheelPivot) {
      this.frontWheelPivot.rotation.y = damp(
        this.frontWheelPivot.rotation.y,
        steeringAngle,
        12,
        delta,
      );
    }

    const angularTravel = (signedKmh * KPH_TO_MPS / this.wheelRadius) * delta;
    for (const wheel of this.rearWheels) {
      wheel.rotation.x += angularTravel;
    }
  }
}

// ============================================================
// 3. INSTANCED INFINITE ROAD AND ROADSIDE PROP STREAMING
// ============================================================

export class InfiniteInstancedEnvironment {
  constructor(parent, { mobile = false, segmentLength = 18, segmentCount = 14 } = {}) {
    if (!parent?.isObject3D) throw new TypeError('InfiniteInstancedEnvironment requires a Three.js parent.');
    this.parent = parent;
    this.mobile = mobile;
    this.segmentLength = segmentLength;
    this.segmentCount = mobile ? Math.min(segmentCount, 10) : segmentCount;
    this.loopLength = this.segmentLength * this.segmentCount;
    this.root = new THREE.Group();
    this.root.name = 'KANO_INFINITE_INSTANCED_ENVIRONMENT';
    this.parent.add(this.root);
    this.instances = [];
    this.dummy = new THREE.Object3D();
    this.disposed = false;

    this.createRoad();
    this.createProps();
  }

  addInstances(name, geometry, material, records) {
    markOwned(geometry);
    markOwned(material);
    const mesh = new THREE.InstancedMesh(geometry, material, records.length);
    mesh.name = name;
    mesh.count = records.length;
    mesh.frustumCulled = true;
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    mesh.userData.kanoOwnedGeometry = true;
    mesh.userData.kanoOwnedMaterial = true;

    records.forEach((record, index) => {
      this.dummy.position.set(record.x, record.y, record.z);
      this.dummy.rotation.set(record.rx || 0, record.ry || 0, record.rz || 0);
      this.dummy.scale.set(record.sx || 1, record.sy || 1, record.sz || 1);
      this.dummy.updateMatrix();
      mesh.setMatrixAt(index, this.dummy.matrix);
    });

    mesh.instanceMatrix.needsUpdate = true;
    this.root.add(mesh);
    this.instances.push({ mesh, records: records.map((r) => ({ ...r })) });
    return mesh;
  }

  createRoad() {
    const records = Array.from({ length: this.segmentCount }, (_, index) => ({
      x: 0,
      y: -0.13,
      z: -this.segmentLength * index - this.segmentLength / 2,
      rx: -Math.PI / 2,
      sx: 1,
      sy: 1,
      sz: 1,
    }));

    this.addInstances(
      'KANO_ROAD_SEGMENTS_INSTANCED',
      new THREE.PlaneGeometry(12.4, this.segmentLength),
      ownedMaterial(0x454a4c, { roughness: 0.96, metalness: 0 }),
      records,
    );
  }

  createProps() {
    const shackRecords = [];
    const kioskRecords = [];
    const lightRecords = [];
    const count = this.mobile ? 10 : 20;

    for (let index = 0; index < count; index += 1) {
      const z = -14 - index * (this.loopLength / count);
      const side = index % 2 === 0 ? -1 : 1;
      shackRecords.push({ x: side * (8.8 + (index % 3) * 0.45), y: 1.25, z, sx: 1.1 + (index % 3) * 0.15, sy: 1, sz: 1 });
      kioskRecords.push({ x: -side * 7.15, y: 0.85, z: z - 5, sx: 1, sy: 1, sz: 1 });
      if (index % 2 === 0) {
        lightRecords.push({ x: side * 6.4, y: 2.5, z: z - 2, sx: 1, sy: 1, sz: 1 });
      }
    }

    this.addInstances(
      'KANO_ROADSIDE_SHACKS_INSTANCED',
      new THREE.BoxGeometry(4.5, 2.5, 3.3),
      ownedMaterial(0xb79a6c, { roughness: 1 }),
      shackRecords,
    );

    this.addInstances(
      'KANO_MAISHAY_KIOSKS_INSTANCED',
      new THREE.BoxGeometry(2.3, 1.7, 1.9),
      ownedMaterial(0x9c6141, { roughness: 0.95 }),
      kioskRecords,
    );

    this.addInstances(
      'KANO_STREETLIGHTS_INSTANCED',
      new THREE.CylinderGeometry(0.055, 0.085, 5, 6),
      ownedMaterial(0x5c6265, { metalness: 0.35, roughness: 0.7 }),
      lightRecords,
    );
  }

  update(dt, signedSpeedKmh) {
    if (this.disposed) return;
    const delta = clamp(Number(dt) || 0, 0, 0.05);
    const speed = Number.isFinite(signedSpeedKmh) ? signedSpeedKmh : 0;
    const dz = speed * delta * 0.28;
    if (Math.abs(dz) < 1e-7) return;

    for (const instance of this.instances) {
      const { mesh, records } = instance;
      for (let index = 0; index < records.length; index += 1) {
        const record = records[index];
        record.z += dz;

        if (record.z > this.segmentLength / 2) {
          record.z -= this.loopLength;
        } else if (record.z < -this.loopLength - this.segmentLength / 2) {
          record.z += this.loopLength;
        }

        this.dummy.position.set(record.x, record.y, record.z);
        this.dummy.rotation.set(record.rx || 0, record.ry || 0, record.rz || 0);
        this.dummy.scale.set(record.sx || 1, record.sy || 1, record.sz || 1);
        this.dummy.updateMatrix();
        mesh.setMatrixAt(index, this.dummy.matrix);
      }
      mesh.instanceMatrix.needsUpdate = true;
    }
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    disposeOwnedSceneTree(this.root);
    this.instances.length = 0;
  }
}

// ============================================================
// 4. FIXED FIVE-ACTOR TRAFFIC AI POOL
// ============================================================

export class TrafficAIPool {
  constructor(parent, { mobile = false, count = 5 } = {}) {
    if (!parent?.isObject3D) throw new TypeError('TrafficAIPool requires a Three.js parent.');
    this.parent = parent;
    this.root = new THREE.Group();
    this.root.name = 'KANO_FIXED_TRAFFIC_POOL';
    this.parent.add(this.root);
    this.disposed = false;
    this.dummy = new THREE.Object3D();
    this.playerBox = new THREE.Box3();
    this.actorBox = new THREE.Box3();
    this.contacts = new Set();
    this.pool = [];

    const archetypes = [
      { type: 'motorcycle', label: 'OKADA', speed: 37, lane: 0, width: 0.65, length: 1.3 },
      { type: 'bicycle', label: 'BICYCLE', speed: 11, lane: -1, width: 0.48, length: 1.45 },
      { type: 'danfo', label: 'DANFO', speed: 22, lane: 1, width: 2.25, length: 5.2 },
      { type: 'keke', label: 'KEKE', speed: 25, lane: 0, width: 1.25, length: 2.1 },
      { type: 'motorcycle', label: 'OKADA', speed: 43, lane: 1, width: 0.65, length: 1.3 },
    ].slice(0, Math.max(3, Math.min(5, count)));

    archetypes.forEach((spec, index) => {
      const actor = this.createActor(spec);
      actor.position.set(this.laneX(spec.lane, spec.type), 0, -24 - index * (mobile ? 25 : 31));
      this.root.add(actor);
      this.pool.push({
        ...spec,
        actor,
        speedKmh: spec.speed,
        direction: 1,
        phase: index * 1.71,
        baseZ: actor.position.z,
        lastDepth: actor.position.z,
        hitCooldown: 0,
      });
    });
  }

  laneX(lane, type) {
    if (type === 'bicycle') return lane < 0 ? -5.25 : 5.25;
    return [-2.0, 2.0][lane > 0 ? 1 : 0];
  }

  createActor(spec) {
    const group = new THREE.Group();
    group.name = `TRAFFIC_${spec.type.toUpperCase()}`;
    const bodyColor = spec.type === 'danfo' ? 0xd9b329 : spec.type === 'bicycle' ? 0x64756d : spec.type === 'motorcycle' ? 0x27394b : 0x3c7b84;
    const body = ownedMesh(
      new THREE.BoxGeometry(spec.width, spec.type === 'danfo' ? 1.65 : 0.72, spec.length),
      ownedMaterial(bodyColor, { roughness: 0.78, metalness: 0.06 }),
    );
    body.position.y = spec.type === 'danfo' ? 1.0 : 0.62;
    group.add(body);

    if (spec.type === 'danfo') {
      const windowBand = ownedMesh(new THREE.BoxGeometry(spec.width * 0.94, 0.42, spec.length * 0.82), ownedMaterial(0x59777e, { roughness: 0.32, metalness: 0.1 }));
      windowBand.position.y = 1.38;
      group.add(windowBand);
    } else {
      const rider = ownedMesh(new THREE.SphereGeometry(0.22, 8, 6), ownedMaterial(0x754c34));
      rider.position.set(0, 1.03, -0.04);
      group.add(rider);
    }

    const wheelCount = spec.type === 'bicycle' || spec.type === 'motorcycle' ? 2 : 4;
    for (let index = 0; index < wheelCount; index += 1) {
      const wheel = ownedMesh(new THREE.CylinderGeometry(0.19, 0.19, 0.12, 8), ownedMaterial(0x20252a, { roughness: 1 }));
      wheel.rotation.z = Math.PI / 2;
      const side = index % 2 === 0 ? -1 : 1;
      const frontOrBack = index < 2 ? -1 : 1;
      wheel.position.set(side * spec.width * 0.45, 0.2, frontOrBack * spec.length * 0.34);
      group.add(wheel);
    }

    group.userData.trafficArchetype = spec.type;
    return group;
  }

  update(dt, signedPlayerSpeedKmh, playerObject = null, gameState = null, onCollision = null) {
    if (this.disposed) return;
    const delta = clamp(Number(dt) || 0, 0, 0.05);
    const playerSpeed = Number.isFinite(signedPlayerSpeedKmh) ? signedPlayerSpeedKmh : 0;

    if (playerObject) {
      playerObject.updateWorldMatrix(true, false);
      this.playerBox.setFromObject(playerObject);
    }

    this.pool.forEach((vehicle) => {
      vehicle.hitCooldown = Math.max(0, vehicle.hitCooldown - delta);
      const relative = playerSpeed - vehicle.direction * vehicle.speedKmh;
      vehicle.actor.position.z += relative * delta * 0.28;

      if (vehicle.actor.position.z > 7.5) {
        vehicle.actor.position.z = -165 - Math.random() * 26;
        vehicle.speedKmh = clamp(vehicle.speed + (Math.random() - 0.5) * 8, 7, 48);
        vehicle.phase = Math.random() * Math.PI * 2;
      } else if (vehicle.actor.position.z < -200) {
        vehicle.actor.position.z = 7 + Math.random() * 20;
      }

      vehicle.phase += delta * (vehicle.type === 'motorcycle' ? 3.7 : 1.2);
      const weave = vehicle.type === 'motorcycle' ? Math.sin(vehicle.phase) * 0.45 : 0;
      const laneX = this.laneX(vehicle.lane, vehicle.type);
      vehicle.actor.position.x = damp(vehicle.actor.position.x, laneX + weave, 3.2, delta);
      vehicle.actor.rotation.y = vehicle.direction < 0 ? Math.PI : 0;
      vehicle.actor.rotation.z = vehicle.type === 'motorcycle' ? -weave * 0.07 : 0;

      if (playerObject && gameState && onCollision && vehicle.hitCooldown <= 0) {
        vehicle.actor.updateWorldMatrix(true, true);
        this.actorBox.setFromObject(vehicle.actor);
        if (this.playerBox.intersectsBox(this.actorBox)) {
          vehicle.hitCooldown = 1.25;
          gameState.condition = Math.max(0, (gameState.condition ?? 100) - (vehicle.type === 'danfo' ? 11 : 5));
          gameState.tyres = Math.max(0, (gameState.tyres ?? 100) - 2.5);
          gameState.invuln = Math.max(gameState.invuln ?? 0, 1.1);
          onCollision(vehicle);
        }
      }
    });
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    disposeOwnedSceneTree(this.root);
    this.pool.length = 0;
    this.contacts.clear();
  }
}

// ============================================================
// 5. THREE.Box3 PLAYER / HAZARD COLLISION CHECKER
// ============================================================

export class Box3CollisionSystem {
  constructor({ onImpact = null } = {}) {
    this.onImpact = onImpact;
    this.playerBox = new THREE.Box3();
    this.hazardBox = new THREE.Box3();
    this.activeContacts = new WeakSet();
  }

  update(player, hazards, gameState) {
    if (!player?.isObject3D || !gameState || !Array.isArray(hazards)) return [];
    player.updateWorldMatrix(true, false);
    this.playerBox.setFromObject(player);
    const impacts = [];

    for (const hazard of hazards) {
      if (!hazard?.isObject3D || !hazard.visible) continue;
      hazard.updateWorldMatrix(true, false);
      this.hazardBox.setFromObject(hazard);
      const intersects = this.playerBox.intersectsBox(this.hazardBox);

      if (!intersects) {
        this.activeContacts.delete(hazard);
        continue;
      }
      if (this.activeContacts.has(hazard) || (gameState.invuln || 0) > 0) continue;

      this.activeContacts.add(hazard);
      const isPothole = hazard.userData?.hazardType === 'pothole';
      const damage = isPothole ? 4.5 : 7.5;
      gameState.condition = Math.max(0, (gameState.condition ?? 100) - damage);
      gameState.tyres = Math.max(0, (gameState.tyres ?? 100) - (isPothole ? 8 : 3));
      gameState.invuln = Math.max(gameState.invuln || 0, isPothole ? 0.65 : 1.0);
      impacts.push({ hazard, type: isPothole ? 'pothole' : 'obstacle', damage });
      this.onImpact?.({ hazard, type: isPothole ? 'pothole' : 'obstacle', damage, gameState });
    }

    return impacts;
  }
}

// ============================================================
// 6. PURE-WATER HAWKER: SLOW DOWN + HONK TO PURCHASE
// ============================================================

export class PureWaterHawker {
  constructor({ parent, position = new THREE.Vector3(6.1, 0, -35), player, game, profile, radius = 5.0 } = {}) {
    if (!parent?.isObject3D) throw new TypeError('PureWaterHawker requires a Three.js parent.');
    this.parent = parent;
    this.player = player;
    this.game = game;
    this.profile = profile;
    this.radius = radius;
    this.position = position.clone();
    this.cooldown = 0;
    this.loopMinZ = -190;
    this.loopMaxZ = 7.5;
    this.worldPlayerPosition = new THREE.Vector3();
    this.worldVendorPosition = new THREE.Vector3();
    this.root = this.buildVendor();
    this.root.position.copy(position);
    this.parent.add(this.root);
  }

  buildVendor() {
    const root = new THREE.Group();
    root.name = 'PURE_WATER_HAWKER';
    const table = ownedMesh(new THREE.BoxGeometry(1.5, 0.72, 0.8), ownedMaterial(0x8e6543));
    table.position.y = 0.45;
    root.add(table);
    const body = ownedMesh(new THREE.CapsuleGeometry(0.22, 0.7, 3, 7), ownedMaterial(0x3b6a53));
    body.position.set(0, 1.05, -0.42);
    root.add(body);
    const head = ownedMesh(new THREE.SphereGeometry(0.18, 8, 6), ownedMaterial(0x74482f));
    head.position.set(0, 1.58, -0.42);
    root.add(head);
    for (let index = 0; index < 3; index += 1) {
      const sachet = ownedMesh(new THREE.BoxGeometry(0.13, 0.28, 0.1), ownedMaterial(0x9fd6e1, { transparent: true, opacity: 0.85 }));
      sachet.position.set(-0.35 + index * 0.3, 0.95, 0.02);
      root.add(sachet);
    }
    return root;
  }

  update(dt, signedSpeedKmh) {
    const delta = clamp(Number(dt) || 0, 0, 0.05);
    this.cooldown = Math.max(0, this.cooldown - delta);
    if (!this.root || !this.player) return;

    // Scroll the vendor with the rest of the world; positive speed means
    // scenery approaches the player, negative speed means it recedes.
    this.root.position.z += (Number(signedSpeedKmh) || 0) * delta * 0.28;
    if (this.root.position.z > this.loopMaxZ) {
      this.root.position.z = this.loopMinZ;
    } else if (this.root.position.z < this.loopMinZ - 12) {
      this.root.position.z = this.loopMaxZ;
    }

    this.player.updateWorldMatrix(true, false);
    this.root.updateWorldMatrix(true, false);
    this.player.getWorldPosition(this.worldPlayerPosition);
    this.root.getWorldPosition(this.worldVendorPosition);
    const distance = this.worldPlayerPosition.distanceTo(this.worldVendorPosition);
    this.root.userData.inPurchaseRange = distance <= this.radius && Math.abs(signedSpeedKmh) <= 8;
  }

  onHorn() {
    if (this.cooldown > 0 || !this.player || !this.game?.s || !this.profile) return false;
    const speed = Math.abs(Number(this.game.s.signedSpeed ?? this.game.s.speed) || 0);
    this.player.updateWorldMatrix(true, false);
    this.root.updateWorldMatrix(true, false);
    this.player.getWorldPosition(this.worldPlayerPosition);
    this.root.getWorldPosition(this.worldVendorPosition);
    const distance = this.worldPlayerPosition.distanceTo(this.worldVendorPosition);
    if (distance > this.radius || speed > 8) return false;

    if (!this.profile.spendBanked(50)) {
      this.game.ui?.toast?.('Pure water costs ₦50 · insufficient banked funds.');
      return false;
    }

    this.game.s.condition = Math.min(100, (this.game.s.condition ?? 100) + 5);
    this.game.s.heat = Math.max(0, (this.game.s.heat ?? 0) - 8);
    this.game.s.morale = Math.min(100, (this.game.s.morale ?? 75) + 6);
    this.cooldown = 18;
    this.game.dayCycle?.eat?.(6); // small hunger relief when the day cycle is active
    this.game.ui?.toast?.('Pure water bought · ₦50 · vehicle condition +5 · KAROTA heat −8%.');
    return true;
  }

  dispose() {
    disposeOwnedSceneTree(this.root);
    this.root = null;
  }
}

// ============================================================
// 7. HTML NARRATIVE / GIST OVERLAYS
// ============================================================

const GIST_LINES = [
  '“An ce kasuwa ta Kurmi ta cika yau.” — Kurmi Market is busy today.',
  '“Ka ji labarin wasan Kano Pillars?” — Have you heard the Kano Pillars news?',
  '“Farashin kayan abinci ya sake tashi.” — Food prices have gone up again.',
  '“A tsaya a nan, zan sauka kusa da roundabout.” — Stop here, I will get down by the roundabout.',
  '“Ruwan sama ya bar hanya da ramuka.” — The rain has left potholes on the road.',
  '“Allah ya sa a yi kasuwa lafiya yau.” — May today’s trading go well.',
];

export class NarrativeDialogueEngine {
  constructor({ host = document.body, game = null, profile = null, onAction = () => {} } = {}) {
    this.host = host;
    this.game = game;
    this.profile = profile;
    this.onAction = onAction;
    this.elapsed = 0;
    this.lastGistAt = 0;
    this.root = null;
    this.subtitle = null;
    this.dialog = null;
    this.buildUI();
  }

  buildUI() {
    if (!this.host || typeof document === 'undefined') return;
    if (!document.getElementById('kano-narrative-styles')) {
      const style = document.createElement('style');
      style.id = 'kano-narrative-styles';
      style.textContent = `
        #kano-narrative-subtitle{position:fixed;z-index:1200;left:50%;bottom:calc(84px + env(safe-area-inset-bottom));transform:translateX(-50%);width:min(92vw,720px);padding:9px 13px;border:1px solid #f5c54266;border-radius:12px;background:rgba(8,18,29,.92);color:#f4f7fb;font:600 12px/1.5 system-ui,sans-serif;text-align:center;pointer-events:none;opacity:0;transition:opacity .18s}
        #kano-narrative-subtitle.visible{opacity:1}
        #kano-narrative-dialog{position:fixed;z-index:1300;inset:0;display:none;align-items:center;justify-content:center;padding:18px;background:rgba(3,10,18,.76)}
        #kano-narrative-dialog.visible{display:flex}
        #kano-narrative-dialog .kn-card{width:min(100%,480px);padding:20px;border:1px solid #f5c54277;border-radius:18px;background:#101f30;color:#f3f7fb;box-shadow:0 22px 70px #0009;font-family:system-ui,sans-serif}
        #kano-narrative-dialog h2{margin:0 0 10px;font-size:23px;line-height:1.1}
        #kano-narrative-dialog p{font-size:13px;line-height:1.55;color:#cfdae6}
        #kano-narrative-dialog .kn-actions{display:grid;gap:8px;margin-top:15px}
        #kano-narrative-dialog button{min-height:42px;border:1px solid #ffffff22;border-radius:10px;background:#24374a;color:white;font-weight:800;padding:10px;touch-action:manipulation}
        #kano-narrative-dialog button:first-child{background:#f5c542;color:#182536;border-color:#f5c542}
      `;
      document.head.append(style);
    }

    this.subtitle = document.createElement('div');
    this.subtitle.id = 'kano-narrative-subtitle';
    this.subtitle.setAttribute('role', 'status');
    this.subtitle.setAttribute('aria-live', 'polite');

    this.dialog = document.createElement('div');
    this.dialog.id = 'kano-narrative-dialog';
    this.dialog.setAttribute('role', 'dialog');
    this.dialog.setAttribute('aria-modal', 'true');
    this.dialog.innerHTML = '<div class="kn-card"><h2 id="kn-title"></h2><p id="kn-copy"></p><div class="kn-actions" id="kn-actions"></div></div>';
    this.host.append(this.subtitle, this.dialog);
  }

  showChoices(title, copy, choices) {
    if (!this.dialog) return;
    this.dialog.querySelector('#kn-title').textContent = title;
    this.dialog.querySelector('#kn-copy').textContent = copy;
    const actions = this.dialog.querySelector('#kn-actions');
    actions.replaceChildren();

    for (const choice of choices) {
      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = choice.label;
      button.addEventListener('click', () => {
        this.dialog.classList.remove('visible');
        choice.action();
      }, { once: true });
      actions.append(button);
    }
    this.dialog.classList.add('visible');
    actions.querySelector('button')?.focus();
  }

  offerFreeRide(passenger, { fare = 0, onResolve = () => {} } = {}) {
    this.showChoices(
      'A free ride request',
      `${passenger?.name || 'The passenger'} asks for a free ride. Giving the ride up trades the fare for Family Blessing Points.`,
      [
        { label: 'ACCEPT FREE RIDE · +3 BLESSING', action: () => {
          this.profile?.addBlessingPoints?.(3);
          onResolve({ accepted: true, fareLost: Math.max(0, fare), blessingPoints: 3 });
          this.onAction({ type: 'freeRide', accepted: true, fare });
        } },
        { label: 'POLITELY DECLINE', action: () => {
          onResolve({ accepted: false, fareLost: 0, blessingPoints: 0 });
          this.onAction({ type: 'freeRide', accepted: false, fare });
        } },
      ],
    );
  }

  offerNoChange({ passenger = null, fare = 0, change = 0, onResolve = () => {} } = {}) {
    this.showChoices(
      '“Babu canji!” — No change',
      `${passenger?.name || 'The passenger'} needs ₦${Math.max(0, Math.floor(change)).toLocaleString()} change. Choose how to settle the fare.`,
      [
        { label: 'INTERMEDIATE STAND · LOSE TIME', action: () => {
          if (this.game?.s) this.game.s.elapsed = (this.game.s.elapsed || 0) + 12;
          onResolve({ choice: 'intermediate', fare, change, timePenalty: 12 });
          this.onAction({ type: 'noChange', choice: 'intermediate' });
        } },
        { label: 'GIVE UP THE CHANGE · +2 BLESSING', action: () => {
          this.profile?.addBlessingPoints?.(2);
          onResolve({ choice: 'blessing', fare, change, blessingPoints: 2 });
          this.onAction({ type: 'noChange', choice: 'blessing' });
        } },
        { label: 'ARGUE · +12 KAROTA HEAT', action: () => {
          if (this.game?.s) this.game.s.heat = clamp((this.game.s.heat || 0) + 12, 0, 100);
          onResolve({ choice: 'argue', fare, change, heatIncrease: 12 });
          this.onAction({ type: 'noChange', choice: 'argue' });
        } },
      ],
    );
  }

  showSubtitle(text, duration = 5200) {
    if (!this.subtitle) return;
    this.subtitle.textContent = text;
    this.subtitle.classList.add('visible');
    clearTimeout(this.subtitleTimer);
    this.subtitleTimer = window.setTimeout(() => {
      this.subtitle?.classList.remove('visible');
    }, duration);
  }

  update(dt, state = this.game?.s) {
    const delta = clamp(Number(dt) || 0, 0, 0.05);
    this.elapsed += delta;
    if (!state || !Array.isArray(state.passengers) || state.passengers.length === 0) return;
    if (this.elapsed - this.lastGistAt < 25) return;
    this.lastGistAt = this.elapsed;
    this.showSubtitle(GIST_LINES[Math.floor(Math.random() * GIST_LINES.length)]);
  }

  dispose() {
    clearTimeout(this.subtitleTimer);
    this.subtitle?.remove();
    this.dialog?.remove();
    this.subtitle = null;
    this.dialog = null;
  }
}

// ============================================================
// 8. LOW-LATENCY SYNTHESIZED WEB AUDIO
// ============================================================

export class SynthesizedAudioEngine {
  constructor() {
    this.context = null;
    this.engineOsc = null;
    this.engineFilter = null;
    this.engineGain = null;
    this.squealOsc = null;
    this.squealFilter = null;
    this.squealGain = null;
    this.enabled = !Boolean(save?.muted);
    this.disposed = false;
  }

  ensureContext() {
    if (this.disposed) return null;
    if (!this.context) {
      const AudioContextCtor = window.AudioContext || window.webkitAudioContext;
      if (!AudioContextCtor) return null;
      try {
        this.context = new AudioContextCtor({ latencyHint: 'interactive' });
      } catch {
        return null;
      }
    }
    if (this.context.state === 'suspended') this.context.resume().catch(() => {});
    return this.context;
  }

  start() {
    const ctx = this.ensureContext();
    if (!ctx || !this.enabled) return false;
    if (this.engineOsc) return true;

    this.engineOsc = ctx.createOscillator();
    this.engineFilter = ctx.createBiquadFilter();
    this.engineGain = ctx.createGain();
    this.engineOsc.type = 'sawtooth';
    this.engineFilter.type = 'lowpass';
    this.engineFilter.frequency.value = 380;
    this.engineGain.gain.value = 0.0001;
    this.engineOsc.connect(this.engineFilter);
    this.engineFilter.connect(this.engineGain);
    this.engineGain.connect(ctx.destination);
    this.engineOsc.start();

    this.squealOsc = ctx.createOscillator();
    this.squealFilter = ctx.createBiquadFilter();
    this.squealGain = ctx.createGain();
    this.squealOsc.type = 'triangle';
    this.squealOsc.frequency.value = 360;
    this.squealFilter.type = 'bandpass';
    this.squealFilter.frequency.value = 1050;
    this.squealFilter.Q.value = 0.8;
    this.squealGain.gain.value = 0.0001;
    this.squealOsc.connect(this.squealFilter);
    this.squealFilter.connect(this.squealGain);
    this.squealGain.connect(ctx.destination);
    this.squealOsc.start();
    return true;
  }

  update({ signedSpeedKmh = 0, throttle = false, reverse = false, drift = false, steering = 0 } = {}) {
    if (!this.enabled || !this.start() || !this.context) return;
    const ctx = this.context;
    const speed = Math.abs(Number(signedSpeedKmh) || 0);
    const gear = speed < 7 ? 0 : speed < 16 ? 1 : speed < 28 ? 2 : 3;
    const ratio = [1.0, 1.35, 1.72, 2.18][gear] * (reverse ? 0.78 : 1);
    const frequency = clamp(46 + speed * ratio + (throttle ? 8 : 0), 42, 185);
    const cutoff = clamp(260 + speed * 34 + gear * 110, 260, 4600);
    const volume = speed < 0.5 ? 0.0045 : clamp(0.006 + speed * 0.00022, 0.006, 0.026);
    const squeal = drift ? clamp(Math.abs(steering) * (speed / 35) * 0.06, 0.001, 0.055) : 0.0001;
    const now = ctx.currentTime;

    this.engineOsc.frequency.setTargetAtTime(frequency, now, 0.045);
    this.engineFilter.frequency.setTargetAtTime(cutoff, now, 0.06);
    this.engineGain.gain.setTargetAtTime(volume, now, 0.08);
    this.squealOsc.frequency.setTargetAtTime(280 + speed * 4.5, now, 0.03);
    this.squealFilter.frequency.setTargetAtTime(800 + speed * 22, now, 0.05);
    this.squealGain.gain.setTargetAtTime(squeal, now, drift ? 0.035 : 0.12);
  }

  tone(frequency, duration = 0.1, type = 'sine', volume = 0.035) {
    if (!this.enabled || this.disposed) return;
    const ctx = this.ensureContext();
    if (!ctx) return;
    const oscillator = ctx.createOscillator();
    const gain = ctx.createGain();
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(clamp(frequency, 50, 2400), ctx.currentTime);
    gain.gain.setValueAtTime(0.0001, ctx.currentTime);
    gain.gain.linearRampToValueAtTime(clamp(volume, 0.001, 0.12), ctx.currentTime + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + duration);
    oscillator.connect(gain);
    gain.connect(ctx.destination);
    oscillator.addEventListener('ended', () => {
      oscillator.disconnect();
      gain.disconnect();
    }, { once: true });
    oscillator.start();
    oscillator.stop(ctx.currentTime + duration + 0.02);
  }

  horn() { this.tone(180, 0.23, 'square', 0.055); }
  pickup() { this.tone(660, 0.1); window.setTimeout(() => this.tone(880, 0.09), 90); }
  crash() { this.tone(95, 0.24, 'sawtooth', 0.06); }

  setEnabled(enabled) {
    this.enabled = Boolean(enabled);
    save.muted = !this.enabled;
    persist();
    if (!this.enabled && this.context) {
      const now = this.context.currentTime;
      this.engineGain?.gain.setTargetAtTime(0.0001, now, 0.03);
      this.squealGain?.gain.setTargetAtTime(0.0001, now, 0.03);
    }
    return this.enabled;
  }

  toggle() { return this.setEnabled(!this.enabled); }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    for (const node of [this.engineOsc, this.squealOsc]) {
      try { node?.stop(); } catch { /* already stopped */ }
    }
    for (const node of [this.engineOsc, this.engineFilter, this.engineGain, this.squealOsc, this.squealFilter, this.squealGain]) {
      try { node?.disconnect(); } catch { /* already disconnected */ }
    }
    this.engineOsc = this.engineFilter = this.engineGain = null;
    this.squealOsc = this.squealFilter = this.squealGain = null;
    if (this.context && this.context.state !== 'closed') this.context.close().catch(() => {});
  }
}

// ============================================================
// 9. PROFILE EXTENSIONS — USE EXISTING STORAGE AS SOURCE OF TRUTH
// ============================================================

const PROFILE_KEY = 'kano-life-production-profile-v1';

export class ProfileEngine {
  constructor() {
    this.data = this.load();
    this.syncFromExistingSave();
  }

  load() {
    const defaults = {
      familyBlessingPoints: 0,
      activeStreak: 0,
      unlockedDrivers: [],
      customPaintJobs: [],
      lastRunReport: null,
    };
    try {
      const raw = localStorage.getItem(PROFILE_KEY);
      const parsed = raw ? JSON.parse(raw) : {};
      return { ...defaults, ...parsed };
    } catch {
      return { ...defaults };
    }
  }

  syncFromExistingSave() {
    this.data.activeStreak = Number(save?.daily?.streak ?? this.data.activeStreak) || 0;
    this.data.unlockedDrivers = [...new Set([...(this.data.unlockedDrivers || []), ...(save?.unlocks || [])])];
    this.data.customPaintJobs = [...new Set([...(this.data.customPaintJobs || []), ...(save?.unlockedPaints || []), save?.paint].filter(Boolean))];
    this.persist();
  }

  persist() {
    try {
      localStorage.setItem(PROFILE_KEY, JSON.stringify(this.data));
    } catch (error) {
      console.warn('[Kano Life] profile cache could not be saved', error);
    }
  }

  addBlessingPoints(amount) {
    const delta = Math.max(0, Math.floor(Number(amount) || 0));
    this.data.familyBlessingPoints = Math.max(0, this.data.familyBlessingPoints + delta);
    this.persist();
    return this.data.familyBlessingPoints;
  }

  spendBanked(amount) {
    const cost = Math.max(0, Math.floor(Number(amount) || 0));
    if ((save.money || 0) < cost) return false;
    save.money -= cost;
    persist();
    this.persist();
    return true;
  }

  recordRunReport(report = {}) {
    this.data.lastRunReport = {
      score: Math.max(0, Math.floor(Number(report.score) || 0)),
      distance: Math.max(0, Number(report.distance) || 0),
      reason: String(report.reason || 'Run complete').slice(0, 160),
      at: new Date().toISOString(),
    };
    this.syncFromExistingSave();
  }
}

// ============================================================
// 10. GLTF CLIP REGISTRY
// ============================================================

export class AnimatedModelRegistry {
  constructor() {
    this.entries = new Map();
    this.disposed = false;
  }

  register(id, root, clips = [], initialClip = clips[0]?.name) {
    if (this.disposed) throw new Error('AnimatedModelRegistry has been disposed.');
    if (!id || !root?.isObject3D) throw new TypeError('register() requires an id and a model root.');
    this.remove(id);

    const mixer = new THREE.AnimationMixer(root);
    const actions = new Map();
    for (const clip of clips) {
      if (!clip?.name) continue;
      actions.set(clip.name, mixer.clipAction(clip));
    }

    const entry = { id, root, mixer, actions, currentAction: null };
    this.entries.set(id, entry);
    if (initialClip && actions.has(initialClip)) this.play(id, initialClip);
    return entry;
  }

  play(id, clipName, { fadeSeconds = 0.18, loop = THREE.LoopRepeat } = {}) {
    const entry = this.entries.get(id);
    const next = entry?.actions.get(clipName);
    if (!entry || !next) return false;
    next.reset();
    next.setLoop(loop, loop === THREE.LoopOnce ? 1 : Infinity);
    next.clampWhenFinished = loop === THREE.LoopOnce;
    next.enabled = true;
    next.play();
    if (entry.currentAction && entry.currentAction !== next) {
      entry.currentAction.crossFadeTo(next, Math.max(0, fadeSeconds), true);
    }
    entry.currentAction = next;
    return true;
  }

  update(dt) {
    if (this.disposed) return;
    const delta = clamp(Number(dt) || 0, 0, 0.05);
    for (const entry of this.entries.values()) entry.mixer.update(delta);
  }

  remove(id) {
    const entry = this.entries.get(id);
    if (!entry) return false;
    entry.mixer.stopAllAction();
    entry.mixer.uncacheRoot(entry.root);
    for (const action of entry.actions.values()) action.stop();
    this.entries.delete(id);
    return true;
  }

  dispose() {
    if (this.disposed) return;
    for (const id of [...this.entries.keys()]) this.remove(id);
    this.disposed = true;
  }
}

// ============================================================
// 11. COORDINATOR
// ============================================================

export class KanoProductionSystems {
  constructor({ scene, worldRoot = scene, player, game, uiRoot = document.body, mobile = false, stageScene = null, enableKinematics = false, enableInstancedEnvironment = false, enableTrafficPool = false, enableSynthAudio = false, stageBuilders = {} } = {}) {
    if (!scene?.isObject3D) throw new TypeError('KanoProductionSystems requires the Three.js scene.');
    this.scene = scene;
    this.worldRoot = worldRoot;
    this.player = player;
    this.game = game;
    this.disposed = false;
    this.profile = new ProfileEngine();
    // The existing Renderer3D already owns the morning dioramas. Keep the
    // separate state manager event-driven by default to avoid drawing a second
    // set of stage props over those existing GLB-backed scenes. Pass stageScene
    // only when the renderer is configured to use this module's stage roots.
    this.stateManager = new GameStateManager({
      scene: stageScene,
      stageBuilders,
      onTransition: ({ state }) => {
        window.dispatchEvent(new CustomEvent('kano:life-scene', {
          detail: { scene: ({ HOME_COMPOUND: 'bedroom', ROADSIDE_MAISHAY: 'breakfast', KEKE_PARK: 'garage', THE_SHIFT: 'road' })[state] },
        }));
      },
    });
    this.kinematics = enableKinematics && player ? new KekeKinematics({ chassis: player }) : null;
    this.environment = enableInstancedEnvironment
      ? new InfiniteInstancedEnvironment(worldRoot, { mobile })
      : null;
    this.traffic = enableTrafficPool
      ? new TrafficAIPool(worldRoot, { mobile, count: 5 })
      : null;
    this.audio = enableSynthAudio ? new SynthesizedAudioEngine() : null;
    this.animations = new AnimatedModelRegistry();
    this.narrative = new NarrativeDialogueEngine({ host: uiRoot, game, profile: this.profile });
    this.hawker = player ? new PureWaterHawker({ parent: worldRoot, player, game, profile: this.profile }) : null;
    this.collisions = new Box3CollisionSystem({
      onImpact: ({ type }) => {
        this.audio?.crash();
        this.game?.ui?.toast?.(type === 'pothole' ? 'POTHOLE IMPACT · tyres damaged' : 'OBSTACLE IMPACT · vehicle condition reduced');
      },
    });
  }

  update(dt, hazards = []) {
    if (this.disposed || !this.game?.s) return;
    const s = this.game.s;
    const signedSpeed = Number.isFinite(s.signedSpeed)
      ? s.signedSpeed
      : s.reverse ? -Math.abs(s.speed || 0) : Math.abs(s.speed || 0);

    this.kinematics?.update({
      dt,
      signedSpeedKmh: signedSpeed,
      steering: s.steer,
      throttle: s.gas,
      brake: s.brake,
      drift: Boolean(s.drift),
    });
    this.environment?.update(dt, signedSpeed);
    this.traffic?.update(dt, signedSpeed, this.player, s, (vehicle) => {
      this.audio?.crash();
      this.game?.ui?.toast?.(`Traffic collision · ${vehicle.label}`);
    });
    this.collisions.update(this.player, hazards, s);
    this.hawker?.update(dt, signedSpeed);
    this.animations.update(dt);
    this.narrative.update(dt, s);
    this.audio?.update({
      signedSpeedKmh: signedSpeed,
      throttle: s.gas,
      reverse: Boolean(s.reverse),
      drift: Boolean(s.drift),
      steering: Number(s.steer) || 0,
    });
  }

  onHorn() {
    this.audio?.horn();
    return this.hawker?.onHorn() || false;
  }

  showFreeRide(passenger, options) {
    this.narrative.offerFreeRide(passenger, options);
  }

  showNoChange(options) {
    this.narrative.offerNoChange(options);
  }

  recordRunComplete(report) {
    this.profile.recordRunReport(report);
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.stateManager.dispose();
    this.animations.dispose();
    this.environment?.dispose();
    this.traffic?.dispose();
    this.hawker?.dispose();
    this.narrative.dispose();
    this.audio?.dispose();
  }
}
