/**
 * KANO LIFE — HISBAH COMMUNITY PATROL DIRECTOR
 *
 * Adds a respectful, optional Kano-specific Hisbah road encounter without
 * rewriting the core Game or Renderer3D files. This module is intentionally
 * loaded before main.js so its prototype hooks exist before Game is created.
 *
 * Integrates with the existing event card and police vehicle model. If the
 * police GLB is unavailable, the existing renderer's police fallback is used.
 */
import * as THREE from 'three';
import { Game } from './game.js';
import { Renderer3D } from './renderer3d.js';
import { save, persist } from './storage.js';

const PATCH_KEY = Symbol.for('kano.life.hisbah.community.patrol.v1');
const RENDERER_PATCH_KEY = Symbol.for('kano.life.hisbah.renderer.patrol.v1');
const clamp = (value, minimum, maximum) => Math.max(minimum, Math.min(maximum, value));
const randomBetween = (minimum, maximum) => minimum + Math.random() * (maximum - minimum);
const MODES_WITH_HISBAH = new Set(['career', 'freeRoam']);

function isHisbahEnabled() {
  return save.hisbahEnabled !== false;
}

function ensureHisbahRecord() {
  const old = save.hisbahRecord && typeof save.hisbahRecord === 'object'
    ? save.hisbahRecord
    : {};

  save.hisbahRecord = {
    stops: Math.max(0, Math.floor(Number(old.stops) || 0)),
    cooperated: Math.max(0, Math.floor(Number(old.cooperated) || 0)),
    guidanceRequested: Math.max(0, Math.floor(Number(old.guidanceRequested) || 0)),
    warnings: Math.max(0, Math.floor(Number(old.warnings) || 0)),
    communityPoints: Math.max(0, Math.floor(Number(old.communityPoints) || 0)),
    lastOutcome: String(old.lastOutcome || ''),
    lastAt: Math.max(0, Number(old.lastAt) || 0),
  };

  return save.hisbahRecord;
}

function safePersist() {
  try {
    const result = persist();
    return result !== false;
  } catch (error) {
    console.warn('[Kano Life] Hisbah record could not be saved.', error);
    return false;
  }
}

function localizedGuidance(dialect) {
  const copy = {
    hausa: 'Hisbah community officers are guiding traffic near a busy market or mosque entrance. Ka tsaya lafiya, kada ka toshe hanya, kuma ka tabbatar fasinjoji suna zaune lafiya.',
    yoruba: 'Hisbah community officers are guiding traffic near a busy market or mosque entrance. Dúró ní ààbò, má ṣe dí ẹnu ọ̀nà, kí àwọn arìnrìn-àjò jókòó dáadáa.',
    igbo: 'Hisbah community officers are guiding traffic near a busy market or mosque entrance. Kwụsị n’udo, emechila ụzọ, hụkwa na ndị njem nọ ọdụ nke ọma.',
  };
  return copy[dialect] || copy.hausa;
}

function publishRecordUpdate() {
  try {
    window.dispatchEvent(new CustomEvent('kano:hisbah-record-updated', {
      detail: {
        enabled: isHisbahEnabled(),
        record: { ...ensureHisbahRecord() },
      },
    }));
  } catch {
    // The game must keep running if CustomEvent is unavailable.
  }
}

function createPatrolTraffic(game) {
  const state = game?.s;
  if (!state || !Array.isArray(state.traffic)) return null;

  const shoulderSide = Number(state.steer) > 0.35 ? -1 : 1;
  let patrol = state.traffic.find((vehicle) => (
    vehicle?.serviceRole === 'hisbah' &&
    Number(vehicle.depth) > -0.12 &&
    Number(vehicle.depth) < 1.9
  ));

  if (!patrol) {
    patrol = {
      id: `kano-hisbah-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      type: 'police',
      lane: shoulderSide < 0 ? 0 : 2,
      direction: 1,
      depth: 0.30,
      speedKmh: 0,
      color: '#f4f5ee',
      passed: true,
      speed: 1,
      serviceRole: 'hisbah',
      shoulderSide,
      shoulderX: shoulderSide * 4.65,
      noCollision: true,
      label: 'HISBAH COMMUNITY PATROL',
    };
    state.traffic.push(patrol);
  } else {
    patrol.type = 'police';
    patrol.lane = shoulderSide < 0 ? 0 : 2;
    patrol.direction = 1;
    patrol.depth = 0.30;
    patrol.speedKmh = 0;
    patrol.passed = true;
    patrol.serviceRole = 'hisbah';
    patrol.shoulderSide = shoulderSide;
    patrol.shoulderX = shoulderSide * 4.65;
    patrol.noCollision = true;
    patrol.label = 'HISBAH COMMUNITY PATROL';
  }

  return patrol;
}

function createHisbahEvent(game) {
  const state = game?.s;
  if (!state || state.event || game.state !== 'PLAY' || (Number(state.eventCooldown) || 0) > 0) {
    return false;
  }

  state.hisbahApproachSpeed = Math.max(0, Number(state.speed) || 0);
  state.hisbahSafeApproach = state.hisbahApproachSpeed <= 28;
  state.event = 'hisbah';
  state.gas = false;
  state.brake = false;
  state.speed = 0;
  state.signedSpeed = 0;
  state.reverse = false;
  state.eventCooldown = Math.max(Number(state.eventCooldown) || 0, 7.5);
  state.hisbahStops = (Number(state.hisbahStops) || 0) + 1;
  state.hisbahPatrolId = createPatrolTraffic(game)?.id || '';

  try { game.audio?.engine?.(0); } catch { /* Sound is optional. */ }

  const dialect = state.dialect || save.dialect || 'hausa';
  game.state = 'EVENT';

  game.ui?.event?.(
    'HISBAH COMMUNITY PATROL · KANO',
    'A respectful roadside check',
    localizedGuidance(dialect),
    [
      { label: 'COOPERATE · CLEAR THE ENTRANCE', action: 'hisbah_cooperate' },
      { label: 'ASK FOR GUIDANCE', action: 'hisbah_guidance' },
      { label: 'IGNORE THE REQUEST', action: 'hisbah_ignore' },
    ],
  );

  console.info('[Kano Life] Hisbah community patrol encounter opened.');
  return true;
}

function resolveHisbahEvent(game, action) {
  const state = game?.s;
  if (!state || state.event !== 'hisbah' || game.state !== 'EVENT') return false;

  const record = ensureHisbahRecord();
  record.stops += 1;
  record.lastAt = Date.now();

  let toastMessage = '';

  if (action === 'hisbah_cooperate') {
    const reward = state.hisbahSafeApproach ? 120 : 70;
    state.score = Math.max(0, Number(state.score) || 0) + reward;
    state.heat = Math.max(0, (Number(state.heat) || 0) - 2);
    state.hisbahComplied = (Number(state.hisbahComplied) || 0) + 1;
    record.cooperated += 1;
    record.communityPoints += 1;
    record.lastOutcome = 'cooperated';
    toastMessage = `Hisbah check complete · entrance clear · +₦${reward} safe-driving points`;
  } else if (action === 'hisbah_guidance') {
    const reward = state.hisbahSafeApproach ? 40 : 0;
    state.score = Math.max(0, Number(state.score) || 0) + reward;
    state.heat = Math.max(0, (Number(state.heat) || 0) - 1);
    state.hisbahGuidanceRequests = (Number(state.hisbahGuidanceRequests) || 0) + 1;
    record.guidanceRequested += 1;
    record.lastOutcome = 'asked-guidance';
    toastMessage = reward
      ? 'Hisbah guidance received · thanks for approaching safely · +₦40 points'
      : 'Hisbah guidance received · keep a safe approach speed at the next stop';
  } else if (action === 'hisbah_ignore') {
    state.score = Math.max(0, (Number(state.score) || 0) - 200);
    state.heat = clamp((Number(state.heat) || 0) + 6, 0, 100);
    state.hisbahWarnings = (Number(state.hisbahWarnings) || 0) + 1;
    record.warnings += 1;
    record.lastOutcome = 'warning';
    toastMessage = 'Hisbah warning recorded · run points reduced by ₦200';
  } else {
    // A stale or malformed action must not leave the game stuck in EVENT.
    state.score = Math.max(0, Number(state.score) || 0);
    record.lastOutcome = 'dismissed';
    toastMessage = 'Hisbah checkpoint closed';
  }

  state.event = null;
  game.state = 'PLAY';
  state.gas = false;
  state.brake = false;
  state.speed = 0;
  state.signedSpeed = 0;
  state.reverse = false;
  state.invuln = Math.max(Number(state.invuln) || 0, 1.0);
  state.hisbahTimer = randomBetween(112, 155);
  state.hisbahApproachSpeed = 0;
  state.hisbahSafeApproach = false;

  safePersist();
  publishRecordUpdate();

  try { game.ui?.hideEvent?.(); } catch { /* UI cleanup is optional. */ }
  try { game.ui?.update?.(state, game.route, game.driver); } catch { /* UI refresh is optional. */ }
  try { game.ui?.toast?.(toastMessage); } catch { /* Toasts are optional. */ }
  return true;
}

function installGameHooks(GameClass) {
  const prototype = GameClass?.prototype;
  if (!prototype || prototype[PATCH_KEY]) return;

  const originalResetRun = prototype.resetRun;
  const originalTick = prototype.tick;
  const originalBeginEvent = prototype.beginEvent;
  const originalResolveEvent = prototype.resolveEvent;

  if (typeof originalResetRun === 'function') {
    prototype.resetRun = function resetRunWithHisbah(...args) {
      const result = originalResetRun.apply(this, args);
      if (this.s) {
        this.s.hisbahTimer = randomBetween(34, 48);
        this.s.hisbahStops = 0;
        this.s.hisbahComplied = 0;
        this.s.hisbahGuidanceRequests = 0;
        this.s.hisbahWarnings = 0;
        this.s.hisbahPatrolId = '';
        this.s.hisbahApproachSpeed = 0;
        this.s.hisbahSafeApproach = false;
      }
      return result;
    };
  }

  if (typeof originalBeginEvent === 'function') {
    prototype.beginEvent = function beginEventWithHisbah(type, ...args) {
      if (type === 'hisbah') return createHisbahEvent(this);
      return originalBeginEvent.call(this, type, ...args);
    };
  }

  if (typeof originalResolveEvent === 'function') {
    prototype.resolveEvent = function resolveEventWithHisbah(action, ...args) {
      if (this.s?.event === 'hisbah') return resolveHisbahEvent(this, action);
      return originalResolveEvent.call(this, action, ...args);
    };
  }

  if (typeof originalTick === 'function') {
    prototype.tick = function tickWithHisbahDirector(deltaSeconds, ...args) {
      const result = originalTick.call(this, deltaSeconds, ...args);
      const state = this?.s;
      if (
        !state ||
        this.state !== 'PLAY' ||
        state.event ||
        !MODES_WITH_HISBAH.has(this.mode) ||
        !isHisbahEnabled()
      ) return result;

      const dt = clamp(Number(deltaSeconds) || 0, 0, 0.05);
      if ((Number(state.distance) || 0) < 0.22 || (Number(state.elapsed) || 0) < 28) return result;

      state.hisbahTimer = Math.max(0, (Number(state.hisbahTimer) || 0) - dt);
      if (state.hisbahTimer > 0 || (Number(state.eventCooldown) || 0) > 0) return result;

      // Do not freeze a fast-moving keke in place. Warn first and wait until
      // the driver slows to a safe approach speed before opening the dialog.
      if ((Number(state.speed) || 0) > 42) {
        if (!state.hisbahSpeedWarned) {
          this.ui?.toast?.('HISBAH PATROL AHEAD · ease off and approach the checkpoint safely');
          state.hisbahSpeedWarned = true;
        }
        state.hisbahTimer = 2.5;
        return result;
      }

      state.hisbahSpeedWarned = false;
      this.beginEvent('hisbah');
      return result;
    };
  }

  Object.defineProperty(prototype, PATCH_KEY, {
    configurable: false,
    enumerable: false,
    writable: false,
    value: {
      originalResetRun,
      originalTick,
      originalBeginEvent,
      originalResolveEvent,
    },
  });
  console.info('[Kano Life] Hisbah community patrol and encounter system installed.');
}

function applyPatrolVisuals(actor) {
  if (!actor?.add || actor.userData?.kanoHisbahVisuals) return;
  actor.userData = actor.userData || {};

  const green = new THREE.MeshStandardMaterial({ color: 0x176b42, roughness: 0.75, metalness: 0.05 });
  const white = new THREE.MeshStandardMaterial({ color: 0xf4f4e9, roughness: 0.6, metalness: 0.02 });
  const darkGreen = new THREE.MeshStandardMaterial({ color: 0x0d4b2e, roughness: 0.7 });

  const addBox = (name, width, height, depth, x, y, z, material) => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(width, height, depth), material);
    mesh.name = name;
    mesh.userData.kanoHisbahVisual = true;
    mesh.position.set(x, y, z);
    actor.add(mesh);
  };

  // Subtle green/white side livery and a static rooftop marker identify the
  // patrol without inventing a separate vehicle model or using flashing lights.
  for (const side of [-1, 1]) {
    addBox('HISBAH_GREEN_SIDE_STRIPE', 0.035, 0.10, 0.94, side * 0.84, 0.56, 0.02, green);
    addBox('HISBAH_WHITE_DOOR_PANEL', 0.038, 0.17, 0.42, side * 0.86, 0.76, 0.02, white);
    addBox('HISBAH_GREEN_DOOR_BADGE', 0.04, 0.08, 0.16, side * 0.885, 0.76, 0.02, darkGreen);
  }
  addBox('HISBAH_ROOF_MARKER', 0.48, 0.075, 0.16, 0, 1.30, -0.05, green);
  addBox('HISBAH_ROOF_WHITE_MARKER', 0.16, 0.08, 0.17, 0, 1.31, -0.05, white);
  actor.userData.kanoHisbahVisuals = true;
}

function installRendererHook(RendererClass) {
  const prototype = RendererClass?.prototype;
  if (!prototype || prototype[RENDERER_PATCH_KEY] || typeof prototype.syncTraffic !== 'function') return;

  const originalSyncTraffic = prototype.syncTraffic;
  prototype.syncTraffic = function syncTrafficWithHisbah(state, ...args) {
    const result = originalSyncTraffic.call(this, state, ...args);

    for (const vehicle of state?.traffic || []) {
      if (vehicle?.serviceRole !== 'hisbah') continue;
      const actor = this.trafficActors?.get(vehicle.id);
      if (!actor) continue;
      actor.position.x = Number.isFinite(Number(vehicle.shoulderX))
        ? Number(vehicle.shoulderX)
        : (vehicle.shoulderSide < 0 ? -4.65 : 4.65);
      // The existing police model is loaded by main.js; if it is absent, the
      // renderer's existing procedural police fallback remains available.
      applyPatrolVisuals(actor);
    }

    return result;
  };

  Object.defineProperty(prototype, RENDERER_PATCH_KEY, {
    configurable: false,
    enumerable: false,
    writable: false,
    value: originalSyncTraffic,
  });
}

function mountHisbahPanel() {
  if (typeof document === 'undefined') return;
  if (document.getElementById('kano-hisbah-panel')) return;

  const menuPanel = document.querySelector('#menu-screen .panel');
  if (!menuPanel) return;

  const style = document.createElement('style');
  style.id = 'kano-hisbah-panel-styles';
  style.textContent = `
    #kano-hisbah-panel{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:10px;align-items:center;margin:10px 0;padding:12px;border:1px solid rgba(53,149,98,.5);border-radius:12px;background:linear-gradient(135deg,rgba(18,80,53,.36),rgba(10,29,42,.88));color:#f3faf5;font:600 12px/1.4 system-ui,sans-serif}
    #kano-hisbah-panel h3{margin:0 0 4px;color:#9ce2b7;font-size:12px;letter-spacing:.07em}
    #kano-hisbah-panel p{margin:0;color:#c7d9d0;font-size:11px}
    #kano-hisbah-panel .hisbah-record{display:block;margin-top:6px;color:#f2d980;font-size:10px}
    #kano-hisbah-panel button{min-height:38px;max-width:120px;border:1px solid #45956b;border-radius:9px;background:#174d36;color:white;font:800 10px/1.25 system-ui,sans-serif;padding:8px;cursor:pointer;touch-action:manipulation}
    #kano-hisbah-panel button:focus-visible{outline:2px solid #a7f3c4;outline-offset:2px}
    #kano-hisbah-start-badge{margin:8px auto 0;padding:6px 9px;width:fit-content;max-width:100%;border:1px solid rgba(53,149,98,.45);border-radius:99px;color:#b7edca;background:rgba(18,80,53,.25);font:800 9px/1.3 system-ui,sans-serif;letter-spacing:.06em;text-align:center}
    @media(max-width:520px){#kano-hisbah-panel{grid-template-columns:1fr}#kano-hisbah-panel button{max-width:none;width:100%}}
  `;
  document.head.append(style);

  const section = document.createElement('section');
  section.id = 'kano-hisbah-panel';
  section.setAttribute('aria-label', 'Hisbah community patrol settings');
  section.innerHTML = `
    <div class="hisbah-copy">
      <h3>HISBAH COMMUNITY PATROLS · KANO</h3>
      <p>Roadside guidance near busy market and mosque entrances: stop safely, keep access clear and ensure passengers are seated.</p>
      <small class="hisbah-record" id="kano-hisbah-record">Loading community record…</small>
    </div>
    <button type="button" id="kano-hisbah-toggle" aria-pressed="true">PAUSE PATROLS</button>
  `;
  const menuActions = menuPanel.querySelector('.menu-actions');
  menuPanel.insertBefore(section, menuActions || null);

  const startCard = document.querySelector('#start-screen .start-card');
  if (startCard && !document.getElementById('kano-hisbah-start-badge')) {
    const badge = document.createElement('div');
    badge.id = 'kano-hisbah-start-badge';
    badge.textContent = 'HISBAH COMMUNITY PATROLS · INCLUDED';
    const meta = startCard.querySelector('.start-meta');
    if (meta?.parentElement === startCard) meta.insertAdjacentElement('afterend', badge);
    else startCard.append(badge);
  }

  const refresh = () => {
    const enabled = isHisbahEnabled();
    const record = ensureHisbahRecord();
    const toggle = document.getElementById('kano-hisbah-toggle');
    const output = document.getElementById('kano-hisbah-record');
    if (toggle) {
      toggle.textContent = enabled ? 'PAUSE PATROLS' : 'ENABLE PATROLS';
      toggle.setAttribute('aria-pressed', String(enabled));
    }
    if (output) {
      output.textContent = `Stops ${record.stops} · Cooperated ${record.cooperated} · Guidance ${record.guidanceRequested} · Warnings ${record.warnings} · Respect ${record.communityPoints}`;
    }
    const badge = document.getElementById('kano-hisbah-start-badge');
    if (badge) badge.textContent = enabled
      ? 'HISBAH COMMUNITY PATROLS · ACTIVE'
      : 'HISBAH COMMUNITY PATROLS · PAUSED IN SETTINGS';
  };

  section.querySelector('#kano-hisbah-toggle')?.addEventListener('click', () => {
    save.hisbahEnabled = !isHisbahEnabled();
    safePersist();
    refresh();
    try {
      window.dispatchEvent(new CustomEvent('kano:hisbah-setting-changed', {
        detail: { enabled: isHisbahEnabled() },
      }));
    } catch { /* Optional event. */ }
  });
  window.addEventListener('kano:hisbah-record-updated', refresh);
  window.addEventListener('storage', (event) => {
    if (event.key === 'kano-life-save-v4') refresh();
  });
  refresh();
}

installGameHooks(Game);
installRendererHook(Renderer3D);
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', mountHisbahPanel, { once: true });
} else {
  mountHisbahPanel();
}

window.__KANO_HISBAH__ = Object.freeze({
  version: 1,
  enabled: isHisbahEnabled,
  getRecord: () => ({ ...ensureHisbahRecord() }),
});
