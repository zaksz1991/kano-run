import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(SCRIPT_DIR, '..');
const DIST_INDEX = path.join(ROOT, 'dist', 'index.html');
const OUTPUT_BASE = process.env.KANO_AUDIT_OUTPUT_DIR
  ? path.resolve(ROOT, process.env.KANO_AUDIT_OUTPUT_DIR)
  : path.join(ROOT, 'artifacts', 'browser-audit');
const RUN_ID = new Date().toISOString().replace(/[:.]/g, '-');
const OUTPUT_DIR = path.join(OUTPUT_BASE, RUN_ID);
const PORT = Number.parseInt(process.env.KANO_AUDIT_PORT || '4173', 10);
const DURATION_MS = positiveInt(process.env.KANO_AUDIT_DURATION_MS, 60_000);
const NAV_TIMEOUT_MS = positiveInt(process.env.KANO_AUDIT_NAV_TIMEOUT_MS, 120_000);
const THROTTLE_SETTLE_MS = positiveInt(process.env.KANO_AUDIT_THROTTLE_SETTLE_MS, 8_000);
// Software-rendered 3D startup can be much slower than the game itself. Allow
// a dedicated startup budget instead of confusing delayed UI with a deadlock.
const START_ACTION_TIMEOUT_MS = positiveInt(process.env.KANO_AUDIT_START_TIMEOUT_MS, 45_000);
const EXTERNAL_BASE_URL = process.env.KANO_AUDIT_BASE_URL?.trim();
const MODEL_EXTENSION = /\.(?:glb|gltf|bin)(?:[?#]|$)/i;

function positiveInt(value, fallback) {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function asLocalPath(filePath) {
  return path.relative(ROOT, filePath).split(path.sep).join('/');
}

function modeURL(base, mode) {
  const url = new URL(base);
  if (mode === '2d') url.searchParams.set('force2d', '1');
  else url.searchParams.set('force3d', '1');
  url.searchParams.set('debugModels', '1');
  url.searchParams.set('browserAudit', '1');
  return url.toString();
}

function isModelURL(value) {
  try {
    return MODEL_EXTENSION.test(new URL(value).pathname);
  } catch {
    return MODEL_EXTENSION.test(String(value));
  }
}

async function walkFiles(dir) {
  const files = [];
  let entries;
  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch (error) {
    if (error?.code === 'ENOENT') return files;
    throw error;
  }

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) files.push(...await walkFiles(fullPath));
    else if (entry.isFile()) files.push(fullPath);
  }
  return files;
}

async function inspectAssetInventory() {
  const modelRoot = path.join(ROOT, 'public', 'assets', 'models');
  const files = (await walkFiles(modelRoot)).filter((file) =>
    /\.(?:glb|gltf|bin)$/i.test(file),
  );
  let bytes = 0;
  const fileRecords = [];
  for (const file of files) {
    try {
      const size = (await fs.stat(file)).size;
      bytes += size;
      fileRecords.push({ path: asLocalPath(file), bytes: size });
    } catch {
      // A concurrent file change is reported by the resulting inventory mismatch.
      fileRecords.push({ path: asLocalPath(file), bytes: null });
    }
  }
  return {
    directory: asLocalPath(modelRoot),
    fileCount: files.length,
    glbCount: files.filter((file) => /\.glb$/i.test(file)).length,
    gltfCount: files.filter((file) => /\.gltf$/i.test(file)).length,
    bufferCount: files.filter((file) => /\.bin$/i.test(file)).length,
    bytes,
    mib: Number((bytes / (1024 * 1024)).toFixed(2)),
    files: fileRecords,
  };
}


async function launchPreviewIfNeeded() {
  if (EXTERNAL_BASE_URL) return { baseURL: normalizeBase(EXTERNAL_BASE_URL), child: null };

  try {
    await fs.access(DIST_INDEX);
  } catch {
    throw new Error(
      'dist/index.html is missing. Run npm run build first, or use npm run browser:audit which builds before auditing.',
    );
  }

  const viteBin = path.join(ROOT, 'node_modules', 'vite', 'bin', 'vite.js');
  try {
    await fs.access(viteBin);
  } catch {
    throw new Error('Vite is not installed. Run npm ci (or npm install) before the browser audit.');
  }

  const child = spawn(
    process.execPath,
    [viteBin, 'preview', '--host', '127.0.0.1', '--port', String(PORT), '--strictPort'],
    { cwd: ROOT, stdio: 'ignore', windowsHide: true },
  );

  child.on('error', (error) => {
    console.error(`[Browser Audit] Preview server error: ${error.message}`);
  });

  const baseURL = `http://127.0.0.1:${PORT}/`;
  const deadline = Date.now() + 30_000;
  let lastError = null;

  while (Date.now() < deadline) {
    if (child.exitCode !== null) {
      throw new Error(`Vite preview exited early with code ${child.exitCode}. Try KANO_AUDIT_PORT with a free port.`);
    }

    try {
      const response = await fetch(baseURL, { signal: AbortSignal.timeout(2_000) });
      if (response.ok) return { baseURL, child };
      lastError = new Error(`Preview returned HTTP ${response.status}`);
    } catch (error) {
      lastError = error;
    }

    await sleep(500);
  }

  child.kill();
  throw new Error(`Vite preview did not become ready at ${baseURL}: ${lastError?.message || 'timeout'}`);
}

function normalizeBase(value) {
  const url = new URL(value);
  if (!url.pathname.endsWith('/')) url.pathname += '/';
  return url.toString();
}

// Vite Preview serves the built static site, not Vercel serverless functions.
// Stub only these same-origin services in the default local-preview audit so
// repeated /api/* 404s do not drown out game-loading failures. When
// KANO_AUDIT_BASE_URL is supplied, the real API is exercised and never stubbed.
async function installLocalPreviewApiFixtures(page) {
  if (EXTERNAL_BASE_URL) return [];
  const fixtures = [
    { path: '/api/live-users', purpose: 'local preview fixture; live presence is not under test' },
    { path: '/api/leaderboard', purpose: 'local preview fixture; Redis leaderboard is not under test' },
  ];
  await page.route('**/api/live-users', async (route) => {
    const request = route.request();
    let action = 'heartbeat';
    try {
      const body = request.postDataJSON();
      if (body?.action === 'leave') action = 'leave';
    } catch { /* GET and malformed optional payloads use the neutral heartbeat fixture. */ }
    await route.fulfill({
      status: 200,
      contentType: 'application/json; charset=utf-8',
      headers: { 'Cache-Control': 'no-store' },
      body: JSON.stringify({ ok: true, count: 1, activeWindowSeconds: 45, serverTime: Date.now(), action }),
    });
  });
  await page.route('**/api/leaderboard*', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const board = url.searchParams.get('board') || 'all';
    const limit = Math.max(1, Math.min(20, Number(url.searchParams.get('limit') || 10) || 10));
    await route.fulfill({
      status: 200,
      contentType: 'application/json; charset=utf-8',
      headers: { 'Cache-Control': 'no-store' },
      body: JSON.stringify({ ok: true, board, limit, rows: [], serverTime: Date.now() }),
    });
  });
  return fixtures;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function installBrowserInstrumentation(page) {
  await page.addInitScript(() => {
    const store = {
      frameIntervals: [],
      lastFrame: null,
      startedAt: performance.now(),
    };
    Object.defineProperty(window, '__KANO_AUDIT__', {
      configurable: false,
      enumerable: false,
      value: store,
      writable: false,
    });

    try {
      performance.setResourceTimingBufferSize?.(5000);
    } catch {
      // Performance resource timing buffer support differs by browser version.
    }

    const sampleFrame = (timestamp) => {
      if (store.lastFrame !== null) {
        store.frameIntervals.push(timestamp - store.lastFrame);
      }
      store.lastFrame = timestamp;
      window.requestAnimationFrame(sampleFrame);
    };
    window.requestAnimationFrame(sampleFrame);
  });
}

function makeTelemetry(page, modelsBlocked) {
  const data = {
    consoleErrors: [],
    pageErrors: [],
    failedRequests: [],
    httpErrors: [],
    modelRequests: [],
    modelResponses: [],
    intentionalModelBlocks: [],
    requests: [],
    expectedModelFallbackMessages: [],
  };

  const requestSet = new Set();
  let lastNetworkActivityAt = Date.now();
  const touchNetwork = () => { lastNetworkActivityAt = Date.now(); };

  page.on('console', (message) => {
    if (message.type() !== 'error') return;
    const item = {
      text: message.text(),
      location: message.location(),
      at: new Date().toISOString(),
    };
    // The no-model scenarios deliberately abort only GLB/GLTF/buffer requests.
    // Chromium emits a generic ERR_FAILED console line without the asset URL,
    // so bucket that known abort noise separately. Unexpected non-model network
    // failures still remain visible in failedRequests/httpErrors below.
    const text = item.text;
    const context = `${text} ${item.location?.url || ''}`;
    const expectedBlockedModelError = modelsBlocked && (
      MODEL_EXTENSION.test(context)
      || /Failed to load resource:\s*net::ERR_(?:FAILED|ABORTED)/i.test(text)
      || /net::ERR_(?:FAILED|ABORTED)/i.test(text)
      || /THREE\.GLTFLoader.*(?:load|fetch|resource)/i.test(text)
    );
    if (expectedBlockedModelError) data.expectedModelFallbackMessages.push(item);
    else data.consoleErrors.push(item);
  });

  page.on('pageerror', (error) => {
    data.pageErrors.push({
      message: error.message,
      stack: error.stack || null,
      at: new Date().toISOString(),
    });
  });

  page.on('request', (request) => {
    requestSet.add(request);
    touchNetwork();
    const url = request.url();
    data.requests.push({ url, method: request.method(), resourceType: request.resourceType() });
    if (isModelURL(url)) data.modelRequests.push(url);
  });

  page.on('requestfinished', (request) => {
    requestSet.delete(request);
    touchNetwork();
  });

  page.on('requestfailed', (request) => {
    requestSet.delete(request);
    touchNetwork();
    const item = {
      url: request.url(),
      method: request.method(),
      resourceType: request.resourceType(),
      errorText: request.failure()?.errorText || 'unknown request failure',
    };
    if (modelsBlocked && isModelURL(item.url)) {
      data.intentionalModelBlocks.push(item);
    } else {
      data.failedRequests.push(item);
    }
  });

  page.on('response', (response) => {
    if (isModelURL(response.url())) {
      data.modelResponses.push({ url: response.url(), status: response.status() });
    }
    if (response.status() < 400) return;
    data.httpErrors.push({
      url: response.url(),
      status: response.status(),
      statusText: response.statusText(),
      resourceType: response.request().resourceType(),
    });
  });

  return {
    data,
    getInFlightCount: () => requestSet.size,
    getLastNetworkActivityAt: () => lastNetworkActivityAt,
  };
}

async function getBrowserMetrics(cdp) {
  try {
    const result = await cdp.send('Performance.getMetrics');
    const metrics = Object.fromEntries(result.metrics.map((item) => [item.name, item.value]));
    const heap = Number(metrics.JSHeapUsedSize || 0);
    const domNodes = Number(metrics.Nodes || 0);
    return {
      jsHeapUsedBytes: heap || null,
      jsHeapUsedMiB: heap ? Number((heap / (1024 * 1024)).toFixed(2)) : null,
      domNodes: domNodes || null,
      documents: Number(metrics.Documents || 0) || null,
      eventListeners: Number(metrics.JSEventListeners || 0) || null,
      taskDurationSeconds: Number(metrics.TaskDuration || 0),
      scriptDurationSeconds: Number(metrics.ScriptDuration || 0),
    };
  } catch (error) {
    return { unavailable: error.message };
  }
}

function summarizeFrames(values) {
  if (!values.length) {
    return {
      samples: 0,
      avgFrameMs: null,
      medianFrameMs: null,
      p95FrameMs: null,
      maxFrameMs: null,
      estimatedMedianFps: null,
      framesOver33ms: null,
      framesOver50ms: null,
    };
  }

  const sorted = [...values].sort((a, b) => a - b);
  const percentile = (fraction) => sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * fraction) - 1)];
  const sum = values.reduce((total, value) => total + value, 0);
  const median = percentile(0.5);
  return {
    samples: values.length,
    avgFrameMs: Number((sum / values.length).toFixed(2)),
    medianFrameMs: Number(median.toFixed(2)),
    p95FrameMs: Number(percentile(0.95).toFixed(2)),
    maxFrameMs: Number(Math.max(...values).toFixed(2)),
    estimatedMedianFps: median > 0 ? Number((1000 / median).toFixed(1)) : null,
    framesOver33ms: values.filter((value) => value > 33.33).length,
    framesOver50ms: values.filter((value) => value > 50).length,
  };
}

async function measureResourceTiming(page) {
  return page.evaluate(() => {
    const nav = performance.getEntriesByType('navigation')[0];
    const resources = performance.getEntriesByType('resource');
    const sum = (key) => resources.reduce((total, entry) => total + Number(entry[key] || 0), 0);
    const navTransfer = Number(nav?.transferSize || 0);
    const navEncoded = Number(nav?.encodedBodySize || 0);
    const navDecoded = Number(nav?.decodedBodySize || 0);
    const transfer = sum('transferSize') + navTransfer;
    const encoded = sum('encodedBodySize') + navEncoded;
    const decoded = sum('decodedBodySize') + navDecoded;
    const urls = resources.map((entry) => ({
      name: entry.name,
      initiatorType: entry.initiatorType,
      durationMs: Number(entry.duration.toFixed(1)),
      transferSize: Number(entry.transferSize || 0),
      encodedBodySize: Number(entry.encodedBodySize || 0),
      decodedBodySize: Number(entry.decodedBodySize || 0),
    }));
    return {
      navigation: nav ? {
        responseStartMs: Number(nav.responseStart.toFixed(1)),
        domContentLoadedMs: Number(nav.domContentLoadedEventEnd.toFixed(1)),
        loadEventMs: Number(nav.loadEventEnd.toFixed(1)),
        transferSize: navTransfer,
        encodedBodySize: navEncoded,
        decodedBodySize: navDecoded,
      } : null,
      resourceCount: resources.length,
      totalTransferredBytes: transfer,
      totalTransferredMiB: Number((transfer / (1024 * 1024)).toFixed(2)),
      totalEncodedBodyBytes: encoded,
      totalEncodedBodyMiB: Number((encoded / (1024 * 1024)).toFixed(2)),
      totalDecodedBodyBytes: decoded,
      totalDecodedBodyMiB: Number((decoded / (1024 * 1024)).toFixed(2)),
      resources: urls,
    };
  });
}

async function inspectPageState(page) {
  return page.evaluate(() => {
    const visible = (el) => {
      if (!el) return false;
      const style = getComputedStyle(el);
      const rect = el.getBoundingClientRect();
      return style.display !== 'none' && style.visibility !== 'hidden'
        && Number(style.opacity || 1) > 0 && rect.width > 0 && rect.height > 0;
    };
    const element = (selector) => document.querySelector(selector);
    const buttons = Array.from(document.querySelectorAll('#life-actions button')).map((button) => ({
      text: (button.innerText || button.textContent || '').replace(/\s+/g, ' ').trim(),
      disabled: Boolean(button.disabled),
      visible: visible(button),
    }));
    const routine = element('#life-routine-screen');
    const start = element('#start-screen');
    const hud = element('#hud');
    const canvas = element('#game-canvas');
    return {
      readyState: document.readyState,
      url: location.href,
      title: document.title,
      renderMode: window.__KANO_RENDER_MODE__ || null,
      gameReady: Boolean(window.__KANO_LIFE_GAME__ && typeof window.__KANO_LIFE_GAME__.start === 'function'),
      gameState: window.__KANO_LIFE_GAME__?.state || null,
      startScreenHasHiddenClass: Boolean(element('#start-screen')?.classList.contains('hidden')),
      startButtonVisible: visible(element('#start-btn')),
      startScreenVisible: visible(start),
      routineVisible: visible(routine),
      currentStep: element('#life-step-label')?.textContent?.trim() || null,
      currentTitle: element('#life-title')?.textContent?.trim() || null,
      availableActions: buttons,
      hudVisible: visible(hud),
      canvas: canvas ? {
        width: canvas.width,
        height: canvas.height,
        cssWidth: Number(canvas.getBoundingClientRect().width.toFixed(1)),
        cssHeight: Number(canvas.getBoundingClientRect().height.toFixed(1)),
      } : null,
      bootstrapScripts: Array.from(document.scripts).map((script) => script.src).filter(Boolean),
    };
  }).catch((error) => ({ snapshotError: error.message }));
}

function normalizeButtonText(value) {
  return String(value || '').normalize('NFKC').replace(/[\u00a0\s]+/g, ' ').trim().toLocaleUpperCase('en-US');
}

async function clickMorningAction(page, name, timeout = 8_000) {
  // Resolve the button from the live DOM; accessibility-name matching is too
  // brittle for generated UI labels containing punctuation and whitespace.
  const target = normalizeButtonText(name);
  try {
    await page.waitForFunction(({ wanted }) => {
      const visible = (button) => {
        const style = getComputedStyle(button);
        const rect = button.getBoundingClientRect();
        return style.display !== 'none' && style.visibility !== 'hidden'
          && Number(style.opacity || 1) > 0 && rect.width > 0 && rect.height > 0
          && !button.disabled;
      };
      const normalize = (value) => String(value || '').normalize('NFKC')
        .replace(/[\u00a0\s]+/g, ' ').trim().toLocaleUpperCase('en-US');
      return Array.from(document.querySelectorAll('#life-actions button'))
        .some((button) => visible(button)
          && normalize(button.innerText || button.textContent) === wanted);
    }, { wanted: target }, { timeout });

    const index = await page.locator('#life-actions button').evaluateAll((buttons, wanted) => {
      const normalize = (value) => String(value || '').normalize('NFKC')
        .replace(/[\u00a0\s]+/g, ' ').trim().toLocaleUpperCase('en-US');
      return buttons.findIndex((button) => normalize(button.innerText || button.textContent) === wanted
        && !button.disabled);
    }, target);
    if (index < 0) throw new Error('Visible action was found but could not be resolved to a button index.');
    await page.locator('#life-actions button').nth(index).click({ timeout });
  } catch (error) {
    const diagnostics = await inspectPageState(page);
    throw new Error(`Morning routine action "${name}" failed. Diagnostics: ${JSON.stringify(diagnostics)}. ${error.message}`);
  }
}

async function waitForApplicationReady(page, timeout = 30_000) {
  try {
    await page.waitForFunction(() => {
      const game = window.__KANO_LIFE_GAME__;
      const start = document.querySelector('#start-btn');
      const hud = document.querySelector('#hud');
      return Boolean(
        game && typeof game.start === 'function' && typeof game.state === 'string'
        && start && hud && window.__KANO_RENDER_MODE__,
      );
    }, null, { timeout });
  } catch (error) {
    throw new Error(`Kano Life bootstrap did not become ready before interaction. Diagnostics: ${JSON.stringify(await inspectPageState(page))}. ${error.message}`);
  }
}

async function waitForPlayableRun(page, actionLabel, timeout = 15_000) {
  try {
    await page.waitForFunction(() => {
      const game = window.__KANO_LIFE_GAME__;
      const start = document.querySelector('#start-screen');
      const hud = document.querySelector('#hud');
      const controls = document.querySelector('#drive-controls');
      const shown = (element) => {
        if (!element) return false;
        const style = getComputedStyle(element);
        return style.display !== 'none' && style.visibility !== 'hidden';
      };
      return Boolean(
        game?.state === 'PLAY'
        && start?.classList.contains('hidden')
        && shown(hud) && shown(controls)
        && window.__KANO_RENDER_MODE__,
      );
    }, null, { timeout });
  } catch (error) {
    throw new Error(`${actionLabel} did not enter a playable driving state. Diagnostics: ${JSON.stringify(await inspectPageState(page))}. ${error.message}`);
  }
}

// The production UI intentionally starts driving directly from START DRIVING.
// The story remains optional behind REPLAY MORNING ROUTINE. Do not make the
// main gameplay audit wait for story UI that is deliberately hidden on direct start.
async function isRunPlayable(page) {
  return page.evaluate(() => {
    const game = window.__KANO_LIFE_GAME__;
    const start = document.querySelector('#start-screen');
    const hud = document.querySelector('#hud');
    const controls = document.querySelector('#drive-controls');
    const shown = (element) => {
      if (!element) return false;
      const style = getComputedStyle(element);
      return style.display !== 'none' && style.visibility !== 'hidden';
    };
    return Boolean(game?.state === 'PLAY' && start?.classList.contains('hidden')
      && shown(hud) && shown(controls) && window.__KANO_RENDER_MODE__);
  });
}

async function waitForStartOrPlayable(page, timeout = START_ACTION_TIMEOUT_MS) {
  try {
    await page.waitForFunction(() => {
      const button = document.querySelector('#start-btn');
      const game = window.__KANO_LIFE_GAME__;
      const start = document.querySelector('#start-screen');
      const hud = document.querySelector('#hud');
      const controls = document.querySelector('#drive-controls');
      const shown = (element) => {
        if (!element) return false;
        const style = getComputedStyle(element);
        const rect = element.getBoundingClientRect();
        return style.display !== 'none' && style.visibility !== 'hidden'
          && Number(style.opacity || 1) > 0 && rect.width > 0 && rect.height > 0;
      };
      const readyToDrive = Boolean(game?.state === 'PLAY' && start?.classList.contains('hidden')
        && shown(hud) && shown(controls) && window.__KANO_RENDER_MODE__);
      return readyToDrive || shown(button);
    }, null, { timeout });
  } catch (error) {
    throw new Error(`Neither the start button nor a playable state became available within ${timeout}ms. Diagnostics: ${JSON.stringify(await inspectPageState(page))}. ${error.message}`);
  }
}

// The production UI starts driving directly from START DRIVING. The story is
// optional behind REPLAY MORNING ROUTINE. Allow slower software-rendered 3D to
// show the start control; also accept a genuine already-playing state.
async function startDrivingRun(page, timeout = START_ACTION_TIMEOUT_MS) {
  await waitForApplicationReady(page, timeout);
  await waitForStartOrPlayable(page, timeout);
  if (!await isRunPlayable(page)) {
    const buttonVisible = await page.locator('#start-btn').isVisible().catch(() => false);
    if (!buttonVisible) {
      throw new Error(`START DRIVING is hidden and the game is not playable. Diagnostics: ${JSON.stringify(await inspectPageState(page))}`);
    }
    await page.locator('#start-btn').click({ timeout: Math.min(timeout, 15_000) });
  }
  await waitForPlayableRun(page, 'START DRIVING', Math.min(timeout, 30_000));
}

async function advanceOptionalMorningRoutine(page) {
  await waitForApplicationReady(page);
  const replay = page.locator('#kano-replay-morning-routine');
  await replay.waitFor({ state: 'visible', timeout: 10_000 });
  await replay.click({ timeout: 10_000 });
  try {
    await page.waitForFunction(() => {
      const screen = document.querySelector('#life-routine-screen');
      return Boolean(screen && !screen.classList.contains('hidden')
        && getComputedStyle(screen).display !== 'none');
    }, null, { timeout: 8_000 });
  } catch (error) {
    throw new Error(`REPLAY MORNING ROUTINE did not reveal the optional story. Diagnostics: ${JSON.stringify(await inspectPageState(page))}. ${error.message}`);
  }

  // Take the normal workday path: skip breakfast, proceed to the guarded park,
  // greet security, then inspect the parked keke and start the shift.
  const steps = [
    'WAKE UP · WASH AND DRESS',
    'HEAD OUT NOW',
    'WALK TO THE ROAD-SIDE STALL',
    'SKIP BREAKFAST',
    'CONTINUE TO THE PARK',
    'WALK TO THE GUARDED KEKE PARK',
    'GREET MALLAM SECURITY',
    'INSPECT KEKE · UNLOCK · START SHIFT',
  ];
  for (const name of steps) await clickMorningAction(page, name);
  await waitForPlayableRun(page, 'Completing the optional morning routine');
  return await page.evaluate(() => ({
    gameState: window.__KANO_LIFE_GAME__?.state || null,
    breakfastEaten: window.__KANO_LIFE_GAME__?.s?.breakfastEaten ?? null,
    routineHiddenAfterShift: Boolean(document.querySelector('#life-routine-screen')?.classList.contains('hidden')),
  }));
}

async function maybeResolveStreetEvent(page, counters) {
  const eventCard = page.locator('#event-card');
  if (!await eventCard.count()) return;
  const visible = await eventCard.evaluate((el) => !el.classList.contains('hidden') && getComputedStyle(el).display !== 'none');
  if (!visible) return;
  const buttons = eventCard.locator('#event-actions button');
  if (await buttons.count()) {
    await buttons.first().click({ timeout: 2_000 }).catch(() => {});
    counters.streetEventsResolved += 1;
    await sleep(200);
  }
}

async function recoverIfRunEnded(page, counters) {
  const over = page.locator('#over-screen');
  if (!await over.count()) return false;
  const visible = await over.evaluate((el) => !el.classList.contains('hidden') && getComputedStyle(el).display !== 'none');
  if (!visible) return false;

  await page.keyboard.up('ArrowUp').catch(() => {});
  const again = page.locator('#again-btn');
  await again.click({ timeout: 5_000 });
  await advanceMorningRoutineAfterRestart(page);
  counters.runRestarts += 1;
  await page.keyboard.down('ArrowUp');
  return true;
}

async function advanceMorningRoutineAfterRestart(page) {
  await waitForPlayableRun(page, 'Restarting the run');
}

async function runDrivingScenario(browser, baseURL, viewport, mode, withModels, inventory) {
  const viewportName = viewport.name;
  const scenarioName = `${viewportName}-${mode}-${withModels ? 'with-models' : 'without-models'}`;
  const screenshotPath = path.join(OUTPUT_DIR, `${scenarioName}.png`);
  const context = await browser.newContext({
    viewport: viewport.size,
    deviceScaleFactor: viewport.mobile ? 1 : 1,
    isMobile: viewport.mobile,
    hasTouch: viewport.mobile,
    serviceWorkers: 'block',
    reducedMotion: 'no-preference',
  });
  const page = await context.newPage();
  await installBrowserInstrumentation(page);

  let intentionalModelBlocking = !withModels;
  const telemetry = makeTelemetry(page, intentionalModelBlocking);
  const localApiFixtures = await installLocalPreviewApiFixtures(page);
  if (!withModels) {
    await page.route(/\.(?:glb|gltf|bin)(?:[?#]|$)/i, async (route) => {
      await route.abort('blockedbyclient').catch(() => {});
    });
  }

  const cdp = await context.newCDPSession(page);
  await cdp.send('Performance.enable').catch(() => {});
  const result = {
    scenario: scenarioName,
    viewport: viewport.size,
    mobile: viewport.mobile,
    requestedRenderMode: mode.toUpperCase(),
    withModels,
    localModelInventory: {
      assetFiles: inventory.fileCount,
      glbFiles: inventory.glbCount,
      totalMiB: inventory.mib,
      needsAssets: inventory.fileCount === 0,
    },
    durationTargetMs: DURATION_MS,
    completed: false,
    runtimeErrors: telemetry.data.consoleErrors,
    pageErrors: telemetry.data.pageErrors,
    failedRequests: telemetry.data.failedRequests,
    httpErrors: telemetry.data.httpErrors,
    modelRequests: telemetry.data.modelRequests,
    intentionalModelBlocks: telemetry.data.intentionalModelBlocks,
    expectedModelFallbackMessages: telemetry.data.expectedModelFallbackMessages,
    memorySamples: [],
    frameTime: null,
    runRestarts: 0,
    streetEventsResolved: 0,
    screenshot: asLocalPath(screenshotPath),
    actualRenderMode: null,
    canvas: null,
    viewportLayout: null,
    initialLoad: null,
    durationActuallyDrivenMs: 0,
    note: null,
    localApiFixtures,
  };

  try {
    const url = modeURL(baseURL, mode);
    const navStart = Date.now();
    await page.goto(url, { waitUntil: 'load', timeout: NAV_TIMEOUT_MS });
    await waitForApplicationReady(page, START_ACTION_TIMEOUT_MS);
    result.appReadyMs = Date.now() - navStart;
    result.initialLoad = await measureResourceTiming(page);

    // startDrivingRun handles both a visible start button and a restored/early
    // PLAY state, with a long enough budget for software-rendered desktop 3D.
    await startDrivingRun(page, START_ACTION_TIMEOUT_MS);
    result.gameStateAfterStart = await page.evaluate(() => window.__KANO_LIFE_GAME__?.state || null);
    const frameIndex = await page.evaluate(() => window.__KANO_AUDIT__?.frameIntervals?.length || 0);
    const startAt = Date.now();
    const stopAt = startAt + DURATION_MS;
    const telemetryStart = await getBrowserMetrics(cdp);
    result.memorySamples.push({ elapsedMs: 0, ...telemetryStart });

    await page.keyboard.down('ArrowUp');
    let nextSteerAt = startAt + 7_000;
    let steerLeftNext = true;
    let nextMemoryAt = startAt + 10_000;
    let nextReportAt = startAt + 1_000;

    while (Date.now() < stopAt) {
      const now = Date.now();
      await maybeResolveStreetEvent(page, result);
      await recoverIfRunEnded(page, result).catch((error) => {
        result.note = `Run recovery encountered an issue: ${error.message}`;
      });

      if (now >= nextSteerAt) {
        const key = steerLeftNext ? 'ArrowLeft' : 'ArrowRight';
        await page.keyboard.press(key).catch(() => {});
        steerLeftNext = !steerLeftNext;
        nextSteerAt = now + 7_000;
      }

      if (now >= nextMemoryAt) {
        result.memorySamples.push({
          elapsedMs: now - startAt,
          ...(await getBrowserMetrics(cdp)),
        });
        nextMemoryAt = now + 10_000;
      }

      if (now >= nextReportAt) {
        result.durationActuallyDrivenMs = now - startAt;
        nextReportAt = now + 1_000;
      }
      await sleep(200);
    }
    await page.keyboard.up('ArrowUp').catch(() => {});
    await maybeResolveStreetEvent(page, result);
    result.durationActuallyDrivenMs = Date.now() - startAt;
    result.memorySamples.push({
      elapsedMs: result.durationActuallyDrivenMs,
      ...(await getBrowserMetrics(cdp)),
    });

    result.frameTime = await page.evaluate((index) => {
      const values = (window.__KANO_AUDIT__?.frameIntervals || []).slice(index);
      return values;
    }, frameIndex).then(summarizeFrames);

    result.actualRenderMode = await page.evaluate(() => window.__KANO_RENDER_MODE__ || 'NOT_REPORTED').catch(() => 'PAGE_UNAVAILABLE');
    result.canvas = await page.locator('#game-canvas').evaluate((canvas) => ({
      width: canvas.width,
      height: canvas.height,
      cssWidth: Number(canvas.getBoundingClientRect().width.toFixed(1)),
      cssHeight: Number(canvas.getBoundingClientRect().height.toFixed(1)),
      renderModeReportedByGame: window.__KANO_RENDER_MODE__ || null,
    })).catch(() => null);
    result.viewportLayout = await page.evaluate(() => ({
      innerWidth: window.innerWidth,
      innerHeight: window.innerHeight,
      documentWidth: document.documentElement.scrollWidth,
      documentHeight: document.documentElement.scrollHeight,
      horizontalOverflow: document.documentElement.scrollWidth > window.innerWidth + 1,
      canvasPresent: Boolean(document.querySelector('#game-canvas')),
      hudVisible: (() => {
        const hud = document.querySelector('#hud');
        return Boolean(hud && getComputedStyle(hud).display !== 'none');
      })(),
      score: document.querySelector('#score')?.textContent?.trim() || null,
      distanceKm: document.querySelector('#distance')?.textContent?.trim() || null,
      speedKmh: document.querySelector('#speed')?.textContent?.trim() || null,
      overScreenVisible: (() => {
        const el = document.querySelector('#over-screen');
        return Boolean(el && !el.classList.contains('hidden') && getComputedStyle(el).display !== 'none');
      })(),
    })).catch(() => null);

    const firstHeap = result.memorySamples.find((sample) => Number.isFinite(sample.jsHeapUsedBytes))?.jsHeapUsedBytes;
    const lastHeap = [...result.memorySamples].reverse().find((sample) => Number.isFinite(sample.jsHeapUsedBytes))?.jsHeapUsedBytes;
    result.memoryGrowthBytes = Number.isFinite(firstHeap) && Number.isFinite(lastHeap) ? lastHeap - firstHeap : null;
    result.memoryGrowthMiB = Number.isFinite(result.memoryGrowthBytes)
      ? Number((result.memoryGrowthBytes / (1024 * 1024)).toFixed(2))
      : null;

    await page.screenshot({ path: screenshotPath, animations: 'disabled', fullPage: false }).catch((error) => {
      result.screenshotError = error.message;
    });
    result.completed = true;
  } catch (error) {
    result.error = error.message;
    result.note ||= 'Scenario did not complete; inspect the error and console/request logs.';
    result.failureSnapshot = await inspectPageState(page);
    result.actualRenderMode = result.failureSnapshot?.renderMode || null;
    result.canvas = result.failureSnapshot?.canvas || null;
    result.frameTime = await page.evaluate(() => window.__KANO_AUDIT__?.frameIntervals || [])
      .then(summarizeFrames).catch(() => summarizeFrames([]));
    result.durationActuallyDrivenMs = 0;
    await page.screenshot({ path: screenshotPath, animations: 'disabled', fullPage: false }).catch((screenshotError) => {
      result.screenshotError = screenshotError.message;
    });
  } finally {
    result.runtimeErrors = telemetry.data.consoleErrors;
    result.pageErrors = telemetry.data.pageErrors;
    result.failedRequests = telemetry.data.failedRequests;
    result.httpErrors = telemetry.data.httpErrors;
    result.modelRequests = [...new Set(telemetry.data.modelRequests)];
    result.modelResponses = telemetry.data.modelResponses;
    result.intentionalModelBlocks = telemetry.data.intentionalModelBlocks;
    result.expectedModelFallbackMessages = telemetry.data.expectedModelFallbackMessages;
    result.requestCount = telemetry.data.requests.length;
    result.unexpectedFailedRequestCount = result.failedRequests.length;
    result.consoleErrorCount = result.runtimeErrors.length;
    result.pageErrorCount = result.pageErrors.length;
    result.httpErrorCount = result.httpErrors.length;
    result.auditClean = Boolean(
      result.completed
      && result.consoleErrorCount === 0
      && result.pageErrorCount === 0
      && result.unexpectedFailedRequestCount === 0
      && result.httpErrorCount === 0
    );
    result.modelRequestCount = result.modelRequests.length;
    result.blockedModelRequestCount = result.intentionalModelBlocks.length;
    await cdp.detach().catch(() => {});
    await context.close().catch(() => {});
  }
  return result;
}

async function runThrottleScenario(browser, baseURL, profile) {
  const name = `first-load-${profile.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;
  const screenshotPath = path.join(OUTPUT_DIR, `${name}.png`);
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    serviceWorkers: 'block',
    reducedMotion: 'no-preference',
  });
  const page = await context.newPage();
  await installBrowserInstrumentation(page);
  const telemetry = makeTelemetry(page, false);
  const localApiFixtures = await installLocalPreviewApiFixtures(page);
  const cdp = await context.newCDPSession(page);
  await cdp.send('Network.enable');
  await cdp.send('Performance.enable').catch(() => {});
  await cdp.send('Network.emulateNetworkConditions', {
    offline: false,
    latency: profile.latencyMs,
    downloadThroughput: profile.downloadBitsPerSecond / 8,
    uploadThroughput: profile.uploadBitsPerSecond / 8,
    connectionType: profile.connectionType,
  });

  const result = {
    profile: profile.name,
    parameters: {
      latencyMs: profile.latencyMs,
      downloadMbps: profile.downloadBitsPerSecond / 1_000_000,
      uploadMbps: profile.uploadBitsPerSecond / 1_000_000,
      modelFilesEnabled: true,
    },
    completed: false,
    screenshot: asLocalPath(screenshotPath),
    localApiFixtures,
    consoleErrors: telemetry.data.consoleErrors,
    pageErrors: telemetry.data.pageErrors,
    failedRequests: telemetry.data.failedRequests,
    httpErrors: telemetry.data.httpErrors,
    modelRequests: telemetry.data.modelRequests,
    modelResponses: telemetry.data.modelResponses,
  };

  try {
    const url = modeURL(baseURL, '3d');
    const start = Date.now();
    await page.goto(url, { waitUntil: 'load', timeout: NAV_TIMEOUT_MS });
    result.timeToPageLoadMs = Date.now() - start;
    await waitForApplicationReady(page, START_ACTION_TIMEOUT_MS);
    await waitForStartOrPlayable(page, START_ACTION_TIMEOUT_MS);
    result.timeToAppReadyMs = Date.now() - start;
    result.navigationTiming = await page.evaluate(() => {
      const nav = performance.getEntriesByType('navigation')[0];
      return nav ? {
        responseStartMs: Number(nav.responseStart.toFixed(1)),
        domContentLoadedMs: Number(nav.domContentLoadedEventEnd.toFixed(1)),
        loadEventMs: Number(nav.loadEventEnd.toFixed(1)),
      } : null;
    });
    await sleep(THROTTLE_SETTLE_MS);
    result.resourceTiming = await measureResourceTiming(page);
    result.modelRequestCount = telemetry.data.modelRequests.length;
    result.successfulModelResponses = telemetry.data.modelResponses.filter((item) => item.status >= 200 && item.status < 400).length;
    result.runtimeMode = await page.evaluate(() => window.__KANO_RENDER_MODE__ || 'NOT_REPORTED').catch(() => 'PAGE_UNAVAILABLE');
    await page.screenshot({ path: screenshotPath, animations: 'disabled', fullPage: false }).catch((error) => {
      result.screenshotError = error.message;
    });
    result.completed = true;
  } catch (error) {
    result.error = error.message;
    await page.screenshot({ path: screenshotPath, animations: 'disabled', fullPage: false }).catch(() => {});
  } finally {
    result.consoleErrors = telemetry.data.consoleErrors;
    result.pageErrors = telemetry.data.pageErrors;
    result.failedRequests = telemetry.data.failedRequests;
    result.httpErrors = telemetry.data.httpErrors;
    result.modelRequests = [...new Set(telemetry.data.modelRequests)];
    result.modelResponses = telemetry.data.modelResponses;
    result.requestCount = telemetry.data.requests.length;
    result.intentionalModelBlocks = telemetry.data.intentionalModelBlocks;
    await cdp.send('Network.emulateNetworkConditions', {
      offline: false,
      latency: 0,
      downloadThroughput: -1,
      uploadThroughput: -1,
    }).catch(() => {});
    await cdp.detach().catch(() => {});
    await context.close().catch(() => {});
  }
  return result;
}

async function runMorningRoutineSmoke(browser, baseURL) {
  const screenshotPath = path.join(OUTPUT_DIR, 'morning-routine-smoke.png');
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    serviceWorkers: 'block',
    reducedMotion: 'no-preference',
  });
  const page = await context.newPage();
  await installBrowserInstrumentation(page);
  const telemetry = makeTelemetry(page, false);
  const localApiFixtures = await installLocalPreviewApiFixtures(page);
  const result = {
    completed: false,
    screenshot: asLocalPath(screenshotPath),
    localApiFixtures,
    consoleErrors: telemetry.data.consoleErrors,
    pageErrors: telemetry.data.pageErrors,
    failedRequests: telemetry.data.failedRequests,
    httpErrors: telemetry.data.httpErrors,
  };
  try {
    await page.goto(modeURL(baseURL, '2d'), { waitUntil: 'load', timeout: NAV_TIMEOUT_MS });
    await waitForApplicationReady(page, 45_000);
    result.appReady = true;
    result.transition = await advanceOptionalMorningRoutine(page);
    await page.screenshot({ path: screenshotPath, animations: 'disabled', fullPage: false });
    result.completed = result.transition.gameState === 'PLAY'
      && result.transition.routineHiddenAfterShift === true
      && result.transition.breakfastEaten === false;
  } catch (error) {
    result.error = error.message;
    result.failureSnapshot = await inspectPageState(page);
    await page.screenshot({ path: screenshotPath, animations: 'disabled', fullPage: false }).catch(() => {});
  } finally {
    result.consoleErrors = telemetry.data.consoleErrors;
    result.pageErrors = telemetry.data.pageErrors;
    result.failedRequests = telemetry.data.failedRequests;
    result.httpErrors = telemetry.data.httpErrors;
    await context.close().catch(() => {});
  }
  return result;
}

function markdownTable(headers, rows) {
  const escape = (value) => String(value ?? '—').replaceAll('|', '\\|').replaceAll('\n', ' ');
  return [
    `| ${headers.join(' | ')} |`,
    `| ${headers.map(() => '---').join(' | ')} |`,
    ...rows.map((row) => `| ${row.map(escape).join(' | ')} |`),
  ].join('\n');
}

function generateMarkdown(report) {
  const scenarioRows = report.scenarios.map((item) => [
    item.scenario,
    item.completed ? (item.auditClean ? 'CLEAN' : 'completed with errors') : 'INCOMPLETE',
    item.actualRenderMode || '—',
    item.frameTime?.medianFrameMs ?? '—',
    item.frameTime?.p95FrameMs ?? '—',
    item.memoryGrowthMiB ?? '—',
    item.consoleErrorCount ?? '—',
    item.expectedModelFallbackMessages?.length ?? 0,
    item.pageErrorCount ?? '—',
    item.unexpectedFailedRequestCount ?? '—',
    item.httpErrorCount ?? '—',
    item.screenshot || '—',
  ]);
  const throttleRows = report.throttledFirstLoads.map((item) => [
    item.profile,
    item.completed ? 'completed' : 'INCOMPLETE',
    item.timeToPageLoadMs ?? '—',
    item.resourceTiming?.resourceCount ?? '—',
    item.resourceTiming?.totalTransferredMiB ?? '—',
    item.resourceTiming?.totalEncodedBodyMiB ?? '—',
    item.modelRequestCount ?? '—',
    item.consoleErrors?.length ?? '—',
    item.pageErrors?.length ?? '—',
    item.failedRequests?.length ?? '—',
    item.screenshot || '—',
  ]);

  return `# Kano Life — Browser Audit\n\n- **Run:** ${report.runId}\n- **Build under test:** local \`dist/\` served by Vite Preview unless \`KANO_AUDIT_BASE_URL\` was provided.\n- **Asset inventory:** ${report.assetInventory.fileCount} GLB/GLTF/bin files (${report.assetInventory.mib} MiB); ${report.assetInventory.glbCount} GLB.\n- **Duration:** ${report.durationTargetMs / 1000}s per desktop/phone × 2D/3D × model-on/off driving scenario.\n- **Model status:** ${report.assetInventory.fileCount > 0 ? 'real local model files detected' : '**needs assets** — no files found beneath public/assets/models at audit time'}.\n- **Browser:** ${report.browserVersion || 'unknown'}\n\n## Driving matrix\n\n${markdownTable(['Scenario', 'Status', 'Actual mode', 'Median frame ms', 'P95 frame ms', 'Heap change MiB', 'Console errors', 'Expected blocked-model messages', 'Page errors', 'Failed requests', 'HTTP errors', 'Screenshot'], scenarioRows)}\n\n## Scenario failure details\n\n${report.scenarios.filter((item) => item.error).map((item) => `### ${item.scenario}\n\n- **Failure:** ${String(item.error).replaceAll('\\n', ' ')}\n- **Mode at failure:** ${item.failureSnapshot?.renderMode || 'not reported'}\n- **Routine visible:** ${item.failureSnapshot?.routineVisible ?? 'unknown'}\n- **Current step:** ${item.failureSnapshot?.currentStep || '—'}\n- **Available actions:** ${(item.failureSnapshot?.availableActions || []).map((action) => `${action.text}${action.disabled ? ' (disabled)' : ''}${action.visible ? '' : ' (hidden)'}`).join('; ') || '—'}\n- **First console errors:** ${(item.runtimeErrors || []).slice(0, 3).map((entry) => entry.text).join(' | ') || '—'}\n- **First HTTP errors:** ${(item.httpErrors || []).slice(0, 5).map((entry) => `${entry.status} ${entry.url}`).join(' | ') || '—'}\n`).join('\\n') || 'No scenario setup failures were recorded.'}\n\n## Optional morning routine smoke\n\n- **Status:** ${report.morningRoutineSmoke ? (report.morningRoutineSmoke.completed ? 'PASS' : 'FAIL') : 'not run'}\n- **App bootstrap ready:** ${report.morningRoutineSmoke?.appReady ?? false}\n- **Final game state:** ${report.morningRoutineSmoke?.transition?.gameState || '—'}\n- **Skipped breakfast remains false:** ${report.morningRoutineSmoke?.transition?.breakfastEaten === false}\n- **Routine hidden after shift starts:** ${report.morningRoutineSmoke?.transition?.routineHiddenAfterShift ?? '—'}\n- **Failure:** ${report.morningRoutineSmoke?.error ? String(report.morningRoutineSmoke.error).replaceAll('\n', ' ') : '—'}\n- **Screenshot:** ${report.morningRoutineSmoke?.screenshot || '—'}\n\n## Cold first-load throttling\n\n${markdownTable(['Profile', 'Status', 'Navigation load ms', 'Resources', 'Transferred MiB', 'Encoded body MiB', 'Model requests', 'Console errors', 'Page errors', 'Failed requests', 'Screenshot'], throttleRows)}\n\n## Notes\n\n- Frame timing samples use a separate requestAnimationFrame sampler in the page. Median FPS is approximately \`1000 / median frame time\`; it is a browser-level estimate, not a physical-device benchmark.\n- Heap change is Chromium CDP's \`JSHeapUsedSize\` end minus start after the game shift begins. Negative values can occur after garbage collection.\n- The no-model scenarios intentionally abort GLB/GLTF/binary model requests. Those aborted model requests and generic Chromium \`ERR_FAILED\`/GLTF-loader messages are reported separately as expected fallback noise; unexpected non-model failed requests and HTTP errors still prevent a clean result.\n- Resource Timing transfer sizes can be zero for cross-origin resources without Timing-Allow-Origin and may not include late requests occurring after the settle window.\n- Screenshots and the complete raw JSON are beside this report. Inspect \`httpErrors\`, \`consoleErrors\`, and \`pageErrors\` in the JSON before declaring a scenario clean.\n`;
}

async function main() {
  await fs.mkdir(OUTPUT_DIR, { recursive: true });
  const assetInventory = await inspectAssetInventory();
  const { baseURL, child } = await launchPreviewIfNeeded();
  let browser;
  const report = {
    runId: RUN_ID,
    createdAt: new Date().toISOString(),
    baseURL,
    durationTargetMs: DURATION_MS,
    throttleSettleMs: THROTTLE_SETTLE_MS,
    assetInventory,
    scenarios: [],
    morningRoutineSmoke: null,
    throttledFirstLoads: [],
    limitations: [],
  };

  if (assetInventory.fileCount === 0) {
    report.limitations.push('No GLB/GLTF/bin files were found under public/assets/models. Real-model results are needs assets; the no-model fallback scenarios are still useful.');
  }
  if (EXTERNAL_BASE_URL) {
    report.limitations.push('KANO_AUDIT_BASE_URL was supplied. The script audited that URL, not necessarily the just-built local dist output.');
  }

  try {
    browser = await chromium.launch({
      headless: true,
      args: [
        '--enable-webgl',
        '--ignore-gpu-blocklist',
        '--use-gl=angle',
        '--use-angle=swiftshader',
        '--disable-dev-shm-usage',
      ],
    });
    report.browserVersion = browser.version();

    const viewports = [
      { name: 'desktop', size: { width: 1440, height: 900 }, mobile: false },
      { name: 'phone', size: { width: 390, height: 844 }, mobile: true },
    ];
    for (const viewport of viewports) {
      for (const mode of ['2d', '3d']) {
        for (const withModels of [true, false]) {
          const result = await runDrivingScenario(browser, baseURL, viewport, mode, withModels, assetInventory);
          report.scenarios.push(result);
          console.log(`[Browser Audit] ${result.completed ? (result.auditClean ? 'CLEAN' : 'DONE_WITH_ERRORS') : 'INCOMPLETE'} ${result.scenario}: ` +
            `mode=${result.actualRenderMode || 'unknown'}, frames=${result.frameTime?.samples ?? 0}, ` +
            `console=${result.consoleErrorCount ?? 0}, page=${result.pageErrorCount ?? 0}, ` +
            `failedRequests=${result.unexpectedFailedRequestCount ?? 0}, ` +
            `expectedModelFallback=${result.expectedModelFallbackMessages?.length ?? 0}`);
          if (result.error) console.error(`[Browser Audit] ${result.scenario} failure: ${result.error}`);
          if (result.httpErrors?.length) console.error(`[Browser Audit] ${result.scenario} HTTP errors (first 5): ${result.httpErrors.slice(0, 5).map((item) => `${item.status} ${item.url}`).join(' | ')}`);
        }
      }
    }

    report.morningRoutineSmoke = await runMorningRoutineSmoke(browser, baseURL);
    console.log(`[Browser Audit] ${report.morningRoutineSmoke.completed ? 'PASS' : 'FAIL'} optional morning routine smoke: ` +
      `state=${report.morningRoutineSmoke.transition?.gameState || 'unknown'}, ` +
      `skippedBreakfast=${report.morningRoutineSmoke.transition?.breakfastEaten === false}`);
    if (report.morningRoutineSmoke.error) console.error(`[Browser Audit] Morning routine smoke failure: ${report.morningRoutineSmoke.error}`);

    const profiles = [
      {
        name: 'Fast 3G',
        latencyMs: 150,
        downloadBitsPerSecond: 1_600_000,
        uploadBitsPerSecond: 750_000,
        connectionType: 'cellular3g',
      },
      {
        name: 'Slow 4G',
        latencyMs: 20,
        downloadBitsPerSecond: 4_000_000,
        uploadBitsPerSecond: 3_000_000,
        connectionType: 'cellular4g',
      },
    ];
    for (const profile of profiles) {
      const result = await runThrottleScenario(browser, baseURL, profile);
      report.throttledFirstLoads.push(result);
      console.log(`[Browser Audit] ${result.completed ? 'DONE' : 'INCOMPLETE'} ${profile.name}: ` +
        `navLoad=${result.timeToPageLoadMs ?? 'n/a'}ms, appReady=${result.timeToAppReadyMs ?? 'n/a'}ms, transfer=${result.resourceTiming?.totalTransferredMiB ?? 'n/a'}MiB, ` +
        `failedRequests=${result.failedRequests?.length ?? 0}`);
    }
  } finally {
    await browser?.close().catch(() => {});
    if (child && child.exitCode === null) child.kill();
  }

  report.outputDirectory = asLocalPath(OUTPUT_DIR);
  report.scenarioCount = report.scenarios.length;
  report.completedScenarioCount = report.scenarios.filter((item) => item.completed).length;
  report.completedThrottleCount = report.throttledFirstLoads.filter((item) => item.completed).length;
  report.morningRoutineSmokePassed = Boolean(report.morningRoutineSmoke?.completed);
  report.summaryPath = asLocalPath(path.join(OUTPUT_DIR, 'summary.md'));
  report.jsonPath = asLocalPath(path.join(OUTPUT_DIR, 'report.json'));

  await fs.writeFile(path.join(OUTPUT_DIR, 'report.json'), JSON.stringify(report, null, 2));
  await fs.writeFile(path.join(OUTPUT_DIR, 'summary.md'), generateMarkdown(report));

  console.log('\n[Browser Audit] Finished.');
  console.log(`[Browser Audit] Scenarios: ${report.completedScenarioCount}/${report.scenarioCount} completed; ${report.scenarios.filter((item) => item.auditClean).length} clean`);
  console.log(`[Browser Audit] Throttled first-load profiles: ${report.completedThrottleCount}/${report.throttledFirstLoads.length}`);
  console.log(`[Browser Audit] Optional morning routine smoke: ${report.morningRoutineSmokePassed ? 'PASS' : 'FAIL'}`);
  console.log(`[Browser Audit] Report: ${report.jsonPath}`);
  console.log(`[Browser Audit] Summary: ${report.summaryPath}`);
  console.log(`[Browser Audit] Screenshots: ${report.outputDirectory}`);
  if (assetInventory.fileCount === 0) {
    console.log('[Browser Audit] NEEDS ASSETS: no model files were found under public/assets/models.');
  }
}

main().catch((error) => {
  console.error(`[Browser Audit] Fatal error: ${error.stack || error.message}`);
  process.exitCode = 1;
});
