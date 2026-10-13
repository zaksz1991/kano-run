import GAME_CONFIG from "./config.js";

export default class RuntimeValidator {
  static validateEnvironment() {
    const errors = [];
    const warnings = [];

    if (typeof window === "undefined") {
      errors.push("Browser window is unavailable.");
    }

    if (typeof document === "undefined") {
      errors.push("Browser document is unavailable.");
    }

    if (typeof requestAnimationFrame !== "function") {
      errors.push("requestAnimationFrame is unavailable.");
    }

    if (typeof localStorage === "undefined") {
      warnings.push("Local storage is unavailable; progress may not persist.");
    }

    if (typeof WebGLRenderingContext === "undefined") {
      warnings.push("WebGL support could not be detected.");
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings,
    };
  }

  static validateConfig(config = GAME_CONFIG) {
    const errors = [];
    const warnings = [];

    if (!config || typeof config !== "object") {
      return {
        valid: false,
        errors: ["Game configuration must be an object."],
        warnings,
      };
    }

    if (!config.version) {
      warnings.push("Game version is not defined.");
    }

    if (
      !Array.isArray(config.LANE_X) ||
      config.LANE_X.length < 3 ||
      config.LANE_X.some((lane) => !Number.isFinite(lane))
    ) {
      errors.push("LANE_X must contain at least three numeric lane positions.");
    }

    if (
      config.MAX_SPEED !== undefined &&
      (!Number.isFinite(config.MAX_SPEED) || config.MAX_SPEED <= 0)
    ) {
      errors.push("MAX_SPEED must be a positive number.");
    }

    if (
      config.START_SPEED !== undefined &&
      (!Number.isFinite(config.START_SPEED) || config.START_SPEED < 0)
    ) {
      errors.push("START_SPEED must be a non-negative number.");
    }

    if (
      config.STARTING_LIVES !== undefined &&
      (!Number.isInteger(config.STARTING_LIVES) ||
        config.STARTING_LIVES < 1)
    ) {
      errors.push("STARTING_LIVES must be a positive integer.");
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings,
    };
  }

  static validateGame(game) {
    const errors = [];
    const warnings = [];

    if (!game || typeof game !== "object") {
      return {
        valid: false,
        errors: ["Game instance is missing or invalid."],
        warnings,
      };
    }

    if (!game.state) {
      errors.push("Game state is missing.");
    }

    if (!game.events) {
      errors.push("Event bus is missing.");
    }

    if (!game.services) {
      errors.push("Service container is missing.");
    }

    if (!game.sceneManager) {
      warnings.push("Scene manager has not been initialized.");
    }

    if (!(game.systems instanceof Map)) {
      errors.push("Game systems must be stored in a Map.");
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings,
    };
  }

  static assert(result, label = "Runtime validation") {
    if (!result.valid) {
      const message = [
        `${label} failed:`,
        ...result.errors.map((error) => `- ${error}`),
      ].join("\n");

      throw new Error(message);
    }

    return result;
  }

  static report(result, logger = console) {
    for (const warning of result.warnings ?? []) {
      logger.warn(`[Kano Run] ${warning}`);
    }

    for (const error of result.errors ?? []) {
      logger.error(`[Kano Run] ${error}`);
    }

    return result.valid;
  }

  static runAll(game = null, config = GAME_CONFIG) {
    const environment = this.validateEnvironment();
    const configuration = this.validateConfig(config);

    const results = {
      environment,
      configuration,
    };

    if (game) {
      results.game = this.validateGame(game);
    }

    results.valid = Object.values(results).every(
      (result) => typeof result !== "object" || result.valid !== false
    );

    return results;
  }
}