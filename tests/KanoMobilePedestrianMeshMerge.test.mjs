import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const renderer = fs.readFileSync(path.join(ROOT, 'js/renderer3d.js'), 'utf8');

test('mobile pedestrian static body and clothing parts are merged into one vertex-coloured mesh', () => {
  assert.match(renderer, /mergeMobilePedestrianStaticParts\(group\)/);
  assert.match(renderer, /new THREE\.BufferGeometry\(\)/);
  assert.match(renderer, /setAttribute\('color', new THREE\.Float32BufferAttribute\(colors, 3\)\)/);
  assert.match(renderer, /vertexColors: true/);
  assert.match(renderer, /KANO_MOBILE_PEDESTRIAN_STATIC_PARTS/);
});

test('pedestrian merging is restricted to mobile and leaves desktop detail untouched', () => {
  assert.match(renderer, /if \(!this\.mobile \|\| !group\?\.children\?\.length\) return/);
  assert.match(renderer, /this\.mobileTier === 'low' \? 10 : 12/);
});

test('animated arm pivots remain separate after static pedestrian parts are merged', () => {
  assert.match(renderer, /const arms = \[\]/);
  assert.match(renderer, /arms\.push\(armPivot\)/);
  assert.match(renderer, /this\.mergeMobilePedestrianStaticParts\(group\)/);
  assert.match(renderer, /const arms = pedestrian\.arms;[\s\S]*?arms\[index\]\.rotation\.z/);
});

test('merged source geometries are disposed and obsolete materials still used by arms are retained', () => {
  assert.match(renderer, /part\.geometry\.dispose\(\)/);
  assert.match(renderer, /sourceGeometry\.dispose\(\)/);
  assert.match(renderer, /retainedMaterials\.has\(material\)/);
});

test('pedestrian GLB promotion and normal world rendering paths are retained', () => {
  assert.match(renderer, /upgradePedestrians\(\)/);
  assert.match(renderer, /this\.world\.remove\(pedestrian\.actor\)/);
  assert.match(renderer, /this\.renderer\.render\(this\.scene, this\.camera\)/);
});
