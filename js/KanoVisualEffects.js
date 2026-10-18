import * as THREE from 'three';

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const randomBetween = (min, max) => min + Math.random() * (max - min);
const ROAD_DEPTH_SCALE = 316.8;
const COIN_IMPACT_MAX = 0.012;
const COIN_IMPACT_MIN = -0.025;
const COIN_REWARD = 50;

/**
 * KanoVisualEffects
 *
 * Adds exhaust smoke and collectible Naira coins without replacing the
 * existing Game, renderer, collision engine, or AudioManager.
 *
 * 3D mode:
 *   - One shader-driven THREE.Points object for smoke.
 *   - One THREE.InstancedMesh for all coins.
 *
 * Canvas 2D mode:
 *   - Transparent overlay canvas for coins and smoke.
 *
 * Coin positions are stored as game-style road depth values so they persist
 * across renderer switches. Coin rewards are added to the current run score;
 * the existing bankRun() function remains responsible for banking earnings.
 */
export class KanoVisualEffects {
  constructor({ renderer, game, container, mobile = false } = {}) {
    if (!renderer) throw new TypeError('KanoVisualEffects requires a renderer.');
    if (!game?.s) throw new TypeError('KanoVisualEffects requires an initialized game.');

    this.renderer = renderer;
    this.game = game;
    this.container = container || document.getElementById('game-container') || document.body;
    this.mobile = Boolean(mobile);
    this.disposed = false;
    this.elapsed = 0;
    this.smokeAccumulator = 0;
    this.smokeCursor = 0;
    this.coinDummy = new THREE.Object3D();
    this.worldPosition = new THREE.Vector3();
    this.exhaustLocal = new THREE.Vector3(0, 0.42, 0.92);
    this.is3D = Boolean(renderer.scene?.isScene && renderer.world?.isObject3D && renderer.player?.isObject3D);
    this.maxSmoke = this.mobile ? 42 : 84;
    this.smokeParticles = Array.from({ length: this.maxSmoke }, () => ({
      age: 1,
      life: 1,
      vx: 0,
      vy: 0,
      vz: 0,
      size: 0.2,
      color: [0.55, 0.56, 0.56],
    }));
    this.lastToastAt = -10;

    this.ensureCoinState();
    this.createCoinCounter();

    if (this.is3D) {
      this.create3DSmoke();
      this.create3DCoins();
    } else {
      this.createOverlayCanvas();
    }

    this.onResize = () => this.resizeOverlay();
    window.addEventListener('resize', this.onResize, { passive: true });
    window.addEventListener('orientationchange', this.onResize, { passive: true });
    this.resizeOverlay();
    this.updateCoinCounter(this.game.s);
  }

  // ----------------------------------------------------------
  // COIN STATE — SURVIVES A 2D/3D RENDERER SWITCH
  // ----------------------------------------------------------

  ensureCoinState() {
    if (!this.game.__kanoCoinState || this.game.__kanoCoinState.runState !== this.game.s) {
      const coins = [];
      for (let index = 0; index < 12; index += 1) {
        coins.push({
          id: `kano-coin-${index}`,
          lane: index % 3,
          xOffset: randomBetween(-0.22, 0.22),
          depth: 0.18 + index * 0.078 + randomBetween(-0.008, 0.008),
          phase: randomBetween(0, Math.PI * 2),
          collected: false,
        });
      }

      this.game.s.coinsCollected = 0;
      this.game.__kanoCoinState = {
        runState: this.game.s,
        coins,
      };
    }

    this.coinState = this.game.__kanoCoinState;
  }

  // ----------------------------------------------------------
  // COUNTER UI
  // ----------------------------------------------------------

  createCoinCounter() {
    let counter = this.container.querySelector('#kano-coin-counter');
    if (!counter) {
      counter = document.createElement('div');
      counter.id = 'kano-coin-counter';
      counter.setAttribute('role', 'status');
      counter.setAttribute('aria-live', 'polite');
      counter.setAttribute('aria-label', 'Coins collected this run');
      this.container.appendChild(counter);
    }

    counter.style.cssText = [
      'position:absolute',
      'right:10px',
      'bottom:max(64px,calc(env(safe-area-inset-bottom) + 60px))',
      'z-index:11',
      'pointer-events:none',
      'padding:7px 10px',
      'border:1px solid #f5c54288',
      'border-radius:999px',
      'background:rgba(12,26,43,.92)',
      'color:#ffe28a',
      'font:900 10px/1.2 system-ui,sans-serif',
      'letter-spacing:.03em',
      'box-shadow:0 4px 14px #0004',
      'white-space:nowrap',
    ].join(';');

    this.coinCounter = counter;
  }

  updateCoinCounter(state) {
    if (!this.coinCounter || !state) return;
    this.coinCounter.textContent = `🪙 COINS ${Math.max(0, Math.floor(state.coinsCollected || 0))}`;
  }

  // ----------------------------------------------------------
  // 3D SMOKE — ONE POINTS DRAW CALL
  // ----------------------------------------------------------

  create3DSmoke() {
    const geometry = new THREE.BufferGeometry();
    const positions = new Float32Array(this.maxSmoke * 3);
    const alphas = new Float32Array(this.maxSmoke);
    const sizes = new Float32Array(this.maxSmoke);
    const colors = new Float32Array(this.maxSmoke * 3);

    for (let index = 0; index < this.maxSmoke; index += 1) {
      alphas[index] = 0;
      sizes[index] = 0.15;
      const offset = index * 3;
      positions[offset] = 0;
      positions[offset + 1] = -1000;
      positions[offset + 2] = 0;
      colors[offset] = 0.55;
      colors[offset + 1] = 0.56;
      colors[offset + 2] = 0.57;
    }

    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('aAlpha', new THREE.BufferAttribute(alphas, 1));
    geometry.setAttribute('aSize', new THREE.BufferAttribute(sizes, 1));
    geometry.setAttribute('aColor', new THREE.BufferAttribute(colors, 3));

    const material = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      depthTest: true,
      uniforms: {},
      vertexShader: `
        attribute float aAlpha;
        attribute float aSize;
        attribute vec3 aColor;
        varying float vAlpha;
        varying vec3 vColor;
        void main() {
          vAlpha = aAlpha;
          vColor = aColor;
          vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
          gl_PointSize = clamp(aSize * (145.0 / max(1.0, -mvPosition.z)), 1.5, 28.0);
          gl_Position = projectionMatrix * mvPosition;
        }
      `,
      fragmentShader: `
        precision mediump float;
        varying float vAlpha;
        varying vec3 vColor;
        void main() {
          float radial = length(gl_PointCoord - vec2(0.5)) * 2.0;
          float edge = 1.0 - smoothstep(0.35, 1.0, radial);
          float alpha = edge * vAlpha * 0.5;
          if (alpha < 0.012) discard;
          gl_FragColor = vec4(vColor, alpha);
        }
      `,
    });

    this.smokeGeometry = geometry;
    this.smokeMaterial = material;
    this.smokePoints = new THREE.Points(geometry, material);
    this.smokePoints.name = 'KANO_KEKE_EXHAUST_SMOKE';
    this.smokePoints.frustumCulled = false;
    this.renderer.scene.add(this.smokePoints);
  }

  spawn3DSmoke(state) {
    const player = this.renderer.player;
    if (!player?.isObject3D || !this.smokeGeometry) return;

    player.updateMatrixWorld(true);
    this.worldPosition.copy(this.exhaustLocal);
    player.localToWorld(this.worldPosition);

    const index = this.smokeCursor;
    this.smokeCursor = (this.smokeCursor + 1) % this.maxSmoke;
    const particle = this.smokeParticles[index];
    particle.age = 0;
    particle.life = randomBetween(0.55, 1.15);
    particle.vx = randomBetween(-0.22, 0.22);
    particle.vy = randomBetween(0.3, 0.8);
    particle.vz = state.reverse ? randomBetween(-0.35, -0.05) : randomBetween(0.1, 0.48);
    particle.size = randomBetween(0.16, 0.29);
    particle.x = this.worldPosition.x + randomBetween(-0.05, 0.05);
    particle.y = this.worldPosition.y;
    particle.z = this.worldPosition.z;
    particle.color = (state.engine ?? 100) < 45
      ? [0.25, 0.24, 0.22]
      : (state.condition ?? 100) < 60
        ? [0.43, 0.42, 0.39]
        : [0.64, 0.66, 0.66];

    const position = this.smokeGeometry.attributes.position.array;
    const alpha = this.smokeGeometry.attributes.aAlpha.array;
    const size = this.smokeGeometry.attributes.aSize.array;
    const color = this.smokeGeometry.attributes.aColor.array;
    const offset = index * 3;

    position[offset] = particle.x;
    position[offset + 1] = particle.y;
    position[offset + 2] = particle.z;
    alpha[index] = 1;
    size[index] = particle.size;
    color[offset] = particle.color[0];
    color[offset + 1] = particle.color[1];
    color[offset + 2] = particle.color[2];
  }

  update3DSmoke(dt, state, activePlay) {
    if (!this.smokeGeometry) return;

    const speed = Math.abs(Number(state.signedSpeed) || 0);
    const shouldEmit = activePlay && (
      (state.gas && state.fuel > 0 && speed > 2) ||
      ((state.engine ?? 100) < 55 && speed > 1.5)
    );

    if (shouldEmit) {
      this.smokeAccumulator += dt;
      const interval = this.mobile ? 0.075 : 0.048;
      let count = 0;
      while (this.smokeAccumulator >= interval && count < 3) {
        this.spawn3DSmoke(state);
        this.smokeAccumulator -= interval;
        count += 1;
      }
    } else {
      this.smokeAccumulator = Math.min(this.smokeAccumulator, 0.08);
    }

    const positions = this.smokeGeometry.attributes.position.array;
    const alphas = this.smokeGeometry.attributes.aAlpha.array;
    const sizes = this.smokeGeometry.attributes.aSize.array;

    for (let index = 0; index < this.maxSmoke; index += 1) {
      const particle = this.smokeParticles[index];
      if (particle.age >= particle.life) {
        alphas[index] = 0;
        continue;
      }

      particle.age += dt;
      if (particle.age >= particle.life) {
        alphas[index] = 0;
        continue;
      }

      const offset = index * 3;
      particle.x += particle.vx * dt;
      particle.y += particle.vy * dt;
      particle.z += particle.vz * dt;
      particle.vy *= 0.995;

      positions[offset] = particle.x;
      positions[offset + 1] = particle.y;
      positions[offset + 2] = particle.z;
      const remaining = clamp(1 - particle.age / particle.life, 0, 1);
      alphas[index] = remaining * remaining;
      sizes[index] = particle.size + particle.age * 0.42;
    }

    this.smokeGeometry.attributes.position.needsUpdate = true;
    this.smokeGeometry.attributes.aAlpha.needsUpdate = true;
    this.smokeGeometry.attributes.aSize.needsUpdate = true;
    this.smokeGeometry.attributes.aColor.needsUpdate = true;
  }

  // ----------------------------------------------------------
  // 2D SMOKE OVERLAY
  // ----------------------------------------------------------

  createOverlayCanvas() {
    this.overlayCanvas = document.createElement('canvas');
    this.overlayCanvas.id = 'kano-effects-overlay';
    this.overlayCanvas.setAttribute('aria-hidden', 'true');
    this.overlayCanvas.style.cssText =
      'position:absolute;inset:0;width:100%;height:100%;z-index:3;pointer-events:none;display:block';
    this.container.appendChild(this.overlayCanvas);
    this.overlayCtx = this.overlayCanvas.getContext('2d', { alpha: true });
    this.overlaySmoke = Array.from({ length: this.maxSmoke }, () => ({
      active: false, age: 0, life: 1, x: 0, y: 0, vx: 0, vy: 0, size: 2, alpha: 0, color: '#92918b',
    }));
    this.overlaySmokeCursor = 0;
    this.overlaySmokeAccumulator = 0;
  }

  resizeOverlay() {
    if (!this.overlayCanvas || !this.overlayCtx) return;

    const rect = this.container.getBoundingClientRect();
    this.overlayWidth = Math.max(1, rect.width || window.innerWidth);
    this.overlayHeight = Math.max(1, rect.height || window.innerHeight);
    this.overlayDpr = Math.min(window.devicePixelRatio || 1, this.mobile ? 1.25 : 1.5);
    const width = Math.floor(this.overlayWidth * this.overlayDpr);
    const height = Math.floor(this.overlayHeight * this.overlayDpr);

    if (this.overlayCanvas.width !== width || this.overlayCanvas.height !== height) {
      this.overlayCanvas.width = width;
      this.overlayCanvas.height = height;
    }

    this.overlayCtx.setTransform(this.overlayDpr, 0, 0, this.overlayDpr, 0, 0);
  }

  spawn2DSmoke(state) {
    const width = this.overlayWidth || this.container.clientWidth || window.innerWidth;
    const height = this.overlayHeight || this.container.clientHeight || window.innerHeight;
    const playerX = width * 0.5 + (Number(state.steer) || 0) * width * 0.30;
    const playerY = Math.min(height * 0.585, height - 178);
    const particle = this.overlaySmoke[this.overlaySmokeCursor];
    this.overlaySmokeCursor = (this.overlaySmokeCursor + 1) % this.overlaySmoke.length;

    particle.active = true;
    particle.age = 0;
    particle.life = randomBetween(0.55, 1.05);
    particle.x = playerX + 14 + randomBetween(-4, 4);
    particle.y = playerY + 8;
    particle.vx = randomBetween(-10, 12) + (state.reverse ? -6 : 0);
    particle.vy = randomBetween(-22, -11);
    particle.size = randomBetween(3, 5);
    particle.alpha = 0.45;
    particle.color = (state.engine ?? 100) < 45 ? '#514d47' : '#c9c8c1';
  }

  update2DSmoke(dt, state, activePlay) {
    if (!this.overlaySmoke) return;

    const speed = Math.abs(Number(state.signedSpeed) || 0);
    const shouldEmit = activePlay && (
      (state.gas && state.fuel > 0 && speed > 2) ||
      ((state.engine ?? 100) < 55 && speed > 1.5)
    );

    if (shouldEmit) {
      this.overlaySmokeAccumulator += dt;
      const interval = this.mobile ? 0.075 : 0.05;
      let emitted = 0;
      while (this.overlaySmokeAccumulator >= interval && emitted < 3) {
        this.spawn2DSmoke(state);
        this.overlaySmokeAccumulator -= interval;
        emitted += 1;
      }
    }

    for (const particle of this.overlaySmoke) {
      if (!particle.active) continue;
      particle.age += dt;
      if (particle.age >= particle.life) {
        particle.active = false;
        continue;
      }
      particle.x += particle.vx * dt;
      particle.y += particle.vy * dt;
      particle.size += 6.5 * dt;
      particle.alpha = 0.42 * (1 - particle.age / particle.life);
    }
  }

  // ----------------------------------------------------------
  // 3D COIN INSTANCING
  // ----------------------------------------------------------

  create3DCoins() {
    this.coinGeometry = new THREE.CylinderGeometry(0.29, 0.29, 0.085, 20, 1, false);
    this.coinMaterial = new THREE.MeshStandardMaterial({
      color: 0xf5c542,
      metalness: 0.82,
      roughness: 0.25,
      emissive: 0x5c3e00,
      emissiveIntensity: 0.12,
    });
    this.coinMesh = new THREE.InstancedMesh(
      this.coinGeometry,
      this.coinMaterial,
      this.coinState.coins.length,
    );
    this.coinMesh.name = 'KANO_NAIRA_COLLECTIBLE_COINS';
    this.coinMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.coinMesh.frustumCulled = false;
    this.coinMesh.castShadow = false;
    this.coinMesh.receiveShadow = false;
    this.renderer.world.add(this.coinMesh);
    this.update3DCoinMatrices();
  }

  update3DCoinMatrices() {
    if (!this.coinMesh) return;

    for (let index = 0; index < this.coinState.coins.length; index += 1) {
      const coin = this.coinState.coins[index];
      this.coinDummy.visible = true;
      this.coinDummy.position.set(
        (coin.lane - 1) * 3 + coin.xOffset,
        0.78 + Math.sin(this.elapsed * 2.6 + coin.phase) * 0.075,
        -coin.depth * 88,
      );
      this.coinDummy.rotation.set(Math.PI / 2, 0, coin.phase + this.elapsed * 2.7);
      this.coinDummy.scale.setScalar(coin.collected ? 0.001 : 1);
      this.coinDummy.updateMatrix();
      this.coinMesh.setMatrixAt(index, this.coinDummy.matrix);
    }

    this.coinMesh.instanceMatrix.needsUpdate = true;
  }

  // ----------------------------------------------------------
  // COIN REWARD AND RECYCLE
  // ----------------------------------------------------------

  respawnCoin(coin) {
    coin.depth = randomBetween(1.00, 1.15);
    coin.lane = Math.floor(Math.random() * 3);
    coin.xOffset = randomBetween(-0.22, 0.22);
    coin.phase = randomBetween(0, Math.PI * 2);
    coin.collected = false;
  }

  collectCoin(coin, state) {
    coin.collected = true;
    state.score = Math.max(0, Number(state.score) || 0) + COIN_REWARD;
    state.coinsCollected = Math.max(0, Number(state.coinsCollected) || 0) + 1;

    this.game.audio?.pickup?.();

    const now = Number(state.elapsed) || this.elapsed;
    if (now - this.lastToastAt >= 0.75) {
      this.game.ui?.toast?.(`NAIRA COIN · +₦${COIN_REWARD} run earnings`);
      this.lastToastAt = now;
    }

    this.respawnCoin(coin);
    this.updateCoinCounter(state);
  }

  updateCoins(dt, state, activePlay) {
    const speed = Number.isFinite(state.signedSpeed)
      ? state.signedSpeed
      : state.reverse
        ? -Math.abs(Number(state.speed) || 0)
        : Math.abs(Number(state.speed) || 0);

    if (activePlay) {
      for (const coin of this.coinState.coins) {
        const previousDepth = coin.depth;
        coin.depth -= (speed / ROAD_DEPTH_SCALE) * dt;

        const playerX = clamp(
          (Number(state.steer) || 0) * 3 + (Number(state.pullOverSide) || 0) * 2.35,
          -5.8,
          5.8,
        );
        const coinX = (coin.lane - 1) * 3 + coin.xOffset;
        const aligned = Math.abs(coinX - playerX) <= 1.15;

        const crossedContactPlane =
          previousDepth > COIN_IMPACT_MAX &&
          coin.depth <= COIN_IMPACT_MAX &&
          coin.depth >= COIN_IMPACT_MIN;
        const insideContactBand =
          coin.depth <= COIN_IMPACT_MAX &&
          coin.depth >= COIN_IMPACT_MIN;

        if (
          !state.reverse && speed > 0.5 && aligned &&
          (crossedContactPlane || insideContactBand)
        ) {
          this.collectCoin(coin, state);
          continue;
        }

        // Missed coins and coins leaving the forward field are recycled.
        // Reverse movement never awards coins.
        if (coin.depth < -0.08 || coin.depth > 1.22) {
          this.respawnCoin(coin);
        }
      }
    }

    this.updateCoinCounter(state);
    if (this.is3D) this.update3DCoinMatrices();
  }

  // ----------------------------------------------------------
  // CANVAS 2D COIN DRAWING
  // ----------------------------------------------------------

  draw2DCoin(ctx, x, y, radius, phase) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(Math.sin(phase + this.elapsed * 2.7) * 0.16);
    ctx.fillStyle = '#7d4d08';
    ctx.beginPath();
    ctx.ellipse(1, 2, radius * 0.9, radius, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#f5c542';
    ctx.beginPath();
    ctx.ellipse(0, 0, Math.max(2, radius * (0.27 + Math.abs(Math.cos(phase + this.elapsed * 2.7)) * 0.73)), radius, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#fff0a4';
    ctx.lineWidth = Math.max(1, radius * 0.12);
    ctx.stroke();
    if (radius >= 8) {
      ctx.fillStyle = '#67420a';
      ctx.font = `900 ${Math.max(7, radius * 0.8)}px system-ui,sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('₦', 0, 0.5);
    }
    ctx.restore();
  }

  render2DOverlay(state) {
    if (this.is3D || !this.overlayCtx || this.disposed) return;

    const ctx = this.overlayCtx;
    const width = this.overlayWidth || window.innerWidth;
    const height = this.overlayHeight || window.innerHeight;
    ctx.clearRect(0, 0, width, height);

    if (this.renderer.lifeScene && this.renderer.lifeScene !== 'road') return;

    const horizon = height * 0.35;
    const roadTop = horizon + 10;
    const roadBottom = height * 1.02;
    const topHalf = width * 0.12;
    const bottomHalf = width * 0.49;
    const center = width * 0.5;

    for (const coin of this.coinState.coins) {
      if (coin.depth < -0.04 || coin.depth > 1.2 || coin.collected) continue;
      const t = clamp(0.59 - (coin.depth - 0.045) * 0.45, 0.02, 0.59);
      const halfAt = topHalf + (bottomHalf - topHalf) * t * t;
      const y = roadTop + (roadBottom - roadTop) * t * t;
      const x = center + (coin.lane - 1) * (2 / 3) * halfAt + coin.xOffset * (0.4 + t);
      const radius = 3.5 + t * 12;
      this.draw2DCoin(ctx, x, y, radius, coin.phase);
    }

    for (const particle of this.overlaySmoke || []) {
      if (!particle.active || particle.alpha <= 0.01) continue;
      ctx.globalAlpha = particle.alpha;
      ctx.fillStyle = particle.color;
      ctx.beginPath();
      ctx.arc(particle.x, particle.y, particle.size, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.globalAlpha = 1;
  }

  // ----------------------------------------------------------
  // FRAME UPDATE
  // ----------------------------------------------------------

  update(dt, state = this.game?.s || {}) {
    if (this.disposed || !state) return;

    this.elapsed += clamp(Number(dt) || 0, 0, 0.05);

    // The Game instance replaces `s` on a new run. Rebind the coin pool then.
    this.ensureCoinState();

    const activePlay =
      this.game.state === 'PLAY' &&
      !state.event &&
      (!this.renderer.lifeScene || this.renderer.lifeScene === 'road');

    this.updateCoins(dt, state, activePlay);

    if (this.is3D) {
      this.update3DSmoke(dt, state, activePlay);
    } else {
      this.update2DSmoke(dt, state, activePlay);
    }
  }

  // ----------------------------------------------------------
  // CLEANUP — DISPOSE ONLY RESOURCES CREATED HERE
  // ----------------------------------------------------------

  dispose() {
    if (this.disposed) return;
    this.disposed = true;

    window.removeEventListener('resize', this.onResize);
    window.removeEventListener('orientationchange', this.onResize);

    if (this.coinMesh) {
      this.renderer.world?.remove(this.coinMesh);
      this.coinGeometry?.dispose();
      this.coinMaterial?.dispose();
      this.coinMesh = null;
    }

    if (this.smokePoints) {
      this.renderer.scene?.remove(this.smokePoints);
      this.smokeGeometry?.dispose();
      this.smokeMaterial?.dispose();
      this.smokePoints = null;
    }

    if (this.overlayCanvas) {
      this.overlayCanvas.remove();
      this.overlayCanvas = null;
      this.overlayCtx = null;
    }

    this.coinCounter?.remove();
    this.coinCounter = null;
    this.smokeParticles = [];
    this.overlaySmoke = null;
  }
}
