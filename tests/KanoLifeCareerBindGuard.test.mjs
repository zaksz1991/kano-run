import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const root = new URL('..', import.meta.url);
const guardPath = new URL('../js/KanoLifeCareerBindGuard.js', import.meta.url);
const visualPath = new URL('../js/KanoModelAssetVisualUpgrade.js', import.meta.url);
const rawGuard = readFileSync(guardPath, 'utf8');
const visual = readFileSync(visualPath, 'utf8');

function runGuard({ modernHost, throwsExpected = true }) {
  const game = { state: 'INTRO' };
  const ui = {
    bound: false,
    game: null,
    bind(candidate) {
      this.bound = true;
      this.game = candidate;
      sandbox.window.__KANO_UI_BOUND__ = true;
      sandbox.window.__KANO_ACTIVE_GAME__ = candidate;
      if (throwsExpected) throw new TypeError("Cannot read properties of null (reading 'addEventListener')");
      return 'bound';
    },
  };
  class MockUI {}
  MockUI.prototype.bind = ui.bind;
  const host = {
    querySelector(selector) {
      if (!modernHost) return null;
      if (selector === '#klc-settings-body' || selector === '#life-career-close') return {};
      return null;
    },
  };
  const sandbox = {
    UI: MockUI,
    window: { __KANO_ACTIVE_GAME__: null, __KANO_UI_BOUND__: false },
    document: { getElementById: id => id === 'kano-life-career-screen' ? host : null },
    Symbol,
    TypeError,
    Boolean,
    String,
    Date,
    console: { warn() {} },
  };
  const source = rawGuard.replace(/^import \{ UI \} from '\.\/ui\.js';\s*/m, '');
  vm.runInNewContext(source, sandbox, { filename: 'KanoLifeCareerBindGuard.js' });
  return { result: MockUI.prototype.bind.call(ui, game), ui, window: sandbox.window };
}

test('the bind guard catches the known missing legacy controls only on the modern hub', () => {
  const { result, ui, window } = runGuard({ modernHost: true, throwsExpected: true });
  assert.equal(result, ui);
  assert.equal(ui.bound, true);
  assert.equal(window.__KANO_LEGACY_CAREER_PANEL_SKIPPED__?.reason,
    'modern-life-career-host-does-not-contain-legacy-financial-panel-controls');
});

test('unexpected binding errors are not hidden', () => {
  assert.throws(() => runGuard({ modernHost: false, throwsExpected: true }), /Cannot read properties of null/);
});

test('the wrapper loads the guard after the life-simulation patch and before main bootstrap', () => {
  const life = visual.indexOf("await import('./KanoNorthernDriverLifeSimulationUpgrade.js')");
  const guard = visual.indexOf("await import('./KanoLifeCareerBindGuard.js')");
  const presentation = visual.indexOf("await import('./KanoGameplayPresentationRepair.js')");
  assert.ok(life >= 0 && guard > life && presentation > guard);
});
