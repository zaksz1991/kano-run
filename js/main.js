import { Game } from './game.js';
import { UI } from './ui.js';
import { Controls } from './controls.js';
import { AudioManager } from './audio.js';
import { Renderer2D } from './renderer2d.js';
import { Renderer3D } from './renderer3d.js';
import { ModelManager } from './ModelManager.js';
import { createModelAuditPanel } from './ModelAuditPanel.js';
import { save } from './storage.js';
import { KanoProductionBridge } from './KanoProductionBridge.js';
import { KekeDynamics } from './KekeDynamics.js';
import { KanoVisualEffects } from './KanoVisualEffects.js';
import { LiveUserCounter } from './LiveUserCounter.js';
import { KanoSceneUpgrade } from './KanoSceneUpgrade.js';
import { KanoTrafficDirector, KanoGLBAnimationManager } from './KanoAnimationTrafficUpgrade.js';
import { KanoPerformanceMonitor } from './KanoPerformanceMonitor.js';
import { KanoCinematicCamera } from './KanoCinematicCamera.js';
import { KanoAdaptiveQuality } from './KanoAdaptiveQuality.js';
import '../css/kano-responsive-upgrade.css';

// ============================================================
// KANO LIFE — APPLICATION ENTRY POINT
// File: js/main.js
// ============================================================

const container = document.getElementById('game-container');

if (!container) {
  throw new Error('[Kano Life] Required element #game-container was not found.');
}

let canvas = document.getElementById('game-canvas');

if (!canvas) {
  throw new Error('[Kano Life] Required element #game-canvas was not found.');
}

const query = new URLSearchParams(window.location.search);
const force2d = query.has('force2d');
const force3d = query.has('force3d');
// Developer diagnostics are opt-in; normal production play stays clean.
const debugMode = query.has('debugModels');
if (debugMode) {
  container.classList.add('kano-debug-mode');
  document.body.classList.add('kano-debug-mode');
} else {
  container.classList.remove('kano-debug-mode');
  document.body.classList.remove('kano-debug-mode');
}

const mobile = window.matchMedia(
  '(max-width: 760px), (pointer: coarse)',
).matches;

const ui = new UI();
const audio = new AudioManager();

let renderer = null;
let productionBridge = null;
let sceneUpgrade = null;
let kekeDynamics = null;
let visualEffects = null;
let liveUserCounter = null;
let animationManager = null;
let trafficDirector = null;
let performanceMonitor = null;
let cinematicCamera = null;
let adaptiveQuality = null;
let controls = null;
let game = null;
let renderMode = '2D';

let lastFrame = performance.now();
let fpsFrames = 0;
let fpsWindowStart = performance.now();
let lowFpsSince = 0;
let fallbackStarted = false;
let runtimeFailureCount = 0;
let rendererGeneration = 0;

let keep3D = Boolean(force3d || save?.settings?.quality === '3d');

// Keep the existing morning-routine UI and the active renderer in sync.
window.addEventListener('kano:life-scene', (event) => {
  renderer?.setLifeScene?.(event.detail?.scene || 'road');
});

// ============================================================
// RENDERER STATUS
// ============================================================

function setRenderBadge(text) {
  const badge = document.getElementById('render-badge');
  if (!badge) return;
  badge.textContent = text;
  badge.hidden = !debugMode;
}

function setRenderMode(mode) {
  renderMode = mode;
  window.__KANO_RENDER_MODE__ = mode;
}

// ============================================================
// DISPOSE CURRENT RENDERER
// ============================================================

function disposeRenderer() {
  // Restore the original WebGL render call before destroying the renderer.
  try {
    cinematicCamera?.dispose?.();
  } catch (error) {
    console.warn('[Kano Life] cinematic camera cleanup warning', error);
  }
  cinematicCamera = null;

  try {
    adaptiveQuality?.dispose?.();
  } catch (error) {
    console.warn('[Kano Life] adaptive quality cleanup warning', error);
  }
  adaptiveQuality = null;

  // Stop AnimationMixers and restore model-instance cloning before model actors are removed.
  try {
    animationManager?.dispose?.();
  } catch (error) {
    console.warn('[Kano Life] GLB animation disposal warning', error);
  }
  animationManager = null;

  // Dispose per-renderer effects before their scene/world is destroyed.
  try {
    visualEffects?.dispose?.();
  } catch (error) {
    console.warn('[Kano Life] visual effects disposal warning', error);
  }
  visualEffects = null;

  // The bridge owns DOM overlays and a hawker attached to the renderer world.
  // Dispose it before destroying the renderer it depends on.
  try {
    productionBridge?.dispose?.();
  } catch (error) {
    console.warn('[Kano Life] production bridge disposal warning', error);
  }
  productionBridge = null;

  // Restore Game.pickup/drop hooks and remove upgrade-owned scene meshes
  // before the Keke visual pivot and Renderer3D are torn down.
  try {
    sceneUpgrade?.dispose?.();
  } catch (error) {
    console.warn('[Kano Life] scene upgrade disposal warning', error);
  }
  sceneUpgrade = null;

  try {
    kekeDynamics?.dispose?.();
  } catch (error) {
    console.warn('[Kano Life] Keke dynamics disposal warning', error);
  }
  kekeDynamics = null;

  if (!renderer) return;

  try {
    renderer.dispose?.();
  } catch (error) {
    console.warn('[Kano Life] renderer disposal warning', error);
  }

  renderer = null;
}

// ============================================================
// CANVAS REPLACEMENT
// A WebGL canvas is never reused for Canvas 2D rendering.
// ============================================================

function freshCanvas() {
  const replacement = document.createElement('canvas');

  replacement.id = 'game-canvas';
  replacement.setAttribute('aria-label', 'Kano Life driving game');
  replacement.style.cssText =
    'position:absolute;inset:0;width:100%;height:100%;display:block;touch-action:pan-y';

  if (canvas?.isConnected) {
    canvas.replaceWith(replacement);
  } else {
    container.prepend(replacement);
  }

  canvas = replacement;
  return replacement;
}

// ============================================================
// CANVAS 2D FALLBACK
// ============================================================

function start2D(reason = '2D MODE · ROAD VISIBLE') {
  // Invalidate any outstanding asynchronous 3D setup or asset callback.
  rendererGeneration += 1;
  fallbackStarted = renderMode === '2D' ? fallbackStarted : true;

  // Reuse the current Canvas 2D renderer when already in 2D mode.
  if (renderer instanceof Renderer2D && renderMode === '2D') {
    try {
      renderer.resize?.();
    } catch (error) {
      console.warn('[Kano Life] Canvas 2D resize warning', error);
    }

    setRenderMode('2D');
    setRenderBadge(reason);
    return;
  }

  disposeRenderer();

  const newCanvas = freshCanvas();

  try {
    renderer = new Renderer2D(newCanvas);
    renderer.resize?.();
    visualEffects = new KanoVisualEffects({ renderer, game, container, mobile });
    setRenderMode('2D');
    setRenderBadge(reason);

    console.info('[Kano Life] Canvas 2D fallback active');
  } catch (error) {
    renderer = null;
    console.error('[Kano Life] Canvas 2D renderer could not start', error);
    setRenderBadge('RENDERER ERROR · RELOAD GAME');
  }
}

// ============================================================
// WEBGL CONTEXT RECOVERY
// ============================================================

function attachWebGLRecovery(targetCanvas, generation) {
  targetCanvas.addEventListener(
    'webglcontextlost',
    (event) => {
      event.preventDefault();

      // Ignore context-loss notifications from a renderer already replaced.
      if (generation !== rendererGeneration || renderMode !== '3D') return;

      console.error('[Kano Life] WebGL context lost; switching to Canvas 2D');
      start2D('2D MODE · WEBGL CONTEXT LOST');
    },
    { once: true },
  );
}

// ============================================================
// THREE.JS RENDERER
// ============================================================

async function start3D() {
  const generation = ++rendererGeneration;
  lowFpsSince = 0;
  fallbackStarted = false;

  disposeRenderer();

  // Probe WebGL on a temporary canvas. The probe canvas is not used
  // by either game renderer.
  const probe = document.createElement('canvas');
  let gl = null;

  try {
    gl =
      probe.getContext('webgl2', {
        failIfMajorPerformanceCaveat: false,
      }) ||
      probe.getContext('webgl', {
        failIfMajorPerformanceCaveat: false,
      });
  } catch {
    gl = null;
  }

  if (!gl) {
    throw new Error('WebGL unavailable');
  }

  try {
    gl.getExtension('WEBGL_lose_context')?.loseContext();
  } catch {
    // The context-loss extension is optional.
  }

  // The quality setting may have changed while the probe was running.
  if (generation !== rendererGeneration) return;

  const models = new ModelManager();
  const activeCanvas = freshCanvas();
  attachWebGLRecovery(activeCanvas, generation);

  let webglRenderer;

  try {
    webglRenderer = new Renderer3D(activeCanvas, models, { mobile });
    renderer = webglRenderer;
    webglRenderer.resize?.();
  } catch (error) {
    if (generation === rendererGeneration) {
      renderer = null;
    }
    throw error;
  }

  if (generation !== rendererGeneration) {
    try {
      webglRenderer.dispose?.();
    } catch {
      // Renderer became stale during initialization.
    }
    return;
  }

  // Speed-dependent field of view, subtle chassis-follow camera bank, and
  // collision vibration. Camera transforms are restored after each render.
  try {
    cinematicCamera = new KanoCinematicCamera({
      renderer: webglRenderer,
      game,
      mobile,
      enabled: !query.has('disableCameraFX'),
    });
  } catch (error) {
    cinematicCamera = null;
    console.warn('[Kano Life] cinematic camera effects unavailable', error);
  }

  // Automatically adjust WebGL drawing resolution when frame rate remains
  // low on mobile or mid-range hardware. Game physics and CSS layout are unchanged.
  try {
    adaptiveQuality = new KanoAdaptiveQuality({
      renderer: webglRenderer,
      mobile,
      enabled: !query.has('fixedQuality'),
    });
  } catch (error) {
    adaptiveQuality = null;
    console.warn('[Kano Life] adaptive render quality unavailable', error);
  }

  // Preserve embedded skeletal clips where GLB character assets provide them.
  // Character cloning uses SkeletonUtils so each animated pedestrian owns a safe skeleton.
  try {
    animationManager = new KanoGLBAnimationManager({
      renderer: webglRenderer,
      models,
      mobile,
      debug: debugMode || query.has('debugPerf'),
    });
  } catch (error) {
    animationManager = null;
    console.warn('[Kano Life] GLB animation manager unavailable', error);
  }

  // Dense Kano market, animated roadside pedestrians, life-scene action rigs,
  // passenger walking animations, and a calibrated seated-driver fallback.
  // This is an additive visual layer: Game remains the authority for fares,
  // collision outcomes, fuel, vehicle condition, and traffic simulation.
  try {
    sceneUpgrade = new KanoSceneUpgrade({ renderer: webglRenderer, game, mobile });
  } catch (error) {
    sceneUpgrade = null;
    console.warn('[Kano Life] market/crowd/scene animations unavailable', error);
  }

  // Bind collectible coins and exhaust smoke. The effects module supports
  // both Three.js and Canvas 2D rendering, and never owns the game simulation.
  try {
    visualEffects = new KanoVisualEffects({ renderer: webglRenderer, game, container, mobile });
  } catch (error) {
    visualEffects = null;
    console.warn('[Kano Life] smoke/coin effects unavailable', error);
  }

  // Bind visual-only Keke dynamics. It follows renderer.player automatically
  // when applyModel replaces the procedural tricycle with a GLB instance.
  try {
    kekeDynamics = new KekeDynamics({ renderer: webglRenderer, mobile });
  } catch (error) {
    kekeDynamics = null;
    console.warn('[Kano Life] optional Keke dynamics unavailable', error);
  }

  setRenderMode('3D');
  setRenderBadge('3D MODE · WEBGL');
  console.info('[Kano Life] WebGL renderer ready');

  // Integrate safe narrative/profile/hawker features without enabling duplicate
  // traffic, environment, collision or audio systems. The existing Game and
  // Renderer3D remain authoritative for those systems.
  try {
    productionBridge = new KanoProductionBridge({
      renderer: webglRenderer,
      game,
      uiRoot: container,
      mobile,
    });
  } catch (error) {
    productionBridge = null;
    console.warn('[Kano Life] optional production systems unavailable', error);
  }

  const essentials = mobile
    ? [
        'keke',
        'car',
        'taxi',
        'suv',
        'motorcycle',
        'police',
        'passenger',
      ]
    : [
        'keke',
        'car',
        'taxi',
        'suv',
        'motorcycle',
        'police',
        'karota',
        'ambulance',
        'truck',
        'bus',
        'passenger',
        'passengerWoman',
        'passengerMan',
        'passengerVIP',
        'security',
        'pedestrian',
        'pedestrianWoman',
        'building',
        'industrialBuilding',
        'flyover',
        'roadlight',
        'cone',
        'dirtmound',
        'bench',
        'busStop',
        'trafficLight',
        'stopSign',
        'marketStall',
      ];

  const essentialLoad = Promise.resolve()
    .then(() => models.preload(essentials))
    .then(() => {
      // Do not install assets into a renderer that has been replaced.
      if (generation !== rendererGeneration || renderer !== webglRenderer || renderMode !== '3D') {
        return;
      }

      const playerModel = models.getInstance('keke');

      if (playerModel) {
        webglRenderer.applyModel('keke', playerModel);
      } else {
        console.warn(
          '[ModelManager] keke GLB unavailable; keep the procedural fallback visible',
        );
      }
    })
    .catch((error) => {
      console.warn('[ModelManager] essential asset preload issue', error);
    });

  // Load remaining models in batches on mobile so the player keke
  // can appear before the rest of the environment finishes loading.
  if (mobile) {
    const mobileAssetBatches = [
      ['flyover', 'building', 'passengerWoman', 'passengerMan'],
      ['karota', 'ambulance', 'truck', 'bus'],
      ['passengerVIP', 'security', 'pedestrian', 'pedestrianWoman'],
      ['industrialBuilding', 'roadlight', 'cone', 'dirtmound'],
      ['bench', 'busStop', 'trafficLight', 'stopSign', 'marketStall'],
    ];

    void essentialLoad.then(async () => {
      for (const keys of mobileAssetBatches) {
        if (
          generation !== rendererGeneration ||
          renderer !== webglRenderer ||
          renderMode !== '3D'
        ) {
          return;
        }

        try {
          await models.preload(keys);
        } catch (error) {
          console.warn('[ModelManager] deferred mobile asset batch failed', error);
        }

        await new Promise((resolve) => window.setTimeout(resolve, 250));
      }
    });
  }
}

// ============================================================
// GAME BOOTSTRAP
// ============================================================

function boot() {
  // FPS/frame-time telemetry is player-invisible unless ?debugPerf=1 is requested.
  try {
    performanceMonitor = new KanoPerformanceMonitor({
      container,
      enabled: query.has('debugPerf'),
    });
  } catch (error) {
    performanceMonitor = null;
    console.warn('[Kano Life] performance monitor unavailable', error);
  }

  // The counter reports recent sessions from the server-backed presence API.
  // It displays UNAVAILABLE rather than inventing a local-only global count.
  try {
    liveUserCounter = new LiveUserCounter({ container }).start();
  } catch (error) {
    console.warn('[Kano Life] live-user counter unavailable', error);
  }

  // The 3D model audit is developer tooling, not a player HUD widget.
  // Open the game with ?debugModels=1 when diagnosing model assets.
  if (debugMode) {
    try {
      createModelAuditPanel();
    } catch (error) {
      console.warn('[Kano Life] model audit panel unavailable', error);
    }
  }

  game = new Game(ui, audio, { mobile });
  ui.bind?.(game);

  // Add lane-aware traffic behaviours while retaining Game's original movement
  // and collision handling as the single authority.
  try {
    trafficDirector = new KanoTrafficDirector({ game, mobile });
  } catch (error) {
    trafficDirector = null;
    console.warn('[Kano Life] traffic AI upgrade unavailable', error);
  }

  controls = new Controls(container, {
    lane: (direction) => game.lane(direction),
    gas: (value) => game.gas(value),
    brake: (value) => game.brake(value),
    horn: () => {
      game.horn();
      productionBridge?.onHorn?.();
    },
    menu: () => game.menu(),

    // R and the on-screen REVERSE button use the same handler.
    // Avoid registering a second reverse-button click listener in UI.
    reverse: () => {
      if (typeof game.toggleReverse === 'function') {
        return game.toggleReverse();
      }

      if (typeof game.setReverse === 'function') {
        return game.setReverse(!Boolean(game.s?.reverse));
      }

      ui.toast('Reverse gear is not available in this game build.');
      return false;
    },
  });

  // ----------------------------------------------------------
  // RENDERING QUALITY
  // ----------------------------------------------------------

  const saved2D = save?.settings?.quality === '2d';

  window.addEventListener('kano:quality-change', (event) => {
    const quality = event.detail?.quality || 'auto';

    if (force2d || force3d) return;

    keep3D = quality === '3d';

    if (quality === '2d') {
      start2D('2D MODE · SELECTED IN SETTINGS');
      return;
    }

    start3D().catch((error) => {
      console.warn(
        '[Kano Life] selected 3D mode unavailable; using Canvas 2D',
        error,
      );

      start2D('2D MODE · WEBGL UNAVAILABLE');
    });
  });

  if (force2d || (saved2D && !force3d)) {
    start2D(
      force2d
        ? '2D MODE · FORCED BY URL'
        : '2D MODE · SAVED SETTING',
    );
  } else {
    start3D().catch((error) => {
      console.warn(
        '[Kano Life] 3D unavailable; starting Canvas 2D on a fresh canvas',
        error,
      );

      start2D(
        force3d
          ? '2D MODE · WEBGL UNAVAILABLE'
          : '2D MODE · ROAD VISIBLE',
      );
    });
  }

  // ----------------------------------------------------------
  // RESPONSIVE RESIZING
  // ----------------------------------------------------------

  const resizeWithMobilePasses = () => {
    [0, 140, 320, 620].forEach((delay) => {
      window.setTimeout(() => {
        try {
          renderer?.resize?.();
        } catch (error) {
          console.warn('[Kano Life] deferred resize failed', error);
        }
      }, delay);
    });
  };

  window.addEventListener('resize', resizeWithMobilePasses, { passive: true });
  window.addEventListener('orientationchange', resizeWithMobilePasses, { passive: true });
  window.visualViewport?.addEventListener('resize', resizeWithMobilePasses, { passive: true });

  document.addEventListener('visibilitychange', () => {
    lastFrame = performance.now();
  });

  if (force3d || keep3D) {
    console.info('[Kano Life] 3D preference active; automatic low-FPS fallback disabled');
  }

  if (force2d) {
    console.info('[Kano Life] ?force2d requested');
  }

  requestAnimationFrame(frame);
}

// ============================================================
// GAME LOOP
// ============================================================

function frame(now) {
  performanceMonitor?.beginFrame?.(now);
  const dt = Math.min(Math.max((now - lastFrame) / 1000, 0), 0.05);
  lastFrame = now;
  fpsFrames += 1;

  if (now - fpsWindowStart >= 1000) {
    const fps = (fpsFrames * 1000) / Math.max(1, now - fpsWindowStart);

    fpsFrames = 0;
    fpsWindowStart = now;

    // Fall back on mobile only after sustained poor performance.
    // Forced 3D and explicitly saved 3D mode disable this behaviour.
    if (mobile && renderMode === '3D' && !keep3D && !fallbackStarted) {
      if (fps < 10) {
        if (!lowFpsSince) lowFpsSince = now;

        if (now - lowFpsSince >= 8000) {
          fallbackStarted = true;
          start2D('2D MODE · LOW FPS FALLBACK');
        }
      } else {
        lowFpsSince = 0;
      }
    }
  }

  try {
    // Traffic chooses its lane and speed before Game processes this frame's collisions.
    trafficDirector?.update?.(dt);
    game?.tick(dt);

    // Apply visual-only camera polish and an optional adaptive WebGL resolution
    // tier before the renderer submits this frame. Neither modifies game rules.
    if (renderMode === '3D') {
      cinematicCamera?.update?.(dt, game?.s || {});
      adaptiveQuality?.update?.(now, renderMode, game?.state);
    }

    // Keep stalls, ambient pedestrians, morning actions, passenger boarding and
    // passenger alighting on the same frame clock as the existing world.
    if (renderMode === '3D' && sceneUpgrade) {
      sceneUpgrade.update(dt, game?.s || {});
    }
    // Apply Keke chassis/suspension/wheel visuals before the current frame renders.
    // This never changes authoritative game physics or creates another road/traffic system.
    if (renderMode === '3D' && kekeDynamics) {
      kekeDynamics.update(dt, game?.s || {});
    }
    // Update optional, 3D-only narrative and hawker features once per frame.
    // The bridge is disposed whenever the renderer is replaced or falls back.
    productionBridge?.update?.(dt);
    visualEffects?.update?.(dt, game?.s || {});
    // Update mixers before drawing. If renderer.draw creates a new GLB actor,
    // it is detected and attached on the following frame.
    animationManager?.update?.(dt, game?.s || {});
    renderer?.draw?.(game?.s, dt);
    visualEffects?.render2DOverlay?.(game?.s || {});
    runtimeFailureCount = 0;
  } catch (error) {
    runtimeFailureCount += 1;
    console.error('[Kano Life] frame update failed', error);

    if (renderMode === '3D') {
      start2D('2D MODE · RECOVERED AFTER ERROR');
    }

    if (runtimeFailureCount >= 3 && game?.state === 'PLAY') {
      game.state = 'MENU';

      if (game.s) {
        game.s.gas = false;
        game.s.brake = false;
        game.s.signedSpeed = 0;
      }

      ui.show('menu-screen');
      ui.toast('Game paused after a runtime error. Check the console before continuing.');
    }
  } finally {
    performanceMonitor?.endFrame?.(performance.now(), renderMode, renderer);
    requestAnimationFrame(frame);
  }
}

window.addEventListener('pagehide', () => {
  try { trafficDirector?.dispose?.(); } catch { /* page is closing */ }
  try { performanceMonitor?.dispose?.(); } catch { /* page is closing */ }
  try { disposeRenderer(); } catch { /* page is closing */ }
}, { once: true });

// ============================================================
// START
// ============================================================

boot();
