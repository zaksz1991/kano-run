// ============================================================
// KANO LIFE — WORKSHOP & ROADSIDE RECOVERY PANEL
// File: js/KanoWorkshopPanel.js
//
// Features:
// - Mobile-friendly workshop interface
// - Vehicle component health display
// - Banked-wallet repair integration
// - Full-service repair action
// - Simulated roadside recovery
// - Recovery payment and outstanding-request handling
// - Safe panel lifecycle and error handling
//
// Dependencies:
// - KanoWorkshopWalletBridge.js
// - Existing game instance
// ============================================================

import { KanoWorkshopWalletBridge } from './KanoWorkshopWalletBridge.js';

const formatMoney = (amount) =>
  `₦${Math.floor(Math.max(0, Number(amount) || 0)).toLocaleString('en-NG')}`;

const clampHealth = (value) =>
  Math.max(0, Math.min(100, Math.round(Number(value) || 0)));

const COMPONENTS = {
  engine: 'Engine',
  tyres: 'Tyres',
  cooling: 'Cooling',
  brakes: 'Brakes',
  suspension: 'Suspension',
  body: 'Body',
};

const FAILURE_MESSAGES = {
  no_repair_needed:
    'Your tracked vehicle parts do not currently need repair.',

  insufficient_funds:
    'Insufficient banked funds. Your recovery request remains available for payment.',

  cancelled:
    'Payment cancelled. Your banked balance was not charged.',

  no_recovery_available:
    'No workshop or recovery service is available at this time.',

  recovery_not_payable:
    'This recovery request is no longer awaiting payment.',

  repair_quote_failed:
    'The workshop could not calculate the repair cost.',

  repair_payment_failed:
    'Repair payment failed. Check your vehicle condition and balance.',

  recovery_payment_failed:
    'Recovery payment failed. Your request has not been confirmed as paid.',

  payment_failed:
    'Payment failed. Check your balance and try again.',
};

export class KanoWorkshopPanel {
  constructor({
    game,
    container = document.getElementById('game-container'),
    mobile = false,
  } = {}) {
    if (!game) {
      throw new Error(
        'KanoWorkshopPanel requires an active Game instance.',
      );
    }

    this.game = game;
    this.container = container || document.body;
    this.mobile = Boolean(mobile);
    this.opened = false;
    this.busy = false;
    this.disposed = false;

    this.bridge = new KanoWorkshopWalletBridge({
      game,

      onUpdate: () => {
        if (!this.disposed) {
          this.render();
        }
      },

      onMessage: (message) => {
        if (this.disposed) return;

        this.setStatus(message);
        this.render();
      },
    });

    this.mount();
    this.render();
  }

  mount() {
    // Remove stale UI from a previous panel instance.
    document.getElementById('kano-workshop-toggle')?.remove();
    document.getElementById('kano-workshop-panel')?.remove();
    document.getElementById('kano-workshop-panel-style')?.remove();

    const style = document.createElement('style');
    style.id = 'kano-workshop-panel-style';

    style.textContent = `
      #kano-workshop-toggle {
        position: fixed;
        z-index: 1200;
        right: 12px;
        top: calc(env(safe-area-inset-top, 0px) + 72px);
        min-height: 44px;
        border: 1px solid #fbbf24;
        border-radius: 999px;
        background: #0b1e3a;
        color: #fff;
        padding: 11px 14px;
        font: 700 12px/1.2 system-ui, sans-serif;
        box-shadow: 0 4px 18px #0005;
        cursor: pointer;
        touch-action: manipulation;
      }

      #kano-workshop-panel,
      #kano-workshop-panel * {
        box-sizing: border-box;
      }

      #kano-workshop-panel {
        position: fixed;
        z-index: 1199;
        right: 10px;
        top: calc(env(safe-area-inset-top, 0px) + 120px);
        width: min(390px, calc(100vw - 20px));
        max-height: min(72vh, 680px);
        overflow-y: auto;
        overscroll-behavior: contain;
        -webkit-overflow-scrolling: touch;
        background: #071526f7;
        color: #f8fafc;
        border: 1px solid #00b4d8;
        border-radius: 16px;
        box-shadow: 0 18px 60px #0009;
        padding: 14px;
        font: 14px/1.45 system-ui, sans-serif;
        display: none;
      }

      #kano-workshop-panel.open {
        display: block;
      }

      #kano-workshop-panel h2 {
        font-size: 17px;
        line-height: 1.4;
        margin: 0 0 5px;
        padding-right: 68px;
      }

      #kano-workshop-panel h3 {
        font-size: 13px;
        margin: 16px 0 7px;
        color: #00d2f2;
      }

      #kano-workshop-panel .kwp-sub {
        font-size: 12px;
        color: #b8c5d6;
        margin-bottom: 10px;
      }

      #kano-workshop-panel .kwp-grid {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 8px;
      }

      #kano-workshop-panel .kwp-card {
        min-width: 0;
        overflow-wrap: anywhere;
        background: #10253d;
        border: 1px solid #29445e;
        border-radius: 10px;
        padding: 9px;
      }

      #kano-workshop-panel .kwp-card strong {
        display: block;
        font-size: 12px;
      }

      #kano-workshop-panel .kwp-bar {
        height: 5px;
        background: #334155;
        border-radius: 9px;
        margin-top: 7px;
        overflow: hidden;
      }

      #kano-workshop-panel .kwp-bar span {
        display: block;
        height: 100%;
        background: #00b4d8;
      }

      #kano-workshop-panel button,
      #kano-workshop-panel select {
        width: 100%;
        min-width: 0;
        min-height: 44px;
        border-radius: 9px;
        border: 1px solid #42617c;
        background: #132b45;
        color: #fff;
        padding: 8px;
        font: 600 12px/1.4 system-ui, sans-serif;
      }

      #kano-workshop-panel button {
        cursor: pointer;
        touch-action: manipulation;
      }

      #kano-workshop-panel button:disabled,
      #kano-workshop-toggle:disabled {
        opacity: 0.55;
        cursor: wait;
      }

      #kano-workshop-panel button:focus-visible,
      #kano-workshop-panel select:focus-visible,
      #kano-workshop-toggle:focus-visible {
        outline: 2px solid #fbbf24;
        outline-offset: 3px;
      }

      #kano-workshop-panel .kwp-primary {
        background: #00b4d8;
        color: #071526;
        border-color: #00b4d8;
      }

      #kano-workshop-panel .kwp-close {
        float: right;
        width: auto;
        min-height: 32px;
        padding: 4px 10px;
      }

      #kano-workshop-panel .kwp-row {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 8px;
        margin-top: 8px;
      }

      #kano-workshop-panel .kwp-status {
        margin-top: 10px;
        background: #10253d;
        border: 1px solid #29445e;
        border-radius: 9px;
        padding: 9px;
        font-size: 12px;
        color: #fbbf24;
        overflow-wrap: anywhere;
      }

      #kano-workshop-panel .kwp-list {
        display: grid;
        gap: 8px;
      }

      #kano-workshop-panel .kwp-item {
        min-width: 0;
        background: #10253d;
        border: 1px solid #29445e;
        border-radius: 10px;
        padding: 10px;
        font-size: 12px;
        overflow-wrap: anywhere;
      }

      #kano-workshop-panel .kwp-item p {
        margin: 0 0 6px;
      }

      #kano-workshop-panel .kwp-item button {
        margin-top: 6px;
      }

      #kano-workshop-panel .kwp-note {
        font-size: 11px;
        color: #b8c5d6;
        margin-top: 10px;
      }

      @media (max-width: 480px) {
        #kano-workshop-toggle {
          top: auto;
          bottom: calc(env(safe-area-inset-bottom, 0px) + 150px);
          right: 9px;
          max-width: calc(100vw - 18px);
        }

        #kano-workshop-panel {
          top: auto;
          bottom: calc(env(safe-area-inset-bottom, 0px) + 202px);
          right: 8px;
          width: calc(100vw - 16px);
          max-height: min(65vh, 620px);
          padding: 12px;
        }
      }

      @media (prefers-reduced-motion: reduce) {
        #kano-workshop-panel *,
        #kano-workshop-toggle {
          scroll-behavior: auto;
          transition: none !important;
        }
      }
    `;

    document.head.appendChild(style);

    this.toggle = document.createElement('button');
    this.toggle.id = 'kano-workshop-toggle';
    this.toggle.type = 'button';
    this.toggle.textContent = '🔧 WORKSHOP';
    this.toggle.setAttribute('aria-controls', 'kano-workshop-panel');
    this.toggle.setAttribute('aria-expanded', 'false');

    this.toggle.addEventListener('click', () => {
      this.setOpen(!this.opened);
    });

    this.panel = document.createElement('section');
    this.panel.id = 'kano-workshop-panel';
    this.panel.setAttribute(
      'aria-label',
      'Keke workshop and roadside recovery',
    );

    this.panel.innerHTML = `
      <button
        class="kwp-close"
        type="button"
        data-kwp="close"
        aria-label="Close workshop"
      >Close ✕</button>

      <h2>KANO LIFE · Keke Workshop</h2>

      <div class="kwp-sub">
        Maintain your keke and manage repair expenses.
      </div>

      <div id="kwp-balance" class="kwp-card" aria-live="polite">
        Banked balance: —
      </div>

      <h3>Vehicle condition</h3>
      <div id="kwp-health" class="kwp-grid"></div>

      <h3>Repair services</h3>

      <div class="kwp-row">
        <button
          type="button"
          class="kwp-primary"
          data-kwp="repair"
        >Repair damaged parts</button>

        <button
          type="button"
          data-kwp="service"
        >Repair + full service</button>
      </div>

      <h3>Roadside recovery</h3>

      <label class="kwp-sub" for="kwp-severity">
        Recovery reason
      </label>

      <select id="kwp-severity">
        <option value="breakdown">Engine / general breakdown</option>
        <option value="collision">Collision damage</option>
        <option value="stuck">Stuck in pothole / roadside</option>
        <option value="overheating">Overheating</option>
      </select>

      <div class="kwp-row">
        <button
          type="button"
          class="kwp-primary"
          data-kwp="recovery"
        >Request recovery</button>

        <button
          type="button"
          data-kwp="refresh"
        >Refresh status</button>
      </div>

      <h3>Outstanding recovery requests</h3>
      <div id="kwp-recoveries" class="kwp-list"></div>

      <h3>Workshop jobs</h3>
      <div id="kwp-jobs" class="kwp-list"></div>

      <div
        id="kwp-status"
        class="kwp-status"
        role="status"
        aria-live="polite"
      >Workshop ready.</div>

      <div class="kwp-note">
        Recovery is simulated in-game. It does not contact a real
        mechanic or roadside recovery service.
      </div>
    `;

    document.body.append(this.toggle, this.panel);

    this.health = this.panel.querySelector('#kwp-health');
    this.balance = this.panel.querySelector('#kwp-balance');
    this.jobs = this.panel.querySelector('#kwp-jobs');
    this.recoveries = this.panel.querySelector('#kwp-recoveries');
    this.status = this.panel.querySelector('#kwp-status');

    this.panel.addEventListener('click', (event) => {
      const button = event.target.closest('[data-kwp]');

      if (!button || this.busy || this.disposed) return;

      switch (button.dataset.kwp) {
        case 'close':
          this.setOpen(false);
          break;

        case 'refresh':
          this.render();
          break;

        case 'repair':
          this.repair(false);
          break;

        case 'service':
          this.repair(true);
          break;

        case 'recovery':
          this.recovery();
          break;

        case 'pay-recovery':
          this.payRecovery(button.dataset.callId);
          break;
      }
    });
  }

  setStatus(message) {
    if (this.status) {
      this.status.textContent = String(message || '');
    }
  }

  setBusy(value) {
    this.busy = Boolean(value);

    this.panel?.querySelectorAll('button, select').forEach((element) => {
      element.disabled = this.busy;
    });

    if (this.toggle) {
      this.toggle.disabled = this.busy;
    }
  }

  runAction(action) {
    if (this.busy || this.disposed) return;

    this.setBusy(true);

    try {
      action();
    } catch (error) {
      console.error('[Kano Life] Workshop action failed:', error);

      this.setStatus(
        error?.message || 'The workshop action failed.',
      );
    } finally {
      this.setBusy(false);
      this.render();
    }
  }

  setOpen(open) {
    if (this.disposed || !this.panel || !this.toggle) return;

    this.opened = Boolean(open);
    this.panel.classList.toggle('open', this.opened);

    this.toggle.setAttribute(
      'aria-expanded',
      String(this.opened),
    );

    this.toggle.textContent = this.opened
      ? '🔧 CLOSE WORKSHOP'
      : '🔧 WORKSHOP';

    if (this.opened) {
      this.render();
    }
  }

  repair(includeService) {
    this.runAction(() => {
      const result = this.bridge.payLifecycleRepair({
        workshop: true,
        includeService,
      });

      if (!result?.ok) {
        this.setStatus(
          FAILURE_MESSAGES[result?.reason] ||
          result?.message ||
          'Repair could not be completed.',
        );

        return;
      }

      this.setStatus(
        `Repair completed. Paid ${formatMoney(result.quote?.total)}.`,
      );

      this.game.ui?.toast?.(
        `Keke workshop: repair completed · ${formatMoney(
          result.quote?.total,
        )}.`,
      );
    });
  }

  recovery() {
    this.runAction(() => {
      const severity =
        this.panel.querySelector('#kwp-severity')?.value ||
        'breakdown';

      // The bridge returns a request result. The recovery call
      // itself is contained in request.call.
      const request = this.bridge.requestRecovery({
        severity,

        location: this.game.route?.name
          ? `${this.game.route.name}, Kano`
          : 'Kano roadside',

        distanceKm: 3,
      });

      if (!request?.ok || !request.call?.id) {
        this.setStatus(
          FAILURE_MESSAGES[request?.reason] ||
          request?.message ||
          'Recovery request could not be created.',
        );

        return;
      }

      const call = request.call;

      // Attempt payment using the actual recovery-call ID.
      const payment = this.bridge.payRecovery(call.id);

      if (!payment?.ok) {
        this.setStatus(
          FAILURE_MESSAGES[payment?.reason] ||
          payment?.message ||
          `Recovery request created. Fee: ${formatMoney(
            call.fee,
          )}. Complete payment from Outstanding recovery requests.`,
        );

        return;
      }

      this.setStatus(
        `Recovery dispatched. Fee paid: ${formatMoney(
          call.fee,
        )}. Estimated arrival: ${
          Number(call.etaMinutes) || 0
        } game minutes.`,
      );

      this.game.ui?.toast?.('Roadside recovery dispatched.');
    });
  }

  payRecovery(callId) {
    if (!callId) {
      this.setStatus('Recovery request ID is missing.');
      return;
    }

    this.runAction(() => {
      const result = this.bridge.payRecovery(callId);

      if (!result?.ok) {
        this.setStatus(
          FAILURE_MESSAGES[result?.reason] ||
          result?.message ||
          'Recovery payment could not be completed.',
        );

        return;
      }

      this.setStatus(
        'Recovery payment confirmed. Assistance dispatched.',
      );

      this.game.ui?.toast?.('Roadside recovery dispatched.');
    });
  }

  createMessage(message) {
    const item = document.createElement('div');
    item.className = 'kwp-item';
    item.textContent = message;
    return item;
  }

  renderHealth(parts) {
    if (!this.health) return;

    this.health.replaceChildren();

    Object.entries(COMPONENTS).forEach(([key, label]) => {
      const health = clampHealth(
        parts[key]?.health ?? 100,
      );

      const card = document.createElement('div');
      card.className = 'kwp-card';

      const title = document.createElement('strong');
      title.textContent = `${label} · ${health}%`;

      const bar = document.createElement('div');
      bar.className = 'kwp-bar';

      const fill = document.createElement('span');
      fill.style.width = `${health}%`;

      if (health < 30) {
        fill.style.background = '#ef4444';
      } else if (health < 60) {
        fill.style.background = '#fbbf24';
      }

      bar.appendChild(fill);
      card.append(title, bar);
      this.health.appendChild(card);
    });
  }

  renderRecoveries(calls) {
    if (!this.recoveries) return;

    this.recoveries.replaceChildren();

    const recent = [...(calls || [])]
      .reverse()
      .slice(0, 5);

    if (!recent.length) {
      this.recoveries.appendChild(
        this.createMessage('No recovery requests yet.'),
      );

      return;
    }

    recent.forEach((call) => {
      const item = document.createElement('div');
      item.className = 'kwp-item';

      const title = document.createElement('p');
      title.textContent =
        `${call.location || 'Kano roadside'} · ${
          call.status || 'requested'
        }`;

      const details = document.createElement('p');
      details.textContent =
        `Fee: ${formatMoney(call.fee)} · ETA: ${
          Number(call.etaMinutes) || 0
        } game minutes`;

      item.append(title, details);

      // Only expose payment for requests explicitly awaiting payment.
      if (call.status === 'awaiting_confirmation') {
        const payButton = document.createElement('button');

        payButton.type = 'button';
        payButton.className = 'kwp-primary';
        payButton.dataset.kwp = 'pay-recovery';
        payButton.dataset.callId = String(call.id || '');
        payButton.textContent =
          `Confirm & pay ${formatMoney(call.fee)}`;
        payButton.disabled = !call.id;

        item.appendChild(payButton);
      }

      this.recoveries.appendChild(item);
    });
  }

  renderJobs(jobs) {
    if (!this.jobs) return;

    this.jobs.replaceChildren();

    const recent = [...(jobs || [])]
      .reverse()
      .slice(0, 5);

    if (!recent.length) {
      this.jobs.appendChild(
        this.createMessage('No workshop jobs yet.'),
      );

      return;
    }

    recent.forEach((job) => {
      const item = document.createElement('div');
      item.className = 'kwp-item';

      const title = document.createElement('p');
      title.textContent =
        `${job.workshopName || job.workshopId || 'Workshop'} · ${
          job.status || 'job'
        }`;

      const details = document.createElement('p');
      details.textContent =
        `${COMPONENTS[job.component] || job.component || 'Repair'} · ${
          formatMoney(job.total ?? job.cost)
        }`;

      item.append(title, details);
      this.jobs.appendChild(item);
    });
  }

  render() {
    if (
      this.disposed ||
      !this.panel ||
      !this.bridge
    ) {
      return;
    }

    let snapshot;

    try {
      snapshot = this.bridge.snapshot();
    } catch (error) {
      console.warn(
        '[Kano Life] Workshop snapshot unavailable:',
        error,
      );

      this.setStatus(
        'Workshop status is temporarily unavailable.',
      );

      return;
    }

    if (!snapshot || snapshot.destroyed) {
      this.setStatus('Workshop status is unavailable.');
      return;
    }

    this.balance.textContent =
      `Banked balance: ${formatMoney(snapshot.balance)}`;

    this.renderHealth(snapshot.vehicle?.parts || {});
    this.renderRecoveries(snapshot.recoveryCalls || []);
    this.renderJobs(snapshot.jobs || []);
  }

  dispose() {
    if (this.disposed) return;

    this.disposed = true;
    this.opened = false;

    this.toggle?.remove();
    this.panel?.remove();

    document
      .getElementById('kano-workshop-panel-style')
      ?.remove();

    try {
      this.bridge?.destroy?.();
    } catch (error) {
      console.warn(
        '[Kano Life] Workshop cleanup warning:',
        error,
      );
    }

    this.bridge = null;
    this.game = null;
    this.container = null;
  }
}

export default KanoWorkshopPanel;