/**
 * Kano Run — explicit road-network and AI route planner.
 * Requires scene-space paths from KanoDriveableRoadGeometry.js; never invents anchors.
 */
import { sampleKanoRoadPath } from './KanoDriveableRoadGeometry.js';

const finite = value => Number.isFinite(Number(value));
const pointDistance = (a, b) => Math.hypot(
  Number(a?.x) - Number(b?.x),
  Number(a?.y ?? 0) - Number(b?.y ?? 0),
  Number(a?.z ?? 0) - Number(b?.z ?? 0),
);

export function createKanoTrafficRoadNetwork({ connectionTolerance = 0.75 } = {}) {
  const paths = new Map();
  const outgoing = new Map();
  const nodes = new Map();
  const tolerance = Number(connectionTolerance);
  if (!Number.isFinite(tolerance) || tolerance < 0 || tolerance > 10) {
    return { ok: false, reason: 'connection-tolerance-invalid' };
  }

  function addPath({ path, fromNode, toNode, turn = 'straight', bidirectional = false } = {}) {
    if (!path?.ok && !Array.isArray(path?.table)) return { ok: false, reason: 'road-path-invalid' };
    const road = path.path || path;
    if (!road?.id || !Array.isArray(road.table) || road.table.length < 2 || !(road.length > 0)) {
      return { ok: false, reason: 'road-path-invalid' };
    }
    if (typeof fromNode !== 'string' || !fromNode.trim() || typeof toNode !== 'string' || !toNode.trim()) {
      return { ok: false, reason: 'road-node-required' };
    }
    if (fromNode === toNode) return { ok: false, reason: 'self-loop-not-supported' };
    if (!['left', 'straight', 'right', 'u-turn'].includes(turn)) return { ok: false, reason: 'turn-invalid' };
    if (paths.has(road.id)) return { ok: false, reason: 'road-path-duplicate' };

    const cooked = { id: road.id, path: road, fromNode: fromNode.trim(), toNode: toNode.trim(), turn, bidirectional: Boolean(bidirectional) };
    paths.set(cooked.id, cooked);
    for (const nodeId of [cooked.fromNode, cooked.toNode]) {
      if (!nodes.has(nodeId)) nodes.set(nodeId, { id: nodeId, pathIds: new Set() });
      nodes.get(nodeId).pathIds.add(cooked.id);
    }
    if (!outgoing.has(cooked.fromNode)) outgoing.set(cooked.fromNode, []);
    outgoing.get(cooked.fromNode).push({ pathId: cooked.id, fromNode: cooked.fromNode, toNode: cooked.toNode, turn });
    if (cooked.bidirectional) {
      if (!outgoing.has(cooked.toNode)) outgoing.set(cooked.toNode, []);
      outgoing.get(cooked.toNode).push({ pathId: cooked.id, fromNode: cooked.toNode, toNode: cooked.fromNode, turn: 'u-turn', reverse: true });
    }
    return { ok: true, pathId: cooked.id, fromNode: cooked.fromNode, toNode: cooked.toNode };
  }

  function validateConnections() {
    const issues = [];
    for (const [nodeId, edges] of outgoing) {
      if (edges.length < 2) continue;
      const ends = edges.map(edge => {
        const record = paths.get(edge.pathId);
        const isReverse = Boolean(edge.reverse);
        const point = isReverse ? record.path.table[record.path.table.length - 1].position : record.path.table[0].position;
        return { edge, point };
      });
      for (let i = 0; i < ends.length; i += 1) {
        for (let j = i + 1; j < ends.length; j += 1) {
          const distance = pointDistance(ends[i].point, ends[j].point);
          if (!finite(distance) || distance > tolerance) {
            issues.push({ nodeId, pathIds: [ends[i].edge.pathId, ends[j].edge.pathId], distance, tolerance });
          }
        }
      }
    }
    return { ok: issues.length === 0, issues, nodeCount: nodes.size, pathCount: paths.size };
  }

  function planRoute({ fromNode, toNode, seed = 'traffic', avoidImmediateUTurn = true } = {}) {
    if (!nodes.has(fromNode) || !nodes.has(toNode)) return { ok: false, reason: 'route-node-not-found' };
    if (fromNode === toNode) return { ok: true, pathIds: [], nodeIds: [fromNode], length: 0 };
    const queue = [{ nodeId: fromNode, pathIds: [], nodeIds: [fromNode], length: 0 }];
    const bestDepth = new Map([[fromNode, 0]]);
    while (queue.length) {
      const current = queue.shift();
      const edges = (outgoing.get(current.nodeId) || []).filter(edge => !(avoidImmediateUTurn && edge.reverse && current.pathIds.length === 0));
      // Stable per-vehicle tie-breaking: different traffic can choose different valid routes.
      edges.sort((a, b) => stableRank(`${seed}:${current.nodeId}:${a.pathId}`) - stableRank(`${seed}:${current.nodeId}:${b.pathId}`));
      for (const edge of edges) {
        const record = paths.get(edge.pathId);
        const nextDepth = current.pathIds.length + 1;
        if (bestDepth.has(edge.toNode) && bestDepth.get(edge.toNode) < nextDepth) continue;
        const pathIds = [...current.pathIds, edge.pathId];
        const nodeIds = [...current.nodeIds, edge.toNode];
        const length = current.length + record.path.length;
        if (edge.toNode === toNode) return { ok: true, pathIds, nodeIds, length };
        bestDepth.set(edge.toNode, nextDepth);
        queue.push({ nodeId: edge.toNode, pathIds, nodeIds, length });
      }
    }
    return { ok: false, reason: 'destination-unreachable' };
  }

  function sampleRoutePose(route, pathIndex, progress) {
    if (!route?.ok || !Array.isArray(route.pathIds)) return { ok: false, reason: 'route-invalid' };
    const pathId = route.pathIds[pathIndex];
    const record = paths.get(pathId);
    if (!record) return { ok: false, reason: 'route-path-not-found', pathId };
    const sampled = sampleKanoRoadPath(record.path, record.bidirectional && route.reverse ? 1 - Number(progress) : progress);
    return sampled.ok ? { ...sampled, networkPathId: pathId, fromNode: record.fromNode, toNode: record.toNode, turn: record.turn } : sampled;
  }

  function snapshot() {
    return {
      nodeCount: nodes.size,
      pathCount: paths.size,
      nodes: [...nodes.values()].map(node => ({ id: node.id, pathIds: [...node.pathIds] })),
      paths: [...paths.values()].map(({ id, fromNode, toNode, turn, bidirectional, path }) => ({ id, fromNode, toNode, turn, bidirectional, length: path.length })),
    };
  }

  return { ok: true, addPath, validateConnections, planRoute, sampleRoutePose, snapshot };
}

function stableRank(value) {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}
