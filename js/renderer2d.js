// ============================================================
// KANO LIFE — CANVAS 2D RENDERER
// File: js/renderer2d.js
//
// Includes:
// - Reversible road and scenery movement
// - Traffic, roadside stops and pothole rendering
// - Kano morning-life scenes
// - Keke park and vehicle fallback artwork
// - Safe positive wrapping for reverse scrolling
// ============================================================

const clamp = (value, min, max) =>
  Math.max(min, Math.min(max, value));

const positiveModulo = (value, divisor) =>
  ((value % divisor) + divisor) % divisor;

// Align near traffic with the player's displayed position rather than
// allowing collision markers to disappear beneath the bottom controls.
export function projectRoadDepth(depth) {
  const value = Number.isFinite(depth) ? depth : 1.32;

  return Math.max(
    0.02,
    Math.min(0.59, 0.59 - (value - 0.045) * 0.45),
  );
}

export class Renderer2D {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d', { alpha: false });

    this.width = 1;
    this.height = 1;
    this.dpr = 1;

    this.lifeScene = 'road';
    this.ready = Boolean(this.ctx);

    // This is the distance actually travelled by the rendered world.
    // Unlike state.distance, it decreases when the player reverses.
    this.visualDistanceKm = 0;
    this.lastElapsed = null;
  }

  resize() {
    const rect = this.canvas.getBoundingClientRect();

    this.width = Math.max(1, rect.width);
    this.height = Math.max(1, rect.height);

    this.dpr = Math.min(
      typeof devicePixelRatio === 'number' ? devicePixelRatio : 1,
      1.5,
    );

    this.canvas.width = Math.floor(this.width * this.dpr);
    this.canvas.height = Math.floor(this.height * this.dpr);

    this.ctx?.setTransform(
      this.dpr,
      0,
      0,
      this.dpr,
      0,
      0,
    );
  }

  setLifeScene(sceneName) {
    const supported = new Set([
      'road',
      'garage',
      'bedroom',
      'household',
      'street',
      'breakfast',
      'walk',
      'school',
    ]);

    this.lifeScene = supported.has(sceneName)
      ? sceneName
      : 'road';
  }

  /**
   * Derive signed travel from the game state.
   *
   * Forward speed is positive.
   * Reverse speed is negative.
   *
   * Older game states without signedSpeed remain supported.
   */
  getSignedSpeed(state) {
    if (Number.isFinite(state?.signedSpeed)) {
      return state.signedSpeed;
    }

    const speed = Math.abs(Number(state?.speed) || 0);

    return state?.reverse ? -speed : speed;
  }

  /**
   * Advance the renderer's world position.
   *
   * The game keeps state.distance as forward journey distance.
   * visualDistanceKm instead follows both forward and reverse travel,
   * so the road markings, buildings and roadside stalls reverse smoothly.
   */
  updateVisualDistance(state, deltaSeconds) {
    const elapsed = Math.max(0, Number(state?.elapsed) || 0);
    const distance = Math.max(0, Number(state?.distance) || 0);
    const dt = clamp(Number(deltaSeconds) || 0, 0, 0.05);

    const newRun =
      this.lastElapsed !== null
      && elapsed + 0.001 < this.lastElapsed;

    if (this.lastElapsed === null || newRun) {
      this.visualDistanceKm = distance;
    } else if (elapsed > this.lastElapsed) {
      const signedSpeed = this.getSignedSpeed(state);

      this.visualDistanceKm += (signedSpeed / 3600) * dt;
    }

    this.lastElapsed = elapsed;

    return this.visualDistanceKm;
  }

  draw(state, deltaSeconds) {
    if (!this.ctx || !this.ready) return;

    if (this.lifeScene === 'garage') {
      this.drawGarage(state);
      return;
    }

    if (this.lifeScene !== 'road') {
      this.drawLifeScene(state);
      return;
    }

    const ctx = this.ctx;
    const width = this.width;
    const height = this.height;

    const horizon = height * 0.35;
    const visualDistance = this.updateVisualDistance(
      state,
      deltaSeconds,
    );

    const distanceMetres = visualDistance * 1000;

    // Positive modulo prevents negative phase values when reversing.
    const roadPhase = positiveModulo(distanceMetres / 8.5, 1);
    const trafficPhase = positiveModulo(distanceMetres / 28, 1);
    const buildingPhase = positiveModulo(distanceMetres * 0.4, 110);

    ctx.clearRect(0, 0, width, height);

    // ----------------------------------------------------------
    // SKY
    // ----------------------------------------------------------

    const sky = ctx.createLinearGradient(
      0,
      0,
      0,
      horizon + 60,
    );

    sky.addColorStop(
      0,
      state.night ? '#17233e' : '#76c6e6',
    );

    sky.addColorStop(
      1,
      state.night ? '#596477' : '#f2d2a0',
    );

    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, width, horizon + 70);

    ctx.fillStyle = state.night ? '#f3e5b2' : '#ffe9a8';
    ctx.beginPath();
    ctx.arc(
      width * 0.79,
      height * 0.12,
      Math.max(12, width * 0.025),
      0,
      Math.PI * 2,
    );
    ctx.fill();

    // ----------------------------------------------------------
    // KANO COMPOUNDS, SHOPS AND BUILDINGS
    // ----------------------------------------------------------

    for (let index = 0; index < 13; index += 1) {
      const buildingWidth =
        width / 10 + (index % 3) * 8;

      const x =
        index * 97 - buildingPhase - 20;

      const y =
        horizon + 15 + (index % 4) * 5;

      ctx.fillStyle = [
        '#d4b78a',
        '#b88c68',
        '#d7c69d',
        '#9e8d78',
      ][index % 4];

      ctx.fillRect(
        x,
        y,
        buildingWidth,
        height * 0.22,
      );

      ctx.fillStyle = '#806b55';

      for (let window = 0; window < 3; window += 1) {
        ctx.fillRect(
          x + 7 + window * 15,
          y + 12,
          7,
          12,
        );
      }

      if (index % 4 === 1) {
        ctx.fillStyle = '#e7d8b4';

        ctx.fillRect(
          x + buildingWidth * 0.45,
          y - 17,
          5,
          18,
        );

        ctx.beginPath();

        ctx.arc(
          x + buildingWidth * 0.48,
          y - 18,
          5,
          Math.PI,
          0,
        );

        ctx.fill();
      }
    }

    // ----------------------------------------------------------
    // GROUND AND ROAD
    // ----------------------------------------------------------

    ctx.fillStyle = '#ab9d79';

    ctx.fillRect(
      0,
      horizon + 30,
      width,
      height - horizon - 30,
    );

    const roadTop = horizon + 10;
    const roadBottom = height * 1.02;

    const topHalf = width * 0.12;
    const bottomHalf = width * 0.49;
    const center = width * 0.5;

    ctx.fillStyle = '#303b46';

    ctx.beginPath();
    ctx.moveTo(center - topHalf, roadTop);
    ctx.lineTo(center + topHalf, roadTop);
    ctx.lineTo(center + bottomHalf, roadBottom);
    ctx.lineTo(center - bottomHalf, roadBottom);
    ctx.closePath();
    ctx.fill();

    ctx.strokeStyle = '#e9d9a6';
    ctx.lineWidth = 2;

    ctx.beginPath();

    ctx.moveTo(center - topHalf, roadTop);
    ctx.lineTo(center - bottomHalf, roadBottom);

    ctx.moveTo(center + topHalf, roadTop);
    ctx.lineTo(center + bottomHalf, roadBottom);

    ctx.stroke();

    // ----------------------------------------------------------
    // LANE MARKINGS
    // Road markings now move backwards when reverse is engaged.
    // ----------------------------------------------------------

    for (let lane = 1; lane < 3; lane += 1) {
      for (let index = 0; index < 9; index += 1) {
        const t = positiveModulo(
          index / 9 + roadPhase,
          1,
        );

        const y =
          roadTop + (roadBottom - roadTop) * t * t;

        const x =
          center
          + (lane - 1.5)
          * (2 / 3)
          * (
            topHalf
            + (bottomHalf - topHalf) * t * t
          );

        const lineHeight = 3 + t * 24;
        const lineWidth = 1 + t * 2;

        ctx.fillStyle = '#f8f1d2';

        ctx.fillRect(
          x - lineWidth / 2,
          y,
          lineWidth,
          lineHeight,
        );
      }
    }

    // ----------------------------------------------------------
    // ROADSIDE STALLS AND RUFFNECK SIGNAGE
    // ----------------------------------------------------------

    for (let index = 0; index < 7; index += 1) {
      const t = positiveModulo(
        index / 7 + trafficPhase,
        1,
      );

      const y =
        roadTop + (roadBottom - roadTop) * t * t;

      const x = index % 2
        ? center
          + topHalf
          + (bottomHalf - topHalf) * t * t
          + 8
        : center
          - topHalf
          - (bottomHalf - topHalf) * t * t
          - 30;

      const scale = 0.35 + t * 0.85;

      ctx.fillStyle = index % 2
        ? '#b64c32'
        : '#d89a31';

      ctx.fillRect(
        x,
        y - 15 * scale,
        25 * scale,
        15 * scale,
      );

      ctx.fillStyle = '#172333';

      ctx.fillRect(
        x + 3 * scale,
        y - 8 * scale,
        4 * scale,
        8 * scale,
      );

      if (index % 3 === 0) {
        ctx.fillStyle = '#f5c542';

        ctx.fillRect(
          x,
          y - 30 * scale,
          54 * scale,
          15 * scale,
        );

        ctx.fillStyle = '#172333';

        ctx.font = `900 ${Math.max(5, 6 * scale)}px sans-serif`;

        ctx.fillText(
          'RUFFNECK',
          x + 3 * scale,
          y - 20 * scale,
        );
      }
    }

    // ----------------------------------------------------------
    // PICKUP, DROP-OFF, FUEL AND POTHOLE MARKERS
    // ----------------------------------------------------------

    for (const zone of state.zones || []) {
      const depth = zone.depth;

      if (depth < 0.01 || depth > 1.2) continue;

      const t = projectRoadDepth(depth);

      const halfAt =
        topHalf + (bottomHalf - topHalf) * t * t;

      const y =
        roadTop + (roadBottom - roadTop) * t * t;

      const x = zone.type === 'pothole'
        ? center
          + (zone.lane - 1)
          * (2 / 3)
          * halfAt
        : center
          + (zone.side || (zone.lane === 0 ? -1 : 1))
          * Math.max(
            topHalf + 7,
            halfAt - (12 + t * 12),
          );

      const size = 8 + t * 29;

      ctx.fillStyle =
        zone.type === 'pickup'
          ? '#2bdb8b'
          : zone.type === 'drop'
            ? '#f5c542'
            : zone.type === 'fuel'
              ? '#55e8a3'
              : '#252c34';

      ctx.globalAlpha = 0.4 + t * 0.5;

      ctx.beginPath();

      ctx.ellipse(
        x,
        y,
        size,
        size * 0.35,
        0,
        0,
        Math.PI * 2,
      );

      ctx.fill();

      ctx.globalAlpha = 1;

      ctx.fillStyle =
        zone.type === 'pickup'
          ? '#063c2a'
          : zone.type === 'drop'
            ? '#3b2b00'
            : '#f5f7fa';

      ctx.font = `900 ${Math.max(6, 8 * t)}px sans-serif`;
      ctx.textAlign = 'center';

      ctx.fillText(
        zone.type === 'pickup'
          ? zone.hub
            ? 'KEKE STOP'
            : 'PICK-UP'
          : zone.type === 'drop'
            ? 'DROP-OFF'
            : zone.type === 'fuel'
              ? 'FUEL'
              : 'POT',
        x,
        y + 3,
      );
    }

    // ----------------------------------------------------------
    // OTHER TRAFFIC
    // ----------------------------------------------------------

    for (const vehicle of state.traffic || []) {
      const depth = vehicle.depth;

      if (depth < 0.01 || depth > 1.25) continue;

      const t = projectRoadDepth(depth);

      const halfAt =
        topHalf + (bottomHalf - topHalf) * t * t;

      const y =
        roadTop + (roadBottom - roadTop) * t * t;

      const x =
        center + (vehicle.lane - 1) * (2 / 3) * halfAt;

      const scale = 0.2 + t * 0.92;

      ctx.save();
      ctx.translate(x, y);
      ctx.scale(scale, scale);

      if (vehicle.direction === -1) {
        ctx.rotate(Math.PI);
      }

      this.drawVehicle(
        ctx,
        vehicle.type,
        vehicle.color,
      );

      ctx.restore();
    }

    // ----------------------------------------------------------
    // PLAYER KEKE
    // The player's keke remains facing forwards while reversing.
    // This represents a real reversing manoeuvre rather than
    // turning the entire vehicle around.
    // ----------------------------------------------------------

    const playerX =
      center
      + (state.steer || 0) * (2 / 3) * bottomHalf
      + (state.pullOverSide || 0)
      * Math.min(22, width * 0.055);

    const playerY = Math.min(
      height * 0.585,
      height - 178,
    );

    const playerScale = Math.min(1.48, width / 275);

    ctx.save();

    ctx.translate(playerX, playerY);
    ctx.rotate((state.steer || 0) * 0.09);
    ctx.scale(playerScale, playerScale);

    this.drawKeke(
      ctx,
      state.paint || '#f5c542',
    );

    ctx.restore();

    // ----------------------------------------------------------
    // FUEL CHALLENGE METER
    // ----------------------------------------------------------

    if (state.mode === 'fuel') {
      ctx.fillStyle = '#071725cc';

      ctx.fillRect(
        width * 0.3,
        height * 0.23,
        width * 0.4,
        5,
      );

      ctx.fillStyle = '#55e8a3';

      ctx.fillRect(
        width * 0.3,
        height * 0.23,
        width * 0.4 * state.fuel / 100,
        5,
      );
    }

    // ----------------------------------------------------------
    // ROAD TITLE
    // ----------------------------------------------------------

    ctx.fillStyle = '#0d1b2bd9';

    ctx.fillRect(
      width * 0.5 - 68,
      horizon - 5,
      136,
      19,
    );

    ctx.fillStyle = '#f5f8fb';
    ctx.font = '900 10px sans-serif';
    ctx.textAlign = 'center';

    ctx.fillText(
      'KANO · ADAIDAITA SAHU',
      width * 0.5,
      horizon + 8,
    );
  }

  // ==========================================================
  // NORTHERN NIGERIAN MORNING SCENES
  // ==========================================================

  drawLifeScene(state) {
    const ctx = this.ctx;
    const w = this.width;
    const h = this.height;

    ctx.clearRect(0, 0, w, h);

    const isInside =
      this.lifeScene === 'bedroom'
      || this.lifeScene === 'household';

    const sky = ctx.createLinearGradient(0, 0, 0, h);

    sky.addColorStop(
      0,
      isInside ? '#c4a27b' : '#84c4da',
    );

    sky.addColorStop(
      0.54,
      isInside ? '#b28d67' : '#f2d5a2',
    );

    sky.addColorStop(0.55, '#a38a68');
    sky.addColorStop(1, '#78664f');

    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, w, h);

    const rect = (x, y, rw, rh, color) => {
      ctx.fillStyle = color;
      ctx.fillRect(x, y, rw, rh);
    };

    const circle = (x, y, r, color) => {
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
    };

    const human = (
      x,
      y,
      scale = 1,
      clothes = '#254d3d',
      scarf = false,
    ) => {
      ctx.save();

      ctx.translate(x, y);
      ctx.scale(scale, scale);

      // Feet, legs, torso, head and Hausa clothing silhouette.
      rect(-9, -4, 7, 20, '#2b2f2e');
      rect(2, -4, 7, 20, '#2b2f2e');

      rect(-14, -42, 28, 39, clothes);
      circle(0, -52, 10, '#805638');

      if (scarf) {
        ctx.fillStyle = '#24342c';

        ctx.beginPath();
        ctx.ellipse(
          0,
          -55,
          14,
          14,
          0,
          Math.PI,
          Math.PI * 2,
        );

        ctx.lineTo(14, -41);
        ctx.lineTo(-13, -41);
        ctx.closePath();
        ctx.fill();
      } else {
        rect(-10, -62, 20, 4, '#c9aa74');
      }

      ctx.strokeStyle = clothes;
      ctx.lineWidth = 6;

      ctx.beginPath();

      ctx.moveTo(-12, -35);
      ctx.lineTo(-23, -17);

      ctx.moveTo(12, -35);
      ctx.lineTo(21, -20);

      ctx.stroke();
      ctx.restore();
    };

    const compound = (
      x,
      y,
      width,
      color,
      label = '',
    ) => {
      rect(x, y, width, h * 0.30, color);
      rect(x - 3, y - 7, width + 6, 9, '#7e6549');

      rect(
        x + width * 0.43,
        y + h * 0.095,
        width * 0.14,
        h * 0.205,
        '#634530',
      );

      rect(
        x + width * 0.12,
        y + h * 0.08,
        width * 0.16,
        h * 0.08,
        '#4e7375',
      );

      if (label) {
        rect(
          x + 7,
          y + 8,
          width - 14,
          18,
          '#305441',
        );

        ctx.fillStyle = '#f6d88c';
        ctx.font = 'bold 9px sans-serif';

        ctx.fillText(
          label,
          x + 13,
          y + 21,
        );
      }
    };

    if (this.lifeScene === 'bedroom') {
      rect(0, h * 0.66, w, h * 0.34, '#8c6d50');

      rect(
        w * 0.09,
        h * 0.11,
        w * 0.82,
        h * 0.55,
        '#d0b18b',
      );

      rect(
        w * 0.1,
        h * 0.105,
        w * 0.8,
        h * 0.025,
        '#70563d',
      );

      rect(
        w * 0.20,
        h * 0.20,
        w * 0.23,
        h * 0.17,
        '#5b827f',
      );

      rect(
        w * 0.31,
        h * 0.20,
        3,
        h * 0.17,
        '#e0cca5',
      );

      rect(
        w * 0.20,
        h * 0.285,
        w * 0.23,
        3,
        '#e0cca5',
      );

      rect(
        w * 0.20,
        h * 0.56,
        w * 0.44,
        h * 0.13,
        '#6d4a30',
      );

      rect(
        w * 0.20,
        h * 0.51,
        w * 0.44,
        h * 0.07,
        '#e5d8ba',
      );

      rect(
        w * 0.22,
        h * 0.50,
        w * 0.12,
        h * 0.07,
        '#d2b780',
      );

      rect(
        w * 0.69,
        h * 0.24,
        w * 0.13,
        h * 0.40,
        '#65482f',
      );

      rect(
        w * 0.68,
        h * 0.22,
        w * 0.15,
        7,
        '#3a3027',
      );

      human(
        w * 0.52,
        h * 0.76,
        Math.min(1.3, w / 350),
        '#2b4e3c',
        false,
      );

      this.lifeLabel(
        ctx,
        w,
        '06:05 · BEDROOM IN KANO',
      );
    } else if (this.lifeScene === 'household') {
      compound(
        w * 0.07,
        h * 0.20,
        w * 0.43,
        '#cdb38a',
        'FAMILY COMPOUND',
      );

      compound(
        w * 0.58,
        h * 0.23,
        w * 0.33,
        '#bba078',
      );

      circle(
        w * 0.22,
        h * 0.71,
        w * 0.065,
        '#91553a',
      );

      rect(
        w * 0.16,
        h * 0.72,
        w * 0.12,
        h * 0.13,
        '#6d4830',
      );

      circle(
        w * 0.78,
        h * 0.73,
        w * 0.045,
        '#7b8586',
      );

      human(
        w * 0.42,
        h * 0.80,
        Math.min(1.2, w / 360),
        '#9d5b36',
      );

      human(
        w * 0.68,
        h * 0.80,
        Math.min(1.1, w / 380),
        '#425e90',
        true,
      );

      rect(
        w * 0.2,
        h * 0.88,
        w * 0.6,
        h * 0.04,
        '#d3bb93',
      );

      this.lifeLabel(
        ctx,
        w,
        'HOME COMPOUND · GET READY FOR WORK',
      );
    } else if (
      this.lifeScene === 'street'
      || this.lifeScene === 'walk'
      || this.lifeScene === 'school'
    ) {
      for (let i = 0; i < 4; i += 1) {
        compound(
          w * (0.025 + i * 0.245),
          h * (0.22 + (i % 2) * 0.04),
          w * 0.22,
          ['#c9aa7a', '#a88361', '#d0bd98', '#b49775'][i],
          i === 1 ? 'PROVISIONS' : '',
        );
      }

      rect(
        0,
        h * 0.70,
        w,
        h * 0.13,
        '#62635f',
      );

      rect(
        0,
        h * 0.84,
        w,
        h * 0.16,
        '#bea27d',
      );

      ctx.strokeStyle = '#f0d9a1';
      ctx.lineWidth = 3;
      ctx.setLineDash([18, 15]);

      ctx.beginPath();
      ctx.moveTo(0, h * 0.77);
      ctx.lineTo(w, h * 0.77);
      ctx.stroke();

      ctx.setLineDash([]);

      if (this.lifeScene === 'school') {
        rect(
          w * 0.32,
          h * 0.19,
          w * 0.36,
          h * 0.07,
          '#244b3c',
        );

        ctx.fillStyle = '#f5de9a';
        ctx.font = 'bold 12px sans-serif';
        ctx.textAlign = 'center';

        ctx.fillText(
          'PRIMARY SCHOOL · KANO',
          w * 0.5,
          h * 0.235,
        );
      }

      human(
        w * 0.24,
        h * 0.79,
        0.88,
        '#365b86',
        true,
      );

      human(
        w * 0.53,
        h * 0.82,
        0.94,
        '#28483b',
      );

      human(
        w * 0.79,
        h * 0.80,
        0.88,
        '#a45b37',
      );

      // Adaidaita Sahu parked at the roadside.
      ctx.save();

      ctx.translate(
        w * 0.72,
        h * 0.64,
      );

      ctx.scale(
        Math.min(0.68, w / 600),
        Math.min(0.68, w / 600),
      );

      this.drawKeke(ctx, '#e5b936');

      ctx.restore();

      this.lifeLabel(
        ctx,
        w,
        this.lifeScene === 'school'
          ? 'SCHOOL RUN · MORNING KANO'
          : this.lifeScene === 'walk'
            ? 'WALK TO THE KEKE PARK'
            : 'NEIGHBOURHOOD WAKES UP',
      );
    } else if (this.lifeScene === 'breakfast') {
      compound(
        w * 0.02,
        h * 0.23,
        w * 0.30,
        '#cbb18a',
      );

      compound(
        w * 0.68,
        h * 0.20,
        w * 0.30,
        '#b59873',
      );

      rect(
        w * 0.20,
        h * 0.35,
        w * 0.60,
        h * 0.13,
        '#4b6047',
      );

      rect(
        w * 0.18,
        h * 0.47,
        w * 0.64,
        h * 0.16,
        '#845234',
      );

      rect(
        w * 0.13,
        h * 0.32,
        w * 0.74,
        h * 0.06,
        '#c7a05c',
      );

      circle(
        w * 0.45,
        h * 0.54,
        w * 0.07,
        '#bf7d32',
      );

      circle(
        w * 0.49,
        h * 0.52,
        w * 0.035,
        '#e0a34a',
      );

      circle(
        w * 0.60,
        h * 0.53,
        w * 0.045,
        '#bdc9c4',
      );

      human(
        w * 0.25,
        h * 0.81,
        1,
        '#314e3b',
        true,
      );

      human(
        w * 0.73,
        h * 0.81,
        0.95,
        '#87563c',
      );

      rect(
        w * 0.32,
        h * 0.15,
        w * 0.36,
        h * 0.055,
        '#234a39',
      );

      ctx.fillStyle = '#f7df9a';
      ctx.font = '900 11px sans-serif';
      ctx.textAlign = 'center';

      ctx.fillText(
        'AKARA · MASA · TEA · PAP',
        w * 0.50,
        h * 0.185,
      );

      this.lifeLabel(
        ctx,
        w,
        'ROADSIDE BREAKFAST · KANO',
      );
    }
  }

  lifeLabel(ctx, width, label) {
    ctx.fillStyle = '#122820e8';

    ctx.fillRect(
      width * 0.06,
      this.height * 0.055,
      width * 0.88,
      this.height * 0.065,
    );

    ctx.fillStyle = '#f6dc95';

    ctx.font = `900 ${Math.max(9, width * 0.025)}px sans-serif`;
    ctx.textAlign = 'center';

    ctx.fillText(
      label,
      width * 0.5,
      this.height * 0.096,
    );
  }

  // ==========================================================
  // KEKE PARK / GARAGE SCENE
  // ==========================================================

  drawGarage(state) {
    const ctx = this.ctx;
    const width = this.width;
    const height = this.height;

    ctx.clearRect(0, 0, width, height);

    const sky = ctx.createLinearGradient(
      0,
      0,
      0,
      height,
    );

    sky.addColorStop(0, '#e9c68b');
    sky.addColorStop(0.43, '#bd9c74');
    sky.addColorStop(0.44, '#8b8a80');
    sky.addColorStop(1, '#666b68');

    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, width, height);

    // Compound back wall.
    ctx.fillStyle = '#c7b18a';

    ctx.fillRect(
      width * 0.07,
      height * 0.16,
      width * 0.86,
      height * 0.43,
    );

    ctx.fillStyle = '#9b835f';

    ctx.fillRect(
      width * 0.07,
      height * 0.15,
      width * 0.86,
      height * 0.035,
    );

    // Security gate.
    ctx.fillStyle = '#4a5554';

    ctx.fillRect(
      width * 0.26,
      height * 0.22,
      width * 0.47,
      height * 0.28,
    );

    ctx.fillStyle = '#aab1a7';

    ctx.fillRect(
      width * 0.275,
      height * 0.235,
      width * 0.44,
      height * 0.25,
    );

    ctx.strokeStyle = '#596460';
    ctx.lineWidth = Math.max(2, width * 0.006);

    for (
      let x = width * 0.29;
      x < width * 0.71;
      x += width * 0.035
    ) {
      ctx.beginPath();
      ctx.moveTo(x, height * 0.24);
      ctx.lineTo(x, height * 0.48);
      ctx.stroke();
    }

    ctx.fillStyle = '#3b4744';

    ctx.fillRect(
      width * 0.22,
      height * 0.19,
      width * 0.55,
      height * 0.025,
    );

    // Covered yard roof supports.
    ctx.strokeStyle = '#34434a';
    ctx.lineWidth = Math.max(4, width * 0.009);

    ctx.beginPath();

    ctx.moveTo(width * 0.08, height * 0.13);
    ctx.lineTo(width * 0.92, height * 0.13);

    ctx.moveTo(width * 0.12, height * 0.13);
    ctx.lineTo(width * 0.12, height * 0.58);

    ctx.moveTo(width * 0.88, height * 0.13);
    ctx.lineTo(width * 0.88, height * 0.58);

    ctx.stroke();

    ctx.strokeStyle = '#687174';
    ctx.lineWidth = 1;

    for (
      let y = height * 0.25;
      y < height * 0.48;
      y += height * 0.023
    ) {
      ctx.beginPath();
      ctx.moveTo(width * 0.28, y);
      ctx.lineTo(width * 0.71, y);
      ctx.stroke();
    }

    // Guard kiosk.
    ctx.fillStyle = '#d2b996';

    ctx.fillRect(
      width * 0.06,
      height * 0.38,
      width * 0.15,
      height * 0.2,
    );

    ctx.fillStyle = '#46636b';

    ctx.fillRect(
      width * 0.085,
      height * 0.41,
      width * 0.1,
      height * 0.07,
    );

    ctx.fillStyle = '#5f4333';

    ctx.fillRect(
      width * 0.04,
      height * 0.56,
      width * 0.19,
      height * 0.035,
    );

    const guardX = width * 0.2;
    const guardY = height * 0.57;

    ctx.fillStyle = '#293c34';

    ctx.fillRect(
      guardX - width * 0.018,
      guardY - height * 0.12,
      width * 0.036,
      height * 0.11,
    );

    ctx.fillStyle = '#70472f';

    ctx.beginPath();

    ctx.arc(
      guardX,
      guardY - height * 0.145,
      width * 0.018,
      0,
      Math.PI * 2,
    );

    ctx.fill();

    ctx.fillStyle = '#1c332a';

    ctx.fillRect(
      guardX - width * 0.024,
      guardY - height * 0.17,
      width * 0.048,
      height * 0.013,
    );

    ctx.strokeStyle = '#293c34';
    ctx.lineWidth = Math.max(3, width * 0.009);

    ctx.beginPath();

    ctx.moveTo(
      guardX - width * 0.015,
      guardY - height * 0.03,
    );

    ctx.lineTo(
      guardX - width * 0.04,
      guardY + height * 0.06,
    );

    ctx.moveTo(
      guardX + width * 0.015,
      guardY - height * 0.03,
    );

    ctx.lineTo(
      guardX + width * 0.04,
      guardY + height * 0.06,
    );

    ctx.stroke();

    // Parking bays.
    ctx.strokeStyle = '#d5c7a8';
    ctx.lineWidth = 2;

    for (let index = 0; index < 5; index += 1) {
      ctx.beginPath();

      ctx.moveTo(
        width * (0.31 + index * 0.095),
        height * 0.62,
      );

      ctx.lineTo(
        width * (0.23 + index * 0.11),
        height * 0.94,
      );

      ctx.stroke();
    }

    // Park signage.
    ctx.fillStyle = '#173a2e';

    ctx.fillRect(
      width * 0.22,
      height * 0.055,
      width * 0.56,
      height * 0.075,
    );

    ctx.fillStyle = '#f6d77e';
    ctx.font = `900 ${Math.max(10, width * 0.031)}px sans-serif`;
    ctx.textAlign = 'center';

    ctx.fillText(
      'KANO KEKE PARK',
      width * 0.5,
      height * 0.085,
    );

    ctx.fillStyle = '#f8f5e8';
    ctx.font = `800 ${Math.max(7, width * 0.015)}px sans-serif`;

    ctx.fillText(
      'SECURITY · PARKING YARD',
      width * 0.5,
      height * 0.112,
    );

    // Same keke shape as the driving scene.
    ctx.save();

    ctx.translate(
      width * 0.63,
      height * 0.68,
    );

    ctx.scale(
      Math.min(1.6, width / 285),
      Math.min(1.6, width / 285),
    );

    this.drawKeke(
      ctx,
      state.paint || '#f5c542',
    );

    ctx.restore();

    ctx.fillStyle = '#eef0ec';
    ctx.font = `800 ${Math.max(8, width * 0.019)}px sans-serif`;

    ctx.fillText(
      'KEKE NO. 07 · PARKED OVERNIGHT',
      width * 0.62,
      height * 0.9,
    );
  }

  // ==========================================================
  // TRAFFIC VEHICLES
  // ==========================================================

  drawVehicle(ctx, type, color) {
    ctx.fillStyle = color || ({
      police: '#dce6ee',
      karota: '#3d91d1',
      motorcycle: '#c8473a',
      taxi: '#e8c64a',
      suv: '#303a4b',
    }[type] || '#e5e8ec');

    if (type === 'motorcycle') {
      ctx.beginPath();

      ctx.ellipse(
        0,
        0,
        4,
        9,
        0,
        0,
        Math.PI * 2,
      );

      ctx.fill();

      ctx.fillStyle = '#151d27';

      ctx.beginPath();
      ctx.arc(0, 8, 3, 0, Math.PI * 2);
      ctx.arc(0, -8, 3, 0, Math.PI * 2);
      ctx.fill();

      return;
    }

    ctx.fillRect(-12, -18, 24, 33);

    ctx.fillStyle = '#18293a';
    ctx.fillRect(-8, -13, 16, 8);

    ctx.fillStyle = '#fff1a8';
    ctx.fillRect(-10, -18, 5, 3);
    ctx.fillRect(5, -18, 5, 3);

    ctx.fillStyle = '#141a20';
    ctx.fillRect(-13, 8, 4, 8);
    ctx.fillRect(9, 8, 4, 8);
  }

  // ==========================================================
  // ADAIDAITA SAHU — THREE-WHEEL VEHICLE
  // ==========================================================

  drawKeke(ctx, paint) {
    // Ground shadow.
    ctx.fillStyle = '#101720';

    ctx.beginPath();

    ctx.ellipse(
      0,
      20,
      35,
      7,
      0,
      0,
      Math.PI * 2,
    );

    ctx.fill();

    // Rear wheels.
    ctx.fillStyle = '#121923';

    for (const x of [-25, 24]) {
      ctx.beginPath();
      ctx.arc(x, 12, 9, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = '#9ca9b6';

      ctx.beginPath();
      ctx.arc(x, 12, 4, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = '#121923';
    }

    // Front wheel.
    ctx.beginPath();
    ctx.arc(0, -20, 6, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#8997a6';

    ctx.beginPath();
    ctx.arc(0, -20, 2.5, 0, Math.PI * 2);
    ctx.fill();

    // Body.
    ctx.fillStyle = paint;

    ctx.beginPath();
    ctx.moveTo(-32, 4);
    ctx.lineTo(-26, -18);
    ctx.lineTo(20, -18);
    ctx.lineTo(33, 4);
    ctx.closePath();
    ctx.fill();

    ctx.strokeStyle = '#68470d';
    ctx.lineWidth = 2;
    ctx.stroke();

    // Roof and passenger compartment.
    ctx.fillStyle = '#14293c';

    ctx.beginPath();
    ctx.moveTo(-24, -18);
    ctx.lineTo(-17, -34);
    ctx.lineTo(16, -34);
    ctx.lineTo(23, -18);
    ctx.closePath();
    ctx.fill();

    ctx.strokeStyle = '#9bb0c2';
    ctx.lineWidth = 2;
    ctx.stroke();

    // Windows.
    ctx.fillStyle = '#82d8ef';
    ctx.fillRect(-15, -31, 12, 10);
    ctx.fillRect(2, -31, 11, 10);

    // Headlights.
    ctx.fillStyle = '#f8f0d2';
    ctx.fillRect(-27, -5, 6, 4);
    ctx.fillRect(23, -5, 6, 4);

    // NAPEP branding.
    ctx.fillStyle = '#172334';
    ctx.font = '900 7px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('NAPEP', 0, 1);
  }

  // ==========================================================
  // CLEANUP
  // ==========================================================

  dispose() {
    this.ready = false;
    this.ctx = null;
  }
}