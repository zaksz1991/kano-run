import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { STREET_COMMERCE_DENSITY, KANO_MARKETS, STYLE_CATALOG, CIVIC_SCENARIOS } from '../js/KanoNorthernDriverKanoSocietyMarkets.js';

const read = path => readFile(new URL(path, import.meta.url), 'utf8');

test('Step 57 culture integration activates Step 58 as an additive import', async () => {
  const source = await read('../js/KanoNorthernDriverAureAndCultureUpgrade.js');
  assert.match(source, /import '\.\/KanoNorthernDriverKanoSocietyMarketsUpgrade\.js';/);
});

test('new UI imports only existing UI/storage and Step 58 helpers; it does not rewrite core gameplay', async () => {
  const source = await read('../js/KanoNorthernDriverKanoSocietyMarketsUpgrade.js');
  assert.match(source, /from '\.\/ui\.js'/); assert.match(source, /from '\.\/storage\.js'/);
  assert.match(source, /from '\.\/renderer3d\.js'/); assert.match(source, /from 'three'/);
  assert.match(source, /proto\.buildWorld/); assert.match(source, /proto\.upgradeWorldAssets/);
  assert.match(source, /MutationObserver/); assert.match(source, /kano:daily-day-change/);
  assert.doesNotMatch(source, /from '\.\/main\.js'/); assert.doesNotMatch(source, /from '\.\/game\.js'/);
});

test('market dataset supports food grains, farm produce, textiles, thrift and local provisions', () => {
  const text = KANO_MARKETS.map(x => `${x.name} ${x.specialty} ${x.goods.join(' ')}`).join(' ').toLowerCase();
  for (const term of ['maize', 'millet', 'sweet potatoes', 'second-hand', 'textiles', 'provisions']) assert.ok(text.includes(term), term);
});

test('streetfront mix encodes the requested approximately 70 percent commercial-frontage target', () => {
  assert.equal(STREET_COMMERCE_DENSITY.targetCommercialFrontageShare, 0.70);
  assert.ok(STREET_COMMERCE_DENSITY.frontageMix.some(x => /kiosk/i.test(x.label)));
  assert.ok(STREET_COMMERCE_DENSITY.frontageMix.some(x => /roadside table/i.test(x.label)));
});

test('style catalog includes clothing, footwear and grooming options without gender lock fields', () => {
  for (const kind of ['clothing', 'footwear', 'grooming']) assert.ok(STYLE_CATALOG.some(x => x.category === kind));
  assert.ok(STYLE_CATALOG.some(x => /second-hand/i.test(x.name)));
  assert.ok(STYLE_CATALOG.every(x => !Object.hasOwn(x, 'gender')));
});

test('civic scenarios cover costs, government accountability, ethnic fairness, farmers and street commerce', () => {
  const text = CIVIC_SCENARIOS.map(x => `${x.id} ${x.title} ${x.body}`).join(' ').toLowerCase();
  for (const term of ['nepa', 'election', 'tribal', 'farmer', 'shop']) assert.ok(text.includes(term));
});
