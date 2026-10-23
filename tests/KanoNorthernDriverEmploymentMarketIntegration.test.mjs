import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const ui = fs.readFileSync(path.join(root, 'js/KanoNorthernDriverEmploymentMarketUpgrade.js'), 'utf8');
const model = fs.readFileSync(path.join(root, 'js/KanoNorthernDriverEmploymentMarket.js'), 'utf8');
const digital = fs.readFileSync(path.join(root, 'js/KanoNorthernDriverDigitalLifeUpgrade.js'), 'utf8');

test('latest-main entrypoint keeps PWA links and existing startup modules while loading Step 66 last', () => {
  for (const text of ['href="/manifest.webmanifest"', 'href="/icons/apple-touch-icon.png"', 'KanoCulturalStreetEventsUpgrade.js', 'KanoWorldPerformanceInstancingUpgrade.js', 'KanoLifeRootCauseRepair.js', 'KanoModelAssetVisualUpgrade.js', 'KanoNorthernDriverSkillsPathwaysUpgrade.js']) assert.ok(html.includes(text));
  assert.ok(html.includes('KanoNorthernDriverEmploymentMarketUpgrade.js'));
  assert.ok(html.indexOf('KanoNorthernDriverSkillsPathwaysUpgrade.js') < html.indexOf('KanoNorthernDriverEmploymentMarketUpgrade.js'));
});

test('employment panel integrates with current Step 65 skills and existing career UI', () => {
  assert.ok(ui.includes("from './KanoNorthernDriverSkillsPathways.js'"));
  assert.ok(ui.includes('#kano-life-career-screen .klc-panel'));
  assert.ok(ui.includes('kano:skills-pathways-updated'));
  assert.ok(ui.includes('activeShift'));
  assert.ok(model.includes('No application fee'));
});

test('Step 64 quote hotfix remains included to prevent the reported parse failure', () => {
  assert.ok(digital.includes('"Today\'s decision has been recorded.'));
  assert.equal(digital.includes("? 'Today's decision has been recorded."), false);
});
