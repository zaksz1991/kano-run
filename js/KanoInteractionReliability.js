/**
 * KANO LIFE — INTERACTION RELIABILITY AND ROADSIDE PICKUP ALIGNMENT
 *
 * Complete replacement for js/KanoInteractionReliability.js.
 *
 * Preserves the interaction hint, opt-in diagnostics and stopped-vehicle
 * compatibility. Corrects the mismatch between game.js roadside interaction
 * depth thresholds and renderer3d.js zone positions. A successful passenger
 * pickup also receives a short boarding transition before the zone is removed.
 *
 * This module does not change the renderer, vehicle physics, fare values,
 * collisions, road layout, radio, or passenger capacity.
 */

const MOVE_ZONES_PATCH = Symbol.for('kano.life.stopped-roadside-interaction.v1');
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

const ZONE_LABELS = {
  pickup: 'PASSENGER PICKUP',
  drop: 'PASSENGER DROP-OFF',
  fuel: 'FUEL STOP',
  pothole: 'POTHOLE',
};

// renderer3d.js places a zone at z = -depth * 88 while the keke sits at z = 2.
// The existing Game.moveZones() only permits roadside interaction in depth
// [0.055, 0.19], which visibly puts pickup actors well in front of the keke.
// This affine depth mapping makes that existing interaction window correspond
// to a real zone depth of [-0.05, -0.02], alongside the rendered keke.
export const ROADSIDE_INTERACTION_DEPTH = Object.freeze({
  scale: 4.5,
  offset: 0.28,
  min: -0.05,
  max: -0.02,
  transformFrom: -0.08,
  transformTo: 0.35,
  rendererDepthScale: 88,
  gameDepthScale: 316.8,
});

const ROADSIDE_TYPES = new Set(['pickup', 'drop', 'fuel']);
const INTERACTION_DEPTH = ROADSIDE_INTERACTION_DEPTH;

function isFiniteNumber(value) {
  return Number.isFinite(Number(value));
}

function laneForZone(zone) {
  return clamp(Math.round(Number(zone?.lane) || 0), 0, 2) - 1;
}

function targetSpeedForZone(zone) {
  return zone?.hub ? 6.5 : 12;
}

/** Map actual depth into the range expected by the existing Game.moveZones. */
export function mapRoadsideInteractionDepth(depth) {
  return Number(depth) * INTERACTION_DEPTH.scale + INTERACTION_DEPTH.offset;
}

/** Convert the temporary game depth back to the renderer's real depth. */
export function unmapRoadsideInteractionDepth(depth) {
  return (Number(depth) - INTERACTION_DEPTH.offset) / INTERACTION_DEPTH.scale;
}

/**
 * Get a driving hint for the closest relevant road object.
 * Game state keeps its real, untransformed depths outside moveZones().
 */
export function getInteractionAdvice(state, gameStatus = 'PLAY') {
  if (!state || gameStatus !== 'PLAY' || state.event) return null;

  const zones = Array.isArray(state.zones) ? state.zones : [];
  const visibleZones = zones.filter((zone) => (
    zone &&
    isFiniteNumber(zone.depth) &&
    Number(zone.depth) >= -0.08 &&
    Number(zone.depth) <= 0.34 &&
    ZONE_LABELS[zone.type]
  ));

  if (!visibleZones.length) return null;

  // Match the rendered position of the player: z=2 and zone z=-depth*88.
  const playerDepth = -2 / INTERACTION_DEPTH.rendererDepthScale;
  visibleZones.sort((a, b) => (
    Math.abs(Number(a.depth) - playerDepth) -
    Math.abs(Number(b.depth) - playerDepth)
  ));

  const zone = visibleZones[0];
  const depth = Number(zone.depth);
  const type = zone.type;
  const label = ZONE_LABELS[type];
  const speed = Math.max(0, Number(state.speed) || 0);
  const reversing = Boolean(state.reverse) || (Number(state.signedSpeed) || 0) < -0.05;

  if (type === 'pothole') {
    return {
      type: 'hazard',
      zone,
      message: depth > 0.19
        ? 'POTHOLE AHEAD · PREPARE TO STEER AROUND IT'
        : 'POTHOLE CLOSE · STEER CLEAR IF SAFE',
      detail: 'Avoid sudden steering when traffic is close.',
    };
  }

  if (reversing) {
    return {
      type: 'gear',
      zone,
      message: `${label} AHEAD · SELECT FORWARD GEAR`,
      detail: 'Roadside interactions activate only in forward gear.',
    };
  }

  const targetLane = laneForZone(zone);
  const steer = Number(state.steer) || 0;
  const laneAligned = Math.abs(steer - targetLane) <= 0.48;
  const speedLimit = targetSpeedForZone(zone);
  const sideName = (zone.side || (zone.lane === 0 ? -1 : 1)) < 0
    ? 'LEFT SHOULDER'
    : 'RIGHT SHOULDER';

  if (depth < INTERACTION_DEPTH.min) {
    return {
      type: 'missed',
      zone,
      message: `${label} MISSED · CONTINUE TO THE NEXT STOP`,
      detail: 'This stop is behind the keke. Do not reverse into traffic.',
    };
  }

  if (!laneAligned) {
    const laneName = targetLane < -0.35
      ? 'LEFT LANE'
      : targetLane > 0.35
        ? 'RIGHT LANE'
        : 'CENTRE LANE';
    return {
      type: 'lane',
      zone,
      message: `${label} AHEAD · ALIGN WITH ${laneName}`,
      detail: `Signal and move gradually toward the ${sideName.toLowerCase()}.`,
    };
  }

  if (depth > 0.025) {
    if (speed > speedLimit) {
      return {
        type: 'brake',
        zone,
        message: `${label} AHEAD · SLOW TO ${Math.round(speedLimit)} KM/H OR LESS`,
        detail: `Stay aligned and approach the ${sideName.toLowerCase()} carefully.`,
      };
    }

    return {
      type: 'approach',
      zone,
      message: `${label} AHEAD · CREEP TOWARD THE PASSENGER`,
      detail: `Keep rolling slowly until the passenger is beside the keke on the ${sideName.toLowerCase()}.`,
    };
  }

  if (speed > speedLimit) {
    return {
      type: 'brake',
      zone,
      message: `${label} · BRAKE TO ${Math.round(speedLimit)} KM/H OR LESS`,
      detail: 'Keep the keke aligned until the roadside marker is alongside.',
    };
  }

  return {
    type: 'ready',
    zone,
    message: `${label} · STOP BESIDE THE PASSENGER`,
    detail: type === 'pickup'
      ? 'The passenger is beside the keke; the pickup will complete when the stop conditions are satisfied.'
      : type === 'drop'
        ? 'The drop-off is now alongside the keke.'
        : 'The fuel stop is alongside the keke.',
  };
}

/**
 * Compatibility wrapper around Game.moveZones().
 *
 * Non-pothole roadside depths are remapped only for the duration of the
 * existing game method. The update delta is corrected so zones retain their
 * original movement speed, and all depths are restored before rendering/UI.
 * Pothole depths and their swept-collision thresholds are never transformed.
 */
export function installStoppedInteractionCompatibility(game, {
  getRenderer = () => null,
  onPassengerBoarded = () => {},
} = {}) {
  if (!game || typeof game.moveZones !== 'function') {
    return () => {};
  }

  if (game[MOVE_ZONES_PATCH]?.active) {
    const existing = game[MOVE_ZONES_PATCH];
    existing.references += 1;
    return () => {
      const entry = game[MOVE_ZONES_PATCH];
      if (!entry) return;
      entry.references -= 1;
      if (entry.references <= 0) entry.restore();
    };
  }

  const originalMoveZones = game.moveZones;
  const entry = {
    active: true,
    references: 1,
    original: originalMoveZones,
    wrapper: null,
    restore: null,
  };

  entry.wrapper = function kanoAlignedStoppedRoadsideMoveZones(deltaSeconds) {
    const state = this?.s;
    if (!state || !Array.isArray(state.zones)) {
      return originalMoveZones.call(this, deltaSeconds);
    }

    const previousSignedSpeed = state.signedSpeed;
    const isFullyStopped = Boolean(
      this.state === 'PLAY' &&
      !state.event &&
      !state.reverse &&
      (Number(state.speed) || 0) <= 0.05 &&
      (Number(state.signedSpeed) || 0) <= 0.05
    );

    // The game uses this small positive value to permit an aligned stop-zone
    // interaction, not to move the vehicle forward in a meaningful way.
    if (isFullyStopped) state.signedSpeed = 0.051;

    const dt = clamp(Number(deltaSeconds) || 0, 0, 0.045);
    const realScroll = dt * ((Number(state.signedSpeed) || 0) / INTERACTION_DEPTH.gameDepthScale);
    const transformed = new Map();

    // Game.moveZones iterates from the last zone toward the first, so gather
    // candidate pickups in that same order. Only nearby roadside zones are
    // transformed; distant spawned zones and all potholes are left untouched.
    for (let index = state.zones.length - 1; index >= 0; index -= 1) {
      const zone = state.zones[index];
      if (
        !zone ||
        !ROADSIDE_TYPES.has(zone.type) ||
        !isFiniteNumber(zone.depth)
      ) {
        continue;
      }

      const originalDepth = Number(zone.depth);
      if (
        originalDepth < INTERACTION_DEPTH.transformFrom ||
        originalDepth > INTERACTION_DEPTH.transformTo
      ) {
        continue;
      }

      // Pre-compensate for Game.moveZones subtracting one unscaled scroll
      // step. The result after its update equals map(depth - scroll).
      zone.depth =
        mapRoadsideInteractionDepth(originalDepth) -
        (INTERACTION_DEPTH.scale - 1) * realScroll;
      transformed.set(zone, true);

    }

    const originalPickup = this.pickup;
    const boardedZones = [];
    let pickupWrapper = null;

    if (typeof originalPickup === 'function') {
      pickupWrapper = function kanoPickupBoardingObserver(zone, ...args) {
        const before = Number(this?.s?.boards) || 0;
        const result = originalPickup.call(this, zone, ...args);
        const after = Number(this?.s?.boards) || 0;
        if (after > before) boardedZones.push(zone);
        return result;
      };
      this.pickup = pickupWrapper;
    }

    try {
      const result = originalMoveZones.call(this, deltaSeconds);

      // Keep the just-boarded 3D character visible for a brief transition as
      // the keke pulls toward the shoulder. Each exact zone is observed through
      // the existing pickup method, so declined/full-vehicle pickups do not
      // create a false boarding animation.
      if (boardedZones.length) {
        for (const zone of boardedZones) {
          try {
            onPassengerBoarded(zone, getRenderer?.());
          } catch (error) {
            console.warn('[Kano Life] passenger boarding visual skipped.', error);
          }
        }
      }

      return result;
    } finally {
      if (pickupWrapper && this.pickup === pickupWrapper) {
        this.pickup = originalPickup;
      }

      // Undo temporary depth mapping. Removed zones need no restoration;
      // newly spawned zones were never entered in this map.
      for (const zone of state.zones || []) {
        if (transformed.has(zone) && isFiniteNumber(zone.depth)) {
          zone.depth = unmapRoadsideInteractionDepth(zone.depth);
        }
      }

      state.signedSpeed = previousSignedSpeed;
    }
  };

  entry.restore = () => {
    if (!entry.active) return;
    entry.active = false;
    if (game.moveZones === entry.wrapper) {
      game.moveZones = originalMoveZones;
    }
    try {
      delete game[MOVE_ZONES_PATCH];
    } catch {
      game[MOVE_ZONES_PATCH] = undefined;
    }
  };

  game.moveZones = entry.wrapper;
  Object.defineProperty(game, MOVE_ZONES_PATCH, {
    configurable: true,
    value: entry,
  });

  return () => {
    const current = game[MOVE_ZONES_PATCH];
    if (!current) return;
    current.references -= 1;
    if (current.references <= 0) current.restore();
  };
}

/**
 * Interaction prompts, diagnostics, and short boarding transitions.
 * Does not own the simulation, renderer or cached model assets.
 */
export class KanoInteractionReliability {
  constructor({
    game,
    container,
    getRenderer = () => null,
    getSceneUpgrade = () => null,
    debug = false,
  } = {}) {
    if (!game?.s) {
      throw new TypeError('KanoInteractionReliability requires an initialized Game instance.');
    }
    if (!container?.append) {
      throw new TypeError('KanoInteractionReliability requires the game container.');
    }

    this.game = game;
    this.container = container;
    this.getRenderer = getRenderer;
    this.getSceneUpgrade = getSceneUpgrade;
    this.debug = Boolean(debug);
    this.disposed = false;
    this.elapsed = 0;
    this.lastDiagnosticsAt = 0;
    this.lastHintText = '';
    this.boardingVisuals = [];

    this.installStyles();
    this.hint = this.createHint();
    this.diagnostics = this.debug ? this.createDiagnostics() : null;
    this.restoreMoveZones = installStoppedInteractionCompatibility(game, {
      getRenderer: () => this.getRenderer?.(),
      onPassengerBoarded: (zone, renderer) => this.startBoardingVisual(zone, renderer),
    });
    this.onPageHide = () => this.dispose();
    window.addEventListener('pagehide', this.onPageHide, { once: true });
  }

  installStyles() {
    if (document.getElementById('kano-interaction-reliability-styles')) return;
    const style = document.createElement('style');
    style.id = 'kano-interaction-reliability-styles';
    style.textContent = `
      #game-container .kano-interaction-hint {
        position:absolute; z-index:11; left:50%;
        bottom:calc(68px + env(safe-area-inset-bottom, 0px));
        transform:translateX(-50%); width:min(92%,390px);
        padding:10px 13px; border:1px solid rgba(245,197,66,.6);
        border-radius:13px; background:rgba(10,24,37,.93); color:#f7f8f7;
        box-shadow:0 8px 26px rgba(0,0,0,.24); text-align:center;
        pointer-events:none; font:800 11px/1.35 system-ui,sans-serif;
        letter-spacing:.025em; backdrop-filter:blur(7px); white-space:normal;
      }
      #game-container .kano-interaction-hint[hidden] { display:none !important; }
      #game-container .kano-interaction-hint[data-kind="hazard"] { border-color:rgba(255,134,110,.78); }
      #game-container .kano-interaction-hint[data-kind="ready"] { border-color:rgba(40,196,165,.72); }
      #game-container .kano-interaction-hint[data-kind="missed"] { border-color:rgba(255,134,110,.78); }
      #game-container .kano-interaction-hint small { display:block; margin-top:3px; color:#b9c8d5; font:600 10px/1.35 system-ui,sans-serif; }
      #game-container .kano-scene-diagnostics {
        position:absolute; z-index:60; top:76px; right:8px;
        width:min(340px,calc(100% - 16px)); max-height:38%; overflow:auto;
        padding:10px 12px; border:1px solid rgba(255,255,255,.22);
        border-radius:10px; background:rgba(6,15,25,.94); color:#e9f1f7;
        font:11px/1.45 ui-monospace,SFMono-Regular,Consolas,monospace;
        white-space:pre-wrap; overflow-wrap:anywhere; pointer-events:auto;
      }
      #game-container .kano-scene-diagnostics[hidden] { display:none !important; }
      #game-container .kano-scene-diagnostics strong { color:#f5c542; }
      @media (max-width:480px) {
        #game-container .kano-interaction-hint { bottom:calc(61px + env(safe-area-inset-bottom,0px)); width:calc(100% - 18px); padding:8px 10px; font-size:10px; }
        #game-container .kano-interaction-hint small { font-size:9px; }
        #game-container .kano-scene-diagnostics { top:68px; right:6px; max-height:30%; font-size:10px; }
      }
      @media (prefers-reduced-motion:reduce) { #game-container .kano-interaction-hint { backdrop-filter:none; } }
    `;
    document.head.append(style);
    this.styleElement = style;
  }

  createHint() {
    const hint = document.createElement('aside');
    hint.className = 'kano-interaction-hint';
    hint.setAttribute('role', 'status');
    hint.setAttribute('aria-live', 'polite');
    hint.hidden = true;
    this.container.append(hint);
    return hint;
  }

  createDiagnostics() {
    const panel = document.createElement('aside');
    panel.className = 'kano-scene-diagnostics';
    panel.setAttribute('aria-label', 'Kano Life scene diagnostics');
    panel.textContent = 'KANO LIFE · SCENE DIAGNOSTICS\nStarting diagnostics…';
    this.container.append(panel);
    return panel;
  }

  /** Detach the actual waiting actor briefly so zone cleanup does not erase the boarding animation. */
  startBoardingVisual(zone, renderer = this.getRenderer?.()) {
    if (!renderer?.world || !renderer?.zoneActors || !zone?.id) return;
    const zoneActor = renderer.zoneActors.get(zone.id);
    const passenger = zoneActor?.userData?.waitingActors?.find((item) => item?.isObject3D);
    if (!zoneActor || !passenger || passenger.parent !== zoneActor) return;

    try {
      zoneActor.updateWorldMatrix?.(true, true);
      const worldPosition = passenger.getWorldPosition(passenger.position.clone());
      const worldQuaternion = passenger.getWorldQuaternion(passenger.quaternion.clone());
      const worldScale = passenger.getWorldScale(passenger.scale.clone());

      zoneActor.remove(passenger);
      renderer.world.add(passenger);
      passenger.position.copy(worldPosition);
      passenger.quaternion.copy(worldQuaternion);
      passenger.scale.copy(worldScale);

      this.boardingVisuals.push({
        passenger,
        startPosition: worldPosition.clone(),
        startScale: worldScale.clone(),
        elapsed: 0,
        duration: 0.52,
      });
    } catch (error) {
      console.warn('[Kano Life] Could not animate passenger boarding.', error);
    }
  }

  updateBoardingVisuals(deltaSeconds) {
    const dt = clamp(Number(deltaSeconds) || 0, 0, 0.05);
    if (!this.boardingVisuals.length) return;

    const renderer = this.getRenderer?.();
    const player = renderer?.player;

    for (let index = this.boardingVisuals.length - 1; index >= 0; index -= 1) {
      const visual = this.boardingVisuals[index];
      const passenger = visual.passenger;
      if (!passenger?.parent) {
        this.boardingVisuals.splice(index, 1);
        continue;
      }

      visual.elapsed += dt;
      const t = clamp(visual.elapsed / visual.duration, 0, 1);
      const eased = t * t * (3 - 2 * t);

      if (player?.position && passenger.parent === renderer?.world) {
        const target = player.position.clone();
        target.y += 0.52;
        target.z += 0.12;
        passenger.position.lerpVectors(visual.startPosition, target, eased);
        passenger.scale.copy(visual.startScale).multiplyScalar(1 - 0.88 * eased);
      }

      if (t >= 1) {
        passenger.visible = false;
        passenger.parent?.remove(passenger);
        this.boardingVisuals.splice(index, 1);
      }
    }
  }

  update(_deltaSeconds = 0, state = this.game?.s || {}) {
    if (this.disposed) return;
    const dt = clamp(Number(_deltaSeconds) || 0, 0, 0.05);
    this.elapsed += dt;
    this.updateBoardingVisuals(dt);
    this.updateHint(state);

    if (this.debug && this.diagnostics && this.elapsed - this.lastDiagnosticsAt >= 0.25) {
      this.lastDiagnosticsAt = this.elapsed;
      this.updateDiagnostics(state);
    }
  }

  updateHint(state) {
    if (!this.hint) return;
    const advice = getInteractionAdvice(state, this.game.state);
    if (!advice) {
      this.hint.hidden = true;
      this.lastHintText = '';
      return;
    }

    const nextText = `${advice.message}\n${advice.detail}`;
    this.hint.dataset.kind = advice.type;
    this.hint.hidden = false;

    if (this.lastHintText !== nextText) {
      const title = document.createElement('span');
      title.textContent = advice.message;
      const detail = document.createElement('small');
      detail.textContent = advice.detail;
      this.hint.replaceChildren(title, detail);
      this.lastHintText = nextText;
    }
  }

  updateDiagnostics(state) {
    const renderer = this.getRenderer?.();
    const sceneUpgrade = this.getSceneUpgrade?.();
    const player = renderer?.player || null;
    let rigPivot = null;
    let rigRoot = null;
    let namedNodes = 0;

    if (player?.traverse) {
      player.traverse((object) => {
        if (object.name === 'KANO_KEKE_DRIVER_PIVOT') rigPivot = object;
        if (object.name === 'KANO_KEKE_SEATED_DRIVER') rigRoot = object;
        if (/driver|wheel|seat|handlebar/i.test(object.name || '')) namedNodes += 1;
      });
    }

    const driverFound = Boolean(
      player?.userData?.driverAnimationParts?.driverPivot || rigPivot || rigRoot,
    );
    let seatStatus = 'not measurable';

    if (player && driverFound) {
      try {
        player.updateMatrixWorld?.(true);
        const driverObject = rigPivot || player.userData?.driverAnimationParts?.driverPivot || rigRoot;
        const vehiclePosition = player.position?.clone?.();
        const driverPosition = driverObject?.position?.clone?.();
        if (
          vehiclePosition && driverPosition &&
          typeof player.getWorldPosition === 'function' &&
          typeof driverObject?.getWorldPosition === 'function'
        ) {
          player.getWorldPosition(vehiclePosition);
          driverObject.getWorldPosition(driverPosition);
          const dx = Math.abs(driverPosition.x - vehiclePosition.x);
          const dz = Math.abs(driverPosition.z - vehiclePosition.z);
          seatStatus = dx <= 1.3 && dz <= 1.8
            ? `driver anchor near chassis centre (x=${dx.toFixed(2)}, z=${dz.toFixed(2)} m; approximate)`
            : `WARNING: driver anchor offset from chassis (x=${dx.toFixed(2)}, z=${dz.toFixed(2)} m)`;
        } else {
          seatStatus = 'world-position check unavailable';
        }
      } catch {
        seatStatus = 'seat position unavailable';
      }
    } else if (player) {
      seatStatus = 'WARNING: no recognized seated-driver rig';
    } else {
      seatStatus = 'no 3D player (2D renderer or not initialized)';
    }

    const advice = getInteractionAdvice(state, this.game.state);
    const nearbyZone = advice?.zone
      ? `${advice.zone.type} depth=${Number(advice.zone.depth).toFixed(3)} lane=${advice.zone.lane}`
      : 'none';
    const status = [
      'KANO LIFE · SCENE DIAGNOSTICS',
      `Renderer: ${window.__KANO_RENDER_MODE__ || 'unknown'}`,
      `Game state: ${this.game.state}`,
      `Player object: ${player?.name || 'not available'}`,
      `Player GLB: ${player?.userData?.modelPath || 'procedural / unknown'}`,
      `Seated driver rig: ${driverFound ? 'found' : 'missing'}`,
      `Seat check: ${seatStatus}`,
      `Named driver/wheel/seat nodes: ${namedNodes}`,
      `Visible passenger walkers: ${sceneUpgrade?.walkingPassengers?.length ?? 'n/a'}`,
      `Ambient crowd actors: ${sceneUpgrade?.walkers?.length ?? 'n/a'}`,
      `Speed: ${Math.round(Number(state.speed) || 0)} km/h · gear: ${state.reverse ? 'REVERSE' : 'FORWARD'}`,
      `Nearby zone: ${nearbyZone}`,
      `Interaction guidance: ${advice?.message || 'none'}`,
      `Boarding transitions active: ${this.boardingVisuals.length}`,
      'Pickup alignment: active roadside interaction depth remap',
      'Note: seat check is a position heuristic, not a perfect visual verdict.',
    ].join('\n');

    if (this.diagnostics.textContent !== status) {
      this.diagnostics.textContent = status;
    }
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;

    window.removeEventListener('pagehide', this.onPageHide);
    this.restoreMoveZones?.();
    this.restoreMoveZones = null;

    for (const visual of this.boardingVisuals) {
      try {
        visual.passenger.visible = false;
        visual.passenger.parent?.remove(visual.passenger);
      } catch {
        // The renderer may already have been disposed.
      }
    }
    this.boardingVisuals.length = 0;

    this.hint?.remove();
    this.diagnostics?.remove();
    if (this.styleElement?.isConnected) this.styleElement.remove();

    this.hint = null;
    this.diagnostics = null;
  }
}

export default KanoInteractionReliability;
