/**
 * Kano Run — AI traffic turns onto the visible junction crossroad.
 * Additive hook only: keeps Game.moveTraffic collision checks and Renderer3D
 * placement as the owners of the existing traffic objects.
 */
import { Game } from './game.js';
import { Renderer3D } from './renderer3d.js';
import { computeKanoTrafficTurnFrame, chooseKanoTrafficTurnSide, computeKanoTrafficRelativeDepth } from './KanoTrafficJunctionTurnMath.js';

const PATCH = Symbol.for('kano.life.trafficJunctionTurn.v2');
const JUNCTION_INTERVAL_KM = 0.46;
const ROAD_UNITS_PER_KM = 1008;
const ROAD_PIVOT_Z = 2;
const TRAFFIC_DEPTH_UNITS = 88;
const TURN_APPROACH_DEPTH = 0.28;
const TURN_EXIT_DEPTH = -0.15;
const BRANCH_EXIT_X = 104;
const SCENE_UNITS_PER_METRE = ROAD_UNITS_PER_KM / 1000;
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

function signedWorldKm(game) {
  const world = Number(game?.kanoWorldDistanceKm);
  return Number.isFinite(world) ? world : Number(game?.s?.distance) || 0;
}

function junctionWorldKm(game) {
  const nav = game?.kanoNavigationState;
  if (!nav || !Number.isFinite(Number(nav.nextJunctionAt))) return null;
  // A selected player turn advances nextJunctionAt immediately. The current
  // junction remains one interval behind while that player turn is animating.
  return Number(nav.nextJunctionAt) - (nav.turn ? JUNCTION_INTERVAL_KM : 0);
}

function depthForWorldJunction(game, worldKm) {
  const remainingKm = Number(worldKm) - signedWorldKm(game);
  return (remainingKm * ROAD_UNITS_PER_KM - ROAD_PIVOT_Z) / TRAFFIC_DEPTH_UNITS;
}

function junctionDepth(game) {
  const target = junctionWorldKm(game);
  return Number.isFinite(target) ? depthForWorldJunction(game, target) : null;
}

function installVisualOffsetAccessor(vehicle) {
  if (vehicle.__kanoTurnOffsetAccessor) return;
  const initial = Number(vehicle.visualOffsetX) || 0;
  Object.defineProperty(vehicle, 'visualOffsetX', {
    configurable: true,
    enumerable: true,
    get() {
      return (Number(this._kanoVisualOffsetBase) || 0) + (Number(this._kanoTurnOffsetX) || 0);
    },
    set(value) {
      this._kanoVisualOffsetBase = Number(value) || 0;
    },
  });
  vehicle._kanoVisualOffsetBase = initial;
  vehicle._kanoTurnOffsetX = 0;
  vehicle.__kanoTurnOffsetAccessor = true;
}

function worldX(vehicle) {
  return (clamp(Math.round(Number(vehicle?.lane) || 0), 0, 2) - 1) * 3
    + (Number(vehicle?.visualOffsetX) || 0);
}

function updateBranchVehicle(game, vehicle, dt) {
  const turn = vehicle.kanoTurn;
  const targetDepth = depthForWorldJunction(game, turn.junctionWorldKm);
  const speedKmh = Number.isFinite(Number(vehicle.speedKmh)) && Number(vehicle.speedKmh) > 0
    ? Number(vehicle.speedKmh)
    : (vehicle.direction === -1 ? 30 : 22);
  const travelSign = vehicle.direction === -1 ? -1 : 1;
  const laneBaseX = (clamp(Math.round(Number(vehicle.lane) || 0), 0, 2) - 1) * 3;
  // Continue along the crossroad, perpendicular to the approach road. A branch
  // vehicle keeps the junction's world distance instead of drifting through it.
  turn.branchX += turn.side * speedKmh * Math.max(0, Number(dt) || 0) / 3.6 * SCENE_UNITS_PER_METRE;
  vehicle._kanoTurnOffsetX = turn.branchX - laneBaseX;
  vehicle.kanoVisualYawDelta = -turn.side * travelSign * Math.PI / 2;
  vehicle.kanoTurnProgress = 1;
  vehicle.kanoBranchTargetDepth = targetDepth;

  // Let the original collision/despawn loop see a stable junction depth. Once
  // the junction is behind the player, allow the normal traffic despawn path.
  if (targetDepth <= -1.35 || Math.abs(turn.branchX) >= BRANCH_EXIT_X) {
    vehicle.depth = -0.13;
    vehicle.kanoTurn = null;
    vehicle._kanoTurnOffsetX = 0;
    vehicle.kanoVisualYawDelta = 0;
    vehicle.kanoTurnCompletedKey = turn.key;
    vehicle.kanoBranchTargetDepth = null;
    return;
  }
  vehicle.depth = targetDepth;
}

function updateVehicleTurn(game, vehicle, depthAtJunction, dt) {
  installVisualOffsetAccessor(vehicle);
  if (vehicle.kanoTurn?.phase === 'branch') {
    updateBranchVehicle(game, vehicle, dt);
    return;
  }
  if (!Number.isFinite(depthAtJunction)) {
    vehicle._kanoTurnOffsetX = 0;
    vehicle.kanoVisualYawDelta = Number(vehicle.kanoVisualYawDelta) || 0;
    return;
  }

  const nav = game.kanoNavigationState;
  const globalTargetKm = junctionWorldKm(game);
  // Navigation advances nextJunctionAt as soon as the player selects a turn.
  // Traffic already committed to the old junction must keep tracking that same
  // world position while its approach curve is in progress.
  const committedTargetKm = Number.isFinite(Number(vehicle.kanoTurn?.junctionWorldKm))
    ? Number(vehicle.kanoTurn.junctionWorldKm)
    : globalTargetKm;
  const committedJunctionDepth = Number.isFinite(committedTargetKm)
    ? depthForWorldJunction(game, committedTargetKm)
    : depthAtJunction;
  const relativeDepth = computeKanoTrafficRelativeDepth(vehicle.depth, committedJunctionDepth);
  const targetKm = committedTargetKm;
  const junctionKey = vehicle.kanoTurn?.key
    || `${Math.round((Number(targetKm) || 0) * 10000)}:${nav?.junctionIndex ?? 0}`;
  // Traffic depth advances inside the original movement loop, after this hook.
  // Keep the previous frame's position so a large frame step cannot skip the
  // entire turn envelope without ever being assigned a turn.
  if (vehicle._kanoTurnWindowKey !== junctionKey) {
    vehicle._kanoTurnWindowKey = junctionKey;
    vehicle._kanoTurnPreviousRelativeDepth = null;
  }
  const previousRelativeDepth = Number(vehicle._kanoTurnPreviousRelativeDepth);
  const crossedTurnWindow = Number.isFinite(previousRelativeDepth)
    && previousRelativeDepth > TURN_APPROACH_DEPTH
    && relativeDepth < TURN_EXIT_DEPTH;

  if (!vehicle.kanoTurn && vehicle.kanoTurnCompletedKey !== junctionKey
      && ((relativeDepth <= TURN_APPROACH_DEPTH && relativeDepth >= TURN_EXIT_DEPTH) || crossedTurnWindow)) {
    const baseLane = clamp(Math.round(Number(vehicle.lane) || 0), 0, 2);
    const side = chooseKanoTrafficTurnSide(vehicle.id ?? vehicle.type ?? 'traffic', junctionKey, baseLane);
    const targetLane = clamp(baseLane + side, 0, 2);
    if (side && targetLane !== baseLane) {
      vehicle.kanoTurn = {
        key: junctionKey,
        side,
        baseLane,
        targetLane,
        phase: 'approach',
        junctionWorldKm: Number(targetKm),
        branchX: (baseLane - 1) * 3 + side * 3,
      };
    } else {
      vehicle.kanoTurnCompletedKey = junctionKey;
    }
  }

  const turn = vehicle.kanoTurn;
  if (!turn) {
    vehicle._kanoTurnOffsetX = 0;
    vehicle.kanoVisualYawDelta = 0;
    vehicle._kanoTurnPreviousRelativeDepth = relativeDepth;
    return;
  }

  if (turn.phase === 'approach') {
    const frame = computeKanoTrafficTurnFrame(relativeDepth, turn.side, vehicle.direction === -1 ? -1 : 1);
    vehicle._kanoTurnOffsetX = frame.lateralOffset;
    vehicle.kanoVisualYawDelta = frame.yawDelta;
    vehicle.kanoTurnProgress = frame.progress;
    if (frame.complete) {
      turn.phase = 'branch';
      turn.branchX = (turn.baseLane - 1) * 3 + turn.side * 3;
      updateBranchVehicle(game, vehicle, dt);
    }
  }
  vehicle._kanoTurnPreviousRelativeDepth = relativeDepth;
}

function installGameHook() {
  if (Game.prototype[PATCH]) return;
  const originalMoveTraffic = Game.prototype.moveTraffic;
  if (typeof originalMoveTraffic !== 'function') return;
  Game.prototype.moveTraffic = function moveTrafficWithJunctionTurns(dt, ...args) {
    const depth = junctionDepth(this);
    const traffic = Array.isArray(this.s?.traffic) ? this.s.traffic : null;
    const trafficBefore = traffic ? traffic.slice() : [];
    for (const vehicle of trafficBefore) updateVehicleTurn(this, vehicle, depth, dt);

    // The base game despawns traffic at depth < -0.12. A vehicle already
    // committed to the perpendicular branch must remain on that side road
    // until it leaves the visible junction, rather than disappearing as soon
    // as the junction crosses the player's plane.
    const deferredBranches = [];
    if (traffic) {
      for (let index = traffic.length - 1; index >= 0; index -= 1) {
        const vehicle = traffic[index];
        const targetDepth = Number(vehicle.kanoBranchTargetDepth);
        if (vehicle.kanoTurn?.phase === 'branch'
            && Number.isFinite(targetDepth)
            && targetDepth <= -0.12
            && targetDepth > -1.35) {
          deferredBranches.push(vehicle);
          traffic.splice(index, 1);
        }
      }
    }

    let result;
    try {
      result = originalMoveTraffic.call(this, dt, ...args);
    } finally {
      if (traffic && deferredBranches.length) traffic.push(...deferredBranches.reverse());
    }

    // Keep branch vehicles attached to the same moving junction plane after
    // the base movement/collision loop has processed ordinary traffic.
    const trafficAfter = Array.isArray(this.s?.traffic) ? this.s.traffic : [];
    for (const vehicle of trafficAfter) {
      if (vehicle.kanoTurn?.phase !== 'branch') continue;
      const targetDepth = Number(vehicle.kanoBranchTargetDepth);
      if (Number.isFinite(targetDepth)) vehicle.depth = targetDepth;
    }
    return result;
  };
  Object.defineProperty(Game.prototype, PATCH, { value: true });
}

function applyActorYaw(renderer, state) {
  const traffic = Array.isArray(state?.traffic) ? state.traffic : [];
  for (const vehicle of traffic) {
    const actor = renderer.trafficActors?.get(vehicle.id);
    if (!actor) continue;
    actor.rotation.y = (vehicle.direction === -1 ? Math.PI : 0) + (Number(vehicle.kanoVisualYawDelta) || 0);
  }
}

function applyInstancedYaw(renderer, state) {
  if (!renderer.mobile || !renderer._mobileTrafficBatches || !renderer._mobileFallbackTrafficByType) return;
  const transform = renderer._mobileTrafficInstanceTransform;
  if (!transform) return;
  for (const [type, vehicles] of renderer._mobileFallbackTrafficByType) {
    const batch = renderer._mobileTrafficBatches.get(type);
    if (!batch?.mesh || !vehicles?.length) continue;
    const count = Math.min(vehicles.length, batch.mesh.count);
    for (let index = 0; index < count; index += 1) {
      const vehicle = vehicles[index];
      transform.position.set(
        (clamp(Math.round(Number(vehicle.lane) || 0), 0, 2) - 1) * 3 + (Number(vehicle.visualOffsetX) || 0),
        0,
        -Math.max(-0.05, Number(vehicle.depth) || 0) * TRAFFIC_DEPTH_UNITS,
      );
      transform.rotation.set(0, (vehicle.direction === -1 ? Math.PI : 0) + (Number(vehicle.kanoVisualYawDelta) || 0), 0);
      transform.scale.set(1, 1, 1);
      transform.updateMatrix();
      batch.mesh.setMatrixAt(index, transform.matrix);
    }
    batch.mesh.instanceMatrix.needsUpdate = true;
  }
}

function installRendererHook() {
  if (Renderer3D.prototype[PATCH]) return;
  const originalSyncTraffic = Renderer3D.prototype.syncTraffic;
  if (typeof originalSyncTraffic !== 'function') return;
  Renderer3D.prototype.syncTraffic = function syncTrafficWithJunctionTurns(state, ...args) {
    const result = originalSyncTraffic.call(this, state, ...args);
    applyActorYaw(this, state);
    applyInstancedYaw(this, state);
    return result;
  };
  Object.defineProperty(Renderer3D.prototype, PATCH, { value: true });
}

installGameHook();
installRendererHook();

if (typeof window !== 'undefined') {
  window.kanoTrafficJunctionTurnAudit = () => {
    const game = window.__KANO_ACTIVE_GAME__ || window.__KANO_ACTIVE_UI__?.game || null;
    const traffic = Array.isArray(game?.s?.traffic) ? game.s.traffic : [];
    const turning = traffic.filter(vehicle => vehicle.kanoTurn || Math.abs(Number(vehicle.kanoVisualYawDelta) || 0) > 0.01);
    return {
      installed: Boolean(Game.prototype[PATCH] && Renderer3D.prototype[PATCH]),
      activeGame: Boolean(game),
      trafficCount: traffic.length,
      turningCount: turning.length,
      branchTrafficCount: traffic.filter(vehicle => vehicle.kanoTurn?.phase === 'branch').length,
      mobileInstancing: Boolean(game?.mobile),
      collisionAlignedOffset: traffic.every(vehicle => vehicle.__kanoTurnOffsetAccessor),
      examples: turning.slice(0, 5).map(vehicle => ({
        type: vehicle.type,
        lane: vehicle.lane,
        phase: vehicle.kanoTurn?.phase || 'approach',
        depth: Number((Number(vehicle.depth) || 0).toFixed(3)),
        progress: Number((Number(vehicle.kanoTurnProgress) || 0).toFixed(2)),
        yawDelta: Number((Number(vehicle.kanoVisualYawDelta) || 0).toFixed(2)),
      })),
    };
  };
}
