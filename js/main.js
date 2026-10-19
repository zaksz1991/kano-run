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
import {
  KanoTrafficDirector,
  KanoGLBAnimationManager,
} from './KanoAnimationTrafficUpgrade.js';
import { KanoPerformanceMonitor } from './KanoPerformanceMonitor.js';
import { KanoCinematicCamera } from './KanoCinematicCamera.js';
import { KanoAdaptiveQuality } from './KanoAdaptiveQuality.js';
import { KanoAtmosphere } from './KanoAtmosphere.js';
import { KanoInteractionReliability } from './KanoInteractionReliability.js';
import { KanoWorkshopPanel } from './KanoWorkshopPanel.js';

import '../css/kano-responsive-upgrade.css';

// ============================================================
// KANO LIFE — APPLICATION ENTRY POINT
// File: js/main.js
//
// Responsibilities:
// - Game initialization and lifecycle
// - Canvas 2D / Three.js renderer selection
// - WebGL recovery and mobile performance fallback
// - Traffic, atmosphere, camera, animation, and visual effects
// - Workshop, repairs, vehicle condition, and roadside recovery UI
// - Safe disposal of renderer and page-owned resources
// ============================================================

const container = document.getElementById('game-container');

if (!container) {
  throw new Error(
    '[Kano Life] Required element #game-container was not found.',
  );
}

let canvas = document.getElementById('game-canvas');

if (!canvas) {
  throw new Error(
    '[Kano Life] Required element #game-canvas was not found.',
  );
}

const query = new URLSearchParams(window.location.search);
const force2d = query.has('force2d');
const force3d = query.has('force3d');

// Developer diagnostics are opt-in.
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
let atmosphere = null;
let interactionReliability = null;
let controls = null;
let game = null;
let workshopPanel = null;

let renderMode = '2D';

let lastFrame = performance.now();
let fpsFrames = 0;
let fpsWindowStart = performance.now();
let lowFpsSince = 0;
let fallbackStarted = false;
let runtimeFailureCount = 0;
let rendererGeneration = 0;

let keep3D = Boolean(
  force3d || save?.settings?.quality === '3d',
);

let pageClosing = false;

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
// Workshop panel is deliberately not disposed here. Renderer
// switches must not destroy the persistent workshop interface.
// ============================================================

function disposeRenderer() {
  // Atmosphere wraps the cinematic camera render wrapper.
  // Unwind atmosphere first, then restore the native render call.
  try {
    atmosphere?.dispose?.();
  } catch (error) {
    console.warn(
      '[Kano Life] atmosphere cleanup warning',
      error,
    );
  }

  atmosphere = null;

  try {
    cinematicCamera?.dispose?.();
  } catch (error) {
    console.warn(
      '[Kano Life] cinematic camera cleanup warning',
      error,
    );
  }

  cinematicCamera = null;

  try {
    adaptiveQuality?.dispose?.();
  } catch (error) {
    console.warn(
      '[Kano Life] adaptive quality cleanup warning',
      error,
    );
  }

  adaptiveQuality = null;

  // Stop animation mixers before removing model actors.
  try {
    animationManager?.dispose?.();
  } catch (error) {
    console.warn(
      '[Kano Life] GLB animation disposal warning',
      error,
    );
  }

  animationManager = null;

  // Dispose per-renderer visual effects.
  try {
    visualEffects?.dispose?.();
  } catch (error) {
    console.warn(
      '[Kano Life] visual effects disposal warning',
      error,
    );
  }

  visualEffects = null;

  // This bridge owns renderer-related overlays and world objects.
  try {
    productionBridge?.dispose?.();
  } catch (error) {
    console.warn(
      '[Kano Life] production bridge disposal warning',
      error,
    );
  }

  productionBridge = null;

  // Remove upgrade-owned meshes and restore Game hooks.
  try {
    sceneUpgrade?.dispose?.();
  } catch (error) {
    console.warn(
      '[Kano Life] scene upgrade disposal warning',
      error,
    );
  }

  sceneUpgrade = null;

  try {
    kekeDynamics?.dispose?.();
  } catch (error) {
    console.warn(
      '[Kano Life] Keke dynamics disposal warning',
      error,
    );
  }

  kekeDynamics = null;

  if (!renderer) return;

  try {
    renderer.dispose?.();
  } catch (error) {
    console.warn(
      '[Kano Life] renderer disposal warning',
      error,
    );
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
  replacement.setAttribute(
    'aria-label',
    'Kano Life driving game',
  );

  replacement.style.cssText =
    'position:absolute;inset:0;width:100%;height:100%;' +
    'display:block;touch-action:pan-y';

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
  if (pageClosing) return;

  // Invalidate asynchronous 3D initialization and asset callbacks.
  rendererGeneration += 1;

  if (renderMode !== '2D') {
    fallbackStarted = true;
  }

  // Reuse the current Canvas 2D renderer if already active.
  if (
    renderer instanceof Renderer2D &&
    renderMode === '2D'
  ) {
    try {
      renderer.resize?.();
    } catch (error) {
      console.warn(
        '[Kano Life] Canvas 2D resize warning',
        error,
      );
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

    visualEffects = new KanoVisualEffects({
      renderer,
      game,
      container,
      mobile,
    });

    setRenderMode('2D');
    setRenderBadge(reason);

    console.info(
      '[Kano Life] Canvas 2D fallback active',
    );
  } catch (error) {
    renderer = null;

    console.error(
      '[Kano Life] Canvas 2D renderer could not start',
      error,
    );

    setRenderBadge('RENDERER ERROR · RELOAD GAME');
  }
}

// ============================================================
// WEBGL CONTEXT RECOVERY
// ============================================================

function attachWebGLRecovery(
  targetCanvas,
  generation,
) {
  targetCanvas.addEventListener(
    'webglcontextlost',
    (event) => {
      event.preventDefault();

      // Ignore notifications from a replaced renderer.
      if (
        generation !== rendererGeneration ||
        renderMode !== '3D'
      ) {
        return;
      }

      console.error(
        '[Kano Life] WebGL context lost; switching to Canvas 2D',
      );

      start2D('2D MODE · WEBGL CONTEXT LOST');
    },
    { once: true },
  );
}

// ============================================================
// THREE.JS RENDERER
// ============================================================

async function start3D() {
  if (pageClosing) return;

  const generation = ++rendererGeneration;

  lowFpsSince = 0;
  fallbackStarted = false;

  disposeRenderer();

  // Probe WebGL using a temporary canvas.
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
    gl
      .getExtension('WEBGL_lose_context')
      ?.loseContext();
  } catch {
    // The extension is optional.
  }

  if (
    pageClosing ||
    generation !== rendererGeneration
  ) {
    return;
  }

  const models = new ModelManager();
  const activeCanvas = freshCanvas();

  attachWebGLRecovery(activeCanvas, generation);

  let webglRenderer;

  try {
    webglRenderer = new Renderer3D(
      activeCanvas,
      models,
      { mobile },
    );

    renderer = webglRenderer;

    webglRenderer.resize?.();
  } catch (error) {
    if (generation === rendererGeneration) {
      renderer = null;
    }

    throw error;
  }

  if (
    pageClosing ||
    generation !== rendererGeneration
  ) {
    try {
      webglRenderer.dispose?.();
    } catch {
      // Renderer became stale during initialization.
    }

    return;
  }

  // Speed-dependent FOV, camera bank, and collision vibration.
  try {
    cinematicCamera = new KanoCinematicCamera({
      renderer: webglRenderer,
      game,
      mobile,
      enabled: !query.has('disableCameraFX'),
    });
  } catch (error) {
    cinematicCamera = null;

    console.warn(
      '[Kano Life] cinematic camera effects unavailable',
      error,
    );
  }

  // Adaptive resolution for mobile and mid-range hardware.
  try {
    adaptiveQuality = new KanoAdaptiveQuality({
      renderer: webglRenderer,
      mobile,
      enabled: !query.has('fixedQuality'),
    });
  } catch (error) {
    adaptiveQuality = null;

    console.warn(
      '[Kano Life] adaptive render quality unavailable',
      error,
    );
  }

  // Time-of-day lighting, rain, and harmattan dust.
  try {
    atmosphere = new KanoAtmosphere({
      renderer: webglRenderer,
      game,
      mobile,
      enabled: !query.has('disableAtmosphere'),
    });
  } catch (error) {
    atmosphere = null;

    console.warn(
      '[Kano Life] weather/day-night atmosphere unavailable',
      error,
    );
  }

  // GLB skeletal animation support.
  try {
    animationManager = new KanoGLBAnimationManager({
      renderer: webglRenderer,
      models,
      mobile,
      debug: debugMode || query.has('debugPerf'),
    });
  } catch (error) {
    animationManager = null;

    console.warn(
      '[Kano Life] GLB animation manager unavailable',
      error,
    );
  }

  // Kano markets, pedestrians, passenger movement, and life scenes.
  try {
    sceneUpgrade = new KanoSceneUpgrade({
      renderer: webglRenderer,
      game,
      mobile,
    });
  } catch (error) {
    sceneUpgrade = null;

    console.warn(
      '[Kano Life] market/crowd/scene animations unavailable',
      error,
    );
  }

  // Coins, exhaust smoke, and renderer-compatible visual effects.
  try {
    visualEffects = new KanoVisualEffects({
      renderer: webglRenderer,
      game,
      container,
      mobile,
    });
  } catch (error) {
    visualEffects = null;

    console.warn(
      '[Kano Life] smoke/coin effects unavailable',
      error,
    );
  }

  // Visual-only chassis and suspension effects.
  try {
    kekeDynamics = new KekeDynamics({
      renderer: webglRenderer,
      mobile,
    });
  } catch (error) {
    kekeDynamics = null;

    console.warn(
      '[Kano Life] optional Keke dynamics unavailable',
      error,
    );
  }

  setRenderMode('3D');
  setRenderBadge('3D MODE · WEBGL');

  console.info('[Kano Life] WebGL renderer ready');

  // Optional narrative/profile/hawker features.
  try {
    productionBridge = new KanoProductionBridge({
      renderer: webglRenderer,
      game,
      uiRoot: container,
      mobile,
    });
  } catch (error) {
    productionBridge = null;

    console.warn(
      '[Kano Life] optional production systems unavailable',
      error,
    );
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
      // Do not install assets into a replaced renderer.
      if (
        pageClosing ||
        generation !== rendererGeneration ||
        renderer !== webglRenderer ||
        renderMode !== '3D'
      ) {
        return;
      }

      const playerModel = models.getInstance('keke');

      if (playerModel) {
        webglRenderer.applyModel(
          'keke',
          playerModel,
        );
      } else {
        console.warn(
          '[ModelManager] keke GLB unavailable; ' +
          'keeping the procedural fallback visible',
        );
      }
    })
    .catch((error) => {
      console.warn(
        '[ModelManager] essential asset preload issue',
        error,
      );
    });

  // Load remaining assets in batches on mobile.
  if (mobile) {
    const mobileAssetBatches = [
      [
        'flyover',
        'building',
        'passengerWoman',
        'passengerMan',
      ],
      [
        'karota',
        'ambulance',
        'truck',
        'bus',
      ],
      [
        'passengerVIP',
        'security',
        'pedestrian',
        'pedestrianWoman',
      ],
      [
        'industrialBuilding',
        'roadlight',
        'cone',
        'dirtmound',
      ],
      [
        'bench',
        'busStop',
        'trafficLight',
        'stopSign',
        'marketStall',
      ],
    ];

    void essentialLoad.then(async () => {
      for (const keys of mobileAssetBatches) {
        if (
          pageClosing ||
          generation !== rendererGeneration ||
          renderer !== webglRenderer ||
          renderMode !== '3D'
        ) {
          return;
        }

        try {
          await models.preload(keys);
        } catch (error) {
          console.warn(
            '[ModelManager] deferred mobile asset batch failed',
            error,
          );
        }

        await new Promise((resolve) => {
          window.setTimeout(resolve, 250);
        });
      }
    });
  }
}

// ============================================================
// WORKSHOP PANEL CLEANUP
// ============================================================

function disposeWorkshopPanel() {
  try {
    workshopPanel?.dispose?.();
  } catch (error) {
    console.warn(
      '[Kano Life] workshop panel cleanup warning',
      error,
    );
  }

  workshopPanel = null;

  try {
    delete window.kanoWorkshopPanel;
  } catch {
    // The page may be closing.
  }
}

// ============================================================
// GAME BOOTSTRAP
// ============================================================

function boot() {
  // FPS/frame-time telemetry is hidden unless debugPerf is enabled.
  try {
    performanceMonitor = new KanoPerformanceMonitor({
      container,
      enabled: query.has('debugPerf'),
    });
  } catch (error) {
    performanceMonitor = null;

    console.warn(
      '[Kano Life] performance monitor unavailable',
      error,
    );
  }

  // Server-backed presence count.
  try {
    liveUserCounter = new LiveUserCounter({
      container,
    }).start();
  } catch (error) {
    liveUserCounter = null;

    console.warn(
      '[Kano Life] live-user counter unavailable',
      error,
    );
  }

  // Developer-only model audit.
  if (debugMode) {
    try {
      createModelAuditPanel();
    } catch (error) {
      console.warn(
        '[Kano Life] model audit panel unavailable',
        error,
      );
    }
  }

  // Create the game before systems that depend on it.
  game = new Game(ui, audio, { mobile });

  ui.bind?.(game);

  // ----------------------------------------------------------
  // WORKSHOP, REPAIRS, AND ROADSIDE RECOVERY
  // This DOM panel persists when switching between 2D and 3D.
  // ----------------------------------------------------------

  try {
    workshopPanel = new KanoWorkshopPanel({
      game,
      container,
      mobile,
    });

    window.kanoWorkshopPanel = workshopPanel;

    console.info(
      '[Kano Life] Workshop and recovery panel ready.',
    );
  } catch (error) {
    workshopPanel = null;

    try {
      delete window.kanoWorkshopPanel;
    } catch {
      // Ignore unavailable global cleanup.
    }

    console.warn(
      '[Kano Life] Workshop panel could not start:',
      error,
    );
  }

  // Passenger/fuel interaction compatibility layer.
  try {
    interactionReliability = new KanoInteractionReliability({
      game,
      container,
      getRenderer: () => renderer,
      getSceneUpgrade: () => sceneUpgrade,
      debug: query.has('debugScene'),
    });
  } catch (error) {
    interactionReliability = null;

    console.warn(
      '[Kano Life] interaction reliability layer unavailable',
      error,
    );
  }

  // Lane-aware traffic behaviours.
  try {
    trafficDirector = new KanoTrafficDirector({
      game,
      mobile,
    });
  } catch (error) {
    trafficDirector = null;

    console.warn(
      '[Kano Life] traffic AI upgrade unavailable',
      error,
    );
  }

  // Keyboard and touchscreen controls.
  controls = new Controls(container, {
    lane: (direction) => game.lane(direction),

    gas: (value) => game.gas(value),

    brake: (value) => game.brake(value),

    horn: () => {
      game.horn();
      productionBridge?.onHorn?.();
    },

    menu: () => game.menu(),

    // R and the on-screen reverse button share one handler.
    reverse: () => {
      if (typeof game.toggleReverse === 'function') {
        return game.toggleReverse();
      }

      if (typeof game.setReverse === 'function') {
        return game.setReverse(
          !Boolean(game.s?.reverse),
        );
      }

      ui.toast(
        'Reverse gear is not available in this game build.',
      );

      return false;
    },
  });

  // ----------------------------------------------------------
  // RENDERING QUALITY
  // ----------------------------------------------------------

  const saved2D = save?.settings?.quality === '2d';

  window.addEventListener(
    'kano:quality-change',
    (event) => {
      const quality =
        event.detail?.quality || 'auto';

      if (force2d || force3d || pageClosing) {
        return;
      }

      keep3D = quality === '3d';

      if (quality === '2d') {
        start2D(
          '2D MODE · SELECTED IN SETTINGS',
        );

        return;
      }

      start3D().catch((error) => {
        if (pageClosing) return;

        console.warn(
          '[Kano Life] selected 3D mode unavailable; ' +
          'using Canvas 2D',
          error,
        );

        start2D(
          '2D MODE · WEBGL UNAVAILABLE',
        );
      });
    },
  );

  if (force2d || (saved2D && !force3d)) {
    start2D(
      force2d
        ? '2D MODE · FORCED BY URL'
        : '2D MODE · SAVED SETTING',
    );
  } else {
    start3D().catch((error) => {
      if (pageClosing) return;

      console.warn(
        '[Kano Life] 3D unavailable; starting Canvas 2D',
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
    if (pageClosing) return;

    [0, 140, 320, 620].forEach((delay) => {
      window.setTimeout(() => {
        if (pageClosing) return;

        try {
          renderer?.resize?.();
        } catch (error) {
          console.warn(
            '[Kano Life] deferred resize failed',
            error,
          );
        }
      }, delay);
    });
  };

  window.addEventListener(
    'resize',
    resizeWithMobilePasses,
    { passive: true },
  );

  window.addEventListener(
    'orientationchange',
    resizeWithMobilePasses,
    { passive: true },
  );

  window.visualViewport?.addEventListener(
    'resize',
    resizeWithMobilePasses,
    { passive: true },
  );

  document.addEventListener(
    'visibilitychange',
    () => {
      lastFrame = performance.now();
    },
  );

  if (force3d || keep3D) {
    console.info(
      '[Kano Life] 3D preference active; ' +
      'automatic low-FPS fallback disabled',
    );
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
  if (pageClosing) return;

  performanceMonitor?.beginFrame?.(now);

  const dt = Math.min(
    Math.max((now - lastFrame) / 1000, 0),
    0.05,
  );

  lastFrame = now;
  fpsFrames += 1;

  if (now - fpsWindowStart >= 1000) {
    const fps =
      (fpsFrames * 1000) /
      Math.max(1, now - fpsWindowStart);

    fpsFrames = 0;
    fpsWindowStart = now;

    // Sustained low-FPS fallback on mobile only.
    if (
      mobile &&
      renderMode === '3D' &&
      !keep3D &&
      !fallbackStarted
    ) {
      if (fps < 10) {
        if (!lowFpsSince) {
          lowFpsSince = now;
        }

        if (now - lowFpsSince >= 8000) {
          fallbackStarted = true;

          start2D(
            '2D MODE · LOW FPS FALLBACK',
          );
        }
      } else {
        lowFpsSince = 0;
      }
    }
  }

  try {
    // Traffic selects lane and speed before collision processing.
    trafficDirector?.update?.(dt);

    game?.tick(dt);

    interactionReliability?.update?.(
      dt,
      game?.s || {},
    );

    // Visual-only camera, weather, and adaptive resolution.
    if (renderMode === '3D') {
      atmosphere?.update?.(
        dt,
        game?.s || {},
        game?.state,
      );

      cinematicCamera?.update?.(
        dt,
        game?.s || {},
      );

      adaptiveQuality?.update?.(
        now,
        renderMode,
        game?.state,
      );
    }

    // Markets, pedestrians, passenger movement, and life scenes.
    if (
      renderMode === '3D' &&
      sceneUpgrade
    ) {
      sceneUpgrade.update(
        dt,
        game?.s || {},
      );
    }

    // Visual-only Keke chassis, suspension, and wheel effects.
    if (
      renderMode === '3D' &&
      kekeDynamics
    ) {
      kekeDynamics.update(
        dt,
        game?.s || {},
      );
    }

    // Optional narrative and hawker features.
    productionBridge?.update?.(dt);

    // Coins, smoke, and visual effects.
    visualEffects?.update?.(
      dt,
      game?.s || {},
    );

    // Update skeletal animation before rendering.
    animationManager?.update?.(
      dt,
      game?.s || {},
    );

    renderer?.draw?.(
      game?.s,
      dt,
    );

    visualEffects?.render2DOverlay?.(
      game?.s || {},
    );

    runtimeFailureCount = 0;
  } catch (error) {
    runtimeFailureCount += 1;

    console.error(
      '[Kano Life] frame update failed',
      error,
    );

    if (renderMode === '3D') {
      start2D(
        '2D MODE · RECOVERED AFTER ERROR',
      );
    }

    if (
      runtimeFailureCount >= 3 &&
      game?.state === 'PLAY'
    ) {
      game.state = 'MENU';

      if (game.s) {
        game.s.gas = false;
        game.s.brake = false;
        game.s.signedSpeed = 0;
      }

      ui.show('menu-screen');

      ui.toast(
        'Game paused after a runtime error. ' +
        'Check the console before continuing.',
      );
    }
  } finally {
    performanceMonitor?.endFrame?.(
      performance.now(),
      renderMode,
      renderer,
    );

    if (!pageClosing) {
      requestAnimationFrame(frame);
    }
  }
}

// ============================================================
// PAGE CLEANUP
// ============================================================

window.addEventListener(
  'pagehide',
  () => {
    if (pageClosing) return;

    pageClosing = true;

    // Invalidate pending asynchronous renderer and asset work.
    rendererGeneration += 1;

    // Dispose the persistent DOM workshop independently of the renderer.
    disposeWorkshopPanel();

    try {
      controls?.dispose?.();
    } catch {
      // The page is closing.
    }

    try {
      interactionReliability?.dispose?.();
    } catch {
      // The page is closing.
    }

    try {
      trafficDirector?.dispose?.();
    } catch {
      // The page is closing.
    }

    try {
      liveUserCounter?.dispose?.();
    } catch {
      // The page is closing.
    }

    try {
      performanceMonitor?.dispose?.();
    } catch {
      // The page is closing.
    }

    try {
      disposeRenderer();
    } catch {
      // The page is closing.
    }
  },
  { once: true },
);

// ============================================================
// START
// ============================================================

boot();