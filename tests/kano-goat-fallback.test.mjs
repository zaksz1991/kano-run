import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const source = await readFile(new URL('../js/KanoCulturalStreetEventsUpgrade.js', import.meta.url), 'utf8');

test('procedural goat is only the fallback when no valid goat GLB is usable', () => {
  assert.match(source, /discoverGoatPath\(\)/);
  assert.match(source, /createGLTFLoader\(\)\.load\(url/);
  assert.match(source, /installProceduralGoatFallback\(system, state, 'no-goat-glb-found-in-inventory'\)/);
  assert.match(source, /installProceduralGoatFallback\(system, state, 'glb-load-failed'\)/);
  assert.match(source, /installProceduralGoatFallback\(system, state, 'inventory-unavailable'\)/);
});

test('goat model has a body, raised neck, head, muzzle, ears, horns, tail and four legs', () => {
  assert.match(source, /KANO_PROCEDURAL_GOAT_CROSSING/);
  assert.match(source, /const legPivots = \[\]/);
  assert.match(source, /new THREE\.SphereGeometry/);
  assert.match(source, /new THREE\.CapsuleGeometry/);
  assert.match(source, /new THREE\.ConeGeometry/);
  assert.match(source, /for \(const x of \[-0\.36, 0\.27\]\)/);
  assert.match(source, /for \(const z of \[-0\.155, 0\.155\]\)/);
});

test('generated goat crossing is disabled (no goat model in the project) but its code path still animates legs', () => {
  assert.match(source, /goatNextAt: Infinity/);
  assert.match(source, /duration: 5\.6/);
  assert.match(source, /state\.goatFallbackLegs\?\.length/);
  assert.match(source, /Math\.sin\(state\.elapsed \* 8\.2 \+ index \* Math\.PI \* 0\.5\)/);
});

test('goat fallback is disposed with the cultural scene and does not change game simulation', () => {
  assert.match(source, /if \(state\.goatRoot\) \{/);
  assert.match(source, /disposeUniqueTree\(state\.goatRoot\)/);
  assert.match(source, /originalUpdateEnvironment\.call\(this, dt, \.\.\.args\)/);
  assert.match(source, /event: 'weddingConvoy'/);
});
