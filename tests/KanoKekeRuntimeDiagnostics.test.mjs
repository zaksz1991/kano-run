import test from 'node:test';
import assert from 'node:assert/strict';
import {
  shouldEnableKekeRuntimeDiagnostics,
  formatKekeRuntimeDiagnosticText,
  createKekeRuntimeDiagnostics,
} from '../js/KanoKekeRuntimeDiagnostics.js';

test('Keke diagnostics stays disabled unless the explicit query flag is set', () => {
  assert.equal(shouldEnableKekeRuntimeDiagnostics(''), false);
  assert.equal(shouldEnableKekeRuntimeDiagnostics('?debugKeke=0'), false);
  assert.equal(shouldEnableKekeRuntimeDiagnostics('?debugKeke=true'), false);
  assert.equal(shouldEnableKekeRuntimeDiagnostics('?debugKeke=1'), true);
  assert.equal(shouldEnableKekeRuntimeDiagnostics('?foo=1&debugKeke=1'), true);
});

test('diagnostic report includes vehicle, visibility, structure, transform and recovery information', () => {
  const report = formatKekeRuntimeDiagnosticText({
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
  });
  assert.match(report, /Scene: road \| Device: mid/);
  assert.match(report, /Model: assets\/keke\.glb/);
  assert.match(report, /Visible path: yes/);
  assert.match(report, /Renderable meshes: 7/);
  assert.match(report, /Vehicle structure: OK/);
  assert.match(report, /Recoveries: 1/);
  assert.match(report, /Rejected model: pedestrian\.glb/);
  assert.match(report, /900x1600/);
});

test('diagnostics factory is a safe no-op when disabled or when DOM is unavailable', () => {
  const disabled = createKekeRuntimeDiagnostics({ enabled: false, documentRef: null });
  assert.equal(disabled.enabled, false);
  assert.doesNotThrow(() => disabled.update({}));
  assert.doesNotThrow(() => disabled.dispose());

  const noDom = createKekeRuntimeDiagnostics({ enabled: true, documentRef: null });
  assert.equal(noDom.enabled, false);
});

test('opt-in panel renders snapshots at a bounded cadence and removes itself on dispose', () => {
  const children = [];
  const documentRef = {
    body: {
      appendChild(node) { node.parentNode = this; children.push(node); },
      removeChild(node) { const i = children.indexOf(node); if (i >= 0) children.splice(i, 1); node.parentNode = null; },
    },
    createElement(tag) {
      return {
        tagName: tag,
        style: {},
        attributes: {},
        textContent: '',
        setAttribute(key, value) { this.attributes[key] = value; },
      };
    },
  };
  let time = 1000;
  const overlay = createKekeRuntimeDiagnostics({
    enabled: true,
    documentRef,
    now: () => time,
    refreshMs: 450,
  });
  assert.equal(overlay.enabled, true);
  assert.equal(children.length, 1);
  overlay.update({ scene: 'road', player: { model: 'first.glb' } });
  assert.match(children[0].textContent, /first\.glb/);
  time += 100;
  overlay.update({ scene: 'garage', player: { model: 'second.glb' } });
  assert.match(children[0].textContent, /first\.glb/, 'rapid update is throttled');
  time += 400;
  overlay.update({ scene: 'garage', player: { model: 'second.glb' } });
  assert.match(children[0].textContent, /second\.glb/);
  overlay.dispose();
  assert.equal(children.length, 0);
  assert.doesNotThrow(() => overlay.update({ scene: 'road' }));
});
