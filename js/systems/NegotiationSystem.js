import { GAME_CONFIG } from "../core/config.js";

const GREETINGS = [
  "Sannu Oga! Ina neman {destination}.",
  "Mallam, ka kai ni {destination}.",
  "Aboki, ina so in je {destination}.",
  "Yallabai, {destination} jiran mu.",
  "Baba, ka dauke ni zuwa {destination}."
];

const RESPONSES_ACCEPT = [
  "To, oya!",
  "Akwai, mun yarda.",
  "Oga ne kai!"
];

const RESPONSES_REJECT = [
  "Kuɗin ba su da yawa, mallam.",
  "Ya yi tsada sosai!",
  "Ba haka ba ne, aboki."
];

export default class NegotiationSystem {
  constructor({ eventBus = null, gameState = null, config = {} } = {}) {
    this.eventBus = eventBus;
    this.gameState = gameState;
    this.config = { ...GAME_CONFIG?.negotiation ?? {}, ...config };
    
    this.activeNegotiation = null;
    this.timer = 0;
    this.enabled = false;
    this._disposers = [];

    this._subscribe("passenger:boarded", (payload) => this.startNegotiation(payload));
    this._subscribe("game:started", () => { this.enabled = true; });
    this._subscribe("game:stopped", () => { this.enabled = false; this.cancelNegotiation(); });
  }

  startNegotiation(payload) {
    if (!this.enabled) return;
    
    const baseFare = this.config.baseFare || 300;
    const distanceFare = Math.floor(Math.random() * 500) + 200;
    const totalFare = baseFare + distanceFare;
    
    this.activeNegotiation = {
      destination: payload.destination || "Sabon Gari",
      requestedFare: totalFare,
      currentOffer: Math.floor(totalFare * 0.7), // Passenger starts low
      state: "REQUESTING", // REQUESTING, COUNTERING, AGREED, REFUSED
      timer: 5.0 // 5 seconds to respond
    };

    const greeting = GREETINGS[Math.floor(Math.random() * GREETINGS.length)].replace("{destination}", this.activeNegotiation.destination);
    
    this.eventBus?.emit?.("negotiation:started", {
      dialogue: greeting,
      fare: this.activeNegotiation.requestedFare,
      timeLimit: this.activeNegotiation.timer
    });
  }

  update(deltaTime) {
    if (!this.activeNegotiation || this.activeNegotiation.state === "AGREED" || this.activeNegotiation.state === "REFUSED") return;

    this.activeNegotiation.timer -= deltaTime;

    if (this.activeNegotiation.timer <= 0) {
      this.forceAccept(); // Time out = auto accept at current offer
    } else {
      this.eventBus?.emit?.("negotiation:timer-update", { timeLeft: this.activeNegotiation.timer });
    }
  }

  // Call this from InputSystem when player presses 'Accept' (e.g., E key)
  acceptFare() {
    if (!this.activeNegotiation || this.activeNegotiation.state !== "REQUESTING") return;
    
    this.activeNegotiation.state = "AGREED";
    const response = RESPONSES_ACCEPT[Math.floor(Math.random() * RESPONSES_ACCEPT.length)];
    
    this.eventBus?.emit?.("negotiation:finished", {
      dialogue: response,
      finalFare: this.activeNegotiation.requestedFare,
      success: true
    });
    
    this.activeNegotiation = null;
  }

  // Call this from InputSystem when player presses 'Counter' (e.g., Q key)
  counterFare() {
    if (!this.activeNegotiation || this.activeNegotiation.state !== "REQUESTING") return;
    
    // Simple logic: 50% chance they accept the counter, 50% they refuse
    if (Math.random() > 0.5) {
      this.activeNegotiation.state = "AGREED";
      const response = RESPONSES_ACCEPT[Math.floor(Math.random() * RESPONSES_ACCEPT.length)];
      this.eventBus?.emit?.("negotiation:finished", {
        dialogue: response,
        finalFare: this.activeNegotiation.currentOffer,
        success: true
      });
    } else {
      this.activeNegotiation.state = "REFUSED";
      const response = RESPONSES_REJECT[Math.floor(Math.random() * RESPONSES_REJECT.length)];
      this.eventBus?.emit?.("negotiation:finished", {
        dialogue: response,
        finalFare: 0,
        success: false
      });
    }
    this.activeNegotiation = null;
  }

  forceAccept() {
    if (!this.activeNegotiation) return;
    this.activeNegotiation.state = "AGREED";
    this.eventBus?.emit?.("negotiation:finished", {
      dialogue: "To, mun yarda. (Time out)",
      finalFare: this.activeNegotiation.currentOffer,
      success: true
    });
    this.activeNegotiation = null;
  }

  cancelNegotiation() {
    this.activeNegotiation = null;
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