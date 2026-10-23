import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const file = name => new URL(`../js/${name}`, import.meta.url);

test('fuel market dynamically chains the driving-economy integration without changing core gameplay files', async () => {
  const market = await readFile(file('KanoNorthernDriverFuelMarketUpgrade.js'), 'utf8');
  const economy = await readFile(file('KanoNorthernDriverFuelEconomyUpgrade.js'), 'utf8');
  assert.match(market, /import ['"]\.\/KanoNorthernDriverFuelEconomyUpgrade\.js['"]/);
  assert.match(economy, /Game\.prototype\.tick/);
  assert.match(economy, /Symbol\.for\('kano\.life\.fuelEconomy\.tick\.v1'\)/);
  assert.match(economy, /isCareerMode\(this\.mode \|\| this\.s\?\.mode\)/);
});

test('economy preserves the fuel-market shift lifecycle and only finalizes on fuel shift end', async () => {
  const economy = await readFile(file('KanoNorthernDriverFuelEconomyUpgrade.js'), 'utf8');
  assert.match(economy, /kano:fuel-market-updated/);
  assert.match(economy, /detail\.type === 'shift_ended'/);
  assert.match(economy, /run\.finalized/);
  assert.match(economy, /finish the active shift before changing driving style/i);
});

test('runtime economy uses the existing condition and tyre readings and does not add a second wallet', async () => {
  const economy = await readFile(file('KanoNorthernDriverFuelEconomyUpgrade.js'), 'utf8');
  assert.match(economy, /engine: sBefore\.engine \?\? 100/);
  assert.match(economy, /condition: sBefore\.condition \?\? 100/);
  assert.match(economy, /tyres: sBefore\.tyres \?\? 100/);
  assert.doesNotMatch(economy, /wallet\s*[-+]=|wallet\s*=\s*wallet\s*[-+]/);
});
