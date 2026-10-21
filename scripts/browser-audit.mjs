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
    if (modelsBlocked && MODEL_EXTENSION.test(item.text)) {
      data.expectedModelFallbackMessages.push(item);
    } else {
      data.consoleErrors.push(item);
    }
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

async function clickMorningAction(page, name, timeout = 20_000) {
  // Buttons are siblings inside #life-actions, not nested inside one another.
  const button = page.locator('#life-actions').getByRole('button', { name, exact: true });
  try {
    await button.waitFor({ state: 'visible', timeout });
    await button.click();
  } catch (error) {
    const diagnostics = await page.evaluate(() => ({
      routineVisible: (() => {
        const el = document.querySelector('#life-routine-screen');
        return Boolean(el && !el.classList.contains('hidden') && getComputedStyle(el).display !== 'none');
      })(),
      currentStep: document.querySelector('#life-step-label')?.textContent?.trim() || null,
      currentTitle: document.querySelector('#life-title')?.textContent?.trim() || null,
      availableActions: Array.from(document.querySelectorAll('#life-actions button')).map((el) => ({
        text: el.textContent?.trim() || '',
        disabled: Boolean(el.disabled),
      })),
      renderMode: window.__KANO_RENDER_MODE__ || null,
      pageReady: document.readyState,
    })).catch(() => null);
    throw new Error(`Morning routine action "${name}" failed. Diagnostics: ${JSON.stringify(diagnostics)}. ${error.message}`);
  }
}

async function advanceMorningRoutine(page) {
  await page.locator('#start-btn').click({ timeout: 30_000 });
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

  for (const name of steps) {
    await clickMorningAction(page, name);
  }

  await page.waitForFunction(() => {
    const hud = document.querySelector('#hud');
    return Boolean(
      window.__KANO_RENDER_MODE__
      && hud
      && getComputedStyle(hud).display !== 'none',
    );
  }, null, { timeout: 30_000 });
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
  const routineVisible = await page.locator('#life-routine-screen').evaluate((el) =>
    !el.classList.contains('hidden') && getComputedStyle(el).display !== 'none',
  ).catch(() => false);
  if (!routineVisible) {
    await advanceMorningRoutine(page);
    return;
  }

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
  for (const name of steps) {
    await clickMorningAction(page, name);
  }
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
  };

  try {
    const url = modeURL(baseURL, mode);
    const navStart = Date.now();
    await page.goto(url, { waitUntil: 'load', timeout: NAV_TIMEOUT_MS });
    await page.locator('#start-btn').waitFor({ state: 'visible', timeout: 30_000 });
    result.appReadyMs = Date.now() - navStart;
    result.initialLoad = await measureResourceTiming(page);

    await advanceMorningRoutine(page);
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
    await page.screenshot({ path: screenshotPath, animations: 'disabled', fullPage: false }).catch(() => {});
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
    await page.locator('#start-btn').waitFor({ state: 'visible', timeout: 45_000 });
    result.timeToPageLoadMs = Date.now() - start;
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

  return `# Kano Life — Browser Audit\n\n- **Run:** ${report.runId}\n- **Build under test:** local \`dist/\` served by Vite Preview unless \`KANO_AUDIT_BASE_URL\` was provided.\n- **Asset inventory:** ${report.assetInventory.fileCount} GLB/GLTF/bin files (${report.assetInventory.mib} MiB); ${report.assetInventory.glbCount} GLB.\n- **Duration:** ${report.durationTargetMs / 1000}s per desktop/phone × 2D/3D × model-on/off scenario.\n- **Model status:** ${report.assetInventory.fileCount > 0 ? 'real local model files detected' : '**needs assets** — no files found beneath public/assets/models at audit time'}.\n- **Browser:** ${report.browserVersion || 'unknown'}\n\n## Driving matrix\n\n${markdownTable(['Scenario', 'Status', 'Actual mode', 'Median frame ms', 'P95 frame ms', 'Heap change MiB', 'Console errors', 'Page errors', 'Failed requests', 'HTTP errors', 'Screenshot'], scenarioRows)}\n\n## Cold first-load throttling\n\n${markdownTable(['Profile', 'Status', 'Time to load ms', 'Resources', 'Transferred MiB', 'Encoded body MiB', 'Model requests', 'Console errors', 'Page errors', 'Failed requests', 'Screenshot'], throttleRows)}\n\n## Notes\n\n- Frame timing samples use a separate requestAnimationFrame sampler in the page. Median FPS is approximately \`1000 / median frame time\`; it is a browser-level estimate, not a physical-device benchmark.\n- Heap change is Chromium CDP's \`JSHeapUsedSize\` end minus start after the game shift begins. Negative values can occur after garbage collection.\n- The no-model scenarios intentionally abort GLB/GLTF/binary model requests. Those aborted model requests are reported separately from unexpected failed requests.\n- Resource Timing transfer sizes can be zero for cross-origin resources without Timing-Allow-Origin and may not include late requests occurring after the settle window.\n- Screenshots and the complete raw JSON are beside this report. Inspect \`httpErrors\`, \`consoleErrors\`, and \`pageErrors\` in the JSON before declaring a scenario clean.\n`;
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
            `failedRequests=${result.unexpectedFailedRequestCount ?? 0}`);
        }
      }
    }

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
        `pageLoad=${result.timeToPageLoadMs ?? 'n/a'}ms, transfer=${result.resourceTiming?.totalTransferredMiB ?? 'n/a'}MiB, ` +
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
  report.summaryPath = asLocalPath(path.join(OUTPUT_DIR, 'summary.md'));
  report.jsonPath = asLocalPath(path.join(OUTPUT_DIR, 'report.json'));

  await fs.writeFile(path.join(OUTPUT_DIR, 'report.json'), JSON.stringify(report, null, 2));
  await fs.writeFile(path.join(OUTPUT_DIR, 'summary.md'), generateMarkdown(report));

  console.log('\n[Browser Audit] Finished.');
  console.log(`[Browser Audit] Scenarios: ${report.completedScenarioCount}/${report.scenarioCount} completed; ${report.scenarios.filter((item) => item.auditClean).length} clean`);
  console.log(`[Browser Audit] Throttled first-load profiles: ${report.completedThrottleCount}/${report.throttledFirstLoads.length}`);
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
