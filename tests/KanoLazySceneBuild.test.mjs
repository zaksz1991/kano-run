import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const source = readFileSync(resolve(root, 'js/renderer3d.js'), 'utf8');

test('road renderer startup no longer eagerly builds the garage or life dioramas', () => {
  const constructor = source.slice(source.indexOf('constructor(canvas'), source.indexOf('\n  material('));
  assert.match(constructor, /this\.buildWorld\(\)/);
  assert.match(constructor, /this\.player = this\.makeKeke\(\)/);
  assert.doesNotMatch(constructor, /this\.buildGarageScene\(\)/);
  assert.doesNotMatch(constructor, /this\.buildLifeDioramas\(/);
  assert.match(constructor, /this\.ready = true/);
});

test('garage geometry is initialized only when the garage scene is requested', () => {
  assert.match(source, /ensureGarageScene\(\)\s*\{\s*if \(this\.garageGroup\) return this\.garageGroup;\s*this\.buildGarageScene\(\);/);
  assert.match(source, /if \(nextScene === 'garage'\)\s*\{\s*this\.ensureGarageScene\(\);/);
});

test('only the requested life diorama is built and cached', () => {
  assert.match(source, /buildLifeDioramas\(sceneName\)\s*\{[\s\S]*?if \(!validScenes\.includes\(sceneName\)\) return null;[\s\S]*?const existing = this\.lifeSceneGroups\.get\(sceneName\);\s*if \(existing\) return existing;/);
  assert.match(source, /const group = new THREE\.Group\(\);\s*group\.visible = false;\s*this\.lifeDioramaRoot\.add\(group\);\s*this\.lifeSceneGroups\.set\(sceneName, group\);/);
  for (const name of ['bedroom', 'household', 'street', 'breakfast', 'walk', 'school']) {
    assert.ok(source.includes(`if (sceneName === '${name}')`), `missing lazy builder for ${name}`);
  }
});

test('life-scene model upgrades only inspect current scene slots and are throttled on phones', () => {
  assert.match(source, /if \(this\.mobile && now < this\._nextLifeSceneAssetUpgradeAt\) return;/);
  assert.match(source, /if \(slot\.sceneName !== this\.lifeScene\) continue;/);
});

test('draw path does not construct hidden scenes as part of ordinary road driving', () => {
  const draw = source.slice(source.indexOf('  draw(state, deltaSeconds)'), source.indexOf('  dispose()'));
  const roadPath = draw.slice(draw.indexOf("if (this.lifeScene !== 'road')"));
  assert.match(roadPath, /if \(this\.lifeScene !== 'road'\)/);
  assert.match(draw, /if \(this\.lifeDioramaRoot\) this\.lifeDioramaRoot\.visible = false;/);
  assert.match(draw, /if \(this\.garageGroup\) this\.garageGroup\.visible = false;/);
});
