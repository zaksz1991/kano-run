import { ROUTES, DRIVERS, ACHIEVEMENTS } from './config.js';
import { save, persist, tribeStanding, unlockAchievement } from './storage.js';

const MOVE_ZONES_PATCH = Symbol.for('kano.life.stopped-roadside-interaction.v1');
const CHARACTER_PATCH = Symbol.for('kano.life.late-character-fallback.v2');
const SCENE_ANIMATION_PATCH = Symbol.for('kano.life.scene-animation-transform-fix.v2');
const REAL_CROWD_CHARACTER_KEYS = ['pedestrianWoman', 'pedestrian', 'passengerWoman', 'passengerMan', 'passenger', 'passengerVIP'];
const MOBILE_REAL_CROWD_COUNT = 2;
const DESKTOP_REAL_CROWD_COUNT = 5;
const REAL_CROWD_ASSET_WAIT_SECONDS = 8;
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const ROADSIDE_INTERACTION_DEPTH_OFFSET = 0.12;
const ROADSIDE_TYPES = new Set(['pickup', 'drop', 'fuel']);
const ZONE_LABELS = {
  pickup: 'PASSENGER PICKUP',
  drop: 'PASSENGER DROP-OFF',
  fuel: 'FUEL STOP',
  pothole: 'POTHOLE',
};

const CHALLENGES = {
  hausa: {
    name: 'Hausa · Arewa Route',
    short: 'HAUSA',
    description: 'Complete 5 passenger drop-offs.',
    stat: 'drops',
    target: 5,
    rewardMoney: 750,
    rewardXP: 180,
  },
  yoruba: {
    name: 'Yoruba · Market Match',
    short: 'YORUBA',
    description: 'Complete 4 correctly matched drop-offs.',
    stat: 'matchedDrops',
    target: 4,
    rewardMoney: 750,
    rewardXP: 180,
  },
  igbo: {
    name: 'Igbo · Fare Run',
    short: 'IGBO',
    description: 'Collect ₦4,000 in passenger fares.',
    stat: 'fares',
    target: 4000,
    rewardMoney: 750,
    rewardXP: 180,
  },
};

const WOMAN_CHARACTER_KEYS = [
  'passengerWoman', 'pedestrianWoman', 'passenger', 'pedestrian', 'passengerMan', 'passengerVIP',
];
const MAN_CHARACTER_KEYS = [
  'passengerMan', 'passenger', 'pedestrian', 'passengerVIP', 'passengerWoman', 'pedestrianWoman',
];
const AMBIENT_CHARACTER_KEYS = [
  'pedestrianWoman', 'pedestrian', 'passengerWoman', 'passengerMan', 'passenger', 'passengerVIP',
];

function ensureCareerProgress() {
  const career = save.careerProgression && typeof save.careerProgression === 'object'
    ? save.careerProgression
    : {};
  career.totalXP = Math.max(0, Number(career.totalXP) || 0);
  career.level = Math.max(1, Math.floor(Number(career.level) || 1));
  career.totalDistance = Math.max(0, Number(career.totalDistance) || 0);
  career.totalFares = Math.max(0, Number(career.totalFares) || 0);
  career.totalDrops = Math.max(0, Math.floor(Number(career.totalDrops) || 0));
  career.totalBoards = Math.max(0, Math.floor(Number(career.totalBoards) || 0));
  career.completedRuns = Math.max(0, Math.floor(Number(career.completedRuns) || 0));
  const derived = deriveLevel(career.totalXP);
  career.level = derived.level;
  career.xpIntoLevel = derived.xpIntoLevel;
  career.xpToNext = derived.xpToNext;
  save.careerProgression = career;
  return career;
}

function xpRequiredForLevel(level) {
  return 300 + Math.max(0, level - 1) * 125;
}

function deriveLevel(totalXP) {
  let remaining = Math.max(0, Number(totalXP) || 0);
  let level = 1;
  let required = xpRequiredForLevel(level);
  while (remaining >= required && level < 999) {
    remaining -= required;
    level += 1;
    required = xpRequiredForLevel(level);
  }
  return { level, xpIntoLevel: Math.floor(remaining), xpToNext: required };
}

function ensureTribeChallenges() {
  if (!save.tribeChallenges || typeof save.tribeChallenges !== 'object') {
    save.tribeChallenges = {};
  }
  for (const tribe of Object.keys(CHALLENGES)) {
    const old = save.tribeChallenges[tribe] && typeof save.tribeChallenges[tribe] === 'object'
      ? save.tribeChallenges[tribe]
      : {};
    save.tribeChallenges[tribe] = {
      completed: Math.max(0, Math.floor(Number(old.completed) || 0)),
      bestProgress: Math.max(0, Number(old.bestProgress) || 0),
      runProgress: Math.max(0, Number(old.runProgress) || 0),
      completedThisRun: Boolean(old.completedThisRun),
      lastCompletedAt: Number(old.lastCompletedAt) || 0,
    };
  }
  if (!Object.prototype.hasOwnProperty.call(CHALLENGES, save.activeTribeChallenge)) {
    save.activeTribeChallenge = null;
  }
  return save.tribeChallenges;
}

function isFiniteNumber(value) {
  return Number.isFinite(Number(value));
}

function createRunId() {
  try {
    if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  } catch (_) { /* Use the local fallback below. */ }
  return `kano-run-${Date.now()}-${Math.random().toString(36).slice(2, 12)}`;
}

function jsonClone(value) {
  return JSON.parse(JSON.stringify(value));
}

function isRecentCheckpoint(checkpoint) {
  if (!checkpoint || checkpoint.version !== 1 || !checkpoint.state || typeof checkpoint.state !== 'object') return false;
  const age = Date.now() - Number(checkpoint.savedAt);
  return Number.isFinite(age) && age >= -5 * 60 * 1000 && age <= 14 * 24 * 60 * 60 * 1000
    && Number.isFinite(Number(checkpoint.state.score)) && Number(checkpoint.state.score) >= 0;
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
    const materialList = Array.isArray(node.material) ? node.material : [node.material];
    for (const material of materialList) {
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
  const nearby = zones.filter((zone) => {
    if (!zone || !isFiniteNumber(zone.depth)) return false;
    const depth = Number(zone.depth);
    if (zone.type === 'pothole') return depth >= -0.015 && depth <= 0.34;
    if (ROADSIDE_TYPES.has(zone.type)) {
      const corrected = depth + ROADSIDE_INTERACTION_DEPTH_OFFSET;
      return corrected >= -0.015 && corrected <= 0.34;
    }
    return false;
  }).sort((a, b) => {
    const da = Number(a.depth) + (ROADSIDE_TYPES.has(a.type) ? ROADSIDE_INTERACTION_DEPTH_OFFSET : 0);
    const db = Number(b.depth) + (ROADSIDE_TYPES.has(b.type) ? ROADSIDE_INTERACTION_DEPTH_OFFSET : 0);
    return Math.abs(da - 0.14) - Math.abs(db - 0.14);
  });
  const zone = nearby[0];
  if (!zone) return null;
  const depth = Number(zone.depth) + (ROADSIDE_TYPES.has(zone.type) ? ROADSIDE_INTERACTION_DEPTH_OFFSET : 0);
  if (zone.type === 'pothole') {
    return {
      type: 'hazard', zone,
      message: depth > 0.19 ? 'POTHOLE AHEAD · PREPARE TO STEER AROUND IT' : 'POTHOLE CLOSE · STEER CLEAR IF SAFE',
      detail: 'Avoid sudden steering when traffic is close.',
    };
  }
  const label = ZONE_LABELS[zone.type];
  if (!label) return null;
  const speed = Math.max(0, Number(state.speed) || 0);
  const reversing = Boolean(state.reverse) || (Number(state.signedSpeed) || 0) < -0.05;
  if (reversing) {
    return { type: 'gear', zone, message: `${label} AHEAD · SELECT FORWARD GEAR`, detail: 'Roadside interactions activate only in forward gear.' };
  }
  const targetLane = clamp(Math.round(Number(zone.lane) || 0), 0, 2) - 1;
  if (Math.abs((Number(state.steer) || 0) - targetLane) > 0.48) {
    const laneName = targetLane < -0.35 ? 'LEFT LANE' : targetLane > 0.35 ? 'RIGHT LANE' : 'CENTRE LANE';
    return { type: 'lane', zone, message: `${label} AHEAD · ALIGN WITH ${laneName}`, detail: 'Use a gradual lane change and check surrounding traffic.' };
  }
  const speedLimit = zone.hub ? 6.5 : 12;
  if (depth > 0.19) {
    return { type: 'approach', zone, message: `${label} AHEAD · EASE OFF AND PREPARE TO STOP`, detail: `Approach slowly; target ${Math.round(speedLimit)} km/h or less.` };
  }
  if (speed > speedLimit) {
    return { type: 'brake', zone, message: `${label} · BRAKE TO ${Math.round(speedLimit)} KM/H OR LESS`, detail: 'Keep the Keke aligned with the roadside marker while slowing down.' };
  }
  return {
    type: 'ready', zone, message: `${label} · STOP ZONE REACHED`,
    detail: zone.type === 'pickup'
      ? 'Passenger boarding zone reached. Stop and remain aligned with the marker.'
      : zone.type === 'drop'
        ? 'Stop when the drop-off marker is beside the keke.'
        : 'Stop beside the fuel marker to refuel.',
  };
}

/** Keeps the existing game rules while enabling roadside interaction at a full stop. */
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
  entry.wrapper = function alignedRoadsideMoveZones(dt) {
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

/** Uses the best compatible GLB already loaded, including models loaded after the fallback appeared. */
function installCharacterFallbacks(renderer) {
  if (!renderer || renderer[CHARACTER_PATCH]?.active) return renderer?.[CHARACTER_PATCH]?.restore || (() => {});
  const restorers = [];
  const rememberPatch = (name, wrapFactory) => {
    const original = renderer[name];
    if (typeof original !== 'function') return;
    const wrapper = wrapFactory(original);
    renderer[name] = wrapper;
    restorers.push(() => { if (renderer[name] === wrapper) renderer[name] = original; });
  };
  const swapActor = (parent, current, key, models) => {
    const replacement = models.getInstance(key);
    if (!replacement) return null;
    copyTransform(replacement, current);
    replacement.userData.characterType = key;
    replacement.userData.fallback = false;
    parent.remove(current);
    disposeOwnedActor(current);
    parent.add(replacement);
    return replacement;
  };
  rememberPatch('upgradePedestrians', (original) => function upgradePedestriansWithBestAvailableModel(...args) {
    const result = original.apply(this, args);
    const models = this.models;
    const phoneBudget = this.mobile ? 1 : Infinity;
    let modelledCount = (this.pedestrians || []).reduce((count, pedestrian) =>
      count + (pedestrian?.usingModel && pedestrian?.actor?.userData?.modelManagerInstance ? 1 : 0), 0);

    for (const pedestrian of this.pedestrians || []) {
      if (!pedestrian?.actor || !models?.cache?.has) continue;
      const currentIsModel = Boolean(
        pedestrian.usingModel && pedestrian.actor.userData?.modelManagerInstance,
      );
      if (this.mobile && !currentIsModel && modelledCount >= phoneBudget) continue;
      const keys = Number(pedestrian.index) % 2 === 0
        ? AMBIENT_CHARACTER_KEYS
        : ['pedestrian', 'passengerMan', 'passenger', 'pedestrianWoman', 'passengerWoman', 'passengerVIP'];
      const bestKey = pickCachedKey(models, keys);
      if (!bestKey) continue;
      const currentKey = pedestrian.actor.userData?.characterType || pedestrian.actor.userData?.modelKey || null;
      if (pedestrian.usingModel && currentKey) {
        const oldRank = keys.indexOf(currentKey);
        const bestRank = keys.indexOf(bestKey);
        if (oldRank >= 0 && bestRank >= oldRank) continue;
      }
      const currentActor = pedestrian.actor;
      const replacement = swapActor(this.world, currentActor, bestKey, models);
      if (!replacement) continue;
      // These are roadside walkers in a Z-scrolling scene. Keep them facing
      // toward the pavement/road edge, matching their existing placement.
      replacement.rotation.y = pedestrian.side < 0 ? Math.PI / 2 : -Math.PI / 2;
      pedestrian.actor = replacement;
      pedestrian.usingModel = true;
      if (this.mobile && !currentIsModel) modelledCount += 1;
    }
    return result;
  });
  rememberPatch('syncZones', (original) => function syncZonesWithBestPassengerModel(state, ...args) {
    const result = original.call(this, state, ...args);
    const models = this.models;
    const zonesById = new Map((state?.zones || []).map((zone) => [zone.id, zone]));
    for (const [id, actor] of this.zoneActors || []) {
      const zone = zonesById.get(id);
      const currentActor = actor?.userData?.waitingActors?.[0];
      if (!zone || zone.type !== 'pickup' || !currentActor || !models?.cache?.has) continue;
      const keys = zone.hub ? WOMAN_CHARACTER_KEYS : MAN_CHARACTER_KEYS;
      const bestKey = pickCachedKey(models, keys);
      if (!bestKey) continue;
      const currentKey = currentActor.userData?.characterType || currentActor.userData?.modelKey || actor.userData?.waitingModelKeyActive || null;
      if (currentKey) {
        const currentRank = keys.indexOf(currentKey);
        const bestRank = keys.indexOf(bestKey);
        if (currentRank >= 0 && bestRank >= currentRank) {
          actor.userData.waitingUsingModel = Boolean(currentActor.userData?.modelManagerInstance);
          actor.userData.waitingModelKeyActive = currentKey;
          continue;
        }
      }
      const replacement = swapActor(actor, currentActor, bestKey, models);
      if (!replacement) continue;
      actor.userData.waitingActors = [replacement];
      actor.userData.waitingUsingModel = true;
      actor.userData.waitingModelKeyActive = bestKey;
    }
    return result;
  });
  const state = {
    active: true,
    restore() {
      if (!state.active) return;
      state.active = false;
      for (const restore of restorers.reverse()) { try { restore(); } catch {} }
      try { delete renderer[CHARACTER_PATCH]; } catch { renderer[CHARACTER_PATCH] = undefined; }
    },
  };
  Object.defineProperty(renderer, CHARACTER_PATCH, { configurable: true, value: state });
  return state.restore;
}

/**
 * Upgrades the closest ambient market walkers to real, already-cached GLB
 * characters. The distant instanced silhouettes remain as a deliberate mobile
 * LOD layer, keeping the crowd readable without dozens of full-detail models.
 * All actors are sourced from this game's ModelManager; no guessed asset paths
 * or external downloads are introduced.
 */
function installSceneUpgradeAnimationFix(sceneUpgrade, game) {
  if (!sceneUpgrade) return () => {};
  const existing = sceneUpgrade[SCENE_ANIMATION_PATCH];
  if (existing?.active) return existing.restore;

  const restorers = [];
  const realCrowdActors = [];
  let lastCrowdBuildAt = -Infinity;

  function usableCrowdKeys(upgrade) {
    const cache = upgrade?.renderer?.models?.cache;
    if (!cache?.has) return [];
    return REAL_CROWD_CHARACTER_KEYS.filter((key) => cache.has(key));
  }

  function walkerCandidates(upgrade, targetCount) {
    const rows = (upgrade.walkers || [])
      .map((walker, index) => ({ walker, index }))
      .filter(({ walker }) => walker && Number.isFinite(Number(walker.z)))
      .sort((a, b) => Number(b.walker.z) - Number(a.walker.z));

    // Prioritise the visible foreground/midground. If the current layout has
    // too few actors inside this band, broaden it instead of losing crowd slots.
    let band = rows.filter(({ walker }) => Number(walker.z) >= -105 && Number(walker.z) <= 9);
    if (band.length < targetCount) band = rows;
    if (band.length <= targetCount) return band;

    const selected = [];
    const used = new Set();
    for (let slot = 0; slot < targetCount; slot += 1) {
      const position = targetCount === 1
        ? 0
        : Math.round(slot * (band.length - 1) / (targetCount - 1));
      const row = band[position];
      if (row && !used.has(row.index)) {
        selected.push(row);
        used.add(row.index);
      }
    }
    // Rounding can theoretically select the same row when there are very few
    // walkers, so fill any remaining slots from the unselected candidates.
    for (const row of band) {
      if (selected.length >= targetCount) break;
      if (!used.has(row.index)) {
        selected.push(row);
        used.add(row.index);
      }
    }
    return selected;
  }

  function tryCreateRealCrowd(upgrade) {
    if (upgrade.disposed || realCrowdActors.length) return;
    const renderer = upgrade.renderer;
    const models = renderer?.models;
    const root = upgrade.crowdRoot;
    if (!root?.add || !models?.getInstance || !models?.cache?.has) return;

    // Give the game's staggered mobile preload a brief head start. Retry if the
    // first character batch is not ready; never hide silhouettes before GLBs exist.
    if (Number(upgrade.elapsed) < 2.4 || Number(upgrade.elapsed) - lastCrowdBuildAt < 0.75) return;
    lastCrowdBuildAt = Number(upgrade.elapsed) || 0;

    const available = usableCrowdKeys(upgrade);
    if (!available.length) return;

    // The game's human assets are loaded in staggered batches. Wait briefly for
    // model variety so the entire foreground crowd does not become eight copies
    // of the first generic passenger GLB. After the timeout, use whatever valid
    // character models are actually available rather than blocking the scene.
    if (available.length < 3 && Number(upgrade.elapsed) < REAL_CROWD_ASSET_WAIT_SECONDS) return;

    const targetCount = upgrade.mobile ? MOBILE_REAL_CROWD_COUNT : DESKTOP_REAL_CROWD_COUNT;
    const rows = walkerCandidates(upgrade, targetCount);
    if (!rows.length) return;
    const registry = renderer.pedestrians || (renderer.pedestrians = []);

    for (let index = 0; index < rows.length; index += 1) {
      const { walker, index: walkerIndex } = rows[index];
      let actor = null;
      let activeKey = null;
      const startAt = index % available.length;

      // A candidate may be in cache but fail clone/rig creation. Try the other
      // real character models before leaving this particular slot procedural.
      for (let offset = 0; offset < available.length; offset += 1) {
        const key = available[(startAt + offset) % available.length];
        try {
          actor = models.getInstance(key);
        } catch (error) {
          console.warn(`[Kano Life] Could not clone crowd model ${key}.`, error);
          actor = null;
        }
        if (actor) {
          activeKey = key;
          break;
        }
      }
      if (!actor) continue;

      actor.name = `KANO_REAL_CROWD_${String(walkerIndex).padStart(2, '0')}`;
      actor.userData.kanoAmbientCrowd = true;
      actor.userData.kanoCrowdWalkerIndex = walkerIndex;
      actor.userData.characterType = activeKey;
      actor.userData.fallback = false;
      actor.position.set(Number(walker.x) || 0, 0, Number(walker.z) || 0);
      actor.rotation.set(0, Number(walker.direction) < 0 ? Math.PI : 0, 0);
      actor.scale.setScalar(Number(walker.height) || 1);
      actor.traverse?.((node) => {
        if (!node.isMesh) return;
        node.castShadow = false;
        node.receiveShadow = false;
        // Materials have already been cloned by ModelManager's instance API;
        // disabling costly shadow flags is safe and benefits mobile rendering.
      });
      root.add(actor);

      // KanoGLBAnimationManager already animates renderer.pedestrians and
      // chooses genuine idle clips for scenery characters. Register these
      // actors with usingModel=true so fallback selection cannot replace them.
      const registryEntry = {
        index: walkerIndex,
        side: Number(walker.side) || (Number(walker.x) < 0 ? -1 : 1),
        actor,
        usingModel: true,
        preferredModelIndex: walkerIndex,
        kanoAmbientCrowd: true,
      };
      registry.push(registryEntry);
      realCrowdActors.push({ actor, walkerIndex, walker, registryEntry, key: activeKey, phase: Number(walker.phase) || 0 });
    }

    if (realCrowdActors.length) {
      console.info(`[Kano Life] ambient crowd upgraded to ${realCrowdActors.length} cached GLB character instances; distant silhouettes retained as mobile LOD.`);
    }
  }

  function updateRealCrowd(upgrade) {
    tryCreateRealCrowd(upgrade);
    if (!realCrowdActors.length) return;

    const time = Number(upgrade.elapsed) || 0;
    for (const entry of realCrowdActors) {
      const walker = upgrade.walkers?.[entry.walkerIndex];
      const actor = entry.actor;
      if (!walker || !actor) continue;

      const phase = time * 6.8 * (Number(walker.speed) || 0.4) + entry.phase;
      const sway = Math.sin(time * 1.1 + entry.phase) * (Number(walker.sway) || 0.05);
      const x = (Number(walker.x) || 0) + sway;
      const z = Number(walker.z) || 0;
      actor.position.set(x, Math.abs(Math.sin(phase)) * 0.012, z);
      actor.rotation.y = Number(walker.direction) < 0 ? Math.PI : 0;
      actor.rotation.z = Math.sin(phase * 0.5) * 0.008;
      actor.scale.setScalar(Number(walker.height) || 1);
      actor.visible = true;
    }
  }

  function hideProceduralWalker(upgrade, index) {
    // Hide only the four instance rows corresponding to a real GLB actor.
    // All other distant walkers stay instanced (four draw calls total).
    const meshes = [upgrade.crowdTorso, upgrade.crowdHead, upgrade.crowdArms, upgrade.crowdLegs];
    if (!upgrade.writeMatrix) return;
    upgrade.writeMatrix(meshes[0], index, 0, 0, 0, 0, 0, 0, 0);
    upgrade.writeMatrix(meshes[1], index, 0, 0, 0, 0, 0, 0, 0);
    upgrade.writeMatrix(meshes[2], index * 2, 0, 0, 0, 0, 0, 0, 0);
    upgrade.writeMatrix(meshes[2], index * 2 + 1, 0, 0, 0, 0, 0, 0, 0);
    upgrade.writeMatrix(meshes[3], index * 2, 0, 0, 0, 0, 0, 0, 0);
    upgrade.writeMatrix(meshes[3], index * 2 + 1, 0, 0, 0, 0, 0, 0, 0);
  }

  if (typeof sceneUpgrade.updateCrowdMatrices === 'function') {
    const original = sceneUpgrade.updateCrowdMatrices;
    const wrapper = function updateCrowdMatricesWithScrollAwareGaitAndRealModels() {
      if (this.disposed || !Array.isArray(this.walkers) || !this.walkers.length || typeof this.writeMatrix !== 'function' || !this.crowdTorso || !this.crowdHead || !this.crowdArms || !this.crowdLegs) {
        return original.call(this);
      }

      updateRealCrowd(this);
      const realIndices = new Set(realCrowdActors.map((entry) => entry.walkerIndex));
      const signedSpeed = Number(game?.s?.signedSpeed) || 0;
      // The world scrolls toward the camera while driving forward. Invert the
      // primitive crowd gait with road direction so distant silhouettes do not
      // visually moonwalk. Real GLBs use their own suitable idle clips.
      const gaitSign = signedSpeed > 0.1 ? -1 : signedSpeed < -0.1 ? 1 : 0.62;
      this.walkers.forEach((walker, index) => {
        if (realIndices.has(index)) {
          hideProceduralWalker(this, index);
          return;
        }
        const direction = Number(walker.direction) < 0 ? -1 : 1;
        const heading = direction < 0 ? Math.PI : 0;
        const phase = this.elapsed * 6.8 * (Number(walker.speed) || 0.4) + (Number(walker.phase) || 0);
        const step = Math.sin(phase) * 0.30 * gaitSign;
        const stride = Math.cos(phase) * 0.22 * gaitSign;
        const bob = Math.abs(step) * 0.035;
        const height = Number(walker.height) || 1;
        const x = (Number(walker.x) || 0) + Math.sin(this.elapsed * 1.1 + (Number(walker.phase) || 0)) * (Number(walker.sway) || 0.06);
        const z = Number(walker.z) || 0;
        this.writeMatrix(this.crowdTorso, index, x, 0.98 * height + bob, z, heading, 1, height, 0.90);
        this.writeMatrix(this.crowdHead, index, x, 1.58 * height + bob, z, heading, 1, 1, 0.92);
        for (const side of [-1, 1]) {
          const partIndex = index * 2 + (side > 0 ? 1 : 0);
          this.writeMatrix(this.crowdArms, partIndex, x + side * 0.22, 1.02 * height + bob, z, heading, 1, 1, 1, side * (0.10 + step * 0.45), 0);
          this.writeMatrix(this.crowdLegs, partIndex, x + side * 0.09, 0.44 * height, z, heading, 1, 1, 1, stride * side, 0);
        }
      });
      for (const mesh of [this.crowdTorso, this.crowdHead, this.crowdArms, this.crowdLegs]) mesh.instanceMatrix.needsUpdate = true;
    };
    sceneUpgrade.updateCrowdMatrices = wrapper;
    restorers.push(() => { if (sceneUpgrade.updateCrowdMatrices === wrapper) sceneUpgrade.updateCrowdMatrices = original; });
  }

  if (typeof sceneUpgrade.updatePassengerWalkers === 'function') {
    const original = sceneUpgrade.updatePassengerWalkers;
    const wrapper = function orientPassengerWalkersAlongActualPath(dt, scroll) {
      const result = original.call(this, dt, scroll);
      for (const item of this.walkingPassengers || []) {
        if (!item?.rig?.root || !item.start || !item.end) continue;
        const dx = Number(item.end.x) - Number(item.start.x);
        const startZ = item.kind === 'board' ? Number(item.start.z) + (Number(item.worldScroll) || 0) : Number(item.start.z);
        const endZ = item.kind === 'board' ? Number(item.end.z) : Number(item.end.z) + (Number(item.worldScroll) || 0);
        const dz = endZ - startZ;
        if (Math.hypot(dx, dz) > 0.001) item.rig.root.rotation.y = Math.atan2(dx, dz);
      }
      return result;
    };
    sceneUpgrade.updatePassengerWalkers = wrapper;
    restorers.push(() => { if (sceneUpgrade.updatePassengerWalkers === wrapper) sceneUpgrade.updatePassengerWalkers = original; });
  }

  const state = {
    active: true,
    restore() {
      if (!state.active) return;
      state.active = false;
      const renderer = sceneUpgrade.renderer;
      for (const entry of realCrowdActors.splice(0)) {
        entry.actor?.parent?.remove(entry.actor);
        if (Array.isArray(renderer?.pedestrians)) {
          const index = renderer.pedestrians.indexOf(entry.registryEntry);
          if (index >= 0) renderer.pedestrians.splice(index, 1);
        }
        disposeOwnedActor(entry.actor);
      }
      for (const restore of restorers.reverse()) { try { restore(); } catch {} }
      try { delete sceneUpgrade[SCENE_ANIMATION_PATCH]; } catch { sceneUpgrade[SCENE_ANIMATION_PATCH] = undefined; }
    },
  };
  Object.defineProperty(sceneUpgrade, SCENE_ANIMATION_PATCH, { configurable: true, value: state });
  console.info('[Kano Life] crowd gait and path-facing fix active; real character GLBs will replace near ambient silhouettes as model assets finish loading.');
  return state.restore;
}

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
    this.careerPersistElapsed = 0;
    this.checkpointElapsed = 0;
    this.lastChallengeRefresh = 0;
    this.currentRunId = '';
    this.softGameOver = false;
    this.resumeRequested = false;
    this.restoreGameStart = null;
    this.restoreGameFinish = null;
    this.restoreGameContinue = null;
    this.resumeRunButton = null;
    this.characterRenderer = null;
    this.restoreCharacterFallbacks = null;
    this.sceneUpgradePatched = null;
    this.restoreSceneUpgradeAnimation = null;
    this.restoreMoveZones = installStoppedInteractionCompatibility(game);
    this.career = ensureCareerProgress();
    this.tribeChallenges = ensureTribeChallenges();
    this.lastStats = this.captureStats();
    this.lastGameState = game.state;
    this.installStyles();
    this.hint = this.createHint();
    this.diagnostics = this.debug ? this.createDiagnostics() : null;
    this.installCareerLevelDisplay();
    this.installChallengeStartHooks();
    this.createChallengePanels();
    this.createResumeRunControl();
    this.refreshResumeRunControl();
    this.onPageHide = () => this.dispose();
    window.addEventListener('pagehide', this.onPageHide, { once: true });
  }

  installStyles() {
    if (document.getElementById('kano-interaction-reliability-styles')) return;
    const style = document.createElement('style');
    style.id = 'kano-interaction-reliability-styles';
    style.textContent = `
      #game-container .kano-interaction-hint{position:absolute;z-index:11;left:50%;bottom:calc(68px + env(safe-area-inset-bottom,0px));transform:translateX(-50%);width:min(92%,390px);padding:10px 13px;border:1px solid rgba(245,197,66,.6);border-radius:13px;background:rgba(10,24,37,.93);color:#f7f8f7;box-shadow:0 8px 26px rgba(0,0,0,.24);text-align:center;pointer-events:none;font:800 11px/1.35 system-ui,sans-serif;letter-spacing:.025em;backdrop-filter:blur(7px);white-space:normal}
      #game-container .kano-interaction-hint[hidden],#game-container .kano-scene-diagnostics[hidden]{display:none!important}
      #game-container .kano-interaction-hint[data-kind="hazard"]{border-color:rgba(255,134,110,.78)}
      #game-container .kano-interaction-hint[data-kind="ready"]{border-color:rgba(40,196,165,.72)}
      #game-container .kano-interaction-hint small{display:block;margin-top:3px;color:#b9c8d5;font:600 10px/1.35 system-ui,sans-serif}
      #game-container .kano-scene-diagnostics{position:absolute;z-index:60;top:76px;right:8px;width:min(340px,calc(100% - 16px));max-height:38%;overflow:auto;padding:10px 12px;border:1px solid rgba(255,255,255,.22);border-radius:10px;background:rgba(6,15,25,.94);color:#e9f1f7;font:11px/1.45 ui-monospace,SFMono-Regular,Consolas,monospace;white-space:pre-wrap;overflow-wrap:anywhere;pointer-events:auto}
      #game-container .kano-scene-diagnostics strong{color:#f5c542}
      #kano-career-progress{display:grid;gap:4px;margin:9px 0;padding:9px 10px;border:1px solid rgba(75,193,162,.35);border-radius:10px;background:rgba(11,80,69,.13);color:#e8fff7;font:600 11px/1.3 system-ui,sans-serif}
      #kano-career-progress strong{font-size:12px;color:#7fe6c7}
      #kano-career-progress .kano-xp-track{height:5px;background:#22394a;border-radius:99px;overflow:hidden}
      #kano-career-progress .kano-xp-fill{height:100%;width:0;background:linear-gradient(90deg,#00b4d8,#5fe2b6);border-radius:99px}
      .kano-tribe-challenges{display:grid;gap:7px;margin:10px 0;padding:9px;border:1px solid rgba(245,197,66,.30);border-radius:12px;background:rgba(10,28,43,.74);color:#ecf3f7;font:600 11px/1.3 system-ui,sans-serif}
      .kano-tribe-challenges h3{margin:0;color:#f5c542;font-size:11px;letter-spacing:.07em}
      .kano-tribe-challenge-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:6px}
      .kano-tribe-challenge{display:flex;min-width:0;flex-direction:column;gap:5px;padding:7px;border:1px solid #385568;border-radius:9px;background:#10283a;color:#f7fbfd}
      .kano-tribe-challenge strong{font-size:10px;letter-spacing:.03em}
      .kano-tribe-challenge small{font-size:9px;line-height:1.25;color:#c3d2dc;font-weight:500}
      .kano-tribe-challenge .kano-tribe-record{font-size:9px;color:#9fe6d5}
      .kano-tribe-challenge button{min-height:32px;border:1px solid #39778a;border-radius:7px;background:#0b6073;color:#fff;font:800 9px/1.15 system-ui,sans-serif;padding:5px;cursor:pointer;touch-action:manipulation}
      .kano-tribe-challenge button[aria-pressed="true"]{background:#f5c542;color:#172333;border-color:#ffe7a0}
      .kano-tribe-challenge.kano-active-challenge{border-color:#f5c542;box-shadow:0 0 0 1px #f5c5422c}
      #menu-screen .kano-tribe-challenge-grid{grid-template-columns:1fr}
      #menu-screen #kano-world-life-panel{position:relative!important;top:auto!important;right:auto!important;left:auto!important;bottom:auto!important;z-index:auto!important;width:100%!important;max-width:100%!important;margin:10px 0!important;box-shadow:none!important;backdrop-filter:none!important;overflow:visible!important}
      #menu-screen #kano-world-life-panel .kano-world-life-body{max-height:36vh!important}
      @media(max-width:520px){#game-container .kano-interaction-hint{bottom:calc(61px + env(safe-area-inset-bottom,0px));width:calc(100% - 18px);padding:8px 10px;font-size:10px}#game-container .kano-interaction-hint small{font-size:9px}#game-container .kano-scene-diagnostics{top:68px;right:6px;max-height:30%;font-size:10px}#menu-screen .kano-tribe-challenge-grid{grid-template-columns:1fr!important}#menu-screen .kano-tribe-challenge{display:grid;grid-template-columns:1fr auto;align-items:center}#menu-screen .kano-tribe-challenge small,#menu-screen .kano-tribe-challenge .kano-tribe-record{grid-column:1}#menu-screen .kano-tribe-challenge button{grid-column:2;grid-row:1/4;min-width:86px}#kano-tribe-challenges-start .kano-tribe-challenge-grid{grid-template-columns:repeat(3,minmax(0,1fr))!important}#kano-tribe-challenges-start .kano-tribe-challenge{display:flex;flex-direction:column;align-items:stretch;gap:5px;padding:6px}#kano-tribe-challenges-start .kano-tribe-challenge strong{font-size:9px}#kano-tribe-challenges-start .kano-tribe-challenge small{font-size:8px;overflow-wrap:anywhere}#kano-tribe-challenges-start .kano-tribe-challenge .kano-tribe-record{font-size:8px;overflow-wrap:anywhere}#kano-tribe-challenges-start .kano-tribe-challenge button{min-width:0;width:100%;font-size:8px;padding:4px}}
      @media(prefers-reduced-motion:reduce){#game-container .kano-interaction-hint{backdrop-filter:none}}
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

  installCareerLevelDisplay() {
    const ui = this.game.ui;
    if (!ui || typeof ui.update !== 'function' || ui.__kanoCareerUiPatched) return;
    const original = ui.update;
    const owner = this;
    const wrapper = function updateWithPersistentCareerLevel(state, ...args) {
      if (state && state === owner.game.s) {
        const career = ensureCareerProgress();
        state.level = career.level;
      }
      return original.call(this, state, ...args);
    };
    ui.update = wrapper;
    ui.__kanoCareerUiPatched = { original, wrapper };
    this.restoreCareerUi = () => {
      if (ui.update === wrapper) ui.update = original;
      delete ui.__kanoCareerUiPatched;
    };
  }

  installChallengeStartHooks() {
    const originalStart = this.game.start;
    const originalFinish = this.game.finishOrContinue;
    const originalContinue = this.game.continueRun;
    const owner = this;

    if (typeof originalStart === 'function') {
      const startWrapper = function startWithCheckpointSupport(...args) {
        const checkpoint = owner.resumeRequested ? owner.readActiveRunCheckpoint() : null;
        owner.resumeRequested = false;

        if (checkpoint) {
          // Restore route/driver/challenge selection before Game.start rebuilds
          // its run state. The completed career totals remain untouched.
          save.routeId = checkpoint.routeId;
          save.driverId = checkpoint.driverId;
          save.dialect = checkpoint.dialect;
          if (Object.prototype.hasOwnProperty.call(checkpoint, 'activeTribeChallenge')) {
            save.activeTribeChallenge = checkpoint.activeTribeChallenge;
          }
          if (checkpoint.tribeChallenges && typeof checkpoint.tribeChallenges === 'object') {
            save.tribeChallenges = jsonClone(checkpoint.tribeChallenges);
          }
        } else {
          // The ordinary Start button deliberately begins a new run. Clear the
          // old checkpoint before resetting the run so it cannot reappear after
          // a later refresh.
          save.activeRunCheckpoint = null;
          persist();
          owner.softGameOver = false;
          owner.currentRunId = createRunId();
        }

        const result = checkpoint
          ? originalStart.apply(this, [checkpoint.mode, ...args.slice(1)])
          : originalStart.apply(this, args);

        if (checkpoint) {
          const restored = jsonClone(checkpoint.state);
          this.mode = checkpoint.mode;
          this.route = ROUTES.find((route) => route.id === checkpoint.routeId) || this.route || ROUTES[0];
          this.driver = DRIVERS.find((driver) => driver.id === checkpoint.driverId) || this.driver || DRIVERS[0];
          restored.mode = checkpoint.mode;
          restored.route = this.route.name;
          restored.driver = this.driver.name;
          restored.dialect = checkpoint.dialect;
          restored.event = null;
          restored.gas = false;
          restored.brake = false;
          restored.speed = 0;
          restored.signedSpeed = 0;
          restored.reverse = false;
          restored.runEnded = Boolean(checkpoint.softOver);
          restored.invuln = Math.max(1.5, Number(restored.invuln) || 0);
          this.s = restored;
          owner.currentRunId = checkpoint.runId || createRunId();
          owner.softGameOver = Boolean(checkpoint.softOver);
          owner.tribeChallenges = ensureTribeChallenges();

          if (checkpoint.softOver) {
            this.state = 'OVER';
            this.audio?.engine?.(0);
            this.ui?.hideEvent?.();
            this.ui?.gameOver?.({
              reason: checkpoint.reason || 'Recovered saved crash screen',
              earned: 0,
              run: this.s,
              best: save.highScore || 0,
              standing: tribeStanding(),
              board: save.tribes?.[this.s.dialect] || [],
              soft: true,
            });
          } else {
            // If refresh interrupted an event, resume safely at a standstill
            // rather than leaving the player behind a missing event modal.
            this.state = 'PLAY';
            this.s.runEnded = false;
            this.ui?.hide?.('menu-screen');
            this.ui?.hide?.('over-screen');
            this.ui?.hideEvent?.();
            this.ui?.startPlay?.();
            this.ui?.update?.(this.s, this.route, this.driver);
            this.ui?.toast?.('Saved run restored · score, distance and unbanked fares recovered.');
          }

          owner.lastStats = owner.captureStats();
          owner.lastGameState = this.state;
          owner.careerPersistElapsed = 0;
          owner.checkpointElapsed = 0;
          persist();
        } else {
          owner.beginChallengeRun();
          owner.lastStats = owner.captureStats();
          owner.lastGameState = this.state;
        }

        owner.refreshResumeRunControl();
        return result;
      };
      this.game.start = startWrapper;
      this.restoreGameStart = () => {
        if (this.game.start === startWrapper) this.game.start = originalStart;
      };
    }

    if (typeof originalFinish === 'function') {
      const finishWrapper = function finishWithCheckpointCommit(reason, allowContinue) {
        const state = this.s || {};
        const offersContinue = Boolean(
          allowContinue && (Number(state.lives) > 0 || Number(save.money) >= Number(state.paidContinueCost || Infinity)),
        );
        const result = originalFinish.apply(this, [reason, allowContinue]);

        if (offersContinue) {
          owner.softGameOver = true;
          owner.checkpointActiveRun({ persistNow: true, force: true, reason });
        } else {
          // The game has now banked cash and submitted the completed score.
          // If persistence fails, retain the previous checkpoint in memory;
          // storage.js rolls back any failed banking transaction.
          owner.softGameOver = false;
          const previousCheckpoint = save.activeRunCheckpoint;
          save.activeRunCheckpoint = null;
          const cleared = persist();
          if (!cleared && previousCheckpoint) {
            save.activeRunCheckpoint = previousCheckpoint;
            owner.currentRunId = previousCheckpoint.runId || owner.currentRunId;
          } else {
            owner.currentRunId = '';
          }
          owner.refreshResumeRunControl();
        }
        return result;
      };
      this.game.finishOrContinue = finishWrapper;
      this.restoreGameFinish = () => {
        if (this.game.finishOrContinue === finishWrapper) this.game.finishOrContinue = originalFinish;
      };
    }

    if (typeof originalContinue === 'function') {
      const continueWrapper = function continueWithCheckpointSync(...args) {
        const result = originalContinue.apply(this, args);
        if (this.state === 'PLAY' && !this.s?.runEnded) {
          owner.softGameOver = false;
          owner.lastStats = owner.captureStats();
          owner.lastGameState = this.state;
          owner.checkpointActiveRun({ persistNow: true, force: true });
        }
        return result;
      };
      this.game.continueRun = continueWrapper;
      this.restoreGameContinue = () => {
        if (this.game.continueRun === continueWrapper) this.game.continueRun = originalContinue;
      };
    }
  }

  createResumeRunControl() {
    const startCard = document.querySelector('#start-screen .start-card');
    if (!startCard) return;
    const actions = startCard.querySelector('.start-actions');
    if (!actions) return;
    const existing = document.getElementById('kano-resume-run-button');
    if (existing) {
      this.resumeRunButton = existing;
      return;
    }
    const button = document.createElement('button');
    button.id = 'kano-resume-run-button';
    button.type = 'button';
    button.className = 'secondary-action';
    button.hidden = true;
    button.style.cssText = 'width:100%;min-height:42px;margin:7px 0;border:1px solid #25b69b;border-radius:10px;background:#0b3e40;color:#effff9;font:800 12px/1.25 system-ui,sans-serif;cursor:pointer;touch-action:manipulation;';
    button.addEventListener('click', () => {
      const checkpoint = this.readActiveRunCheckpoint();
      if (!checkpoint) {
        this.refreshResumeRunControl();
        return;
      }
      this.resumeRequested = true;
      this.game.start(checkpoint.mode);
    });
    startCard.insertBefore(button, actions);
    this.resumeRunButton = button;
  }

  readActiveRunCheckpoint() {
    const checkpoint = save.activeRunCheckpoint;
    if (isRecentCheckpoint(checkpoint)) return checkpoint;
    if (checkpoint) {
      save.activeRunCheckpoint = null;
      persist();
    }
    return null;
  }

  refreshResumeRunControl() {
    const button = this.resumeRunButton || document.getElementById('kano-resume-run-button');
    if (!button) return;
    const checkpoint = this.readActiveRunCheckpoint();
    if (!checkpoint) {
      button.hidden = true;
      return;
    }
    const score = Math.floor(Number(checkpoint.state.score) || 0).toLocaleString();
    const fares = Math.floor(Number(checkpoint.state.fares) || 0).toLocaleString();
    button.textContent = checkpoint.softOver
      ? `RECOVER SAVED RUN · SCORE ${score} · ₦${fares} FARES · CRASH SCREEN`
      : `RESUME SAVED RUN · SCORE ${score} · ₦${fares} FARES`;
    button.hidden = false;
  }

  checkpointActiveRun({ persistNow = true, force = false, reason = '' } = {}) {
    if (!this.game?.s) return false;
    const gameState = this.game.state;
    const softOver = gameState === 'OVER' && Boolean(this.softGameOver);
    const activeState = ['PLAY', 'MENU', 'EVENT'].includes(gameState);
    if (!activeState && !softOver) return false;

    try {
      const snapshot = jsonClone(this.game.s);
      // Never restore a held pedal or moving vehicle after a refresh. A soft
      // crash remains a crash screen, so a continue still consumes a life.
      snapshot.gas = false;
      snapshot.brake = false;
      snapshot.speed = 0;
      snapshot.signedSpeed = 0;
      snapshot.reverse = false;
      snapshot.event = null;
      snapshot.runEnded = softOver;

      const runId = this.currentRunId || save.activeRunCheckpoint?.runId || createRunId();
      this.currentRunId = runId;
      save.highScore = Math.max(0, Math.floor(Number(save.highScore) || 0), Math.floor(Number(snapshot.score) || 0));
      save.activeRunCheckpoint = {
        version: 1,
        runId,
        savedAt: Date.now(),
        mode: this.game.mode || snapshot.mode || 'career',
        routeId: this.game.route?.id || save.routeId,
        driverId: this.game.driver?.id || save.driverId,
        dialect: ['hausa', 'yoruba', 'igbo'].includes(snapshot.dialect) ? snapshot.dialect : save.dialect,
        gameState: softOver ? 'OVER' : 'PLAY',
        softOver,
        reason: String(reason || '').slice(0, 180),
        activeTribeChallenge: ['hausa', 'yoruba', 'igbo'].includes(save.activeTribeChallenge) ? save.activeTribeChallenge : null,
        tribeChallenges: jsonClone(save.tribeChallenges || {}),
        state: snapshot,
      };
      this.refreshResumeRunControl();
      return persistNow ? persist() : true;
    } catch (error) {
      console.warn('[Kano Life] Active-run checkpoint could not be created.', error);
      return false;
    }
  }

  checkLiveAchievements() {
    const state = this.game?.s;
    if (!state || !['PLAY', 'OVER'].includes(this.game.state)) return;
    const record = { ...state, goldTimes: Number(save.goldTimes) || 0, tribeSubmits: Number(save.tribeSubmits) || 0 };
    for (const achievement of ACHIEVEMENTS) {
      try {
        if (achievement.test(record) && unlockAchievement(achievement.id)) {
          this.game.ui?.toast?.(`Achievement unlocked: ${achievement.name} · saved`);
        }
      } catch (error) {
        console.warn(`[Kano Life] Achievement check failed: ${achievement.id}`, error);
      }
    }
  }

  createChallengePanels() {
    const startCard = document.querySelector('#start-screen .start-card');
    const startAnchor = startCard?.querySelector('.start-actions') || null;
    if (startCard) {
      this.challengeStartPanel = this.buildChallengePanel('kano-tribe-challenges-start', 'NAIJA CULTURE CHALLENGES', true);
      startCard.insertBefore(this.challengeStartPanel, startAnchor);
      const meta = startCard.querySelector('.start-meta');
      this.careerCard = this.createCareerCard();
      if (meta?.parentNode) meta.parentNode.insertBefore(this.careerCard, meta.nextSibling);
      this.originalStartButtonText = document.getElementById('start-btn')?.textContent || 'START THE MORNING';
    }
    const menuPanel = document.querySelector('#menu-screen .panel');
    const menuActions = menuPanel?.querySelector('.menu-actions') || null;
    if (menuPanel) {
      this.challengeMenuPanel = this.buildChallengePanel('kano-tribe-challenges-menu', 'HAUSA · YORUBA · IGBO CHALLENGES', false);
      menuPanel.insertBefore(this.challengeMenuPanel, menuActions);
    }
    this.refreshChallengePanels();
    this.refreshCareerCard();
    this.dockWorldLifePanel();
  }

  buildChallengePanel(id, title, compact) {
    const section = document.createElement('section');
    section.className = 'kano-tribe-challenges';
    section.id = id;
    const heading = document.createElement('h3');
    heading.textContent = title;
    section.append(heading);
    const grid = document.createElement('div');
    grid.className = 'kano-tribe-challenge-grid';
    for (const [tribe, config] of Object.entries(CHALLENGES)) {
      const card = document.createElement('article');
      card.className = 'kano-tribe-challenge';
      card.dataset.tribe = tribe;
      const name = document.createElement('strong');
      name.textContent = config.short;
      const description = document.createElement('small');
      description.textContent = config.description;
      const record = document.createElement('span');
      record.className = 'kano-tribe-record';
      const button = document.createElement('button');
      button.type = 'button';
      button.dataset.selectTribeChallenge = tribe;
      button.textContent = compact ? 'SELECT' : 'SELECT CHALLENGE';
      button.setAttribute('aria-pressed', 'false');
      button.addEventListener('click', () => this.selectTribeChallenge(tribe));
      card.append(name, description, record, button);
      grid.append(card);
    }
    section.append(grid);
    const footer = document.createElement('small');
    footer.textContent = compact
      ? 'Select a challenge, then press START THE MORNING. Challenge progress and career XP are saved in this browser.'
      : 'Choose one challenge to activate it for the next career run. Progress is saved locally.';
    footer.className = 'kano-tribe-challenges-note';
    footer.style.cssText = 'font-size:10px;line-height:1.3;color:#9fb5c4;font-weight:500';
    section.append(footer);
    return section;
  }

  createCareerCard() {
    const card = document.createElement('section');
    card.id = 'kano-career-progress';
    const title = document.createElement('strong');
    title.dataset.careerTitle = 'true';
    const text = document.createElement('span');
    text.dataset.careerText = 'true';
    const track = document.createElement('div');
    track.className = 'kano-xp-track';
    const fill = document.createElement('div');
    fill.className = 'kano-xp-fill';
    fill.dataset.careerXpFill = 'true';
    track.append(fill);
    card.append(title, text, track);
    return card;
  }

  selectTribeChallenge(tribe) {
    if (!CHALLENGES[tribe]) return;
    save.activeTribeChallenge = tribe;
    save.dialect = tribe;
    this.game.s.dialect = tribe;
    const dialectSelect = document.getElementById('dialect-select');
    if (dialectSelect) dialectSelect.value = tribe;
    const profile = ensureTribeChallenges()[tribe];
    profile.runProgress = 0;
    profile.completedThisRun = false;
    persist();
    this.refreshChallengePanels();
    this.refreshCareerCard();
    const start = document.getElementById('start-btn');
    if (start) start.textContent = `START ${CHALLENGES[tribe].short} CHALLENGE`;
    this.game.ui?.toast?.(`${CHALLENGES[tribe].name} selected. Start the morning routine to begin.`);
  }

  beginChallengeRun() {
    const tribe = save.activeTribeChallenge;
    this.tribeChallenges = ensureTribeChallenges();
    if (CHALLENGES[tribe]) {
      const profile = this.tribeChallenges[tribe];
      profile.runProgress = 0;
      profile.completedThisRun = false;
    }
    this.lastStats = this.captureStats();
    this.careerPersistElapsed = 0;
    persist();
    this.refreshChallengePanels();
  }

  captureStats() {
    const state = this.game?.s || {};
    return {
      distance: Math.max(0, Number(state.distance) || 0),
      fares: Math.max(0, Number(state.fares) || 0),
      drops: Math.max(0, Number(state.drops) || 0),
      boards: Math.max(0, Number(state.boards) || 0),
      matchedDrops: Math.max(0, Number(state.matchedDrops) || 0),
      nearMisses: Math.max(0, Number(state.nearMisses) || 0),
      checkpoints: Math.max(0, Number(state.checkpoints) || 0),
      refills: Math.max(0, Number(state.refills) || 0),
    };
  }

  applyCareerXP(amount, showToast = false) {
    if (!(amount > 0)) return false;
    this.career = ensureCareerProgress();
    const previousLevel = this.career.level;
    this.career.totalXP = Math.max(0, this.career.totalXP + amount);
    const derived = deriveLevel(this.career.totalXP);
    this.career.level = derived.level;
    this.career.xpIntoLevel = derived.xpIntoLevel;
    this.career.xpToNext = derived.xpToNext;
    save.careerProgression = this.career;
    if (this.career.level > previousLevel) {
      persist();
      this.refreshCareerCard();
      if (showToast) this.game.ui?.toast?.(`CAREER LEVEL UP · LEVEL ${this.career.level} · XP saved`);
      return true;
    }
    return false;
  }

  updateProgression(deltaSeconds, state) {
    const current = this.captureStats();
    const previous = this.lastStats || current;
    const d = {};
    for (const key of Object.keys(current)) d[key] = Math.max(0, current[key] - (Number(previous[key]) || 0));
    this.lastStats = current;

    const activeOrJustEnded = ['PLAY', 'OVER'].includes(this.game.state);
    if (!activeOrJustEnded) return;
    if (this.game.state === 'PLAY' || this.game.state === 'OVER') {
      // Update personal best during the run, not only after terminal banking.
      save.highScore = Math.max(0, Math.floor(Number(save.highScore) || 0), Math.floor(Number(state?.score) || 0));
      this.checkLiveAchievements();
      this.career = ensureCareerProgress();
      const xpGain = d.distance * 80 + d.drops * 30 + d.boards * 7 + d.matchedDrops * 15
        + d.nearMisses * 4 + d.checkpoints * 16 + d.refills * 9 + d.fares / 350;
      const leveled = this.applyCareerXP(xpGain, this.game.state === 'PLAY');
      if (xpGain > 0) {
        this.career.totalDistance += d.distance;
        this.career.totalFares += d.fares;
        this.career.totalDrops += d.drops;
        this.career.totalBoards += d.boards;
      }
      this.updateActiveChallenge(d);
      this.careerPersistElapsed += Math.max(0, Math.min(0.05, Number(deltaSeconds) || 0));
      if (leveled || this.careerPersistElapsed >= 4 || (this.game.state === 'OVER' && this.lastGameState !== 'OVER')) {
        this.careerPersistElapsed = 0;
        persist();
      }
    }
    if (this.game.state !== this.lastGameState) {
      if (this.game.state === 'OVER' && !this.softGameOver) {
        this.career.completedRuns += 1;
        persist();
      }
      this.lastGameState = this.game.state;
    }
    if (this.elapsed - this.lastChallengeRefresh >= 0.35) {
      this.lastChallengeRefresh = this.elapsed;
      this.refreshChallengePanels();
      this.refreshCareerCard();
    }
  }

  updateActiveChallenge(delta) {
    const tribe = save.activeTribeChallenge;
    const config = CHALLENGES[tribe];
    if (!config || this.game.mode !== 'career') return;
    const profile = ensureTribeChallenges()[tribe];
    if (profile.completedThisRun) return;
    const increment = config.stat === 'fares' ? delta.fares : delta[config.stat];
    if (!(increment > 0)) return;
    profile.runProgress = Math.min(config.target, Math.max(0, profile.runProgress + increment));
    profile.bestProgress = Math.max(profile.bestProgress, profile.runProgress);
    if (profile.runProgress >= config.target) {
      profile.completedThisRun = true;
      profile.completed += 1;
      profile.lastCompletedAt = Date.now();
      save.money = Math.max(0, Number(save.money) || 0) + config.rewardMoney;
      this.applyCareerXP(config.rewardXP, false);
      this.game.ui?.refreshWallet?.();
      this.game.ui?.toast?.(`${config.name} complete · +₦${config.rewardMoney.toLocaleString()} · +${config.rewardXP} career XP`);
      persist();
    }
  }

  refreshChallengePanels() {
    const profiles = ensureTribeChallenges();
    for (const panel of [this.challengeStartPanel, this.challengeMenuPanel]) {
      if (!panel) continue;
      for (const card of panel.querySelectorAll('.kano-tribe-challenge')) {
        const tribe = card.dataset.tribe;
        const config = CHALLENGES[tribe];
        const profile = profiles[tribe];
        const active = save.activeTribeChallenge === tribe;
        card.classList.toggle('kano-active-challenge', active);
        const button = card.querySelector('button');
        if (button) {
          button.setAttribute('aria-pressed', String(active));
          button.textContent = active ? 'SELECTED' : (panel.id.endsWith('start') ? 'SELECT' : 'SELECT CHALLENGE');
        }
        const record = card.querySelector('.kano-tribe-record');
        if (record) {
          const current = active ? Number(profile.runProgress) || 0 : 0;
          const shown = config.stat === 'fares' ? `₦${Math.floor(current).toLocaleString()}/₦${config.target.toLocaleString()}` : `${Math.floor(current)}/${config.target}`;
          record.textContent = `Cleared ${profile.completed}× · Best ${Math.floor(profile.bestProgress)} · ${active ? `Current ${shown}` : 'Not selected'}`;
        }
      }
    }
  }

  refreshCareerCard() {
    if (!this.careerCard) return;
    const career = ensureCareerProgress();
    const title = this.careerCard.querySelector('[data-career-title]');
    const text = this.careerCard.querySelector('[data-career-text]');
    const fill = this.careerCard.querySelector('[data-career-xp-fill]');
    if (title) title.textContent = `CAREER LEVEL ${career.level} · ${Math.floor(career.totalXP).toLocaleString()} TOTAL XP`;
    if (text) text.textContent = `${Math.floor(career.xpIntoLevel).toLocaleString()} / ${career.xpToNext.toLocaleString()} XP to next level · ${Math.floor(career.totalDistance).toFixed(1)} lifetime km · ${career.completedRuns} runs`;
    if (fill) fill.style.width = `${clamp(career.xpIntoLevel / Math.max(1, career.xpToNext) * 100, 0, 100)}%`;
  }

  dockWorldLifePanel() {
    const worldPanel = document.getElementById('kano-world-life-panel');
    const menu = document.querySelector('#menu-screen .panel');
    if (!worldPanel || !menu) return;
    const actions = menu.querySelector('.menu-actions');
    if (worldPanel.parentElement !== menu) menu.insertBefore(worldPanel, actions || null);
    worldPanel.style.position = 'relative';
    worldPanel.style.top = 'auto';
    worldPanel.style.right = 'auto';
    worldPanel.style.left = 'auto';
    worldPanel.style.bottom = 'auto';
    worldPanel.style.zIndex = 'auto';
    worldPanel.style.width = '100%';
    worldPanel.style.maxWidth = '100%';
    worldPanel.style.margin = '10px 0';
    worldPanel.style.boxShadow = 'none';
    worldPanel.style.backdropFilter = 'none';
    worldPanel.style.overflow = 'visible';
    const body = worldPanel.querySelector('.kano-world-life-body');
    if (body) body.style.maxHeight = '36vh';
  }

  bindRendererFallbacks() {
    const renderer = this.getRenderer?.();
    if (!renderer || renderer === this.characterRenderer) return;
    try { this.restoreCharacterFallbacks?.(); } catch {}
    this.characterRenderer = renderer;
    this.restoreCharacterFallbacks = installCharacterFallbacks(renderer);
  }

  bindSceneUpgradeAnimationFix() {
    const current = this.getSceneUpgrade?.();
    if (current === this.sceneUpgradePatched) return;
    try { this.restoreSceneUpgradeAnimation?.(); } catch {}
    this.restoreSceneUpgradeAnimation = null;
    this.sceneUpgradePatched = current || null;
    if (current) this.restoreSceneUpgradeAnimation = installSceneUpgradeAnimationFix(current, this.game);
  }

  update(deltaSeconds = 0, state = this.game?.s || {}) {
    if (this.disposed) return;
    this.bindRendererFallbacks();
    this.bindSceneUpgradeAnimationFix();
    this.dockWorldLifePanel();
    const dt = Math.min(Math.max(Number(deltaSeconds) || 0, 0), 0.05);
    this.elapsed += dt;
    this.updateProgression(dt, state);
    this.checkpointElapsed += dt;
    if (this.checkpointElapsed >= 4) {
      this.checkpointElapsed = 0;
      // Keep run score/fares/distance and the current road state durable
      // without adding unbanked fares to the persistent wallet.
      this.checkpointActiveRun({ persistNow: true });
    }
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
    if (player?.traverse) player.traverse((object) => {
      if (object.name === 'KANO_KEKE_DRIVER_PIVOT') rigPivot = object;
      if (object.name === 'KANO_KEKE_SEATED_DRIVER') rigRoot = object;
      if (/driver|wheel|seat|handlebar/i.test(object.name || '')) namedNodes += 1;
    });
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
          seatStatus = dx <= 1.3 && dz <= 1.8 ? `driver anchor near chassis centre (x=${dx.toFixed(2)}, z=${dz.toFixed(2)} m; approximate)` : `WARNING: driver anchor offset from chassis (x=${dx.toFixed(2)}, z=${dz.toFixed(2)} m)`;
        } else seatStatus = 'world-position check unavailable';
      } catch { seatStatus = 'seat position unavailable'; }
    } else if (player) seatStatus = 'WARNING: no recognized seated-driver rig';
    else seatStatus = 'no 3D player (2D renderer or not initialized)';
    const near = getInteractionAdvice(state, this.game.state);
    const nearbyZone = near?.zone ? `${near.zone.type} depth=${Number(near.zone.depth).toFixed(3)} lane=${near.zone.lane}` : 'none';
    const career = ensureCareerProgress();
    const cachedModels = renderer?.models?.cache?.size ?? 'n/a';
    const status = [
      'KANO LIFE · SCENE DIAGNOSTICS',
      `Renderer: ${window.__KANO_RENDER_MODE__ || 'unknown'}`,
      `Game state: ${this.game.state}`,
      `Life scene: ${renderer?.lifeScene || 'unknown'}`,
      `Player object: ${player?.name || 'not available'}`,
      `Player GLB: ${player?.userData?.modelPath || 'procedural / unknown'}`,
      `Loaded model cache keys: ${cachedModels}`,
      `Seated driver rig: ${driverFound ? 'found' : 'missing'}`,
      `Seat check: ${seatStatus}`,
      `Named driver/wheel/seat nodes: ${namedNodes}`,
      `Visible passenger walkers: ${sceneUpgrade?.walkingPassengers?.length ?? 'n/a'}`,
      `Ambient crowd actors: ${sceneUpgrade?.walkers?.length ?? 'n/a'}`,
      `Career: level ${career.level} · ${Math.floor(career.totalXP)} lifetime XP`,
      `Challenge: ${save.activeTribeChallenge || 'none selected'}`,
      `Speed: ${Math.round(Number(state.speed) || 0)} km/h · gear: ${state.reverse ? 'REVERSE' : 'FORWARD'}`,
      `Nearby zone: ${nearbyZone}`,
      `Interaction guidance: ${near?.message || 'none'}`,
      'Roadside interaction timing: renderer-aligned',
      'Character fallback bridge: chooses best compatible cached GLB',
      'Crowd gait: accounts for forward/reverse road scroll',
      'World & Life panel: docked inside pause menu, away from drive controls',
      'Note: a failed or missing GLB still requires a valid asset path to eliminate its fallback.',
    ].join('\n');
    if (this.diagnostics && this.diagnostics.textContent !== status) this.diagnostics.textContent = status;
  }

  dispose() {
    if (this.disposed) return;
    // Snapshot an unfinished session before tearing down the integration layer.
    this.checkpointActiveRun({ persistNow: true });
    this.disposed = true;
    window.removeEventListener('pagehide', this.onPageHide);
    this.restoreMoveZones?.();
    this.restoreMoveZones = null;
    try { this.restoreCharacterFallbacks?.(); } catch {}
    this.restoreCharacterFallbacks = null;
    try { this.restoreSceneUpgradeAnimation?.(); } catch {}
    this.restoreSceneUpgradeAnimation = null;
    this.restoreCareerUi?.();
    this.restoreGameStart?.();
    this.restoreGameFinish?.();
    this.restoreGameContinue?.();
    this.sceneUpgradePatched = null;
    this.characterRenderer = null;
    this.hint?.remove();
    this.diagnostics?.remove();
    this.challengeStartPanel?.remove();
    this.challengeMenuPanel?.remove();
    this.careerCard?.remove();
    this.resumeRunButton?.remove();
    this.resumeRunButton = null;
    // The World & Life panel remains alive with its original owner; only undo
    // the temporary docking so disposal does not tear down another controller.
    const worldPanel = document.getElementById('kano-world-life-panel');
    if (worldPanel && worldPanel.parentElement !== this.container) {
      this.container.append(worldPanel);
      worldPanel.style.position = 'fixed';
      worldPanel.style.top = 'calc(env(safe-area-inset-top,0px) + 8px)';
      worldPanel.style.right = '8px';
      worldPanel.style.width = 'min(268px,calc(100vw - 16px))';
    }
    if (this.styleElement?.isConnected) this.styleElement.remove();
    this.hint = null;
    this.diagnostics = null;
  }
}
