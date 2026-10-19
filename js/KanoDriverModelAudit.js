import * as THREE from 'three';

/**
 * Kano Life — Driver / Vehicle Model Audit and Alignment
 * Additive helper for auditing GLTF roots, aligning a driver to a keke seat,
 * and producing camera/asset diagnostics. It does not own vehicle physics.
 */

const DEFAULTS = {
  seatPosition: new THREE.Vector3(0, 0.82, -0.18),
  seatRotation: new THREE.Euler(0, 0, 0),
  driverScale: 1,
  expectedVehicleHeight: { min: 0.6, max: 3.8 },
  expectedDriverHeight: { min: 0.8, max: 2.8 },
  forwardAxis: '-Z',
};

function vectorToObject(v) {
  return { x: Number(v.x.toFixed(3)), y: Number(v.y.toFixed(3)), z: Number(v.z.toFixed(3)) };
}

function safeName(object, fallback = 'unnamed') {
  return object?.name?.trim() || fallback;
}

export class KanoDriverModelAudit {
  constructor(options = {}) {
    this.options = { ...DEFAULTS, ...options };
    this.onDiagnostic = typeof options.onDiagnostic === 'function' ? options.onDiagnostic : () => {};
    this.records = [];
  }

  /** Audit model bounds, transforms, materials, meshes, and likely placeholder geometry. */
  audit(root, kind = 'unknown', id = safeName(root, kind)) {
    if (!root?.isObject3D) throw new TypeError('audit(root): expected a THREE.Object3D');
    root.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(root);
    const size = box.isEmpty() ? new THREE.Vector3() : box.getSize(new THREE.Vector3());
    const center = box.isEmpty() ? new THREE.Vector3() : box.getCenter(new THREE.Vector3());
    let meshes = 0;
    let skinnedMeshes = 0;
    let materials = 0;
    let missingMaterials = 0;
    let namedMeshes = 0;
    let primitiveLikeMeshes = 0;
    const materialSet = new Set();
    const meshNames = [];

    root.traverse((node) => {
      if (node.isMesh || node.isSkinnedMesh) {
        meshes += 1;
        if (node.isSkinnedMesh) skinnedMeshes += 1;
        if (node.name) namedMeshes += 1;
        else primitiveLikeMeshes += 1;
        meshNames.push(safeName(node, `mesh-${meshNames.length + 1}`));
        const mats = Array.isArray(node.material) ? node.material : node.material ? [node.material] : [];
        if (!mats.length) missingMaterials += 1;
        mats.forEach((mat) => materialSet.add(mat));
      }
    });
    materials = materialSet.size;

    const issues = [];
    if (box.isEmpty()) issues.push('empty-bounds');
    if (meshes === 0) issues.push('no-meshes');
    if (kind === 'driver' && (size.y < this.options.expectedDriverHeight.min || size.y > this.options.expectedDriverHeight.max)) {
      issues.push('driver-scale-check');
    }
    if (kind === 'vehicle' && (size.y < this.options.expectedVehicleHeight.min || size.y > this.options.expectedVehicleHeight.max)) {
      issues.push('vehicle-scale-check');
    }
    if (missingMaterials > 0) issues.push('missing-materials');
    if (meshes > 0 && primitiveLikeMeshes === meshes) issues.push('unnamed-meshes-review');

    const record = {
      id, kind, name: safeName(root, id),
      bounds: box.isEmpty() ? null : { min: vectorToObject(box.min), max: vectorToObject(box.max) },
      size: vectorToObject(size), center: vectorToObject(center),
      meshCount: meshes, skinnedMeshCount: skinnedMeshes, materialCount: materials,
      missingMaterialMeshCount: missingMaterials, unnamedMeshCount: primitiveLikeMeshes,
      meshNames, position: vectorToObject(root.position), scale: vectorToObject(root.scale),
      rotation: { x: root.rotation.x, y: root.rotation.y, z: root.rotation.z }, issues,
      likelyPlaceholder: meshes > 0 && primitiveLikeMeshes === meshes && materials <= 1,
    };
    this.records.push(record);
    this.onDiagnostic({ type: 'model-audited', record });
    return record;
  }

  /** Create a named seat anchor in the vehicle's local coordinate space. */
  createSeatAnchor(vehicleRoot, config = {}) {
    if (!vehicleRoot?.isObject3D) throw new TypeError('createSeatAnchor(vehicleRoot): expected a THREE.Object3D');
    const position = config.position ? new THREE.Vector3(config.position.x, config.position.y, config.position.z) : this.options.seatPosition.clone();
    const rotation = config.rotation ? new THREE.Euler(config.rotation.x ?? 0, config.rotation.y ?? 0, config.rotation.z ?? 0) : this.options.seatRotation.clone();
    const anchor = new THREE.Object3D();
    anchor.name = config.name || 'KANO_LIFE_DRIVER_SEAT_ANCHOR';
    anchor.position.copy(position);
    anchor.rotation.copy(rotation);
    anchor.userData.kanoLifeRole = 'driver-seat-anchor';
    vehicleRoot.add(anchor);
    this.onDiagnostic({ type: 'seat-anchor-created', anchor, vehicleRoot });
    return anchor;
  }

  /** Parent a driver model to an anchor and apply a configurable local pose. */
  attachDriver(driverRoot, seatAnchor, config = {}) {
    if (!driverRoot?.isObject3D || !seatAnchor?.isObject3D) {
      throw new TypeError('attachDriver(driverRoot, seatAnchor): expected THREE.Object3D inputs');
    }
    const preserveWorldTransform = config.preserveWorldTransform === true;
    if (preserveWorldTransform) seatAnchor.attach(driverRoot);
    else seatAnchor.add(driverRoot);
    driverRoot.position.set(config.x ?? 0, config.y ?? 0, config.z ?? 0);
    driverRoot.rotation.set(config.rotationX ?? 0, config.rotationY ?? 0, config.rotationZ ?? 0);
    const scale = config.scale ?? this.options.driverScale;
    driverRoot.scale.setScalar(scale);
    driverRoot.userData.kanoLifeRole = 'player-driver';
    driverRoot.userData.seated = true;
    driverRoot.updateMatrixWorld(true);
    const result = {
      driverName: safeName(driverRoot, 'player-driver'),
      anchorName: safeName(seatAnchor, 'seat-anchor'),
      localPosition: vectorToObject(driverRoot.position),
      localRotation: { x: driverRoot.rotation.x, y: driverRoot.rotation.y, z: driverRoot.rotation.z },
      scale,
    };
    this.onDiagnostic({ type: 'driver-attached', result, driverRoot, seatAnchor });
    return result;
  }

  /** Build a stable camera target from the vehicle's current world bounds. */
  getVehicleCameraTarget(vehicleRoot, options = {}) {
    if (!vehicleRoot?.isObject3D) throw new TypeError('getVehicleCameraTarget(vehicleRoot): expected a THREE.Object3D');
    vehicleRoot.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(vehicleRoot);
    if (box.isEmpty()) return { target: vehicleRoot.getWorldPosition(new THREE.Vector3()), distance: options.distance ?? 5 };
    const center = box.getCenter(new THREE.Vector3());
    center.y += options.targetHeightOffset ?? 0.35;
    const size = box.getSize(new THREE.Vector3());
    const distance = options.distance ?? Math.max(4, size.length() * 1.65);
    return { target: center, distance, bounds: { min: box.min.clone(), max: box.max.clone() } };
  }

  /** Generate a plain JSON audit report suitable for an in-game debug panel. */
  getReport() {
    const issueCounts = {};
    for (const record of this.records) {
      for (const issue of record.issues) issueCounts[issue] = (issueCounts[issue] || 0) + 1;
    }
    return {
      generatedAt: new Date().toISOString(),
      totalAudited: this.records.length,
      likelyPlaceholders: this.records.filter((record) => record.likelyPlaceholder).map((record) => record.id),
      issueCounts,
      records: this.records.map((record) => structuredClone(record)),
    };
  }

  clearReport() { this.records.length = 0; }
}

/** Small HUD helper; caller supplies an existing DOM element. */
export function renderKano3DStatus(element, renderer, scene, camera, extra = {}) {
  if (!element) return;
  const webgl = Boolean(renderer?.getContext?.());
  const info = renderer?.info;
  const drawCalls = info?.render?.calls ?? null;
  const triangles = info?.render?.triangles ?? null;
  const status = webgl ? '3D MODE · WEBGL' : '3D MODE · UNAVAILABLE';
  element.textContent = [status, drawCalls !== null ? `Draw calls: ${drawCalls}` : null,
    triangles !== null ? `Triangles: ${triangles}` : null,
    scene ? `Scene objects: ${scene.children.length}` : null,
    camera ? `Camera: ${camera.type}` : null,
    extra.assetStatus ? `Assets: ${extra.assetStatus}` : null].filter(Boolean).join(' | ');
  element.dataset.webgl = webgl ? 'ready' : 'unavailable';
}

export default KanoDriverModelAudit;
