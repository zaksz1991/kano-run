/** Vehicle ownership, hire-purchase, remittance and shared-shift accounting. */
const safeMoney = value => Math.max(0, Math.round(Number(value) || 0));

export class KanoVehicleOwnership {
  constructor(options = {}) {
    this.contracts = new Map();
    this.onEvent = options.onEvent || (() => {});
  }

  createContract(input = {}) {
    const id = input.id || `contract-${Date.now().toString(36)}-${Math.floor(Math.random()*1e6).toString(36)}`;
    if (this.contracts.has(id)) throw new Error(`Contract already exists: ${id}`);
    const type = ['owner_driver', 'hire_purchase', 'weekly_remittance', 'monthly_remittance', 'shared_shift'].includes(input.type) ? input.type : 'owner_driver';
    const contract = {
      id, vehicleId: String(input.vehicleId || ''), driverId: String(input.driverId || ''), ownerId: input.ownerId ? String(input.ownerId) : null,
      type, currency: input.currency || 'NGN', purchasePrice: safeMoney(input.purchasePrice), deposit: safeMoney(input.deposit), balance: safeMoney(input.balance ?? Math.max(0, safeMoney(input.purchasePrice) - safeMoney(input.deposit))),
      paymentAmount: safeMoney(input.paymentAmount), period: type === 'monthly_remittance' ? 'monthly' : type === 'weekly_remittance' || type === 'hire_purchase' ? (input.period || 'weekly') : 'none',
      dueDay: Number.isInteger(input.dueDay) ? input.dueDay : 7, arrears: 0, totalPaid: safeMoney(input.deposit), active: true,
      shifts: Array.isArray(input.shifts) ? input.shifts.map(s => ({ ...s })) : [], history: [],
    };
    if (!contract.vehicleId || !contract.driverId) throw new Error('vehicleId and driverId are required');
    this.contracts.set(id, contract);
    this.onEvent({ type: 'ownership_contract_created', contractId: id, contractType: type });
    return contract;
  }

  recordEarnings(contractId, gross, expenses = 0) {
    const c = this.require(contractId); const net = Math.max(0, safeMoney(gross) - safeMoney(expenses));
    c.history.push({ type: 'shift_earnings', gross: safeMoney(gross), expenses: safeMoney(expenses), net, at: Date.now() });
    return { gross: safeMoney(gross), expenses: safeMoney(expenses), net, remittanceDue: c.type === 'owner_driver' ? 0 : c.paymentAmount, takeHomeBeforeRemittance: net };
  }

  makePayment(contractId, amount, day = 1) {
    const c = this.require(contractId); const paid = safeMoney(amount);
    if (!c.active) throw new Error('Contract is inactive');
    if (c.type === 'owner_driver') return { accepted: false, reason: 'Vehicle is owned outright by the driver.' };
    if (paid <= 0) return { accepted: false, reason: 'Payment must be greater than zero.' };
    const applied = c.type === 'hire_purchase' ? Math.min(paid, c.balance) : paid;
    if (c.type === 'hire_purchase') c.balance = Math.max(0, c.balance - applied);
    c.totalPaid += applied; c.arrears = Math.max(0, c.arrears + c.paymentAmount - paid);
    const record = { type: 'payment', paid: applied, day: Number(day) || 1, balance: c.balance, arrears: c.arrears, at: Date.now() };
    c.history.push(record);
    if (c.type === 'hire_purchase' && c.balance === 0) { c.active = false; this.onEvent({ type: 'vehicle_ownership_transferred', contractId: c.id, vehicleId: c.vehicleId, driverId: c.driverId }); }
    else if (c.arrears > 0) this.onEvent({ type: 'payment_shortfall', contractId: c.id, arrears: c.arrears });
    return { accepted: true, ...record, ownershipTransferred: c.type === 'hire_purchase' && c.balance === 0 };
  }

  setSharedShifts(contractId, shifts) {
    const c = this.require(contractId);
    if (c.type !== 'shared_shift') throw new Error('Contract is not a shared-shift arrangement');
    c.shifts = (Array.isArray(shifts) ? shifts : []).map(s => ({ driverId: String(s.driverId || ''), startMinute: Math.max(0, Math.min(1439, Number(s.startMinute) || 0)), endMinute: Math.max(0, Math.min(1439, Number(s.endMinute) || 0)) }));
    return c.shifts;
  }

  driverForMinute(contractId, minuteOfDay) {
    const c = this.require(contractId); const minute = Math.max(0, Math.min(1439, Number(minuteOfDay) || 0));
    if (c.type !== 'shared_shift') return c.driverId;
    const shift = c.shifts.find(s => s.startMinute <= s.endMinute ? minute >= s.startMinute && minute < s.endMinute : minute >= s.startMinute || minute < s.endMinute);
    return shift?.driverId || null;
  }

  snapshot(contractId) { const c = this.require(contractId); return JSON.parse(JSON.stringify(c)); }
  require(id) { const c = this.contracts.get(id); if (!c) throw new Error(`Unknown contract: ${id}`); return c; }
}
