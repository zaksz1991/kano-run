// Kano Run - Canvas Renderer
// Complete replacement renderer.
// Deliberately avoids template literals and other syntax that previously
// caused Vercel/Rollup parsing failures.

export class Renderer {
  constructor(game) {
    this.game = game;
    this.ctx = game.canvas.getContext('2d');

    this.lastWidth = 0;
    this.lastHeight = 0;
  }

  draw() {
    var canvas = this.game.canvas;
    var ctx = this.ctx;

    var w = canvas.width;
    var h = canvas.height;

    if (!w || !h) {
      return;
    }

    this.lastWidth = w;
    this.lastHeight = h;

    ctx.clearRect(0, 0, w, h);

    this.drawSky();
    this.drawRoad();
    this.drawRoadCondition();
    this.drawBillboards();
    this.drawEntities();
    this.drawParticles();
    this.drawSpeedLines();
    this.drawKeke();
    this.drawSpeedHUD();
  }

  drawSky() {
    var ctx = this.ctx;
    var w = this.lastWidth;
    var h = this.lastHeight;

    var tod = 0.5;

    if (
      this.game &&
      typeof this.game.timeOfDay === 'number' &&
      isFinite(this.game.timeOfDay)
    ) {
      tod = this.game.timeOfDay;
    }

    if (tod < 0) {
      tod = 0;
    }

    if (tod > 1) {
      tod = 1;
    }

    var skyGradient = ctx.createLinearGradient(0, 0, 0, h * 0.62);

    if (tod < 0.25) {
      skyGradient.addColorStop(0, '#020617');
      skyGradient.addColorStop(1, '#172554');
    } else if (tod < 0.48) {
      skyGradient.addColorStop(0, '#0f172a');
      skyGradient.addColorStop(0.55, '#2563eb');
      skyGradient.addColorStop(1, '#f59e0b');
    } else if (tod < 0.72) {
      skyGradient.addColorStop(0, '#38bdf8');
      skyGradient.addColorStop(0.65, '#7dd3fc');
      skyGradient.addColorStop(1, '#fde68a');
    } else {
      skyGradient.addColorStop(0, '#1e293b');
      skyGradient.addColorStop(0.55, '#475569');
      skyGradient.addColorStop(1, '#fb923c');
    }

    ctx.fillStyle = skyGradient;
    ctx.fillRect(0, 0, w, h * 0.62);

    var horizonY = h * 0.46;

    ctx.fillStyle = '#64748b';

    ctx.beginPath();
    ctx.moveTo(0, horizonY + 35);
    ctx.lineTo(w * 0.08, horizonY + 12);
    ctx.lineTo(w * 0.18, horizonY + 28);
    ctx.lineTo(w * 0.3, horizonY + 5);
    ctx.lineTo(w * 0.42, horizonY + 30);
    ctx.lineTo(w * 0.55, horizonY + 8);
    ctx.lineTo(w * 0.7, horizonY + 27);
    ctx.lineTo(w * 0.82, horizonY + 5);
    ctx.lineTo(w, horizonY + 32);
    ctx.lineTo(w, horizonY + 80);
    ctx.lineTo(0, horizonY + 80);
    ctx.closePath();
    ctx.fill();

    if (tod > 0.48) {
      var alpha = Math.min(1, (tod - 0.48) * 1.9);
      var starColor = 'rgba(255,255,255,' + alpha + ')';

      ctx.fillStyle = starColor;

      var i;

      for (i = 0; i < 60; i += 1) {
        var starX = (i * 83) % Math.max(1, w);
        var starY = (i * 47) % Math.max(1, h * 0.4);

        ctx.fillRect(starX, starY, 1.5, 1.5);
      }
    }

    var sunX = w * 0.78;
    var sunY = h * 0.22;

    ctx.beginPath();
    ctx.arc(sunX, sunY, 34, 0, Math.PI * 2);

    if (tod < 0.72) {
      ctx.fillStyle = '#fbbf24';
    } else {
      ctx.fillStyle = '#f8fafc';
    }

    ctx.fill();

    if (tod > 0.5) {
      var moonX = w * 0.18;
      var moonY = h * 0.2;

      ctx.beginPath();
      ctx.arc(moonX, moonY, 24, 0, Math.PI * 2);
      ctx.fillStyle = '#f8fafc';
      ctx.fill();

      ctx.beginPath();
      ctx.arc(moonX + 9, moonY - 5, 21, 0, Math.PI * 2);
      ctx.fillStyle = '#172554';
      ctx.fill();
    }
  }

  drawRoad() {
    var ctx = this.ctx;
    var w = this.lastWidth;
    var h = this.lastHeight;

    var horizon = h * 0.46;
    var bottom = h;

    var roadTopWidth = Math.max(80, w * 0.12);
    var roadBottomWidth = w * 0.96;

    var center = w * 0.5;

    ctx.fillStyle = '#365314';

    ctx.beginPath();
    ctx.moveTo(0, horizon);
    ctx.lineTo(w, horizon);
    ctx.lineTo(w, bottom);
    ctx.lineTo(0, bottom);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = '#1f2937';

    ctx.beginPath();
    ctx.moveTo(center - roadTopWidth / 2, horizon);
    ctx.lineTo(center + roadTopWidth / 2, horizon);
    ctx.lineTo(center + roadBottomWidth / 2, bottom);
    ctx.lineTo(center - roadBottomWidth / 2, bottom);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = '#475569';

    ctx.beginPath();
    ctx.moveTo(center - roadTopWidth / 2 - 4, horizon);
    ctx.lineTo(center - roadTopWidth / 2 - 12, horizon);
    ctx.lineTo(center - roadBottomWidth / 2 - 18, bottom);
    ctx.lineTo(center - roadBottomWidth / 2, bottom);
    ctx.closePath();
    ctx.fill();

    ctx.beginPath();
    ctx.moveTo(center + roadTopWidth / 2 + 4, horizon);
    ctx.lineTo(center + roadTopWidth / 2 + 12, horizon);
    ctx.lineTo(center + roadBottomWidth / 2 + 18, bottom);
    ctx.lineTo(center + roadBottomWidth / 2, bottom);
    ctx.closePath();
    ctx.fill();

    this.drawLaneMarkers();
  }

  drawLaneMarkers() {
    var ctx = this.ctx;
    var w = this.lastWidth;
    var h = this.lastHeight;

    var horizon = h * 0.46;
    var center = w * 0.5;

    var roadTopWidth = Math.max(80, w * 0.12);
    var roadBottomWidth = w * 0.96;

    var lanePositions = [1 / 3, 2 / 3];

    var i;

    for (i = 0; i < lanePositions.length; i += 1) {
      var lane = lanePositions[i];

      var topX =
        center - roadTopWidth / 2 +
        roadTopWidth * lane;

      var bottomX =
        center - roadBottomWidth / 2 +
        roadBottomWidth * lane;

      var markerCount = 9;
      var j;

      for (j = 0; j < markerCount; j += 1) {
        var start = j / markerCount;
        var end = start + 0.045;

        var y1 = horizon + (h - horizon) * start;
        var y2 = horizon + (h - horizon) * Math.min(1, end);

        var x1 = topX + (bottomX - topX) * start;
        var x2 = topX + (bottomX - topX) * Math.min(1, end);

        ctx.strokeStyle = '#e2e8f0';
        ctx.lineWidth = Math.max(2, 1 + start * 7);

        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
        ctx.stroke();
      }
    }
  }

  drawRoadCondition() {
    var ctx = this.ctx;
    var w = this.lastWidth;
    var h = this.lastHeight;

    var weather = this.game && this.game.weather
      ? String(this.game.weather).toLowerCase()
      : '';

    if (
      weather.indexOf('rain') !== -1 ||
      weather.indexOf('storm') !== -1
    ) {
      ctx.strokeStyle = 'rgba(191,219,254,0.35)';
      ctx.lineWidth = 1;

      var i;

      for (i = 0; i < 90; i += 1) {
        var x = (i * 97) % Math.max(1, w);
        var y = (i * 53) % Math.max(1, h);

        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x - 3, y + 12);
        ctx.stroke();
      }
    }

    if (
      weather.indexOf('dust') !== -1 ||
      weather.indexOf('harmattan') !== -1
    ) {
      ctx.fillStyle = 'rgba(245,158,11,0.08)';
      ctx.fillRect(0, 0, w, h);
    }
  }

  drawSpeedLines() {
    var ctx = this.ctx;
    var w = this.lastWidth;
    var h = this.lastHeight;

    var speed = 0;

    if (this.game && typeof this.game.speed === 'number') {
      speed = Math.abs(this.game.speed);
    }

    if (speed < 5) {
      return;
    }

    var intensity = Math.min(35, Math.floor(speed * 1.5));

    ctx.strokeStyle = 'rgba(255,255,255,0.18)';
    ctx.lineWidth = 2;

    var i;

    for (i = 0; i < intensity; i += 1) {
      var x = (i * 137) % Math.max(1, w);
      var y = (i * 71) % Math.max(1, h);

      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x, y + 10 + speed);
      ctx.stroke();
    }
  }

  drawBillboards() {
    var ctx = this.ctx;
    var w = this.lastWidth;
    var h = this.lastHeight;

    var horizon = h * 0.46;

    this.drawBillboard(
      w * 0.09,
      horizon + h * 0.05,
      'KANO',
      '#1e40af'
    );

    this.drawBillboard(
      w * 0.86,
      horizon + h * 0.1,
      'RUN',
      '#f59e0b'
    );
  }

  drawBillboard(x, y, text, background) {
    var ctx = this.ctx;

    var width = 72;
    var height = 42;

    ctx.fillStyle = '#334155';
    ctx.fillRect(x + 5, y + height, 5, 35);
    ctx.fillRect(x + width - 10, y + height, 5, 35);

    ctx.fillStyle = background;
    ctx.fillRect(x, y, width, height);

    ctx.strokeStyle = '#f8fafc';
    ctx.lineWidth = 2;
    ctx.strokeRect(x, y, width, height);

    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 14px Arial';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, x + width / 2, y + height / 2);

    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
  }

  drawEntities() {
    var entities = [];

    if (this.game && Array.isArray(this.game.entities)) {
      entities = this.game.entities;
    } else if (this.game && Array.isArray(this.game.obstacles)) {
      entities = this.game.obstacles;
    }

    var i;

    for (i = entities.length - 1; i >= 0; i -= 1) {
      this.drawEntity(entities[i]);
    }
  }

  drawEntity(entity) {
    if (!entity) {
      return;
    }

    var x = this.getEntityX(entity);
    var y = this.getEntityY(entity);

    var type = entity.type
      ? String(entity.type).toLowerCase()
      : '';

    if (
      type.indexOf('coin') !== -1 ||
      type.indexOf('bonus') !== -1
    ) {
      this.drawCoin(x, y, entity);
      return;
    }

    if (
      type.indexOf('zone') !== -1 ||
      type.indexOf('checkpoint') !== -1
    ) {
      this.drawZone(x, y, entity);
      return;
    }

    this.drawObstacle(x, y, entity);
  }

  getEntityX(entity) {
    var w = this.lastWidth;

    if (typeof entity.x === 'number') {
      return entity.x;
    }

    if (typeof entity.lane === 'number') {
      var lane = Math.max(0, Math.min(2, entity.lane));
      return w * (0.25 + lane * 0.25);
    }

    return w * 0.5;
  }

  getEntityY(entity) {
    var h = this.lastHeight;

    if (typeof entity.y === 'number') {
      return entity.y;
    }

    if (typeof entity.z === 'number') {
      return h * 0.46 + entity.z;
    }

    return h * 0.7;
  }

  drawObstacle(x, y, entity) {
    var ctx = this.ctx;

    var type = entity && entity.type
      ? String(entity.type).toLowerCase()
      : '';

    var scale = 1;

    if (typeof entity.scale === 'number') {
      scale = Math.max(0.35, Math.min(2.5, entity.scale));
    }

    var width = 62 * scale;
    var height = 82 * scale;

    if (type.indexOf('police') !== -1) {
      this.drawPoliceCar(x, y, width, height);
      return;
    }

    if (
      type.indexOf('karota') !== -1 ||
      type.indexOf('keke') !== -1
    ) {
      this.drawKarota(x, y, width, height);
      return;
    }

    if (type.indexOf('truck') !== -1) {
      this.drawVehicle(
        x,
        y,
        width * 1.2,
        height * 1.15,
        '#475569'
      );
      return;
    }

    if (
      type.indexOf('pedestrian') !== -1 ||
      type.indexOf('person') !== -1
    ) {
      this.drawPedestrian(x, y, scale);
      return;
    }

    this.drawVehicle(
      x,
      y,
      width,
      height,
      '#dc2626'
    );
  }

  drawVehicle(x, y, width, height, bodyColor) {
    var ctx = this.ctx;

    var left = x - width / 2;
    var top = y - height;

    ctx.fillStyle = '#111827';
    ctx.fillRect(
      left - 3,
      top + height * 0.15,
      width + 6,
      height * 0.8
    );

    ctx.fillStyle = bodyColor;

    ctx.beginPath();
    ctx.roundRect(
      left,
      top,
      width,
      height,
      Math.min(10, width * 0.12)
    );
    ctx.fill();

    ctx.fillStyle = '#bfdbfe';
    ctx.fillRect(
      left + width * 0.17,
      top + height * 0.14,
      width * 0.66,
      height * 0.25
    );

    ctx.fillStyle = '#f8fafc';

    ctx.fillRect(
      left + width * 0.13,
      top + height * 0.68,
      width * 0.18,
      height * 0.1
    );

    ctx.fillRect(
      left + width * 0.69,
      top + height * 0.68,
      width * 0.18,
      height * 0.1
    );

    ctx.fillStyle = '#020617';

    ctx.fillRect(
      left - 5,
      top + height * 0.25,
      7,
      height * 0.18
    );

    ctx.fillRect(
      left + width - 2,
      top + height * 0.25,
      7,
      height * 0.18
    );
  }

  drawPoliceCar(x, y, width, height) {
    var ctx = this.ctx;

    this.drawVehicle(
      x,
      y,
      width,
      height,
      '#1e40af'
    );

    var top = y - height;

    ctx.fillStyle = '#ef4444';
    ctx.fillRect(
      x - width * 0.22,
      top - height * 0.04,
      width * 0.2,
      height * 0.08
    );

    ctx.fillStyle = '#3b82f6';
    ctx.fillRect(
      x + width * 0.02,
      top - height * 0.04,
      width * 0.2,
      height * 0.08
    );

    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold ' + Math.max(8, Math.floor(width * 0.16)) + 'px Arial';
    ctx.textAlign = 'center';
    ctx.fillText('POLICE', x, top + height * 0.56);
    ctx.textAlign = 'left';
  }

  drawKarota(x, y, width, height) {
    var ctx = this.ctx;

    this.drawVehicle(
      x,
      y,
      width,
      height,
      '#f59e0b'
    );

    var top = y - height;

    ctx.fillStyle = '#ef4444';

    ctx.fillRect(
      x - width * 0.34,
      top + height * 0.72,
      width * 0.16,
      height * 0.09
    );

    ctx.fillRect(
      x + width * 0.18,
      top + height * 0.72,
      width * 0.16,
      height * 0.09
    );

    ctx.fillStyle = '#111827';
    ctx.font = 'bold ' + Math.max(8, Math.floor(width * 0.15)) + 'px Arial';
    ctx.textAlign = 'center';
    ctx.fillText('KEKE', x, top + height * 0.55);
    ctx.textAlign = 'left';
  }

  drawPedestrian(x, y, scale) {
    var ctx = this.ctx;

    var headRadius = 8 * scale;

    ctx.fillStyle = '#d4a373';

    ctx.beginPath();
    ctx.arc(
      x,
      y - 52 * scale,
      headRadius,
      0,
      Math.PI * 2
    );
    ctx.fill();

    ctx.fillStyle = '#2563eb';

    ctx.fillRect(
      x - 10 * scale,
      y - 42 * scale,
      20 * scale,
      30 * scale
    );

    ctx.strokeStyle = '#111827';
    ctx.lineWidth = Math.max(2, 3 * scale);

    ctx.beginPath();
    ctx.moveTo(x - 5 * scale, y - 12 * scale);
    ctx.lineTo(x - 10 * scale, y + 12 * scale);
    ctx.moveTo(x + 5 * scale, y - 12 * scale);
    ctx.lineTo(x + 10 * scale, y + 12 * scale);
    ctx.stroke();
  }

  drawZone(x, y, entity) {
    var ctx = this.ctx;

    var radius = 35;

    if (entity && typeof entity.radius === 'number') {
      radius = Math.max(15, Math.min(100, entity.radius));
    }

    ctx.strokeStyle = 'rgba(59,130,246,0.75)';
    ctx.lineWidth = 4;

    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.stroke();

    ctx.fillStyle = 'rgba(59,130,246,0.12)';
    ctx.fill();
  }

  drawCoin(x, y, entity) {
    var ctx = this.ctx;

    var radius = 12;

    if (entity && typeof entity.radius === 'number') {
      radius = Math.max(6, Math.min(24, entity.radius));
    }

    ctx.fillStyle = '#fbbf24';

    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = '#92400e';
    ctx.lineWidth = 2;
    ctx.stroke();

    ctx.fillStyle = '#78350f';
    ctx.font = 'bold ' + Math.max(8, radius) + 'px Arial';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('N', x, y);
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
  }

  drawParticles() {
    var particles = [];

    if (
      this.game &&
      Array.isArray(this.game.particles)
    ) {
      particles = this.game.particles;
    }

    var ctx = this.ctx;
    var i;

    for (i = 0; i < particles.length; i += 1) {
      var particle = particles[i];

      if (!particle) {
        continue;
      }

      var x = typeof particle.x === 'number'
        ? particle.x
        : 0;

      var y = typeof particle.y === 'number'
        ? particle.y
        : 0;

      var size = typeof particle.size === 'number'
        ? Math.max(1, particle.size)
        : 3;

      ctx.fillStyle = particle.color
        ? String(particle.color)
        : '#fbbf24';

      ctx.globalAlpha =
        typeof particle.alpha === 'number'
          ? Math.max(0, Math.min(1, particle.alpha))
          : 1;

      ctx.fillRect(
        x - size / 2,
        y - size / 2,
        size,
        size
      );
    }

    ctx.globalAlpha = 1;
  }

  drawKeke() {
    var ctx = this.ctx;
    var w = this.lastWidth;
    var h = this.lastHeight;

    var x = w * 0.5;
    var y = h * 0.93;

    if (this.game) {
      if (typeof this.game.playerX === 'number') {
        x = this.game.playerX;
      } else if (typeof this.game.kekeX === 'number') {
        x = this.game.kekeX;
      } else if (typeof this.game.lane === 'number') {
        var lane = Math.max(
          0,
          Math.min(2, this.game.lane)
        );

        x = w * (0.25 + lane * 0.25);
      }

      if (typeof this.game.playerY === 'number') {
        y = this.game.playerY;
      }
    }

    var width = Math.min(120, w * 0.22);
    var height = width * 1.35;

    ctx.save();

    if (
      this.game &&
      typeof this.game.shake === 'number' &&
      this.game.shake > 0
    ) {
      var shakeX =
        (Math.random() - 0.5) *
        Math.min(12, this.game.shake);

      var shakeY =
        (Math.random() - 0.5) *
        Math.min(8, this.game.shake);

      ctx.translate(shakeX, shakeY);
    }

    var left = x - width / 2;
    var top = y - height;

    ctx.fillStyle = '#111827';

    ctx.beginPath();
    ctx.roundRect(
      left,
      top,
      width,
      height,
      12
    );
    ctx.fill();

    ctx.fillStyle = '#f59e0b';

    ctx.beginPath();
    ctx.roundRect(
      left + 5,
      top + 5,
      width - 10,
      height - 10,
      10
    );
    ctx.fill();

    ctx.fillStyle = '#0f172a';

    ctx.beginPath();
    ctx.moveTo(
      left + width * 0.15,
      top + height * 0.12
    );

    ctx.lineTo(
      left + width * 0.85,
      top + height * 0.12
    );

    ctx.lineTo(
      left + width * 0.78,
      top + height * 0.42
    );

    ctx.lineTo(
      left + width * 0.22,
      top + height * 0.42
    );

    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = '#bfdbfe';

    ctx.fillRect(
      left + width * 0.25,
      top + height * 0.17,
      width * 0.5,
      height * 0.18
    );

    ctx.fillStyle = '#ef4444';

    ctx.fillRect(
      left + width * 0.13,
      top + height * 0.74,
      width * 0.2,
      height * 0.1
    );

    ctx.fillRect(
      left + width * 0.67,
      top + height * 0.74,
      width * 0.2,
      height * 0.1
    );

    ctx.fillStyle = '#111827';

    ctx.beginPath();
    ctx.arc(
      left + width * 0.18,
      top + height * 0.9,
      width * 0.1,
      0,
      Math.PI * 2
    );
    ctx.fill();

    ctx.beginPath();
    ctx.arc(
      left + width * 0.82,
      top + height * 0.9,
      width * 0.1,
      0,
      Math.PI * 2
    );
    ctx.fill();

    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold ' + Math.max(9, Math.floor(width * 0.15)) + 'px Arial';
    ctx.textAlign = 'center';
    ctx.fillText(
      'KANO RUN',
      x,
      top + height * 0.6
    );

    ctx.textAlign = 'left';

    ctx.restore();
  }

  drawSpeedHUD() {
    var ctx = this.ctx;
    var w = this.lastWidth;
    var h = this.lastHeight;

    var speed = 0;

    if (
      this.game &&
      typeof this.game.speed === 'number'
    ) {
      speed = Math.max(0, this.game.speed);
    }

    var displaySpeed = Math.round(speed);

    ctx.fillStyle = 'rgba(15,23,42,0.78)';

    ctx.beginPath();
    ctx.roundRect(
      16,
      16,
      145,
      55,
      10
    );
    ctx.fill();

    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 13px Arial';
    ctx.fillText(
      'SPEED',
      28,
      37
    );

    ctx.fillStyle = '#fbbf24';
    ctx.font = 'bold 22px Arial';
    ctx.fillText(
      String(displaySpeed),
      28,
      60
    );

    ctx.fillStyle = '#ffffff';
    ctx.font = '12px Arial';
    ctx.fillText(
      ' km/h',
      76,
      60
    );

    if (
      this.game &&
      typeof this.game.score === 'number'
    ) {
      ctx.fillStyle = 'rgba(15,23,42,0.78)';

      ctx.beginPath();
      ctx.roundRect(
        w - 160,
        16,
        144,
        55,
        10
      );
      ctx.fill();

      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 13px Arial';
      ctx.fillText(
        'SCORE',
        w - 148,
        37
      );

      ctx.fillStyle = '#fbbf24';
      ctx.font = 'bold 22px Arial';
      ctx.fillText(
        String(Math.floor(this.game.score)),
        w - 148,
        60
      );
    }

    ctx.fillStyle = 'rgba(15,23,42,0.55)';
    ctx.font = '11px Arial';
    ctx.fillText(
      'KANO RUN',
      18,
      h - 18
    );
  }
}