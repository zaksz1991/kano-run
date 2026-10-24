/**
 * Shared rules for Kano Life's mobile GLB geometry-budget adapter.
 * Pure functions only: no Three.js import, browser access, or asset writes.
 */
export const KANO_MOBILE_MODEL_TRIANGLE_LIMIT = 5_000;
export const KANO_MOBILE_MODEL_TRIANGLE_TARGET = 4_800;

function finiteNonNegative(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

/** Count submitted triangle primitives from an ordinary BufferGeometry. */
export function countGeometryTriangles(geometry) {
  if (!geometry || typeof geometry !== 'object') return 0;
  const indexCount = geometry.index?.count;
  const positionCount = geometry.attributes?.position?.count;
  const rawCount = Number.isFinite(Number(indexCount))
    ? Number(indexCount)
    : Number(positionCount);
  if (!Number.isFinite(rawCount) || rawCount < 0) return 0;

  const drawRangeCount = Number(geometry.drawRange?.count);
  const boundedCount = Number.isFinite(drawRangeCount) && drawRangeCount >= 0
    ? Math.min(rawCount, drawRangeCount)
    : rawCount;
  return Math.floor(boundedCount / 3);
}

/**
 * Decide whether a cached model needs simplification. `eligibleTriangles` are
 * from static single-material meshes; `fixedTriangles` are protected meshes.
 * Unreducible/protected excess is reported rather than hidden or substituted.
 */
export function planMobileGeometryReduction(source = {}) {
  const totalTriangles = Math.floor(finiteNonNegative(source.totalTriangles));
  const eligibleTriangles = Math.floor(finiteNonNegative(source.eligibleTriangles));
  const fixedTriangles = Math.floor(finiteNonNegative(source.fixedTriangles));

  const common = {
    originalTriangles: totalTriangles,
    eligibleTriangles,
    fixedTriangles,
    targetTriangles: KANO_MOBILE_MODEL_TRIANGLE_TARGET,
    hardLimitTriangles: KANO_MOBILE_MODEL_TRIANGLE_LIMIT,
    keepRatio: 1,
  };

  if (totalTriangles <= KANO_MOBILE_MODEL_TRIANGLE_LIMIT) {
    return { ...common, status: 'within-budget' };
  }
  if (eligibleTriangles <= 0 || fixedTriangles >= KANO_MOBILE_MODEL_TRIANGLE_LIMIT) {
    return { ...common, status: 'over-budget-unreducible' };
  }

  // Aim for 4,800 total triangles when possible. If protected geometry alone
  // exceeds that aspirational target, aim just below the 5,000 hard limit.
  const maximumEligible = Math.max(1, KANO_MOBILE_MODEL_TRIANGLE_LIMIT - fixedTriangles - 1);
  const targetEligible = Math.max(
    1,
    Math.min(
      maximumEligible,
      KANO_MOBILE_MODEL_TRIANGLE_TARGET - fixedTriangles > 0
        ? KANO_MOBILE_MODEL_TRIANGLE_TARGET - fixedTriangles
        : maximumEligible,
    ),
  );
  const keepRatio = Math.max(0.01, Math.min(0.98, targetEligible / eligibleTriangles));
  return { ...common, status: 'simplification-planned', keepRatio };
}

/** Number of vertices to ask SimplifyModifier to remove, leaving at least four. */
export function verticesToRemove(vertexCount, keepRatio) {
  const count = Math.floor(finiteNonNegative(vertexCount));
  if (count < 5) return 0;
  const ratio = Number(keepRatio);
  if (!Number.isFinite(ratio)) return 0;
  const clampedRatio = Math.max(0, Math.min(1, ratio));
  const proposed = Math.floor(count * (1 - clampedRatio));
  return Math.max(0, Math.min(count - 4, proposed));
}
