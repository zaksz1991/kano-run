// Add to main.js imports:
import { KanoSystemicGameplayBridge } from './KanoSystemicGameplayBridge.js';

// Declare with other lifecycle instances:
let systemicGameplay = null;

// After `game` is created:
try {
  systemicGameplay = new KanoSystemicGameplayBridge({ game, root: container });
} catch (error) {
  console.warn('[Kano Life] systemic gameplay bridge unavailable', error);
}

// In the existing frame loop, after game.tick(dt):
systemicGameplay?.update(dt, { state: game?.s });

// In pagehide/unload cleanup:
systemicGameplay?.dispose();
