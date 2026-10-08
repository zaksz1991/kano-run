import { Game } from "./game.js";
import { Renderer } from "./renderer.js";
import { UI } from "./ui.js";

const canvas = document.getElementById("c");
const game = new Game(canvas);
const ui = new UI(game);
const renderer = new Renderer(game);
game.ui = ui;

function resize() {
  game.resize();
}

window.addEventListener("resize", resize);
resize();
game.start();

let last = performance.now();
function loop(now) {
  const dt = Math.min(40, now - last);
  last = now;
  game.update(dt);
  renderer.draw();
  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);

window.KanoRun = { game, ui, renderer };
