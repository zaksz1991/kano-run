/**
 * Optional live bridge between explicitly authored road paths and existing AI traffic.
 * The caller must provide real scene-space coordinates; this module never guesses anchors.
 */
import { createKanoRoadPath, createKanoJunctionPath } from './KanoDriveableRoadGeometry.js';
import { createKanoTrafficRoadNetwork } from './KanoTrafficRoadNetwork.js';
import { createKanoTrafficRoadRuntime } from './KanoTrafficRoadNetworkRuntime.js';

const BRIDGE_PATCH = Symbol.for('kano.life.trafficRoadNetworkBridge.v1');


function applyInstancedRoadPoses(renderer, traffic) {
  if (!renderer?.mobile || !renderer._mobileTrafficBatches || !renderer._mobileFallbackTrafficByType) return 0;
  const transform = renderer._mobileTrafficInstanceTransform;
  if (!transform?.position?.set || !transform?.rotation || !transform?.scale?.set || typeof transform.updateMatrix !== 'function') return 0;
  let updated = 0;
  for (const [type, vehicles] of renderer._mobileFallbackTrafficByType) {
    const batch = renderer._mobileTrafficBatches.get(type);
    if (!batch?.mesh || !Array.isArray(vehicles) || !vehicles.length) continue;
    const count = Math.min(vehicles.length, Number(batch.mesh.count) || vehicles.length);
    let batchUpdated = false;
    for (let index = 0; index < count; index += 1) {
      const vehicle = vehicles[index];
      const pose = vehicle?.kanoRoadPose;
      if (!vehicle?.kanoRoadRoute?.ok || !pose?.position) continue;
      const { x, y, z } = pose.position;
      if (![x, y, z, pose.yaw].every(value => Number.isFinite(Number(value)))) continue;
      transform.position.set(Number(x), Number(y), Number(z));
      transform.rotation.set(0, Number(pose.yaw), 0);
      transform.scale.set(1, 1, 1);
      transform.updateMatrix();
      batch.mesh.setMatrixAt(index, transform.matrix);
      batchUpdated = true;
      updated += 1;
    }
    if (batchUpdated) batch.mesh.instanceMatrix.needsUpdate = true;
  }
  return updated;
}

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
  let autoRouting = { enabled: false, continueRoutes: true, assignAllUnrouted: false, entryNodes: [], exitNodes: [], seed: 'kano-traffic' };

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

  function configureAutoRouting({ enabled = true, continueRoutes = true, assignAllUnrouted = false, entryNodes = [], exitNodes = [], seed = 'kano-traffic' } = {}) {
    if (!Array.isArray(entryNodes) || !Array.isArray(exitNodes)) {
      return { ok: false, reason: 'entry-and-exit-nodes-must-be-arrays' };
    }
    const knownNodes = new Set(network.snapshot().nodes.map(node => node.id));
    const entries = [...new Set(entryNodes.map(String).map(value => value.trim()).filter(Boolean))];
    const exits = [...new Set(exitNodes.map(String).map(value => value.trim()).filter(Boolean))];
    const unknown = [...new Set([...entries, ...exits])].filter(node => !knownNodes.has(node));
    if (enabled && (!entries.length || !exits.length)) {
      return { ok: false, reason: 'entry-and-exit-nodes-required' };
    }
    if (unknown.length) return { ok: false, reason: 'route-node-not-found', nodes: unknown };
    if (enabled) {
      const geometry = network.validateConnections();
      if (!geometry.ok) {
        return {
          ok: false,
          reason: 'road-path-connections-invalid',
          issueCount: geometry.issues.length,
          issues: geometry.issues.slice(0, 20),
          connectionTolerance: geometry.issues[0]?.tolerance ?? null,
        };
      }
      if (!entries.some(from => exits.some(to => from !== to && network.planRoute({ fromNode: from, toNode: to }).ok))) {
        return { ok: false, reason: 'no-reachable-entry-exit-pair' };
      }
    }
    autoRouting = { enabled: Boolean(enabled), continueRoutes: Boolean(continueRoutes), assignAllUnrouted: Boolean(assignAllUnrouted), entryNodes: entries, exitNodes: exits, seed: String(seed || 'kano-traffic') };
    return { ok: true, ...autoRouting };
  }

  function assignUnroutedTraffic(traffic) {
    if (!autoRouting.enabled || !Array.isArray(traffic)) return { assigned: 0, skipped: traffic?.length || 0 };
    let assigned = 0;
    let skipped = 0;
    for (const vehicle of traffic) {
      if (!vehicle || vehicle.kanoRoadRoute?.ok) continue;
      // By default, only route vehicles explicitly tagged by a spawn/traffic
      // integration. Routing every ordinary vehicle can teleport it to the
      // beginning of an authored path, so blanket assignment is opt-in.
      const taggedEntry = typeof vehicle.kanoRoadEntryNode === 'string' ? vehicle.kanoRoadEntryNode.trim() : '';
      const taggedExit = typeof vehicle.kanoRoadExitNode === 'string' ? vehicle.kanoRoadExitNode.trim() : '';
      if ((!taggedEntry || !taggedExit) && !autoRouting.assignAllUnrouted) { skipped += 1; continue; }
      const key = String(vehicle.id ?? `${vehicle.type ?? 'traffic'}:${vehicle.lane ?? 0}:${vehicle.depth ?? 0}`);
      const entryCandidates = taggedEntry ? [taggedEntry] : autoRouting.entryNodes;
      const exitCandidates = taggedExit ? [taggedExit] : autoRouting.exitNodes;
      const startIndex = stableIndex(`${autoRouting.seed}:entry:${key}`, entryCandidates.length);
      const destinationOffset = stableIndex(`${autoRouting.seed}:exit:${key}`, exitCandidates.length);
      let result = null;
      for (let attempt = 0; attempt < entryCandidates.length; attempt += 1) {
        const fromNode = entryCandidates[(startIndex + attempt) % entryCandidates.length];
        for (let offset = 0; offset < exitCandidates.length; offset += 1) {
          const toNode = exitCandidates[(destinationOffset + offset) % exitCandidates.length];
          if (fromNode === toNode) continue;
          const route = network.planRoute({ fromNode, toNode, seed: key });
          if (!route.ok) continue;
          const requestedProgress = Number(vehicle.kanoRoadInitialProgress);
          const assignedRoute = runtime.assignRoute(vehicle, route, { progress: Number.isFinite(requestedProgress) ? Math.max(0, Math.min(1, requestedProgress)) : 0 });
          if (assignedRoute.ok) {
            const pose = runtime.updateVehicle(vehicle);
            if (pose.ok) result = { ok: true, fromNode, toNode, route };
          }
          if (result) break;
        }
        if (result) break;
      }
      if (result) {
        delete vehicle.kanoRoadEntryNode;
        delete vehicle.kanoRoadExitNode;
        delete vehicle.kanoRoadInitialProgress;
        assigned += 1;
      } else skipped += 1;
    }
    return { assigned, skipped };
  }

  function continueCompletedRoutes(traffic) {
    if (!autoRouting.enabled || !autoRouting.continueRoutes || !Array.isArray(traffic)) return { continued: 0, skipped: 0 };
    const snapshot = network.snapshot();
    const pathById = new Map(snapshot.paths.map(path => [path.id, path]));
    let continued = 0;
    let skipped = 0;
    for (const vehicle of traffic) {
      const route = vehicle?.kanoRoadRoute;
      if (!route?.ok || !Array.isArray(route.pathIds) || !route.pathIds.length) continue;
      const lastIndex = route.pathIds.length - 1;
      if (Number(vehicle.kanoRoadPathIndex) !== lastIndex || Number(vehicle.kanoRoadPathProgress) < 0.999) continue;
      const lastPath = pathById.get(route.pathIds[lastIndex]);
      const currentNode = route.nodeIds?.at(-1) || lastPath?.toNode;
      if (!currentNode) { skipped += 1; continue; }
      const key = String(vehicle.id ?? `${vehicle.type ?? 'traffic'}:${vehicle.lane ?? 0}:${vehicle.depth ?? 0}`);
      const candidateExits = autoRouting.exitNodes.filter(node => node !== currentNode);
      const startIndex = stableIndex(`${autoRouting.seed}:continue:${key}:${currentNode}`, candidateExits.length);
      let next = null;
      for (let offset = 0; offset < candidateExits.length; offset += 1) {
        const destination = candidateExits[(startIndex + offset) % candidateExits.length];
        const planned = network.planRoute({ fromNode: currentNode, toNode: destination, seed: `${key}:continue` });
        if (planned.ok && planned.pathIds.length) { next = planned; break; }
      }
      if (!next) { skipped += 1; continue; }
      const assigned = runtime.assignRoute(vehicle, next, { progress: 0 });
      if (!assigned.ok || !runtime.updateVehicle(vehicle).ok) { skipped += 1; continue; }
      continued += 1;
    }
    return { continued, skipped };
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
      autoRouting: { ...autoRouting },
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
        assignUnroutedTraffic(traffic);
        for (const vehicle of traffic) {
          if (vehicle.kanoRoadRoute?.ok) runtime.updateVehicle(vehicle);
        }
        continueCompletedRoutes(traffic);
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
          applyInstancedRoadPoses(this, traffic);
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
    configureAutoRouting,
    assignUnroutedTraffic,
    continueCompletedRoutes,
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


function stableIndex(value, length) {
  if (!length) return 0;
  let hash = 2166136261;
  for (let i = 0; i < value.length; i += 1) { hash ^= value.charCodeAt(i); hash = Math.imul(hash, 16777619); }
  return (hash >>> 0) % length;
}
