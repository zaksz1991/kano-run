import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const manager = fs.readFileSync(new URL('../js/KanoAnimationTrafficUpgrade.js', import.meta.url), 'utf8');
const perfLab = fs.readFileSync(new URL('../js/KanoPerfLab.js', import.meta.url), 'utf8');
const updateStart = manager.indexOf('  update(deltaSeconds) {', manager.indexOf('export class KanoGLBAnimationManager'));
const updateEnd = manager.indexOf('\n  getCharacterRenderLodDiagnostics()', updateStart);
const update = manager.slice(updateStart, updateEnd);
const diagnosticsStart = manager.indexOf('  getCharacterRenderLodDiagnostics() {', updateStart);
const diagnosticsEnd = manager.indexOf('\n  dispose() {', diagnosticsStart);
const diagnostics = manager.slice(diagnosticsStart, diagnosticsEnd);
const disposeStart = manager.indexOf('  dispose() {', diagnosticsEnd);
const dispose = manager.slice(disposeStart);

test('no-clip idle fallback roots use the same mobile distance policy as mixer-backed idle roots', () => {
  assert.match(update, /const role = activeRoots\.get\(root\) \|\| 'walk'/);
  assert.match(update, /this\.fallbackLodStates\.set\(root, fallback\)/);
  assert.match(update, /updateSkinnedCharacterRenderLodState\(root, fallback/);
  assert.match(update, /distanceSquared: fallback\.mobileDistanceSquared/);
});

test('detached no-clip roots restore temporary geometry before their LOD state is discarded', () => {
  assert.match(update, /if \(!this\.lastActiveRoots\.has\(root\) \|\| !root\.parent\) \{[\s\S]*?if \(state\.staticPoseActive\) restoreSkinnedCharacterPose\(root\)/);
});

test('Performance Lab distinguishes visible skinned meshes from retained restoration sources', () => {
  assert.match(diagnostics, /renderedSkinnedMeshes/);
  assert.match(diagnostics, /kanoStaticPoseLodState/);
  assert.match(perfLab, /skinned GPU/);
  assert.match(perfLab, /source skinned/);
});

test('no-clip bake counts and failure counts are exposed to Performance Lab diagnostics', () => {
  assert.match(diagnostics, /idleFallbackBakedRoots/);
  assert.match(diagnostics, /idleFallbackBakeFailures/);
  assert.match(perfLab, /no-clip LOD/);
});

test('manager disposal restores no-clip fallback rigs before releasing state', () => {
  assert.match(dispose, /for \(const \[root, state\] of this\.fallbackLodStates\)/);
  assert.match(dispose, /if \(state\.staticPoseActive\) restoreSkinnedCharacterPose\(root\)/);
  assert.match(dispose, /this\.fallbackLodStates\.clear\(\)/);
});
