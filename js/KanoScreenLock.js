/**
 * Fixed game screen. Stops pinch-zoom, double-tap zoom and the sideways page drift
 * that pushed the HUD off-screen on phones, and keeps the layout size stable when the
 * browser toolbar slides in or out.
 */
const STYLE_ID = 'kano-screen-lock';

function install() {
  if (typeof document === 'undefined' || document.getElementById(STYLE_ID)) return;

  const viewport = document.querySelector('meta[name="viewport"]');
  const content = 'width=device-width, initial-scale=1, minimum-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover, interactive-widget=resizes-visual';
  if (viewport) viewport.setAttribute('content', content);

  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = `
    html, body { position: fixed; inset: 0; width: 100%; height: 100%; overflow: hidden; overscroll-behavior: none; touch-action: manipulation; -webkit-text-size-adjust: 100%; text-size-adjust: 100%; }
    #app, #game-container { position: fixed; inset: 0; width: 100%; height: 100%; max-width: 100vw; overflow: hidden; }
    #game-canvas { position: absolute; inset: 0; width: 100% !important; height: 100% !important; }
    .toast, #drive-hint, [class*="coach"], [id*="coach"], [class*="hint"] { max-width: calc(100vw - 20px); white-space: normal; overflow-wrap: anywhere; box-sizing: border-box; }
    .screen { max-width: 100vw; }
  `;
  document.head.appendChild(style);

  const stop = (event) => event.preventDefault();
  for (const name of ['gesturestart', 'gesturechange', 'gestureend']) document.addEventListener(name, stop, { passive: false });
  document.addEventListener('touchmove', (event) => { if (event.touches && event.touches.length > 1) event.preventDefault(); }, { passive: false });
  let lastTap = 0;
  document.addEventListener('touchend', (event) => {
    const now = Date.now();
    if (now - lastTap < 320 && !/^(INPUT|SELECT|TEXTAREA)$/.test(event.target?.tagName || '')) event.preventDefault();
    lastTap = now;
  }, { passive: false });

  const reset = () => {
    for (const element of [document.documentElement, document.body, document.getElementById('app'), document.getElementById('game-container')]) {
      if (element && (element.scrollLeft || element.scrollTop)) { element.scrollLeft = 0; element.scrollTop = 0; }
    }
    if (window.scrollX || window.scrollY) window.scrollTo(0, 0);
  };
  for (const target of [window, document.getElementById('game-container')]) target?.addEventListener('scroll', reset, { passive: true });
  window.addEventListener('resize', reset, { passive: true });
  window.addEventListener('orientationchange', reset, { passive: true });
  window.setInterval(reset, 1500);
}

if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', install, { once: true });
  else install();
}
