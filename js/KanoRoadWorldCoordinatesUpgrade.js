import { mergeChildMeshes } from './KanoMergeStaticMeshes.js';
import * as THREE from 'three';
import { Game } from './game.js';
import { Renderer3D } from './renderer3d.js';

/**
 * KANO LIFE — Step 96: signed world-distance anchors and physical junction surfaces.
 *
 * Renderer3D intentionally keeps an endless-road presentation, but infrastructure
 * is now positioned from the signed travel coordinate instead of allowing the
 * renderer's visual recycling pass to decide when a bridge/roundabout reappears.
 * The junction geometry is a real Three.js road surface with curved branch mouths.
 * The engine still uses its existing arcade steering/collision model; this module
 * does not claim to provide full wheel physics or a surveyed Kano street map.
 */
const PATCH = Symbol.for('kano.life.roadWorldCoordinates.step96');
const WORLD_UNITS_PER_KM = 1008; // Renderer3D scroll is signedSpeed * dt * 0.28.
const FIRST_JUNCTION_KM = 0.36;
const JUNCTION_INTERVAL_KM = 0.46;
const JUNCTION_RENDER_RANGE_KM = 0.245;
const JUNCTION_RETIRE_RANGE_KM = 0.045;
const ROAD_WIDTH = 13;
const BRANCH_WIDTH = 9.8;
const WORLD_ANCHOR_PERIOD_KM = 0.46;

const AUDIT = {
  version: 1,
  installed: false,
  coordinateFrame: 'signed cumulative travel distance in kilometres',
  worldUnitsPerKm: WORLD_UNITS_PER_KM,
  anchoredFlyovers: 0,
  anchoredRoundaboutScenes: 0,
  junctionsBuilt: 0,
  roundaboutSideBranchesBuilt: 0,
  playerMountedLandmarks: 0,
  note: 'Large landmarks are anchored to signed travel distance. Junction meshes add visible curved branch surfaces. Vehicle collision and route steering remain arcade-based; this is not yet a surveyed map or full wheel-physics path follower.',
};

function roadMaterial(color, roughness = 0.95) {
  return new THREE.MeshStandardMaterial({
    color,
    roughness,
    metalness: 0,
    side: THREE.DoubleSide,
    flatShading: true,
  });
}

function addBox(parent, size, color, position, name, rotationY = 0) {
  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(size[0], size[1], size[2]),
    roadMaterial(color),
  );
  mesh.position.set(position[0], position[1], position[2]);
  mesh.rotation.y = rotationY;
  mesh.name = name;
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  parent.add(mesh);
  return mesh;
}

function makeStrip(parent, points, width, name, y = 0.045) {
  if (!Array.isArray(points) || points.length < 2) return null;
  const positions = [];
  const indices = [];
  for (let i = 0; i < points.length; i += 1) {
    const before = points[Math.max(0, i - 1)];
    const after = points[Math.min(points.length - 1, i + 1)];
    let tx = after.x - before.x;
    let tz = after.z - before.z;
    const length = Math.hypot(tx, tz) || 1;
    tx /= length;
    tz /= length;
    const nx = -tz;
    const nz = tx;
    const p = points[i];
    positions.push(
      p.x + nx * width / 2, y, p.z + nz * width / 2,
      p.x - nx * width / 2, y, p.z - nz * width / 2,
    );
    if (i < points.length - 1) {
      const a = i * 2;
      const b = a + 1;
      const c = a + 2;
      const d = a + 3;
      indices.push(a, b, c, b, d, c);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  const mesh = new THREE.Mesh(geometry, roadMaterial(0x343c43));
  mesh.name = name;
  mesh.frustumCulled = false;
  parent.add(mesh);
  return mesh;
}

function cubic(a, b, c, d, t) {
  const one = 1 - t;
  return {
    x: one ** 3 * a.x + 3 * one ** 2 * t * b.x + 3 * one * t ** 2 * c.x + t ** 3 * d.x,
    z: one ** 3 * a.z + 3 * one ** 2 * t * b.z + 3 * one * t ** 2 * c.z + t ** 3 * d.z,
  };
}

function branchCurve(side) {
  const start = { x: 0, z: 14 };
  const control1 = { x: 0, z: -2 };
  const control2 = { x: side * 17, z: -9 };
  const end = { x: side * 35, z: -9 };
  const points = [];
  for (let i = 0; i <= 20; i += 1) {
    points.push(cubic(start, control1, control2, end, i / 20));
  }
  return points;
}

function addBranchMarkings(group, side) {
  // The outgoing arm is broad enough to read as a road from the chase camera.
  addBox(group, [25, 0.045, BRANCH_WIDTH], 0x343c43, [side * 47.1, 0.048, -9], 'kano_junction_branch_straight_surface');
  addBox(group, [14, 0.025, 0.12], 0xe6d9a7, [side * 47.0, 0.081, -9], 'kano_junction_branch_centre_line');
  for (const xOffset of [-5, 0, 5]) {
    addBox(group, [1.9, 0.028, 0.11], 0xf4eee0, [side * (35.5 + xOffset), 0.082, -9], 'kano_junction_branch_dashed_mark');
  }
  // A curved white edge cue follows the exit instead of leaving a box-shaped stub.
  const path = branchCurve(side);
  const edgePoints = path.map((point, index) => {
    if (index === 0) return { x: point.x + side * BRANCH_WIDTH * 0.5, z: point.z };
    const prior = path[index - 1];
    const next = path[Math.min(path.length - 1, index + 1)];
    const tx = next.x - prior.x;
    const tz = next.z - prior.z;
    const len = Math.hypot(tx, tz) || 1;
    return { x: point.x - (tz / len) * side * BRANCH_WIDTH * 0.5, z: point.z + (tx / len) * side * BRANCH_WIDTH * 0.5 };
  });
  for (let i = 0; i < edgePoints.length - 1; i += 2) {
    const p = edgePoints[i];
    const q = edgePoints[Math.min(edgePoints.length - 1, i + 1)];
    const dx = q.x - p.x;
    const dz = q.z - p.z;
    const length = Math.hypot(dx, dz);
    if (length < 0.05) continue;
    const mark = addBox(group, [length, 0.025, 0.1], 0xf4eee0, [(p.x + q.x) / 2, 0.084, (p.z + q.z) / 2], 'kano_junction_curve_edge_mark');
    mark.rotation.y = -Math.atan2(dz, dx);
  }
}

function addSideRoundabout(group, side, index) {
  const centreX = side * 22.5;
  const centreZ = -9;

  // The side branch visibly feeds a separate circulating lane; the main road
  // remains clear while collision-path integration is developed in later work.
  const connector = [
    { x: side * 30, z: -9 },
    { x: side * 25.5, z: -9 },
  ];
  makeStrip(group, connector, BRANCH_WIDTH, 'kano_junction_roundabout_connector', 0.052);

  const ring = new THREE.Mesh(
    new THREE.RingGeometry(4.7, 9.0, 56),
    roadMaterial(0x343c43),
  );
  ring.rotation.x = -Math.PI / 2;
  ring.position.set(centreX, 0.057, centreZ);
  ring.name = 'kano_connected_roundabout_asphalt_ring';
  group.add(ring);

  const island = new THREE.Mesh(
    new THREE.CylinderGeometry(4.52, 4.65, 0.25, 40),
    roadMaterial(0x59865c),
  );
  island.position.set(centreX, 0.16, centreZ);
  island.name = 'kano_roundabout_central_island';
  group.add(island);

  const curbCount = 36;
  for (let i = 0; i < curbCount; i += 1) {
    const angle = i / curbCount * Math.PI * 2;
    const curb = addBox(
      group,
      [0.72, 0.22, 0.18],
      i % 2 ? 0xf6f0df : 0xc63b37,
      [centreX + Math.cos(angle) * 4.58, 0.30, centreZ + Math.sin(angle) * 4.58],
      i % 2 ? 'kano_roundabout_white_curb' : 'kano_roundabout_red_curb',
      -angle,
    );
    curb.userData.kanoRoadTopologyDecoration = true;
  }

  const palm = new THREE.Group();
  palm.name = 'kano_roundabout_low_palm';
  palm.position.set(centreX, 0.28, centreZ);
  addBox(palm, [0.2, 1.0, 0.2], 0x79583d, [0, 0.5, 0], 'kano_roundabout_palm_trunk');
  for (let i = 0; i < 5; i += 1) {
    const frond = new THREE.Mesh(new THREE.ConeGeometry(0.25, 1.1, 6), roadMaterial(i % 2 ? 0x2b754a : 0x45844e));
    const angle = i * Math.PI * 2 / 5;
    frond.position.set(Math.cos(angle) * 0.28, 1.05, Math.sin(angle) * 0.28);
    frond.rotation.z = Math.cos(angle) * -0.56;
    frond.rotation.x = Math.sin(angle) * 0.56;
    palm.add(frond);
  }
  group.add(palm);
  addBox(group, [4.5, 1.2, 0.17], 0x174c3b, [centreX, 2.25, centreZ - 8.9], `kano_roundabout_guide_sign_${index}`);
  return true;
}

function makeJunction(index, mobile) {
  const group = new THREE.Group();
  group.name = `KANO_WORLD_COORDINATE_JUNCTION_${index}`;
  group.userData.kanoRoadJunction = true;
  group.userData.junctionIndex = index;
  group.userData.coordinateFrame = 'signed travel distance';
  group.userData.junctionStyle = index % 3 === 2 ? 'roundabout-connected-side-branch' : 'curved-four-way-branch';

  addBox(group, [ROAD_WIDTH, 0.065, 30], 0x343c43, [0, 0.035, 0], 'kano_junction_crossroad_apron');
  // Main route lane edges continue through the junction surface.
  for (const x of [-6.1, 6.1]) addBox(group, [0.12, 0.025, 25], 0xf1d38a, [x, 0.083, 0], 'kano_junction_road_edge');
  // A stop line and short lane markers reveal that a real junction is ahead.
  addBox(group, [ROAD_WIDTH - 0.6, 0.027, 0.16], 0xf4eee0, [0, 0.085, 10.5], 'kano_junction_stop_line');
  for (const side of [-1, 1]) {
    makeStrip(group, branchCurve(side), BRANCH_WIDTH, side < 0 ? 'kano_curved_left_branch_road' : 'kano_curved_right_branch_road', 0.052);
    addBranchMarkings(group, side);

    // Direction chevrons on the branch mouth communicate the curve from range.
    for (let n = 0; n < 2; n += 1) {
      addBox(group, [0.72, 0.026, 0.12], 0xf4eee0, [side * (6.7 + n * 1.15), 0.086, -3.4 - n * 1.8], 'kano_branch_mouth_guidance_mark');
    }
  }

  const side = index % 2 === 0 ? 1 : -1;
  if (index % 3 === 2) {
    addSideRoundabout(group, side, index);
    AUDIT.roundaboutSideBranchesBuilt += 1;
  }

  // Low route markers align with the four-choice guide without blocking traffic.
  for (const [sideSign, title] of [[-1, 'LEFT'], [1, 'RIGHT']]) {
    addBox(group, [2.75, 0.12, 0.2], 0x174c3b, [sideSign * 8.8, 1.95, -10.5], `kano_junction_${title.toLowerCase()}_sign_back`);
    addBox(group, [2.6, 0.06, 0.11], 0xc63b37, [sideSign * 8.8, 2.03, -10.5], `kano_junction_${title.toLowerCase()}_sign_stripe`);
  }

  // Keep the mobile object lean enough for older devices.
  if (mobile) {
    const keep = [];
    for (const child of [...group.children]) {
      const detail = String(child.name || '');
      if (detail.includes('curve_edge_mark') || detail.includes('roundabout_red_curb') || detail.includes('roundabout_white_curb')) {
        if (keep.length % 2 === 1) {
          group.remove(child);
          child.geometry?.dispose?.();
          if (Array.isArray(child.material)) child.material.forEach((m) => m.dispose?.());
          else child.material?.dispose?.();
        }
      }
      keep.push(child);
    }
  }

  mergeChildMeshes(group); // many small coloured parts -> one draw call
  return group;
}

function disposeTree(root) {
  const geometries = new Set();
  const materials = new Set();
  root.traverse((child) => {
    if (child.geometry && !geometries.has(child.geometry)) {
      geometries.add(child.geometry);
      child.geometry.dispose();
    }
    const list = Array.isArray(child.material) ? child.material : child.material ? [child.material] : [];
    for (const material of list) {
      if (materials.has(material)) continue;
      materials.add(material);
      material.dispose();
    }
  });
}

function currentWorldDistance(game, state) {
  const value = Number(game?.kanoWorldDistanceKm);
  return Number.isFinite(value) ? value : Number(state?.distance) || 0;
}

function upcomingJunction(worldKm, reverse) {
  if (!Number.isFinite(worldKm)) return null;
  if (!reverse) {
    const index = Math.max(0, Math.ceil((worldKm - FIRST_JUNCTION_KM - 1e-6) / JUNCTION_INTERVAL_KM));
    return { index, distanceKm: FIRST_JUNCTION_KM + index * JUNCTION_INTERVAL_KM };
  }
  const index = Math.floor((worldKm - FIRST_JUNCTION_KM - 1e-6) / JUNCTION_INTERVAL_KM);
  if (index < 0) return null;
  return { index, distanceKm: FIRST_JUNCTION_KM + index * JUNCTION_INTERVAL_KM };
}

function setRepeatingAnchor(actor, baseKm, periodKm, worldKm) {
  if (!actor || !(periodKm > 0)) return null;
  let occurrence = baseKm;
  if (worldKm > baseKm) {
    occurrence = baseKm + Math.floor((worldKm - baseKm) / periodKm) * periodKm;
  }
  if (occurrence < worldKm - 0.026) occurrence += periodKm;
  const z = 2 - (occurrence - worldKm) * WORLD_UNITS_PER_KM;
  actor.position.z = z;
  const inViewBand = z >= -255 && z <= 23;
  actor.visible = inViewBand;
  return { occurrenceKm: occurrence, z, visible: inViewBand };
}

function ensureAnchorSchedules(renderer) {
  const flyovers = renderer.flyovers || [];
  const flyoverPeriod = Math.max(1, flyovers.length) * WORLD_ANCHOR_PERIOD_KM;
  flyovers.forEach((actor, index) => {
    actor.userData ||= {};
    const alreadyAnchored = Boolean(actor.userData.kanoWorldAnchoredStep96);
    if (!alreadyAnchored || actor.userData.kanoWorldAnchorIndex !== index || actor.userData.kanoWorldAnchorPeriodKm !== flyoverPeriod) {
      actor.userData.kanoWorldAnchorBaseKm = 0.10 + index * WORLD_ANCHOR_PERIOD_KM;
      actor.userData.kanoWorldAnchorPeriodKm = flyoverPeriod;
      actor.userData.kanoWorldAnchorIndex = index;
      actor.userData.kanoWorldAnchoredStep96 = true;
      if (!alreadyAnchored) AUDIT.anchoredFlyovers += 1;
    }
  });
  const rounds = renderer.kanoRoundaboutActors || [];
  const roundaboutPeriod = Math.max(1, rounds.length) * WORLD_ANCHOR_PERIOD_KM;
  rounds.forEach((actor, index) => {
    actor.userData ||= {};
    const alreadyAnchored = Boolean(actor.userData.kanoWorldAnchoredStep96);
    if (!alreadyAnchored || actor.userData.kanoWorldAnchorIndex !== index || actor.userData.kanoWorldAnchorPeriodKm !== roundaboutPeriod) {
      actor.userData.kanoWorldAnchorBaseKm = 0.18 + index * WORLD_ANCHOR_PERIOD_KM;
      actor.userData.kanoWorldAnchorPeriodKm = roundaboutPeriod;
      actor.userData.kanoWorldAnchorIndex = index;
      actor.userData.kanoWorldAnchoredStep96 = true;
      if (!alreadyAnchored) AUDIT.anchoredRoundaboutScenes += 1;
    }
  });
}

function syncDistanceAnchors(renderer, state) {
  const game = renderer.__kanoStep96Game || (typeof window !== 'undefined' ? window.__KANO_ACTIVE_GAME__ : null);
  const worldKm = currentWorldDistance(game, state);
  renderer.__kanoStep96WorldKm = worldKm;
  ensureAnchorSchedules(renderer);

  for (const actor of renderer.flyovers || []) {
    const result = setRepeatingAnchor(actor, actor.userData.kanoWorldAnchorBaseKm, actor.userData.kanoWorldAnchorPeriodKm, worldKm);
    actor.userData.kanoWorldAnchorCurrentKm = result?.occurrenceKm ?? null;
  }
  const signs = renderer.kanoFlyoverSignRecords || [];
  for (const record of signs) {
    const flyover = renderer.flyovers?.[record.index];
    if (!flyover || !record.sign) continue;
    record.sign.position.copy(flyover.position);
    record.sign.visible = Boolean(flyover.visible);
    record.sign.userData.kanoWorldAnchorCurrentKm = flyover.userData?.kanoWorldAnchorCurrentKm ?? null;
  }

  const rounds = renderer.kanoRoundaboutActors || [];
  for (const actor of rounds) {
    const result = setRepeatingAnchor(actor, actor.userData.kanoWorldAnchorBaseKm, actor.userData.kanoWorldAnchorPeriodKm, worldKm);
    actor.userData.kanoWorldAnchorCurrentKm = result?.occurrenceKm ?? null;
  }

  // Junction surfaces are not attached to the vehicle. Each surface is positioned
  // by its real scheduled distance and retired only after the pass/reverse window.
  renderer.kanoRoadJunctionActors ||= new Map();
  const reversing = Boolean(state?.reverse) || Number(state?.signedSpeed) < -0.05;
  const target = upcomingJunction(worldKm, reversing);
  const desiredIndex = target?.index;
  const actors = renderer.kanoRoadJunctionActors;
  for (const [index, actor] of actors) {
    const distanceKm = actor.userData.kanoJunctionDistanceKm;
    const deltaKm = distanceKm - worldKm;
    const isCurrentApproach = Math.abs(deltaKm) <= JUNCTION_RENDER_RANGE_KM;
    if (!isCurrentApproach || (index !== desiredIndex && Math.abs(deltaKm) > JUNCTION_RETIRE_RANGE_KM)) {
      renderer.world.remove(actor);
      disposeTree(actor);
      actors.delete(index);
    }
  }

  if (target) {
    const deltaKm = target.distanceKm - worldKm;
    if (Math.abs(deltaKm) <= JUNCTION_RENDER_RANGE_KM) {
      let actor = actors.get(target.index);
      if (!actor) {
        actor = makeJunction(target.index, Boolean(renderer.mobile));
        actor.userData.kanoJunctionDistanceKm = target.distanceKm;
        actor.userData.worldCoordinateKm = target.distanceKm;
        renderer.world.add(actor);
        actors.set(target.index, actor);
        AUDIT.junctionsBuilt += 1;
      }
      actor.position.set(0, 0, 2 - deltaKm * WORLD_UNITS_PER_KM);
      actor.visible = true;
      renderer.kanoRoadJunctionActive = {
        index: target.index,
        distanceKm: target.distanceKm,
        remainingKm: deltaKm,
        worldZ: actor.position.z,
        style: actor.userData.junctionStyle,
      };
    } else {
      renderer.kanoRoadJunctionActive = null;
    }
  } else {
    renderer.kanoRoadJunctionActive = null;
  }

  AUDIT.playerMountedLandmarks = 0;
}

function installGameWorldDistance() {
  if (Game.prototype[PATCH]) return;
  const originalStart = Game.prototype.start;
  const originalTick = Game.prototype.tick;
  if (typeof originalStart !== 'function' || typeof originalTick !== 'function') return;

  Game.prototype.start = function startWithWorldDistance(...args) {
    const result = originalStart.apply(this, args);
    this.kanoWorldDistanceKm = Number(this.s?.distance) || 0;
    if (this.s) this.s.kanoWorldDistanceKm = this.kanoWorldDistanceKm;
    return result;
  };

  Game.prototype.tick = function tickWithWorldDistance(deltaSeconds, ...args) {
    const result = originalTick.call(this, deltaSeconds, ...args);
    const dt = THREE.MathUtils.clamp(Number(deltaSeconds) || 0, 0, 0.1);
    const signedSpeed = Number(this.s?.signedSpeed) || 0;
    const current = Number(this.kanoWorldDistanceKm);
    this.kanoWorldDistanceKm = (Number.isFinite(current) ? current : Number(this.s?.distance) || 0)
      + signedSpeed * dt / 3600;
    if (this.s) this.s.kanoWorldDistanceKm = this.kanoWorldDistanceKm;
    return result;
  };

  Object.defineProperty(Game.prototype, PATCH, { value: true, configurable: false });
}

function installRendererWorldCoordinates() {
  if (Renderer3D.prototype[PATCH]) return;
  const originalDraw = Renderer3D.prototype.draw;
  if (typeof originalDraw !== 'function') return;

  Renderer3D.prototype.draw = function drawWithRoadWorldCoordinates(state, deltaSeconds, ...args) {
    if (this.lifeScene !== 'road' || !this.world || !this.renderer) {
      return originalDraw.call(this, state, deltaSeconds, ...args);
    }
    this.__kanoStep96Game = typeof window !== 'undefined' ? window.__KANO_ACTIVE_GAME__ || null : null;
    const gl = this.renderer;
    const previousRender = gl.render;
    const rendererRef = this;
    gl.render = function renderAfterWorldAnchorSync(scene, camera) {
      syncDistanceAnchors(rendererRef, state);
      return previousRender.call(this, scene, camera);
    };
    try {
      return originalDraw.call(this, state, deltaSeconds, ...args);
    } finally {
      gl.render = previousRender;
    }
  };

  Object.defineProperty(Renderer3D.prototype, PATCH, { value: true, configurable: false });
}

function publishAudit() {
  if (typeof window === 'undefined') return;
  window.kanoRoadWorldCoordinatesAudit = () => {
    const renderer = window.__KANO_ACTIVE_RENDERER__ || window.renderer || null;
    const game = window.__KANO_ACTIVE_GAME__ || null;
    const junctions = [...(renderer?.kanoRoadJunctionActors?.values?.() || [])].map((actor) => ({
      index: actor.userData?.junctionIndex,
      distanceKm: actor.userData?.kanoJunctionDistanceKm,
      style: actor.userData?.junctionStyle,
      worldZ: Number(actor.position.z.toFixed(2)),
      visible: actor.visible,
      mountedToPlayer: false,
      meshCount: actor.children.length,
    }));
    const anchors = [...(renderer?.flyovers || []), ...(renderer?.kanoRoundaboutActors || [])].map((actor) => ({
      name: actor.name,
      worldAnchored: Boolean(actor.userData?.kanoWorldAnchoredStep96),
      anchorKm: actor.userData?.kanoWorldAnchorCurrentKm ?? null,
      visible: actor.visible,
      z: Number(actor.position.z.toFixed(2)),
      mountedToPlayer: false,
    }));
    return {
      ...AUDIT,
      activeRenderer: Boolean(renderer),
      activeGame: Boolean(game),
      signedWorldDistanceKm: Number.isFinite(game?.kanoWorldDistanceKm) ? Number(game.kanoWorldDistanceKm.toFixed(5)) : null,
      currentJunction: renderer?.kanoRoadJunctionActive || null,
      liveJunctionActors: junctions.length,
      junctions,
      anchors,
    };
  };
}

installGameWorldDistance();
installRendererWorldCoordinates();
publishAudit();
AUDIT.installed = Boolean(Game.prototype[PATCH] && Renderer3D.prototype[PATCH]);
console.info('[Kano Life] Step 96 signed world-distance anchors and curved road-junction geometry registered.');
