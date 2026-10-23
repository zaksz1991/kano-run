import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = name => readFile(new URL(`../js/${name}`, import.meta.url), 'utf8');

test('Aure and cultural-life upgrade is reachable through the relationship journey independently of checkpoint compliance', async () => {
  const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');
  const journey = await read('KanoNorthernDriverAureJourneyUpgrade.js');
  const compliance = await read('KanoNorthernDriverRoadComplianceUpgrade.js');
  assert.match(html, /src="\/js\/KanoNorthernDriverAureJourneyUpgrade\.js"/);
  assert.match(journey, /import ['"]\.\/KanoNorthernDriverAureAndCultureUpgrade\.js['"]/);
  assert.doesNotMatch(compliance, /KanoNorthernDriverAureAndCultureUpgrade/,
    'checkpoint compliance remains a separate system rather than a hidden coupling point');
});

test('runtime panel includes Aure, requested Hausa names, foods, and optional privacy controls', async () => {
  const source = await read('KanoNorthernDriverAureAndCultureUpgrade.js');
  const model = await read('KanoNorthernDriverAureAndCulture.js');
  for (const value of ['AURE, RELATIONSHIPS', 'Aure means marriage', 'Enable private simulated menstrual', 'SEEK QUALIFIED HEALTH CARE']) assert.ok(source.toLowerCase().includes(value.toLowerCase()), `missing ${value}`);
  for (const value of ['Asabe', 'Talatu', 'Altine', 'Jummai', 'Laraba']) assert.ok(model.includes(value), `missing ${value}`);
  for (const value of ['tuwo da miyan kuka', 'shinkafa da wake', 'Gurasa']) assert.ok(model.toLowerCase().includes(value.toLowerCase()), `missing ${value}`);
  assert.match(source, /healthTrackingEnabled|kac-health-enable/);
});

test('the relationship UI extends the existing engine through imports instead of declaring a second game', async () => {
  const source = await read('KanoNorthernDriverAureAndCultureUpgrade.js');
  assert.match(source, /from ['"]\.\/ui\.js['"]/);
  assert.match(source, /from ['"]\.\/storage\.js['"]/);
  assert.doesNotMatch(source, /class Game\s*\{|new Game\s*\(/);
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
