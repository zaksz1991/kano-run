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
