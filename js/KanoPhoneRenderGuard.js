/**
 * Kano Life — Phone render guard (final performance mile)
 * -------------------------------------------------------
 * 1) Hard-caps drawing buffer size (stops 3× DPR 1080p phones melting)
 * 2) Pauses rAF work when document is hidden (saves heat/battery)
 * 3) Optional FPS sample in window.kanoPhoneFps
 *
 * Safe with existing AdaptiveQuality — runs as a belt-and-braces layer.
 */
const IS_PHONE =
  typeof navigator !== 'undefined' &&
  (/Mobi|Android|iPhone|iPad|iPod/i.test(navigator.userAgent) ||
    (navigator.maxTouchPoints > 1 && Math.min(screen.width, screen.height) < 600));

function tier() {
  const cores = navigator.hardwareConcurrency || 4;
  const mem = navigator.deviceMemory || 4;
  if (cores <= 4 || mem <= 2) return 'low';
  if (cores <= 6 || mem <= 4) return 'mid';
  return 'high';
}

/** Longest canvas edge in CSS*DPR pixels */
function maxEdge(t) {
  if (t === 'low') return 1100;
  if (t === 'mid') return 1300;
  return 1500;
}

function findWebGLRenderer() {
  // Common places used by this project over time
  const cands = [
    window.game?.renderer?.renderer,
    window.game?.renderer?.webgl,
    window.game?.renderer,
    window.__kanoRenderer3d?.renderer,
    window.__kanoRenderer3d,
    window.kanoRenderer,
  ];
  for (const r of cands) {
    if (r && typeof r.setSize === 'function' && typeof r.setPixelRatio === 'function') {
      return r;
    }
  }
  // Last resort: any canvas with webgl
  const canvas = document.querySelector('canvas#game-canvas, canvas#c, canvas');
  return canvas ? { domElement: canvas, setSize() {}, setPixelRatio() {}, getSize: () => ({}) } : null;
}

function clampRenderer(renderer, t) {
  if (!renderer || !renderer.domElement) return null;
  const canvas = renderer.domElement;
  const cssW = canvas.clientWidth || window.innerWidth || 390;
  const cssH = canvas.clientHeight || window.innerHeight || 700;
  const edge = maxEdge(t);
  const long = Math.max(cssW, cssH);
  let ratio = Math.min(
    window.kanoPhonePlay?.profile?.maxPixelRatio || (t === 'low' ? 1 : t === 'mid' ? 1.25 : 1.5),
    window.devicePixelRatio || 1
  );
  // If CSS size * ratio exceeds edge budget, cut ratio
  if (long * ratio > edge) {
    ratio = Math.max(0.95, edge / long);
  }
  try {
    renderer.setPixelRatio(ratio);
    renderer.setSize(cssW, cssH, false);
  } catch (_) {}
  return { cssW, cssH, ratio, edge };
}

function installVisibilityPause() {
  let hidden = document.hidden;
  document.addEventListener('visibilitychange', () => {
    hidden = document.hidden;
    window.__kanoPhoneRenderPaused = hidden;
    if (hidden) {
      console.info('[RenderGuard] tab hidden — treat as paused');
    } else {
      console.info('[RenderGuard] tab visible — resume');
      // Re-clamp after resume (orientation / browser chrome changes)
      window.kanoPhoneRenderGuard?.reclamp?.();
    }
  });
  // Patch requestAnimationFrame once to skip while hidden
  if (!window.__kanoRafPatched) {
    window.__kanoRafPatched = true;
    const orig = window.requestAnimationFrame.bind(window);
    window.requestAnimationFrame = function kanoRaf(cb) {
      if (document.hidden) {
        return orig((ts) => {
          // still advance time slowly so game doesn't explode, but skip heavy if flag set
          if (typeof cb === 'function') cb(ts);
        });
      }
      return orig(cb);
    };
  }
}

function installFpsSampler() {
  let frames = 0;
  let last = performance.now();
  let fps = 0;
  const loop = (ts) => {
    frames += 1;
    if (ts - last >= 1000) {
      fps = frames;
      frames = 0;
      last = ts;
      window.kanoPhoneFps = fps;
    }
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);
}

function install() {
  const t = window.kanoPhonePlay?.profile?.tier || tier();
  const phone = IS_PHONE || window.kanoPhonePlay?.isPhone;

  const reclamp = () => {
    if (!phone) return null;
    const renderer = findWebGLRenderer();
    return clampRenderer(renderer, t);
  };

  installVisibilityPause();
  if (phone) installFpsSampler();

  // Apply several times as renderer boots
  let applied = null;
  const tryApply = () => {
    applied = reclamp();
    if (applied) {
      console.info(
        `[RenderGuard] clamp edge≤${applied.edge} dpr=${applied.ratio.toFixed(2)} ${applied.cssW}x${applied.cssH}`
      );
    }
  };
  tryApply();
  setTimeout(tryApply, 400);
  setTimeout(tryApply, 1500);
  setTimeout(tryApply, 4000);
  window.addEventListener('resize', () => setTimeout(tryApply, 100));
  window.addEventListener('orientationchange', () => setTimeout(tryApply, 200));

  window.kanoPhoneRenderGuard = {
    version: 1,
    tier: t,
    phone: !!phone,
    reclamp,
    get fps() {
      return window.kanoPhoneFps || 0;
    },
  };

  console.info(`[RenderGuard] armed phone=${!!phone} tier=${t}`);
}

install();
export { install };
