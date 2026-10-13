import Game from "./Game.js";
import Bootstrap from "./Bootstrap.js";
import GAME_CONFIG from "./config.js";

export default class GameFactory {
  static create(options = {}) {
    const config = {
      ...GAME_CONFIG,
      ...(options.config ?? {}),
    };

    return new Game({
      ...options,
      config,
    });
  }

  static createBootstrap(options = {}) {
    return new Bootstrap({
      ...options,
      gameOptions: {
        ...(options.gameOptions ?? {}),
        config: {
          ...GAME_CONFIG,
          ...(options.gameOptions?.config ?? {}),
        },
      },
    });
  }

  static async launch(options = {}) {
    const bootstrap = GameFactory.createBootstrap({
      autoStart: false,
      ...options,
    });

    await bootstrap.initialize();

    if (options.autoStart !== false) {
      await bootstrap.start();
    }

    return bootstrap;
  }

  static async createAndInitialize(options = {}) {
    const game = GameFactory.create(options);

    await game.initialize();

    if (options.autoStart) {
      await game.start();
    }

    return game;
  }

  static getDefaultConfig() {
    return structuredClone(GAME_CONFIG);
  }

  static getVersion() {
    return GAME_CONFIG.version ?? "1.0.0";
  }
}