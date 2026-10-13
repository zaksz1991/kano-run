const MathUtils = {
  EPSILON: 1e-8,

  clamp(value, min, max) {
    return Math.min(Math.max(value, min), max);
  },

  saturate(value) {
    return this.clamp(value, 0, 1);
  },

  lerp(start, end, t) {
    return start + (end - start) * t;
  },

  inverseLerp(start, end, value) {
    if (start === end) return 0;
    return (value - start) / (end - start);
  },

  mapRange(value, inMin, inMax, outMin, outMax, shouldClamp = false) {
    let t = this.inverseLerp(inMin, inMax, value);

    if (shouldClamp) {
      t = this.saturate(t);
    }

    return this.lerp(outMin, outMax, t);
  },

  smoothstep(edge0, edge1, value) {
    const t = this.saturate(this.inverseLerp(edge0, edge1, value));
    return t * t * (3 - 2 * t);
  },

  smootherstep(edge0, edge1, value) {
    const t = this.saturate(this.inverseLerp(edge0, edge1, value));
    return t * t * t * (t * (t * 6 - 15) + 10);
  },

  damp(current, target, smoothing, deltaTime) {
    const factor = 1 - Math.exp(-Math.max(0, smoothing) * Math.max(0, deltaTime));
    return this.lerp(current, target, factor);
  },

  moveTowards(current, target, maxDelta) {
    const difference = target - current;

    if (Math.abs(difference) <= maxDelta) {
      return target;
    }

    return current + Math.sign(difference) * maxDelta;
  },

  random(min = 0, max = 1) {
    return min + Math.random() * (max - min);
  },

  randomInt(min, max) {
    const lower = Math.ceil(Math.min(min, max));
    const upper = Math.floor(Math.max(min, max));

    return Math.floor(Math.random() * (upper - lower + 1)) + lower;
  },

  randomSign() {
    return Math.random() < 0.5 ? -1 : 1;
  },

  randomElement(items) {
    if (!Array.isArray(items) || items.length === 0) {
      return null;
    }

    return items[this.randomInt(0, items.length - 1)];
  },

  weightedChoice(items, weightKey = "weight") {
    if (!Array.isArray(items) || items.length === 0) {
      return null;
    }

    const weights = items.map((item) =>
      Math.max(0, Number(item?.[weightKey]) || 0)
    );

    const totalWeight = weights.reduce((sum, weight) => sum + weight, 0);

    if (totalWeight <= 0) {
      return this.randomElement(items);
    }

    let roll = Math.random() * totalWeight;

    for (let i = 0; i < items.length; i += 1) {
      roll -= weights[i];

      if (roll < 0) {
        return items[i];
      }
    }

    return items[items.length - 1];
  },

  degreesToRadians(degrees) {
    return (degrees * Math.PI) / 180;
  },

  radiansToDegrees(radians) {
    return (radians * 180) / Math.PI;
  },

  normalizeAngle(radians) {
    const fullTurn = Math.PI * 2;
    return ((radians % fullTurn) + fullTurn) % fullTurn;
  },

  shortestAngleDifference(from, to) {
    const fullTurn = Math.PI * 2;
    let difference = (to - from) % fullTurn;

    if (difference > Math.PI) difference -= fullTurn;
    if (difference < -Math.PI) difference += fullTurn;

    return difference;
  },

  lerpAngle(from, to, t) {
    return from + this.shortestAngleDifference(from, to) * t;
  },

  wrap(value, min, max) {
    const range = max - min;

    if (range <= 0) return min;

    return ((value - min) % range + range) % range + min;
  },

  distance2D(x1, y1, x2, y2) {
    return Math.hypot(x2 - x1, y2 - y1);
  },

  distance3D(x1, y1, z1, x2, y2, z2) {
    return Math.hypot(x2 - x1, y2 - y1, z2 - z1);
  },

  distanceSquared2D(x1, y1, x2, y2) {
    const dx = x2 - x1;
    const dy = y2 - y1;

    return dx * dx + dy * dy;
  },

  dot2D(ax, ay, bx, by) {
    return ax * bx + ay * by;
  },

  length2D(x, y) {
    return Math.hypot(x, y);
  },

  normalize2D(x, y) {
    const length = Math.hypot(x, y);

    if (length <= this.EPSILON) {
      return { x: 0, y: 0 };
    }

    return {
      x: x / length,
      y: y / length,
    };
  },

  add2D(a, b) {
    return {
      x: (a.x || 0) + (b.x || 0),
      y: (a.y || 0) + (b.y || 0),
    };
  },

  subtract2D(a, b) {
    return {
      x: (a.x || 0) - (b.x || 0),
      y: (a.y || 0) - (b.y || 0),
    };
  },

  scale2D(vector, scalar) {
    return {
      x: (vector.x || 0) * scalar,
      y: (vector.y || 0) * scalar,
    };
  },

  lerp2D(a, b, t) {
    return {
      x: this.lerp(a.x || 0, b.x || 0, t),
      y: this.lerp(a.y || 0, b.y || 0, t),
    };
  },

  vectorLength3D(vector) {
    return Math.hypot(
      vector?.x || 0,
      vector?.y || 0,
      vector?.z || 0
    );
  },

  normalize3D(vector) {
    const x = vector?.x || 0;
    const y = vector?.y || 0;
    const z = vector?.z || 0;
    const length = Math.hypot(x, y, z);

    if (length <= this.EPSILON) {
      return { x: 0, y: 0, z: 0 };
    }

    return {
      x: x / length,
      y: y / length,
      z: z / length,
    };
  },

  lerp3D(a, b, t) {
    return {
      x: this.lerp(a.x || 0, b.x || 0, t),
      y: this.lerp(a.y || 0, b.y || 0, t),
      z: this.lerp(a.z || 0, b.z || 0, t),
    };
  },

  approximatelyEqual(a, b, epsilon = 1e-6) {
    return Math.abs(a - b) <= epsilon;
  },

  isFiniteNumber(value) {
    return typeof value === "number" && Number.isFinite(value);
  },

  roundTo(value, decimalPlaces = 0) {
    const factor = 10 ** decimalPlaces;
    return Math.round(value * factor) / factor;
  },

  formatDistance(meters) {
    const distance = Math.max(0, Number(meters) || 0);

    if (distance >= 1000) {
      return `${(distance / 1000).toFixed(2)} km`;
    }

    return `${Math.round(distance)} m`;
  },

  formatDuration(seconds) {
    const totalSeconds = Math.max(0, Math.floor(Number(seconds) || 0));
    const minutes = Math.floor(totalSeconds / 60);
    const remainingSeconds = totalSeconds % 60;

    if (minutes >= 60) {
      const hours = Math.floor(minutes / 60);
      const remainingMinutes = minutes % 60;

      return [
        String(hours).padStart(2, "0"),
        String(remainingMinutes).padStart(2, "0"),
        String(remainingSeconds).padStart(2, "0"),
      ].join(":");
    }

    return [
      String(minutes).padStart(2, "0"),
      String(remainingSeconds).padStart(2, "0"),
    ].join(":");
  },

  uuid() {
    if (globalThis.crypto?.randomUUID) {
      return globalThis.crypto.randomUUID();
    }

    return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (char) => {
      const random = Math.floor(Math.random() * 16);
      const value = char === "x" ? random : (random & 0x3) | 0x8;

      return value.toString(16);
    });
  },
};

export default MathUtils;