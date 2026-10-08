export class Player {
  constructor() {
    this.x = 0;
    this.targetX = 0;
    this.speed = 18;
    this.cruiseSpeed = 18;
    this.maxSpeed = 34;
    this.minSpeed = 7;
    this.distance = 0;
    this.steerVisual = 0;
    this.tilt = 0;
    this.bob = 0;
    this.width = 0.18;
    this.height = 0.42;
    this.invulnerable = 0;
    this.hitFlash = 0;
  }

  update(dt, input, world, particles, camera) {
    const s = dt / 1000;
    const steer = input.steer;
    const boost = input.boost;
    const brake = input.brake;

    let targetSpeed = this.cruiseSpeed;
    if (boost) targetSpeed += 9;
    if (brake) targetSpeed -= 10;
    targetSpeed = Math.max(this.minSpeed, Math.min(this.maxSpeed, targetSpeed));

    const acceleration = boost ? 16 : 8;
    this.speed += (targetSpeed - this.speed) * Math.min(1, acceleration * s);

    const steeringPower = 1.65 + this.speed * 0.025;
    this.targetX += steer * steeringPower * s;
    this.targetX = Math.max(-1.18, Math.min(1.18, this.targetX));
    this.x += (this.targetX - this.x) * Math.min(1, s * 10);

    this.steerVisual += (steer - this.steerVisual) * Math.min(1, s * 12);
    this.tilt += (this.steerVisual * 0.16 - this.tilt) * Math.min(1, s * 9);
    this.bob += s * (3 + this.speed * 0.18);
    this.distance += this.speed * s;
    this.invulnerable = Math.max(0, this.invulnerable - dt);
    this.hitFlash = Math.max(0, this.hitFlash - dt);

    if (Math.random() < s * (this.speed / 9)) particles.dust(this.x, 0.03, 1);

    const collision = world.checkCollision(this);
    if (collision && this.invulnerable <= 0) {
      this.speed *= 0.45;
      this.targetX += this.x < collision.x ? -0.15 : 0.15;
      this.targetX = Math.max(-1.18, Math.min(1.18, this.targetX));
      this.invulnerable = 900;
      this.hitFlash = 180;
      particles.spark(this.x, 0.13, 14);
      camera.hit(9);
      return collision;
    }
    return null;
  }
}
