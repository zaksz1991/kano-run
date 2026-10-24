/**
 * KANO LIFE — Catalogued Keke Generic-Mesh Acceptance Repair (Task 23)
 *
 * The main renderer intentionally rejects a loaded GLB when names do not prove
 * that it is a vehicle. Some catalogued keke GLBs use generic mesh names; when
 * ModelManager attaches a seated driver, the strict validator can then report
 * "character-only-model-no-vehicle-structure" even though the GLB contains a
 * real keke chassis. This adapter permits only the two name-evidence failures
 * and only for keke-1.glb through keke-8.glb when independent rendered geometry
 * proves plausible dimensions plus wheel or substantial body evidence.
 *
 * It does not edit assets, relax unrelated validation failures, or replace the
 * fallback unless the existing renderer accepts the candidate after this check.
 */
import * as THREE from 'three';
import { Renderer3D } from './renderer3d.js';
import { decideCataloguedKekeValidation } from './KanoKnownKekeValidationRules.js';

const PATCH = Symbol.for('kano.life.knownKekeModelAcceptance.v1');
const report = {
  version: 2,
  installed: false,
  checked: 0,
  acceptedByGeometry: 0,
  leftRejected: 0,
  last: null,
  errors: [],
};

function visibleRenderableMesh(node, root) {
  let ancestor = node;
  while (ancestor && ancestor !== root) {
    if (ancestor.visible === false) return false;
    ancestor = ancestor.parent;
  }
  if (ancestor !== root) return false;
  const materials = Array.isArray(node.material)
    ? node.material
    : node.material ? [node.material] : [];
  return materials.some((material) =>
    material && material.visible !== false && Number(material.opacity ?? 1) > 0.025
  );
}

function measureVehicleGeometry(root) {
  if (!root?.isObject3D) return { valid: false, reason: 'not-an-object3d' };
  root.updateMatrixWorld(true);
  const rootMatrix = root.matrixWorld.clone();
  const determinant = rootMatrix.determinant();
  if (!Number.isFinite(determinant) || Math.abs(determinant) < 1e-10) {
    return { valid: false, reason: 'singular-root-transform' };
  }

  const inverseRoot = rootMatrix.invert();
  const bounds = new THREE.Box3();
  const parts = [];
  root.traverse((node) => {
    if (!node?.isMesh || !node.geometry || !visibleRenderableMesh(node, root)) return;
    const geometry = node.geometry;
    if (!geometry.boundingBox) {
      try { geometry.computeBoundingBox(); } catch { return; }
    }
    if (!geometry.boundingBox || geometry.boundingBox.isEmpty()) return;

    const relativeMatrix = new THREE.Matrix4().multiplyMatrices(inverseRoot, node.matrixWorld);
    const partBounds = geometry.boundingBox.clone().applyMatrix4(relativeMatrix);
    if (partBounds.isEmpty()) return;
    const size = partBounds.getSize(new THREE.Vector3());
    const center = partBounds.getCenter(new THREE.Vector3());
    if (![size.x, size.y, size.z, center.x, center.y, center.z].every(Number.isFinite)) return;
    bounds.union(partBounds);
    parts.push({ size, center });
  });

  if (bounds.isEmpty() || parts.length < 3) {
    return { valid: false, reason: 'insufficient-visible-meshes', meshCount: parts.length };
  }

  const size = bounds.getSize(new THREE.Vector3());
  const wheelLikeCount = parts.filter(({ size: part, center }) => {
    const horizontalDiameter = Math.max(part.x, part.z);
    const minimumAxis = Math.min(part.x, part.y, part.z);
    const thinRatio = horizontalDiameter > 0 ? minimumAxis / horizontalDiameter : 1;
    const nearGround = center.y <= bounds.min.y + size.y * 0.52;
    const wheelSized = horizontalDiameter >= 0.18 && horizontalDiameter <= 0.86;
    return nearGround && wheelSized && thinRatio <= 0.72;
  }).length;

  const broadBodyCount = parts.filter(({ size: part, center }) =>
    part.x >= size.x * 0.48 &&
    part.z >= size.z * 0.25 &&
    part.y >= 0.12 &&
    center.y <= bounds.min.y + size.y * 0.78
  ).length;

  return {
    valid: true,
    width: size.x,
    height: size.y,
    depth: size.z,
    meshCount: parts.length,
    wheelLikeCount,
    broadBodyCount,
  };
}

function install() {
  const prototype = Renderer3D?.prototype;
  if (!prototype || prototype[PATCH] || typeof prototype.validateKekeModelCandidate !== 'function') return false;

  const original = prototype.validateKekeModelCandidate;
  Object.defineProperty(prototype, PATCH, { value: true, configurable: false });
  prototype.validateKekeModelCandidate = function validateKekeCandidateWithCatalogGeometry(object, ...args) {
    let result;
    try {
      result = original.call(this, object, ...args);
    } catch (error) {
      report.errors.push(`original-validator: ${String(error?.message || error)}`);
      throw error;
    }

    if (
      result?.ok ||
      !['missing-vehicle-structure-evidence', 'character-only-model-no-vehicle-structure'].includes(result?.reason)
    ) return result;

    // ModelManager explicitly stores the catalog-relative path on the wrapper
    // and preserves it on each instance; do not infer trust from object names.
    const path = object?.userData?.modelPath || object?.userData?.assetPath || '';
    const geometry = measureVehicleGeometry(object);
    report.checked += 1;
    const decision = decideCataloguedKekeValidation({
      path,
      originalReason: result.reason,
      ...geometry,
    });
    report.last = {
      path,
      originalReason: result.reason,
      geometry,
      decision,
      at: new Date().toISOString(),
    };

    if (!decision.accept) {
      report.leftRejected += 1;
      return result;
    }

    report.acceptedByGeometry += 1;
    object.userData.kanoCatalogGeometryValidation = decision;
    return {
      ...result,
      ok: true,
      reason: decision.reason,
      bounds: decision.bounds,
      evidence: {
        ...(result.evidence || {}),
        inferredVehicleStructureFromGeometry: true,
        wheelLikeMeshes: decision.wheelLikeCount,
        broadBodyMeshes: decision.broadBodyCount,
      },
    };
  };

  report.installed = true;
  return true;
}

install();
if (typeof window !== 'undefined') {
  window.kanoKnownKekeModelAcceptanceAudit = () => ({
    ...report,
    last: report.last ? { ...report.last } : null,
    errors: [...report.errors],
  });
}

export { install as installKanoKnownKekeModelAcceptanceRepair };
