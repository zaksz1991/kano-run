import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { getMobileRatios, getMobileRenderBudget } from '../js/KanoDeviceTier.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (relative) => fs.readFileSync(path.join(ROOT, relative), 'utf8');

test('actual phone render budgets cut pixel shading while preserving the published capability tier ratios', () => {
  assert.deepEqual(getMobileRatios('low'), { max: 1.1, start: 0.82, min: 0.58 });
  assert.deepEqual(getMobileRatios('mid'), { max: 1.25, start: 0.94, min: 0.62 });
  assert.deepEqual(getMobileRatios('high'), { max: 1.45, start: 1.08, min: 0.7 });
  for (const tier of ['low', 'mid', 'high']) {
    const budget = getMobileRenderBudget(tier);
    assert.ok(budget.min <= budget.start && budget.start <= budget.max, tier);
    assert.ok(budget.start < getMobileRatios(tier).start, `${tier} must start below the former pixel ratio`);
  }
  assert.deepEqual(getMobileRenderBudget('low'), { max: 0.44, start: 0.34, min: 0.22 });
  assert.deepEqual(getMobileRenderBudget('mid'), { max: 0.50, start: 0.40, min: 0.25 });
  assert.deepEqual(getMobileRenderBudget('high'), { max: 0.58, start: 0.48, min: 0.30 });
});

test('procedural flyover stripes use one InstancedMesh instead of dozens of stripe meshes', () => {
  const renderer = read('js/renderer3d.js');
  assert.match(renderer, /new THREE\.InstancedMesh\([\s\S]*?stripeCount \* 2/);
  assert.match(renderer, /kanoFlyoverStripeInstancing/);
  assert.match(renderer, /stripes\.setColorAt\(stripeInstance, stripeColor\)/);
  assert.doesNotMatch(renderer, /const stripe = new THREE\.Mesh\([\s\S]{0,500}?stripeIndex % 2/);
});

test('hidden morning-life dioramas are not scanned for GLB animation roots during road driving', () => {
  const animation = read('js/KanoAnimationTrafficUpgrade.js');
  assert.match(animation, /const activeLifeScene = this\.renderer\.lifeScene/);
  assert.match(animation, /lifeSceneGroups\?\.get\?\.\(activeLifeScene\)/);
  assert.doesNotMatch(animation, /for \(const group of this\.renderer\.lifeSceneGroups\?\.values/);
  const rootCause = read('js/KanoLifeRootCauseRepair.js');
  assert.match(rootCause, /let ancestryVisible = actor\.visible !== false/);
});

test('browser audit reports SwiftShader frame cost and records temporary renderer-mode switches', () => {
  const audit = read('scripts/browser-audit.mjs');
  assert.match(audit, /--use-angle=swiftshader/);
  assert.match(audit, /renderModeHistory/);
  assert.match(audit, /unexpectedRenderModeChanges/);
  assert.match(audit, /HIGH FRAME TIME \(SOFTWARE WEBGL\)/);
  assert.match(audit, /forcing \*\*SwiftShader software WebGL\*\*/);
});
