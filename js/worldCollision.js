// Kano Run — World Collision
// Phase A upgrade module
//
// Coordinate authority:
//   lane 0 = -2.4
//   lane 1 =  0
//   lane 2 = +2.4
//
// This module contains no dependency on Game.
// Gameplay callbacks are optional.

const DEFAULT_LANE_X = [-2.4, 0, 2.4];

function finite(value, fallback = 0) {
  return Number.isFinite(Number(value)) ? Number(value) : fallback;
}

function positive(value, fallback = 1) {
  const n = finite(value, fallback);
  return n > 0 ? n : fallback;
}

function laneToX(lane, laneX = DEFAULT_LANE_X) {
  const index = Math.max(
    0,
    Math.min(
      laneX.length - 1,
      Math.round(finite(lane, 1))
    )
  );

  return laneX[index];
}

function makeBox(entity = {}, laneX = DEFAULT_LANE_X) {
  const lane =
    entity.lane !== undefined
      ? finite(entity.lane, 1)
      : null;

  const worldX =
    Number.isFinite(Number(entity.worldX))
      ? Number(entity.worldX)
      : lane !== null
        ? laneToX(lane, laneX)
        : 0;

  return {
    worldX,
    worldZ: finite(entity.worldZ, 0),
    width: positive(entity.width, 1),
    length: positive(entity.length, 1),
    height: positive(entity.height, 1),
    id: entity.id ?? null,
    type: entity.type ?? 'unknown',
    source: entity
  };
}

function overlaps(a, b) {
  const ax = a.worldX;
  const az = a.worldZ;
  const bx = b.worldX;
  const bz = b.worldZ;

  return (
    Math.abs(ax - bx) <=
      (a.width + b.width) * 0.5 &&
    Math.abs(az - bz) <=
      (a.length + b.length) * 0.5
  );
}

export class WorldCollision {
  constructor(options = {}) {
    this.laneX = Array.isArray(options.laneX)
      ? options.laneX.slice()
      : DEFAULT_LANE_X.slice();

    this.playerBox = null;
    this.trafficBoxes = new Map();

    this.lastCollisionKey = null;
    this.lastCollisionFrame = -1;

    this.frame = 0;

    this.onCollision =
      typeof options.onCollision === 'function'
        ? options.onCollision
        : null;

    this.onNearMiss =
      typeof options.onNearMiss === 'function'
        ? options.onNearMiss
        : null;

    this.nearMissDistance = positive(
      options.nearMissDistance,
      0.8
    );

    this.cooldownFrames = Math.max(
      0,
      Math.round(
        finite(options.cooldownFrames, 12)
      )
    );
  }

  beginFrame(frame = this.frame + 1) {
    this.frame = frame;
  }

  setPlayer(player = {}) {
    this.playerBox = makeBox(
      player,
      this.laneX
    );

    return this.playerBox;
  }

  setTraffic(traffic = []) {
    this.trafficBoxes.clear();

    if (!Array.isArray(traffic)) {
      return;
    }

    for (const item of traffic) {
      if (!item) continue;

      const box = makeBox(
        item,
        this.laneX
      );

      const id =
        item.id ??
        `${item.type || 'traffic'}-${this.trafficBoxes.size}`;

      box.id = id;

      this.trafficBoxes.set(id, box);
    }
  }

  addTraffic(item = {}) {
    const box = makeBox(
      item,
      this.laneX
    );

    const id =
      item.id ??
      `${item.type || 'traffic'}-${this.trafficBoxes.size}`;

    box.id = id;

    this.trafficBoxes.set(id, box);

    return box;
  }

  removeTraffic(id) {
    this.trafficBoxes.delete(id);
  }

  getPlayerBox() {
    return this.playerBox
      ? { ...this.playerBox }
      : null;
  }

  getTrafficBoxes() {
    return Array.from(
      this.trafficBoxes.values()
    ).map((box) => ({
      ...box
    }));
  }

  checkPlayerAgainstTraffic() {
    if (!this.playerBox) {
      return [];
    }

    const collisions = [];

    for (const traffic of this.trafficBoxes.values()) {
      if (!overlaps(this.playerBox, traffic)) {
        continue;
      }

      const key =
        `${traffic.id}:${Math.round(this.playerBox.worldZ * 10)}`;

      const canReport =
        this.lastCollisionKey !== key ||
        this.frame - this.lastCollisionFrame >=
          this.cooldownFrames;

      if (!canReport) {
        continue;
      }

      const impactX =
        (this.playerBox.worldX + traffic.worldX) *
        0.5;

      const impactZ =
        (this.playerBox.worldZ + traffic.worldZ) *
        0.5;

      const event = {
        player: this.playerBox,
        traffic,
        impactX,
        impactZ,
        frame: this.frame
      };

      collisions.push(event);

      this.lastCollisionKey = key;
      this.lastCollisionFrame = this.frame;

      if (this.onCollision) {
        this.onCollision(event);
      }
    }

    return collisions;
  }

  checkNearMisses() {
    if (!this.playerBox) {
      return [];
    }

    const events = [];

    for (const traffic of this.trafficBoxes.values()) {
      const dx =
        Math.abs(
          this.playerBox.worldX -
            traffic.worldX
        );

      const dz =
        Math.abs(
          this.playerBox.worldZ -
            traffic.worldZ
        );

      const xGap =
        dx -
        (this.playerBox.width +
          traffic.width) *
          0.5;

      const zGap =
        dz -
        (this.playerBox.length +
          traffic.length) *
          0.5;

      if (
        xGap > 0 &&
        xGap <= this.nearMissDistance &&
        zGap <= 0
      ) {
        events.push({
          player: this.playerBox,
          traffic,
          distance: xGap,
          frame: this.frame
        });
      }
    }

    if (this.onNearMiss) {
      for (const event of events) {
        this.onNearMiss(event);
      }
    }

    return events;
  }

  update({
    frame,
    player,
    traffic
  } = {}) {
    this.beginFrame(
      Number.isFinite(frame)
        ? frame
        : this.frame + 1
    );

    if (player) {
      this.setPlayer(player);
    }

    if (traffic) {
      this.setTraffic(traffic);
    }

    return {
      collisions:
        this.checkPlayerAgainstTraffic(),
      nearMisses:
        this.checkNearMisses()
    };
  }

  clear() {
    this.playerBox = null;
    this.trafficBoxes.clear();
    this.lastCollisionKey = null;
    this.lastCollisionFrame = -1;
  }
}

export {
  DEFAULT_LANE_X,
  laneToX,
  makeBox,
  overlaps
};

export default WorldCollision;