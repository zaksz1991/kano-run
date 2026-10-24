/**
 * Narrow validation exception for the existing catalogued Kano keke GLBs.
 * This does not load, replace, rewrite, or create model assets.
 */
export function isCataloguedKekeModelPath(value) {
  if (typeof value !== 'string') return false;
  const path = value.replace(/\\/g, '/').split(/[?#]/, 1)[0];
  if (path.includes('..')) return false;
  return /(?:^|\/)vehicles\/keke\/keke-[1-8]\.glb$/i.test(path);
}

/**
 * Allow only the single failure that comes from strict part-name evidence.
 * Real catalogued models often export generic mesh names, so geometry and
 * component layout are used as a narrow secondary check. Other failures
 * (invisible meshes, bad bounds, singular transforms) remain rejected.
 */
export function decideCataloguedKekeValidation(input = {}) {
  const path = input.path;
  const reason = input.originalReason;
  const width = Number(input.width);
  const height = Number(input.height);
  const depth = Number(input.depth);
  const meshCount = Number(input.meshCount);
  const wheelLikeCount = Number(input.wheelLikeCount);
  const broadBodyCount = Number(input.broadBodyCount);
  const characterMeshCount = Number(input.characterMeshCount || 0);

  if (!isCataloguedKekeModelPath(path)) {
    return { accept: false, reason: 'untrusted-model-path' };
  }
  if (reason !== 'missing-vehicle-structure-evidence') {
    return { accept: false, reason: 'not-a-name-evidence-only-failure' };
  }
  if (![width, height, depth, meshCount, wheelLikeCount, broadBodyCount, characterMeshCount]
      .every(Number.isFinite)) {
    return { accept: false, reason: 'non-finite-geometry-evidence' };
  }
  if (
    width < 0.62 || width > 2.75 ||
    height < 0.72 || height > 3.35 ||
    depth < 0.78 || depth > 3.8 ||
    width * depth < 0.48 || width * depth > 10.45 ||
    meshCount < 3 || meshCount > 2500
  ) {
    return { accept: false, reason: 'implausible-keke-geometry' };
  }

  // A multi-part model must exhibit several wheel-like pieces or both broad
  // low-body geometry and enough independent components. This avoids treating
  // a human/prop accidentally placed in the vehicle folder as a keke.
  const wheelEvidence = wheelLikeCount >= 2;
  const bodyAndPartsEvidence = broadBodyCount >= 1 && meshCount >= 6 && characterMeshCount <= 2;
  if (!wheelEvidence && !bodyAndPartsEvidence) {
    return { accept: false, reason: 'insufficient-geometric-vehicle-evidence' };
  }
  return {
    accept: true,
    reason: 'catalogued-keke-path-and-geometric-vehicle-evidence',
    path: path.replace(/\\/g, '/'),
    bounds: { width, height, depth },
    meshCount,
    wheelLikeCount,
    broadBodyCount,
    characterMeshCount,
  };
}
