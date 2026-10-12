import { CONFIG } from "./config.js";

/* =========================================================
   KANO RUN — AUDIO SYSTEM
   Engine, horn, siren, radio, ambience and audio controls
   ========================================================= */

const AudioSystem = (() => {
  let context = null;
  let masterGain = null;
  let engineGain = null;
  let ambienceGain = null;
  let radioGain = null;

  let engineOscillator = null;
  let engineOscillator2 = null;
  let engineFilter = null;
  let engineRunning = false;

  let ambienceOscillator = null;
  let ambienceRunning = false;

  let muted = false;
  let unlocked = false;
  let masterVolume = 0.65;
  let engineVolume = 0.3;
  let radioVolume = 0.35;
  let ambienceVolume = 0.15;

  let engineSpeed = 0;
  let engineIntensity = 0;

  const activeNodes = new Set();

  const safeNumber = (value, fallback = 0) =>
    Number.isFinite(Number(value)) ? Number(value) : fallback;

  const clamp = (value, min, max) =>
    Math.max(min, Math.min(max, value));

  function createContext() {
    if (context) return context;

    const AudioContextClass =
      window.AudioContext || window.webkitAudioContext;

    if (!AudioContextClass) return null;

    try {
      context = new AudioContextClass();

      masterGain = context.createGain();
      engineGain = context.createGain();
      ambienceGain = context.createGain();
      radioGain = context.createGain();

      engineGain.connect(masterGain);
      ambienceGain.connect(masterGain);
      radioGain.connect(masterGain);
      masterGain.connect(context.destination);

      masterGain.gain.value = muted ? 0 : masterVolume;
      engineGain.gain.value = engineVolume;
      ambienceGain.gain.value = ambienceVolume;
      radioGain.gain.value = radioVolume;

      return context;
    } catch (error) {
      console.warn("Kano Run audio initialization failed:", error);
      context = null;
      return null;
    }
  }

  function ensureRunning() {
    const audioContext = createContext();

    if (!audioContext) return false;

    if (audioContext.state === "suspended") {
      audioContext.resume().catch(() => {});
    }

    unlocked = true;
    return true;
  }

  function trackNode(node) {
    if (!node) return node;

    activeNodes.add(node);

    node.addEventListener?.(
      "ended",
      () => activeNodes.delete(node),
      { once: true }
    );

    return node;
  }

  function stopNode(node) {
    if (!node) return;

    try {
      node.stop();
    } catch {
      // Node may already have stopped.
    }

    try {
      node.disconnect();
    } catch {
      // Node may already be disconnected.
    }

    activeNodes.delete(node);
  }

  function createTone({
    frequency = 440,
    duration = 0.15,
    type = "sine",
    volume = 0.2,
    destination = null,
    endFrequency = null,
    delay = 0,
  } = {}) {
    if (!ensureRunning()) return null;

    const startAt = context.currentTime + Math.max(0, delay);
    const length = Math.max(0.02, duration);

    const oscillator = context.createOscillator();
    const gain = context.createGain();

    oscillator.type = type;
    oscillator.frequency.setValueAtTime(
      Math.max(20, frequency),
      startAt
    );

    if (endFrequency !== null) {
      oscillator.frequency.exponentialRampToValueAtTime(
        Math.max(20, endFrequency),
        startAt + length
      );
    }

    gain.gain.setValueAtTime(0.0001, startAt);
    gain.gain.exponentialRampToValueAtTime(
      Math.max(0.0002, volume),
      startAt + Math.min(0.025, length / 3)
    );

    gain.gain.exponentialRampToValueAtTime(
      0.0001,
      startAt + length
    );

    oscillator.connect(gain);
    gain.connect(destination || masterGain);

    oscillator.start(startAt);
    oscillator.stop(startAt + length + 0.03);

    trackNode(oscillator);

    oscillator.addEventListener(
      "ended",
      () => {
        try {
          oscillator.disconnect();
          gain.disconnect();
        } catch {
          // Already disconnected.
        }
      },
      { once: true }
    );

    return oscillator;
  }

  function createNoise({
    duration = 0.25,
    volume = 0.12,
    frequency = 1200,
    destination = null,
  } = {}) {
    if (!ensureRunning()) return null;

    const sampleRate = context.sampleRate;
    const length = Math.max(
      1,
      Math.floor(sampleRate * duration)
    );

    const buffer = context.createBuffer(
      1,
      length,
      sampleRate
    );

    const data = buffer.getChannelData(0);

    for (let i = 0; i < length; i++) {
      const fade = 1 - i / length;
      data[i] = (Math.random() * 2 - 1) * fade;
    }

    const source = context.createBufferSource();
    const filter = context.createBiquadFilter();
    const gain = context.createGain();

    source.buffer = buffer;
    filter.type = "lowpass";
    filter.frequency.value = frequency;

    gain.gain.setValueAtTime(
      Math.max(0.0001, volume),
      context.currentTime
    );

    gain.gain.exponentialRampToValueAtTime(
      0.0001,
      context.currentTime + duration
    );

    source.connect(filter);
    filter.connect(gain);
    gain.connect(destination || masterGain);

    source.start();
    trackNode(source);

    source.addEventListener(
      "ended",
      () => {
        try {
          filter.disconnect();
          gain.disconnect();
        } catch {
          // Already disconnected.
        }
      },
      { once: true }
    );

    return source;
  }

  /* -------------------------------------------------------
     ENGINE
     ------------------------------------------------------- */

  function startEngine() {
    if (engineRunning || !ensureRunning()) return;

    try {
      engineOscillator = context.createOscillator();
      engineOscillator2 = context.createOscillator();
      engineFilter = context.createBiquadFilter();

      engineOscillator.type = "sawtooth";
      engineOscillator2.type = "triangle";

      engineOscillator.frequency.value = 48;
      engineOscillator2.frequency.value = 24;

      engineFilter.type = "lowpass";
      engineFilter.frequency.value = 220;

      engineOscillator.connect(engineFilter);
      engineOscillator2.connect(engineFilter);
      engineFilter.connect(engineGain);

      engineOscillator.start();
      engineOscillator2.start();

      engineRunning = true;
      updateEngine(engineSpeed, engineIntensity);
    } catch (error) {
      console.warn("Could not start engine audio:", error);
      stopEngine();
    }
  }

  function updateEngine(speed = 0, intensity = 0) {
    engineSpeed = clamp(safeNumber(speed), 0, 100);
    engineIntensity = clamp(safeNumber(intensity), 0, 1);

    if (!engineRunning || !context) return;

    const now = context.currentTime;
    const speedRatio = engineSpeed / 100;

    const baseFrequency = 38 + speedRatio * 115;
    const acceleration = engineIntensity * 28;

    engineOscillator.frequency.setTargetAtTime(
      baseFrequency + acceleration,
      now,
      0.08
    );

    engineOscillator2.frequency.setTargetAtTime(
      baseFrequency * 0.48 + acceleration * 0.4,
      now,
      0.1
    );

    engineFilter.frequency.setTargetAtTime(
      180 + speedRatio * 1100,
      now,
      0.12
    );

    engineGain.gain.setTargetAtTime(
      muted ? 0 : engineVolume * (0.35 + speedRatio * 0.65),
      now,
      0.1
    );
  }

  function stopEngine() {
    if (!engineRunning) return;

    stopNode(engineOscillator);
    stopNode(engineOscillator2);

    try {
      engineFilter?.disconnect();
    } catch {
      // Already disconnected.
    }

    engineOscillator = null;
    engineOscillator2 = null;
    engineFilter = null;
    engineRunning = false;
  }

  /* -------------------------------------------------------
     AMBIENCE
     ------------------------------------------------------- */

  function startAmbience() {
    if (ambienceRunning || !ensureRunning()) return;

    try {
      ambienceOscillator = context.createOscillator();

      const filter = context.createBiquadFilter();
      const gain = context.createGain();

      ambienceOscillator.type = "sine";
      ambienceOscillator.frequency.value = 55;

      filter.type = "lowpass";
      filter.frequency.value = 110;

      gain.gain.value = muted ? 0 : ambienceVolume * 0.25;

      ambienceOscillator.connect(filter);
      filter.connect(gain);
      gain.connect(ambienceGain);

      ambienceOscillator.start();

      ambienceRunning = true;
    } catch (error) {
      console.warn("Could not start ambience:", error);
    }
  }

  function stopAmbience() {
    if (!ambienceRunning) return;

    stopNode(ambienceOscillator);
    ambienceOscillator = null;
    ambienceRunning = false;
  }

  /* -------------------------------------------------------
     HORN
     ------------------------------------------------------- */

  function horn() {
    if (!ensureRunning()) return;

    createTone({
      frequency: 350,
      endFrequency: 290,
      duration: 0.35,
      type: "sawtooth",
      volume: 0.25,
    });

    createTone({
      frequency: 440,
      endFrequency: 360,
      duration: 0.3,
      type: "square",
      volume: 0.09,
    });
  }

  /* -------------------------------------------------------
     POLICE / KAROTA SIREN
     ------------------------------------------------------- */

  let sirenTimer = null;
  let sirenActive = false;
  let sirenStep = 0;

  function sirenTick() {
    if (!sirenActive || !context) return;

    const frequency = sirenStep % 2 === 0 ? 780 : 560;

    createTone({
      frequency,
      duration: 0.38,
      type: "sawtooth",
      volume: 0.16,
    });

    sirenStep++;
  }

  function startSiren() {
    if (sirenActive || !ensureRunning()) return;

    sirenActive = true;
    sirenStep = 0;
    sirenTick();

    sirenTimer = window.setInterval(sirenTick, 400);
  }

  function stopSiren() {
    sirenActive = false;

    if (sirenTimer !== null) {
      window.clearInterval(sirenTimer);
      sirenTimer = null;
    }
  }

  /* -------------------------------------------------------
     RADIO
     ------------------------------------------------------- */

  let radioEnabled = false;
  let radioStation = 0;
  let radioInterval = null;

  function getStations() {
    const stations = CONFIG.RADIO_STATIONS;

    return Array.isArray(stations) ? stations : [];
  }

  function playRadioCue() {
    if (!radioEnabled || muted || !ensureRunning()) return;

    const stations = getStations();

    if (stations.length === 0) {
      createTone({
        frequency: 440,
        duration: 0.08,
        volume: 0.04,
        destination: radioGain,
      });

      return;
    }

    const station = stations[
      clamp(radioStation, 0, stations.length - 1)
    ];

    const frequencies = station?.frequencies ?? [440, 550, 660];

    frequencies.slice(0, 3).forEach((frequency, index) => {
      createTone({
        frequency: safeNumber(frequency, 440),
        duration: 0.1,
        volume: 0.04,
        destination: radioGain,
        delay: index * 0.12,
      });
    });
  }

  function startRadio() {
    if (radioEnabled) return;

    radioEnabled = true;
    playRadioCue();

    radioInterval = window.setInterval(() => {
      if (radioEnabled) playRadioCue();
    }, 12000);
  }

  function stopRadio() {
    radioEnabled = false;

    if (radioInterval !== null) {
      window.clearInterval(radioInterval);
      radioInterval = null;
    }
  }

  function nextStation() {
    const stations = getStations();

    if (stations.length === 0) {
      radioStation = 0;
      return null;
    }

    radioStation = (radioStation + 1) % stations.length;

    if (radioEnabled) playRadioCue();

    return stations[radioStation];
  }

  function previousStation() {
    const stations = getStations();

    if (stations.length === 0) {
      radioStation = 0;
      return null;
    }

    radioStation =
      (radioStation - 1 + stations.length) % stations.length;

    if (radioEnabled) playRadioCue();

    return stations[radioStation];
  }

  function getCurrentStation() {
    const stations = getStations();
    return stations[radioStation] ?? null;
  }

  /* -------------------------------------------------------
     UI SOUND EFFECTS
     ------------------------------------------------------- */

  function playCoin() {
    createTone({
      frequency: 880,
      endFrequency: 1320,
      duration: 0.12,
      type: "sine",
      volume: 0.12,
    });

    createTone({
      frequency: 1320,
      endFrequency: 1760,
      duration: 0.16,
      type: "sine",
      volume: 0.09,
      delay: 0.08,
    });
  }

  function playSuccess() {
    [523.25, 659.25, 783.99].forEach((frequency, index) => {
      createTone({
        frequency,
        duration: 0.22,
        type: "sine",
        volume: 0.12,
        delay: index * 0.13,
      });
    });
  }

  function playError() {
    createTone({
      frequency: 250,
      endFrequency: 110,
      duration: 0.22,
      type: "triangle",
      volume: 0.12,
    });
  }

  function playCrash() {
    createNoise({
      duration: 0.35,
      volume: 0.22,
      frequency: 900,
    });

    createTone({
      frequency: 110,
      endFrequency: 45,
      duration: 0.3,
      type: "sawtooth",
      volume: 0.18,
    });
  }

  function playPickup() {
    createTone({
      frequency: 600,
      endFrequency: 900,
      duration: 0.15,
      type: "triangle",
      volume: 0.1,
    });
  }

  function playClick() {
    createTone({
      frequency: 650,
      duration: 0.045,
      type: "sine",
      volume: 0.055,
    });
  }

  function playLevelUp() {
    [392, 494, 587, 784].forEach((frequency, index) => {
      createTone({
        frequency,
        duration: 0.22,
        type: "triangle",
        volume: 0.12,
        delay: index * 0.11,
      });
    });
  }

  /* -------------------------------------------------------
     VOLUME AND MUTE
     ------------------------------------------------------- */

  function setVolume(value) {
    masterVolume = clamp(safeNumber(value, masterVolume), 0, 1);

    if (masterGain && context) {
      masterGain.gain.setTargetAtTime(
        muted ? 0 : masterVolume,
        context.currentTime,
        0.04
      );
    }

    return masterVolume;
  }

  function setEngineVolume(value) {
    engineVolume = clamp(
      safeNumber(value, engineVolume),
      0,
      1
    );

    if (engineGain && context) {
      engineGain.gain.setTargetAtTime(
        muted ? 0 : engineVolume,
        context.currentTime,
        0.04
      );
    }

    return engineVolume;
  }

  function setRadioVolume(value) {
    radioVolume = clamp(
      safeNumber(value, radioVolume),
      0,
      1
    );

    if (radioGain && context) {
      radioGain.gain.setTargetAtTime(
        muted ? 0 : radioVolume,
        context.currentTime,
        0.04
      );
    }

    return radioVolume;
  }

  function setAmbienceVolume(value) {
    ambienceVolume = clamp(
      safeNumber(value, ambienceVolume),
      0,
      1
    );

    if (ambienceGain && context) {
      ambienceGain.gain.setTargetAtTime(
        muted ? 0 : ambienceVolume,
        context.currentTime,
        0.04
      );
    }

    return ambienceVolume;
  }

  function mute() {
    muted = true;

    if (masterGain && context) {
      masterGain.gain.setTargetAtTime(
        0,
        context.currentTime,
        0.04
      );
    }
  }

  function unmute() {
    muted = false;

    if (masterGain && context) {
      masterGain.gain.setTargetAtTime(
        masterVolume,
        context.currentTime,
        0.04
      );
    }
  }

  function toggleMute() {
    if (muted) {
      unmute();
    } else {
      mute();
    }

    return muted;
  }

  /* -------------------------------------------------------
     INITIALIZATION AND CLEANUP
     ------------------------------------------------------- */

  function unlock() {
    return ensureRunning();
  }

  function init() {
    createContext();
  }

  function stopAll() {
    stopEngine();
    stopAmbience();
    stopSiren();
    stopRadio();

    for (const node of [...activeNodes]) {
      stopNode(node);
    }
  }

  function dispose() {
    stopAll();

    if (context && context.state !== "closed") {
      context.close().catch(() => {});
    }

    context = null;
    masterGain = null;
    engineGain = null;
    ambienceGain = null;
    radioGain = null;

    unlocked = false;
    engineRunning = false;
    ambienceRunning = false;
  }

  return {
    init,
    unlock,
    ensureRunning,

    startEngine,
    updateEngine,
    stopEngine,

    startAmbience,
    stopAmbience,

    horn,
    startSiren,
    stopSiren,

    startRadio,
    stopRadio,
    nextStation,
    previousStation,
    getCurrentStation,

    playCoin,
    playSuccess,
    playError,
    playCrash,
    playPickup,
    playClick,
    playLevelUp,

    setVolume,
    setEngineVolume,
    setRadioVolume,
    setAmbienceVolume,
    mute,
    unmute,
    toggleMute,

    stopAll,
    dispose,

    get muted() {
      return muted;
    },

    get unlocked() {
      return unlocked;
    },

    get engineRunning() {
      return engineRunning;
    },

    get radioEnabled() {
      return radioEnabled;
    },

    get volume() {
      return masterVolume;
    },

    get engineSpeed() {
      return engineSpeed;
    },
  };
})();

export const Audio = AudioSystem;
export default AudioSystem;