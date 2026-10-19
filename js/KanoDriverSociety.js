/** Persistent NPC driver identities and personality-weighted behaviour. */
const clamp = (n, a, b) => Math.max(a, Math.min(b, n));
const TRAITS = ['professional', 'friendly', 'impatient', 'reckless', 'thrifty', 'social', 'mechanically_skilled', 'inexperienced'];
const NAMES = ['Musa', 'Sani', 'Ibrahim', 'Kabiru', 'Auwalu', 'Bashir', 'Nura', 'Abubakar', 'Amina', 'Hadiza'];
const hashSeed = value => { let h = 2166136261; for (const c of String(value)) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); } return h >>> 0; };
const seeded = seed => { let s = seed >>> 0; return () => { s += 0x6D2B79F5; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; };

export class KanoDriverSociety {
  constructor(options = {}) {
    this.storage = options.storage || (typeof localStorage !== 'undefined' ? localStorage : null);
    this.storageKey = options.storageKey || 'kano-life-driver-society-v1';
    this.drivers = new Map();
    this.load();
  }

  createDriver(options = {}) {
    const id = options.id || `driver-${Date.now().toString(36)}-${Math.floor(Math.random()*1e6).toString(36)}`;
    if (this.drivers.has(id)) return this.drivers.get(id);
    const rng = seeded(hashSeed(id));
    const trait = options.trait || TRAITS[Math.floor(rng() * TRAITS.length)];
    const driver = {
      id, name: options.name || NAMES[Math.floor(rng() * NAMES.length)], trait,
      respect: clamp(options.respect ?? 50, 0, 100), reputation: clamp(options.reputation ?? 50, 0, 100),
      cash: Math.max(0, Number(options.cash ?? 2500)), fatigue: clamp(options.fatigue ?? 10, 0, 100),
      vehicleId: options.vehicleId || null, relationshipIds: Array.isArray(options.relationshipIds) ? [...options.relationshipIds] : [],
      trips: Math.max(0, Number(options.trips || 0)), incidents: Math.max(0, Number(options.incidents || 0)),
      style: options.style || this.styleForTrait(trait), lastSeenDay: Number(options.lastSeenDay || 1),
    };
    this.drivers.set(id, driver);
    return driver;
  }

  styleForTrait(trait) {
    return ({ professional: 'steady', friendly: 'courteous', impatient: 'assertive', reckless: 'aggressive', thrifty: 'cautious', social: 'expressive', mechanically_skilled: 'smooth', inexperienced: 'hesitant' })[trait] || 'mixed';
  }

  behaviourFor(id, context = {}) {
    const d = this.drivers.get(id);
    if (!d) return null;
    const risk = ({ reckless: 0.8, impatient: 0.55, inexperienced: 0.4, professional: 0.15, thrifty: 0.18, mechanically_skilled: 0.2, friendly: 0.22, social: 0.35 })[d.trait] ?? 0.3;
    return {
      driverId: id, drivingRisk: clamp(risk + (d.fatigue / 100) * 0.2 + (context.rushing ? 0.15 : 0), 0, 1),
      patience: clamp(1 - risk + (d.reputation - 50) / 250, 0, 1),
      honkChance: clamp(0.05 + risk * 0.35 + (context.crowded ? 0.15 : 0), 0, 0.8),
      acceptsFare: clamp(0.55 + (d.cash < 1000 ? 0.15 : 0) + (d.reputation - 50) / 200, 0.1, 0.95),
      preferredStyle: d.style,
    };
  }

  recordOutcome(id, outcome = {}) {
    const d = this.drivers.get(id); if (!d) return null;
    if (outcome.trip) d.trips += 1;
    if (Number.isFinite(outcome.cashDelta)) d.cash = Math.max(0, d.cash + outcome.cashDelta);
    if (Number.isFinite(outcome.reputationDelta)) d.reputation = clamp(d.reputation + outcome.reputationDelta, 0, 100);
    if (Number.isFinite(outcome.respectDelta)) d.respect = clamp(d.respect + outcome.respectDelta, 0, 100);
    if (Number.isFinite(outcome.fatigueDelta)) d.fatigue = clamp(d.fatigue + outcome.fatigueDelta, 0, 100);
    if (outcome.incident) d.incidents += 1;
    return d;
  }

  get(id) { return this.drivers.get(id) || null; }
  list() { return [...this.drivers.values()]; }
  save() { try { this.storage?.setItem(this.storageKey, JSON.stringify(this.list())); return Boolean(this.storage); } catch { return false; } }
  load() { try { const raw = this.storage?.getItem(this.storageKey); if (!raw) return; const list = JSON.parse(raw); if (Array.isArray(list)) for (const d of list) if (d?.id) this.drivers.set(d.id, d); } catch { /* corrupted save is ignored safely */ } }
}
