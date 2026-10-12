import Game from "./game.js";

let game = null;

function showFatalError(message) {
  const status = document.getElementById("load-status");
  const loading = document.getElementById("loading-screen");

  if (status) {
    status.textContent = message;
  }

  if (loading) {
    loading.style.display = "flex";
  }

  console.error("[Kano Run]", message);
}

async function boot() {
  try {
    if (!document.getElementById("c")) {
      throw new Error('Canvas element "#c" was not found.');
    }

    game = new Game();

    const loading = document.getElementById("loading-screen");
    if (loading) {
      loading.style.display = "none";
    }

    window.kanoRun = game;

    window.addEventListener("beforeunload", () => {
      game?.dispose();
      game = null;
    }, { once: true });

  } catch (error) {
    console.error("[Kano Run] Startup failed:", error);

    showFatalError(
      `Game startup failed: ${
        error instanceof Error ? error.message : String(error)
      }`
    );
  }
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", boot, { once: true });
} else {
  boot();
}