import test from 'node:test';
import assert from 'node:assert/strict';
import {
  advanceCollisionRenderX,
  collisionKickClearance,
  collisionKickOffset,
  collisionRenderTargetX,
  getKanoCollisionContactAudit,
  installKanoCollisionContactUpgrade,
} from '../js/KanoCollisionContactUpgrade.js';

test('collision target matches road renderer limits and pull-over offset', () => {
  assert.equal(collisionRenderTargetX({ steer: 1, pullOverSide: 1 }), 3.45);
  assert.equal(collisionRenderTargetX({ steer: -1, pullOverSide: -1 }), -3.45);
  assert.equal(collisionRenderTargetX({ steer: 0, pullOverSide: 1 }), 2.35);
});

test('collision position follows renderer easing and 50 ms delta cap', () => {
  assert.ok(Math.abs(advanceCollisionRenderX(0, 3, 0.016) - 0.2784) < 1e-9);
  assert.ok(Math.abs(advanceCollisionRenderX(0, 3, 1) - 0.87) < 1e-9);
  assert.equal(advanceCollisionRenderX(2.5, -3, 0), 2.5);
});

test('contact clearance separates keke from common vehicle bounds', () => {
  assert.ok(collisionKickClearance('car') >= 1.7);
  assert.ok(collisionKickClearance('bus') > collisionKickClearance('motorcycle'));
  assert.ok(collisionKickClearance('motorcycle') >= 1.1);
  assert.ok(collisionKickClearance('unknown') <= 1.95);
});

test('kick starts on the impact frame, peaks near midpoint, and returns to zero', () => {
  const first = collisionKickOffset({ timeLeft: 0.44, duration: 0.44, deltaSeconds: 1 / 60, side: -1, distance: 1.7 });
  const peak = collisionKickOffset({ timeLeft: 0.22, duration: 0.44, deltaSeconds: 1 / 60, side: -1, distance: 1.7 });
  const end = collisionKickOffset({ timeLeft: 0, duration: 0.44, deltaSeconds: 1 / 60, side: -1, distance: 1.7 });
  assert.ok(first < 0);
  assert.ok(Math.abs(peak) > Math.abs(first));
  assert.equal(end, 0);
  assert.ok(Math.abs(peak) <= 1.7);
});

test('adapter installs once and uses rendered player position for contact checks', () => {
  class FakeGame {
    moveTraffic(dt) {
      this.seenSteer = this.s.steer;
      // Simulate the original collision handler nudging steering after impact.
      this.s.steer += this.nudge || 0;
      return dt;
    }
  }
  const firstInstall = installKanoCollisionContactUpgrade(FakeGame);
  assert.equal(firstInstall.installed, true);
  assert.equal(firstInstall.alreadyInstalled, false);
  assert.equal(installKanoCollisionContactUpgrade(FakeGame).alreadyInstalled, true);

  const game = Object.create(FakeGame.prototype);
  game.s = { steer: 1, pullOverSide: 0, distance: 1, traffic: [] };
  game.nudge = 0.06;
  assert.equal(game.moveTraffic(0.05), 0.05);
  assert.ok(Math.abs(game.seenSteer - 0) < 1e-9, 'first collision pass must use the prior centre position');
  assert.equal(game.s.steer, 1, 'the temporary steering coordinate must be restored');
  const audit = getKanoCollisionContactAudit(game);
  assert.equal(audit.installed, true);
  assert.ok(audit.estimatedRenderedPlayerX > 0, 'render estimate should advance toward the target after collision evaluation');
});

test('adapter applies model-aware lateral clearance to an existing collision kick', () => {
  class FakeGame {
    moveTraffic() {
      this.s.traffic[0].passed = true;
      this.s.traffic[0].collisionKickDuration = 0.44;
      this.s.traffic[0].collisionKickTime = 0.22;
      this.s.traffic[0].collisionKickSide = 1;
    }
  }
  installKanoCollisionContactUpgrade(FakeGame);
  const game = Object.create(FakeGame.prototype);
  game.s = {
    steer: 0,
    pullOverSide: 0,
    distance: 1,
    traffic: [{ id: 'car-1', type: 'car', lane: 1, depth: 0.01, passed: false }],
  };
  game.moveTraffic(1 / 60);
  const car = game.s.traffic[0];
  assert.equal(car.kanoContactKickPrepared, true);
  assert.ok(Math.abs(car.visualOffsetX) > 1.5);
});
