import assert from 'node:assert/strict';
import { KanoSystemicEventDirector } from '../js/KanoSystemicEventDirector.js';

const received = [];
const director = new KanoSystemicEventDirector({
  rng: () => 0,
  minInterval: 3,
  maxInterval: 3,
  events: [{ id: 'test_event', weight: 1, cooldown: 5 }],
  onEvent: event => received.push(event),
});
director.setContext({ shiftActive: true, routeId: 'kano-test' });
for (let i = 0; i < 30; i += 1) director.update(0.1);
assert.equal(received.length, 1);
assert.equal(received[0].id, 'test_event');
assert.equal(received[0].routeId, 'kano-test');
assert.equal(director.getSnapshot().lastEvent.eventId, 'KANO-EVT-1');
director.trigger('test_event', { debug: true });
assert.equal(received.length, 2);
director.reset();
assert.equal(director.getSnapshot().lastEvent, null);
console.log('KanoSystemicEventDirector smoke test passed.');
