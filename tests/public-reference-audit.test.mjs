import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

test('public asset audit runs when the model directory exists and writes reports without moving files', () => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'kano-public-asset-audit-'));
  try {
    const scripts = path.join(temp, 'scripts');
    const publicDir = path.join(temp, 'public');
    const modelRoot = path.join(publicDir, 'assets', 'models');
    fs.mkdirSync(scripts, { recursive: true });
    fs.mkdirSync(modelRoot, { recursive: true });
    fs.mkdirSync(path.join(publicDir, 'icons'), { recursive: true });
    fs.mkdirSync(path.join(temp, 'js'), { recursive: true });
    fs.copyFileSync(path.join(ROOT, 'scripts', 'audit-public-references.mjs'), path.join(scripts, 'audit-public-references.mjs'));
    fs.copyFileSync(path.join(ROOT, 'scripts', 'glb-catalog-sync.mjs'), path.join(scripts, 'glb-catalog-sync.mjs'));
    const asset = path.join(publicDir, 'icons', 'fixture-unused-icon.png');
    fs.writeFileSync(asset, 'fixture');
    fs.writeFileSync(path.join(temp, 'js', 'main.js'), 'export const fixture = true;\n');

    const result = spawnSync(process.execPath, ['scripts/audit-public-references.mjs'], {
      cwd: temp,
      encoding: 'utf8',
      timeout: 10000,
    });
    assert.equal(result.status, 0, `audit should exit successfully\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`);
    const reportPath = path.join(temp, 'artifacts', 'public-reference-audit', 'report.json');
    const markdownPath = path.join(temp, 'artifacts', 'public-reference-audit', 'report.md');
    assert.ok(fs.existsSync(reportPath), 'JSON report was not created');
    assert.ok(fs.existsSync(markdownPath), 'Markdown report was not created');
    const report = JSON.parse(fs.readFileSync(reportPath, 'utf8'));
    assert.ok(report.scannedPublicFiles >= 1);
    assert.ok(Array.isArray(report.findings));
    assert.ok(report.findings.some((item) => item.path === '/icons/fixture-unused-icon.png'));
    assert.ok(fs.existsSync(asset), 'audit must never move or delete candidates');
    assert.match(result.stdout, /No files were moved or deleted/);
  } finally {
    fs.rmSync(temp, { recursive: true, force: true });
  }
});
