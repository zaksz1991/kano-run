// Persistent storage helpers
export const Storage = {
  get(key, fallback = null) {
    try {
      const val = localStorage.getItem(key);
      if (val === null) return fallback;
      if (!isNaN(val) && val.trim() !== '') return Number(val);
      return val;
    } catch {
      return fallback;
    }
  },

  set(key, value) {
    try {
      localStorage.setItem(key, String(value));
    } catch (e) {
      console.warn('Storage set failed', e);
    }
  },

  getHighScore() { return this.get('kanoHigh', 0); },
  setHighScore(score) { this.set('kanoHigh', score); },

  getMoney() { return this.get('kanoMoney', 0); },
  setMoney(amount) { this.set('kanoMoney', amount); },

  getPaint() { return this.get('kanoPaint', 'classic'); },
  setPaint(id) { this.set('kanoPaint', id); },

  isOwned(paintId) {
    if (paintId === 'classic') return true;
    return this.get('kanoOwned_' + paintId) === 1 || this.get('kanoOwned_' + paintId) === '1';
  },
  setOwned(paintId) { this.set('kanoOwned_' + paintId, 1); },

  getDriverStyle() { return this.get('kanoDriver', 'classic'); },
  setDriverStyle(id) { this.set('kanoDriver', id); },

  isDriverOwned(id) {
    if (id === 'classic') return true;
    return this.get('kanoDriverOwned_' + id) === 1 || this.get('kanoDriverOwned_' + id) === '1';
  },
  setDriverOwned(id) { this.set('kanoDriverOwned_' + id, 1); },

  getCapacity() { return this.get('kanoCap', 3); },
  setCapacity(val) { this.set('kanoCap', val); },

  getSpeedBoost() { return this.get('kanoSpeed', 0); },
  setSpeedBoost(val) { this.set('kanoSpeed', val); },

  getHornPower() { return this.get('kanoHorn', 0); },
  setHornPower(val) { this.set('kanoHorn', val); },

  getSelectedRoute() { return this.get('kanoRoute', 'citycenter'); },
  setSelectedRoute(id) { this.set('kanoRoute', id); },

  getRadioStation() { return this.get('kanoRadio', 'freedom'); },
  setRadioStation(id) { this.set('kanoRadio', id); },

  // Daily missions
  getDailyDate() { return this.get('kanoDailyDate', ''); },
  setDailyDate(d) { this.set('kanoDailyDate', d); },

  getDailyMissionId() { return this.get('kanoDailyMission', ''); },
  setDailyMissionId(id) { this.set('kanoDailyMission', id); },

  getDailyProgress() { return this.get('kanoDailyProg', 0); },
  setDailyProgress(v) { this.set('kanoDailyProg', v); },

  isDailyClaimed() { return this.get('kanoDailyClaimed') === 1 || this.get('kanoDailyClaimed') === '1'; },
  setDailyClaimed(v) { this.set('kanoDailyClaimed', v ? 1 : 0); },

  // Streak
  getStreak() { return this.get('kanoStreak', 0); },
  setStreak(v) { this.set('kanoStreak', v); },

  getLastPlayDate() { return this.get('kanoLastPlay', ''); },
  setLastPlayDate(d) { this.set('kanoLastPlay', d); },

  getSelectedDriver() { return this.get('kanoDriverChar', 'musa'); },
  setSelectedDriver(id) { this.set('kanoDriverChar', id); },

  isDriverUnlocked(id) {
    if (id === 'musa') return true;
    return this.get('kanoDriverUnlock_' + id) === 1 || this.get('kanoDriverUnlock_' + id) === '1';
  },
  unlockDriver(id) { this.set('kanoDriverUnlock_' + id, 1); }
};
