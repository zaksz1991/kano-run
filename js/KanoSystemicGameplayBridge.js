import { KanoMarketDayDirector } from './KanoMarketDayDirector.js';
import { KanoWeddingConvoyDirector } from './KanoWeddingConvoyDirector.js';
import { KanoVehicleLifecycleDirector } from './KanoVehicleLifecycleDirector.js';
import { KanoWorkshopRecoveryDirector } from './KanoWorkshopRecoveryDirector.js';

const clamp = (n, min, max) => Math.max(min, Math.min(max, Number(n) || 0));

/**
 * Connects existing Kano Life market, convoy, maintenance and workshop systems
 * through one lifecycle. This bridge deliberately does not spawn meshes, edit
 * fare values, charge the wallet, or replace Game/Renderer3D/Controls.
 * The host must connect the emitted events to its real scene and economy.
 */
export class KanoSystemicGameplayBridge {
  constructor({ game, root = document.body, onEvent = () => {}, enabled = true } = {}) {
    this.game = game;
    this.root = root;
    this.onEvent = typeof onEvent === 'function' ? onEvent : () => {};
    this.enabled = Boolean(enabled && game);
    this.disposed = false;
    this.elapsed = 0;
    this.previousDistance = null;
    this.playerVehicleId = 'player-keke';
    this.disposers = [];
    if (!this.enabled) return;

    const forward = (payload) => this.emit(payload?.type || 'system_event', payload || {});
    this.market = new KanoMarketDayDirector({ onEvent: forward });
    this.convoy = new KanoWeddingConvoyDirector({
      onEvent: forward,
      onInvitation: (event) => {
        forward({ type: 'convoy_invitation', event });
        this.showConvoyInvitation(event);
      },
      onHorn: (event) => forward({ type: 'convoy_horn_request', ...event }),
      onIncident: (incident) => forward({ type: 'convoy_incident', incident }),
      onConvoyState: (state) => forward({ type: 'convoy_state', ...state }),
    });
    this.vehicles = new KanoVehicleLifecycleDirector({ autoSave: true });
    this.workshops = new KanoWorkshopRecoveryDirector({ autoLoad: true, onEvent: forward });
    if (!this.vehicles.getVehicle(this.playerVehicleId)) {
      this.vehicles.createVehicle({ id: this.playerVehicleId, type: 'keke', name: 'Player Adaidaita Sahu' });
    }
    this.bindRootActions();
  }

  emit(payload) {
    if (!this.enabled || this.disposed) return;
    const detail = { source: 'KanoSystemicGameplayBridge', at: Date.now(), ...payload };
    try { this.onEvent(detail); } catch (error) { console.warn('[Kano Life] event listener failed', error); }
    try { window.dispatchEvent(new CustomEvent(`kano:${detail.type}`, { detail })); } catch { /* non-browser test */ }
  }

  bindRootActions() {
    if (!this.root?.addEventListener) return;
    const handler = (event) => {
      const button = event.target?.closest?.('[data-kano-convoy-action]');
      if (!button || !this.root.contains(button)) return;
      const action = button.dataset.kanoConvoyAction;
      if (action === 'accept') {
        const accepted = this.convoy.acceptInvitation({ id: 'player', vehicleId: this.playerVehicleId }, []);
        if (accepted) this.removeInvitation();
      } else if (action === 'decline') {
        this.convoy.declineInvitation('player_declined');
        this.removeInvitation();
      }
    };
    this.root.addEventListener('click', handler);
    this.disposers.push(() => this.root.removeEventListener('click', handler));
  }

  showConvoyInvitation(event) {
    if (!this.root?.appendChild || typeof document === 'undefined') return;
    this.removeInvitation();
    const panel = document.createElement('section');
    panel.className = 'kano-convoy-invitation';
    panel.dataset.kanoConvoyPanel = 'true';
    panel.setAttribute('role', 'dialog');
    panel.setAttribute('aria-label', 'Keke convoy invitation');
    panel.innerHTML = `<strong>GAYYATAR TAFIYAR KEKE</strong><p>${this.escape(event.kind)} — ${this.escape(event.location)}</p><p>Join the celebration convoy?</p><div><button type="button" data-kano-convoy-action="accept">Join convoy</button><button type="button" data-kano-convoy-action="decline">Not now</button></div>`;
    this.root.appendChild(panel);
    this.invitationPanel = panel;
  }

  escape(value) {
    return String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  }

  removeInvitation() {
    this.invitationPanel?.remove?.();
    this.invitationPanel = null;
  }

  /**
   * Call from the existing frame loop. dt must be simulation seconds.
   * `context.day` is a 1-based in-game day; `minuteOfDay` is 0..1439.
   */
  update(dt, context = {}) {
    if (!this.enabled || this.disposed) return;
    const delta = clamp(dt, 0, 0.25);
    this.elapsed += delta;
    const state = context.state || this.game?.s || {};
    this.market.update(delta, {
      day: context.day,
      minuteOfDay: context.minuteOfDay,
    });
    this.convoy.update(delta, {
      inWorld: this.game?.state === 'PLAY',
      congestion: context.congestion,
      locations: context.locations,
      spectatorDensity: context.spectatorDensity,
    });
    const snapshot = {
      market: this.market.snapshot(),
      convoy: this.convoy.getSnapshot(),
      vehicle: this.vehicles.getVehicle(this.playerVehicleId),
      workshops: this.workshops.listWorkshops(),
    };
    this.lastSnapshot = snapshot;
    this.emit({ type: 'systemic_snapshot', snapshot });
    return snapshot;
  }

  getFareMultiplier() { return this.market?.getFareMultiplier?.() ?? 1; }
  getTrafficMultiplier() { return this.market?.getTrafficMultiplier?.() ?? 1; }
  getVehicle() { return this.vehicles?.getVehicle(this.playerVehicleId) ?? null; }
  getWorkshops() { return this.workshops?.listWorkshops() ?? []; }

  /** Must be called only after the existing wallet confirms a repair payment. */
  confirmWorkshopPayment(jobId, paymentReference) {
    return this.workshops?.confirmRepairPayment(jobId, paymentReference) ?? { ok: false, reason: 'bridge_disabled' };
  }

  /** Hook this into the actual collision system to register convoy consequences. */
  reportConvoyIncident(details) { return this.convoy?.reportIncident(details) ?? false; }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    for (const dispose of this.disposers.splice(0)) { try { dispose(); } catch { /* cleanup */ } }
    this.removeInvitation();
    this.convoy?.dispose();
    this.enabled = false;
  }
}

export default KanoSystemicGameplayBridge;
