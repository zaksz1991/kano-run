/**
 * Shows the keke's mechanical trouble on screen: engine temperature once it runs hot, worn or punctured tyres.
 * Hidden when everything is fine. Display only.
 */
if (typeof window !== 'undefined' && !window.__kanoKekeStatusChip) {
  window.__kanoKekeStatusChip = true;
  let chip = null;

  function ensure() {
    if (chip && chip.isConnected) return chip;
    chip = document.createElement('div');
    chip.id = 'kano-keke-status-chip';
    chip.style.cssText = 'position:fixed;left:8px;bottom:224px;z-index:40;padding:6px 10px;border-radius:12px;'
      + 'font:700 12px/1.3 system-ui,sans-serif;color:#fff;background:rgba(14,24,38,.86);'
      + 'border:1px solid rgba(255,255,255,.25);pointer-events:none;display:none;max-width:46vw';
    document.body.appendChild(chip);
    return chip;
  }

  setInterval(() => {
    try {
      const g = window.kanoGame; const s = g?.s;
      const el = ensure();
      if (!s || g.state !== 'PLAY' || document.hidden) { el.style.display = 'none'; return; }
      const lines = [];
      let bad = false;
      const temp = Number(s.engineTemp) || 0;
      if (temp >= 85) {
        lines.push(`🌡 Engine ${Math.round(temp)}°${temp >= 105 ? ' OVERHEATING' : ' hot'}`);
        if (temp >= 105) bad = true;
      }
      if (s.flatTyre) { lines.push('🛞 FLAT TYRE · find a vulcanizer'); bad = true; }
      else if ((s.tyres ?? 100) < 50) lines.push(`🛞 Tyres worn ${Math.round(s.tyres)}% · puncture risk`);
      if (!lines.length) { el.style.display = 'none'; return; }
      el.style.display = 'block';
      el.style.background = bad ? 'rgba(150,20,20,.92)' : 'rgba(120,70,10,.9)';
      el.textContent = lines.join('  ·  ');
    } catch (error) { /* display only */ }
  }, 700);
}
