/**
 * Money pressure you can see: when the tank runs low, a small chip shows what a full tank costs
 * against the run's cash, and turns red when the driver cannot afford it. Display only.
 */
import { fuelPlan } from './KanoFuelQueueBridge.js';

if (typeof window !== 'undefined' && !window.__kanoFuelBudgetChip) {
  window.__kanoFuelBudgetChip = true;
  let chip = null;
  const naira = (v) => `₦${Math.max(0, Math.round(v)).toLocaleString('en-NG')}`;

  function ensure() {
    if (chip && chip.isConnected) return chip;
    chip = document.createElement('div');
    chip.id = 'kano-fuel-budget-chip';
    chip.style.cssText = 'position:fixed;left:8px;bottom:178px;z-index:40;padding:6px 10px;border-radius:12px;'
      + 'font:700 12px/1.25 system-ui,sans-serif;color:#fff;background:rgba(14,24,38,.86);'
      + 'border:1px solid rgba(255,255,255,.25);pointer-events:none;display:none;max-width:46vw';
    document.body.appendChild(chip);
    return chip;
  }

  setInterval(() => {
    try {
      const g = window.kanoGame; const s = g?.s;
      const el = ensure();
      if (!s || g.state !== 'PLAY' || s.fuel == null || s.fuel > 38 || document.hidden) { el.style.display = 'none'; return; }
      const cash = Number(s.score) || 0;
      const plan = fuelPlan(100 - s.fuel, cash);
      el.style.display = 'block';
      if (s.fuel <= 0) {
        el.style.background = 'rgba(150,20,20,.92)';
        el.textContent = `⛽ EMPTY · full tank ${naira(fuelPlan(100, 1e9).cost)}`;
      } else if (plan.short) {
        el.style.background = 'rgba(150,20,20,.9)';
        el.textContent = `⛽ ${Math.round(s.fuel)}% · fill-up ${naira(plan.cost)} but cash ${naira(cash)} — earn fares first`;
      } else {
        el.style.background = 'rgba(14,24,38,.86)';
        el.textContent = `⛽ ${Math.round(s.fuel)}% · fill to full ${naira(plan.cost)} · cash ${naira(cash)}`;
      }
    } catch (error) { /* display only */ }
  }, 1000);
}
