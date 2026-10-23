import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const ROOT = resolve(import.meta.dirname, '..');
const read = (path) => readFileSync(resolve(ROOT, path), 'utf8');
const html = read('index.html');
const hub = read('js/KanoLifeCareerSettingsHub.js');

const loopFixFiles = [
  'js/KanoNorthernDriverSkillsPathwaysUpgrade.js',
  'js/KanoNorthernDriverEmploymentMarketUpgrade.js',
  'js/KanoNorthernDriverEmploymentScheduleUpgrade.js',
  'js/KanoNorthernDriverCareerProgressionUpgrade.js',
];

test('index has one document shell and a persistent Life & Career host', () => {
  assert.equal((html.match(/<!doctype html>/gi) || []).length, 1);
  assert.equal((html.match(/<html\b/gi) || []).length, 1);
  assert.equal((html.match(/<body\b/gi) || []).length, 1);
  assert.equal((html.match(/id="kano-life-career-screen"/g) || []).length, 1);
  assert.match(html, /id="kano-life-career-screen"[^>]*aria-labelledby="klc-hub-title"/);
  assert.match(html, /id="klc-settings-body"/);
  assert.match(html, /class="klc-panel"/);
});

test('start page and pause menu both expose one shared Life & Career entry', () => {
  assert.equal((html.match(/id="life-career-btn"/g) || []).length, 1);
  assert.equal((html.match(/id="life-career-menu-btn"/g) || []).length, 1);
  assert.match(html, /LIFE &amp; CAREER/);
});

test('the original five settings controls retain one ID each', () => {
  for (const id of ['dialect-select', 'camera-select', 'road-select', 'mute-select', 'quality-select']) {
    assert.equal((html.match(new RegExp(`id="${id}"`, 'g')) || []).length, 1, `${id} must not be cloned`);
  }
  assert.match(hub, /settingsBody\.append\(row\)/, 'the original nodes are moved, not duplicated');
  assert.match(hub, /changing stored values, IDs, select elements, or existing change handlers/);
  assert.match(html, /menu-settings-note/);
});

test('settings hub registers before main.js constructs the original UI', () => {
  const hubAt = html.indexOf('/js/KanoLifeCareerSettingsHub.js');
  const mainAt = html.indexOf('/js/main.js');
  const visualAt = html.indexOf('/js/KanoModelAssetVisualUpgrade.js');
  assert.ok(hubAt > html.indexOf('/js/KanoNorthernDriverSocialNetworkUpgrade.js'));
  assert.ok(hubAt < visualAt && visualAt < mainAt);
  assert.equal((html.match(/src="\/js\/main\.js"/g) || []).length, 1);
});

test('career and social return routes are retained for start and pause-menu entry', () => {
  assert.match(hub, /function inferReturnSurface\(\)/);
  assert.match(hub, /game\?\.state === 'MENU'/);
  assert.match(hub, /function closeCareer\(\)/);
  assert.match(hub, /returnSurface === 'menu'/);
  assert.match(hub, /kano-social-drama-btn/);
  assert.match(hub, /life-career-btn/);
});

test('career hub reports mounted UI separately from gameplay verification', () => {
  assert.match(hub, /simulation API\(s\) detected/);
  assert.match(hub, /not proof that every gameplay event has been browser-tested/);
  assert.match(hub, /kanoLifeCareerSettingsHub/);
  assert.match(hub, /snapshot: \(\) =>/);
});

for (const file of loopFixFiles) {
  test(`${file} no longer observes the entire document and rerenders on its own DOM mutations`, () => {
    const source = read(file);
    assert.doesNotMatch(source, /\.observe\(document\.documentElement\s*,\s*\{\s*childList\s*:\s*true\s*,\s*subtree\s*:\s*true\s*\}\)/s);
    assert.doesNotMatch(source, /new MutationObserver\s*\(/);
    assert.match(source, /function render\(/);
    assert.match(source, /function install\(/);
  });
}

test('career panels remain event-driven or use existing bounded visible-screen refreshes', () => {
  const skills = read(loopFixFiles[0]);
  const market = read(loopFixFiles[1]);
  const schedule = read(loopFixFiles[2]);
  const career = read(loopFixFiles[3]);
  assert.match(skills, /kano:skills-pathways-updated/);
  assert.match(market, /kano:employment-market-updated/);
  assert.match(schedule, /kano:employment-schedule-updated/);
  assert.match(career, /kano:career-progression-updated/);
  assert.match(schedule, /setInterval\(\(\) => \{ if \(document\.querySelector\('#kano-life-career-screen:not\(\.hidden\)'\)\) render\(\); \}, 15000\)/);
  assert.match(career, /setInterval\(\(\) => \{ if \(document\.querySelector\('#kano-life-career-screen:not\(\.hidden\)'\)\) render\(\); \}, 15000\)/);
});
