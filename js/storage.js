import { ROUTES, DRIVERS, RADIO, PAINTS } from './config.js';

const STORAGE_KEY = 'kano-life-save-v4';

const freshSave = () => ({
  money: 1200,
  highScore: 0,
  routeId: 'route-1',
  driverId: 'ruffneck',
  paint: '#f5c542',
  paintId: 'gold',
  unlockedPaints: ['gold'],
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
  daily: { date: '', streak: 0, claimed: false, missionDate: '', missionIds: [], progress: {}, claimedMissions: [] },
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

export function normaliseSave(parsed = {}) {
  const defaults = freshSave();
  const input = parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  const validDriverIds = new Set(DRIVERS.map((item) => item.id));
  const validPaintIds = new Set(PAINTS.map((item) => item.id));
  const validRouteIds = new Set(ROUTES.map((item) => item.id));
  const safeArray = (value, allowed) => Array.isArray(value)
    ? [...new Set(value.filter((entry) => typeof entry === 'string' && allowed.has(entry)))]
    : null;
  const safeScores = (value) => Array.isArray(value)
    ? value.filter((entry) => entry && typeof entry === 'object' && Number.isFinite(entry.score) && entry.score >= 0)
      .map((entry) => ({
        score: Math.floor(entry.score),
        distance: Number.isFinite(entry.distance) && entry.distance >= 0 ? Number(entry.distance.toFixed(3)) : 0,
        driver: typeof entry.driver === 'string' ? entry.driver.slice(0, 60) : 'Ruffneck',
        mode: typeof entry.mode === 'string' ? entry.mode.slice(0, 30) : 'career',
        date: Number.isFinite(entry.date) ? entry.date : Date.now(),
      }))
      .sort((a, b) => b.score - a.score)
      .slice(0, 3)
    : [];
  const settingsInput = input.settings && typeof input.settings === 'object' && !Array.isArray(input.settings)
    ? input.settings : {};
  const dailyInput = input.daily && typeof input.daily === 'object' && !Array.isArray(input.daily)
    ? input.daily : {};
  const dailyProgress = dailyInput.progress && typeof dailyInput.progress === 'object' && !Array.isArray(dailyInput.progress)
    ? Object.fromEntries(Object.entries(dailyInput.progress)
      .filter(([, value]) => Number.isFinite(value) && value >= 0)
      .map(([key, value]) => [key.slice(0, 100), value]))
    : {};
  const unlockedDrivers = safeArray(input.unlocks, validDriverIds) || [...defaults.unlocks];
  if (!unlockedDrivers.includes('ruffneck')) unlockedDrivers.unshift('ruffneck');
  const unlockedPaints = safeArray(input.unlockedPaints, validPaintIds) || [...defaults.unlockedPaints];
  if (!unlockedPaints.includes('gold')) unlockedPaints.unshift('gold');
  const requestedPaint = typeof input.paint === 'string' && /^#[0-9a-f]{6}$/i.test(input.paint)
    ? input.paint : defaults.paint;
  const matchingPaint = PAINTS.find((item) => item.color.toLowerCase() === requestedPaint.toLowerCase());
  const requestedPaintId = validPaintIds.has(input.paintId) ? input.paintId : matchingPaint?.id || 'gold';
  const validPaintId = unlockedPaints.includes(requestedPaintId)
    ? requestedPaintId
    : matchingPaint && unlockedPaints.includes(matchingPaint.id) ? matchingPaint.id : 'gold';
  const validPaint = PAINTS.find((item) => item.id === validPaintId) || PAINTS[0];
  const validLastRuns = Array.isArray(input.lastRuns)
    ? input.lastRuns.filter((entry) => entry && typeof entry === 'object' && Number.isFinite(entry.score) && entry.score >= 0)
      .slice(0, 20)
      .map((entry) => ({
        score: Math.floor(entry.score),
        distance: Number.isFinite(entry.distance) && entry.distance >= 0 ? Number(entry.distance.toFixed(3)) : 0,
        driver: typeof entry.driver === 'string' ? entry.driver.slice(0, 60) : 'Ruffneck',
        mode: typeof entry.mode === 'string' ? entry.mode.slice(0, 30) : 'career',
        date: typeof entry.date === 'string' ? entry.date.slice(0, 40) : new Date().toISOString(),
      }))
    : [];
  const bestTimes = input.bestTimes && typeof input.bestTimes === 'object' && !Array.isArray(input.bestTimes)
    ? Object.fromEntries(Object.entries(input.bestTimes)
      .filter(([id, value]) => validRouteIds.has(id) && Number.isFinite(value) && value > 0 && value < 86400)
      .map(([id, value]) => [id, Number(value.toFixed(2))]))
    : {};
  const tribesInput = input.tribes && typeof input.tribes === 'object' && !Array.isArray(input.tribes)
    ? input.tribes : {};
  const selectedRadio = Number.isFinite(input.radioIndex) ? Math.floor(input.radioIndex) : defaults.radioIndex;
  const selectedDialect = ['hausa', 'yoruba', 'igbo'].includes(input.dialect) ? input.dialect : defaults.dialect;
  const selectedRoute = validRouteIds.has(input.routeId) ? input.routeId : defaults.routeId;
  const selectedDriver = validDriverIds.has(input.driverId) && unlockedDrivers.includes(input.driverId)
    ? input.driverId : unlockedDrivers[0] || 'ruffneck';
  const dailyIds = Array.isArray(dailyInput.missionIds)
    ? [...new Set(dailyInput.missionIds.filter((id) => typeof id === 'string'))].slice(0, 3)
    : [];
  const claimedMissions = Array.isArray(dailyInput.claimedMissions)
    ? [...new Set(dailyInput.claimedMissions.filter((id) => typeof id === 'string'))].slice(0, 100)
    : [];
  const achievements = Array.isArray(input.achievements)
    ? [...new Set(input.achievements.filter((id) => typeof id === 'string'))].slice(0, 500)
    : [];

  return {
    ...defaults,
    ...input,
    money: Number.isFinite(input.money) ? Math.max(0, Math.floor(input.money)) : defaults.money,
    highScore: Number.isFinite(input.highScore) ? Math.max(0, Math.floor(input.highScore)) : 0,
    routeId: selectedRoute,
    driverId: selectedDriver,
    paint: validPaint.color,
    paintId: validPaintId,
    unlockedPaints,
    radioIndex: ((selectedRadio % RADIO.length) + RADIO.length) % RADIO.length,
    dialect: selectedDialect,
    camera: ['chase', 'driver'].includes(input.camera) ? input.camera : defaults.camera,
    roadMode: ['oneway', 'twoway'].includes(input.roadMode) ? input.roadMode : defaults.roadMode,
    muted: typeof input.muted === 'boolean' ? input.muted : defaults.muted,
    unlocks: unlockedDrivers,
    lastRuns: validLastRuns,
    achievements,
    tribeSubmits: Number.isFinite(input.tribeSubmits) ? Math.max(0, Math.floor(input.tribeSubmits)) : 0,
    goldTimes: Number.isFinite(input.goldTimes) ? Math.max(0, Math.floor(input.goldTimes)) : 0,
    tribes: {
      hausa: safeScores(tribesInput.hausa),
      yoruba: safeScores(tribesInput.yoruba),
      igbo: safeScores(tribesInput.igbo),
    },
    daily: {
      ...defaults.daily,
      ...dailyInput,
      date: typeof dailyInput.date === 'string' ? dailyInput.date.slice(0, 10) : '',
      streak: Number.isFinite(dailyInput.streak) ? Math.max(0, Math.floor(dailyInput.streak)) : 0,
      claimed: typeof dailyInput.claimed === 'boolean' ? dailyInput.claimed : false,
      missionDate: typeof dailyInput.missionDate === 'string' ? dailyInput.missionDate.slice(0, 10) : '',
      missionIds: dailyIds,
      progress: dailyProgress,
      claimedMissions,
    },
    bestTimes,
    settings: {
      quality: ['auto', '2d', '3d'].includes(settingsInput.quality) ? settingsInput.quality : defaults.settings.quality,
      shake: typeof settingsInput.shake === 'boolean' ? settingsInput.shake : defaults.settings.shake,
    },
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

export function dailyLoginStatus() {
  const today = todayInWAT();
  const claimed = save.daily.date === today && Boolean(save.daily.claimed);
  const yesterday = todayInWAT(new Date(Date.now() - 24 * 60 * 60 * 1000));
  const nextStreak = save.daily.date === yesterday ? (save.daily.streak || 0) + 1 : 1;
  const rewardStreak = claimed ? (save.daily.streak || 1) : nextStreak;
  return { claimed, streak: save.daily.streak || 0, reward: 500 + Math.min(rewardStreak, 7) * 100 };
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


export function getDailyMissions(pool) {
  const today = todayInWAT();
  const available = Array.isArray(pool) ? pool : [];
  if (save.daily.missionDate !== today || !Array.isArray(save.daily.missionIds)) {
    save.daily.missionDate = today;
    save.daily.missionIds = [...available]
      .sort(() => Math.random() - 0.5)
      .slice(0, Math.min(3, available.length))
      .map((mission) => mission.id);
    save.daily.progress = {};
    save.daily.claimedMissions = [];
    persist();
  }
  const byId = new Map(available.map((mission) => [mission.id, mission]));
  return save.daily.missionIds.map((id) => {
    const mission = byId.get(id);
    if (!mission) return null;
    const progress = Math.min(mission.target, Math.max(0, Number(save.daily.progress[id]) || 0));
    const claimed = save.daily.claimedMissions.includes(id);
    return { ...mission, progress, ready: progress >= mission.target, claimed, claimable: progress >= mission.target && !claimed };
  }).filter(Boolean);
}

export function addDailyMissionProgress(key, amount, pool) {
  if (!Number.isFinite(amount) || amount <= 0) return [];
  const missions = getDailyMissions(pool);
  const newlyReady = [];
  let changed = false;
  for (const mission of missions) {
    if (mission.key !== key || mission.claimed) continue;
    const current = Math.max(0, Number(save.daily.progress[mission.id]) || 0);
    const nextValue = ['combo', 'streak'].includes(key) ? Math.max(current, amount) : current + amount;
    const next = Math.min(mission.target, nextValue);
    if (next <= current) continue;
    save.daily.progress[mission.id] = next;
    changed = true;
    if (current < mission.target && next >= mission.target) newlyReady.push({ ...mission, progress: next, ready: true, claimable: true });
  }
  if (changed) persist();
  return newlyReady;
}

export function claimDailyMission(id, pool) {
  const mission = getDailyMissions(pool).find((item) => item.id === id);
  if (!mission) return { ok: false, message: 'Daily mission not found.' };
  if (mission.claimed) return { ok: false, message: 'Daily mission reward already claimed.' };
  if (!mission.ready) return { ok: false, message: 'Complete the mission before claiming its reward.' };
  save.daily.claimedMissions.push(id);
  save.money = Math.max(0, Number(save.money) || 0) + Math.max(0, Math.floor(mission.reward || 0));
  persist();
  return { ok: true, message: `Daily mission claimed: +₦${mission.reward.toLocaleString()}.`, reward: mission.reward, missionId: id };
}
