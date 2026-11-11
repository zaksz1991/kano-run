/**
 * Boot self-check. Several Kano modules are wrapped in try/catch and only log a console warning
 * when they fail (market/crowd/passengers, effects, road upgrades ...). The game keeps running
 * with that feature silently missing. This collects those warnings and uncaught errors and shows
 * a small tappable badge so a missing feature is visible on a phone, with the reason.
 */
const KEY = Symbol.for('kano.life.bootSelfCheck.v1');
const issues = [];

function record(kind, text) {
  const line = String(text || '').replace(/\s+/g, ' ').slice(0, 220);
  if (!line || issues.some((i) => i.text === line)) return;
  issues.push({ kind, text: line });
  if (issues.length > 25) issues.shift();
  window.kanoBootIssues = issues;
  render();
}

let badge = null;
let panel = null;
function render() {
  if (typeof document === 'undefined' || !document.body) return;
  if (!/[?&]debug=1/.test(location.search)) return; // players never see developer warnings
  if (!badge) {
    badge = document.createElement('button');
    badge.id = 'kano-boot-issues';
    badge.type = 'button';
    badge.style.cssText = 'position:fixed;left:234px;top:calc(env(safe-area-inset-top,0px) + 9px);z-index:60;padding:3px 8px;border-radius:10px;border:1px solid #f5c431;background:rgba(40,20,10,.85);color:#ffd9a0;font:700 11px system-ui,sans-serif;opacity:.85';
    badge.addEventListener('click', () => {
      if (!panel) {
        panel = document.createElement('div');
        panel.style.cssText = 'position:fixed;left:8px;right:8px;top:calc(env(safe-area-inset-top,0px) + 36px);z-index:61;max-height:60vh;overflow:auto;padding:8px;border-radius:10px;background:rgba(10,14,20,.95);border:1px solid #f5c431;color:#fff;font:12px/1.35 system-ui,sans-serif';
        panel.addEventListener('click', () => { panel.style.display = 'none'; });
        document.body.appendChild(panel);
      }
      panel.style.display = panel.style.display === 'block' ? 'none' : 'block';
      panel.innerHTML = issues.map((i) => `<div style="margin:0 0 6px"><b>${i.kind}</b> ${i.text.replace(/</g, '&lt;')}</div>`).join('');
    });
    document.body.appendChild(badge);
  }
  badge.textContent = `⚠ ${issues.length}`;
}

if (typeof window !== 'undefined' && !window[KEY]) {
  window[KEY] = true;
  const warn = console.warn;
  console.warn = function kanoWarn(...args) {
    try {
      const first = String(args[0] ?? '');
      if (/^\[Kano/.test(first) && /unavailable|skipped|could not|failed|not start/i.test(first + ' ' + String(args[1]?.message || ''))
        && !/asset unavailable|fallback/i.test(first + ' ' + String(args[1] || ''))) {
        record('module', `${first} ${args[1]?.message || ''}`);
      }
    } catch { /* never break logging */ }
    return warn.apply(this, args);
  };
  window.addEventListener('error', (e) => record('error', `${e.message} (${(e.filename || '').split('/').pop()}:${e.lineno})`));
  window.addEventListener('unhandledrejection', (e) => record('promise', e.reason?.message || e.reason));
}
