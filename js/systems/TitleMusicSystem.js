/**
 * Plays cool/ruffneck on the title screen; fades out when run starts.
 */
const TRACKS = [
  "/assets/models/audio/cool.mp3",
  "/assets/models/audio/ruffneck.mp3",
];

export default class TitleMusicSystem {
  constructor({ eventBus = null } = {}) {
    this.eventBus = eventBus;
    this.audio = null;
    this.track = 0;
    this._disposers = [];

    this._subscribe("game:started", () => this.fadeOut());
    this._subscribe("game:booted", () => this.maybeStart());
    this._subscribe("menu:ready", () => this.maybeStart());

    // Start after first user gesture (autoplay policy)
    if (typeof window !== "undefined") {
      const start = () => {
        this.maybeStart();
        window.removeEventListener("pointerdown", start);
      };
      window.addEventListener("pointerdown", start);
      // Also try when start button exists
      setTimeout(() => {
        document.getElementById("start-btn")?.addEventListener(
          "mouseenter",
          () => this.maybeStart(),
          { once: true },
        );
      }, 400);
    }
  }

  maybeStart() {
    if (this.audio) return;
    const src = TRACKS[this.track % TRACKS.length];
    this.audio = new Audio(src);
    this.audio.loop = true;
    this.audio.volume = 0.4;
    this.audio.play().catch(() => {});
  }

  nextTrack() {
    this.track += 1;
    if (this.audio) {
      this.audio.pause();
      this.audio = null;
    }
    this.maybeStart();
  }

  fadeOut() {
    if (!this.audio) return;
    const a = this.audio;
    const step = () => {
      a.volume = Math.max(0, a.volume - 0.04);
      if (a.volume > 0.02) requestAnimationFrame(step);
      else {
        a.pause();
        a.src = "";
        if (this.audio === a) this.audio = null;
      }
    };
    step();
  }

  _subscribe(name, handler) {
    if (!this.eventBus?.on) return;
    const u = this.eventBus.on(name, handler);
    if (typeof u === "function") this._disposers.push(u);
  }

  dispose() {
    this.fadeOut();
    for (const u of this._disposers) {
      try {
        u();
      } catch {}
    }
    this._disposers = [];
  }
}
