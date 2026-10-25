/**
 * Optional runtime bridge from the authored road graph to existing lane/depth traffic.
 * Road paths must use the renderer's scene coordinates: x in lane-world units,
 * z mapped to depth by depth = -z / 88. No road anchors are guessed here.
 */
import { sampleKanoRoadPath } from './KanoDriveableRoadGeometry.js';

const DEPTH_UNITS = 88;
const clamp = (n, a, b) => Math.max(a, Math.min(b, n));
const normalizeAngle = angle => {
  let value = angle;
  while (value > Math.PI) value -= Math.PI * 2;
  while (value < -Math.PI) value += Math.PI * 2;
  return value;
};

export function createKanoTrafficRoadRuntime(network) {
  if (!network?.ok || typeof network.sampleRoutePose !== 'function') {
    return { ok: false, reason: 'road-network-invalid' };
  }

  function assignRoute(vehicle, route, { progress = 0 } = {}) {
    if (!vehicle || !route?.ok || !Array.isArray(route.pathIds) || route.pathIds.length === 0) {
      return { ok: false, reason: 'vehicle-or-route-invalid' };
    }
    const initialProgress = Number(progress);
    if (!Number.isFinite(initialProgress) || initialProgress < 0 || initialProgress > 1) {
      return { ok: false, reason: 'route-progress-invalid' };
    }
    const observer = installDepthObserver(vehicle);
    if (!observer.ok) return observer;
    vehicle.kanoRoadRoute = route;
    vehicle.kanoRoadPathIndex = 0;
    vehicle.kanoRoadPathProgress = initialProgress;
    vehicle.kanoRoadLastDepth = Number(vehicle.depth) || 0;
    vehicle.kanoRoadPose = null;
    vehicle.__kanoRoadRuntime = api;
    return { ok: true, pathId: route.pathIds[0], progress: initialProgress };
  }

  function updateVehicle(vehicle) {
    const route = vehicle?.kanoRoadRoute;
    if (!route?.ok || !Array.isArray(route.pathIds)) return { ok: false, reason: 'vehicle-route-not-assigned' };
    let index = clamp(Math.trunc(Number(vehicle.kanoRoadPathIndex) || 0), 0, route.pathIds.length - 1);
    let progress = clamp(Number(vehicle.kanoRoadPathProgress) || 0, 0, 1);
    const currentDepth = Number(vehicle.depth) || 0;
    const lastDepth = Number(vehicle.kanoRoadLastDepth);
    // Carry travelled scene distance across path boundaries. The previous
    // normalized-progress subtraction lost distance when adjacent paths had
    // different lengths or a single frame crossed more than one short path.
    let travelledDistance = progress * pathLength(route.pathIds[index]);
    if (Number.isFinite(lastDepth)) travelledDistance += Math.abs(currentDepth - lastDepth) * DEPTH_UNITS;

    while (index < route.pathIds.length - 1) {
      const currentLength = pathLength(route.pathIds[index]);
      if (travelledDistance < currentLength) break;
      travelledDistance -= currentLength;
      index += 1;
    }
    const activeLength = pathLength(route.pathIds[index]);
    progress = clamp(travelledDistance / activeLength, 0, 1);
    const sampled = network.sampleRoutePose(route, index, progress);
    if (!sampled.ok) return sampled;

    const worldX = Number(sampled.position?.x);
    const worldZ = Number(sampled.position?.z);
    if (!Number.isFinite(worldX) || !Number.isFinite(worldZ)) return { ok: false, reason: 'road-pose-invalid' };
    const lane = clamp(Math.round(worldX / 3 + 1), 0, 2);
    vehicle.lane = lane;
    // Suppress the older lane-shift adapter for road-network-controlled traffic.
    vehicle._kanoTurnOffsetX = 0;
    vehicle.kanoTurn = null;
    // visualOffsetX is shared with existing collision calculations.
    vehicle.visualOffsetX = worldX - (lane - 1) * 3;
    vehicle.__kanoRoadRuntimeUpdating = true;
    try { vehicle.depth = -worldZ / DEPTH_UNITS; }
    finally { vehicle.__kanoRoadRuntimeUpdating = false; }
    vehicle.kanoRoadWorldY = Number(sampled.position.y) || 0;
    const baseYaw = vehicle.direction === -1 ? Math.PI : 0;
    vehicle.kanoVisualYawDelta = normalizeAngle(Number(sampled.yaw) - baseYaw);
    vehicle.kanoRoadPathIndex = index;
    vehicle.kanoRoadPathProgress = progress;
    vehicle.kanoRoadLastDepth = vehicle.depth;
    vehicle.kanoRoadPose = {
      pathId: sampled.networkPathId,
      progress,
      position: { x: worldX, y: vehicle.kanoRoadWorldY, z: worldZ },
      yaw: sampled.yaw,
      turn: sampled.turn,
      reverse: Boolean(sampled.reverse),
    };
    return { ok: true, ...vehicle.kanoRoadPose, lane, visualOffsetX: vehicle.visualOffsetX, depth: vehicle.depth };
  }

  function installDepthObserver(vehicle) {
    if (vehicle.__kanoRoadDepthObserver) return { ok: true, alreadyInstalled: true };
    const descriptor = Object.getOwnPropertyDescriptor(vehicle, 'depth');
    if (descriptor && descriptor.configurable === false) return { ok: false, reason: 'vehicle-depth-not-configurable' };
    if (descriptor && (descriptor.get || descriptor.set)) return { ok: false, reason: 'vehicle-depth-accessor-unsupported' };
    let storedDepth = Number(vehicle.depth) || 0;
    Object.defineProperty(vehicle, 'depth', {
      configurable: true,
      enumerable: descriptor?.enumerable ?? true,
      get() { return storedDepth; },
      set(value) {
        storedDepth = Number(value) || 0;
        if (!this.__kanoRoadRuntimeUpdating && this.kanoRoadRoute?.ok) {
          this.__kanoRoadRuntime?.updateVehicle(this);
        }
      },
    });
    vehicle.__kanoRoadDepthObserver = true;
    return { ok: true };
  }

  function pathLength(pathId) {
    const record = network.snapshot().paths.find(path => path.id === pathId);
    return Math.max(0.001, Number(record?.length) || 0.001);
  }

  function applyActorPose(actor, vehicle) {
    const pose = vehicle?.kanoRoadPose;
    if (!actor || !pose?.position) return false;
    actor.position?.set?.(pose.position.x, pose.position.y, pose.position.z);
    if (actor.rotation) actor.rotation.y = pose.yaw;
    return true;
  }

  const api = { ok: true, assignRoute, updateVehicle, applyActorPose };
  return api;
}
