import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, stat } from 'node:fs/promises';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const bootstrap = await readFile(resolve(root, 'js/KanoModelAssetVisualUpgrade.js'), 'utf8');
const motion = await readFile(resolve(root, 'js/KanoSeatedDriverMotionUpgrade.js'), 'utf8');
const player = await readFile(resolve(root, 'js/KanoPlayerKekeGLBUpgrade.js'), 'utf8');
const traffic = await readFile(resolve(root, 'js/KanoTrafficRuntimeIntegrationUpgrade.js'), 'utf8');

 test('Step 103 is imported after the real player model hook and before main.js bootstrap', () => {
  const playerIndex = bootstrap.indexOf("await import('./KanoPlayerKekeGLBUpgrade.js')");
  const motionIndex = bootstrap.indexOf("await import('./KanoSeatedDriverMotionUpgrade.js')");
  const presentationIndex = bootstrap.indexOf("await import('./KanoGameplayPresentationRepair.js')");
  assert.ok(playerIndex >= 0 && motionIndex > playerIndex && presentationIndex > motionIndex);
});

test('driver animation uses existing seated rig names and requires a torso before moving', () => {
  assert.match(motion, /KANO_SEATED_DRIVER_RIG/);
  assert.match(motion, /KANO_DRIVER_TORSO/);
  assert.match(motion, /KANO_DRIVER_LEFT_ARM/);
  assert.match(motion, /KANO_DRIVER_RIGHT_ARM/);
  assert.match(motion, /if \(!body\) return false/);
});

test('motion responds to speed, steering, reverse gear, and crash shake', () => {
  assert.match(motion, /playerSpeed/);
  assert.match(motion, /steerFor\(renderer, game\)/);
  assert.match(motion, /isReverse\(game\)/);
  assert.match(motion, /crashShake/);
  assert.match(motion, /body\.rotation\.z = -steering/);
  assert.match(motion, /head\.rotation\.y = steering/);
});

test('scene traversal animates only found rigs and deduplicates a rig across scene roots', () => {
  assert.match(motion, /root\.traverse\(\(object\)/);
  assert.match(motion, /seenRigs\.has\(object\)/);
  assert.match(motion, /seenRigs\.add\(object\)/);
  assert.match(motion, /if \(!torsoExists\) continue/);
});

test('player rig is identified separately from traffic and parked checkpoint kekes', () => {
  assert.match(motion, /isDescendantOf\(modelRoot, renderer\.player\)/);
  assert.match(motion, /trafficContext\(renderer, modelRoot, game\)/);
  assert.match(motion, /kanoStep99RealKekeInstalled/);
  assert.match(motion, /playerRigAnimated/);
  assert.match(motion, /parkedRigsAnimated/);
});

test('the adapter wraps draw idempotently and still invokes the original renderer method', () => {
  assert.match(motion, /Renderer3D\.prototype\.draw/);
  assert.match(motion, /!Renderer3D\.prototype\[PATCH_KEY\]/);
  assert.match(motion, /return originalDraw\.call\(this, state, \.\.\.args\)/);
  assert.match(motion, /kanoSeatedDriverMotionAudit/);
});

test('driver motion adapter is standalone and does not require a new ModelManager export', () => {
  assert.doesNotMatch(motion, /from ['"]\.\/ModelManager\.js['"]/);
  assert.match(player, /KANO_SEATED_DRIVER_RIG/);
  assert.match(traffic, /kanoStep101TrafficGLB/);
});

test('the bundled real player keke and traffic models remain present', async () => {
  const paths = [
    'public/assets/models/vehicles/keke/keke-3.glb',
    'public/assets/models/vehicles/special/okada.glb',
    'public/assets/models/vehicles/cars/quaternius_cc0-normal-car-1190.glb',
  ];
  for (const path of paths) assert.ok((await stat(resolve(root, path))).size > 10000, path);
});
