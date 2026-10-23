import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { calculateRunPayout } from './runtime/storage.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (relative) => readFile(path.join(ROOT, relative), 'utf8');

test('payout preview for the saved run is transparent and deterministic', () => {
  assert.deepEqual(calculateRunPayout({ score: 176274, fares: 90863 }), {
    score: 176274,
    grossFares: 90863,
    operatingReserve: 31803,
    farePayout: 59060,
    scoreBonus: 1762,
    earned: 60822,
    ruleVersion: 2,
  });
});

test('score-only activity cannot mint wallet money without fares', () => {
  assert.equal(calculateRunPayout({ score: 500000, fares: 0 }).earned, 0);
});

test('performance bonus respects the explicit cap', () => {
  assert.equal(calculateRunPayout({ score: 999999, fares: 200000 }).scoreBonus, 3000);
  assert.equal(calculateRunPayout({ score: 999999, fares: 1000 }).scoreBonus, 50);
});

test('production banking and test fixture use the new payout calculator', async () => {
  const source = await read('js/storage.js');
  assert.match(source, /export function calculateRunPayout\(run = \{\}\)/);
  assert.match(source, /Math\.floor\(grossFares \* 0\.65\)/);
  assert.match(source, /Math\.floor\(score \* 0\.01\)/);
  assert.match(source, /payoutRuleVersion: 2/);
  assert.match(source, /grossFares,/);
});

test('HUD and run report display score as points, with no currency prefix', async () => {
  const html = await read('index.html');
  assert.match(html, /RUN SCORE · POINTS/);
  assert.doesNotMatch(html, /<strong>₦<span id="score">/);
  assert.match(html, /id="kano-lifetime-run-payouts"/);
  assert.match(html, /id="kano-run-payout-breakdown"/);
  const recovery = await read('js/KanoAppLaunchRecovery.js');
  assert.match(recovery, /^import '\.\/KanoEconomyClarityUpgrade\.js';/);
});

test('clarity layer shows payout details and saved-run estimates without replacing the engine', async () => {
  const source = await read('js/KanoEconomyClarityUpgrade.js');
  assert.match(source, /ESTIMATED PAYOUT/);
  assert.match(source, /renderPayoutBreakdown/);
  assert.match(source, /refreshResumeRunControl/);
  assert.match(source, /completed runs/);
  assert.doesNotMatch(source, /innerHTML\s*=/);
});
