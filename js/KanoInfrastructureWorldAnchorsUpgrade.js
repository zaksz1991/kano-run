import * as THREE from 'three';
import { Game } from './game.js';
import { Renderer3D } from './renderer3d.js';

/**
 * KANO LIFE — Step 98: persistent world anchors for fuel stops, keke parks,
 * passenger queues, and roadside walkers.
 *
 * The renderer still uses a continuous-road presentation. This layer promotes
 * zone decoration out of recycled zone actors and gives each promoted group a
 * signed-distance anchor. A station/checkpoint can therefore pass the player
 * and remain behind in the correct world-relative position instead of being
 * dragged back toward the player when the zone-depth pool is refreshed.
 */
const PATCH = Symbol.for('kano.life.infrastructureWorldAnchors.step98');
const WORLD_UNITS_PER_KM = 1008;
const REFERENCE_Z = 2;
const VISIBLE_MIN_Z = -255;
const VISIBLE_MAX_Z = 23;
const MAX_PERSISTENT_RECORDS = 48;
const ORIGINAL = {};

const AUDIT = {
  version: 1,
  installed: false,
  infrastructurePromoted: 0,
  checkpointCrowdsPromoted: 0,
  sidewalkWalkersAnchored: 0,
  worldCoordinatesUpdated: 0,
  recycledZoneReparentsPrevented: 0,
  limitation: 'Uses the existing signed-distance road coordinate and continuous-road renderer; this is not a surveyed open-world map or high-detail GLB asset generator.',
};

function finite(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function activeGame(renderer) {
  if (typeof window !== 'undefined' && window.__KANO_ACTIVE_GAME__) {
    return window.__KANO_ACTIVE_GAME__;
  }
  return renderer?.__kanoStep96Game || renderer?.game || null;
}

function worldDistanceKm(renderer, state) {
  const game = activeGame(renderer);
  const candidates = [
    game?.kanoWorldDistanceKm,
    game?.s?.kanoWorldDistanceKm,
    state?.kanoWorldDistanceKm,
    renderer?.__kanoStep96WorldKm,
    state?.distance,
  ];
  for (const candidate of candidates) {
    const value = Number(candidate);
    if (Number.isFinite(value)) return value;
  }
  return 0;
}

function getRecords(renderer) {
  if (!(renderer.kanoStep98WorldAnchors instanceof Map)) {
    renderer.kanoStep98WorldAnchors = new Map();
  }
  return renderer.kanoStep98WorldAnchors;
}

function isInWorld(node, world) {
  let cursor = node;
  while (cursor) {
    if (cursor === world) return true;
    cursor = cursor.parent;
  }
  return false;
}

function addAnchorRecord(renderer, node, kind, key, km, extras = {}) {
  if (!node || !renderer.world || !Number.isFinite(Number(node.position?.z))) return null;
  const records = getRecords(renderer);
  if (records.has(key)) return records.get(key);

  const anchorKm = finite(km) + (REFERENCE_Z - node.position.z) / WORLD_UNITS_PER_KM;
  node.userData ||= {};
  node.userData.kanoStep98WorldAnchored = true;
  node.userData.kanoStep98AnchorKm = anchorKm;
  node.userData.kanoStep98AnchorKind = kind;

  const record = {
    key,
    kind,
    node,
    anchorKm,
    baseVisible: node.visible !== false,
    lastRenderedZ: node.position.z,
    initialZ: node.position.z,
    walkOffsetZ: 0,
    createdAtKm: finite(km),
    ...extras,
  };
  records.set(key, record);
  AUDIT.worldCoordinatesUpdated += 1;
  trimRecords(renderer);
  return record;
}

function trimRecords(renderer) {
  const records = getRecords(renderer);
  while (records.size > MAX_PERSISTENT_RECORDS) {
    let removed = false;
    for (const [key, record] of records) {
      if (record.kind === 'sidewalk-pedestrian') continue;
      record.node?.parent?.remove(record.node);
      records.delete(key);
      removed = true;
      break;
    }
    if (!removed) break;
  }
}

function promoteChildToWorld(renderer, sourceActor, node, zone, kind, km) {
  if (!renderer.world || !sourceActor || !node || !isInWorld(sourceActor, renderer.world)) return null;
  if (node.parent !== renderer.world) {
    renderer.world.updateMatrixWorld?.(true);
    sourceActor.updateWorldMatrix?.(true, true);
    // Object3D.attach preserves the decorated object's world transform while
    // releasing it from the zone actor's recycled local-depth transform.
    renderer.world.attach(node);
  }

  const zoneId = String(zone?.id ?? sourceActor.userData?.kanoInfrastructureZoneId ?? 'unknown');
  node.userData ||= {};
  node.userData.kanoStep98ZoneId = zoneId;
  node.userData.kanoStep98InfrastructureKind = kind;
  const record = addAnchorRecord(renderer, node, kind, `${kind}:${zoneId}`, km, {
    zoneId,
    sourceActor,
    passengerEntries: kind === 'checkpoint-passengers'
      ? (sourceActor.userData?.kanoPassengerCrowd || [])
      : null,
  });
  if (record && kind !== 'sidewalk-pedestrian') {
    AUDIT.infrastructurePromoted += 1;
    AUDIT.recycledZoneReparentsPrevented += 1;
  }
  return record;
}

function promotePassengerQueue(renderer, zone, actor, km) {
  const crowd = actor.userData?.kanoPassengerCrowd;
  if (!zone?.hub || !Array.isArray(crowd) || !crowd.length) return;
  if (actor.userData.kanoStep98CrowdPromoted) return;
  if (!renderer.world || actor.parent !== renderer.world) return;

  const group = new THREE.Group();
  group.name = `KANO_PERSISTENT_CHECKPOINT_PASSENGERS_STEP98_${String(zone.id)}`;
  group.userData.kanoPersistentCheckpointPassengers = true;
  actor.add(group);

  for (const passenger of crowd) {
    if (passenger?.root && passenger.root.parent === actor) {
      group.attach(passenger.root);
    }
  }

  renderer.world.attach(group);
  actor.userData.kanoStep98CrowdPromoted = true;
  const record = promoteChildToWorld(renderer, actor, group, zone, 'checkpoint-passengers', km);
  if (record) {
    record.passengerEntries = crowd;
    record.sourceActor = actor;
    AUDIT.checkpointCrowdsPromoted += 1;
  }
}

function promoteZoneVisuals(renderer, zone, actor, km) {
  if (!zone || !actor || actor.parent !== renderer.world) return;
  const zoneId = String(zone.id);
  const currentZoneId = String(actor.userData?.kanoInfrastructureZoneId ?? '');
  if (currentZoneId && currentZoneId !== zoneId) return;

  for (const child of [...actor.children]) {
    if (child.userData?.kanoFuelStationGeometry === true) {
      if (child.parent === actor || child.parent === renderer.world) {
        promoteChildToWorld(renderer, actor, child, zone, 'fuel-station', km);
      }
    } else if (child.userData?.kanoCheckpointKeke === true) {
      promoteChildToWorld(renderer, actor, child, zone, 'checkpoint-keke-park', km);
    }
  }
  promotePassengerQueue(renderer, zone, actor, km);
}

function anchorSidewalkPedestrians(renderer, km) {
  const pedestrians = renderer.pedestrians || [];
  for (const pedestrian of pedestrians) {
    const actor = pedestrian?.actor;
    if (!actor || actor.parent !== renderer.world) continue;
    if (actor.userData?.kanoStep98WorldAnchored) continue;

    actor.userData ||= {};
    actor.userData.kanoStep98InitialZ = actor.position.z;
    const record = addAnchorRecord(
      renderer,
      actor,
      'sidewalk-pedestrian',
      `sidewalk-pedestrian:${pedestrian.index ?? pedestrians.indexOf(pedestrian)}`,
      km,
      { pedestrian },
    );
    if (!record) continue;
    actor.userData.kanoStep98InitialAnchorKm = record.anchorKm;
    record.initialZ = actor.position.z;
    record.lastRenderedZ = actor.position.z;
    AUDIT.sidewalkWalkersAnchored += 1;
  }
}

function syncPersistentAnchors(renderer, state, deltaSeconds = 1 / 60) {
  if (!renderer?.world) return;
  const km = worldDistanceKm(renderer, state);
  const game = activeGame(renderer);
  if (typeof window !== 'undefined' && game) window.__KANO_ACTIVE_GAME__ = game;

  const zones = Array.isArray(state?.zones)
    ? state.zones
    : Array.isArray(game?.s?.zones) ? game.s.zones : [];
  for (const zone of zones) {
    const actor = renderer.zoneActors?.get?.(zone.id);
    if (actor) promoteZoneVisuals(renderer, zone, actor, km);
  }
  anchorSidewalkPedestrians(renderer, km);

  const liveZoneActors = new Set(renderer.zoneActors?.values?.() || []);
  const records = getRecords(renderer);
  renderer.kanoStep98Clock = finite(renderer.kanoStep98Clock) + clamp(finite(deltaSeconds, 1 / 60), 0, 0.05);

  for (const record of records.values()) {
    const node = record.node;
    if (!node || !renderer.world || !isInWorld(node, renderer.world)) continue;

    if (record.kind === 'sidewalk-pedestrian') {
      // Step 92's walker gait increments local Z a small amount each frame.
      // Capture that small delta separately, then place the walker from its
      // signed road coordinate so scene travel does not erase walking motion.
      const rawDelta = finite(node.position.z) - finite(record.lastRenderedZ, node.position.z);
      const movement = clamp(rawDelta, -0.06, 0.06);
      let nextOffset = finite(record.walkOffsetZ) + movement;
      if (nextOffset > 5.2) {
        nextOffset = 5.2;
        if (record.pedestrian) record.pedestrian.walkDirection = -Math.abs(finite(record.pedestrian.walkDirection, 1));
      } else if (nextOffset < -5.2) {
        nextOffset = -5.2;
        if (record.pedestrian) record.pedestrian.walkDirection = Math.abs(finite(record.pedestrian.walkDirection, 1));
      }
      record.walkOffsetZ = nextOffset;
      node.position.z = REFERENCE_Z - (record.anchorKm - km) * WORLD_UNITS_PER_KM + record.walkOffsetZ;
      node.visible = record.baseVisible && node.position.z >= VISIBLE_MIN_Z && node.position.z <= VISIBLE_MAX_Z;
      record.lastRenderedZ = node.position.z;
      node.userData.kanoStep98WalkOffsetZ = record.walkOffsetZ;
    } else {
      node.position.z = REFERENCE_Z - (record.anchorKm - km) * WORLD_UNITS_PER_KM;
      node.visible = record.baseVisible && node.position.z >= VISIBLE_MIN_Z && node.position.z <= VISIBLE_MAX_Z;
      record.lastRenderedZ = node.position.z;
    }

    node.userData.kanoStep98AnchorKm = record.anchorKm;
    node.userData.kanoStep98CurrentKm = km;
    node.userData.kanoStep98VisibleZ = node.position.z;
  }

  // Step 92 animates checkpoint people while their zone actor is active. After
  // that zone is recycled, retain the same gentle idle motion in the promoted
  // persistent passenger group instead of freezing a row of statues.
  for (const record of records.values()) {
    if (record.kind !== 'checkpoint-passengers' || !Array.isArray(record.passengerEntries)) continue;
    if (record.sourceActor && liveZoneActors.has(record.sourceActor) && record.sourceActor.parent === renderer.world) continue;
    const time = renderer.kanoStep98Clock;
    for (const person of record.passengerEntries) {
      const root = person?.root;
      const parts = root?.userData?.kanoAnimationParts;
      if (!root || !parts) continue;
      const phase = time * 0.82 + finite(person.phase);
      root.position.y = finite(person.baseY) + Math.abs(Math.sin(phase)) * 0.012;
      root.rotation.y = finite(person.baseRotationY) + Math.sin(phase * 0.7) * 0.055;
      for (const arm of parts.arms || []) {
        arm.pivot.rotation.z = arm.restZ + Math.sin(phase + arm.side) * 0.035;
      }
      if (parts.headCover) parts.headCover.rotation.y = Math.sin(phase * 0.45) * 0.07;
    }
  }
}

function resetForNewRun(game) {
  if (typeof window === 'undefined') return;
  const renderer = window.__KANO_ACTIVE_RENDERER__ || window.renderer || null;
  if (!renderer?.world) return;
  const km = finite(game?.kanoWorldDistanceKm, finite(game?.s?.kanoWorldDistanceKm));
  const records = getRecords(renderer);
  const keep = new Map();

  for (const [key, record] of records) {
    if (record.kind === 'sidewalk-pedestrian') {
      const z = finite(record.initialZ, record.node?.userData?.kanoStep98InitialZ ?? record.node?.position?.z ?? 0);
      record.anchorKm = km + (REFERENCE_Z - z) / WORLD_UNITS_PER_KM;
      record.walkOffsetZ = 0;
      record.node.position.z = z;
      record.node.visible = record.baseVisible;
      record.lastRenderedZ = z;
      record.node.userData.kanoStep98AnchorKm = record.anchorKm;
      record.node.userData.kanoStep98WalkOffsetZ = 0;
      keep.set(key, record);
    } else {
      record.node?.parent?.remove(record.node);
      const source = record.sourceActor;
      if (source?.userData) {
        if (record.kind === 'fuel-station') {
          source.userData.kanoFuelStationStep93 = false;
          delete source.userData.kanoFuelStationParts;
          delete source.userData.kanoFuelStationDesign;
        } else if (record.kind === 'checkpoint-keke-park') {
          source.userData.kanoCheckpointKekeStep93 = false;
          source.userData.kanoCheckpointKekeCount = 0;
          delete source.userData.kanoCheckpointKekeParts;
        } else if (record.kind === 'checkpoint-passengers') {
          source.userData.kanoStep98CrowdPromoted = false;
          source.userData.kanoPassengerCrowdInitialized = false;
          source.userData.kanoPassengerCrowd = [];
          source.userData.kanoPassengerCrowdCount = 0;
        }
        delete source.userData.kanoInfrastructureZoneId;
      }
    }
  }
  renderer.kanoStep98WorldAnchors = keep;
  renderer.kanoStep98Clock = 0;
  renderer.kanoStep98WorldKmAtReset = km;
}

function installRendererPatches() {
  if (Renderer3D.prototype[PATCH]) return;
  ORIGINAL.syncZones = Renderer3D.prototype.syncZones;
  ORIGINAL.buildSidewalkLife = Renderer3D.prototype.buildSidewalkLife;
  ORIGINAL.draw = Renderer3D.prototype.draw;

  if (typeof ORIGINAL.syncZones === 'function') {
    Renderer3D.prototype.syncZones = function kanoStep98SyncZones(state, ...args) {
      const result = ORIGINAL.syncZones.call(this, state, ...args);
      if (this.world && this.zoneActors?.get) {
        const km = worldDistanceKm(this, state);
        for (const zone of state?.zones || []) {
          const actor = this.zoneActors.get(zone.id);
          if (actor) promoteZoneVisuals(this, zone, actor, km);
        }
      }
      return result;
    };
  }

  if (typeof ORIGINAL.buildSidewalkLife === 'function') {
    Renderer3D.prototype.buildSidewalkLife = function kanoStep98BuildSidewalkLife(...args) {
      const result = ORIGINAL.buildSidewalkLife.apply(this, args);
      anchorSidewalkPedestrians(this, worldDistanceKm(this, null));
      return result;
    };
  }

  if (typeof ORIGINAL.draw === 'function') {
    Renderer3D.prototype.draw = function kanoStep98Draw(state, ...args) {
      if (typeof window !== 'undefined') {
        window.__KANO_ACTIVE_RENDERER__ = this;
        if (this.game) window.__KANO_ACTIVE_GAME__ = this.game;
      }
      anchorSidewalkPedestrians(this, worldDistanceKm(this, state));

      if ((this.lifeScene && this.lifeScene !== 'road') || !this.world || !this.renderer?.render) {
        return ORIGINAL.draw.call(this, state, ...args);
      }

      const gl = this.renderer;
      const previousRender = gl.render;
      const rendererRef = this;
      gl.render = function renderAfterPersistentWorldAnchorSync(scene, camera) {
        syncPersistentAnchors(rendererRef, state, args[0]);
        return previousRender.call(this, scene, camera);
      };
      try {
        return ORIGINAL.draw.call(this, state, ...args);
      } finally {
        gl.render = previousRender;
      }
    };
  }

  Object.defineProperty(Renderer3D.prototype, PATCH, { value: true, configurable: false });
}

function installGameStartReset() {
  const key = Symbol.for('kano.life.infrastructureWorldAnchors.startReset.step98');
  if (Game.prototype[key] || typeof Game.prototype.start !== 'function') return;
  const originalStart = Game.prototype.start;
  Game.prototype.start = function startWithInfrastructureWorldReset(...args) {
    const result = originalStart.apply(this, args);
    this.kanoWorldDistanceKm = finite(this.kanoWorldDistanceKm, finite(this.s?.kanoWorldDistanceKm));
    if (this.s) this.s.kanoWorldDistanceKm = this.kanoWorldDistanceKm;
    if (typeof window !== 'undefined') window.__KANO_ACTIVE_GAME__ = this;
    resetForNewRun(this);
    return result;
  };
  Object.defineProperty(Game.prototype, key, { value: true, configurable: false });
}

function publishAudit() {
  if (typeof window === 'undefined') return;
  window.kanoInfrastructureWorldAnchorAudit = () => {
    const renderer = window.__KANO_ACTIVE_RENDERER__ || window.renderer || null;
    const game = activeGame(renderer);
    const records = [...(renderer?.kanoStep98WorldAnchors?.values?.() || [])].map((record) => ({
      key: record.key,
      kind: record.kind,
      zoneId: record.zoneId || null,
      anchorKm: Number(finite(record.anchorKm).toFixed(5)),
      currentZ: Number(finite(record.node?.position?.z).toFixed(2)),
      visible: Boolean(record.node?.visible),
      parentedToPlayer: Boolean(renderer?.player && isInWorld(record.node, renderer.player)),
      parentedToWorld: Boolean(renderer?.world && isInWorld(record.node, renderer.world)),
    }));
    const counts = {};
    for (const record of records) counts[record.kind] = (counts[record.kind] || 0) + 1;
    return {
      ...AUDIT,
      activeRenderer: Boolean(renderer),
      activeGame: Boolean(game),
      signedWorldDistanceKm: Number.isFinite(Number(game?.kanoWorldDistanceKm))
        ? Number(Number(game.kanoWorldDistanceKm).toFixed(5)) : null,
      persistentRecordCount: records.length,
      byKind: counts,
      allRecordsWorldAnchored: records.every((record) => record.parentedToWorld && !record.parentedToPlayer),
      records,
    };
  };
}

installRendererPatches();
installGameStartReset();
publishAudit();
AUDIT.installed = Boolean(Renderer3D.prototype[PATCH]);
console.info('[Kano Life] Step 98 persistent fuel/checkpoint world anchors and signed-distance sidewalk walkers registered.');
