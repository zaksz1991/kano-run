/**
 * Kano Life — Essence Bridge (life sim ↔ drive loop)
 * -------------------------------------------------
 * Purpose: make northern driver life-sim half of the game without new menus
 * or per-frame cost.
 *
 * Fixes the fragile path where settleShift only ran when a banking transaction
 * id changed (often missed). On terminal run end (state OVER, no soft continue):
 *   1) life.beginShift safety if missing
 *   2) life.settleShift with run fares/score
 *   3) day ledger closeDay when available
 *   4) one short toast — no new UI framework
 *
 * Phone-safe: event-only (start + finish). No requestAnimationFrame. No timers.
 */
import { Game } from './game.js';
import { save, persist } from './storage.js';
import { KanoNorthernDriverLifeSimulation } from './KanoNorthernDriverLifeSimulation.js';
import { KanoNorthernDriverDaySettlementLedger } from './KanoNorthernDriverDaySettlement.js';

function stage(detail) {
  try {
    if (window.kanoLifeStage?.present) window.kanoLifeStage.present(detail);
    else window.dispatchEvent(new CustomEvent('kano-life-stage', { detail }));
  } catch (_) {}
}


const PATCH = Symbol.for('kano.life.essenceBridge.v1');
const money = (v) => Math.max(0, Math.round(Number(v) || 0));
const formatNaira = (v) => `₦${money(v).toLocaleString('en-NG')}`;

function worldDay(game) {
  const s = game?.s;
  const d =
    s?.__kanoScheduleCurrentDay ??
    s?.worldDayNumber ??
    save?.lifestyle?.worldDayNumber ??
    1;
  return Math.max(1, Math.floor(Number(d) || 1));
}

function simMode(game, fallback = 'career') {
  const m = game?.mode || fallback || 'career';
  return m === 'freeRoam' || m === 'free_roam' ? 'freeRoam' : m;
}

function runEarned(game, bankTx) {
  if (bankTx && Number.isFinite(Number(bankTx.earned))) return money(bankTx.earned);
  const s = game?.s || {};
  // Prefer explicit fare total; fall back to a modest score slice
  if (Number.isFinite(Number(s.fares)) && Number(s.fares) > 0) return money(s.fares);
  if (Number.isFinite(Number(s.score)) && Number(s.score) > 0) {
    return money(Math.min(Number(s.score) * 0.2, Number(s.score)));
  }
  return 0;
}

const life = new KanoNorthernDriverLifeSimulation();
const dayLedger = new KanoNorthernDriverDaySettlementLedger();

function ensureShift(game) {
  const mode = simMode(game);
  if (!['career', 'freeRoam'].includes(mode)) return { ok: false, reason: 'mode' };
  const day = worldDay(game);
  // beginShift is idempotent enough for a missing active shift
  try {
    if (!life.state?.activeShift) {
      life.beginShift(game.s || {}, day, mode);
    }
  } catch (e) {
    console.warn('[LifeEssence] beginShift', e);
  }
  return { ok: true, mode, day };
}

function settleTerminal(game) {
  const mode = simMode(game);
  if (!['career', 'freeRoam'].includes(mode)) return null;
  if (game.state !== 'OVER') return null;

  ensureShift(game);

  const tx = save.banking?.transactions?.[0] || null;
  const earned = runEarned(game, tx);
  const day = worldDay(game);

  let settled = null;
  try {
    settled = life.settleShift({
      earned,
      gameState: game.s || {},
      wallet: save.money || 0,
      dayNumber: day,
      mode,
    });
  } catch (e) {
    console.warn('[LifeEssence] settleShift', e);
    return null;
  }

  if (settled?.ok) {
    if (Number.isFinite(Number(settled.wallet))) {
      save.money = money(settled.wallet);
      persist();
      game.ui?.refreshWallet?.();
    }
    const net = settled.report?.net ?? settled.net ?? earned;
    const costs = settled.report?.costsTotal ?? settled.costsTotal;
    const line =
      costs != null
        ? `LIFE · earned ${formatNaira(earned)} · costs ${formatNaira(costs)} · net ${formatNaira(net)}`
        : `LIFE · shift settled · ${formatNaira(earned)} · wallet ${formatNaira(save.money)}`;
    try {
      game.ui?.toast?.(line);
            stage({
              kind: 'shift',
              title: 'Shift closed in your life ledger',
              body: 'Driving earnings and shift costs were written to the northern driver career ledger and wallet.',
              chips: [formatNaira(earned) + ' earned', costs != null ? formatNaira(costs) + ' costs' : null, 'Wallet ' + formatNaira(save.money)].filter(Boolean),
              ms: 5000,
            });
    } catch (_) {}
    try {
      game.ui?.__kanoLifeCareerRefresh?.();
    } catch (_) {}
  } else if (settled && settled.reason && settled.reason !== 'no_active_shift') {
    console.info('[LifeEssence] settle skipped:', settled.reason);
  }

  // Day statement (no extra deductions — ledger only)
  try {
    if (typeof dayLedger.closeDay === 'function') {
      dayLedger.closeDay({
        dayNumber: day,
        earned: settled?.ok ? earned : earned,
        wallet: save.money || 0,
        mode,
        distance: game.s?.distance || 0,
      });
    }
  } catch (e) {
    console.warn('[LifeEssence] closeDay', e);
  }

  return settled;
}

function install() {
  if (!Game?.prototype || Game.prototype[PATCH]) {
    console.info('[LifeEssence] already installed or Game missing');
    return;
  }
  Object.defineProperty(Game.prototype, PATCH, { value: true });

  const prevStart = Game.prototype.start;
  if (typeof prevStart === 'function') {
    Game.prototype.start = function startWithLifeEssence(mode, ...args) {
      const result = prevStart.call(this, mode, ...args);
      try {
        const m = simMode(this, mode);
        if (['career', 'freeRoam'].includes(m)) {
          life.beginShift(this.s || {}, worldDay(this), m);
          if (this.s) this.s.kanoLifeProfile = { ...(life.state?.profile || {}) };
        }
      } catch (e) {
        console.warn('[LifeEssence] start', e);
      }
      return result;
    };
  }

  const prevFinish = Game.prototype.finishOrContinue;
  if (typeof prevFinish === 'function') {
    Game.prototype.finishOrContinue = function finishWithLifeEssence(reason, allowContinue, ...args) {
      const beforeTxId = save.banking?.transactions?.[0]?.id || null;
      const result = prevFinish.call(this, reason, allowContinue, ...args);
      try {
        const afterTxId = save.banking?.transactions?.[0]?.id || null;
        const bankedNow = Boolean(afterTxId && afterTxId !== beforeTxId);
        // Soft continue: no bankRun → skip.
        // Terminal: bankRun ran → settle life shift (core of life-sim half).
        if (this.state === 'OVER' && bankedNow) {
          settleTerminal(this);
        } else if (this.state === 'OVER' && allowContinue === false) {
          // Forced terminal without bank id change (edge) — still settle from fares
          settleTerminal(this);
        }
      } catch (e) {
        console.warn('[LifeEssence] finish', e);
      }
      return result;
    };
  }

  // Expose tiny debug API (no weight)
  if (typeof window !== 'undefined') {
    window.kanoLifeEssence = {
      version: 1,
      snapshot: () => life.getSnapshot?.() ?? life.state,
      day: () => dayLedger.getSnapshot?.() ?? null,
    };
  }

  console.info(
    '[Kano Life] Essence bridge installed — life shift settles on every terminal career/freeRoam run'
  );
}

install();
export { install, life, dayLedger };