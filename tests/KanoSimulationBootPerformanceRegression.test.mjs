import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (relativePath) => readFile(path.join(ROOT, relativePath), 'utf8');

test('household water UI imports its capacity limit from the authoritative model', async () => {
  const ui = await read('js/KanoNorthernDriverHouseholdWaterUpgrade.js');
  const model = await import('../js/KanoNorthernDriverHouseholdWater.js');
  assert.match(ui, /MAX_HOUSEHOLD_WATER_LITRES/);
  assert.match(ui, /import\s*\{[\s\S]*?MAX_HOUSEHOLD_WATER_LITRES[\s\S]*?\}\s*from\s*['"]\.\/KanoNorthernDriverHouseholdWater\.js['"]/);
  assert.equal(model.MAX_HOUSEHOLD_WATER_LITRES, 500);
});

test('the Life & Career mount exists in static HTML before any module bootstrap executes', async () => {
  const html = await read('index.html');
  assert.equal((html.match(/id="kano-life-career-screen"/g) || []).length, 1);
  assert.equal((html.match(/id="klc-panel"/g) || []).length, 0, 'the panel uses class=klc-panel, not a duplicate id');
  assert.equal((html.match(/class="klc-panel"/g) || []).length, 1);
  const hostIndex = html.indexOf('id="kano-life-career-screen"');
  const firstModuleIndex = html.indexOf('<script type="module"');
  assert.ok(hostIndex > 0 && firstModuleIndex > hostIndex, 'static host must precede module execution');
  assert.equal((html.match(/src="\/js\/main\.js"/g) || []).length, 1);
});

const mountObserverFiles = [
  'KanoNorthernDriverFamilyResponsibilitiesUpgrade.js',
  'KanoNorthernDriverUtilitiesUpgrade.js',
  'KanoNorthernDriverCivicProjectsUpgrade.js',
  'KanoNorthernDriverLefeNegotiationUpgrade.js',
  'KanoNorthernDriverAureJourneyUpgrade.js',
  'KanoNorthernDriverKanoSocietyMarketsUpgrade.js',
  'KanoNorthernDriverPhoneAndCommunicationUpgrade.js',
  'KanoNorthernDriverAdashiSupportUpgrade.js',
  'KanoNorthernDriverAureAndCultureUpgrade.js',
  'KanoNorthernDriverFestivalEconomyUpgrade.js',
  'KanoNorthernDriverParenthoodUpgrade.js',
  'KanoNorthernDriverHouseholdWaterUpgrade.js',
  'KanoNorthernDriverDigitalLifeUpgrade.js',
];

test('mount-only observers are guarded and disconnect once a panel mounts', async () => {
  const results = await Promise.all(mountObserverFiles.map(async (name) => [name, await read(`js/${name}`)]));
  const failures = [];
  for (const [name, source] of results) {
    if (!source.includes('!el(SECTION_ID)') && !source.includes('!element(SECTION_ID)')) {
      failures.push(`${name}: observer is not gated by missing-panel state`);
    }
    if (!source.includes('observer.disconnect()') && !source.includes('observer?.disconnect()')) {
      failures.push(`${name}: observer does not disconnect after mount`);
    }
  }
  assert.deepEqual(failures, []);
});


test('the Aure & Culture mount observer uses a declared section identifier', async () => {
  const source = await read('js/KanoNorthernDriverAureAndCultureUpgrade.js');
  assert.match(source, /const SECTION_ID\s*=\s*['"]kano-aure-culture['"]/);
  assert.match(source, /section\.id\s*=\s*['"]kano-aure-culture['"]/);
  assert.match(source, /if \(!el\(SECTION_ID\) && !observer/);
  assert.match(source, /if \(el\(SECTION_ID\)\) \{ observer\?\.disconnect\(\); observer = null; \}/);
});

test('People & Relationships does not keep a whole-document observer for its static menu button', async () => {
  const source = await read('js/KanoNorthernDriverSocialDramaUpgrade.js');
  assert.doesNotMatch(source, /careerObserver\s*=\s*new MutationObserver/);
  assert.doesNotMatch(source, /careerObserver\.observe\(document\.documentElement/);
  assert.match(source, /ensureMenuButton\(\)/);
});

test('the social-network observer disconnects after the parent panel is attached', async () => {
  const source = await read('js/KanoNorthernDriverSocialNetworkUpgrade.js');
  assert.match(source, /if \(attach\(\)\)\s*\{\s*observer\?\.disconnect\(\);\s*observer = null;/);
});
