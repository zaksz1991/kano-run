// Stronger 2D renderer — polished Canvas visuals for Kano Run
import { CONFIG } from './config.js';
import { Assets } from './assets.js';

export class Renderer {
  constructor(game) {
    this.game = game;
    this.ctx = game.ctx;
  }

  draw() {
    const g = this.game;
    const ctx = this.ctx;

    let shakeX = 0, shakeY = 0;
    if (g.shake > 0) {
      shakeX = (Math.random() - 0.5) * g.shakeMag;
      shakeY = (Math.random() - 0.5) * g.shakeMag;
    }
    ctx.save();
    ctx.translate(shakeX, shakeY);

    this.drawSky();
    this.drawCityscape();
    this.drawRoad();
    this.drawRoadCondition();
    this.drawBillboards();
    this.drawSpeedLines();
    this.drawEntities();
    this.drawParticles();

    if (g.state === 1 || g.state === 2) {
      this.drawKeke(
        g.playerX,
        g.playerY,
        true,
        CONFIG.PAINTS[g.currentPaint] || CONFIG.PAINTS.classic,
        g.paxOnBoard,
        g.inv > 0
      );
    }
    if (g.state === 1) this.drawSpeedHUD();

    ctx.restore();
  }

  // ——— Atmosphere ———
  drawSky() {
    const g = this.game;
    const ctx = this.ctx;
    const w = g.canvas.clientWidth;
    const h = g.canvas.clientHeight;
    const tod = g.getTimeOfDay();

    const sky = ctx.createLinearGradient(0, 0, 0, h * 0.42);
    if (tod < 0.28) {
      sky.addColorStop(0, '#0ea5e9');
      sky.addColorStop(0.55, '#38bdf8');
      sky.addColorStop(1, '#7dd3fc');
    } else if (tod < 0.5) {
      sky.addColorStop(0, '#1e3a5f');
      sky.addColorStop(0.5, '#312e81');
      sky.addColorStop(1, '#4c1d95');
    } else {
      sky.addColorStop(0, '#020617');
      sky.addColorStop(0.6, '#0f172a');
      sky.addColorStop(1, '#1e1b4b');
    }
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, w, h * 0.4);

    // Sun / moon
    if (tod < 0.3) {
      const sx = w * 0.78, sy = h * 0.1;
      const glow = ctx.createRadialGradient(sx, sy, 4, sx, sy, 40);
      glow.addColorStop(0, 'rgba(253,224,71,0.9)');
      glow.addColorStop(0.4, 'rgba(253,224,71,0.25)');
      glow.addColorStop(1, 'rgba(253,224,71,0)');
      ctx.fillStyle = glow;
      ctx.beginPath();
      ctx.arc(sx, sy, 40, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#fde047';
      ctx.beginPath();
      ctx.arc(sx, sy, 14, 0, Math.PI * 2);
      ctx.fill();
    } else if (tod > 0.55) {
      const mx = w * 0.82, my = h * 0.09;
      ctx.fillStyle = 'rgba(248,250,252,0.9)';
      ctx.beginPath();
      ctx.arc(mx, my, 11, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = 'rgba(248,250,252,0.15)';
      ctx.beginPath();
      ctx.arc(mx, my, 22, 0, Math.PI * 2);
      ctx.fill();
    }

    // Stars at night
    if (tod > 0.5) {
      ctx.fillStyle = `rgba(255,255,255,${(tod - 0.5) * 1.6})`;
      for (let i = 0; i < 55; i++) {
        const sx = (i * 97 + 30) % w;
        const sy = (i * 53 + 12) % (h * 0.28);
        const r = 0.7 + (i % 3) * 0.5;
        ctx.beginPath();
        ctx.arc(sx, sy, r, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // Harmattan haze overlay on sky
    if (g.weather === 'dust' || g.weather === 'haze') {
      ctx.fillStyle = g.weather === 'dust'
        ? 'rgba(212, 185, 140, 0.18)'
        : 'rgba(148, 163, 184, 0.14)';
      ctx.fillRect(0, 0, w, h * 0.4);
    }
  }

  drawCityscape() {
    const g = this.game;
    const ctx = this.ctx;
    const w = g.canvas.clientWidth;
    const h = g.canvas.clientHeight;
    const tod = g.getTimeOfDay();
    const baseY = h * 0.34;

    // Far hills / city silhouette
    ctx.fillStyle = tod > 0.5 ? 'rgba(15,23,42,0.85)' : 'rgba(30,41,59,0.55)';
    ctx.beginPath();
    ctx.moveTo(0, baseY);
    for (let i = 0; i <= 12; i++) {
      const x = (i / 12) * w;
      const y = baseY - 18 - Math.sin(i * 0.9 + g.roadOff * 0.01) * 12 - (i % 3) * 8;
      ctx.lineTo(x, y);
    }
    ctx.lineTo(w, baseY);
    ctx.closePath();
    ctx.fill();

    // Buildings — varied heights, some with minaret / roof character
    for (let i = 0; i < 16; i++) {
      const bx = ((i * 62 + g.roadOff * 0.22) % (w + 100)) - 50;
      const bw = 36 + (i % 4) * 10;
      const bh = 28 + (i % 7) * 16 + (i % 2) * 10;
      const by = baseY - bh;

      // Building body
      const shade = tod > 0.5 ? 20 + (i % 4) * 8 : 45 + (i % 5) * 12;
      ctx.fillStyle = `rgb(${shade},${shade + 8},${shade + 18})`;
      ctx.fillRect(bx, by, bw, bh);

      // Roof edge
      ctx.fillStyle = tod > 0.5 ? '#1e293b' : '#475569';
      ctx.fillRect(bx - 2, by - 4, bw + 4, 5);

      // Minaret-style top on some
      if (i % 5 === 0) {
        ctx.fillStyle = tod > 0.5 ? '#334155' : '#64748b';
        ctx.fillRect(bx + bw * 0.35, by - 22, bw * 0.3, 22);
        ctx.beginPath();
        ctx.moveTo(bx + bw * 0.3, by - 22);
        ctx.lineTo(bx + bw * 0.5, by - 34);
        ctx.lineTo(bx + bw * 0.7, by - 22);
        ctx.fill();
      }

      // Windows
      if (tod > 0.48) {
        ctx.fillStyle = 'rgba(253,224,71,0.35)';
        for (let wy = 8; wy < bh - 10; wy += 12) {
          for (let wx = 6; wx < bw - 10; wx += 12) {
            if ((i + wx + wy) % 3 !== 0) {
              ctx.fillRect(bx + wx, by + wy, 6, 7);
            }
          }
        }
      } else {
        ctx.fillStyle = 'rgba(15,23,42,0.25)';
        for (let wy = 8; wy < bh - 10; wy += 12) {
          for (let wx = 6; wx < bw - 10; wx += 12) {
            ctx.fillRect(bx + wx, by + wy, 6, 7);
          }
        }
      }
    }
  }

  drawRoad() {
    const g = this.game;
    const ctx = this.ctx;
    const w = g.canvas.clientWidth;
    const h = g.canvas.clientHeight;
    const tod = g.getTimeOfDay();
    const rt = h * 0.34;

    // Road surface with perspective gradient
    const roadGrad = ctx.createLinearGradient(0, rt, 0, h);
    if (tod > 0.55) {
      roadGrad.addColorStop(0, '#1e293b');
      roadGrad.addColorStop(0.5, '#0f172a');
      roadGrad.addColorStop(1, '#020617');
    } else {
      roadGrad.addColorStop(0, '#475569');
      roadGrad.addColorStop(0.4, '#334155');
      roadGrad.addColorStop(1, '#1e293b');
    }
    ctx.fillStyle = roadGrad;
    ctx.fillRect(0, rt, w, h - rt);

    // Shoulder / curb
    ctx.fillStyle = tod > 0.55 ? '#334155' : '#64748b';
    ctx.fillRect(0, rt, 14, h - rt);
    ctx.fillRect(w - 14, rt, 14, h - rt);

    // Yellow edge lines
    ctx.strokeStyle = '#eab308';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(16, rt);
    ctx.lineTo(16, h);
    ctx.moveTo(w - 16, rt);
    ctx.lineTo(w - 16, h);
    ctx.stroke();

    // Lane dashes with perspective (wider at bottom)
    ctx.strokeStyle = tod > 0.55 ? '#ca8a04' : '#fbbf24';
    ctx.lineWidth = 4;
    ctx.setLineDash([16, 18]);
    ctx.lineDashOffset = -g.roadOff;
    for (let i = 1; i < 3; i++) {
      const x = g.laneX(i - 0.5);
      ctx.beginPath();
      ctx.moveTo(x, rt);
      ctx.lineTo(x, h);
      ctx.stroke();
    }
    ctx.setLineDash([]);

    // Subtle center sheen
    const sheen = ctx.createLinearGradient(w * 0.3, rt, w * 0.7, h);
    sheen.addColorStop(0, 'rgba(255,255,255,0)');
    sheen.addColorStop(0.5, 'rgba(255,255,255,0.03)');
    sheen.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = sheen;
    ctx.fillRect(20, rt, w - 40, h - rt);
  }

  drawRoadCondition() {
    const g = this.game;
    if (g.roadCondition === 'normal' || g.mudTimer <= 0) return;
    const ctx = this.ctx;
    const w = g.canvas.clientWidth;
    const h = g.canvas.clientHeight;

    if (g.roadCondition === 'muddy') {
      ctx.fillStyle = 'rgba(120, 80, 40, 0.2)';
      ctx.fillRect(0, h * 0.34, w, h * 0.66);
      ctx.fillStyle = 'rgba(90, 55, 25, 0.3)';
      for (let i = 0; i < 7; i++) {
        const x = (i * 100 + g.roadOff * 0.55) % (w + 80) - 40;
        ctx.beginPath();
        ctx.ellipse(x, h * 0.68 + (i % 3) * 28, 38, 11, 0, 0, Math.PI * 2);
        ctx.fill();
      }
    } else if (g.roadCondition === 'bad') {
      ctx.fillStyle = 'rgba(20, 20, 20, 0.12)';
      ctx.fillRect(0, h * 0.34, w, h * 0.66);
      ctx.strokeStyle = 'rgba(0,0,0,0.3)';
      ctx.lineWidth = 2.5;
      for (let i = 0; i < 6; i++) {
        const x = (i * 120 + g.roadOff * 0.35) % w;
        ctx.beginPath();
        ctx.moveTo(x, h * 0.48);
        ctx.lineTo(x + 18, h * 0.62);
        ctx.lineTo(x - 8, h * 0.78);
        ctx.stroke();
      }
    }
  }

  drawBillboards() {
    const g = this.game;
    const ctx = this.ctx;
    const w = g.canvas.clientWidth;
    const h = g.canvas.clientHeight;
    const bbs = (CONFIG.BILLBOARDS || []).filter(b => b.active);
    if (!bbs.length) return;

    const spacing = 400;
    const baseY = h * 0.2;

    for (let i = 0; i < 4; i++) {
      const offset = ((g.roadOff * 0.38) + i * spacing) % (spacing * 3);
      const x = w + 40 - offset;
      if (x < -130 || x > w + 90) continue;
      const bb = bbs[i % bbs.length];

      // Pole
      ctx.fillStyle = '#475569';
      ctx.fillRect(x + 50, baseY + 8, 6, 52);

      // Board shadow
      ctx.fillStyle = 'rgba(0,0,0,0.2)';
      ctx.beginPath();
      ctx.roundRect(x + 3, baseY - 36, 108, 46, 6);
      ctx.fill();

      // Board
      ctx.fillStyle = bb.color || '#eab308';
      ctx.beginPath();
      ctx.roundRect(x, baseY - 40, 108, 46, 7);
      ctx.fill();

      // Inner frame
      ctx.strokeStyle = 'rgba(0,0,0,0.2)';
      ctx.lineWidth = 2;
      ctx.stroke();

      ctx.fillStyle = '#0f172a';
      ctx.font = 'bold 11px system-ui, sans-serif';
      ctx.textAlign = 'center';
      const t = bb.text || bb.brand || '';
      ctx.fillText(t.slice(0, 14), x + 54, baseY - 18);
      if (t.length > 14) {
        ctx.font = '10px system-ui, sans-serif';
        ctx.fillText(t.slice(14, 28), x + 54, baseY - 4);
      }
    }
  }

  drawSpeedLines() {
    const g = this.game;
    if (g.speed < 8.5 || g.state !== 1) return;
    const ctx = this.ctx;
    const w = g.canvas.clientWidth;
    const h = g.canvas.clientHeight;
    const intensity = Math.min(1, (g.speed - 8.5) / 5);

    ctx.strokeStyle = `rgba(255,255,255,${0.06 + intensity * 0.12})`;
    ctx.lineWidth = 1.5;
    for (let i = 0; i < 8 + intensity * 6; i++) {
      const x = (i * 97 + g.frame * 16) % (w + 40) - 20;
      const len = 16 + intensity * 26;
      const yBase = 90 + (i * 67) % (h - 180);
      ctx.beginPath();
      ctx.moveTo(x, yBase);
      ctx.lineTo(x - len, yBase + len * 0.25);
      ctx.stroke();
    }
  }

  // ——— Vehicles ———
  drawKeke(x, y, isPlayer, paint, paxCount = 0, invuln = false) {
    const g = this.game;
    const ctx = this.ctx;
    const p = paint || CONFIG.PAINTS.classic;

    ctx.save();
    const bounce = isPlayer && g.bounce > 0 ? Math.sin(g.bounce * 0.9) * 2.8 : 0;
    ctx.translate(x, y + bounce);
    if (isPlayer && invuln && Math.floor(g.frame / 3) % 2 === 0) ctx.globalAlpha = 0.4;

    // Sprite pack for player
    if (isPlayer) {
      const spr = Assets.get('player');
      if (spr) {
        const sw = 128, sh = 160;
        ctx.drawImage(spr, -sw / 2, -sh + 50, sw, sh);
        if (paxCount > 0) {
          const colors = ['#fcd34d', '#f9a8d4', '#93c5fd', '#86efac', '#c4b5fd'];
          for (let i = 0; i < Math.min(paxCount, 5); i++) {
            const px = -18 + i * 12;
            ctx.fillStyle = colors[i % colors.length];
            ctx.beginPath();
            ctx.arc(px, -36, 6.5, 0, Math.PI * 2);
            ctx.fill();
          }
        }
        ctx.restore();
        return;
      }
    }

    // Canvas-drawn polished keke
    const wr = g.wheelRot || 0;

    // Soft shadow
    ctx.fillStyle = 'rgba(0,0,0,0.28)';
    ctx.beginPath();
    ctx.ellipse(0, 44, 36, 11, 0, 0, Math.PI * 2);
    ctx.fill();

    // Rear wheels
    for (const side of [-24, 24]) {
      ctx.fillStyle = '#0f172a';
      ctx.beginPath();
      ctx.arc(side, 32, 13, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#475569';
      ctx.lineWidth = 2.5;
      ctx.stroke();
      ctx.strokeStyle = '#94a3b8';
      ctx.lineWidth = 1.8;
      ctx.beginPath();
      ctx.arc(side, 32, 6.5, wr, wr + Math.PI * 1.3);
      ctx.stroke();
      ctx.fillStyle = '#1e293b';
      ctx.beginPath();
      ctx.arc(side, 32, 3.5, 0, Math.PI * 2);
      ctx.fill();
    }

    // Body
    const body = isPlayer ? p.body : '#eab308';
    const roof = isPlayer ? p.roof : '#fde047';
    const accent = isPlayer ? p.accent : '#ca8a04';

    ctx.fillStyle = body;
    ctx.beginPath();
    ctx.roundRect(-30, -40, 60, 64, 10);
    ctx.fill();

    // Side highlight
    ctx.fillStyle = 'rgba(255,255,255,0.08)';
    ctx.fillRect(-26, -36, 12, 50);

    // Accent stripe
    ctx.fillStyle = accent;
    ctx.fillRect(-30, 4, 60, 6);

    // Canopy
    ctx.fillStyle = roof;
    ctx.beginPath();
    ctx.roundRect(-32, -52, 64, 20, 8);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.15)';
    ctx.fillRect(-28, -48, 56, 5);

    // Front panel
    ctx.fillStyle = '#0f172a';
    ctx.beginPath();
    ctx.roundRect(-24, -28, 48, 17, 5);
    ctx.fill();

    // Windows
    ctx.fillStyle = 'rgba(148,163,184,0.28)';
    ctx.beginPath();
    ctx.roundRect(-26, -12, 17, 22, 3);
    ctx.fill();
    ctx.beginPath();
    ctx.roundRect(9, -12, 17, 22, 3);
    ctx.fill();

    // Front wheel
    ctx.fillStyle = '#0f172a';
    ctx.beginPath();
    ctx.arc(0, 36, 12, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#64748b';
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(0, 36, 5.5, wr * 1.2, wr * 1.2 + Math.PI);
    ctx.stroke();

    // Headlights + beams at night
    if (g.getTimeOfDay() > 0.48) {
      ctx.fillStyle = '#fde047';
      ctx.beginPath();
      ctx.arc(-15, -32, 5.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.arc(15, -32, 5.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = 'rgba(253,224,71,0.07)';
      ctx.beginPath();
      ctx.moveTo(-20, -32);
      ctx.lineTo(-58, -95);
      ctx.lineTo(-6, -95);
      ctx.closePath();
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(20, -32);
      ctx.lineTo(6, -95);
      ctx.lineTo(58, -95);
      ctx.closePath();
      ctx.fill();
    }

    // Plate
    ctx.fillStyle = '#f8fafc';
    ctx.beginPath();
    ctx.roundRect(-18, 14, 36, 13, 3);
    ctx.fill();
    ctx.fillStyle = '#0f172a';
    ctx.font = 'bold 9px system-ui';
    ctx.textAlign = 'center';
    ctx.fillText('KN 24', 0, 24);

    // Passengers
    if (isPlayer && paxCount > 0) {
      const colors = ['#fcd34d', '#f9a8d4', '#93c5fd', '#86efac', '#c4b5fd'];
      for (let i = 0; i < Math.min(paxCount, 5); i++) {
        const px = -18 + i * 12;
        ctx.fillStyle = colors[i % colors.length];
        ctx.beginPath();
        ctx.arc(px, -10, 6, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#334155';
        ctx.beginPath();
        ctx.roundRect(px - 5, -4, 10, 15, 3);
        ctx.fill();
      }
    }

    ctx.restore();
  }

  drawEntities() {
    const g = this.game;
    const all = [
      ...g.obs.map(o => ({ t: 'o', y: o.y, d: o })),
      ...g.paxZones.map(p => ({ t: 'p', y: p.y, d: p })),
      ...g.dropZones.map(d => ({ t: 'd', y: d.y, d: d })),
      ...g.coins.map(c => ({ t: 'c', y: c.y, d: c }))
    ].sort((a, b) => a.y - b.y);

    for (const e of all) {
      if (e.t === 'o') this.drawObstacle(e.d);
      else if (e.t === 'p' && !e.d.taken) {
        if (e.d.aishat) this.drawZone(e.d, '#f472b6', 'Aishat+Hibba');
        else if (e.d.vip) this.drawZone(e.d, '#fbbf24', '👑 VIP');
        else {
          const col = (e.d.pType && e.d.pType.color) || '#4ade80';
          const label = (e.d.pType && e.d.pType.label) ? e.d.pType.label.slice(0, 6) : 'PICK';
          this.drawZone(e.d, col, label);
        }
      } else if (e.t === 'd' && !e.d.used) this.drawZone(e.d, '#fbbf24', 'DROP');
      else if (e.t === 'c') this.drawCoin(e.d);
    }
  }

  drawObstacle(o) {
    const g = this.game;
    const x = g.laneX(o.lane);
    const y = o.y + o.h / 2;
    const ctx = this.ctx;

    // Prefer sprites when loaded
    let spr = null;
    if (o.type === 'keke') spr = Assets.get('kekeYellow') || Assets.get('kekeBlue');
    else if (o.type === 'karota') spr = Assets.get('karota');
    else if (o.type === 'police') spr = Assets.get('police');
    else if (o.type === 'car') spr = Assets.get('car') || Assets.get('taxi');

    if (spr) {
      const sw = o.type === 'keke' ? 72 : 80;
      const sh = o.type === 'keke' ? 90 : 58;
      ctx.save();
      ctx.translate(x, y);
      ctx.drawImage(spr, -sw / 2, -sh / 2, sw, sh);
      ctx.restore();
      return;
    }

    if (o.type === 'keke') {
      this.drawKeke(x, y, false, CONFIG.PAINTS.classic, 0, false);
    } else if (o.type === 'karota' || o.type === 'police') {
      this.drawEnforcer(x, y, o.type);
    } else if (o.type === 'car') {
      this.drawCar(x, y, '#dc2626');
    } else {
      this.drawCart(x, y);
    }
  }

  drawEnforcer(x, y, type) {
    const ctx = this.ctx;
    ctx.save();
    ctx.translate(x, y);
    ctx.fillStyle = 'rgba(0,0,0,0.28)';
    ctx.beginPath();
    ctx.ellipse(0, 36, 34, 10, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = type === 'karota' ? '#f59e0b' : '#1e40af';
    ctx.beginPath();
    ctx.roundRect(-30, -32, 60, 56, 8);
    ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 12px system-ui';
    ctx.textAlign = 'center';
    ctx.fillText(type === 'karota' ? 'KAROTA' : 'POLICE', 0, 2);
    ctx.fillStyle = type === 'karota' ? '#ef4444' : '#3b82f6';
    ctx.beginPath();
    ctx.arc(-15, -24, 5, 0, Math.PI * 2);
    ctx.arc(15, -24, 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#0f172a';
    ctx.beginPath();
    ctx.arc(-18, 30, 10, 0, Math.PI * 2);
    ctx.arc(18, 30, 10, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  drawCar(x, y, color) {
    const g = this.game;
    const ctx = this.ctx;
    ctx.save();
    ctx.translate(x, y);
    ctx.fillStyle = 'rgba(0,0,0,0.28)';
    ctx.beginPath();
    ctx.ellipse(0, 36, 36, 10, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.roundRect(-32, -30, 64, 54, 9);
    ctx.fill();
    ctx.fillStyle = '#0f172a';
    ctx.beginPath();
    ctx.roundRect(-26, -20, 52, 18, 4);
    ctx.fill();
    if (g.getTimeOfDay() > 0.48) {
      ctx.fillStyle = 'rgba(253,224,71,0.75)';
      ctx.beginPath();
      ctx.arc(-18, -24, 4.5, 0, Math.PI * 2);
      ctx.arc(18, -24, 4.5, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillStyle = '#0f172a';
    ctx.beginPath();
    ctx.arc(-22, 30, 11, 0, Math.PI * 2);
    ctx.arc(22, 30, 11, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  drawCart(x, y) {
    const ctx = this.ctx;
    ctx.save();
    ctx.translate(x, y);
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    ctx.beginPath();
    ctx.ellipse(0, 32, 30, 9, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#a16207';
    ctx.beginPath();
    ctx.roundRect(-26, -16, 52, 38, 5);
    ctx.fill();
    ctx.fillStyle = '#854d0e';
    ctx.fillRect(-30, -26, 60, 14);
    ctx.fillStyle = '#22c55e';
    ctx.beginPath();
    ctx.arc(-12, -10, 7, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#ef4444';
    ctx.beginPath();
    ctx.arc(10, -8, 6, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#0f172a';
    ctx.beginPath();
    ctx.arc(-18, 28, 9, 0, Math.PI * 2);
    ctx.arc(18, 28, 9, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  drawZone(z, color, label) {
    const g = this.game;
    const ctx = this.ctx;
    const x = g.laneX(z.lane);
    const pulse = 1 + Math.sin(g.frame * 0.11) * 0.1;

    ctx.save();
    ctx.translate(x, z.y + 25);
    ctx.scale(pulse, pulse);
    ctx.fillStyle = color + '18';
    ctx.beginPath();
    ctx.arc(0, 0, 40, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = color + '30';
    ctx.beginPath();
    ctx.arc(0, 0, 34, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = color;
    ctx.lineWidth = 3.4;
    ctx.beginPath();
    ctx.arc(0, 0, 31, 0, Math.PI * 2);
    ctx.stroke();
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.arc(0, 0, 22, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = color;
    ctx.font = 'bold 11px system-ui';
    ctx.textAlign = 'center';
    ctx.fillText(label, 0, 4);
    ctx.restore();
  }

  drawCoin(c) {
    if (c.taken) return;
    const g = this.game;
    const ctx = this.ctx;
    const x = g.laneX(c.lane);
    const bob = Math.sin(c.bob) * 4.5;

    ctx.save();
    ctx.translate(x, c.y + bob);
    ctx.fillStyle = 'rgba(251,191,36,0.22)';
    ctx.beginPath();
    ctx.arc(0, 0, 20, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#fbbf24';
    ctx.beginPath();
    ctx.arc(0, 0, 14, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#ca8a04';
    ctx.beginPath();
    ctx.arc(0, 0, 10, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#fbbf24';
    ctx.font = 'bold 13px system-ui';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('₦', 0, 1);
    ctx.restore();
  }

  drawParticles() {
    const g = this.game;
    const ctx = this.ctx;

    for (const p of g.particles) {
      const a = p.life / p.max;
      ctx.globalAlpha = a;
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size * a, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;

    for (const d of g.dust) {
      const a = d.life / 28;
      ctx.globalAlpha = a * 0.4;
      ctx.fillStyle = '#94a3b8';
      ctx.beginPath();
      ctx.arc(d.x, d.y, d.size * a, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;

    for (const p of g.weatherParticles) {
      if (p.haze) {
        ctx.globalAlpha = (p.life / 80) * 0.12;
        ctx.fillStyle = '#94a3b8';
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fill();
      } else {
        ctx.globalAlpha = (p.life / 70) * 0.45;
        ctx.fillStyle = '#d4d4d8';
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.globalAlpha = 1;
  }

  drawSpeedHUD() {
    const g = this.game;
    const ctx = this.ctx;
    const w = g.canvas.clientWidth;

    ctx.fillStyle = 'rgba(10,15,28,0.8)';
    ctx.beginPath();
    ctx.roundRect(w / 2 - 44, 58, 88, 26, 13);
    ctx.fill();
    ctx.fillStyle = '#94a3b8';
    ctx.font = '12px system-ui';
    ctx.textAlign = 'center';
    ctx.fillText(g.speed.toFixed(1) + ' km/h', w / 2, 75);
  }
}
