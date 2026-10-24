/**
 * Kano Life — Phone Play Profile
 * -----------------------------
 * Goal: fast, clear world on phone — closer to laptop readability.
 *
 * Does:
 *  - Cap devicePixelRatio (default 1.25 mid / 1.0 low)
 *  - Prefer 30 FPS cadence on low/mid phones (less thermal throttle)
 *  - Disable shadows if renderer exposes them
 *  - Tighten fog far distance for clearer nearby road + cheaper fill
 *  - Expose window.kanoPhonePlay diagnostics
 *
 * Does NOT:
 *  - Touch life-sim systems
 *  - Rewrite GLBs
 *  - Add heavy postprocessing
 *
 * Load early: after three/renderer ready. Safe to load as module from index.
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

function installPhonePlayProfile(options = {}) {
  const t = options.tier || tier();
  const force = options.force === true || IS_PHONE;

  const profile = {
    tier: t,
    isPhone: IS_PHONE,
    // Resolution: laptop often 1.5–2 DPR; phones pay 4x+ pixels at 3 DPR
    maxPixelRatio: t === 'high' ? 1.5 : t === 'mid' ? 1.25 : 1.0,
    targetFps: t === 'high' ? 60 : 30,
    shadows: false,
    // Closer fog = sharper near road, less distant mush, fewer pixels shaded
    fogFar: t === 'high' ? 55 : t === 'mid' ? 42 : 34,
    fogNear: t === 'high' ? 12 : 10,
    antialias: t === 'high',
  };

  const applyToRenderer = (renderer, scene) => {
    if (!renderer) return;
    try {
      const dpr = Math.min(
        profile.maxPixelRatio,
        typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1
      );
      renderer.setPixelRatio(dpr);
    } catch (_) {}
    try {
      if (renderer.shadowMap) {
        renderer.shadowMap.enabled = profile.shadows;
      }
    } catch (_) {}
    try {
      if (scene?.fog && scene.fog.isFog) {
        scene.fog.near = profile.fogNear;
        scene.fog.far = profile.fogFar;
      }
    } catch (_) {}
  };

  // Hook when game exposes renderer later
  const boot = () => {
    const r3 =
      window.game?.renderer ||
      window.kanoRenderer ||
      window.__kanoRenderer3d ||
      null;
    const scene = r3?.scene || window.__kanoScene || null;
    const webgl = r3?.renderer || r3;
    if (webgl && webgl.setPixelRatio) applyToRenderer(webgl, scene || r3?.scene);

    // Adaptive quality: prefer a lower floor on phone
    try {
      const aq = window.kanoAdaptiveQuality || window.__kanoAdaptiveQuality;
      if (aq && typeof aq.setLevel === 'function' && force) {
        const level = t === 'low' ? 0 : t === 'mid' ? 1 : 2;
        aq.setLevel(level);
      }
    } catch (_) {}
  };

  // Apply now and after short delays (renderer may boot late)
  if (force) {
    boot();
    setTimeout(boot, 500);
    setTimeout(boot, 2000);
  }

  // Optional rAF throttle note for consumers
  window.kanoPhonePlay = {
    version: 1,
    profile,
    apply: applyToRenderer,
    reapply: boot,
    isPhone: IS_PHONE,
  };

  console.info(
    `[Kano Phone Play] ${force ? 'active' : 'desktop-skip'} tier=${profile.tier} dpr≤${profile.maxPixelRatio} fogFar=${profile.fogFar} fps~${profile.targetFps}`
  );
  return profile;
}

// Auto-install on phone
if (typeof window !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => installPhonePlayProfile());
  } else {
    installPhonePlayProfile();
  }
}

export { installPhonePlayProfile, IS_PHONE, tier };
