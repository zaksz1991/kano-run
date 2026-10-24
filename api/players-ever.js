// KANO LIFE — persistent approximate count of unique browser profiles that have played.
// Uses the same Upstash Redis REST credentials as api/live-users.js.
const KEY = 'kano-life:players-ever:v1';
const PLAYER_ID = /^[a-f0-9-]{16,96}$/i;
const ORIGINS = new Set([
  'https://kano-run.vercel.app',
  'http://localhost:5173',
  'http://127.0.0.1:5173',
]);
function reply(res, code, body) {
  res.statusCode = code;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store, max-age=0');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.end(JSON.stringify(body));
}
function bodyOf(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  if (typeof req.body === 'string') { try { return JSON.parse(req.body); } catch {} }
  return null;
}
export default async function handler(req, res) {
  const origin = String(req.headers?.origin || '');
  const configuredOrigins = String(process.env.KANO_ALLOWED_ORIGINS || '').split(',').map((x) => x.trim()).filter(Boolean);
  const allowed = configuredOrigins.length ? new Set(configuredOrigins) : ORIGINS;
  if (origin && !allowed.has(origin)) return reply(res, 403, { ok: false, error: 'origin_not_allowed' });
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return reply(res, 405, { ok: false, error: 'method_not_allowed' });
  }
  const playerId = String(bodyOf(req)?.playerId || '');
  if (!PLAYER_ID.test(playerId)) return reply(res, 400, { ok: false, error: 'invalid_player_profile' });
  const baseUrl = String(process.env.UPSTASH_REDIS_REST_URL || '').replace(/\/+$/, '');
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!baseUrl || !token) return reply(res, 503, { ok: false, error: 'player_count_not_configured' });
  try {
    const response = await fetch(`${baseUrl}/pipeline`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify([['SADD', KEY, playerId], ['SCARD', KEY]]),
      signal: AbortSignal.timeout(4500),
    });
    if (!response.ok) return reply(res, 502, { ok: false, error: 'counter_backend_unavailable' });
    const results = await response.json();
    if (!Array.isArray(results) || results.length < 2 || results.some((r) => r?.error)) return reply(res, 502, { ok: false, error: 'counter_backend_invalid_response' });
    const totalProfiles = Number(results[1]?.result);
    if (!Number.isFinite(totalProfiles) || totalProfiles < 0) return reply(res, 502, { ok: false, error: 'counter_value_invalid' });
    return reply(res, 200, { ok: true, totalProfiles: Math.floor(totalProfiles), metric: 'unique_browser_profiles', exactHumanCount: false });
  } catch {
    return reply(res, 503, { ok: false, error: 'player_count_unavailable' });
  }
}
