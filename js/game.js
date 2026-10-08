import { Input } from "./input.js";
import { Camera } from "./camera.js";
import { Player } from "./player.js";
import { World } from "./world.js";
import { Particles } from "./particles.js";

export class Game {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d", { alpha: false });
    this.input = new Input(canvas);
    this.camera = new Camera();
    this.player = new Player();
    this.world = new World();
    this.particles = new Particles();
    this.ui = null;
    this.width = 1;
    this.height = 1;
    this.running = true;
    this.paused = false;
    this.gameOver = false;
    this.score = 0;
    this.coins = 0;
    this.combo = 1;
    this.bestScore = this.readBestScore();
    this.speed = this.player.speed;
    this.time = 0;
    this.lastCollision = null;
  }

  readBestScore() {
    try { return Number(localStorage.getItem("kano-run-best") || 0); } catch (_) { return 0; }
  }

  saveBestScore() {
    try { localStorage.setItem("kano-run-best", String(this.bestScore)); } catch (_) {}
  }

  resize() {
    const rect = this.canvas.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.width = Math.max(1, rect.width);
    this.height = Math.max(1, rect.height);
    this.canvas.width = Math.floor(this.width * dpr);
    this.canvas.height = Math.floor(this.height * dpr);
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  start() {
    this.running = true;
    this.paused = false;
    this.gameOver = false;
  }

  restart() {
    this.player = new Player();
    this.world.reset();
    this.particles.items.length = 0;
    this.camera = new Camera();
    this.score = 0;
    this.coins = 0;
    this.combo = 1;
    this.time = 0;
    this.gameOver = false;
    this.running = true;
  }

  continueGame() {
    this.gameOver = false;
    this.player.invulnerable = 1500;
    this.player.speed = Math.max(this.player.speed, 13);
  }

  pause() {
    this.paused = !this.paused;
  }

  update(dt) {
    if (!this.running || this.paused || this.gameOver) return;
    dt = Math.min(40, Math.max(0, dt));
    this.time += dt;

    const collision = this.player.update(dt, this.input, this.world, this.particles, this.camera);
    this.world.update(dt, this.player);
    this.particles.update(dt);
    this.camera.update(dt, this.player);
    this.speed = this.player.speed;

    if (collision) {
      this.lastCollision = collision;
      this.combo = 1;
      this.score = Math.max(0, this.score - 50);
    } else {
      this.score += this.player.speed * dt * 0.006 * this.combo;
      if (this.score > this.bestScore) {
        this.bestScore = Math.floor(this.score);
        this.saveBestScore();
      }
    }

    if (this.player.distance > 0 && Math.floor(this.player.distance) % 175 < this.player.speed * dt / 1000) {
      this.coins += 1;
      this.combo = Math.min(5, this.combo + 0.05);
    }

    if (this.ui && typeof this.ui.update === "function") this.ui.update();
  }

  driverSay(type) {
    const lines = {
      start: "Bismillah. Kano Run!",
      nearMiss: "Kai! That was close.",
      crash: "Ah! Watch the road.",
      checkpoint: this.world.getDistrict()
    };
    return lines[type] || lines.start;
  }

  horn() { this.camera.hit(2); }
  radio() { return "Kano Run Radio"; }
  lane() { return Math.round(this.player.x * 3); }
  getDistrict() { return this.world.getDistrict(); }
  getTime() { return this.time; }
  getDate() { return new Date(); }
}
