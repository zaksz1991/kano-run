import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const root = new URL('../', import.meta.url);
const html = readFileSync(new URL('index.html', root), 'utf8');
const bridge = readFileSync(new URL('js/KanoNorthernDriverSeasonalEnvironmentBridge.js', root), 'utf8');
const core = readFileSync(new URL('js/KanoNorthernDriverSeasonalBridgeCore.js', root), 'utf8');

const sources = [...html.matchAll(/<script\s+type="module"\s+src="([^"]+)"\s*><\/script>/g)].map(match => match[1]);

test('the seasonal prototype bridge loads before the unchanged core bootstrap sequence', () => {
  assert.equal(sources[0], '/js/KanoNorthernDriverSeasonalEnvironmentBridge.js');
  const baseline = [
    '/js/KanoCulturalStreetEventsUpgrade.js',
    '/js/KanoWorldPerformanceInstancingUpgrade.js',
    '/js/KanoLifeRootCauseRepair.js',
    '/js/KanoModelAssetVisualUpgrade.js',
    '/js/KanoNorthernDriverSkillsPathwaysUpgrade.js',
    '/js/KanoNorthernDriverCareerProgressionUpgrade.js',
  ];
  assert.deepEqual(sources.slice(1, 7), baseline);
});

test('all previously delivered relationship and family modules remain reachable exactly once', () => {
  for (const file of [
    'KanoNorthernDriverAureJourneyUpgrade.js',
    'KanoNorthernDriverLefeNegotiationUpgrade.js',
    'KanoNorthernDriverParenthoodUpgrade.js',
    'KanoNorthernDriverSeasonalResilienceUpgrade.js',
  ]) assert.equal(sources.filter(source => source === `/js/${file}`).length, 1, `${file} must be loaded exactly once`);
  for (const protectedPart of ['href="/manifest.webmanifest"', 'href="/icons/apple-touch-icon.png"', 'href="/css/styles.css"', 'id="game-canvas"', 'id="passenger-list"', 'id="drive-controls"']) assert.ok(html.includes(protectedPart), `Missing preserved base UI/PWA fragment ${protectedPart}`);
});

test('the seasonal installer imports existing systems and leaves the season change opt-in', () => {
  assert.ok(bridge.includes("from './game.js'"));
  assert.ok(bridge.includes("from './KanoAtmosphere.js'"));
  assert.ok(bridge.includes("from './storage.js'"));
  assert.ok(bridge.includes('seasonalAuto === true'));
  assert.ok(core.includes("state.environment = 'rainPuddles'"));
  assert.ok(core.includes('state.environment = previousEnvironment'));
  assert.ok(core.includes('enumerable: false'));
});
