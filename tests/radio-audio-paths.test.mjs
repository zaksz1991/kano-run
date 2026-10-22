import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const audioSource = fs.readFileSync(path.join(ROOT, 'js', 'audio.js'), 'utf8');
const manifestLines = fs.readFileSync(path.join(ROOT, 'ASSET-MANIFEST.csv'), 'utf8').split(/\r?\n/);
const manifestPaths = new Set(manifestLines.map((line) => line.split(',')[0].trim()).filter(Boolean));

test('radio source uses the one manifest-backed audio asset directory', () => {
  assert.match(audioSource, /const RADIO_ROOT = '\/assets\/models\/audio\/'/);
  assert.doesNotMatch(audioSource, /const RADIO_ROOTS\s*=/);
  assert.doesNotMatch(audioSource, /method:\s*['"]HEAD['"]/i);
});

test('every configured radio track exists in the supplied asset manifest', () => {
  const expected = ['radio-kano.mp3', 'rahama.mp3', 'freedom.mp3', 'cool.mp3', 'arewa.mp3', 'wazobia.mp3'];
  for (const filename of expected) {
    assert.ok(manifestPaths.has(`public/assets/models/audio/${filename}`), `manifest missing ${filename}`);
    assert.ok(audioSource.includes(`'${filename}'`), `audio.js does not map ${filename}`);
  }
});

test('radio tracks are not preloaded before playback', () => {
  assert.match(audioSource, /player\.preload = 'none';/);
});
