import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const upgrade = await readFile(new URL('../js/KanoNorthernDriverRoadComplianceUpgrade.js', import.meta.url), 'utf8');
const chain = await readFile(new URL('../js/KanoNorthernDriverFuelEconomyUpgrade.js', import.meta.url), 'utf8');

test('new module is chained additively through Step 55 without replacing core game files', () => {
  assert.match(chain, /import\s+['"]\.\/KanoNorthernDriverRoadComplianceUpgrade\.js['"]/);
  assert.match(upgrade, /import\s+\{\s*Game\s*\}\s+from\s+['"]\.\/game\.js['"]/);
  assert.match(upgrade, /Game\.prototype\.resolveEvent/);
  assert.match(upgrade, /beforeType === 'karota'/);
  assert.match(upgrade, /chargeExpense\(/);
});

test('checkpoint integration only applies after the original game records a checkpoint', () => {
  assert.match(upgrade, /Number\(s\.checkpoints\)\s*\|\|\s*0\)\s*>\s*beforeCheckpoints/);
  assert.match(upgrade, /if \(checkpointWasResolved\)/);
  assert.match(upgrade, /if \(shiftActive\(game\)\)/);
});
