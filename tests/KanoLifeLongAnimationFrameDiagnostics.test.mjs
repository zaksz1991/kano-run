import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import vm from 'node:vm';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const source = await readFile(path.join(ROOT, 'js/KanoLifeRuntimeAudit.js'), 'utf8');

function makeAudit(supportedEntryTypes = ['longtask', 'long-animation-frame']) {
  const observers = [];
  const listeners = new Map();
  class FakePerformanceObserver {
    constructor(callback) { this.callback = callback; this.options = null; observers.push(this); }
    observe(options) { this.options = options; }
  }
  FakePerformanceObserver.supportedEntryTypes = supportedEntryTypes;
  const window = {
    location: {
      href: 'https://kano-run.vercel.app/?private=do-not-export',
      origin: 'https://kano-run.vercel.app',
      pathname: '/',
      search: '?private=do-not-export',
    },
    addEventListener(type, callback) {
      const rows = listeners.get(type) || [];
      rows.push(callback); listeners.set(type, rows);
    },
    dispatchEvent() { return true; },
    setTimeout() { return 1; },
    clearTimeout() {},
  };
  const document = {
    querySelectorAll() { return []; },
    getElementById() { return null; },
    querySelector() { return null; },
    addEventListener() {},
    body: {},
  };
  class FakeCustomEvent { constructor(type, options = {}) { this.type = type; this.detail = options.detail; } }
  const context = {
    window, document,
    PerformanceObserver: FakePerformanceObserver,
    CustomEvent: FakeCustomEvent,
    URL, Date, Map, Object, Number, String, Boolean, Array, Math, JSON,
    Blob: class {},
    console: { info() {}, warn() {}, error() {} },
  };
  vm.runInNewContext(source, context, { filename: 'KanoLifeRuntimeAudit.js' });
  return { audit: window.kanoLifeRuntimeAudit, observers, window, listeners };
}

test('runtime audit captures long-animation-frame script attribution without query strings', () => {
  const { audit, observers } = makeAudit();
  const observer = observers.find(item => item.options?.type === 'long-animation-frame');
  assert.ok(observer, 'LoAF observer should be registered when supported');
  observer.callback({ getEntries: () => [{
    duration: 383.7,
    startTime: 100,
    blockingDuration: 300.4,
    renderStart: 290,
    styleAndLayoutStart: 315,
    scripts: [{
      sourceURL: 'https://kano-run.vercel.app/assets/main-Bake-y07.js?private=do-not-export',
      sourceFunctionName: 'mountHouseholdPanel',
      invoker: 'Window.requestAnimationFrame',
      invokerType: 'user-callback',
      duration: 345.8,
      forcedStyleAndLayoutDuration: 9.2,
      pauseDuration: 0,
      sourceCharPosition: 259,
    }],
  }] });
  const snapshot = JSON.parse(JSON.stringify(audit.snapshot()));
  assert.equal(snapshot.performanceCapabilities.longAnimationFrames, true);
  assert.equal(snapshot.issueSummary.longAnimationFrames, 1);
  assert.equal(snapshot.longAnimationFrames[0].durationMs, 383.7);
  assert.equal(snapshot.longAnimationFrames[0].scripts[0].source, '/assets/main-Bake-y07.js');
  assert.equal(snapshot.longAnimationFrames[0].scripts[0].functionName, 'mountHouseholdPanel');
  assert.equal(snapshot.longAnimationFrames[0].scripts[0].sourceCharPosition, 259);
  assert.doesNotMatch(JSON.stringify(snapshot), /do-not-export/);
});

test('runtime audit safely omits LoAF observer when the browser does not support it', () => {
  const { audit, observers } = makeAudit(['longtask']);
  assert.equal(observers.some(item => item.options?.type === 'long-animation-frame'), false);
  const snapshot = JSON.parse(JSON.stringify(audit.snapshot()));
  assert.equal(snapshot.performanceCapabilities.longAnimationFrames, false);
  assert.deepEqual(snapshot.longAnimationFrames, []);
});

test('runtime audit bounds frame history and per-frame script attribution', () => {
  const { audit, observers } = makeAudit();
  const observer = observers.find(item => item.options?.type === 'long-animation-frame');
  assert.ok(observer);
  observer.callback({ getEntries: () => Array.from({ length: 36 }, (_, index) => ({
    duration: 150 + index,
    startTime: index,
    blockingDuration: index,
    scripts: Array.from({ length: 12 }, (__, scriptIndex) => ({
      sourceURL: `https://kano-run.vercel.app/assets/chunk-${scriptIndex}-abcdef12.js?x=${index}`,
      sourceFunctionName: `task${scriptIndex}`,
      duration: 10 + scriptIndex,
      sourceCharPosition: scriptIndex,
    })),
  })) });
  const snapshot = JSON.parse(JSON.stringify(audit.snapshot()));
  assert.equal(snapshot.longAnimationFrames.length, 30);
  assert.equal(snapshot.longAnimationFrames[0].scripts.length, 8);
  assert.equal(snapshot.longAnimationFrames.at(-1).durationMs, 185);
  assert.doesNotMatch(JSON.stringify(snapshot), /\?x=/);
});
