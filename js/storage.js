
const S = {
  get(k, d = null) {
    try { const v = localStorage.getItem(k); return v === null ? d : JSON.parse(v); } catch { return d; }
  },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} },
  getMoney() { return Number(this.get('kanoMoney', 0)) || 0; },
  setMoney(n) { this.set('kanoMoney', n); },
  getHighScore() { return Number(this.get('kanoHigh', 0)) || 0; },
  setHighScore(n) { this.set('kanoHigh', n); },
  getRoute() { return this.get('kanoRoute', 'citycenter'); },
  setRoute(id) { this.set('kanoRoute', id); },
  getDriver() { return this.get('kanoDriver', 'ruffneck'); },
  setDriver(id) { this.set('kanoDriver', id); },
  getRadio() { return this.get('kanoRadio', 0); },
  setRadio(i) { this.set('kanoRadio', i); },
  getMuted() { return !!this.get('kanoMuted', false); },
  setMuted(v) { this.set('kanoMuted', !!v); },
  getLowQuality() { return !!this.get('kanoLQ', false); },
  setLowQuality(v) { this.set('kanoLQ', !!v); },
  getSeenTutorial() { return !!this.get('kanoTut', false); },
  setSeenTutorial() { this.set('kanoTut', true); },
  getStreak() { return Number(this.get('kanoStreak', 0)) || 0; },
  setStreak(n) { this.set('kanoStreak', n); },
  getLastDaily() { return this.get('kanoLastDaily', ''); },
  setLastDaily(d) { this.set('kanoLastDaily', d); },
  isDailyClaimed() {
    const today = new Date().toISOString().slice(0, 10);
    return this.getLastDaily() === today;
  },
  claimDaily() {
    const today = new Date().toISOString().slice(0, 10);
    const last = this.getLastDaily();
    let streak = this.getStreak();
    if (last) {
      const prev = new Date(last);
      const diff = (new Date(today) - prev) / 86400000;
      streak = diff === 1 ? streak + 1 : 1;
    } else streak = 1;
    this.setStreak(streak);
    this.setLastDaily(today);
    return streak;
  },
  getPaint() { return this.get('kanoPaint', 'classic'); },
  setPaint(id) { this.set('kanoPaint', id); },
  getLeaderboard() { return this.get('kanoLB', []) || []; },
  addRun(entry) {
    const list = this.getLeaderboard();
    list.push(entry);
    list.sort((a, b) => b.score - a.score);
    this.set('kanoLB', list.slice(0, 10));
  },
  getAchievements() { return this.get('kanoAch', {}) || {}; },
  unlockAchievement(id) {
    const a = this.getAchievements();
    if (a[id]) return false;
    a[id] = Date.now();
    this.set('kanoAch', a);
    return true;
  }
};
export { S as Storage };
