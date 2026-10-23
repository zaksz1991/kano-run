import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
const root = path.resolve(import.meta.dirname || path.dirname(new URL(import.meta.url).pathname), '..');
const text = file => fs.readFileSync(path.join(root, file), 'utf8');

test('Step 62 family entry module loads the new communication panel', () => {
  const integration = text('js/KanoNorthernDriverFamilyResponsibilitiesUpgrade.js');
  assert.match(integration, /import '\.\/KanoNorthernDriverPhoneAndCommunicationUpgrade\.js';/);
  assert.match(integration, /FAMILY_RESPONSIBILITIES_STORAGE_KEY/);
  assert.match(integration, /kano-family-responsibilities/);
});

test('phone panel is gated during driving and consumes the existing save wallet for top-ups only', () => {
  const ui = text('js/KanoNorthernDriverPhoneAndCommunicationUpgrade.js');
  assert.match(ui, /activeShift: Boolean\(game && \['PLAY', 'EVENT', 'GAME_OVER'\]/);
  assert.match(ui, /button\.disabled = ctx\.activeShift/);
  assert.match(ui, /save\.money = nextWallet/);
  assert.match(ui, /kano:daily-day-change/);
  assert.match(ui, /kpl-relationship/);
});
