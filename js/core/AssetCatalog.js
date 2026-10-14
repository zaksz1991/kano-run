/**
 * Curated realistic set — quality over quantity.
 * Full folders stay on disk; we only boot a small roster.
 */
export const MODEL_PATHS = Object.freeze({
  player: {
    standard: "/assets/models/keke/keke-3.glb",
    luxury: "/assets/models/keke/keke-7.glb",
    cargo: "/assets/models/keke/keke-8.glb",
  },
  traffic: {
    car: "/assets/models/car-kit/sedan.glb",
    car1: "/assets/models/car-kit/hatchback-sports.glb",
    taxi: "/assets/models/car-kit/taxi.glb",
    suv: "/assets/models/car-kit/suv.glb",
    bus: "/assets/models/city-pack/Bus.glb",
    motorcycle: "/assets/models/city-pack/Motorcycle.glb",
    truck: "/assets/models/car-kit/truck.glb",
    police: "/assets/models/car-kit/police.glb",
    van: "/assets/models/car-kit/van.glb",
    pickup: "/assets/models/city-pack/Pickup Truck.glb",
    keke: "/assets/models/keke/keke-1.glb",
  },
  /** Only these buildings at first — still real GLB art */
  buildingsBoot: [
    "/assets/models/city-pack/Big Building.glb",
    "/assets/models/city-pack/Brown Building.glb",
    "/assets/models/city-pack/Building Green.glb",
    "/assets/models/city-pack/Building Red.glb",
    "/assets/models/city-kit-suburban/building-type-a.glb",
    "/assets/models/city-kit-suburban/building-type-c.glb",
    "/assets/models/city-kit-suburban/building-type-e.glb",
    "/assets/models/city-kit-suburban/building-type-g.glb",
  ],
  /** Stream later for variety */
  buildingsMore: [
    "/assets/models/city-kit-suburban/building-type-b.glb",
    "/assets/models/city-kit-suburban/building-type-d.glb",
    "/assets/models/city-kit-suburban/building-type-f.glb",
    "/assets/models/city-kit-suburban/building-type-h.glb",
    "/assets/models/city-kit-suburban/building-type-i.glb",
    "/assets/models/city-kit-suburban/building-type-j.glb",
    "/assets/models/city-pack/Building Red Corner.glb",
    "/assets/models/city-pack/Pizza Corner.glb",
    "/assets/models/city-kit-industrial/building-a.glb",
    "/assets/models/city-kit-industrial/building-c.glb",
    "/assets/models/city-kit-industrial/building-e.glb",
  ],
  propsBoot: [
    "/assets/models/city-pack/Tree.glb",
    "/assets/models/city-kit-suburban/tree-large.glb",
    "/assets/models/city-pack/Bench.glb",
    "/assets/models/city-pack/Billboard.glb",
    "/assets/models/city-pack/Bus Stop.glb",
    "/assets/models/city-kit-roads/light-curved.glb",
  ],
  propsMore: [
    "/assets/models/city-pack/Traffic Light.glb",
    "/assets/models/city-pack/Fire hydrant.glb",
    "/assets/models/city-pack/Trash Can.glb",
    "/assets/models/city-pack/ATM.glb",
    "/assets/models/city-kit-roads/electricity-pole.glb",
    "/assets/models/city-kit-suburban/fence.glb",
  ],
  passengersBoot: [
    "/assets/models/pedestrian-passengers/passenger.glb",
    "/assets/models/pedestrian-passengers/hijab_muslim_woman.glb",
    "/assets/models/pedestrian-passengers/Man.glb",
  ],
  passengersMore: [
    "/assets/models/pedestrian-passengers/Man in Suit.glb",
    "/assets/models/pedestrian-passengers/women_in_hijab.glb",
    "/assets/models/pedestrian-passengers/muslim_girl.glb",
    "/assets/models/pedestrian-passengers/pedestrian.glb",
  ],
});

export const MODEL_SCALES = Object.freeze({
  player: { standard: 1.2, luxury: 1.2, cargo: 1.3 },
  traffic: {
    car: 1, car1: 1, taxi: 1, suv: 1.05, bus: 1.8, motorcycle: 0.85,
    truck: 1.6, police: 1, van: 1.1, pickup: 1.2, keke: 1,
  },
});

export const BOOT_PRIORITY = Object.freeze([
  MODEL_PATHS.player.standard,
  MODEL_PATHS.traffic.car,
  MODEL_PATHS.traffic.keke,
  MODEL_PATHS.traffic.motorcycle,
  ...MODEL_PATHS.buildingsBoot.slice(0, 4),
  ...MODEL_PATHS.propsBoot.slice(0, 3),
  ...MODEL_PATHS.passengersBoot.slice(0, 2),
]);
