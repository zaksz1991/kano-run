export const PRIMARY_HUD_IDS = Object.freeze(['speed', 'fuel', 'pax']);

export function formatFareAmount(value) {
  const amount = Number(value);
  const safeAmount = Number.isFinite(amount) ? Math.max(0, Math.floor(amount)) : 0;
  return `₦${safeAmount.toLocaleString('en-NG')}`;
}

export function isDrivingScreenVisible({
  startHidden = false,
  lifeHidden = true,
  resultsHidden = true,
  menuHidden = true,
  hudInlineDisplay = '',
} = {}) {
  return Boolean(
    startHidden && lifeHidden && resultsHidden && menuHidden && hudInlineDisplay !== 'none',
  );
}

export function compactPassengerText(count, capacity) {
  const safeCount = Math.max(0, Math.floor(Number(count) || 0));
  const safeCapacity = Math.max(1, Math.floor(Number(capacity) || 1));
  return `${Math.min(safeCount, safeCapacity)}/${safeCapacity}`;
}
