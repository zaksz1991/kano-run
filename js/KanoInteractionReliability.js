const MOVE_ZONES_PATCH = Symbol.for('kano.life.stopped-roadside-interaction.v1');
const CHARACTER_PATCH = Symbol.for('kano.life.late-character-fallback.v1');
const CROWD_DIRECTION_PATCH = Symbol.for('kano.life.crowd-direction-fix.v1');

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const ROADSIDE_INTERACTION_DEPTH_OFFSET = 0.12;
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

function isFiniteNumber(value) {
  return Number.isFinite(Number(value));
}

function pickCachedKey(models, keys) {
  if (!models?.cache?.has || typeof models.getInstance !== 'function') return null;
  return keys.find((key) => models.cache.has(key)) || null;
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
      material.dispose?.();
    }
  });
}

function copyTransform(target, source) {
  if (!target || !source) return;
  target.position?.copy?.(source.position);
  target.rotation?.copy?.(source.rotation);
  target.scale?.copy?.(source.scale);
  target.visible = source.visible;
}

/** Return driving guidance consistent with the renderer-aligned stop window. */
export function getInteractionAdvice(state, gameStatus = 'PLAY') {
  if (!state || gameStatus !== 'PLAY' || state.event) return null;
  const zones = Array.isArray(state.zones) ? state.zones : [];
  const nearby = zones
    .filter((zone) => {
      if (!zone || !isFiniteNumber(zone.depth)) return false;
      const depth = Number(zone.depth);
      if (zone.type === 'pothole') return depth >= -0.015 && depth <= 0.34;
      if (ROADSIDE_TYPES.has(zone.type)) {
        const interactionDepth = depth + ROADSIDE_INTERACTION_DEPTH_OFFSET;
        return interactionDepth >= -0.015 && interactionDepth <= 0.34;
      }
      return false;
    })
    .sort((a, b) => {
      const depthA = Number(a.depth) + (ROADSIDE_TYPES.has(a.type) ? ROADSIDE_INTERACTION_DEPTH_OFFSET : 0);
      const depthB = Number(b.depth) + (ROADSIDE_TYPES.has(b.type) ? ROADSIDE_INTERACTION_DEPTH_OFFSET : 0);
      return Math.abs(depthA - 0.14) - Math.abs(depthB - 0.14);
    });

  const zone = nearby[0];
  if (!zone) return null;
  const depth = Number(zone.depth) + (ROADSIDE_TYPES.has(zone.type) ? ROADSIDE_INTERACTION_DEPTH_OFFSET : 0);
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
  if (speed > speedLimit) {
    return {
      type: 'brake', zone,
      message: `${label} · BRAKE TO ${Math.round(speedLimit)} KM/H OR LESS`,
      detail: 'Keep the Keke aligned with the roadside marker while slowing down.',
    };
  }
  return {
    type: 'ready', zone,
    message: `${label} · STOP ZONE REACHED`,
    detail: type === 'pickup'
      ? 'Passenger boarding zone reached. Stop and remain aligned with the marker.'
      : type === 'drop'
        ? 'Stop when the drop-off marker is beside the keke.'
        : 'Stop beside the fuel marker to refuel.',
  };
}

/** Keeps existing game rules while enabling interaction at a full stop. */
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
  entry.wrapper = function kanoAlignedRoadsideMoveZones(dt) {
    const state = this?.s;
    if (!state || !Array.isArray(state.zones)) return original.call(this, dt);

    const shiftedZones = state.zones.filter((zone) =>
      zone && ROADSIDE_TYPES.has(zone.type) && Number.isFinite(Number(zone.depth))
    );
    for (const zone of shiftedZones) zone.depth = Number(zone.depth) + ROADSIDE_INTERACTION_DEPTH_OFFSET;

    const canInteractWhileStopped = Boolean(
      this?.state === 'PLAY' && !state.event && !state.reverse &&
      (Number(state.speed) || 0) <= 0.05 && (Number(state.signedSpeed) || 0) <= 0.05,
    );
    const previousSignedSpeed = state.signedSpeed;
    const previousDepths = new Map();
    if (canInteractWhileStopped) {
      state.signedSpeed = 0.051;
      for (const zone of state.zones) {
        if (zone && Number.isFinite(Number(zone.depth))) previousDepths.set(zone, Number(zone.depth));
      }
    }

    try {
      return original.call(this, dt);
    } finally {
      if (canInteractWhileStopped) state.signedSpeed = previousSignedSpeed;
      for (const zone of shiftedZones) zone.depth = Number(zone.depth) - ROADSIDE_INTERACTION_DEPTH_OFFSET;
      if (canInteractWhileStopped && Array.isArray(state.zones)) {
        for (const [zone, oldDepth] of previousDepths) {
          if (state.zones.includes(zone) && Number.isFinite(Number(zone.depth))) {
            zone.depth = shiftedZones.includes(zone) ? oldDepth - ROADSIDE_INTERACTION_DEPTH_OFFSET : oldDepth;
          }
        }
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

/**
 * Make the actual market crowd face its walking direction. The crowd is built
 * by KanoSceneUpgrade as InstancedMesh geometry, not by the GLB animation
 * module. This wrapper therefore patches the owning scene upgrade directly.
 */
function installCrowdDirectionFix(sceneUpgrade) {
  if (!sceneUpgrade || sceneUpgrade[CROWD_DIRECTION_PATCH]?.active) {
    return sceneUpgrade?.[CROWD_DIRECTION_PATCH]?.restore || (() => {});
  }
  if (typeof sceneUpgrade.updateCrowdMatrices !== 'function' || !Array.isArray(sceneUpgrade.walkers)) {
    return () => {};
  }

  const original = sceneUpgrade.updateCrowdMatrices;
  const wrapper = function updateCrowdMatricesFacingTravel() {
    if (!this.walkers?.length || this.disposed) return;
    const write = this.writeMatrix;
    if (typeof write !== 'function' || !this.dummy) return original.call(this);

    this.walkers.forEach((walker, index) => {
      // walker.direction is the sign of its movement along world Z. Models
      // normally face local -Z, so a +Z walker receives a 180-degree yaw.
      const direction = Number(walker.direction) < 0 ? -1 : 1;
      const yaw = direction > 0 ? Math.PI : 0;
      const phase = this.elapsed * 6.8 * walker.speed + walker.phase;
      const step = Math.sin(phase) * 0.30;
      const stride = Math.cos(phase) * 0.22;
      const bob = Math.abs(step) * 0.035;
      const height = walker.height;
      const x = walker.x + Math.sin(this.elapsed * 1.1 + walker.phase) * walker.sway;
      const z = walker.z;

      write.call(this, this.crowdTorso, index, x, 0.98 * height + bob, z, yaw, 1, height, 0.90);
      write.call(this, this.crowdHead, index, x, 1.58 * height + bob, z, yaw, 1, 1, 0.92);

      for (const side of [-1, 1]) {
        const partIndex = index * 2 + (side > 0 ? 1 : 0);
        const armSwing = side * stride * direction * 0.32;
        this.dummy.position.set(x + side * 0.22, 1.02 * height + bob, z);
        this.dummy.rotation.set(armSwing, yaw, 0);
        this.dummy.scale.set(1, 1, 1);
        this.dummy.updateMatrix();
        this.crowdArms.setMatrixAt(partIndex, this.dummy.matrix);

        const legSwing = -side * stride * direction;
        this.dummy.position.set(x + side * 0.09, 0.44 * height, z);
        this.dummy.rotation.set(legSwing, yaw, 0);
        this.dummy.scale.set(1, 1, 1);
        this.dummy.updateMatrix();
        this.crowdLegs.setMatrixAt(partIndex, this.dummy.matrix);
      }
    });

    for (const mesh of [this.crowdTorso, this.crowdHead, this.crowdArms, this.crowdLegs]) {
      if (mesh?.instanceMatrix) mesh.instanceMatrix.needsUpdate = true;
    }
  };

  const patchState = {
    active: true,
    original,
    wrapper,
    restore() {
      if (!patchState.active) return;
      patchState.active = false;
      if (sceneUpgrade.updateCrowdMatrices === wrapper) sceneUpgrade.updateCrowdMatrices = original;
      try { delete sceneUpgrade[CROWD_DIRECTION_PATCH]; } catch { sceneUpgrade[CROWD_DIRECTION_PATCH] = undefined; }
    },
  };
  Object.defineProperty(sceneUpgrade, CROWD_DIRECTION_PATCH, { configurable: true, value: patchState });
  sceneUpgrade.updateCrowdMatrices = wrapper;
  return patchState.restore;
}

/** Late GLB fallback bridge for roadside waiting actors and renderer pedestrians. */
function installCharacterFallbacks(renderer) {
  if (!renderer || renderer[CHARACTER_PATCH]?.active) return renderer?.[CHARACTER_PATCH]?.restore || (() => {});
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
      const keys = (Number(pedestrian.index) % 2 === 0)
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
      const currentKey = currentActor?.userData?.modelKey || currentActor?.userData?.characterType || actor.userData.waitingModelKeyActive || null;
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
    this.characterSceneUpgrade = null;
    this.restoreCrowdDirection = null;
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
    if (renderer !== this.characterRenderer) {
      try { this.restoreCharacterFallbacks?.(); } catch { /* Previous renderer may be gone. */ }
      this.characterRenderer = renderer || null;
      this.restoreCharacterFallbacks = renderer ? installCharacterFallbacks(renderer) : null;
    }

    const sceneUpgrade = this.getSceneUpgrade?.();
    if (sceneUpgrade !== this.characterSceneUpgrade) {
      try { this.restoreCrowdDirection?.(); } catch { /* Previous scene upgrade may be gone. */ }
      this.characterSceneUpgrade = sceneUpgrade || null;
      this.restoreCrowdDirection = sceneUpgrade ? installCrowdDirectionFix(sceneUpgrade) : null;
    }
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
    const nearbyZone = near?.zone ? `${near.zone.type} depth=${Number(near.zone.depth).toFixed(3)} lane=${near.zone.lane}` : 'none';
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
      `Crowd facing correction: ${sceneUpgrade?.[CROWD_DIRECTION_PATCH]?.active ? 'active' : 'waiting / unavailable'}`,
      `Speed: ${Math.round(Number(state.speed) || 0)} km/h · gear: ${state.reverse ? 'REVERSE' : 'FORWARD'}`,
      `Nearby zone: ${nearbyZone}`,
      `Interaction guidance: ${near?.message || 'none'}`,
      'Roadside interaction timing: renderer-aligned',
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
    try { this.restoreCrowdDirection?.(); } catch { /* Scene upgrade may already be disposed. */ }
    this.restoreCrowdDirection = null;
    this.characterSceneUpgrade = null;
    this.characterRenderer = null;
    this.hint?.remove();
    this.diagnostics?.remove();
    if (this.styleElement?.isConnected) this.styleElement.remove();
    this.hint = null;
    this.diagnostics = null;
  }
}
