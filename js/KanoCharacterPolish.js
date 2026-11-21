/**
 * KANO LIFE - CHARACTER POLISH (uses only the player's own character GLBs)
 *
 * Three problems with the people in the game, all fixed on the GLBs themselves at draw time:
 *  1. Some of the women models are static meshes with no skeleton (hijab woman, etc.). They glided
 *     along the road with legs frozen. A small vertex-shader gait swings the lower body (legs / dress)
 *     alternately while they walk, so they actually step.
 *  2. The hijab models are modelled in a T-pose (arms straight out). The shader folds the arms down
 *     to the sides so they can walk, board and sit like everyone else.
 *  3. Several women models have pale, near-white skin. Skin-coloured pixels are deepened to the warm
 *     brown tones of Kano, without touching clothes, hijab or hair.
 *
 * Skinned models (the men, with their own walk clip) only get the skin-tone correction.
 */
import * as THREE from 'three';

export const CHARACTER_POLISH_KEY = 'kanoCharacterPolish';

// Proportions measured on the T-pose hijab GLBs, as fractions of body height.
const SHOULDER_X = 0.092;
const SHOULDER_Y = 0.80;
const ARM_DROP = 1.22; // radians (about 70 degrees)
const GAIT_AMPLITUDE = 0.2; // fraction of body height: how far the hem / feet swing

export function isTPoseSize(width, height) {
  return Number.isFinite(width) && Number.isFinite(height) && height > 0 && width / height > 0.6;
}

export function isWomanKey(key) {
  return /woman|female|girl|hijab/i.test(String(key || ''));
}

// Every person model (men too) gets warm Kano skin tones; several look pale in the raw GLBs.
export function wantsSkinCorrection(key) {
  return isWomanKey(key) || /passenger|pedestrian|man|boy|security|karota|officer|police|vip|driver/i.test(String(key || ''));
}

function hasSkeleton(root) {
  let skinned = false;
  root.traverse((node) => { if (node.isSkinnedMesh) skinned = true; });
  return skinned;
}

function patchMaterial(material, uniforms, withVertex) {
  const clone = material.clone();
  clone.userData = { ...(material.userData || {}), kanoPolished: true };
  clone.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>
uniform float uKGait; uniform float uKHip; uniform float uKAmp; uniform float uKArm;
uniform float uKSx; uniform float uKSy; uniform float uKArmAng; uniform float uKCx; uniform float uKFy;
uniform mat4 uKM; uniform mat4 uKMi;`)
      .replace('#include <begin_vertex>', withVertex ? `#include <begin_vertex>
{
  // Work in the character's own space (y up, x across, z forward) whatever axes the GLB was modelled in.
  vec3 p = (uKM * vec4(position, 1.0)).xyz;
  p.x -= uKCx; p.y -= uKFy;
  vec3 q = p;
  if (uKArm > 0.5) {
    float ax = abs(p.x);
    float w = smoothstep(uKSx, uKSx + 0.07, ax) * step(uKSy * 0.78, p.y);
    vec2 d = vec2(ax - uKSx, p.y - uKSy);
    float a = -uKArmAng * w;
    vec2 r = vec2(d.x * cos(a) - d.y * sin(a), d.x * sin(a) + d.y * cos(a));
    float sx = p.x < 0.0 ? -1.0 : 1.0;
    q.x = sx * (uKSx + r.x);
    q.y = uKSy + r.y;
  }
  if (uKAmp > 0.0) {
    float side = clamp(p.x / 0.045, -1.0, 1.0);
    float legW = clamp((uKHip - p.y) / uKHip, 0.0, 1.0);
    legW *= legW;
    q.z += uKGait * side * legW * uKAmp;
    q.y += max(0.0, -uKGait * side) * legW * uKAmp * 0.28;
  }
  q.x += uKCx; q.y += uKFy;
  transformed = (uKMi * vec4(q, 1.0)).xyz;
}` : '#include <begin_vertex>');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform float uKSkin;\nuniform float uKScarf;')
      .replace('#include <map_fragment>', `#include <map_fragment>
{
  vec3 c = diffuseColor.rgb;
  float gr = c.g / max(c.r, 1e-4);
  float bg = c.b / max(c.g, 1e-4);
  float skin = step(0.38, gr) * step(gr, 0.86) * step(0.45, bg) * step(bg, 1.05) * step(0.12, c.r);
  // Blond hair on the rigged woman becomes a headscarf (hijab) so she reads as a Kano woman.
  float scarf = 0.0;
#ifdef USE_MAP
  scarf = step(0.09, vMapUv.x) * step(vMapUv.x, 0.225) * step(0.575, vMapUv.y) * step(vMapUv.y, 0.615) * uKScarf;
#endif
  diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.05, 0.36, 0.34) * (0.75 + 0.5 * c.r), scarf);
  diffuseColor.rgb *= mix(vec3(1.0), vec3(0.84, 0.70, 0.58), skin * uKSkin);
  // Lift near-black clothes to deep colour so people do not read as silhouettes at night.
  float lum = dot(diffuseColor.rgb, vec3(0.299, 0.587, 0.114));
  float dark = (1.0 - skin) * (1.0 - smoothstep(0.05, 0.22, lum)) * uKSkin;
  diffuseColor.rgb = diffuseColor.rgb * (1.0 + dark * 1.6) + dark * vec3(0.05, 0.04, 0.035);
}`);
  };
  clone.customProgramCacheKey = () => `kanoPolish:${withVertex ? 'static' : 'skinned'}`;
  // The phone material swap (KanoPhoneMaterialLite) rebuilds materials; it re-attaches these so the walk, skin and scarf survive.
  clone.userData.kanoPolishCompile = clone.onBeforeCompile;
  clone.userData.kanoPolishKey = `kanoPolish:${withVertex ? 'static' : 'skinned'}`;
  clone.needsUpdate = true;
  return clone;
}

/**
 * Apply the polish to a freshly cloned character. Safe to call once per actor; does nothing for
 * characters that need none (men with their own animations and correct skin).
 */
export function polishCharacter(actor, key) {
  if (!actor?.isObject3D || actor.userData?.[CHARACTER_POLISH_KEY]) return actor;
  const skin = wantsSkinCorrection(key);
  const skinned = hasSkeleton(actor);
  const staticBody = !skinned;
  if (!skin && !staticBody) return actor;
  // Only the women are static meshes that need a walk and a pose; static men keep their own look.
  const staticWoman = staticBody && isWomanKey(key);
  if (!staticWoman && !skin) return actor;

  actor.updateMatrixWorld(true);
  const inverseActor = new THREE.Matrix4().copy(actor.matrixWorld).invert();
  const localBox = new THREE.Box3();
  const corner = new THREE.Vector3();
  const worldBox = new THREE.Box3().setFromObject(actor);
  for (let i = 0; i < 8; i += 1) {
    corner.set(i & 1 ? worldBox.max.x : worldBox.min.x, i & 2 ? worldBox.max.y : worldBox.min.y, i & 4 ? worldBox.max.z : worldBox.min.z);
    localBox.expandByPoint(corner.applyMatrix4(inverseActor));
  }
  const localHeight = localBox.max.y - localBox.min.y;
  const localWidth = localBox.max.x - localBox.min.x;
  const tPose = staticWoman && isTPoseSize(localWidth, localHeight);

  const shared = { uKGait: { value: 0 }, uKSkin: { value: skin ? 1 : 0 }, uKScarf: { value: skinned && isWomanKey(key) ? 1 : 0 } };
  actor.traverse((node) => {
    if (!node.isMesh || !node.material) return;
    const toActor = new THREE.Matrix4().multiplyMatrices(inverseActor, node.matrixWorld);
    const uniforms = {
      ...shared,
      uKM: { value: toActor },
      uKMi: { value: new THREE.Matrix4().copy(toActor).invert() },
      uKCx: { value: (localBox.min.x + localBox.max.x) / 2 },
      uKFy: { value: localBox.min.y },
      uKHip: { value: localHeight * 0.56 },
      uKAmp: { value: staticWoman ? localHeight * GAIT_AMPLITUDE : 0 },
      uKArm: { value: tPose ? 1 : 0 },
      uKSx: { value: localHeight * SHOULDER_X },
      uKSy: { value: localHeight * SHOULDER_Y },
      uKArmAng: { value: ARM_DROP },
    };
    node.material = Array.isArray(node.material)
      ? node.material.map((material) => patchMaterial(material, uniforms, staticWoman))
      : patchMaterial(node.material, uniforms, staticWoman);
  });
  actor.userData[CHARACTER_POLISH_KEY] = { uniforms: shared, staticWoman, tPose, dims: [localWidth, localHeight] };
  return actor;
}

/** Drive the walk of a polished static character. phase is in radians. */
export function stepCharacterGait(actor, phase, walking) {
  const polish = actor?.userData?.[CHARACTER_POLISH_KEY];
  if (!polish?.staticWoman) return;
  polish.uniforms.uKGait.value = walking ? Math.sin(phase) : 0;
}
