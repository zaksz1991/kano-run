import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = path => readFileSync(new URL(path, import.meta.url), 'utf8');

test('Step 75 social network registration follows the existing social drama registration', () => {
  const html = read('../index.html');
  const drama = html.indexOf('/js/KanoNorthernDriverSocialDramaUpgrade.js');
  const network = html.indexOf('/js/KanoNorthernDriverSocialNetworkUpgrade.js');
  const visual = html.indexOf('/js/KanoModelAssetVisualUpgrade.js');
  const core = html.indexOf('/js/main.js');
  assert.ok(drama >= 0 && network > drama && visual > network && core > visual);
  assert.equal((html.match(/KanoNorthernDriverSocialNetworkUpgrade\.js/g) || []).length, 1);
  assert.match(html, /kano-life-step75-social-network\.css/);
});

test('the start page contains visible fallback route and driver options before JavaScript runs', () => {
  const html = read('../index.html');
  assert.match(html, /<select id="route-select" data-kano-static-fallback="true"><option value="route-7">/);
  assert.match(html, /<select id="driver-select" data-kano-static-fallback="true"><option value="ruffneck">/);
});

test('launch recovery expands marked fallback options from the canonical route and driver configuration', () => {
  const source = read('../js/KanoAppLaunchRecovery.js');
  assert.match(source, /const staticFallback = select\.dataset\.kanoStaticFallback === 'true'/);
  assert.match(source, /if \(staticFallback\)\s*\{\s*\/\/ Keep the safe HTML choice if a partially loaded configuration has no data\.\s*if \(!Array\.isArray\(records\) \|\| records\.length === 0\) return;\s*select\.replaceChildren\(\);\s*delete select\.dataset\.kanoStaticFallback;/);
  assert.match(source, /fillSelectIfEmpty\('route-select', ROUTES/);
  assert.match(source, /fillSelectIfEmpty\('driver-select', DRIVERS/);
  assert.match(source, /await loadMain\(\)/);
  assert.match(source, /scheduleStartProgressCheck/);
  assert.match(source, /Start Driving was clicked, but the game stayed on the start page/);
});

test('Step 75 integration does not replace the game engine, wallet, renderers or Aure journey source', () => {
  const html = read('../index.html');
  const network = read('../js/KanoNorthernDriverSocialNetworkUpgrade.js');
  assert.match(html, /src="\/js\/main\.js"/);
  assert.match(network, /SOCIAL_DRAMA_STORAGE_KEY/);
  assert.match(network, /SOCIAL_NETWORK_STORAGE_KEY/);
  assert.match(network, /kanoNorthernDriverAureJourney/);
  assert.doesNotMatch(network, /new Game\(|new Renderer3D\(|save\.money\s*=|fetch\(/);
});

test('social network card is inserted at a direct panel child boundary, not before a nested descendant', () => {
  const source = read('../js/KanoNorthernDriverSocialNetworkUpgrade.js');
  assert.match(source, /const historyCard = historyNode\?\.closest\('\.kds-card'\)/);
  assert.match(source, /historyCard && historyCard.parentElement === panel\) panel\.insertBefore\(card, historyCard\)/);
});
