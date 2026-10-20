import { ROUTES, DRIVERS, RADIO, PAINTS } from './config.js';

// Keep the established save key so existing player wallets and progress survive.
const STORAGE_KEY = 'kano-life-save-v4';
const MAX_BANKING_TRANSACTIONS = 50;

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
  daily: {
    date: '', streak: 0, claimed: false, missionDate: '',
    missionIds: [], progress: {}, claimedMissions: [],
  },
  bestTimes: {},
  settings: { quality: 'auto', shake: true },
  // Audit trail for banked cash. Existing saves acquire this safely on load.
  banking: { totalEarned: 0, transactions: [] },
  // Recoverable in-progress run. Current-run fares are NOT part of banked money.
  activeRunCheckpoint: null,
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

const nonNegativeInteger = (value, fallback = 0) =>
  Number.isFinite(value) ? Math.max(0, Math.floor(value)) : fallback;

function normalizeBanking(value, fallback) {
  const input = value && typeof value === 'object' && !Array.isArray(value)
    ? value
    : {};
  const transactions = Array.isArray(input.transactions)
    ? input.transactions
      .filter((entry) => entry && typeof entry === 'object'
        && Number.isFinite(entry.earned) && entry.earned >= 0)
      .slice(-MAX_BANKING_TRANSACTIONS)
      .map((entry) => ({
        id: typeof entry.id === 'string' ? entry.id.slice(0, 100) : '',
        earned: nonNegativeInteger(entry.earned),
        fares: nonNegativeInteger(entry.fares),
        score: nonNegativeInteger(entry.score),
        mode: typeof entry.mode === 'string' ? entry.mode.slice(0, 30) : 'career',
        timestamp: Number.isFinite(entry.timestamp) ? entry.timestamp : Date.now(),
      }))
    : [...fallback.transactions];

  return {
    totalEarned: nonNegativeInteger(input.totalEarned, fallback.totalEarned),
    transactions,
  };
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
    ? value.filter((entry) => entry && typeof entry === 'object'
      && Number.isFinite(entry.score) && entry.score >= 0)
      .map((entry) => ({
        score: Math.floor(entry.score),
        distance: Number.isFinite(entry.distance) && entry.distance >= 0
          ? Number(entry.distance.toFixed(3)) : 0,
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
  const dailyProgress = dailyInput.progress && typeof dailyInput.progress === 'object'
    && !Array.isArray(dailyInput.progress)
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
    ? input.lastRuns.filter((entry) => entry && typeof entry === 'object'
      && Number.isFinite(entry.score) && entry.score >= 0)
      .slice(0, 20)
      .map((entry) => ({
        score: Math.floor(entry.score),
        distance: Number.isFinite(entry.distance) && entry.distance >= 0
          ? Number(entry.distance.toFixed(3)) : 0,
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

  // Validate and safely retain a small JSON snapshot so a page refresh does
  // not erase an unfinished run. Expired/corrupt checkpoints are ignored.
  let activeRunCheckpoint = null;
  const checkpointInput = input.activeRunCheckpoint;
  if (checkpointInput && typeof checkpointInput === 'object' && !Array.isArray(checkpointInput)) {
    try {
      const savedAt = Number(checkpointInput.savedAt);
      const stateInput = checkpointInput.state;
      const age = Date.now() - savedAt;
      const allowedModes = new Set(['career', 'timeAttack', 'fuel', 'matchDrop', 'potholes', 'freeRoam']);
      if (
        checkpointInput.version === 1 &&
        typeof checkpointInput.runId === 'string' && checkpointInput.runId.length <= 120 &&
        Number.isFinite(savedAt) && savedAt <= Date.now() + 5 * 60 * 1000 &&
        age <= 14 * 24 * 60 * 60 * 1000 && age >= -5 * 60 * 1000 &&
        stateInput && typeof stateInput === 'object' && !Array.isArray(stateInput) &&
        Number.isFinite(Number(stateInput.score)) && Number(stateInput.score) >= 0 &&
        allowedModes.has(checkpointInput.mode)
      ) {
        const state = JSON.parse(JSON.stringify(stateInput));
        // Guard against malformed oversized storage payloads.
        if (JSON.stringify(state).length <= 600000) {
          const challengeState = checkpointInput.tribeChallenges && typeof checkpointInput.tribeChallenges === 'object'
            && !Array.isArray(checkpointInput.tribeChallenges)
            ? JSON.parse(JSON.stringify(checkpointInput.tribeChallenges)) : {};
          activeRunCheckpoint = {
            version: 1,
            runId: checkpointInput.runId,
            savedAt,
            mode: checkpointInput.mode,
            routeId: validRouteIds.has(checkpointInput.routeId) ? checkpointInput.routeId : selectedRoute,
            driverId: validDriverIds.has(checkpointInput.driverId) ? checkpointInput.driverId : selectedDriver,
            dialect: ['hausa', 'yoruba', 'igbo'].includes(checkpointInput.dialect) ? checkpointInput.dialect : selectedDialect,
            gameState: ['PLAY', 'OVER'].includes(checkpointInput.gameState) ? checkpointInput.gameState : 'PLAY',
            softOver: Boolean(checkpointInput.softOver),
            reason: typeof checkpointInput.reason === 'string' ? checkpointInput.reason.slice(0, 180) : '',
            activeTribeChallenge: ['hausa', 'yoruba', 'igbo'].includes(checkpointInput.activeTribeChallenge)
              ? checkpointInput.activeTribeChallenge : null,
            tribeChallenges: challengeState,
            state,
          };
        }
      }
    } catch (error) {
      console.warn('[Storage] Ignoring invalid active-run checkpoint.', error);
    }
  }

  const normalized = {
    ...defaults,
    ...input,
    money: nonNegativeInteger(input.money, defaults.money),
    highScore: nonNegativeInteger(input.highScore, defaults.highScore),
    routeId: selectedRoute,
    driverId: selectedDriver,
    paint: validPaint.color,
    paintId: validPaintId,
    unlockedPaints,
    radioIndex: RADIO.length ? ((selectedRadio % RADIO.length) + RADIO.length) % RADIO.length : 0,
    dialect: selectedDialect,
    camera: ['chase', 'driver'].includes(input.camera) ? input.camera : defaults.camera,
    roadMode: ['oneway', 'twoway'].includes(input.roadMode) ? input.roadMode : defaults.roadMode,
    muted: typeof input.muted === 'boolean' ? input.muted : defaults.muted,
    unlocks: unlockedDrivers,
    lastRuns: validLastRuns,
    achievements,
    tribeSubmits: nonNegativeInteger(input.tribeSubmits),
    goldTimes: nonNegativeInteger(input.goldTimes),
    tribes: {
      hausa: safeScores(tribesInput.hausa),
      yoruba: safeScores(tribesInput.yoruba),
      igbo: safeScores(tribesInput.igbo),
    },
    daily: {
      ...defaults.daily,
      ...dailyInput,
      date: typeof dailyInput.date === 'string' ? dailyInput.date.slice(0, 10) : '',
      streak: nonNegativeInteger(dailyInput.streak),
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
    banking: normalizeBanking(input.banking, defaults.banking),
    activeRunCheckpoint,
  };
  return normalized;
}

export function loadSave() {
  try {
    const storage = globalThis.localStorage;
    if (!storage) return freshSave();
    const raw = storage.getItem(STORAGE_KEY);
    if (!raw) return freshSave();
    return normaliseSave(JSON.parse(raw));
  } catch (error) {
    console.warn('[Storage] Existing save could not be read; using an in-memory save.', error);
    return freshSave();
  }
}

export const save = loadSave();

function dispatchWalletUpdate(stored, reason = 'save') {
  const balance = nonNegativeInteger(save.money);
  const formatted = `₦${balance.toLocaleString()}`;

  try {
    if (typeof document !== 'undefined') {
      const wallet = document.getElementById('wallet-balance');
      const garageWallet = document.getElementById('garage-wallet');
      const lifeWallet = document.getElementById('life-wallet');
      if (wallet) wallet.textContent = formatted;
      if (garageWallet) garageWallet.textContent = formatted;
      if (lifeWallet) lifeWallet.textContent = `Banked wallet · ${formatted}`;
      document.querySelectorAll('[data-kano-bank-balance]').forEach((element) => {
        element.textContent = formatted;
      });
    }
    if (typeof window !== 'undefined' && typeof CustomEvent !== 'undefined') {
      window.dispatchEvent(new CustomEvent('kano:wallet-updated', {
        detail: { money: balance, formatted, stored, reason },
      }));
    }
  } catch (error) {
    console.warn('[Storage] Wallet display could not be refreshed.', error);
  }
}

export function persist() {
  try {
    const storage = globalThis.localStorage;
    // Do not report success when localStorage is absent: optional chaining
    // previously allowed a no-op write to be reported as a saved game.
    if (!storage || typeof storage.setItem !== 'function' || typeof storage.getItem !== 'function') {
      dispatchWalletUpdate(false, 'storage-unavailable');
      return false;
    }

    const serialized = JSON.stringify(save);
    storage.setItem(STORAGE_KEY, serialized);
    const verified = storage.getItem(STORAGE_KEY) === serialized;
    dispatchWalletUpdate(verified, verified ? 'save' : 'verification-failed');
    if (!verified) console.warn('[Storage] Save verification failed.');
    return verified;
  } catch (error) {
    console.warn('[Storage] Save failed; this browser session may not retain progress.', error);
    dispatchWalletUpdate(false, 'write-failed');
    return false;
  }
}

function restoreObject(target, snapshot) {
  for (const key of Object.keys(target)) delete target[key];
  Object.assign(target, snapshot);
}

function newTransactionId() {
  try {
    if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  } catch (_) { /* Use the fallback below. */ }
  return `bank-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * Bank the current completed run and persist its balance + transaction entry.
 * Returns the amount successfully banked, preserving the original API.
 */
export function bankRun(run = {}) {
  const score = nonNegativeInteger(run.score);
  const fares = nonNegativeInteger(run.fares);
  const distance = Number.isFinite(run.distance) && run.distance >= 0
    ? Number(run.distance.toFixed(3)) : 0;
  const fareBank = Math.floor(fares * 0.20);
  const scoreBank = Math.floor(score * 0.08);
  const earned = fareBank + scoreBank;
  const before = JSON.parse(JSON.stringify(save));

  save.money = nonNegativeInteger(save.money) + earned;
  save.highScore = Math.max(nonNegativeInteger(save.highScore), score);
  save.lastRuns = [{
    score,
    distance,
    driver: typeof run.driver === 'string' ? run.driver.slice(0, 60) : 'Ruffneck',
    mode: typeof run.mode === 'string' ? run.mode.slice(0, 30) : 'career',
    date: new Date().toISOString(),
  }, ...(Array.isArray(save.lastRuns) ? save.lastRuns : [])].slice(0, 20);

  save.banking ||= { totalEarned: 0, transactions: [] };
  save.banking.totalEarned = nonNegativeInteger(save.banking.totalEarned) + earned;
  save.banking.transactions = [
    {
      id: newTransactionId(),
      earned,
      fares: fareBank,
      score: scoreBank,
      mode: typeof run.mode === 'string' ? run.mode.slice(0, 30) : 'career',
      timestamp: Date.now(),
    },
    ...(Array.isArray(save.banking.transactions) ? save.banking.transactions : []),
  ].slice(0, MAX_BANKING_TRANSACTIONS);

  if (persist()) return earned;

  // If the balance cannot be stored, roll it back rather than pretending that
  // the player has permanently banked cash that will disappear on reload.
  restoreObject(save, before);
  dispatchWalletUpdate(false, 'banking-failed');
  try {
    if (typeof document !== 'undefined') {
      let warning = document.getElementById('kano-bank-save-warning');
      if (!warning) {
        warning = document.createElement('div');
        warning.id = 'kano-bank-save-warning';
        warning.setAttribute('role', 'status');
        warning.style.cssText = 'position:fixed;z-index:99999;left:12px;right:12px;bottom:12px;padding:12px 14px;background:#7f1d1d;color:#fff;border:1px solid #fecaca;border-radius:10px;font:600 14px/1.4 system-ui,sans-serif;box-shadow:0 6px 24px #0005;';
        document.body?.appendChild(warning);
      }
      if (warning) warning.textContent = 'SAVE FAILED: banked money could not be stored by this browser. Your balance was not increased. Check browser storage permissions and available space.';
    }
  } catch (_) { /* The warning is a best-effort visible alert. */ }
  return 0;
}

export function submitTribe(run, dialect = 'hausa') {
  const validDialect = ['hausa', 'yoruba', 'igbo'].includes(dialect) ? dialect : 'hausa';
  const board = [...(save.tribes[validDialect] || [])];
  board.push({
    score: nonNegativeInteger(run.score),
    distance: Number.isFinite(run.distance) && run.distance >= 0 ? Number(run.distance.toFixed(3)) : 0,
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
  const previous = { ...save.daily, progress: { ...save.daily.progress }, missionIds: [...save.daily.missionIds], claimedMissions: [...save.daily.claimedMissions] };
  const oldMoney = save.money;
  const yesterday = todayInWAT(new Date(Date.now() - 24 * 60 * 60 * 1000));
  save.daily.streak = save.daily.date === yesterday ? (save.daily.streak || 0) + 1 : 1;
  save.daily.date = today;
  save.daily.claimed = true;
  const reward = 500 + Math.min(save.daily.streak, 7) * 100;
  save.money = nonNegativeInteger(save.money) + reward;
  if (!persist()) {
    save.daily = previous;
    save.money = oldMoney;
    dispatchWalletUpdate(false, 'daily-reward-failed');
    return { ok: false, message: 'The reward could not be saved. Browser storage is unavailable.' };
  }
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
    if (current < mission.target && next >= mission.target) {
      newlyReady.push({ ...mission, progress: next, ready: true, claimable: true });
    }
  }
  if (changed) persist();
  return newlyReady;
}

export function claimDailyMission(id, pool) {
  const mission = getDailyMissions(pool).find((item) => item.id === id);
  if (!mission) return { ok: false, message: 'Daily mission not found.' };
  if (mission.claimed) return { ok: false, message: 'Daily mission reward already claimed.' };
  if (!mission.ready) return { ok: false, message: 'Complete the mission before claiming its reward.' };

  const wasClaimed = [...save.daily.claimedMissions];
  const oldMoney = save.money;
  save.daily.claimedMissions.push(id);
  const reward = Math.max(0, Math.floor(mission.reward || 0));
  save.money = nonNegativeInteger(save.money) + reward;
  if (!persist()) {
    save.daily.claimedMissions = wasClaimed;
    save.money = oldMoney;
    dispatchWalletUpdate(false, 'daily-mission-reward-failed');
    return { ok: false, message: 'The reward could not be saved. Browser storage is unavailable.' };
  }
  return { ok: true, message: `Daily mission claimed: +₦${reward.toLocaleString()}.`, reward, missionId: id };
}

/** Read-only summary for the Wallet/garage UI and external diagnostics. */
export function getBankingSummary() {
  return {
    balance: nonNegativeInteger(save.money),
    lifetimeEarned: nonNegativeInteger(save.banking?.totalEarned),
    transactions: Array.isArray(save.banking?.transactions)
      ? save.banking.transactions.map((entry) => ({ ...entry }))
      : [],
    storageAvailable: (() => {
      try {
        return Boolean(globalThis.localStorage);
      } catch (_) {
        return false;
      }
    })(),
  };
}
