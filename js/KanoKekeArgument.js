/**
 * Real recorded argument between a passenger and a keke driver (public/assets/models/audio/keke_argument.aac).
 * Plays now and then while a passenger is on board. If the file is not deployed it silently does nothing.
 */
const URL_AAC = '/assets/models/audio/keke_argument.aac';
let available = null;
let player = null;
let lastAt = 0;
let lastCount = 0;

async function check() {
  if (available !== null) return available;
  try {
    const r = await fetch(URL_AAC, { method: 'HEAD' });
    available = r.ok;
  } catch { available = false; }
  return available;
}

async function play(game) {
  if (!(await check())) return;
  if (player && !player.paused) return;
  player = player || new Audio(URL_AAC);
  player.volume = 0.85;
  player.currentTime = 0;
  player.setAttribute('playsinline', '');
  try {
    await player.play();
    game.ui?.toast?.('A passenger is arguing with you over the fare. Keep calm and drive.');
  } catch { /* autoplay blocked: ignore */ }
}

setInterval(() => {
  const g = window.kanoGame;
  if (!g?.s || g.state !== 'PLAY') { lastCount = 0; return; }
  const n = g.s.passengers?.length || 0;
  const now = Date.now();
  if (n > lastCount && n > 0 && now - lastAt > 150000 && Math.random() < 0.3) {
    lastAt = now;
    setTimeout(() => play(g), 2500);
  }
  lastCount = n;
  if (n === 0 && player && !player.paused) { try { player.pause(); } catch { /* ignore */ } }
}, 500);
