// Kano Run — Adaidaita Sahu
// Asset-driven Canvas renderer.
// Preserves the existing Game/Config contracts.

import { CONFIG } from './config.js';
import { Assets } from './assets.js';

export class Renderer {
  constructor(game) {
    this.game = game;
    this.ctx = game.ctx;

    this.environmentCycle = [
      'shop',
      'market',
      'house',
      'mosque',
      'school',
      'petrol',
      'busStop'
    ];

    this.trafficKeys = {
      keke: ['kekeYellow', 'kekeBlue'],
      car: ['car'],
      taxi: ['taxi'],
      bus: ['bus'],
      motorcycle: ['motorcycle'],
      truck: ['truck'],
      police: ['police'],
      karota: ['karota'],
      cart: []
    };
  }

  draw() {
    const g = this.game;
    const ctx = this.ctx;

    const w = g.canvas.clientWidth || g.canvas.width;
    const h = g.canvas.clientHeight || g.canvas.height;

    let shakeX = 0;
    let shakeY = 0;

    if (g.shake > 0) {
      const magnitude = g.shakeMag || 4;
      shakeX = (Math.random() - 0.5) * magnitude;
      shakeY = (Math.random() - 0.5) * magnitude;
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

    if (g.state === 1 || g.state === 2 || g.state === 3) {
      this.drawPlayerKeke();
    }

    if (g.state === 1) {
      this.drawSpeedHUD();
      this.drawPlayerEffects();
    }

    this.drawWeatherOverlay();

    ctx.restore();

    // Keep the canvas visually occupied even on unusual aspect ratios.
    if (w > 0 && h > 0) {
      this.drawEdgeVignette();
    }
  }

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  image(key) {
    return Assets.get(key);
  }

  safeTimeOfDay() {
    try {
      return this.game.getTimeOfDay();
    } catch {
      return 0.2;
    }
  }

  clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  laneWidth() {
    const g = this.game;
    const pad = 18;
    return (g.canvas.clientWidth - pad * 2) / CONFIG.LANES;
  }

  roadTop() {
    return this.game.canvas.clientHeight * 0.33;
  }

  perspectiveScale(y, min = 0.42, max = 1.22) {
    const h = this.game.canvas.clientHeight;
    const top = this.roadTop();
    const t = this.clamp((y - top) / Math.max(1, h - top), 0, 1);
    return min + t * (max - min);
  }

  drawImageContain(img, x, y, width, height, alpha = 1) {
    if (!img) return;

    const ctx = this.ctx;

    ctx.save();
    ctx.globalAlpha = alpha;

    const iw = img.naturalWidth || img.width || 1;
    const ih = img.naturalHeight || img.height || 1;

    const ratio = Math.min(width / iw, height / ih);
    const dw = iw * ratio;
    const dh = ih * ratio;

    ctx.drawImage(
      img,
      x - dw / 2,
      y - dh / 2,
      dw,
      dh
    );

    ctx.restore();
  }

  drawImageCover(img, x, y, width, height, alpha = 1) {
    if (!img) return;

    const ctx = this.ctx;

    ctx.save();
    ctx.globalAlpha = alpha;

    const iw = img.naturalWidth || img.width || 1;
    const ih = img.naturalHeight || img.height || 1;

    const ratio = Math.max(width / iw, height / ih);
    const dw = iw * ratio;
    const dh = ih * ratio;

    ctx.drawImage(
      img,
      x - dw / 2,
      y - dh / 2,
      dw,
      dh
    );

    ctx.restore();
  }

  // ---------------------------------------------------------------------------
  // Atmosphere
  // ---------------------------------------------------------------------------

  drawSky() {
    const g = this.game;
    const ctx = this.ctx;
    const w = g.canvas.clientWidth;
    const h = g.canvas.clientHeight;
    const tod = this.safeTimeOfDay();

    const sky = ctx.createLinearGradient(0, 0, 0, h * 0.46);

    if (tod < 0.28) {
      sky.addColorStop(0, '#0878b8');
      sky.addColorStop(0.45, '#29a9df');
      sky.addColorStop(1, '#8bd8ef');
    } else if (tod < 0.5) {
      sky.addColorStop(0, '#263c63');
      sky.addColorStop(0.5, '#5b4384');
      sky.addColorStop(1, '#d28c6d');
    } else {
      sky.addColorStop(0, '#030712');
      sky.addColorStop(0.55, '#101a32');
      sky.addColorStop(1, '#29214a');
    }

    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, w, h * 0.48);

    if (tod < 0.3) {
      const sx = w * 0.78;
      const sy = h * 0.11;

      const glow = ctx.createRadialGradient(
        sx,
        sy,
        4,
        sx,
        sy,
        54
      );

      glow.addColorStop(0, 'rgba(255,244,170,0.95)');
      glow.addColorStop(0.35, 'rgba(255,210,70,0.32)');
      glow.addColorStop(1, 'rgba(255,210,70,0)');

      ctx.fillStyle = glow;
      ctx.beginPath();
      ctx.arc(sx, sy, 54, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = '#ffe08a';
      ctx.beginPath();
      ctx.arc(sx, sy, 14, 0, Math.PI * 2);
      ctx.fill();
    }

    if (tod >= 0.28 && tod <= 0.55) {
      const sx = w * 0.72;
      const sy = h * 0.17;

      ctx.fillStyle = 'rgba(255,190,120,0.7)';
      ctx.beginPath();
      ctx.arc(sx, sy, 22, 0, Math.PI * 2);
      ctx.fill();
    }

    if (tod > 0.55) {
      const mx = w * 0.82;
      const my = h * 0.1;

      ctx.fillStyle = 'rgba(248,250,252,0.95)';
      ctx.beginPath();
      ctx.arc(mx, my, 12, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = 'rgba(248,250,252,0.14)';
      ctx.beginPath();
      ctx.arc(mx, my, 27, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = `rgba(255,255,255,${this.clamp((tod - 0.5) * 1.7, 0.1, 0.9)})`;

      for (let i = 0; i < 60; i++) {
        const sx = (i * 97 + 31) % w;
        const sy = (i * 53 + 13) % Math.max(1, h * 0.29);
        const r = 0.6 + (i % 3) * 0.45;

        ctx.beginPath();
        ctx.arc(sx, sy, r, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    if (g.weather === 'dust') {
      ctx.fillStyle = 'rgba(213,184,137,0.19)';
      ctx.fillRect(0, 0, w, h * 0.48);
    }

    if (g.weather === 'haze') {
      ctx.fillStyle = 'rgba(180,188,190,0.12)';
      ctx.fillRect(0, 0, w, h * 0.48);
    }
  }

  drawCityscape() {
    const g = this.game;
    const ctx = this.ctx;
    const w = g.canvas.clientWidth;
    const h = g.canvas.clientHeight;
    const tod = this.safeTimeOfDay();

    const baseY = h * 0.35;

    // Distant Kano skyline.
    ctx.fillStyle = tod > 0.5
      ? 'rgba(10,18,31,0.88)'
      : 'rgba(35,48,62,0.58)';

    ctx.beginPath();
    ctx.moveTo(0, baseY);

    for (let i = 0; i <= 18; i++) {
      const x = (i / 18) * w;
      const variation =
        Math.sin(i * 1.17 + g.roadOff * 0.006) * 12 +
        (i % 4) * 7;

      ctx.lineTo(x, baseY - 18 - variation);
    }

    ctx.lineTo(w, baseY);
    ctx.closePath();
    ctx.fill();

    // Far buildings.
    for (let i = 0; i < 22; i++) {
      const bx =
        ((i * 71 + g.roadOff * 0.18) % (w + 130)) - 65;

      const bw = 34 + (i % 5) * 12;
      const bh = 30 + (i % 6) * 13;
      const by = baseY - bh;

      const shade = tod > 0.5
        ? 18 + (i % 4) * 6
        : 54 + (i % 5) * 10;

      ctx.fillStyle =
        `rgb(${shade},${shade + 7},${shade + 14})`;

      ctx.fillRect(bx, by, bw, bh);

      ctx.fillStyle = tod > 0.5
        ? '#1e293b'
        : '#66747e';

      ctx.fillRect(bx - 2, by - 4, bw + 4, 5);

      if (tod > 0.48) {
        ctx.fillStyle = 'rgba(255,215,100,0.28)';

        for (let wy = 9; wy < bh - 8; wy += 13) {
          for (let wx = 7; wx < bw - 7; wx += 13) {
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
      }
    }

    // Distant mosque silhouettes.
    for (let i = 0; i < 3; i++) {
      const x =
        ((i * 310 + g.roadOff * 0.1) % (w + 250)) - 80;

      ctx.fillStyle = tod > 0.5
        ? 'rgba(15,23,42,0.85)'
        : 'rgba(63,72,78,0.75)';

      ctx.fillRect(x, baseY - 65, 58, 65);

      ctx.beginPath();
      ctx.arc(
        x + 29,
        baseY - 65,
        29,
        Math.PI,
        Math.PI * 2
      );
      ctx.fill();

      ctx.fillRect(x - 12, baseY - 120, 9, 120);

      ctx.beginPath();
      ctx.moveTo(x - 15, baseY - 120);
      ctx.lineTo(x - 7.5, baseY - 134);
      ctx.lineTo(x, baseY - 120);
      ctx.closePath();
      ctx.fill();
    }
  }

  // ---------------------------------------------------------------------------
  // Road
  // ---------------------------------------------------------------------------

  drawRoad() {
    const g = this.game;
    const ctx = this.ctx;
    const w = g.canvas.clientWidth;
    const h = g.canvas.clientHeight;
    const tod = this.safeTimeOfDay();

    const rt = this.roadTop();

    const ground = ctx.createLinearGradient(0, rt, 0, h);

    if (tod > 0.55) {
      ground.addColorStop(0, '#1f2937');
      ground.addColorStop(0.5, '#111827');
      ground.addColorStop(1, '#030712');
    } else {
      ground.addColorStop(0, '#5b6267');
      ground.addColorStop(0.45, '#3f474d');
      ground.addColorStop(1, '#252b30');
    }

    ctx.fillStyle = ground;
    ctx.fillRect(0, rt, w, h - rt);

    // Roadside shoulders.
    const shoulder =
      tod > 0.55 ? '#29323a' : '#74766e';

    ctx.fillStyle = shoulder;
    ctx.fillRect(0, rt, 18, h - rt);
    ctx.fillRect(w - 18, rt, 18, h - rt);

    // Sand/dirt strips.
    ctx.fillStyle = tod > 0.55
      ? 'rgba(99,82,58,0.34)'
      : 'rgba(173,140,86,0.38)';

    ctx.fillRect(18, rt, 26, h - rt);
    ctx.fillRect(w - 44, rt, 26, h - rt);

    // Road edge lines.
    ctx.strokeStyle = '#eab308';
    ctx.lineWidth = 4;

    ctx.beginPath();
    ctx.moveTo(44, rt);
    ctx.lineTo(44, h);

    ctx.moveTo(w - 44, rt);
    ctx.lineTo(w - 44, h);

    ctx.stroke();

    // Lane markings.
    ctx.strokeStyle =
      tod > 0.55 ? '#d39b1b' : '#f4c430';

    ctx.lineWidth = 3.5;
    ctx.setLineDash([22, 25]);
    ctx.lineDashOffset = -g.roadOff * 1.4;

    for (let i = 1; i < CONFIG.LANES; i++) {
      const x = g.laneX(i - 0.5);

      ctx.beginPath();
      ctx.moveTo(x, rt);
      ctx.lineTo(x, h);
      ctx.stroke();
    }

    ctx.setLineDash([]);

    // Road surface texture.
    ctx.fillStyle = 'rgba(255,255,255,0.025)';

    for (let i = 0; i < 18; i++) {
      const x =
        ((i * 113 + g.roadOff * 0.55) % (w - 90)) + 45;

      const y =
        rt + ((i * 79 + g.roadOff * 2.1) % (h - rt));

      ctx.fillRect(x, y, 2, 8 + (i % 4) * 4);
    }

    // Subtle road perspective.
    const sheen = ctx.createLinearGradient(
      w * 0.25,
      rt,
      w * 0.75,
      h
    );

    sheen.addColorStop(
      0,
      'rgba(255,255,255,0)'
    );

    sheen.addColorStop(
      0.5,
      'rgba(255,255,255,0.035)'
    );

    sheen.addColorStop(
      1,
      'rgba(255,255,255,0)'
    );

    ctx.fillStyle = sheen;
    ctx.fillRect(45, rt, w - 90, h - rt);
  }

  drawRoadCondition() {
    const g = this.game;

    if (
      !g.roadCondition ||
      g.roadCondition === 'normal' ||
      g.mudTimer <= 0
    ) {
      return;
    }

    const ctx = this.ctx;
    const w = g.canvas.clientWidth;
    const h = g.canvas.clientHeight;
    const rt = this.roadTop();

    if (g.roadCondition === 'muddy') {
      ctx.fillStyle = 'rgba(121,78,38,0.23)';
      ctx.fillRect(18, rt, w - 36, h - rt);

      for (let i = 0; i < 12; i++) {
        const x =
          ((i * 97 + g.roadOff * 0.45) % (w + 100)) - 50;

        const y =
          rt + 90 + ((i * 61) % Math.max(100, h - rt - 90));

        ctx.fillStyle = 'rgba(86,55,27,0.28)';

        ctx.beginPath();
        ctx.ellipse(
          x,
          y,
          18 + (i % 4) * 9,
          6 + (i % 3) * 3,
          0,
          0,
          Math.PI * 2
        );
        ctx.fill();
      }
    }

    if (g.roadCondition === 'bad') {
      ctx.fillStyle = 'rgba(15,15,15,0.15)';
      ctx.fillRect(18, rt, w - 36, h - rt);

      ctx.strokeStyle = 'rgba(0,0,0,0.38)';
      ctx.lineWidth = 2;

      for (let i = 0; i < 10; i++) {
        const x =
          ((i * 137 + g.roadOff * 0.35) % w);

        const y =
          rt + 90 + ((i * 47) % Math.max(100, h - rt - 100));

        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x + 15, y + 12);
        ctx.lineTo(x - 8, y + 30);
        ctx.lineTo(x + 9, y + 44);
        ctx.stroke();
      }
    }
  }

  // ---------------------------------------------------------------------------
  // Roadside environment
  // ---------------------------------------------------------------------------

  drawRoadsideWorld() {
    const g = this.game;
    const ctx = this.ctx;
    const w = g.canvas.clientWidth;
    const h = g.canvas.clientHeight;
    const rt = this.roadTop();

    const spacing = 175;

    for (let i = 0; i < 12; i++) {
      const side = i % 2 === 0 ? -1 : 1;

      const travel =
        (g.roadOff * 1.15 + i * spacing) %
        (spacing * 6);

      const depth =
        rt + 28 + travel * 0.92;

      if (depth < rt || depth > h + 130) {
        continue;
      }

      const scale =
        this.perspectiveScale(depth, 0.42, 1.16);

      const roadSideX =
        side < 0
          ? 28 - scale * 25
          : w - 28 + scale * 25;

      const key =
        this.environmentCycle[
          (i + Math.floor(g.roadOff / spacing)) %
          this.environmentCycle.length
        ];

      this.drawEnvironmentAsset(
        key,
        roadSideX,
        depth,
        scale,
        side
      );
    }

    this.drawStreetLights();
    this.drawPedestrians();
  }

  drawEnvironmentAsset(key, x, y, scale, side) {
    const img = this.image(key);
    if (!img) return;

    const ctx = this.ctx;

    const dimensions = {
      shop: [92, 88],
      market: [88, 72],
      house: [92, 84],
      mosque: [105, 115],
      school: [115, 90],
      petrol: [125, 105],
      busStop: [105, 78]
    };

    const [baseW, baseH] =
      dimensions[key] || [90, 80];

    const width = baseW * scale;
    const height = baseH * scale;

    ctx.save();

    // Keep assets facing the road rather than flipping them.
    const groundY = y + height * 0.45;

    ctx.globalAlpha = this.clamp(
      0.45 + scale * 0.5,
      0.45,
      1
    );

    ctx.fillStyle = 'rgba(0,0,0,0.22)';
    ctx.beginPath();
    ctx.ellipse(
      x,
      groundY + 5,
      width * 0.42,
      Math.max(3, height * 0.075),
      0,
      0,
      Math.PI * 2
    );
    ctx.fill();

    ctx.globalAlpha = 1;

    this.drawImageContain(
      img,
      x,
      y,
      width,
      height
    );

    ctx.restore();
  }

  drawStreetLights() {
    const g = this.game;
    const img = this.image('streetLight');

    if (!img) return;

    const w = g.canvas.clientWidth;
    const h = g.canvas.clientHeight;
    const rt = this.roadTop();
    const spacing = 260;

    for (let i = 0; i < 6; i++) {
      const depth =
        rt +
        ((i * spacing + g.roadOff * 1.1) %
          (spacing * 5));

      if (depth < rt || depth > h + 80) {
        continue;
      }

      const scale =
        this.perspectiveScale(depth, 0.35, 0.95);

      const side = i % 2 === 0 ? -1 : 1;

      const x =
        side < 0
          ? 48 - scale * 12
          : w - 48 + scale * 12;

      this.drawImageContain(
        img,
        x,
        depth - 28 * scale,
        50 * scale,
        105 * scale
      );
    }
  }

  drawPedestrians() {
    const g = this.game;
    const ctx = this.ctx;
    const w = g.canvas.clientWidth;
    const h = g.canvas.clientHeight;
    const rt = this.roadTop();

    const people = [
      'ped1',
      'ped2',
      'ped3',
      'passenger'
    ];

    for (let i = 0; i < 7; i++) {
      const depth =
        rt +
        ((i * 213 + g.roadOff * 0.78) %
          (h - rt + 180));

      if (depth < rt + 25 || depth > h + 50) {
        continue;
      }

      const scale =
        this.perspectiveScale(depth, 0.28, 0.82);

      const side = i % 2 === 0 ? -1 : 1;

      const x =
        side < 0
          ? 34 + (i % 3) * 13
          : w - 34 - (i % 3) * 13;

      const key =
        people[
          (i + Math.floor(g.roadOff / 80)) %
          people.length
        ];

      const img = this.image(key);

      if (!img) continue;

      this.drawImageContain(
        img,
        x,
        depth,
        42 * scale,
        72 * scale
      );

      // Simple walking animation.
      if (g.state === 1 && i % 2 === 0) {
        ctx.save();
        ctx.globalAlpha = 0.22;
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(
          x - 2,
          depth + 22 * scale,
          4,
          2
        );
        ctx.restore();
      }
    }
  }

  // ---------------------------------------------------------------------------
  // Billboards
  // ---------------------------------------------------------------------------

  drawBillboards() {
    const g = this.game;
    const ctx = this.ctx;
    const w = g.canvas.clientWidth;
    const h = g.canvas.clientHeight;
    const img = this.image('billboard');

    const bbs = (CONFIG.BILLBOARDS || [])
      .filter(b => b.active);

    if (!bbs.length && !img) {
      return;
    }

    const spacing = 520;

    for (let i = 0; i < 4; i++) {
      const depth =
        this.roadTop() +
        55 +
        ((g.roadOff * 0.7 + i * spacing) %
          (spacing * 4));

      if (depth > h + 100) {
        continue;
      }

      const scale =
        this.perspectiveScale(depth, 0.4, 1.0);

      const side = i % 2 === 0 ? -1 : 1;

      const x =
        side < 0
          ? 76 - scale * 18
          : w - 76 + scale * 18;

      if (img) {
        this.drawImageContain(
          img,
          x,
          depth - 48 * scale,
          130 * scale,
          82 * scale
        );
      } else {
        const bb = bbs[i % bbs.length];
        this.drawCanvasBillboard(
          x,
          depth,
          scale,
          bb
        );
      }
    }
  }

  drawCanvasBillboard(x, y, scale, bb) {
    const ctx = this.ctx;

    const width = 110 * scale;
    const height = 48 * scale;

    ctx.save();

    ctx.fillStyle = '#4b5563';
    ctx.fillRect(
      x - 3 * scale,
      y - 3 * scale,
      6 * scale,
      62 * scale
    );

    ctx.fillStyle =
      bb?.color || '#eab308';

    ctx.beginPath();
    ctx.roundRect(
      x - width / 2,
      y - height,
      width,
      height,
      6 * scale
    );
    ctx.fill();

    ctx.fillStyle = '#111827';
    ctx.font =
      `bold ${Math.max(7, 12 * scale)}px system-ui`;

    ctx.textAlign = 'center';

    const text =
      bb?.text ||
      bb?.brand ||
      'KANO RUN';

    ctx.fillText(
      text.slice(0, 20),
      x,
      y - height * 0.42
    );

    ctx.restore();
  }

  // ---------------------------------------------------------------------------
  // Traffic and gameplay entities
  // ---------------------------------------------------------------------------

  drawEntities() {
    const g = this.game;

    const all = [
      ...(g.obs || []).map(o => ({
        type: 'obstacle',
        y: o.y,
        data: o
      })),

      ...(g.paxZones || []).map(p => ({
        type: 'pickup',
        y: p.y,
        data: p
      })),

      ...(g.dropZones || []).map(d => ({
        type: 'drop',
        y: d.y,
        data: d
      })),

      ...(g.coins || []).map(c => ({
        type: 'coin',
        y: c.y,
        data: c
      }))
    ].sort((a, b) => a.y - b.y);

    for (const entity of all) {
      if (entity.type === 'obstacle') {
        this.drawObstacle(entity.data);
      }

      if (
        entity.type === 'pickup' &&
        !entity.data.taken
      ) {
        const p = entity.data;

        if (p.aishat) {
          this.drawZone(
            p,
            '#f472b6',
            'AISHAT + HIBBA'
          );
        } else if (p.vip) {
          this.drawZone(
            p,
            '#fbbf24',
            'VIP'
          );
        } else {
          const color =
            p.pType?.color || '#4ade80';

          const label =
            p.pType?.label
              ? p.pType.label.slice(0, 9)
              : 'PICKUP';

          this.drawZone(
            p,
            color,
            label
          );
        }
      }

      if (
        entity.type === 'drop' &&
        !entity.data.used
      ) {
        this.drawZone(
          entity.data,
          '#fbbf24',
          'DROP'
        );
      }

      if (entity.type === 'coin') {
        this.drawCoin(entity.data);
      }
    }
  }

  drawObstacle(o) {
    const g = this.game;
    const ctx = this.ctx;

    const lane =
      typeof o.lane === 'number'
        ? o.lane
        : 1;

    const x = g.laneX(lane);

    const rawY =
      typeof o.y === 'number'
        ? o.y
        : 0;

    const h =
      typeof o.h === 'number'
        ? o.h
        : 64;

    const y = rawY + h / 2;

    const type =
      o.type || 'car';

    const keys =
      this.trafficKeys[type] || [];

    let key = null;

    if (keys.length) {
      key =
        keys[
          Math.abs(Math.floor(rawY / 80)) %
          keys.length
        ];
    }

    const img = key
      ? this.image(key)
      : null;

    const scale =
      this.perspectiveScale(
        y,
        0.48,
        1.08
      );

    if (img) {
      this.drawTrafficSprite(
        img,
        type,
        x,
        y,
        scale
      );
      return;
    }

    if (type === 'keke') {
      this.drawKeke(
        x,
        y,
        false,
        CONFIG.PAINTS.classic,
        0,
        false,
        scale
      );
    } else if (
      type === 'police' ||
      type === 'karota'
    ) {
      this.drawEnforcer(
        x,
        y,
        type,
        scale
      );
    } else {
      this.drawCar(
        x,
        y,
        type === 'taxi'
          ? '#eab308'
          : '#dc2626',
        scale
      );
    }
  }

  drawTrafficSprite(img, type, x, y, scale) {
    const ctx = this.ctx;

    const sizes = {
      keke: [82, 104],
      car: [86, 94],
      taxi: [86, 94],
      bus: [112, 142],
      motorcycle: [58, 94],
      truck: [116, 135],
      police: [92, 100],
      karota: [96, 104]
    };

    const [baseW, baseH] =
      sizes[type] || [82, 96];

    const width = baseW * scale;
    const height = baseH * scale;

    ctx.save();

    // Vehicle shadow.
    ctx.fillStyle = 'rgba(0,0,0,0.34)';
    ctx.beginPath();
    ctx.ellipse(
      x,
      y + height * 0.43,
      width * 0.43,
      Math.max(4, height * 0.07),
      0,
      0,
      Math.PI * 2
    );
    ctx.fill();

    // Slight movement/bounce.
    const bounce =
      type === 'motorcycle'
        ? Math.sin(this.game.frame * 0.15 + y) * 1.4
        : Math.sin(this.game.frame * 0.09 + y) * 0.8;

    this.drawImageContain(
      img,
      x,
      y + bounce,
      width,
      height
    );

    // Night lights.
    if (this.safeTimeOfDay() > 0.48) {
      this.drawVehicleLights(
        x,
        y,
        width,
        height,
        type
      );
    }

    ctx.restore();
  }

  drawVehicleLights(x, y, width, height, type) {
    const ctx = this.ctx;

    const lightY =
      y - height * 0.27;

    const spacing =
      Math.max(5, width * 0.18);

    ctx.save();

    if (
      type === 'police' ||
      type === 'karota'
    ) {
      ctx.fillStyle =
        type === 'police'
          ? '#60a5fa'
          : '#fbbf24';

      ctx.globalAlpha =
        0.45 +
        Math.sin(this.game.frame * 0.25) *
        0.2;

      ctx.fillRect(
        x - spacing,
        lightY,
        Math.max(4, width * 0.08),
        Math.max(3, height * 0.04)
      );

      ctx.fillStyle = '#ef4444';

      ctx.fillRect(
        x,
        lightY,
        Math.max(4, width * 0.08),
        Math.max(3, height * 0.04)
      );
    } else {
      ctx.fillStyle =
        'rgba(255,226,120,0.82)';

      ctx.beginPath();
      ctx.arc(
        x - spacing,
        lightY,
        Math.max(2, width * 0.035),
        0,
        Math.PI * 2
      );

      ctx.arc(
        x + spacing,
        lightY,
        Math.max(2, width * 0.035),
        0,
        Math.PI * 2
      );

      ctx.fill();
    }

    ctx.restore();
  }

  drawEnforcer(x, y, type, scale = 1) {
    const img =
      type === 'karota'
        ? this.image('karota')
        : this.image('police');

    if (img) {
      this.drawTrafficSprite(
        img,
        type,
        x,
        y,
        scale
      );
      return;
    }

    const ctx = this.ctx;

    ctx.save();

    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.beginPath();
    ctx.ellipse(
      x,
      y + 35 * scale,
      32 * scale,
      9 * scale,
      0,
      0,
      Math.PI * 2
    );
    ctx.fill();

    ctx.fillStyle =
      type === 'karota'
        ? '#f59e0b'
        : '#1d4ed8';

    ctx.beginPath();
    ctx.roundRect(
      x - 30 * scale,
      y - 34 * scale,
      60 * scale,
      62 * scale,
      8 * scale
    );
    ctx.fill();

    ctx.fillStyle = '#fff';
    ctx.font =
      `bold ${Math.max(8, 11 * scale)}px system-ui`;

    ctx.textAlign = 'center';

    ctx.fillText(
      type === 'karota'
        ? 'KAROTA'
        : 'POLICE',
      x,
      y + 2 * scale
    );

    ctx.restore();
  }

  drawCar(x, y, color, scale = 1) {
    const ctx = this.ctx;

    ctx.save();

    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.beginPath();
    ctx.ellipse(
      x,
      y + 38 * scale,
      35 * scale,
      10 * scale,
      0,
      0,
      Math.PI * 2
    );
    ctx.fill();

    ctx.fillStyle = color;

    ctx.beginPath();
    ctx.roundRect(
      x - 32 * scale,
      y - 30 * scale,
      64 * scale,
      58 * scale,
      9 * scale
    );
    ctx.fill();

    ctx.fillStyle = '#111827';

    ctx.beginPath();
    ctx.roundRect(
      x - 25 * scale,
      y - 19 * scale,
      50 * scale,
      18 * scale,
      4 * scale
    );
    ctx.fill();

    ctx.fillStyle = '#111827';

    ctx.beginPath();
    ctx.arc(
      x - 21 * scale,
      y + 29 * scale,
      10 * scale,
      0,
      Math.PI * 2
    );

    ctx.arc(
      x + 21 * scale,
      y + 29 * scale,
      10 * scale,
      0,
      Math.PI * 2
    );

    ctx.fill();

    ctx.restore();
  }

  // ---------------------------------------------------------------------------
  // Player Adaidaita Sahu
  // ---------------------------------------------------------------------------

  drawPlayerKeke() {
    const g = this.game;

    const paint =
      CONFIG.PAINTS[g.currentPaint] ||
      CONFIG.PAINTS.classic;

    this.drawKeke(
      g.playerX,
      g.playerY,
      true,
      paint,
      g.paxOnBoard || 0,
      g.inv > 0
    );
  }

  drawKeke(
    x,
    y,
    isPlayer,
    paint,
    paxCount = 0,
    invuln = false,
    scaleOverride = 1
  ) {
    const g = this.game;
    const ctx = this.ctx;

    const p =
      paint ||
      CONFIG.PAINTS.classic;

    ctx.save();

    // Player sprite is deliberately positioned lower than the collision anchor.
    // Game logic keeps playerY around h - 195; visually the keke now sits
    // near the bottom of the road.
    let drawY = y;

    let bounce = 0;

    if (isPlayer) {
      bounce =
        g.bounce > 0
          ? Math.sin(g.bounce * 0.9) * 4
          : 0;

      drawY += 92 + bounce;
    }

    ctx.translate(x, drawY);

    if (
      isPlayer &&
      invuln &&
      Math.floor(g.frame / 3) % 2 === 0
    ) {
      ctx.globalAlpha = 0.42;
    }

    if (isPlayer) {
      this.drawPlayerSprite(
        scaleOverride,
        paxCount
      );

      ctx.restore();
      return;
    }

    this.drawFallbackKeke(
      1 * scaleOverride,
      p,
      false,
      paxCount
    );

    ctx.restore();
  }

  drawPlayerSprite(scale, paxCount) {
    const g = this.game;
    const ctx = this.ctx;

    let key = 'player';

    const steering =
      g.targetX - g.playerX;

    if (Math.abs(steering) > 7) {
      key =
        steering < 0
          ? 'playerLeft'
          : 'playerRight';
    }

    // Use the damaged sprite during the event/crash state.
    if (
      g.state === 3 &&
      this.image('playerDamaged')
    ) {
      key = 'playerDamaged';
    }

    let img = this.image(key);

    if (!img) {
      img = this.image('player');
    }

    if (!img) {
      this.drawFallbackKeke(
        1.35,
        CONFIG.PAINTS[
          g.currentPaint
        ] || CONFIG.PAINTS.classic,
        true,
        paxCount
      );

      return;
    }

    const width = 190 * scale;
    const height = 235 * scale;

    // Shadow is separated from the sprite so the keke feels planted on road.
    ctx.save();

    ctx.fillStyle =
      'rgba(0,0,0,0.36)';

    ctx.beginPath();

    ctx.ellipse(
      0,
      height * 0.43,
      width * 0.36,
      13 * scale,
      0,
      0,
      Math.PI * 2
    );

    ctx.fill();

    ctx.restore();

    // Player image.
    this.drawImageContain(
      img,
      0,
      0,
      width,
      height
    );

    // Passenger visibility enhancement.
    // This is deliberately subtle because the passenger should remain
    // integrated with the supplied keke sprite.
    if (paxCount > 0) {
      this.drawPassengerIndicator(
        paxCount,
        width,
        height
      );
    }

    // Small suspension bounce highlight.
    if (
      g.bounce > 0 &&
      g.state === 1
    ) {
      ctx.save();

      ctx.globalAlpha =
        0.22 *
        Math.min(
          1,
          g.bounce / 10
        );

      ctx.fillStyle = '#ffffff';

      ctx.beginPath();

      ctx.ellipse(
        0,
        height * 0.39,
        width * 0.32,
        6 * scale,
        0,
        0,
        Math.PI * 2
      );

      ctx.fill();

      ctx.restore();
    }
  }

  drawPassengerIndicator(count, width, height) {
    const ctx = this.ctx;

    const visible =
      Math.min(count, 5);

    const start =
      -((visible - 1) * 12) / 2;

    ctx.save();

    for (let i = 0; i < visible; i++) {
      const px =
        start + i * 12;

      const py =
        -height * 0.12;

      ctx.fillStyle =
        [
          '#fcd34d',
          '#f9a8d4',
          '#93c5fd',
          '#86efac',
          '#c4b5fd'
        ][i];

      ctx.beginPath();
      ctx.arc(
        px,
        py,
        4.2,
        0,
        Math.PI * 2
      );
      ctx.fill();
    }

    ctx.restore();
  }

  drawFallbackKeke(
    scale,
    paint,
    isPlayer,
    paxCount
  ) {
    const g = this.game;
    const ctx = this.ctx;

    const p =
      paint ||
      CONFIG.PAINTS.classic;

    const wr =
      g.wheelRot || 0;

    const s = scale;

    ctx.save();

    // Shadow.
    ctx.fillStyle =
      'rgba(0,0,0,0.3)';

    ctx.beginPath();

    ctx.ellipse(
      0,
      48 * s,
      42 * s,
      12 * s,
      0,
      0,
      Math.PI * 2
    );

    ctx.fill();

    // Rear wheels.
    for (const side of [-27, 27]) {
      ctx.fillStyle = '#0f172a';

      ctx.beginPath();
      ctx.arc(
        side * s,
        34 * s,
        14 * s,
        0,
        Math.PI * 2
      );
      ctx.fill();

      ctx.strokeStyle = '#64748b';
      ctx.lineWidth = 2.5 * s;
      ctx.stroke();

      ctx.strokeStyle = '#cbd5e1';
      ctx.lineWidth = 1.5 * s;

      ctx.beginPath();

      ctx.arc(
        side * s,
        34 * s,
        7 * s,
        wr,
        wr + Math.PI
      );

      ctx.stroke();
    }

    // Body.
    ctx.fillStyle =
      isPlayer
        ? p.body
        : '#eab308';

    ctx.beginPath();

    ctx.roundRect(
      -32 * s,
      -44 * s,
      64 * s,
      70 * s,
      10 * s
    );

    ctx.fill();

    // Side highlight.
    ctx.fillStyle =
      'rgba(255,255,255,0.12)';

    ctx.fillRect(
      -27 * s,
      -39 * s,
      12 * s,
      55 * s
    );

    // Stripe.
    ctx.fillStyle =
      isPlayer
        ? p.accent
        : '#ca8a04';

    ctx.fillRect(
      -32 * s,
      4 * s,
      64 * s,
      7 * s
    );

    // Canopy.
    ctx.fillStyle =
      isPlayer
        ? p.roof
        : '#111827';

    ctx.beginPath();

    ctx.roundRect(
      -34 * s,
      -57 * s,
      68 * s,
      22 * s,
      8 * s
    );

    ctx.fill();

    // Front windshield.
    ctx.fillStyle =
      'rgba(15,23,42,0.82)';

    ctx.beginPath();

    ctx.roundRect(
      -26 * s,
      -30 * s,
      52 * s,
      18 * s,
      4 * s
    );

    ctx.fill();

    // Front wheel.
    ctx.fillStyle = '#0f172a';

    ctx.beginPath();

    ctx.arc(
      0,
      38 * s,
      13 * s,
      0,
      Math.PI * 2
    );

    ctx.fill();

    ctx.strokeStyle = '#64748b';
    ctx.lineWidth = 2 * s;
    ctx.stroke();

    // Headlights.
    if (this.safeTimeOfDay() > 0.48) {
      ctx.fillStyle = '#fde047';

      ctx.beginPath();

      ctx.arc(
        -16 * s,
        -34 * s,
        5 * s,
        0,
        Math.PI * 2
      );

      ctx.arc(
        16 * s,
        -34 * s,
        5 * s,
        0,
        Math.PI * 2
      );

      ctx.fill();
    }

    // Passengers.
    if (isPlayer && paxCount > 0) {
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
          (-18 + i * 9) * s;

        ctx.fillStyle =
          colors[i % colors.length];

        ctx.beginPath();

        ctx.arc(
          px,
          -10 * s,
          6 * s,
          0,
          Math.PI * 2
        );

        ctx.fill();

        ctx.fillStyle =
          '#334155';

        ctx.fillRect(
          px - 5 * s,
          -4 * s,
          10 * s,
          14 * s
        );
      }
    }

    ctx.restore();
  }

  // ---------------------------------------------------------------------------
  // Pickup / drop zones
  // ---------------------------------------------------------------------------

  drawZone(z, color, label) {
    const g = this.game;
    const ctx = this.ctx;

    const x = g.laneX(z.lane);

    const pulse =
      1 +
      Math.sin(g.frame * 0.11) *
      0.09;

    const scale =
      this.perspectiveScale(
        z.y + 25,
        0.7,
        1.12
      );

    ctx.save();

    ctx.translate(
      x,
      z.y + 25
    );

    ctx.scale(
      pulse * scale,
      pulse * scale
    );

    ctx.fillStyle =
      color + '15';

    ctx.beginPath();

    ctx.arc(
      0,
      0,
      45,
      0,
      Math.PI * 2
    );

    ctx.fill();

    ctx.fillStyle =
      color + '25';

    ctx.beginPath();

    ctx.arc(
      0,
      0,
      37,
      0,
      Math.PI * 2
    );

    ctx.fill();

    ctx.strokeStyle = color;
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

    ctx.setLineDash([
      6,
      5
    ]);

    ctx.lineWidth = 1.5;

    ctx.beginPath();

    ctx.arc(
      0,
      0,
      23,
      0,
      Math.PI * 2
    );

    ctx.stroke();

    ctx.setLineDash([]);

    ctx.fillStyle = color;
    ctx.font =
      'bold 10px system-ui';

    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    ctx.fillText(
      label,
      0,
      1
    );

    ctx.restore();
  }

  drawCoin(c) {
    if (c.taken) return;

    const g = this.game;
    const ctx = this.ctx;

    const x = g.laneX(c.lane);

    const bob =
      Math.sin(c.bob) * 4.5;

    const scale =
      this.perspectiveScale(
        c.y,
        0.65,
        1.15
      );

    ctx.save();

    ctx.translate(
      x,
      c.y + bob
    );

    ctx.scale(
      scale,
      scale
    );

    ctx.fillStyle =
      'rgba(251,191,36,0.2)';

    ctx.beginPath();

    ctx.arc(
      0,
      0,
      23,
      0,
      Math.PI * 2
    );

    ctx.fill();

    ctx.fillStyle = '#fbbf24';

    ctx.beginPath();

    ctx.arc(
      0,
      0,
      15,
      0,
      Math.PI * 2
    );

    ctx.fill();

    ctx.fillStyle = '#ca8a04';

    ctx.beginPath();

    ctx.arc(
      0,
      0,
      10,
      0,
      Math.PI * 2
    );

    ctx.fill();

    ctx.fillStyle = '#fbbf24';
    ctx.font =
      'bold 13px system-ui';

    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    ctx.fillText(
      '₦',
      0,
      1
    );

    ctx.restore();
  }

  // ---------------------------------------------------------------------------
  // Effects
  // ---------------------------------------------------------------------------

  drawParticles() {
    const g = this.game;
    const ctx = this.ctx;

    // Existing game particles.
    for (const p of g.particles || []) {
      const alpha =
        this.clamp(
          p.life / Math.max(1, p.max || 1),
          0,
          1
        );

      ctx.save();

      ctx.globalAlpha = alpha;
      ctx.fillStyle =
        p.color || '#fbbf24';

      ctx.beginPath();

      ctx.arc(
        p.x,
        p.y,
        Math.max(
          1,
          (p.size || 3) * alpha
        ),
        0,
        Math.PI * 2
      );

      ctx.fill();

      ctx.restore();
    }

    // Dust asset.
    const dustImg =
      this.image('dust');

    for (const d of g.dust || []) {
      const alpha =
        this.clamp(
          d.life / 30,
          0,
          1
        );

      if (dustImg) {
        this.drawImageContain(
          dustImg,
          d.x,
          d.y,
          (d.size || 5) * 8,
          (d.size || 5) * 6,
          alpha * 0.7
        );
      } else {
        ctx.save();

        ctx.globalAlpha =
          alpha * 0.4;

        ctx.fillStyle =
          '#c4b5a0';

        ctx.beginPath();

        ctx.arc(
          d.x,
          d.y,
          (d.size || 4) * alpha,
          0,
          Math.PI * 2
        );

        ctx.fill();

        ctx.restore();
      }
    }

    // Weather.
    for (const p of g.weatherParticles || []) {
      if (p.haze) {
        ctx.save();

        ctx.globalAlpha =
          (p.life / 80) * 0.12;

        ctx.fillStyle =
          '#d1d5db';

        ctx.beginPath();

        ctx.arc(
          p.x,
          p.y,
          p.size,
          0,
          Math.PI * 2
        );

        ctx.fill();

        ctx.restore();

        continue;
      }

      ctx.save();

      ctx.globalAlpha =
        (p.life / 70) * 0.45;

      ctx.strokeStyle =
        '#d4d4d8';

      ctx.lineWidth = 1.2;

      ctx.beginPath();

      ctx.moveTo(
        p.x,
        p.y
      );

      ctx.lineTo(
        p.x + p.vx * 2,
        p.y + p.vy * 4
      );

      ctx.stroke();

      ctx.restore();
    }

    // Collision effect.
    if (
      g.shake > 0 &&
      g.state !== 1
    ) {
      this.drawCollisionEffect();
    }
  }

  drawCollisionEffect() {
    const img =
      this.image('collision');

    if (!img) return;

    const g = this.game;
    const ctx = this.ctx;

    ctx.save();

    ctx.globalAlpha =
      this.clamp(
        g.shake / 18,
        0,
        0.9
      );

    this.drawImageContain(
      img,
      g.playerX,
      g.playerY + 60,
      170,
      170
    );

    ctx.restore();
  }

  drawPlayerEffects() {
    const g = this.game;

    if (
      !g.speed ||
      g.speed < 8.5
    ) {
      return;
    }

    const img =
      this.image('speedLines');

    if (!img) return;

    const ctx = this.ctx;
    const w = g.canvas.clientWidth;
    const h = g.canvas.clientHeight;

    const intensity =
      this.clamp(
        (g.speed - 8.5) / 5,
        0,
        1
      );

    ctx.save();

    ctx.globalAlpha =
      0.12 +
      intensity * 0.18;

    ctx.globalCompositeOperation =
      'screen';

    ctx.drawImage(
      img,
      0,
      0,
      w,
      h
    );

    ctx.restore();
  }

  drawSpeedLines() {
    const g = this.game;

    if (
      g.speed < 8.5 ||
      g.state !== 1
    ) {
      return;
    }

    const img =
      this.image('speedLines');

    if (img) {
      return;
    }

    const ctx = this.ctx;
    const w = g.canvas.clientWidth;
    const h = g.canvas.clientHeight;

    const intensity =
      this.clamp(
        (g.speed - 8.5) / 5,
        0,
        1
      );

    ctx.save();

    ctx.strokeStyle =
      `rgba(255,255,255,${0.05 + intensity * 0.12})`;

    ctx.lineWidth = 1.4;

    for (
      let i = 0;
      i < 9 + intensity * 7;
      i++
    ) {
      const x =
        (i * 97 + g.frame * 18) %
        (w + 80) - 40;

      const length =
        18 + intensity * 30;

      const y =
        70 +
        (i * 67) %
        Math.max(1, h - 150);

      ctx.beginPath();

      ctx.moveTo(
        x,
        y
      );

      ctx.lineTo(
        x - length,
        y + length * 0.25
      );

      ctx.stroke();
    }

    ctx.restore();
  }

  // ---------------------------------------------------------------------------
  // HUD
  // ---------------------------------------------------------------------------

  drawSpeedHUD() {
    const g = this.game;
    const ctx = this.ctx;
    const w = g.canvas.clientWidth;

    const speed =
      Number(g.speed || 0);

    ctx.save();

    ctx.fillStyle =
      'rgba(5,10,20,0.82)';

    ctx.beginPath();

    ctx.roundRect(
      w / 2 - 58,
      58,
      116,
      30,
      15
    );

    ctx.fill();

    ctx.strokeStyle =
      'rgba(255,255,255,0.1)';

    ctx.lineWidth = 1;

    ctx.stroke();

    ctx.fillStyle = '#f8fafc';

    ctx.font =
      'bold 12px system-ui';

    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    ctx.fillText(
      `${speed.toFixed(1)} km/h`,
      w / 2,
      73
    );

    ctx.restore();
  }

  drawWeatherOverlay() {
    const g = this.game;
    const ctx = this.ctx;

    const w = g.canvas.clientWidth;
    const h = g.canvas.clientHeight;

    if (g.weather === 'dust') {
      ctx.fillStyle =
        'rgba(201,167,117,0.055)';

      ctx.fillRect(
        0,
        0,
        w,
        h
      );
    }

    if (g.weather === 'haze') {
      ctx.fillStyle =
        'rgba(148,163,184,0.045)';

      ctx.fillRect(
        0,
        0,
        w,
        h
      );
    }
  }

  drawEdgeVignette() {
    const g = this.game;
    const ctx = this.ctx;

    const w = g.canvas.clientWidth;
    const h = g.canvas.clientHeight;

    const gradient =
      ctx.createRadialGradient(
        w / 2,
        h * 0.55,
        Math.min(w, h) * 0.22,
        w / 2,
        h * 0.55,
        Math.max(w, h) * 0.72
      );

    gradient.addColorStop(
      0,
      'rgba(0,0,0,0)'
    );

    gradient.addColorStop(
      0.76,
      'rgba(0,0,0,0.035)'
    );

    gradient.addColorStop(
      1,
      'rgba(0,0,0,0.26)'
    );

    ctx.save();

    ctx.fillStyle = gradient;

    ctx.fillRect(
      0,
      0,
      w,
      h
    );

    ctx.restore();
  }
}