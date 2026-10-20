import { RADIO } from './config.js';
import { save, persist } from './storage.js';

const MOVE_ZONES_PATCH = Symbol.for('kano.life.stopped-roadside-interaction.v1');
const CHARACTER_PATCH = Symbol.for('kano.life.late-character-fallback.v1');
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

export function getInteractionAdvice(state, gameStatus = 'PLAY') {
  if (!state || gameStatus !== 'PLAY' || state.event) return null;
  const zones = Array.isArray(state.zones) ? state.zones : [];
  const nearby = zones
    .filter((zone) => {
      if (!zone || !Number.isFinite(Number(zone.depth))) return false;
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
    const shiftedZones = state.zones.filter((zone) => zone && ROADSIDE_TYPES.has(zone.type) && Number.isFinite(Number(zone.depth)));
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

function installCharacterFallbacks(renderer, onRestore) {
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
  const state = { active: true, restore: () => {
    if (!state.active) return;
    state.active = false;
    for (const restore of restorers.reverse()) {
      try { restore(); } catch { /* Renderer may already be disposed. */ }
    }
    try { delete renderer[CHARACTER_PATCH]; } catch { renderer[CHARACTER_PATCH] = undefined; }
    onRestore?.();
  } };
  Object.defineProperty(renderer, CHARACTER_PATCH, { configurable: true, value: state });
  return state.restore;
}

/** Interaction prompts, asset fallbacks, and radio controls attached to the live game UI. */
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
    this.radioOn = false;
    this.installStyles();
    this.hint = this.createHint();
    this.radioPanel = this.createRadioControls();
    this.diagnostics = this.debug ? this.createDiagnostics() : null;
    this.onExistingRadioButton = () => this.onLegacyRadioButton();
    this.legacyRadioButton = document.getElementById('radio-btn');
    this.legacyRadioButton?.addEventListener('click', this.onExistingRadioButton);
    this.onPageHide = () => this.dispose();
    window.addEventListener('pagehide', this.onPageHide, { once: true });
    this.refreshRadioUI();
  }

  installStyles() {
    if (document.getElementById('kano-interaction-reliability-styles')) return;
    const style = document.createElement('style');
    style.id = 'kano-interaction-reliability-styles';
    style.textContent = `
      #game-container .kano-interaction-hint { position:absolute; z-index:11; left:50%; bottom:calc(68px + env(safe-area-inset-bottom, 0px)); transform:translateX(-50%); width:min(92%,390px); padding:10px 13px; border:1px solid rgba(245,197,66,.6); border-radius:13px; background:rgba(10,24,37,.93); color:#f7f8f7; box-shadow:0 8px 26px rgba(0,0,0,.24); text-align:center; pointer-events:none; font:800 11px/1.35 system-ui,sans-serif; letter-spacing:.025em; backdrop-filter:blur(7px); white-space:normal; }
      #game-container .kano-interaction-hint[hidden], #game-container .kano-scene-diagnostics[hidden], #game-container .kano-radio-panel[hidden] { display:none !important; }
      #game-container .kano-interaction-hint[data-kind="hazard"] { border-color:rgba(255,134,110,.78); }
      #game-container .kano-interaction-hint[data-kind="ready"] { border-color:rgba(40,196,165,.72); }
      #game-container .kano-interaction-hint small { display:block; margin-top:3px; color:#b9c8d5; font:600 10px/1.35 system-ui,sans-serif; }
      #game-container .kano-radio-panel { position:absolute; z-index:14; top:calc(10px + env(safe-area-inset-top,0px)); left:8px; width:min(250px,calc(100% - 16px)); display:flex; align-items:center; gap:7px; padding:7px; border:1px solid rgba(245,197,66,.55); border-radius:12px; background:rgba(8,20,31,.93); color:#f5f7f7; box-shadow:0 5px 18px rgba(0,0,0,.24); font:700 11px/1.2 system-ui,sans-serif; }
      #game-container .kano-radio-panel select { min-width:0; width:100%; flex:1; color:#f6f7f8; background:#172b3b; border:1px solid #52616c; border-radius:7px; padding:7px 5px; font:700 11px system-ui,sans-serif; }
      #game-container .kano-radio-panel button { flex:0 0 auto; min-height:32px; border:1px solid #8d762f; border-radius:8px; padding:6px 9px; color:#182018; background:#f5c542; font:900 10px system-ui,sans-serif; }
      #game-container .kano-radio-panel button[data-on="true"] { color:#fff; background:#177c59; border-color:#3abf8c; }
      #game-container .kano-radio-status { position:absolute; z-index:14; top:calc(54px + env(safe-area-inset-top,0px)); left:10px; max-width:min(250px,calc(100% - 20px)); color:#e8f0f3; background:rgba(8,20,31,.78); border-radius:6px; padding:4px 7px; font:700 9px/1.25 system-ui,sans-serif; pointer-events:none; }
      #game-container .kano-radio-status[hidden] { display:none !important; }
      #game-container .kano-scene-diagnostics { position:absolute; z-index:60; top:76px; right:8px; width:min(340px,calc(100% - 16px)); max-height:38%; overflow:auto; padding:10px 12px; border:1px solid rgba(255,255,255,.22); border-radius:10px; background:rgba(6,15,25,.94); color:#e9f1f7; font:11px/1.45 ui-monospace,SFMono-Regular,Consolas,monospace; white-space:pre-wrap; overflow-wrap:anywhere; pointer-events:auto; }
      #game-container .kano-scene-diagnostics strong { color:#f5c542; }
      @media(max-width:480px) { #game-container .kano-interaction-hint { bottom:calc(61px + env(safe-area-inset-bottom,0px)); width:calc(100% - 18px); padding:8px 10px; font-size:10px; } #game-container .kano-interaction-hint small { font-size:9px; } #game-container .kano-radio-panel { width:min(232px,calc(100% - 16px)); padding:6px; gap:5px; } #game-container .kano-radio-panel button { padding:6px 7px; } #game-container .kano-scene-diagnostics { top:68px; right:6px; max-height:30%; font-size:10px; } }
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

  createRadioControls() {
    const panel = document.createElement('section');
    panel.className = 'kano-radio-panel';
    panel.setAttribute('aria-label', 'Radio station controls');
    panel.hidden = true;

    const stationSelect = document.createElement('select');
    stationSelect.setAttribute('aria-label', 'Select radio station');
    const stations = Array.isArray(RADIO) ? RADIO : [];
    stations.forEach((station, index) => {
      const option = document.createElement('option');
      option.value = String(index);
      option.textContent = `${station.name}${station.freq ? ` · ${station.freq}` : ''}`;
      stationSelect.append(option);
    });

    const powerButton = document.createElement('button');
    powerButton.type = 'button';
    powerButton.textContent = 'RADIO OFF';
    powerButton.dataset.on = 'false';
    powerButton.setAttribute('aria-pressed', 'false');
    powerButton.addEventListener('click', () => this.toggleRadio());
    stationSelect.addEventListener('change', () => this.selectRadio(Number(stationSelect.value)));

    panel.append(stationSelect, powerButton);
    this.container.append(panel);

    const status = document.createElement('div');
    status.className = 'kano-radio-status';
    status.hidden = true;
    this.container.append(status);
    this.radioStatus = status;
    this.radioSelect = stationSelect;
    this.radioPowerButton = powerButton;
    return panel;
  }

  selectedStation() {
    if (!Array.isArray(RADIO) || !RADIO.length) return null;
    const savedIndex = Math.trunc(Number(save?.radioIndex) || 0);
    const index = ((savedIndex % RADIO.length) + RADIO.length) % RADIO.length;
    return RADIO[index] || null;
  }

  selectRadio(index) {
    if (!Array.isArray(RADIO) || !RADIO.length) return;
    if (!Number.isInteger(index) || index < 0 || index >= RADIO.length) return;
    save.radioIndex = index;
    const station = RADIO[index];
    if (this.game?.s) this.game.s.radio = station;
    try { persist(); } catch (_) {}
    if (this.radioOn) this.tuneCurrentStation();
    this.refreshRadioUI();
  }

  tuneCurrentStation() {
    const station = this.selectedStation();
    const audio = this.game?.audio;
    if (!station || !audio) return Promise.resolve(false);
    try {
      const result = typeof audio.radioTune === 'function'
        ? audio.radioTune(station.name)
        : typeof audio.startRadioBed === 'function'
          ? audio.startRadioBed()
          : false;
      return Promise.resolve(result).then((success) => {
        if (this.radioOn && success === false) {
          this.setRadioStatus('RADIO ON · NO LOCAL TRACK FOUND');
        }
        return success;
      }).catch(() => {
        if (this.radioOn) this.setRadioStatus('RADIO ON · AUDIO UNAVAILABLE');
        return false;
      });
    } catch (_) {
      this.setRadioStatus('RADIO ON · AUDIO UNAVAILABLE');
      return Promise.resolve(false);
    }
  }

  toggleRadio() {
    const audio = this.game?.audio;
    if (!audio) {
      this.setRadioStatus('RADIO AUDIO UNAVAILABLE');
      return;
    }
    if (this.radioOn) {
      this.radioOn = false;
      try { audio.stopRadioBed?.(); } catch (_) {}
      this.setRadioStatus('RADIO OFF');
      this.refreshRadioUI();
      return;
    }
    this.radioOn = true;
    this.refreshRadioUI();
    // This click is a direct user gesture, satisfying mobile audio policies.
    this.tuneCurrentStation();
  }

  onLegacyRadioButton() {
    // UI.bind already advances save.radioIndex when the existing CHANGE RADIO
    // button is pressed. This listener runs after that handler and connects it
    // to the actual audio manager without toggling radio power.
    window.setTimeout(() => {
      this.refreshRadioUI();
      if (this.radioOn) this.tuneCurrentStation();
    }, 0);
  }

  setRadioStatus(text) {
    if (!this.radioStatus) return;
    this.radioStatus.textContent = text;
    this.radioStatus.hidden = false;
    if (this.radioStatusTimer) window.clearTimeout(this.radioStatusTimer);
    this.radioStatusTimer = window.setTimeout(() => {
      if (!this.disposed && this.radioStatus) this.radioStatus.hidden = true;
    }, 3200);
  }

  refreshRadioUI() {
    if (!this.radioSelect || !this.radioPowerButton) return;
    const station = this.selectedStation();
    const index = Math.trunc(Number(save?.radioIndex) || 0);
    this.radioSelect.value = String(((index % Math.max(1, RADIO.length)) + Math.max(1, RADIO.length)) % Math.max(1, RADIO.length));
    this.radioPowerButton.textContent = this.radioOn ? 'RADIO ON' : 'RADIO OFF';
    this.radioPowerButton.dataset.on = String(this.radioOn);
    this.radioPowerButton.setAttribute('aria-pressed', String(this.radioOn));
    this.radioPanel.hidden = !['PLAY', 'MENU'].includes(this.game?.state);
    if (this.radioStatus?.hidden) {
      this.radioStatus.textContent = station
        ? `${this.radioOn ? 'RADIO ON' : 'RADIO OFF'} · ${station.name}`
        : (this.radioOn ? 'RADIO ON' : 'RADIO OFF');
    }
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
    try { this.restoreCharacterFallbacks?.(); } catch (_) {}
    this.characterRenderer = renderer;
    this.restoreCharacterFallbacks = installCharacterFallbacks(renderer);
  }

  update(deltaSeconds = 0, state = this.game?.s || {}) {
    if (this.disposed) return;
    this.bindRendererFallbacks();
    this.elapsed += Math.min(Math.max(Number(deltaSeconds) || 0, 0), 0.05);
    this.updateHint(state);
    this.refreshRadioUI();
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
      `Speed: ${Math.round(Number(state.speed) || 0)} km/h · gear: ${state.reverse ? 'REVERSE' : 'FORWARD'}`,
      `Nearby zone: ${nearbyZone}`,
      `Interaction guidance: ${near?.message || 'none'}`,
      `Radio: ${this.radioOn ? 'ON' : 'OFF'} · ${this.selectedStation()?.name || 'no station'}`,
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
    this.legacyRadioButton?.removeEventListener('click', this.onExistingRadioButton);
    if (this.radioOn) {
      try { this.game?.audio?.stopRadioBed?.(); } catch (_) {}
    }
    if (this.radioStatusTimer) window.clearTimeout(this.radioStatusTimer);
    this.restoreMoveZones?.();
    this.restoreMoveZones = null;
    try { this.restoreCharacterFallbacks?.(); } catch (_) {}
    this.restoreCharacterFallbacks = null;
    this.characterRenderer = null;
    this.hint?.remove();
    this.radioPanel?.remove();
    this.radioStatus?.remove();
    this.diagnostics?.remove();
    if (this.styleElement?.isConnected) this.styleElement.remove();
    this.hint = null;
    this.radioPanel = null;
    this.radioStatus = null;
    this.diagnostics = null;
  }
}
