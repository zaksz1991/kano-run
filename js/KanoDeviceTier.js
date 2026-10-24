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

export const RENDER_SHARPNESS_KEY = 'kano-life-render-sharpness-v1';

/** Optional player choice: 'standard' (device default), 'sharp' or 'max'.
 * Phones render below their native pixel density to save battery and heat, which
 * looks soft. Sharp and Max raise the resolution ceiling and floor. The
 * adaptive controller still steps down if the phone cannot keep up. */
export function getRenderSharpness() {
  try {
    const value = globalThis.localStorage?.getItem(RENDER_SHARPNESS_KEY);
    return value === 'sharp' || value === 'max' ? value : 'standard';
  } catch { return 'standard'; }
}

function applySharpness(base) {
  const mode = getRenderSharpness();
  if (mode === 'sharp') return { max: Math.max(base.max, 2.0), start: Math.max(base.start, 1.6), min: Math.max(base.min, 1.0) };
  if (mode === 'max') return { max: Math.max(base.max, 3.0), start: Math.max(base.start, 2.25), min: Math.max(base.min, 1.25) };
  return base;
}

/** Capability ratios relative to CSS pixels. The adaptive controller may step
 * down from the startup value when sustained frame timings require it. */
export function getMobileRatios(tier) {
  if (tier === 'high') return applySharpness({ max: 1.45, start: 1.40, min: 0.72 });
  if (tier === 'mid') return applySharpness({ max: 1.25, start: 1.15, min: 0.62 });
  return applySharpness({ max: 1.10, start: 0.92, min: 0.58 });
}

/**
 * Startup target matches the phone sharpness audit. Adaptive quality can lower
 * resolution in response to measured frame time, instead of forcing every phone
 * to render at a blurry sub-CSS-pixel ratio from the beginning.
 */
export function getMobileRenderBudget(tier) {
  // Start with sharper Kano street rendering; the existing adaptive controller
  // lowers these ratios only when sustained frame-time measurements require it.
  if (tier === 'high') return applySharpness({ max: 1.45, start: 1.40, min: 0.72 });
  if (tier === 'mid') return applySharpness({ max: 1.25, start: 1.15, min: 0.62 });
  return applySharpness({ max: 1.10, start: 0.92, min: 0.58 });
}


/** Maximum number of simultaneous imported traffic GLBs during mobile road play.
 * Nearby traffic remains detailed; the remaining vehicles use light procedural
 * models. The player's own keke and gameplay collision simulation are unaffected.
 */
export function getMobileTrafficModelBudget(tier) {
  // Imported traffic meshes are still drawn as many separate material groups.
  // Keep most mobile traffic procedural; the player's own keke remains GLB-backed.
  if (tier === 'high') return 1;
  if (tier === 'mid') return 1;
  return 0;
}
