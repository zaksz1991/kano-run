/**
 * Kano Life — Park Essence Bridge
 * -----------------------------
 * Park → Drive → Settle is the working day.
 * On career/freeRoam start: map route → park stand, start workday + shift.
 * Optional official-queue token (₦40 gameplay) only if wallet can pay.
 * On passenger board/drop: record park stats when host exposes hooks.
 *
 * Phone-safe: start/end/event only. No RAF. No new full-screen UI.
 */
import { Game } from './game.js';
import { save, persist } from './storage.js';
import {
  KanoNorthernDriverParkOperations,
  KANO_PARK_STANDS,
  KANO_PARK_DAILY_TOKEN,
} from './KanoNorthernDriverParkOperations.js';

const PATCH = Symbol.for('kano.life.parkEssenceBridge.v1');
const money = (v) => Math.max(0, Math.round(Number(v) || 0));

const park = new KanoNorthernDriverParkOperations();

function worldDay(game) {
  const s = game?.s;
  const d =
    s?.__kanoScheduleCurrentDay ??
    s?.worldDayNumber ??
    save?.lifestyle?.worldDayNumber ??
    1;
  return Math.max(1, Math.floor(Number(d) || 1));
}

function minuteOfDay(game) {
  const m = game?.s?.gameClockMinutes;
  if (Number.isFinite(Number(m))) return ((Number(m) % 1440) + 1440) % 1440;
  return 408; // ~06:48
}

function simMode(game, fallback = 'career') {
  const m = game?.mode || fallback || 'career';
  return m === 'free_roam' ? 'freeRoam' : m;
}

function standFromRoute(game) {
  const routeName = String(game?.route?.name || game?.s?.routeName || '').toLowerCase();
  if (!routeName) return 'sabon-gari';
  for (const stand of KANO_PARK_STANDS) {
    const label = String(stand.label || '').toLowerCase();
    const id = String(stand.id || '').toLowerCase();
    const rn = String(stand.routeName || '').toLowerCase();
    if (
      routeName.includes(label) ||
      routeName.includes(rn) ||
      routeName.includes(id.replace(/-/g, ' ')) ||
      label.includes(routeName) ||
      rn.includes(routeName)
    ) {
      return stand.id;
    }
  }
  // fuzzy landmarks
  if (/hotoro/.test(routeName)) return 'hotoro';
  if (/farm/.test(routeName)) return 'farm-centre';
  if (/buk|bayero/.test(routeName)) return 'buk-gate';
  if (/ruwa/.test(routeName)) return 'kofar-ruwa';
  if (/wambai/.test(routeName)) return 'kofar-wambai';
  if (/mata/.test(routeName)) return 'kofar-mata';
  if (/yankaba/.test(routeName)) return 'yankaba-market';
  if (/sabon|sabon gari/.test(routeName)) return 'sabon-gari';
  return 'sabon-gari';
}

function openParkDay(game) {
  const mode = simMode(game);
  if (!['career', 'freeRoam'].includes(mode)) return null;

  const day = worldDay(game);
  const minute = minuteOfDay(game);
  const standId = standFromRoute(game);
  const workStyle = 'official_queue';

  try {
    park.setWorkPlan({ standId, workStyle });
  } catch (e) {
    console.warn('[ParkEssence] setWorkPlan', e);
  }

  let work = null;
  try {
    work = park.startWorkday({ day, minute });
    if (!work?.ok && work?.reason === 'already_on_duty') {
      work = { ok: true, reason: 'already_on_duty' };
    }
  } catch (e) {
    console.warn('[ParkEssence] startWorkday', e);
  }

  const runId = `${mode}-${Number(game?.s?.runStartedAt) || Date.now()}`;
  let shift = null;
  try {
    shift = park.startShift({
      day,
      minute,
      runId,
      routeName: game?.route?.name || '',
      mode,
    });
  } catch (e) {
    console.warn('[ParkEssence] startShift', e);
  }

  // Optional park token — only if player can afford; never force debt
  let token = null;
  try {
    if (money(save.money) >= KANO_PARK_DAILY_TOKEN) {
      token = park.payDailyToken({ day, wallet: save.money });
      if (token?.ok) {
        save.money = money(token.wallet ?? save.money - KANO_PARK_DAILY_TOKEN);
        persist();
        game.ui?.refreshWallet?.();
      }
    }
  } catch (e) {
    console.warn('[ParkEssence] token', e);
  }

  const stand = KANO_PARK_STANDS.find((s) => s.id === standId);
  const label = stand?.label || standId;
  const q = work?.day?.queuePosition ?? shift?.day?.queuePosition;
  const tokenLine =
    token?.ok ? ` · park token ${KANO_PARK_DAILY_TOKEN}` : '';
  const queueLine = q != null ? ` · queue #${q}` : '';
  try {
    game.ui?.toast?.(`PARK · ${label}${queueLine}${tokenLine}`);
  } catch (_) {}

  if (game.s) {
    game.s.kanoParkStandId = standId;
    game.s.kanoParkLabel = label;
  }

  return { standId, work, shift, token };
}

function install() {
  if (!Game?.prototype || Game.prototype[PATCH]) {
    console.info('[ParkEssence] already installed or Game missing');
    return;
  }
  Object.defineProperty(Game.prototype, PATCH, { value: true });

  const prevStart = Game.prototype.start;
  if (typeof prevStart === 'function') {
    Game.prototype.start = function startWithParkEssence(mode, ...args) {
      const result = prevStart.call(this, mode, ...args);
      try {
        const m = simMode(this, mode);
        if (['career', 'freeRoam'].includes(m)) openParkDay(this);
      } catch (e) {
        console.warn('[ParkEssence] start', e);
      }
      return result;
    };
  }

  // Boarding / trip hooks if host has these methods
  for (const [method, kind] of [
    ['onPassengerBoarded', 'board'],
    ['boardPassenger', 'board'],
    ['pickupPassenger', 'board'],
    ['completeDrop', 'trip'],
    ['onPassengerDropped', 'trip'],
  ]) {
    if (typeof Game.prototype[method] !== 'function') continue;
    if (Game.prototype[method][PATCH]) continue;
    const prev = Game.prototype[method];
    const wrapped = function parkEssenceHook(...args) {
      const out = prev.apply(this, args);
      try {
        const day = worldDay(this);
        if (kind === 'board') {
          const name = args[0]?.name || args[0]?.passenger?.name || args[0] || '';
          park.recordBoarding({ day, name: String(name || ''), returning: false });
        } else {
          const s = this.s || {};
          const payload = args[0] && typeof args[0] === 'object' ? args[0] : {};
          park.recordTrip({
            tripId: payload.tripId || `${day}-${Math.round(s.distance || 0)}-${s.score || 0}`,
            day,
            matched: Boolean(payload.matched ?? true),
            safeTrip: Boolean(payload.safeTrip ?? (s.condition || 100) > 40),
            fareEarned: money(payload.fare ?? payload.earned ?? 0),
            distance: Number(payload.distance ?? 0) || 0,
            destination: String(payload.destination || ''),
            name: String(payload.name || ''),
          });
        }
      } catch (e) {
        console.warn('[ParkEssence] hook', method, e);
      }
      return out;
    };
    wrapped[PATCH] = true;
    Game.prototype[method] = wrapped;
  }

  if (typeof window !== 'undefined') {
    window.kanoParkEssence = {
      version: 1,
      snapshot: () => park.getSnapshot?.() ?? park.state,
      stands: KANO_PARK_STANDS,
    };
  }

  console.info(
    '[Kano Life] Park essence bridge installed — career day opens at a Kano park stand'
  );
}

install();
export { install, park, openParkDay };
