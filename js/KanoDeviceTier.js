// KANO LIFE — DEVICE TIER FOR PHONE RENDER BUDGETS.
/** @param {{cores?: number, memory?: number}} [hardware] @returns {'high'|'mid'|'low'} */
export function getMobileTier(hardware = {}) {
  const nav = typeof navigator === 'undefined' ? {} : navigator;
  const cores = Number(hardware.cores ?? nav.hardwareConcurrency) || 4;
  // Chromium deviceMemory is optional; unknown memory is treated as mid-range.
  const memory = Number(hardware.memory ?? nav.deviceMemory) || 4;
  if (cores >= 8 && memory >= 8) return 'high';
  if (cores >= 6 && memory >= 4) return 'mid';
  return 'low';
}

/** Resolution budgets relative to CSS pixels. Lower startup/minimum values
 * deliberately reserve GPU headroom for GLB characters, traffic and markets. */
export function getMobileRatios(tier) {
  if (tier === 'high') return { max: 1.45, start: 1.08, min: 0.7 };
  if (tier === 'mid') return { max: 1.25, start: 0.94, min: 0.62 };
  return { max: 1.1, start: 0.82, min: 0.58 };
}

/**
 * Actual 3D rendering budget after the long browser audit showed high frame
 * times with GLB traffic. Keep the tier capability ratios above for diagnostics
 * and compatibility, but render phones below native DPR by default. This cuts
 * roughly 50–65% of pixel shading compared with the previous startup values.
 */
export function getMobileRenderBudget(tier) {
  if (tier === 'high') return { max: 0.9, start: 0.72, min: 0.4 };
  if (tier === 'mid') return { max: 0.78, start: 0.6, min: 0.36 };
  return { max: 0.66, start: 0.5, min: 0.32 };
}


/** Maximum number of simultaneous imported traffic GLBs during mobile road play.
 * Nearby traffic remains detailed; the remaining vehicles use light procedural
 * models. The player's own keke and gameplay collision simulation are unaffected.
 */
export function getMobileTrafficModelBudget(tier) {
  if (tier === 'high') return 3;
  if (tier === 'mid') return 2;
  return 1;
}
