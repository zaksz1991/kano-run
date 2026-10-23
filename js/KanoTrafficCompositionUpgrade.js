/**
 * KANO LIFE — Step 100: authentic, balanced traffic composition.
 *
 * Additive patch only: preserves lane, depth, speed, collision, route, fares,
 * progression and saved data. New traffic is assigned in shuffled ten-vehicle
 * batches: four kekes, three motorcycles/okadas, and three cars.
 */
import { Game } from './game.js';
import { Renderer3D } from './renderer3d.js';
import { takeNextKanoTrafficType } from './KanoTrafficCompositionRules.mjs';

const PATCH_KEY = Symbol.for('kano.life.trafficComposition.step100');
const PRELOAD_KEY = Symbol.for('kano.life.trafficModelPreload.step100');

function getTraffic(game) {
  if (Array.isArray(game?.s?.traffic)) return game.s.traffic;
  if (Array.isArray(game?.state?.traffic)) return game.state.traffic;
  return [];
}

function ensureStats(game) {
  if (!game._kanoTrafficCompositionStats) {
    game._kanoTrafficCompositionStats = {
      version: 1,
      totalAssigned: 0,
      assigned: { keke: 0, motorcycle: 0, car: 0 },
      lastBatch: [],
    };
  }
  return game._kanoTrafficCompositionStats;
}

function preloadTrafficModels(renderer) {
  if (!renderer || renderer[PRELOAD_KEY]) return;
  const manager = renderer.models || renderer.modelManager;
  if (!manager || typeof manager.load !== 'function') return;

  Object.defineProperty(renderer, PRELOAD_KEY, {
    value: true, enumerable: false, configurable: false, writable: false,
  });
  renderer.kanoTrafficModelPreload = {
    startedAt: new Date().toISOString(),
    status: { keke: 'loading', motorcycle: 'loading', car: 'loading' },
  };

  for (const key of ['keke', 'motorcycle', 'car']) {
    Promise.resolve()
      .then(() => manager.load(key))
      .then((model) => {
        renderer.kanoTrafficModelPreload.status[key] = model ? 'loaded' : 'unavailable';
        renderer.kanoTrafficModelPreload[key] = model?.userData?.modelPath || null;
      })
      .catch((error) => {
        renderer.kanoTrafficModelPreload.status[key] = 'failed';
        renderer.kanoTrafficModelPreload[`${key}Error`] = String(error?.message || error).slice(0, 180);
      });
  }
}

if (typeof Game.prototype.spawnTraffic === 'function' && !Game.prototype[PATCH_KEY]) {
  const originalSpawnTraffic = Game.prototype.spawnTraffic;

  Object.defineProperty(Game.prototype, PATCH_KEY, {
    value: true, enumerable: false, configurable: false, writable: false,
  });

  Game.prototype.spawnTraffic = function kanoBalancedSpawnTraffic(...args) {
    const existing = new Set(getTraffic(this));
    const result = originalSpawnTraffic.apply(this, args);
    const traffic = getTraffic(this);
    const added = traffic.filter((vehicle) => vehicle && !existing.has(vehicle));
    const stats = ensureStats(this);
    const batch = [];

    for (const vehicle of added) {
      const type = takeNextKanoTrafficType(this);
      if (!type) continue;
      vehicle.type = type;
      stats.assigned[type] = (stats.assigned[type] || 0) + 1;
      stats.totalAssigned += 1;
      batch.push({ id: vehicle.id ?? null, type });
    }

    stats.lastBatch = batch.slice(-10);
    if (typeof window !== 'undefined') window.__KANO_LIFE_GAME__ = this;
    return result;
  };
}

// Start loading the actual model catalog before later traffic spawns need it.
const originalDraw = Renderer3D.prototype.draw;
if (typeof originalDraw === 'function' && !Renderer3D.prototype[PATCH_KEY]) {
  Object.defineProperty(Renderer3D.prototype, PATCH_KEY, {
    value: true, enumerable: false, configurable: false, writable: false,
  });

  Renderer3D.prototype.draw = function kanoTrafficPreloadDraw(...args) {
    preloadTrafficModels(this);
    if (typeof window !== 'undefined') window.__KANO_LIFE_RENDERER__ = this;
    return originalDraw.apply(this, args);
  };
}

if (typeof window !== 'undefined') {
  window.kanoTrafficCompositionAudit = () => {
    const game = window.__KANO_LIFE_GAME__ || null;
    const renderer = window.__KANO_LIFE_RENDERER__ || null;
    const stats = game ? ensureStats(game) : null;
    const live = getTraffic(game);
    const liveCounts = { keke: 0, motorcycle: 0, car: 0, other: 0 };

    for (const vehicle of live) {
      if (vehicle?.type === 'keke') liveCounts.keke += 1;
      else if (vehicle?.type === 'motorcycle') liveCounts.motorcycle += 1;
      else if (vehicle?.type === 'car') liveCounts.car += 1;
      else liveCounts.other += 1;
    }

    const totalLive = live.length;
    const pct = (count, total) => total ? Math.round((count / total) * 1000) / 10 : 0;
    const manager = renderer?.models || renderer?.modelManager || (typeof window !== 'undefined' ? window.__KANO_MODEL_MANAGER__ : null);
    const models = {};
    for (const key of ['keke', 'motorcycle', 'car']) {
      const model = manager?.cache?.get?.(key) || null;
      const preload = renderer?.kanoTrafficModelPreload;
      models[key] = {
        cached: Boolean(model),
        path: model?.userData?.modelPath || preload?.[key] || null,
        preloadStatus: preload?.status?.[key] || (model ? 'loaded' : 'not-yet-confirmed'),
      };
    }

    return {
      version: '100.0.0',
      target: { keke: 40, motorcycle: 30, car: 30 },
      batchSize: 10,
      assignedTotal: stats?.totalAssigned || 0,
      assignedCounts: stats ? { ...stats.assigned } : { keke: 0, motorcycle: 0, car: 0 },
      liveCounts,
      livePercentages: {
        keke: pct(liveCounts.keke, totalLive),
        motorcycle: pct(liveCounts.motorcycle, totalLive),
        car: pct(liveCounts.car, totalLive),
      },
      lastAssignedBatch: stats?.lastBatch || [],
      models,
      note: 'Exact 40/30/30 composition is guaranteed per completed ten-vehicle spawn batch. Model entries report actual runtime cache paths; an unavailable asset can still trigger the existing renderer fallback.',
    };
  };
}

console.info('[Kano Life] Step 100 traffic composition registered: 40% keke, 30% motorcycle, 30% car per ten-vehicle batch.');
