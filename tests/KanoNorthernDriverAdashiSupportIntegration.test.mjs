import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const ui = readFileSync(new URL('../js/KanoNorthernDriverAdashiSupportUpgrade.js', import.meta.url), 'utf8');
const model = readFileSync(new URL('../js/KanoNorthernDriverAdashiSupport.js', import.meta.url), 'utf8');

test('Step 72 script loads after the Step 69–71 life panels while core startup order stays intact', () => {
  assert.equal((html.match(/src="\/js\/KanoNorthernDriverAdashiSupportUpgrade\.js"/g) || []).length, 1);
  assert.ok(html.indexOf('KanoNorthernDriverSeasonalResilienceUpgrade.js') < html.indexOf('KanoNorthernDriverAdashiSupportUpgrade.js'));
  for (const source of ['KanoCulturalStreetEventsUpgrade.js', 'KanoWorldPerformanceInstancingUpgrade.js', 'KanoLifeRootCauseRepair.js', 'KanoModelAssetVisualUpgrade.js', 'KanoNorthernDriverSkillsPathwaysUpgrade.js', 'KanoNorthernDriverCareerProgressionUpgrade.js']) {
    assert.ok(html.includes(source), `preserves ${source}`);
  }
  assert.ok(html.includes('id="game-canvas"'));
});

test('wallet and Adashi ledger are committed through the existing save object and existing persist function', () => {
  assert.ok(ui.includes("import { save, persist } from './storage.js'"));
  assert.ok(ui.includes('save.money = Math.max(0, Math.floor(Number(nextWallet) || 0))'));
  assert.ok(ui.includes('save.lifestyle[ADASHI_SUPPORT_SAVE_FIELD] = normalizeAdashiSupportState(nextState)'));
  assert.ok(ui.includes('if (persist() !== true) throw new Error'));
  assert.ok(!ui.includes('localStorage.setItem(\'kano-adashi-wallet'));
  assert.ok(model.includes('This is a rotation payout, not new external money'));
  assert.ok(model.includes('function closeAdashiCircle') || model.includes('export function closeAdashiCircle'));
  assert.ok(ui.includes('CLOSE CIRCLE BETWEEN CYCLES'));
});

test('the panel is attached to the existing life/career screen and locks actions during driving', () => {
  assert.ok(ui.includes("document.querySelector('#kano-life-career-screen .klc-panel')"));
  assert.ok(ui.includes("['PLAY', 'EVENT', 'GAME_OVER'].includes(String(game.state))"));
  assert.ok(ui.includes('Finish the driving shift before using Adashi or community actions'));
});
