// Kano Run - Rendering System
import { CONFIG } from './config.js';

export class Renderer {
  constructor(game) {
    this.game = game;
    this.ctx = game.ctx;
  }

  draw() {
    const g = this.game;
    const ctx = this.ctx;

    let shakeX = 0;
    let shakeY = 0;

    if (g.shake > 0) {
      shakeX = (Math.random() - 0.5) * (g.shakeMag || 0);
      shakeY = (Math.random() - 0.5) * (g.shakeMag || 0);
    }

    ctx.save();
    ctx.translate(shakeX, shakeY);

    this.drawRoad();
    this.drawRoadCondition();
    this.drawSpeedLines();
    this.drawEntities();
    this.drawParticles();
    this.drawBillboards();
    this.drawKeke();
    this.drawSpeedHUD();

    ctx.restore();
  }

  drawRoadCondition() {
    const g = this.game;
    const ctx = this.ctx;

    if (
      !g.roadCondition ||
      g.roadCondition === 'normal' ||
      !g.mudTimer ||
      g.mudTimer <= 0
    ) {
      return;
    }

    const w = g.canvas.clientWidth || g.canvas.width;
    const h = g.canvas.clientHeight || g.canvas.height;

    ctx.save();

    if (g.roadCondition === 'mud') {
      ctx.fillStyle = 'rgba(120, 72, 35, 0.12)';
      ctx.fillRect(0, h * 0.48, w, h * 0.52);
    }

    if (g.roadCondition === 'wet') {
      ctx.fillStyle = 'rgba(80, 130, 170, 0.10)';
      ctx.fillRect(0, h * 0.48, w, h * 0.52);
    }

    if (g.roadCondition === 'dust') {
      ctx.fillStyle = 'rgba(210, 170, 110, 0.12)';
      ctx.fillRect(0, h * 0.42, w, h * 0.58);
    }

    ctx.restore();
  }

  drawSpeedLines() {
    const g = this.game;
    const ctx = this.ctx;

    const w = g.canvas.clientWidth || g.canvas.width;
    const h = g.canvas.clientHeight || g.canvas.height;
    const speed = Number(g.speed) || 0;

    if (speed < 12) {
      return;
    }

    const intensity = Math.min(0.32, (speed - 12) / 120);
    const frame = Number(g.frame) || 0;
    const roadOffset = Number(g.roadOff) || 0;

    ctx.save();
    ctx.globalAlpha = intensity;
    ctx.strokeStyle = 'rgba(255,255,255,0.55)';
    ctx.lineWidth = 1.5;

    for (let i = 0; i < 14; i += 1) {
      const x =
        ((i * 113 + roadOffset * 0.7) % Math.max(1, w));

      const y =
        h * 0.48 +
        ((i * 67 + frame * (speed * 0.12)) % Math.max(1, h * 0.48));

      const length = 8 + speed * 0.12;

      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x, y + length);
      ctx.stroke();
    }

    ctx.restore();
  }

  drawRoad() {
    const g = this.game;
    const ctx = this.ctx;

    const w = g.canvas.clientWidth || g.canvas.width;
    const h = g.canvas.clientHeight || g.canvas.height;

    const tod =
      typeof g.getTimeOfDay === 'function'
        ? g.getTimeOfDay()
        : 0.25;

    const roadOffset = Number(g.roadOff) || 0;

    ctx.clearRect(0, 0, w, h);

    // Sky
    const sky = ctx.createLinearGradient(0, 0, 0, h * 0.58);

    if (tod < 0.22) {
      sky.addColorStop(0, '#071426');
      sky.addColorStop(1, '#263c58');
    } else if (tod < 0.32) {
      sky.addColorStop(0, '#173a63');
      sky.addColorStop(1, '#e08a55');
    } else if (tod < 0.72) {
      sky.addColorStop(0, '#55a8d9');
      sky.addColorStop(1, '#d9edf4');
    } else if (tod < 0.82) {
      sky.addColorStop(0, '#d8794e');
      sky.addColorStop(1, '#f4c27b');
    } else {
      sky.addColorStop(0, '#081a31');
      sky.addColorStop(1, '#253d59');
    }

    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, w, h);

    // Stars at night
    if (tod > 0.48) {
      const alpha = Math.min(
        1,
        Math.max(0, (tod - 0.48) * 1.9)
      );

      ctx.fillStyle =
        'rgba(255,255,255,' + alpha + ')';

      for (let i = 0; i < 60; i += 1) {
        const starX = (i * 83) % Math.max(1, w);
        const starY =
          (i * 47) %
          Math.max(1, h * 0.4);

        ctx.fillRect(starX, starY, 1.5, 1.5);
      }
    }

    // Distant skyline
    const horizon = h * 0.46;

    ctx.fillStyle = '#6b7280';

    for (let i = 0; i < 28; i += 1) {
      const buildingWidth = 35 + ((i * 17) % 55);
      const buildingHeight = 25 + ((i * 29) % 95);

      const x =
        ((i * 97 - roadOffset * 0.12) %
          (w + buildingWidth * 2)) -
        buildingWidth;

      ctx.fillRect(
        x,
        horizon - buildingHeight,
        buildingWidth,
        buildingHeight
      );

      ctx.fillStyle =
        i % 3 === 0
          ? '#7c8794'
          : '#596572';
    }

    // Road
    const roadTop = h * 0.48;
    const roadBottom = h;

    const roadGradient = ctx.createLinearGradient(
      0,
      roadTop,
      0,
      roadBottom
    );

    roadGradient.addColorStop(0, '#4b5563');
    roadGradient.addColorStop(1, '#151a20');

    ctx.fillStyle = roadGradient;

    ctx.beginPath();
    ctx.moveTo(w * 0.36, roadTop);
    ctx.lineTo(w * 0.64, roadTop);
    ctx.lineTo(w * 0.96, h);
    ctx.lineTo(w * 0.04, h);
    ctx.closePath();
    ctx.fill();

    // Road shoulders
    ctx.strokeStyle = '#d8b56b';
    ctx.lineWidth = 5;

    ctx.beginPath();
    ctx.moveTo(w * 0.36, roadTop);
    ctx.lineTo(w * 0.04, h);
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(w * 0.64, roadTop);
    ctx.lineTo(w * 0.96, h);
    ctx.stroke();

    // Lane markings
    const laneCount = 3;

    ctx.lineWidth = 3;
    ctx.strokeStyle = 'rgba(255,255,255,0.72)';

    for (let lane = 1; lane < laneCount; lane += 1) {
      const topX =
        w * (0.36 + (0.28 * lane) / laneCount);

      const bottomX =
        w * (0.04 + (0.92 * lane) / laneCount);

      const dashOffset =
        roadOffset % 70;

      for (
        let y = roadTop + dashOffset - 70;
        y < h;
        y += 70
      ) {
        const progress =
          (y - roadTop) /
          Math.max(1, h - roadTop);

        const x =
          topX +
          (bottomX - topX) * progress;

        const dashLength =
          12 + progress * 28;

        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(
          x +
            ((bottomX - topX) /
              Math.max(1, h - roadTop)) *
              dashLength,
          y + dashLength
        );
        ctx.stroke();
      }
    }

    // Road texture
    ctx.globalAlpha = 0.12;
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 1;

    for (let i = 0; i < 30; i += 1) {
      const y =
        roadTop +
        ((i * 91 + roadOffset * 0.8) %
          Math.max(1, h - roadTop));

      const progress =
        (y - roadTop) /
        Math.max(1, h - roadTop);

      const left =
        w * (0.36 - progress * 0.32);

      const right =
        w * (0.64 + progress * 0.32);

      ctx.beginPath();
      ctx.moveTo(left, y);
      ctx.lineTo(right, y);
      ctx.stroke();
    }

    ctx.globalAlpha = 1;
  }

  drawKeke() {
    const g = this.game;
    const ctx = this.ctx;

    const w = g.canvas.clientWidth || g.canvas.width;
    const h = g.canvas.clientHeight || g.canvas.height;

    const centerX = w / 2;
    const baseY = h * 0.82;

    const scale = Math.min(
      1.25,
      Math.max(0.78, w / 700)
    );

    const width = 128 * scale;
    const height = 150 * scale;

    const steer =
      Number(g.steer) ||
      Number(g.laneTarget) ||
      0;

    const x =
      centerX +
      steer * Math.min(85, w * 0.12);

    const y = baseY;

    ctx.save();
    ctx.translate(x, y);

    // Shadow
    ctx.fillStyle = 'rgba(0,0,0,0.38)';
    ctx.beginPath();
    ctx.ellipse(
      0,
      10 * scale,
      width * 0.52,
      width * 0.17,
      0,
      0,
      Math.PI * 2
    );
    ctx.fill();

    // Rear body
    ctx.fillStyle = '#e5a900';

    ctx.beginPath();
    ctx.roundRect(
      -width * 0.48,
      -height * 0.48,
      width * 0.96,
      height * 0.78,
      16 * scale
    );
    ctx.fill();

    // Black lower chassis
    ctx.fillStyle = '#171717';

    ctx.beginPath();
    ctx.roundRect(
      -width * 0.46,
      height * 0.13,
      width * 0.92,
      height * 0.22,
      8 * scale
    );
    ctx.fill();

    // Roof
    ctx.fillStyle = '#161616';

    ctx.beginPath();
    ctx.roundRect(
      -width * 0.45,
      -height * 0.62,
      width * 0.9,
      height * 0.22,
      10 * scale
    );
    ctx.fill();

    // Rear window
    ctx.fillStyle = '#1f4b5c';

    ctx.beginPath();
    ctx.roundRect(
      -width * 0.36,
      -height * 0.45,
      width * 0.72,
      height * 0.3,
      8 * scale
    );
    ctx.fill();

    // Window reflection
    ctx.fillStyle = 'rgba(255,255,255,0.22)';
    ctx.fillRect(
      -width * 0.29,
      -height * 0.4,
      width * 0.13,
      height * 0.2
    );

    // Side supports
    ctx.strokeStyle = '#0b0b0b';
    ctx.lineWidth = 5 * scale;

    ctx.beginPath();
    ctx.moveTo(-width * 0.37, -height * 0.48);
    ctx.lineTo(-width * 0.37, height * 0.15);
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(width * 0.37, -height * 0.48);
    ctx.lineTo(width * 0.37, height * 0.15);
    ctx.stroke();

    // Passenger silhouettes
    const passengerCount = Math.min(
      Number(g.passengers) || 0,
      Number(g.capacity) || 3
    );

    for (let i = 0; i < passengerCount; i += 1) {
      const passengerX =
        -width * 0.22 +
        i * width * 0.22;

      ctx.fillStyle = '#242424';

      ctx.beginPath();
      ctx.arc(
        passengerX,
        -height * 0.2,
        8 * scale,
        0,
        Math.PI * 2
      );
      ctx.fill();

      ctx.fillRect(
        passengerX - 7 * scale,
        -height * 0.12,
        14 * scale,
        22 * scale
      );
    }

    // Rear plate
    ctx.fillStyle = '#eeeeee';
    ctx.fillRect(
      -width * 0.17,
      height * 0.18,
      width * 0.34,
      height * 0.075
    );

    ctx.fillStyle = '#111111';
    ctx.font =
      'bold ' +
      Math.max(8, 9 * scale) +
      'px Arial';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(
      'KANO',
      0,
      height * 0.217
    );

    // Tail lights
    ctx.fillStyle = '#ef4444';

    ctx.beginPath();
    ctx.arc(
      -width * 0.34,
      height * 0.18,
      6 * scale,
      0,
      Math.PI * 2
    );
    ctx.fill();

    ctx.beginPath();
    ctx.arc(
      width * 0.34,
      height * 0.18,
      6 * scale,
      0,
      Math.PI * 2
    );
    ctx.fill();

    // Wheels
    const wheelY = height * 0.34;
    const wheelX = width * 0.44;

    ctx.fillStyle = '#080808';

    ctx.beginPath();
    ctx.arc(
      -wheelX,
      wheelY,
      13 * scale,
      0,
      Math.PI * 2
    );
    ctx.fill();

    ctx.beginPath();
    ctx.arc(
      wheelX,
      wheelY,
      13 * scale,
      0,
      Math.PI * 2
    );
    ctx.fill();

    ctx.restore();
  }

  drawEntities() {
    const g = this.game;

    if (Array.isArray(g.obs)) {
      for (const obstacle of g.obs) {
        this.drawObstacle(obstacle);
      }
    }

    if (Array.isArray(g.paxZones)) {
      for (const zone of g.paxZones) {
        this.drawZone(zone, '#22c55e');
      }
    }

    if (Array.isArray(g.dropZones)) {
      for (const zone of g.dropZones) {
        this.drawZone(zone, '#38bdf8');
      }
    }

    if (Array.isArray(g.coins)) {
      for (const coin of g.coins) {
        this.drawCoin(coin);
      }
    }
  }

  drawObstacle(o) {
    const g = this.game;
    const ctx = this.ctx;

    if (!o) {
      return;
    }

    const w = g.canvas.clientWidth || g.canvas.width;
    const h = g.canvas.clientHeight || g.canvas.height;

    const z = Number(o.z) || 0.5;
    const scale =
      Math.max(0.25, Math.min(1.35, 1 - z));

    const lane =
      Number(o.lane) ||
      Number(o.x) ||
      0;

    const x =
      w / 2 +
      lane * w * 0.12;

    const y =
      h * (0.48 + (1 - z) * 0.42);

    const objectWidth =
      42 + scale * 45;

    const objectHeight =
      26 + scale * 55;

    ctx.save();
    ctx.translate(x, y);

    if (o.type === 'karota') {
      ctx.fillStyle = '#f59e0b';

      ctx.beginPath();
      ctx.roundRect(
        -objectWidth / 2,
        -objectHeight / 2,
        objectWidth,
        objectHeight,
        8
      );
      ctx.fill();

      ctx.fillStyle = '#222222';
      ctx.fillRect(
        -objectWidth * 0.33,
        -objectHeight * 0.22,
        objectWidth * 0.66,
        objectHeight * 0.3
      );

      ctx.fillStyle = '#ef4444';

      ctx.beginPath();
      ctx.arc(
        -objectWidth * 0.34,
        objectHeight * 0.25,
        Math.max(3, scale * 5),
        0,
        Math.PI * 2
      );
      ctx.fill();

      ctx.beginPath();
      ctx.arc(
        objectWidth * 0.34,
        objectHeight * 0.25,
        Math.max(3, scale * 5),
        0,
        Math.PI * 2
      );
      ctx.fill();
    } else if (o.type === 'police') {
      ctx.fillStyle = '#1e40af';

      ctx.beginPath();
      ctx.roundRect(
        -objectWidth / 2,
        -objectHeight / 2,
        objectWidth,
        objectHeight,
        7
      );
      ctx.fill();

      ctx.fillStyle = '#111827';
      ctx.fillRect(
        -objectWidth * 0.32,
        -objectHeight * 0.18,
        objectWidth * 0.64,
        objectHeight * 0.27
      );

      ctx.fillStyle = '#3b82f6';
      ctx.fillRect(
        -objectWidth * 0.23,
        -objectHeight * 0.48,
        objectWidth * 0.2,
        objectHeight * 0.08
      );

      ctx.fillStyle = '#ef4444';
      ctx.fillRect(
        objectWidth * 0.03,
        -objectHeight * 0.48,
        objectWidth * 0.2,
        objectHeight * 0.08
      );
    } else if (o.type === 'car') {
      ctx.fillStyle =
        o.color || '#dc2626';

      ctx.beginPath();
      ctx.roundRect(
        -objectWidth / 2,
        -objectHeight / 2,
        objectWidth,
        objectHeight,
        7
      );
      ctx.fill();

      ctx.fillStyle = '#263b4a';

      ctx.fillRect(
        -objectWidth * 0.32,
        -objectHeight * 0.22,
        objectWidth * 0.64,
        objectHeight * 0.3
      );

      ctx.fillStyle = '#fef3c7';

      ctx.fillRect(
        -objectWidth * 0.38,
        objectHeight * 0.25,
        objectWidth * 0.16,
        objectHeight * 0.12
      );

      ctx.fillRect(
        objectWidth * 0.22,
        objectHeight * 0.25,
        objectWidth * 0.16,
        objectHeight * 0.12
      );
    } else if (o.type === 'keke') {
      ctx.fillStyle = '#e5a900';

      ctx.beginPath();
      ctx.roundRect(
        -objectWidth / 2,
        -objectHeight / 2,
        objectWidth,
        objectHeight,
        8
      );
      ctx.fill();

      ctx.fillStyle = '#111111';

      ctx.fillRect(
        -objectWidth * 0.3,
        -objectHeight * 0.25,
        objectWidth * 0.6,
        objectHeight * 0.32
      );
    } else {
      ctx.fillStyle = '#8b5e34';

      ctx.fillRect(
        -objectWidth / 2,
        -objectHeight / 2,
        objectWidth,
        objectHeight
      );
    }

    ctx.restore();
  }

  drawZone(zone, color) {
    const g = this.game;
    const ctx = this.ctx;

    if (!zone) {
      return;
    }

    const w = g.canvas.clientWidth || g.canvas.width;
    const h = g.canvas.clientHeight || g.canvas.height;

    const z = Number(zone.z) || 0.5;
    const lane =
      Number(zone.lane) ||
      Number(zone.x) ||
      0;

    const x =
      w / 2 +
      lane * w * 0.12;

    const y =
      h * (0.48 + (1 - z) * 0.42);

    const width =
      48 +
      Math.max(0.2, 1 - z) * 55;

    ctx.save();

    ctx.fillStyle = color + '18';
    ctx.strokeStyle = color + 'aa';
    ctx.lineWidth = 2;

    ctx.beginPath();
    ctx.ellipse(
      x,
      y,
      width,
      width * 0.32,
      0,
      0,
      Math.PI * 2
    );
    ctx.fill();
    ctx.stroke();

    ctx.restore();
  }

  drawCoin(coin) {
    const g = this.game;
    const ctx = this.ctx;

    if (!coin) {
      return;
    }

    const w = g.canvas.clientWidth || g.canvas.width;
    const h = g.canvas.clientHeight || g.canvas.height;

    const z = Number(coin.z) || 0.5;
    const lane =
      Number(coin.lane) ||
      Number(coin.x) ||
      0;

    const x =
      w / 2 +
      lane * w * 0.12;

    const y =
      h * (0.48 + (1 - z) * 0.42);

    const radius =
      5 +
      Math.max(0.2, 1 - z) * 12;

    ctx.save();

    ctx.fillStyle = '#fbbf24';
    ctx.strokeStyle = '#fff4b0';
    ctx.lineWidth = 2;

    ctx.beginPath();
    ctx.arc(
      x,
      y,
      radius,
      0,
      Math.PI * 2
    );
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = '#8a5b00';
    ctx.font =
      'bold ' +
      Math.max(7, radius) +
      'px Arial';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(
      'N',
      x,
      y
    );

    ctx.restore();
  }

  drawParticles() {
    const g = this.game;
    const ctx = this.ctx;

    const collections = [
      g.particles,
      g.dust,
      g.weatherParticles
    ];

    for (const list of collections) {
      if (!Array.isArray(list)) {
        continue;
      }

      for (const p of list) {
        if (!p) {
          continue;
        }

        const x = Number(p.x) || 0;
        const y = Number(p.y) || 0;

        const size =
          Number(p.size) ||
          Number(p.r) ||
          2;

        const alpha =
          p.alpha !== undefined
            ? Math.max(
                0,
                Math.min(1, Number(p.alpha))
              )
            : 1;

        ctx.save();

        ctx.globalAlpha = alpha;

        ctx.fillStyle =
          p.color ||
          'rgba(255,255,255,0.7)';

        ctx.beginPath();
        ctx.arc(
          x,
          y,
          size,
          0,
          Math.PI * 2
        );
        ctx.fill();

        ctx.restore();
      }
    }
  }

  drawSpeedHUD() {
    const g = this.game;
    const ctx = this.ctx;

    const w = g.canvas.clientWidth || g.canvas.width;
    const h = g.canvas.clientHeight || g.canvas.height;

    const speed = Math.max(
      0,
      Math.round(Number(g.speed) || 0)
    );

    ctx.save();

    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.beginPath();
    ctx.roundRect(
      w - 125,
      h - 65,
      105,
      45,
      10
    );
    ctx.fill();

    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 22px Arial';
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';

    ctx.fillText(
      speed + ' km/h',
      w - 32,
      h - 42
    );

    ctx.restore();
  }

  drawBillboards() {
    const g = this.game;
    const ctx = this.ctx;

    if (
      !CONFIG ||
      !Array.isArray(CONFIG.BILLBOARDS)
    ) {
      return;
    }

    const w = g.canvas.clientWidth || g.canvas.width;
    const h = g.canvas.clientHeight || g.canvas.height;

    const roadOffset = Number(g.roadOff) || 0;

    for (
      let i = 0;
      i < CONFIG.BILLBOARDS.length;
      i += 1
    ) {
      const billboard =
        CONFIG.BILLBOARDS[i];

      if (!billboard) {
        continue;
      }

      const z =
        ((i * 0.31 + roadOffset * 0.0007) %
          1);

      const depth =
        Math.max(0.1, 1 - z);

      const side =
        i % 2 === 0
          ? -1
          : 1;

      const x =
        w / 2 +
        side *
          (w * (0.31 + depth * 0.24));

      const y =
        h * (0.34 + depth * 0.24);

      const bw =
        42 + depth * 75;

      const bh =
        20 + depth * 38;

      ctx.save();

      ctx.fillStyle = '#5b4636';

      ctx.fillRect(
        x - 2,
        y,
        4,
        55 * depth
      );

      ctx.fillStyle =
        billboard.color ||
        '#fbbf24';

      ctx.fillRect(
        x - bw / 2,
        y - bh,
        bw,
        bh
      );

      ctx.fillStyle = '#111827';

      ctx.font =
        'bold ' +
        Math.max(7, 8 + depth * 5) +
        'px Arial';

      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';

      const label =
        billboard.text ||
        billboard.title ||
        'KANO';

      ctx.fillText(
        String(label),
        x,
        y - bh / 2
      );

      ctx.restore();
    }
  }
}