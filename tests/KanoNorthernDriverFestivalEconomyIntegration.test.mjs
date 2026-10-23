import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { marketGoodPrice } from '../js/KanoNorthernDriverKanoSocietyMarkets.js';
const read = p => readFile(new URL(p, import.meta.url), 'utf8');

test('Step 58 module imports seasonal factors without importing or replacing game core', async () => {
  const source = await read('../js/KanoNorthernDriverKanoSocietyMarkets.js');
  assert.match(source, /import \{ seasonalMarketMultiplier \} from '\.\/KanoNorthernDriverFestivalEconomy\.js'/);
  assert.match(source, /seasonalMarketMultiplier\(good\.group, day, type, faithPreference\)/);
  assert.doesNotMatch(source, /from '\.\/main\.js'/);
  assert.doesNotMatch(source, /from '\.\/game\.js'/);
});

test('existing Step 57 import chain activates festival economy and existing shop UI carries faith choice', async () => {
  const source = await read('../js/KanoNorthernDriverKanoSocietyMarketsUpgrade.js');
  assert.match(source, /^import '\.\/KanoNorthernDriverFestivalEconomyUpgrade\.js';/);
  assert.match(source, /marketGoodPrice\(x\.id, ctx\.day, 'buy', state\.faithPreference\)/);
  assert.match(source, /marketGoodPrice\(x\.id, ctx\.day, 'sell', state\.faithPreference\)/);
});

test('the price API remains backwards compatible for callers that do not specify a faith preference', () => {
  assert.ok(marketGoodPrice('maize-bag', 1, 'buy') > 0);
  assert.ok(marketGoodPrice('maize-bag', 1, 'sell') > 0);
});

test('festival planner is additive and does not patch game physics, renderer, main or wallet transactions', async () => {
  const source = await read('../js/KanoNorthernDriverFestivalEconomyUpgrade.js');
  assert.match(source, /kano-life-festival-economy-budget-v1/);
  assert.match(source, /no money has been deducted/i);
  assert.doesNotMatch(source, /from '\.\/main\.js'/);
  assert.doesNotMatch(source, /from '\.\/game\.js'/);
  assert.doesNotMatch(source, /Renderer3D\.prototype/);
});
