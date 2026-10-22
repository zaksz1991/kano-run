import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (relative) => fs.readFileSync(path.join(ROOT, relative), 'utf8');
const px = (text, re) => Number((text.match(re) || [])[1]);

test('desktop passenger list starts below the minimap instead of covering it', () => {
  const base = read('css/styles.css');
  const responsive = read('css/kano-responsive-upgrade.css');
  const wide = base.match(/@media\(min-width:760px\)\{[\s\S]*?\.minimap\{top:(\d+)px;left:\d+px;width:\d+px;height:(\d+)px\}/);
  assert.ok(wide, 'desktop minimap rule not found');
  const minimapBottom = Number(wide[1]) + Number(wide[2]);
  const listTop = px(responsive, /@media \(min-width: 760px\) \{\s*\.passenger-list \{\s*top: (\d+)px/);
  assert.ok(Number.isFinite(listTop), 'desktop passenger-list rule not found');
  assert.ok(listTop >= minimapBottom, `list top ${listTop}px overlaps minimap bottom ${minimapBottom}px`);
});
