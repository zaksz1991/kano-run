/** Pure geometry and looping rules shared by the flyover adapter tests. */
export const KANO_FLYOVER_DECK_HEIGHT = 4.64;
export const KANO_FLYOVER_DECK_HALF_LENGTH = 2.6;
export const KANO_FLYOVER_RAMP_END = 34;

const finite = (value, fallback = 0) => {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
};

export function kanoFlyoverHeightAt(relativeZ, deckHeight = KANO_FLYOVER_DECK_HEIGHT) {
  const z = finite(relativeZ, Infinity);
  const height = Math.max(0, finite(deckHeight, KANO_FLYOVER_DECK_HEIGHT));
  const deckHalf = KANO_FLYOVER_DECK_HALF_LENGTH;
  const rampEnd = KANO_FLYOVER_RAMP_END;
  if (!Number.isFinite(z) || height <= 0 || Math.abs(z) > rampEnd) return 0;
  if (Math.abs(z) <= deckHalf) return height;
  if (z > deckHalf) return height * ((rampEnd - z) / (rampEnd - deckHalf));
  return height * ((rampEnd + z) / (rampEnd - deckHalf));
}

/** Mirrors Renderer3D's existing single-step forward/reverse flyover recycle. */
export function kanoWrapFlyoverZ(z, loopDistance, farPass = 22) {
  const loop = Math.max(1, finite(loopDistance, 306));
  let next = finite(z, 0);
  if (next > farPass) next -= loop;
  else if (next < -loop) next += loop;
  return next;
}

export function kanoSignedRoadScroll(state, deltaSeconds) {
  const dt = Math.max(0, Math.min(0.05, finite(deltaSeconds, 0)));
  const speed = Number.isFinite(state?.signedSpeed)
    ? state.signedSpeed
    : state?.reverse
      ? -Math.abs(finite(state?.speed, 0))
      : Math.abs(finite(state?.speed, 0));
  return speed * dt * 0.28;
}
