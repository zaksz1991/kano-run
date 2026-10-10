/* Kano Run — audio adapter
 * Uses existing files in /public/audio; no audio assets are replaced.
 * Effects without dedicated MP3s use lightweight Web Audio tones.
 */
const ASSET_BASE = '/audio/';
const FILES = {
  engine: 'engine.mp3', horn: 'horn.mp3', radio: 'radio-kano.mp3',
  arewa: 'arewa.mp3', cool: 'cool.mp3', freedom: 'freedom.mp3',
  rahama: 'rahama.mp3', ruffneck: 'ruffneck.mp3', wazobia: 'wazobia.mp3',
  whistle: 'whistle.mp3'
};
const RADIO_FILES = {
  'radio kano': 'radio', 'kano': 'radio', 'radio-kano': 'radio',
  'arewa radio': 'arewa', 'arewa': 'arewa',
  'cool fm': 'cool', 'cool': 'cool',
  'freedom radio': 'freedom', 'freedom': 'freedom',
  'rahama radio': 'rahama', 'rahama': 'rahama',
  'ruffneck radio': 'ruffneck', 'ruffneck': 'ruffneck',
  'wazobia fm': 'wazobia', 'wazobia': 'wazobia'
};
const tracks = new Map();
let audioContext = null;
let radioKey = 'radio';
let muted = false;
let engineStarted = false;

function getTrack(key) {
  if (!FILES[key]) return null;
  if (!tracks.has(key)) {
    const a = new Audio(`${ASSET_BASE}${FILES[key]}`);
    a.preload = key === 'engine' ? 'auto' : 'metadata';
    a.loop = key === 'engine' || key === 'radio' || key === 'arewa' || key === 'cool' || key === 'freedom' || key === 'rahama' || key === 'ruffneck' || key === 'wazobia';
    a.volume = key === 'engine' ? 0.28 : key === 'horn' || key === 'whistle' ? 0.75 : 0.42;
    a.addEventListener('error', () => console.warn(`[Kano Run audio] Could not load /audio/${FILES[key]}`), { once: true });
    tracks.set(key, a);
  }
  return tracks.get(key);
}
function play(key, options = {}) {
  if (muted || typeof window === 'undefined') return Promise.resolve(false);
  const a = getTrack(key);
  if (!a) return Promise.resolve(false);
  try {
    if (options.restart !== false) a.currentTime = 0;
    if (options.volume != null) a.volume = Math.max(0, Math.min(1, options.volume));
    if (options.loop != null) a.loop = !!options.loop;
    const result = a.play();
    return result?.then ? result.then(() => true).catch(() => false) : Promise.resolve(true);
  } catch { return Promise.resolve(false); }
}
function stop(key, reset = false) {
  const a = tracks.get(key);
  if (!a) return;
  try { a.pause(); if (reset) a.currentTime = 0; } catch {}
}
function context() {
  if (typeof window === 'undefined') return null;
  const Ctx = window.AudioContext || window.webkitAudioContext;
  if (!Ctx) return null;
  try { audioContext ||= new Ctx(); if (audioContext.state === 'suspended') audioContext.resume().catch(() => {}); return audioContext; } catch { return null; }
}
function tone(freq = 440, duration = 0.12, type = 'sine', volume = 0.055) {
  if (muted) return;
  const ctx = context(); if (!ctx) return;
  try {
    const osc = ctx.createOscillator(), gain = ctx.createGain();
    osc.type = type; osc.frequency.setValueAtTime(freq, ctx.currentTime);
    gain.gain.setValueAtTime(volume, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);
    osc.connect(gain); gain.connect(ctx.destination); osc.start(); osc.stop(ctx.currentTime + duration);
  } catch {}
}
function speak(text, options = {}) {
  if (muted || typeof window === 'undefined' || !('speechSynthesis' in window) || !text) return;
  try {
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(String(text));
    utterance.rate = Math.max(0.65, Math.min(1.35, Number(options.rate) || 1));
    utterance.pitch = Math.max(0.5, Math.min(2, Number(options.pitch) || 1));
    utterance.volume = Math.max(0, Math.min(1, Number(options.volume) || 0.85));
    const voices = window.speechSynthesis.getVoices();
    const hausa = voices.find(v => /^ha([_-]|$)/i.test(v.lang));
    if (hausa) utterance.voice = hausa;
    window.speechSynthesis.speak(utterance);
  } catch {}
}
function normaliseRadio(name) {
  const value = String(name || '').trim().toLowerCase();
  if (RADIO_FILES[value]) return RADIO_FILES[value];
  if (value.includes('arewa')) return 'arewa';
  if (value.includes('freedom')) return 'freedom';
  if (value.includes('rahama')) return 'rahama';
  if (value.includes('ruffneck')) return 'ruffneck';
  if (value.includes('wazobia')) return 'wazobia';
  if (value.includes('cool')) return 'cool';
  return 'radio';
}
function stopAllRadio() { for (const key of ['radio','arewa','cool','freedom','rahama','ruffneck','wazobia']) stop(key); }

export const Audio = {
  ensure() { context(); return this; },
  setMuted(value) { muted = !!value; if (muted) { stop('engine'); stopAllRadio(); try { window.speechSynthesis?.cancel(); } catch {} } return muted; },
  toggleMute() { return this.setMuted(!muted); },
  isMuted() { return muted; },
  startEngine() { engineStarted = true; return play('engine', { restart: false, loop: true }); },
  stopEngine() { engineStarted = false; stop('engine'); },
  updateEngine(speed) {
    const a = getTrack('engine'); if (!a) return;
    const n = Number(speed) || 0;
    try { a.playbackRate = Math.max(0.82, Math.min(1.55, 0.85 + n / 34)); a.volume = muted ? 0 : Math.max(0.12, Math.min(0.38, 0.15 + n / 150)); } catch {}
    if (n > 0.25 && !engineStarted) this.startEngine();
    if (n <= 0.25 && engineStarted) this.stopEngine();
  },
  startRadioBed(name) { if (name) radioKey = normaliseRadio(name); return play(radioKey, { restart: false, loop: true }); },
  stopRadioBed() { stopAllRadio(); },
  radioTune(name) { stopAllRadio(); if (name) radioKey = normaliseRadio(name); return play(radioKey, { restart: true, loop: true }); },
  horn() { play('horn'); },
  brake() { tone(155, 0.2, 'sawtooth', 0.045); },
  crash() { tone(95, 0.32, 'sawtooth', 0.09); setTimeout(() => tone(65, 0.22, 'triangle', 0.06), 65); },
  pickup() { tone(660, 0.09); setTimeout(() => tone(880, 0.12), 75); },
  success() { tone(523, 0.1); setTimeout(() => tone(659, 0.1), 95); setTimeout(() => tone(784, 0.16), 190); },
  coin() { tone(1100, 0.07, 'sine', 0.05); setTimeout(() => tone(1450, 0.09, 'sine', 0.04), 60); },
  negotiate() { tone(360, 0.1, 'triangle'); setTimeout(() => tone(430, 0.12, 'triangle'), 100); },
  alert() { tone(740, 0.11, 'square', 0.035); setTimeout(() => tone(540, 0.12, 'square', 0.035), 140); },
  siren() { tone(650, 0.24, 'sawtooth', 0.04); setTimeout(() => tone(880, 0.24, 'sawtooth', 0.04), 250); },
  speak, speakHausa(text) { if (text === 'horn') return; speak(text, { rate: 0.92 }); },
  voicePickup() { speak('Akwai wuri?'); },
  voiceSannu() { speak('Sannu da aiki.'); },
  voiceDrop() { speak('Na gode. Sai anjima.'); },
  voiceAkwai() { speak('Akwai!'); },
  voiceKarota() { speak('KAROTA! A tsaya.'); },
  voiceYanDaba() { speak('A kula!'); },
  voiceLowFuel() { speak('Mai ya kusa karewa.'); },
  voiceRefuel() { speak('An kara mai.'); },
  steer() { tone(300, 0.045, 'triangle', 0.018); },
  playSteer() { this.steer(); },
  whistle() { play('whistle'); },
  destroy() { stop('engine'); stopAllRadio(); try { window.speechSynthesis?.cancel(); } catch {} }
};

export default Audio;
