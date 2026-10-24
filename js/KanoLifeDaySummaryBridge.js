/**
 * Kano Life — End-of-run Life Day summary
 * --------------------------------------
 * When a run ends for real (not soft continue), shows an animated stage card
 * explaining the full working day: park, boards, trips, shift, wallet.
 *
 * Reads existing ledgers only. No per-frame work.
 * Requires: KanoLifeStagePresenter.js (window.kanoLifeStage)
 */
import { UI } from './ui.js';

const PATCH = Symbol.for('kano.life.daySummaryBridge.v1');
const money = (v) => Math.max(0, Math.round(Number(v) || 0));
const naira = (v) => `₦${money(v).toLocaleString('en-NG')}`;

function stage(detail) {
  try {
    if (window.kanoLifeStage?.present) window.kanoLifeStage.present(detail);
    else window.dispatchEvent(new CustomEvent('kano-life-stage', { detail }));
  } catch (_) {}
}

function snapPark() {
  try {
    return (
      window.kanoParkEssence?.snapshot?.() ||
      window.kanoPassengerPark?.snapshot?.() ||
      null
    );
  } catch {
    return null;
  }
}

function snapLife() {
  try {
    return window.kanoLifeEssence?.snapshot?.() || null;
  } catch {
    return null;
  }
}

function buildSummary({ reason, earned, run, soft }) {
  if (soft) {
    return {
      kind: 'default',
      eyebrow: 'Run paused',
      icon: '⏸️',
      title: 'Life day not closed yet',
      body: 'This is a soft continue. Earnings and the life ledger stay open until the run ends permanently.',
      chips: [reason, run?.lives != null ? `Lives ${run.lives}` : null].filter(Boolean),
      ms: 4000,
    };
  }

  const park = snapPark();
  const life = snapLife();
  const day =
    park?.today ||
    park?.day ||
    park?.state?.days?.slice?.(-1)?.[0] ||
    null;

  const stand =
    day?.standId ||
    park?.plan?.standId ||
    run?.kanoParkLabel ||
    run?.kanoParkStandId ||
    'Park';
  const boardings = day?.boardings ?? run?.boards ?? 0;
  const trips = day?.completedTrips ?? day?.trips ?? run?.drops ?? 0;
  const dist = Number(run?.distance) || 0;

  const chips = [
    typeof stand === 'string' ? String(stand).replace(/-/g, ' ') : null,
    boardings ? `${boardings} boarded` : null,
    trips ? `${trips} trips` : null,
    dist ? `${dist.toFixed(1)} km` : null,
    earned != null ? naira(earned) + ' banked' : null,
  ].filter(Boolean);

  let body =
    'Your keke shift is closed. Park activity and the northern driver ledger now hold today’s work so tomorrow can start from real history.';
  if (boardings || trips) {
    body = `Today you loaded ${boardings || 0} passenger group(s) and completed ${trips || 0} drop(s) over ${dist.toFixed(2)} km. That work is written into park operations and your life shift ledger.`;
  }

  const profileName = life?.profile?.name || life?.state?.profile?.name;
  const title = profileName
    ? `${profileName}’s day is settled`
    : 'Working day settled';

  return {
    kind: 'day',
    eyebrow: 'End of working day',
    icon: '🌙',
    title,
    body,
    chips: chips.slice(0, 5),
    ms: 6500,
  };
}

function install() {
  if (!UI?.prototype || UI.prototype[PATCH]) {
    console.info('[LifeDaySummary] already installed or UI missing');
    return;
  }
  Object.defineProperty(UI.prototype, PATCH, { value: true });

  const prev = UI.prototype.gameOver;
  if (typeof prev !== 'function') {
    console.warn('[LifeDaySummary] UI.gameOver missing');
    return;
  }

  UI.prototype.gameOver = function gameOverWithLifeDay(payload = {}, ...args) {
    const result = prev.call(this, payload, ...args);
    try {
      const summary = buildSummary(payload || {});
      // Slight delay so over-screen paints first
      setTimeout(() => stage(summary), payload?.soft ? 200 : 450);
    } catch (e) {
      console.warn('[LifeDaySummary]', e);
    }
    return result;
  };

  if (typeof window !== 'undefined') {
    window.kanoLifeDaySummary = { version: 1, buildSummary };
  }

  console.info(
    '[Kano Life] Day summary bridge installed — game over explains the full working day'
  );
}

install();
export { install, buildSummary };
