import { UI } from './ui.js';
import { getBankingSummary, calculateRunPayout } from './storage.js';
import { KanoInteractionReliability } from './KanoInteractionReliability.js';

const PATCH_KEY = Symbol.for('kano.life.economyClarity.step91');
const money = (value) => `₦${Math.max(0, Math.floor(Number(value) || 0)).toLocaleString('en-NG')}`;
const points = (value) => Math.max(0, Math.floor(Number(value) || 0)).toLocaleString('en-NG');

function updateWalletSummary() {
  try {
    const summary = getBankingSummary();
    const lifetime = document.getElementById('kano-lifetime-run-payouts');
    if (lifetime) lifetime.textContent = money(summary.lifetimeEarned);
    const balance = document.getElementById('wallet-balance');
    if (balance?.parentNode) {
      for (const child of balance.parentNode.childNodes) {
        if (child.nodeType === Node.TEXT_NODE && child.textContent.trim()) {
          child.textContent = 'BANKED WALLET ';
          break;
        }
      }
      balance.title = 'Cash available to spend now. Unfinished-run fares are not included.';
    }
    const guidance = document.getElementById('kano-economy-guidance');
    if (guidance) {
      guidance.textContent = 'RUN SCORE = points, not naira. Completed-run payout: 65% of passenger fares + a score bonus (1% of score, capped at ₦3,000 and 5% of fares). The remaining 35% of fares is a simulated running-cost reserve. Unfinished-run fares stay outside your wallet.';
    }
  } catch (error) {
    console.warn('[Kano Life] Economy summary could not be refreshed.', error);
  }
}

function ensurePayoutHost() {
  let host = document.getElementById('kano-run-payout-breakdown');
  if (host) return host;
  const overPanel = document.querySelector('#over-screen .over-panel');
  if (!overPanel) return null;
  host = document.createElement('section');
  host.id = 'kano-run-payout-breakdown';
  host.className = 'kano-run-payout-breakdown';
  host.setAttribute('aria-live', 'polite');
  const message = document.getElementById('over-message');
  if (message?.parentNode) message.insertAdjacentElement('afterend', host);
  else overPanel.append(host);
  return host;
}

function appendPayoutRow(host, label, value, detail = '', strong = false) {
  const row = document.createElement('div');
  row.className = `kano-payout-row${strong ? ' is-total' : ''}`;
  const copy = document.createElement('div');
  copy.className = 'kano-payout-copy';
  const name = document.createElement('strong');
  name.textContent = label;
  copy.append(name);
  if (detail) {
    const note = document.createElement('small');
    note.textContent = detail;
    copy.append(note);
  }
  const amount = document.createElement('b');
  amount.textContent = value;
  row.append(copy, amount);
  host.append(row);
}

function renderPayoutBreakdown({ run = {}, earned = 0, soft = false } = {}) {
  const host = ensurePayoutHost();
  if (!host) return;
  const estimate = calculateRunPayout(run);
  const actualEarned = Math.max(0, Math.floor(Number(earned) || 0));
  host.replaceChildren();
  host.hidden = false;

  const heading = document.createElement('h3');
  heading.textContent = soft ? 'ESTIMATED PAYOUT · NOT BANKED YET' : 'YOUR WALLET PAYOUT';
  host.append(heading);

  const intro = document.createElement('p');
  intro.className = 'kano-payout-intro';
  intro.textContent = soft
    ? 'This is a preview only. The run still has a continue available, so this money has not been added to your wallet.'
    : 'The run has ended permanently. Here is how the fare income becomes spendable wallet cash.';
  host.append(intro);

  appendPayoutRow(host, 'Gross passenger fares', money(estimate.grossFares), 'All fares and in-run passenger service bonuses collected this run.');
  appendPayoutRow(host, 'Running-cost reserve · 35%', `−${money(estimate.operatingReserve)}`, 'Simulated allowance for fuel, park levies, maintenance and wear. This is accounted for in the 65% fare payout; it is not deducted twice.');
  appendPayoutRow(host, 'Take-home fare payout · 65%', money(estimate.farePayout));
  appendPayoutRow(host, 'Driving score bonus', `+${money(estimate.scoreBonus)}`, '1% of score points, capped at the lower of 5% of fares or ₦3,000.');

  const shownTotal = soft ? estimate.earned : actualEarned;
  appendPayoutRow(host, soft ? 'Estimated total payout' : 'Credited run payout', money(shownTotal), '', true);

  const status = document.createElement('p');
  status.className = 'kano-payout-status';
  if (soft) {
    status.textContent = 'Not credited yet. Resume/continue the run to keep playing; the payout is added only when the run ends permanently.';
  } else if (actualEarned === estimate.earned) {
    status.textContent = `${money(actualEarned)} has been added to your banked wallet. Your wallet balance is separate from the fares shown during an unfinished run.`;
  } else {
    status.textContent = 'The wallet save did not confirm the expected payout. Check the save warning before leaving this report.';
  }
  host.append(status);
}

function patchHudScoreLabels() {
  const score = document.getElementById('score');
  if (score) {
    const stat = score.closest('.stat');
    const label = stat?.querySelector('small');
    if (label) label.textContent = 'RUN SCORE · POINTS';
    const strong = score.closest('strong');
    const prefix = strong?.firstChild;
    if (prefix?.nodeType === Node.TEXT_NODE) prefix.textContent = '';
  }
  const bestRecord = document.getElementById('over-best');
  if (bestRecord) bestRecord.title = 'Best run score in points, not currency.';
  const overScore = document.getElementById('over-score');
  if (overScore) overScore.title = 'Run score points. It is separate from passenger fares and wallet money.';
}

function patchUiPrototype() {
  if (UI.prototype[PATCH_KEY]) return;
  const originalGameOver = UI.prototype.gameOver;
  if (typeof originalGameOver === 'function') {
    UI.prototype.gameOver = function kanoEconomyClearGameOver(report = {}) {
      const result = originalGameOver.call(this, report);
      try {
        const overScore = document.getElementById('over-score');
        const bestScore = document.getElementById('over-best');
        if (overScore) overScore.textContent = points(report.run?.score);
        if (bestScore) bestScore.textContent = points(report.best);
        renderPayoutBreakdown(report);
        updateWalletSummary();
      } catch (error) {
        console.warn('[Kano Life] Run payout details could not be displayed.', error);
      }
      return result;
    };
  }
  UI.prototype[PATCH_KEY] = true;
}

function patchInteractionPrototype() {
  const proto = KanoInteractionReliability?.prototype;
  if (!proto || proto[PATCH_KEY]) return;

  const originalRefreshResume = proto.refreshResumeRunControl;
  if (typeof originalRefreshResume === 'function') {
    proto.refreshResumeRunControl = function kanoEconomyClearResumeLabel(...args) {
      const result = originalRefreshResume.apply(this, args);
      try {
        const checkpoint = this.readActiveRunCheckpoint?.();
        const button = this.resumeRunButton || document.getElementById('kano-resume-run-button');
        if (checkpoint && button) {
          const state = checkpoint.state || {};
          const estimate = calculateRunPayout(state);
          const prefix = checkpoint.softOver ? 'RECOVER SAVED RUN' : 'RESUME SAVED RUN';
          button.textContent = `${prefix} · SCORE ${points(state.score)} PTS · FARES ${money(estimate.grossFares)} · EST. PAYOUT ${money(estimate.earned)}`;
          button.title = `Estimated payout: ${money(estimate.farePayout)} take-home fares + ${money(estimate.scoreBonus)} score bonus. It is not banked until the run ends permanently.`;
          button.style.whiteSpace = 'normal';
          button.style.lineHeight = '1.35';
          button.style.padding = '10px 12px';
        }
      } catch (error) {
        console.warn('[Kano Life] Saved-run payout preview could not be refreshed.', error);
      }
      return result;
    };
  }

  const originalCareer = proto.refreshCareerCard;
  if (typeof originalCareer === 'function') {
    proto.refreshCareerCard = function kanoClarifyCompletedRunCount(...args) {
      const result = originalCareer.apply(this, args);
      const text = this.careerCard?.querySelector('[data-career-text]');
      if (text) text.textContent = text.textContent.replace(/(\d+) runs?$/, '$1 completed runs');
      return result;
    };
  }
  proto[PATCH_KEY] = true;
}

patchHudScoreLabels();
patchUiPrototype();
patchInteractionPrototype();
updateWalletSummary();
window.addEventListener('kano:wallet-updated', updateWalletSummary);
window.addEventListener('storage', updateWalletSummary);
console.info('[Kano Life] economy clarity registered: points, gross fares, current wallet and completed-run payout are now distinguished.');
