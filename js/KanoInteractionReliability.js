const MOVE_ZONES_PATCH = Symbol.for('kano.life.stopped-roadside-interaction.v2');
const CHARACTER_PATCH = Symbol.for('kano.life.late-character-fallback.v2');
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

// Renderer3D maps zone depth to world Z with z = -depth * 88 while the keke
// stays near z=2. Game.moveZones' original active range spans 0.135 depth
// units (almost 12 world units), which is much too large for a boarding stop.
// Keep approach markers moving normally, but permit pickup/drop/fuel only in
// a narrow world-space window beside the keke.
const FAR_DEPTH_LIMIT = 0.01;
const NEAR_DEPTH_LIMIT = -0.04;
const FAR_ZONE_OFFSET = 0.18;   // keeps distant roadside zones outside trigger range
const ACTIVE_ZONE_OFFSET = 0.12; // maps the close world-space window to Game's expected range
const ROADSIDE_TYPES = new Set(['pickup', 'drop', 'fuel']);
const ZONE_LABELS = {
  pickup: 'PASSENGER PICKUP',
  drop: 'PASSENGER DROP-OFF',
  fuel: 'FUEL STOP',
  pothole: 'POTHOLE',
};

const WOMAN_CHARACTER_KEYS = [
  'passengerWoman', 'pedestrianWoman', 'passenger', 'passengerMan', 'pedestrian', 'passengerVIP',
];
const MAN_CHARACTER_KEYS = [
  'passengerMan', 'passenger', 'pedestrian', 'passengerVIP', 'passengerWoman', 'pedestrianWoman',
];
const AMBIENT_CHARACTER_KEYS = [
  'pedestrianWoman', 'pedestrian', 'passengerWoman', 'passengerMan', 'passenger', 'passengerVIP',
];

function finite(value) {
  return Number.isFinite(Number(value));
}

function depthOffset(depth) {
  if (depth > FAR_DEPTH_LIMIT) return FAR_ZONE_OFFSET;
  if (depth >= NEAR_DEPTH_LIMIT) return ACTIVE_ZONE_OFFSET;
  return 0;
}

function guidanceDepth(depth, type) {
  return ROADSIDE_TYPES.has(type) ? depth + depthOffset(depth) : depth;
}

function pickCachedKey(models, keys) {
  if (!models?.cache?.has || typeof models.getInstance !== 'function') return null;
  return keys.find((key) => models.cache.has(key)) || null;
}

function copyTransform(target, source) {
  if (!target || !source) return;
  target.position?.copy?.(source.position);
  target.rotation?.copy?.(source.rotation);
  target.scale?.copy?.(source.scale);
  target.visible = source.visible;
}

function disposeOwnedActor(root) {
  if (!root?.traverse) return;
  const geometries = new Set();
  const materials = new Set();
  const rootUsesSharedGeometry = Boolean(
    root.userData?.sharedGeometry || root.userData?.modelManagerInstance,
  );
  root.traverse((node) => {
    if (
      !rootUsesSharedGeometry &&
      !node.userData?.sharedGeometry &&
      !node.userData?.modelManagerInstance &&
      node.geometry &&
      !geometries.has(node.geometry)
    ) {
      geometries.add(node.geometry);
      node.geometry.dispose?.();
    }
    const values = Array.isArray(node.material) ? node.material : [node.material];
    for (const material of values) {
      if (!material || materials.has(material)) continue;
      materials.add(material);
      // Material instances are cloned by ModelManager. Textures may still be
      // shared with cached templates, so never dispose textures here.
      material.dispose?.();
    }
  });
}

/** Return driving guidance based on the marker's actual displayed depth. */
export function getInteractionAdvice(state, gameStatus = 'PLAY') {
  if (!state || gameStatus !== 'PLAY' || state.event) return null;
  const zones = Array.isArray(state.zones) ? state.zones : [];
  const nearby = zones
    .filter((zone) => {
      if (!zone || !finite(zone.depth)) return false;
      const depth = guidanceDepth(Number(zone.depth), zone.type);
      if (zone.type === 'pothole') return depth >= -0.015 && depth <= 0.34;
      return ROADSIDE_TYPES.has(zone.type) && depth >= -0.015 && depth <= 0.34;
    })
    .sort((a, b) => {
      const da = guidanceDepth(Number(a.depth), a.type);
      const db = guidanceDepth(Number(b.depth), b.type);
      return Math.abs(da - 0.14) - Math.abs(db - 0.14);
    });

  const zone = nearby[0];
  if (!zone) return null;
  const depth = guidanceDepth(Number(zone.depth), zone.type);
  const type = zone.type;
  const label = ZONE_LABELS[type];
  const speed = Math.max(0, Number(state.speed) || 0);
  const reversing = Boolean(state.reverse) || (Number(state.signedSpeed) || 0) < -0.05;

  if (type === 'pothole') {
    return {
      type: 'hazard', zone,
      message: depth > 0.19 ? 'POTHOLE AHEAD · PREPARE TO STEER AROUND IT' : 'POTHOLE CLOSE · STEER CLEAR IF SAFE',
      detail: 'Avoid sudden steering when traffic is close.',
    };
  }
  if (!label) return null;
  if (reversing) {
    return {
      type: 'gear', zone,
      message: `${label} AHEAD · SELECT FORWARD GEAR`,
      detail: 'Roadside interactions activate only in forward gear.',
    };
  }

  const targetLane = clamp(Math.round(Number(zone.lane) || 0), 0, 2) - 1;
  const steer = Number(state.steer) || 0;
  const laneAligned = Math.abs(steer - targetLane) <= 0.48;
  const speedLimit = zone.hub ? 6.5 : 12;

  if (!laneAligned) {
    const laneName = targetLane < -0.35 ? 'LEFT LANE' : targetLane > 0.35 ? 'RIGHT LANE' : 'CENTRE LANE';
    return {
      type: 'lane', zone,
      message: `${label} AHEAD · ALIGN WITH ${laneName}`,
      detail: 'Use a gradual lane change and check surrounding traffic.',
    };
  }
  if (depth > 0.19) {
    return {
      type: 'approach', zone,
      message: `${label} AHEAD · EASE OFF AND PREPARE TO STOP`,
      detail: `Approach slowly; target ${Math.round(speedLimit)} km/h or less.`,
    };
  }
  if (depth < 0.055) {
    return {
      type: 'missed', zone,
      message: `${label} · YOU HAVE PASSED THE STOP POINT`,
      detail: 'Continue safely; the next roadside stop will appear ahead.',
    };
  }
  if (speed > speedLimit) {
    return {
      type: 'brake', zone,
      message: `${label} · BRAKE TO ${Math.round(speedLimit)} KM/H OR LESS`,
      detail: 'Keep the keke aligned with the passenger marker while slowing down.',
    };
  }
  return {
    type: 'ready', zone,
    message: `${label} · STOP BESIDE THE MARKER`,
    detail: type === 'pickup'
      ? 'The passenger should be beside the keke now. Stop and remain aligned.'
      : type === 'drop'
        ? 'Stop beside the drop-off marker.'
        : 'Stop beside the fuel marker to refuel.',
  };
}

/**
 * Limit the existing Game.moveZones interaction trigger to a close window.
 * The game remains authoritative for fares, seating, fuel, collisions and score.
 * A temporary per-zone depth offset changes only the interaction test; offsets
 * are removed before Renderer3D reads the simulation state.
 */
export function installStoppedInteractionCompatibility(game) {
  if (!game || typeof game.moveZones !== 'function') return () => {};
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
  const entry = { active: true, references: 1, original, wrapper: null, restore: null };
  entry.wrapper = function kanoCloseAlignedRoadsideMoveZones(dt) {
    const state = this?.s;
    if (!state || !Array.isArray(state.zones)) return original.call(this, dt);

    const transforms = new Map();
    const initialDepths = new Map();
    for (const zone of state.zones) {
      if (!zone || !ROADSIDE_TYPES.has(zone.type) || !finite(zone.depth)) continue;
      const rawDepth = Number(zone.depth);
      const offset = depthOffset(rawDepth);
      transforms.set(zone, offset);
      initialDepths.set(zone, rawDepth);
      zone.depth = rawDepth + offset;
    }

    const canInteractWhileStopped = Boolean(
      this.state === 'PLAY' && !state.event && !state.reverse &&
      (Number(state.speed) || 0) <= 0.05 &&
      Math.abs(Number(state.signedSpeed) || 0) <= 0.05,
    );
    const previousSignedSpeed = state.signedSpeed;
    if (canInteractWhileStopped) state.signedSpeed = 0.051;

    try {
      return original.call(this, dt);
    } finally {
      if (canInteractWhileStopped) state.signedSpeed = previousSignedSpeed;
      for (const [zone, offset] of transforms) {
        if (!state.zones.includes(zone) || !finite(zone.depth)) continue;
        // Stopped markers must not creep because of the tiny compatibility
        // speed used to satisfy Game's existing moving-forward check.
        zone.depth = canInteractWhileStopped
          ? initialDepths.get(zone)
          : Number(zone.depth) - offset;
      }
    }
  };
  entry.restore = () => {
    if (!entry.active) return;
    entry.active = false;
    if (game.moveZones === entry.wrapper) game.moveZones = original;
    try { delete game[MOVE_ZONES_PATCH]; } catch { game[MOVE_ZONES_PATCH] = undefined; }
  };
  game.moveZones = entry.wrapper;
  Object.defineProperty(game, MOVE_ZONES_PATCH, { configurable: true, value: entry });
  return () => {
    const current = game[MOVE_ZONES_PATCH];
    if (!current) return;
    current.references -= 1;
    if (current.references <= 0) current.restore();
  };
}

/** Swap available cached character GLBs into roadside slots without touching shared geometry. */
function installCharacterFallbacks(renderer) {
  if (!renderer || renderer[CHARACTER_PATCH]?.active) {
    return renderer?.[CHARACTER_PATCH]?.restore || (() => {});
  }
  const restorers = [];
  const rememberPatch = (name, wrapFactory) => {
    const original = renderer[name];
    if (typeof original !== 'function') return;
    const wrapper = wrapFactory(original);
    renderer[name] = wrapper;
    restorers.push(() => {
      if (renderer[name] === wrapper) renderer[name] = original;
    });
  };

  rememberPatch('upgradePedestrians', (original) => function upgradePedestriansWithFallback(...args) {
    const result = original.apply(this, args);
    const models = this.models;
    for (const pedestrian of this.pedestrians || []) {
      if (!pedestrian?.actor || pedestrian.usingModel) continue;
      const keys = Number(pedestrian.index) % 2 === 0
        ? AMBIENT_CHARACTER_KEYS
        : ['pedestrian', 'passengerMan', 'passenger', 'pedestrianWoman', 'passengerWoman', 'passengerVIP'];
      const key = pickCachedKey(models, keys);
      if (!key) continue;
      const model = models.getInstance(key);
      if (!model) continue;
      const oldActor = pedestrian.actor;
      copyTransform(model, oldActor);
      model.rotation.y = pedestrian.side < 0 ? Math.PI / 2 : -Math.PI / 2;
      model.userData.fallback = false;
      model.userData.characterType = key;
      this.world.remove(oldActor);
      disposeOwnedActor(oldActor);
      this.world.add(model);
      pedestrian.actor = model;
      pedestrian.usingModel = true;
      console.info(`[Kano Life] ambient character fallback active: ${key}`);
    }
    return result;
  });

  rememberPatch('syncZones', (original) => function syncZonesWithPassengerFallback(state, ...args) {
    const result = original.call(this, state, ...args);
    const models = this.models;
    const zonesById = new Map((state?.zones || []).map((zone) => [zone.id, zone]));
    for (const [id, actor] of this.zoneActors || []) {
      const zone = zonesById.get(id);
      if (!zone || zone.type !== 'pickup' || !actor?.userData?.waitingActors?.length) continue;
      const currentActor = actor.userData.waitingActors[0];
      const currentKey = currentActor?.userData?.modelKey || actor.userData.waitingModelKeyActive || null;
      const keys = zone.hub ? WOMAN_CHARACTER_KEYS : MAN_CHARACTER_KEYS;
      const key = pickCachedKey(models, keys);
      if (!key) continue;
      if (currentKey === key) {
        actor.userData.waitingUsingModel = Boolean(currentActor?.userData?.modelManagerInstance);
        actor.userData.waitingModelKeyActive = key;
        continue;
      }
      const currentRank = currentKey ? keys.indexOf(currentKey) : Infinity;
      const nextRank = keys.indexOf(key);
      if (currentKey && currentRank >= 0 && currentRank <= nextRank) continue;
      const replacement = models.getInstance(key);
      if (!replacement) continue;
      copyTransform(replacement, currentActor);
      replacement.userData.characterType = key;
      actor.remove(currentActor);
      disposeOwnedActor(currentActor);
      actor.add(replacement);
      actor.userData.waitingActors = [replacement];
      actor.userData.waitingUsingModel = true;
      actor.userData.waitingModelKeyActive = key;
      console.info(`[Kano Life] roadside passenger fallback active: ${key}`);
    }
    return result;
  });

  // Move roadside markers inward to the outer keke lane edge. Their old X of
  // +/-6.7 was several world units beyond the outer lane centres at +/-3.
  rememberPatch('syncZones', (original) => function syncZonesWithAlignedRoadsideX(state, ...args) {
    const result = original.call(this, state, ...args);
    const zones = new Map((state?.zones || []).map((zone) => [zone.id, zone]));
    for (const [id, actor] of this.zoneActors || []) {
      const zone = zones.get(id);
      if (!zone || !ROADSIDE_TYPES.has(zone.type) || !actor?.position) continue;
      const side = Number(zone.side) || (Number(zone.lane) === 0 ? -1 : 1);
      actor.position.x = side * 4.35;
    }
    return result;
  });

  const state = {
    active: true,
    restore: () => {
      if (!state.active) return;
      state.active = false;
      for (const restore of restorers.reverse()) {
        try { restore(); } catch { /* Renderer may already be disposed. */ }
      }
      try { delete renderer[CHARACTER_PATCH]; } catch { renderer[CHARACTER_PATCH] = undefined; }
    },
  };
  Object.defineProperty(renderer, CHARACTER_PATCH, { configurable: true, value: state });
  return state.restore;
}

/** Visual interaction prompts and optional scene diagnostics. */
export class KanoInteractionReliability {
  constructor({ game, container, getRenderer = () => null, getSceneUpgrade = () => null, debug = false } = {}) {
    if (!game?.s) throw new TypeError('KanoInteractionReliability requires an initialized Game instance.');
    if (!container?.append) throw new TypeError('KanoInteractionReliability requires the game container.');
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
    this.characterRenderer = null;
    this.restoreCharacterFallbacks = null;
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
      #game-container .kano-interaction-hint { position:absolute; z-index:11; left:50%; bottom:calc(68px + env(safe-area-inset-bottom, 0px)); transform:translateX(-50%); width:min(92%,390px); padding:10px 13px; border:1px solid rgba(245,197,66,.6); border-radius:13px; background:rgba(10,24,37,.93); color:#f7f8f7; box-shadow:0 8px 26px rgba(0,0,0,.24); text-align:center; pointer-events:none; font:800 11px/1.35 system-ui,sans-serif; letter-spacing:.025em; backdrop-filter:blur(7px); white-space:normal; }
      #game-container .kano-interaction-hint[hidden], #game-container .kano-scene-diagnostics[hidden] { display:none !important; }
      #game-container .kano-interaction-hint[data-kind="hazard"] { border-color:rgba(255,134,110,.78); }
      #game-container .kano-interaction-hint[data-kind="ready"] { border-color:rgba(40,196,165,.72); }
      #game-container .kano-interaction-hint small { display:block; margin-top:3px; color:#b9c8d5; font:600 10px/1.35 system-ui,sans-serif; }
      #game-container .kano-scene-diagnostics { position:absolute; z-index:60; top:76px; right:8px; width:min(340px,calc(100% - 16px)); max-height:38%; overflow:auto; padding:10px 12px; border:1px solid rgba(255,255,255,.22); border-radius:10px; background:rgba(6,15,25,.94); color:#e9f1f7; font:11px/1.45 ui-monospace,SFMono-Regular,Consolas,monospace; white-space:pre-wrap; overflow-wrap:anywhere; pointer-events:auto; }
      #game-container .kano-scene-diagnostics strong { color:#f5c542; }
      @media(max-width:480px) { #game-container .kano-interaction-hint { bottom:calc(61px + env(safe-area-inset-bottom,0px)); width:calc(100% - 18px); padding:8px 10px; font-size:10px; } #game-container .kano-interaction-hint small { font-size:9px; } #game-container .kano-scene-diagnostics { top:68px; right:6px; max-height:30%; font-size:10px; } }
      @media(prefers-reduced-motion:reduce) { #game-container .kano-interaction-hint { backdrop-filter:none; } }
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

  bindRendererFallbacks() {
    const renderer = this.getRenderer?.();
    if (!renderer || renderer === this.characterRenderer) return;
    try { this.restoreCharacterFallbacks?.(); } catch { /* Previous renderer may be gone. */ }
    this.characterRenderer = renderer;
    this.restoreCharacterFallbacks = installCharacterFallbacks(renderer);
  }

  update(deltaSeconds = 0, state = this.game?.s || {}) {
    if (this.disposed) return;
    this.bindRendererFallbacks();
    this.elapsed += Math.min(Math.max(Number(deltaSeconds) || 0, 0), 0.05);
    this.updateHint(state);
    if (this.debug && this.diagnostics && this.elapsed - this.lastDiagnosticsAt >= 0.25) {
      this.lastDiagnosticsAt = this.elapsed;
      this.updateDiagnostics(state);
    }
  }

  updateHint(state) {
    if (!this.hint) return;
    const advice = getInteractionAdvice(state, this.game.state);
    if (!advice) { this.hint.hidden = true; this.lastHintText = ''; return; }
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
    const driverFound = Boolean(player?.userData?.driverAnimationParts?.driverPivot || rigPivot || rigRoot);
    let seatStatus = 'not measurable';
    if (player && driverFound) {
      try {
        player.updateMatrixWorld?.(true);
        const driverObject = rigPivot || player.userData?.driverAnimationParts?.driverPivot || rigRoot;
        const vehiclePosition = player.position?.clone?.();
        const driverPosition = driverObject?.position?.clone?.();
        if (vehiclePosition && driverPosition && typeof player.getWorldPosition === 'function' && typeof driverObject?.getWorldPosition === 'function') {
          player.getWorldPosition(vehiclePosition);
          driverObject.getWorldPosition(driverPosition);
          const dx = Math.abs(driverPosition.x - vehiclePosition.x);
          const dz = Math.abs(driverPosition.z - vehiclePosition.z);
          seatStatus = dx <= 1.3 && dz <= 1.8
            ? `driver anchor near chassis centre (x=${dx.toFixed(2)}, z=${dz.toFixed(2)} m; approximate)`
            : `WARNING: driver anchor offset from chassis (x=${dx.toFixed(2)}, z=${dz.toFixed(2)} m)`;
        } else seatStatus = 'world-position check unavailable';
      } catch { seatStatus = 'seat position unavailable'; }
    } else if (player) seatStatus = 'WARNING: no recognized seated-driver rig';
    else seatStatus = 'no 3D player (2D renderer or not initialized)';

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
      'Roadside trigger: narrowed to the near-side marker window',
      'Character fallback bridge: active when compatible GLBs are cached',
      'Note: seat check is a position heuristic, not a perfect visual verdict.',
    ].join('\n');
    if (this.diagnostics.textContent !== status) this.diagnostics.textContent = status;
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    window.removeEventListener('pagehide', this.onPageHide);
    this.restoreMoveZones?.();
    this.restoreMoveZones = null;
    try { this.restoreCharacterFallbacks?.(); } catch { /* Renderer may already be disposed. */ }
    this.restoreCharacterFallbacks = null;
    this.characterRenderer = null;
    this.hint?.remove();
    this.diagnostics?.remove();
    if (this.styleElement?.isConnected) this.styleElement.remove();
    this.hint = null;
    this.diagnostics = null;
  }
}
