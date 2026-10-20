/**
 * KANO LIFE — HISBAH COMMUNITY MORALS & GOOD CONDUCT DIRECTOR
 *
 * IMPORTANT ROLE SEPARATION
 * - Hisbah is represented as community-based guidance and good-conduct
 *   scenarios in public/community settings.
 * - KAROTA remains the road-transport enforcement/checkpoint system in game.js.
 * - This module NEVER adds a Hisbah car to state.traffic, never adds a road
 *   checkpoint, and never hooks Renderer3D or reuses a police vehicle.
 *
 * Community scenarios cover concerns raised in the game world about public
 * drinking/smoking, inappropriate public intimacy, community modest-dress
 * expectations, and neighbourhood conduct. Responses focus on respectful
 * guidance, peaceful mediation and referral to community officers—not public
 * humiliation or confrontation.
 */

import { Game } from './game.js';
import { save, persist } from './storage.js';

const PATCH_KEY = Symbol.for('kano.life.hisbah.community.conduct.v2');
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const randomBetween = (min, max) => min + Math.random() * (max - min);
const ELIGIBLE_MODES = new Set(['career', 'freeRoam']);
const COMMUNITY_ENVIRONMENTS = new Set([
  'market',
  'schoolGate',
  'wedding',
  'juma',
  'mosqueJunction',
]);
const EVENT_ID = 'hisbahCommunity';

const INCIDENTS = {
  publicSubstanceUse: {
    id: 'publicSubstanceUse',
    kicker: 'HISBAH · COMMUNITY GOOD CONDUCT',
    title: 'Concern about public drinking or smoking',
    copy: 'At a busy market-side family area, a shopkeeper raises a concern about public drinking or smoking nearby. The community wants a calm, appropriate response. You are not being stopped for a traffic or vehicle offence.',
  },
  publicIntimacy: {
    id: 'publicIntimacy',
    kicker: 'HISBAH · COMMUNITY GOOD CONDUCT',
    title: 'A concern about public decency',
    copy: 'A community representative asks for guidance about intimate behaviour being reported around a family gathering. The concern should be handled discreetly and respectfully, without public confrontation or humiliation.',
  },
  modestDress: {
    id: 'modestDress',
    kicker: 'HISBAH · COMMUNITY GOOD CONDUCT',
    title: 'Modest-dress expectations at a gathering',
    copy: 'Organisers of a mosque-area or family gathering ask how to address a concern about revealing clothing and the gathering’s modest-dress expectations. The appropriate response is private, respectful guidance—not shaming someone in public.',
  },
  neighbourhoodConduct: {
    id: 'neighbourhoodConduct',
    kicker: 'HISBAH · COMMUNITY GOOD CONDUCT',
    title: 'A neighbourhood conduct concern',
    copy: 'Residents report disruptive behaviour near homes and family spaces. A local community representative asks for a peaceful way to restore respectful conduct and avoid escalating the dispute.',
  },
};

function isEnabled() {
  return save.hisbahEnabled !== false;
}

function integer(value) {
  return Math.max(0, Math.floor(Number(value) || 0));
}

function ensureRecord() {
  const old = save.hisbahRecord && typeof save.hisbahRecord === 'object'
    ? save.hisbahRecord
    : {};

  // Preserve older data, but do not mislabel old roadside "stops" as
  // community encounters. Those belong to the inaccurate earlier version.
  save.hisbahRecord = {
    ...old,
    communityEncounters: integer(old.communityEncounters),
    peacefulMediations: integer(old.peacefulMediations),
    guidanceRequests: integer(old.guidanceRequests),
    communityReferrals: integer(old.communityReferrals),
    continuedWithoutIntervention: integer(old.continuedWithoutIntervention),
    communityPoints: integer(old.communityPoints),
    lastConcern: String(old.lastConcern || ''),
    lastOutcome: String(old.lastOutcome || ''),
    lastAt: Math.max(0, Number(old.lastAt) || 0),
    // Historic count is kept for transparency but is not presented as
    // community work because the former implementation wrongly treated it
    // as road-patrol stops.
    legacyRoadStops: Math.max(integer(old.legacyRoadStops), integer(old.stops)),
  };

  return save.hisbahRecord;
}

function persistSafely() {
  try {
    return persist() !== false;
  } catch (error) {
    console.warn('[Kano Life] Could not persist Hisbah community record.', error);
    return false;
  }
}

function dialectMessage(dialect) {
  const messages = {
    hausa: 'A yi magana cikin ladabi, a nemi shawara, kuma a guji cin mutuncin kowa a bainar jama’a.',
    yoruba: 'Ẹ bá ara yín sọ̀rọ̀ pẹ̀lú ọ̀wọ̀, ẹ béèrè ìtọ́sọ́nà, kí ẹ má sì tàbùkù ẹnikẹ́ni ní gbangba.',
    igbo: 'Jiri nkwanye ùgwù gwa ndị mmadụ okwu, rịọ nduzi, ma zere ime onye ọ bụla ihere n’ihu ọha.',
  };
  return messages[dialect] || messages.hausa;
}

function chooseIncident(environment) {
  let pool;
  if (environment === 'market') {
    pool = [INCIDENTS.publicSubstanceUse, INCIDENTS.neighbourhoodConduct, INCIDENTS.publicIntimacy];
  } else if (environment === 'mosqueJunction' || environment === 'juma') {
    pool = [INCIDENTS.modestDress, INCIDENTS.publicIntimacy, INCIDENTS.neighbourhoodConduct];
  } else if (environment === 'wedding') {
    pool = [INCIDENTS.modestDress, INCIDENTS.publicIntimacy, INCIDENTS.neighbourhoodConduct];
  } else {
    pool = [INCIDENTS.neighbourhoodConduct, INCIDENTS.publicSubstanceUse, INCIDENTS.modestDress];
  }

  const last = ensureRecord().lastConcern;
  const alternatives = pool.filter((item) => item.id !== last);
  const options = alternatives.length ? alternatives : pool;
  return options[Math.floor(Math.random() * options.length)];
}

function emitUpdate() {
  if (typeof window === 'undefined' || typeof CustomEvent === 'undefined') return;
  try {
    window.dispatchEvent(new CustomEvent('kano:hisbah-community-updated', {
      detail: {
        enabled: isEnabled(),
        record: { ...ensureRecord() },
      },
    }));
  } catch {
    // A UI refresh must never interrupt the simulation.
  }
}

function startCommunityEncounter(game) {
  const state = game?.s;
  if (!state || game.state !== 'PLAY' || state.event) return false;
  if (!ELIGIBLE_MODES.has(game.mode) || !isEnabled()) return false;
  if (!COMMUNITY_ENVIRONMENTS.has(state.environment)) return false;
  if ((Number(state.speed) || 0) > 2.5) return false;
  if ((Number(state.eventCooldown) || 0) > 0) return false;

  const incident = chooseIncident(state.environment);
  state.event = EVENT_ID;
  state.hisbahCommunityIncident = incident.id;
  state.gas = false;
  state.brake = false;
  state.speed = 0;
  state.signedSpeed = 0;
  state.reverse = false;
  state.eventCooldown = Math.max(Number(state.eventCooldown) || 0, 7.5);
  state.hisbahCommunityEventsThisRun = integer(state.hisbahCommunityEventsThisRun) + 1;

  // No traffic actor or vehicle is created here. This is a community-life
  // scenario in an existing market/family/gathering environment, not a stop.
  try { game.audio?.engine?.(0); } catch { /* Audio is optional. */ }
  game.state = 'EVENT';

  const dialect = state.dialect || save.dialect || 'hausa';
  game.ui?.event?.(
    incident.kicker,
    incident.title,
    `${incident.copy}\n\n${dialectMessage(dialect)}`,
    [
      { label: 'HELP MEDIATE PEACEFULLY', action: 'hisbahCommunity_mediate' },
      { label: 'REQUEST HISBAH GUIDANCE', action: 'hisbahCommunity_guidance' },
      { label: 'REFER THE CONCERN DISCREETLY', action: 'hisbahCommunity_refer' },
      { label: 'CONTINUE WITHOUT INTERVENING', action: 'hisbahCommunity_leave' },
    ],
  );

  console.info(`[Kano Life] Hisbah community-conduct scenario opened: ${incident.id}`);
  return true;
}

function resolveCommunityEncounter(game, action) {
  const state = game?.s;
  if (!state || state.event !== EVENT_ID || game.state !== 'EVENT') return false;

  const record = ensureRecord();
  const incident = String(state.hisbahCommunityIncident || 'neighbourhoodConduct');
  record.communityEncounters += 1;
  record.lastConcern = incident;
  record.lastAt = Date.now();

  let message;
  if (action === 'hisbahCommunity_mediate') {
    record.peacefulMediations += 1;
    record.communityPoints += 2;
    state.score = Math.max(0, Number(state.score) || 0) + 75;
    state.morale = clamp((Number(state.morale) || 75) + 3, 0, 100);
    record.lastOutcome = 'peaceful-mediation';
    message = 'You helped calm the community discussion and encouraged a respectful resolution · +75 run points.';
  } else if (action === 'hisbahCommunity_guidance') {
    record.guidanceRequests += 1;
    record.communityPoints += 1;
    state.score = Math.max(0, Number(state.score) || 0) + 45;
    state.morale = clamp((Number(state.morale) || 75) + 2, 0, 100);
    record.lastOutcome = 'requested-guidance';
    message = 'You requested discreet Hisbah guidance for the community concern · +45 run points.';
  } else if (action === 'hisbahCommunity_refer') {
    record.communityReferrals += 1;
    record.communityPoints += 1;
    state.score = Math.max(0, Number(state.score) || 0) + 40;
    record.lastOutcome = 'referred-discreetly';
    message = 'The concern was referred to community officers to handle discreetly · +40 run points.';
  } else {
    record.continuedWithoutIntervention += 1;
    record.lastOutcome = 'continued-without-intervention';
    message = 'You continued your journey without intervening. No penalty was applied.';
  }

  state.event = null;
  game.state = 'PLAY';
  state.gas = false;
  state.brake = false;
  state.speed = 0;
  state.signedSpeed = 0;
  state.reverse = false;
  state.invuln = Math.max(Number(state.invuln) || 0, 0.8);
  state.hisbahCommunityIncident = '';
  state.hisbahCommunityTimer = randomBetween(95, 150);
  state.hisbahCommunityWaitingNotice = false;

  persistSafely();
  emitUpdate();
  try { game.ui?.hideEvent?.(); } catch { /* Optional UI cleanup. */ }
  try { game.ui?.update?.(state, game.route, game.driver); } catch { /* Optional UI refresh. */ }
  try { game.ui?.toast?.(message); } catch { /* Optional toast. */ }
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
    prototype.resetRun = function resetRunWithHisbahCommunity(...args) {
      const result = originalResetRun.apply(this, args);
      if (this.s) {
        this.s.hisbahCommunityTimer = randomBetween(52, 82);
        this.s.hisbahCommunityIncident = '';
        this.s.hisbahCommunityEventsThisRun = 0;
        this.s.hisbahCommunityWaitingNotice = false;
      }
      // Permanent community history lives in save.hisbahRecord and is not
      // reset when a new driving run begins.
      ensureRecord();
      return result;
    };
  }

  if (typeof originalBeginEvent === 'function') {
    prototype.beginEvent = function beginEventWithHisbahCommunity(type, ...args) {
      if (type === EVENT_ID || type === 'hisbah') {
        return startCommunityEncounter(this);
      }
      return originalBeginEvent.call(this, type, ...args);
    };
  }

  if (typeof originalResolveEvent === 'function') {
    prototype.resolveEvent = function resolveEventWithHisbahCommunity(action, ...args) {
      if (this.s?.event === EVENT_ID || this.s?.event === 'hisbah') {
        return resolveCommunityEncounter(this, action);
      }
      return originalResolveEvent.call(this, action, ...args);
    };
  }

  if (typeof originalTick === 'function') {
    prototype.tick = function tickWithHisbahCommunity(deltaSeconds, ...args) {
      const result = originalTick.call(this, deltaSeconds, ...args);
      const state = this?.s;
      if (!state || this.state !== 'PLAY' || state.event || !isEnabled()) return result;
      if (!ELIGIBLE_MODES.has(this.mode)) return result;
      if ((Number(state.elapsed) || 0) < 35 || (Number(state.distance) || 0) < 0.25) return result;

      const dt = clamp(Number(deltaSeconds) || 0, 0, 0.05);
      state.hisbahCommunityTimer = Math.max(0, (Number(state.hisbahCommunityTimer) || 0) - dt);
      if (state.hisbahCommunityTimer > 0) return result;
      if (!COMMUNITY_ENVIRONMENTS.has(state.environment)) return result;
      if ((Number(state.environmentDuration) || 0) <= 0) return result;
      if ((Number(state.eventCooldown) || 0) > 0) return result;

      // Encounter occurs only when the driver has already stopped safely in a
      // community context. We never create a road checkpoint or freeze a
      // moving keke to simulate traffic enforcement.
      if ((Number(state.speed) || 0) > 2.5) {
        state.hisbahCommunityWaitingNotice = true;
        return result;
      }

      startCommunityEncounter(this);
      return result;
    };
  }

  Object.defineProperty(prototype, PATCH_KEY, {
    configurable: false,
    enumerable: false,
    writable: false,
    value: { originalResetRun, originalTick, originalBeginEvent, originalResolveEvent },
  });

  console.info('[Kano Life] Hisbah community morals and good-conduct system installed. KAROTA remains separate.');
}

function mountCommunityPanel() {
  if (typeof document === 'undefined') return;
  if (document.getElementById('kano-hisbah-community-panel')) return;
  const menuPanel = document.querySelector('#menu-screen .panel');
  if (!menuPanel) return;

  const style = document.createElement('style');
  style.id = 'kano-hisbah-community-panel-styles';
  style.textContent = `
    #kano-hisbah-community-panel{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:10px;align-items:center;margin:10px 0;padding:12px;border:1px solid rgba(53,149,98,.5);border-radius:12px;background:linear-gradient(135deg,rgba(18,80,53,.36),rgba(10,29,42,.88));color:#f3faf5;font:600 12px/1.4 system-ui,sans-serif}
    #kano-hisbah-community-panel h3{margin:0 0 4px;color:#9ce2b7;font-size:12px;letter-spacing:.05em}
    #kano-hisbah-community-panel p{margin:0;color:#c7d9d0;font-size:11px}
    #kano-hisbah-community-panel .hisbah-record{display:block;margin-top:6px;color:#f2d980;font-size:10px}
    #kano-hisbah-community-panel button{min-height:38px;max-width:125px;border:1px solid #45956b;border-radius:9px;background:#174d36;color:white;font:800 10px/1.25 system-ui,sans-serif;padding:8px;cursor:pointer;touch-action:manipulation}
    #kano-hisbah-community-panel button:focus-visible{outline:2px solid #a7f3c4;outline-offset:2px}
    @media(max-width:520px){#kano-hisbah-community-panel{grid-template-columns:1fr}#kano-hisbah-community-panel button{max-width:none;width:100%}}
  `;
  document.head.append(style);

  const section = document.createElement('section');
  section.id = 'kano-hisbah-community-panel';
  section.setAttribute('aria-label', 'Hisbah community morals and good-conduct settings');
  section.innerHTML = `
    <div>
      <h3>HISBAH · COMMUNITY MORALS &amp; GOOD CONDUCT</h3>
      <p>Community guidance for concerns about public drinking or smoking, inappropriate public intimacy, modest-dress expectations, and respectful behaviour at markets, family gatherings, and neighbourhood spaces. <strong>Separate from KAROTA road and vehicle enforcement.</strong></p>
      <small class="hisbah-record" id="kano-hisbah-community-record">Loading community record…</small>
    </div>
    <button type="button" id="kano-hisbah-community-toggle" aria-pressed="true">PAUSE ENCOUNTERS</button>
  `;
  const actions = menuPanel.querySelector('.menu-actions');
  menuPanel.insertBefore(section, actions || null);

  const refresh = () => {
    const enabled = isEnabled();
    const record = ensureRecord();
    const toggle = document.getElementById('kano-hisbah-community-toggle');
    const output = document.getElementById('kano-hisbah-community-record');
    if (toggle) {
      toggle.textContent = enabled ? 'PAUSE ENCOUNTERS' : 'ENABLE ENCOUNTERS';
      toggle.setAttribute('aria-pressed', String(enabled));
    }
    if (output) {
      output.textContent = `Community encounters ${record.communityEncounters} · Mediations ${record.peacefulMediations} · Guidance ${record.guidanceRequests} · Referrals ${record.communityReferrals} · Community points ${record.communityPoints}`;
    }
  };

  section.querySelector('#kano-hisbah-community-toggle')?.addEventListener('click', () => {
    save.hisbahEnabled = !isEnabled();
    persistSafely();
    refresh();
    emitUpdate();
  });
  if (typeof window !== 'undefined') {
    window.addEventListener('kano:hisbah-community-updated', refresh);
    window.addEventListener('storage', (event) => {
      if (event.key === 'kano-life-save-v4') refresh();
    });
  }
  refresh();
}

installGameHooks(Game);
if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', mountCommunityPanel, { once: true });
  } else {
    mountCommunityPanel();
  }
}

if (typeof window !== 'undefined') {
  window.__KANO_HISBAH__ = Object.freeze({
    version: 2,
    enabled: isEnabled,
    getRecord: () => ({ ...ensureRecord() }),
    role: 'community-morals-and-good-conduct',
    notRoadEnforcement: true,
  });
}

export { ensureRecord as getHisbahCommunityRecord, isEnabled as isHisbahCommunityEnabled };
