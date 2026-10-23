import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

// Every bundled GLB must be a valid binary glTF 2 file. The original real
// model files are kept; this test deliberately does NOT cap their size or
// require generated geometry (the earlier Step 84 version did, and that
// pushed the project to replace real models with tiny placeholders).
const root = path.resolve(import.meta.dirname, '..', 'public/assets/models');
function walk(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(dir, e.name)) : [path.join(dir, e.name)]));
}
for (const file of walk(root).filter((f) => f.endsWith('.glb'))) {
  test(`valid GLB header: ${path.relative(root, file)}`, () => {
    const buf = fs.readFileSync(file);
    assert.equal(buf.toString('ascii', 0, 4), 'glTF');
    assert.equal(buf.readUInt32LE(4), 2);
    assert.equal(buf.readUInt32LE(8), buf.length, 'declared length matches file size');
  });
}
