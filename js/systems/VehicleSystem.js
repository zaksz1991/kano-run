import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { GAME_CONFIG } from "../core/config.js";
import { MODEL_PATHS, MODEL_SCALES } from "../core/AssetCatalog.js";

const DEFAULTS = {
  maxVehicles: 24,
  spawnDistance: 180,
  despawnDistance: 70,
  laneWidth: 3.8,
  roadWidth: 14,
  playerCollisionRadius: 1.3,
  minimumSpawnGap: 22,
  vehicleCollisionGap: 12,
  maxSpawnAttempts: 12,
};

const MODEL_YAW = {
  motorcycle: "flip",
  keke: "flip",
  car: "normal", car1: "normal", car2: "normal", taxi: "normal",
  bus: "normal", truck: "normal", police: "normal", karota: "normal",
  van: "normal", suv: "normal", pickup: "normal", delivery: "normal",
};

function facingYaw(type) {
  const t = String(type || "");
  if (t === "keke" || t.startsWith("keke") || t === "motorcycle") return Math.PI;
  return 0;
}

const MODEL_CHILD_FLIP = new Set([
  "motorcycle", "keke", "keke1", "keke2", "keke3", "keke4", "keke5",
]);

const VEHICLE_SPECS = {
  car: {
    width: 1.8, height: 1.45, length: 4.1, maxSpeed: 23, acceleration: 2.2, weight: 1.2,
    color: [0xc0392b, 0x2471a3, 0xf4d03f, 0xecf0f1, 0x273746],
    modelPath: MODEL_PATHS.traffic.car, modelScale: MODEL_SCALES.traffic.car,
  },
  car1: {
    width: 1.8, height: 1.45, length: 4.1, maxSpeed: 22, acceleration: 2.0, weight: 1.2,
    color: [0x2980b9, 0x8e44ad, 0x16a085],
    modelPath: MODEL_PATHS.traffic.car1, modelScale: MODEL_SCALES.traffic.car1,
  },
  car2: {
    width: 1.8, height: 1.45, length: 4.1, maxSpeed: 21, acceleration: 1.9, weight: 1.3,
    color: [0xe74c3c, 0xf39c12, 0x2c3e50],
    modelPath: MODEL_PATHS.traffic.car2, modelScale: MODEL_SCALES.traffic.car2,
  },
  taxi: {
    width: 1.85, height: 1.5, length: 4.3, maxSpeed: 19, acceleration: 