import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const source = fs.readFileSync(path.join(root, 'js/KanoRoadNavigationUpgrade.js'), 'utf8');
const bootstrap = fs.readFileSync(path.join(root, 'js/KanoModelAssetVisualUpgrade.js'), 'utf8');

 test('Step 95 navigation module loads after scenery but before main.js bootstrap', () => {
  const flyover = bootstrap.indexOf("await import('./KanoFlyoverRoundaboutUpgrade.js')");
  const navigation = bootstrap.indexOf("await import('./KanoRoadNavigationUpgrade.js')");
  const presentation = bootstrap.indexOf("await import('./KanoGameplayPresentationRepair.js')");
  assert.ok(flyover >= 0);
  assert.ok(navigation > flyover);
  assert.ok(presentation > navigation);
});

test('Step 95 restores a real on-screen reverse action for the existing Controls binder', () => {
  assert.match(source, /id = 'reverse-btn'/);
  assert.match(source, /button\.dataset\.action = 'reverse'/);
  assert.match(source, /controls\.append\(button\)/);
  assert.match(source, /ensureReverseButton\(\)/);
  assert.match(source, /updateReverseControl\?\.\(this\.s\)/);
});

test('Junction guide displays visual arrows and all four road choices', () => {
  assert.match(source, /KANO ROAD GUIDE/);
  assert.match(source, /addTurnButton\(choices, 'left', '↰'/);
  assert.match(source, /addTurnButton\(choices, 'straight', '↑'/);
  assert.match(source, /addTurnButton\(choices, 'right', '↱'/);
  assert.match(source, /addTurnButton\(choices, 'uturn', '⤺'/);
  assert.match(source, /#kano-road-navigation \.kano-nav-directions\{display:grid/);
});

test('Route turns require an active choice window and safe approach speeds', () => {
  assert.match(source, /CHOICE_WINDOW_BEFORE_KM = 0\.14/);
  assert.match(source, /CHOICE_WINDOW_AFTER_KM = 0\.045/);
  assert.match(source, /NORMAL_TURN_SPEED_LIMIT = 35/);
  assert.match(source, /UTURN_SPEED_LIMIT = 12/);
  assert.match(source, /if \(!nav\.windowOpen \|\| nav\.turn\)/);
  assert.match(source, /Select forward gear before entering a junction/);
});

test('Left and right turns switch saved destination and animate a road heading', () => {
  assert.match(source, /targetRoute = options\.left/);
  assert.match(source, /targetRoute = options\.right/);
  assert.match(source, /save\.routeId = route\.id/);
  assert.match(source, /persist\(\)/);
  assert.match(source, /delta = Math\.PI \/ 2/);
  assert.match(source, /delta = -Math\.PI \/ 2/);
  assert.match(source, /state\.kanoRoadHeading = nav\.heading/);
});

test('U-turn changes the road heading by 180 degrees and can return to a previous route', () => {
  assert.match(source, /targetRoute = chooseUTurnRoute\(game, nav\)/);
  assert.match(source, /delta = Math\.PI/);
  assert.match(source, /routeHistory\.pop\(\)/);
  assert.match(source, /nav\.uTurns \+= 1/);
});

test('WebGL road geometry, keke, and camera share the same pivoted heading transform', () => {
  assert.match(source, /function rotatePoint\(x, z, angle\)/);
  assert.match(source, /this\.world\.rotation\.y = heading/);
  assert.match(source, /ROAD_PIVOT_Z \* \(1 - Math\.cos\(heading\)\)/);
  assert.match(source, /cameraPoint = rotatePoint/);
  assert.match(source, /playerPoint = rotatePoint/);
  assert.match(source, /this\.driveFacingY = heading/);
});

test('Canvas fallback gets a short turn cue without replacing its renderer', () => {
  assert.match(source, /function installRenderer2DTurnCue\(\)/);
  assert.match(source, /drawWithKanoTurnCue/);
  assert.match(source, /originalDraw\.call\(this, state, deltaSeconds, \.\.\.args\)/);
});

test('Navigation exposes a local audit and documents arcade links instead of claiming surveyed routing', () => {
  assert.match(source, /window\.kanoRoadNavigationAudit/);
  assert.match(source, /nextJunctionInMetres/);
  assert.match(source, /reverseControlPresent/);
  assert.match(source, /not a surveyed street-level map/);
});

test('Keyboard route shortcuts avoid editable controls and use distinct keys from lane steering', () => {
  assert.match(source, /const map = \{ q: 'left', t: 'straight', e: 'right', u: 'uturn' \}/);
  assert.match(source, /input,select,textarea,\[contenteditable="true"\]/);
});

test('InstantMesh plan remains included and no generated assets are falsely attributed to inference', () => {
  const pipeline = fs.readFileSync(path.join(root, 'docs/INSTANTMESH-ASSET-PIPELINE-Step95.md'), 'utf8');
  assert.match(pipeline, /TencentARC\/InstantMesh/);
  assert.match(pipeline, /not run|was not run|not executed|inference was \*\*not run\*\*/i);
});

test('A chosen left, right, or U-turn advances the junction index and next-junction schedule once', () => {
  const straightReturn = source.indexOf('return true;', source.indexOf("if (direction === 'straight')"));
  const branchStart = source.indexOf('  nav.nextJunctionAt += JUNCTION_INTERVAL_KM;', straightReturn);
  const branchSection = source.slice(branchStart, branchStart + 220);
  assert.match(branchSection, /nav\.nextJunctionAt \+= JUNCTION_INTERVAL_KM;\s+nav\.junctionIndex \+= 1;\s+nav\.turnsTaken \+= 1;/);
});

test('Turn animation uses eased progress and clears turn state on completion', () => {
  assert.match(source, /const eased = progress \* progress \* \(3 - 2 \* progress\)/);
  assert.match(source, /if \(progress >= 1\)/);
  assert.match(source, /state\.kanoRoadTurn = null;\s+nav\.turn = null;/);
});
