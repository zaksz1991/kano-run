/**
 * Canvas 2D fallback when WebGL is unavailable.
 * Game still plays: road scrolls, traffic, passengers, controls.
 * Game Developer: Hassan Zakariya
 */
export class Renderer2D {
  constructor(game) {
    this.game = game;
    this.canvas = game.canvas;
    this.ctx = this.canvas.getContext('2d');
    this.ready = true;
    this.introPhase = 3;
    this.cabinCam = false;
    this.cameraMode = 'chase';
    this.weather = 'clear';
    this._resize();
  }

  _resize() {
    const parent = this.canvas.parentElement;
    const w = (parent && parent.clientWidth) || window.innerWidth || 390;
    const h = (parent && parent.clientHeight) || window.innerHeight || 700;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.canvas.width = Math.floor(w * dpr);
    this.canvas.height = Math.floor(h * dpr);
    this.canvas.style.width = w + 'px';
    this.canvas.style.height = h + 'px';
    this.w = this.canvas.width;
    this.h = this.canvas.height;
    this.dpr = dpr;
  }

  resize() {
    this._resize();
  }

  draw() {
    this.render();
  }

  render() {
    if (!this.ctx || !this.ready) return;
    const g = this.game;
    const ctx = this.ctx;
    const W = this.w;
    const H = this.h;
    const spd = g.speed || 0;
    const roadOff = (g.roadOff || 0) * 8;

    // Sky
    const tod = typeof g.getTimeOfDay === 'function' ? g.getTimeOfDay() : 0.2;
    let skyTop = '#38bdf8';
    let skyBot = '#e0f2fe';
    if (tod > 0.62) {
      skyTop = '#020617';
      skyBot = '#1e1b4b';
    } else if (tod > 0.42) {
      skyTop = '#7c3aed';
      skyBot = '#f59e0b';
    }
    const grd = ctx.createLinearGradient(0, 0, 0, H * 0.45);
    grd.addColorStop(0, skyTop);
    grd.addColorStop(1, skyBot);
    ctx.fillStyle = grd;
    ctx.fillRect(0, 0, W, H);

    // Horizon + simple city blocks
    ctx.fillStyle = '#3d5a3a';
    ctx.fillRect(0, H * 0.42, W, H * 0.08);
    const buildingColors = ['#1e293b', '#273449', '#334155', '#0f766e', '#b45309'];
    for (let i = 0; i < 10; i++) {
      const side = i % 2 === 0 ? -1 : 1;
      const bh = (30 + (i * 17) % 50) * this.dpr;
      const bw = (18 + (i * 7) % 20) * this.dpr;
      const bx = side < 0 ? 8 * this.dpr + (i * 11) % 40 : W - bw - 8 * this.dpr - (i * 9) % 35;
      const by = H * 0.42 - bh;
      ctx.fillStyle = buildingColors[i % buildingColors.length];
      ctx.fillRect(bx, by, bw, bh);
      // window dots
      ctx.fillStyle = tod > 0.5 ? 'rgba(253,224,71,0.35)' : 'rgba(255,255,255,0.08)';
      for (let wy = 0; wy < 3; wy++) {
        ctx.fillRect(bx + bw * 0.2, by + bh * (0.2 + wy * 0.25), bw * 0.2, bh * 0.08);
        ctx.fillRect(bx + bw * 0.55, by + bh * (0.2 + wy * 0.25), bw * 0.2, bh * 0.08);
      }
    }

    // Road trapezoid (perspective)
    const roadTop = H * 0.48;
    const roadBot = H;
    const topW = W * 0.18;
    const botW = W * 0.95;
    ctx.beginPath();
    ctx.moveTo(W / 2 - topW / 2, roadTop);
    ctx.lineTo(W / 2 + topW / 2, roadTop);
    ctx.lineTo(W / 2 + botW / 2, roadBot);
    ctx.lineTo(W / 2 - botW / 2, roadBot);
    ctx.closePath();
    ctx.fillStyle = '#2a2e35';
    ctx.fill();

    // Lane dashes scrolling
    ctx.strokeStyle = '#fbbf24';
    ctx.lineWidth = Math.max(2, W * 0.008);
    ctx.setLineDash([H * 0.04, H * 0.05]);
    ctx.lineDashOffset = -roadOff;
    ctx.beginPath();
    ctx.moveTo(W / 2, roadTop);
    ctx.lineTo(W / 2, roadBot);
    ctx.stroke();
    ctx.setLineDash([]);

    // Edge lines
    ctx.strokeStyle = '#e2e8f0';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(W / 2 - topW / 2, roadTop);
    ctx.lineTo(W / 2 - botW / 2, roadBot);
    ctx.moveTo(W / 2 + topW / 2, roadTop);
    ctx.lineTo(W / 2 + botW / 2, roadBot);
    ctx.stroke();

    // Helper: lane x at screen y
    const laneX = (lane, y) => {
      const t = (y - roadTop) / (roadBot - roadTop);
      const half = topW / 2 + (botW / 2 - topW / 2) * t;
      const laneFrac = (lane - 1) / 1.5;
      return W / 2 + laneFrac * half * 0.7;
    };

    // Traffic
    for (const o of g.obs || []) {
      const y = ((o.y || 0) / 700) * H * 0.55 + roadTop;
      if (y < roadTop - 20 || y > H) continue;
      const t = Math.max(0, Math.min(1, (y - roadTop) / (roadBot - roadTop)));
      const scale = 0.25 + t * 0.9;
      const x = laneX(o.lane, y);
      const bw = 28 * scale * this.dpr;
      const bh = 40 * scale * this.dpr;
      ctx.fillStyle =
        o.type === 'police' || o.type === 'karota'
          ? '#1d4ed8'
          : o.type === 'keke'
            ? '#eab308'
            : o.robber
              ? '#7f1d1d'
              : '#dc2626';
      ctx.fillRect(x - bw / 2, y - bh, bw, bh);
      ctx.fillStyle = 'rgba(0,0,0,0.25)';
      ctx.fillRect(x - bw / 2, y - bh * 0.35, bw, bh * 0.2);
    }

    // Passengers (green)
    for (const p of g.paxZones || []) {
      if (p.taken) continue;
      const y = ((p.y || 0) / 700) * H * 0.55 + roadTop;
      if (y < roadTop || y > H) continue;
      const x = laneX(p.lane, y);
      ctx.fillStyle = '#4ade80';
      ctx.beginPath();
      ctx.arc(x, y - 10, 8 * this.dpr, 0, Math.PI * 2);
      ctx.fill();
    }

    // Coins / petrol / repair
    for (const c of g.coins || []) {
      if (c.taken) continue;
      const y = ((c.y || 0) / 700) * H * 0.55 + roadTop;
      if (y < roadTop || y > H) continue;
      const x = laneX(c.lane, y);
      ctx.fillStyle = c.repair ? '#3b82f6' : c.petrol ? '#22c55e' : '#fbbf24';
      ctx.beginPath();
      ctx.arc(x, y, 7 * this.dpr, 0, Math.PI * 2);
      ctx.fill();
    }

    // Player keke at bottom
    const px = laneX(g.playerLane ?? 1, H * 0.82);
    const py = H * 0.82;
    const bounce = g.bounce > 0 ? Math.sin(g.bounce * 0.8) * 6 : 0;
    const kw = 56 * this.dpr;
    const kh = 42 * this.dpr;
    // body
    ctx.fillStyle = '#f5c542';
    ctx.fillRect(px - kw / 2, py - kh + bounce, kw, kh * 0.55);
    // canopy
    ctx.fillStyle = '#0f172a';
    ctx.fillRect(px - kw * 0.35, py - kh * 0.95 + bounce, kw * 0.55, kh * 0.4);
    // glass
    ctx.fillStyle = 'rgba(56,189,248,0.7)';
    ctx.fillRect(px - kw * 0.28, py - kh * 0.88 + bounce, kw * 0.2, kh * 0.25);
    // wheels
    ctx.fillStyle = '#1e293b';
    ctx.beginPath();
    ctx.arc(px - kw * 0.28, py - 2 + bounce, 8 * this.dpr, 0, Math.PI * 2);
    ctx.arc(px + kw * 0.28, py - 2 + bounce, 8 * this.dpr, 0, Math.PI * 2);
    ctx.fill();

    // Speed dust
    if (spd > 1) {
      ctx.fillStyle = 'rgba(196,181,160,0.35)';
      for (let i = 0; i < 6; i++) {
        ctx.fillRect(
          px - kw + Math.random() * kw * 2,
          py + 5 + Math.random() * 30,
          3,
          8 + Math.random() * 12
        );
      }
    }

    // Drop zones (yellow)
    for (const d of g.dropZones || []) {
      if (d.used) continue;
      const y = ((d.y || 0) / 700) * H * 0.55 + roadTop;
      if (y < roadTop || y > H) continue;
      const x = laneX(d.lane, y);
      ctx.strokeStyle = '#fbbf24';
      ctx.lineWidth = 2 * this.dpr;
      ctx.beginPath();
      ctx.arc(x, y, 10 * this.dpr, 0, Math.PI * 2);
      ctx.stroke();
    }

    // Mode / status banner
    ctx.fillStyle = 'rgba(15,23,42,0.55)';
    // Fuel pads
    for (const fp of g.fuelPads || []) {
      if (fp.taken) continue;
      const fy = ((fp.y || 0) / (g.canvas?.clientHeight || 700)) * H;
      if (fy < 0 || fy > H) continue;
      const fx = (0.2 + (fp.lane || 1) * 0.25) * W;
      ctx.fillStyle = 'rgba(34,197,94,0.7)';
      ctx.beginPath();
      ctx.arc(fx, Math.max(H * 0.35, Math.min(H * 0.9, fy)), 12 * this.dpr, 0, Math.PI * 2);
      ctx.fill();
    }
    for (const pot of g.potholes || []) {
      if (pot.hit) continue;
      const py2 = ((pot.y || 0) / (g.canvas?.clientHeight || 700)) * H;
      if (py2 < 0 || py2 > H) continue;
      const px2 = (0.2 + (pot.lane || 1) * 0.25) * W;
      ctx.fillStyle = 'rgba(28,25,23,0.85)';
      ctx.beginPath();
      ctx.ellipse(px2, Math.max(H * 0.35, Math.min(H * 0.9, py2)), 14 * this.dpr, 8 * this.dpr, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillRect(8 * this.dpr, H - 28 * this.dpr, 160 * this.dpr, 20 * this.dpr);
    ctx.fillStyle = '#94a3b8';
    ctx.font = (10 * this.dpr) + 'px Outfit,sans-serif';
    ctx.fillText('2D FALLBACK · drive OK', 14 * this.dpr, H - 14 * this.dpr);
  }

  cycleCamera() {
    return 'chase';
  }

  applyPaint() {}
  applyQuality() {}
  setDamageVisual() {}
}
