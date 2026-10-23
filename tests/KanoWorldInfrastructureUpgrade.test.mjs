import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const source = fs.readFileSync(path.join(root, 'js/KanoWorldInfrastructureUpgrade.js'), 'utf8');
const bootstrap = fs.readFileSync(path.join(root, 'js/KanoModelAssetVisualUpgrade.js'), 'utf8');

test('Step 93 infrastructure layer loads after animated people and before main bootstrap', () => {
  const street = bootstrap.indexOf("await import('./KanoStreetLifeMotionUpgrade.js')");
  const infrastructure = bootstrap.indexOf("await import('./KanoWorldInfrastructureUpgrade.js')");
  const gameplay = bootstrap.indexOf("await import('./KanoGameplayPresentationRepair.js')");
  assert.ok(street >= 0);
  assert.ok(infrastructure > street);
  assert.ok(gameplay > infrastructure);
});

test('fuel stop replaces the single green box with a complete forecourt', () => {
  assert.match(source, /KANO_AREWA_FUEL_FORECOURT_STEP93/);
  assert.match(source, /canopy_roof_top/);
  assert.match(source, /canopy_support/);
  assert.match(source, /forecourt_concrete/);
  assert.match(source, /AREWA FUEL/);
  assert.match(source, /PETROL\s+•\s+DIESEL\s+•\s+ENGINE OIL/);
  assert.match(source, /addFuelPump\(station, sideSign, 2\.05, -0\.15, 'PMS'\)/);
  assert.match(source, /addFuelPump\(station, sideSign, 4\.65, -0\.15, 'DIESEL'\)/);
  assert.match(source, /TubeGeometry\(curve, 12, 0\.025, 5, false\)/);
  assert.match(source, /for \(const child of actor\.children\) child\.visible = false/);
});

test('general checkpoints display two parked keke using the existing vehicle model', () => {
  assert.match(source, /if \(!zone\.hub \|\| zone\.type !== 'pickup'/);
  assert.match(source, /\[1\.9, 3\.8\]/);
  assert.match(source, /renderer\.makeKeke\(\)/);
  assert.match(source, /kanoParkedCheckpointKeke = true/);
  assert.match(source, /parking_bay_line/);
  assert.match(source, /KEKE PARK/);
});

test('infrastructure remains zone/world attached rather than becoming a child of the player', () => {
  assert.match(source, /zone-depth-on-renderer-world/);
  assert.match(source, /mountedToPlayer: Boolean\(player && isDescendantOf\(actor, player\)\)/);
  assert.match(source, /mountedToWorld: Boolean\(renderer\?\.world && actor\.parent === renderer\.world\)/);
  assert.match(source, /fixed-coordinate world conversion is a separate engine task/);
});

test('InstantMesh remains explicitly part of the high-detail asset plan', () => {
  const file = path.join(root, 'docs/INSTANTMESH-ASSET-PIPELINE-Step92.md');
  assert.ok(fs.existsSync(file));
  const text = fs.readFileSync(file, 'utf8');
  assert.match(text, /TencentARC\/InstantMesh/);
  assert.match(text, /inference was \*\*not run\*\*/i);
});
