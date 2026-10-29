import './KanoPedestrianPavementWalkUpgrade.js';
import './KanoVehicleCollisionContactUpgrade.js';
/**
 * Kano Life — weighted traffic family selector.
 *
 * Base composition: 50% keke napep, 30% cars (car, taxi, SUV, police), and 20%
 * motorcycles, trucks and other.
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
  // Kano road mix: 50% keke napep, 30% cars, 20% motorcycles / trucks / other.
  // (The bus is left out until the player supplies a real bus GLB.)
  const roll = NORMALIZE_ROLL(mixRoll);
  if (roll < 0.5) return 'keke';
  const familyRoll = NORMALIZE_ROLL(typeof nextRandom === 'function' ? nextRandom() : 0);
  if (roll < 0.8) {
    if (familyRoll < 0.38) return 'car';
    if (familyRoll < 0.68) return 'taxi';
    if (familyRoll < 0.92) return 'suv';
    return 'police';
  }
  if (familyRoll < 0.68) return 'motorcycle';
  if (familyRoll < 0.96 || mobile) return 'truck';
  return 'karota';
}
export function getKanoTrafficFamily(type) {
  if (type === 'keke') return 'keke';
  if (type === 'motorcycle') return 'motorcycle';
  if (['car', 'taxi', 'suv', 'bus', 'police', 'truck', 'karota'].includes(type)) return 'four-wheel';
  return 'other';
}
