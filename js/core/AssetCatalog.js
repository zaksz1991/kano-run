export const MODEL_PATHS = Object.freeze({
  player: {
    standard: "/assets/models/keke/keke-3.glb",
    luxury: "/assets/models/keke/keke-7.glb",
    cargo: "/assets/models/keke/keke-8.glb",
    open: "/assets/models/keke/keke-2.glb",
    police: "/assets/models/keke/keke-6.glb",
    karota: "/assets/models/keke/keke-4.glb",
  },
  traffic: {
    car: "/assets/models/car-kit/sedan.glb",
    car1: "/assets/models/car-kit/hatchback-sports.glb",
    car2: "/assets/models/cars-bundle/Car.glb",
    car3: "/assets/models/cars-bundle/Police Car.glb",
    car4: "/assets/models/cars-bundle/SUV.glb",
    taxi: "/assets/models/car-kit/taxi.glb",
    bus: "/assets/models/city-pack/Bus.glb",
    motorcycle: "/assets/models/city-pack/Motorcycle.glb",
    vespa: "/assets/models/city-pack/Motorcycle.glb",
    truck: "/assets/models/car-kit/truck.glb",
    pickup: "/assets/models/city-pack/Pickup Truck.glb",
    oldBike: "/assets/models/city-pack/Motorcycle.glb",
    keke: "/assets/models/keke/keke-1.glb",
    keke1: "/assets/models/keke/keke-2.glb",
    keke2: "/assets/models/keke/keke-3.glb",
    keke3: "/assets/models/keke/keke-4.glb",
    keke4: "/assets/models/keke/keke-5.glb",
    keke5: "/assets/models/keke/keke-6.glb",
    police: "/assets/models/car-kit/police.glb",
  },
  environment: {
    buildingLow: [
      "/assets/models/city-kit-suburban/building-type-a.glb",
      "/assets/models/city-kit-suburban/building-type-b.glb",
      "/assets/models/city-kit-suburban/building-type-c.glb",
      "/assets/models/city-pack/Large Building.glb",
      "/assets/models/city-pack/Small Building.glb",
    ],
    industrial: [
      "/assets/models/city-kit-industrial/building-a.glb",
      "/assets/models/city-kit-industrial/building-b.glb",
      "/assets/models/city-kit-industrial/warehouse.glb",
      "/assets/models/city-pack/Warehouse.glb",
    ],
    props: [
      "/assets/models/city-pack/Tree.glb",
      "/assets/models/city-pack/Bench.glb",
      "/assets/models/city-pack/Street Light.glb",
      "/assets/models/city-pack/Traffic Light.glb",
      "/assets/models/city-pack/Fire Hydrant.glb",
    ],
    road: [
      "/assets/models/city-kit-roads/road-straight.glb",
      "/assets/models/city-kit-roads/road-crossing.glb",
    ],
  },
  characters: {
    passenger: "/assets/models/pedestrian-passengers/passenger.glb",
    pedestrian: "/assets/models/pedestrian-passengers/pedestrian.glb",
    hijab: "/assets/models/pedestrian-passengers/hijab_muslim_woman.glb",
    man: "/assets/models/pedestrian-passengers/Man.glb",
    suit: "/assets/models/pedestrian-passengers/Man in Suit.glb",
  },
});

export const MODEL_SCALES = Object.freeze({
  player: { standard: 1.2, luxury: 1.2, cargo: 1.3, open: 1.2, police: 1.2, karota: 1.2 },
  traffic: {
    car: 1.0, car1: 1.0, car2: 1.0, car3: 1.0, car4: 1.0, taxi: 1.0, bus: 1.8,
    motorcycle: 0.8, vespa: 0.8, truck: 1.6, pickup: 1.2, oldBike: 0.8,
    keke: 1.0, keke1: 1.0, keke2: 1.0, keke3: 1.0, keke4: 1.0, keke5: 1.0, police: 1.0,
  },
  environment: { building: 1.0, prop: 1.0, road: 1.0 },
  characters: { passenger: 1.0, pedestrian: 1.0 },
});

export const BOOT_PRIORITY = Object.freeze([
  MODEL_PATHS.player.standard,
  MODEL_PATHS.traffic.car,
  MODEL_PATHS.traffic.keke,
  MODEL_PATHS.traffic.motorcycle,
]);
