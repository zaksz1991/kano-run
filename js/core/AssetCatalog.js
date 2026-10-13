// js/core/AssetCatalog.js

export const MODEL_PATHS = Object.freeze({
  player: {
    standard: "/assets/models/keke3.glb", // Using keke3 as base
    luxury: "/assets/models/keke4.glb",    // Using keke4
    cargo: "/assets/models/keke5.glb",     // Using keke5
    open: "/assets/models/keke3.glb",
    police: "/assets/models/keke4.glb",
    karota: "/assets/models/keke5.glb",
  },
  traffic: {
    car: "/assets/models/Car.glb",
    car1: "/assets/models/Car5.glb",
    car2: "/assets/models/Car6.glb",
    car3: "/assets/models/RedCar.glb",
    car4: "/assets/models/Car.glb", // Reuse Car.glb
    taxi: "/assets/models/Car.glb", // Reuse Car.glb (will be colored yellow)
    bus: "/assets/models/Car5.glb", // Reuse Car5.glb (will be scaled up)
    motorcycle: "/assets/models/Bike.glb",
    vespa: "/assets/models/VespaBike.glb",
    truck: "/assets/models/Car6.glb", // Reuse Car6.glb (will be scaled up)
    pickup: "/assets/models/Car5.glb",
    oldBike: "/assets/models/VespaBike.glb",
  }
});

export const MODEL_SCALES = Object.freeze({
  player: { 
    standard: 1.2, luxury: 1.2, cargo: 1.3, open: 1.2, police: 1.2, karota: 1.2 
  },
  traffic: { 
    car: 1.0, car1: 1.0, car2: 1.0, car3: 1.0, car4: 1.0, 
    taxi: 1.0, bus: 1.8, motorcycle: 0.8, vespa: 0.8, 
    truck: 1.6, pickup: 1.2, oldBike: 0.8
  }
});