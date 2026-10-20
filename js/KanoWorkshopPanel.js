// ============================================================
// KANO LIFE — WORKSHOP PANEL
// File: js/KanoWorkshopPanel.js
//
// Responsive workshop and roadside recovery interface.
//
// SAFETY FIX:
// - The panel owns a dedicated #kano-workshop-panel element.
// - Game containers are treated as mounting locations, never as
//   the panel root.
// - Rendering the workshop cannot overwrite the game interface.
//
// Features:
// - Player wallet and vehicle condition
// - Workshop repair estimates
// - Explicit repair payment confirmation
// - Roadside recovery requests and dispatch
// - Outstanding recovery payment actions
// - Repair job progress
// - Mobile-responsive presentation
//
// Integrates with KanoWorkshopWalletBridge.
// ============================================================

import KanoWorkshopWalletBridge from './KanoWorkshopWalletBridge.js';

const PANEL_ID = 'kano-workshop-panel';
const STYLE_ID = 'kano-workshop-panel-styles';

const COMPONENTS = [
  { id: 'tyre', label: 'Tyre / tube' },
  { id: 'engine', label: 'Engine' },
  { id: 'cooling', label: 'Cooling system' },
  { id: 'brakes', label: 'Brakes' },
  { id: 'suspension', label: 'Suspension' },
  { id: 'electrical', label: 'Electrical system' },
  { id: 'body', label: 'Bodywork' },
];

const RECOVERY_TYPES = [
  { id: 'breakdown', label: 'Mechanical breakdown' },
  { id: 'engine_failure', label: 'Engine failure' },
  { id: 'overheating', label: 'Overheating' },
  { id: 'stuck', label: 'Vehicle stuck' },
  { id: 'collision', label: 'Collision damage' },
  { id: 'crash', label: 'Serious crash' },
];

const formatMoney = (amount) =>
  `₦${Math.max(0, Math.round(Number(amount) || 0)).toLocaleString('en-NG')}`;

const escapeHTML = (value) =>
  String(value ?? '').replace(/[&<>"']/g, (character) => {
    const entities = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;',
    };

    return entities[character];
  });

const clamp = (value, min, max) =>
  Math.max(min, Math.min(max, Number(value) || 0));

const healthValue = (part) => {
  if (typeof part === 'number') {
    return clamp(part, 0, 100);
  }

  return clamp(part?.health ?? 100, 0, 100);
};

const healthClass = (health) => {
  if (health <= 25) return 'critical';
  if (health <= 50) return 'warning';
  return 'healthy';
};

const statusLabel = (status) => {
  const labels = {
    awaiting_payment: 'Awaiting payment',
    in_progress: 'In progress',
    ready_for_pickup: 'Ready for collection',
    completed: 'Completed',
    awaiting_confirmation: 'Awaiting payment',
    dispatched: 'Recovery dispatched',
    arrived: 'Recovery arrived',
  };

  return labels[status] || String(status || 'Unknown');
};

export class KanoWorkshopPanel {
  constructor(options = {}) {
    this.options = options;
    this.game = options.game || null;

    /*
     * CRITICAL DOM PROTECTION
     *
     * Only an element explicitly identified as the workshop
     * panel may be used as this.root.
     *
     * An application container, game container, or canvas parent
     * must never become the root whose innerHTML is replaced.
     */

    const rootCandidates = [
      options.root,
      options.element,
      options.container,
    ];

    this.root =
      rootCandidates.find(
        (element) => element?.id === PANEL_ID,
      ) || null;

    /*
     * Existing host elements are mount targets only.
     * We append a dedicated workshop section to them.
     */
    this.mountTarget =
      options.mount ||
      options.mountPoint ||
      options.parent ||
      options.container ||
      (
        options.root?.id !== PANEL_ID
          ? options.root
          : null
      ) ||
      (
        options.element?.id !== PANEL_ID
          ? options.element
          : null
      ) ||
      null;

    this.ownsRoot = false;
    this.destroyed = false;
    this.busy = false;
    this.message = '';
    this.messageType = 'info';
    this.currentQuote = null;
    this.selectedWorkshopId = options.workshopId || '';
    this.selectedComponent = 'engine';
    this.includeService = false;

    this.bridge =
      options.bridge ||
      new KanoWorkshopWalletBridge({
        game: this.game,
        onUpdate: (event) => this.handleBridgeUpdate(event),
      });

    this.installStyles();
    this.ensureRoot();
    this.render();
  }

  // ----------------------------------------------------------
  // DOM setup
  // ----------------------------------------------------------

  installStyles() {
    if (typeof document === 'undefined') return;

    if (document.getElementById(STYLE_ID)) return;

    const style = document.createElement('style');
    style.id = STYLE_ID;

    style.textContent = `
      #${PANEL_ID} {
        --kw-bg: #0b1423;
        --kw-panel: #132238;
        --kw-panel-light: #192d45;
        --kw-border: rgba(255,255,255,.12);
        --kw-text: #f2f6fb;
        --kw-muted: #a9b8ca;
        --kw-cyan: #00b4d8;
        --kw-gold: #fbbf24;
        --kw-green: #37d996;
        --kw-red: #ff7474;

        position: relative;
        color: var(--kw-text);
        font-family: Inter, system-ui, -apple-system, BlinkMacSystemFont,
          "Segoe UI", sans-serif;
        font-size: 14px;
        width: 100%;
        max-width: 100%;
        box-sizing: border-box;
      }

      #${PANEL_ID} *,
      #${PANEL_ID} *::before,
      #${PANEL_ID} *::after {
        box-sizing: border-box;
      }

      #${PANEL_ID} .kw-shell {
        background:
          radial-gradient(ellipse at top right, rgba(0,180,216,.09), transparent 42%),
          var(--kw-bg);
        border: 1px solid var(--kw-border);
        border-radius: 18px;
        overflow: hidden;
        width: 100%;
      }

      #${PANEL_ID} .kw-header {
        padding: 19px 20px;
        display: flex;
        align-items: flex-start;
        justify-content: space-between;
        gap: 12px;
        border-bottom: 1px solid var(--kw-border);
      }

      #${PANEL_ID} .kw-eyebrow {
        color: var(--kw-cyan);
        font-size: 10px;
        font-weight: 900;
        letter-spacing: 2px;
        text-transform: uppercase;
        margin-bottom: 6px;
      }

      #${PANEL_ID} .kw-title {
        margin: 0;
        font-size: clamp(20px, 4vw, 27px);
        font-weight: 900;
        letter-spacing: -.7px;
      }

      #${PANEL_ID} .kw-subtitle {
        margin: 7px 0 0;
        color: var(--kw-muted);
        font-size: 12px;
        line-height: 1.5;
      }

      #${PANEL_ID} .kw-close {
        border: 1px solid var(--kw-border);
        background: rgba(255,255,255,.04);
        color: var(--kw-text);
        border-radius: 10px;
        width: 38px;
        height: 38px;
        font-size: 22px;
        cursor: pointer;
        flex: 0 0 auto;
      }

      #${PANEL_ID} .kw-close:hover {
        background: rgba(255,255,255,.1);
      }

      #${PANEL_ID} .kw-content {
        padding: 16px;
        display: grid;
        gap: 15px;
      }

      #${PANEL_ID} .kw-balance {
        background: linear-gradient(125deg, #102d43, #17354b);
        border: 1px solid rgba(0,180,216,.25);
        border-radius: 15px;
        padding: 17px;
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
      }

      #${PANEL_ID} .kw-balance-label {
        color: #b7c9d9;
        font-size: 11px;
        text-transform: uppercase;
        letter-spacing: 1.2px;
        font-weight: 800;
      }

      #${PANEL_ID} .kw-balance-value {
        margin-top: 6px;
        font-size: clamp(22px, 5vw, 31px);
        font-weight: 900;
        overflow-wrap: anywhere;
      }

      #${PANEL_ID} .kw-wallet-icon {
        font-size: 28px;
        opacity: .85;
      }

      #${PANEL_ID} .kw-grid {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 12px;
      }

      #${PANEL_ID} .kw-card {
        min-width: 0;
        background: var(--kw-panel);
        border: 1px solid var(--kw-border);
        border-radius: 14px;
        padding: 15px;
      }

      #${PANEL_ID} .kw-card h3 {
        margin: 0 0 13px;
        font-size: 14px;
        font-weight: 850;
      }

      #${PANEL_ID} .kw-muted {
        color: var(--kw-muted);
      }

      #${PANEL_ID} .kw-small {
        font-size: 11px;
        line-height: 1.5;
      }

      #${PANEL_ID} .kw-health-row {
        display: grid;
        grid-template-columns: minmax(0, 1fr) auto;
        gap: 7px 10px;
        margin: 12px 0;
      }

      #${PANEL_ID} .kw-health-name {
        font-size: 12px;
        font-weight: 700;
      }

      #${PANEL_ID} .kw-health-number {
        font-size: 12px;
        font-weight: 850;
        text-align: right;
      }

      #${PANEL_ID} .kw-health-track {
        grid-column: 1 / -1;
        height: 6px;
        background: rgba(255,255,255,.08);
        border-radius: 20px;
        overflow: hidden;
      }

      #${PANEL_ID} .kw-health-fill {
        height: 100%;
        border-radius: inherit;
        transition: width .2s ease;
      }

      #${PANEL_ID} .kw-health-fill.healthy {
        background: var(--kw-green);
      }

      #${PANEL_ID} .kw-health-fill.warning {
        background: var(--kw-gold);
      }

      #${PANEL_ID} .kw-health-fill.critical {
        background: var(--kw-red);
      }

      #${PANEL_ID} .kw-form {
        display: grid;
        gap: 12px;
      }

      #${PANEL_ID} .kw-field {
        display: grid;
        gap: 6px;
      }

      #${PANEL_ID} .kw-field label {
        font-size: 11px;
        font-weight: 800;
        color: #c9d6e5;
      }

      #${PANEL_ID} .kw-field select,
      #${PANEL_ID} .kw-field input {
        width: 100%;
        min-width: 0;
        border: 1px solid var(--kw-border);
        border-radius: 10px;
        padding: 11px 12px;
        color: var(--kw-text);
        background: #0d1929;
        font: inherit;
        outline: none;
      }

      #${PANEL_ID} .kw-field select:focus,
      #${PANEL_ID} .kw-field input:focus {
        border-color: var(--kw-cyan);
      }

      #${PANEL_ID} .kw-field option {
        background: #0d1929;
        color: var(--kw-text);
      }

      #${PANEL_ID} .kw-button {
        display: inline-flex;
        justify-content: center;
        align-items: center;
        gap: 7px;
        width: 100%;
        min-height: 42px;
        border: 1px solid transparent;
        border-radius: 10px;
        padding: 10px 13px;
        color: #07131f;
        background: var(--kw-cyan);
        font: inherit;
        font-size: 12px;
        font-weight: 900;
        cursor: pointer;
        text-align: center;
        transition: filter .15s ease, transform .15s ease;
      }

      #${PANEL_ID} .kw-button:hover:not(:disabled) {
        filter: brightness(1.1);
      }

      #${PANEL_ID} .kw-button:active:not(:disabled) {
        transform: translateY(1px);
      }

      #${PANEL_ID} .kw-button:disabled {
        opacity: .5;
        cursor: not-allowed;
      }

      #${PANEL_ID} .kw-button-secondary {
        background: var(--kw-panel-light);
        color: var(--kw-text);
        border-color: var(--kw-border);
      }

      #${PANEL_ID} .kw-button-gold {
        background: var(--kw-gold);
        color: #241b04;
      }

      #${PANEL_ID} .kw-button-danger {
        background: #5b2029;
        color: #ffe7e7;
        border-color: rgba(255,116,116,.2);
      }

      #${PANEL_ID} .kw-button-small {
        min-height: 35px;
        padding: 8px 10px;
      }

      #${PANEL_ID} .kw-quote {
        padding: 13px;
        margin-top: 3px;
        border: 1px solid rgba(0,180,216,.22);
        border-radius: 12px;
        background: rgba(0,180,216,.06);
      }

      #${PANEL_ID} .kw-quote-line {
        display: flex;
        align-items: flex-start;
        justify-content: space-between;
        gap: 12px;
        margin: 7px 0;
        font-size: 12px;
      }

      #${PANEL_ID} .kw-quote-total {
        padding-top: 10px;
        margin-top: 10px;
        border-top: 1px solid var(--kw-border);
        font-weight: 900;
        font-size: 15px;
      }

      #${PANEL_ID} .kw-message {
        border: 1px solid var(--kw-border);
        border-radius: 10px;
        padding: 11px 13px;
        font-size: 12px;
        line-height: 1.55;
        overflow-wrap: anywhere;
      }

      #${PANEL_ID} .kw-message.success {
        color: #b8ffe0;
        background: rgba(55,217,150,.08);
        border-color: rgba(55,217,150,.25);
      }

      #${PANEL_ID} .kw-message.error {
        color: #ffd0d0;
        background: rgba(255,116,116,.08);
        border-color: rgba(255,116,116,.25);
      }

      #${PANEL_ID} .kw-message.info {
        color: #d7eafa;
        background: rgba(0,180,216,.07);
        border-color: rgba(0,180,216,.2);
      }

      #${PANEL_ID} .kw-list {
        display: grid;
        gap: 10px;
      }

      #${PANEL_ID} .kw-list-item {
        background: rgba(255,255,255,.025);
        border: 1px solid var(--kw-border);
        border-radius: 11px;
        padding: 12px;
        min-width: 0;
      }

      #${PANEL_ID} .kw-item-top {
        display: flex;
        justify-content: space-between;
        align-items: flex-start;
        gap: 10px;
      }

      #${PANEL_ID} .kw-item-title {
        font-size: 12px;
        font-weight: 850;
        overflow-wrap: anywhere;
      }

      #${PANEL_ID} .kw-item-meta {
        color: var(--kw-muted);
        font-size: 11px;
        line-height: 1.6;
        margin-top: 6px;
        overflow-wrap: anywhere;
      }

      #${PANEL_ID} .kw-badge {
        display: inline-flex;
        align-items: center;
        padding: 4px 7px;
        border-radius: 20px;
        font-size: 9px;
        line-height: 1.4;
        font-weight: 900;
        text-transform: uppercase;
        letter-spacing: .4px;
        background: rgba(255,255,255,.08);
        color: #d5e1ef;
        text-align: center;
        flex: 0 0 auto;
      }

      #${PANEL_ID} .kw-badge.pending {
        color: #ffe3a0;
        background: rgba(251,191,36,.12);
      }

      #${PANEL_ID} .kw-badge.active {
        color: #a9f6d3;
        background: rgba(55,217,150,.12);
      }

      #${PANEL_ID} .kw-badge.failed {
        color: #ffc2c2;
        background: rgba(255,116,116,.12);
      }

      #${PANEL_ID} .kw-item-actions {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 8px;
        margin-top: 10px;
      }

      #${PANEL_ID} .kw-empty {
        padding: 16px 12px;
        border: 1px dashed var(--kw-border);
        border-radius: 11px;
        text-align: center;
        color: var(--kw-muted);
        font-size: 12px;
        line-height: 1.6;
      }

      #${PANEL_ID} .kw-divider {
        height: 1px;
        background: var(--kw-border);
        margin: 14px 0;
      }

      #${PANEL_ID} .kw-checkbox {
        display: flex;
        align-items: flex-start;
        gap: 9px;
        color: var(--kw-muted);
        font-size: 11px;
        line-height: 1.5;
      }

      #${PANEL_ID} .kw-checkbox input {
        accent-color: var(--kw-cyan);
        margin-top: 2px;
      }

      #${PANEL_ID} .kw-footer {
        padding: 12px 18px;
        color: var(--kw-muted);
        font-size: 10px;
        text-align: center;
        border-top: 1px solid var(--kw-border);
      }

      @media (max-width: 560px) {
        #${PANEL_ID} .kw-header {
          padding: 15px;
        }

        #${PANEL_ID} .kw-content {
          padding: 10px;
          gap: 10px;
        }

        #${PANEL_ID} .kw-grid {
          grid-template-columns: minmax(0, 1fr);
        }

        #${PANEL_ID} .kw-balance {
          padding: 14px;
        }

        #${PANEL_ID} .kw-card {
          padding: 13px;
        }

        #${PANEL_ID} .kw-item-actions {
          grid-template-columns: minmax(0, 1fr);
        }

        #${PANEL_ID} .kw-badge {
          white-space: normal;
        }
      }

      @media (prefers-reduced-motion: reduce) {
        #${PANEL_ID} *,
        #${PANEL_ID} *::before,
        #${PANEL_ID} *::after {
          transition: none !important;
        }
      }
    `;

    document.head.appendChild(style);
  }

  ensureRoot() {
    if (typeof document === 'undefined') return;

    /*
     * Reuse only the dedicated workshop element.
     * Never treat the game container as this.root.
     */
    if (
      this.root?.id === PANEL_ID &&
      this.root.isConnected
    ) {
      return;
    }

    const existing = document.getElementById(PANEL_ID);

    if (existing) {
      this.root = existing;
      this.ownsRoot = false;
      return;
    }

    // Create a dedicated workshop element.
    this.root = document.createElement('section');
    this.root.id = PANEL_ID;
    this.ownsRoot = true;

    const target =
      this.mountTarget?.isConnected &&
      this.mountTarget !== this.root
        ? this.mountTarget
        : document.body;

    // Append a child instead of replacing the host's contents.
    target.appendChild(this.root);
  }

  // ----------------------------------------------------------
  // Updates and messages
  // ----------------------------------------------------------

  handleBridgeUpdate() {
    if (this.destroyed) return;

    // Avoid replacing a form while a player is entering data.
    if (!this.busy) {
      this.render();
    }
  }

  setMessage(message, type = 'info') {
    this.message = String(message || '');
    this.messageType = type;

    this.render();
  }

  async runAction(action, successMessage) {
    if (this.destroyed || this.busy) return;

    this.busy = true;
    this.render();

    try {
      const result = await action();

      if (result?.ok) {
        this.message = successMessage(result);
        this.messageType = 'success';
      } else {
        this.message = this.describeFailure(result);
        this.messageType =
          result?.reason === 'payment_cancelled'
            ? 'info'
            : 'error';
      }

      this.busy = false;
      this.render();

      return result;
    } catch (error) {
      this.busy = false;
      this.message = String(
        error?.message || 'The operation could not be completed.',
      );
      this.messageType = 'error';
      this.render();

      return {
        ok: false,
        reason: 'unexpected_error',
        message: this.message,
      };
    }
  }

  describeFailure(result) {
    const messages = {
      insufficient_funds:
        'Insufficient funds. Earn more fares before paying.',
      payment_cancelled:
        'Payment was cancelled. No payment was intentionally authorised.',
      operation_in_progress:
        'This operation is already processing.',
      invalid_quote:
        'This repair estimate is invalid. Generate a new estimate.',
      quote_expired:
        'This estimate has expired. Generate a new one.',
      workshop_closed:
        'This workshop is currently closed.',
      workshop_not_found:
        'The selected workshop could not be found.',
      no_workshop_available:
        'No suitable workshop is currently available.',
      no_recovery_available:
        'No recovery provider is currently available.',
      recovery_not_found:
        'This recovery request could not be found.',
      invalid_recovery_state:
        'This recovery request has already changed status.',
      recovery_persistence_failed:
        'The recovery dispatch could not be safely saved. Check the request before trying again.',
      workshop_persistence_failed:
        'The workshop booking could not be safely saved. Check the job list before retrying.',
      transaction_failed:
        'The payment could not be completed. Check the wallet balance and transaction state.',
      repair_error:
        'The repair operation failed.',
      booking_error:
        'The workshop booking failed.',
      recovery_payment_error:
        'The recovery payment could not be completed.',
      unknown_component:
        'Select a valid repair component.',
      vehicle_not_found:
        'The player vehicle could not be found.',
      invalid_amount:
        'The payment amount is invalid.',
    };

    if (!result) {
      return 'The operation did not return a result.';
    }

    if (result.message) {
      return result.message;
    }

    return messages[result.reason] ||
      `Operation failed: ${String(result.reason || 'unknown_error')}.`;
  }

  // ----------------------------------------------------------
  // Form values
  // ----------------------------------------------------------

  readValue(id, fallback = '') {
    const element = this.root?.querySelector(`#${id}`);

    return element ? element.value : fallback;
  }

  // ----------------------------------------------------------
  // Repair flow
  // ----------------------------------------------------------

  async createRepairQuote() {
    const component = this.readValue(
      'kw-component',
      this.selectedComponent,
    );

    const workshopId = this.readValue(
      'kw-workshop',
      this.selectedWorkshopId,
    );

    const severity = Number(
      this.readValue('kw-severity', '0.6'),
    );

    const urgency = this.readValue('kw-urgency', 'normal');

    const roadside =
      this.root?.querySelector('#kw-roadside')?.checked || false;

    const quote = this.bridge.quoteWorkshopRepair({
      component,
      workshopId: workshopId || undefined,
      severity,
      urgency,
      roadside,
    });

    if (!quote?.ok) {
      this.currentQuote = null;
      this.setMessage(
        this.describeFailure(quote),
        'error',
      );
      return quote;
    }

    this.currentQuote = quote;
    this.selectedComponent = component;
    this.selectedWorkshopId = quote.workshopId;
    this.message = 'Estimate created. Review the amount before booking.';
    this.messageType = 'success';

    this.render();

    return quote;
  }

  async bookCurrentRepair() {
    if (!this.currentQuote?.ok) {
      this.setMessage(
        'Generate a repair estimate before booking.',
        'error',
      );

      return {
        ok: false,
        reason: 'invalid_quote',
      };
    }

    const quote = this.currentQuote;

    return this.runAction(
      () =>
        this.bridge.bookWorkshopRepair(quote, {
          paymentConfirmed: true,
        }),
      (result) => {
        const job = result.result?.job || result.job;

        return job
          ? `Repair booked at ${job.workshopName}. Status: ${statusLabel(job.status)}.`
          : 'Workshop repair booking completed.';
      },
    );
  }

  async repairLifecycle(includeService = false) {
    return this.runAction(
      () =>
        this.bridge.payLifecycleRepair({
          workshop: true,
          includeService,
        }),
      (result) => {
        if (result.reason === 'no_repair_needed') {
          return 'No repair is currently required.';
        }

        return 'Vehicle repair completed and wallet updated.';
      },
    );
  }

  // ----------------------------------------------------------
  // Recovery flow
  // ----------------------------------------------------------

  async requestRecovery() {
    const location = this.readValue(
      'kw-recovery-location',
      'Kano roadside',
    ).trim();

    const severity = this.readValue(
      'kw-recovery-type',
      'breakdown',
    );

    if (!location) {
      this.setMessage(
        'Enter the roadside location before requesting assistance.',
        'error',
      );

      return {
        ok: false,
        reason: 'location_required',
      };
    }

    return this.runAction(
      () =>
        Promise.resolve(
          this.bridge.requestRecovery({
            severity,
            location,
            distanceKm: 3,
          }),
        ),
      (result) =>
        `Recovery request created. Provider: ${result.call.workshopName}. Fee: ${formatMoney(result.call.fee)}. Review the outstanding request and confirm payment to dispatch assistance.`,
    );
  }

  async payRecovery(callId) {
    return this.runAction(
      () => this.bridge.payRecovery(callId),
      (result) => {
        const call = result.call;

        return call
          ? `Payment successful. Recovery has been dispatched to ${call.location}. Estimated arrival: ${call.etaMinutes} minutes.`
          : 'Recovery payment completed.';
      },
    );
  }

  // ----------------------------------------------------------
  // HTML render helpers
  // ----------------------------------------------------------

  renderBalance(snapshot) {
    return `
      <section class="kw-balance">
        <div>
          <div class="kw-balance-label">Available game wallet</div>
          <div class="kw-balance-value">${formatMoney(snapshot.balance)}</div>
          <div class="kw-small kw-muted">Payments use your existing Kano Life wallet.</div>
        </div>
        <div class="kw-wallet-icon" aria-hidden="true">₦</div>
      </section>
    `;
  }

  renderHealth(snapshot) {
    const vehicle = snapshot.vehicle;
    const parts = vehicle?.parts || {};

    const health = [
      {
        name: 'Engine',
        value: healthValue(parts.engine),
      },
      {
        name: 'Tyres',
        value: healthValue(parts.tyre ?? parts.tyres),
      },
      {
        name: 'Cooling',
        value: healthValue(parts.cooling),
      },
      {
        name: 'Brakes',
        value: healthValue(parts.brakes),
      },
      {
        name: 'Suspension',
        value: healthValue(parts.suspension),
      },
      {
        name: 'Bodywork',
        value: healthValue(parts.body),
      },
    ];

    return `
      <section class="kw-card">
        <h3>Vehicle condition</h3>
        ${
          vehicle
            ? health
                .map(
                  (item) => `
                    <div class="kw-health-row">
                      <div class="kw-health-name">${item.name}</div>
                      <div class="kw-health-number">${Math.round(item.value)}%</div>
                      <div class="kw-health-track">
                        <div
                          class="kw-health-fill ${healthClass(item.value)}"
                          style="width:${item.value}%"
                        ></div>
                      </div>
                    </div>
                  `,
                )
                .join('')
            : `
              <div class="kw-empty">
                Vehicle condition is currently unavailable.
              </div>
            `
        }
        <div class="kw-divider"></div>
        <button
          type="button"
          class="kw-button kw-button-secondary"
          data-action="lifecycle-repair"
          ${this.busy ? 'disabled' : ''}
        >
          Repair vehicle
        </button>
        <label class="kw-checkbox" style="margin-top:10px">
          <input
            type="checkbox"
            id="kw-include-service"
            ${this.includeService ? 'checked' : ''}
          />
          <span>Include routine maintenance if it is due.</span>
        </label>
        <button
          type="button"
          class="kw-button kw-button-secondary"
          data-action="refresh"
          style="margin-top:10px"
          ${this.busy ? 'disabled' : ''}
        >
          Refresh condition
        </button>
      </section>
    `;
  }

  renderWorkshopForm(snapshot) {
    const workshops = (snapshot.workshops || []).filter(
      (workshop) => workshop.open,
    );

    const selectedWorkshop =
      workshops.find(
        (workshop) => workshop.id === this.selectedWorkshopId,
      ) || workshops[0];

    const selectedId = selectedWorkshop?.id || '';

    const workshopOptions = workshops.length
      ? workshops
          .map(
            (workshop) => `
              <option
                value="${escapeHTML(workshop.id)}"
                ${workshop.id === selectedId ? 'selected' : ''}
              >
                ${escapeHTML(workshop.name)}
              </option>
            `,
          )
          .join('')
      : '<option value="">No open workshops</option>';

    const componentOptions = COMPONENTS.map(
      (component) => `
        <option
          value="${component.id}"
          ${component.id === this.selectedComponent ? 'selected' : ''}
        >
          ${component.label}
        </option>
      `,
    ).join('');

    return `
      <section class="kw-card">
        <h3>Workshop repairs</h3>
        <p class="kw-muted kw-small">
          Select a repair and request an estimate before authorising payment.
        </p>

        <div class="kw-form">
          <div class="kw-field">
            <label for="kw-workshop">Workshop</label>
            <select id="kw-workshop" ${this.busy ? 'disabled' : ''}>
              ${workshopOptions}
            </select>
          </div>

          <div class="kw-field">
            <label for="kw-component">Repair component</label>
            <select id="kw-component" ${this.busy ? 'disabled' : ''}>
              ${componentOptions}
            </select>
          </div>

          <div class="kw-field">
            <label for="kw-severity">Damage severity</label>
            <select id="kw-severity" ${this.busy ? 'disabled' : ''}>
              <option value="0.25">Minor</option>
              <option value="0.5">Moderate</option>
              <option value="0.75" selected>Major</option>
              <option value="1">Severe</option>
            </select>
          </div>

          <div class="kw-field">
            <label for="kw-urgency">Service urgency</label>
            <select id="kw-urgency" ${this.busy ? 'disabled' : ''}>
              <option value="normal">Standard service</option>
              <option value="urgent">Urgent</option>
              <option value="emergency">Emergency service</option>
            </select>
          </div>

          <label class="kw-checkbox">
            <input type="checkbox" id="kw-roadside" ${this.busy ? 'disabled' : ''} />
            <span>Request roadside repair pricing.</span>
          </label>

          <button
            type="button"
            class="kw-button"
            data-action="quote"
            ${this.busy || workshops.length === 0 ? 'disabled' : ''}
          >
            Get repair estimate
          </button>

          ${this.renderQuote()}
        </div>
      </section>
    `;
  }

  renderQuote() {
    const quote = this.currentQuote;

    if (!quote?.ok) return '';

    return `
      <div class="kw-quote">
        <div class="kw-quote-line">
          <span class="kw-muted">Workshop</span>
          <strong>${escapeHTML(quote.workshopName)}</strong>
        </div>
        <div class="kw-quote-line">
          <span class="kw-muted">Repair</span>
          <strong>${escapeHTML(quote.componentLabel)}</strong>
        </div>
        <div class="kw-quote-line">
          <span class="kw-muted">Parts</span>
          <strong>${formatMoney(quote.partsCost)}</strong>
        </div>
        <div class="kw-quote-line">
          <span class="kw-muted">Labour</span>
          <strong>${formatMoney(quote.labourCost)}</strong>
        </div>
        <div class="kw-quote-line">
          <span class="kw-muted">Estimated time</span>
          <strong>${quote.durationMinutes} minutes</strong>
        </div>
        <div class="kw-quote-line kw-quote-total">
          <span>Total estimate</span>
          <strong>${formatMoney(quote.totalCost)}</strong>
        </div>
        <p class="kw-muted kw-small">
          This estimate expires in approximately five minutes.
          Payment is requested only when you book the repair.
        </p>
        <button
          type="button"
          class="kw-button kw-button-gold"
          data-action="book-repair"
          ${this.busy ? 'disabled' : ''}
        >
          Confirm and pay
        </button>
      </div>
    `;
  }

  renderRecoveryForm() {
    const recoveryOptions = RECOVERY_TYPES.map(
      (item) => `
        <option value="${item.id}">${item.label}</option>
      `,
    ).join('');

    return `
      <section class="kw-card">
        <h3>Roadside recovery</h3>
        <p class="kw-muted kw-small">
          Request assistance for a breakdown, overheating, collision,
          or a vehicle stuck on Kano roads.
        </p>

        <div class="kw-form">
          <div class="kw-field">
            <label for="kw-recovery-type">Incident</label>
            <select id="kw-recovery-type" ${this.busy ? 'disabled' : ''}>
              ${recoveryOptions}
            </select>
          </div>

          <div class="kw-field">
            <label for="kw-recovery-location">Your location</label>
            <input
              id="kw-recovery-location"
              type="text"
              maxlength="120"
              value="Kano roadside"
              placeholder="Enter a nearby road or landmark"
              ${this.busy ? 'disabled' : ''}
            />
          </div>

          <button
            type="button"
            class="kw-button kw-button-gold"
            data-action="request-recovery"
            ${this.busy ? 'disabled' : ''}
          >
            Request recovery
          </button>

          <p class="kw-muted kw-small">
            The recovery fee is shown before payment. A request does not
            dispatch assistance until payment is confirmed.
          </p>
        </div>
      </section>
    `;
  }

  renderRecoveries(snapshot) {
    const calls = [...(snapshot.recoveryCalls || [])].sort(
      (a, b) => (b.createdAt || 0) - (a.createdAt || 0),
    );

    if (!calls.length) {
      return `
        <section class="kw-card">
          <h3>Recovery requests</h3>
          <div class="kw-empty">
            No roadside recovery requests yet.
          </div>
        </section>
      `;
    }

    const items = calls
      .map((call) => {
        const pending =
          call.status === 'awaiting_confirmation';

        const active = [
          'dispatched',
          'arrived',
        ].includes(call.status);

        const badgeClass = pending
          ? 'pending'
          : active
            ? 'active'
            : call.status === 'completed'
              ? ''
              : 'failed';

        return `
          <article class="kw-list-item">
            <div class="kw-item-top">
              <div class="kw-item-title">
                ${escapeHTML(call.severityLabel || call.severity)}
              </div>
              <span class="kw-badge ${badgeClass}">
                ${escapeHTML(statusLabel(call.status))}
              </span>
            </div>

            <div class="kw-item-meta">
              <div><strong>Provider:</strong> ${escapeHTML(call.workshopName)}</div>
              <div><strong>Location:</strong> ${escapeHTML(call.location)}</div>
              <div><strong>Fee:</strong> ${formatMoney(call.fee)}</div>
              ${
                active
                  ? `<div><strong>ETA:</strong> ${Math.max(0, Number(call.etaMinutes) || 0)} minutes</div>`
                  : ''
              }
            </div>

            ${
              pending
                ? `
                  <div class="kw-item-actions">
                    <button
                      type="button"
                      class="kw-button kw-button-gold kw-button-small"
                      data-action="pay-recovery"
                      data-id="${escapeHTML(call.id)}"
                      ${this.busy ? 'disabled' : ''}
                    >
                      Confirm and pay
                    </button>
                  </div>
                `
                : ''
            }
          </article>
        `;
      })
      .join('');

    return `
      <section class="kw-card">
        <h3>Recovery requests</h3>
        <div class="kw-list">${items}</div>
      </section>
    `;
  }

  renderJobs(snapshot) {
    const jobs = [...(snapshot.jobs || [])].sort(
      (a, b) => (b.createdAt || 0) - (a.createdAt || 0),
    );

    if (!jobs.length) {
      return `
        <section class="kw-card">
          <h3>Workshop jobs</h3>
          <div class="kw-empty">
            No repair jobs have been booked.
          </div>
        </section>
      `;
    }

    const items = jobs
      .map(
        (job) => `
          <article class="kw-list-item">
            <div class="kw-item-top">
              <div class="kw-item-title">
                ${escapeHTML(job.componentLabel || job.component)}
              </div>
              <span class="kw-badge ${
                job.status === 'completed' ||
                job.status === 'ready_for_pickup'
                  ? 'active'
                  : job.status === 'awaiting_payment'
                    ? 'pending'
                    : ''
              }">
                ${escapeHTML(statusLabel(job.status))}
              </span>
            </div>
            <div class="kw-item-meta">
              <div><strong>Workshop:</strong> ${escapeHTML(job.workshopName)}</div>
              <div><strong>Cost:</strong> ${formatMoney(job.cost)}</div>
              <div><strong>Remaining time:</strong> ${Math.max(0, Number(job.remainingMinutes) || 0)} minutes</div>
            </div>
          </article>
        `,
      )
      .join('');

    return `
      <section class="kw-card">
        <h3>Workshop jobs</h3>
        <div class="kw-list">${items}</div>
      </section>
    `;
  }

  renderMessage() {
    if (!this.message) return '';

    return `
      <div class="kw-message ${escapeHTML(this.messageType)}" role="status" aria-live="polite">
        ${escapeHTML(this.message)}
      </div>
    `;
  }

  // ----------------------------------------------------------
  // Main render
  // ----------------------------------------------------------

  render() {
    /*
     * Every innerHTML operation in this class is now scoped to
     * the dedicated workshop element created by ensureRoot().
     */
    if (this.destroyed || !this.root || this.root.id !== PANEL_ID) {
      return;
    }

    let snapshot;

    try {
      snapshot = this.bridge.snapshot();
    } catch (error) {
      this.root.innerHTML = `
        <div class="kw-shell">
          <div class="kw-header">
            <div>
              <div class="kw-eyebrow">Kano Life · Vehicle services</div>
              <h2 class="kw-title">Workshop & Recovery</h2>
            </div>
          </div>
          <div class="kw-content">
            <div class="kw-message error">
              ${escapeHTML(error?.message || 'Workshop state is unavailable.')}
            </div>
          </div>
        </div>
      `;

      return;
    }

    this.root.innerHTML = `
      <div class="kw-shell">
        <header class="kw-header">
          <div>
            <div class="kw-eyebrow">Kano Life · Vehicle services</div>
            <h2 class="kw-title">Workshop & Recovery</h2>
            <p class="kw-subtitle">
              Keep your keke roadworthy. Manage repairs, workshop payments,
              and roadside assistance.
            </p>
          </div>

          <button
            type="button"
            class="kw-close"
            data-action="close"
            aria-label="Close workshop"
            title="Close workshop"
          >×</button>
        </header>

        <main class="kw-content">
          ${this.renderBalance(snapshot)}
          ${this.renderMessage()}

          <div class="kw-grid">
            ${this.renderHealth(snapshot)}
            ${this.renderWorkshopForm(snapshot)}
          </div>

          <div class="kw-grid">
            ${this.renderRecoveryForm()}
            ${this.renderRecoveries(snapshot)}
          </div>

          ${this.renderJobs(snapshot)}
        </main>

        <footer class="kw-footer">
          KANO LIFE · Vehicle maintenance and roadside assistance
        </footer>
      </div>
    `;

    this.bindEvents();
  }

  // ----------------------------------------------------------
  // Event handlers
  // ----------------------------------------------------------

  bindEvents() {
    if (!this.root || this.root.id !== PANEL_ID) return;

    this.root.querySelectorAll('[data-action]').forEach((button) => {
      button.addEventListener('click', async (event) => {
        const target = event.currentTarget;
        const action = target.dataset.action;
        const id = target.dataset.id;

        if (this.destroyed) return;

        switch (action) {
          case 'close':
            this.close();
            break;

          case 'quote':
            await this.createRepairQuote();
            break;

          case 'book-repair':
            await this.bookCurrentRepair();
            break;

          case 'lifecycle-repair': {
            const checkbox =
              this.root.querySelector('#kw-include-service');

            this.includeService = Boolean(checkbox?.checked);

            await this.repairLifecycle(this.includeService);
            break;
          }

          case 'request-recovery':
            await this.requestRecovery();
            break;

          case 'pay-recovery':
            if (id) await this.payRecovery(id);
            break;

          case 'refresh':
            try {
              const result = this.bridge.syncLifecycleFromGame({
                force: false,
              });

              this.setMessage(
                result?.skipped
                  ? 'Existing lifecycle damage was preserved.'
                  : 'Vehicle condition refreshed.',
                'success',
              );
            } catch (error) {
              this.setMessage(
                String(error?.message || 'Could not refresh vehicle condition.'),
                'error',
              );
            }
            break;

          default:
            break;
        }
      });
    });

    this.root
      .querySelector('#kw-component')
      ?.addEventListener('change', (event) => {
        this.selectedComponent = event.target.value;
        this.currentQuote = null;
      });

    this.root
      .querySelector('#kw-workshop')
      ?.addEventListener('change', (event) => {
        this.selectedWorkshopId = event.target.value;
        this.currentQuote = null;
      });
  }

  // ----------------------------------------------------------
  // Open / close / dispose
  // ----------------------------------------------------------

  open() {
    if (this.destroyed) return;

    this.ensureRoot();

    if (this.root?.id === PANEL_ID) {
      this.root.hidden = false;
      this.root.style.display = '';
    }

    this.render();
  }

  close() {
    if (this.destroyed) return;

    if (typeof this.options.onClose === 'function') {
      this.options.onClose();
      return;
    }

    if (this.root?.id === PANEL_ID) {
      this.root.hidden = true;
      this.root.style.display = 'none';
    }
  }

  dispose() {
    if (this.destroyed) return;

    this.destroyed = true;

    /*
     * Empty or remove only this panel's dedicated element.
     * Never clear the surrounding game container.
     */
    if (this.root?.id === PANEL_ID) {
      this.root.replaceChildren();

      if (this.ownsRoot) {
        this.root.remove();
      }
    }

    // The panel may receive a bridge owned by another controller.
    if (!this.options.bridge) {
      this.bridge?.destroy?.();
    }

    this.root = null;
    this.mountTarget = null;
    this.game = null;
    this.currentQuote = null;
  }

  destroy() {
    this.dispose();
  }
}

export default KanoWorkshopPanel;