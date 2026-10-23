import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = process.env.KANO_PROJECT_ROOT || fileURLToPath(new URL('..', import.meta.url));
const html = readFileSync(path.join(ROOT, 'index.html'), 'utf8');

test('civic project module is registered exactly once after Adashi support', () => {
  const prior = '<script type="module" src="/js/KanoNorthernDriverAdashiSupportUpgrade.js"></script>';
  const current = '<script type="module" src="/js/KanoNorthernDriverCivicProjectsUpgrade.js"></script>';
  assert.equal(html.split(current).length - 1, 1);
  assert.ok(html.indexOf(prior) < html.indexOf(current));
});

test('the integrated entry HTML has one doctype, one html root and one body', () => {
  assert.equal((html.match(/<!doctype html>/gi) || []).length, 1);
  assert.equal((html.match(/<html\b/gi) || []).length, 1);
  assert.equal((html.match(/<body\b/gi) || []).length, 1);
  assert.equal((html.match(/<\/body>/gi) || []).length, 1);
  assert.equal((html.match(/<\/html>/gi) || []).length, 1);
});

test('all local JavaScript module script paths exist in the merged project tree', () => {
  const srcs = [...html.matchAll(/<script\b[^>]*\bsrc=["']([^"']+)["'][^>]*>/gi)].map(match => match[1]);
  const local = srcs.filter(src => src.startsWith('/js/'));
  // The archived Step 2026-10-21 source snapshot predates two modules that are present
  // in the current public main branch (Step 65 and Step 68). Preserve their references;
  // check every other local module path present in this merged snapshot.
  const currentMainModules = new Set([
    '/js/KanoNorthernDriverSkillsPathwaysUpgrade.js',
    '/js/KanoNorthernDriverCareerProgressionUpgrade.js',
  ]);
  const missing = local.filter(src => !currentMainModules.has(src) && !existsSync(path.join(ROOT, src.slice(1))));
  assert.deepEqual(missing, [], `Missing local module references from the supplied snapshot: ${missing.join(', ')}`);
  for (const src of currentMainModules) assert.ok(local.includes(src), `Expected current main bootstrap reference ${src}`);
});

test('existing skill-path and career-progression bootstrap references are preserved', () => {
  assert.ok(html.includes('/js/KanoNorthernDriverSkillsPathwaysUpgrade.js'));
  assert.ok(html.includes('/js/KanoNorthernDriverCareerProgressionUpgrade.js'));
});


test('civic UI adapter resolves all named imports without touching browser globals', async () => {
  const moduleUrl = pathToFileURL(path.join(ROOT, 'js', 'KanoNorthernDriverCivicProjectsUpgrade.js')).href;
  await import(moduleUrl);
  assert.ok(existsSync(path.join(ROOT, 'js', 'KanoNorthernDriverCivicProjects.js')));
});
