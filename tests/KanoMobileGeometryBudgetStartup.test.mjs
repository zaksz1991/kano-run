import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const diff = await readFile(new URL('../integration/KanoAnimationTrafficUpgrade.js.diff', import.meta.url), 'utf8');

test('wires the existing optimizer through a module imported by main.js', () => {
  assert.match(diff, /^--- a\/js\/KanoAnimationTrafficUpgrade\.js$/m);
  assert.match(diff, /^\+import '\.\/KanoMobileGeometryBudgetUpgrade\.js';$/m);
});

test('targets only the unprotected animation integration file', () => {
  const target = diff.match(/^\+\+\+ b\/(.+)$/m)?.[1];
  assert.equal(target, 'js/KanoAnimationTrafficUpgrade.js');
  assert.doesNotMatch(diff, /^\+\+\+ b\/(?:index\.html|js\/(?:main|game|renderer3d|ui|ModelManager|KanoDeviceTier|KanoPhoneComfortUpgrade|KanoModelAssetVisualUpgrade)\.[^/]+)$/m);
});

test('imports the existing optimizer rather than a replacement implementation', () => {
  const additions = diff.split('\n').filter((line) => line.startsWith('+') && !line.startsWith('+++')).join('\n');
  assert.match(additions, /import '\.\/KanoMobileGeometryBudgetUpgrade\.js';/);
  assert.doesNotMatch(additions, /(?:SimplifyModifier|BufferGeometry|new THREE\.)/);
});
