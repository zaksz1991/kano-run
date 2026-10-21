import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const script = await readFile(path.join(here, '..', 'scripts', 'browser-audit.mjs'), 'utf8');

test('morning routine targets sibling buttons through the life-actions container', () => {
  assert.match(script, /page\.locator\('#life-actions'\)\.getByRole\('button', \{ name, exact: true \}\)/);
  assert.doesNotMatch(script, /page\.locator\('#life-actions button'\)\.getByRole\('button'/);
});

test('morning routine failures preserve step and visible-action diagnostics', () => {
  assert.match(script, /currentStep: document\.querySelector\('#life-step-label'\)/);
  assert.match(script, /availableActions: Array\.from\(document\.querySelectorAll\('#life-actions button'\)\)/);
  assert.match(script, /Morning routine action/);
});

test('renderer telemetry does not create a different canvas context during measurement', () => {
  assert.doesNotMatch(script, /canvas\.getContext\('2d'\)/);
  assert.match(script, /renderModeReportedByGame: window\.__KANO_RENDER_MODE__ \|\| null/);
});

test('scenario reports distinguish clean runs from completed runs with errors', () => {
  assert.match(script, /result\.auditClean = Boolean\(/);
  assert.match(script, /completed with errors/);
  assert.match(script, /DONE_WITH_ERRORS/);
});
