import * as THREE from 'three';

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const damp = (current, target, lambda, dt) =>
  THREE.MathUtils.lerp(current, target, 1 - Math.exp(-lambda * dt));

const WHEEL_NAME = /(wheel|tire|tyre)/i;
const WHEEL_EXCLUDE = /(wheel.?arch|wheel.?well|wheel.?house|wheel.?cover|spare|fender|mudguard|axle|hubcap|suspension)/i;
const FRONT_NAME = /(front|steer|fork|_fl\b|_fr\b|\bfl\b|\bfr\b|wheel.?f\b)/i;
const WHEEL_AXES = new Set(['x', 'y', 'z']);

/**
 * KekeDynamics
 *
 * Visual-only, frame-rate-independent body and wheel kinematics for the
 * existing Renderer3D player. It intentionally does not alter game speed,
 * lane positions, traffic, road objects, collisions, or fare rules.
 *
 * The module follows renderer.player each frame, so it also rebinds after
 * Renderer3D.applyModel() replaces the procedural fallback with a GLB clone.
 * GLB wheel animation is automatic when wheel nodes have names containing
 * "wheel", "tire", or "tyre". A node can override its roll axis with
 * node.userData.kanoSpinAxis = 'x' | 'y' | 'z' and its radius with
 * node.userData.kanoWheelRadius = number.
 */
export class KekeDynamics {
  constructor({
    renderer,
    mobile = false,
    wheelRadius = mobile ? 0.235 : 0.26,
    wheelbase = 1.55,
    maxSteerAngle = 0.38,
    maxRoll = mobile ? 0.105 : 0.13,
    rollGain = 0.42,
    enableWheelSteering = true,
    enableWheelSpin = true,
    enableSuspension = true,
  } = {}) {
    if (!renderer) {
      throw new TypeError('KekeDynamics requires the active Renderer3D instance.');
    }

    this.renderer = renderer;
    this.mobile = Boolean(mobile);
    this.defaultWheelRadius = Math.max(0.05, wheelRadius);
    this.wheelbase = Math.max(0.5, wheelbase);
    this.maxSteerAngle = clamp(maxSteerAngle, 0.05, 0.8);
    this.maxRoll = clamp(maxRoll, 0.02, 0.3);
    this.rollGain = clamp(rollGain, 0.05, 1.0);
    this.enableWheelSteering = Boolean(enableWheelSteering);
    this.enableWheelSpin = Boolean(enableWheelSpin);
    this.enableSuspension = Boolean(enableSuspension);

    this.player = null;
    this.visualPivot = null;
    this.wheelStates = [];
    this.frontWheelState = null;
    this.rendererManagedFallbackWheels = false;
    this.rigReport = null;
    this.warnedMissingWheels = false;
    this.disposed = false;

    this.elapsed = 0;
    this.roll = 0;
    this.rollVelocity = 0;
    this.pitch = 0;
    this.pitchVelocity = 0;
    this.suspensionY = 0;
    this.suspensionVelocity = 0;
    this.steeringAngle = 0;
    this.previousPotholeHits = null;
    this.previousCollisions = null;

    this._worldPosition = new THREE.Vector3();
    this._localPosition = new THREE.Vector3();

    this.bindPlayer(this.renderer.player || null);
  }

  // ----------------------------------------------------------
  // PLAYER / GLB REBINDING
  // ----------------------------------------------------------

  update(dt, state = {}) {
    if (this.disposed) return;

    const delta = clamp(Number(dt) || 0, 0, 0.05);
    if (delta <= 0) return;

    const currentPlayer = this.renderer?.player || null;
    if (currentPlayer !== this.player) {
      this.bindPlayer(currentPlayer);
    }
    if (!this.player || !this.visualPivot) return;

    this.elapsed += delta;

    const signedSpeed = Number.isFinite(state.signedSpeed)
      ? state.signedSpeed
      : state.reverse
        ? -Math.abs(Number(state.speed) || 0)
        : Math.abs(Number(state.speed) || 0);

    const speedKmh = Number.isFinite(signedSpeed) ? signedSpeed : 0;
    const speedMps = Math.abs(speedKmh) / 3.6;
    const speedRatio = clamp(Math.abs(speedKmh) / 65, 0, 1);
    const steering = clamp(Number(state.steer) || 0, -1, 1);
    const throttle = Boolean(state.gas);
    const brake = Boolean(state.brake) && !state.reverse;
    const reverse = Boolean(state.reverse) || speedKmh < -0.05;
    const drift = Boolean(state.drift);

    this.detectImpact(state);
    this.updateChassis(delta, {
      speedMps,
      speedRatio,
      steering,
      throttle,
      brake,
      drift,
      reverse,
      environment: state.environment,
    });
    this.updateWheels(delta, speedKmh, steering);
  }

  bindPlayer(player) {
    if (player === this.player && this.visualPivot) return;
    this.unbindPlayer();

    if (!player?.isObject3D) {
      this.player = null;
      return;
    }

    this.player = player;
    this.player.updateMatrixWorld(true);

    const driverParts = player.userData?.driverAnimationParts || null;
    const namedWheelNodes = this.discoverNamedWheels(player);
    const proceduralWheelNodes = Array.isArray(driverParts?.wheels)
      ? driverParts.wheels.filter((node) => node?.isObject3D)
      : [];

    // The existing Renderer3D already spins its own procedural fallback wheels.
    // Reuse the front-wheel reference for steering, but never spin them twice.
    const isProceduralFallback = Boolean(
      player.userData?.fallback && proceduralWheelNodes.length,
    );

    let candidates = namedWheelNodes;
    if (!candidates.length && proceduralWheelNodes.length) {
      candidates = proceduralWheelNodes;
    }

    const front = this.chooseFrontWheel(candidates, player);
    this.frontWheelState = front
      ? this.makeWheelState(front, player, true)
      : null;

    this.rendererManagedFallbackWheels = isProceduralFallback;

    const spinNodes = this.enableWheelSpin && !isProceduralFallback
      ? candidates.filter((node) => node !== front)
      : [];

    // A front named wheel may also be a valid rolling wheel. Keep it in the
    // spin list, but the visual pose will additionally steer around local Y.
    if (this.enableWheelSpin && !isProceduralFallback && front && candidates.includes(front)) {
      spinNodes.unshift(front);
    }

    const seen = new Set();
    this.wheelStates = spinNodes
      .filter((node) => {
        if (!node || seen.has(node)) return false;
        seen.add(node);
        return true;
      })
      .map((node) => this.makeWheelState(node, player, node === front));

    this.frontWheelState = this.wheelStates.find((entry) => entry.node === front)
      || this.frontWheelState;

    // Add an identity child pivot and move existing children beneath it. Since
    // the pivot begins at identity, the GLB's placement is preserved exactly;
    // only the child group is animated, leaving Renderer3D free to own the
    // player's world position, facing, and lane placement.
    const visualPivot = new THREE.Group();
    visualPivot.name = 'KANO_KEKE_DYNAMICS_VISUAL_PIVOT';
    visualPivot.userData.kanoDynamicsPivot = true;

    const originalChildren = [...player.children];
    player.add(visualPivot);
    for (const child of originalChildren) {
      visualPivot.add(child);
    }

    this.visualPivot = visualPivot;
    this.visualPivot.position.set(0, 0, 0);
    this.visualPivot.rotation.set(0, 0, 0);
    this.visualPivot.scale.set(1, 1, 1);

    this.roll = 0;
    this.rollVelocity = 0;
    this.pitch = 0;
    this.pitchVelocity = 0;
    this.suspensionY = 0;
    this.suspensionVelocity = 0;
    this.steeringAngle = 0;

    this.previousPotholeHits = null;
    this.previousCollisions = null;

    this.rigReport = {
      modelPath: player.userData?.modelPath || 'procedural fallback / unnamed model',
      modelKey: player.userData?.modelKey || player.userData?.vehicleType || 'keke',
      fallback: Boolean(player.userData?.fallback),
      wheelNodes: candidates.map((node) => node.name || '(unnamed wheel node)'),
      frontWheel: front?.name || (front ? '(unnamed front wheel)' : null),
      spinningWheels: this.wheelStates.map((entry) => entry.node.name || '(unnamed wheel node)'),
      rendererManagesFallbackWheelSpin: this.rendererManagedFallbackWheels,
      visualPivot: visualPivot.name,
    };

    if (!front && !this.warnedMissingWheels) {
      this.warnedMissingWheels = true;
      console.info(
        '[Kano Life] Keke dynamics active; no named wheel nodes found. Chassis lean and suspension remain enabled. Name imported wheel pivots with Wheel/FrontWheel/RearWheel for automatic wheel animation.',
      );
    } else {
      console.info('[Kano Life] Keke visual dynamics rig bound', this.rigReport);
    }
  }

  discoverNamedWheels(root) {
    const candidates = [];

    root.traverse((node) => {
      if (node === root || !(node.isMesh || node.isGroup || node.isBone)) return;
      const name = String(node.name || '').trim();
      if (!name || !WHEEL_NAME.test(name) || WHEEL_EXCLUDE.test(name)) return;
      if (/^wheels?$/i.test(name)) return; // avoid a container named simply "Wheels"

      // Prefer a node that can act as a wheel transform. When a pivot and its
      // child mesh are both named like wheels, retain only the outer transform.
      let ancestor = node.parent;
      let nestedUnderWheel = false;
      while (ancestor && ancestor !== root) {
        const ancestorName = String(ancestor.name || '').trim();
        if (
          ancestorName &&
          WHEEL_NAME.test(ancestorName) &&
          !WHEEL_EXCLUDE.test(ancestorName) &&
          !/^wheels?$/i.test(ancestorName)
        ) {
          nestedUnderWheel = true;
          break;
        }
        ancestor = ancestor.parent;
      }
      if (!nestedUnderWheel) candidates.push(node);
    });

    return candidates;
  }

  chooseFrontWheel(candidates, root) {
    if (!candidates.length) return null;

    const explicitlyFront = candidates.filter((node) => FRONT_NAME.test(node.name || ''));
    const pool = explicitlyFront.length ? explicitlyFront : candidates;

    let selected = null;
    let selectedScore = Infinity;

    for (const node of pool) {
      const position = this.getRootLocalPosition(node, root);
      // This renderer's road convention places the front of a Keke at -Z.
      // Prefer explicit front/steer names; otherwise choose the smallest local Z.
      const score = explicitlyFront.length
        ? Math.abs(position.x) + Math.abs(position.z) * 0.001
        : position.z;

      if (score < selectedScore) {
        selectedScore = score;
        selected = node;
      }
    }

    return selected;
  }

  getRootLocalPosition(node, root) {
    node.getWorldPosition(this._worldPosition);
    this._localPosition.copy(this._worldPosition);
    root.worldToLocal(this._localPosition);
    return this._localPosition.clone();
  }

  makeWheelState(node, root, isFront = false) {
    const localPosition = this.getRootLocalPosition(node, root);
    const axis = WHEEL_AXES.has(node.userData?.kanoSpinAxis)
      ? node.userData.kanoSpinAxis
      : 'x';
    const explicitRadius = Number(node.userData?.kanoWheelRadius);

    return {
      node,
      isFront,
      baseX: node.rotation.x,
      baseY: node.rotation.y,
      baseZ: node.rotation.z,
      spinAxis: axis,
      radius: Number.isFinite(explicitRadius) && explicitRadius > 0.05
        ? explicitRadius
        : this.defaultWheelRadius,
      spinAngle: 0,
      angularVelocity: 0,
      localPosition,
      steerBaseY: node.rotation.y,
      steerSign: Number.isFinite(node.userData?.kanoSteerSign)
        ? node.userData.kanoSteerSign
        : 1,
      spinSign: Number.isFinite(node.userData?.kanoSpinSign)
        ? node.userData.kanoSpinSign
        : 1,
    };
  }

  // ----------------------------------------------------------
  // SPRUNG CHASSIS AND CENTRIFUGAL LEAN
  // ----------------------------------------------------------

  updateChassis(dt, input) {
    const {
      speedMps,
      speedRatio,
      steering,
      throttle,
      brake,
      drift,
      environment,
    } = input;

    const steeringAngle = steering * this.maxSteerAngle;
    const lateralAcceleration = (
      speedMps * speedMps / this.wheelbase
    ) * Math.tan(steeringAngle);

    const driftMultiplier = drift ? 1.18 : 1;
    const targetRoll = clamp(
      Math.atan(lateralAcceleration / 9.81) * this.rollGain * driftMultiplier,
      -this.maxRoll,
      this.maxRoll,
    );

    // A damped second-order spring gives the body inertia without allocating
    // a physics object or a Vector3 each frame.
    const rollAcceleration = (targetRoll - this.roll) * 33 - this.rollVelocity * 9.2;
    this.rollVelocity += rollAcceleration * dt;
    this.roll += this.rollVelocity * dt;

    const targetPitch = throttle
      ? -0.032 * speedRatio
      : brake
        ? 0.048 * speedRatio
        : 0;

    const pitchAcceleration = (targetPitch - this.pitch) * 27 - this.pitchVelocity * 8.2;
    this.pitchVelocity += pitchAcceleration * dt;
    this.pitch += this.pitchVelocity * dt;

    const roughRoad = environment === 'badRoad' || environment === 'rainPuddles';
    const vibrationAmplitude = speedRatio * (roughRoad ? 0.010 : 0.0032);
    const vibration = Math.sin(this.elapsed * (8 + speedRatio * 13)) * vibrationAmplitude;
    const suspensionTarget = vibration;
    const suspensionAcceleration = (suspensionTarget - this.suspensionY) * 58 - this.suspensionVelocity * 12.5;

    this.suspensionVelocity += suspensionAcceleration * dt;
    this.suspensionY += this.suspensionVelocity * dt;
    this.suspensionY = clamp(this.suspensionY, -0.055, 0.055);

    this.visualPivot.rotation.z = this.roll;
    this.visualPivot.rotation.x = this.pitch;
    this.visualPivot.position.y = this.suspensionY;
  }

  detectImpact(state) {
    const potholeHits = Number(state.potholeHits) || 0;
    const collisions = Number(state.collisions) || 0;

    if (this.previousPotholeHits === null) {
      this.previousPotholeHits = potholeHits;
    } else if (potholeHits > this.previousPotholeHits) {
      this.triggerImpact(0.8);
      this.previousPotholeHits = potholeHits;
    } else if (potholeHits < this.previousPotholeHits) {
      this.previousPotholeHits = potholeHits;
    }

    if (this.previousCollisions === null) {
      this.previousCollisions = collisions;
    } else if (collisions > this.previousCollisions) {
      this.triggerImpact(0.45);
      this.previousCollisions = collisions;
    } else if (collisions < this.previousCollisions) {
      this.previousCollisions = collisions;
    }
  }

  triggerImpact(intensity = 0.5) {
    if (!this.visualPivot) return;
    const strength = clamp(Number(intensity) || 0.5, 0, 1);
    this.suspensionVelocity -= 0.45 * strength;
    this.rollVelocity += (Math.random() - 0.5) * 0.08 * strength;
    this.pitchVelocity += 0.08 * strength;
  }

  // ----------------------------------------------------------
  // WHEEL STEERING AND SPIN
  // ----------------------------------------------------------

  updateWheels(dt, signedSpeedKmh, steering) {
    // Renderer3D's player faces toward local -Z. A negative Y-wheel angle
    // steers that forward vector toward +X, matching a positive lane input.
    const targetSteer = this.enableWheelSteering
      ? -clamp(steering, -1, 1) * this.maxSteerAngle
      : 0;

    this.steeringAngle = damp(
      this.steeringAngle,
      targetSteer,
      11.5,
      dt,
    );

    if (this.frontWheelState?.node) {
      const wheel = this.frontWheelState;
      wheel.node.rotation.y = wheel.steerBaseY + this.steeringAngle * wheel.steerSign;
    }

    if (!this.enableWheelSpin || this.rendererManagedFallbackWheels) return;

    for (const wheel of this.wheelStates) {
      if (!wheel.node) continue;

      const targetAngularVelocity = (
        (signedSpeedKmh / 3.6) / wheel.radius
      ) * wheel.spinSign;

      // Wheel inertia lags slightly behind drivetrain speed changes.
      wheel.angularVelocity = damp(
        wheel.angularVelocity,
        targetAngularVelocity,
        16,
        dt,
      );

      wheel.spinAngle += wheel.angularVelocity * dt;

      const axis = wheel.spinAxis;
      wheel.node.rotation[axis] = wheel[`base${axis.toUpperCase()}`] + wheel.spinAngle;
    }
  }

  // ----------------------------------------------------------
  // DIAGNOSTICS AND CLEANUP
  // ----------------------------------------------------------

  getReport() {
    return this.rigReport ? { ...this.rigReport } : null;
  }

  unbindPlayer() {
    if (!this.player || !this.visualPivot) {
      this.player = null;
      this.visualPivot = null;
      this.wheelStates = [];
      this.frontWheelState = null;
      this.rendererManagedFallbackWheels = false;
      return;
    }

    const root = this.player;
    const pivot = this.visualPivot;

    // If the player is still attached to a scene, restore the original child
    // hierarchy before renderer disposal. If applyModel already removed and
    // disposed this fallback, do not resurrect that old hierarchy.
    if (root.parent && pivot.parent === root) {
      for (const child of [...pivot.children]) {
        root.add(child);
      }
      root.remove(pivot);
    }

    this.player = null;
    this.visualPivot = null;
    this.wheelStates = [];
    this.frontWheelState = null;
    this.rendererManagedFallbackWheels = false;
    this.rigReport = null;
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.unbindPlayer();
  }
}
