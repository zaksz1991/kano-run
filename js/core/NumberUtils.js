/**
 * Number Utilities
 * RuffNeck Entertainment — Kano Run
 */

export const NumberUtils = {
  clamp(value, min, max) {
    return Math.min(Math.max(value, min), max);
  },

  clamp01(value) {
    return this.clamp(value, 0, 1);
  },

  lerp(start, end, amount) {
    return start + (end - start) * amount;
  },

  inverseLerp(start, end, value) {
    if (start === end) return 0;
    return this.clamp01((value - start) / (end - start));
  },

  remap(value, inMin, inMax, outMin, outMax) {
    const amount = this.inverseLerp(inMin, inMax, value);
    return this.lerp(outMin, outMax, amount);
  },

  approximatelyEqual(a, b, epsilon = 0.0001) {
    return Math.abs(a - b) <= epsilon;
  },

  random(min = 0, max = 1, rng = Math.random) {
    return min + rng() * (max - min);
  },

  randomInt(min, max, rng = Math.random) {
    const lower = Math.ceil(Math.min(min, max));
    const upper = Math.floor(Math.max(min, max));

    return Math.floor(rng() * (upper - lower + 1)) + lower;
  },

  randomSign(rng = Math.random) {
    return rng() < 0.5 ? -1 : 1;
  },

  randomBool(probability = 0.5, rng = Math.random) {
    return rng() < this.clamp01(probability);
  },

  round(value, decimals = 0) {
    const factor = 10 ** decimals;
    return Math.round((value + Number.EPSILON) * factor) / factor;
  },

  floor(value, decimals = 0) {
    const factor = 10 ** decimals;
    return Math.floor(value * factor) / factor;
  },

  ceil(value, decimals = 0) {
    const factor = 10 ** decimals;
    return Math.ceil(value * factor) / factor;
  },

  toRadians(degrees) {
    return (degrees * Math.PI) / 180;
  },

  toDegrees(radians) {
    return (radians * 180) / Math.PI;
  },

  normalizeAngle(radians) {
    const fullTurn = Math.PI * 2;

    return ((radians % fullTurn) + fullTurn) % fullTurn;
  },

  shortestAngleDifference(from, to) {
    const fullTurn = Math.PI * 2;

    return (
      ((to - from + Math.PI) % fullTurn + fullTurn) %
        fullTurn -
      Math.PI
    );
  },

  moveTowards(current, target, maxDelta) {
    const difference = target - current;

    if (Math.abs(difference) <= maxDelta) {
      return target;
    }

    return current + Math.sign(difference) * maxDelta;
  },

  damp(current, target, smoothing, deltaTime) {
    const factor = 1 - Math.exp(-Math.max(0, smoothing) * Math.max(0, deltaTime));

    return this.lerp(current, target, factor);
  },

  smoothStep(edge0, edge1, value) {
    if (edge0 === edge1) {
      return value < edge0 ? 0 : 1;
    }

    const x = this.clamp01((value - edge0) / (edge1 - edge0));

    return x * x * (3 - 2 * x);
  },

  smootherStep(edge0, edge1, value) {
    if (edge0 === edge1) {
      return value < edge0 ? 0 : 1;
    }

    const x = this.clamp01((value - edge0) / (edge1 - edge0));

    return x * x * x * (x * (x * 6 - 15) + 10);
  },

  percentage(value, total) {
    if (total === 0) return 0;
    return (value / total) * 100;
  },

  formatNumber(value, decimals = 0) {
    return new Intl.NumberFormat("en-NG", {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    }).format(value);
  },

  formatCurrency(
    value,
    currency = "NGN",
    locale = "en-NG"
  ) {
    return new Intl.NumberFormat(locale, {
      style: "currency",
      currency,
      maximumFractionDigits: 2,
    }).format(value);
  },

  formatCompact(value, decimals = 1) {
    return new Intl.NumberFormat("en-NG", {
      notation: "compact",
      maximumFractionDigits: decimals,
    }).format(value);
  },

  isFiniteNumber(value) {
    return typeof value === "number" && Number.isFinite(value);
  },

  isInteger(value) {
    return Number.isInteger(value);
  },

  sum(...values) {
    return values.reduce((total, value) => total + value, 0);
  },

  average(...values) {
    if (!values.length) return 0;
    return this.sum(...values) / values.length;
  },

  distance1D(a, b) {
    return Math.abs(b - a);
  },

  distance2D(x1, y1, x2, y2) {
    return Math.hypot(x2 - x1, y2 - y1);
  },

  distance3D(x1, y1, z1, x2, y2, z2) {
    return Math.hypot(x2 - x1, y2 - y1, z2 - z1);
  },

  mapRange(value, inMin, inMax, outMin, outMax) {
    if (inMin === inMax) return outMin;

    return (
      outMin +
      ((value - inMin) / (inMax - inMin)) *
        (outMax - outMin)
    );
  },

  sign(value) {
    return Math.sign(value);
  },

  factorial(value) {
    if (!Number.isInteger(value) || value < 0) {
      throw new RangeError(
        "Factorial requires a non-negative integer."
      );
    }

    let result = 1;

    for (let i = 2; i <= value; i++) {
      result *= i;
    }

    return result;
  },

  fibonacci(count) {
    const length = Math.max(0, Math.floor(count));
    const result = [];

    let a = 0;
    let b = 1;

    for (let i = 0; i < length; i++) {
      result.push(a);
      [a, b] = [b, a + b];
    }

    return result;
  },
};

export default NumberUtils;