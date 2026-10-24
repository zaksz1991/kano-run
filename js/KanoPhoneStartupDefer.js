/**
 * Kano Life — Phone startup defer
 * -------------------------------
 * Problem: dozens of life/upgrade modules load before the first drive frame.
 * Effect on phone: long white/black screen, jank, thermal spike before play.
 *
 * This module does NOT remove features permanently. It:
 *  1) Records heavy module URLs if present on window.__KANO_DEFER_SCRIPTS
 *  2) Loads them after first PLAY state or after idle callback
 *
 * Usage in index.html (recommended pattern below in PHONE_INDEX_SNIPPET.html):
 *  - Keep: three, main, game, renderer, controls, ui, config, storage
 *  - Move life/upgrade tags into window.__KANO_DEFER_SCRIPTS = ['/js/...']
 *  - Include this file last among critical scripts
 */
const IS_PHONE =
  typeof navigator !== 'undefined' &&
  (/Mobi|Android|iPhone|iPad|iPod/i.test(navigator.userAgent) ||
    (navigator.maxTouchPoints > 1 && Math.min(screen.width, screen.height) < 600));

const loaded = new Set();
let started = false;

async function loadScript(src) {
  if (!src || loaded.has(src)) return;
  loaded.add(src);
  // Prefer dynamic import for modules
  try {
    await import(/* webpackIgnore: true */ src);
    console.info('[PhoneStartup] loaded', src);
    return;
  } catch (e) {
    // fallback classic script
  }
  await new Promise((resolve, reject) => {
    const el = document.createElement('script');
    el.type = 'module';
    el.src = src;
    el.onload = () => resolve();
    el.onerror = () => reject(new Error('fail ' + src));
    document.head.appendChild(el);
  });
  console.info('[PhoneStartup] script tag loaded', src);
}

async function loadDeferred(reason) {
  if (started) return;
  started = true;
  const list = Array.isArray(window.__KANO_DEFER_SCRIPTS)
    ? window.__KANO_DEFER_SCRIPTS
    : [];
  if (!list.length) {
    console.info('[PhoneStartup] no deferred scripts configured');
    return;
  }
  console.info(`[PhoneStartup] loading ${list.length} deferred modules (${reason})`);
  // Serial on low phones to avoid parse storm; parallel on high
  const cores = navigator.hardwareConcurrency || 4;
  if (cores <= 4) {
    for (const src of list) {
      try {
        await loadScript(src);
      } catch (e) {
        console.warn('[PhoneStartup] skip', src, e);
      }
    }
  } else {
    await Promise.all(
      list.map((src) => loadScript(src).catch((e) => console.warn('[PhoneStartup] skip', src, e)))
    );
  }
  window.dispatchEvent(new CustomEvent('kano-deferred-loaded'));
}

function install() {
  // After first drive
  const bootHook = () => {
    const Game = window.Game || null;
    // Poll lightly for PLAY without permanent rAF
    let n = 0;
    const id = setInterval(() => {
      n += 1;
      try {
        const g = window.game || window.__kanoGame;
        if (g?.state === 'PLAY' || g?.state === 'playing') {
          clearInterval(id);
          loadDeferred('play');
        }
      } catch (_) {}
      if (n > 120) clearInterval(id); // ~60s max
    }, 500);
  };

  if (IS_PHONE) {
    // Idle path: load after first paint if browser is free
    const idle = window.requestIdleCallback || ((cb) => setTimeout(cb, 2500));
    idle(() => loadDeferred('idle'), { timeout: 6000 });
    bootHook();
  } else {
    // Desktop: load deferred sooner so life features still appear
    setTimeout(() => loadDeferred('desktop'), 800);
  }

  window.kanoPhoneStartup = {
    version: 1,
    loadNow: () => loadDeferred('manual'),
    isPhone: IS_PHONE,
    loaded: () => [...loaded],
  };

  console.info(
    `[PhoneStartup] defer armed phone=${IS_PHONE} scripts=${(window.__KANO_DEFER_SCRIPTS || []).length}`
  );
}

install();
export { install, loadDeferred };
