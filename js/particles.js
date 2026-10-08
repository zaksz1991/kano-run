export class Particles {
  constructor() {
    this.items = [];
  }

  dust(x, y, amount = 4) {
    for (let i = 0; i < amount; i++) {
      this.items.push({
        type: "dust",
        x: x + (Math.random() - 0.5) * 0.8,
        y: y + Math.random() * 0.15,
        vx: (Math.random() - 0.5) * 0.7,
        vy: -0.2 - Math.random() * 0.5,
        life: 0.35 + Math.random() * 0.5,
        size: 0.05 + Math.random() * 0.08
      });
    }
  }

  spark(x, y, amount = 10) {
    for (let i = 0; i < amount; i++) {
      const a = Math.random() * Math.PI * 2;
      const speed = 0.5 + Math.random() * 1.7;
      this.items.push({
        type: "spark",
        x, y,
        vx: Math.cos(a) * speed,
        vy: Math.sin(a) * speed,
        life: 0.25 + Math.random() * 0.35,
        size: 0.02 + Math.random() * 0.035
      });
    }
  }

  update(dt) {
    const s = dt / 1000;
    for (const p of this.items) {
      p.x += p.vx * s;
      p.y += p.vy * s;
      p.vy += p.type === "dust" ? -0.05 * s : 0.9 * s;
      p.life -= s;
      if (p.type === "dust") p.size += s * 0.05;
    }
    this.items = this.items.filter((p) => p.life > 0);
  }
}
