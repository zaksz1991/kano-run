import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (file) => fs.readFileSync(path.join(ROOT, file), 'utf8');

test('presentation repair does not compete with adaptive resolution', () => {
  const presentation = read('js/KanoGameplayPresentationRepair.js');
  assert.match(presentation, /function configureRendererPresentation\(owner\)/);
  assert.match(presentation, /configureRendererPresentation\(this\)/);
  assert.doesNotMatch(presentation, /\.setPixelRatio\s*\(/);
  assert.doesNotMatch(presentation, /resolution adapted to|detail restored to/);
  assert.match(presentation, /rendererPresentationConfigured = new WeakSet\(\)/);
});
