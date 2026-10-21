import { execFileSync } from 'node:child_process';
import { readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const EXCLUDED = new Set(['node_modules', 'dist', '.git', '.vercel', '.next']);
const SOURCE_EXTENSIONS = new Set(['.js', '.mjs', '.cjs']);
const files = [];

function walk(directory) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    if (entry.isDirectory() && EXCLUDED.has(entry.name)) continue;
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      walk(absolute);
    } else if (entry.isFile() && SOURCE_EXTENSIONS.has(path.extname(entry.name))) {
      files.push(absolute);
    }
  }
}

walk(ROOT);

if (files.length === 0) {
  console.error('[Kano Release Check] No JavaScript source files were found.');
  process.exit(1);
}

let failed = false;
for (const file of files.sort()) {
  try {
    execFileSync(process.execPath, ['--check', file], {
      cwd: ROOT,
      stdio: 'pipe',
    });
    console.log(`PASS syntax ${path.relative(ROOT, file)}`);
  } catch (error) {
    failed = true;
    const output = [error.stdout, error.stderr]
      .filter(Boolean)
      .map((part) => part.toString())
      .join('\n');
    console.error(`FAIL syntax ${path.relative(ROOT, file)}\n${output}`);
  }
}

if (failed) {
  console.error('\n[Kano Release Check] JavaScript syntax check failed.');
  process.exit(1);
}

console.log(`\n[Kano Release Check] Syntax passed for ${files.length} JavaScript file(s).`);
