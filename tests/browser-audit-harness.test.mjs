import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const script = await readFile(path.join(root, 'scripts', 'browser-audit.mjs'), 'utf8');

test('driving scenarios wait until the real game bootstrap is ready before clicking', () => {
  assert.match(script, /async function waitForApplicationReady\(/);
  assert.match(script, /window\.__KANO_LIFE_GAME__/);
  assert.match(script, /typeof game\.start === 'function'/);
  assert.match(script, /await waitForApplicationReady\(page, 45_000\)/);
});

test('START DRIVING is tested as the direct-start gameplay flow', () => {
  assert.match(script, /async function startDrivingRun\(/);
  assert.match(script, /await page\.locator\('#start-btn'\)\.click/);
  assert.match(script, /game\?\.state === 'PLAY'/);
  assert.match(script, /did not enter a playable driving state/);
  assert.doesNotMatch(script, /Clicking START DRIVING did not reveal the morning routine/);
});

test('the optional morning story has a distinct replay smoke test using actual UI actions', () => {
  assert.match(script, /async function advanceOptionalMorningRoutine\(/);
  assert.match(script, /#kano-replay-morning-routine/);
  for (const action of [
    'WAKE UP · WASH AND DRESS',
    'HEAD OUT NOW',
    'WALK TO THE ROAD-SIDE STALL',
    'SKIP BREAKFAST',
    'CONTINUE TO THE PARK',
    'WALK TO THE GUARDED KEKE PARK',
    'GREET MALLAM SECURITY',
    'INSPECT KEKE · UNLOCK · START SHIFT',
  ]) assert.ok(script.includes(action), `Expected story action: ${action}`);
  assert.match(script, /breakfastEaten === false/);
  assert.match(script, /runMorningRoutineSmoke\(/);
});

test('run restarts wait for active gameplay instead of trying to replay the optional story', () => {
  assert.match(script, /async function advanceMorningRoutineAfterRestart\(page\)\s*\{\s*await waitForPlayableRun\(page, 'Restarting the run'\);/);
});

test('local Vite Preview API stubs are explicit and are disabled for externally supplied URLs', () => {
  assert.match(script, /async function installLocalPreviewApiFixtures\(/);
  assert.match(script, /if \(EXTERNAL_BASE_URL\) return \[\]/);
  assert.match(script, /local preview fixture; live presence is not under test/);
  assert.match(script, /local preview fixture; Redis leaderboard is not under test/);
  assert.match(script, /localApiFixtures/);
});

test('renderer telemetry does not create a different canvas context during measurement', () => {
  assert.doesNotMatch(script, /canvas\.getContext\('2d'\)/);
  assert.match(script, /renderModeReportedByGame: window\.__KANO_RENDER_MODE__ \|\| null/);
});

test('failed scenarios preserve runtime diagnostics and completed runs are distinguished from clean runs', () => {
  assert.match(script, /result\.failureSnapshot = await inspectPageState\(page\)/);
  assert.match(script, /result\.frameTime = await page\.evaluate/);
  assert.match(script, /result\.auditClean = Boolean\(/);
  assert.match(script, /DONE_WITH_ERRORS/);
  assert.match(script, /Scenario failure details/);
});
