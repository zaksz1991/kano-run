/**
 * Pure geometry-budget rules used by Kano Life's mobile GLB optimizer.
 * No browser globals, Three.js imports, model changes, or asset writes.
 */
export const KANO_MOBILE_MODEL_TRIANGLE_LIMIT = 5_000;
export const KANO_MOBILE_MODEL_TRIANGLE_TARGET = 4_800;

function finiteNonNegative(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

/** Count triangles from a regular BufferGeometry and respect drawRange.count. */
export function countGeometryTriangles(geometry) {
  if (!geometry || typeof geometry !== 'object') return 0;

  const indexCount = geometry.index?.count;
  const positionCount = geometry.attributes?.position?.count;
  const hasIndex = geometry.index != null && Number.isFinite(Number(indexCount));
  const rawCount = hasIndex ? Number(indexCount) : Number(positionCount);
  if (!Number.isFinite(rawCount) || rawCount < 0) return 0;

  const drawRangeCount = Number(geometry.drawRange?.count);
  const boundedCount = Number.isFinite(drawRangeCount) && drawRangeCount >= 0
    ? Math.min(rawCount, drawRangeCount)
    : rawCount;
  return Math.floor(boundedCount / 3);
}

/**
 * Plan a conservative reduction. `eligibleTriangles` can be simplified;
 * `fixedTriangles` belong to protected or unsupported meshes and are retained.
 * If the fixed meshes already exceed the budget, report the issue instead of
 * hiding, deleting, or substituting real model geometry.
 */
export function planMobileGeometryReduction(source = {}) {
  const totalTriangles = Math.floor(finiteNonNegative(source.totalTriangles));
  const eligibleTriangles = Math.floor(finiteNonNegative(source.eligibleTriangles));
  const fixedTriangles = Math.floor(finiteNonNegative(source.fixedTriangles));

  const common = {
    originalTriangles: totalTriangles,
    totalTriangles,
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

  const hardEligibleMaximum = Math.max(1, KANO_MOBILE_MODEL_TRIANGLE_LIMIT - fixedTriangles - 1);
  const targetEligible = Math.max(
    1,
    Math.min(
      hardEligibleMaximum,
      KANO_MOBILE_MODEL_TRIANGLE_TARGET - fixedTriangles - 1 > 0
        ? KANO_MOBILE_MODEL_TRIANGLE_TARGET - fixedTriangles - 1
        : hardEligibleMaximum,
    ),
  );
  const keepRatio = Math.max(0.01, Math.min(0.98, targetEligible / eligibleTriangles));
  return { ...common, status: 'simplification-planned', keepRatio };
}

/** Return a removal count while leaving a safe minimum number of vertices. */
export function verticesToRemove(vertexCount, keepRatio) {
  const count = Math.floor(finiteNonNegative(vertexCount));
  if (count < 5) return 0;
  const ratio = Number(keepRatio);
  if (!Number.isFinite(ratio)) return 0;
  const clampedRatio = Math.max(0, Math.min(1, ratio));
  const proposed = Math.floor(count * (1 - clampedRatio));
  return Math.max(0, Math.min(count - 4, proposed));
}
