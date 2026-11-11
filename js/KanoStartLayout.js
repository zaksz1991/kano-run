/**
 * Start-screen layout: the daily reward used to sit ~1200 px down the page where nobody scrolled to.
 * It now sits directly under START DRIVING as a gold reward banner (pulsing until claimed), the culture
 * challenges move below the main buttons, and the hero keke image is shrunk so START DRIVING is on the first screen.
 */
function layout() {
  const start = document.getElementById('start-btn');
  const daily = document.getElementById('daily-login-btn');
  if (!start || !daily) return;
  const actions = start.parentElement;
  if (actions && daily.parentElement !== actions) {
    const help = document.getElementById('help-btn');
    (help || start).insertAdjacentElement('afterend', daily);
  }
  daily.classList.add('kano-daily-hero');
  daily.classList.toggle('kano-daily-claimed', daily.disabled === true);
  const challenges = document.getElementById('kano-tribe-challenges-start');
  const career = document.getElementById('life-career-btn');
  if (challenges && career && challenges.previousElementSibling !== career && career.parentElement === challenges.parentElement) {
    career.insertAdjacentElement('afterend', challenges);
  }
}
if (typeof window !== 'undefined' && !window.__kanoStartLayout) {
  window.__kanoStartLayout = true;
  const run = () => { try { layout(); } catch (_) { /* optional */ } };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', run); else run();
  setInterval(run, 1200);
}
