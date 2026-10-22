import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const source = await readFile(new URL('../js/KanoSceneUpgrade.js', import.meta.url), 'utf8');

test('driver placement measures the complete vehicle instead of the first child', () => {
  assert.match(source, /measureVehicleLocalBounds\(player, excludedDriverRoot = null\)/);
  assert.match(source, /player\.traverse\(\(object\) => \{/);
  assert.match(source, /this\.localBox\.union\(this\.vehicleMeshBox\)/);
  assert.match(source, /this\.localMatrix\.multiplyMatrices\(/);
  assert.doesNotMatch(source, /for \(const child of player\.children\)\s*\{[\s\S]{0,700}?shell = child;/);
});

test('vehicle bounds exclude the procedural driver and visual dynamics pivot', () => {
  assert.match(source, /ancestor === excludedDriverRoot/);
  assert.match(source, /ancestor\.name === 'KANO_KEKE_SEATED_DRIVER'/);
  assert.match(source, /ancestor\.name === 'KANO_KEKE_DRIVER_PIVOT'/);
  assert.match(source, /ancestor\.name === 'KANO_KEKE_DYNAMICS_VISUAL_PIVOT'/);
});

test('procedural driver remains a child of the player keke', () => {
  assert.match(source, /player\.add\(driverRoot\)/);
  assert.match(source, /driverRoot\?\.parent === player/);
  assert.match(source, /this\.seatedDriverRoots\.add\(driverRoot\)/);
  assert.match(source, /player\.userData\.hasSeatedDriver = true/);
});

test('driver seat target is converted into its actual parent coordinate system', () => {
  assert.match(source, /this\.driverSeatWorld[\s\S]{0,100}?\.applyMatrix4\(player\.matrixWorld\)/);
  assert.match(source, /const pivotParent = driverPivot\.parent \|\| driverRoot/);
  assert.match(source, /this\.inverseMatrix\.copy\(pivotParent\.matrixWorld\)\.invert\(\)/);
  assert.match(source, /driverPivot\.position\.copy\([\s\S]{0,100}?this\.inverseMatrix\)/);
});

test('an authored GLB driver rig keeps its own transform', () => {
  assert.match(source, /If the imported GLB supplies its own explicitly named driver rig/);
  assert.match(source, /const driverIsOurs = Boolean\(/);
  assert.match(source, /if \(driverIsOurs && driverRoot\?\.parent === player\)/);
});

test('renderer fallback retains its built-in seated driver without duplicating it', () => {
  assert.match(source, /player\.userData\?\.fallback && driverPivot/);
  assert.match(source, /this\.driverPlayer = player;\s*return;/);
});

test('player model changes still trigger seated-driver recalibration', () => {
  assert.match(source, /if \(this\.renderer\.player !== this\.driverPlayer\) \{\s*this\.ensureSeatedDriver\(true\);\s*\}/);
});
