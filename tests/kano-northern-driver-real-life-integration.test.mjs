import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const moduleText = await readFile(new URL('../js/KanoNorthernDriverRealLifeUpgrade.js', import.meta.url), 'utf8');
const entryText = await readFile(new URL('../js/KanoModelAssetVisualUpgrade.js', import.meta.url), 'utf8');
const baseLifeText = await readFile(new URL('../js/KanoNorthernDriverLifeSimulationUpgrade.js', import.meta.url), 'utf8');

test('entry imports core career before the social-life UI and preserves presentation bootstrap', () => {
  const career = entryText.indexOf("await import('./KanoNorthernDriverLifeSimulationUpgrade.js')");
  const social = entryText.indexOf("await import('./KanoNorthernDriverRealLifeUpgrade.js')");
  const presentation = entryText.indexOf("await import('./KanoGameplayPresentationRepair.js')");
  assert.ok(career >= 0 && social > career && presentation > social);
});

test('social layer uses existing storage wallet and persistence exports', () => {
  assert.match(moduleText, /import \{ save, persist \} from '\.\/storage\.js'/);
  assert.match(moduleText, /save\.money = result\.wallet/);
  assert.match(moduleText, /persist\(\)/);
  assert.doesNotMatch(moduleText, /localStorage\.setItem\(['"]wallet/);
});

test('career screen receives the daily life section and accessible choices', () => {
  assert.match(moduleText, /kano-real-life-section/);
  assert.match(moduleText, /klr-event-choices/);
  assert.match(moduleText, /klr-routine-style/);
  assert.match(moduleText, /role="status"/);
  assert.match(moduleText, /data-klr-choice/);
});

test('the addon is idempotent and uses an explicit prototype patch marker', () => {
  assert.match(moduleText, /Symbol\.for\('kano\.life\.northernRealLifeUI\.v1'\)/);
  assert.match(moduleText, /if \(UI\?\.prototype && !UI\.prototype\[PATCH\]\)/);
  assert.match(baseLifeText, /kanoNorthernDriverLifeSimulation/);
});

test('routine text documents opt-in behavior and does not force-jump the clock', () => {
  assert.match(moduleText, /Routine prompts are optional/);
  assert.match(moduleText, /does not force the world clock to jump/);
});
