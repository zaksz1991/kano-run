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
//
// Dependencies:
// - KanoWorkshopWalletBridge.js
// - Existing game instance
// ============================================================

import { KanoWorkshopWalletBridge } from './KanoWorkshopWalletBridge.js';

const formatMoney = (amount) =>
  `₦${Math.floor(Number(amount) || 0).toLocaleString('en-NG')}`;

const clampHealth = (value) =>
  Math.max(0, Math.min(100, Math.round(Number(value) || 0)));

export class KanoWorkshopPanel {
  constructor({
    game,
    container = document.getElementById('game-container'),
    mobile = false,
  } = {}) {
    if (!game) {
      throw new Error(
        'KanoWorkshopPanel requires an active Game instance.'
      );
    }

    this.game = game;
    this.container = container || document.body;
    this.mobile = mobile;
    this.opened = false;

    this.bridge = new KanoWorkshopWalletBridge({
      game,
      onUpdate: () => this.render(),
      onMessage: (message) => {
        if (this.status) {
          this.status.textContent = message;
        }

        this.render();
      },
    });

    this.mount();
    this.render();
  }

  mount() {
    if (document.getElementById('kano-workshop-toggle')) {
      return;
    }

    const style = document.createElement('style');

    style.id = 'kano-workshop-panel-style';

    style.textContent = `
      #kano-workshop-toggle {
        position: fixed;
        z-index: 1200;
        right: 12px;
        top: calc(env(safe-area-inset-top, 0px) + 72px);
        border: 1px solid #fbbf24;
        border-radius: 999px;
        background: #0b1e3a;
        color: #fff;
        padding: 11px 14px;
        font: 700 12px/1.2 system-ui;
        box-shadow: 0 4px 18px #0005;
      }

      #kano-workshop-panel {
        position: fixed;
        z-index: 1199;
        right: 10px;
        top: calc(env(safe-area-inset-top, 0px) + 120px);
        width: min(390px, calc(100vw - 20px));
        max-height: min(72vh, 680px);
        overflow-y: auto;
        background: #071526f7;
        color: #f8fafc;
        border: 1px solid #00b4d8;
        border-radius: 16px;
        box-shadow: 0 18px 60px #0009;
        padding: 14px;
        font: 14px/1.45 system-ui;
        display: none;
        overscroll-behavior: contain;
      }

      #kano-workshop-panel.open {
        display: block;
      }

      #kano-workshop-panel h2 {
        font-size: 17px;
        margin: 0 0 5px;
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
        grid-template-columns: 1fr 1fr;
        gap: 8px;
      }

      #kano-workshop-panel .kwp-card {
        background: #10253d;
        border: 1px solid #29445e;
        border-radius: 10px;
        padding: 9px;
        min-width: 0;
      }

      #kano-workshop-panel .kwp-card strong {
        display: block;
        font-size: 12px;
        text-transform: capitalize;
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
        min-height: 40px;
        border-radius: 9px;
        border: 1px solid #42617c;
        background: #132b45;
        color: #fff;
        padding: 8px;
        font: 600 12px system-ui;
      }

      #kano-workshop-panel button {
        cursor: pointer;
      }

      #kano-workshop-panel .kwp-primary {
        background: #00b4d8;
        color: #071526;
        border-color: #00b4d8;
      }

      #kano-workshop-panel .kwp-close {
        float: right;
        width: auto;
        min-height: 30px;
        padding: 4px 10px;
      }

      #kano-workshop-panel .kwp-row {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 8px;
        margin-top: 8px;
      }

      #kano-workshop-panel .kwp-status {
        margin-top: 10px;
        background: #10253d;
        border-radius: 9px;
        padding: 9px;
        font-size: 12px;
        color: #fbbf24;
        overflow-wrap: anywhere;
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
        }

        #kano-workshop-panel {
          top: auto;
          bottom: calc(env(safe-area-inset-bottom, 0px) + 196px);
          max-height: 65vh;
        }
      }
    `;

    document.head.appendChild(style);

    this.toggle = document.createElement('button');
    this.toggle.id = 'kano-workshop-toggle';
    this.toggle.type = 'button';
    this.toggle.textContent = '🔧 WORKSHOP';
    this.toggle.setAttribute(
      'aria-controls',
      'kano-workshop-panel'
    );
    this.toggle.setAttribute('aria-expanded', 'false');

    this.toggle.addEventListener('click', () => {
      this.setOpen(!this.opened);
    });

    this.panel = document.createElement('section');
    this.panel.id = 'kano-workshop-panel';
    this.panel.setAttribute(
      'aria-label',
      'Keke workshop and roadside recovery'
    );

    this.panel.innerHTML = `
      <button
        class="kwp-close"
        type="button"
        data-kwp="close"
        aria-label="Close workshop"
      >
        Close ✕
      </button>

      <h2>KANO LIFE · Keke Workshop</h2>

      <div class="kwp-sub">
        Maintain your keke and manage repair expenses.
      </div>

      <div id="kwp-balance" class="kwp-card">
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
        >
          Repair damaged parts
        </button>

        <button
          type="button"
          data-kwp="service"
        >
          Repair + full service
        </button>
      </div>

      <h3>Roadside recovery</h3>

      <label class="kwp-sub" for="kwp-severity">
        Recovery reason
      </label>

      <select id="kwp-severity">
        <option value="breakdown">
          Engine / general breakdown
        </option>

        <option value="collision">
          Collision damage
        </option>

        <option value="stuck">
          Stuck in pothole / roadside
        </option>

        <option value="overheating">
          Overheating
        </option>
      </select>

      <div class="kwp-row">
        <button
          type="button"
          class="kwp-primary"
          data-kwp="recovery"
        >
          Request recovery
        </button>

        <button
          type="button"
          data-kwp="refresh"
        >
          Refresh status
        </button>
      </div>

      <h3>Workshop and recovery status</h3>

      <div id="kwp-jobs" class="kwp-sub">
        No jobs yet.
      </div>

      <div
        id="kwp-status"
        class="kwp-status"
        role="status"
        aria-live="polite"
      >
        Workshop ready.
      </div>

      <div class="kwp-note">
        Recovery is simulated in-game. It does not contact a
        real mechanic or roadside recovery service.
      </div>
    `;

    document.body.append(this.toggle, this.panel);

    this.health = this.panel.querySelector('#kwp-health');
    this.balance = this.panel.querySelector('#kwp-balance');
    this.jobs = this.panel.querySelector('#kwp-jobs');
    this.status = this.panel.querySelector('#kwp-status');

    this.panel.addEventListener('click', (event) => {
      const button = event.target.closest('[data-kwp]');

      if (!button) return;

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
      }
    });
  }

  setOpen(open) {
    this.opened = Boolean(open);

    this.panel.classList.toggle('open', this.opened);

    this.toggle.setAttribute(
      'aria-expanded',
      String(this.opened)
    );

    this.toggle.textContent = this.opened
      ? '🔧 CLOSE WORKSHOP'
      : '🔧 WORKSHOP';

    if (this.opened) {
      this.render();
    }
  }

  repair(includeService) {
    const result = this.bridge.payLifecycleRepair({
      workshop: true,
      includeService,
    });

    if (!result.ok) {
      const messages = {
        no_repair_needed:
          'Your tracked vehicle parts do not currently need repair.',

        insufficient_funds:
          `Insufficient banked funds. Repair quote: ${
            formatMoney(result.quote?.total)
          }.`,

        cancelled:
          'Repair payment cancelled.',
      };

      this.status.textContent =
        messages[result.reason] ||
        result.message ||
        'Repair could not be completed.';

      this.render();
      return;
    }

    this.status.textContent =
      `Repair completed. Paid ${formatMoney(result.quote?.total)}.`;

    this.game.ui?.toast?.(
      `Keke workshop: repair completed · ${
        formatMoney(result.quote?.total)
      }.`
    );

    this.render();
  }

  recovery() {
    const severity =
      this.panel.querySelector('#kwp-severity').value;

    const call = this.bridge.requestRecovery({
      severity,

      location: this.game.route?.name
        ? `${this.game.route.name}, Kano`
        : 'Kano roadside',

      distanceKm: 3,
    });

    const result = this.bridge.payRecovery(call.id);

    if (!result.ok) {
      const messages = {
        insufficient_funds:
          `Not enough banked funds. Recovery fee: ${
            formatMoney(result.fee)
          }.`,

        cancelled:
          'Recovery request cancelled.',
      };

      this.status.textContent =
        messages[result.reason] ||
        result.message ||
        'Recovery could not be dispatched.';

      this.render();
      return;
    }

    this.status.textContent =
      `Recovery dispatched. Estimated arrival: ${
        call.etaMinutes
      } game minutes.`;

    this.game.ui?.toast?.('Roadside recovery dispatched.');

    this.render();
  }

  render() {
    if (!this.panel || !this.bridge) return;

    const snapshot = this.bridge.snapshot();

    this.balance.textContent =
      `Banked balance: ${formatMoney(snapshot.balance)}`;

    const parts = snapshot.vehicle?.parts || {};

    const labels = {
      engine: 'Engine',
      tyres: 'Tyres',
      cooling: 'Cooling',
      brakes: 'Brakes',
      suspension: 'Suspension',
      body: 'Body',
    };

    this.health.replaceChildren();

    Object.entries(labels).forEach(([key, label]) => {
      const health = clampHealth(
        parts[key]?.health ?? 100
      );

      const card = document.createElement('div');
      card.className = 'kwp-card';

      const title = document.createElement('strong');
      title.textContent = `${label} · ${health}%`;

      const bar = document.createElement('div');
      bar.className = 'kwp-bar';

      const fill = document.createElement('span');
      fill.style.width = `${health}%`;

      bar.appendChild(fill);
      card.append(title, bar);
      this.health.appendChild(card);
    });

    const entries = [];

    (snapshot.jobs || [])
      .slice(-3)
      .reverse()
      .forEach((job) => {
        entries.push(
          `${job.workshopName || job.workshopId || 'Workshop'} · ${
            job.status || 'job'
          }${
            job.total ? ` · ${formatMoney(job.total)}` : ''
          }`
        );
      });

    (snapshot.recoveryCalls || [])
      .slice(-3)
      .reverse()
      .forEach((call) => {
        entries.push(
          `Recovery · ${call.status || 'requested'}${
            call.fee ? ` · ${formatMoney(call.fee)}` : ''
          }${
            call.etaMinutes != null
              ? ` · ETA ${call.etaMinutes}m`
              : ''
          }`
        );
      });

    this.jobs.textContent = entries.length
      ? entries.join(' | ')
      : 'No repair jobs or recovery calls yet.';
  }

  dispose() {
    this.toggle?.remove();
    this.panel?.remove();

    document
      .getElementById('kano-workshop-panel-style')
      ?.remove();
  }
}