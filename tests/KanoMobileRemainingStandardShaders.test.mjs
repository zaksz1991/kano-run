import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const source = await readFile(new URL('../js/renderer3d.js', import.meta.url), 'utf8');

test('tier-aware factory keeps Lambert on phones and Standard on desktop', () => {
  assert.match(source, /const side = this\.mobile \? THREE\.FrontSide : THREE\.DoubleSide/);
  assert.match(source, /if \(this\.mobile\) \{\s*return new THREE\.MeshLambertMaterial\(\{ color, side \}\);\s*\}/);
  assert.match(source, /return new THREE\.MeshStandardMaterial\(\{ color, roughness, side \}\)/);
});

test('large instanced black-white kerbs use the tier-aware material factory', () => {
  const start = source.indexOf("const curbGeometry = new THREE.BoxGeometry(0.28, 0.16, 2.84);");
  const end = source.indexOf("const curbMesh = new THREE.InstancedMesh(", start);
  assert.ok(start >= 0 && end > start);
  const block = source.slice(start, end);
  assert.match(block, /const curbMaterial = this\.material\(0xffffff, 0\.96\)/);
  assert.doesNotMatch(block, /new THREE\.MeshStandardMaterial/);
});

test('repeating flyover stripes use the tier-aware material factory', () => {
  assert.match(source, /const stripeMaterial = this\.material\(0xffffff, 0\.92\)/);
  assert.doesNotMatch(source, /const stripeMaterial = new THREE\.MeshStandardMaterial/);
});

test('life-scene procedural boxes avoid forced double-sided Standard materials on phones', () => {
  const start = source.indexOf('    const box = (\n      group,\n      dimensions,');
  const end = source.indexOf('\n    for (const name of [', start);
  assert.ok(start >= 0 && end > start, 'life-scene box helper should exist');
  const block = source.slice(start, end);
  assert.match(block, /const material = this\.material\(color, materialOptions\.roughness \?\? 0\.9\)/);
  assert.match(block, /for \(const \[key, value\] of Object\.entries\(materialOptions\)\)/);
  assert.doesNotMatch(block, /new THREE\.MeshStandardMaterial/);
});

test('transparent stop and checkpoint pads use tier-aware shading', () => {
  const start = source.indexOf('          const padMaterial = this.material(');
  const end = source.indexOf('\n          pad.position.y = 0.035;', start);
  assert.ok(start >= 0 && end > start, 'roadside pad material block should exist');
  const block = source.slice(start, end);
  assert.match(block, /padMaterial\.transparent = true/);
  assert.match(block, /padMaterial\.opacity = 0\.78/);
  assert.match(block, /const pad = new THREE\.Mesh\([\s\S]*?padMaterial/);
  assert.doesNotMatch(block, /new THREE\.MeshStandardMaterial/);
});
