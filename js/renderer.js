export class Renderer {
  constructor(game) {
    this.game = game;
    this.ctx = game.ctx;
  }

  draw() {
    const g = this.game;
    const ctx = this.ctx;
    const w = g.width;
    const h = g.height;
    const cam = g.camera;
    const horizon = h * 0.39;

    ctx.save();
    ctx.clearRect(0, 0, w, h);
    ctx.translate(cam.shakeX, cam.shakeY);

    this.drawSky(w, h, horizon);
    this.drawCity(w, h, horizon);
    this.drawRoad(w, h, horizon);
    this.drawTraffic(w, h, horizon);
    this.drawParticles(w, h, horizon);
    this.drawPlayer(w, h, horizon);
    this.drawHUD(w, h);

    ctx.restore();
  }

  drawSky(w, h, horizon) {
    const ctx = this.ctx;
    const t = (Math.sin(this.game.time * 0.000035 - 1.1) + 1) / 2;
    const grad = ctx.createLinearGradient(0, 0, 0, horizon);
    grad.addColorStop(0, "#07152d");
    grad.addColorStop(0.52, "#1674a5");
    grad.addColorStop(1, t > 0.5 ? "#f5a65b" : "#214d72");
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, horizon + 3);

    if (t < 0.45) {
      ctx.fillStyle = "rgba(255,255,255,0.8)";
      for (let i = 0; i < 70; i++) {
        const x = (i * 97) % Math.max(1, w);
        const y = (i * 53) % Math.max(1, horizon * 0.72);
        ctx.fillRect(x, y, 1.2, 1.2);
      }
    }

    const sunX = w * (0.22 + t * 0.56);
    const sunY = horizon * (0.72 - t * 0.32);
    ctx.fillStyle = t > 0.38 ? "rgba(255,220,145,0.92)" : "rgba(220,235,255,0.82)";
    ctx.beginPath();
    ctx.arc(sunX, sunY, Math.max(16, w * 0.018), 0, Math.PI * 2);
    ctx.fill();
  }

  drawCity(w, h, horizon) {
    const ctx = this.ctx;
    const district = this.game.world.getDistrict();
    ctx.fillStyle = "#23313a";
    ctx.fillRect(0, horizon - 5, w, h - horizon + 5);

    for (let side = -1; side <= 1; side += 2) {
      for (let i = 0; i < 15; i++) {
        const depth = (i + 1) / 15;
        const z = 1 - depth;
        const roadX = w / 2 + this.game.camera.x * w * 0.08;
        const center = roadX + this.game.world.roadCurve(z) * w;
        const x = center + side * (w * (0.27 + depth * 0.31));
        const bh = h * (0.045 + depth * 0.17);
        const bw = w * (0.035 + depth * 0.025);
        const y = horizon + depth * h * 0.16 - bh;
        ctx.fillStyle = i % 3 === 0 ? "#5f4638" : i % 3 === 1 ? "#80634a" : "#3d4e52";
        ctx.fillRect(x - bw / 2, y, bw, bh);
        ctx.fillStyle = "rgba(247,211,112,0.45)";
        for (let r = 0; r < 3; r++) ctx.fillRect(x - bw * 0.32 + r * bw * 0.25, y + bh * 0.2, bw * 0.09, bh * 0.09);
      }
    }

    ctx.fillStyle = "rgba(255,255,255,0.82)";
    ctx.font = "700 " + Math.max(12, Math.floor(w * 0.018)) + "px sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(district, w / 2, horizon - 18);
  }

  roadPoint(w, h, horizon, z) {
    const depth = Math.max(0, Math.min(1, z));
    const curve = this.game.world.roadCurve(depth);
    const center = w / 2 + curve * w * 0.72 - this.game.camera.x * w * 0.24;
    const roadHalf = w * (0.055 + Math.pow(depth, 1.75) * 0.49);
    const y = horizon + Math.pow(depth, 1.52) * (h - horizon);
    return { center, half: roadHalf, y };
  }

  drawRoad(w, h, horizon) {
    const ctx = this.ctx;
    const far = this.roadPoint(w, h, horizon, 0);
    const near = this.roadPoint(w, h, horizon, 1);

    ctx.fillStyle = "#b58c61";
    ctx.beginPath();
    ctx.moveTo(0, horizon);
    ctx.lineTo(far.center - far.half, far.y);
    ctx.lineTo(near.center - near.half, near.y);
    ctx.lineTo(0, h);
    ctx.closePath();
    ctx.fill();

    ctx.beginPath();
    ctx.moveTo(w, horizon);
    ctx.lineTo(far.center + far.half, far.y);
    ctx.lineTo(near.center + near.half, near.y);
    ctx.lineTo(w, h);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = "#303337";
    ctx.beginPath();
    ctx.moveTo(far.center - far.half, far.y);
    ctx.lineTo(far.center + far.half, far.y);
    ctx.lineTo(near.center + near.half, near.y);
    ctx.lineTo(near.center - near.half, near.y);
    ctx.closePath();
    ctx.fill();

    const stripeOffset = (this.game.player.distance * 0.018) % 0.14;
    for (let i = 0; i < 14; i++) {
      const z1 = (i / 14 + stripeOffset) % 1;
      const z2 = Math.min(1, z1 + 0.035);
      if (z2 <= z1) continue;
      const a = this.roadPoint(w, h, horizon, z1);
      const b = this.roadPoint(w, h, horizon, z2);
      ctx.fillStyle = "rgba(245,245,230,0.78)";
      for (const lane of [-0.333, 0.333]) {
        const ax = a.center + a.half * lane;
        const bx = b.center + b.half * lane;
        const aw = Math.max(1, a.half * 0.025);
        const bw = Math.max(1, b.half * 0.025);
        ctx.beginPath();
        ctx.moveTo(ax - aw, a.y); ctx.lineTo(ax + aw, a.y);
        ctx.lineTo(bx + bw, b.y); ctx.lineTo(bx - bw, b.y);
        ctx.closePath(); ctx.fill();
      }
    }

    ctx.fillStyle = "#d6c08c";
    ctx.fillRect(0, h * 0.78, w, h * 0.22);
    ctx.globalCompositeOperation = "destination-over";
    ctx.fillStyle = "#303337";
    ctx.beginPath();
    ctx.moveTo(far.center - far.half, far.y);
    ctx.lineTo(far.center + far.half, far.y);
    ctx.lineTo(near.center + near.half, near.y);
    ctx.lineTo(near.center - near.half, near.y);
    ctx.closePath();
    ctx.fill();
    ctx.globalCompositeOperation = "source-over";
  }

  drawTraffic(w, h, horizon) {
    const list = this.game.world.traffic.items.slice().sort((a, b) => b.z - a.z);
    for (const v of list) {
      const p = this.roadPoint(w, h, horizon, Math.max(0.02, Math.min(1, 1 - v.z / 2.4)));
      const scale = 0.15 + Math.pow(1 - v.z / 2.4, 1.7) * 1.1;
      const x = p.center + v.x * p.half * 1.65 + Math.sin(v.sway) * 2;
      const y = p.y;
      const ww = Math.max(4, w * v.width * scale);
      const hh = Math.max(7, h * v.height * 0.34 * scale);
      this.drawVehicle(x, y, ww, hh, v.type);
    }
  }

  drawVehicle(x, y, ww, hh, type) {
    const ctx = this.ctx;
    const body = type === "keke" ? "#e6a21a" : type === "taxi" ? "#f1c232" : type === "bus" ? "#b53a2d" : type === "truck" ? "#68727b" : type === "bike" ? "#1f2937" : "#b8c0c7";
    ctx.save();
    ctx.translate(x, y - hh * 0.86);
    ctx.fillStyle = "rgba(0,0,0,0.25)";
    ctx.beginPath(); ctx.ellipse(0, hh * 0.95, ww * 0.72, hh * 0.25, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = body;
    ctx.beginPath(); ctx.roundRect(-ww / 2, -hh, ww, hh, Math.max(2, ww * 0.1)); ctx.fill();
    ctx.fillStyle = "#1b2933";
    ctx.fillRect(-ww * 0.32, -hh * 0.78, ww * 0.64, hh * 0.27);
    ctx.fillStyle = "#e9f7ff";
    ctx.fillRect(-ww * 0.31, -hh * 0.74, ww * 0.62, hh * 0.07);
    ctx.fillStyle = "#ef4444";
    ctx.fillRect(-ww * 0.39, -hh * 0.17, ww * 0.16, hh * 0.08);
    ctx.fillRect(ww * 0.23, -hh * 0.17, ww * 0.16, hh * 0.08);
    ctx.restore();
  }

  drawPlayer(w, h, horizon) {
    const ctx = this.ctx;
    const p = this.roadPoint(w, h, horizon, 0.94);
    const x = p.center + this.game.player.x * p.half * 1.65;
    const y = h * 0.91 + Math.sin(this.game.player.bob) * 2;
    const ww = Math.min(150, w * 0.16);
    const hh = ww * 0.82;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(this.game.player.tilt);

    ctx.fillStyle = "rgba(0,0,0,0.35)";
    ctx.beginPath(); ctx.ellipse(0, 5, ww * 0.54, hh * 0.16, 0, 0, Math.PI * 2); ctx.fill();

    ctx.fillStyle = "#e79b13";
    ctx.beginPath(); ctx.roundRect(-ww * 0.47, -hh * 0.48, ww * 0.94, hh * 0.58, ww * 0.1); ctx.fill();
    ctx.fillStyle = "#101820";
    ctx.beginPath(); ctx.roundRect(-ww * 0.32, -hh * 0.4, ww * 0.64, hh * 0.24, ww * 0.06); ctx.fill();
    ctx.fillStyle = "#f3f7fa";
    ctx.fillRect(-ww * 0.27, -hh * 0.37, ww * 0.54, hh * 0.055);

    ctx.fillStyle = "#111827";
    ctx.fillRect(-ww * 0.41, hh * 0.04, ww * 0.16, hh * 0.22);
    ctx.fillRect(ww * 0.25, hh * 0.04, ww * 0.16, hh * 0.22);
    ctx.fillStyle = "#ef4444";
    ctx.fillRect(-ww * 0.38, -hh * 0.02, ww * 0.12, hh * 0.07);
    ctx.fillRect(ww * 0.26, -hh * 0.02, ww * 0.12, hh * 0.07);

    ctx.fillStyle = "#1e293b";
    ctx.fillRect(-ww * 0.14, -hh * 0.7, ww * 0.28, hh * 0.22);
    ctx.fillStyle = "#d9a066";
    ctx.beginPath(); ctx.arc(0, -hh * 0.76, ww * 0.11, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = "#20252b";
    ctx.beginPath(); ctx.arc(0, -hh * 0.8, ww * 0.12, Math.PI, Math.PI * 2); ctx.fill();

    if (this.game.player.hitFlash > 0) {
      ctx.strokeStyle = "rgba(255,255,255,0.9)";
      ctx.lineWidth = 4;
      ctx.strokeRect(-ww * 0.5, -hh * 0.72, ww, hh * 0.72);
    }
    ctx.restore();
  }

  drawParticles(w, h, horizon) {
    const ctx = this.ctx;
    for (const p of this.game.particles.items) {
      const rp = this.roadPoint(w, h, horizon, 0.9);
      const x = rp.center + p.x * rp.half * 1.65;
      const y = h * (0.88 - p.y * 0.18);
      ctx.globalAlpha = Math.max(0, Math.min(1, p.life * 2));
      ctx.fillStyle = p.type === "dust" ? "#d0b080" : "#ffd166";
      ctx.beginPath(); ctx.arc(x, y, Math.max(1, p.size * w), 0, Math.PI * 2); ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  drawHUD(w, h) {
    const ctx = this.ctx;
    ctx.fillStyle = "rgba(4,10,18,0.55)";
    ctx.fillRect(14, 14, Math.min(300, w - 28), 74);
    ctx.fillStyle = "#ffffff";
    ctx.textAlign = "left";
    ctx.font = "700 16px sans-serif";
    ctx.fillText("KANO RUN", 28, 37);
    ctx.font = "600 13px sans-serif";
    ctx.fillText("Speed " + Math.round(this.game.speed * 5) + " km/h", 28, 58);
    ctx.fillText("Score " + Math.floor(this.game.score) + "   Coins " + this.game.coins, 28, 77);
    ctx.textAlign = "right";
    ctx.font = "600 12px sans-serif";
    ctx.fillText("← → / A D   steer    W / ↑   boost", w - 18, h - 18);
  }
}
