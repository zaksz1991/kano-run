/**
 * Phone paint cost. Translucent HUD panels that blur the WebGL canvas behind
 * them (backdrop-filter) force the phone's GPU to re-blur the 3D view every
 * frame, which is very expensive on mid-range chips. On touch phones the blur,
 * filters and large soft shadows are switched off; the panels keep their dark
 * translucent look, so the layout and contrast are unchanged.
 */
if (typeof document !== 'undefined' && typeof window !== 'undefined') {
  const coarse = window.matchMedia?.('(pointer: coarse)')?.matches || /Android|iPhone|iPad|Mobile/i.test(navigator.userAgent || '');
  if (coarse && !document.getElementById('kano-phone-css-lite')) {
    const style = document.createElement('style');
    style.id = 'kano-phone-css-lite';
    style.textContent = `
      *, *::before, *::after { -webkit-backdrop-filter: none !important; backdrop-filter: none !important; }
      #game-container *, #hud *, .toast, #toast { filter: none !important; text-shadow: none !important; }
      #game-container .kano-interaction-hint, #hud .hud-top > *, #hud .mission-pill, #kano-day-hud, .kdh-root { background-color: rgba(8, 16, 28, .88) !important; }
    `;
    document.head.append(style);
  }
}
