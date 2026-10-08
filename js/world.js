import { Traffic } from "./traffic.js";

export class World {
  constructor() {
    this.traffic = new Traffic();
    this.distance = 0;
    this.seed = Math.random() * 1000;
    this.segment = 0;
    this.checkpoints = ["Kano City", "Sabon Gari", "Fagge", "Kofar Mata", "Nassarawa", "Tarauni"];
  }

  reset() {
    this.distance = 0;
    this.segment = 0;
    this.traffic.reset();
  }

  update(dt, player) {
    const s = dt / 1000;
    this.distance += player.speed * s;
    this.traffic.update(dt, this.distance);
    this.segment = Math.floor(this.distance / 250) % this.checkpoints.length;
  }

  checkCollision(player) {
    return this.traffic.check(player);
  }

  getDistrict() {
    return this.checkpoints[this.segment];
  }

  roadCurve(z) {
    const d = this.distance * 0.018;
    return Math.sin(d + z * 2.1) * 0.15 + Math.sin(d * 0.47 + z * 4.2) * 0.055;
  }

  roadside(z, side) {
    const wave = Math.sin(this.distance * 0.012 + z * 7 + side * 1.7);
    return wave > 0.48 ? "market" : wave < -0.5 ? "wall" : "building";
  }
}
