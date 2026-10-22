import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (relative) => fs.readFileSync(path.join(ROOT, relative), 'utf8');
const hud = read('js/KanoDayHud.js');
const css = read('css/kano-responsive-upgrade.css');
const renderer = read('js/renderer3d.js');

 test('day-cycle HUD is anchored right and dynamically clears right-side HUD furniture', () => {
  assert.match(hud, /\.kano-day-hud\{position:absolute;right:8px;left:auto;/);
  assert.doesNotMatch(hud, /\.kano-day-hud\{[^}]*left:8px/);
  assert.match(hud, /#place\(\)/);
  assert.match(hud, /\['#menu-btn', '\.minimap', '#hud \.hud-top', '#hud \.hud-bottom', '#hud \.mission-pill'\]/);
  assert.match(hud, /removeEventListener\('resize', this\.onResize\)/);
  assert.match(hud, /removeEventListener\('orientationchange', this\.onResize\)/);
});

test('phone HUD hides the background Kano label and reduces secondary rows', () => {
  assert.match(css, /\.sky-label\s*\{\s*display:\s*none !important;/);
  assert.match(css, /#hud #dialect-label,[\s\S]*?#hud #kano-overall-record,[\s\S]*?display:\s*none !important;/);
  assert.match(css, /#hud #kano-vehicle-health/);
  assert.match(css, /#hud \.hud-bottom\s*\{[\s\S]*?max-width:\s*calc\(100% - 44px\)/);
  assert.match(css, /#hud \.mission-pill\s*\{[\s\S]*?font-size:\s*8px/);
});

test('driver camera is raised and pulled back enough to clear the keke body', () => {
  assert.match(renderer, /this\.camera\.position\.y = driverView \? 2\.9 : 3\.35/);
  assert.match(renderer, /this\.camera\.position\.z = driverView \? 7\.2 : 8\.6/);
  assert.match(renderer, /this\.camera\.lookAt\([\s\S]*?driverView \? 1\.6 : 0\.72/);
});
