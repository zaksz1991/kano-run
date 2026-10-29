import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const renderer = await readFile(new URL('../js/renderer3d.js', import.meta.url), 'utf8');

test('Kano roadside trees and dividers are integrated into world construction', () => {
  assert.match(renderer, /this\.buildKanoRoadsideSet\(\)/);
  assert.match(renderer, /buildKanoRoadsideSet\(\)/);
  assert.match(renderer, /THREE\.InstancedMesh/);
  assert.match(renderer, /Kano neem tree trunks/);
  assert.match(renderer, /Kano black-white concrete roadside dividers/);
  assert.match(renderer, /Kano divider black diagonal stripes/);
  assert.match(renderer, /updateKanoRoadsideSet\(scroll\)/);
});

test('roadside set uses wraparound updates instead of accumulating objects', () => {
  assert.match(renderer, /kanoDividerLoopDistance/);
  assert.match(renderer, /tree\.z -= this\.kanoRoadsideLoopDistance/);
  assert.match(renderer, /segment\.z -= this\.kanoDividerLoopDistance/);
  assert.match(renderer, /instanceMatrix\.setUsage\(THREE\.DynamicDrawUsage\)/);
});

test('motorcycle traffic receives the Kano two-rider achaba treatment', () => {
  assert.match(renderer, /ensureAchabaRiders\(actor\)/);
  assert.match(renderer, /makeAchabaRider\(passenger = false/);
  assert.match(renderer, /ACHABA_REAR_PASSENGER/);
  assert.match(renderer, /achabaRiderCount = 2/);
});

test('police fallback has pickup bodywork, bed, livery and a roof lightbar', () => {
  assert.match(renderer, /buildKanoPolicePickup\(/);
  assert.match(renderer, /bedFloor/);
  assert.match(renderer, /bedSide/);
  assert.match(renderer, /lightbar/);
  assert.match(renderer, /forceKanoPolicePickup/);
  assert.match(renderer, /Inspect the cached template before cloning/);
  assert.doesNotMatch(renderer, /disposeSceneTree\(model\)/);
});

test('bus fallback adds a minibus window row and Kano green stripe', () => {
  assert.match(renderer, /vehicle\.type === 'bus'/);
  assert.match(renderer, /sideWindowCount = 4/);
  assert.match(renderer, /forceKanoHiaceFallback/);
  assert.match(renderer, /kanoVehicleFallback = 'hiaceBus'/);
  assert.match(renderer, /busGreen/);
  assert.match(renderer, /roofLip/);
});

test('optional road and market textures use the asset manifest folder', () => {
  assert.match(renderer, /\/assets\/models\/environment\/ground\/asphalt\.jpg/);
  assert.match(renderer, /\/assets\/models\/environment\/ground\/market-stall\.jpg/);
  assert.doesNotMatch(renderer, /\/assets\/environment\/ground\/(?:asphalt|market-stall)\.jpg/);
});

test('night lighting is lifted and harmattan sky remains pale', () => {
  assert.match(renderer, /state\.night\s*\? 0x45638f/);
  assert.match(renderer, /state\.night\s*\? 0x5a78a3/);
  assert.match(renderer, /0xbdb9aa/);
});
