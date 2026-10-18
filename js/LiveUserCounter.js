// ============================================================
// KANO LIFE — LIVE ACTIVE-PLAYER COUNTER
// File: js/LiveUserCounter.js
//
// Uses /api/live-users backed by Upstash Redis. This counts recent active
// browser sessions, not a lifetime visit total. When the backend is not
// configured, the badge explicitly shows that the count is unavailable.
// ============================================================

const SESSION_KEY = 'kano-life-presence-session-v1';
const HEARTBEAT_MS = 15_000;

function createSessionId() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();

  const bytes = new Uint8Array(16);
  if (globalThis.crypto?.getRandomValues) {
    globalThis.crypto.getRandomValues(bytes);
  } else {
    for (let index = 0; index < bytes.length; index += 1) {
      bytes[index] = Math.floor(Math.random() * 256);
    }
  }

  return Array.from(bytes, (value) => value.toString(16).padStart(2, '0')).join('');
}

export class LiveUserCounter {
  constructor({ container = document.getElementById('game-container'), endpoint = '/api/live-users' } = {}) {
    this.container = container || document.body;
    this.endpoint = endpoint;
    this.sessionId = this.getSessionId();
    this.timer = null;
    this.started = false;
    this.disposed = false;
    this.inFlight = false;
    this.lastCount = null;

    this.onVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        void this.heartbeat();
        this.startTimer();
      } else {
        this.stopTimer();
        void this.leave();
      }
    };

    this.onPageHide = () => {
      this.stopTimer();
      void this.send('leave', { keepalive: true });
    };

    this.createBadge();
  }

  getSessionId() {
    try {
      let id = sessionStorage.getItem(SESSION_KEY);
      if (!id || !/^[a-f0-9-]{16,64}$/i.test(id)) {
        id = createSessionId();
        sessionStorage.setItem(SESSION_KEY, id);
      }
      return id;
    } catch {
      // Private browsing can disable storage. Use an ephemeral tab ID.
      return createSessionId();
    }
  }

  createBadge() {
    let badge = this.container.querySelector('#kano-live-user-counter');
    if (!badge) {
      badge = document.createElement('div');
      badge.id = 'kano-live-user-counter';
      this.container.appendChild(badge);
    }

    badge.setAttribute('role', 'status');
    badge.setAttribute('aria-live', 'polite');
    badge.setAttribute('aria-label', 'Live active game users');
    badge.title = 'Active browser sessions seen by the live presence service during the last 45 seconds.';
    badge.textContent = 'LIVE PLAYERS · CONNECTING';
    badge.style.cssText = [
      'position:absolute',
      'left:10px',
      'bottom:max(64px,calc(env(safe-area-inset-bottom) + 60px))',
      'z-index:35',
      'pointer-events:none',
      'padding:7px 10px',
      'border:1px solid #77d9c788',
      'border-radius:999px',
      'background:rgba(9,25,35,.94)',
      'color:#baf8e8',
      'font:900 10px/1.2 system-ui,sans-serif',
      'letter-spacing:.03em',
      'box-shadow:0 4px 14px #0004',
      'white-space:nowrap',
      'max-width:calc(100% - 24px)',
    ].join(';');

    this.badge = badge;
  }

  setUnavailable() {
    if (!this.badge) return;
    this.badge.textContent = this.lastCount === null
      ? 'LIVE PLAYERS · UNAVAILABLE'
      : `LIVE PLAYERS · ${this.lastCount}*`;
    this.badge.dataset.status = 'unavailable';
    this.badge.title = this.lastCount === null
      ? 'Live count unavailable. Configure the Upstash Redis environment variables and deploy /api/live-users.js.'
      : 'Last known count shown; connection to the live presence service is temporarily unavailable.';
  }

  setCount(count) {
    const safeCount = Number.isFinite(Number(count))
      ? Math.max(0, Math.floor(Number(count)))
      : null;

    if (safeCount === null) {
      this.setUnavailable();
      return;
    }

    this.lastCount = safeCount;
    this.badge.textContent = `LIVE PLAYERS · ${safeCount}`;
    this.badge.dataset.status = 'connected';
    this.badge.title = `${safeCount} active browser session${safeCount === 1 ? '' : 's'} seen during the last 45 seconds. This is an approximate live count, not a verified account count.`;
  }

  async send(action, { keepalive = false } = {}) {
    if ((this.disposed && action !== 'leave') || (this.inFlight && action === 'heartbeat')) return null;

    if (action === 'heartbeat') this.inFlight = true;

    try {
      const response = await fetch(this.endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, sessionId: this.sessionId }),
        cache: 'no-store',
        credentials: 'same-origin',
        keepalive,
      });

      const result = await response.json().catch(() => null);
      if (!response.ok || !result?.ok) {
        this.setUnavailable();
        return null;
      }

      if (action === 'heartbeat') this.setCount(result.count);
      else if (Number.isFinite(Number(result.count))) this.setCount(result.count);

      return result;
    } catch {
      this.setUnavailable();
      return null;
    } finally {
      if (action === 'heartbeat') this.inFlight = false;
    }
  }

  heartbeat() {
    if (document.visibilityState !== 'visible') return Promise.resolve(null);
    return this.send('heartbeat');
  }

  leave() {
    return this.send('leave', { keepalive: true });
  }

  startTimer() {
    this.stopTimer();
    if (this.disposed || document.visibilityState !== 'visible') return;

    this.timer = window.setInterval(() => {
      void this.heartbeat();
    }, HEARTBEAT_MS);
  }

  stopTimer() {
    if (this.timer !== null) {
      window.clearInterval(this.timer);
      this.timer = null;
    }
  }

  start() {
    if (this.started || this.disposed) return this;
    this.started = true;

    document.addEventListener('visibilitychange', this.onVisibilityChange);
    window.addEventListener('pagehide', this.onPageHide);

    if (document.visibilityState === 'visible') {
      void this.heartbeat();
      this.startTimer();
    }

    return this;
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.stopTimer();
    document.removeEventListener('visibilitychange', this.onVisibilityChange);
    window.removeEventListener('pagehide', this.onPageHide);
    void this.send('leave', { keepalive: true });
    this.badge?.remove();
  }
}
