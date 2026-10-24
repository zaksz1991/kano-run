/**
 * Small, dependency-free gait rules for Kano Life's existing roadside actors.
 * Kept separate from Three.js so the rules can be regression-tested in Node.
 */
export const KANO_NORTHERN_GAIT = Object.freeze({
  instanceCountPerWalker: 2,
  angularFrequency: 5.6,
  swingRadians: 0.42,
  hipHeight: 0.215,
  lateralOffset: 0.095,
  torsoBob: 0.022,
});

export function gaitInstanceCount(walkerCount) {
  const count = Math.max(0, Math.floor(Number(walkerCount) || 0));
  return count * KANO_NORTHERN_GAIT.instanceCountPerWalker;
}

export function pedestrianGaitAngle(timeSeconds, phase, legIndex) {
  const time = Number.isFinite(Number(timeSeconds)) ? Number(timeSeconds) : 0;
  const offset = Number.isFinite(Number(phase)) ? Number(phase) : 0;
  const leg = Number(legIndex) === 1 ? 1 : 0;
  return Math.sin(time * KANO_NORTHERN_GAIT.angularFrequency + offset + leg * Math.PI)
    * KANO_NORTHERN_GAIT.swingRadians;
}

export function pedestrianLegLocalX(legIndex) {
  return (Number(legIndex) === 1 ? 1 : -1) * KANO_NORTHERN_GAIT.lateralOffset;
}

export function shouldAnimateFallbackWalker({ usingModel = false, fallback = false, visible = true } = {}) {
  return !usingModel && fallback && visible;
}

export function pedestrianTorsoBob(timeSeconds, phase) {
  const time = Number.isFinite(Number(timeSeconds)) ? Number(timeSeconds) : 0;
  const offset = Number.isFinite(Number(phase)) ? Number(phase) : 0;
  return Math.abs(Math.sin(time * KANO_NORTHERN_GAIT.angularFrequency + offset))
    * KANO_NORTHERN_GAIT.torsoBob;
}
