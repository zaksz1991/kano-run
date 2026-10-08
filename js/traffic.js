export class Traffic {
  constructor() {
    this.items = [];
    this.spawnTimer = 0;
    this.maxItems = 13;
    this.types = ["car", "bus", "keke", "taxi", "truck", "bike"];
  }

  reset() {
    this.items.length = 0;
    this.spawnTimer = 0;
  }

  update(dt, playerDistance) {
    const s = dt / 1000;
    this.spawnTimer -= dt;
    if (this.spawnTimer <= 0 && this.items.length < this.maxItems) {
      this.spawn(playerDistance);
      this.spawnTimer = 520 + Math.random() * 650;
    }
    for (const v of this.items) {
      v.z -= s * (v.speed * 0.75 + 5);
      v.sway += s * v.swaySpeed;
    }
    this.items = this.items.filter((v) => v.z > -0.1 && v.z < 2.8);
  }

  spawn(distance) {
    const type = this.types[Math.floor(Math.random() * this.types.length)];
    const lane = Math.floor(Math.random() * 5) - 2;
    this.items.push({
      type,
      x: lane * 0.32 + (Math.random() - 0.5) * 0.08,
      z: 1.85 + Math.random() * 0.55,
      speed: 8 + Math.random() * 11,
      width: type === "bus" || type === "truck" ? 0.27 : 0.21,
      height: type === "bus" ? 0.62 : type === "truck" ? 0.52 : 0.43,
      sway: Math.random() * Math.PI * 2,
      swaySpeed: 0.5 + Math.random() * 0.9,
      distance
    });
  }

  check(player) {
    for (const v of this.items) {
      if (Math.abs(v.z - 0.1) < 0.075 && Math.abs(v.x - player.x) < (v.width + player.width) * 0.72) return v;
    }
    return null;
  }
}
