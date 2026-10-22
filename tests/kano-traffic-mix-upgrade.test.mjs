import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { chooseKanoTrafficType, getKanoTrafficFamily } from '../js/KanoTrafficMix.js';

const repairSource = await readFile(new URL('../js/KanoGameplayPresentationRepair.js', import.meta.url), 'utf8');

test('spawn weighting maintains the 40/30/30 category split', () => {
  const counts = { keke: 0, motorcycle: 0, 'four-wheel': 0 };
  const total = 10_000;
  for (let index = 0; index < total; index += 1) {
    const roll = (index + 0.5) / total;
    const type = chooseKanoTrafficType(roll, () => 0.1, true);
    counts[getKanoTrafficFamily(type)] += 1;
  }
  assert.equal(counts.keke, 4_000);
  assert.equal(counts.motorcycle, 3_000);
  assert.equal(counts['four-wheel'], 3_000);
});

test('mobile four-wheel traffic includes a Hiace-style bus and police pickup', () => {
  assert.equal(chooseKanoTrafficType(0.8, () => 0.60, true), 'bus');
  assert.equal(chooseKanoTrafficType(0.8, () => 0.90, true), 'police');
  assert.equal(getKanoTrafficFamily('bus'), 'four-wheel');
  assert.equal(getKanoTrafficFamily('police'), 'four-wheel');
});

test('desktop traffic keeps truck and KAROTA variety inside the same four-wheel share', () => {
  assert.equal(chooseKanoTrafficType(0.8, () => 0.85, false), 'truck');
  assert.equal(chooseKanoTrafficType(0.8, () => 0.95, false), 'karota');
  assert.equal(getKanoTrafficFamily('truck'), 'four-wheel');
  assert.equal(getKanoTrafficFamily('karota'), 'four-wheel');
});

test('Kano presentation startup installs the tested traffic selector only for newly spawned ordinary traffic', () => {
  assert.match(repairSource, /import \{ chooseKanoTrafficType \} from '\.\/KanoTrafficMix\.js'/);
  assert.match(repairSource, /vehicle\.type = chooseKanoTrafficType\(Math\.random\(\), Math\.random, Boolean\(this\.mobile\)\)/);
  assert.match(repairSource, /if \(vehicle\?\.event \|\| vehicle\?\.convoy\) continue/);
});
