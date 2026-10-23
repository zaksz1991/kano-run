/**
 * Kano Life Step 100 — stable traffic mix rules.
 * A randomized ten-vehicle bag keeps each complete batch at 40% keke,
 * 30% motorcycle/okada, and 30% sedan/car while avoiding a fixed sequence.
 */
export const KANO_TRAFFIC_BAG_SIZE = 10;

export function createKanoTrafficBag(random = Math.random) {
  const bag = [
    'keke', 'keke', 'keke', 'keke',
    'motorcycle', 'motorcycle', 'motorcycle',
    'car', 'car', 'car',
  ];

  // Fisher–Yates shuffling preserves the exact category counts per batch.
  for (let i = bag.length - 1; i > 0; i -= 1) {
    const value = Number(random());
    const bounded = Number.isFinite(value) ? Math.max(0, Math.min(0.999999999, value)) : 0.5;
    const j = Math.floor(bounded * (i + 1));
    [bag[i], bag[j]] = [bag[j], bag[i]];
  }

  return bag;
}

export function takeNextKanoTrafficType(state, random = Math.random) {
  if (!state || typeof state !== 'object') return null;
  if (!Array.isArray(state._kanoTrafficCompositionQueue) || state._kanoTrafficCompositionQueue.length === 0) {
    state._kanoTrafficCompositionQueue = createKanoTrafficBag(random);
  }
  return state._kanoTrafficCompositionQueue.shift() || null;
}
