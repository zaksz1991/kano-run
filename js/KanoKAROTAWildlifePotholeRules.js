/**
 * Pure rules for the Kano Life Task 27 street-life and pothole presentation.
 * Kept independent of Three.js so the safety-critical geometry/placement
 * decisions can be regression-tested without booting WebGL.
 */

function seededRandom(seed) {
  let state = Number(seed) >>> 0;
  if (!state && typeof seed === 'string') {
    for (let index = 0; index < seed.length; index += 1) {
      state = (Math.imul(state, 31) + seed.charCodeAt(index)) >>> 0;
    }
  }
  state ||= 1;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 0x100000000;
  };
}

export function getKanoRoadsideAnimalPlan() {
  // Three additional goats extend the existing two-animal crossing into a
  // visible herd. Dogs remain on the sandy shoulder instead of entering lanes.
  return [
    { id: 'goat-3', kind: 'goat', x: 7.18, z: -0.72, speed: 0.60, phase: 0.4 },
    { id: 'goat-4', kind: 'goat', x: 7.78, z: -1.52, speed: 0.64, phase: 1.2 },
    { id: 'goat-5', kind: 'goat', x: 8.28, z: 0.42, speed: 0.57, phase: 2.1 },
    { id: 'dog-1', kind: 'dog', x: -5.05, z: -0.82, speed: 0.24, phase: 0.8 },
    { id: 'dog-2', kind: 'dog', x: -5.48, z: -2.05, speed: 0.20, phase: 2.4 },
  ];
}

export function buildJaggedCraterProfile(seed, segments = 18, innerRadius = 0.42, outerRadius = 0.62) {
  const count = Math.max(12, Math.min(36, Math.floor(Number(segments) || 18)));
  const rand = seededRandom(seed);
  const minInner = Math.max(0.05, Number(innerRadius) || 0.42);
  const maxOuter = Math.max(minInner + 0.08, Number(outerRadius) || 0.62);
  const points = [];

  for (let index = 0; index < count; index += 1) {
    const angle = (index / count) * Math.PI * 2;
    const inner = minInner * (0.88 + rand() * 0.22);
    const outer = Math.max(inner + 0.06, maxOuter * (0.87 + rand() * 0.24));
    points.push({
      angle,
      innerRadius: inner,
      outerRadius: outer,
      innerHeight: 0.016 + rand() * 0.006,
      outerHeight: 0.030 + rand() * 0.017,
    });
  }
  return points;
}

export function isKanoTask27EventType(value) {
  return value === 'goatCrossing' || value === 'karota';
}
