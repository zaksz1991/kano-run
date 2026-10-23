import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const festivalUpgrade = await readFile(resolve(here, '../js/KanoNorthernDriverFestivalEconomyUpgrade.js'), 'utf8');
const utilitiesUpgrade = await readFile(resolve(here, '../js/KanoNorthernDriverUtilitiesUpgrade.js'), 'utf8');

test('Step 60 utility panel is connected to the existing Step 59 import chain', () => {
  assert.match(festivalUpgrade, /import\s+['"]\.\/KanoNorthernDriverUtilitiesUpgrade\.js['"]/);
});

test('utility panel references the existing Society & Markets bill rather than duplicating it', () => {
  assert.match(utilitiesUpgrade, /existing Society\s*&\s*Markets panel remains responsible for the weekly NEPA/);
  assert.match(utilitiesUpgrade, /does not create a second electricity bill/);
  assert.match(utilitiesUpgrade, /data-khu-action="buy-fuel"/);
  assert.match(utilitiesUpgrade, /data-khu-action="run-generator"/);
  assert.match(utilitiesUpgrade, /data-khu-action="complaint"/);
});

test('wallet transactions use the established game storage adapter', () => {
  assert.match(utilitiesUpgrade, /import\s*\{\s*save\s*,\s*persist\s*\}\s*from\s*['"]\.\/storage\.js['"]/);
  assert.match(utilitiesUpgrade, /save\.money\s*=\s*safeWallet/);
  assert.match(utilitiesUpgrade, /ctx\.ui\?\.refreshWallet/);
});
