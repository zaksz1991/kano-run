import test from 'node:test';
import assert from 'node:assert/strict';
import { personalityForPassenger, eligibleForHaggling } from '../js/KanoFareHagglingBridge.js';

test('only solo ordinary passengers are haggled', () => {
  assert.equal(eligibleForHaggling({ seats: 1, fare: 300 }), true);
  assert.equal(eligibleForHaggling({ seats: 2, fare: 300 }), false);
  assert.equal(eligibleForHaggling({ seats: 1, fare: 300, group: true }), false);
  assert.equal(eligibleForHaggling({ seats: 1, fare: 300, special: true }), false);
  assert.equal(eligibleForHaggling({ seats: 1, fare: 20 }), false);
});

test('personality follows passenger class', () => {
  assert.equal(personalityForPassenger({ class: 'VIP' }), 'visitor');
  assert.equal(personalityForPassenger({ class: 'market woman' }, 0.1), 'trader');
  assert.equal(personalityForPassenger({ class: 'worker', name: 'Student Ali' }), 'student');
  assert.equal(personalityForPassenger({ class: 'worker', name: 'Bello' }, 0.9), 'worker');
});
