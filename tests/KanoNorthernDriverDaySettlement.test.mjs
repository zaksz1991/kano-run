import test from 'node:test';
import assert from 'node:assert/strict';
import { buildDaySettlement, KanoNorthernDriverDaySettlementLedger } from '../js/KanoNorthernDriverDaySettlement.js';

function memoryStorage() {
  const data = new Map();
  return { getItem: key => data.get(key) ?? null, setItem: (key, value) => data.set(key, String(value)) };
}
const parkReport = (overrides = {}) => ({
  today: {
    day: 3, standId: 'sabon-gari', workStyle: 'official_queue', shiftsStarted: 2,
    boardings: 5, completedTrips: 4, safeTrips: 3, roughTrips: 1,
    repeatCustomerTrips: 2, grossFares: 1200, distanceKm: 18.25,
    tokenPaid: true, tokenAmount: 40,
  }, standing: 61, plan: { standId: 'sabon-gari', workStyle: 'official_queue' }, ...overrides,
});
const lifeSnapshot = (overrides = {}) => ({
  profile: { name: 'Aisha' }, wallet: 850, savings: 1600, totalArrears: 90,
  arrears: { operating: 30, vehicle: 0, household: 60 }, vehicleOutstanding: 450000,
  totals: { gross: 4200, paidExpenses: 900 },
  lastShiftReport: { day: 3, mode: 'career', gross: 800, totalDue: 220, totalPaid: 220, netAfterPaidCosts: 580, walletAfterExpenses: 850 },
  ...overrides,
});

test('builds a day-specific work and financial-position statement', () => {
  const report = buildDaySettlement({ day: 3, parkReport: parkReport(), lifeSnapshot: lifeSnapshot(), closedAt: '2026-10-23T10:00:00.000Z' });
  assert.equal(report.day, 3);
  assert.equal(report.profileName, 'Aisha');
  assert.equal(report.work.grossFares, 1200);
  assert.equal(report.work.completedTrips, 4);
  assert.equal(report.work.safeTrips, 3);
  assert.equal(report.work.parkTokenAmount, 40);
  assert.equal(report.financialPosition.wallet, 850);
  assert.equal(report.financialPosition.totalArrears, 90);
  assert.equal(report.financialPosition.lastRunSettlement.totalPaid, 220);
  assert.equal(report.financialEffectsApplied, false);
});

test('does not attribute another day\'s last run settlement to the closing day', () => {
  const report = buildDaySettlement({ day: 3, parkReport: parkReport(), lifeSnapshot: lifeSnapshot({ lastShiftReport: { day: 2, totalPaid: 99 } }) });
  assert.equal(report.financialPosition.lastRunSettlement, null);
});

test('closes each day once and does not create a second debit', () => {
  const ledger = new KanoNorthernDriverDaySettlementLedger({ storage: memoryStorage(), now: () => Date.parse('2026-10-23T10:00:00.000Z') });
  const input = { day: 3, parkReport: parkReport(), lifeSnapshot: lifeSnapshot() };
  const first = ledger.closeDay(input);
  const second = ledger.closeDay(input);
  assert.equal(first.ok, true);
  assert.equal(second.ok, false);
  assert.equal(second.reason, 'already_closed');
  assert.equal(ledger.getSnapshot().count, 1);
  assert.equal(first.report.financialEffectsApplied, false);
});

test('persists and reloads daily statements, capped to sixty reports', () => {
  const storage = memoryStorage();
  const first = new KanoNorthernDriverDaySettlementLedger({ storage });
  for (let day = 1; day <= 65; day += 1) {
    first.closeDay({ day, parkReport: { today: { day, grossFares: day * 10 } }, lifeSnapshot: { wallet: day } });
  }
  const reloaded = new KanoNorthernDriverDaySettlementLedger({ storage });
  assert.equal(reloaded.getSnapshot().count, 60);
  assert.equal(reloaded.getReport(1), null);
  assert.equal(reloaded.getSnapshot().latest.day, 65);
});

test('rejects invalid storage and reports an explicit storage failure', () => {
  const storage = { getItem: () => null, setItem: () => { throw new Error('quota exceeded'); } };
  const ledger = new KanoNorthernDriverDaySettlementLedger({ storage });
  const result = ledger.closeDay({ day: 1, parkReport: parkReport(), lifeSnapshot: lifeSnapshot() });
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'storage_unavailable');
  assert.equal(ledger.getSnapshot().count, 0);
});
