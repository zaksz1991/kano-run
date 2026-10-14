/**
 * Passenger / driver one-liners during negotiation, boarding, drop-off.
 * Pure text + whistle SFX (no paid TTS).
 */
const DRIVER_LINES = {
  greet: [
    "Ina kwana — where to?",
    "Shiga! How much you get?",
    "Keke free — enter sharp sharp.",
    "To where, oga?",
  ],
  lowOffer: [
    "Ah! That money too small.",
    "Add small, wallahi.",
    "No be free ride o.",
    "Last price — make we go.",
  ],
  accept: [
    "Yauwa — enter!",
    "Okay, we move.",
    "God bless — sit well.",
    "Let's go!",
  ],
  reject: [
    "No deal. Next passenger.",
    "I no fit. Bye.",
    "Too low. Find another keke.",
  ],
  drop: [
    "We don reach. Pay balance.",
    "Sai anjima — thank you.",
    "Your stop. Careful road.",
    "₦ received. Safe journey.",
  ],
};

const PASSENGER_LINES = {
  call: [
    "Driver! Akwai space?",
    "Keke! Take me o!",
    "Oga driver, wait!",
    "Please — short drop.",
  ],
  offer: [
    "I go pay ₦200.",
    "₦150 only — please.",
    "Make it ₦100, I beg.",
    "Standard fare — no wahala.",
  ],
  haggle: [
    "Reduce small na.",
    "Traffic dey — cut am.",
    "I be regular customer.",
  ],
  thanks: [
    "Na gode!",
    "Thank you driver.",
    "Allah ya saka!",
    "Safe trip back.",
  ],
};

function pick(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

export default class NegotiationVoiceSystem {
  constructor({ eventBus = null } = {}) {
    this.eventBus = eventBus;
    this._bubble = null;
    this._disposers = [];

    this._subscribe("negotiation:started", (p) => this._onStart(p));
    this._subscribe("negotiation:offer", (p) => this._onOffer(p));
    this._subscribe("negotiation:accepted", () =>
      this._say("driver", pick(DRIVER_LINES.accept)),
    );
    this._subscribe("negotiation:rejected", () =>
      this._say("driver", pick(DRIVER_LINES.reject)),
    );
    this._subscribe("negotiation:finished", (p) => {
      if (p?.accepted) this._say("driver", pick(DRIVER_LINES.accept));
    });
    this._subscribe("passenger:spotted", () =>
      this._say("passenger", pick(PASSENGER_LINES.call)),
    );
    this._subscribe("passenger:boarding", () =>
      this._say("driver", pick(DRIVER_LINES.greet)),
    );
    this._subscribe("passenger:boarded", () =>
      this._say("driver", pick(DRIVER_LINES.accept)),
    );
    this._subscribe("passenger:dropped", (p) => {
      const fare = p?.fare ? ` ₦${p.fare}` : "";
      this._say("driver", pick(DRIVER_LINES.drop) + fare);
      setTimeout(() => this._say("passenger", pick(PASSENGER_LINES.thanks)), 900);
    });
    this._subscribe("passenger:shout", (p) => {
      if (p?.message) this._say("passenger", p.message);
    });
  }

  _onStart() {
    this._say("driver", pick(DRIVER_LINES.greet));
    setTimeout(() => this._say("passenger", pick(PASSENGER_LINES.offer)), 700);
  }

  _onOffer(p) {
    const low = Number(p?.amount) > 0 && Number(p?.amount) < 150;
    this._say(
      "driver",
      low ? pick(DRIVER_LINES.lowOffer) : pick(DRIVER_LINES.accept),
    );
    if (low) {
      setTimeout(() => this._say("passenger", pick(PASSENGER_LINES.haggle)), 600);
    }
  }

  _say(who, text) {
    this.eventBus?.emit?.("voice:line", { who, text });
    this.eventBus?.emit?.("hud:notify", {
      text: `${who === "driver" ? "🛵" : "👤"} ${text}`,
      type: "voice",
    });
    this._showBubble(who, text);
  }

  _showBubble(who, text) {
    if (typeof document === "undefined") return;
    this._bubble?.remove();
    const el = document.createElement("div");
    el.id = "kano-voice-bubble";
    Object.assign(el.style, {
      position: "fixed",
      left: "50%",
      bottom: who === "driver" ? "28%" : "36%",
      transform: "translateX(-50%)",
      zIndex: "2500",
      maxWidth: "min(320px, 90vw)",
      padding: "10px 14px",
      borderRadius: "12px",
      background:
        who === "driver"
          ? "rgba(15,23,42,0.92)"
          : "rgba(30,58,95,0.92)",
      border: "1px solid rgba(0,180,216,0.4)",
      color: "#f8fafc",
      fontSize: "14px",
      fontWeight: "600",
      textAlign: "center",
      pointerEvents: "none",
      fontFamily: "system-ui, Arial, sans-serif",
    });
    el.textContent = text;
    document.body.appendChild(el);
    this._bubble = el;
    setTimeout(() => {
      if (this._bubble === el) {
        el.remove();
        this._bubble = null;
      }
    }, 2800);
  }

  _subscribe(name, handler) {
    if (!this.eventBus?.on) return;
    const u = this.eventBus.on(name, handler);
    if (typeof u === "function") this._disposers.push(u);
  }

  dispose() {
    this._bubble?.remove();
    for (const u of this._disposers) {
      try {
        u();
      } catch {}
    }
    this._disposers = [];
  }
}
