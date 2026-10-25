import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (relative) => fs.readFileSync(path.join(ROOT, relative), 'utf8');

test('every public asset URL the 3D renderer requests actually exists in public/', () => {
  const renderer = read('js/renderer3d.js');
  const urls = [...renderer.matchAll(/'(\/assets\/[^']+\.(?:jpg|jpeg|png|webp))'/g)].map((m) => m[1]);
  assert.ok(urls.length >= 2, 'renderer requests the asphalt and market-stall textures');
  for (const url of urls) {
    assert.ok(fs.existsSync(path.join(ROOT, 'public', url)), `missing public file for ${url}`);
  }
});

test('the day cycle (clock, prayer periods, hunger, fatigue) is wired into the running game', () => {
  const main = read('js/main.js');
  assert.match(main, /import \{ KanoDayCycle \} from '\.\/KanoDayCycle\.js'/);
  assert.match(main, /import \{ KanoDayHud \} from '\.\/KanoDayHud\.js'/);
  assert.match(main, /game\.dayCycle = dayCycle/);
  assert.match(main, /dayCycle\.update\(dt, \{/);
  assert.match(main, /minuteOfDay: game\.s\?\.gameClockMinutes/);
  assert.match(read('js/game.js'), /breakfastEaten: null/);
});

test('a full keke is told it is full (guard against a stale ZIP overwriting the fix)', () => {
  const source = read('js/KanoInteractionReliability.js');
  assert.match(source, /KEKE FULL · DROP A PASSENGER FIRST/);
  assert.match(source, /CHECKPOINT AHEAD · NOT ENOUGH SEATS/);
});

test('phone toast is sized to its text and parked clear of the passenger list', () => {
  const css = read('css/kano-responsive-upgrade.css');
  assert.match(css, /@media \(max-width: 760px\) \{\s*\.toast \{[^}]*width: max-content/);
});

test('every GLTF loader goes through the shared factory', () => {
  for (const file of ['js/KanoAnimationTrafficUpgrade.js', 'js/KanoLifeRootCauseRepair.js']) {
    const source = read(file);
    assert.match(source, /createGLTFLoader/);
    assert.doesNotMatch(source, /new GLTFLoader\s*\(/);
  }
});

test('the 3D-only guard, service worker and PWA links survive later ZIPs', () => {
  const main = read('js/main.js');
  assert.match(main, /registerServiceWorker\.js[\s\S]*registerServiceWorker\?\.\(\)|registerServiceWorker\(\)/);
  assert.match(main, /canUse2D/);
  assert.doesNotMatch(main, /WebGL context lost; switching to Canvas 2D/);
  const html = read('index.html');
  assert.match(html, /rel="manifest" href="\/manifest\.webmanifest"/);
  assert.match(html, /rel="apple-touch-icon"/);
});

test('phone performance fixes from Steps 21-22 survive the renderer merges', () => {
  const renderer = read('js/renderer3d.js');
  assert.match(renderer, /_nextMobileGlbTrafficSelectionAt/);
  assert.match(renderer, /disposeOwnedZoneLabelTexture\(actor\)/);
  assert.doesNotMatch(renderer, /pedestrian\.arms\.entries\(\)/);
});

test('the right-anchored day HUD placement logic is intact', () => {
  assert.match(read('js/KanoDayHud.js'), /#place\(\)/);
});
