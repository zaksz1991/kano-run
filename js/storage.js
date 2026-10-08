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
  setRoute(id) { this.set('kanoRoute', id); }
};
export { S as Storage };
