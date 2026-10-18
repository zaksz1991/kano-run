import {
  NarrativeDialogueEngine,
  ProfileEngine,
  PureWaterHawker,
} from './productionSystems.js';
import { save } from './storage.js';

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

/**
 * KanoProductionBridge
 *
 * Integrates the first low-risk production systems with the existing game:
 * - pure-water hawker purchase through the existing horn input;
 * - passenger gist subtitle ribbon;
 * - optional female-passenger free-ride choices;
 * - optional "Babu canji!" fare choices;
 * - terminal run-report persistence.
 *
 * It deliberately does NOT create a second road, traffic pool, collision
 * system, vehicle transform controller, or audio engine. Renderer3D and Game
 * remain the owners of those systems.
 */
export class KanoProductionBridge {
  constructor({ renderer, game, uiRoot = document.body, mobile = false } = {}) {
    if (!renderer?.scene?.isObject3D) {
      throw new TypeError('KanoProductionBridge requires an active Renderer3D instance.');
    }
    if (!renderer?.world?.isObject3D || !renderer?.player?.isObject3D) {
      throw new TypeError('Renderer3D must expose world and player Object3D instances.');
    }
    if (!game?.s) {
      throw new TypeError('KanoProductionBridge requires an initialized Game instance.');
    }

    this.renderer = renderer;
    this.game = game;
    this.mobile = Boolean(mobile);
    this.profile = new ProfileEngine();
    this.narrative = new NarrativeDialogueEngine({
      host: uiRoot,
      game,
      profile: this.profile,
    });
    this.hawker = new PureWaterHawker({
      parent: renderer.world,
      player: renderer.player,
      game,
      profile: this.profile,
      radius: this.mobile ? 4.6 : 5.0,
    });

    this.disposed = false;
    this.dialogueActive = false;
    this.previousPassengerCount = 0;
    this.originalMethods = new Map();

    this.installGameHooks();
  }

  installGameHooks() {
    this.patchMethod('pickup', (original, zone) => {
      const previous = new Set(this.game.s.passengers || []);
      const result = original.call(this.game, zone);

      if (result !== false && !this.dialogueActive && this.game.state === 'PLAY') {
        const addedPassenger = (this.game.s.passengers || []).find(
          (passenger) => !previous.has(passenger),
        );

        if (
          addedPassenger?.female &&
          Number(addedPassenger.fare) > 0 &&
          Math.random() < 0.08
        ) {
          this.offerFreeRide(addedPassenger);
        }
      }

      return result;
    });

    this.patchMethod('drop', (original, zone) => {
      const passenger = this.game.s.passengers?.[0];

      if (
        this.disposed ||
        this.dialogueActive ||
        this.game.state !== 'PLAY' ||
        !passenger ||
        Math.random() >= 0.09
      ) {
        return original.call(this.game, zone);
      }

      const priorState = this.game.state;
      const heatBefore = Number(this.game.s.heat) || 0;
      const fare = Math.max(0, Math.floor(Number(passenger.fare) || 0));
      const change = clamp(Math.floor(fare * 0.12), 20, 150);

      this.pauseForDialogue();

      try {
        this.narrative.offerNoChange({
          passenger,
          fare,
          change,
          onResolve: (outcome) => {
            try {
              // Complete the existing fare/drop-off rules exactly once.
              original.call(this.game, zone);

              if (outcome.choice === 'blessing') {
                this.game.s.score = Math.max(
                  0,
                  (Number(this.game.s.score) || 0) - change,
                );
              } else if (outcome.choice === 'argue') {
                this.game.s.heat = clamp(heatBefore + 12, 0, 100);
              }

              this.game.ui?.update?.(
                this.game.s,
                this.game.route,
                this.game.driver,
              );
            } finally {
              this.resumeAfterDialogue(priorState);
            }
          },
        });
      } catch (error) {
        console.error('[Kano Life] no-change dialogue failed; applying normal drop-off', error);
        this.resumeAfterDialogue(priorState);
        return original.call(this.game, zone);
      }

      // moveZones() uses this return value to consume the road zone.
      return true;
    });

    this.patchMethod('finishOrContinue', (original, reason, allowContinue) => {
      const state = this.game.s;
      const alreadyEnded = Boolean(state?.runEnded);
      const continuationAvailable = Boolean(
        allowContinue && state && (
          state.lives > 0 ||
          (Number(save.money) || 0) >= (Number(state.paidContinueCost) || 0)
        ),
      );

      const result = original.call(this.game, reason, allowContinue);

      if (
        !alreadyEnded &&
        !continuationAvailable &&
        state?.runEnded
      ) {
        this.profile.recordRunReport({
          score: state.score,
          distance: state.distance,
          reason,
        });
      }

      return result;
    });
  }

  patchMethod(name, createWrapper) {
    const original = this.game[name];
    if (typeof original !== 'function') return false;

    this.originalMethods.set(name, original);
    this.game[name] = (...args) => createWrapper(original, ...args);
    return true;
  }

  pauseForDialogue() {
    this.dialogueActive = true;
    if (this.game.state === 'PLAY') this.game.state = 'NARRATIVE';
    this.game.s.gas = false;
    this.game.s.brake = false;
    this.game.s.signedSpeed = 0;
  }

  resumeAfterDialogue(previousState = 'PLAY') {
    this.dialogueActive = false;
    if (this.game.state === 'NARRATIVE') {
      this.game.state = previousState === 'PLAY' ? 'PLAY' : previousState;
    }

    if (this.game.state === 'PLAY' && typeof this.game.syncSignedSpeed === 'function') {
      this.game.syncSignedSpeed();
    }
  }

  offerFreeRide(passenger) {
    if (this.disposed || this.dialogueActive || this.game.state !== 'PLAY') return false;

    const priorState = this.game.state;
    this.pauseForDialogue();

    try {
      this.narrative.offerFreeRide(passenger, {
        fare: passenger.fare,
        onResolve: (outcome) => {
          try {
            if (outcome.accepted) passenger.fare = 0;
            this.game.ui?.update?.(
              this.game.s,
              this.game.route,
              this.game.driver,
            );
          } finally {
            this.resumeAfterDialogue(priorState);
          }
        },
      });
      return true;
    } catch (error) {
      console.error('[Kano Life] free-ride dialogue failed', error);
      this.resumeAfterDialogue(priorState);
      return false;
    }
  }

  onHorn() {
    if (this.disposed || this.game.state !== 'PLAY') return false;
    // Renderer3D may replace its procedural Keke with a loaded GLB after
    // startup. Always target the renderer's current player object.
    if (this.hawker) this.hawker.player = this.renderer.player;
    return this.hawker?.onHorn() || false;
  }

  update(dt) {
    if (this.disposed || this.game.state !== 'PLAY') return;

    const state = this.game.s;
    const passengerCount = Array.isArray(state.passengers)
      ? state.passengers.length
      : 0;

    // Start the gist interval when the first passenger boards, rather than
    // showing a subtitle immediately just because the run is already old.
    if (passengerCount > 0 && this.previousPassengerCount === 0) {
      this.narrative.lastGistAt = this.narrative.elapsed;
    }

    this.previousPassengerCount = passengerCount;

    const signedSpeed = Number.isFinite(state.signedSpeed)
      ? state.signedSpeed
      : state.reverse
        ? -Math.abs(Number(state.speed) || 0)
        : Math.abs(Number(state.speed) || 0);

    // Renderer3D may swap the fallback vehicle for a cached GLB at runtime.
    if (this.hawker) this.hawker.player = this.renderer.player;
    this.hawker?.update(dt, signedSpeed);
    this.narrative?.update(dt, state);
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;

    for (const [name, original] of this.originalMethods) {
      this.game[name] = original;
    }
    this.originalMethods.clear();

    this.hawker?.dispose();
    this.narrative?.dispose();
    this.hawker = null;
    this.narrative = null;
  }
}
