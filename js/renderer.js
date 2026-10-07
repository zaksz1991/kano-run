```js
// Kano Run - Canvas Renderer

export class Renderer {
  constructor(game) {
    this.game = game;
    this.canvas = game.canvas;
    this.ctx = this.canvas.getContext('2d');
    this.width = this.canvas.width;
    this.height = this.canvas.height;
  }

  draw() {
    const ctx = this.ctx;
    const canvas = this.canvas;

    this.width = canvas.width;
    this.height = canvas.height;

    ctx.clearRect(0, 0, this.width, this.height);

    ctx.save();

    this.drawSky();
    this.drawRoad();
    this.drawBillboards();
    this.drawRoadCondition();
    this.drawSpeedLines();
    this.drawEntities();
    this.drawParticles();
    this.drawSpeedHUD();

    ctx.restore();
  }

  drawSky() {
    const ctx = this.ctx;
    const w = this.width;
    const h = this.height;

    const tod =
      typeof this.game.getTimeOfDay === 'function'
        ? this.game.getTimeOfDay()
        : 0.35;

    let skyTop = '#1e40af';
    let skyBottom = '#93c5fd';

    if (tod > 0.45 && tod < 0.7) {
      skyTop = '#312e81';
      skyBottom = '#f59e0b';
    } else if (tod >= 0.7) {
      skyTop = '#0c4a6e';
      skyBottom = '#155e75';
    }

    const gradient = ctx.createLinearGradient(0, 0, 0, h * 0.65);
    gradient.addColorStop(0, skyTop);
    gradient.addColorStop(1, skyBottom);

    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, w, h * 0.65);

    // Sun
    if (tod < 0.75) {
      const sunX = w * 0.78;
      const sunY = h * 0.18;

      ctx.beginPath();
      ctx.arc(sunX, sunY, Math.max(20, w * 0.035), 0, Math.PI * 2);
      ctx.fillStyle = '#fbbf24';
      ctx.fill();
    }

    // Stars
    if (tod > 0.48) {
      const alpha = Math.min(1, (tod - 0.48) * 1.9);

      ctx.fillStyle = `rgba(255, 255, 255, ${alpha})`;

      for (let i = 0; i < 60; i++) {
        const x = ((i * 83) % Math.max(1, w));
        const y = ((i * 47) % Math.max(1, h * 0.4));

        ctx.fillRect(x, y, 1.5, 1.5);
      }
    }

    // Horizon
    ctx.fillStyle = '#334155';
    ctx.fillRect(0, h * 0.58, w, h * 0.07);
  }

  drawRoad() {
    const ctx = this.ctx;
    const w = this.width;
    const h = this.height;

    const horizonY = h * 0.58;

    ctx.fillStyle = '#475569';

    ctx.beginPath();
    ctx.moveTo(0, h);
    ctx.lineTo(w, h);
    ctx.lineTo(w * 0.64, horizonY);
    ctx.lineTo(w * 0.36, horizonY);
    ctx.closePath();
    ctx.fill();

    // Road edges
    ctx.strokeStyle = '#f8fafc';
    ctx.lineWidth = Math.max(2, w * 0.004);

    ctx.beginPath();
    ctx.moveTo(0, h);
    ctx.lineTo(w * 0.36, horizonY);
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(w, h);
    ctx.lineTo(w * 0.64, horizonY);
    ctx.stroke();

    // Lane markings
    const laneCount = 3;

    for (let lane = 1; lane < laneCount; lane++) {
      const bottomX = (w / laneCount) * lane;
      const topX = w * (0.36 + (0.28 * lane) / laneCount);

      ctx.strokeStyle = '#e2e8f0';
      ctx.lineWidth = Math.max(2, w * 0.003);

      ctx.setLineDash([18, 18]);

      ctx.beginPath();
      ctx.moveTo(bottomX, h);
      ctx.lineTo(topX, horizonY);
      ctx.stroke();

      ctx.setLineDash([]);
    }
  }

  drawRoadCondition() {
    const ctx = this.ctx;
    const w = this.width;
    const h = this.height;

    const condition = this.game.roadCondition || 'normal';

    if (condition === 'dust') {
      ctx.fillStyle = 'rgba(217, 180, 120, 0.12)';
      ctx.fillRect(0, h * 0.55, w, h * 0.45);
    }

    if (condition === 'rain') {
      ctx.strokeStyle = 'rgba(147, 197, 253, 0.35)';
      ctx.lineWidth = 1;

      for (let i = 0; i < 50; i++) {
        const x = (i * 97) % Math.max(1, w);
        const y = (i * 53) % Math.max(1, h);

        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x - 4, y + 12);
        ctx.stroke();
      }
    }
  }

  drawSpeedLines() {
    const ctx = this.ctx;
    const w = this.width;
    const h = this.height;

    const speed = Number(this.game.speed || 0);

    if (speed < 4) {
      return;
    }

    ctx.strokeStyle = 'rgba(255,255,255,0.18)';
    ctx.lineWidth = 1;

    for (let i = 0; i < 16; i++) {
      const x = (i * 137) % Math.max(1, w);
      const y = h * 0.35 + ((i * 71) % Math.max(1, h * 0.45));

      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x - 2, y + speed * 2);
      ctx.stroke();
    }
  }

  drawBillboards() {
    const ctx = this.ctx;
    const w = this.width;
    const h = this.height;

    const horizonY = h * 0.58;

    const billboards = [
      {
        x: w * 0.08,
        y: horizonY - h * 0.12,
        width: w * 0.18,
        height: h * 0.08,
        text: 'KANO RUN'
      },
      {
        x: w * 0.74,
        y: horizonY - h * 0.15,
        width: w * 0.18,
        height: h * 0.08,
        text: 'KANO'
      }
    ];

    for (const board of billboards) {
      ctx.fillStyle = '#78350f';
      ctx.fillRect(
        board.x + board.width * 0.45,
        board.y + board.height,
        board.width * 0.08,
        h * 0.12
      );

      ctx.fillStyle = '#f8fafc';
      ctx.fillRect(
        board.x,
        board.y,
        board.width,
        board.height
      );

      ctx.strokeStyle = '#1e293b';
      ctx.lineWidth = 2;
      ctx.strokeRect(
        board.x,
        board.y,
        board.width,
        board.height
      );

      ctx.fillStyle = '#0f172a';
      ctx.font = `bold ${Math.max(10, w * 0.018)}px Arial`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';

      ctx.fillText(
        board.text,
        board.x + board.width / 2,
        board.y + board.height / 2
      );
    }

    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
  }

  drawEntities() {
    const entities = this.game.entities || [];

    for (const entity of entities) {
      if (!entity) {
        continue;
      }

      if (entity.type === 'keke' || entity.type === 'player') {
        this.drawKeke(entity);
      } else if (
        entity.type === 'police' ||
        entity.type === 'karota' ||
        entity.type === 'car'
      ) {
        this.drawObstacle(entity);
      } else if (entity.type === 'coin') {
        this.drawCoin(entity);
      } else if (entity.type === 'zone') {
        this.drawZone(entity);
      }
    }

    if (this.game.player) {
      this.drawKeke(this.game.player, true);
    }
  }

  drawKeke(entity, isPlayer = false) {
    const ctx = this.ctx;

    const x = Number(entity.x || this.width / 2);
    const y = Number(entity.y || this.height * 0.8);

    const scale = Math.max(
      0.45,
      Math.min(1.6, Number(entity.scale || 1))
    );

    const width = 58 * scale;
    const height = 82 * scale;

    ctx.save();
    ctx.translate(x, y);

    // Wheels
    ctx.fillStyle = '#111827';

    ctx.beginPath();
    ctx.arc(-width * 0.34, height * 0.25, width * 0.13, 0, Math.PI * 2);
    ctx.fill();

    ctx.beginPath();
    ctx.arc(width * 0.34, height * 0.25, width * 0.13, 0, Math.PI * 2);
    ctx.fill();

    // Main body
    ctx.fillStyle = isPlayer ? '#f59e0b' : '#fbbf24';

    ctx.beginPath();
    ctx.roundRect(
      -width / 2,
      -height / 2,
      width,
      height,
      8 * scale
    );
    ctx.fill();

    // Windshield
    ctx.fillStyle = '#0f172a';

    ctx.beginPath();
    ctx.roundRect(
      -width * 0.36,
      -height * 0.31,
      width * 0.72,
      height * 0.27,
      5 * scale
    );
    ctx.fill();

    // Roof
    ctx.fillStyle = '#92400e';

    ctx.fillRect(
      -width * 0.42,
      -height * 0.48,
      width * 0.84,
      height * 0.1
    );

    // Headlights
    ctx.fillStyle = '#fef3c7';

    ctx.fillRect(
      -width * 0.38,
      height * 0.28,
      width * 0.18,
      height * 0.08
    );

    ctx.fillRect(
      width * 0.20,
      height * 0.28,
      width * 0.18,
      height * 0.08
    );

    if (isPlayer) {
      ctx.fillStyle = '#ffffff';
      ctx.font = `bold ${Math.max(9, 11 * scale)}px Arial`;
      ctx.textAlign = 'center';
      ctx.fillText('KANO', 0, height * 0.08);
    }

    ctx.restore();
  }

  drawObstacle(entity) {
    const ctx = this.ctx;

    const x = Number(entity.x || this.width / 2);
    const y = Number(entity.y || this.height * 0.7);

    const scale = Math.max(
      0.35,
      Math.min(1.5, Number(entity.scale || 1))
    );

    const width = 64 * scale;
    const height = 72 * scale;

    ctx.save();
    ctx.translate(x, y);

    if (entity.type === 'police') {
      // Police vehicle
      ctx.fillStyle = '#1e40af';

      ctx.beginPath();
      ctx.roundRect(
        -width / 2,
        -height / 2,
        width,
        height,
        7 * scale
      );
      ctx.fill();

      ctx.fillStyle = '#3b82f6';
      ctx.fillRect(
        -width * 0.16,
        -height * 0.58,
        width * 0.32,
        height * 0.14
      );

      ctx.fillStyle = '#93c5fd';
      ctx.fillRect(
        -width * 0.34,
        -height * 0.27,
        width * 0.68,
        height * 0.23
      );

      // Blue/red emergency lights
      ctx.fillStyle = '#ef4444';
      ctx.fillRect(
        -width * 0.22,
        -height * 0.57,
        width * 0.14,
        height * 0.08
      );

      ctx.fillStyle = '#3b82f6';
      ctx.fillRect(
        width * 0.08,
        -height * 0.57,
        width * 0.14,
        height * 0.08
      );
    } else if (entity.type === 'karota') {
      // KAROTA enforcement vehicle
      ctx.fillStyle = '#f59e0b';

      ctx.beginPath();
      ctx.roundRect(
        -width / 2,
        -height / 2,
        width,
        height,
        7 * scale
      );
      ctx.fill();

      ctx.fillStyle = '#111827';
      ctx.fillRect(
        -width * 0.34,
        -height * 0.27,
        width * 0.68,
        height * 0.23
      );

      ctx.fillStyle = '#ef4444';

      ctx.fillRect(
        -width * 0.22,
        height * 0.28,
        width * 0.14,
        height * 0.08
      );

      ctx.fillRect(
        width * 0.08,
        height * 0.28,
        width * 0.14,
        height * 0.08
      );

      ctx.fillStyle = '#111827';
      ctx.font = `bold ${Math.max(8, 10 * scale)}px Arial`;
      ctx.textAlign = 'center';
      ctx.fillText('KAROTA', 0, height * 0.08);
    } else {
      // Regular traffic car
      ctx.fillStyle = '#dc2626';

      ctx.beginPath();
      ctx.roundRect(
        -width / 2,
        -height / 2,
        width,
        height,
        7 * scale
      );
      ctx.fill();

      ctx.fillStyle = '#fca5a5';

      ctx.fillRect(
        -width * 0.34,
        -height * 0.27,
        width * 0.68,
        height * 0.23
      );

      ctx.fillStyle = '#fef2f2';

      ctx.fillRect(
        -width * 0.36,
        height * 0.28,
        width * 0.16,
        height * 0.08
      );

      ctx.fillRect(
        width * 0.20,
        height * 0.28,
        width * 0.16,
        height * 0.08
      );
    }

    // Wheels
    ctx.fillStyle = '#111827';

    ctx.beginPath();
    ctx.arc(
      -width * 0.36,
      height * 0.28,
      width * 0.12,
      0,
      Math.PI * 2
    );
    ctx.fill();

    ctx.beginPath();
    ctx.arc(
      width * 0.36,
      height * 0.28,
      width * 0.12,
      0,
      Math.PI * 2
    );
    ctx.fill();

    ctx.restore();
  }

  drawZone(entity) {
    const ctx = this.ctx;

    const x = Number(entity.x || this.width / 2);
    const y = Number(entity.y || this.height * 0.6);

    ctx.save();

    ctx.strokeStyle = 'rgba(251,191,36,0.45)';
    ctx.lineWidth = 3;

    ctx.beginPath();
    ctx.arc(
      x,
      y,
      Math.max(20, Number(entity.radius || 35)),
      0,
      Math.PI * 2
    );
    ctx.stroke();

    ctx.restore();
  }

  drawCoin(entity) {
    const ctx = this.ctx;

    const x = Number(entity.x || this.width / 2);
    const y = Number(entity.y || this.height * 0.7);

    const radius = Math.max(
      5,
      Number(entity.radius || 10)
    );

    ctx.save();

    ctx.fillStyle = '#fbbf24';

    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = '#92400e';
    ctx.lineWidth = 2;
    ctx.stroke();

    ctx.fillStyle = '#78350f';
    ctx.font = `bold ${Math.max(8, radius)}px Arial`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('₦', x, y);

    ctx.restore();

    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
  }

  drawParticles() {
    const ctx = this.ctx;
    const particles = this.game.particles || [];

    for (const particle of particles) {
      if (!particle) {
        continue;
      }

      const x = Number(particle.x || 0);
      const y = Number(particle.y || 0);
      const size = Math.max(1, Number(particle.size || 2));
      const alpha =
        particle.alpha === undefined
          ? 1
          : Math.max(0, Math.min(1, Number(particle.alpha)));

      ctx.fillStyle = `rgba(255,255,255,${alpha})`;
      ctx.fillRect(x, y, size, size);
    }
  }

  drawSpeedHUD() {
    const ctx = this.ctx;
    const w = this.width;

    const speed = Math.round(Number(this.game.speed || 0));
    const score = Math.round(Number(this.game.score || 0));

    ctx.save();

    ctx.fillStyle = 'rgba(15,23,42,0.75)';
    ctx.fillRect(14, 14, Math.min(230, w - 28), 66);

    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 16px Arial';
    ctx.textAlign = 'left';

    ctx.fillText(`Speed: ${speed}`, 28, 39);
    ctx.fillText(`Score: ${score}`, 28, 62);

    ctx.restore();
  }
}
```
