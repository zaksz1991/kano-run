import test from "node:test";
import assert from "node:assert/strict";

import {
  createVehiclePhysics,
  updateVehiclePhysics,
  moveVehicle,
} from "../js/vehiclePhysics.js";

import {
  createPotholeSystem,
} from "../js/potholeSystem.js";

import {
  isVehicleAhead,
  getSafeFollowingDistance,
} from "../js/trafficSafety.js";

import {
  createPassengerSystem,
} from "../js/passengerSystem.js";

import {
  createCheckpointSystem,
} from "../js/kekeCheckpointSystem.js";

test("vehicle accelerates forward", () => {
  const vehicle = createVehiclePhysics();

  updateVehiclePhysics(
    vehicle,
    { accelerate: true },
    0.05
  );

  assert.ok(vehicle.speed > 0);
});

test("vehicle can reverse", () => {
  const vehicle = createVehiclePhysics();

  updateVehiclePhysics(
    vehicle,
    { brake: true },
    0.05
  );

  assert.ok(vehicle.speed < 0);
});

test("vehicle speed stays within configured limits", () => {
  const vehicle = createVehiclePhysics();

  for (let i = 0; i < 1000; i += 1) {
    updateVehiclePhysics(
      vehicle,
      { accelerate: true },
      0.05
    );
  }

  assert.ok(vehicle.speed <= 18);
});

test("vehicle displacement updates world position", () => {
  const vehicle = {
    position: { x: 0, z: 0 },
    speed: 5,
    heading: 0,
  };

  moveVehicle(vehicle, 0.05);

  assert.ok(vehicle.position.z > 0);
});

test("potholes remain registered after collision", () => {
  const potholes = createPotholeSystem();

  potholes.add({
    id: "test-pothole",
    x: 0,
    z: 0,
  });

  const player = {
    position: { x: 0, z: 0 },
    speed: 5,
  };

  potholes.update(player, 2000);

  assert.equal(potholes.getAll().length, 1);
});

test("pothole collision emits a damage event", () => {
  const potholes = createPotholeSystem();

  potholes.add({
    id: "test-pothole",
    x: 0,
    z: 0,
  });

  const events = potholes.update(
    {
      position: { x: 0, z: 0 },
      speed: 5,
    },
    2000
  );

  assert.equal(events.length, 1);
  assert.ok(events[0].damage > 0);
});

test("traffic system detects a vehicle ahead", () => {
  const player = {
    position: { x: 0, z: 0 },
    heading: 0,
    speed: 5,
  };

  const vehicleAhead = {
    position: { x: 0, z: 5 },
    heading: 0,
    speed: 3,
  };

  assert.equal(
    isVehicleAhead(player, vehicleAhead),
    true
  );
});

test("safe following distance increases with speed", () => {
  assert.ok(
    getSafeFollowingDistance(15) >
      getSafeFollowingDistance(5)
  );
});

test("passenger pickup requires the keke to stop", () => {
  const passengers = createPassengerSystem();

  passengers.addWaitingPassenger({
    id: "test-passenger",
    x: 0,
    z: 0,
    destinationX: 0,
    destinationZ: 50,
    fare: 300,
  });

  const result = passengers.pickup(
    {
      position: { x: 0, z: 0 },
      speed: 5,
    },
    "test-passenger"
  );

  assert.equal(result.success, false);
});

test("passenger pickup succeeds when stopped and nearby", () => {
  const passengers = createPassengerSystem();

  passengers.addWaitingPassenger({
    id: "test-passenger",
    x: 0,
    z: 0,
    destinationX: 0,
    destinationZ: 50,
    fare: 300,
  });

  const result = passengers.pickup(
    {
      position: { x: 0, z: 0 },
      speed: 0,
    },
    "test-passenger"
  );

  assert.equal(result.success, true);
});

test("checkpoint interaction requires the keke to stop", () => {
  const checkpoints = createCheckpointSystem();

  checkpoints.addCheckpoint({
    id: "test-checkpoint",
    x: 0,
    z: 0,
    type: "general",
  });

  const result = checkpoints.interact(
    {
      position: { x: 0, z: 0 },
      speed: 5,
      passengersOnboard: 2,
    },
    "test-checkpoint"
  );

  assert.equal(result.success, false);
});