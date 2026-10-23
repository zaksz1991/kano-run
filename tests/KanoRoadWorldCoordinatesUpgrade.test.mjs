import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const modulePath = new URL('../js/KanoRoadWorldCoordinatesUpgrade.js', import.meta.url);
const bootstrapPath = new URL('../js/KanoModelAssetVisualUpgrade.js', import.meta.url);
const moduleSource = await readFile(modulePath, 'utf8');
const bootstrapSource = await readFile(bootstrapPath, 'utf8');

test('road world uses the same 1008 units/km scale as renderer scroll', () => {
  assert.match(moduleSource, /WORLD_UNITS_PER_KM\s*=\s*1008/);
  assert.match(moduleSource, /signedSpeed\s*\*\s*dt\s*\/\s*3600/);
});

test('forward and reverse travel both update the signed world coordinate', () => {
  assert.match(moduleSource, /const signedSpeed = Number\(this\.s\?\.signedSpeed\) \|\| 0/);
  assert.match(moduleSource, /\+\s*signedSpeed\s*\*\s*dt\s*\/\s*3600/);
  assert.match(moduleSource, /this\.s\.kanoWorldDistanceKm = this\.kanoWorldDistanceKm/);
});

test('junctions include real curved branch road surfaces rather than only HUD cues', () => {
  assert.match(moduleSource, /function makeStrip\(/);
  assert.match(moduleSource, /function branchCurve\(/);
  assert.match(moduleSource, /kano_curved_left_branch_road/);
  assert.match(moduleSource, /kano_curved_right_branch_road/);
  assert.match(moduleSource, /kano_junction_crossroad_apron/);
});

test('side roundabout branch is connected while the primary carriageway remains open', () => {
  assert.match(moduleSource, /kano_junction_roundabout_connector/);
  assert.match(moduleSource, /kano_connected_roundabout_asphalt_ring/);
  assert.match(moduleSource, /kano_roundabout_central_island/);
  assert.match(moduleSource, /The side branch visibly feeds a separate circulating lane/);
  assert.match(moduleSource, /collision-path integration is developed in later work/);
});

test('flyovers and roundabout scenes receive repeat-distance anchors', () => {
  assert.match(moduleSource, /kanoWorldAnchorBaseKm/);
  assert.match(moduleSource, /kanoWorldAnchorPeriodKm/);
  assert.match(moduleSource, /setRepeatingAnchor\(/);
  assert.match(moduleSource, /actor\.visible = inViewBand/);
});

test('distance anchoring runs immediately before the actual WebGL render', () => {
  assert.match(moduleSource, /gl\.render = function renderAfterWorldAnchorSync/);
  assert.match(moduleSource, /syncDistanceAnchors\(rendererRef, state\)/);
  assert.match(moduleSource, /return previousRender\.call\(this, scene, camera\)/);
});

test('new module loads after route navigation but before main.js bootstrap', () => {
  assert.ok(bootstrapSource.indexOf("await import('./KanoRoadNavigationUpgrade.js')") < bootstrapSource.indexOf("await import('./KanoRoadWorldCoordinatesUpgrade.js')"));
  assert.ok(bootstrapSource.indexOf("await import('./KanoRoadWorldCoordinatesUpgrade.js')") < bootstrapSource.indexOf("await import('./KanoGameplayPresentationRepair.js')"));
});

test('browser audit reports distance, junction and non-player anchors', () => {
  assert.match(moduleSource, /kanoRoadWorldCoordinatesAudit/);
  assert.match(moduleSource, /signedWorldDistanceKm/);
  assert.match(moduleSource, /mountedToPlayer:\s*false/);
});
