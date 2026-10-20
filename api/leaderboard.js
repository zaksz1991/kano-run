import { createHash } from 'node:crypto';

const VALID_TRIBES = new Set(['hausa', 'yoruba', 'igbo']);
const VALID_MODES = new Set(['career', 'timeAttack', 'fuel', 'matchDrop', 'potholes', 'freeRoam']);
const KEY_PREFIX = 'kano-life:leaderboard:v1';
const MAX_ROWS = 500;
const MAX_LIMIT = 20;
const ACTIVE_WINDOW_SECONDS = 60;
const MAX_SUBMITS_PER_IP_PER_WINDOW = 60;
const ID_PATTERN = /^[a-f0-9-]{16,64}$/i;

function allowedOrigins() {
  const configured = String(process.env.KANO_ALLOWED_ORIGINS || '')
    .split(',').map((origin) => origin.trim()).filter(Boolean);
  if (configured.length) return new Set(configured);
  return new Set([
    'https://kano-run.vercel.app',
    'http://localhost:5173',
    'http://127.0.0.1:5173',
  ]);
}

function sendJson(res, statusCode, payload) {
  res.statusCode = statusCode;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store, max-age=0');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  return res.end(JSON.stringify(payload));
}

function parseBody(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  if (typeof req.body === 'string') {
    try { return JSON.parse(req.body); } catch { return null; }
  }
  return null;
}

function redisCredentials() {
  const baseUrl = String(process.env.UPSTASH_REDIS_REST_URL || '').replace(/\/+$/, '');
  const token = String(process.env.UPSTASH_REDIS_REST_TOKEN || '');
  return baseUrl && token ? { baseUrl, token } : null;
}

async function redisPipeline(commands) {
  const credentials = redisCredentials();
  if (!credentials) {
    const error = new Error('Leaderboard storage is not configured.');
    error.code = 'LEADERBOARD_NOT_CONFIGURED';
    throw error;
  }
  const response = await fetch(`${credentials.baseUrl}/pipeline`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${credentials.token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(commands),
    signal: AbortSignal.timeout(4500),
  });
  if (!response.ok) throw new Error(`Redis REST returned HTTP ${response.status}.`);
  const results = await response.json();
  if (!Array.isArray(results) || results.length !== commands.length) {
    throw new Error('Redis REST returned an unexpected pipeline response.');
  }
  const commandError = results.find((entry) => entry?.error);
  if (commandError) throw new Error(String(commandError.error).slice(0, 180));
  return results;
}

function scoreKey(board) {
  return board === 'all' ? `${KEY_PREFIX}:all` : `${KEY_PREFIX}:tribe:${board}`;
}

function cleanName(value, fallback) {
  const cleaned = String(value || '')
    .replace(/[\u0000-\u001f\u007f<>]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 24);
  return cleaned || fallback;
}

function clientIpHash(req) {
  const forwarded = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim();
  const ip = forwarded || String(req.headers['x-real-ip'] || 'unknown');
  return createHash('sha256').update(ip).digest('hex').slice(0, 24);
}

async function enforceRateLimit(req, sessionId) {
  const ipHash = clientIpHash(req);
  const ipKey = `${KEY_PREFIX}:rate:ip:${ipHash}`;
  const sessionHash = createHash('sha256').update(sessionId).digest('hex').slice(0, 24);
  const sessionKey = `${KEY_PREFIX}:rate:session:${sessionHash}`;
  const results = await redisPipeline([
    ['INCR', ipKey], ['EXPIRE', ipKey, String(ACTIVE_WINDOW_SECONDS)],
    ['INCR', sessionKey], ['EXPIRE', sessionKey, String(ACTIVE_WINDOW_SECONDS)],
  ]);
  const ipCount = Number(results[0]?.result);
  const sessionCount = Number(results[2]?.result);
  return {
    allowed: Number.isFinite(ipCount) && Number.isFinite(sessionCount)
      && ipCount <= MAX_SUBMITS_PER_IP_PER_WINDOW && sessionCount <= 12,
    retryAfterSeconds: ACTIVE_WINDOW_SECONDS,
  };
}

function parseRows(members) {
  if (!Array.isArray(members)) return [];
  return members.flatMap((member) => {
    if (typeof member !== 'string') return [];
    try {
      const row = JSON.parse(member);
      if (!row || typeof row !== 'object' || !Number.isFinite(row.score)) return [];
      return [{
        name: cleanName(row.name, 'Kano Driver'),
        score: Math.max(0, Math.floor(row.score)),
        distance: Number.isFinite(row.distance) ? Math.max(0, Number(row.distance.toFixed(2))) : 0,
        tribe: VALID_TRIBES.has(row.tribe) ? row.tribe : 'hausa',
        driver: cleanName(row.driver, 'RuffNeck'),
        mode: VALID_MODES.has(row.mode) ? row.mode : 'career',
        submittedAt: Number.isFinite(row.submittedAt) ? row.submittedAt : Date.now(),
      }];
    } catch { return []; }
  });
}

export default async function handler(req, res) {
  const origin = req.headers.origin;
  const origins = allowedOrigins();
  if (origin && !origins.has(origin)) {
    return sendJson(res, 403, { ok: false, error: 'origin_not_allowed' });
  }
  if (origin && origins.has(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
  }
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.statusCode = 204;
    return res.end();
  }
  if (!['GET', 'POST'].includes(req.method)) {
    res.setHeader('Allow', 'GET, POST, OPTIONS');
    return sendJson(res, 405, { ok: false, error: 'method_not_allowed' });
  }
  if (!redisCredentials()) {
    return sendJson(res, 503, { ok: false, error: 'leaderboard_not_configured' });
  }

  if (req.method === 'GET') {
    const url = new URL(req.url || '/api/leaderboard', 'https://kano-run.vercel.app');
    const requestedBoard = String(url.searchParams.get('board') || 'all').toLowerCase();
    const board = requestedBoard === 'all' || VALID_TRIBES.has(requestedBoard) ? requestedBoard : null;
    if (!board) return sendJson(res, 400, { ok: false, error: 'invalid_board' });
    const requestedLimit = Number(url.searchParams.get('limit') || 10);
    const limit = Number.isFinite(requestedLimit) ? Math.min(MAX_LIMIT, Math.max(1, Math.floor(requestedLimit))) : 10;
    try {
      const result = await redisPipeline([['ZREVRANGE', scoreKey(board), '0', String(limit - 1)]]);
      return sendJson(res, 200, {
        ok: true,
        board,
        limit,
        rows: parseRows(result[0]?.result),
        serverTime: Date.now(),
      });
    } catch (error) {
      console.error('[Kano Life] leaderboard read error:', error?.message || error);
      return sendJson(res, 502, { ok: false, error: 'leaderboard_read_failed' });
    }
  }

  const body = parseBody(req);
  const sessionId = String(body?.sessionId || '');
  const runId = String(body?.runId || '');
  const tribe = String(body?.tribe || '').toLowerCase();
  const mode = String(body?.mode || 'career');
  const scoreValue = Number(body?.score);
  const distanceValue = Number(body?.distance);
  if (!ID_PATTERN.test(sessionId) || !ID_PATTERN.test(runId)) {
    return sendJson(res, 400, { ok: false, error: 'invalid_identifier' });
  }
  if (!VALID_TRIBES.has(tribe) || !VALID_MODES.has(mode)) {
    return sendJson(res, 400, { ok: false, error: 'invalid_tribe_or_mode' });
  }
  if (!Number.isFinite(scoreValue) || scoreValue < 0 || scoreValue > 100_000_000) {
    return sendJson(res, 400, { ok: false, error: 'invalid_score' });
  }
  if (!Number.isFinite(distanceValue) || distanceValue < 0 || distanceValue > 10_000) {
    return sendJson(res, 400, { ok: false, error: 'invalid_distance' });
  }

  try {
    const rate = await enforceRateLimit(req, sessionId);
    if (!rate.allowed) {
      res.setHeader('Retry-After', String(rate.retryAfterSeconds));
      return sendJson(res, 429, { ok: false, error: 'rate_limited', retryAfterSeconds: rate.retryAfterSeconds });
    }

    const name = cleanName(body?.displayName, `Kano Driver ${sessionId.slice(0, 4).toUpperCase()}`);
    const driver = cleanName(body?.driver, 'RuffNeck');
    const clientDate = Number(body?.submittedAt);
    const submittedAt = Number.isFinite(clientDate) && clientDate > 0
      && clientDate <= Date.now() + 5 * 60 * 1000 ? Math.floor(clientDate) : Date.now();
    const row = {
      id: runId,
      name,
      score: Math.floor(scoreValue),
      distance: Number(distanceValue.toFixed(2)),
      tribe,
      driver,
      mode,
      submittedAt,
    };
    // Encoding the row as the sorted-set member makes a repeated request for
    // the same run idempotent when the queued client retry uses the same body.
    const member = JSON.stringify(row);
    const allKey = scoreKey('all');
    const tribeKey = scoreKey(tribe);
    const results = await redisPipeline([
      ['ZADD', allKey, String(row.score), member],
      ['ZADD', tribeKey, String(row.score), member],
      ['ZREMRANGEBYRANK', allKey, '0', String(-MAX_ROWS - 1)],
      ['ZREMRANGEBYRANK', tribeKey, '0', String(-MAX_ROWS - 1)],
    ]);
    const commands = results.map((entry) => Number(entry?.result) || 0);
    return sendJson(res, 201, { ok: true, row, stored: true, commands });
  } catch (error) {
    if (error?.code === 'LEADERBOARD_NOT_CONFIGURED') {
      return sendJson(res, 503, { ok: false, error: 'leaderboard_not_configured' });
    }
    console.error('[Kano Life] leaderboard submit error:', error?.message || error);
    return sendJson(res, 502, { ok: false, error: 'leaderboard_submit_failed' });
  }
}
