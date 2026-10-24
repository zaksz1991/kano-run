/**
 * KANO LIFE — Known Keke GLB Acceptance Repair
 *
 * Installs before the application creates Renderer3D. A real model from the
 * existing vehicles/keke catalog is permitted past the name-only rejection
 * only when its measured geometry has a plausible vehicle footprint and
 * component evidence. No source assets are modified and the original
 * validator remains authoritative for every other result.
 */
import * as THREE from 'three';
import { Renderer3D } from './renderer3d.js';
import { decideCataloguedKekeValidation } from './KanoKnownKekeValidationRules.js';

const PATCH = Symbol.for('kano.life.knownKekeModelAcceptance.v1');
const report = {
  version: 1,
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
    ? node.material : node.material ? [node.material] : [];
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
  let characterMeshCount = 0;
  root.traverse((node) => {
    if (!node?.isMesh || !node.geometry || !visibleRenderableMesh(node, root)) return;
    const name = `${node.name || ''} ${node.parent?.name || ''}`;
    if (/pedestrian|character|human|person|driver|rider|passenger|crowd|woman|man|female|male|npc/i.test(name)) {
      characterMeshCount += 1;
    }
    const geometry = node.geometry;
    if (!geometry.boundingBox) {
      try { geometry.computeBoundingBox(); } catch { return; }
    }
    if (!geometry.boundingBox || geometry.boundingBox.isEmpty()) return;
    const matrix = new THREE.Matrix4().multiplyMatrices(inverseRoot, node.matrixWorld);
    const partBounds = geometry.boundingBox.clone().applyMatrix4(matrix);
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
    characterMeshCount,
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
    if (result?.ok || result?.reason !== 'missing-vehicle-structure-evidence') return result;
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
  window.kanoKnownKekeModelAcceptanceAudit = () => ({ ...report, last: report.last ? { ...report.last } : null, errors: [...report.errors] });
}

export { install as installKanoKnownKekeModelAcceptanceRepair };
