import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const source = await readFile(resolve(here, '../js/renderer3d.js'), 'utf8');
const builderStart = source.indexOf('  makeMobileLiteTrafficVehicle(type) {');
const actorStart = source.indexOf('  makeTrafficActor(vehicle, { allowGLB = true } = {}) {');
const nextZoneMethod = source.indexOf('  /**\n   * Builds a persistent, raised-edge pothole marker.');
assert.ok(builderStart >= 0 && actorStart > builderStart && nextZoneMethod > actorStart);
const builder = source.slice(builderStart, actorStart);
const makeTrafficActor = source.slice(actorStart, nextZoneMethod);

test('mobile fallback traffic routes through a one-mesh lightweight builder', () => {
  assert.match(makeTrafficActor, /if\s*\(vehicle\.type\s*===\s*'keke'\)/);
  assert.match(makeTrafficActor, /if\s*\(this\.mobile\)\s*\{\s*return this\.makeMobileLiteTrafficVehicle\(vehicle\.type\);\s*\}/);
  assert.ok(makeTrafficActor.indexOf("vehicle.type === 'keke'") < makeTrafficActor.indexOf('makeMobileLiteTrafficVehicle'));
});

test('lightweight mobile vehicle geometry is cached per vehicle type', () => {
  assert.match(builder, /const cache = this\._mobileTrafficVehicleGeometry/);
  assert.match(builder, /let geometry = cache\.get\(type\)/);
  assert.match(builder, /cache\.set\(type, geometry\)/);
});

test('lightweight vehicle uses vertex-coloured shared geometry and one mesh', () => {
  assert.match(builder, /new THREE\.BufferGeometry\(\)/);
  assert.match(builder, /new THREE\.Float32BufferAttribute\(colors, 3\)/);
  assert.match(builder, /new THREE\.Mesh\(\s*geometry,\s*new THREE\.MeshLambertMaterial\(\{ vertexColors: true, flatShading: true \}\)/);
  assert.match(builder, /actor\.userData\.sharedGeometry = true/);
  assert.match(builder, /actor\.userData\.simplifiedTrafficVehicle = true/);
});

test('shared mobile traffic geometries are explicitly disposed with the renderer', () => {
  assert.match(source, /for\s*\(const geometry of this\._mobileTrafficVehicleGeometry\?\.values\?\.\(\) \|\| \[\]\)\s*\{\s*geometry\?\.dispose\?\.\(\)/);
  assert.match(source, /this\._mobileTrafficVehicleGeometry\?\.clear\?\.\(\)/);
});

test('desktop retains the original detailed procedural traffic path', () => {
  assert.match(makeTrafficActor, /if\s*\(this\.mobile\)[\s\S]*?return this\.makeMobileLiteTrafficVehicle\(vehicle\.type\);[\s\S]*?const group = new THREE\.Group\(\)/);
  assert.match(makeTrafficActor, /new THREE\.TorusGeometry/);
  assert.match(makeTrafficActor, /new THREE\.MeshStandardMaterial/);
});
