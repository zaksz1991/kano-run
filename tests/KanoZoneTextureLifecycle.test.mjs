import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { disposeOwnedZoneLabelTexture } from '../js/KanoZoneTextureLifecycle.js';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const rendererSource = await readFile(resolve(root, 'js/renderer3d.js'), 'utf8');

test('temporary roadside label texture is disposed exactly once and reference is cleared', () => {
  let disposeCalls = 0;
  const texture = { isTexture: true, dispose() { disposeCalls += 1; } };
  const actor = { userData: { labelTexture: texture } };

  assert.equal(disposeOwnedZoneLabelTexture(actor), true);
  assert.equal(disposeCalls, 1);
  assert.equal(actor.userData.labelTexture, null);
  assert.equal(disposeOwnedZoneLabelTexture(actor), false);
  assert.equal(disposeCalls, 1);
});

test('missing zone or label texture is harmless', () => {
  assert.equal(disposeOwnedZoneLabelTexture(null), false);
  assert.equal(disposeOwnedZoneLabelTexture({}), false);
  assert.equal(disposeOwnedZoneLabelTexture({ userData: {} }), false);
});

test('label cleanup only touches the zone-owned label texture, not child GLB materials', () => {
  let labelDisposed = 0;
  let sharedTextureDisposed = 0;
  const actor = {
    userData: { labelTexture: { dispose() { labelDisposed += 1; } } },
    child: { material: { map: { dispose() { sharedTextureDisposed += 1; } } } },
  };

  disposeOwnedZoneLabelTexture(actor);
  assert.equal(labelDisposed, 1);
  assert.equal(sharedTextureDisposed, 0);
  assert.ok(actor.child.material.map);
});

test('syncZones releases label texture before disposing an expired zone actor', () => {
  const cleanup = rendererSource.indexOf('disposeOwnedZoneLabelTexture(actor);');
  const followingTreeDisposal = rendererSource.indexOf('disposeSceneTree(actor);', cleanup);
  const followingZoneDelete = rendererSource.indexOf('this.zoneActors.delete(id);', followingTreeDisposal);
  assert.ok(cleanup >= 0, 'zone label cleanup hook is present');
  assert.ok(followingTreeDisposal > cleanup, 'actor tree cleanup follows label texture cleanup');
  assert.ok(followingZoneDelete > followingTreeDisposal, 'zone is removed from the cache after disposal');
});
