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
 * Visual-only body/wheel kinematics plus state-driven rear brake and reverse
 * lamps. It does not alter velocity, steering, collisions, traffic, fares,
 * road objects, or any game rules.
 *
 * Supports both the procedural fallback keke and an imported GLB. The visual
 * rig rebinds after Renderer3D.applyModel() replaces the player vehicle.
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
    enableRearLights = true,
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
    this.enableRearLights = Boolean(enableRearLights);

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
    this.rearLightRig = null;

    this._worldPosition = new THREE.Vector3();
    this._localPosition = new THREE.Vector3();

    this.bindPlayer(this.renderer.player || null);
  }

  // ----------------------------------------------------------
  // FRAME UPDATE
  // ----------------------------------------------------------

  update(dt, state = {}) {
    if (this.disposed) return;

    const delta = clamp(Number(dt) || 0, 0, 0.05);
    const currentPlayer = this.renderer?.player || null;

    if (currentPlayer !== this.player) {
      this.bindPlayer(currentPlayer);
    }

    if (!this.player || !this.visualPivot) return;

    this.updateRearLights(state);
    if (delta <= 0) return;

    this.elapsed += delta;

    const signedSpeed = Number.isFinite(state.signedSpeed)
      ? state.signedSpeed
      : state.reverse
        ? -Math.abs(Number(state.speed) || 0)
        : Math.abs(Number(state.speed) || 0);
    const speedMps = Math.abs(signedSpeed) / 3.6;
    const speedRatio = clamp(Math.abs(signedSpeed) / 65, 0, 1);
    const steering = clamp(Number(state.steer) || 0, -1, 1);
    const throttle = Boolean(state.gas);
    // In this game, holding BRAKE while reverse is engaged accelerates the
    // keke backwards. It must not also illuminate the red brake lamps.
    const braking = Boolean(state.brake) && !state.reverse;
    const reversing = Boolean(state.reverse) || signedSpeed < -0.05;
    const drift = Boolean(state.drift);

    this.detectImpact(state);
    this.updateChassis(delta, {
      speedMps,
      speedRatio,
      steering,
      throttle,
      brake: braking,
      drift,
      reverse: reversing,
      environment: state.environment,
    });
    this.updateWheels(delta, signedSpeed, steering);
  }

  // ----------------------------------------------------------
  // REAR BRAKE / REVERSE LIGHTS
  // ----------------------------------------------------------

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

    // The existing Renderer3D spins procedural fallback wheels. Reuse its
    // front-wheel reference for steering, but never spin them twice.
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

    if (
      this.enableWheelSpin &&
      !isProceduralFallback &&
      front &&
      candidates.includes(front)
    ) {
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

    // Put all original vehicle parts under an identity child pivot. The keke's
    // original pose remains unchanged; chassis motion is applied to this pivot.
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

    if (this.enableRearLights) {
      this.createRearLights(player, visualPivot);
    }

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
      rearLights: Boolean(this.rearLightRig),
    };

    if (!front && !this.warnedMissingWheels) {
      this.warnedMissingWheels = true;
      console.info(
        '[Kano Life] Keke dynamics active; no named wheel nodes found. Chassis lean, suspension, and rear lights remain enabled. Name imported wheel pivots with Wheel/FrontWheel/RearWheel for automatic wheel animation.',
      );
    } else {
      console.info('[Kano Life] Keke visual dynamics rig bound', this.rigReport);
    }
  }

  createRearLights(player, visualPivot) {
    // Find model bounds in player-local coordinates. This lets the lamp rig
    // follow either the procedural fallback or imported GLB dimensions.
    player.updateMatrixWorld(true);
    const inverseRoot = new THREE.Matrix4().copy(player.matrixWorld).invert();
    const localBounds = new THREE.Box3();
    const corner = new THREE.Vector3();
    const localMatrix = new THREE.Matrix4();

    player.traverse((node) => {
      if (!node.isMesh || !node.geometry) return;
      const geometry = node.geometry;
      if (!geometry.boundingBox) geometry.computeBoundingBox();
      const bounds = geometry.boundingBox;
      if (!bounds || bounds.isEmpty()) return;

      localMatrix.copy(inverseRoot).multiply(node.matrixWorld);
      for (let mask = 0; mask < 8; mask += 1) {
        corner.set(
          mask & 1 ? bounds.max.x : bounds.min.x,
          mask & 2 ? bounds.max.y : bounds.min.y,
          mask & 4 ? bounds.max.z : bounds.min.z,
        ).applyMatrix4(localMatrix);
        localBounds.expandByPoint(corner);
      }
    });

    if (localBounds.isEmpty()) {
      localBounds.min.set(-0.72, 0, -1.0);
      localBounds.max.set(0.72, 1.8, 0.86);
    }

    const size = localBounds.getSize(new THREE.Vector3());
    const width = clamp(size.x || 1.4, 0.8, 4.0);
    const height = clamp(size.y || 1.4, 0.8, 4.0);
    const length = clamp(size.z || 1.7, 1.0, 5.0);

    // Kano Life's vehicle coordinate convention: the front is local -Z,
    // so the rear panel is toward local +Z.
    const rearZ = localBounds.max.z + clamp(length * 0.018, 0.018, 0.07);
    const lampY = localBounds.min.y + height * 0.43;
    const lampWidth = clamp(width * 0.085, 0.065, 0.19);
    const lampHeight = clamp(height * 0.055, 0.045, 0.11);
    const lampDepth = clamp(length * 0.025, 0.025, 0.07);
    const sideX = width * 0.31;
    const reverseY = lampY - lampHeight * 1.35;

    const group = new THREE.Group();
    group.name = 'KANO_KEKE_REAR_LIGHT_RIG';
    group.userData.kanoRearLightRig = true;
    visualPivot.add(group);

    const makeLens = (name, x, y, color, emissive) => {
      const material = new THREE.MeshStandardMaterial({
        color,
        emissive: 0x000000,
        emissiveIntensity: 0,
        roughness: 0.28,
        metalness: 0.05,
      });
      const mesh = new THREE.Mesh(
        new THREE.BoxGeometry(lampWidth, lampHeight, lampDepth),
        material,
      );
      mesh.name = name;
      mesh.position.set(x, y, rearZ);
      mesh.userData.kanoLampColor = emissive;
      group.add(mesh);
      return mesh;
    };

    const brakeLenses = [
      makeLens('KANO_REAR_BRAKE_LEFT', -sideX, lampY, 0x5c1010, 0xff1808),
      makeLens('KANO_REAR_BRAKE_RIGHT', sideX, lampY, 0x5c1010, 0xff1808),
    ];

    const reverseLenses = [
      makeLens('KANO_REAR_REVERSE_LEFT', -sideX, reverseY, 0x747b7d, 0xf6fffF),
      makeLens('KANO_REAR_REVERSE_RIGHT', sideX, reverseY, 0x747b7d, 0xf6fffF),
    ];

    const brakeGlow = new THREE.PointLight(0xff160a, 0, 2.8, 2);
    brakeGlow.name = 'KANO_REAR_BRAKE_GLOW';
    brakeGlow.position.set(0, lampY, rearZ + lampDepth * 0.55);
    group.add(brakeGlow);

    const reverseGlow = new THREE.PointLight(0xf5ffff, 0, 2.2, 2);
    reverseGlow.name = 'KANO_REAR_REVERSE_GLOW';
    reverseGlow.position.set(0, reverseY, rearZ + lampDepth * 0.55);
    group.add(reverseGlow);

    this.rearLightRig = {
      group,
      brakeLenses,
      reverseLenses,
      brakeGlow,
      reverseGlow,
    };

    this.updateRearLights({});
  }

  updateRearLights(state = {}) {
    const rig = this.rearLightRig;
    if (!rig) return;

    const signedSpeed = Number.isFinite(state.signedSpeed)
      ? state.signedSpeed
      : state.reverse
        ? -Math.abs(Number(state.speed) || 0)
        : Math.abs(Number(state.speed) || 0);

    // Brake input is the reverse accelerator while reverse gear is selected.
    const braking = Boolean(state.brake) && !Boolean(state.reverse);
    const reversing = Boolean(state.reverse) || signedSpeed < -0.05;
    const brakeIntensity = state.night ? 2.8 : 2.15;
    const reverseIntensity = state.night ? 2.0 : 1.55;

    for (const lens of rig.brakeLenses) {
      lens.material.emissive.setHex(braking ? lens.userData.kanoLampColor : 0x000000);
      lens.material.emissiveIntensity = braking ? brakeIntensity : 0;
      lens.material.color.setHex(braking ? 0xff4539 : 0x5c1010);
    }

    for (const lens of rig.reverseLenses) {
      lens.material.emissive.setHex(reversing ? lens.userData.kanoLampColor : 0x000000);
      lens.material.emissiveIntensity = reversing ? reverseIntensity : 0;
      lens.material.color.setHex(reversing ? 0xffffff : 0x747b7d);
    }

    rig.brakeGlow.visible = braking;
    rig.brakeGlow.intensity = braking ? 0.85 : 0;
    rig.reverseGlow.visible = reversing;
    rig.reverseGlow.intensity = reversing ? 0.55 : 0;
  }

  // ----------------------------------------------------------
  // WHEEL RIG HELPERS
  // ----------------------------------------------------------

  discoverNamedWheels(root) {
    const candidates = [];
    root.traverse((node) => {
      if (node === root || !(node.isMesh || node.isGroup || node.isBone)) return;
      const name = String(node.name || '').trim();
      if (!name || !WHEEL_NAME.test(name) || WHEEL_EXCLUDE.test(name)) return;
      if (/^wheels?$/i.test(name)) return;
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
      // The front of the keke is local -Z.
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

    if (this.visualPivot && this.enableSuspension) {
      this.visualPivot.rotation.z = this.roll;
      this.visualPivot.rotation.x = this.pitch;
      this.visualPivot.position.y = this.suspensionY;
    } else if (this.visualPivot) {
      this.visualPivot.rotation.z = 0;
      this.visualPivot.rotation.x = 0;
      this.visualPivot.position.y = 0;
    }
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
      this.rearLightRig = null;
      return;
    }

    const root = this.player;
    const pivot = this.visualPivot;
    const rearGroup = this.rearLightRig?.group || null;

    // Do not reattach synthetic rear-light meshes to the imported/fallback
    // vehicle when restoring its original child hierarchy.
    if (root.parent && pivot.parent === root) {
      for (const child of [...pivot.children]) {
        if (child === rearGroup) {
          pivot.remove(child);
          this.disposeRearLightGroup(child);
          continue;
        }
        root.add(child);
      }
      root.remove(pivot);
    } else if (rearGroup) {
      rearGroup.parent?.remove(rearGroup);
      this.disposeRearLightGroup(rearGroup);
    }

    this.player = null;
    this.visualPivot = null;
    this.wheelStates = [];
    this.frontWheelState = null;
    this.rendererManagedFallbackWheels = false;
    this.rearLightRig = null;
    this.rigReport = null;
  }

  disposeRearLightGroup(group) {
    if (!group) return;
    const geometries = new Set();
    const materials = new Set();
    group.traverse((node) => {
      if (node.geometry && !geometries.has(node.geometry)) {
        geometries.add(node.geometry);
        node.geometry.dispose();
      }
      const list = Array.isArray(node.material)
        ? node.material
        : node.material
          ? [node.material]
          : [];
      for (const material of list) {
        if (materials.has(material)) continue;
        materials.add(material);
        material.dispose();
      }
    });
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.unbindPlayer();
  }
}
