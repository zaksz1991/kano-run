import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { inspectKekeRenderState } from '../js/KanoKekeRenderStateDiagnostics.js';
import { formatKekeRuntimeDiagnosticText } from '../js/KanoKekeRuntimeDiagnostics.js';

function material(overrides = {}) {
  return { visible: true, opacity: 1, colorWrite: true, ...overrides };
}

function mesh(name, overrides = {}) {
  return {
    name,
    type: 'Mesh',
    isMesh: true,
    visible: true,
    geometry: { attributes: { position: { count: 24 } }, drawRange: { start: 0, count: 36 } },
    material: material(),
    layers: { mask: 1 },
    frustumCulled: true,
    children: [],
    ...overrides,
  };
}

function group(name, children = [], overrides = {}) {
  const root = { name, type: 'Group', visible: true, children, ...overrides };
  for (const child of children) child.parent = root;
  return root;
}

test('reports mesh drawability and compact samples without mutating objects', () => {
  const body = mesh('KekeBody');
  const root = group('PlayerKeke', [body]);
  const result = inspectKekeRenderState(root, { layers: { mask: 1 } });
  assert.equal(result.available, true);
  assert.equal(result.meshCount, 1);
  assert.equal(result.candidateDrawableMeshCount, 1);
  assert.deepEqual(result.drawableMeshSamples, ['KekeBody']);
  assert.equal(body.visible, true);
  assert.equal(body.frustumCulled, true);
});

test('detects inherited hidden visibility and hidden ancestors outside the vehicle root', () => {
  const hiddenMesh = mesh('HiddenBody');
  const hiddenGroup = group('HiddenGroup', [hiddenMesh], { visible: false });
  const root = group('PlayerKeke', [hiddenGroup]);
  const result = inspectKekeRenderState(root);
  assert.equal(result.hiddenNodeCount, 2);
  assert.equal(result.candidateDrawableMeshCount, 0);
  assert.match(result.issueSamples[0], /visibility-path-hidden/);
  const outer = group('HiddenSceneParent', [root], { visible: false });
  assert.equal(outer.children[0], root);
  assert.equal(inspectKekeRenderState(root).rootAncestorPathVisible, false);
});

test('flags hidden, transparent-to-zero and color-write-disabled materials', () => {
  const body = mesh('BrokenMaterialBody', { material: material({ visible: false, opacity: 0, colorWrite: false }) });
  const result = inspectKekeRenderState(group('PlayerKeke', [body]));
  assert.equal(result.invisibleMaterialCount, 1);
  assert.equal(result.zeroOpacityMaterialCount, 1);
  assert.equal(result.colorWriteDisabledMaterialCount, 1);
  assert.equal(result.meshWithoutDrawableMaterialCount, 1);
  assert.equal(result.candidateDrawableMeshCount, 0);
  assert.match(result.issueSamples[0], /no-drawable-material/);
});

test('detects missing geometry, missing position attributes and empty draw ranges', () => {
  const noGeometry = mesh('NoGeometry', { geometry: null });
  const noPosition = mesh('NoPosition', { geometry: { attributes: {}, drawRange: { start: 0, count: 3 } } });
  const emptyRange = mesh('EmptyRange', { geometry: { attributes: { position: { count: 3 } }, drawRange: { start: 0, count: 0 } } });
  const result = inspectKekeRenderState(group('PlayerKeke', [noGeometry, noPosition, emptyRange]));
  assert.equal(result.meshWithoutGeometryCount, 1);
  assert.equal(result.meshWithoutPositionAttributeCount, 1);
  assert.equal(result.emptyDrawRangeMeshCount, 1);
  assert.equal(result.candidateDrawableMeshCount, 0);
});

test('detects camera-layer mismatches without changing layers', () => {
  const body = mesh('OtherLayerBody', { layers: { mask: 2 } });
  const result = inspectKekeRenderState(group('PlayerKeke', [body]), { layers: { mask: 1 } });
  assert.equal(result.cameraLayerMismatchMeshCount, 1);
  assert.equal(result.candidateDrawableMeshCount, 0);
  assert.equal(body.layers.mask, 2);
});

test('reports traversal cap rather than looping indefinitely on malformed trees', () => {
  const root = group('PlayerKeke');
  root.children = [root];
  const result = inspectKekeRenderState(root);
  assert.equal(result.available, false);
  assert.equal(result.reason, 'traversal-limit-reached');
});

test('exports render-state values into the copyable diagnostic report', () => {
  const text = formatKekeRuntimeDiagnosticText({
    renderState: {
      available: true,
      reason: 'no-mesh-passes-render-state-checks',
      nodeCount: 14,
      hiddenNodeCount: 2,
      meshCount: 5,
      candidateDrawableMeshCount: 0,
      meshWithoutGeometryCount: 1,
      meshWithoutPositionAttributeCount: 1,
      invisibleMaterialCount: 2,
      zeroOpacityMaterialCount: 1,
      colorWriteDisabledMaterialCount: 1,
      cameraLayerMismatchMeshCount: 3,
      drawableMeshSamples: [],
      issueSamples: ['Body: camera-layer-mismatch'],
    },
  });
  assert.match(text, /Render state: available/);
  assert.match(text, /Scene nodes: 14/);
  assert.match(text, /Candidate drawable: 0/);
  assert.match(text, /camera-layer-mismatch/);
});

test('returns stable unavailable result for an absent root', () => {
  assert.deepEqual(inspectKekeRenderState(null), { available: false, reason: 'player-root-unavailable' });
});


test('renderer wires render-state diagnostics into the throttled opt-in report path', async () => {
  const rendererPath = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../js/renderer3d.js');
  const source = await readFile(rendererPath, 'utf8');
  assert.match(source, /import \{ inspectKekeRenderState \} from '\.\/KanoKekeRenderStateDiagnostics\.js'/);
  assert.match(source, /this\._cachedKekeRenderStateDiagnostics = inspectKekeRenderState\(player, this\.camera, \{ sampleLimit: 8 \}\)/);
  assert.match(source, /renderState: this\._cachedKekeRenderStateDiagnostics/);
  assert.match(source, /updatePlayerKekeDiagnostics\(force = false\)[\s\S]*?if \(!this\._kekeRuntimeDiagnostics\?\.enabled\) return;/);
});
