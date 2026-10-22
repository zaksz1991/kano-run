import test from 'node:test';
import assert from 'node:assert/strict';

test('Node browser shim dispatches wallet-update style CustomEvents without warning noise', () => {
  assert.equal(typeof globalThis.dispatchEvent, 'function');
  assert.equal(typeof globalThis.addEventListener, 'function');
  assert.equal(typeof globalThis.removeEventListener, 'function');
  assert.equal(typeof globalThis.CustomEvent, 'function');

  const type = 'kano:test-wallet-event';
  let received = null;
  const listener = (event) => { received = event.detail; };
  globalThis.addEventListener(type, listener, { once: true });
  const accepted = globalThis.dispatchEvent(new CustomEvent(type, { detail: { money: 321 } }));
  globalThis.removeEventListener(type, listener);

  assert.equal(accepted, true);
  assert.deepEqual(received, { money: 321 });
});
