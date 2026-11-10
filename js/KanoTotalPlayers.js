/**
 * Total players who have ever played, shown in-game and on the start screen.
 * Primary: /api/players-ever (needs Upstash env vars). Fallback that needs no setup: a public hit counter
 * (counterapi.dev), incremented once per device. The last known number is cached so it always shows something.
 */
const NS = 'kano-run-ruffneck';
const KEY = 'players-ever';
const CACHE = 'kano-total-players-cache';
const PROFILE = 'kano-life-player-profile-v1';
const COUNTED = 'kano-total-players-counted-v1';
const get = (k) => { try { return localStorage.getItem(k); } catch (_) { return null; } };
const set = (k, v) => { try { localStorage.setItem(k, v); } catch (_) { /* optional */ } };

function timeout(ms) { const c = new AbortController(); setTimeout(() => c.abort(), ms); return c.signal; }

async function fromApi() {
  let id = get(PROFILE);
  if (!id || !/^[a-f0-9-]{16,96}$/i.test(id)) {
    id = (crypto.randomUUID && crypto.randomUUID()) || `${Date.now().toString(16)}-${Math.random().toString(16).slice(2)}-${Math.random().toString(16).slice(2)}`;
    set(PROFILE, id);
  }
  const r = await fetch('/api/players-ever', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ playerId: id }), cache: 'no-store', signal: timeout(5000) });
  if (!r.ok) throw new Error('api');
  const d = await r.json();
  const n = Number(d?.totalProfiles);
  if (!d?.ok || !Number.isFinite(n)) throw new Error('api-invalid');
  return Math.floor(n);
}

async function fromPublicCounter() {
  const first = get(COUNTED) !== '1';
  const url = `https://api.counterapi.dev/v1/${NS}/${KEY}/${first ? 'up' : ''}`;
  const r = await fetch(url, { cache: 'no-store', signal: timeout(6000) });
  if (!r.ok) throw new Error('public');
  const d = await r.json();
  const n = Number(d?.count ?? d?.value);
  if (!Number.isFinite(n)) throw new Error('public-invalid');
  if (first) set(COUNTED, '1');
  return Math.floor(n);
}

let total = Number(get(CACHE)) || null;
function paint() {
  const text = total === null ? '' : total.toLocaleString();
  const start = document.getElementById('kano-ever-played-count');
  if (start && text) start.textContent = text;
  let chip = document.getElementById('kano-total-players-chip');
  const live = document.getElementById('kano-live-user-counter');
  if (live) live.style.display = /UNAVAILABLE|CONNECTING/.test(live.textContent) ? 'none' : '';
  if (!text) { chip?.remove(); return; }
  if (!chip) {
    chip = document.createElement('div');
    chip.id = 'kano-total-players-chip';
    chip.style.cssText = 'position:fixed;left:10px;z-index:35;pointer-events:none;padding:6px 10px;border:1px solid #f6d45d88;'
      + 'border-radius:999px;background:rgba(9,25,35,.94);color:#f6e7a8;font:900 10px/1.2 system-ui,sans-serif;'
      + 'letter-spacing:.03em;white-space:nowrap;bottom:calc(max(64px, env(safe-area-inset-bottom) + 60px) + 44px)';
    document.body.appendChild(chip);
  }
  chip.textContent = `TOTAL PLAYERS · ${text}`;
}

async function refresh() {
  try { total = await fromApi(); } catch (_) {
    try { total = await fromPublicCounter(); } catch (__) { /* keep cache */ }
  }
  if (total !== null) set(CACHE, String(total));
  paint();
}

if (typeof window !== 'undefined' && !window.__kanoTotalPlayers) {
  window.__kanoTotalPlayers = true;
  setTimeout(refresh, 1500);
  setInterval(refresh, 120000);
  setInterval(() => { try { paint(); } catch (_) { /* optional */ } }, 3000);
}
