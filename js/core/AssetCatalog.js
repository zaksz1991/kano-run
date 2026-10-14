/**
 * Complete catalog from model-inventory.txt (real repo paths).
 * URL space in GLB names is encoded as %20 when loading.
 */
function u(path) {
  // Keep path readable; encode only path segments with spaces at load time
  return path.startsWith("/") ? path : `/${path}`;
}

export const MODEL_PATHS = Object.freeze({
  player: {
    standard: "/assets/models/keke/keke-3.glb",
    luxury: "/assets/models/keke/keke-7.glb",
    cargo: "/assets/models/keke/keke-8.glb",
    open: "/assets/models/keke/keke-2.glb",
    police: "/assets/models/keke/keke-6.glb",
    karota: "/assets/models/keke/keke-4.glb",
    keke1: "/assets/models/keke/keke-1.glb",
    keke5: "/assets/models/keke/keke-5.glb",
  },

  traffic: {
    car: "/assets/models/car-kit/sedan.glb",
    car1: "/assets/models/car-kit/hatchback-sports.glb",
    car2: "/assets/models/cars-bundle/Car.glb",
    car3: "/assets/models/cars-bundle/Police Car.glb",
    car4: "/assets/models/cars-bundle/SUV.glb",
    sedanSports: "/assets/models/car-kit/sedan-sports.glb",
    suv: "/assets/models/car-kit/suv.glb",
    suvLuxury: "/assets/models/car-kit/suv-luxury.glb",
    taxi: "/assets/models/car-kit/taxi.glb",
    taxiAlt: "/assets/models/cars-bundle/Taxi.glb",
    van: "/assets/models/car-kit/van.glb",
    bus: "/assets/models/city-pack/Bus.glb",
    motorcycle: "/assets/models/city-pack/Motorcycle.glb",
    bicycle: "/assets/models/city-pack/Bicycle.glb",
    truck: "/assets/models/car-kit/truck.glb",
    truckFlat: "/assets/models/car-kit/truck-flat.glb",
    pickup: "/assets/models/city-pack/Pickup Truck.glb",
    delivery: "/assets/models/car-kit/delivery.glb",
    garbage: "/assets/models/car-kit/garbage-truck.glb",
    firetruck: "/assets/models/car-kit/firetruck.glb",
    ambulance: "/assets/models/car-kit/ambulance.glb",
    police: "/assets/models/car-kit/police.glb",
    policeAlt: "/assets/models/city-pack/Police Car.glb",
    sports: "/assets/models/cars-bundle/Sports Car.glb",
    keke: "/assets/models/keke/keke-1.glb",
    keke2: "/assets/models/keke/keke-2.glb",
    keke3: "/assets/models/keke/keke-3.glb",
  },

  environment: {
    suburban: [
      "/assets/models/city-kit-suburban/building-type-a.glb",
      "/assets/models/city-kit-suburban/building-type-b.glb",
      "/assets/models/city-kit-suburban/building-type-c.glb",
      "/assets/models/city-kit-suburban/building-type-d.glb",
      "/assets/models/city-kit-suburban/building-type-e.glb",
      "/assets/models/city-kit-suburban/building-type-f.glb",
      "/assets/models/city-kit-suburban/building-type-g.glb",
      "/assets/models/city-kit-suburban/building-type-h.glb",
      "/assets/models/city-kit-suburban/building-type-i.glb",
      "/assets/models/city-kit-suburban/building-type-j.glb",
      "/assets/models/city-kit-suburban/building-type-k.glb",
      "/assets/models/city-kit-suburban/building-type-l.glb",
      "/assets/models/city-kit-suburban/building-type-m.glb",
      "/assets/models/city-kit-suburban/building-type-n.glb",
      "/assets/models/city-kit-suburban/building-type-o.glb",
      "/assets/models/city-kit-suburban/building-type-p.glb",
      "/assets/models/city-kit-suburban/building-type-q.glb",
      "/assets/models/city-kit-suburban/building-type-r.glb",
      "/assets/models/city-kit-suburban/building-type-s.glb",
      "/assets/models/city-kit-suburban/building-type-t.glb",
      "/assets/models/city-kit-suburban/building-type-u.glb",
    ],
    industrial: [
      "/assets/models/city-kit-industrial/building-a.glb",
      "/assets/models/city-kit-industrial/building-b.glb",
      "/assets/models/city-kit-industrial/building-c.glb",
      "/assets/models/city-kit-industrial/building-d.glb",
      "/assets/models/city-kit-industrial/building-e.glb",
      "/assets/models/city-kit-industrial/building-f.glb",
      "/assets/models/city-kit-industrial/building-g.glb",
      "/assets/models/city-kit-industrial/building-h.glb",
      "/assets/models/city-kit-industrial/building-i.glb",
      "/assets/models/city-kit-industrial/building-j.glb",
      "/assets/models/city-kit-industrial/building-k.glb",
      "/assets/models/city-kit-industrial/building-l.glb",
      "/assets/models/city-kit-industrial/building-m.glb",
      "/assets/models/city-kit-industrial/building-n.glb",
      "/assets/models/city-kit-industrial/building-o.glb",
      "/assets/models/city-kit-industrial/building-p.glb",
      "/assets/models/city-kit-industrial/building-q.glb",
      "/assets/models/city-kit-industrial/building-r.glb",
      "/assets/models/city-kit-industrial/building-s.glb",
      "/assets/models/city-kit-industrial/building-t.glb",
      "/assets/models/city-kit-industrial/water-tower.glb",
      "/assets/models/city-kit-industrial/shipping-container-a.glb",
      "/assets/models/city-kit-industrial/shipping-container-b.glb",
      "/assets/models/city-kit-industrial/chimney-medium.glb",
    ],
    cityPackBuildings: [
      "/assets/models/city-pack/Big Building.glb",
      "/assets/models/city-pack/Brown Building.glb",
      "/assets/models/city-pack/Building Green.glb",
      "/assets/models/city-pack/Building Red.glb",
      "/assets/models/city-pack/Building Red Corner.glb",
      "/assets/models/city-pack/Pizza Corner.glb",
      "/assets/models/city-pack/Greenhouse.glb",
    ],
    props: [
      "/assets/models/city-pack/Tree.glb",
      "/assets/models/city-kit-suburban/tree-large.glb",
      "/assets/models/city-kit-suburban/tree-small.glb",
      "/assets/models/city-pack/Bench.glb",
      "/assets/models/city-pack/Billboard.glb",
      "/assets/models/city-pack/Bus Stop.glb",
      "/assets/models/city-pack/Bus stop sign.glb",
      "/assets/models/city-pack/Traffic Light.glb",
      "/assets/models/city-pack/Fire hydrant.glb",
      "/assets/models/city-pack/Trash Can.glb",
      "/assets/models/city-pack/Dumpster.glb",
      "/assets/models/city-pack/Mailbox.glb",
      "/assets/models/city-pack/ATM.glb",
      "/assets/models/city-pack/Stop sign.glb",
      "/assets/models/city-pack/Cone.glb",
      "/assets/models/city-pack/Fence.glb",
      "/assets/models/city-kit-suburban/fence.glb",
      "/assets/models/city-kit-suburban/planter.glb",
      "/assets/models/city-pack/Planter & Bushes.glb",
      "/assets/models/city-kit-roads/light-curved.glb",
      "/assets/models/city-kit-roads/light-square.glb",
      "/assets/models/city-kit-roads/electricity-pole.glb",
      "/assets/models/city-kit-roads/traffic-light.glb",
      "/assets/models/city-kit-roads/road-sign-stop.glb",
      "/assets/models/city-kit-roads/dumpster.glb",
    ],
    road: [
      "/assets/models/city-kit-roads/road-straight.glb",
      "/assets/models/city-kit-roads/road-crossing.glb",
      "/assets/models/city-kit-roads/road-crossroad.glb",
    ],
  },

  characters: {
    passenger: "/assets/models/pedestrian-passengers/passenger.glb",
    pedestrian: "/assets/models/pedestrian-passengers/pedestrian.glb",
    hijab: "/assets/models/pedestrian-passengers/hijab_muslim_woman.glb",
    hijab2: "/assets/models/pedestrian-passengers/women_in_hijab.glb",
    muslimGirl: "/assets/models/pedestrian-passengers/muslim_girl.glb",
    man: "/assets/models/pedestrian-passengers/Man.glb",
    manSuit: "/assets/models/pedestrian-passengers/Man in Suit.glb",
    manLong: "/assets/models/pedestrian-passengers/Man in Long Sleeves.glb",
    igbo: "/assets/models/pedestrian-passengers/isi_agu_igbo_traditional_wear.glb",
    turban: "/assets/models/pedestrian-passengers/tekamist_mens_attire_and_tagulemust-_turban.glb",
    womanCrossed: "/assets/models/pedestrian-passengers/woman with her arms crossed.glb",
    kekeFemale: "/assets/models/pedestrian-passengers/keke female.glb",
    cityMan: "/assets/models/city-pack/Man.glb",
    animatedWoman: "/assets/models/city-pack/Animated Woman.glb",
  },
});

export const MODEL_SCALES = Object.freeze({
  player: {
    standard: 1.2, luxury: 1.2, cargo: 1.3, open: 1.2,
    police: 1.2, karota: 1.2, keke1: 1.2, keke5: 1.2,
  },
  traffic: {
    car: 1.0, car1: 1.0, car2: 1.0, car3: 1.0, car4: 1.0,
    sedanSports: 1.0, suv: 1.05, suvLuxury: 1.05,
    taxi: 1.0, taxiAlt: 1.0, van: 1.1, bus: 1.8,
    motorcycle: 0.85, bicycle: 0.7, truck: 1.6, truckFlat: 1.5,
    pickup: 1.2, delivery: 1.2, garbage: 1.5, firetruck: 1.5,
    ambulance: 1.2, police: 1.0, policeAlt: 1.0, sports: 1.0,
    keke: 1.0, keke2: 1.0, keke3: 1.0,
  },
  environment: { building: 1.0, prop: 1.0, road: 1.0 },
  characters: { passenger: 1.0, pedestrian: 1.0 },
});

/** Encode spaces in URL for fetch */
export function modelUrl(path) {
  return encodeURI(path);
}

export const BOOT_PRIORITY = Object.freeze([
  MODEL_PATHS.player.standard,
  MODEL_PATHS.traffic.car,
  MODEL_PATHS.traffic.keke,
  MODEL_PATHS.traffic.motorcycle,
  MODEL_PATHS.traffic.taxi,
]);

/** Theme → building pool */
export function buildingsForTheme(theme = "city") {
  const e = MODEL_PATHS.environment;
  if (theme === "industrial") return [...e.industrial];
  if (theme === "market" || theme === "city") {
    return [...e.cityPackBuildings, ...e.suburban.slice(0, 8)];
  }
  return [...e.suburban, ...e.cityPackBuildings.slice(0, 3)];
}

export function propsForTheme(theme = "city") {
  return MODEL_PATHS.environment.props;
}
