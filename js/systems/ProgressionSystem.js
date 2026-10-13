import { GAME_CONFIG } from "../core/config.js";

const DEFAULTS = {
  baseXP: 100,
  xpMultiplier: 1.5,
  maxLevel: 50,
};

export default class ProgressionSystem {
  constructor({ gameState, eventBus = null, config = {} } = {}) {
    if (!gameState) throw new Error("ProgressionSystem requires gameState.");
    
    this.gameState = gameState;
    this.eventBus = eventBus;
    this.config = { ...DEFAULTS, ...(GAME_CONFIG?.progression ?? {}), ...config };
    
    // Initialize from saved profile
    this.currentLevel = this.gameState.profile?.level || 1;
    this.currentXP = this.gameState.profile?.xp || 0;
    
    this._disposers = [];
    this._bindEvents();
  }

  _bindEvents() {
    // Listen for run completion to award bulk XP
    this._subscribe("run:finished", (payload) => {
      if (payload?.xp) this.addXP(payload.xp);
    });
    
    // Listen for individual deliveries for incremental XP
    this._subscribe("passenger:delivered", (payload) => {
      if (payload?.xp) this.addXP(payload.xp);
    });
  }

  getXPForNextLevel() {
    return Math.floor(this.config.baseXP * Math.pow(this.config.xpMultiplier, this.currentLevel - 1));
  }

  addXP(amount) {
    if (amount <= 0 || this.currentLevel >= this.config.maxLevel) return;
    
    this.currentXP += amount;
    let xpNeeded = this.getXPForNextLevel();
    
    // Handle multiple level ups at once
    while (this.currentXP >= xpNeeded && this.currentLevel < this.config.maxLevel) {
      this.currentXP -= xpNeeded;
      this.currentLevel++;
      
      this.emit("progression:level-up", { 
        level: this.currentLevel, 
        xpNeeded: this.getXPForNextLevel() 
      });
      
      xpNeeded = this.getXPForNextLevel();
    }
    
    this.emit("progression:updated", { 
      xp: this.currentXP, 
      level: this.currentLevel, 
      xpNeeded 
    });
  }

  getSnapshot() {
    return {
      level: this.currentLevel,
      xp: this.currentXP,
      xpNeeded: this.getXPForNextLevel(),
      maxLevel: this.config.maxLevel,
      progress: Math.min(1, this.currentXP / this.getXPForNextLevel())
    };
  }

  emit(eventName, payload) {
    this.eventBus?.emit?.(eventName, payload);
  }

  _subscribe(event, handler) {
    if (!this.eventBus?.on) return;
    const unsub = this.eventBus.on(event, handler);
    if (typeof unsub === "function") this._disposers.push(unsub);
  }

  dispose() {
    for (const unsub of this._disposers) unsub();
    this._disposers = [];
  }
}