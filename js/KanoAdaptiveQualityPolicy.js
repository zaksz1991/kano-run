/**
 * KANO LIFE — deterministic adaptive rendering policy.
 *
 * This module contains only policy decisions. It does not touch Three.js,
 * gameplay state, model visibility, or renderer instances, so the rules can be
 * regression-tested without loading the browser renderer.
 */

const clamp = (value, minimum, maximum) =>
  Math.max(minimum, Math.min(maximum, value));

const uniqueDescending = (values) => {
  const result = [];
  for (const value of values) {
    const number = Number(value);
    if (!Number.isFinite(number) || number <= 0) continue;
    if (!result.some((entry) => Math.abs(entry - number) < 0.015)) {
      result.push(number);
    }
  }
  return result.sort((a, b) => b - a);
};

/**
 * Builds the ordered quality ladder. A weak mobile GPU gets emergency
 * resolution steps only when the player has not selected Sharp/Max manually.
 * Once resolution bottoms out, duplicate ratio entries continue stepping the
 * visual-only scene LOD without repeatedly resizing the WebGL canvas.
 */
export function buildAdaptiveQualityPlan({
  baseRatio = 1,
  minimumRatio = 1,
  startupRatio = 1,
  mobile = false,
  emergencyFloor = null,
} = {}) {
  const safeBase = Math.max(0.5, Number(baseRatio) || 1);
  const safeMinimum = clamp(Number(minimumRatio) || 1, 0.5, safeBase);
  const emergencyEnabled = mobile && emergencyFloor !== null && emergencyFloor !== undefined && Number.isFinite(Number(emergencyFloor));
  const floor = emergencyEnabled
    ? clamp(Number(emergencyFloor), 0.65, safeMinimum)
    : safeMinimum;
  const safeStartup = clamp(Number(startupRatio) || safeBase, floor, safeBase);

  const raw = [
    safeBase,
    safeBase * 0.94,
    safeBase * 0.88,
    safeBase * 0.82,
    safeStartup,
    safeMinimum,
  ];

  if (emergencyEnabled) {
    raw.push(safeBase * 0.74, safeBase * 0.67, safeBase * 0.62, floor);
  }

  const levels = uniqueDescending(raw.map((ratio) => clamp(ratio, floor, safeBase)));
  if (mobile && levels.length) {
    // Keep a minimum 1:1 CSS-pixel step available on normal profiles. Emergency
    // levels below it are reached only after the normal ladder is exhausted.
    for (let index = 0; index < 4; index += 1) levels.push(floor);
  }

  const lodDistances = mobile
    ? [Infinity, 190, 165, 140, 118, 95, 75, 62, 52, 44, 36, 30, 26, 22]
    : [Infinity, 270, 245, 220, 195, 175];

  return {
    levels,
    lodDistances,
    minimumRatio: floor,
    emergencyResolution: emergencyEnabled,
    startupRatio: safeStartup,
  };
}

/** Classifies one completed one-second FPS window. */
export function classifyAdaptivePerformance(fps, { mobile = false } = {}) {
  const value = Number(fps);
  if (!Number.isFinite(value) || value <= 0) return 'unknown';
  if (value < 18) return 'critical';
  if (value < (mobile ? 29 : 40)) return 'slow';
  if (value > (mobile ? 50 : 55)) return 'headroom';
  return 'stable';
}

/**
 * Returns a one-level quality action. It deliberately uses hysteresis so
 * short frame spikes and scene transitions do not cause constant resolution
 * changes. `levelIndex` zero is the highest-quality level.
 */
export function chooseAdaptiveQualityAction({
  fps,
  slowWindows = 0,
  fastWindows = 0,
  sinceChangeMs = Infinity,
  levelIndex = 0,
  levelCount = 1,
  mobile = false,
} = {}) {
  const profile = classifyAdaptivePerformance(fps, { mobile });
  const canReduce = levelIndex < levelCount - 1;
  const canRestore = levelIndex > 0;

  if (canReduce && (profile === 'critical' || profile === 'slow') && slowWindows >= 2) {
    const minimumHold = profile === 'critical' ? 750 : 1200;
    if (sinceChangeMs >= minimumHold) return 'reduce';
  }

  if (canRestore && profile === 'headroom' && fastWindows >= 12 && sinceChangeMs >= 12000) {
    return 'restore';
  }

  return 'hold';
}
