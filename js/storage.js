/**
 * Kano Run — resilient local storage adapter.
 * Game Developer: Hassan Zakariya
 * Keeps the existing localStorage keys used by Kano Run and safely handles
 * private browsing, malformed JSON, and storage quota errors.
 */
const PREFIX = '';
const DEFAULTS = Object.freeze({
  kanoMoney: 0,
  kanoHigh: 0,
  kanoPaint: 'classic',
  kanoCap: 3,
  kanoSpeed: 0,
  kanoHorn: 0,
  kanoRoute: 'citycenter',
  kanoDriver: 'ruffneck',
  kanoRadio: 0,
  kanoMuted: false,
  kanoSeenTutorial: false
});

function readRaw(key) {
  try {
    if (typeof localStorage === 'undefined') return null;
    return localStorage.getItem(`${PREFIX}${key}`);
  } catch {
    return null;
  }
}

function parse(raw, fallback = null) {
  if (raw == null) return fallback;
  try { return JSON.parse(raw); } catch { return raw; }
}

function writeRaw(key, value) {
  try {
    if (typeof localStorage === 'undefined') return false;
    localStorage.setItem(`${PREFIX}${key}`, typeof value === 'string' ? value : JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

function numberValue(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

export const Storage = {
  get(key, fallback = null) {
    const raw = readRaw(key);
    return raw == null ? (Object.prototype.hasOwnProperty.call(DEFAULTS, key) ? DEFAULTS[key] : fallback) : parse(raw, fallback);
  },
  set(key, value) { return writeRaw(key, value); },
  remove(key) {
    try { if (typeof localStorage !== 'undefined') localStorage.removeItem(key); return true; }
    catch { return false; }
  },
  clear() {
    try {
      if (typeof localStorage === 'undefined') return false;
      for (const key of Object.keys(DEFAULTS)) localStorage.removeItem(key);
      return true;
    } catch { return false; }
  },
  load(key, fallback = null) { return this.get(key, fallback); },
  save(key, value) { return this.set(key, value); },
  getMoney() { return Math.max(0, numberValue(this.get('kanoMoney', 0), 0)); },
  setMoney(value) { return this.set('kanoMoney', Math.max(0, Math.floor(numberValue(value, 0)))); },
  addMoney(value) { const total = this.getMoney() + numberValue(value, 0); this.setMoney(total); return this.getMoney(); },
  getHighScore() { return Math.max(0, numberValue(this.get('kanoHigh', 0), 0)); },
  setHighScore(value) { return this.set('kanoHigh', Math.max(this.getHighScore(), Math.floor(numberValue(value, 0)))); },
  getPaint() { return String(this.get('kanoPaint', 'classic') || 'classic'); },
  setPaint(value) { return this.set('kanoPaint', String(value || 'classic')); },
  getRoute() { return String(this.get('kanoRoute', 'citycenter') || 'citycenter'); },
  setRoute(value) { return this.set('kanoRoute', String(value || 'citycenter')); },
  getDriver() { return String(this.get('kanoDriver', 'ruffneck') || 'ruffneck'); },
  setDriver(value) { return this.set('kanoDriver', String(value || 'ruffneck')); },
  getRadio() { return Math.max(0, Math.floor(numberValue(this.get('kanoRadio', 0), 0))); },
  setRadio(value) { return this.set('kanoRadio', Math.max(0, Math.floor(numberValue(value, 0)))); },
  getMuted() { return Boolean(this.get('kanoMuted', false)); },
  setMuted(value) { return this.set('kanoMuted', Boolean(value)); },
  setSeenTutorial() { return this.set('kanoSeenTutorial', true); },
  hasSeenTutorial() { return Boolean(this.get('kanoSeenTutorial', false)); },
  getUpgrade(key, fallback = 0) { return Math.max(0, numberValue(this.get(key, fallback), fallback)); },
  setUpgrade(key, value) { return this.set(key, Math.max(0, numberValue(value, 0))); },
  getPaints() { return this.get('kanoUnlockedPaints', ['classic']) || ['classic']; },
  setPaints(value) { return this.set('kanoUnlockedPaints', Array.isArray(value) ? value : ['classic']); }
};

export default Storage;
