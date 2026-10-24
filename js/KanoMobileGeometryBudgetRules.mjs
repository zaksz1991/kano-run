/**
 * Pure policy helpers for the mobile GLB geometry budget.
 * No Three.js imports are required, so these rules are testable in Node.
 */
export const KANO_MOBILE_MODEL_TRIANGLE_TARGET = 4800;
export const KANO_MOBILE_MODEL_TRIANGLE_LIMIT = 5000;

function finiteNonNegativeInteger(value) {
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0) return 0;
  return Math.floor(number);
}

/** Count triangles in indexed or non-indexed geometry, respecting a finite draw range. */
export function countGeometryTriangles(geometry) {
  if (!geometry || typeof geometry !== 'object') return 0;

  const rawCount = geometry.index?.count ?? geometry.attributes?.position?.count;
  let count = finiteNonNegativeInteger(rawCount);
  if (count <= 0) return 0;

  const drawRangeCount = Number(geometry.drawRange?.count);
  if (Number.isFinite(drawRangeCount)) {
    if (drawRangeCount < 0) return 0;
    count = Math.min(count, Math.floor(drawRangeCount));
  }

  return Math.max(0, Math.floor(count / 3));
}

/**
 * Plan a safe first-pass reduction. The target is one triangle below 4,800
 * before rounding so a successful plan does not depend on equality at the limit.
 * Fixed (rigged/unsupported) triangles are accounted for; the planner never
 * claims a model is reducible when the fixed portion alone is too large.
 */
export function planMobileGeometryReduction(input = {}) {
  const totalTriangles = finiteNonNegativeInteger(input?.totalTriangles);
  const eligibleTriangles = finiteNonNegativeInteger(input?.eligibleTriangles);
  const fixedTriangles = finiteNonNegativeInteger(input?.fixedTriangles);

  const base = {
    totalTriangles,
    eligibleTriangles,
    fixedTriangles,
    targetTriangles: KANO_MOBILE_MODEL_TRIANGLE_TARGET,
    hardLimitTriangles: KANO_MOBILE_MODEL_TRIANGLE_LIMIT,
    keepRatio: 1,
  };

  if (totalTriangles <= KANO_MOBILE_MODEL_TRIANGLE_TARGET) {
    return { ...base, status: 'within-budget' };
  }

  const availableEligibleTriangles = KANO_MOBILE_MODEL_TRIANGLE_TARGET - fixedTriangles - 1;
  if (eligibleTriangles <= 0 || availableEligibleTriangles <= 0) {
    return { ...base, status: 'over-budget-unreducible' };
  }

  const keepRatio = Math.max(
    0,
    Math.min(1, availableEligibleTriangles / eligibleTriangles),
  );
  if (!Number.isFinite(keepRatio) || keepRatio >= 1) {
    return { ...base, status: 'over-budget-unreducible' };
  }

  return { ...base, keepRatio, status: 'simplification-planned' };
}

/** Calculate a bounded vertex removal count while retaining at least four vertices. */
export function verticesToRemove(vertexCountInput, keepRatioInput) {
  const vertexCount = finiteNonNegativeInteger(vertexCountInput);
  if (vertexCount < 5) return 0;

  const rawRatio = Number(keepRatioInput);
  const keepRatio = Number.isFinite(rawRatio)
    ? Math.max(0, Math.min(1, rawRatio))
    : 1;
  const wantedKeep = Math.floor(vertexCount * keepRatio);
  return Math.max(0, Math.min(vertexCount - 4, vertexCount - wantedKeep));
}
