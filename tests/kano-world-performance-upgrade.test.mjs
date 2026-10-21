import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const source = fs.readFileSync(new URL('../js/KanoWorldPerformanceInstancingUpgrade.js', import.meta.url), 'utf8');
const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');

test('world performance module uses InstancedMesh for repeating lane marks', () => {
  assert.match(source, /new THREE\.InstancedMesh\(geometry, material, source\.length\)/);
  assert.match(source, /KANO_INSTANCED_LANE_MARKINGS/);
});

test('lane positions remain updated through the existing draw loop', () => {
  assert.match(source, /Object\.defineProperty\(position, axis/);
  assert.match(source, /renderWithInstancedLaneMarkings/);
  assert.match(source, /entry\[axis\] = number/);
});

test('desktop building windows are batched as instanced meshes', () => {
  assert.match(source, /makeInstancedWindows/);
  assert.match(source, /KANO_INSTANCED_BUILDING_WINDOWS/);
  assert.match(source, /if \(renderer\.mobile \|\| !group\?\.isObject3D\) return/);
});

test('lighting uses a stable profile baseline rather than cumulative multipliers', () => {
  assert.match(source, /this\.__kanoWorldBrightnessKey === profileKey/);
  assert.match(source, /item\.intensity \* profile\.hemi/);
  assert.match(source, /item\.intensity \* profile\.directional/);
});

test('active HTML bootstraps register cultural and root-cause hooks before model-visual hooks', () => {
  const culturalIndex = html.indexOf('/js/KanoCulturalStreetEventsUpgrade.js');
  const rootIndex = html.indexOf('/js/KanoLifeRootCauseRepair.js');
  const modelIndex = html.indexOf('/js/KanoModelAssetVisualUpgrade.js');
  assert.ok(culturalIndex >= 0 && rootIndex > culturalIndex && modelIndex > rootIndex);
  assert.match(html, /KanoModelAssetVisualUpgrade\.js/);
});

test('existing key game HUD and start-screen IDs are preserved', () => {
  for (const id of ['game-container', 'game-canvas', 'hud', 'start-screen', 'start-btn', 'drive-controls', 'garage-screen']) {
    assert.match(html, new RegExp(`id="${id}"`));
  }
});

test('diagnostics are opt-in and do not force 3D mode', () => {
  assert.match(source, /worldPerfAudit/);
  assert.match(source, /debugPerf/);
  assert.doesNotMatch(source, /window\.location\.search\s*=.*force3d/);
});
