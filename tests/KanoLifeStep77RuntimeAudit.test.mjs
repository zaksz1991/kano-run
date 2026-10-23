import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve, relative } from 'node:path';

const ROOT = resolve(import.meta.dirname, '..');
const read = (path) => readFileSync(resolve(ROOT, path), 'utf8');
const html = read('index.html');
const audit = read('js/KanoLifeRuntimeAudit.js');
const hub = read('js/KanoLifeCareerSettingsHub.js');
const recovery = read('js/KanoAppLaunchRecovery.js');
const sourcePaths = [...html.matchAll(/<script\s+type="module"\s+src="([^"]+)"\s*><\/script>/g)].map(match => match[1]);

function relativeImports(source) {
  return [...source.matchAll(/(?:from\s*|import\s*(?:\(\s*)?)['"]([^'"]+)['"]/g)]
    .map(match => match[1])
    .filter(specifier => specifier.startsWith('./') || specifier.startsWith('../'));
}

function resolveSpecifier(importer, specifier) {
  const clean = specifier.split(/[?#]/, 1)[0];
  return resolve(dirname(importer), clean);
}

test('runtime audit is the first module and the canonical main entry remains unique', () => {
  assert.equal(sourcePaths[0], '/js/KanoLifeRuntimeAudit.js');
  assert.equal(sourcePaths[1], '/js/KanoAppLaunchRecovery.js');
  assert.equal(sourcePaths.at(-1), '/js/main.js');
  assert.equal(sourcePaths.filter(path => path === '/js/main.js').length, 1);
  assert.equal(sourcePaths.filter(path => path === '/js/KanoLifeRuntimeAudit.js').length, 1);
});

test('employment, digital-life and career panels have independent module roots', () => {
  for (const path of [
    '/js/KanoNorthernDriverSkillsPathwaysUpgrade.js',
    '/js/KanoNorthernDriverEmploymentMarketUpgrade.js',
    '/js/KanoNorthernDriverEmploymentScheduleUpgrade.js',
    '/js/KanoNorthernDriverDigitalLifeUpgrade.js',
    '/js/KanoNorthernDriverCareerProgressionUpgrade.js',
    '/js/KanoLifeCareerSettingsHub.js',
  ]) {
    assert.equal(sourcePaths.filter(item => item === path).length, 1, `${path} should be an explicit root exactly once`);
    assert.ok(existsSync(resolve(ROOT, path.slice(1))), `${path} must exist`);
  }
});

test('the full entrypoint import closure has no missing local JavaScript or CSS dependencies', () => {
  const queue = sourcePaths.map(path => resolve(ROOT, path.slice(1)));
  const visited = new Set();
  const missing = [];
  while (queue.length) {
    const file = queue.pop();
    if (visited.has(file)) continue;
    visited.add(file);
    if (!existsSync(file)) {
      missing.push(`${relative(ROOT, file)} (entrypoint missing)`);
      continue;
    }
    if (!/\.(?:js|mjs)$/.test(file)) continue;
    for (const specifier of relativeImports(readFileSync(file, 'utf8'))) {
      const dependency = resolveSpecifier(file, specifier);
      if (!existsSync(dependency)) missing.push(`${relative(ROOT, file)} -> ${specifier}`);
      else queue.push(dependency);
    }
  }
  assert.deepEqual(missing, []);
  assert.ok(visited.size >= 60, `Expected a broad application graph; only resolved ${visited.size} files.`);
});

test('runtime diagnostics observe errors, failed modules, long tasks and a stuck start click', () => {
  assert.match(audit, /addEventListener\('error'/);
  assert.match(audit, /addEventListener\('unhandledrejection'/);
  assert.match(audit, /long-main-thread-task/);
  assert.match(audit, /start-screen-did-not-advance/);
  assert.match(audit, /module-load-failed/);
  assert.match(audit, /downloadReport/);
  assert.match(recovery, /kano-launch-diagnostics/);
});

test('diagnostics are local-only and do not read saves, wallet values or send network requests', () => {
  assert.doesNotMatch(audit, /(?:globalThis|window|document)\.(?:localStorage|sessionStorage)|fetch\s*\(|XMLHttpRequest|navigator\.sendBeacon/);
  assert.doesNotMatch(audit, /new\s+Game\s*\(/);
  assert.match(audit, /Does not export localStorage, wallet balances, personal profile values, cookies/);
});

test('Life & Career can export a report and display its module/issue counts', () => {
  assert.match(html, /id="klc-run-runtime-audit"/);
  assert.match(html, /id="klc-export-runtime-report"/);
  assert.match(html, /id="klc-runtime-audit-summary"/);
  assert.match(hub, /kanoLifeRuntimeAudit/);
  assert.match(hub, /moduleSummary/);
  assert.match(hub, /issueSummary/);
  assert.match(hub, /downloadReport/);
});

test('settings still use the same five unique controls and one shared settings host', () => {
  for (const id of ['dialect-select', 'camera-select', 'road-select', 'mute-select', 'quality-select']) {
    assert.equal((html.match(new RegExp(`id="${id}"`, 'g')) || []).length, 1, `${id} must not be duplicated`);
  }
  assert.equal((html.match(/id="klc-settings-body"/g) || []).length, 1);
  assert.match(hub, /settingsBody\.append\(row\)/);
});
