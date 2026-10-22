// ============================================================
// KANO LIFE — DEVICE TIER (render quality for phones)
// File: js/KanoDeviceTier.js
// Picks a render-quality tier from what the browser reports. The adaptive
// quality system still lowers resolution at runtime if the frame rate drops.
// ============================================================

/**
 * @param {{cores?: number, memory?: number}} [hardware]
 * @returns {'high'|'mid'|'low'}
 */
export function getMobileTier(hardware = {}) {
  const nav = typeof navigator === 'undefined' ? {} : navigator;
  const cores = Number(hardware.cores ?? nav.hardwareConcurrency) || 4;
  // deviceMemory is Chromium-only (values like 0.5, 1, 2, 4, 8). Assume 4 when unknown.
  const memory = Number(hardware.memory ?? nav.deviceMemory) || 4;

  if (cores >= 8 && memory >= 8) return 'high';
  if (cores >= 6 && memory >= 4) return 'mid';
  return 'low';
}

/** Render-resolution limits relative to CSS pixels, per tier (phones only). */
export function getMobileRatios(tier) {
  if (tier === 'high') return { max: 1.75, start: 1.5, min: 0.9 };
  if (tier === 'mid') return { max: 1.5, start: 1.25, min: 0.8 };
  return { max: 1.28, start: 1.06, min: 0.78 };
}
