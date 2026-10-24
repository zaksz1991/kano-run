/**
 * Pure layout rules for the Kano Life fuel forecourt.
 * Positions are local to the existing roadside fuel-zone actor.
 */
export const KANO_FUEL_STATION_BUDGET = Object.freeze({
  mobileMaxDrawParts: 16,
  desktopMaxDrawParts: 24,
  apronWidth: 4.1,
  apronDepth: 6.0,
  canopyWidth: 3.3,
  canopyDepth: 2.9,
  canopyHeight: 3.02,
  stationCenterOutward: 1.75,
});

export function getFuelStationSide(zoneSide, actorX = 0) {
  if (Number(zoneSide) === -1) return -1;
  if (Number(zoneSide) === 1) return 1;
  return Number(actorX) < 0 ? -1 : 1;
}

export function shouldUpgradeFuelStation(zone) {
  return Boolean(zone && zone.type === 'fuel' && zone.id != null);
}

export function buildKanoFuelStationLayout(side = 1, { mobile = false } = {}) {
  const outward = side < 0 ? -1 : 1;
  const centerX = outward * KANO_FUEL_STATION_BUDGET.stationCenterOutward;
  const pumpZOffsets = mobile ? [-0.62, 0.62] : [-0.72, 0.72];
  return Object.freeze({
    side: outward,
    centerX,
    apron: Object.freeze({ x: centerX + outward * 0.25, y: 0.015, z: 0.12, width: 4.1, depth: 6.0 }),
    canopy: Object.freeze({
      x: centerX,
      y: KANO_FUEL_STATION_BUDGET.canopyHeight,
      z: 0,
      width: KANO_FUEL_STATION_BUDGET.canopyWidth,
      depth: KANO_FUEL_STATION_BUDGET.canopyDepth,
    }),
    columns: Object.freeze([
      Object.freeze({ x: outward * 0.36, y: 1.47, z: -1.02 }),
      Object.freeze({ x: outward * 3.12, y: 1.47, z: -1.02 }),
      Object.freeze({ x: outward * 0.36, y: 1.47, z: 1.02 }),
      Object.freeze({ x: outward * 3.12, y: 1.47, z: 1.02 }),
    ]),
    pumps: Object.freeze(pumpZOffsets.map((z, index) => Object.freeze({
      index,
      x: centerX,
      y: 0.72,
      z,
    }))),
    priceBoard: Object.freeze({ x: outward * 3.62, y: 1.78, z: -1.72 }),
    sign: Object.freeze({ x: centerX, y: 3.06, z: 1.49 }),
    mobile: Boolean(mobile),
  });
}

export function makeFuelStationDisplayLines() {
  return Object.freeze([
    Object.freeze({ label: 'PETROL', line: 0 }),
    Object.freeze({ label: 'DIESEL', line: 1 }),
    Object.freeze({ label: 'KANO FUEL', line: 2 }),
  ]);
}
