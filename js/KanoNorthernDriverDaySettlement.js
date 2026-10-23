// ============================================================
// KANO LIFE — DAILY SETTLEMENT LEDGER
// Report-only daily close. It does not debit money or replace the
// existing per-shift career ledger as financial authority.
// ============================================================
const safeDay = value => {
  const number = Math.floor(Number(value));
  return Number.isFinite(number) && number >= 1 ? Math.min(number, 999999) : 1;
};
const money = value => Math.max(0, Math.round(Number.isFinite(Number(value)) ? Number(value) : 0));
const finite = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;
const text = (value, max = 80) => String(value ?? '').replace(/[<>\u0000-\u001f]/g, '').replace(/\s+/g, ' ').trim().slice(0, max);
const clone = value => JSON.parse(JSON.stringify(value));

function objectInput(value) {
  if (typeof value === 'string') {
    try { value = JSON.parse(value); } catch { return {}; }
  }
  return value && typeof value === 'object' ? value : {};
}

export function buildDaySettlement({ day = 1, parkReport = {}, lifeSnapshot = {}, closedAt = new Date().toISOString(), source = 'manual' } = {}) {
  const park = objectInput(parkReport);
  const career = objectInput(lifeSnapshot);
  const today = objectInput(park.today);
  const totals = objectInput(career.totals);
  const arrears = objectInput(career.arrears);
  const lifeShift = objectInput(career.lastShiftReport);
  const settlementDay = safeDay(day);
  const shiftMatchesDay = Number(lifeShift.day) === settlementDay;
  const report = {
    version: 1,
    day: settlementDay,
    closedAt: text(closedAt, 40) || new Date().toISOString(),
    source: source === 'automatic_day_rollover' ? 'automatic_day_rollover' : 'manual',
    profileName: text(career.profile?.name || 'Driver', 32) || 'Driver',
    work: {
      standId: text(today.standId || park.plan?.standId || '', 60),
      workStyle: text(today.workStyle || park.plan?.workStyle || '', 40),
      shiftsStarted: money(today.shiftsStarted),
      boardings: money(today.boardings),
      completedTrips: money(today.completedTrips),
      safeTrips: money(today.safeTrips),
      roughTrips: money(today.roughTrips),
      repeatCustomerTrips: money(today.repeatCustomerTrips),
      grossFares: money(today.grossFares),
      distanceKm: Math.max(0, Math.round(finite(today.distanceKm) * 1000) / 1000),
      parkTokenPaid: Boolean(today.tokenPaid),
      parkTokenAmount: money(today.tokenAmount),
      parkStanding: Math.max(0, Math.min(100, finite(park.standing, 50))),
    },
    financialPosition: {
      wallet: money(career.wallet),
      savings: money(career.savings),
      arrears: {
        operating: money(arrears.operating),
        vehicle: money(arrears.vehicle),
        household: money(arrears.household),
      },
      totalArrears: money(career.totalArrears ?? (money(arrears.operating) + money(arrears.vehicle) + money(arrears.household))),
      vehicleOutstanding: money(career.vehicleOutstanding),
      lifetimeGrossCareerIncome: money(totals.gross),
      lifetimePaidCosts: money(totals.paidExpenses),
      lastRunSettlement: shiftMatchesDay ? {
        mode: text(lifeShift.mode, 24),
        gross: money(lifeShift.gross),
        totalDue: money(lifeShift.totalDue),
        totalPaid: money(lifeShift.totalPaid),
        netAfterPaidCosts: finite(lifeShift.netAfterPaidCosts),
        walletAfterExpenses: money(lifeShift.walletAfterExpenses),
      } : null,
    },
    financialEffectsApplied: false,
    note: 'This statement records the closing position only. Existing per-shift settlement has already applied its charges; this report does not charge the wallet again.',
  };
  report.work.completedTrips = Math.min(report.work.completedTrips, Math.max(report.work.completedTrips, report.work.boardings));
  return report;
}

export class KanoNorthernDriverDaySettlementLedger {
  constructor({ storage = globalThis.localStorage ?? null, storageKey = 'kano-life-day-settlement-ledger-v1', now = () => Date.now() } = {}) {
    this.storage = storage;
    this.storageKey = storageKey;
    this.now = now;
    this.state = { version: 1, reports: [] };
    this.load();
  }
  load() {
    try {
      const parsed = JSON.parse(this.storage?.getItem(this.storageKey) || 'null');
      if (!parsed || parsed.version !== 1 || !Array.isArray(parsed.reports)) return false;
      const seen = new Set();
      this.state.reports = parsed.reports.filter(row => row && Number.isFinite(Number(row.day)) && !seen.has(safeDay(row.day)) && seen.add(safeDay(row.day)))
        .map(row => clone(row)).sort((a, b) => Number(a.day) - Number(b.day)).slice(-60);
      return true;
    } catch { this.state = { version: 1, reports: [] }; return false; }
  }
  save() {
    try { this.storage?.setItem(this.storageKey, JSON.stringify(this.state)); return Boolean(this.storage); }
    catch { return false; }
  }
  closeDay(input = {}) {
    const day = safeDay(input.day);
    const existing = this.state.reports.find(row => safeDay(row.day) === day);
    if (existing) return { ok: false, reason: 'already_closed', report: clone(existing) };
    const report = buildDaySettlement({ ...input, day, closedAt: input.closedAt || new Date(this.now()).toISOString() });
    this.state.reports.push(report);
    this.state.reports.sort((a, b) => Number(a.day) - Number(b.day));
    if (this.state.reports.length > 60) this.state.reports.splice(0, this.state.reports.length - 60);
    if (!this.save()) {
      this.state.reports = this.state.reports.filter(row => safeDay(row.day) !== day);
      return { ok: false, reason: 'storage_unavailable' };
    }
    return { ok: true, report: clone(report) };
  }
  getReport(day) {
    const report = this.state.reports.find(row => safeDay(row.day) === safeDay(day));
    return report ? clone(report) : null;
  }
  getSnapshot() {
    const reports = this.state.reports.slice().sort((a, b) => Number(b.day) - Number(a.day));
    return { version: 1, count: reports.length, latest: reports[0] ? clone(reports[0]) : null, reports: reports.slice(0, 10).map(clone) };
  }
  exportReport(day = null) {
    const report = day == null ? this.getSnapshot().latest : this.getReport(day);
    return report ? JSON.stringify(report, null, 2) : '';
  }
}

export default KanoNorthernDriverDaySettlementLedger;
