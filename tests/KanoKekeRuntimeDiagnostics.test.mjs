import test from 'node:test';
import assert from 'node:assert/strict';
import {
  shouldEnableKekeRuntimeDiagnostics,
  formatKekeRuntimeDiagnosticText,
  createKekeRuntimeDiagnostics,
} from '../js/KanoKekeRuntimeDiagnostics.js';

function makeElement(tag) {
  return {
    tagName: tag,
    style: {},
    attributes: {},
    children: [],
    textContent: '',
    setAttribute(key, value) { this.attributes[key] = value; },
    appendChild(node) { node.parentNode = this; this.children.push(node); return node; },
    removeChild(node) { const i = this.children.indexOf(node); if (i >= 0) this.children.splice(i, 1); node.parentNode = null; return node; },
    addEventListener(type, callback) { this[`on${type}`] = callback; },
    click() { this.onclick?.(); },
    focus() {}, select() {},
  };
}

function makeDocument() {
  const children = [];
  const body = {
    appendChild(node) { node.parentNode = this; children.push(node); return node; },
    removeChild(node) { const i = children.indexOf(node); if (i >= 0) children.splice(i, 1); node.parentNode = null; return node; },
  };
  return { children, body, createElement: makeElement, execCommand: () => false };
}

const sampleSnapshot = {
  scene: 'road',
  renderer: { mobile: true, tier: 'mid', canvasSize: '900x1600 (360x640 CSS)', pixelRatio: 1.25 },
  player: {
    name: 'PLAYER_KEKE', model: 'assets/keke.glb', fallback: true, visible: true,
    visiblePath: true, parent: 'scene', position: { x: 0, y: 0, z: 2 },
    worldPosition: { x: 0, y: 0, z: 2 }, scale: { x: 1, y: 1, z: 1 },
  },
  health: { ok: true, reason: 'healthy', renderability: { renderableMeshCount: 7 }, structural: { ok: true } },
  renderability: { renderableMeshCount: 7 },
  structural: { ok: true },
  recoveryCount: 1,
  lastEvent: { phase: 'runtime-recovery', reason: 'no-visible-renderable-meshes', rejectedModel: 'pedestrian.glb', at: '2026-10-23T00:00:00.000Z' },
};

test('Keke diagnostics stays disabled unless the explicit query flag is set', () => {
  assert.equal(shouldEnableKekeRuntimeDiagnostics(''), false);
  assert.equal(shouldEnableKekeRuntimeDiagnostics('?debugKeke=0'), false);
  assert.equal(shouldEnableKekeRuntimeDiagnostics('?debugKeke=true'), false);
  assert.equal(shouldEnableKekeRuntimeDiagnostics('?debugKeke=1'), true);
  assert.equal(shouldEnableKekeRuntimeDiagnostics('?foo=1&debugKeke=1'), true);
});

test('diagnostic report includes vehicle, visibility, structure, transform and recovery information', () => {
  const report = formatKekeRuntimeDiagnosticText(sampleSnapshot);
  assert.match(report, /Scene: road \| Device: mid/);
  assert.match(report, /Model: assets\/keke\.glb/);
  assert.match(report, /Visible path: yes/);
  assert.match(report, /Renderable meshes: 7/);
  assert.match(report, /Vehicle structure: OK/);
  assert.match(report, /Recoveries: 1/);
  assert.match(report, /Rejected model: pedestrian\.glb/);
  assert.match(report, /900x1600/);
});

test('diagnostics factory is a safe no-op when disabled or when DOM is unavailable', async () => {
  const disabled = createKekeRuntimeDiagnostics({ enabled: false, documentRef: null });
  assert.equal(disabled.enabled, false);
  assert.doesNotThrow(() => disabled.update({}));
  assert.equal(await disabled.copyReport(), false);
  assert.equal(disabled.downloadReport(), false);
  assert.doesNotThrow(() => disabled.dispose());

  const noDom = createKekeRuntimeDiagnostics({ enabled: true, documentRef: null });
  assert.equal(noDom.enabled, false);
});

test('opt-in panel renders snapshots at a bounded cadence and removes itself on dispose', () => {
  const documentRef = makeDocument();
  let time = 1000;
  const overlay = createKekeRuntimeDiagnostics({ enabled: true, documentRef, now: () => time, refreshMs: 450 });
  assert.equal(overlay.enabled, true);
  assert.equal(documentRef.children.length, 1);
  overlay.update({ scene: 'road', player: { model: 'first.glb' } });
  assert.match(overlay.element.textContent, /first\.glb/);
  time += 100;
  overlay.update({ scene: 'garage', player: { model: 'second.glb' } });
  assert.match(overlay.element.textContent, /first\.glb/, 'rapid update is throttled');
  time += 400;
  overlay.update({ scene: 'garage', player: { model: 'second.glb' } });
  assert.match(overlay.element.textContent, /second\.glb/);
  overlay.dispose();
  assert.equal(documentRef.children.length, 0);
  assert.doesNotThrow(() => overlay.update({ scene: 'road' }));
});

test('copy report writes the latest runtime snapshot to the injected clipboard', async () => {
  const documentRef = makeDocument();
  let copied = '';
  const overlay = createKekeRuntimeDiagnostics({
    enabled: true, documentRef,
    clipboardRef: { async writeText(value) { copied = value; } },
  });
  overlay.update(sampleSnapshot, true);
  assert.equal(await overlay.copyReport(), true);
  assert.match(copied, /PLAYER KEKE DIAGNOSTICS/);
  assert.match(copied, /Rejected model: pedestrian\.glb/);
  assert.equal(overlay.container.children[0].children[2].textContent, 'Report copied');
  overlay.dispose();
});

test('save report creates a downloadable plain-text report and revokes its URL on cleanup', () => {
  const documentRef = makeDocument();
  const events = [];
  const urlRef = {
    createObjectURL(blob) { events.push(['create', blob.type]); return 'blob:kano-report'; },
    revokeObjectURL(url) { events.push(['revoke', url]); },
  };
  class FakeBlob {
    constructor(parts, options) { this.text = parts.join(''); this.type = options.type; }
  }
  const overlay = createKekeRuntimeDiagnostics({
    enabled: true, documentRef, urlRef, BlobRef: FakeBlob,
    setTimeoutRef: (callback) => { /* Leave revocation to dispose for deterministic test. */ },
  });
  overlay.update(sampleSnapshot, true);
  assert.equal(overlay.downloadReport(), true);
  const link = documentRef.children.find((node) => node.tagName === 'a');
  assert.equal(link, undefined, 'temporary download anchor is removed after click');
  assert.equal(overlay.container.children[0].children[2].textContent, 'Report saved');
  assert.deepEqual(events[0], ['create', 'text/plain;charset=utf-8']);
  overlay.dispose();
  assert.ok(events.some(([type, url]) => type === 'revoke' && url === 'blob:kano-report'));
});

test('diagnostic buttons are touch-interactive while the text panel does not block the game', () => {
  const documentRef = makeDocument();
  const overlay = createKekeRuntimeDiagnostics({ enabled: true, documentRef, clipboardRef: { writeText: async () => {} } });
  assert.match(overlay.container.style.cssText, /pointer-events:none/);
  assert.match(overlay.copyButton.style.cssText, /pointer-events:auto/);
  assert.match(overlay.downloadButton.style.cssText, /touch-action:manipulation/);
  overlay.dispose();
});
