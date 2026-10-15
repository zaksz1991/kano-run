import GAME_CONFIG from "../core/config.js";

const clamp = (value, min, max) =>
  Math.min(max, Math.max(min, value));

const lerp = (start, end, amount) =>
  start + (end - start) * amount;

const DEFAULTS = {
  acceleration: 12,
  braking: 24,
  naturalDeceleration: 3.5,
  steeringSpeed: 10,
  laneChangeSpeed: 8,
  lateralGrip: 12,
  handbrakeGrip: 3,
  fuelConsumption: 0.0004,
  offRoadDrag: 0.55,
  offRoadDamage: 2,
  maximumSteeringAngle: 0.35,
};

export class DrivingSystem {
  constructor(options = {}) {
    this.config = options.config ?? GAME_CONFIG;
    this.eventBus = options.eventBus ?? null;
    this.gameState = options.gameState ?? null;

    this.settings = {
      ...DEFAULTS,
      ...(options.settings ?? {}),
    };

    this.lanes = options.lanes ?? [-3.2, 0, 3.2];

    this.input = {
      accelerate: false,
      brake: false,
      left: false,
      right: false,
      handbrake: false,
    };

    this.vehicle = null;
    this.reset();
  }

  reset(vehicle = {}) {
    this.vehicle = {
      x: 0,
      z: 0,
      speed: 0,
      heading: 0,
      steering: 0,
      lane: 1,
      fuel: this.config.driving?.startingFuel ?? 100,
      condition: this.config.driving?.startingCondition ?? 100,
      maxSpeed: this.config.driving?.maxSpeed ?? 34,
      acceleration: this.settings.acceleration,
      braking: this.settings.braking,
      offRoad: false,
      ...vehicle,
    };

    this.input = {
      accelerate: false,
      brake: false,
      left: false,
      right: false,
      handbrake: false,
    };

    this.emit("driving:reset", this.getSnapshot());

    return this.vehicle;
  }

  setInput(action, pressed) {
    if (!(action in this.input)) return false;

    this.input[action] = Boolean(pressed);
    return true;
  }

  setInputs(inputs = {}) {
    for (const [action, pressed] of Object.entries(inputs)) {
      this.setInput(action, pressed);
    }
  }

  update(deltaSeconds, options = {}) {
    if (!this.vehicle) return null;

    const dt = clamp(Number(deltaSeconds) || 0, 0, 0.05);

    if (dt === 0) return this.vehicle;

    const previousSpeed = this.vehicle.speed;
    const previousX = this.vehicle.x;

    this.updateSpeed(dt);
    this.updateSteering(dt);
    this.updatePosition(dt, options);
    this.updateFuel(dt);
    this.updateCondition(dt);

    this.vehicle.speed = clamp(
      this.vehicle.speed,
      0,
      this.vehicle.maxSpeed,
    );

    this.vehicle.heading = clamp(
      this.vehicle.heading,
      -this.settings.maximumSteeringAngle,
      this.settings.maximumSteeringAngle,
    );

    this.emit("driving:updated", {
      vehicle: this.getSnapshot(),
      deltaSeconds: dt,
      acceleration:
        (this.vehicle.speed - previousSpeed) / dt,
      lateralVelocity:
        (this.vehicle.x - previousX) / dt,
    });

    if (previousSpeed !== this.vehicle.speed) {
      this.emit("driving:speed-changed", {
        previous: previousSpeed,
        current: this.vehicle.speed,
      });
    }

    return this.vehicle;
  }

  updateSpeed(dt) {
    const vehicle = this.vehicle;

    if (this.input.accelerate && vehicle.fuel > 0) {
      vehicle.speed += vehicle.acceleration * dt;
    } else if (this.input.brake) {
      vehicle.speed -= this.settings.braking * dt;
    } else {
      vehicle.speed -= this.settings.naturalDeceleration * dt;
    }

    if (this.input.handbrake) {
      vehicle.speed -= this.settings.braking * 0.7 * dt;
    }

    vehicle.speed = clamp(vehicle.speed, 0, vehicle.maxSpeed);
  }

  updateSteering(dt) {
    const vehicle = this.vehicle;

    let steeringInput = 0;

    if (this.input.left) steeringInput -= 1;
    if (this.input.right) steeringInput += 1;

    const steeringTarget = steeringInput;

    vehicle.steering = lerp(
      vehicle.steering,
      steeringTarget,
      clamp(this.settings.steeringSpeed * dt, 0, 1),
    );

    const grip = this.input.handbrake
      ? this.settings.handbrakeGrip
      : this.settings.lateralGrip;

    const speedFactor = clamp(vehicle.speed / 18, 0.15, 1.3);

    vehicle.heading = lerp(
      vehicle.heading,
      vehicle.steering *
        this.settings.maximumSteeringAngle *
        speedFactor,
      clamp(grip * dt, 0, 1),
    );
  }

  updatePosition(dt, options) {
    const vehicle = this.vehicle;

    const roadHalfWidth = Number(
      options.roadHalfWidth ?? 5.2,
    );

    const lateralSpeed =
      vehicle.steering *
      this.settings.laneChangeSpeed *
      clamp(vehicle.speed / 10, 0.2, 1.2);

    vehicle.x += lateralSpeed * dt;

    vehicle.z += vehicle.speed * dt;

    const offRoad = Math.abs(vehicle.x) > roadHalfWidth;

    if (offRoad) {
      vehicle.speed *= Math.max(
        0,
        1 - this.settings.offRoadDrag * dt,
      );

      vehicle.condition = clamp(
        vehicle.condition -
          this.settings.offRoadDamage * dt,
        0,
        100,
      );
    }

    if (offRoad !== vehicle.offRoad) {
      vehicle.offRoad = offRoad;

      this.emit(
        offRoad ? "driving:off-road" : "driving:on-road",
        {
          x: vehicle.x,
          speed: vehicle.speed,
        },
      );
    }

    vehicle.lane = this.findNearestLane(vehicle.x);
  }

  updateFuel(dt) {
    const vehicle = this.vehicle;

    if (vehicle.speed <= 0) return;

    const consumption =
      this.settings.fuelConsumption *
      (1 + vehicle.speed / 30) *
      dt;

    vehicle.fuel = clamp(
      vehicle.fuel - consumption,
      0,
      100,
    );

    if (vehicle.fuel === 0) {
      vehicle.speed = Math.max(
        0,
        vehicle.speed - this.settings.braking * dt,
      );

      this.emit("driving:fuel-empty", {
        fuel: vehicle.fuel,
      });
    }
  }

  updateCondition(dt) {
    const vehicle = this.vehicle;

    vehicle.condition = clamp(
      vehicle.condition,
      0,
      100,
    );

    if (vehicle.condition <= 0) {
      this.emit("driving:vehicle-disabled", {
        condition: vehicle.condition,
      });
    }
  }

  findNearestLane(x) {
    let nearestLane = 0;
    let nearestDistance = Infinity;

    for (let index = 0; index < this.lanes.length; index += 1) {
      const distance = Math.abs(x - this.lanes[index]);

      if (distance < nearestDistance) {
        nearestDistance = distance;
        nearestLane = index;
      }
    }

    return nearestLane;
  }

  steerToLane(laneIndex) {
    const lane = clamp(
      Math.round(laneIndex),
      0,
      this.lanes.length - 1,
    );

    const targetX = this.lanes[lane];
    const difference = targetX - this.vehicle.x;

    if (Math.abs(difference) < 0.1) {
      this.vehicle.x = targetX;
      this.vehicle.lane = lane;
      this.input.left = false;
      this.input.right = false;

      return true;
    }

    this.input.left = difference < 0;
    this.input.right = difference > 0;

    this.emit("driving:lane-target", {
      lane,
      targetX,
    });

    return false;
  }

  setVehicleProperties(properties = {}) {
    if (!this.vehicle) return;

    if (Number.isFinite(properties.maxSpeed)) {
      this.vehicle.maxSpeed = Math.max(
        1,
        properties.maxSpeed,
      );
    }

    if (Number.isFinite(properties.acceleration)) {
      this.vehicle.acceleration = Math.max(
        0,
        properties.acceleration,
      );
    }

    this.emit("driving:vehicle-configured", this.getSnapshot());
  }

  applyCollision(damage = 15, speedMultiplier = 0.5) {
    if (!this.vehicle) return;

    this.vehicle.condition = clamp(
      this.vehicle.condition - Math.max(0, damage),
      0,
      100,
    );

    this.vehicle.speed *= clamp(speedMultiplier, 0, 1);

    this.emit("driving:collision-impact", {
      damage,
      speed: this.vehicle.speed,
      condition: this.vehicle.condition,
    });
  }

  refuel(amount) {
    if (!this.vehicle || !Number.isFinite(amount) || amount <= 0) {
      return 0;
    }

    const previousFuel = this.vehicle.fuel;

    this.vehicle.fuel = clamp(
      previousFuel + amount,
      0,
      100,
    );

    const added = this.vehicle.fuel - previousFuel;

    this.emit("driving:refueled", {
      added,
      fuel: this.vehicle.fuel,
    });

    return added;
  }

  repair(amount = 100) {
    if (!this.vehicle) return 0;

    const previousCondition = this.vehicle.condition;

    this.vehicle.condition = clamp(
      previousCondition + Math.max(0, amount),
      0,
      100,
    );

    const repaired =
      this.vehicle.condition - previousCondition;

    this.emit("driving:repaired", {
      repaired,
      condition: this.vehicle.condition,
    });

    return repaired;
  }

  getSnapshot() {
    return this.vehicle ? { ...this.vehicle } : null;
  }

  emit(eventName, payload) {
    this.eventBus?.emit(eventName, payload);
    this.gameState?.emit(eventName, payload);
  }

  destroy() {
    this.input = {
      accelerate: false,
      brake: false,
      left: false,
      right: false,
      handbrake: false,
    };

    this.vehicle = null;
    this.eventBus = null;
    this.gameState = null;
  }
}

export default DrivingSystem;