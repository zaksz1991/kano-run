import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const moduleSource = fs.readFileSync(path.join(root, 'js/KanoFlyoverRoundaboutUpgrade.js'), 'utf8');
const bootstrap = fs.readFileSync(path.join(root, 'js/KanoModelAssetVisualUpgrade.js'), 'utf8');

test('Step 94 loads after infrastructure and before the production gameplay entrypoint', () => {
  const street = bootstrap.indexOf("await import('./KanoStreetLifeMotionUpgrade.js')");
  const infrastructure = bootstrap.indexOf("await import('./KanoWorldInfrastructureUpgrade.js')");
  const landmarks = bootstrap.indexOf("await import('./KanoFlyoverRoundaboutUpgrade.js')");
  const gameplay = bootstrap.indexOf("await import('./KanoGameplayPresentationRepair.js')");
  assert.ok(street >= 0);
  assert.ok(infrastructure > street);
  assert.ok(landmarks > infrastructure);
  assert.ok(gameplay > landmarks);
});

test('Kwankwasiyya flyover identity uses readable sign text and red-white visual bands', () => {
  assert.match(moduleSource, /KWANKWASIYYA/);
  assert.match(moduleSource, /FLYOVER\s+•\s+KANO STATE/);
  // The old white gantry with red/white bands was replaced by a slim roadside board on two posts.
  assert.match(moduleSource, /kwankwasiyya_sign_backing/);
  assert.match(moduleSource, /kwankwasiyya_sign_post/);
  assert.match(moduleSource, /kanoFlyoverSignRecords/);
  assert.match(moduleSource, /Some model loaders swap a procedural flyover for a GLB/);
});

test('Roundabout has an asphalt ring, landscaped centre, alternating curb and four approach arms', () => {
  assert.match(moduleSource, /roundabout_asphalt_ring/);
  assert.match(moduleSource, /roundabout_central_landscaped_island/);
  assert.match(moduleSource, /roundabout_red_curb_stripe/);
  assert.match(moduleSource, /roundabout_white_curb_stripe/);
  assert.match(moduleSource, /roundabout_main_road_approach/);
  assert.match(moduleSource, /roundabout_outer_road_approach/);
  assert.match(moduleSource, /roundabout_north_road_approach/);
  assert.match(moduleSource, /roundabout_south_road_approach/);
  assert.match(moduleSource, /KANO ROUNDABOUT/);
});

test('Roundabout landmarks follow forward and reverse road scrolling and recycle out of view', () => {
  assert.match(moduleSource, /function signedScroll\(state, deltaSeconds\)/);
  assert.match(moduleSource, /actor\.position\.z \+= scroll/);
  assert.match(moduleSource, /actor\.position\.z > farPass/);
  assert.match(moduleSource, /actor\.position\.z < farLimit/);
  assert.match(moduleSource, /state\?\.reverse/);
  assert.match(moduleSource, /loopedWithRoad: true/);
});

test('Audit clearly distinguishes landmark scenery from future real route topology', () => {
  assert.match(moduleSource, /routeTopology: 'visual-only; straight-road simulation remains authoritative'/);
  assert.match(moduleSource, /routeBranchingEnabled = false/);
  assert.match(moduleSource, /branchDrivingEnabled: false/);
  assert.match(moduleSource, /does not enable real junction steering or driving on the flyover deck/);
  assert.match(moduleSource, /window\.kanoFlyoverRoundaboutAudit/);
});

test('InstantMesh asset pipeline remains included without claiming inference was run', () => {
  const candidates = [
    path.join(root, 'docs/INSTANTMESH-ASSET-PIPELINE-Step92.md'),
    path.join(root, 'docs/INSTANTMESH-ASSET-PIPELINE-Step94.md'),
  ];
  const doc = candidates.find((file) => fs.existsSync(file));
  assert.ok(doc, 'InstantMesh pipeline document should be carried forward');
  const content = fs.readFileSync(doc, 'utf8');
  assert.match(content, /TencentARC\/InstantMesh/);
  assert.match(content, /not run|was not run|not executed|inference was \*\*not run\*\*/i);
});
