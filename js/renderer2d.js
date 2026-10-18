/**
 * Canvas 2D fallback — ALWAYS visible road + keke + traffic.
 * Uses a fresh canvas if WebGL already claimed #c.
 * Game Developer: Hassan Zakariya
 */
export class Renderer2D {
  constructor(game) {
    this.game = game;
    this.ready = false;
    this.introPhase = 3;
    this.cabinCam = false;
    this.cameraMode = 'chase';
    this.weather = 'clear';

    // WebGL and 2D cannot share the same canvas. If #c is WebGL-bound, clone it.
    let canvas = game.canvas;
    let ctx = null;
    try {
      ctx = canvas.getContext('2d');
    } catch (e) {
      ctx = null;
    }
    if (!ctx) {
      const parent = canvas.parentElement || document.getElementById('game-container');
      const fresh = document.createElement('canvas');
      fresh.id = 'c2d';
      fresh.setAttribute('aria-label', 'Kano Life 2D');
      // Match layout of original canvas
      fresh.style.cssText = canvas.style.cssText || 'display:block;width:100%;height:100%;';
      fresh.style.position = canvas.style.position || 'absolute';
      fresh.style.inset = '0';
      fresh.style.zIndex = '1';
      fresh.style.background = '#38bdf8';
      if (parent) {
        // Hide dead WebGL canvas
        canvas.style.visibility = 'hidden';
        canvas.style.pointerEvents = 'none';
        parent.insertBefore(fresh, canvas.nextSibling || null);
      }
      canvas = fresh;
      ctx = canvas.getContext('2d', { alpha: false });
      console.log('[Kano Life] 2D using fresh canvas (WebGL had locked #c)');
    }

    this.canvas = canvas;
    this.ctx = ctx;
    game.canvas2d = canvas;
    this._resize();
    this.ready = !!this.ctx;
    if (!this.ctx) console.error('[Kano Life] 2D context still null');
    else console.log('[Kano Life] 2D renderer ready', this.w, this.h);
  }

  _resize() {
    const parent =
      this.canvas.parentElement ||
      document.getElementById('game-container');
    let w = (parent && parent.clientWidth) || window.innerWidth || 390;
    let h = (parent && parent.clientHeight) || window.innerHeight || 700;
    if (w < 200) w = Math.min(430, window.innerWidth || 390);
    if (h < 200) h = Math.min(900, window.innerHeight || 700);
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.canvas.width = Math.floor(w * dpr);
    this.canvas.height = Math.floor(h * dpr);
    this.canvas.style.width = w + 'px';
    this.canvas.style.height = h + 'px';
    this.w = this.canvas.width;
    this.h = this.canvas.height;
    this.dpr = dpr;
    this.cssW = w;
    this.cssH = h;
  }

  resize() {
    this._resize();
  }

  draw() {
    this.render();
  }

  render() {
    if (!this.ctx) return;
    if (this.w < 32 || this.h < 32) this._resize();
    const g = this.game;
    const ctx = this.ctx;
    const W = this.w;
    const H = this.h;
    const dpr = this.dpr || 1;
    const spd = g.speed || 0;
    const roadOff = ((g.roadOff || 0) * 6) % 200;

    // ——— Sky ———
    const tod = typeof g.getTimeOfDay === 'function' ? g.getTimeOfDay() : 0.2;
    let skyTop = '#38bdf8';
    let skyBot = '#e0f2fe';
    if (tod > 0.62) {
      skyTop = '#0f172a';
      skyBot = '#1e3a5f';
    } else if (tod > 0.42) {
      skyTop = '#7c3aed';
      skyBot = '#fb923c';
    }
    const grd = ctx.createLinearGradient(0, 0, 0, H * 0.5);
    grd.addColorStop(0, skyTop);
    grd.addColorStop(1, skyBot);
    ctx.fillStyle = grd;
    ctx.fillRect(0, 0, W, H);

    // ——— Buildings ———
    const groundY = H * 0.46;
    ctx.fillStyle = '#4d7c4a';
    ctx.fillRect(0, groundY, W, H * 0.06);
    const cols = ['#1e293b', '#334155', '#0f766e', '#b45309', '#3b4a5c'];
    for (let i = 0; i < 12; i++) {
      const left = i % 2 === 0;
      const bh = (40 + (i * 23) % 70) * dpr;
      const bw = (22 + (i * 9) % 28) * dpr;
      const bx = left
        ? (6 + (i * 13) % 50) * dpr
        : W - bw - (6 + (i * 11) % 45) * dpr;
      const by = groundY - bh;
      ctx.fillStyle = cols[i % cols.length];
      ctx.fillRect(bx, by, bw, bh);
      ctx.fillStyle = tod > 0.5 ? 'rgba(253,224,71,0.4)' : 'rgba(255,255,255,0.12)';
      for (let wy = 0; wy < 4; wy++) {
        ctx.fillRect(bx + bw * 0.15, by + bh * (0.15 + wy * 0.2), bw * 0.25, bh * 0.08);
        ctx.fillRect(bx + bw * 0.55, by + bh * (0.15 + wy * 0.2), bw * 0.25, bh * 0.08);
      }
    }

    // ——— Road (full perspective trapezoid) ———
    const roadTop = H * 0.48;
    const roadBot = H;
    const topW = W * 0.22;
    const botW = W * 0.98;
    ctx.beginPath();
    ctx.moveTo(W / 2 - topW / 2, roadTop);
    ctx.lineTo(W / 2 + topW / 2, roadTop);
    ctx.lineTo(W / 2 + botW / 2, roadBot);
    ctx.lineTo(W / 2 - botW / 2, roadBot);
    ctx.closePath();
    ctx.fillStyle = '#374151';
    ctx.fill();

    // Shoulder
    ctx.fillStyle = '#57534e';
    ctx.beginPath();
    ctx.moveTo(W / 2 - topW / 2 - 8 * dpr, roadTop);
    ctx.lineTo(W / 2 - topW / 2, roadTop);
    ctx.lineTo(W / 2 - botW / 2, roadBot);
    ctx.lineTo(W / 2 - botW / 2 - 20 * dpr, roadBot);
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(W / 2 + topW / 2, roadTop);
    ctx.lineTo(W / 2 + topW / 2 + 8 * dpr, roadTop);
    ctx.lineTo(W / 2 + botW / 2 + 20 * dpr, roadBot);
    ctx.lineTo(W / 2 + botW / 2, roadBot);
    ctx.fill();

    // Center dashes
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(W / 2 - topW / 2, roadTop);
    ctx.lineTo(W / 2 + topW / 2, roadTop);
    ctx.lineTo(W / 2 + botW / 2, roadBot);
    ctx.lineTo(W / 2 - botW / 2, roadBot);
    ctx.closePath();
    ctx.clip();
    ctx.strokeStyle = '#fbbf24';
    ctx.lineWidth = Math.max(3, 4 * dpr);
    ctx.setLineDash([18 * dpr, 22 * dpr]);
    ctx.lineDashOffset = -roadOff * dpr;
    ctx.beginPath();
    ctx.moveTo(W / 2, roadTop);
    ctx.lineTo(W / 2, roadBot);
    ctx.stroke();
    // lane marks
    ctx.strokeStyle = 'rgba(248,250,252,0.7)';
    ctx.lineWidth = Math.max(2, 2 * dpr);
    ctx.setLineDash([14 * dpr, 18 * dpr]);
    for (const t of [-0.33, 0.33]) {
      ctx.beginPath();
      ctx.moveTo(W / 2 + (topW / 2) * t, roadTop);
      ctx.lineTo(W / 2 + (botW / 2) * t, roadBot);
      ctx.stroke();
    }
    ctx.setLineDash([]);
    ctx.restore();

    // Edge lines
    ctx.strokeStyle = '#f1f5f9';
    ctx.lineWidth = 3 * dpr;
    ctx.beginPath();
    ctx.moveTo(W / 2 - topW / 2, roadTop);
    ctx.lineTo(W / 2 - botW / 2, roadBot);
    ctx.moveTo(W / 2 + topW / 2, roadTop);
    ctx.lineTo(W / 2 + botW / 2, roadBot);
    ctx.stroke();

    // Map game Y (0 top of game, player near bottom) → screen
    const mapY = (gy) => {
      // game uses playerY ~ canvas css height
      const base = g.canvas?.clientHeight || this.cssH || 700;
      const t = 1 - Math.max(0, Math.min(1, (gy + 40) / (base + 80)));
      return roadTop + t * (H - roadTop) * 0.92;
    };
    const laneX = (lane, y) => {
      const t = Math.max(0, Math.min(1, (y - roadTop) / (H - roadTop)));
      const half = (topW / 2) * (1 - t) + (botW / 2) * t;
      const l = typeof lane === 'number' ? lane : 1;
      return W / 2 + ((l - 1) / 1) * half * 0.55;
    };
    // better 3-lane spread
    const laneX3 = (lane, y) => {
      const t = Math.max(0, Math.min(1, (y - roadTop) / Math.max(1, H - roadTop)));
      const half = (topW * 0.5) * (1 - t) + (botW * 0.5) * t;
      const l = Math.round(lane);
      const offset = (l - 1) * 0.62; // -0.62, 0, 0.62
      return W / 2 + half * offset;
    };

    // Traffic
    for (const o of g.obs || []) {
      const y = mapY(o.y);
      if (y < roadTop - 20 || y > H + 40) continue;
      const x = laneX3(o.lane, y);
      const scale = 0.35 + 0.65 * Math.max(0, Math.min(1, (y - roadTop) / (H - roadTop)));
      const bw = 28 * dpr * scale;
      const bh = 40 * dpr * scale;
      let col = '#94a3b8';
      if (o.rich || o.type === 'suv') col = '#1d4ed8';
      else if (o.type === 'police' || o.type === 'karota') col = '#eab308';
      else if (o.type === 'keke' || o.type === 'robber') col = '#fbbf24';
      else if (o.type === 'bus' || o.type === 'truck') col = '#64748b';
      else if (o.type === 'motorcycle') col = '#475569';
      ctx.fillStyle = col;
      ctx.fillRect(x - bw / 2, y - bh, bw, bh);
      ctx.fillStyle = '#0f172a';
      ctx.fillRect(x - bw * 0.4, y - bh * 0.95, bw * 0.8, bh * 0.25);
    }

    // Pick zones (green)
    for (const p of g.paxZones || []) {
      if (p.taken) continue;
      const y = mapY(p.y);
      if (y < roadTop || y > H) continue;
      const x = laneX3(p.lane, y);
      const r = (p.bigPad || p.checkpoint ? 16 : 10) * dpr;
      ctx.fillStyle = p.vip || p.aishat ? 'rgba(244,114,182,0.55)' : 'rgba(34,197,94,0.5)';
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#4ade80';
      ctx.lineWidth = 2 * dpr;
      ctx.stroke();
    }

    // Drop zones (yellow)
    for (const d of g.dropZones || []) {
      if (d.used) continue;
      const y = mapY(d.y);
      if (y < roadTop || y > H) continue;
      const x = laneX3(d.lane, y);
      const r = (d.bigPad ? 18 : 12) * dpr;
      ctx.fillStyle = 'rgba(251,191,36,0.45)';
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#fbbf24';
      ctx.lineWidth = 2 * dpr;
      ctx.stroke();
    }

    // Fuel pads
    for (const fp of g.fuelPads || []) {
      if (fp.taken) continue;
      const y = mapY(fp.y);
      if (y < roadTop || y > H) continue;
      const x = laneX3(fp.lane, y);
      ctx.fillStyle = 'rgba(34,197,94,0.75)';
      ctx.beginPath();
      ctx.arc(x, y, 14 * dpr, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#fff';
      ctx.font = 'bold ' + 11 * dpr + 'px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('⛽', x, y + 4 * dpr);
    }

    // Potholes
    for (const pot of g.potholes || []) {
      if (pot.hit) continue;
      const y = mapY(pot.y);
      if (y < roadTop || y > H) continue;
      const x = laneX3(pot.lane, y);
      ctx.fillStyle = 'rgba(28,25,23,0.9)';
      ctx.beginPath();
      ctx.ellipse(x, y, 16 * dpr, 9 * dpr, 0, 0, Math.PI * 2);
      ctx.fill();
    }

    // Player keke
    const lane = g.playerLane ?? 1;
    const py = H * 0.78;
    const px = laneX3(lane, py);
    const bounce = Math.sin((g.frame || 0) * 0.25) * 2 * dpr;
    const kw = 52 * dpr;
    const kh = 58 * dpr;
    // shadow
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    ctx.beginPath();
    ctx.ellipse(px, py + 6 * dpr + bounce, kw * 0.45, 8 * dpr, 0, 0, Math.PI * 2);
    ctx.fill();
    // body
    ctx.fillStyle = '#f5c542';
    ctx.fillRect(px - kw / 2, py - kh * 0.55 + bounce, kw, kh * 0.5);
    // canopy
    ctx.fillStyle = '#0f172a';
    ctx.fillRect(px - kw * 0.42, py - kh * 0.95 + bounce, kw * 0.84, kh * 0.42);
    // glass
    ctx.fillStyle = 'rgba(56,189,248,0.75)';
    ctx.fillRect(px - kw * 0.28, py - kh * 0.88 + bounce, kw * 0.35, kh * 0.28);
    // wheels
    ctx.fillStyle = '#1e293b';
    ctx.beginPath();
    ctx.arc(px - kw * 0.32, py - 2 + bounce, 9 * dpr, 0, Math.PI * 2);
    ctx.arc(px + kw * 0.32, py - 2 + bounce, 9 * dpr, 0, Math.PI * 2);
    ctx.arc(px, py - kh * 0.15 + bounce, 7 * dpr, 0, Math.PI * 2);
    ctx.fill();

    // Banner
    ctx.fillStyle = 'rgba(15,23,42,0.65)';
    ctx.fillRect(8 * dpr, H - 32 * dpr, 180 * dpr, 24 * dpr);
    ctx.fillStyle = '#e2e8f0';
    ctx.font = 'bold ' + 11 * dpr + 'px Outfit,sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText('2D MODE · road visible', 14 * dpr, H - 15 * dpr);
  }
}
