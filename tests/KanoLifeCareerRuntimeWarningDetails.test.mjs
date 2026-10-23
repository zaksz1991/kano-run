import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const ROOT = resolve(import.meta.dirname, '..');
const read = (file) => readFileSync(resolve(ROOT, file), 'utf8');
const hub = read('js/KanoLifeCareerSettingsHub.js');
const audit = read('js/KanoLifeRuntimeAudit.js');
const html = read('index.html');

test('Career screen renders individual runtime warning and error records', () => {
  assert.match(hub, /function renderRuntimeAuditDetails\(report, anchor\)/);
  assert.match(hub, /report\?\.issues/);
  assert.match(hub, /Recorded warnings and errors/);
  assert.match(hub, /klc-runtime-audit-details/);
  assert.match(hub, /item\?\.message/);
  assert.match(hub, /item\?\.file/);
});

test('runtime warning details show long-task duration and available frame script attribution', () => {
  assert.match(hub, /Long main-thread tasks/);
  assert.match(hub, /Long animation frame attribution/);
  assert.match(hub, /sourceFunctionName|functionName/);
  assert.match(hub, /forcedStyleAndLayoutMs/);
  assert.match(audit, /longTasks: longTasks\.map/);
  assert.match(audit, /longAnimationFrames: longAnimationFrames\.map/);
});

test('diagnostic labels and messages are written as text, not interpreted as HTML', () => {
  assert.match(hub, /label\.textContent = String\(formatted\.title/);
  assert.match(hub, /text\.textContent = String\(formatted\.message/);
  assert.match(hub, /foot\.textContent = String\(formatted\.meta/);
  assert.doesNotMatch(hub, /\.innerHTML\s*=/);
});

test('warning details remain inside the existing Career settings screen and use the existing audit snapshot', () => {
  assert.match(html, /id="klc-runtime-audit-summary"/);
  assert.match(hub, /audit\.snapshot\(\)/);
  assert.match(hub, /renderRuntimeAuditDetails\(report, runtimeStatus\)/);
  assert.match(hub, /renderRuntimeAuditDetails\(null, runtimeStatus\)/);
});

test('diagnostics remain local and do not add network or storage access', () => {
  assert.doesNotMatch(hub, /fetch\s*\(|XMLHttpRequest|navigator\.sendBeacon/);
  assert.doesNotMatch(hub, /localStorage|sessionStorage/);
});
