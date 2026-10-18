export class Renderer2D {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d', { alpha: false });
    this.width = 1;
    this.height = 1;
    this.dpr = 1;
    this.lifeScene = 'road';
    this.ready = !!this.ctx;
  }

  resize() {
    const rect = this.canvas.getBoundingClientRect();
    this.width = Math.max(1, rect.width);
    this.height = Math.max(1, rect.height);
    this.dpr = Math.min(typeof devicePixelRatio === 'number' ? devicePixelRatio : 1, 1.5);
    this.canvas.width = Math.floor(this.width * this.dpr);
    this.canvas.height = Math.floor(this.height * this.dpr);
    this.ctx?.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
  }

  setLifeScene(sceneName) {
    this.lifeScene = sceneName === 'garage' ? 'garage' : 'road';
  }

  draw(state, deltaSeconds) {
    if (!this.ctx) return;
    if (this.lifeScene === 'garage') {
      this.drawGarage(state);
      return;
    }

    const ctx = this.ctx;
    const width = this.width;
    const height = this.height;
    const horizon = height * 0.35;
    const distanceMetres = (state.distance || 0) * 1000;
    const roadPhase = (distanceMetres / 8.5) % 1;
    const trafficPhase = (distanceMetres / 28) % 1;
    ctx.clearRect(0, 0, width, height);

    const sky = ctx.createLinearGradient(0, 0, 0, horizon + 60);
    sky.addColorStop(0, state.night ? '#17233e' : '#76c6e6');
    sky.addColorStop(1, state.night ? '#596477' : '#f2d2a0');
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, width, horizon + 70);
    ctx.fillStyle = state.night ? '#f3e5b2' : '#ffe9a8';
    ctx.beginPath();
    ctx.arc(width * 0.79, height * 0.12, Math.max(12, width * 0.025), 0, Math.PI * 2);
    ctx.fill();

    // Kano compounds, shop fronts and a few mosque/minaret silhouettes.
    for (let index = 0; index < 13; index += 1) {
      const buildingWidth = width / 10 + (index % 3) * 8;
      const x = (index * 97 - (distanceMetres * 0.4) % 110) - 20;
      const y = horizon + 15 + (index % 4) * 5;
      ctx.fillStyle = ['#d4b78a', '#b88c68', '#d7c69d', '#9e8d78'][index % 4];
      ctx.fillRect(x, y, buildingWidth, height * 0.22);
      ctx.fillStyle = '#806b55';
      for (let window = 0; window < 3; window += 1) {
        ctx.fillRect(x + 7 + window * 15, y + 12, 7, 12);
      }
      if (index % 4 === 1) {
        ctx.fillStyle = '#e7d8b4';
        ctx.fillRect(x + buildingWidth * 0.45, y - 17, 5, 18);
        ctx.beginPath();
        ctx.arc(x + buildingWidth * 0.48, y - 18, 5, Math.PI, 0);
        ctx.fill();
      }
    }

    ctx.fillStyle = '#ab9d79';
    ctx.fillRect(0, horizon + 30, width, height - horizon - 30);
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

    for (let lane = 1; lane < 3; lane += 1) {
      for (let index = 0; index < 9; index += 1) {
        const t = ((index / 9 + roadPhase) % 1);
        const y = roadTop + (roadBottom - roadTop) * t * t;
        const x = center + (lane - 1.5) * 2 * (topHalf + (bottomHalf - topHalf) * t * t);
        const lineHeight = 3 + t * 24;
        const lineWidth = 1 + t * 2;
        ctx.fillStyle = '#f8f1d2';
        ctx.fillRect(x - lineWidth / 2, y, lineWidth, lineHeight);
      }
    }

    // Roadside stalls drift with distance, not wall-clock time, so stopping feels like stopping.
    for (let index = 0; index < 7; index += 1) {
      const t = ((index / 7 + trafficPhase) % 1);
      const y = roadTop + (roadBottom - roadTop) * t * t;
      const x = index % 2
        ? center + topHalf + (bottomHalf - topHalf) * t * t + 8
        : center - topHalf - (bottomHalf - topHalf) * t * t - 30;
      const scale = 0.35 + t * 0.85;
      ctx.fillStyle = index % 2 ? '#b64c32' : '#d89a31';
      ctx.fillRect(x, y - 15 * scale, 25 * scale, 15 * scale);
      ctx.fillStyle = '#172333';
      ctx.fillRect(x + 3 * scale, y - 8 * scale, 4 * scale, 8 * scale);
      if (index % 3 === 0) {
        ctx.fillStyle = '#f5c542';
        ctx.fillRect(x, y - 30 * scale, 54 * scale, 15 * scale);
        ctx.fillStyle = '#172333';
        ctx.font = `900 ${Math.max(5, 6 * scale)}px sans-serif`;
        ctx.fillText('RUFFNECK', x + 3 * scale, y - 20 * scale);
      }
    }

    for (const zone of state.zones || []) {
      const depth = zone.depth;
      if (depth < 0.01 || depth > 1.2) continue;
      const y = roadTop + (roadBottom - roadTop) * depth * depth;
      const x = center + (zone.lane - 1) * 2 * (topHalf + (bottomHalf - topHalf) * depth * depth);
      const size = 8 + depth * 29;
      ctx.fillStyle = zone.type === 'pickup' ? '#2bdb8b'
        : zone.type === 'drop' ? '#f5c542'
          : zone.type === 'fuel' ? '#55e8a3' : '#252c34';
      ctx.globalAlpha = 0.4 + depth * 0.5;
      ctx.beginPath();
      ctx.ellipse(x, y, size, size * 0.35, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
      ctx.fillStyle = zone.type === 'pickup' ? '#063c2a' : zone.type === 'drop' ? '#3b2b00' : '#f5f7fa';
      ctx.font = `900 ${Math.max(6, 8 * depth)}px sans-serif`;
      ctx.textAlign = 'center';
      ctx.fillText(zone.type === 'pickup' ? 'PICK' : zone.type === 'drop' ? 'DROP' : zone.type === 'fuel' ? 'FUEL' : 'POT', x, y + 3 * depth);
    }

    for (const vehicle of state.traffic || []) {
      const depth = vehicle.depth;
      if (depth < 0.01 || depth > 1.25) continue;
      const y = roadTop + (roadBottom - roadTop) * depth * depth;
      const x = center + (vehicle.lane - 1) * 2 * (topHalf + (bottomHalf - topHalf) * depth * depth);
      const scale = 0.2 + depth * 0.92;
      ctx.save();
      ctx.translate(x, y);
      ctx.scale(scale, scale);
      if (vehicle.direction === -1) ctx.rotate(Math.PI);
      this.drawVehicle(ctx, vehicle.type, vehicle.color);
      ctx.restore();
    }

    // Keep the three-wheeled player vehicle above the compact touch-control bar.
    const playerX = center + (state.steer || 0) * width * 0.12;
    const playerY = Math.min(height * 0.62, height - 145);
    const playerScale = Math.min(1.3, width / 340);
    ctx.save();
    ctx.translate(playerX, playerY);
    ctx.rotate((state.steer || 0) * 0.09);
    ctx.scale(playerScale, playerScale);
    this.drawKeke(ctx, state.paint || '#f5c542');
    ctx.restore();

    if (state.mode === 'fuel') {
      ctx.fillStyle = '#071725cc';
      ctx.fillRect(width * 0.3, height * 0.23, width * 0.4, 5);
      ctx.fillStyle = '#55e8a3';
      ctx.fillRect(width * 0.3, height * 0.23, width * 0.4 * state.fuel / 100, 5);
    }
    ctx.fillStyle = '#0d1b2bd9';
    ctx.fillRect(width * 0.5 - 68, horizon - 5, 136, 19);
    ctx.fillStyle = '#f5f8fb';
    ctx.font = '900 10px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('KANO · ADAIDAITA SAHU', width * 0.5, horizon + 8);
  }

  drawGarage(state) {
    const ctx = this.ctx;
    const width = this.width;
    const height = this.height;
    ctx.clearRect(0, 0, width, height);
    const sky = ctx.createLinearGradient(0, 0, 0, height);
    sky.addColorStop(0, '#e9c68b');
    sky.addColorStop(0.43, '#bd9c74');
    sky.addColorStop(0.44, '#8b8a80');
    sky.addColorStop(1, '#666b68');
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, width, height);

    // Compound back wall and security gate.
    ctx.fillStyle = '#c7b18a';
    ctx.fillRect(width * 0.07, height * 0.16, width * 0.86, height * 0.43);
    ctx.fillStyle = '#9b835f';
    ctx.fillRect(width * 0.07, height * 0.15, width * 0.86, height * 0.035);
    ctx.fillStyle = '#4a5554';
    ctx.fillRect(width * 0.26, height * 0.22, width * 0.47, height * 0.28);
    ctx.fillStyle = '#aab1a7';
    ctx.fillRect(width * 0.275, height * 0.235, width * 0.44, height * 0.25);
    ctx.strokeStyle = '#596460';
    ctx.lineWidth = Math.max(2, width * 0.006);
    for (let x = width * 0.29; x < width * 0.71; x += width * 0.035) {
      ctx.beginPath();
      ctx.moveTo(x, height * 0.24);
      ctx.lineTo(x, height * 0.48);
      ctx.stroke();
    }
    ctx.fillStyle = '#3b4744';
    ctx.fillRect(width * 0.22, height * 0.19, width * 0.55, height * 0.025);

    // Covered yard roof supports and simple rolling-door slats.
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
    for (let y = height * 0.25; y < height * 0.48; y += height * 0.023) {
      ctx.beginPath();
      ctx.moveTo(width * 0.28, y);
      ctx.lineTo(width * 0.71, y);
      ctx.stroke();
    }

    // Guard kiosk and a standing security guard.
    ctx.fillStyle = '#d2b996';
    ctx.fillRect(width * 0.06, height * 0.38, width * 0.15, height * 0.2);
    ctx.fillStyle = '#46636b';
    ctx.fillRect(width * 0.085, height * 0.41, width * 0.1, height * 0.07);
    ctx.fillStyle = '#5f4333';
    ctx.fillRect(width * 0.04, height * 0.56, width * 0.19, height * 0.035);
    const guardX = width * 0.2;
    const guardY = height * 0.57;
    ctx.fillStyle = '#293c34';
    ctx.fillRect(guardX - width * 0.018, guardY - height * 0.12, width * 0.036, height * 0.11);
    ctx.fillStyle = '#70472f';
    ctx.beginPath();
    ctx.arc(guardX, guardY - height * 0.145, width * 0.018, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#1c332a';
    ctx.fillRect(guardX - width * 0.024, guardY - height * 0.17, width * 0.048, height * 0.013);
    ctx.strokeStyle = '#293c34';
    ctx.lineWidth = Math.max(3, width * 0.009);
    ctx.beginPath();
    ctx.moveTo(guardX - width * 0.015, guardY - height * 0.03);
    ctx.lineTo(guardX - width * 0.04, guardY + height * 0.06);
    ctx.moveTo(guardX + width * 0.015, guardY - height * 0.03);
    ctx.lineTo(guardX + width * 0.04, guardY + height * 0.06);
    ctx.stroke();

    // Roadside compound textures and parking bays.
    ctx.strokeStyle = '#d5c7a8';
    ctx.lineWidth = 2;
    for (let index = 0; index < 5; index += 1) {
      ctx.beginPath();
      ctx.moveTo(width * (0.31 + index * 0.095), height * 0.62);
      ctx.lineTo(width * (0.23 + index * 0.11), height * 0.94);
      ctx.stroke();
    }
    ctx.fillStyle = '#173a2e';
    ctx.fillRect(width * 0.22, height * 0.055, width * 0.56, height * 0.075);
    ctx.fillStyle = '#f6d77e';
    ctx.font = `900 ${Math.max(10, width * 0.031)}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.fillText('KANO KEKE PARK', width * 0.5, height * 0.085);
    ctx.fillStyle = '#f8f5e8';
    ctx.font = `800 ${Math.max(7, width * 0.015)}px sans-serif`;
    ctx.fillText('SECURITY · PARKING YARD', width * 0.5, height * 0.112);

    // This is the same Adaidaita Sahu shape used while driving, now shown parked.
    ctx.save();
    ctx.translate(width * 0.63, height * 0.68);
    ctx.scale(Math.min(1.6, width / 285), Math.min(1.6, width / 285));
    this.drawKeke(ctx, state.paint || '#f5c542');
    ctx.restore();
    ctx.fillStyle = '#eef0ec';
    ctx.font = `800 ${Math.max(8, width * 0.019)}px sans-serif`;
    ctx.fillText('KEKE NO. 07 · PARKED OVERNIGHT', width * 0.62, height * 0.9);
  }

  drawVehicle(ctx, type, color) {
    ctx.fillStyle = color || ({ police: '#dce6ee', karota: '#3d91d1', motorcycle: '#c8473a', taxi: '#e8c64a', suv: '#303a4b' }[type] || '#e5e8ec');
    if (type === 'motorcycle') {
      ctx.beginPath();
      ctx.ellipse(0, 0, 4, 9, 0, 0, Math.PI * 2);
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

  drawKeke(ctx, paint) {
    ctx.fillStyle = '#101720';
    ctx.beginPath();
    ctx.ellipse(0, 20, 35, 7, 0, 0, Math.PI * 2);
    ctx.fill();
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
    ctx.beginPath();
    ctx.arc(0, -20, 6, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#8997a6';
    ctx.beginPath();
    ctx.arc(0, -20, 2.5, 0, Math.PI * 2);
    ctx.fill();
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
    ctx.fillStyle = '#82d8ef';
    ctx.fillRect(-15, -31, 12, 10);
    ctx.fillRect(2, -31, 11, 10);
    ctx.fillStyle = '#f8f0d2';
    ctx.fillRect(-27, -5, 6, 4);
    ctx.fillRect(23, -5, 6, 4);
    ctx.fillStyle = '#172334';
    ctx.font = '900 7px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('NAPEP', 0, 1);
  }

  dispose() {
    this.ready = false;
    this.ctx = null;
  }
}
