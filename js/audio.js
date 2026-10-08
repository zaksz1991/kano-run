/*
 * Kano Run — Adaidaita Sahu
 * Audio system
 *
 * Local/browser-only audio.
 * No external audio files, APIs, CDNs, or paid services are required.
 *
 * Existing public methods are preserved:
 *   ensure()
 *   beep()
 *   startEngine()
 *   stopEngine()
 *   updateEngine()
 *   horn()
 *   crash()
 *   pickup()
 *   coin()
 *   negotiate()
 *   success()
 *   alert()
 *
 * Additional game audio:
 *   brake()
 *   throttle()
 *   indicator()
 *   passengerCall()
 *   passengerAkwai()
 *   passengerBoard()
 *   passengerDrop()
 *   passengerFare()
 *   fare()
 *   checkpoint()
 *   police()
 *   radioNext()
 *   radioPrevious()
 *   radioToggle()
 *   setRadio()
 *   radioOff()
 *   ambient()
 *   crowd()
 *   speakHausa()
 *   speak()
 *   mute()
 *   unmute()
 *   toggleMute()
 *   setMuted()
 *   setVolume()
 *   unlock()
 */

export const Audio = {
  ctx: null,

  masterGain: null,

  engineOsc: null,
  engineOsc2: null,
  engineGain: null,
  engineFilter: null,

  radioGain: null,
  radioOsc: null,

  ambientTimer: null,
  speechTimer: null,

  muted: false,

  radioOn: false,
  radioIndex: 0,

  initialized: false,

  volume: {
    master: 0.85,
    engine: 0.8,
    effects: 0.9,
    radio: 0.55,
    voice: 0.8,
    ambient: 0.28
  },

  radioStations: [
    {
      name: 'Kano FM',
      short: 'KANO FM',
      frequency: '100.9',
      style: 'talk'
    },
    {
      name: 'Arewa Radio',
      short: 'AREWA',
      frequency: '92.7',
      style: 'arewa'
    },
    {
      name: 'Hausa Drive',
      short: 'HAUSA DRIVE',
      frequency: '98.5',
      style: 'music'
    },
    {
      name: 'Kano Road',
      short: 'KANO ROAD',
      frequency: '88.4',
      style: 'traffic'
    }
  ],

  ensure() {
    if (typeof window === 'undefined') return;

    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;

      if (!AC) return;

      try {
        this.ctx = new AC();
      } catch {
        this.ctx = null;
        return;
      }
    }

    if (!this.masterGain && this.ctx) {
      this.masterGain = this.ctx.createGain();

      this.masterGain.gain.value =
        this.muted ? 0 : this.volume.master;

      this.masterGain.connect(this.ctx.destination);
    }

    if (this.ctx?.state === 'suspended') {
      try {
        const result = this.ctx.resume();

        if (result?.catch) {
          result.catch(() => {});
        }
      } catch {}
    }

    this.initialized = !!this.ctx;
  },

  resume() {
    this.ensure();

    if (this.ctx?.state === 'suspended') {
      try {
        const result = this.ctx.resume();

        if (result?.catch) {
          result.catch(() => {});
        }
      } catch {}
    }
  },

  destination() {
    this.ensure();

    return this.masterGain || this.ctx?.destination || null;
  },

  clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  },

  now() {
    return this.ctx?.currentTime || 0;
  },

  safeDisconnect(node) {
    try {
      node?.disconnect();
    } catch {}
  },

  beep(
    freq,
    dur,
    type = 'square',
    vol = 0.04,
    endFreq = null
  ) {
    this.ensure();

    if (!this.ctx || !this.masterGain || this.muted) {
      return;
    }

    const duration = Math.max(0.02, dur);
    const oscillator = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    oscillator.type = type;
    oscillator.frequency.setValueAtTime(
      Math.max(1, freq),
      this.now()
    );

    if (endFreq !== null) {
      oscillator.frequency.exponentialRampToValueAtTime(
        Math.max(1, endFreq),
        this.now() + duration
      );
    }

    const amount =
      this.clamp(vol, 0.0001, 1) *
      this.volume.effects;

    gain.gain.setValueAtTime(
      amount,
      this.now()
    );

    gain.gain.exponentialRampToValueAtTime(
      0.001,
      this.now() + duration
    );

    oscillator.connect(gain);
    gain.connect(this.masterGain);

    oscillator.start();

    oscillator.stop(
      this.now() + duration + 0.02
    );

    oscillator.onended = () => {
      this.safeDisconnect(oscillator);
      this.safeDisconnect(gain);
    };
  },

  toneSequence(notes, options = {}) {
    this.ensure();

    if (!this.ctx || !this.masterGain || this.muted) {
      return;
    }

    if (!Array.isArray(notes) || !notes.length) {
      return;
    }

    const type = options.type || 'sine';
    const volume = options.volume ?? 0.04;
    const duration = options.duration ?? 0.1;
    const gap = options.gap ?? 0.02;

    notes.forEach((note, index) => {
      const start =
        this.now() +
        index * (duration + gap);

      const oscillator =
        this.ctx.createOscillator();

      const gain =
        this.ctx.createGain();

      oscillator.type = type;

      oscillator.frequency.setValueAtTime(
        Math.max(1, note),
        start
      );

      gain.gain.setValueAtTime(
        this.clamp(volume, 0.0001, 1) *
          this.volume.effects,
        start
      );

      gain.gain.exponentialRampToValueAtTime(
        0.001,
        start + duration
      );

      oscillator.connect(gain);
      gain.connect(this.masterGain);

      oscillator.start(start);
      oscillator.stop(start + duration + 0.02);

      oscillator.onended = () => {
        this.safeDisconnect(oscillator);
        this.safeDisconnect(gain);
      };
    });
  },

  startEngine() {
    this.ensure();

    if (
      !this.ctx ||
      !this.masterGain ||
      this.muted ||
      this.engineOsc
    ) {
      return;
    }

    try {
      this.engineOsc =
        this.ctx.createOscillator();

      this.engineOsc2 =
        this.ctx.createOscillator();

      this.engineGain =
        this.ctx.createGain();

      this.engineFilter =
        this.ctx.createBiquadFilter();

      this.engineFilter.type = 'lowpass';

      this.engineFilter.frequency.value = 900;

      this.engineOsc.type = 'sawtooth';
      this.engineOsc2.type = 'triangle';

      this.engineOsc.frequency.value = 52;
      this.engineOsc2.frequency.value = 78;

      this.engineGain.gain.value =
        0.0001;

      this.engineOsc.connect(
        this.engineFilter
      );

      this.engineOsc2.connect(
        this.engineFilter
      );

      this.engineFilter.connect(
        this.engineGain
      );

      this.engineGain.connect(
        this.masterGain
      );

      this.engineOsc.start();
      this.engineOsc2.start();

      this.engineGain.gain.linearRampToValueAtTime(
        0.018 * this.volume.engine,
        this.now() + 0.25
      );
    } catch {
      this.stopEngine();
    }
  },

  stopEngine() {
    try {
      if (this.engineGain && this.ctx) {
        this.engineGain.gain.cancelScheduledValues(
          this.now()
        );

        this.engineGain.gain.setTargetAtTime(
          0.0001,
          this.now(),
          0.04
        );
      }
    } catch {}

    const osc1 = this.engineOsc;
    const osc2 = this.engineOsc2;

    this.engineOsc = null;
    this.engineOsc2 = null;

    const cleanupDelay = 150;

    setTimeout(() => {
      try {
        osc1?.stop();
      } catch {}

      try {
        osc2?.stop();
      } catch {}

      this.safeDisconnect(osc1);
      this.safeDisconnect(osc2);

      this.safeDisconnect(this.engineFilter);
      this.safeDisconnect(this.engineGain);

      this.engineFilter = null;
      this.engineGain = null;
    }, cleanupDelay);
  },

  updateEngine(speed = 4) {
    if (this.muted) {
      this.stopEngine();
      return;
    }

    if (!this.engineOsc || !this.engineGain) {
      return;
    }

    const safeSpeed =
      this.clamp(Number(speed) || 0, 0, 20);

    const frequency =
      48 + safeSpeed * 6;

    const secondFrequency =
      72 + safeSpeed * 8;

    try {
      this.engineOsc.frequency.setTargetAtTime(
        frequency,
        this.now(),
        0.06
      );

      if (this.engineOsc2) {
        this.engineOsc2.frequency.setTargetAtTime(
          secondFrequency,
          this.now(),
          0.06
        );
      }

      const engineVolume =
        0.009 +
        Math.min(
          0.024,
          safeSpeed * 0.002
        );

      this.engineGain.gain.setTargetAtTime(
        engineVolume * this.volume.engine,
        this.now(),
        0.08
      );

      if (this.engineFilter) {
        this.engineFilter.frequency.setTargetAtTime(
          500 + safeSpeed * 100,
          this.now(),
          0.1
        );
      }
    } catch {}
  },

  horn() {
    this.beep(
      180,
      0.18,
      'sawtooth',
      0.075,
      150
    );

    this.beep(
      220,
      0.12,
      'square',
      0.035,
      180
    );
  },

  brake() {
    this.beep(
      95,
      0.14,
      'sawtooth',
      0.045,
      55
    );
  },

  throttle() {
    this.beep(
      110,
      0.07,
      'triangle',
      0.018,
      155
    );
  },

  indicator() {
    this.beep(
      760,
      0.045,
      'square',
      0.018
    );
  },

  crash() {
    this.beep(
      70,
      0.35,
      'sawtooth',
      0.09,
      38
    );

    this.beep(
      40,
      0.4,
      'square',
      0.055,
      25
    );

    this.beep(
      130,
      0.12,
      'triangle',
      0.035,
      70
    );
  },

  pickup() {
    this.toneSequence(
      [520, 660],
      {
        type: 'sine',
        volume: 0.05,
        duration: 0.08,
        gap: 0.025
      }
    );
  },

  passengerBoard() {
    this.toneSequence(
      [390, 520, 620],
      {
        type: 'sine',
        volume: 0.035,
        duration: 0.075,
        gap: 0.025
      }
    );
  },

  passengerDrop() {
    this.toneSequence(
      [620, 520, 390],
      {
        type: 'sine',
        volume: 0.04,
        duration: 0.08,
        gap: 0.025
      }
    );
  },

  coin() {
    this.toneSequence(
      [880, 1175],
      {
        type: 'sine',
        volume: 0.045,
        duration: 0.06,
        gap: 0.02
      }
    );
  },

  fare() {
    this.toneSequence(
      [660, 880, 1046],
      {
        type: 'triangle',
        volume: 0.045,
        duration: 0.075,
        gap: 0.025
      }
    );
  },

  negotiate() {
    this.beep(
      320,
      0.1,
      'triangle',
      0.05,
      270
    );
  },

  success() {
    this.toneSequence(
      [523, 659, 784],
      {
        type: 'sine',
        volume: 0.05,
        duration: 0.08,
        gap: 0.03
      }
    );
  },

  alert() {
    this.beep(
      400,
      0.08,
      'square',
      0.05
    );

    setTimeout(() => {
      this.beep(
        400,
        0.08,
        'square',
        0.05
      );
    }, 100);
  },

  checkpoint() {
    this.toneSequence(
      [220, 175, 220],
      {
        type: 'square',
        volume: 0.035,
        duration: 0.09,
        gap: 0.05
      }
    );
  },

  police() {
    this.beep(
      520,
      0.16,
      'square',
      0.045,
      760
    );

    setTimeout(() => {
      this.beep(
        760,
        0.16,
        'square',
        0.045,
        520
      );
    }, 180);
  },

  trafficPass() {
    this.beep(
      80,
      0.1,
      'sawtooth',
      0.012,
      60
    );
  },

  pedestrianCall() {
    this.beep(
      600,
      0.08,
      'triangle',
      0.02,
      720
    );
  },

  crowd() {
    this.beep(
      150,
      0.18,
      'sawtooth',
      0.008,
      125
    );

    this.beep(
      230,
      0.14,
      'triangle',
      0.006,
      190
    );
  },

  ambient() {
    if (this.muted) return;

    this.ensure();

    if (!this.ctx) return;

    this.crowd();

    if (this.ambientTimer) {
      clearTimeout(this.ambientTimer);
    }

    const delay =
      3500 +
      Math.random() * 6500;

    this.ambientTimer = setTimeout(
      () => this.ambient(),
      delay
    );
  },

  getSpeechVoice(preferredLanguage = 'ha-NG') {
    if (
      typeof window === 'undefined' ||
      !window.speechSynthesis
    ) {
      return null;
    }

    const voices =
      window.speechSynthesis.getVoices?.() || [];

    if (!voices.length) {
      return null;
    }

    const preferred =
      preferredLanguage.toLowerCase();

    const exact =
      voices.find(
        voice =>
          voice.lang?.toLowerCase() ===
          preferred
      );

    if (exact) return exact;

    const prefix =
      preferred.split('-')[0];

    const matching =
      voices.find(
        voice =>
          voice.lang
            ?.toLowerCase()
            .startsWith(prefix)
      );

    if (matching) return matching;

    const english =
      voices.find(
        voice =>
          voice.lang
            ?.toLowerCase()
            .startsWith('en')
      );

    return english || voices[0];
  },

  speak(text, options = {}) {
    if (
      this.muted ||
      typeof window === 'undefined' ||
      !window.speechSynthesis ||
      !text
    ) {
      return;
    }

    try {
      window.speechSynthesis.cancel();

      const utterance =
        new SpeechSynthesisUtterance(
          String(text)
        );

      const language =
        options.language ||
        options.lang ||
        'ha-NG';

      const voice =
        options.voice ||
        this.getSpeechVoice(language);

      utterance.lang = language;

      if (voice) {
        utterance.voice = voice;
      }

      utterance.rate =
        options.rate ?? 0.9;

      utterance.pitch =
        options.pitch ?? 1;

      utterance.volume =
        this.clamp(
          options.volume ??
            this.volume.voice,
          0,
          1
        );

      window.speechSynthesis.speak(
        utterance
      );
    } catch {}
  },

  speakHausa(text, options = {}) {
    this.speak(
      text,
      {
        ...options,
        language:
          options.language ||
          options.lang ||
          'ha-NG'
      }
    );
  },

  stopSpeech() {
    if (
      typeof window === 'undefined' ||
      !window.speechSynthesis
    ) {
      return;
    }

    try {
      window.speechSynthesis.cancel();
    } catch {}
  },

  passengerCall(destination = 'Sabon Gari') {
    const phrases = [
      `Oga! ${destination}!`,
      `Dan uwa! ${destination}!`,
      `Mai gida! ${destination}!`,
      `Driver! ${destination}!`,
      `Mallam! ${destination}!`,
      `Yallabai! ${destination}!`
    ];

    const phrase =
      phrases[
        Math.floor(
          Math.random() *
          phrases.length
        )
      ];

    this.passengerBoard();

    this.speakHausa(
      phrase,
      {
        rate: 0.88,
        pitch: 1.04
      }
    );
  },

  passengerAkwai(destination = 'nan') {
    this.brake();

    this.speakHausa(
      `Akwai! Tsaya nan, ${destination}.`,
      {
        rate: 0.88,
        pitch: 1.02
      }
    );
  },

  passengerFare(amount) {
    const safeAmount =
      Number(amount) || 0;

    this.speakHausa(
      `Nawa? ${safeAmount} naira.`,
      {
        rate: 0.9,
        pitch: 1.02
      }
    );
  },

  negotiationVoice(type = 'offer') {
    const lines = {
      offer: [
        'Oga, nawa zaka biya?',
        'Mai gida, wannan kudin ya yi kadan.',
        'Dan uwa, mu yi magana da kyau.',
        'Yallabai, kudin mota ya tashi.',
        'Mallam, mu kara kadan.'
      ],

      accept: [
        'To shikenan.',
        'Madalla, mu tafi.',
        'To, mun yi.',
        'Shikenan.',
        'Madalla.'
      ],

      reject: [
        'A a, wannan ya yi kadan.',
        'Kai, ba zai yiwu ba.',
        'Mu kara kadan.',
        'Wannan kudin ya yi kadan.',
        'A kara mana kadan.'
      ]
    };

    const choices =
      lines[type] || lines.offer;

    const line =
      choices[
        Math.floor(
          Math.random() *
          choices.length
        )
      ];

    this.negotiate();

    this.speakHausa(
      line,
      {
        rate: 0.88,
        pitch: 1.01
      }
    );
  },

  getRadioStation() {
    return (
      this.radioStations[
        this.radioIndex %
          this.radioStations.length
      ] ||
      this.radioStations[0]
    );
  },

  radioTuneSound() {
    this.beep(
      260,
      0.06,
      'sine',
      0.025,
      420
    );

    this.beep(
      420,
      0.07,
      'sine',
      0.018,
      700
    );
  },

  setRadio(index = 0) {
    this.ensure();

    if (!this.radioStations.length) {
      return;
    }

    const count =
      this.radioStations.length;

    this.radioIndex =
      ((Number(index) || 0) %
        count +
        count) %
      count;

    this.radioOn = true;

    this.radioTuneSound();

    const station =
      this.getRadioStation();

    if (!station) return;

    this.speak(
      `${station.name}. ${station.frequency} FM.`,
      {
        language: 'en-NG',
        rate: 0.9,
        pitch: 1,
        volume:
          this.volume.radio
      }
    );

    setTimeout(() => {
      if (!this.radioOn || this.muted) {
        return;
      }

      this.updateRadio();
    }, 650);
  },

  radioNext() {
    this.setRadio(
      this.radioIndex + 1
    );
  },

  radioPrevious() {
    this.setRadio(
      this.radioIndex - 1
    );
  },

  radioToggle() {
    if (this.radioOn) {
      this.radioOff();
    } else {
      this.setRadio(
        this.radioIndex
      );
    }
  },

  radioOff() {
    this.radioOn = false;

    this.stopSpeech();

    if (this.radioOsc) {
      try {
        this.radioOsc.stop();
      } catch {}

      this.safeDisconnect(
        this.radioOsc
      );

      this.radioOsc = null;
    }

    this.safeDisconnect(
      this.radioGain
    );

    this.radioGain = null;
  },

  updateRadio() {
    if (
      !this.radioOn ||
      this.muted
    ) {
      return;
    }

    const station =
      this.getRadioStation();

    if (!station) {
      return;
    }

    switch (station.style) {
      case 'talk': {
        /*
         * Short low-level carrier/noise-like
         * tones imitate an old FM radio speaker.
         */
        this.beep(
          170,
          0.18,
          'sine',
          0.004,
          190
        );

        break;
      }

      case 'arewa': {
        this.beep(
          220,
          0.16,
          'triangle',
          0.005,
          280
        );

        break;
      }

      case 'music': {
        this.toneSequence(
          [330, 392, 494],
          {
            type: 'triangle',
            volume: 0.004,
            duration: 0.11,
            gap: 0.025
          }
        );

        break;
      }

      case 'traffic': {
        this.beep(
          120,
          0.2,
          'sine',
          0.004,
          90
        );

        break;
      }

      default: {
        this.beep(
          200,
          0.16,
          'sine',
          0.004
        );
      }
    }

    /*
     * Give the radio actual spoken content rather
     * than only a station-change sound.
     */
    const stationLines = {
      talk: [
        'Labarai daga Kano da Arewa.',
        'Ku tuki a hankali kuma ku kula da hanya.',
        'Traffic na iya yin yawa a cikin birni.',
        'Ku bi dokokin hanya.'
      ],

      arewa: [
        'Sannu Kano. Wannan Arewa Radio.',
        'Mu kula da hanya, mu kiyaye juna.',
        'Labarai da bayanai daga Arewa.'
      ],

      music: [
        'Hausa Drive. Kiɗa da nishaɗi a hanya.',
        'Kano Drive, muna tafiya lafiya.'
      ],

      traffic: [
        'Kano Road Traffic Update.',
        'Ku rage gudu a wuraren cunkoso.',
        'Ku kula da masu tsallaka hanya.'
      ]
    };

    const lines =
      stationLines[station.style] ||
      stationLines.talk;

    const line =
      lines[
        Math.floor(
          Math.random() *
          lines.length
        )
      ];

    if (
      typeof window !== 'undefined' &&
      window.speechSynthesis
    ) {
      this.speak(
        line,
        {
          language:
            station.style === 'arewa'
              ? 'ha-NG'
              : 'en-NG',
          rate: 0.9,
          pitch: 1,
          volume:
            this.volume.radio
        }
      );
    }
  },

  setMuted(value) {
    this.muted = !!value;

    this.ensure();

    if (this.masterGain) {
      this.masterGain.gain.setTargetAtTime(
        this.muted
          ? 0
          : this.volume.master,
        this.now(),
        0.03
      );
    }

    if (this.muted) {
      this.stopSpeech();
      this.radioOff();
      this.stopEngine();
    }
  },

  mute() {
    this.setMuted(true);
  },

  unmute() {
    this.setMuted(false);
    this.ensure();
  },

  toggleMute() {
    this.setMuted(!this.muted);

    return this.muted;
  },

  setVolume(value) {
    const volume =
      this.clamp(
        Number(value) || 0,
        0,
        1
      );

    this.volume.master = volume;

    this.ensure();

    if (this.masterGain) {
      this.masterGain.gain.setTargetAtTime(
        this.muted ? 0 : volume,
        this.now(),
        0.03
      );
    }
  },

  unlock() {
    this.ensure();

    if (!this.ctx) {
      return;
    }

    try {
      if (this.ctx.state === 'suspended') {
        const result =
          this.ctx.resume();

        if (result?.catch) {
          result.catch(() => {});
        }
      }

      /*
       * Very quiet silent oscillator used only to
       * unlock Web Audio after a user gesture.
       */
      const oscillator =
        this.ctx.createOscillator();

      const gain =
        this.ctx.createGain();

      gain.gain.value = 0.00001;

      oscillator.connect(gain);
      gain.connect(this.ctx.destination);

      oscillator.start();

      oscillator.stop(
        this.now() + 0.02
      );

      oscillator.onended = () => {
        this.safeDisconnect(
          oscillator
        );

        this.safeDisconnect(
          gain
        );
      };
    } catch {}
  }
};