import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const root = new URL('../', import.meta.url);
const html = readFileSync(new URL('index.html', root), 'utf8');
const bridge = readFileSync(new URL('js/KanoNorthernDriverSeasonalEnvironmentBridge.js', root), 'utf8');
const core = readFileSync(new URL('js/KanoNorthernDriverSeasonalBridgeCore.js', root), 'utf8');
const sources = [...html.matchAll(/<script\s+type="module"\s+src="([^"]+)"\s*><\/script>/g)].map(match => match[1]);

test('runtime audit and launch recovery precede the seasonal bridge, while core patches precede the direct main entry', () => {
  assert.equal(sources[0], '/js/KanoLifeRuntimeAudit.js');
  assert.equal(sources[1], '/js/KanoAppLaunchRecovery.js');
  assert.equal(sources[2], '/js/KanoNorthernDriverSeasonalEnvironmentBridge.js');
  const baseline = [
    '/js/KanoCulturalStreetEventsUpgrade.js',
    '/js/KanoWorldPerformanceInstancingUpgrade.js',
    '/js/KanoLifeRootCauseRepair.js',
    '/js/KanoNorthernDriverSkillsPathwaysUpgrade.js',
    '/js/KanoNorthernDriverEmploymentMarketUpgrade.js',
    '/js/KanoNorthernDriverEmploymentScheduleUpgrade.js',
    '/js/KanoNorthernDriverDigitalLifeUpgrade.js',
    '/js/KanoNorthernDriverCareerProgressionUpgrade.js',
    '/js/KanoNorthernDriverAureJourneyUpgrade.js',
    '/js/KanoNorthernDriverLefeNegotiationUpgrade.js',
    '/js/KanoNorthernDriverParenthoodUpgrade.js',
    '/js/KanoNorthernDriverSeasonalResilienceUpgrade.js',
    '/js/KanoNorthernDriverAdashiSupportUpgrade.js',
    '/js/KanoNorthernDriverCivicProjectsUpgrade.js',
    '/js/KanoNorthernDriverSocialDramaUpgrade.js',
    '/js/KanoNorthernDriverSocialNetworkUpgrade.js',
    '/js/KanoLifeCareerSettingsHub.js',
    '/js/KanoPhoneComfortUpgrade.js',
    '/js/KanoModelAssetVisualUpgrade.js',
    '/js/main.js',
  ];
  assert.deepEqual(sources.slice(3), baseline);
  assert.equal(sources.filter(source => source === '/js/main.js').length, 1);
  assert.equal(sources.filter(source => source === '/js/KanoLifeRuntimeAudit.js').length, 1);
});

test('the start-page recovery preserves the canonical Game and UI rather than creating a second engine', () => {
  const recovery = readFileSync(new URL('js/KanoAppLaunchRecovery.js', root), 'utf8');
  assert.ok(recovery.includes("import('./main.js')"));
  assert.ok(recovery.includes('window.__KANO_ACTIVE_GAME__'));
  assert.ok(recovery.includes('fillSelectIfEmpty'));
  assert.ok(recovery.includes('startup recovery could not load main.js'));
  assert.ok(!recovery.includes('new Game('));
});

test('all previously delivered relationship and family modules remain reachable exactly once', () => {
  for (const file of [
    'KanoNorthernDriverAureJourneyUpgrade.js',
    'KanoNorthernDriverLefeNegotiationUpgrade.js',
    'KanoNorthernDriverParenthoodUpgrade.js',
    'KanoNorthernDriverSeasonalResilienceUpgrade.js',
    'KanoNorthernDriverAdashiSupportUpgrade.js',
    'KanoNorthernDriverCivicProjectsUpgrade.js',
    'KanoNorthernDriverSocialNetworkUpgrade.js',
  ]) assert.equal(sources.filter(source => source === `/js/${file}`).length, 1, `${file} must be loaded exactly once`);
  for (const protectedPart of ['href="/manifest.webmanifest"', 'href="/icons/apple-touch-icon.png"', 'href="/css/styles.css"', 'id="game-canvas"', 'id="passenger-list"', 'id="drive-controls"']) assert.ok(html.includes(protectedPart), `Missing preserved base UI/PWA fragment ${protectedPart}`);
});

test('the generated Keke hero image replaces the flat illustration and social life has a start-page entry', () => {
  assert.ok(html.includes('src="/assets/kano-life-keke-hero.webp"'));
  assert.ok(html.includes('id="kano-social-drama-btn"'));
  assert.ok(html.includes('href="/css/kano-life-step74-upgrade.css"'));
  assert.ok(html.includes('href="/css/kano-life-step75-social-network.css"'));
  assert.ok(html.includes('id="route-select" data-kano-static-fallback="true"'));
  assert.ok(html.includes('id="driver-select" data-kano-static-fallback="true"'));
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
