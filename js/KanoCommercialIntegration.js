/**
 * Kano Life commercial integration coordinator.
 * Additive coordinator: does not replace Game, storage.js, Controls, renderer,
 * KanoAdaptiveQuality, LiveUserCounter, or the existing radio implementation.
 *
 * Emits integration events for existing gameplay systems and manages optional
 * passenger speech anchors without requiring passenger DOM to exist.
 */
import { PassengerDialogueManager, installPassengerDialogueStyles } from './PassengerDialogueManager.js';

export class KanoCommercialIntegration {
  constructor({ root = document.getElementById('game-container') || document.body, game = null, enabled = true } = {}) {
    this.root = root;
    this.game = game;
    this.enabled = Boolean(enabled && root);
    this.disposers = [];
    this.lastState = null;
    this.elapsed = 0;
    this.dialogue = null;
    if (!this.enabled) return;
    installPassengerDialogueStyles();
    this.dialogue = new PassengerDialogueManager({ root: document.body, maxBubbles: 4, duration: 3200, showEnglish: false });
    this.bindGameEvents();
    this.bindDelegatedInteractions();
  }

  on(target, name, handler, options) {
    target.addEventListener(name, handler, options);
    this.disposers.push(() => target.removeEventListener(name, handler, options));
  }

  emit(name, detail = {}) {
    window.dispatchEvent(new CustomEvent(`kano:${name}`, { detail }));
  }

  bindGameEvents() {
    // These events are safe integration seams. Existing game systems can emit
    // them without this coordinator taking ownership of game rules.
    const eventToDialogue = (event) => {
      const anchor = event.detail?.anchor;
      if (anchor instanceof Element) this.dialogue?.speakRandom(anchor);
    };
    this.on(window, 'kano:passenger-nearby', eventToDialogue);
    this.on(window, 'kano:passenger-boarded', eventToDialogue);
    this.on(window, 'kano:fare-negotiation', eventToDialogue);
    this.on(window, 'kano:market-day-start', (event) => this.emit('commercial-event', { type: 'market-day', ...event.detail }));
    this.on(window, 'kano:wedding-convoy-start', (event) => this.emit('commercial-event', { type: 'wedding-convoy', ...event.detail }));
    this.on(window, 'kano:vehicle-breakdown', (event) => this.emit('commercial-event', { type: 'vehicle-breakdown', ...event.detail }));
  }

  bindDelegatedInteractions() {
    // Hotspot buttons are opt-in: existing UI is untouched unless a button
    // explicitly declares data-kano-hotspot and a valid category.
    this.on(this.root, 'click', (event) => {
      const button = event.target instanceof Element ? event.target.closest('[data-kano-hotspot]') : null;
      if (!button || !this.root.contains(button)) return;
      const type = String(button.dataset.kanoHotspot || '').trim();
      const allowed = new Set(['fuel', 'mechanic', 'mosque', 'vulcanizer', 'spare-parts']);
      if (!allowed.has(type)) return;
      this.emit('hotspot-interaction-request', { type, id: button.dataset.hotspotId || null });
    });
  }

  /** Call from the existing frame loop. Never advances gameplay itself. */
  update(dt = 0, state = this.game?.s || {}) {
    if (!this.enabled) return;
    this.elapsed += Math.max(0, Math.min(Number(dt) || 0, 0.05));
    this.dialogue?.update();
    this.lastState = state;
  }

  /** Attach a real passenger DOM anchor when the renderer creates one. */
  attachPassengerAnchor(anchor, { speakOnAttach = false } = {}) {
    if (!this.enabled || !(anchor instanceof Element)) return false;
    anchor.dataset.kanoPassengerAnchor = 'true';
    if (speakOnAttach) this.dialogue?.speakRandom(anchor);
    return true;
  }

  dispose() {
    for (const dispose of this.disposers.splice(0)) {
      try { dispose(); } catch { /* best-effort cleanup */ }
    }
    this.dialogue?.dispose();
    this.dialogue = null;
    this.enabled = false;
  }
}

export default KanoCommercialIntegration;
