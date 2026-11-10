/**
 * Go-slow: Kano's rush-hour jams.
 * During the morning and evening rush, traffic sometimes bunches up. For about half a minute every vehicle going
 * your way crawls at 8 to 16 km/h, and a chip tells you why the road is full. It clears by itself, and the
 * vehicles pick their old speeds back up. Time stuck in a go-slow still counts against passenger patience,
 * which makes rush-hour fares a real trade-off.
 */
import { periodAt } from './KanoDayCycle.js';

const game = () => window.kanoGame || window.__KANO_ACTIVE_GAME__;
let active = false;
let endsAt = 0;
let nextCheck = 0;
let chip = null;

function ensureChip() {
  if (chip && chip.isConnected) return chip;
  chip = document.createElement('div');
  chip.id = 'kano-goslow-chip';
  chip.style.cssText = 'position:fixed;left:50%;top:246px;transform:translateX(-50%);z-index:43;padding:6px 12px;'
    + 'border-radius:12px;font:800 12px/1.3 system-ui,sans-serif;color:#fff;background:rgba(150,70,10,.94);'
    + 'border:1px solid rgba(255,255,255,.4);pointer-events:none;display:none;white-space:nowrap';
  document.body.appendChild(chip);
  return chip;
}

function setSpeeds(g, on) {
  const list = g.s.traffic || [];
  for (let i = 0; i < list.length; i += 1) {
    const v = list[i];
    if (!v || v.direction === -1) continue;
    if (on) {
      if (v.__goSlowOriginal === undefined) v.__goSlowOriginal = v.speedKmh;
      v.speedKmh = Math.min(v.speedKmh, 8 + ((i * 7) % 9));
    } else if (v.__goSlowOriginal !== undefined) {
      v.speedKmh = v.__goSlowOriginal;
      v.__goSlowOriginal = undefined;
    }
  }
}

if (typeof window !== 'undefined' && !window.__kanoGoSlow) {
  window.__kanoGoSlow = true;
  setInterval(() => {
    try {
      const g = game();
      const st = g?.dayCycle?.state;
      const el = ensureChip();
      const now = Date.now();
      if (!g || g.state !== 'PLAY' || !st || g.mode === 'timeAttack') { if (active) { setSpeeds(g, false); active = false; } el.style.display = 'none'; return; }
      const period = periodAt(st.minuteOfDay).id;
      const rush = period === 'morning' || period === 'asr';
      if (!active && rush && now >= nextCheck) {
        nextCheck = now + 25000;
        if (Math.random() < 0.45) {
          active = true;
          endsAt = now + 30000;
          try { g.ui?.toast?.('Go-slow ahead! Traffic is bumper to bumper.'); } catch (_) { /* optional */ }
        }
      }
      if (active && (now >= endsAt || !rush)) { active = false; setSpeeds(g, false); }
      if (active) {
        setSpeeds(g, true);
        el.style.display = 'block';
        el.textContent = `🚦 GO-SLOW · rush-hour traffic · ${Math.max(0, Math.round((endsAt - now) / 1000))}s`;
      } else {
        el.style.display = 'none';
      }
    } catch (_) { /* optional */ }
  }, 150);
}
