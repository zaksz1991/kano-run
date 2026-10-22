/**
 * Release the unique CanvasTexture attached to a temporary roadside zone.
 * Zone labels are created per pickup/drop-off/fuel zone, so their textures
 * are owned by that zone and must be released when the zone leaves the world.
 * This deliberately does not traverse child GLB instances or dispose shared
 * materials/textures owned by ModelManager.
 */
export function disposeOwnedZoneLabelTexture(actor) {
  const data = actor?.userData;
  const texture = data?.labelTexture;
  if (!texture) return false;

  // Clear the owner reference first to make repeated cleanup idempotent.
  data.labelTexture = null;
  if (typeof texture.dispose === 'function') texture.dispose();
  return true;
}
