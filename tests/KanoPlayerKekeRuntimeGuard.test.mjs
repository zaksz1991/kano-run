import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { inspectPlayerKekeRenderability } from '../js/KanoPlayerKekeRuntimeGuard.js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const renderer = readFileSync(resolve(root, 'js/renderer3d.js'), 'utf8');

function makeNode(fields = {}) {
  return { visible: true, children: [], parent: null, ...fields,
    add(child) { child.parent = this; this.children.push(child); },
    traverse(fn) { fn(this); for (const child of this.children) child.traverse(fn); },
  };
}
function makeMesh(name = 'body', options = {}) {
  return makeNode({
    isMesh: true,
    name,
    geometry: { attributes: { position: { count: options.positions ?? 24 } } },
    material: options.material ?? { visible: true, opacity: 1 },
    ...options.fields,
  });
}

test('runtime guard accepts a visible body mesh under a vehicle root', () => {
  const root = makeNode({ isObject3D: true });
  root.add(makeMesh('body'));
  const result = inspectPlayerKekeRenderability(root);
  assert.equal(result.ok, true);
  assert.equal(result.renderableMeshCount, 1);
});

test('runtime guard ignores root visibility while cached model is promoted', () => {
  const root = makeNode({ isObject3D: true, visible: false });
  root.add(makeMesh('body'));
  assert.equal(inspectPlayerKekeRenderability(root).ok, true);
});

test('hidden descendant groups do not count as visible vehicle geometry', () => {
  const root = makeNode({ isObject3D: true });
  const hidden = makeNode({ visible: false });
  hidden.add(makeMesh('body'));
  root.add(hidden);
  const result = inspectPlayerKekeRenderability(root);
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'no-visible-renderable-meshes');
});

test('invisible or fully transparent materials do not count as drawable', () => {
  const root = makeNode({ isObject3D: true });
  root.add(makeMesh('invisible', { material: { visible: false, opacity: 1 } }));
  root.add(makeMesh('transparent', { material: { visible: true, opacity: 0 } }));
  assert.equal(inspectPlayerKekeRenderability(root).ok, false);
});

test('empty geometry is not treated as proof of a visible keke', () => {
  const root = makeNode({ isObject3D: true });
  root.add(makeMesh('empty', { positions: 0 }));
  assert.equal(inspectPlayerKekeRenderability(root).ok, false);
});

test('renderer uses a throttled player-keke visibility guard before rendering', () => {
  assert.match(renderer, /ensurePlayerKekeRuntimeVisibility\(\);/);
  assert.match(renderer, /_nextPlayerKekeRuntimeCheckAt = now \+ \(this\.mobile \? 1100 : 1700\)/);
  assert.match(renderer, /inspectPlayerKekeRenderability\(activePlayer\)/);
  assert.match(renderer, /this\.makeKeke\(\)/);
  assert.match(renderer, /activePlayer\.userData\.kanoRuntimeKekeRejected/);
});

test('rejected cached GLBs are detached rather than disposing shared resources', () => {
  assert.match(renderer, /Do not dispose the rejected subtree/);
  assert.match(renderer, /activePlayer\.parent\?\.remove\(activePlayer\)/);
  assert.doesNotMatch(renderer, /disposeSceneTree\(activePlayer\)/);
});
