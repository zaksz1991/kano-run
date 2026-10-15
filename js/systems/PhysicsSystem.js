import * as CANNON from "cannon-es";

/**
 * Phase 7 — cannon-es player chassis physics.
 * Optimized for mobile: lightweight box chassis with custom force application.
 * Feels light, tippy in corners, and grip dynamically changes with weather.
 */
export default class PhysicsSystem {
  constructor({ eventBus = null, config = {} } = {}) {
    this.eventBus = eventBus;
    this.config = {
      mass: 280, // light tricycle
      width: 1.15,
      height: 1.5,
      length: 2.3,
      maxSteer: 0.65, // Radians
      engineForce: 1100,
      brakeForce: 1400,
      // Grip tuning
      baseLateralFriction: 4.5, // Higher = less sliding on dry roads
      baseRollingFriction: 0.015,
      ...config,
    };
    
    this.world = null;
    this.chassis = null;
    this.enabled = false;
    this.gripMult = 1.0;
    this.held = false;
    
    this.input = { steer: 0, throttle: 0, brake: 0 };
    this.speed = 0; // m/s
    this.roll = 0;
    this.pitch = 0;
    this.yaw = 0;
    
    this._disposers = [];
    this.fixedTime = 1 / 60;
    this.accumulator = 0;

    this._bindEvents();
  }

  _bindEvents() {
    this._subscribe("vehicle:hold", (p) => {
      this.held = Boolean(p?.hold);
      if (this.held && this.chassis) {
        this.chassis.velocity.set(0, this.chassis.velocity.y, 0);
        this.chassis.angularVelocity.set(0, 0, 0);
      }
    });
    
    // Listen to both weather and driving grip events
    this._subscribe("weather:changed", (p) => {
      const g = Number(p?.gripMultiplier ?? p?.grip);
      if (Number.isFinite(g) && g > 0) this.gripMult = g;
    });
    this._subscribe("driving:grip", (p) => {
      const g = Number(p?.multiplier);
      if (Number.isFinite(g) && g > 0) this.gripMult = g;
    });
    
    this._subscribe("physics:input", (p) => this.setInput(p));
    
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
      friction: 0.6,
      restitution: 0.02,
      contactEquationStiffness: 1e7,
      contactEquationRelaxation: 3,
    });
    this.world.addContactMaterial(contact);

    this._createChassis();
    return this;
  }

  _createChassis() {
    if (this.chassis) this.world.removeBody(this.chassis);
    
    const { mass, width, height, length } = this.config;
    const shape = new CANNON.Box(new CANNON.Vec3(width / 2, height / 2, length / 2));
    
    this.chassis = new CANNON.Body({
      mass,
      shape,
      material: this.chassisMat,
      linearDamping: 0.2, // Air resistance
      angularDamping: 0.5, // Prevent endless spinning
      allowSleep: false,
    });
    
    // High COM for that authentic tippy Keke feel
    this.chassis.position.set(0, height / 2 + 0.2, 0);
    this.world.addBody(this.chassis);
  }

  reset(x = 0, z = 0) {
    if (!this.chassis) return;
    this.chassis.position.set(x, this.config.height / 2 + 0.2, z);
    this.chassis.velocity.set(0, 0, 0);
    this.chassis.angularVelocity.set(0, 0, 0);
    this.chassis.quaternion.set(0, 0, 0, 1);
    this.speed = 0;
    this.roll = 0;
    this.yaw = 0;
    this.accumulator = 0;
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
    
    // Fixed time step for stable physics (max 4 substeps to prevent spiral of death on lag)
    const steps = Math.min(4, Math.floor(this.accumulator / this.fixedTime));
    for (let i = 0; i < steps; i++) {
      this._step(this.fixedTime);
      this.accumulator -= this.fixedTime;
    }

    // Extract state for visual sync
    const vx = this.chassis.velocity.x;
    const vz = this.chassis.velocity.z;
    this.speed = Math.sqrt(vx * vx + vz * vz);

    // Calculate roll based on lateral velocity and steering (visual feel)
    const lateralVelocity = vx * Math.cos(this.yaw) - vz * Math.sin(this.yaw); // Approximate local X velocity
    this.roll = Math.max(-0.45, Math.min(0.45, -lateralVelocity * 0.05 - this.input.steer * this.speed * 0.015));

    this.eventBus?.emit?.("physics:state", {
      x: this.chassis.position.x,
      z: this.chassis.position.z,
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

    const grip = Math.max(0.3, Math.min(1.2, this.gripMult));
    const steer = this.input.steer * this.config.maxSteer;

    // 1. Engine Force (Local Forward)
    // Transform local forward (0,0,1) to world space based on current yaw
    const forwardX = Math.sin(this.yaw);
    const forwardZ = Math.cos(this.yaw);
    const force = this.input.throttle * this.config.engineForce * grip;
    
    this.chassis.applyForce(
      new CANNON.Vec3(forwardX * force, 0, forwardZ * force),
      this.chassis.position
    );

    // 2. Braking & Rolling Resistance
    const brake = this.input.brake * this.config.brakeForce;
    const totalDrag = brake + (this.config.baseRollingFriction * this.chassis.mass * 9.82);
    
    if (totalDrag > 0 || this.input.throttle < 0.05) {
      const dragFactor = Math.max(0, 1 - (totalDrag * 0.002 * dt * 4));
      this.chassis.velocity.x *= dragFactor;
      this.chassis.velocity.z *= dragFactor;
    }

    // 3. Lateral Grip (Sideways Friction)
    // This is what prevents the Keke from sliding like it's on ice
    const latFriction = this.config.baseLateralFriction * grip;
    // Dampen lateral velocity (simplified world-space approximation)
    this.chassis.velocity.x *= Math.max(0.1, 1 - latFriction * dt);

    // 4. Steering (Yaw Torque)
    // ONLY steer if moving, prevents spinning in place
    const speedFactor = Math.min(this.speed / 5, 1.0); 
    this.chassis.angularVelocity.y = steer * (1.5 + this.speed * 0.1) * speedFactor;
    this.yaw += this.chassis.angularVelocity.y * dt;

    // 5. "Suspension-ish" Height Correction & Tippy Feel
    const targetY = this.config.height / 2 + 0.15;
    const yErr = targetY - this.chassis.position.y;
    // Soft spring to keep it on the ground, but allow bouncing
    this.chassis.velocity.y += yErr * 15 * dt - this.chassis.velocity.y * 5 * dt;

    // 6. Roll Stabilization (Prevent flipping, but allow leaning)
    // Weak damping on Z and X allows it to lean in turns, but brings it back
    this.chassis.angularVelocity.z *= 0.90; 
    this.chassis.angularVelocity.x *= 0.90;
    
    // Apply a soft restoring torque to keep it upright
    this.chassis.angularVelocity.z -= this.chassis.quaternion.z * 2.0 * dt;
    this.chassis.angularVelocity.x -= this.chassis.quaternion.x * 2.0 * dt;

    this.world.step(dt);
  }

  getSnapshot() {
    return {
      x: this.chassis?.position.x || 0,
      z: this.chassis?.position.z || 0,
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
      try { u(); } catch {}
    }
    this._disposers = [];
  }
}