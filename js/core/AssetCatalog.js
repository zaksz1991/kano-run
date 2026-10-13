// js/core/AssetCatalog.js

export const MODEL_PATHS = Object.freeze({
  player: {
    standard: "/models/keke3.glb", 
    luxury: "/models/keke4.glb",    
    cargo: "/models/keke5.glb",     
    open: "/models/keke3.glb",
    police: "/models/keke4.glb",
    karota: "/models/keke5.glb",
  },
  traffic: {
    car: "/models/Car.glb",
    car1: "/models/Car5.glb",
    car2: "/models/Car6.glb",
    car3: "/models/RedCar.glb",
    car4: "/models/Car.glb", 
    taxi: "/models/Car.glb", 
    bus: "/models/Car5.glb", 
    motorcycle: "/models/Bike.glb",
    vespa: "/models/VespaBike.glb",
    truck: "/models/Car6.glb", 
    pickup: "/models/Car5.glb",
    oldBike: "/models/VespaBike.glb",
  },
  // 🔥 NEW: Environment & Characters
  environment: {
    market: "/models/market.glb",
    bustop: "/models/bustop.glb",
    abstract: "/models/abstract.glb",
    road: "/models/road.glb",
  },
  characters: {
    passenger: "/models/passenger.glb",
    pedestrian: "/models/pedestrian.glb",
  }
});

export const MODEL_SCALES = Object.freeze({
  player: { standard: 1.2, luxury: 1.2, cargo: 1.3, open: 1.2, police: 1.2, karota: 1.2 },
  traffic: { car: 1.0, car1: 1.0, car2: 1.0, car3: 1.0, car4: 1.0, taxi: 1.0, bus: 1.8, motorcycle: 0.8, vespa: 0.8, truck: 1.6, pickup: 1.2, oldBike: 0.8 },
  environment: { market: 1.5, bustop: 1.0, abstract: 1.2, road: 1.0 },
  characters: { passenger: 1.0, pedestrian: 1.0 }
});