// Rendering system
import { CONFIG } from './config.js';

export class Renderer {
  constructor(game) {
    this.game = game;
    this.ctx = game.ctx;
  }

  draw() {
    const g = this.game;
    const ctx = this.ctx;

    // Screen shake
    let shakeX = 0, shakeY = 0;
    if (g.shake > 0) {
      shakeX = (Math.random() - 0.5) * g.shakeMag;
      shakeY = (Math.random() - 0.5) * g.shakeMag;
    }
    ctx.save();
    ctx.translate(shakeX, shakeY);

    this.drawRoad();
    this.drawBillboards();
    this.
  drawRoadCondition() {
    const g = this.game;
    if (g.roadCondition === 'normal' || g.mudTimer <= 0) return;
    const ctx = this.ctx;
    const w = g.canvas.clientWidth;
    const h = g.canvas.clientHeight;

    if (g.roadCondition === 'muddy') {
      ctx.fillStyle = 'rgba(120, 80, 40, 0.18)';
      ctx.fillRect(0, h * 0.35, w, h * 0.65);
      // mud patches
      ctx.fillStyle = 'rgba(90, 60, 30, 0.25)';
      for (let i = 0; i < 6; i++) {
        const x = (i * 110 + g.roadOff * 0.5) % (w + 60) - 30;
        ctx.beginPath();
        ctx.ellipse(x, h * 0.7 + (i % 3) * 30, 40, 12, 0, 0, Math.PI * 2);
        ctx.fill();
      }
    } else if (g.roadCondition === 'bad') {
      ctx.fillStyle = 'rgba(30, 30, 30, 0.12)';
      ctx.fillRect(0, h * 0.35, w, h * 0.65);
      // cracks
      ctx.strokeStyle = 'rgba(0,0,0,0.25)';
      ctx.lineWidth = 2;
      for (let i = 0; i < 5; i++) {
        const x = (i * 130 + g.roadOff * 0.3) % w;
        ctx.beginPath();
        ctx.moveTo(x, h * 0.5);
        ctx.lineTo(x + 20, h * 0.65);
        ctx.lineTo(x - 10, h * 0.8);
        ctx.stroke();
      }
    }
  }

  drawSpeedLines();
    this.drawRoadCondition();
    this.drawEntities();
    this.drawParticles();
    if (g.state === 1 || g.state === 2) { // PLAY or OVER
      this.drawKeke(g.playerX, g.playerY, true, CONFIG.PAINTS[g.currentPaint] || CONFIG.PAINTS.classic, g.paxOnBoard, g.inv > 0);
    }
    if (g.state === 1) this.drawSpeedHUD();

    ctx.restore(); // end screen shake
  }

  drawRoad() {
    const g = this.game;
    const ctx = this.ctx;
    const w = g.canvas.clientWidth;
    const h = g.canvas.clientHeight;
    const tod = g.getTimeOfDay();

    // Sky
    const sky = ctx.createLinearGradient(0, 0, 0, h * 0.42);
    if (tod < 0.32) {
      sky.addColorStop(0, '#0c4a6e');
      sky.addColorStop(1, '#155e75');
    } else if (tod < 0.6) {
      sky.addColorStop(0, '#1e1b4b');
      sky.addColorStop(1, '#312e81');
    } else {
      sky.addColorStop(0, '#020617');
      sky.addColorStop(1, '#0f172a');
    }
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, w, h * 0.38);

    // Stars
    if (tod > 0.48) {
      ctx.fillStyle = `rgba(255,255,255,${(tod - 0.48) * 1.9})`;
      for (let i = 0; i < 60; i++) {
        const sx = (i * 91 + 25) % w;
        const sy = (i * 49 + 8) % (h * 0.3);
        ctx.beginPath();
        ctx.arc(sx, sy, 0.9 + (i % 3) * 0.5, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // Buildings
    ctx.fillStyle = tod > 0.52 ? 'rgba(15,23,42,0.78)' : 'rgba(15,23,42,0.5)';
    for (let i = 0; i < 20; i++) {
      const bx = (i * 54 + g.roadOff * 0.16) % (w + 90) - 45;
      const bh = 26 + (i % 7) * 18;
      ctx.fillRect(bx, h * 0.31 - bh, 40, bh);
      if (tod > 0.52) {
        ctx.fillStyle = 'rgba(251,191,36,0.26)';
        for (let wy = 3; wy < bh - 6; wy += 10) {
          if ((i + wy) % 3 !== 0) ctx.fillRect(bx + 4, h * 0.31 - bh + wy, 6, 4);
          if ((i + wy) % 4 !== 0) ctx.fillRect(bx + 18, h * 0.31 - bh + wy, 6, 4);
        }
        ctx.fillStyle = tod > 0.52 ? 'rgba(15,23,42,0.78)' : 'rgba(15,23,42,0.5)';
      }
    }

    // Road
    const rt = h * 0.32;
    const roadGrad = ctx.createLinearGradient(0, rt, 0, h);
    roadGrad.addColorStop(0, tod > 0.55 ? '#1e293b' : '#334155');
    roadGrad.addColorStop(1, tod > 0.55 ? '#0f172a' : '#1e293b');
    ctx.fillStyle = roadGrad;
    ctx.fillRect(0, rt, w, h - rt);

    // Lane lines
    ctx.strokeStyle = tod > 0.55 ? '#ca8a04' : '#eab308';
    ctx.lineWidth = 3.5;
    ctx.setLineDash([13, 15]);
    ctx.lineDashOffset = -g.roadOff;
    for (let i = 1; i < 3; i++) {
      const x = g.laneX(i - 0.5);
      ctx.beginPath();
      ctx.moveTo(x, rt);
      ctx.lineTo(x, h);
      ctx.stroke();
    }
    ctx.setLineDash([]);

    // Edges
    ctx.strokeStyle = '#fbbf24';
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.moveTo(10, rt);
    ctx.lineTo(10, h);
    ctx.moveTo(w - 10, rt);
    ctx.lineTo(w - 10, h);
    ctx.stroke();
  }

  drawKeke(x, y, isPlayer, paint, paxCount = 0, invuln = false) {
    const g = this.game;
    const ctx = this.ctx;
    const p = paint || CONFIG.PAINTS.classic;

    ctx.save();
    const bounce = (isPlayer && g.bounce > 0) ? Math.sin(g.bounce * 0.9) * 2.8 : 0;
    ctx.translate(x, y + bounce);
    if (isPlayer && invuln && Math.floor(g.frame / 3) % 2 === 0) ctx.globalAlpha = 0.4;

    // Soft shadow
    ctx.fillStyle = 'rgba(0,0,0,0.32)';
    ctx.beginPath();
    ctx.ellipse(0, 42, 34, 12, 0, 0, Math.PI * 2);
    ctx.fill();

    const wr = g.wheelRot || 0;

    // Rear wheels with better detail
    for (const side of [-22, 22]) {
      ctx.fillStyle = '#0f172a';
      ctx.beginPath(); ctx.arc(side, 31, 12.5, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = '#334155';
      ctx.lineWidth = 2.5;
      ctx.beginPath(); ctx.arc(side, 31, 12.5, 0, Math.PI * 2); ctx.stroke();
      // rim
      ctx.strokeStyle = '#64748b';
      ctx.lineWidth = 1.8;
      ctx.beginPath(); ctx.arc(side, 31, 6, wr, wr + Math.PI * 1.4); ctx.stroke();
      ctx.beginPath(); ctx.arc(side, 31, 3, 0, Math.PI * 2); ctx.fill();
    }

    // Main body with slight gradient feel
    ctx.fillStyle = isPlayer ? p.body : '#eab308';
    ctx.beginPath();
    ctx.roundRect(-28, -38, 56, 60, 9);
    ctx.fill();

    // Side accent stripe
    ctx.fillStyle = isPlayer ? p.accent : '#ca8a04';
    ctx.fillRect(-28, 5, 56, 5);

    // Roof / canopy
    ctx.fillStyle = isPlayer ? p.roof : '#fde047';
    ctx.beginPath();
    ctx.roundRect(-30, -48, 60, 18, 7);
    ctx.fill();
    // roof highlight
    ctx.fillStyle = 'rgba(255,255,255,0.12)';
    ctx.fillRect(-26, -46, 52, 5);

    // Front dark panel
    ctx.fillStyle = '#0f172a';
    ctx.beginPath();
    ctx.roundRect(-22, -26, 44, 16, 4);
    ctx.fill();

    // Side windows
    ctx.fillStyle = 'rgba(148, 163, 184, 0.25)';
    ctx.beginPath(); ctx.roundRect(-24, -10, 16, 20, 3); ctx.fill();
    ctx.beginPath(); ctx.roundRect(8, -10, 16, 20, 3); ctx.fill();

    // Front wheel
    ctx.fillStyle = '#0f172a';
    ctx.beginPath(); ctx.arc(0, 35, 11.5, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#475569';
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(0, 35, 11.5, 0, Math.PI * 2); ctx.stroke();
    ctx.strokeStyle = '#64748b';
    ctx.beginPath(); ctx.arc(0, 35, 5.5, wr * 1.2, wr * 1.2 + Math.PI); ctx.stroke();

    // Headlights + glow at night
    if (g.getTimeOfDay() > 0.48) {
      ctx.fillStyle = '#fde047';
      ctx.beginPath(); ctx.arc(-14, -30, 5.5, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(14, -30, 5.5, 0, Math.PI * 2); ctx.fill();
      // light beams
      ctx.fillStyle = 'rgba(253, 224, 71, 0.06)';
      ctx.beginPath();
      ctx.moveTo(-18, -30); ctx.lineTo(-55, -90); ctx.lineTo(-5, -90); ctx.closePath(); ctx.fill();
      ctx.beginPath();
      ctx.moveTo(18, -30); ctx.lineTo(5, -90); ctx.lineTo(55, -90); ctx.closePath(); ctx.fill();
    }

    // Number plate
    ctx.fillStyle = '#f8fafc';
    ctx.beginPath(); ctx.roundRect(-17, 14, 34, 12, 2); ctx.fill();
    ctx.fillStyle = '#0f172a';
    ctx.font = 'bold 9px system-ui';
    ctx.textAlign = 'center';
    ctx.fillText('KN 24', 0, 23);

    // Passengers with slight variety
    if (isPlayer && paxCount > 0) {
      const colors = ['#fcd34d', '#f9a8d4', '#93c5fd', '#86efac', '#c4b5fd'];
      for (let i = 0; i < Math.min(paxCount, 5); i++) {
        const px = -16 + i * 11;
        ctx.fillStyle = colors[i % colors.length];
        ctx.beginPath(); ctx.arc(px, -8, 5.5, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#334155';
        ctx.beginPath(); ctx.roundRect(px - 4.5, -3, 9, 14, 2); ctx.fill();
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
        if (e.d.vip) this.drawZone(e.d, '#fbbf24', '👑 VIP');
        else {
          const col = (e.d.pType && e.d.pType.color) || '#4ade80';
          const label = (e.d.pType && e.d.pType.label) ? e.d.pType.label.slice(0,6) : 'PICK';
          this.drawZone(e.d, col, label);
        }
      }
      else if (e.t === 'd' && !e.d.used) this.drawZone(e.d, '#fbbf24', 'DROP');
      else if (e.t === 'c') this.drawCoin(e.d);
    }
  }

  drawObstacle(o) {
    const g = this.game;
    const x = g.laneX(o.lane);
    const y = o.y + o.h / 2;

    if (o.type === 'keke') {
      this.drawKeke(x, y, false, CONFIG.PAINTS.classic, 0, false);
    } else if (o.type === 'car') {
      const ctx = this.ctx;
      ctx.save();
      ctx.translate(x, y);
      ctx.fillStyle = 'rgba(0,0,0,0.3)';
      ctx.beginPath(); ctx.ellipse(0, 34, 35, 11, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#dc2626';
      ctx.beginPath(); ctx.roundRect(-31, -30, 62, 52, 7); ctx.fill();
      ctx.fillStyle = '#0f172a';
      ctx.beginPath(); ctx.roundRect(-25, -20, 50, 17, 3); ctx.fill();
      if (g.getTimeOfDay() > 0.48) {
        ctx.fillStyle = 'rgba(253,224,71,0.72)';
        ctx.beginPath(); ctx.arc(-17, -24, 4.2, 0, Math.PI * 2); ctx.arc(17, -24, 4.2, 0, Math.PI * 2); ctx.fill();
      }
      ctx.fillStyle = '#0f172a';
      ctx.beginPath(); ctx.arc(-21, 28, 11, 0, Math.PI * 2); ctx.arc(21, 28, 11, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    } else if (o.type === 'karota' || o.type === 'police') {
      const ctx = this.ctx;
      ctx.save();
      ctx.translate(x, y);
      // shadow
      ctx.fillStyle = 'rgba(0,0,0,0.3)';
      ctx.beginPath(); ctx.ellipse(0, 34, 32, 10, 0, 0, Math.PI*2); ctx.fill();
      // body
      ctx.fillStyle = o.type === 'karota' ? '#f59e0b' : '#1e40af';
      ctx.beginPath(); ctx.roundRect(-28, -30, 56, 52, 6); ctx.fill();
      // label
      ctx.fillStyle = '#fff';
      ctx.font = 'bold 11px system-ui';
      ctx.textAlign = 'center';
      ctx.fillText(o.type === 'karota' ? 'KAROTA' : 'POLICE', 0, 0);
      // lights
      ctx.fillStyle = o.type === 'karota' ? '#ef4444' : '#3b82f6';
      ctx.beginPath(); ctx.arc(-14, -22, 5, 0, Math.PI*2); ctx.arc(14, -22, 5, 0, Math.PI*2); ctx.fill();
      ctx.restore();
    } else {
      // cart
      const ctx = this.ctx;
      ctx.save();
      ctx.translate(x, y);
      ctx.fillStyle = 'rgba(0,0,0,0.26)';
      ctx.beginPath(); ctx.ellipse(0, 30, 29, 9, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#a16207';
      ctx.beginPath(); ctx.roundRect(-25, -15, 50, 36, 4); ctx.fill();
      ctx.fillStyle = '#854d0e';
      ctx.fillRect(-29, -24, 58, 13);
      ctx.fillStyle = '#22c55e';
      ctx.beginPath(); ctx.arc(-11, -9, 6.5, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#ef4444';
      ctx.beginPath(); ctx.arc(9, -7, 5.5, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#0f172a';
      ctx.beginPath(); ctx.arc(-17, 26, 8.5, 0, Math.PI * 2); ctx.arc(17, 26, 8.5, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    }
  }

  drawZone(z, color, label) {
    const g = this.game;
    const ctx = this.ctx;
    const x = g.laneX(z.lane);
    const pulse = 1 + Math.sin(g.frame * 0.11) * 0.1;

    ctx.save();
    ctx.translate(x, z.y + 25);
    ctx.scale(pulse, pulse);
    // outer glow
    ctx.fillStyle = color + '18';
    ctx.beginPath(); ctx.arc(0, 0, 40, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = color + '30';
    ctx.beginPath(); ctx.arc(0, 0, 34, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = color;
    ctx.lineWidth = 3.4;
    ctx.beginPath(); ctx.arc(0, 0, 31, 0, Math.PI * 2); ctx.stroke();
    ctx.lineWidth = 1.6;
    ctx.beginPath(); ctx.arc(0, 0, 22, 0, Math.PI * 2); ctx.stroke();
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
    ctx.beginPath(); ctx.arc(0, 0, 19, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#fbbf24';
    ctx.beginPath(); ctx.arc(0, 0, 13.5, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#ca8a04';
    ctx.beginPath(); ctx.arc(0, 0, 9.5, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#fbbf24';
    ctx.font = 'bold 12px system-ui';
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
      ctx.globalAlpha = a * 0.38;
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
        ctx.beginPath(); ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2); ctx.fill();
      } else {
        ctx.globalAlpha = (p.life / 70) * 0.45;
        ctx.fillStyle = '#d4d4d8';
        ctx.beginPath(); ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2); ctx.fill();
      }
    }
    ctx.globalAlpha = 1;
  }

  drawSpeedHUD() {
    const g = this.game;
    const ctx = this.ctx;
    const w = g.canvas.clientWidth;

    ctx.fillStyle = 'rgba(10,15,28,0.78)';
    ctx.beginPath();
    ctx.roundRect(w / 2 - 42, 58, 84, 24, 12);
    ctx.fill();
    ctx.fillStyle = '#94a3b8';
    ctx.font = '12px system-ui';
    ctx.textAlign = 'center';
    ctx.fillText(g.speed.toFixed(1) + ' km/h', w / 2, 74);
  }

  drawBillboards() {
    const g = this.game;
    const ctx = this.ctx;
    const w = g.canvas.clientWidth;
    const h = g.canvas.clientHeight;
    const tod = g.getTimeOfDay();

    // Simple roadside billboards that scroll
    const bbs = CONFIG.BILLBOARDS.filter(b => b.active);
    if (bbs.length === 0) return;

    const spacing = 420;
    const baseY = h * 0.22;

    for (let i = 0; i < 4; i++) {
      const offset = ((g.roadOff * 0.4) + i * spacing) % (spacing * 3);
      const x = w + 50 - offset;
      if (x < -120 || x > w + 80) continue;

      const bb = bbs[i % bbs.length];

      // Pole
      ctx.fillStyle = '#475569';
      ctx.fillRect(x + 48, baseY, 5, 55);

      // Board
      ctx.fillStyle = bb.color || '#eab308';
      ctx.beginPath();
      ctx.roundRect(x, baseY - 38, 105, 42, 6);
      ctx.fill();

      // Text
      ctx.fillStyle = '#0f172a';
      ctx.font = 'bold 11px system-ui';
      ctx.textAlign = 'center';
      ctx.fillText(bb.text.slice(0, 16), x + 52, baseY - 18);
      if (bb.text.length > 16) {
        ctx.font = '10px system-ui';
        ctx.fillText(bb.text.slice(16, 32), x + 52, baseY - 5);
      }
    }
  }
}
