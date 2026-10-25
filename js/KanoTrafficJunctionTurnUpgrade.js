/**
 * Kano Run — traffic junction turn integration.
 * Adds curved, collision-aligned traffic turns without replacing game.js or renderer3d.js.
 * Imported by KanoRoadNavigationUpgrade.js after Game and Renderer3D are defined.
 */
import { Game } from './game.js';
import { Renderer3D } from './renderer3d.js';
import { computeKanoTrafficTurnFrame } from './KanoTrafficJunctionTurnMath.js';

const PATCH = Symbol.for('kano.life.trafficJunctionTurn.v1');
const JUNCTION_INTERVAL_KM = 0.46;
const ROAD_UNITS_PER_KM = 1008;
const ROAD_PIVOT_Z = 2;
const TRAFFIC_DEPTH_UNITS = 88;
const TURN_APPROACH_DEPTH = 0.28;
const TURN_EXIT_DEPTH = -0.15;

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

function signedWorldKm(game) {
  const world = Number(game?.kanoWorldDistanceKm);
  return Number.isFinite(world) ? world : Number(game?.s?.distance) || 0;
}

function junctionWorldKm(game) {
  const nav = game?.kanoNavigationState;
  if (!nav || !Number.isFinite(Number(nav.nextJunctionAt))) return null;
  // selectTurn advances nextJunctionAt immediately; while a player turn is
  // animating, ambient traffic is still crossing the junction just passed.
  return Number(nav.nextJunctionAt) - (nav.turn ? JUNCTION_INTERVAL_KM : 0);
}

function junctionDepth(game) {
  const target = junctionWorldKm(game);
  if (!Number.isFinite(target)) return null;
  const km = target - signedWorldKm(game);
  return (km * ROAD_UNITS_PER_KM - ROAD_PIVOT_Z) / TRAFFIC_DEPTH_UNITS;
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

function updateVehicleTurn(game, vehicle, depthAtJunction) {
  installVisualOffsetAccessor(vehicle);
  if (!Number.isFinite(depthAtJunction)) {
    vehicle._kanoTurnOffsetX = 0;
    vehicle.kanoVisualYawDelta = Number(vehicle.kanoVisualYawDelta) || 0;
    return;
  }

  const relativeDepth = Number(vehicle.depth) - depthAtJunction;
  const nav = game.kanoNavigationState;
  const targetKm = junctionWorldKm(game);
  const junctionKey = `${Math.round((Number(targetKm) || 0) * 10000)}:${nav?.junctionIndex ?? 0}`;

  if (!vehicle.kanoTurn && vehicle.kanoTurnCompletedKey !== junctionKey
      && relativeDepth <= TURN_APPROACH_DEPTH && relativeDepth >= TURN_EXIT_DEPTH) {
    // Bias the mix toward left/right turns but keep a straight-through share.
    const roll = Math.random();
    if (roll < 0.36 || roll > 0.64) {
      const side = roll < 0.36 ? -1 : 1;
      const baseLane = clamp(Math.round(Number(vehicle.lane) || 0), 0, 2);
      const targetLane = clamp(baseLane + side, 0, 2);
      if (targetLane !== baseLane) {
        vehicle.kanoTurn = { key: junctionKey, side, baseLane, targetLane };
      } else {
        vehicle.kanoTurnCompletedKey = junctionKey;
      }
    } else {
      vehicle.kanoTurnCompletedKey = junctionKey;
    }
  }

  const turn = vehicle.kanoTurn;
  if (!turn) {
    vehicle._kanoTurnOffsetX = 0;
    return;
  }

  const frame = computeKanoTrafficTurnFrame(relativeDepth, turn.side * (vehicle.direction === -1 ? -1 : 1));
  vehicle._kanoTurnOffsetX = frame.lateralOffset;
  vehicle.kanoVisualYawDelta = frame.yawDelta;
  vehicle.kanoTurnProgress = frame.progress;
  if (frame.complete) {
    vehicle.lane = turn.targetLane;
    vehicle._kanoTurnOffsetX = 0;
    vehicle.kanoVisualYawDelta = 0;
    vehicle.kanoTurnCompletedKey = turn.key;
    vehicle.kanoTurn = null;
  }
}

function installGameHook() {
  if (Game.prototype[PATCH]) return;
  const originalMoveTraffic = Game.prototype.moveTraffic;
  if (typeof originalMoveTraffic !== 'function') return;
  Game.prototype.moveTraffic = function moveTrafficWithJunctionTurns(...args) {
    const depth = junctionDepth(this);
    if (Array.isArray(this.s?.traffic)) {
      for (const vehicle of this.s.traffic) updateVehicleTurn(this, vehicle, depth);
    }
    return originalMoveTraffic.apply(this, args);
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
        (clamp(Number(vehicle.lane) || 0, 0, 2) - 1) * 3 + (Number(vehicle.visualOffsetX) || 0),
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
    const turning = traffic.filter((vehicle) => vehicle.kanoTurn || Math.abs(Number(vehicle.kanoVisualYawDelta) || 0) > 0.01);
    return {
      installed: Boolean(Game.prototype[PATCH] && Renderer3D.prototype[PATCH]),
      activeGame: Boolean(game),
      trafficCount: traffic.length,
      turningCount: turning.length,
      mobileInstancing: Boolean(game?.mobile),
      collisionAlignedOffset: traffic.every((vehicle) => vehicle.__kanoTurnOffsetAccessor),
      examples: turning.slice(0, 5).map((vehicle) => ({
        type: vehicle.type,
        lane: vehicle.lane,
        depth: Number((Number(vehicle.depth) || 0).toFixed(3)),
        progress: Number((Number(vehicle.kanoTurnProgress) || 0).toFixed(2)),
        yawDelta: Number((Number(vehicle.kanoVisualYawDelta) || 0).toFixed(2)),
      })),
    };
  };
}
