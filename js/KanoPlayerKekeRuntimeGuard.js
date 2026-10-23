/**
 * Runtime checks for the active player keke.
 *
 * This module intentionally uses the minimal Object3D/Mesh surface so its
 * visibility logic can be regression-tested without opening a WebGL context.
 * The renderer performs the vehicle-specific dimensional validation.
 */
function visibleDescendantPath(node, root) {
  if (!node || !root) return false;
  let current = node;
  while (current && current !== root) {
    if (current.visible === false) return false;
    current = current.parent;
  }
  return current === root;
}

function hasGeometryPositions(geometry) {
  if (!geometry) return false;
  const count = Number(geometry.attributes?.position?.count);
  if (Number.isFinite(count) && count > 0) return true;
  const box = geometry.boundingBox;
  if (box && box.isEmpty?.() === false) return true;
  return false;
}

function hasRenderableMaterial(material) {
  const list = Array.isArray(material) ? material : [material];
  return list.some((item) => {
    if (!item || item.visible === false) return false;
    const opacity = Number(item.opacity ?? 1);
    if (!Number.isFinite(opacity) || opacity <= 0.025) return false;
    return true;
  });
}

/**
 * Inspect whether the supplied vehicle root contains at least one actually
 * drawable mesh. A hidden cache root is ignored here because the renderer may
 * promote it into the active scene immediately afterwards; hidden descendants
 * and invisible/fully-transparent materials are not ignored.
 */
export function inspectPlayerKekeRenderability(root) {
  if (!root || typeof root.traverse !== 'function') {
    return { ok: false, reason: 'missing-object3d', renderableMeshCount: 0, meshNames: [] };
  }

  let renderableMeshCount = 0;
  const meshNames = [];
  root.traverse((node) => {
    if (!node?.isMesh || !hasGeometryPositions(node.geometry)) return;
    if (!visibleDescendantPath(node, root)) return;
    if (!hasRenderableMaterial(node.material)) return;
    renderableMeshCount += 1;
    if (node.name && meshNames.length < 12) meshNames.push(String(node.name));
  });

  return {
    ok: renderableMeshCount > 0,
    reason: renderableMeshCount > 0 ? 'renderable-meshes-found' : 'no-visible-renderable-meshes',
    renderableMeshCount,
    meshNames,
  };
}
