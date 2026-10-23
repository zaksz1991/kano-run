import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (relativePath) => readFile(path.join(ROOT, relativePath), 'utf8');

test('water UI never depends on the separately named capacity constant at runtime', async () => {
  const source = await read('js/KanoNorthernDriverHouseholdWaterUpgrade.js');
  assert.doesNotMatch(source, /\bMAX_HOUSEHOLD_WATER_LITRES\b/);
  assert.match(source, /const report = householdWaterReport\(state, ctx\.day\)/);
  assert.match(source, /const maxLitres = Number\.isFinite\(Number\(report\.maxLitres\)\)/);
  assert.match(source, /state\.waterLitres \+ \(bundle\?\.litres \|\| 0\) > maxLitres/);
});

test('Aure & Culture section identifier is declared before observer registration', async () => {
  const source = await read('js/KanoNorthernDriverAureAndCultureUpgrade.js');
  const declaration = source.indexOf("const SECTION_ID = 'kano-aure-culture'");
  const observerUse = source.indexOf('if (!el(SECTION_ID) && !observer');
  assert.ok(declaration >= 0, 'SECTION_ID must be explicitly declared');
  assert.ok(observerUse > declaration, 'observer must use the declared identifier');
});
