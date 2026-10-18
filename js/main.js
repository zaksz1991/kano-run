import { Game } from './game.js';
import { UI } from './ui.js';
import { Controls } from './controls.js';
import { AudioManager } from './audio.js';
import { Renderer2D } from './renderer2d.js';
import { Renderer3D } from './renderer3d.js';
import { ModelManager } from './ModelManager.js';
import { createModelAuditPanel } from './ModelAuditPanel.js';
import { save } from './storage.js';

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

const mobile = window.matchMedia(
  '(max-width: 760px), (pointer: coarse)',
).matches;

const ui = new UI();
const audio = new AudioManager();

let renderer = null;
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

let keep3D = Boolean(
  force3d || save?.settings?.quality === '3d',
);

// ============================================================
// RENDERER STATUS
// ============================================================

function setRenderBadge(text) {
  const badge = document.getElementById('render-badge');

  if (badge) {
    badge.textContent = text;
  }
}

function setRenderMode(mode) {
  renderMode = mode;
  window.__KANO_RENDER_MODE__ = mode;
}

// ============================================================
// DISPOSE CURRENT RENDERER
// ============================================================

function disposeRenderer() {
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
//
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
  // Invalidate outstanding 3D setup and asset callbacks.
  rendererGeneration += 1;

  if (renderMode !== '2D') {
    fallbackStarted = true;
  }

  // Avoid repeatedly rebuilding an existing Canvas 2D renderer.
  if (renderer instanceof Renderer2D && renderMode === '2D') {
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

function attachWebGLRecovery(targetCanvas, generation) {
  targetCanvas.addEventListener(
    'webglcontextlost',
    (event) => {
      event.preventDefault();

      // Ignore context-loss events from replaced renderers.
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
  const generation = ++rendererGeneration;

  lowFpsSince = 0;
  fallbackStarted = false;

  disposeRenderer();

  // Probe WebGL on a temporary canvas.
  // Never reuse the probe canvas for actual rendering.
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

  // Stop if a newer renderer request has superseded this one.
  if (generation !== rendererGeneration) {
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

  if (generation !== rendererGeneration) {
    try {
      webglRenderer.dispose?.();
    } catch {
      // This renderer became outdated during initialization.
    }

    return;
  }

  setRenderMode('3D');
  setRenderBadge('3D MODE · WEBGL');

  console.info('[Kano Life] WebGL renderer ready');

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

  // ----------------------------------------------------------
  // ESSENTIAL MODEL PRELOADING
  // ----------------------------------------------------------

  const essentialLoad = Promise.resolve()
    .then(() => models.preload(essentials))
    .then(() => {
      if (
        generation !== rendererGeneration ||
        renderer !== webglRenderer ||
        renderMode !== '3D'
      ) {
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
      console.warn(
        '[ModelManager] essential asset preload issue',
        error,
      );
    });

  // ----------------------------------------------------------
  // DEFERRED MOBILE MODEL LOADING
  // ----------------------------------------------------------

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
// GAME BOOTSTRAP
// ============================================================

function boot() {
  // Model diagnostics are optional and must not block gameplay.
  try {
    createModelAuditPanel();
  } catch (error) {
    console.warn(
      '[Kano Life] model audit panel unavailable',
      error,
    );
  }

  game = new Game(ui, audio, { mobile });

  // Ensure all UI event handlers are registered.
  // UI.bind() has an internal guard against duplicate binding.
  ui.bind?.(game);

  // ----------------------------------------------------------
  // KEYBOARD AND TOUCH CONTROLS
  // ----------------------------------------------------------

  controls = new Controls(container, {
    lane: (direction) => game.lane(direction),

    gas: (value) => game.gas(value),

    brake: (value) => game.brake(value),

    horn: () => game.horn(),

    menu: () => game.menu(),

    // R and the on-screen REVERSE button use the same handler.
    // UI must not register a second reverse-button click handler.
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
      const quality = event.detail?.quality || 'auto';

      if (force2d || force3d) {
        return;
      }

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
    },
  );

  // ----------------------------------------------------------
  // INITIAL RENDERER
  // ----------------------------------------------------------

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
      '[Kano Life] 3D preference active; automatic low-FPS fallback disabled',
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

    // Use Canvas 2D on mobile after sustained poor performance.
    // Explicitly forced or saved 3D mode disables auto-fallback.
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

          start2D('2D MODE · LOW FPS FALLBACK');
        }
      } else {
        lowFpsSince = 0;
      }
    }
  }

  try {
    game?.tick(dt);

    renderer?.draw?.(game?.s, dt);

    runtimeFailureCount = 0;
  } catch (error) {
    runtimeFailureCount += 1;

    console.error(
      '[Kano Life] frame update failed',
      error,
    );

    if (renderMode === '3D') {
      start2D('2D MODE · RECOVERED AFTER ERROR');
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
        'Game paused after a runtime error. Check the console before continuing.',
      );
    }
  } finally {
    requestAnimationFrame(frame);
  }
}

// ============================================================
// START
// ============================================================

boot();