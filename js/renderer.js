// Kano Run — Asset-based 2D renderer
// Uses the repository's actual asset keys and preserves the existing Game contracts.

import { CONFIG, STATE } from './config.js';
import { Assets } from './assets.js';

export class Renderer {
  constructor(game) {
    this.game = game;
    this.ctx = game.ctx;

    this.roadsideObjects = [
      'shop',
      'house',
      'market',
      'mosque',
      'school',
      'petrol',
      'busStop',
      'streetLight'
    ];

    this.pedestrians = ['ped1', 'ped2', 'ped3'];
  }

  // ---------------------------------------------------------------------------
  // Main render
  // ---------------------------------------------------------------------------

  draw() {
    const g = this.game;
    const ctx = this.ctx;

    if (!g || !ctx) return;

    const w = g.canvas.clientWidth;
    const h = g.canvas.clientHeight;

    if (!w || !h) return;

    let shakeX = 0;
    let shakeY = 0;

    if (g.shake > 0) {
      const strength = Math.max(0, g.shakeMag || 0);
      shakeX = (Math.random() - 0.5) * strength;
      shakeY = (Math.random() - 0.5) * strength;
    }

    ctx.save();
    ctx.translate(shakeX, shakeY);

    this.drawSky();
    this.drawCityscape();
    this.drawRoad();
    this.drawRoadsideWorld();
    this.drawRoadCondition();
    this.drawBillboards();
    this.drawSpeedLines();

    this.drawEntities();
    this.drawParticles();

    if (g.state === STATE.PLAY || g.state === STATE.OVER) {
      this.drawKeke(
        g.playerX,
        g.playerY,
        true,
        CONFIG.PAINTS[g.currentPaint] || CONFIG.PAINTS.classic,
        g.paxOnBoard,
        g.inv > 0
      );
    }

    if (g.state === STATE.OVER) {
      this.drawCrashEffect();
    }

    if (g.state === STATE.PLAY) {
      this.drawSpeedHUD();
    }

    ctx.restore();
  }

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  getSize() {
    return {
      w: this.game.canvas.clientWidth,
      h: this.game.canvas.clientHeight
    };
  }

  getImage(key) {
    return Assets.get(key);
  }

  drawImageContained(img, x, y, maxW, maxH, options = {}) {
    if (!img) return false;

    const naturalW = img.naturalWidth || img.width || 1;
    const naturalH = img.naturalHeight || img.height || 1;

    const ratio = Math.min(
      maxW / naturalW,
      maxH / naturalH
    );

    const dw = naturalW * ratio;
    const dh = naturalH * ratio;

    const anchor = options.anchor || 'center';

    let dx = x - dw / 2;
    let dy = y - dh / 2;

    if (anchor === 'bottom') {
      dy = y - dh;
    } else if (anchor === 'top') {
      dy = y;
    } else if (anchor === 'left') {
      dx = x;
    } else if (anchor === 'right') {
      dx = x - dw;
    }

    this.ctx.drawImage(img, dx, dy, dw, dh);

    return {
      x: dx,
      y: dy,
      w: dw,
      h: dh
    };
  }

  drawSprite(key, x, y, maxW, maxH, options = {}) {
    const img = this.getImage(key);

    if (!img) return false;

    return this.drawImageContained(
      img,
      x,
      y,
      maxW,
      maxH,
      options
    );
  }

  // ---------------------------------------------------------------------------
  // Sky / atmosphere
  // ---------------------------------------------------------------------------

  drawSky() {
    const g = this.game;
    const ctx = this.ctx;
    const { w, h } = this.getSize();

    const tod = g.getTimeOfDay();

    const sky = ctx.createLinearGradient(
      0,
      0,
      0,
      h * 0.44
    );

    if (tod < 0.18) {
      sky.addColorStop(0, '#0369a1');
      sky.addColorStop(0.45, '#0ea5e9');
      sky.addColorStop(1, '#bae6fd');
    } else if (tod < 0.35) {
      sky.addColorStop(0, '#0284c7');
      sky.addColorStop(0.5, '#38bdf8');
      sky.addColorStop(1, '#fde68a');
    } else if (tod < 0.52) {
      sky.addColorStop(0, '#312e81');
      sky.addColorStop(0.5, '#7c3aed');
      sky.addColorStop(1, '#f59e0b');
    } else {
      sky.addColorStop(0, '#020617');
      sky.addColorStop(0.55, '#0f172a');
      sky.addColorStop(1, '#1e1b4b');
    }

    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, w, h * 0.46);

    // Sun
    if (tod < 0.4) {
      const sx = w * 0.78;
      const sy = h * 0.12;

      const glow = ctx.createRadialGradient(
        sx,
        sy,
        3,
        sx,
        sy,
        70
      );

      glow.addColorStop(
        0,
        'rgba(255,238,130,0.95)'
      );
      glow.addColorStop(
        0.35,
        'rgba(253,224,71,0.3)'
      );
      glow.addColorStop(
        1,
        'rgba(253,224,71,0)'
      );

      ctx.fillStyle = glow;
      ctx.beginPath();
      ctx.arc(sx, sy, 70, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = '#fde047';
      ctx.beginPath();
      ctx.arc(sx, sy, 15, 0, Math.PI * 2);
      ctx.fill();
    }

    // Moon
    if (tod > 0.5) {
      const mx = w * 0.8;
      const my = h * 0.1;

      ctx.fillStyle = 'rgba(248,250,252,0.92)';
      ctx.beginPath();
      ctx.arc(mx, my, 13, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = 'rgba(248,250,252,0.08)';
      ctx.beginPath();
      ctx.arc(mx, my, 30, 0, Math.PI * 2);
      ctx.fill();

      // Stars
      ctx.fillStyle = `rgba(255,255,255,${Math.min(
        0.85,
        (tod - 0.5) * 2
      )})`;

      for (let i = 0; i < 60; i++) {
        const sx = (i * 83 + 37) % w;
        const sy = (i * 47 + 17) % Math.max(1, h * 0.3);
        const radius = 0.6 + (i % 3) * 0.45;

        ctx.beginPath();
        ctx.arc(sx, sy, radius, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // Harmattan / haze
    if (g.weather === 'dust') {
      const haze = ctx.createLinearGradient(
        0,
        0,
        0,
        h * 0.48
      );

      haze.addColorStop(
        0,
        'rgba(180,150,105,0.18)'
      );
      haze.addColorStop(
        1,
        'rgba(212,185,140,0.06)'
      );

      ctx.fillStyle = haze;
      ctx.fillRect(0, 0, w, h * 0.48);
    }

    if (g.weather === 'haze') {
      ctx.fillStyle = 'rgba(148,163,184,0.13)';
      ctx.fillRect(0, 0, w, h * 0.45);
    }
  }

  // ---------------------------------------------------------------------------
  // Distant Kano city
  // ---------------------------------------------------------------------------

  drawCityscape() {
    const g = this.game;
    const ctx = this.ctx;
    const { w, h } = this.getSize();

    const tod = g.getTimeOfDay();
    const horizon = h * 0.34;

    // Distant terrain
    ctx.fillStyle =
      tod > 0.5
        ? 'rgba(15,23,42,0.9)'
        : 'rgba(51,65,85,0.55)';

    ctx.beginPath();
    ctx.moveTo(0, horizon);

    for (let i = 0; i <= 14; i++) {
      const x = (i / 14) * w;
      const y =
        horizon -
        16 -
        Math.sin(i * 0.85 + g.roadOff * 0.012) * 11 -
        (i % 3) * 7;

      ctx.lineTo(x, y);
    }

    ctx.lineTo(w, horizon);
    ctx.closePath();
    ctx.fill();

    // Distant buildings
    for (let i = 0; i < 20; i++) {
      const bw = 25 + (i % 5) * 9;
      const bh =
        28 +
        (i % 6) * 15 +
        (i % 3) * 6;

      const spacing = 54;

      const bx =
        ((i * spacing +
          g.roadOff * 0.18) %
          (w + 90)) -
        45;

      const by = horizon - bh;

      const shade =
        tod > 0.5
          ? 18 + (i % 4) * 6
          : 46 + (i % 5) * 9;

      ctx.fillStyle =
        `rgb(${shade},${shade + 7},${shade + 15})`;

      ctx.fillRect(
        bx,
        by,
        bw,
        bh
      );

      ctx.fillStyle =
        tod > 0.5
          ? '#1e293b'
          : '#475569';

      ctx.fillRect(
        bx - 2,
        by - 3,
        bw + 4,
        4
      );

      // Windows
      ctx.fillStyle =
        tod > 0.48
          ? 'rgba(253,224,71,0.42)'
          : 'rgba(15,23,42,0.28)';

      for (let wy = 8; wy < bh - 8; wy += 13) {
        for (let wx = 6; wx < bw - 7; wx += 12) {
          if ((i + wx + wy) % 3 !== 0) {
            ctx.fillRect(
              bx + wx,
              by + wy,
              5,
              6
            );
          }
        }
      }

      // Mosque-like silhouette
      if (i % 7 === 0) {
        ctx.fillStyle =
          tod > 0.5
            ? '#334155'
            : '#64748b';

        ctx.fillRect(
          bx + bw * 0.42,
          by - 20,
          bw * 0.18,
          20
        );

        ctx.beginPath();
        ctx.moveTo(
          bx + bw * 0.35,
          by - 20
        );
        ctx.lineTo(
          bx + bw * 0.51,
          by - 31
        );
        ctx.lineTo(
          bx + bw * 0.67,
          by - 20
        );
        ctx.closePath();
        ctx.fill();
      }
    }

    // Horizon glow
    const glow = ctx.createLinearGradient(
      0,
      horizon - 50,
      0,
      horizon + 30
    );

    glow.addColorStop(
      0,
      'rgba(255,255,255,0)'
    );
    glow.addColorStop(
      0.65,
      'rgba(255,255,255,0.05)'
    );
    glow.addColorStop(
      1,
      'rgba(255,255,255,0)'
    );

    ctx.fillStyle = glow;
    ctx.fillRect(
      0,
      horizon - 50,
      w,
      80
    );
  }

  // ---------------------------------------------------------------------------
  // Road
  // ---------------------------------------------------------------------------

  drawRoad() {
    const g = this.game;
    const ctx = this.ctx;
    const { w, h } = this.getSize();

    const tod = g.getTimeOfDay();
    const horizon = h * 0.34;

    // Road-side ground
    const ground = ctx.createLinearGradient(
      0,
      horizon,
      0,
      h
    );

    if (tod > 0.5) {
      ground.addColorStop(0, '#172033');
      ground.addColorStop(1, '#07101c');
    } else {
      ground.addColorStop(0, '#a78b5b');
      ground.addColorStop(0.4, '#735f40');
      ground.addColorStop(1, '#403625');
    }

    ctx.fillStyle = ground;
    ctx.fillRect(
      0,
      horizon,
      w,
      h - horizon
    );

    // Road
    const road = ctx.createLinearGradient(
      0,
      horizon,
      0,
      h
    );

    if (tod > 0.5) {
      road.addColorStop(0, '#334155');
      road.addColorStop(0.5, '#172033');
      road.addColorStop(1, '#080d16');
    } else {
      road.addColorStop(0, '#64748b');
      road.addColorStop(0.5, '#475569');
      road.addColorStop(1, '#293241');
    }

    ctx.fillStyle = road;
    ctx.fillRect(
      0,
      horizon,
      w,
      h - horizon
    );

    // Road shoulders
    ctx.fillStyle =
      tod > 0.5
        ? '#334155'
        : '#8b7350';

    ctx.fillRect(
      0,
      horizon,
      16,
      h - horizon
    );

    ctx.fillRect(
      w - 16,
      horizon,
      16,
      h - horizon
    );

    // Yellow road edges
    ctx.strokeStyle =
      tod > 0.5
        ? '#a16207'
        : '#eab308';

    ctx.lineWidth = 4;

    ctx.beginPath();
    ctx.moveTo(17, horizon);
    ctx.lineTo(17, h);

    ctx.moveTo(w - 17, horizon);
    ctx.lineTo(w - 17, h);

    ctx.stroke();

    // Lane markings
    ctx.strokeStyle =
      tod > 0.5
        ? 'rgba(250,204,21,0.65)'
        : 'rgba(255,255,255,0.72)';

    ctx.lineWidth = 3;

    ctx.setLineDash([
      18,
      18
    ]);

    ctx.lineDashOffset = -g.roadOff;

    for (let i = 1; i < 3; i++) {
      const x = g.laneX(i - 0.5);

      ctx.beginPath();
      ctx.moveTo(x, horizon);
      ctx.lineTo(x, h);
      ctx.stroke();
    }

    ctx.setLineDash([]);

    // Moving road texture
    ctx.globalAlpha = 0.08;
    ctx.fillStyle = '#f8fafc';

    for (let i = 0; i < 10; i++) {
      const x =
        (i * 91 +
          g.roadOff * 0.35) %
        w;

      const y =
        horizon +
        90 +
        ((i * 117 +
          g.roadOff * 1.8) %
          Math.max(100, h - horizon - 90));

      ctx.fillRect(
        x,
        y,
        2,
        10 + (i % 3) * 5
      );
    }

    ctx.globalAlpha = 1;

    // Central road sheen
    const sheen = ctx.createLinearGradient(
      w * 0.25,
      horizon,
      w * 0.75,
      h
    );

    sheen.addColorStop(
      0,
      'rgba(255,255,255,0)'
    );
    sheen.addColorStop(
      0.5,
      'rgba(255,255,255,0.045)'
    );
    sheen.addColorStop(
      1,
      'rgba(255,255,255,0)'
    );

    ctx.fillStyle = sheen;
    ctx.fillRect(
      20,
      horizon,
      w - 40,
      h - horizon
    );
  }

  // ---------------------------------------------------------------------------
  // Roadside asset world
  // ---------------------------------------------------------------------------

  drawRoadsideWorld() {
    const g = this.game;
    const ctx = this.ctx;
    const { w, h } = this.getSize();

    const horizon = h * 0.35;

    // Sidewalk / dirt strips
    ctx.fillStyle =
      g.getTimeOfDay() > 0.5
        ? 'rgba(15,23,42,0.58)'
        : 'rgba(120,90,52,0.52)';

    ctx.fillRect(
      0,
      horizon,
      52,
      h - horizon
    );

    ctx.fillRect(
      w - 52,
      horizon,
      52,
      h - horizon
    );

    const travel =
      g.frame *
      (0.72 + Math.min(1.4, g.speed * 0.055));

    const cycle =
      Math.max(420, h * 0.78);

    // Buildings / shops / public places
    for (let i = 0; i < 12; i++) {
      const side = i % 2 === 0 ? -1 : 1;

      const y =
        horizon +
        55 +
        ((travel + i * 125) % cycle);

      if (y > h + 80) continue;

      const depth =
        0.48 +
        ((y - horizon) /
          Math.max(1, h - horizon)) *
        0.58;

      const maxW =
        42 +
        depth * 45;

      const maxH =
        55 +
        depth * 80;

      const key =
        this.roadsideObjects[
          (i +
            Math.floor(g.dist * 2)) %
          this.roadsideObjects.length
        ];

      const x =
        side < 0
          ? 30
          : w - 30;

      ctx.save();

      ctx.globalAlpha =
        Math.min(
          1,
          0.35 + depth * 0.7
        );

      this.drawSprite(
        key,
        x,
        y,
        maxW,
        maxH,
        {
          anchor: 'bottom'
        }
      );

      ctx.restore();
    }

    // Street lights
    for (let i = 0; i < 7; i++) {
      const side =
        i % 2 === 0 ? -1 : 1;

      const y =
        horizon +
        25 +
        ((travel * 0.9 +
          i * 170) %
          cycle);

      if (y > h + 50) continue;

      const depth =
        0.5 +
        ((y - horizon) /
          Math.max(1, h - horizon)) *
        0.65;

      const x =
        side < 0
          ? 48
          : w - 48;

      ctx.save();

      ctx.globalAlpha =
        0.35 + depth * 0.65;

      this.drawSprite(
        'streetLight',
        x,
        y,
        24 + depth * 28,
        90 + depth * 100,
        {
          anchor: 'bottom'
        }
      );

      ctx.restore();
    }

    // Pedestrians
    for (let i = 0; i < 8; i++) {
      const side =
        i % 2 === 0 ? -1 : 1;

      const y =
        horizon +
        90 +
        ((travel * 1.1 +
          i * 155) %
          cycle);

      if (y > h + 40) continue;

      const depth =
        0.45 +
        ((y - horizon) /
          Math.max(1, h - horizon)) *
        0.55;

      const key =
        this.pedestrians[
          i % this.pedestrians.length
        ];

      const x =
        side < 0
          ? 50
          : w - 50;

      ctx.save();

      ctx.globalAlpha =
        0.4 + depth * 0.6;

      this.drawSprite(
        key,
        x,
        y,
        18 + depth * 18,
        38 + depth * 38,
        {
          anchor: 'bottom'
        }
      );

      ctx.restore();
    }

    // A few roadside markers / posts
    ctx.fillStyle =
      g.getTimeOfDay() > 0.5
        ? 'rgba(148,163,184,0.18)'
        : 'rgba(120,90,52,0.3)';

    for (let i = 0; i < 16; i++) {
      const side =
        i % 2 === 0 ? -1 : 1;

      const y =
        horizon +
        20 +
        ((travel * 1.4 +
          i * 83) %
          cycle);

      const x =
        side < 0
          ? 58
          : w - 58;

      ctx.fillRect(
        x,
        y,
        4,
        12
      );
    }
  }

  // ---------------------------------------------------------------------------
  // Road condition
  // ---------------------------------------------------------------------------

  drawRoadCondition() {
    const g = this.game;
    const ctx = this.ctx;
    const { w, h } = this.getSize();

    if (
      g.roadCondition === 'normal' ||
      g.mudTimer <= 0
    ) {
      return;
    }

    if (g.roadCondition === 'muddy') {
      ctx.fillStyle =
        'rgba(120,80,40,0.18)';

      ctx.fillRect(
        18,
        h * 0.38,
        w - 36,
        h * 0.62
      );

      for (let i = 0; i < 9; i++) {
        const x =
          (i * 71 +
            g.roadOff * 0.65) %
            (w + 80) -
          40;

        const y =
          h * 0.55 +
          (i % 4) * 58;

        ctx.fillStyle =
          'rgba(74,49,24,0.28)';

        ctx.beginPath();
        ctx.ellipse(
          x,
          y,
          30 + (i % 3) * 9,
          7 + (i % 2) * 3,
          0,
          0,
          Math.PI * 2
        );
        ctx.fill();
      }
    }

    if (g.roadCondition === 'bad') {
      ctx.fillStyle =
        'rgba(15,23,42,0.13)';

      for (let i = 0; i < 11; i++) {
        const x =
          (i * 53 +
            g.roadOff * 0.4) %
            w;

        const y =
          h * 0.43 +
          ((i * 91 +
            g.roadOff * 1.5) %
            Math.max(100, h * 0.53));

        ctx.fillRect(
          x,
          y,
          18 + (i % 3) * 12,
          3
        );
      }
    }
  }

  // ---------------------------------------------------------------------------
  // Billboard assets
  // ---------------------------------------------------------------------------

  drawBillboards() {
    const g = this.game;
    const ctx = this.ctx;
    const { w, h } = this.getSize();

    const billboards =
      (CONFIG.BILLBOARDS || [])
        .filter(b => b.active);

    if (!billboards.length) return;

    const travel =
      g.frame *
      (0.42 + g.speed * 0.025);

    const cycle =
      Math.max(360, h * 0.68);

    for (let i = 0; i < 3; i++) {
      const y =
        h * 0.34 +
        ((travel + i * 210) % cycle);

      if (y < h * 0.35 || y > h + 90) {
        continue;
      }

      const side =
        i % 2 === 0 ? -1 : 1;

      const x =
        side < 0
          ? 43
          : w - 43;

      const depth =
        0.5 +
        ((y - h * 0.34) /
          Math.max(1, h * 0.66)) *
        0.5;

      const maxW =
        70 + depth * 45;

      const maxH =
        55 + depth * 45;

      const board =
        billboards[
          (i +
            Math.floor(g.dist)) %
          billboards.length
        ];

      ctx.save();

      ctx.globalAlpha =
        0.55 + depth * 0.45;

      const asset =
        this.getImage('billboard');

      if (asset) {
        this.drawImageContained(
          asset,
          x,
          y,
          maxW,
          maxH,
          {
            anchor: 'bottom'
          }
        );

        // Brand strip beneath the actual asset.
        ctx.fillStyle =
          board.color || '#eab308';

        const labelW =
          Math.min(
            100,
            48 + depth * 45
          );

        ctx.beginPath();
        ctx.roundRect(
          x - labelW / 2,
          y + 3,
          labelW,
          16,
          5
        );
        ctx.fill();

        ctx.fillStyle = '#0f172a';
        ctx.font =
          '700 7px system-ui, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(
          String(
            board.brand ||
            board.text ||
            ''
          ).slice(0, 19),
          x,
          y + 14
        );
      } else {
        ctx.fillStyle =
          board.color || '#eab308';

        ctx.fillRect(
          x - 44,
          y - 32,
          88,
          34
        );

        ctx.fillStyle = '#0f172a';
        ctx.font =
          'bold 9px system-ui';

        ctx.textAlign = 'center';

        ctx.fillText(
          String(
            board.brand ||
            board.text ||
            'KANO'
          ).slice(0, 18),
          x,
          y - 11
        );
      }

      ctx.restore();
    }
  }

  // ---------------------------------------------------------------------------
  // Speed effects
  // ---------------------------------------------------------------------------

  drawSpeedLines() {
    const g = this.game;
    const ctx = this.ctx;
    const { w, h } = this.getSize();

    if (
      g.state !== STATE.PLAY ||
      g.speed < 7.4
    ) {
      return;
    }

    const intensity =
      Math.min(
        1,
        (g.speed - 7.4) / 5
      );

    const sprite =
      this.getImage('speedLines');

    if (sprite) {
      ctx.save();

      ctx.globalAlpha =
        0.14 +
        intensity * 0.25;

      const pulse =
        1 +
        Math.sin(g.frame * 0.35) *
        0.04;

      ctx.translate(
        w / 2,
        h * 0.53
      );

      ctx.scale(
        pulse,
        pulse
      );

      ctx.drawImage(
        sprite,
        -w * 0.38,
        -h * 0.26,
        w * 0.76,
        h * 0.52
      );

      ctx.restore();
    }

    // Additional edge streaks
    ctx.save();

    ctx.strokeStyle =
      `rgba(255,255,255,${0.05 + intensity * 0.13})`;

    ctx.lineWidth = 1.5;

    for (
      let i = 0;
      i < 8 + Math.floor(intensity * 8);
      i++
    ) {
      const x =
        (i * 93 +
          g.frame * 17) %
          (w + 60) -
        30;

      const y =
        h * 0.18 +
        ((i * 79) %
          Math.max(1, h * 0.62));

      const len =
        15 +
        intensity * 35;

      ctx.beginPath();

      ctx.moveTo(
        x,
        y
      );

      ctx.lineTo(
        x - len,
        y + len * 0.18
      );

      ctx.stroke();
    }

    ctx.restore();
  }

  // ---------------------------------------------------------------------------
  // Player Keke
  // ---------------------------------------------------------------------------

  drawKeke(
    x,
    y,
    isPlayer,
    paint,
    paxCount = 0,
    invuln = false
  ) {
    const g = this.game;
    const ctx = this.ctx;

    const p =
      paint ||
      CONFIG.PAINTS.classic;

    ctx.save();

    let bounce = 0;

    if (isPlayer && g.bounce > 0) {
      bounce =
        Math.sin(
          g.bounce * 0.85
        ) * 3.5;
    }

    const steering =
      isPlayer
        ? (g.targetX - g.playerX)
        : 0;

    let spriteKey = 'player';

    if (isPlayer) {
      if (steering < -2) {
        spriteKey = 'playerLeft';
      } else if (steering > 2) {
        spriteKey = 'playerRight';
      }

      if (
        invuln &&
        g.frame % 12 < 5
      ) {
        ctx.globalAlpha = 0.48;
      }
    }

    ctx.translate(
      x,
      y + bounce
    );

    if (isPlayer) {
      const sprite =
        this.getImage(spriteKey) ||
        this.getImage('player');

      if (sprite) {
        const tilt =
          Math.max(
            -0.045,
            Math.min(
              0.045,
              steering * 0.0014
            )
          );

        ctx.rotate(tilt);

        // The repository sprite is taller than it is wide.
        // Preserve its natural aspect ratio and move its visual
        // bottom toward the mobile control area without changing
        // Game.playerY or collision coordinates.
        const playerBottom = 60;

        this.drawImageContained(
          sprite,
          0,
          playerBottom,
          158,
          174,
          {
            anchor: 'bottom'
          }
        );

        // Player shadow
        ctx.globalAlpha =
          invuln
            ? 0.16
            : 0.28;

        ctx.fillStyle =
          '#020617';

        ctx.beginPath();

        ctx.ellipse(
          0,
          playerBottom + 2,
          54,
          10,
          0,
          0,
          Math.PI * 2
        );

        ctx.fill();

        ctx.globalAlpha =
          invuln
            ? 0.48
            : 1;

        // Passenger indicators remain above the actual vehicle.
        if (paxCount > 0) {
          const passengerColors = [
            '#fcd34d',
            '#f9a8d4',
            '#93c5fd',
            '#86efac',
            '#c4b5fd'
          ];

          for (
            let i = 0;
            i < Math.min(paxCount, 5);
            i++
          ) {
            const px =
              -22 +
              i * 11;

            ctx.fillStyle =
              passengerColors[
                i %
                passengerColors.length
              ];

            ctx.beginPath();

            ctx.arc(
              px,
              -9,
              5,
              0,
              Math.PI * 2
            );

            ctx.fill();
          }
        }

        ctx.restore();
        return;
      }
    }

    // -----------------------------------------------------------------------
    // Fallback canvas Keke
    // -----------------------------------------------------------------------

    const wr =
      g.wheelRot || 0;

    // Shadow
    ctx.fillStyle =
      'rgba(0,0,0,0.3)';

    ctx.beginPath();

    ctx.ellipse(
      0,
      44,
      37,
      11,
      0,
      0,
      Math.PI * 2
    );

    ctx.fill();

    // Rear wheels
    for (
      const side of [-24, 24]
    ) {
      ctx.fillStyle =
        '#0f172a';

      ctx.beginPath();

      ctx.arc(
        side,
        32,
        13,
        0,
        Math.PI * 2
      );

      ctx.fill();

      ctx.strokeStyle =
        '#64748b';

      ctx.lineWidth = 2;

      ctx.stroke();

      ctx.strokeStyle =
        '#cbd5e1';

      ctx.lineWidth = 1.5;

      ctx.beginPath();

      ctx.arc(
        side,
        32,
        6,
        wr,
        wr + Math.PI
      );

      ctx.stroke();
    }

    const body =
      isPlayer
        ? p.body
        : '#fbbf24';

    const roof =
      isPlayer
        ? p.roof
        : '#fde047';

    const accent =
      isPlayer
        ? p.accent
        : '#ca8a04';

    // Body
    ctx.fillStyle = body;

    ctx.beginPath();

    ctx.roundRect(
      -30,
      -40,
      60,
      64,
      10
    );

    ctx.fill();

    // Highlight
    ctx.fillStyle =
      'rgba(255,255,255,0.1)';

    ctx.fillRect(
      -26,
      -36,
      12,
      50
    );

    // Accent stripe
    ctx.fillStyle = accent;

    ctx.fillRect(
      -30,
      4,
      60,
      6
    );

    // Canopy
    ctx.fillStyle = roof;

    ctx.beginPath();

    ctx.roundRect(
      -32,
      -52,
      64,
      20,
      8
    );

    ctx.fill();

    ctx.fillStyle =
      'rgba(255,255,255,0.18)';

    ctx.fillRect(
      -28,
      -48,
      56,
      5
    );

    // Windshield
    ctx.fillStyle =
      '#0f172a';

    ctx.beginPath();

    ctx.roundRect(
      -24,
      -28,
      48,
      17,
      5
    );

    ctx.fill();

    // Windows
    ctx.fillStyle =
      'rgba(148,163,184,0.3)';

    ctx.beginPath();

    ctx.roundRect(
      -26,
      -12,
      17,
      22,
      3
    );

    ctx.fill();

    ctx.beginPath();

    ctx.roundRect(
      9,
      -12,
      17,
      22,
      3
    );

    ctx.fill();

    // Front wheel
    ctx.fillStyle =
      '#0f172a';

    ctx.beginPath();

    ctx.arc(
      0,
      36,
      12,
      0,
      Math.PI * 2
    );

    ctx.fill();

    ctx.strokeStyle =
      '#64748b';

    ctx.lineWidth = 2;

    ctx.stroke();

    ctx.strokeStyle =
      '#cbd5e1';

    ctx.beginPath();

    ctx.arc(
      0,
      36,
      5,
      wr,
      wr + Math.PI
    );

    ctx.stroke();

    // Headlights
    if (g.getTimeOfDay() > 0.48) {
      ctx.fillStyle =
        '#fde047';

      ctx.beginPath();

      ctx.arc(
        -15,
        -32,
        5,
        0,
        Math.PI * 2
      );

      ctx.arc(
        15,
        -32,
        5,
        0,
        Math.PI * 2
      );

      ctx.fill();
    }

    // Passenger indicators
    if (
      isPlayer &&
      paxCount > 0
    ) {
      const colors = [
        '#fcd34d',
        '#f9a8d4',
        '#93c5fd',
        '#86efac',
        '#c4b5fd'
      ];

      for (
        let i = 0;
        i < Math.min(paxCount, 5);
        i++
      ) {
        const px =
          -18 +
          i * 12;

        ctx.fillStyle =
          colors[
            i % colors.length
          ];

        ctx.beginPath();

        ctx.arc(
          px,
          -10,
          6,
          0,
          Math.PI * 2
        );

        ctx.fill();

        ctx.fillStyle =
          '#334155';

        ctx.beginPath();

        ctx.roundRect(
          px - 5,
          -4,
          10,
          15,
          3
        );

        ctx.fill();
      }
    }

    ctx.restore();
  }

  // ---------------------------------------------------------------------------
  // Entities
  // ---------------------------------------------------------------------------

  drawEntities() {
    const g = this.game;

    const entities = [
      ...g.obs.map(o => ({
        type: 'obstacle',
        y: o.y,
        data: o
      })),

      ...g.paxZones.map(p => ({
        type: 'passenger',
        y: p.y,
        data: p
      })),

      ...g.dropZones.map(d => ({
        type: 'drop',
        y: d.y,
        data: d
      })),

      ...g.coins.map(c => ({
        type: 'coin',
        y: c.y,
        data: c
      }))
    ];

    entities.sort(
      (a, b) => a.y - b.y
    );

    for (const entity of entities) {
      if (
        entity.type === 'obstacle'
      ) {
        this.drawObstacle(
          entity.data
        );
      } else if (
        entity.type === 'passenger' &&
        !entity.data.taken
      ) {
        const p =
          entity.data;

        if (p.aishat) {
          this.drawZone(
            p,
            '#f472b6',
            'AISHAT'
          );
        } else if (p.vip) {
          this.drawZone(
            p,
            '#fbbf24',
            'VIP'
          );
        } else {
          const color =
            p.pType?.color ||
            '#4ade80';

          const label =
            p.pType?.label ||
            'PICK';

          this.drawZone(
            p,
            color,
            label.slice(0, 7)
          );
        }
      } else if (
        entity.type === 'drop' &&
        !entity.data.used
      ) {
        this.drawZone(
          entity.data,
          '#fbbf24',
          'DROP'
        );
      } else if (
        entity.type === 'coin'
      ) {
        this.drawCoin(
          entity.data
        );
      }
    }
  }

  // ---------------------------------------------------------------------------
  // Traffic
  // ---------------------------------------------------------------------------

  drawObstacle(o) {
    const g = this.game;
    const ctx = this.ctx;

    const x =
      g.laneX(o.lane);

    const bottom =
      o.y + o.h;

    // Enforcers use their exact assets.
    if (
      o.type === 'karota' ||
      o.type === 'police'
    ) {
      const key =
        o.type === 'karota'
          ? 'karota'
          : 'police';

      const sprite =
        this.getImage(key);

      if (sprite) {
        ctx.save();

        ctx.globalAlpha =
          o.isEnforcer
            ? 1
            : 0.95;

        this.drawImageContained(
          sprite,
          x,
          bottom,
          86,
          82,
          {
            anchor: 'bottom'
          }
        );

        // Enforcer glow
        if (o.isEnforcer) {
          ctx.globalAlpha = 0.15;

          ctx.fillStyle =
            o.type === 'karota'
              ? '#f59e0b'
              : '#3b82f6';

          ctx.beginPath();

          ctx.ellipse(
            x,
            bottom - 24,
            43,
            13,
            0,
            0,
            Math.PI * 2
          );

          ctx.fill();
        }

        ctx.restore();
        return;
      }

      this.drawEnforcer(
        x,
        bottom - 32,
        o.type
      );

      return;
    }

    if (o.type === 'keke') {
      const sprite =
        this.getImage('kekeYellow') ||
        this.getImage('kekeBlue');

      if (sprite) {
        ctx.save();

        this.drawImageContained(
          sprite,
          x,
          bottom,
          78,
          86,
          {
            anchor: 'bottom'
          }
        );

        ctx.restore();
        return;
      }

      this.drawKeke(
        x,
        bottom - 40,
        false,
        CONFIG.PAINTS.classic,
        0,
        false
      );

      return;
    }

    if (o.type === 'car') {
      this.drawTrafficCar(
        x,
        bottom,
        o
      );

      return;
    }

    // Existing game uses "cart" for miscellaneous traffic.
    this.drawCart(
      x,
      bottom - 30
    );
  }

  drawTrafficCar(x, bottom, o) {
    const g = this.game;
    const ctx = this.ctx;

    /*
     * Game.js currently spawns generic "car" entities.
     * We use the actual repository traffic pack to make
     * those generic entities visually varied without changing
     * the Game object, collision system, or spawn logic.
     */

    const variants = [
      'car',
      'taxi',
      'bus',
      'motorcycle',
      'truck'
    ];

    const index =
      Math.abs(
        Math.floor(
          (o.y + g.frame * 0.02) / 95
        )
      ) % variants.length;

    const key =
      variants[index];

    const sprite =
      this.getImage(key);

    if (sprite) {
      const isMotorcycle =
        key === 'motorcycle';

      const isLarge =
        key === 'bus' ||
        key === 'truck';

      ctx.save();

      this.drawImageContained(
        sprite,
        x,
        bottom,
        isMotorcycle
          ? 58
          : isLarge
            ? 92
            : 84,
        isMotorcycle
          ? 72
          : isLarge
            ? 72
            : 66,
        {
          anchor: 'bottom'
        }
      );

      ctx.restore();
      return;
    }

    this.drawCar(
      x,
      bottom - 28,
      '#dc2626'
    );
  }

  drawEnforcer(x, y, type) {
    const ctx = this.ctx;

    ctx.save();

    ctx.translate(
      x,
      y
    );

    ctx.fillStyle =
      'rgba(0,0,0,0.28)';

    ctx.beginPath();

    ctx.ellipse(
      0,
      38,
      35,
      10,
      0,
      0,
      Math.PI * 2
    );

    ctx.fill();

    ctx.fillStyle =
      type === 'karota'
        ? '#f59e0b'
        : '#1e40af';

    ctx.beginPath();

    ctx.roundRect(
      -30,
      -32,
      60,
      56,
      8
    );

    ctx.fill();

    ctx.fillStyle =
      '#fff';

    ctx.font =
      'bold 11px system-ui';

    ctx.textAlign =
      'center';

    ctx.fillText(
      type === 'karota'
        ? 'KAROTA'
        : 'POLICE',
      0,
      2
    );

    ctx.fillStyle =
      type === 'karota'
        ? '#ef4444'
        : '#3b82f6';

    ctx.beginPath();

    ctx.arc(
      -15,
      -24,
      5,
      0,
      Math.PI * 2
    );

    ctx.arc(
      15,
      -24,
      5,
      0,
      Math.PI * 2
    );

    ctx.fill();

    ctx.restore();
  }

  drawCar(x, y, color) {
    const ctx = this.ctx;

    ctx.save();

    ctx.translate(
      x,
      y
    );

    ctx.fillStyle =
      'rgba(0,0,0,0.28)';

    ctx.beginPath();

    ctx.ellipse(
      0,
      36,
      36,
      10,
      0,
      0,
      Math.PI * 2
    );

    ctx.fill();

    ctx.fillStyle =
      color;

    ctx.beginPath();

    ctx.roundRect(
      -32,
      -30,
      64,
      54,
      9
    );

    ctx.fill();

    ctx.fillStyle =
      '#0f172a';

    ctx.beginPath();

    ctx.roundRect(
      -26,
      -20,
      52,
      18,
      4
    );

    ctx.fill();

    ctx.fillStyle =
      '#0f172a';

    ctx.beginPath();

    ctx.arc(
      -22,
      30,
      11,
      0,
      Math.PI * 2
    );

    ctx.arc(
      22,
      30,
      11,
      0,
      Math.PI * 2
    );

    ctx.fill();

    ctx.restore();
  }

  drawCart(x, y) {
    const ctx = this.ctx;

    ctx.save();

    ctx.translate(
      x,
      y
    );

    ctx.fillStyle =
      'rgba(0,0,0,0.25)';

    ctx.beginPath();

    ctx.ellipse(
      0,
      32,
      30,
      9,
      0,
      0,
      Math.PI * 2
    );

    ctx.fill();

    ctx.fillStyle =
      '#a16207';

    ctx.beginPath();

    ctx.roundRect(
      -26,
      -16,
      52,
      38,
      5
    );

    ctx.fill();

    ctx.fillStyle =
      '#854d0e';

    ctx.fillRect(
      -30,
      -26,
      60,
      14
    );

    ctx.fillStyle =
      '#22c55e';

    ctx.beginPath();

    ctx.arc(
      -12,
      -10,
      7,
      0,
      Math.PI * 2
    );

    ctx.fill();

    ctx.fillStyle =
      '#ef4444';

    ctx.beginPath();

    ctx.arc(
      10,
      -8,
      6,
      0,
      Math.PI * 2
    );

    ctx.fill();

    ctx.fillStyle =
      '#0f172a';

    ctx.beginPath();

    ctx.arc(
      -18,
      28,
      9,
      0,
      Math.PI * 2
    );

    ctx.arc(
      18,
      28,
      9,
      0,
      Math.PI * 2
    );

    ctx.fill();

    ctx.restore();
  }

  // ---------------------------------------------------------------------------
  // Passenger / drop zones
  // ---------------------------------------------------------------------------

  drawZone(z, color, label) {
    const g = this.game;
    const ctx = this.ctx;

    const x =
      g.laneX(z.lane);

    const pulse =
      1 +
      Math.sin(
        g.frame * 0.11
      ) *
      0.08;

    const baseY =
      z.y + 25;

    ctx.save();

    ctx.translate(
      x,
      baseY
    );

    ctx.scale(
      pulse,
      pulse
    );

    // Outer glow
    ctx.fillStyle =
      `${color}18`;

    ctx.beginPath();

    ctx.arc(
      0,
      0,
      42,
      0,
      Math.PI * 2
    );

    ctx.fill();

    // Ring
    ctx.strokeStyle =
      color;

    ctx.lineWidth = 3;

    ctx.beginPath();

    ctx.arc(
      0,
      0,
      31,
      0,
      Math.PI * 2
    );

    ctx.stroke();

    // Inner ring
    ctx.lineWidth = 1.5;

    ctx.beginPath();

    ctx.arc(
      0,
      0,
      22,
      0,
      Math.PI * 2
    );

    ctx.stroke();

    // Passenger sprite
    if (
      label !== 'DROP'
    ) {
      const passenger =
        this.getImage(
          'passenger'
        );

      if (passenger) {
        ctx.globalAlpha =
          0.95;

        this.drawImageContained(
          passenger,
          0,
          -1,
          30,
          38,
          {
            anchor: 'bottom'
          }
        );
      }
    }

    // Label plate
    ctx.globalAlpha = 0.95;

    ctx.fillStyle =
      color;

    ctx.beginPath();

    ctx.roundRect(
      -27,
      12,
      54,
      15,
      5
    );

    ctx.fill();

    ctx.fillStyle =
      '#0f172a';

    ctx.font =
      '800 7px system-ui, sans-serif';

    ctx.textAlign =
      'center';

    ctx.textBaseline =
      'middle';

    ctx.fillText(
      label,
      0,
      19.5
    );

    ctx.restore();
  }

  // ---------------------------------------------------------------------------
  // Money
  // ---------------------------------------------------------------------------

  drawCoin(c) {
    if (c.taken) return;

    const g = this.game;
    const ctx = this.ctx;

    const x =
      g.laneX(c.lane);

    const bob =
      Math.sin(c.bob) * 5;

    ctx.save();

    ctx.translate(
      x,
      c.y + bob
    );

    ctx.fillStyle =
      'rgba(251,191,36,0.2)';

    ctx.beginPath();

    ctx.arc(
      0,
      0,
      21,
      0,
      Math.PI * 2
    );

    ctx.fill();

    ctx.fillStyle =
      '#fbbf24';

    ctx.beginPath();

    ctx.arc(
      0,
      0,
      14,
      0,
      Math.PI * 2
    );

    ctx.fill();

    ctx.fillStyle =
      '#ca8a04';

    ctx.beginPath();

    ctx.arc(
      0,
      0,
      10,
      0,
      Math.PI * 2
    );

    ctx.fill();

    ctx.fillStyle =
      '#fbbf24';

    ctx.font =
      'bold 13px system-ui';

    ctx.textAlign =
      'center';

    ctx.textBaseline =
      'middle';

    ctx.fillText(
      '₦',
      0,
      1
    );

    ctx.restore();
  }

  // ---------------------------------------------------------------------------
  // Particles and effects
  // ---------------------------------------------------------------------------

  drawParticles() {
    const g = this.game;
    const ctx = this.ctx;

    // Generic particles
    for (const p of g.particles) {
      const alpha =
        Math.max(
          0,
          Math.min(
            1,
            p.life / (p.max || 46)
          )
        );

      ctx.globalAlpha =
        alpha;

      ctx.fillStyle =
        p.color ||
        '#fbbf24';

      ctx.beginPath();

      ctx.arc(
        p.x,
        p.y,
        Math.max(
          0.5,
          p.size * alpha
        ),
        0,
        Math.PI * 2
      );

      ctx.fill();
    }

    ctx.globalAlpha = 1;

    // Asset dust
    const dustSprite =
      this.getImage('dust');

    for (const d of g.dust) {
      const alpha =
        Math.max(
          0,
          Math.min(
            1,
            d.life / 30
          )
        );

      if (dustSprite) {
        ctx.save();

        ctx.globalAlpha =
          alpha * 0.5;

        const size =
          16 +
          d.size * 2.8;

        ctx.translate(
          d.x,
          d.y
        );

        ctx.rotate(
          (g.frame % 360) *
          0.02
        );

        ctx.drawImage(
          dustSprite,
          -size / 2,
          -size / 2,
          size,
          size
        );

        ctx.restore();
      } else {
        ctx.globalAlpha =
          alpha * 0.4;

        ctx.fillStyle =
          '#d6c7a1';

        ctx.beginPath();

        ctx.arc(
          d.x,
          d.y,
          d.size * alpha,
          0,
          Math.PI * 2
        );

        ctx.fill();
      }
    }

    ctx.globalAlpha = 1;

    // Weather
    for (
      const particle
      of g.weatherParticles
    ) {
      if (particle.haze) {
        ctx.globalAlpha =
          (particle.life / 80) *
          0.12;

        ctx.fillStyle =
          '#cbd5e1';

        ctx.beginPath();

        ctx.arc(
          particle.x,
          particle.y,
          particle.size,
          0,
          Math.PI * 2
        );

        ctx.fill();
      } else {
        ctx.globalAlpha =
          (particle.life / 70) *
          0.45;

        ctx.fillStyle =
          '#d4d4d8';

        ctx.beginPath();

        ctx.arc(
          particle.x,
          particle.y,
          particle.size,
          0,
          Math.PI * 2
        );

        ctx.fill();
      }
    }

    ctx.globalAlpha = 1;
  }

  drawCrashEffect() {
    const g = this.game;
    const ctx = this.ctx;

    const collision =
      this.getImage('collision');

    if (!collision) return;

    const pulse =
      1 +
      Math.sin(
        g.frame * 0.25
      ) *
      0.08;

    ctx.save();

    ctx.globalAlpha =
      0.75;

    ctx.translate(
      g.playerX,
      g.playerY - 28
    );

    ctx.scale(
      pulse,
      pulse
    );

    ctx.drawImage(
      collision,
      -42,
      -42,
      84,
      84
    );

    ctx.restore();
  }

  // ---------------------------------------------------------------------------
  // Speed HUD
  // ---------------------------------------------------------------------------

  drawSpeedHUD() {
    const g = this.game;
    const ctx = this.ctx;
    const { w } = this.getSize();

    const width = 96;
    const height = 29;

    const x =
      w / 2 -
      width / 2;

    const y = 58;

    ctx.save();

    ctx.fillStyle =
      'rgba(10,15,28,0.78)';

    ctx.beginPath();

    ctx.roundRect(
      x,
      y,
      width,
      height,
      15
    );

    ctx.fill();

    // Speed indicator
    const speedRatio =
      Math.min(
        1,
        Math.max(
          0,
          (g.speed - 3) / 10
        )
      );

    ctx.fillStyle =
      speedRatio > 0.78
        ? '#ef4444'
        : speedRatio > 0.52
          ? '#f59e0b'
          : '#22c55e';

    ctx.beginPath();

    ctx.arc(
      x + 14,
      y + 14.5,
      4,
      0,
      Math.PI * 2
    );

    ctx.fill();

    ctx.fillStyle =
      '#e2e8f0';

    ctx.font =
      '700 11px system-ui, sans-serif';

    ctx.textAlign =
      'center';

    ctx.textBaseline =
      'middle';

    ctx.fillText(
      `${g.speed.toFixed(1)} km/h`,
      w / 2 + 5,
      y + 14.5
    );

    ctx.restore();
  }
}