import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { formatFareAmount, isDrivingScreenVisible, compactPassengerText, PRIMARY_HUD_IDS } from '../js/KanoCompactDrivingHudRules.mjs';

const root = path.resolve(import.meta.dirname, '..');
const source = fs.readFileSync(path.join(root, 'js/KanoCompactDrivingHudUpgrade.js'), 'utf8');
const integration = fs.readFileSync(path.join(root, 'integration/KanoWorldPerformanceInstancingUpgrade.js.diff'), 'utf8');

test('compact HUD keeps the four requested driving values', () => {
  assert.deepEqual([...PRIMARY_HUD_IDS, 'fares'], ['speed', 'fuel', 'pax', 'fares']);
  for (const field of ['SPEED', 'FUEL', 'FARES', 'PASSENGERS']) assert.ok(source.includes(`'${field}'`));
});

test('fare display formats invalid and valid values safely', () => {
  assert.equal(formatFareAmount(0), '₦0');
  assert.equal(formatFareAmount(12750), '₦12,750');
  assert.equal(formatFareAmount(-4), '₦0');
  assert.equal(formatFareAmount(Number.NaN), '₦0');
});

test('passenger count is bounded by the displayed capacity', () => {
  assert.equal(compactPassengerText(2, 5), '2/5');
  assert.equal(compactPassengerText(9, 5), '5/5');
  assert.equal(compactPassengerText(-1, 0), '0/1');
});

test('compact HUD appears only when the driving screen is active', () => {
  assert.equal(isDrivingScreenVisible({startHidden:true,lifeHidden:true,resultsHidden:true,menuHidden:true,hudInlineDisplay:'block'}), true);
  assert.equal(isDrivingScreenVisible({startHidden:false,lifeHidden:true,resultsHidden:true,menuHidden:true}), false);
  assert.equal(isDrivingScreenVisible({startHidden:true,lifeHidden:false,resultsHidden:true,menuHidden:true}), false);
  assert.equal(isDrivingScreenVisible({startHidden:true,lifeHidden:true,resultsHidden:false,menuHidden:true}), false);
  assert.equal(isDrivingScreenVisible({startHidden:true,lifeHidden:true,resultsHidden:true,menuHidden:false}), false);
  assert.equal(isDrivingScreenVisible({startHidden:true,lifeHidden:true,resultsHidden:true,menuHidden:true,hudInlineDisplay:'none'}), false);
});

test('integration uses the permitted performance module and not protected startup files', () => {
  assert.match(integration, /KanoWorldPerformanceInstancingUpgrade\.js/);
  assert.match(integration, /KanoCompactDrivingHudUpgrade\.js/);
  assert.match(source, /Game\.prototype\.update/);
  assert.match(source, /kanoCompactDrivingHudAudit/);
  assert.match(source, /source\.id \? \[source\] : \[\]/, 'mirror cloning must strip an element root ID to prevent duplicate live IDs');
  for (const prohibited of ['index.html', 'KanoModelAssetVisualUpgrade.js', 'KanoPhoneComfortUpgrade.js', 'KanoDeviceTier.js', 'ModelManager.js']) {
    assert.ok(!integration.includes(prohibited), `unexpected edit to protected path: ${prohibited}`);
  }
});

test('secondary stats and mission remain available through the details drawer', () => {
  assert.match(source, /SHIFT DETAILS/);
  assert.match(source, /mission-label/);
  assert.match(source, /hud-bottom/);
  assert.match(source, /#kano-road-navigation/);
});
