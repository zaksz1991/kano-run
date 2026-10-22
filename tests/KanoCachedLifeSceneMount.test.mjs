import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { mountActiveLifeDiorama } from '../js/renderer3d.js';

test('only the active cached life scene remains attached to the render graph', () => {
  const root = new THREE.Group();
  const bedroom = new THREE.Group();
  const breakfast = new THREE.Group();
  const street = new THREE.Group();
  const groups = new Map([
    ['bedroom', bedroom],
    ['breakfast', breakfast],
    ['street', street],
  ]);
  root.add(bedroom, breakfast, street);

  const active = mountActiveLifeDiorama(root, groups, 'breakfast');
  assert.equal(active, breakfast);
  assert.deepEqual(root.children, [breakfast]);
  assert.equal(root.visible, true);
  assert.equal(breakfast.visible, true);
  assert.equal(bedroom.parent, null);
  assert.equal(street.parent, null);
});

test('returning to the road detaches cached life scenes without deleting them', () => {
  const root = new THREE.Group();
  const bedroom = new THREE.Group();
  const school = new THREE.Group();
  const groups = new Map([['bedroom', bedroom], ['school', school]]);
  mountActiveLifeDiorama(root, groups, 'bedroom');
  mountActiveLifeDiorama(root, groups, null);

  assert.equal(root.children.length, 0);
  assert.equal(root.visible, false);
  assert.equal(groups.get('bedroom'), bedroom);
  assert.equal(groups.get('school'), school);
  assert.equal(bedroom.parent, null);
  assert.equal(school.parent, null);
});

test('switching life scenes reuses the same cached group instead of reconstructing it', () => {
  const root = new THREE.Group();
  const breakfast = new THREE.Group();
  const walk = new THREE.Group();
  const groups = new Map([['breakfast', breakfast], ['walk', walk]]);
  mountActiveLifeDiorama(root, groups, 'breakfast');
  mountActiveLifeDiorama(root, groups, 'walk');
  mountActiveLifeDiorama(root, groups, 'breakfast');

  assert.deepEqual(root.children, [breakfast]);
  assert.equal(groups.get('breakfast'), breakfast);
  assert.equal(groups.get('walk'), walk);
});

test('renderer scene transitions use the single active-scene mount helper', async () => {
  const fs = await import('node:fs');
  const { fileURLToPath } = await import('node:url');
  const { dirname, resolve } = await import('node:path');
  const source = fs.readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), '../js/renderer3d.js'), 'utf8');
  assert.match(source, /mountActiveLifeDiorama\(\s*this\.lifeDioramaRoot,\s*this\.lifeSceneGroups,\s*nextScene\s*,?\s*\)/);
  assert.match(source, /mountActiveLifeDiorama\(\s*this\.lifeDioramaRoot,\s*this\.lifeSceneGroups,\s*this\.lifeScene\s*,?\s*\)/);
  assert.match(source, /mountActiveLifeDiorama\(\s*this\.lifeDioramaRoot,\s*this\.lifeSceneGroups,\s*null\s*,?\s*\)/);
});
