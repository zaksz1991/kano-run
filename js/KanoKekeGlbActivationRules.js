/**
 * Narrow acceptance rules for Kano's known keke-3 GLB.
 *
 * The renderer's normal structural validator remains authoritative. This rule
 * only covers one failure mode: the real, explicitly catalogued keke asset has
 * plausible vehicle-sized geometry but its mesh labels do not contain words
 * such as "body", "vehicle", or "wheel".
 */
const TRUSTED_KEKE_PATHS = new Set([
  'vehicles/keke/keke-3.glb',
]);

export function normaliseKekeModelPath(value) {
  return String(value ?? '')
    .replace(/\\/g, '/')
    .replace(/^\/+/, '')
    .replace(/^assets\/models\//i, '')
    .trim();
}

export function isPlausibleCataloguedKekeStructureGap(modelPath, result) {
  const path = normaliseKekeModelPath(modelPath);
  if (!TRUSTED_KEKE_PATHS.has(path)) return false;
  if (!result || result.ok === true) return false;
  if (result.reason !== 'missing-vehicle-structure-evidence') return false;

  const meshCount = Number(result.meshCount);
  const evidence = result.evidence || {};
  const dimensions = result.bounds || {};
  const width = Number(dimensions.width);
  const height = Number(dimensions.height);
  const depth = Number(dimensions.depth);
  const footprint = Number(dimensions.footprint);

  // Do not allow a character-only model to masquerade as a vehicle. The
  // approved path and plausible bounds must both agree with the asset class.
  if (Number(evidence.characterMeshes) > 0) return false;
  if (!Number.isInteger(meshCount) || meshCount < 1 || meshCount > 500) return false;
  if (![width, height, depth, footprint].every(Number.isFinite)) return false;

  // ModelManager normalises this asset to 1.85 m tall. These deliberately
  // conservative limits reject collapsed objects and implausibly large meshes.
  return width >= 0.65 && width <= 2.8
    && height >= 1.25 && height <= 2.2
    && depth >= 0.85 && depth <= 3.2
    && footprint >= 0.75 && footprint <= 7.5;
}

export function describeKekeFacing({ roadForward = '-Z', sourceYawRadians = Math.PI } = {}) {
  return {
    roadForward,
    sourceYawRadians: Number.isFinite(Number(sourceYawRadians))
      ? Number(sourceYawRadians)
      : null,
    convention: 'ModelManager rotates the imported keke source by PI; the seated driver rig uses the wrapper forward axis (-Z).',
  };
}
