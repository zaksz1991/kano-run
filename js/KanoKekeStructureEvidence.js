// Pure name/shape classifier used by the live renderer and regression tests.
// Keeping it independent from Three.js lets tests exercise the root-name
// contamination bug directly without needing a WebGL context.
const GENERIC_WRAPPER_NAMES = new Set([
  'scene', 'root', 'rootnode', 'node', 'group', 'model', 'object',
  'mesh', 'meshes', 'keke', 'kekeroot', 'kekemodel', 'kekemodelroot',
  'vehicle', 'vehicleroot', 'vehiclemodel', 'vehiclerootnode',
  'defaultscene', 'gltfscene', 'container', 'assets', 'armature', 'skeleton',
]);

function normaliseName(name) {
  return String(name || '').trim().toLowerCase().replace(/[^a-z0-9]/g, '');
}

export function buildKekeEvidenceNamePaths(descendantNames, rootName = '') {
  const names = Array.isArray(descendantNames)
    ? descendantNames.map((name) => String(name || '').trim()).filter(Boolean)
    : [];
  const structuralNames = names.filter((name) => !GENERIC_WRAPPER_NAMES.has(normaliseName(name)));
  const completeNames = [...names, String(rootName || '').trim()].filter(Boolean);
  return {
    structuralNamePath: structuralNames.join(' '),
    completeNamePath: completeNames.join(' '),
  };
}

export function classifyKekeMeshEvidence({
  structuralNamePath = '',
  completeNamePath = '',
  width = 0,
  height = 0,
  depth = 0,
  centerY = 0,
  vehicleCoreName = /vehicle|keke|chassis|bodywork|carbody|body[_ .-]?panel|roof|cabin|bumper|windshield|handlebar|headlight|mudguard|fork|axle|fender|engine|motor|fairing|door|bonnet|hood|grille|grill|dashboard|steering|headlamp/i,
  wheelPartName = /wheel|tire|tyre/i,
  characterName = /pedestrian|character|human|person|driver|rider|passenger|crowd|woman|man|female|male|npc/i,
} = {}) {
  const looksLikeCharacter = characterName.test(String(completeNamePath));
  const structuralPath = String(structuralNamePath);
  const vehicleCore = !looksLikeCharacter && vehicleCoreName.test(structuralPath);
  const namedWheel = !looksLikeCharacter && wheelPartName.test(structuralPath);
  const longSide = Math.max(Number(width) || 0, Number(depth) || 0);
  const shortSide = Math.min(Number(width) || 0, Number(depth) || 0);
  // Tight low-body fallback: person torsos and loose clothing may be wide,
  // but are rarely a broad vehicle chassis near ground level.
  const broadLowBody = !looksLikeCharacter &&
    Number(width) >= 1.0 &&
    Number(depth) >= 0.68 &&
    Number(height) >= 0.12 &&
    Number(height) <= 0.95 &&
    Number(centerY) >= -0.30 &&
    Number(centerY) <= 0.82 &&
    (shortSide > 0 ? longSide / shortSide >= 1.08 : false);
  return { looksLikeCharacter, vehicleCore, namedWheel, broadLowBody };
}
