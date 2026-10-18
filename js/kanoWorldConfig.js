/**
 * Kano Life — World Configuration
 *
 * Defines reusable locations and visual themes for
 * a Northern Nigerian urban driving environment.
 *
 * These are configuration objects, not 3D models.
 * Connect them to the existing world renderer.
 */

export const KANO_WORLD_CONFIG = Object.freeze({
  road: {
    laneWidth: 3.5,
    shoulderWidth: 2,
    defaultSpeedLimit: 40,
    potholeDensity: 0.18,
    pedestrianDensity: 0.65,
    kekeDensity: 0.75,
    motorcycleDensity: 0.55,
  },

  vehicleTraffic: {
    minimumKekes: 8,
    maximumKekes: 18,
    minimumMotorcycles: 5,
    maximumMotorcycles: 14,
    minimumCars: 4,
    maximumCars: 12,
  },

  pedestrians: {
    minimumCount: 12,
    maximumCount: 35,
    marketDensityMultiplier: 1.8,
    crossingDistance: 8,
  },

  environment: {
    timeOfDay: "morning",
    ambientDust: true,
    roadsideMarkets: true,
    northernArchitecture: true,
    roadsideShops: true,
    goatsNearMarkets: true,
  },

  flyover: {
    enabled: true,
    stripeColors: ["#D71920", "#FFFFFF"],
    stripeWidth: 1.5,
    railingHeight: 1.2,
    pillarSpacing: 12,
  },

  checkpoints: {
    generalEnabled: true,
    karotaEnabled: true,
    signageEnabled: true,
  },
});

/**
 * Example world zones.
 *
 * Coordinates are illustrative placeholders.
 * Replace them with positions matching the actual
 * road geometry in the existing game.
 */
export const KANO_WORLD_ZONES = Object.freeze([
  {
    id: "urban-market",
    name: "Kano Market Road",
    type: "market",
    center: { x: 0, z: 0 },
    length: 180,
    roadWidth: 14,
    features: [
      "roadside_shops",
      "pedestrians",
      "keke_stands",
      "motorcycles",
      "occasional_goats",
    ],
    trafficMultiplier: 1.5,
  },

  {
    id: "residential-road",
    name: "Residential Neighbourhood",
    type: "residential",
    center: { x: 0, z: 220 },
    length: 240,
    roadWidth: 10,
    features: [
      "compound_walls",
      "small_shops",
      "pedestrians",
      "parked_kekes",
    ],
    trafficMultiplier: 0.8,
  },

  {
    id: "flyover-approach",
    name: "Kano Flyover Approach",
    type: "flyover_approach",
    center: { x: 0, z: 520 },
    length: 100,
    roadWidth: 16,
    features: [
      "flyover_pillars",
      "red_white_railings",
      "directional_signs",
      "traffic",
    ],
    trafficMultiplier: 1.2,
  },

  {
    id: "transport-checkpoint",
    name: "Keke Transport Checkpoint",
    type: "checkpoint",
    center: { x: 0, z: 700 },
    length: 45,
    roadWidth: 18,
    features: [
      "checkpoint_sign",
      "inspection_area",
      "waiting_kekes",
    ],
    trafficMultiplier: 0.6,
  },
]);

/**
 * Get a world zone by ID.
 */
export function getWorldZone(zoneId) {
  return (
    KANO_WORLD_ZONES.find(
      (zone) => zone.id === zoneId
    ) ?? null
  );
}

/**
 * Get configuration for a particular environment.
 */
export function getEnvironmentConfig(zoneType) {
  const zone = KANO_WORLD_ZONES.find(
    (item) => item.type === zoneType
  );

  return {
    ...KANO_WORLD_CONFIG,
    zone: zone ?? null,
  };
}

/**
 * Generate alternating flyover stripe colors.
 *
 * The renderer should apply these colors to the
 * flyover railing or other appropriate surfaces.
 */
export function getFlyoverStripeColor(index) {
  const colors =
    KANO_WORLD_CONFIG.flyover.stripeColors;

  return colors[
    Math.abs(Math.floor(index)) % colors.length
  ];
}

/**
 * Calculate a suggested traffic count for a zone.
 */
export function getSuggestedTrafficCount(
  minimum,
  maximum,
  multiplier = 1
) {
  const low = Math.max(
    0,
    Math.floor(minimum * multiplier)
  );

  const high = Math.max(
    low,
    Math.floor(maximum * multiplier)
  );

  return (
    Math.floor(
      Math.random() * (high - low + 1)
    ) + low
  );
}