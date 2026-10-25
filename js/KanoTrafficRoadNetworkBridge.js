/**
 * Optional live bridge between explicitly authored road paths and existing AI traffic.
 * The caller must provide real scene-space coordinates; this module never guesses anchors.
 */
import { createKanoRoadPath, createKanoJunctionPath } from './KanoDriveableRoadGeometry.js';
import { createKanoTrafficRoadNetwork } from './KanoTrafficRoadNetwork.js';
import { createKanoTrafficRoadRuntime } from './KanoTrafficRoadNetworkRuntime.js';

const BRIDGE_PATCH = Symbol.for('kano.life.trafficRoadNetworkBridge.v1');

export function createKanoTrafficRoadNetworkBridge({ GameClass, RendererClass, windowObject = globalThis.window, connectionTolerance = 0.75 } = {}) {
  if (!GameClass?.prototype) return { ok: false, reason: 'game-class-required' };
  const network = createKanoTrafficRoadNetwork({ connectionTolerance });
  if (!network.ok) return network;
  const runtime = createKanoTrafficRoadRuntime(network);
  if (!runtime.ok) return runtime;
  let installed = false;
  let rendererInstalled = false;
  let originalMoveTraffic = null;
  let originalSyncTraffic = null;

  function activeGame() {
    return windowObject?.__KANO_ACTIVE_GAME__ || windowObject?.__KANO_ACTIVE_UI__?.game || null;
  }

  function registerPath({ path, fromNode, toNode, turn = 'straight', bidirectional = false } = {}) {
    return network.addPath({ path, fromNode, toNode, turn, bidirectional });
  }

  function registerRoad({ id, segments, samplesPerSegment = 24, metadata = {}, fromNode, toNode, turn = 'straight', bidirectional = false } = {}) {
    const built = createKanoRoadPath({ id, segments, samplesPerSegment, metadata });
    if (!built.ok) return built;
    return registerPath({ path: built, fromNode, toNode, turn, bidirectional });
  }

  function registerJunctionTurn({ id, junctionId, turn, start, end, startTangent, endTangent, handleLength = 4, metadata = {}, fromNode, toNode, bidirectional = false } = {}) {
    const built = createKanoJunctionPath({ id, junctionId, turn, start, end, startTangent, endTangent, handleLength, metadata });
    if (!built.ok) return built;
    return registerPath({ path: built, fromNode, toNode, turn, bidirectional });
  }

  function planRoute(options = {}) {
    return network.planRoute(options);
  }

  function assignVehicleRoute({ vehicleId, fromNode, toNode, seed, progress = 0 } = {}) {
    const game = activeGame();
    const vehicles = Array.isArray(game?.s?.traffic) ? game.s.traffic : [];
    const vehicle = vehicles.find(item => String(item?.id) === String(vehicleId));
    if (!vehicle) return { ok: false, reason: 'vehicle-not-found', vehicleId };
    const route = network.planRoute({ fromNode, toNode, seed: seed ?? vehicle.id ?? vehicle.type ?? 'traffic' });
    if (!route.ok) return route;
    const assigned = runtime.assignRoute(vehicle, route, { progress });
    if (!assigned.ok) return assigned;
    const pose = runtime.updateVehicle(vehicle);
    if (!pose.ok) return pose;
    return { ok: true, vehicleId: vehicle.id, route, pose };
  }

  function unassignVehicleRoute({ vehicleId } = {}) {
    const game = activeGame();
    const vehicles = Array.isArray(game?.s?.traffic) ? game.s.traffic : [];
    const vehicle = vehicles.find(item => String(item?.id) === String(vehicleId));
    if (!vehicle) return { ok: false, reason: 'vehicle-not-found', vehicleId };
    delete vehicle.kanoRoadRoute;
    delete vehicle.kanoRoadPose;
    delete vehicle.kanoRoadPathIndex;
    delete vehicle.kanoRoadPathProgress;
    delete vehicle.kanoRoadLastDepth;
    delete vehicle.__kanoRoadRuntime;
    return { ok: true, vehicleId: vehicle.id };
  }

  function audit() {
    const game = activeGame();
    const traffic = Array.isArray(game?.s?.traffic) ? game.s.traffic : [];
    const snapshot = network.snapshot();
    const connections = network.validateConnections();
    const routed = traffic.filter(vehicle => vehicle.kanoRoadRoute?.ok);
    return {
      installed,
      rendererInstalled,
      activeGame: Boolean(game),
      trafficCount: traffic.length,
      routedVehicleCount: routed.length,
      routedVehicles: routed.slice(0, 12).map(vehicle => ({
        id: vehicle.id,
        pathId: vehicle.kanoRoadPose?.pathId ?? null,
        pathIndex: vehicle.kanoRoadPathIndex ?? null,
        progress: Number.isFinite(Number(vehicle.kanoRoadPathProgress)) ? Number(vehicle.kanoRoadPathProgress.toFixed(3)) : null,
        position: vehicle.kanoRoadPose?.position ?? null,
        yaw: Number.isFinite(Number(vehicle.kanoRoadPose?.yaw)) ? Number(vehicle.kanoRoadPose.yaw.toFixed(3)) : null,
      })),
      network: snapshot,
      connections,
    };
  }

  function install() {
    if (GameClass.prototype[BRIDGE_PATCH]) {
      installed = true;
    } else {
      originalMoveTraffic = GameClass.prototype.moveTraffic;
      if (typeof originalMoveTraffic !== 'function') return { ok: false, reason: 'move-traffic-method-missing' };
      GameClass.prototype.moveTraffic = function moveTrafficWithRoadNetwork(...args) {
        const result = originalMoveTraffic.apply(this, args);
        const traffic = Array.isArray(this.s?.traffic) ? this.s.traffic : [];
        for (const vehicle of traffic) {
          if (vehicle.kanoRoadRoute?.ok) runtime.updateVehicle(vehicle);
        }
        return result;
      };
      Object.defineProperty(GameClass.prototype, BRIDGE_PATCH, { value: true });
      installed = true;
    }

    // Keep elevated/curved road-path poses and model heading synchronized after
    // the renderer performs its normal traffic placement. Mobile instancing is
    // still handled by the existing junction-turn renderer adapter.
    if (RendererClass?.prototype) {
      const rendererPatch = Symbol.for('kano.life.trafficRoadNetworkRendererBridge.v1');
      if (RendererClass.prototype[rendererPatch]) {
        rendererInstalled = true;
      } else if (typeof RendererClass.prototype.syncTraffic === 'function') {
        originalSyncTraffic = RendererClass.prototype.syncTraffic;
        RendererClass.prototype.syncTraffic = function syncTrafficWithRoadNetwork(state, ...args) {
          const result = originalSyncTraffic.call(this, state, ...args);
          const traffic = Array.isArray(state?.traffic) ? state.traffic : [];
          for (const vehicle of traffic) {
            if (!vehicle.kanoRoadRoute?.ok || !vehicle.kanoRoadPose) continue;
            const actor = this.trafficActors?.get?.(vehicle.id);
            runtime.applyActorPose(actor, vehicle);
          }
          return result;
        };
        Object.defineProperty(RendererClass.prototype, rendererPatch, { value: true });
        rendererInstalled = true;
      }
    }
    return { ok: true, rendererInstalled };
  }

  const api = {
    ok: true,
    registerRoad,
    registerJunctionTurn,
    registerPath,
    planRoute,
    assignVehicleRoute,
    unassignVehicleRoute,
    audit,
    install,
    network,
    runtime,
  };
  const installedResult = install();
  if (!installedResult.ok) return installedResult;
  if (windowObject) {
    windowObject.kanoTrafficRoadNetwork = api;
    windowObject.kanoTrafficRoadNetworkAudit = audit;
  }
  return api;
}

