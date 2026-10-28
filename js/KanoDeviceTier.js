// KANO LIFE — DEVICE TIER FOR PHONE RENDER BUDGETS.

let cachedGpuName;
/** Unmasked GPU name from a throw-away WebGL context (cached; '' when unknown). */
function readGpuName() {
  if (cachedGpuName !== undefined) return cachedGpuName;
  cachedGpuName = '';
  try {
    if (typeof document === 'undefined' || typeof document.createElement !== 'function') return cachedGpuName;
    const canvas = document.createElement('canvas');
    const gl = canvas.getContext?.('webgl2') || canvas.getContext?.('webgl');
    const ext = gl?.getExtension?.('WEBGL_debug_renderer_info');
    if (ext) cachedGpuName = String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) || '');
    gl?.getExtension?.('WEBGL_lose_context')?.loseContext?.();
  } catch (_) { /* unknown GPU */ }
  return cachedGpuName;
}

/** Entry/mid-range mobile GPUs that cannot hold 60k+ triangles with 200+ draws. */
export function isWeakMobileGpu(name) {
  return /Mali-(T\d+|G3\d|G5\d)\b|Adreno \(TM\) ?[2-5]\d\d\b|PowerVR|SGX/i.test(String(name || ''));
}

/** @param {{cores?: number, memory?: number, gpu?: string}} [hardware] @returns {'high'|'mid'|'low'} */
export function getMobileTier(hardware = {}) {
  const nav = typeof navigator === 'undefined' ? {} : navigator;
  const cores = Number(hardware.cores ?? nav.hardwareConcurrency) || 4;
  // Chromium deviceMemory is optional; unknown memory is treated as mid-range.
  const memory = Number(hardware.memory ?? nav.deviceMemory) || 4;
  // A phone can have many cores and lots of RAM and still carry a mid-range GPU
  // (for example Mali-G52). Judge by the graphics chip too, otherwise it is
  // given the heaviest scene and runs at ~15 FPS.
  const gpu = hardware.gpu !== undefined ? String(hardware.gpu) : readGpuName();
  if (isWeakMobileGpu(gpu)) return 'low';
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
  if (tier === 'high') return applySharpness({ max: 1.75, start: 1.60, min: 1.0 });
  if (tier === 'mid') return applySharpness({ max: 1.5, start: 1.35, min: 1.0 });
  return applySharpness({ max: 1.5, start: 1.25, min: 1.0 });
}

/**
 * Startup target matches the phone sharpness audit. Adaptive quality can lower
 * resolution in response to measured frame time, instead of forcing every phone
 * to render at a blurry sub-CSS-pixel ratio from the beginning.
 */
export function getMobileRenderBudget(tier) {
  // Start with sharper Kano street rendering; the existing adaptive controller
  // lowers these ratios only when sustained frame-time measurements require it.
  if (tier === 'high') return applySharpness({ max: 1.75, start: 1.60, min: 1.0 });
  if (tier === 'mid') return applySharpness({ max: 1.5, start: 1.35, min: 1.0 });
  return applySharpness({ max: 1.5, start: 1.25, min: 1.0 });
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
