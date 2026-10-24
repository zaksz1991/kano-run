import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  buildKanoFuelStationLayout,
  getFuelStationSide,
  shouldUpgradeFuelStation,
  makeFuelStationDisplayLines,
  KANO_FUEL_STATION_BUDGET,
} from '../js/KanoFuelStationForecourtRules.mjs';

const upgradeSource = await readFile(new URL('../js/KanoFuelStationForecourtUpgrade.js', import.meta.url), 'utf8');
const integrationPatch = await readFile(new URL('../js/KanoFeatureActivationBridge.js', import.meta.url), 'utf8');

test('forecourt layout mirrors cleanly for either roadside', () => {
  const left = buildKanoFuelStationLayout(-1, { mobile: true });
  const right = buildKanoFuelStationLayout(1, { mobile: true });
  assert.equal(left.centerX, -right.centerX);
  assert.equal(left.apron.x, -right.apron.x);
  assert.equal(left.columns.length, 4);
  assert.equal(right.columns.length, 4);
  assert.equal(left.pumps.length, 2);
  assert.equal(right.pumps.length, 2);
});

test('side is normalized from the zone or actor position', () => {
  assert.equal(getFuelStationSide(-1, 10), -1);
  assert.equal(getFuelStationSide(1, -10), 1);
  assert.equal(getFuelStationSide(0, -4.55), -1);
  assert.equal(getFuelStationSide(null, 4.55), 1);
});

test('only fuel zones with identifiers qualify for conversion', () => {
  assert.equal(shouldUpgradeFuelStation({ id: 'fuel-1', type: 'fuel' }), true);
  assert.equal(shouldUpgradeFuelStation({ id: 'pickup-1', type: 'pickup' }), false);
  assert.equal(shouldUpgradeFuelStation({ type: 'fuel' }), false);
  assert.equal(shouldUpgradeFuelStation(null), false);
});

test('the station keeps the designed dimensions within a phone-friendly roadside footprint', () => {
  const layout = buildKanoFuelStationLayout(1, { mobile: true });
  assert.ok(layout.apron.width <= KANO_FUEL_STATION_BUDGET.apronWidth);
  assert.ok(layout.apron.depth <= KANO_FUEL_STATION_BUDGET.apronDepth);
  assert.ok(layout.canopy.width <= KANO_FUEL_STATION_BUDGET.canopyWidth);
  assert.ok(layout.canopy.depth <= KANO_FUEL_STATION_BUDGET.canopyDepth);
  assert.equal(layout.mobile, true);
});

test('the pump bays are separated along the road axis', () => {
  const layout = buildKanoFuelStationLayout(1, { mobile: false });
  assert.ok(layout.pumps[0].z < 0);
  assert.ok(layout.pumps[1].z > 0);
  assert.ok(layout.pumps[1].z - layout.pumps[0].z >= 1.4);
});

test('signage uses neutral station copy and does not hard-code a petrol price', () => {
  const lines = makeFuelStationDisplayLines();
  assert.deepEqual(lines.map((line) => line.label), ['PETROL', 'DIESEL', 'KANO FUEL']);
  assert.doesNotMatch(JSON.stringify(lines), /₦\s*\d|price\s*[:=]\s*\d/i);
});

test('the forecourt integrates after the existing syncZones renderer call', () => {
  assert.match(upgradeSource, /originalSyncZones\.call\(this, state, \.\.\.args\)/);
  assert.match(upgradeSource, /this\.zoneActors\?\.get\?\.\(zone\.id\)/);
  assert.match(integrationPatch, /installKanoFuelStationForecourtUpgrade\(this\)/);
});

test('legacy green cylinder pad and green pump are specifically recognized for removal', () => {
  assert.match(upgradeSource, /child\.geometry\.type === 'CylinderGeometry'/);
  assert.match(upgradeSource, /Number\(p\.height\) - 0\.04/);
  assert.match(upgradeSource, /Number\(p\.width\) - 0\.34/);
  assert.match(upgradeSource, /Number\(p\.height\) - 0\.72/);
});

test('the redesigned station is an authored Three.js forecourt with canopy, fascia, dispensers, hoses and signs', () => {
  for (const text of [
    'KANO_FUEL_CONCRETE_APRON',
    'KANO_FUEL_CANOPY_ROOF',
    'KANO_FUEL_CANOPY_FRONT_RED_FASCIA',
    'KANO_FUEL_CANOPY_SUPPORTS',
    'KANO_FUEL_DISPENSER_BODIES',
    'KANO_FUEL_PUMP_HOSE_',
    'KANO_FUEL_CANOPY_SIGN',
    'KANO_FUEL_PRICE_TOTEM_PANEL',
  ]) assert.ok(upgradeSource.includes(text), `missing ${text}`);
});

test('recycled fuel zones release station-owned sign textures', () => {
  assert.match(upgradeSource, /releaseTexturesBeforeZoneRecycle\(this, state\)/);
  assert.match(upgradeSource, /kanoFuelStationTextures/);
  assert.match(upgradeSource, /disposeWithKanoFuelStationForecourt/);
});

test('the audit counts instanced triangles instead of counting only their source geometry once', () => {
  assert.match(upgradeSource, /object\.isInstancedMesh \? Math\.max\(0, Number\(object\.count\) \|\| 0\) : 1/);
  assert.match(upgradeSource, /window\.kanoFuelStationForecourtAudit/);
});
