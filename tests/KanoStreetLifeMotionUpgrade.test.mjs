import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const upgrade = fs.readFileSync(path.join(root, 'js/KanoStreetLifeMotionUpgrade.js'), 'utf8');
const bootstrap = fs.readFileSync(path.join(root, 'js/KanoModelAssetVisualUpgrade.js'), 'utf8');

 test('street-life layer registers before gameplay bootstrap', () => {
  const street = bootstrap.indexOf("await import('./KanoStreetLifeMotionUpgrade.js')");
  const gameplay = bootstrap.indexOf("await import('./KanoGameplayPresentationRepair.js')");
  assert.ok(street >= 0, 'street-life layer import exists');
  assert.ok(gameplay > street, 'street-life layer executes before main.js is brought in by presentation repair');
});

test('sidewalk actors use distinct Hausa clothing silhouettes and low arm rests', () => {
  assert.match(upgrade, /LatheGeometry\(profile, 24\)/);
  assert.match(upgrade, /hijab_head_wrap/);
  assert.match(upgrade, /hijab_scarf_drape/);
  assert.match(upgrade, /left_arm_pivot_down/);
  assert.match(upgrade, /right_arm_pivot_down/);
  assert.match(upgrade, /Math\.sin\(phase.*\) \* 0\.19/);
});

test('pedestrians receive a gait update every renderer frame', () => {
  assert.match(upgrade, /Renderer3D\.prototype\.draw = function kanoStep92Draw/);
  assert.match(upgrade, /actor\.position\.z \+= pedestrian\.walkDirection \* pedestrian\.walkSpeed \* dt/);
  assert.match(upgrade, /leg\.pivot\.rotation\.x = Math\.sin/);
  assert.match(upgrade, /usingModel: true, \/\/ Keep articulated pose/);
});

test('checkpoint queues add four mobile or six desktop distinct people', () => {
  assert.match(upgrade, /const count = renderer\.mobile \? 4 : 6/);
  assert.match(upgrade, /const variant = \(index \+ 1\) % PERSON_STYLES\.length/);
  assert.match(upgrade, /kanoPassengerCrowdCount = crowd\.length/);
  assert.match(upgrade, /kanoPassengerCrowdInitialized = true/);
});

test('static unrigged A-pose models are deliberately not substituted over articulated walkers', () => {
  assert.match(upgrade, /unrigged A-pose GLBs/);
  assert.match(upgrade, /usingModel: true, \/\/ Keep articulated pose/);
  assert.match(upgrade, /Remove the single legacy security placeholder \/ static A-pose passenger/);
});

test('InstantMesh remains explicitly documented as the high-detail asset path', () => {
  const docPath = path.join(root, 'docs/INSTANTMESH-ASSET-PIPELINE-Step92.md');
  assert.ok(fs.existsSync(docPath));
  const doc = fs.readFileSync(docPath, 'utf8');
  assert.match(doc, /TencentARC\/InstantMesh/);
  assert.match(doc, /InstantMesh inference was \*\*not run\*\*/i);
});
