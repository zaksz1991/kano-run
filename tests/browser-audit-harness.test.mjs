import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const script = await readFile(path.join(here, '..', 'scripts', 'browser-audit.mjs'), 'utf8');

test('morning routine selects a visible live DOM button with normalized text', () => {
  assert.match(script, /normalizeButtonText/);
  assert.match(script, /document\.querySelectorAll\('#life-actions button'\)/);
  assert.match(script, /page\.locator\('#life-actions button'\)\.nth\(index\)\.click/);
  assert.doesNotMatch(script, /page\.locator\('#life-actions'\)\.getByRole\('button'/);
});

test('routine startup failure reports current screen, step and visible actions', () => {
  assert.match(script, /Clicking START DRIVING did not reveal the morning routine/);
  assert.match(script, /currentStep:/);
  assert.match(script, /availableActions:/);
  assert.match(script, /bootstrapScripts:/);
});

test('failed scenarios preserve render, frame and screenshot diagnostics', () => {
  assert.match(script, /result\.failureSnapshot = await inspectPageState\(page\)/);
  assert.match(script, /result\.actualRenderMode = result\.failureSnapshot\?\.renderMode/);
  assert.match(script, /result\.frameTime = await page\.evaluate/);
  assert.match(script, /Scenario failure details/);
});

test('console output includes each setup failure and representative HTTP failures', () => {
  assert.match(script, /\$\{result\.scenario\} failure: \$\{result\.error\}/);
  assert.match(script, /HTTP errors \(first 5\)/);
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
