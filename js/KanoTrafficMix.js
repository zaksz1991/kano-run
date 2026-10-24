/**
 * Kano Life — weighted traffic family selector.
 *
 * Base composition is exactly 40% keke, 30% motorcycles, and 30% four-wheel
 * traffic. Service vehicles are selected only within the four-wheel share, so
 * the target category balance is preserved while Kano's Hiace and police
 * pickup fallbacks can appear on phones.
 */
import './KanoFlyoverDriveabilityUpgrade.js';
// Activate the existing mobile GLB geometry reducer before ModelManager is
// constructed by the startup presentation layer. The reducer is mobile-only;
// it works on derived in-memory geometry and never writes to public/assets.
import './KanoMobileGeometryBudgetUpgrade.js';
const NORMALIZE_ROLL = (value) => {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return 0;
  return Math.max(0, Math.min(0.999999999, numeric));
};

export function chooseKanoTrafficType(mixRoll, nextRandom = Math.random, mobile = false) {
  const roll = NORMALIZE_ROLL(mixRoll);
  if (roll < 0.4) return 'keke';
  if (roll < 0.7) return 'motorcycle';
  const familyRoll = NORMALIZE_ROLL(typeof nextRandom === 'function' ? nextRandom() : 0);
  if (mobile) {
    // Both key Kano service vehicles are mobile-enabled. The first three
    // choices retain regular traffic variety; the remaining share is split
    // between Hiace-style minibuses and police pickups.
    if (familyRoll < 0.20) return 'car';
    if (familyRoll < 0.35) return 'taxi';
    if (familyRoll < 0.50) return 'suv';
    if (familyRoll < 0.725) return 'bus';
    return 'police';
  }
  if (familyRoll < 0.20) return 'car';
  if (familyRoll < 0.35) return 'taxi';
  if (familyRoll < 0.50) return 'suv';
  if (familyRoll < 0.65) return 'bus';
  if (familyRoll < 0.80) return 'police';
  if (familyRoll < 0.90) return 'truck';
  return 'karota';
}
export function getKanoTrafficFamily(type) {
  if (type === 'keke') return 'keke';
  if (type === 'motorcycle') return 'motorcycle';
  if (['car', 'taxi', 'suv', 'bus', 'police', 'truck', 'karota'].includes(type)) return 'four-wheel';
  return 'other';
}
