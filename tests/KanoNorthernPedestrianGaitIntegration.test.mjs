import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = fileURLToPath(new URL('.', import.meta.url));
const diffPath = join(here, '../integration/KanoWorldPerformanceInstancingUpgrade.js.diff');

test('integration diff adds a new additive gait import only', async () => {
  const diff = await readFile(diffPath, 'utf8');
  assert.match(diff, /\+import '\.\/KanoNorthernPedestrianGaitUpgrade\.js';/);
  assert.doesNotMatch(diff, /renderer3d\.js\s+\|.*replace|DELETE|overwrite/i);
  assert.match(diff, /KanoWorldPerformanceInstancingUpgrade\.js/);
});

test('addon preserves imported GLB character actors', async () => {
  const source = await readFile(join(here, '../js/KanoNorthernPedestrianGaitUpgrade.js'), 'utf8');
  assert.match(source, /usingModel: Boolean\(walker\?\.usingModel\)/);
  assert.match(source, /fallbackPedestrian/);
  assert.match(source, /setMatrixAt\(instanceIndex, dummy\.matrix\)/);
});
