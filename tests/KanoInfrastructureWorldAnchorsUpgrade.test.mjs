import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const source = await readFile(resolve(root, 'js/KanoInfrastructureWorldAnchorsUpgrade.js'), 'utf8');
const bootstrap = await readFile(resolve(root, 'js/KanoModelAssetVisualUpgrade.js'), 'utf8');

const UNITS_PER_KM = 1008;
const REFERENCE_Z = 2;
const zAt = (anchorKm, currentKm, offset = 0) => REFERENCE_Z - (anchorKm - currentKm) * UNITS_PER_KM + offset;
const anchorAt = (z, currentKm) => currentKm + (REFERENCE_Z - z) / UNITS_PER_KM;

test('Step 98 is loaded after the signed road-distance foundation and before game bootstrap', () => {
  assert.match(bootstrap, /KanoRoadWorldCoordinatesUpgrade\.js/);
  assert.match(bootstrap, /KanoRoadPathContinuityUpgrade\.js/);
  assert.match(bootstrap, /KanoInfrastructureWorldAnchorsUpgrade\.js/);
  assert.ok(bootstrap.indexOf('KanoInfrastructureWorldAnchorsUpgrade.js') < bootstrap.indexOf('KanoGameplayPresentationRepair.js'));
});

test('persistent anchor synchronization also works when the renderer omits a scene label', () => {
  assert.match(source, /\(this\.lifeScene && this\.lifeScene !== 'road'\)/);
});

test('fuel-station and checkpoint-parking visual groups are promoted from recycled zone actors', () => {
  assert.match(source, /kanoFuelStationGeometry === true/);
  assert.match(source, /kanoCheckpointKeke === true/);
  assert.match(source, /renderer\.world\.attach\(node\)/);
  assert.match(source, /kanoStep98WorldAnchored/);
});

test('checkpoint passenger queue is detached as its own world group', () => {
  assert.match(source, /KANO_PERSISTENT_CHECKPOINT_PASSENGERS_STEP98/);
  assert.match(source, /actor\.userData\?\.kanoPassengerCrowd/);
  assert.match(source, /group\.attach\(passenger\.root\)/);
  assert.match(source, /checkpoint-passengers/);
});

test('world anchor conversion round-trips the initial local depth', () => {
  for (const z of [-220, -75, -7, 2, 18]) {
    const km = anchorAt(z, 0.42);
    assert.ok(Math.abs(zAt(km, 0.42) - z) < 1e-9);
  }
});

test('station approaches, passes the player, and can reappear during reverse travel', () => {
  const anchorKm = 0.5;
  const approach = zAt(anchorKm, 0.3);
  const near = zAt(anchorKm, 0.48);
  const passed = zAt(anchorKm, 0.55);
  const reverseApproach = zAt(anchorKm, 0.45);
  assert.ok(approach < near);
  assert.ok(near < passed);
  assert.ok(passed > 23);
  assert.ok(reverseApproach < 23);
});

test('sidewalk pedestrians keep a bounded walking offset while following the signed road coordinate', () => {
  assert.match(source, /kanoStep98InitialZ/);
  assert.match(source, /walkOffsetZ/);
  assert.match(source, /VISIBLE_MIN_Z/);
  assert.match(source, /VISIBLE_MAX_Z/);
  assert.match(source, /record\.pedestrian\.walkDirection = -Math\.abs/);
  assert.match(source, /record\.pedestrian\.walkDirection = Math\.abs/);
});

test('passenger idle animation continues after the zone actor is recycled', () => {
  assert.match(source, /record\.kind !== 'checkpoint-passengers'/);
  assert.match(source, /record\.sourceActor && liveZoneActors\.has\(record\.sourceActor\)/);
  assert.match(source, /parts\.headCover\.rotation\.y/);
});

test('new runs rebase walkers and remove prior-run persistent stop visuals', () => {
  assert.match(source, /function resetForNewRun/);
  assert.match(source, /record\.node\?\.parent\?\.remove\(record\.node\)/);
  assert.match(source, /record\.anchorKm = km \+ \(REFERENCE_Z - z\) \/ WORLD_UNITS_PER_KM/);
  assert.match(source, /Game\.prototype\.start = function startWithInfrastructureWorldReset/);
});

test('persistent visual pool is bounded and audit checks player-parenting', () => {
  assert.match(source, /MAX_PERSISTENT_RECORDS = 48/);
  assert.match(source, /function trimRecords/);
  assert.match(source, /allRecordsWorldAnchored/);
  assert.match(source, /parentedToPlayer/);
  assert.match(source, /window\.kanoInfrastructureWorldAnchorAudit/);
});
