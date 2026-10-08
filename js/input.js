export class Input {
  constructor(canvas) {
    this.canvas = canvas;
    this.keys = new Set();
    this.touch = { active: false, startX: 0, startY: 0, x: 0, y: 0 };
    this.left = false;
    this.right = false;
    this.brake = false;
    this.boost = false;

    window.addEventListener("keydown", (e) => {
      this.keys.add(e.code);
      this.sync();
      if (["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Space"].includes(e.code)) e.preventDefault();
    });
    window.addEventListener("keyup", (e) => {
      this.keys.delete(e.code);
      this.sync();
    });

    canvas.addEventListener("touchstart", (e) => {
      const t = e.changedTouches[0];
      this.touch.active = true;
      this.touch.startX = t.clientX;
      this.touch.startY = t.clientY;
      this.touch.x = t.clientX;
      this.touch.y = t.clientY;
    }, { passive: true });

    canvas.addEventListener("touchmove", (e) => {
      if (!this.touch.active) return;
      const t = e.changedTouches[0];
      this.touch.x = t.clientX;
      this.touch.y = t.clientY;
      const dx = this.touch.x - this.touch.startX;
      this.left = dx < -22;
      this.right = dx > 22;
      this.boost = this.touch.startY - this.touch.y > 65;
      this.brake = this.touch.y - this.touch.startY > 65;
    }, { passive: true });

    canvas.addEventListener("touchend", () => {
      this.touch.active = false;
      this.left = false;
      this.right = false;
      this.boost = false;
      this.brake = false;
    }, { passive: true });
  }

  sync() {
    this.left = this.keys.has("ArrowLeft") || this.keys.has("KeyA");
    this.right = this.keys.has("ArrowRight") || this.keys.has("KeyD");
    this.brake = this.keys.has("ArrowDown") || this.keys.has("KeyS");
    this.boost = this.keys.has("ArrowUp") || this.keys.has("KeyW") || this.keys.has("Space");
  }

  get steer() {
    return (this.right ? 1 : 0) - (this.left ? 1 : 0);
  }
}
