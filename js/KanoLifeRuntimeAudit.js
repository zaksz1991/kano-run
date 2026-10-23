// ============================================================
// KANO LIFE — RUNTIME / START-PAGE DIAGNOSTICS
// No imports, no storage writes, no game construction and no network calls.
// Loaded before app modules so module-load failures and long tasks can be seen.
// ============================================================

const INSTALL_KEY = '__KANO_LIFE_RUNTIME_AUDIT_INSTALLED__';
const MAX_EVENTS = 80;
const MAX_LONG_TASKS = 30;
const MAX_LONG_ANIMATION_FRAMES = 30;
const MAX_SCRIPT_ATTRIBUTION_PER_FRAME = 8;

if (typeof window !== 'undefined' && typeof document !== 'undefined' && !window[INSTALL_KEY]) {
  Object.defineProperty(window, INSTALL_KEY, { value: true });

  const events = [];
  const longTasks = [];
  const longAnimationFrames = [];
  const moduleStates = new Map();
  let supportsLongTasks = false;
  let supportsLongAnimationFrames = false;
  let sequence = 0;

  const text = (value, limit = 240) => String(value ?? '')
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, limit);

  const modulePath = (value) => {
    try { return new URL(value, window.location.href).pathname; }
    catch { return text(value, 240); }
  };

  function record(severity, type, detail = {}) {
    const item = {
      id: ++sequence,
      at: new Date().toISOString(),
      severity: severity === 'error' ? 'error' : severity === 'warning' ? 'warning' : 'info',
      type: text(type, 48) || 'event',
      message: text(detail.message || detail.reason || detail.src || '', 240),
      file: text(detail.file || '', 180),
      line: Number.isFinite(Number(detail.line)) ? Math.max(0, Number(detail.line)) : 0,
      durationMs: Number.isFinite(Number(detail.durationMs)) ? Math.max(0, Math.round(Number(detail.durationMs) * 10) / 10) : undefined,
    };
    events.push(item);
    if (events.length > MAX_EVENTS) events.splice(0, events.length - MAX_EVENTS);
    window.dispatchEvent(new CustomEvent('kano:runtime-audit-updated', { detail: { type: item.type, severity: item.severity } }));
    return item;
  }

  function appSnapshot() {
    const start = document.getElementById('start-screen');
    const routine = document.getElementById('life-routine-screen');
    const career = document.getElementById('kano-life-career-screen');
    const game = window.__KANO_ACTIVE_GAME__ || window.__KANO_ACTIVE_UI__?.game || null;
    const selectIds = ['route-select', 'driver-select', 'mode-select'];
    const settingsIds = ['dialect-select', 'camera-select', 'road-select', 'mute-select', 'quality-select'];
    const visible = (node) => Boolean(node && !node.classList.contains('hidden'));
    const activeScreen = [...document.querySelectorAll('.screen:not(.hidden)')]
      .map(node => text(node.id || node.getAttribute('aria-label') || 'unnamed-screen', 80));
    return {
      uiBound: Boolean(window.__KANO_UI_BOUND__ || window.__KANO_ACTIVE_UI__?.bound),
      gamePresent: Boolean(game),
      gameState: text(game?.state || 'NOT_CREATED', 40),
      startScreenVisible: visible(start),
      morningRoutineVisible: visible(routine),
      careerScreenVisible: visible(career),
      launchSelects: Object.fromEntries(selectIds.map(id => [id, {
        exists: Boolean(document.getElementById(id)),
        options: document.getElementById(id)?.options?.length ?? 0,
      }])),
      settingsControls: Object.fromEntries(settingsIds.map(id => [id, Boolean(document.getElementById(id))])),
      careerHostPresent: Boolean(career?.querySelector('.klc-panel')),
      careerPanelCount: career?.querySelectorAll('.klc-panel > section[id]').length ?? 0,
      activeScreens: activeScreen,
    };
  }

  function moduleSnapshot() {
    return [...moduleStates.values()].map(module => ({ ...module }));
  }

  function snapshot() {
    const modules = moduleSnapshot();
    const issues = events.filter(item => item.severity !== 'info').map(item => ({ ...item }));
    return {
      schemaVersion: 1,
      generatedAt: new Date().toISOString(),
      location: window.location.origin + window.location.pathname,
      app: appSnapshot(),
      moduleSummary: {
        total: modules.length,
        loaded: modules.filter(item => item.status === 'loaded').length,
        pending: modules.filter(item => item.status === 'pending').length,
        failed: modules.filter(item => item.status === 'failed').length,
      },
      performanceCapabilities: {
        longTasks: supportsLongTasks,
        longAnimationFrames: supportsLongAnimationFrames,
      },
      modules,
      issueSummary: {
        total: issues.length,
        errors: issues.filter(item => item.severity === 'error').length,
        warnings: issues.filter(item => item.severity === 'warning').length,
        longTasks: longTasks.length,
        longAnimationFrames: longAnimationFrames.length,
      },
      issues,
      longTasks: longTasks.map(item => ({ ...item })),
      longAnimationFrames: longAnimationFrames.map(item => ({
        ...item,
        scripts: item.scripts.map(script => ({ ...script })),
      })),
      privacy: 'Local diagnostic only. Does not export localStorage, wallet balances, personal profile values, cookies, or URL query parameters. Frame attribution keeps only script paths, function/invoker labels and timings; it omits query strings. Nothing is sent to a server.',
    };
  }

  function exportText() {
    return JSON.stringify(snapshot(), null, 2);
  }

  function downloadReport() {
    const payload = exportText();
    try {
      const blob = new Blob([payload], { type: 'application/json;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `kano-life-runtime-audit-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.append(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1200);
      record('info', 'diagnostic-exported', { message: 'Runtime report exported locally.' });
      return { ok: true, bytes: payload.length };
    } catch (error) {
      record('error', 'diagnostic-export-failed', { message: error?.message || 'Download unavailable.' });
      return { ok: false, message: text(error?.message || 'Download unavailable.') };
    }
  }

  // Register status listeners on every external module script before app boot.
  for (const script of document.querySelectorAll('script[type="module"][src]')) {
    const src = modulePath(script.src);
    const row = { src, status: 'pending' };
    moduleStates.set(src, row);
    script.addEventListener('load', () => {
      row.status = 'loaded';
      record('info', 'module-loaded', { src });
    }, { once: true });
    script.addEventListener('error', () => {
      row.status = 'failed';
      record('error', 'module-load-failed', { src, message: 'A module entrypoint failed to load. Check its imports and the browser network log.' });
    }, { once: true });
  }

  window.addEventListener('error', event => {
    const target = event?.target;
    if (target && target !== window) {
      const tag = text(target.tagName || 'resource', 24).toLowerCase();
      const src = modulePath(target.src || target.href || '');
      if (tag === 'script' && moduleStates.has(src)) {
        const row = moduleStates.get(src);
        if (row.status !== 'failed') {
          row.status = 'failed';
          record('error', 'module-resource-error', { src, message: 'The module resource failed before it could be loaded.' });
        }
      } else if (tag === 'link' || tag === 'img' || tag === 'script') {
        record('warning', 'asset-resource-error', { file: src, message: `A ${tag} resource failed to load.` });
      }
      return;
    }
    record('error', 'runtime-error', {
      message: event?.message || event?.error?.message || 'Uncaught browser runtime error.',
      file: event?.filename ? modulePath(event.filename) : '',
      line: event?.lineno || 0,
    });
  }, true);

  window.addEventListener('unhandledrejection', event => {
    const reason = event?.reason;
    record('error', 'unhandled-rejection', {
      message: reason?.message || reason || 'Unhandled promise rejection.',
      file: reason?.fileName ? modulePath(reason.fileName) : '',
      line: reason?.lineNumber || 0,
    });
  });

  if (typeof PerformanceObserver !== 'undefined') {
    const supportsEntryType = (type) => {
      const types = PerformanceObserver.supportedEntryTypes;
      return !Array.isArray(types) || types.includes(type);
    };
    const roundMs = value => Math.round((Number(value) || 0) * 10) / 10;

    try {
      if (supportsEntryType('longtask')) {
        const observer = new PerformanceObserver(list => {
          for (const entry of list.getEntries()) {
            const durationMs = Number(entry.duration) || 0;
            if (durationMs < 250) continue;
            const item = {
              at: new Date().toISOString(),
              durationMs: roundMs(durationMs),
              startTimeMs: roundMs(entry.startTime),
              source: text(entry.name || 'main-thread task', 80),
            };
            longTasks.push(item);
            if (longTasks.length > MAX_LONG_TASKS) longTasks.splice(0, longTasks.length - MAX_LONG_TASKS);
            record('warning', 'long-main-thread-task', {
              message: `Main-thread task lasted ${item.durationMs} ms.`,
              durationMs,
              file: item.source,
            });
          }
        });
        observer.observe({ type: 'longtask', buffered: true });
        supportsLongTasks = true;
      }
    } catch { /* Long Task API is optional; diagnostics still work without it. */ }

    // The Long Animation Frames API can attribute a blocked frame to the
    // script entrypoint/invoker. It is feature-detected and never required.
    try {
      if (supportsEntryType('long-animation-frame')) {
        const observer = new PerformanceObserver(list => {
          for (const entry of list.getEntries()) {
            const durationMs = Number(entry.duration) || 0;
            // Capture visibly delayed frames without filling the report with
            // ordinary small frame overruns. The API itself begins at 50 ms.
            if (durationMs < 100) continue;
            const rawScripts = Array.isArray(entry.scripts) ? entry.scripts : [];
            const scripts = rawScripts
              .slice(0, MAX_SCRIPT_ATTRIBUTION_PER_FRAME)
              .map(script => ({
                source: script.sourceURL ? modulePath(script.sourceURL) : '',
                functionName: text(script.sourceFunctionName || '', 100),
                invoker: text(script.invoker || script.name || '', 120),
                invokerType: text(script.invokerType || '', 48),
                durationMs: roundMs(script.duration),
                forcedStyleAndLayoutMs: roundMs(script.forcedStyleAndLayoutDuration),
                pauseMs: roundMs(script.pauseDuration),
                sourceCharPosition: Number.isFinite(Number(script.sourceCharPosition))
                  ? Number(script.sourceCharPosition) : -1,
              }));
            const item = {
              at: new Date().toISOString(),
              durationMs: roundMs(durationMs),
              startTimeMs: roundMs(entry.startTime),
              blockingDurationMs: roundMs(entry.blockingDuration),
              renderStartMs: roundMs(entry.renderStart),
              styleAndLayoutStartMs: roundMs(entry.styleAndLayoutStart),
              attributedScriptCount: rawScripts.length,
              scripts,
            };
            longAnimationFrames.push(item);
            if (longAnimationFrames.length > MAX_LONG_ANIMATION_FRAMES) {
              longAnimationFrames.splice(0, longAnimationFrames.length - MAX_LONG_ANIMATION_FRAMES);
            }
            const first = scripts.find(script => script.source || script.functionName || script.invoker);
            record('warning', 'long-animation-frame', {
              message: `Rendering frame lasted ${item.durationMs} ms; ${rawScripts.length} script attribution record(s) reported.`,
              durationMs,
              file: first?.source || first?.functionName || 'rendering/layout',
            });
          }
        });
        observer.observe({ type: 'long-animation-frame', buffered: true });
        supportsLongAnimationFrames = true;
      }
    } catch { /* LoAF support varies by browser and may be disabled. */ }
  }

  document.addEventListener('click', event => {
    const button = event.target?.closest?.('#start-btn');
    if (!button) return;
    record('info', 'start-button-clicked', { message: 'Checking whether the start screen advances.' });
    window.setTimeout(() => {
      const snap = appSnapshot();
      const progressed = !snap.startScreenVisible || snap.morningRoutineVisible
        || ['PLAY', 'EVENT', 'GAME_OVER'].includes(snap.gameState);
      if (!progressed) record('warning', 'start-screen-did-not-advance', {
        message: `Start screen remains visible after the click; UI bound=${snap.uiBound}, game state=${snap.gameState}.`,
      });
      else record('info', 'start-screen-advanced', { message: `Start flow advanced to ${snap.gameState}.` });
    }, 2200);
  }, true);

  window.addEventListener('kano:app-ui-ready', event => {
    record('info', 'app-ui-ready', { message: `The original UI bound to ${text(event?.detail?.gameState || 'the game', 40)}.` });
  });
  window.addEventListener('kano:runtime-audit-requested', () => {
    record('info', 'manual-diagnostic-requested', { message: 'Runtime diagnostic requested from Life & Career.' });
  });

  window.kanoLifeRuntimeAudit = Object.freeze({
    version: 1,
    snapshot,
    exportText,
    downloadReport,
    record: (severity, type, detail) => record(severity, type, detail),
  });
  record('info', 'runtime-audit-ready', { message: 'Local runtime diagnostics registered before game boot.' });
  console.info('[Kano Life] runtime audit registered; no game state or settings were modified.');
}
