/** Pure guards used by the current-main Kano Life core experience repair. */
const KEKE_PATH = /(?:^|\/)vehicles\/keke\/keke-[1-8]\.glb$/i;
export function isKnownKekeGlbPath(path) {
  return typeof path === 'string' && KEKE_PATH.test(path.replace(/\\/g, '/'));
}
export function isPlausibleKekeBounds(size, meshCount) {
  if (!size || ![size.x, size.y, size.z].every(Number.isFinite)) return false;
  const longSide = Math.max(size.x, size.z);
  const shortSide = Math.min(size.x, size.z);
  const footprint = size.x * size.z;
  return Number(meshCount) >= 3
    && size.y >= 0.55 && size.y <= 4.25
    && longSide >= 0.82 && longSide <= 7.5
    && shortSide >= 0.30
    && footprint >= 0.68 && footprint <= 30;
}
export function computeCollisionKickOffset(timeRemaining, duration, side, peak = 1.9) {
  const t = Number(timeRemaining);
  const d = Number(duration);
  if (!Number.isFinite(t) || !Number.isFinite(d) || d <= 0 || t <= 0) return 0;
  const progress = Math.max(0, Math.min(1, 1 - t / d));
  return (Number(side) >= 0 ? 1 : -1) * Math.max(0, Math.min(2.2, Number(peak) || 1.9)) * Math.sin(Math.PI * progress);
}
export function mobileTextureAnisotropy(maxSupported) {
  const n = Number(maxSupported);
  return Number.isFinite(n) ? Math.max(1, Math.min(8, n)) : 1;
}
export function defaultSharpness(current) {
  // Respect an explicit nonstandard user choice. Upgrade only the old/default mode.
  return current == null || current === '' || current === 'standard' ? 'sharp' : current;
}
