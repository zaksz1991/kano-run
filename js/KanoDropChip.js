/**
 * Always-visible "where am I going" chip. The passenger names the exact drop-off place
 * when boarding; this keeps it on screen, with the nearest matching drop marker's
 * distance, so the mission is specific (pick up here, drop at THAT place).
 */
import { Game } from './game.js';

const PATCH = Symbol.for('kano.life.dropChip.v1');
let chip = null;
let lastText = '';
let lastAt = 0;

function ensure() {
  if (chip || typeof document === 'undefined') return chip;
  chip = document.createElement('div');
  chip.id = 'kano-drop-chip';
  chip.style.cssText = 'position:fixed;left:10px;top:188px;z-index:21;max-width:44vw;padding:6px 9px;border-radius:10px;background:rgba(10,24,36,.88);border:1px solid #f5c542;color:#fff;font:800 11px/1.3 system-ui,sans-serif;pointer-events:none;display:none';
  document.body.appendChild(chip);
  return chip;
}

export function dropChipText(passengers, zones) {
  if (!passengers?.length) {
    const next = (zones || []).filter((z) => z.type === 'pickup').sort((a, b) => a.depth - b.depth)[0];
    return next ? `Next pickup: ${next.stopName || 'roadside'} → ${next.dest}` : '';
  }
  const first = passengers[0];
  const zone = (zones || []).filter((z) => z.type === 'drop' && z.dest === first.dest).sort((a, b) => a.depth - b.depth)[0];
  const metres = zone && Number.isFinite(zone.depth) ? Math.max(0, Math.round(zone.depth * 88)) : null;
  const extra = passengers.length > 1 ? ` (+${passengers.length - 1} more)` : '';
  return `DROP ${first.name || 'passenger'} at ${first.dest}${metres !== null ? ` · ${metres} m` : ''}${extra}`;
}

if (!Game.prototype[PATCH]) {
  const originalTick = Game.prototype.tick;
  Game.prototype.tick = function tickWithDropChip(dt, ...rest) {
    const result = originalTick.call(this, dt, ...rest);
    const now = performance.now();
    if (now - lastAt > 400) {
      lastAt = now;
      const el = ensure();
      if (el) {
        const text = this.state === 'PLAY' ? dropChipText(this.s?.passengers, this.s?.zones) : '';
        if (text !== lastText) {
          lastText = text;
          el.textContent = text;
          el.style.display = text ? 'block' : 'none';
        }
      }
    }
    return result;
  };
  Object.defineProperty(Game.prototype, PATCH, { value: true });
}
