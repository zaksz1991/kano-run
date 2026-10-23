import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const root = new URL('../', import.meta.url);
const html = readFileSync(new URL('index.html', root), 'utf8');
const runtime = readFileSync(new URL('js/KanoNorthernDriverLefeNegotiationUpgrade.js', root), 'utf8');
const logic = readFileSync(new URL('js/KanoNorthernDriverLefeNegotiation.js', root), 'utf8');

test('entrypoint preserves the current public GitHub-main PWA links and six startup scripts', () => {
  for (const snippet of [
    'href="/manifest.webmanifest"',
    'href="/icons/apple-touch-icon.png"',
    'src="/js/KanoCulturalStreetEventsUpgrade.js"',
    'src="/js/KanoWorldPerformanceInstancingUpgrade.js"',
    'src="/js/KanoLifeRootCauseRepair.js"',
    'src="/js/KanoModelAssetVisualUpgrade.js"',
    'src="/js/KanoNorthernDriverSkillsPathwaysUpgrade.js"',
    'src="/js/KanoNorthernDriverCareerProgressionUpgrade.js"',
  ]) assert.ok(html.includes(snippet), `Missing current main baseline snippet: ${snippet}`);
  assert.equal((html.match(/KanoNorthernDriverLefeNegotiationUpgrade\.js/g) || []).length, 1);
});

test('Lefe runtime builds on the current Aure journey and existing wallet modules rather than replacing game core', () => {
  assert.ok(runtime.includes("import './KanoNorthernDriverAureJourneyUpgrade.js'"));
  assert.ok(runtime.includes("from './storage.js'"));
  for (const protectedFile of ['main.js', 'game.js', 'renderer3d.js', 'storage.js']) {
    assert.ok(!runtime.includes(`import './${protectedFile}'`), `runtime should not rewrite/import a copied core replacement: ${protectedFile}`);
  }
  assert.ok(runtime.includes("['PLAY', 'EVENT', 'GAME_OVER']"));
  assert.ok(runtime.includes('mutualConsent: true'));
});

test('Lefe model requires mutual commitment, caps item quantities, and treats family lists as customised', () => {
  assert.ok(logic.includes('LEFE_QUANTITY_LIMIT = 4'));
  assert.ok(logic.includes('mutual_partner_commitment_required'));
  assert.ok(logic.includes('partner-chooses-richer-suitor'));
  assert.ok(logic.includes('parents-refuse-budget'));
  assert.ok(logic.includes('no single list that every family must demand') || logic.includes('universal requirement'));
  assert.ok(logic.includes('family-specific'));
});


test('formal list agreement first saves the currently edited form rather than agreeing to a stale draft', () => {
  const agreeStart = runtime.indexOf("if (action === 'agree-list') {");
  assert.notEqual(agreeStart, -1);
  const agreeBlock = runtime.slice(agreeStart, runtime.indexOf("if (action === 'complete')", agreeStart));
  assert.ok(agreeBlock.includes('...listPayload()'), 'current form values must be supplied to saveLefeList');
  assert.ok(agreeBlock.indexOf('saveLefeList') < agreeBlock.indexOf('agreeLefeList'), 'the draft must be saved before agreement is recorded');
  assert.ok(agreeBlock.includes("ctx.relationshipStatus !== 'engaged'"), 'must not save a formal agreement unless profile is engaged');
});
