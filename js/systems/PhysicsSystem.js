import * as CANNON from "cannon-es";

/**
 * Phase 7 — cannon-es player chassis physics.
 * Traffic remains kinematic (VehicleSystem) for mobile FPS.
 * Keke feels light, tippy, grip changes with weather.
 */
export default class PhysicsSystem {
  constructor({ eventBus = null, config = {} } = {}) {
    this.eventBus = eventBus;
    this.config = {
      mass: 280, // light tricycle
      width: 1.15,
      height: 1.5,
      length: 2.3,
      maxSteer: 0.55,
      engineForce: 920,
      brakeForce: 1100,
      // grip
      baseLateralFriction: 3.2,
      baseRollingFriction: 0.012,
      ...config,
    };
    this.world = null;
    this.chassis = null;
    this.enabled = false;
    this.gripMult = 1;
    this.held = false;
    this.input = { steer: 0, throttle: 0, brake: 0 };
    this.roll = 0;
    this.pitch = 0;
    this.speed = 0; // m/s along Z
    this.x = 0;
    this.z = 0;
    this.yaw = 0;
    this._disposers = [];
    this.fixedTime = 1 / 60;
    this.accumulator = 0;

    this._subscribe("vehicle:hold", (p) => {
      this.held = Boolean(p?.hold);
      if (this.held && this.chassis) {
        this.chassis.velocity.set(0, this.chassis.velocity.y, 0);
        this.chassis.angularVelocity.set(0, 0, 0);
      }
    });
    this._subscribe("weather:changed", (p) => {
      const g = Number(p?.gripMultiplier ?? p?.grip);
      if (Number.isFinite(g) && g > 0) this.gripMult = g;
    });
    this._subscribe("driving:grip", (p) => {
      const g = Number(p?.multiplier);
      if (Number.isFinite(g) && g > 0) this.gripMult = g;
    });
    this._subscribe("game:started", () => {
      this.enabled = true;
      this.reset(0, 0);
    });
    this._subscribe("game:stopped", () => {
      this.enabled = false;
    });
  }

  async initialize() {
    this.world = new CANNON.World({
      gravity: new CANNON.Vec3(0, -9.82, 0),
    });
    this.world.broadphase = new CANNON.SAPBroadphase(this.world);
    this.world.allowSleep = true;
    this.world.defaultContactMaterial.friction = 0.4;
    this.world.defaultContactMaterial.restitution = 0.05;

    // Ground plane
    const groundMat = new CANNON.Material("ground");
    const ground = new CANNON.Body({
      mass: 0,
      shape: new CANNON.Plane(),
      material: groundMat,
    });
    ground.quaternion.setFromEuler(-Math.PI / 2, 0, 0);
    this.world.addBody(ground);

    // Chassis material
    this.chassisMat = new CANNON.Material("keke");
    const contact = new CANNON.ContactMaterial(groundMat, this.chassisMat, {
      friction: 0.55,
      restitution: 0.02,
      contactEquationStiffness: 1e7,
      contactEquationRelaxation: 3,
    });
    this.world.addContactMaterial(contact);

    this._createChassis();
    return this;
  }

  _createChassis() {
    if (this.chassis) {
      this.world.removeBody(this.chassis);
    }
    const { mass, width, height, length } = this.config;
    const shape = new CANNON.Box(
      new CANNON.Vec3(width / 2, height / 2, length / 2),
    );
    this.chassis = new CANNON.Body({
      mass,
      shape,
      material: this.chassisMat,
      linearDamping: 0.15,
      angularDamping: 0.4,
      allowSleep: false,
    });
    // High COM relative feel — slightly elevated for tippiness
    this.chassis.position.set(0, height / 2 + 0.15, 0);
    this.chassis.angularFactor.set(1, 1, 1);
    this.world.addBody(this.chassis);
  }

  reset(x = 0, z = 0) {
    if (!this.chassis) return;
    this.chassis.position.set(x, this.config.height / 2 + 0.15, z);
    this.chassis.velocity.set(0, 0, 0);
    this.chassis.angularVelocity.set(0, 0, 0);
    this.chassis.quaternion.set(0, 0, 0, 1);
    this.x = x;
    this.z = z;
    this.speed = 0;
    this.roll = 0;
    this.yaw = 0;
  }

  setInput({ steer = 0, throttle = 0, brake = 0 } = {}) {
    this.input.steer = Math.max(-1, Math.min(1, steer));
    this.input.throttle = Math.max(0, Math.min(1, throttle));
    this.input.brake = Math.max(0, Math.min(1, brake));
  }

  update(dt = 0) {
    if (!this.enabled || !this.world || !this.chassis) return;

    const maxDt = Math.min(dt, 0.05);
    this.accumulator += maxDt;
    const steps = Math.min(4, Math.floor(this.accumulator / this.fixedTime));
    for (let i = 0; i < steps; i++) {
      this._step(this.fixedTime);
      this.accumulator -= this.fixedTime;
    }

    this.x = this.chassis.position.x;
    this.z = this.chassis.position.z;
    const vx = this.chassis.velocity.x;
    const vz = this.chassis.velocity.z;
    this.speed = Math.sqrt(vx * vx + vz * vz);

    // Roll from lateral acceleration (visual + slight physics)
    const lateral = vx; // simplified in road space
    this.roll = Math.max(-0.35, Math.min(0.35, -lateral * 0.04 - this.input.steer * this.speed * 0.012));

    this.eventBus?.emit?.("physics:state", {
      x: this.x,
      z: this.z,
      y: this.chassis.position.y,
      speed: this.speed,
      speedKmh: this.speed * 3.6,
      roll: this.roll,
      yaw: this.yaw,
      quaternion: this.chassis.quaternion,
    });
  }

  _step(dt) {
    if (this.held) {
      this.chassis.velocity.x *= 0.5;
      this.chassis.velocity.z *= 0.5;
      this.world.step(dt);
      return;
    }

    const grip = Math.max(0.35, Math.min(1.2, this.gripMult || 1));
    const steer = this.input.steer * this.config.maxSteer;

    // Engine along local forward (+Z)
    const force = this.input.throttle * this.config.engineForce * grip;
    const brake = this.input.brake * this.config.brakeForce;

    // Forward force
    this.chassis.applyForce(new CANNON.Vec3(0, 0, force), this.chassis.position);

    // Braking — opposing velocity
    if (brake > 0 || this.input.throttle < 0.05) {
      const damp = brake > 0 ? brake * 0.002 : 0.4;
      this.chassis.velocity.x *= Math.max(0, 1 - damp * dt * 4);
      this.chassis.velocity.z *= Math.max(0, 1 - damp * dt * 4);
    }

    // Lateral grip (sideways friction) — low mass + rain = slide
    const latFriction = this.config.baseLateralFriction * grip;
    this.chassis.velocity.x *= Math.max(0.2, 1 - latFriction * dt);

    // Steering as lateral acceleration toward lane (player still uses lane system)
    // Apply yaw torque for feel
    this.chassis.angularVelocity.y = steer * (0.8 + this.speed * 0.05);
    this.yaw += this.chassis.angularVelocity.y * dt;

    // Suspension-ish: keep height soft
    const targetY = this.config.height / 2 + 0.12;
    const yErr = targetY - this.chassis.position.y;
    this.chassis.velocity.y += yErr * 12 * dt - this.chassis.velocity.y * 4 * dt;

    // Tip limit — soft clamp roll via angular damping on Z
    this.chassis.angularVelocity.z *= 0.85;
    this.chassis.angularVelocity.x *= 0.85;

    this.world.step(dt);
  }

  getSnapshot() {
    return {
      x: this.x,
      z: this.z,
      speed: this.speed,
      speedKmh: this.speed * 3.6,
      roll: this.roll,
      gripMult: this.gripMult,
    };
  }

  _subscribe(name, h) {
    if (!this.eventBus?.on) return;
    const u = this.eventBus.on(name, h);
    if (typeof u === "function") this._disposers.push(u);
  }

  dispose() {
    this.enabled = false;
    if (this.chassis && this.world) this.world.removeBody(this.chassis);
    this.chassis = null;
    this.world = null;
    for (const u of this._disposers) {
      try {
        u();
      } catch {}
    }
  }
}
