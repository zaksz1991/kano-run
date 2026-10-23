import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const upgrade = readFileSync(new URL('../js/KanoNorthernDriverEmploymentScheduleUpgrade.js', import.meta.url), 'utf8');
const schedule = readFileSync(new URL('../js/KanoNorthernDriverEmploymentSchedule.js', import.meta.url), 'utf8');

test('Step 67 entrypoint keeps main-branch startup modules and PWA installation links', () => {
  for (const path of [
    '/js/KanoCulturalStreetEventsUpgrade.js',
    '/js/KanoWorldPerformanceInstancingUpgrade.js',
    '/js/KanoLifeRootCauseRepair.js',
    '/js/KanoModelAssetVisualUpgrade.js',
    '/js/KanoNorthernDriverSkillsPathwaysUpgrade.js',
    '/js/KanoNorthernDriverEmploymentScheduleUpgrade.js',
  ]) assert.ok(html.includes(`src="${path}"`), `missing module ${path}`);
  assert.match(html, /rel="manifest"\s+href="\/manifest\.webmanifest"/);
  assert.match(html, /rel="apple-touch-icon"\s+href="\/icons\/apple-touch-icon\.png"/);
  assert.match(html, /href="\/css\/styles\.css"/);
});

test('Step 67 extends Step 66 employment market without replacing game or renderer modules', () => {
  assert.match(upgrade, /import '\.\/KanoNorthernDriverEmploymentMarketUpgrade\.js'/);
  assert.match(upgrade, /from '\.\/storage\.js'/);
  assert.equal((html.match(/src="\/js\/main\.js"/g) || []).length, 1,
    'the current startup recovery uses exactly one canonical main.js entry');
  assert.match(html, /src="\/js\/KanoLifeRuntimeAudit\.js"/);
  assert.match(html, /src="\/js\/KanoNorthernDriverEmploymentMarketUpgrade\.js"/);
  assert.match(html, /src="\/js\/KanoNorthernDriverEmploymentScheduleUpgrade\.js"/);
});

test('payroll credit checks the existing storage layer return value and rolls back on failure', () => {
  assert.match(upgrade, /walletAndReceiptSaved = persist\(\) === true/);
  assert.match(upgrade, /if \(!walletAndReceiptSaved\)\s*\{[\s\S]{0,280}save\.money = previousMoney/);
  assert.match(upgrade, /else delete save\.kanoEmploymentPayrollReceipts/);
  assert.match(upgrade, /receipts\.some\(receipt => receipt\?\.id === payroll\.id\)/);
});

test('schedule module keeps attendance and payroll pure and bounded', () => {
  assert.match(schedule, /MAX_EMPLOYMENT_SCHEDULE_HISTORY = 120/);
  assert.match(schedule, /MAX_EMPLOYMENT_PAYROLL_RECORDS = 80/);
  assert.match(schedule, /already_recorded/);
  assert.match(schedule, /clock_rollback/);
});
