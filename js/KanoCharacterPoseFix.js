/**
 * Character pose repair for imported people GLBs.
 *  - Static T-pose figures (e.g. the KAROTA officer) get their arms lowered by
 *    deforming only the arm vertices, so nobody stands with arms stretched out.
 *  - Rigged figures that load in their bind (T/A) pose are frozen into the first
 *    frame of their idle clip so they stand naturally even with no mixer running.
 * Both run once per model at load time and cost nothing per frame.
 */
const smooth = (t) => { const x = Math.min(1, Math.max(0, t)); return x * x * (3 - 2 * x); };

export function isPeopleKey(key) {
  return /^(passenger|pedestrian|karota|security)/i.test(String(key || ''));
}

export function lowerTPoseArms(root, THREE, { angle = 1.45 } = {}) {
  root.updateMatrixWorld(true);
  const meshes = [];
  let skinned = false;
  root.traverse((o) => {
    if (o.isSkinnedMesh) skinned = true;
    else if (o.isMesh && o.geometry?.attributes?.position) meshes.push(o);
  });
  if (skinned || !meshes.length) return false;

  const v = new THREE.Vector3();
  const min = new THREE.Vector3(Infinity, Infinity, Infinity);
  const max = new THREE.Vector3(-Infinity, -Infinity, -Infinity);
  for (const mesh of meshes) {
    const pos = mesh.geometry.attributes.position;
    for (let i = 0; i < pos.count; i += 1) {
      v.fromBufferAttribute(pos, i).applyMatrix4(mesh.matrixWorld);
      min.min(v); max.max(v);
    }
  }
  const height = max.y - min.y;
  const width = max.x - min.x;
  if (!(height > 0) || width / height < 0.65) return false; // not a T-pose

  const cx = (min.x + max.x) / 2;
  const shoulder = 0.15 * height;
  const pivotY = min.y + 0.82 * height;
  const blend = 0.13 * height;
  const inverse = new THREE.Matrix4();
  const seen = new Set();
  for (const mesh of meshes) {
    const geometry = mesh.geometry;
    if (seen.has(geometry)) continue;
    seen.add(geometry);
    inverse.copy(mesh.matrixWorld).invert();
    const pos = geometry.attributes.position;
    const nor = geometry.attributes.normal;
    const n = new THREE.Vector3();
    for (let i = 0; i < pos.count; i += 1) {
      v.fromBufferAttribute(pos, i).applyMatrix4(mesh.matrixWorld);
      const dx = v.x - cx;
      const side = dx >= 0 ? 1 : -1;
      const u = Math.abs(dx) - shoulder;
      if (u > 0 && v.y > min.y + 0.55 * height) {
        const theta = angle * smooth(u / blend);
        const c = Math.cos(theta);
        const s = Math.sin(theta);
        const w = v.y - pivotY;
        v.x = cx + side * (shoulder + u * c + w * s);
        v.y = pivotY - u * s + w * c;
        if (nor) {
          n.fromBufferAttribute(nor, i).transformDirection(mesh.matrixWorld);
          const nu = n.x * side;
          n.x = side * (nu * c + n.y * s);
          n.y = -nu * s + n.y * c;
          n.transformDirection(inverse);
          nor.setXYZ(i, n.x, n.y, n.z);
        }
        v.applyMatrix4(inverse);
        pos.setXYZ(i, v.x, v.y, v.z);
      }
    }
    pos.needsUpdate = true;
    if (nor) nor.needsUpdate = true;
    geometry.computeBoundingBox();
    geometry.computeBoundingSphere();
  }
  root.updateMatrixWorld(true);
  root.userData.kanoArmsLowered = true;
  return true;
}

export function bakeIdlePose(gltf, THREE) {
  const clips = Array.isArray(gltf?.animations) ? gltf.animations : [];
  if (!clips.length || !gltf?.scene) return false;
  let hasSkin = false;
  gltf.scene.traverse((o) => { if (o.isSkinnedMesh) hasSkin = true; });
  if (!hasSkin) return false;
  const pick = clips.find((c) => /idle|stand/i.test(c.name)) || clips[0];
  if (!pick?.tracks?.length) return false;
  const mixer = new THREE.AnimationMixer(gltf.scene);
  mixer.clipAction(pick).play();
  mixer.setTime(0);
  mixer.stopAllAction();
  gltf.scene.updateMatrixWorld(true);
  gltf.scene.userData.kanoIdlePoseBaked = pick.name;
  return true;
}

export function fixCharacterPose(gltf, key, THREE) {
  if (!isPeopleKey(key) || !gltf?.scene) return null;
  try {
    if (lowerTPoseArms(gltf.scene, THREE)) return 'arms-lowered';
    if (bakeIdlePose(gltf, THREE)) return 'idle-baked';
  } catch (error) {
    console.warn('[Kano pose fix] skipped', error);
  }
  return null;
}
