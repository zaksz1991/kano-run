import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = relative => fs.readFileSync(path.join(root, relative), 'utf8');

test('current-main entrypoint preserves PWA links and original startup sequence while adding Step 68', () => {
  const html = read('index.html');
  for (const tag of [
    'href="/manifest.webmanifest"', 'href="/icons/apple-touch-icon.png"',
    'src="/js/KanoCulturalStreetEventsUpgrade.js"', 'src="/js/KanoWorldPerformanceInstancingUpgrade.js"',
    'src="/js/KanoLifeRootCauseRepair.js"', 'src="/js/KanoModelAssetVisualUpgrade.js"',
    'src="/js/KanoNorthernDriverSkillsPathwaysUpgrade.js"', 'src="/js/KanoNorthernDriverCareerProgressionUpgrade.js"',
  ]) assert.ok(html.includes(tag), `missing expected entrypoint element: ${tag}`);
  assert.equal((html.match(/id="game-canvas"/g) || []).length, 1);
  assert.equal((html.match(/id="start-btn"/g) || []).length, 1);
});

test('Step 68 runtime explicitly loads current public-main digital life, job market and schedule modules', () => {
  const js = read('js/KanoNorthernDriverCareerProgressionUpgrade.js');
  for (const dependency of [
    "import './KanoNorthernDriverDigitalLifeUpgrade.js';",
    "import './KanoNorthernDriverEmploymentMarketUpgrade.js';",
    "import './KanoNorthernDriverEmploymentScheduleUpgrade.js';",
  ]) assert.ok(js.includes(dependency), `missing dependency ${dependency}`);
});

test('digital-life build parse hotfix retains the current module logic and escapes the apostrophe correctly', () => {
  const js = read('js/KanoNorthernDriverDigitalLifeUpgrade.js');
  assert.ok(js.includes('"Today\'s decision has been recorded. A new situation becomes available when the simulated day advances."'));
  assert.ok(!js.includes("? 'Today's decision has been recorded."));
});

test('career progression is nonfinancial and does not overwrite payroll helpers', () => {
  const pure = read('js/KanoNorthernDriverCareerProgression.js');
  const runtime = read('js/KanoNorthernDriverCareerProgressionUpgrade.js');
  assert.ok(pure.includes('recordWorkplaceReflection'));
  assert.ok(pure.includes('createCareerPerformanceReview'));
  assert.ok(runtime.includes("import './KanoNorthernDriverEmploymentScheduleUpgrade.js';"));
  assert.ok(pure.includes('No salary or job status changed'));
  assert.ok(!runtime.includes('save.money ='));
  assert.ok(!runtime.includes('markPayrollPaid('));
});
