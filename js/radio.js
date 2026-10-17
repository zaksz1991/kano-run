/**
 * Kano Run — simulated radio (Web Audio + SpeechSynthesis)
 * No streaming API required — works offline/free
 * Game Developer: Hassan Zakariya
 */
import { Audio } from './audio.js';
import { CONFIG } from './config.js';

const STATIONS = [
  { id: 'freedom', name: 'Freedom Radio', tag: 'Kano\'s voice' },
  { id: 'arewa', name: 'Arewa Radio', tag: 'Arewa daidai' },
  { id: 'rahama', name: 'Rahama Radio', tag: 'Rahama' },
  { id: 'kanoradio', name: 'Radio Kano', tag: 'BBC Hausa partner' },
  { id: 'coolfm', name: 'Cool FM', tag: 'The cool one' },
  { id: 'express', name: 'Express Radio', tag: 'Express news' }
];

const ANNOUNCE = [
  'Sannu da safe. Traffic heavy near Sabon Gari.',
  'KAROTA active on Zoo Road. Drive carefully.',
  'Mu tafi lafiya. Safe journey in Kano.',
  'Fuel price update coming after this song.',
  'Adaidaita Sahu — load three at the back, two in front.',
  'Na gode for listening. This is Radio Kano.',
  'Ina kwana. Good morning Kano State.',
  'Yan daba report — stay alert at night.'
];

export const Radio = {
  index: 0,
  timer: 0,
  playing: false,

  stations() {
    return (CONFIG.RADIO && CONFIG.RADIO.length) ? CONFIG.RADIO : STATIONS;
  },

  current() {
    const list = this.stations();
    return list[this.index % list.length];
  },

  start() {
    this.playing = true;
    try {
      Audio.ensure();
      Audio.startRadioBed();
    } catch (e) {}
  },

  stop() {
    this.playing = false;
    try { Audio.stopRadioBed(); } catch (e) {}
  },

  next() {
    const list = this.stations();
    this.index = (this.index + 1) % list.length;
    const st = this.current();
    try {
      Audio.radioTune(st.name);
    } catch (e) {}
    return st;
  },

  /** Call from game update while PLAYING */
  update(frame) {
    if (!this.playing) return;
    // Periodic Hausa-style traffic blurb
    if (frame > 0 && frame % 900 === 0) {
      const line = ANNOUNCE[Math.floor(Math.random() * ANNOUNCE.length)];
      try {
        Audio.speak(line, { rate: 0.92, pitch: 1.02, volume: 0.75 });
      } catch (e) {}
    }
  }
};
