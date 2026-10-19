const clamp = (v, min, max) => Math.max(min, Math.min(max, v));

/** Dynamic sound mixer. Audio begins only after a user gesture, per browser autoplay rules. */
export class KanoDynamicSoundDirector {
  constructor({ sounds = {}, masterVolume = 0.8, ambienceVolume = 0.45, onState = () => {} } = {}) {
    this.sounds = new Map(); this.masterVolume = clamp(masterVolume, 0, 1); this.ambienceVolume = clamp(ambienceVolume, 0, 1);
    this.onState = onState; this.context = null; this.master = null; this.ambienceBus = null; this.unlocked = false; this.muted = false; this.active = new Map(); this.buffers = new Map(); this.loading = new Map(); this.disposed = false;
    for (const [key, value] of Object.entries(sounds)) this.register(key, value);
  }
  register(key, config) {
    if (!key || !config) return;
    this.sounds.set(key, typeof config === 'string' ? { src: config, loop: false, bus: 'sfx', volume: 1 } : { loop: false, bus: 'sfx', volume: 1, ...config });
  }
  async unlock() {
    if (this.disposed) return false;
    try {
      const AudioContextClass = globalThis.AudioContext || globalThis.webkitAudioContext;
      if (!AudioContextClass) return false;
      if (!this.context) {
        this.context = new AudioContextClass(); this.master = this.context.createGain(); this.ambienceBus = this.context.createGain();
        this.master.gain.value = this.muted ? 0 : this.masterVolume; this.ambienceBus.gain.value = this.ambienceVolume;
        this.ambienceBus.connect(this.master); this.master.connect(this.context.destination);
      }
      await this.context.resume(); this.unlocked = this.context.state === 'running';
      try { this.onState({ unlocked: this.unlocked, muted: this.muted }); } catch {}
      return this.unlocked;
    } catch { return false; }
  }
  async load(key) {
    if (this.buffers.has(key)) return this.buffers.get(key);
    if (this.loading.has(key)) return this.loading.get(key);
    const config = this.sounds.get(key); if (!config?.src || !this.context) return null;
    const promise = (async () => {
      try {
        const response = await fetch(config.src); if (!response.ok) throw new Error(`Audio HTTP ${response.status}`);
        const data = await response.arrayBuffer(); const buffer = await this.context.decodeAudioData(data);
        this.buffers.set(key, buffer); return buffer;
      } catch { return null; } finally { this.loading.delete(key); }
    })();
    this.loading.set(key, promise); return promise;
  }
  async play(key, { volume, rate = 1, loop, restart = false } = {}) {
    if (!this.unlocked && !(await this.unlock())) return false;
    const config = this.sounds.get(key); if (!config || this.muted) return false;
    if (this.active.has(key) && !restart) return true;
    if (restart) this.stop(key, 0.03);
    const buffer = await this.load(key); if (!buffer || this.disposed) return false;
    try {
      const source = this.context.createBufferSource(); const gain = this.context.createGain();
      source.buffer = buffer; source.loop = loop ?? config.loop; source.playbackRate.value = clamp(rate, 0.5, 2.5);
      gain.gain.value = clamp(volume ?? config.volume, 0, 1);
      source.connect(gain); gain.connect(config.bus === 'ambience' ? this.ambienceBus : this.master);
      source.start(0); const record = { source, gain, bus: config.bus || 'sfx' }; this.active.set(key, record);
      source.onended = () => { if (this.active.get(key) === record) this.active.delete(key); try { source.disconnect(); gain.disconnect(); } catch {} };
      return true;
    } catch { return false; }
  }
  stop(key, fadeSeconds = 0.12) {
    const record = this.active.get(key); if (!record || !this.context) return;
    this.active.delete(key); const now = this.context.currentTime; const duration = Math.max(0, fadeSeconds);
    try {
      record.gain.gain.cancelScheduledValues(now); record.gain.gain.setValueAtTime(record.gain.gain.value, now);
      record.gain.gain.linearRampToValueAtTime(0, now + duration); record.source.stop(now + duration + 0.02);
    } catch { try { record.source.stop(); } catch {} }
  }
  setMuted(muted) {
    this.muted = Boolean(muted); if (this.master && this.context) this.master.gain.setTargetAtTime(this.muted ? 0 : this.masterVolume, this.context.currentTime, 0.04);
    if (this.muted) for (const key of this.active.keys()) { const config = this.sounds.get(key); if (config?.bus !== 'ambience') this.stop(key, 0.02); }
    try { this.onState({ unlocked: this.unlocked, muted: this.muted }); } catch {}
  }
  setMasterVolume(value) { this.masterVolume = clamp(Number(value) || 0, 0, 1); if (this.master && this.context && !this.muted) this.master.gain.setTargetAtTime(this.masterVolume, this.context.currentTime, 0.04); }
  setAmbienceVolume(value) { this.ambienceVolume = clamp(Number(value) || 0, 0, 1); if (this.ambienceBus && this.context) this.ambienceBus.gain.setTargetAtTime(this.ambienceVolume, this.context.currentTime, 0.04); }
  async setEngineState({ rpm = 0, throttle = 0, running = false, key = 'engine' } = {}) {
    if (!running || rpm <= 0) { this.stop(key, 0.18); return; }
    await this.play(key, { loop: true, rate: clamp(0.72 + rpm / 7000, 0.72, 1.65), volume: clamp(0.2 + throttle * 0.65, 0.12, 0.9) });
    const active = this.active.get(key); if (active && this.context) {
      const config = this.sounds.get(key); const target = clamp(0.2 + throttle * 0.65, 0.12, 0.9) * (config?.volume ?? 1);
      active.gain.gain.setTargetAtTime(this.muted ? 0 : target, this.context.currentTime, 0.08);
      active.source.playbackRate.setTargetAtTime(clamp(0.72 + rpm / 7000, 0.72, 1.65), this.context.currentTime, 0.08);
    }
  }
  async setAmbience(key) {
    for (const [activeKey, record] of this.active) if (record.bus === 'ambience' && activeKey !== key) this.stop(activeKey, 0.6);
    if (key) await this.play(key, { loop: true, volume: 1 });
  }
  async oneShot(key, options = {}) { return this.play(key, { ...options, loop: false, restart: true }); }
  dispose() {
    if (this.disposed) return; this.disposed = true;
    for (const key of [...this.active.keys()]) this.stop(key, 0);
    try { this.master?.disconnect(); this.ambienceBus?.disconnect(); } catch {}
    if (this.context && this.context.state !== 'closed') this.context.close().catch(() => {});
    this.active.clear(); this.buffers.clear(); this.loading.clear();
  }
}
