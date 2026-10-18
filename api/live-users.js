// ============================================================
// KANO LIFE — VERCEL LIVE PRESENCE API
// File: api/live-users.js
//
// Requires Vercel environment variables:
//   UPSTASH_REDIS_REST_URL
//   UPSTASH_REDIS_REST_TOKEN
// Optional:
//   KANO_ALLOWED_ORIGINS (comma-separated origins)
//
// Stores only random per-tab session identifiers and heartbeat timestamps.
// Stale sessions are removed after 45 seconds. This is an approximate count
// of active browser sessions, not an authenticated/anti-bot player count.
// ============================================================

const PRESENCE_KEY = 'kano-life:presence:v1';
const ACTIVE_WINDOW_MS = 45_000;
const SESSION_ID_PATTERN = /^[a-f0-9-]{16,64}$/i;

function allowedOrigins() {
  const configured = String(process.env.KANO_ALLOWED_ORIGINS || '')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);

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
  res.end(JSON.stringify(payload));
}

function parseBody(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  if (typeof req.body === 'string') {
    try {
      return JSON.parse(req.body);
    } catch {
      return null;
    }
  }
  return null;
}

async function runRedisPipeline(commands) {
  const baseUrl = String(process.env.UPSTASH_REDIS_REST_URL || '').replace(/\/+$/, '');
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;

  if (!baseUrl || !token) {
    const error = new Error('Live presence is not configured. Add Upstash Redis REST credentials in Vercel.');
    error.code = 'PRESENCE_NOT_CONFIGURED';
    throw error;
  }

  const response = await fetch(`${baseUrl}/pipeline`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(commands),
    signal: AbortSignal.timeout(4500),
  });

  if (!response.ok) {
    throw new Error(`Redis REST request failed with HTTP ${response.status}.`);
  }

  const results = await response.json();
  if (!Array.isArray(results) || results.length < 3) {
    throw new Error('Redis REST returned an unexpected pipeline response.');
  }

  const commandError = results.find((entry) => entry?.error);
  if (commandError) {
    throw new Error(String(commandError.error).slice(0, 180));
  }

  const count = Number(results[2]?.result);
  if (!Number.isFinite(count) || count < 0) {
    throw new Error('Redis REST returned an invalid live-session count.');
  }

  return Math.floor(count);
}

export default async function handler(req, res) {
  const origin = req.headers.origin;
  const origins = allowedOrigins();

  if (origin && !origins.has(origin)) {
    return sendJson(res, 403, { ok: false, error: 'origin_not_allowed' });
  }

  if (req.method === 'OPTIONS') {
    if (origin && origins.has(origin)) {
      res.setHeader('Access-Control-Allow-Origin', origin);
      res.setHeader('Vary', 'Origin');
    }
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    res.statusCode = 204;
    return res.end();
  }

  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST, OPTIONS');
    return sendJson(res, 405, { ok: false, error: 'method_not_allowed' });
  }

  if (origin) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
  }

  const body = parseBody(req);
  const action = body?.action;
  const sessionId = String(body?.sessionId || '');

  if (!['heartbeat', 'leave'].includes(action)) {
    return sendJson(res, 400, { ok: false, error: 'invalid_action' });
  }

  if (!SESSION_ID_PATTERN.test(sessionId)) {
    return sendJson(res, 400, { ok: false, error: 'invalid_session_id' });
  }

  const now = Date.now();
  const staleBefore = String(now - ACTIVE_WINDOW_MS);
  const sessionScore = String(now);

  const commands = action === 'heartbeat'
    ? [
        ['ZADD', PRESENCE_KEY, sessionScore, sessionId],
        ['ZREMRANGEBYSCORE', PRESENCE_KEY, '-inf', staleBefore],
        ['ZCARD', PRESENCE_KEY],
      ]
    : [
        ['ZREM', PRESENCE_KEY, sessionId],
        ['ZREMRANGEBYSCORE', PRESENCE_KEY, '-inf', staleBefore],
        ['ZCARD', PRESENCE_KEY],
      ];

  try {
    const count = await runRedisPipeline(commands);
    return sendJson(res, 200, {
      ok: true,
      count,
      activeWindowSeconds: ACTIVE_WINDOW_MS / 1000,
      serverTime: now,
    });
  } catch (error) {
    const notConfigured = error?.code === 'PRESENCE_NOT_CONFIGURED';

    if (notConfigured) {
      return sendJson(res, 503, {
        ok: false,
        error: 'presence_not_configured',
      });
    }

    console.error('[Kano Life] live presence API error:', error?.message || error);
    return sendJson(res, 502, { ok: false, error: 'presence_service_unavailable' });
  }
}
