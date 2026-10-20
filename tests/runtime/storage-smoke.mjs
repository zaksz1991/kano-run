import assert from 'node:assert/strict';

class MemoryStorage {
  constructor() { this.data = new Map(); }
  getItem(key) { return this.data.has(key) ? this.data.get(key) : null; }
  setItem(key, value) { this.data.set(key, String(value)); }
}

globalThis.localStorage = new MemoryStorage();
const storage = await import('./storage.js');
const { save, persist, normaliseSave, submitTribe, bankRun } = storage;

save.activeRunCheckpoint = {
  version: 1,
  runId: 'test-run-1',
  savedAt: Date.now(),
  mode: 'career',
  routeId: 'route-1',
  driverId: 'ruffneck',
  dialect: 'hausa',
  gameState: 'PLAY',
  softOver: false,
  reason: '',
  activeTribeChallenge: 'hausa',
  tribeChallenges: { hausa: { runProgress: 2 } },
  state: { score: 1200, fares: 3500, distance: 1.2, zones: [], traffic: [], passengers: [], gas: false, brake: false },
};
assert.equal(persist(), true, 'checkpoint and save object should persist');
const reloaded = normaliseSave(JSON.parse(localStorage.getItem('kano-life-save-v4')));
assert.equal(reloaded.activeRunCheckpoint.runId, 'test-run-1');
assert.equal(reloaded.activeRunCheckpoint.state.score, 1200);
assert.equal(reloaded.activeRunCheckpoint.state.fares, 3500);

submitTribe({ score: 100, distance: 1, driver: 'Test', mode: 'career' }, 'hausa');
submitTribe({ score: 300, distance: 2, driver: 'Test', mode: 'career' }, 'hausa');
submitTribe({ score: 200, distance: 1.5, driver: 'Test', mode: 'career' }, 'hausa');
submitTribe({ score: 50, distance: .5, driver: 'Test', mode: 'career' }, 'hausa');
assert.deepEqual(save.tribes.hausa.map((row) => row.score), [300, 200, 100]);

const before = save.money;
const earned = bankRun({ score: 1000, fares: 2000, distance: 2, driver: 'Test', mode: 'career' });
assert.equal(earned, Math.floor(2000 * 0.2) + Math.floor(1000 * 0.08));
assert.equal(save.money, before + earned);
const stored = normaliseSave(JSON.parse(localStorage.getItem('kano-life-save-v4')));
assert.equal(stored.money, save.money);
assert.equal(stored.highScore, 1000);
console.log('storage-smoke: checkpoint round-trip, top-three board, banked wallet passed');
