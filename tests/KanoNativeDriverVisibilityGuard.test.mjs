import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { hasVisiblePathWithinRoot } from '../js/KanoKekeStructureEvidence.js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const renderer = readFileSync(resolve(root, 'js/renderer3d.js'), 'utf8');

function link(parent, child) {
  child.parent = parent;
  parent.children ||= [];
  parent.children.push(child);
  return child;
}

test('visible native driver path is eligible under the vehicle root', () => {
  const rootNode = { visible: true };
  const group = link(rootNode, { visible: true });
  const driver = link(group, { visible: true });
  assert.equal(hasVisiblePathWithinRoot(driver, rootNode), true);
});

test('invisible driver node cannot suppress procedural driver fallback', () => {
  const rootNode = { visible: true };
  const driver = link(rootNode, { visible: false });
  assert.equal(hasVisiblePathWithinRoot(driver, rootNode), false);
});

test('hidden ancestor group invalidates native driver visibility', () => {
  const rootNode = { visible: true };
  const hiddenGroup = link(rootNode, { visible: false });
  const driver = link(hiddenGroup, { visible: true });
  assert.equal(hasVisiblePathWithinRoot(driver, rootNode), false);
});

test('cached vehicle root visibility is ignored until model promotion', () => {
  const hiddenRoot = { visible: false };
  const driver = link(hiddenRoot, { visible: true });
  assert.equal(hasVisiblePathWithinRoot(driver, hiddenRoot), true);
});

test('unrelated node is not considered part of the vehicle hierarchy', () => {
  const rootNode = { visible: true };
  const unrelated = { visible: true };
  assert.equal(hasVisiblePathWithinRoot(unrelated, rootNode), false);
});

test('renderer rejects hidden native drivers before accepting their bounds', () => {
  assert.match(renderer, /hasVisiblePathWithinRoot\(namedNode, object\)/);
  assert.match(renderer, /hasVisiblePathWithinRoot\(node, namedNode\)/);
  assert.match(renderer, /invisible native[\s\S]{0,100}driver/);
});
