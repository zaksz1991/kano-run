export class Camera {
  constructor() {
    this.x = 0;
    this.targetX = 0;
    this.y = 0;
    this.shake = 0;
    this.shakeX = 0;
    this.shakeY = 0;
    this.speedLean = 0;
  }

  update(dt, player) {
    const s = Math.min(1, dt / 1000);
    this.targetX = player.x * 0.16;
    this.x += (this.targetX - this.x) * Math.min(1, s * 7);
    this.speedLean += ((player.speed - player.cruiseSpeed) * 0.0007 - this.speedLean) * Math.min(1, s * 5);

    if (this.shake > 0) {
      this.shake = Math.max(0, this.shake - dt * 1.8);
      this.shakeX = (Math.random() - 0.5) * this.shake;
      this.shakeY = (Math.random() - 0.5) * this.shake;
    } else {
      this.shakeX = 0;
      this.shakeY = 0;
    }
  }

  hit(amount) {
    this.shake = Math.max(this.shake, amount);
  }
}
