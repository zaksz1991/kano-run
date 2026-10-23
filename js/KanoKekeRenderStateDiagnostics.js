/**
 * Debug-only inspection of flags that can prevent a GLB mesh from drawing.
 * This helper is read-only: it never changes visibility, layers, materials,
 * geometry, transforms, render order or camera state.
 *
 * Call only from the opt-in diagnostics path and keep it throttled because it
 * traverses the active player hierarchy.
 */
function hasVisibleAncestorPath(root) {
  let node = root;
  let visited = 0;
  while (node && visited < 2048) {
    if (node.visible === false) return false;
    node = node.parent || null;
    visited += 1;
  }
  return !node;
}

function safeName(node) {
  const value = String(node?.name || node?.type || (node?.isMesh ? 'unnamed-mesh' : 'unnamed-node'));
  return value.replace(/[\r\n\t]+/g, ' ').slice(0, 90);
}

function getMaterials(mesh) {
  if (Array.isArray(mesh?.material)) return mesh.material.filter(Boolean);
  return mesh?.material ? [mesh.material] : [];
}

function getPositionAttribute(geometry) {
  try {
    return geometry?.attributes?.position || geometry?.getAttribute?.('position') || null;
  } catch {
    return null;
  }
}

function isMeshNode(node) {
  return node?.isMesh === true || (node?.type === 'Mesh' && Boolean(node?.geometry));
}

function maskOf(layers) {
  const mask = Number(layers?.mask);
  return Number.isInteger(mask) && mask >= 0 ? mask : null;
}

function materialIsDrawable(material) {
  if (!material || material.visible === false) return false;
  const opacity = Number(material.opacity);
  if (Number.isFinite(opacity) && opacity <= 0) return false;
  if (material.colorWrite === false) return false;
  return true;
}

/** Return compact, serializable render-state evidence for the supplied root. */
export function inspectKekeRenderState(root, camera = null, options = {}) {
  const sampleLimit = Math.max(1, Math.min(16, Number(options.sampleLimit) || 8));
  if (!root || typeof root !== 'object') {
    return { available: false, reason: 'player-root-unavailable' };
  }

  try {
    const result = {
      available: true,
      reason: 'render-state-inspected',
      rootVisible: root.visible !== false,
      rootAncestorPathVisible: hasVisibleAncestorPath(root),
      nodeCount: 0,
      hiddenNodeCount: 0,
      meshCount: 0,
      visibleMeshCount: 0,
      candidateDrawableMeshCount: 0,
      meshWithoutGeometryCount: 0,
      meshWithoutPositionAttributeCount: 0,
      meshWithoutMaterialCount: 0,
      meshWithoutDrawableMaterialCount: 0,
      emptyDrawRangeMeshCount: 0,
      cameraLayerMismatchMeshCount: 0,
      frustumCulledMeshCount: 0,
      materialCount: 0,
      invisibleMaterialCount: 0,
      zeroOpacityMaterialCount: 0,
      colorWriteDisabledMaterialCount: 0,
      cameraLayerMask: maskOf(camera?.layers),
      issueSamples: [],
      drawableMeshSamples: [],
    };

    const stack = [{ node: root, parentPathVisible: true }];
    const cameraMask = maskOf(camera?.layers);
    let traversalGuard = 0;

    while (stack.length && traversalGuard < 20000) {
      const entry = stack.pop();
      const node = entry?.node;
      if (!node || typeof node !== 'object') continue;
      traversalGuard += 1;
      result.nodeCount += 1;
      const pathVisible = entry.parentPathVisible && node.visible !== false;
      if (!pathVisible) result.hiddenNodeCount += 1;

      if (isMeshNode(node)) {
        result.meshCount += 1;
        if (pathVisible) result.visibleMeshCount += 1;
        const issues = [];
        if (!pathVisible) issues.push('visibility-path-hidden');

        const geometry = node.geometry;
        if (!geometry) {
          result.meshWithoutGeometryCount += 1;
          issues.push('geometry-missing');
        }
        const positionAttribute = getPositionAttribute(geometry);
        if (geometry && !positionAttribute) {
          result.meshWithoutPositionAttributeCount += 1;
          issues.push('position-attribute-missing');
        }
        if (geometry && Number(geometry.drawRange?.count) === 0) {
          result.emptyDrawRangeMeshCount += 1;
          issues.push('draw-range-empty');
        }

        const materials = getMaterials(node);
        result.materialCount += materials.length;
        if (!materials.length) {
          result.meshWithoutMaterialCount += 1;
          issues.push('material-missing');
        }
        let hasDrawableMaterial = false;
        for (const material of materials) {
          if (material.visible === false) result.invisibleMaterialCount += 1;
          const opacity = Number(material.opacity);
          if (Number.isFinite(opacity) && opacity <= 0) result.zeroOpacityMaterialCount += 1;
          if (material.colorWrite === false) result.colorWriteDisabledMaterialCount += 1;
          if (materialIsDrawable(material)) hasDrawableMaterial = true;
        }
        if (materials.length && !hasDrawableMaterial) {
          result.meshWithoutDrawableMaterialCount += 1;
          issues.push('no-drawable-material');
        }

        const meshMask = maskOf(node.layers);
        const layerMismatch = cameraMask !== null && meshMask !== null && (cameraMask & meshMask) === 0;
        if (layerMismatch) {
          result.cameraLayerMismatchMeshCount += 1;
          issues.push('camera-layer-mismatch');
        }
        if (node.frustumCulled === true) result.frustumCulledMeshCount += 1;

        const hasGeometryForDraw = Boolean(geometry && positionAttribute && Number(geometry.drawRange?.count) !== 0);
        const drawableByState = pathVisible && hasGeometryForDraw && hasDrawableMaterial && !layerMismatch;
        if (drawableByState) {
          result.candidateDrawableMeshCount += 1;
          if (result.drawableMeshSamples.length < sampleLimit) {
            result.drawableMeshSamples.push(safeName(node));
          }
        }
        if (issues.length && result.issueSamples.length < sampleLimit) {
          result.issueSamples.push(`${safeName(node)}: ${issues.join(',')}`);
        }
      }

      const children = Array.isArray(node.children) ? node.children : [];
      for (let i = children.length - 1; i >= 0; i -= 1) {
        stack.push({ node: children[i], parentPathVisible: pathVisible });
      }
    }

    if (stack.length) {
      result.available = false;
      result.reason = 'traversal-limit-reached';
    } else if (result.meshCount === 0) {
      result.reason = 'no-mesh-nodes';
    } else if (result.candidateDrawableMeshCount === 0) {
      result.reason = 'no-mesh-passes-render-state-checks';
    }
    if (traversalGuard >= 20000 && stack.length) {
      result.available = false;
      result.reason = 'traversal-limit-reached';
    }
    return result;
  } catch (error) {
    return {
      available: false,
      reason: 'render-state-inspection-error',
      error: String(error?.message || error).replace(/[\r\n\t]+/g, ' ').slice(0, 160),
    };
  }
}
