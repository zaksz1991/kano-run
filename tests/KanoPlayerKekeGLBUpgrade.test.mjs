import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, stat } from 'node:fs/promises';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const bootstrap = await readFile(resolve(root, 'js/KanoModelAssetVisualUpgrade.js'), 'utf8');
const playerUpgrade = await readFile(resolve(root, 'js/KanoPlayerKekeGLBUpgrade.js'), 'utf8');
const trafficUpgrade = await readFile(resolve(root, 'js/KanoTrafficRuntimeIntegrationUpgrade.js'), 'utf8');

test('Step 100, 101, and 102 hooks load before the nested main.js application bootstrap', () => {
  const step100 = bootstrap.indexOf("await import('./KanoTrafficCompositionUpgrade.js')");
  const step101 = bootstrap.indexOf("await import('./KanoTrafficRuntimeIntegrationUpgrade.js')");
  const step102 = bootstrap.indexOf("await import('./KanoPlayerKekeGLBUpgrade.js')");
  const presentation = bootstrap.indexOf("await import('./KanoGameplayPresentationRepair.js')");
  assert.ok(step100 >= 0 && step101 > step100 && step102 > step101 && presentation > step102);
});

test('player keeps the existing root and receives a clone of the real keke GLB', () => {
  assert.match(playerUpgrade, /Renderer3D\.prototype\.init/);
  assert.match(playerUpgrade, /manager\.load\('keke'\)/);
  assert.match(playerUpgrade, /manager\?\.getInstance\?\.\('keke'\)/);
  assert.match(playerUpgrade, /playerRoot\.add\(instance\)/);
  assert.match(playerUpgrade, /kanoStep102PlayerKekeGLB/);
  assert.match(playerUpgrade, /ModelManager/i);
});

test('the seated driver rig is checked inside the actual keke model, not as a roadside actor', () => {
  assert.match(playerUpgrade, /KANO_SEATED_DRIVER_RIG/);
  assert.match(playerUpgrade, /KANO_DRIVER_TORSO/);
  assert.match(playerUpgrade, /driverParentIsInsideKeke/);
  assert.match(playerUpgrade, /modelChildOfPlayer/);
});

test('procedural fallback stays active until the model loads and when loading fails', () => {
  assert.match(playerUpgrade, /unavailable-fallback-active/);
  assert.match(playerUpgrade, /error-fallback-active/);
  assert.match(playerUpgrade, /proceduralFallbackStillVisible/);
  assert.match(playerUpgrade, /renderer\.player/);
});

test('replacement only removes old local geometry and releases manager-owned clones safely', () => {
  assert.match(playerUpgrade, /disposeLegacyChild/);
  assert.match(playerUpgrade, /manager\?\.releaseInstance\?\.\(child\)/);
  assert.match(playerUpgrade, /node\.userData\?\.modelManagerInstance/);
  assert.doesNotMatch(playerUpgrade, /renderer\.scene\.clear\(/);
});

test('existing traffic GLB hooks are now installed before the live renderer is constructed', () => {
  assert.match(trafficUpgrade, /Renderer3D\.prototype\.init/);
  assert.ok(bootstrap.indexOf('KanoTrafficRuntimeIntegrationUpgrade.js') < bootstrap.indexOf('KanoGameplayPresentationRepair.js'));
});

test('player model keeps paint selections and exposes a focused runtime diagnostic', () => {
  assert.match(playerUpgrade, /PAINT_PALETTE/);
  assert.match(playerUpgrade, /Renderer3D\.prototype\.applyPaint/);
  assert.match(playerUpgrade, /window\.kanoPlayerKekeModelAudit/);
  assert.match(playerUpgrade, /lastPaint/);
});

test('bundled real player keke asset remains present and non-empty', async () => {
  const asset = await stat(resolve(root, 'public/assets/models/vehicles/keke/keke-3.glb'));
  assert.ok(asset.size > 10000);
});
