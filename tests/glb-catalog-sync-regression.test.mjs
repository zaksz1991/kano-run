import test from 'node:test';
import assert from 'node:assert/strict';
import { makeCatalog, uniqueSorted } from '../scripts/glb-catalog-sync.mjs';

const f = (path, hints = []) => ({ path, hints, bytes: 100 });

test('uniqueSorted accepts file records and strings without localeCompare type errors', () => {
  assert.deepEqual(uniqueSorted([f('vehicles/keke/renamed.glb'), f('vehicles/cars/car.glb'), f('vehicles/keke/renamed.glb')]).map((x) => x.path), [
    'vehicles/cars/car.glb', 'vehicles/keke/renamed.glb',
  ]);
  assert.deepEqual(uniqueSorted(['b.glb', 'a.glb', 'b.glb']), ['a.glb', 'b.glb']);
});

test('characters/pedestrians/keke female.glb never enters the player keke category', () => {
  const result = makeCatalog([
    f('characters/pedestrians/keke female.glb', ['female pedestrian']),
    f('vehicles/keke/keke-napep-renamed-file.glb', ['Adaidaita Sahu body', 'chassis']),
    f('vehicles/cars/normal-car.glb', ['car']),
  ]);
  assert.deepEqual(result.catalog.keke, ['vehicles/keke/keke-napep-renamed-file.glb']);
  assert.ok(result.catalog.pedestrianWoman.includes('characters/pedestrians/keke female.glb'));
  assert.ok(result.unsafeKekeMatches.some((x) => x.path === 'characters/pedestrians/keke female.glb'));
});

test('manual category override selects exact existing paths and reports unsafe paths', () => {
  const result = makeCatalog([
    f('vehicles/keke/renamed-yellow-vehicle.glb', ['three-wheeler']),
    f('characters/pedestrians/keke female.glb', ['female pedestrian']),
    f('world/buildings-suburban/house.glb', ['house']),
  ], {
    categories: {
      keke: ['vehicles/keke/renamed-yellow-vehicle.glb', 'characters/pedestrians/keke female.glb'],
      building: ['world/buildings-suburban/house.glb'],
    },
  });
  assert.deepEqual(result.catalog.keke, ['vehicles/keke/renamed-yellow-vehicle.glb']);
  assert.deepEqual(result.catalog.building, ['world/buildings-suburban/house.glb']);
  assert.ok(result.overrideWarnings.some((x) => x.includes('Rejected unsafe mapping')));
});

test('missing and case-mismatched override paths do not erase working candidates', () => {
  const result = makeCatalog([
    f('vehicles/keke/real-keke.glb', ['keke body']),
  ], { categories: { keke: ['vehicles/keke/REAL-KEKE.glb'] } });
  assert.deepEqual(result.catalog.keke, ['vehicles/keke/real-keke.glb']);
  assert.ok(result.overrideWarnings.some((x) => x.includes('case-sensitive')));
});

test('market stalls use only world models and can be manually mapped from real world assets', () => {
  const result = makeCatalog([
    f('world/props/renamed-stall-01.glb', ['MarketStall', 'counter', 'awning']),
    f('characters/pedestrians/stall-owner.glb', ['stall vendor person']),
  ], { categories: { marketStall: ['world/props/renamed-stall-01.glb'] } });
  assert.deepEqual(result.catalog.marketStall, ['world/props/renamed-stall-01.glb']);
  assert.ok(!result.catalog.marketStall.includes('characters/pedestrians/stall-owner.glb'));
});
