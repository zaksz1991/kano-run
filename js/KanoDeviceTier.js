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
  if (tier === 'high') return { max: 1.75, start: 1.4, min: 0.9 };
  if (tier === 'mid') return { max: 1.5, start: 1.2, min: 0.82 };
  return { max: 1.2, start: 0.95, min: 0.7 };
}

/**
 * Mobile rendering scale measured against CSS pixels, not the phone's full
 * hardware DPR. The former 0.34–0.48 settings rendered fewer pixels than the
 * CSS layout and made the entire game visibly soft. These values keep a clear
 * baseline while allowing the adaptive controller to reduce detail/LOD first.
 */
export function getMobileRenderBudget(tier) {
  if (tier === 'high') return { max: 1.6, start: 1.35, min: 0.9 };
  if (tier === 'mid') return { max: 1.4, start: 1.15, min: 0.8 };
  return { max: 1.1, start: 0.92, min: 0.7 };
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
