import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = name => readFile(new URL(`../js/${name}`, import.meta.url), 'utf8');

test('Aure and cultural-life upgrade is imported through the Step 56 compliance endpoint', async () => {
  const source = await read('KanoNorthernDriverRoadComplianceUpgrade.js');
  assert.match(source, /import\s+['"]\.\/KanoNorthernDriverAureAndCultureUpgrade\.js['"]/);
});

test('runtime panel includes Aure, requested Hausa names, foods, and optional privacy controls', async () => {
  const source = await read('KanoNorthernDriverAureAndCultureUpgrade.js');
  const model = await read('KanoNorthernDriverAureAndCulture.js');
  for (const value of ['AURE, RELATIONSHIPS', 'Aure means marriage', 'Enable private simulated menstrual', 'SEEK QUALIFIED HEALTH CARE']) assert.ok(source.toLowerCase().includes(value.toLowerCase()), `missing ${value}`);
  for (const value of ['Asabe', 'Talatu', 'Altine', 'Jummai', 'Laraba']) assert.ok(model.includes(value), `missing ${value}`);
  for (const value of ['tuwo da miyan kuka', 'shinkafa da wake', 'Gurasa']) assert.ok(model.toLowerCase().includes(value.toLowerCase()), `missing ${value}`);
  assert.match(source, /healthTrackingEnabled|kac-health-enable/);
});

test('core gameplay entry points are not included as replacements in this upgrade', async () => {
  const fs = await import('node:fs/promises');
  const { readdir } = fs;
  const root = new URL('..', import.meta.url);
  const entries = await readdir(root);
  assert.equal(entries.includes('main.js'), false);
  assert.equal(entries.includes('game.js'), false);
  assert.equal(entries.includes('index.html'), false);
});

test('all romantic and intimate scenarios are explicitly adult and non-graphic', async () => {
  const source = await read('KanoNorthernDriverAureAndCulture.js');
  const upgrade = await read('KanoNorthernDriverAureAndCultureUpgrade.js');
  assert.match(source, /An adult acquaintance/);
  assert.match(source, /consenting adults/);
  assert.match(source, /zina\/fornication/);
  assert.match(upgrade, /non-graphic/);
  assert.match(upgrade, /This simulation does not sexualise children/);
});
