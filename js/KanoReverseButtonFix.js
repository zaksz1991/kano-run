/**
 * Reverse button reliability. If the REVERSE button is created after the input controller was wired
 * (module load order), it has no listener and taps do nothing. This capture-phase handler owns the
 * button's tap itself, so it always toggles gear exactly once whatever the load order.
 *   Tap REVERSE when stopped -> reverse gear; hold BRAKE to back up; tap again (or GAS) for forward.
 */
const game = () => window.kanoGame || window.__KANO_ACTIVE_GAME__ || window.__KANO_LIFE_GAME__;

function toggle() {
  const g = game();
  if (!g || typeof g.setReverse !== 'function') return;
  const want = !g.s?.reverse;
  if (g.state !== 'PLAY') return;
  if (g.s.event) { g.ui?.toast?.('Finish what is happening first, then select reverse'); return; }
  if (want && (g.s.speed || 0) > 3) {
    g.s.reverseWhenStopped = true;
    g.ui?.toast?.('Brake to a stop and the keke will select reverse');
    return;
  }
  g.setReverse(want);
}

let held = false;
let holdTimer = 0;

function release() {
  held = false;
  clearInterval(holdTimer);
  const g = game();
  if (!g?.s) return;
  g.s.reverseThrottle = false;
  g.s.gas = false;
  g.s.brake = !g.s.reverse; // forward gear: brake to a stop; reverse gear: letting go stops the backing up
  // go back to forward gear as soon as the keke is standing again
  g.s.reverseToForwardSoon = true;
}

function pressHold() {
  const g = game();
  if (!g?.s || g.state !== 'PLAY') return;
  if (g.s.event) { g.ui?.toast?.('Finish what is happening first'); return; }
  held = true;
  g.s.reverseToForwardSoon = false;
  clearInterval(holdTimer);
  holdTimer = setInterval(() => {
    const k = game();
    if (!held || !k?.s || k.state !== 'PLAY') { release(); return; }
    if (!k.s.reverse) {
      if ((k.s.speed || 0) > 3) { k.s.gas = false; k.s.brake = true; return; }
      k.s.brake = false;
      k.setReverse(true);
    }
    k.s.gas = false;
    k.s.brake = true; // in reverse gear the brake input is the reverse accelerator
    k.s.reverseThrottle = true;
  }, 40);
}

if (typeof document !== 'undefined' && !window.__kanoReverseFix) {
  window.__kanoReverseFix = true;
  document.addEventListener('pointerdown', (event) => {
    const target = event.target;
    if (!(target instanceof Element) || !target.closest('#reverse-btn')) return;
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    pressHold();
  }, true);
  // A real tap also fires `click`; other handlers on the button would toggle the gear a second time.
  for (const type of ['click', 'touchstart', 'touchend', 'mousedown', 'mouseup']) {
    document.addEventListener(type, (event) => {
      const target = event.target;
      if (target instanceof Element && target.closest('#reverse-btn')) { event.preventDefault(); event.stopImmediatePropagation(); }
    }, true);
  }
  for (const type of ['pointerup', 'pointercancel', 'pointerleave']) {
    document.addEventListener(type, (event) => {
      if (!held) return;
      const target = event.target;
      if (type === 'pointerleave' && !(target instanceof Element && target.closest('#reverse-btn'))) return;
      if (type !== 'pointerleave' || (target instanceof Element && target.closest('#reverse-btn'))) release();
    }, true);
  }
  setInterval(() => {
    const g = game();
    if (g?.s?.reverseToForwardSoon && g.state === 'PLAY') {
      if ((g.s.speed || 0) <= 1.5) { g.s.reverseToForwardSoon = false; g.s.brake = false; if (g.s.reverse) g.setReverse(false); }
    } else if (g?.s?.reverseToForwardSoon) g.s.reverseToForwardSoon = false;
    const btn = document.getElementById('reverse-btn');
    if (btn) {
      const want = 'HOLD TO BACK UP';
      if (btn.textContent !== want) btn.textContent = want;
    }
    const gasBtn = document.querySelector('#drive-controls [data-action="gas"]');
    if (gasBtn && gasBtn.textContent !== 'GAS') { gasBtn.textContent = 'GAS'; gasBtn.style.background = ''; gasBtn.style.color = ''; }
  }, 200);
}
