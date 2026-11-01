import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const lodSource = fs.readFileSync(new URL('../js/KanoSkinnedCharacterRenderLOD.js', import.meta.url), 'utf8');
const managerSource = fs.readFileSync(new URL('../js/KanoAnimationTrafficUpgrade.js', import.meta.url), 'utf8');
const perfLabSource = fs.readFileSync(new URL('../js/KanoPerfLab.js', import.meta.url), 'utf8');

const updateStart = managerSource.indexOf('  update(deltaSeconds) {', managerSource.indexOf('export class KanoGLBAnimationManager'));
const updateEnd = managerSource.indexOf('\n  getCharacterRenderLodDiagnostics()', updateStart);
const update = managerSource.slice(updateStart, updateEnd);

test('static pose uses actual source skinned geometry and current bone transforms', () => {
  assert.match(lodSource, /source\.geometry\.clone\(\)/);
  assert.match(lodSource, /source\.skeleton\.update\(\)/);
  assert.match(lodSource, /source\.applyBoneTransform\(index, vertex\)/);
  assert.match(lodSource, /geometry\.deleteAttribute\('skinIndex'\)/);
  assert.match(lodSource, /geometry\.deleteAttribute\('skinWeight'\)/);
  assert.match(lodSource, /geometry\.computeVertexNormals\(\)/);
});

test('unsupported morph and normal-map assets are left fully skinned', () => {
  assert.match(lodSource, /if \(hasMorphTargets\(mesh\)\) return false/);
  assert.match(lodSource, /materials\.some\(\(material\) => material\.normalMap\)/);
  assert.match(lodSource, /unsupported-skinned-mesh/);
});

test('original skinned nodes remain in the hierarchy and are restored on approach', () => {
  assert.match(lodSource, /source\.layers\?\.disable\?\.\(CAMERA_DEFAULT_LAYER\)/);
  assert.match(lodSource, /source\.add\(mesh\)/);
  assert.match(lodSource, /source\.layers\.mask = state\.originalLayerMask/);
  assert.match(lodSource, /state\.mesh\?\.geometry\?\.dispose\?\.\(\)/);
  assert.match(update, /restoreSkinnedCharacterPose\(root\)/);
  assert.match(update, /bakeSkinnedCharacterStaticPose\(root, THREE\)/);
});

test('only idle mobile character roots enter static-pose LOD and frozen mixers are skipped', () => {
  assert.match(managerSource, /role: entry\.role/);
  assert.match(managerSource, /mobile: true/);
  assert.match(update, /if \(entry\.staticPoseActive\) \{[\s\S]*?entry\.pendingElapsed = 0;\s*continue;/);
});

test('detached roots and manager disposal restore source character meshes', () => {
  assert.match(update, /if \(entry\.staticPoseActive\) restoreSkinnedCharacterPose\(root\)/);
  assert.match(managerSource.slice(managerSource.indexOf('  dispose() {', managerSource.indexOf('getCharacterRenderLodDiagnostics')),), /if \(entry\.staticPoseActive\) restoreSkinnedCharacterPose\(root\)/);
});

test('Performance Lab hides static-pose children in its character-cost test and reports LOD counts', () => {
  assert.match(perfLabSource, /people \(skinned \+ static LOD\)/);
  assert.match(perfLabSource, /n\.isSkinnedMesh \|\| n\.userData\?\.kanoStaticPoseLod === true/);
  assert.match(perfLabSource, /getCharacterRenderLodDiagnostics/);
});
