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

if (typeof document !== 'undefined' && !window.__kanoReverseFix) {
  window.__kanoReverseFix = true;
  document.addEventListener('pointerdown', (event) => {
    const target = event.target;
    if (!(target instanceof Element) || !target.closest('#reverse-btn')) return;
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    toggle();
  }, true);
  // Pending request: engage reverse the moment the keke has stopped.
  setInterval(() => {
    const g = game();
    if (g?.s?.reverseWhenStopped && g.state === 'PLAY' && !g.s.event && (g.s.speed || 0) <= 3) {
      g.s.reverseWhenStopped = false;
      g.setReverse(true);
    }
    if (g?.s?.reverseWhenStopped && g.state !== 'PLAY') g.s.reverseWhenStopped = false;
    // Make the pedal obvious: in reverse gear GAS (or BRAKE) backs the keke up.
    const gasBtn = document.querySelector('#drive-controls [data-action="gas"]');
    if (gasBtn) {
      const rev = Boolean(g?.s?.reverse);
      const want = rev ? 'BACK UP' : 'GAS';
      if (gasBtn.textContent !== want) gasBtn.textContent = want;
      gasBtn.style.background = rev ? '#f5c542' : '';
      gasBtn.style.color = rev ? '#172333' : '';
    }
  }, 200);
}
