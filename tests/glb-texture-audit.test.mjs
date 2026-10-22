import test from 'node:test';
import assert from 'node:assert/strict';
import { inspectGlbBuffer } from '../scripts/audit-glb-texture-references.mjs';

function makeGlb(jsonValue) {
  let json = Buffer.from(JSON.stringify(jsonValue), 'utf8');
  const padding = (4 - (json.length % 4)) % 4;
  if (padding) json = Buffer.concat([json, Buffer.alloc(padding, 0x20)]);
  const header = Buffer.alloc(12);
  header.writeUInt32LE(0x46546c67, 0);
  header.writeUInt32LE(2, 4);
  header.writeUInt32LE(12 + 8 + json.length, 8);
  const chunkHeader = Buffer.alloc(8);
  chunkHeader.writeUInt32LE(json.length, 0);
  chunkHeader.writeUInt32LE(0x4e4f534a, 4);
  return Buffer.concat([header, chunkHeader, json]);
}

test('GLB texture audit detects an external colormap URI', () => {
  const result = inspectGlbBuffer(makeGlb({ asset: { version: '2.0' }, images: [{ uri: 'Textures/colormap.png' }] }));
  assert.equal(result.valid, true);
  assert.equal(result.containsColormap, true);
  assert.deepEqual(result.externalImages, [{ index: 0, uri: 'Textures/colormap.png' }]);
});

test('GLB texture audit ignores embedded images and unrelated names', () => {
  const result = inspectGlbBuffer(makeGlb({ asset: { version: '2.0' }, images: [{ uri: 'data:image/png;base64,AAAA' }, { uri: 'Textures/road.png' }] }));
  assert.equal(result.valid, true);
  assert.equal(result.containsColormap, false);
  assert.deepEqual(result.externalImages, [{ index: 1, uri: 'Textures/road.png' }]);
});

test('GLB texture audit identifies malformed containers without throwing', () => {
  const result = inspectGlbBuffer(Buffer.from('not-a-glb'));
  assert.equal(result.valid, false);
  assert.match(result.reason, /too short|invalid glTF/i);
});
