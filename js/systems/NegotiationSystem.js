import { GAME_CONFIG } from "../core/config.js";

const TITLES = [
  "Oga",
  "Mai Gida",
  "Mallam",
  "Yallabai",
  "Dan uwa",
  "Driver",
  "Baba",
  "Mama",
  "Hajiya",
  "Aboki",
];

const GREETINGS = [
  "Sannu {title}! Ina neman {destination}.",
  "{title}, ka kai ni {destination} lafiya.",
  "Ina so in je {destination}, {title}.",
  "{title}, {destination} jiran mu yau.",
  "Don Allah {title}, kai ni {destination}.",
  "{title}, fare ɗin {destination} nawa?",
];

const COUNTER_LINES = [
  "Kuɗin ya yi yawa, {title}. Ka rage.",
  "Ba haka ba ne a Kano, {title}.",
  "Ka rage kaɗan, mun yarda.",
  "Ya yi tsada sosai!",
];

const ACCEPT_LINES = [
  "To, oya mu tafi!",
  "Akwai, mun yarda.",
  "Nagode {title}!",
  "Sai an jima — mu tafi.",
];

const REJECT_LINES = [
  "Bai yiwu ba yau, {title}.",
  "Kuɗin ba ya isa.",
  "Sai wani lokaci.",
];

function pick(list) {
  return list[Math.floor(Math.random() * list.length)];
}

function fill(template, map) {
  return template.replace(/\{(\w+)\}/g, (_, key) => map[key] ?? "");
}

export default class NegotiationSystem {
  constructor({ eventBus = null, gameState = null, config = {} } = {}) {
    this.eventBus = eventBus;
    this.gameState = gameState;
    this.config = { ...(GAME_CONFIG?.negotiation ?? {}), ...config };

    this.activeNegotiation = null;
    this.enabled = false;
    this._disposers = [];

    this._subscribe("passenger:boarded", (payload) =>
      this.startNegotiation(payload),
    );
    this._subscribe("game:started", () => {
      this.enabled = true;
    });
    this._subscribe("game:stopped", () => {
      this.enabled = false;
      this.cancelNegotiation();
    });
    this._subscribe("game:over", () => {
      this.enabled = false;
      this.cancelNegotiation();
    });

    // Wired from HUD buttons / keys
    this._subscribe("negotiation:accept", () => this.acceptFare());
    this._subscribe("negotiation:counter", () => this.counterFare());
  }

  startNegotiation(payload = {}) {
    if (!this.enabled) return;

    // Avoid stacking if already negotiating
    if (this.activeNegotiation) return;

    const destination = payload.destination || "Sabon Gari";
    const title = pick(TITLES);
    const baseFare = Number(this.config.baseFare) || 250;
    const distanceFare = 150 + Math.floor(Math.random() * 400);
    const requestedFare = baseFare + distanceFare;
    const passengerOffer = Math.max(
      100,
      Math.floor(requestedFare * (0.55 + Math.random() * 0.2)),
    );

    this.activeNegotiation = {
      destination,
      title,
      requestedFare,
      currentOffer: passengerOffer,
      round: 0,
      state: "REQUESTING",
      timer: 8,
    };

    const dialogue = fill(pick(GREETINGS), { title, destination });

    this.eventBus?.emit?.("negotiation:started", {
      dialogue: `${dialogue} (₦${passengerOffer})`,
      fare: requestedFare,
      offer: passengerOffer,
      timeLimit: this.activeNegotiation.timer,
      destination,
      title,
    });
  }

  update(deltaTime) {
    if (!this.activeNegotiation) return;
    if (
      this.activeNegotiation.state === "AGREED" ||
      this.activeNegotiation.state === "REFUSED"
    ) {
      return;
    }

    this.activeNegotiation.timer -= Math.min(Number(deltaTime) || 0, 0.1);

    if (this.activeNegotiation.timer <= 0) {
      this.forceAccept();
    } else {
      this.eventBus?.emit?.("negotiation:timer-update", {
        timeLeft: this.activeNegotiation.timer,
      });
    }
  }

  acceptFare() {
    const n = this.activeNegotiation;
    if (!n || (n.state !== "REQUESTING" && n.state !== "COUNTERING")) return;

    n.state = "AGREED";
    const finalFare = n.currentOffer;
    const dialogue = fill(pick(ACCEPT_LINES), { title: n.title });

    this.eventBus?.emit?.("negotiation:finished", {
      dialogue,
      finalFare,
      success: true,
      destination: n.destination,
    });

    this.eventBus?.emit?.("economy:fare-agreed", {
      amount: finalFare,
      fare: finalFare,
    });

    this.activeNegotiation = null;
  }

  counterFare() {
    const n = this.activeNegotiation;
    if (!n || n.state !== "REQUESTING") return;

    n.round += 1;
    // Driver counters upward toward requested fare
    const mid = Math.floor((n.currentOffer + n.requestedFare) / 2);
    n.currentOffer = Math.min(n.requestedFare, mid + Math.floor(Math.random() * 40));

    // Passenger accepts counter often after first push
    const acceptChance = 0.45 + n.round * 0.2;

    if (Math.random() < acceptChance) {
      n.state = "AGREED";
      const dialogue = fill(pick(ACCEPT_LINES), { title: n.title });
      this.eventBus?.emit?.("negotiation:finished", {
        dialogue: `${dialogue} ₦${n.currentOffer}`,
        finalFare: n.currentOffer,
        success: true,
        destination: n.destination,
      });
      this.eventBus?.emit?.("economy:fare-agreed", {
        amount: n.currentOffer,
        fare: n.currentOffer,
      });
      this.activeNegotiation = null;
      return;
    }

    if (n.round >= 2 && Math.random() < 0.35) {
      n.state = "REFUSED";
      const dialogue = fill(pick(REJECT_LINES), { title: n.title });
      this.eventBus?.emit?.("negotiation:finished", {
        dialogue,
        finalFare: 0,
        success: false,
      });
      this.activeNegotiation = null;
      return;
    }

    n.state = "REQUESTING";
    n.timer = 6;
    const dialogue = fill(pick(COUNTER_LINES), { title: n.title });
    this.eventBus?.emit?.("negotiation:started", {
      dialogue: `${dialogue} (₦${n.currentOffer})`,
      fare: n.requestedFare,
      offer: n.currentOffer,
      timeLimit: n.timer,
    });
  }

  forceAccept() {
    const n = this.activeNegotiation;
    if (!n) return;
    n.state = "AGREED";
    this.eventBus?.emit?.("negotiation:finished", {
      dialogue: `To, mun yarda. ₦${n.currentOffer}`,
      finalFare: n.currentOffer,
      success: true,
      destination: n.destination,
    });
    this.eventBus?.emit?.("economy:fare-agreed", {
      amount: n.currentOffer,
      fare: n.currentOffer,
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
    for (const unsub of this._disposers) {
      try {
        unsub();
      } catch {}
    }
    this._disposers = [];
  }
}
