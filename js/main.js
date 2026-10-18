import { Game } from './game.js';
import { UI } from './ui.js';
import { Controls } from './controls.js';
import { AudioManager } from './audio.js';
import { Renderer2D } from './renderer2d.js';
import { Renderer3D } from './renderer3d.js';
import { ModelManager } from './ModelManager.js';
import { createModelAuditPanel } from './ModelAuditPanel.js';
import { save } from './storage.js';

const container = document.getElementById('game-container');

let canvas = document.getElementById('game-canvas');

const query = new URLSearchParams(window.location.search);
const force2d = query.has('force2d');
const force3d = query.has('force3d');

const mobile = window.matchMedia(
  '(max-width: 760px), (pointer: coarse)',
).matches;

const ui = new UI();
const audio = new AudioManager();

let renderer = null;

window.addEventListener('kano:life-scene', (event) => {
  renderer?.setLifeScene?.(event.detail?.scene || 'road');
});

let renderMode = '2D';
let game = null;
let lastFrame = performance.now();
let fpsFrames = 0;
let fpsWindowStart = performance.now();
let lowFpsSince = 0;
let fallbackStarted = false;
let runtimeFailureCount = 0;

let keep3D = force3d || save?.settings?.quality === '3d';

// ============================================================
// RENDERER STATUS
// ============================================================

function setRenderBadge(text) {
  const badge = document.getElementById('render-badge');

  if (badge) {
    badge.textContent = text;
  }
}

// ============================================================
// CANVAS REPLACEMENT
//
// A WebGL canvas must not be reused for Canvas 2D after context
// creation fails. Replace it with a fresh canvas instead.
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

  canvas?.replaceWith(replacement);

  canvas = replacement;

  return replacement;
}

// ============================================================
// CANVAS 2D FALLBACK
// ============================================================

function start2D(reason = '2D MODE · ROAD VISIBLE') {
  try {
    renderer?.dispose?.();
  } catch (error) {
    console.warn(
      '[Kano Life] renderer disposal warning',
      error,
    );
  }

  const newCanvas = freshCanvas();

  renderer = new Renderer2D(newCanvas);
  renderer.resize();

  renderMode = '2D';

  window.__KANO_RENDER_MODE__ = renderMode;

  setRenderBadge(reason);

  console.info(
    '[Kano Life] Canvas 2D fallback active; road renderer ready',
  );
}

// ============================================================
// WEBGL CONTEXT RECOVERY
// ============================================================

function attachWebGLRecovery(targetCanvas) {
  targetCanvas.addEventListener(
    'webglcontextlost',
    (event) => {
      event.preventDefault();

      console.error(
        '[Kano Life] WebGL context lost; switching to fresh Canvas 2D',
      );

      if (renderMode === '3D') {
        start2D('2D MODE · WEBGL CONTEXT LOST');
      }
    },
    { once: true },
  );
}

// ============================================================
// THREE.JS RENDERER
// ============================================================

async function start3D() {
  try {
    renderer?.dispose?.();
  } catch (error) {
    console.warn(
      '[Kano Life] renderer disposal warning',
      error,
    );
  }

  lowFpsSince = 0;
  fallbackStarted = false;

  // Probe a temporary canvas. Never reuse a WebGL canvas for Canvas 2D.
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
    // Optional extension.
  }

  const models = new ModelManager();
  const activeCanvas = freshCanvas();

  attachWebGLRecovery(activeCanvas);

  const webglRenderer = new Renderer3D(
    activeCanvas,
    models,
    { mobile },
  );

  renderer = webglRenderer;

  renderer.resize();

  renderMode = '3D';

  window.__KANO_RENDER_MODE__ = renderMode;

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

  const essentialLoad = models
    .preload(essentials)
    .then(() => {
      if (
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
          '[ModelManager] keke GLB unavailable; stylised three-wheel fallback remains visible',
        );
      }
    })
    .catch((error) => {
      console.warn(
        '[ModelManager] preload issue',
        error,
      );
    });

  // Load the remaining models in batches on mobile so the player
  // keke can appear before the whole environment finishes loading.
  if (mobile) {
    const mobileAssetBatches = [
      ['flyover', 'building', 'passengerWoman', 'passengerMan'],
      ['karota', 'ambulance', 'truck', 'bus'],
      ['passengerVIP', 'security', 'pedestrian', 'pedestrianWoman'],
      ['industrialBuilding', 'roadlight', 'cone', 'dirtmound'],
      ['bench', 'busStop', 'trafficLight', 'stopSign', 'marketStall'],
    ];

    essentialLoad
      .then(async () => {
        for (const keys of mobileAssetBatches) {
          if (
            renderer !== webglRenderer ||
            renderMode !== '3D'
          ) {
            return;
          }

          await models.preload(keys);

          await new Promise((resolve) => {
            window.setTimeout(resolve, 250);
          });
        }
      })
      .catch((error) => {
        console.warn(
          '[ModelManager] deferred mobile assets issue',
          error,
        );
      });
  }
}

// ============================================================
// GAME BOOTSTRAP
// ============================================================

function boot() {
  // Open the asset diagnostics panel through its floating button.
  // It does not control or replace gameplay systems.
  createModelAuditPanel();

  game = new Game(ui, audio, { mobile });

  // ----------------------------------------------------------
  // KEYBOARD AND TOUCH CONTROLS
  // ----------------------------------------------------------

  new Controls(container, {
    lane: (direction) => game.lane(direction),

    gas: (value) => game.gas(value),

    brake: (value) => game.brake(value),

    horn: () => game.horn(),

    menu: () => game.menu(),

    // REVERSE GEAR:
    // R toggles reverse and forward gear.
    // The game engine prevents unsafe gear changes at speed.
    reverse: () => game.toggleReverse(),
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
      } else {
        start3D().catch((error) => {
          console.warn(
            '[Kano Life] selected 3D mode unavailable; switching to Canvas 2D',
            error,
          );

          start2D('2D MODE · WEBGL UNAVAILABLE');
        });
      }
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
            '[Kano Life] resize deferred',
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

    // Automatically fall back on mobile only after sustained
    // poor performance. Forced 3D disables this behaviour.
    if (
      mobile &&
      renderMode === '3D' &&
      !keep3D
    ) {
      if (fps < 10) {
        if (!lowFpsSince) {
          lowFpsSince = now;
        }

        if (
          now - lowFpsSince >= 8000 &&
          !fallbackStarted
        ) {
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

      game.s.gas = false;
      game.s.brake = false;

      game.s.signedSpeed = 0;

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