import { mergeActor } from './KanoMergeStaticMeshes.js';
import * as THREE from 'three';
import { Renderer3D } from './renderer3d.js';

/**
 * KANO LIFE — Step 92: animated street pedestrians and checkpoint queue.
 *
 * This additive layer deliberately avoids using the currently bundled,
 * unrigged A-pose GLBs as walkers. The available character GLBs have no
 * skins or animation clips, so a root-only animation leaves their arms
 * stuck in their authored pose. These articulated low-poly actors have
 * separate arm and leg pivots, correctly lowered arms, and distinct Hausa
 * clothing silhouettes until high-detail InstantMesh assets are integrated.
 */
const PATCH_KEY = Symbol.for('kano.life.streetLifeMotion.step92');
const ORIGINALS = {};

const PERSON_STYLES = [
  { kind: 'man', robe: 0xe4d9bd, trim: 0x967447, skin: 0x75472f, cap: 0xefe5cd, trousers: 0x51483d },
  { kind: 'woman', robe: 0x72465f, trim: 0xc49a55, skin: 0x8d5537, hijab: 0x183f4c, trousers: 0x2e2430 },
  { kind: 'man', robe: 0x345b4d, trim: 0xd0b06a, skin: 0x5d3828, cap: 0x25473b, trousers: 0x26362f },
  { kind: 'woman', robe: 0x3e4a7c, trim: 0xd6b36d, skin: 0x9b6244, hijab: 0xc79a50, trousers: 0x343955 },
  { kind: 'young-man', robe: 0xa76836, trim: 0x523c30, skin: 0x6b402b, cap: null, trousers: 0x343d48 },
  { kind: 'woman', robe: 0x276e68, trim: 0xd8c281, skin: 0x70442e, hijab: 0x6f3154, trousers: 0x263f42 },
];

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

function makeMaterial(color, roughness = 0.92) {
  return new THREE.MeshStandardMaterial({
    color,
    roughness,
    metalness: 0,
    flatShading: true,
  });
}

function addMesh(parent, geometry, material, position = [0, 0, 0], scale = [1, 1, 1]) {
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.set(position[0], position[1], position[2]);
  mesh.scale.set(scale[0], scale[1], scale[2]);
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  parent.add(mesh);
  return mesh;
}

function makeStreetPerson(variant, { waiting = false } = {}) {
  const style = PERSON_STYLES[((variant % PERSON_STYLES.length) + PERSON_STYLES.length) % PERSON_STYLES.length];
  const isWoman = style.kind === 'woman';
  const root = new THREE.Group();
  root.name = `KANO_STREET_PERSON_${variant + 1}`;
  root.userData.kanoStreetPerson = true;
  root.userData.kanoStreetPersonStyle = style.kind;
  root.userData.kanoWaitingPassenger = waiting;

  const robeMat = makeMaterial(style.robe);
  const trimMat = makeMaterial(style.trim, 0.8);
  const skinMat = makeMaterial(style.skin);
  const trouserMat = makeMaterial(style.trousers);
  const darkMat = makeMaterial(0x201c1a, 0.85);
  const headCoverMat = makeMaterial(isWoman ? style.hijab : (style.cap || style.robe));

  // A tapered garment profile produces a recognisable flowing abaya or Hausa boubou.
  const profile = isWoman
    ? [
        new THREE.Vector2(0.10, 0.035), new THREE.Vector2(0.20, 0.08),
        new THREE.Vector2(0.285, 0.22), new THREE.Vector2(0.295, 0.42),
        new THREE.Vector2(0.265, 0.66), new THREE.Vector2(0.22, 0.91),
        new THREE.Vector2(0.165, 1.16), new THREE.Vector2(0.13, 1.24),
      ]
    : [
        new THREE.Vector2(0.105, 0.43), new THREE.Vector2(0.235, 0.45),
        new THREE.Vector2(0.285, 0.57), new THREE.Vector2(0.255, 0.78),
        new THREE.Vector2(0.205, 1.00), new THREE.Vector2(0.155, 1.22),
        new THREE.Vector2(0.12, 1.27),
      ];
  const robe = addMesh(root, new THREE.LatheGeometry(profile, 12), robeMat);
  robe.name = isWoman ? 'abaya_body' : 'boubou_body';

  // Low-profile embroidered neckline: visible but not oversized.
  const neckline = addMesh(root, new THREE.TorusGeometry(0.105, 0.012, 4, 12), trimMat, [0, 1.155, 0.012], [1, 1, 0.62]);
  neckline.rotation.x = Math.PI / 2;
  neckline.name = 'embroidered_neckline';

  // Face is positioned forward (+Z), while the head covering sits slightly behind it.
  addMesh(root, new THREE.SphereGeometry(0.145, 12, 9), skinMat, [0, 1.405, 0.075], [0.86, 1.04, 0.74]).name = 'face';
  const eyeGeo = new THREE.SphereGeometry(0.018, 6, 5);
  addMesh(root, eyeGeo, darkMat, [-0.043, 1.438, 0.175], [1, 1, 0.7]).name = 'left_eye';
  addMesh(root, eyeGeo, darkMat, [0.043, 1.438, 0.175], [1, 1, 0.7]).name = 'right_eye';

  let headCover = null;
  if (isWoman) {
    headCover = addMesh(root, new THREE.SphereGeometry(0.17, 12, 8), headCoverMat, [0, 1.48, -0.055], [1.03, 1.12, 0.68]);
    headCover.name = 'hijab_head_wrap';
    // Narrow scarf drape behind the face; unlike the original GLB this has no outstretched arms.
    addMesh(root, new THREE.ConeGeometry(0.205, 0.45, 10), headCoverMat, [0, 1.22, -0.12]).name = 'hijab_scarf_drape';
  } else if (style.cap) {
    addMesh(root, new THREE.CylinderGeometry(0.105, 0.125, 0.075, 12), headCoverMat, [0, 1.555, 0]).name = 'hausa_kufi_cap';
  }

  const arms = [];
  const armGeo = new THREE.CapsuleGeometry(0.052, 0.40, 2, 7);
  const handGeo = new THREE.SphereGeometry(0.052, 7, 6);
  for (const side of [-1, 1]) {
    const pivot = new THREE.Group();
    pivot.name = side < 0 ? 'left_arm_pivot_down' : 'right_arm_pivot_down';
    pivot.position.set(side * 0.215, 1.075, 0.018);
    pivot.rotation.z = side * (isWoman ? 0.035 : 0.055);
    root.add(pivot);
    addMesh(pivot, armGeo, robeMat, [0, -0.24, 0]);
    addMesh(pivot, handGeo, skinMat, [side * 0.005, -0.49, 0.012], [0.72, 1.0, 0.72]);
    arms.push({ pivot, side, restZ: pivot.rotation.z });
  }

  const legs = [];
  const legGeo = new THREE.CapsuleGeometry(0.058, 0.24, 2, 6);
  const shoeGeo = new THREE.SphereGeometry(0.085, 7, 5);
  for (const side of [-1, 1]) {
    const pivot = new THREE.Group();
    pivot.name = side < 0 ? 'left_leg_pivot' : 'right_leg_pivot';
    pivot.position.set(side * 0.085, 0.515, 0.005);
    root.add(pivot);
    addMesh(pivot, legGeo, trouserMat, [0, -0.145, 0]);
    addMesh(pivot, shoeGeo, darkMat, [0, -0.46, 0.025], [0.95, 0.56, 1.35]);
    legs.push({ pivot, side });
  }

  // Clothing and body shapes remain separate meshes, which makes the silhouette readable
  // and leaves room to replace this temporary articulated crowd with InstantMesh assets.
  root.scale.setScalar(isWoman ? 0.96 : (style.kind === 'young-man' ? 0.93 : 0.98));
  // Merge the many small body meshes (colours baked as vertex colours): ~15 draw calls -> ~5 per person.
  // The tiny head-wrap sway is dropped because that mesh is merged into the body.
  mergeActor(root);
  root.userData.kanoAnimationParts = { arms, legs, headCover: null, isWoman, waiting, variant, phase: variant * 1.13 };
  return root;
}

/** Public factory for the pose-safe Kano street/passenger character used by Step 99. */
export function createKanoStreetPerson(variant, options = {}) {
  return makeStreetPerson(variant, options);
}

function disposeRemovedTree(root) {
  if (!root) return;
  const geometries = new Set();
  const materials = new Set();
  const visit = (node, inheritedShared = false) => {
    const shared = inheritedShared || node.userData?.sharedGeometry === true;
    if (node.geometry && !shared && !geometries.has(node.geometry)) {
      geometries.add(node.geometry);
      node.geometry.dispose();
    }
    const materialList = Array.isArray(node.material) ? node.material : (node.material ? [node.material] : []);
    for (const material of materialList) {
      if (material && !materials.has(material)) {
        materials.add(material);
        material.dispose();
      }
    }
    for (const child of node.children || []) visit(child, shared);
  };
  visit(root);
}

function installSidewalkLife(renderer) {
  const mobile = Boolean(renderer.mobile);
  const count = mobile ? 10 : 18;
  const spacing = mobile ? 15 : 13;
  renderer.pedestrianLoopDistance = count * spacing;
  renderer.pedestrians = [];

  for (let index = 0; index < count; index += 1) {
    const side = index % 2 === 0 ? -1 : 1;
    const variant = index % PERSON_STYLES.length;
    const actor = makeStreetPerson(variant);
    const baseX = side * (7.0 + (index % 3) * 0.48);
    const baseZ = -7 - index * spacing;
    actor.position.set(baseX, 0, baseZ);
    actor.rotation.y = (index % 4 === 0) ? side * 0.12 : 0;
    actor.userData.kanoStreetWalkBaseX = baseX;
    actor.userData.kanoStreetWalkBaseY = 0;
    renderer.world.add(actor);

    renderer.pedestrians.push({
      index,
      side,
      actor,
      arms: actor.userData.kanoAnimationParts.arms.map((arm) => arm.pivot),
      legs: actor.userData.kanoAnimationParts.legs.map((leg) => leg.pivot),
      phase: index * 0.73,
      usingModel: true, // Keep articulated pose; the existing GLBs have no rig/animation clips.
      kanoStreetPerson: true,
      walkDirection: index % 2 === 0 ? 1 : -1,
      walkSpeed: 0.16 + (index % 3) * 0.035,
    });
  }
}

function addCheckpointPassengerCrowd(renderer, zone, actor) {
  if (!zone?.hub || !actor || actor.userData.kanoPassengerCrowdInitialized) return;

  // Remove the single legacy security placeholder / static A-pose passenger.
  for (const oldPerson of actor.userData.waitingActors || []) {
    if (oldPerson.parent) oldPerson.parent.remove(oldPerson);
    disposeRemovedTree(oldPerson);
  }
  actor.userData.waitingActors = [];
  actor.userData.waitingUsingModel = true;
  actor.userData.waitingModelKey = null;

  const sideSign = Number(zone.side) < 0 ? -1 : 1;
  const count = renderer.mobile ? 4 : 6;
  const positions = [
    { x: 0.34, z: -1.2 },
    { x: 0.94, z: -1.2 },
    { x: 0.34, z: -0.1 },
    { x: 0.94, z: -0.1 },
    { x: 0.34, z: 1.0 },
    { x: 0.94, z: 1.0 },
  ];
  const crowd = [];
  for (let index = 0; index < count; index += 1) {
    const variant = (index + 1) % PERSON_STYLES.length;
    const root = makeStreetPerson(variant, { waiting: true });
    const spot = positions[index];
    root.position.set(sideSign * spot.x, 0, spot.z);
    root.rotation.y = sideSign < 0 ? Math.PI / 2 : -Math.PI / 2;
    root.scale.multiplyScalar(renderer.mobile ? 0.82 : 0.86);
    actor.add(root);
    crowd.push({ root, variant, phase: index * 1.41, baseY: 0, baseRotationY: root.rotation.y });
  }

  actor.userData.kanoPassengerCrowd = crowd;
  actor.userData.kanoPassengerCrowdCount = crowd.length;
  actor.userData.kanoPassengerCrowdInitialized = true;
  const sign = actor.children.find((child) => child.isMesh && child.geometry?.type === 'PlaneGeometry' && child.position.y > 1.0);
  if (sign) sign.position.y = 2.05;
}

function animateStreetLife(renderer, dt) {
  if (renderer.lifeScene && renderer.lifeScene !== 'road') return;
  renderer.kanoStreetClock = (renderer.kanoStreetClock || 0) + dt;
  const time = renderer.kanoStreetClock;

  for (const pedestrian of renderer.pedestrians || []) {
    if (!pedestrian.kanoStreetPerson || !pedestrian.actor?.parent) continue;
    const actor = pedestrian.actor;
    const parts = actor.userData.kanoAnimationParts;
    if (!parts) continue;
    const phase = time * (2.7 + pedestrian.walkSpeed * 2.0) + pedestrian.phase;
    actor.position.x = actor.userData.kanoStreetWalkBaseX + Math.sin(time * 0.46 + pedestrian.phase) * 0.22;
    actor.position.z += pedestrian.walkDirection * pedestrian.walkSpeed * dt;
    actor.position.y = actor.userData.kanoStreetWalkBaseY + Math.abs(Math.sin(phase * 2)) * 0.025;
    actor.rotation.y += (Math.sin(time * 0.38 + pedestrian.phase) * 0.035 - (actor.rotation.y || 0)) * Math.min(1, dt * 0.8);
    for (const arm of parts.arms) {
      arm.pivot.rotation.z = arm.restZ + Math.sin(phase + (arm.side > 0 ? Math.PI : 0)) * 0.19;
      arm.pivot.rotation.x = Math.cos(phase) * 0.035;
    }
    for (const leg of parts.legs) {
      leg.pivot.rotation.x = Math.sin(phase + (leg.side > 0 ? Math.PI : 0)) * 0.28;
    }
    if (parts.headCover) parts.headCover.rotation.y = Math.sin(phase * 0.32) * 0.045;
  }

  for (const zoneActor of renderer.zoneActors?.values?.() || []) {
    const crowd = zoneActor.userData?.kanoPassengerCrowd;
    if (!crowd || zoneActor.parent !== renderer.world) continue;
    for (const person of crowd) {
      const parts = person.root.userData.kanoAnimationParts;
      if (!parts) continue;
      const phase = time * 0.82 + person.phase;
      person.root.position.y = person.baseY + Math.abs(Math.sin(phase)) * 0.012;
      person.root.rotation.y = person.baseRotationY + Math.sin(phase * 0.7) * 0.055;
      for (const arm of parts.arms) {
        // Arms stay down; idle motion is limited to a small natural sway.
        arm.pivot.rotation.z = arm.restZ + Math.sin(phase + arm.side) * 0.035;
      }
      if (parts.headCover) parts.headCover.rotation.y = Math.sin(phase * 0.45) * 0.07;
    }
  }
}

if (!Renderer3D.prototype[PATCH_KEY]) {
  ORIGINALS.buildSidewalkLife = Renderer3D.prototype.buildSidewalkLife;
  ORIGINALS.syncZones = Renderer3D.prototype.syncZones;
  ORIGINALS.draw = Renderer3D.prototype.draw;

  Renderer3D.prototype.buildSidewalkLife = function kanoStep92BuildSidewalkLife() {
    installSidewalkLife(this);
  };

  Renderer3D.prototype.syncZones = function kanoStep92SyncZones(state, ...args) {
    const result = ORIGINALS.syncZones.call(this, state, ...args);
    for (const zone of state?.zones || []) {
      if (!zone?.hub) continue;
      const actor = this.zoneActors?.get(zone.id);
      if (actor) addCheckpointPassengerCrowd(this, zone, actor);
    }
    return result;
  };

  Renderer3D.prototype.draw = function kanoStep92Draw(state, deltaSeconds, ...args) {
    if (typeof window !== 'undefined') window.__KANO_ACTIVE_RENDERER__ = this;
    const dt = clamp(Number(deltaSeconds) || 0, 0, 0.05);
    animateStreetLife(this, dt);
    return ORIGINALS.draw.call(this, state, deltaSeconds, ...args);
  };

  Object.defineProperty(Renderer3D.prototype, PATCH_KEY, { value: true, configurable: false });
}

if (typeof window !== 'undefined') {
  window.kanoStreetLifeMotionAudit = () => {
    const renderer = window.__KANO_ACTIVE_RENDERER__ || window.renderer || null;
    return {
      version: 1,
      installed: true,
      implementation: 'articulated-street-people',
      sidewalkPedestrians: Number(renderer?.pedestrians?.filter((person) => person.kanoStreetPerson).length || 0),
      checkpointCrowds: [...(renderer?.zoneActors?.values?.() || [])]
        .filter((actor) => actor.userData?.kanoPassengerCrowdInitialized)
        .map((actor) => ({ count: actor.userData.kanoPassengerCrowdCount, zoneType: actor.userData.zoneType })),
      note: 'Runtime-created articulated character meshes; InstantMesh high-detail asset conversion is planned separately.',
    };
  };
}

console.info('[Kano Life] Step 92 street-walker gait and checkpoint passenger queue registered.');
