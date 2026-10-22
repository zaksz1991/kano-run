import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const main = await readFile(path.join(here, '../js/main.js'), 'utf8');
const manager = await readFile(path.join(here, '../js/ModelManager.js'), 'utf8');

test('ModelManager receives the current device mode', () => {
  assert.match(main, /new ModelManager\(\{\s*mobile\s*\}\)/);
  assert.match(manager, /mobile = false/);
  assert.match(manager, /this\.mobile = Boolean\(mobile\)/);
});

test('mobile startup loads the player keke before deferring other model categories', () => {
  assert.match(main, /const essentials = mobile\s*\?\s*\['keke'\]/);
  assert.match(main, /const playerModel = models\.getInstance\('keke'\)/);
  assert.match(main, /'car',\s*'taxi',\s*'suv',\s*'motorcycle',\s*'police',\s*'passenger'/s);
});

test('mobile deferred assets pause between individual model loads while playing', () => {
  assert.match(main, /for \(const key of keys\)/);
  assert.match(main, /while \(game\?\.state === 'PLAY'\)/);
  assert.match(main, /await models\.preload\(\[key\]\)/);
  assert.match(main, /deferred mobile asset failed: \$\{key\}/);
});

test('mobile preloads sequentially while desktop retains parallel loading', () => {
  assert.match(manager, /if \(!this\.mobile\)\s*\{\s*return Promise\.all\(uniqueKeys\.map\(\(key\) => this\.load\(key\)\)\)/s);
  assert.match(manager, /for \(const key of uniqueKeys\)\s*\{\s*if \(this\.disposed\) break;\s*results\.push\(await this\.load\(key\)\)/s);
});
