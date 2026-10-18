const STORAGE_KEY = 'kano-life-save-v4';

const freshSave = () => ({
  money: 1200,
  highScore: 0,
  routeId: 'route-1',
  driverId: 'ruffneck',
  paint: '#f5c542',
  radioIndex: 0,
  dialect: 'hausa',
  camera: 'chase',
  roadMode: 'oneway',
  muted: false,
  unlocks: ['ruffneck', 'baba', 'mama', 'uztaz'],
  lastRuns: [],
  tribes: { hausa: [], yoruba: [], igbo: [] },
  achievements: [],
  tribeSubmits: 0,
  goldTimes: 0,
  daily: { date: '', streak: 0, claimed: false },
  bestTimes: {},
  settings: { quality: 'auto', shake: true },
});

function todayInWAT(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Africa/Lagos',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const fields = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${fields.year}-${fields.month}-${fields.day}`;
}

function normaliseSave(parsed = {}) {
  const defaults = freshSave();
  return {
    ...defaults,
    ...parsed,
    money: Number.isFinite(parsed.money) ? Math.max(0, parsed.money) : defaults.money,
    highScore: Number.isFinite(parsed.highScore) ? Math.max(0, parsed.highScore) : 0,
    unlocks: Array.isArray(parsed.unlocks) ? parsed.unlocks : defaults.unlocks,
    lastRuns: Array.isArray(parsed.lastRuns) ? parsed.lastRuns.slice(0, 20) : [],
    achievements: Array.isArray(parsed.achievements) ? parsed.achievements : [],
    tribes: {
      hausa: Array.isArray(parsed.tribes?.hausa) ? parsed.tribes.hausa.slice(0, 3) : [],
      yoruba: Array.isArray(parsed.tribes?.yoruba) ? parsed.tribes.yoruba.slice(0, 3) : [],
      igbo: Array.isArray(parsed.tribes?.igbo) ? parsed.tribes.igbo.slice(0, 3) : [],
    },
    daily: { ...defaults.daily, ...(parsed.daily && typeof parsed.daily === 'object' ? parsed.daily : {}) },
    bestTimes: parsed.bestTimes && typeof parsed.bestTimes === 'object' ? parsed.bestTimes : {},
    settings: { ...defaults.settings, ...(parsed.settings && typeof parsed.settings === 'object' ? parsed.settings : {}) },
  };
}

export function loadSave() {
  try {
    const raw = globalThis.localStorage?.getItem(STORAGE_KEY);
    if (!raw) return freshSave();
    return normaliseSave(JSON.parse(raw));
  } catch (error) {
    console.warn('[Storage] existing save could not be read; using a fresh save', error);
    return freshSave();
  }
}

export const save = loadSave();

export function persist() {
  try {
    globalThis.localStorage?.setItem(STORAGE_KEY, JSON.stringify(save));
    return true;
  } catch (error) {
    console.warn('[Storage] save failed; current run remains playable', error);
    return false;
  }
}

export function bankRun(run) {
  const fareBank = Math.floor(Math.max(0, run.fares || 0) * 0.2);
  const scoreBank = Math.floor(Math.max(0, run.score || 0) * 0.08);
  const earned = Math.max(0, fareBank + scoreBank);
  save.money = (save.money || 0) + earned;
  save.highScore = Math.max(save.highScore || 0, run.score || 0);
  save.lastRuns = [{
    score: Math.floor(run.score || 0),
    distance: Number((run.distance || 0).toFixed(3)),
    driver: run.driver || 'Ruffneck',
    mode: run.mode || 'career',
    date: new Date().toISOString(),
  }, ...(save.lastRuns || [])].slice(0, 20);
  persist();
  return earned;
}

export function submitTribe(run, dialect = 'hausa') {
  const validDialect = ['hausa', 'yoruba', 'igbo'].includes(dialect) ? dialect : 'hausa';
  const board = [...(save.tribes[validDialect] || [])];
  board.push({
    score: Math.max(0, Math.floor(run.score || 0)),
    distance: Number((run.distance || 0).toFixed(3)),
    driver: run.driver || 'Ruffneck',
    mode: run.mode || 'career',
    date: Date.now(),
  });
  save.tribes[validDialect] = board.sort((a, b) => b.score - a.score).slice(0, 3);
  persist();
  return save.tribes[validDialect];
}

export function tribeStanding() {
  return Object.entries(save.tribes).map(([tribe, scores]) => ({
    tribe,
    total: (scores || []).reduce((total, entry) => total + (entry.score || 0), 0),
    scores: scores || [],
  })).sort((a, b) => b.total - a.total);
}

export function claimDaily() {
  const today = todayInWAT();
  if (save.daily.date === today && save.daily.claimed) {
    return { ok: false, message: 'Daily reward already claimed.' };
  }
  const yesterday = todayInWAT(new Date(Date.now() - 24 * 60 * 60 * 1000));
  save.daily.streak = save.daily.date === yesterday ? (save.daily.streak || 0) + 1 : 1;
  save.daily.date = today;
  save.daily.claimed = true;
  const reward = 500 + Math.min(save.daily.streak, 7) * 100;
  save.money = (save.money || 0) + reward;
  persist();
  return { ok: true, reward, streak: save.daily.streak };
}

export function updateBestTime(routeId, seconds) {
  if (!routeId || !Number.isFinite(seconds) || seconds <= 0) return false;
  const old = save.bestTimes[routeId];
  if (old == null || seconds < old) {
    save.bestTimes[routeId] = Number(seconds.toFixed(2));
    persist();
    return true;
  }
  return false;
}

export function unlockAchievement(id) {
  if (!id || save.achievements.includes(id)) return false;
  save.achievements.push(id);
  persist();
  return true;
}
