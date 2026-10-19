const MOVE_ZONES_PATCH = Symbol.for('kano.life.stopped-roadside-interaction.v1');
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

const ZONE_LABELS = {
  pickup: 'PASSENGER PICKUP',
  drop: 'PASSENGER DROP-OFF',
  fuel: 'FUEL STOP',
  pothole: 'POTHOLE',
};

function isFiniteNumber(value) {
  return Number.isFinite(Number(value));
}

/**
 * Return the driving hint for the nearest zone that is still ahead.
 * This function is pure so its interaction guidance can be unit-tested.
 */
export function getInteractionAdvice(state, gameStatus = 'PLAY') {
  if (!state || gameStatus !== 'PLAY' || state.event) return null;

  const zones = Array.isArray(state.zones) ? state.zones : [];
  const nearby = zones
    .filter((zone) => (
      zone &&
      isFiniteNumber(zone.depth) &&
      Number(zone.depth) >= -0.015 &&
      Number(zone.depth) <= 0.34
    ))
    .sort((a, b) => Math.abs(Number(a.depth) - 0.14) - Math.abs(Number(b.depth) - 0.14));

  const zone = nearby[0];
  if (!zone) return null;

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
        ? 'POTHOLE AHEAD · prepare to steer around it'
        : 'POTHOLE CLOSE · steer clear if safe',
      detail: 'Avoid sudden steering when traffic is close.',
    };
  }

  if (!label) return null;

  if (reversing) {
    return {
      type: 'gear',
      zone,
      message: `${label} AHEAD · SELECT FORWARD GEAR`,
      detail: 'Roadside interactions activate only in forward gear.',
    };
  }

  const targetLane = clamp(Math.round(Number(zone.lane) || 0), 0, 2) - 1;
  const steer = Number(state.steer) || 0;
  const laneAligned = Math.abs(steer - targetLane) <= 0.48;
  const speedLimit = zone.hub ? 6.5 : 12;

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
      detail: 'Use a gradual lane change and check surrounding traffic.',
    };
  }

  if (depth > 0.19) {
    return {
      type: 'approach',
      zone,
      message: `${label} AHEAD · EASE OFF AND PREPARE TO STOP`,
      detail: `Approach slowly; target ${Math.round(speedLimit)} km/h or less.`,
    };
  }

  if (speed > speedLimit) {
    return {
      type: 'brake',
      zone,
      message: `${label} · BRAKE TO ${Math.round(speedLimit)} KM/H OR LESS`,
      detail: 'Keep the Keke aligned with the stop while slowing down.',
    };
  }

  return {
    type: 'ready',
    zone,
    message: `${label} · STOP ZONE REACHED`,
    detail: type === 'pickup'
      ? 'Passenger pickup will trigger when the stop conditions are satisfied.'
      : type === 'drop'
        ? 'Passenger drop-off will trigger when the stop conditions are satisfied.'
        : 'Refuelling will trigger when the stop conditions are satisfied.',
  };
}

/**
 * Make a fully stopped vehicle eligible for the existing Game.moveZones()
 * forward-only roadside gate without changing its actual speed or distance.
 * The signed-speed epsilon is temporary and is restored in a finally block.
 *
 * This is deliberately independent of the renderer, so it also works in the
 * Canvas 2D fallback where the 3D scene upgrade is not installed.
 */
export function installStoppedInteractionCompatibility(game) {
  if (!game || typeof game.moveZones !== 'function') {
    return () => {};
  }

  if (game[MOVE_ZONES_PATCH]?.active) {
    game[MOVE_ZONES_PATCH].references += 1;
    return () => {
      const entry = game[MOVE_ZONES_PATCH];
      if (!entry) return;
      entry.references -= 1;
      if (entry.references <= 0) entry.restore();
    };
  }

  const original = game.moveZones;
  const entry = {
    active: true,
    references: 1,
    original,
    wrapper: null,
    restore: null,
  };

  entry.wrapper = function kanoStoppedInteractionMoveZones(dt) {
    const state = this?.s;
    const canInteractWhileStopped = Boolean(
      this?.state === 'PLAY' &&
      state &&
      !state.event &&
      !state.reverse &&
      (Number(state.speed) || 0) <= 0.05 &&
      (Number(state.signedSpeed) || 0) <= 0.05
    );

    if (!canInteractWhileStopped) {
      return original.call(this, dt);
    }

    const previousSignedSpeed = state.signedSpeed;
    state.signedSpeed = 0.051;

    try {
      return original.call(this, dt);
    } finally {
      state.signedSpeed = previousSignedSpeed;
    }
  };

  entry.restore = () => {
    if (!entry.active) return;
    entry.active = false;
    if (game.moveZones === entry.wrapper) {
      game.moveZones = original;
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
 * Lightweight interaction prompts and opt-in scene diagnostics.
 * It does not own the game simulation, renderer or GLB resources.
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
    this.restoreMoveZones = installStoppedInteractionCompatibility(game);

    this.installStyles();
    this.hint = this.createHint();
    this.diagnostics = this.debug ? this.createDiagnostics() : null;

    this.onPageHide = () => this.dispose();
    window.addEventListener('pagehide', this.onPageHide, { once: true });
  }

  installStyles() {
    if (document.getElementById('kano-interaction-reliability-styles')) return;

    const style = document.createElement('style');
    style.id = 'kano-interaction-reliability-styles';
    style.textContent = `
      #game-container .kano-interaction-hint {
        position: absolute;
        z-index: 11;
        left: 50%;
        bottom: calc(68px + env(safe-area-inset-bottom, 0px));
        transform: translateX(-50%);
        width: min(92%, 390px);
        padding: 10px 13px;
        border: 1px solid rgba(245,197,66,.6);
        border-radius: 13px;
        background: rgba(10,24,37,.93);
        color: #f7f8f7;
        box-shadow: 0 8px 26px rgba(0,0,0,.24);
        text-align: center;
        pointer-events: none;
        font: 800 11px/1.35 system-ui, sans-serif;
        letter-spacing: .025em;
        backdrop-filter: blur(7px);
      }
      #game-container .kano-interaction-hint[hidden] { display: none !important; }
      #game-container .kano-interaction-hint[data-kind="hazard"] { border-color: rgba(255,134,110,.78); }
      #game-container .kano-interaction-hint[data-kind="ready"] { border-color: rgba(40,196,165,.72); }
      #game-container .kano-interaction-hint small {
        display:block; margin-top:3px; color:#b9c8d5; font:600 10px/1.35 system-ui,sans-serif;
      }
      #game-container .kano-scene-diagnostics {
        position:absolute; z-index:60; top:76px; right:8px;
        width:min(340px, calc(100% - 16px)); max-height:38%; overflow:auto;
        padding:10px 12px; border:1px solid rgba(255,255,255,.22);
        border-radius:10px; background:rgba(6,15,25,.94); color:#e9f1f7;
        font:11px/1.45 ui-monospace, SFMono-Regular, Consolas, monospace;
        white-space:pre-wrap; overflow-wrap:anywhere; pointer-events:auto;
      }
      #game-container .kano-scene-diagnostics[hidden] { display:none !important; }
      #game-container .kano-scene-diagnostics strong { color:#f5c542; }
      @media (max-width: 480px) {
        #game-container .kano-interaction-hint {
          bottom: calc(61px + env(safe-area-inset-bottom, 0px));
          width: calc(100% - 18px); padding:8px 10px; font-size:10px;
        }
        #game-container .kano-interaction-hint small { font-size:9px; }
        #game-container .kano-scene-diagnostics { top:68px; right:6px; max-height:30%; font-size:10px; }
      }
      @media (prefers-reduced-motion: reduce) {
        #game-container .kano-interaction-hint { backdrop-filter:none; }
      }
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
    panel.innerHTML = '<strong>KANO LIFE · SCENE DIAGNOSTICS</strong>\nStarting diagnostics…';
    this.container.append(panel);
    return panel;
  }

  update(_deltaSeconds = 0, state = this.game?.s || {}) {
    if (this.disposed) return;

    this.elapsed += Math.min(Math.max(Number(_deltaSeconds) || 0, 0), 0.05);
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
      player?.userData?.driverAnimationParts?.driverPivot ||
      rigPivot ||
      rigRoot,
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
          const likelyInside = dx <= 1.3 && dz <= 1.8;
          seatStatus = likelyInside
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

    const near = getInteractionAdvice(state, this.game.state);
    const nearbyZone = near?.zone
      ? `${near.zone.type} depth=${Number(near.zone.depth).toFixed(3)} lane=${near.zone.lane}`
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
      `Interaction guidance: ${near?.message || 'none'}`,
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
    this.hint?.remove();
    this.diagnostics?.remove();

    if (this.styleElement?.isConnected) {
      this.styleElement.remove();
    }

    this.hint = null;
    this.diagnostics = null;
  }
}
