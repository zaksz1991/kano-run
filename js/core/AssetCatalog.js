// js/core/AssetCatalog.js

export const MODEL_PATHS = Object.freeze({
  player: {
    standard: "/models/keke.glb",
    luxury: "/models/keke1.glb",
    cargo: "/models/keke2.glb",
    open: "/models/keke3.glb",
    police: "/models/keke4.glb",
    karota: "/models/keke5.glb",
  },
  traffic: {
    car: "/models/Car.glb",
    car1: "/models/Car1.glb",
    car2: "/models/Car2.glb",
    car3: "/models/Car3.glb",
    car4: "/models/Car4.glb",
    car5: "/models/Car5.glb",
    car6: "/models/Car6.glb",
    redCar: "/models/RedCar.glb",
    taxi: "/models/Taxi.glb",
    bus: "/models/Truck.glb", 
    motorcycle: "/models/Bike.glb",
    vespa: "/models/VespaBike.glb",
    pickup: "/models/PickupTruck.glb",
    oldBike: "/models/OldBike.glb",
  }
});

export const MODEL_SCALES = Object.freeze({
  player: { 
    standard: 1.0, luxury: 1.0, cargo: 1.1, open: 1.0, police: 1.0, karota: 1.0 
  },
  traffic: { 
    car: 1.0, car1: 1.0, car2: 1.0, car3: 1.0, car4: 1.0, car5: 1.0, car6: 1.0, 
    redCar: 1.0, taxi: 1.0, bus: 1.2, motorcycle: 0.9, vespa: 0.9, pickup: 1.1, oldBike: 0.9
  }
});