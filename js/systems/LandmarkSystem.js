const ROUTE_LANDMARKS = {
  "city-centre": ["Kano Rank","Kofar Mata","Kurmi Market","Emir's Palace","Murtala Mohammed Way","Bompai Road","Nassarawa GRA"],
  citycenter: ["Kano Rank","Kofar Mata","Kurmi Market","Emir's Palace","Murtala Mohammed Way","Bompai Road"],
  "sabon-gari": ["Sabon Gari Gate","Sabon Gari Market","France Road","Church Road","New Road","Ibrahim Taiwo Road"],
  sabongari: ["Sabon Gari Gate","Sabon Gari Market","France Road","Church Road","New Road"],
  "zoo-road": ["Zoo Road","Hotoro","Naibawa junction","Yankaba","Eastern Bypass"],
  panshekara: ["Panshekara","Kumbotso Junction","Southern Bypass","Industrial Area","Challawa"],
  kurmi: ["Kurmi Market","Kofar Wambai","Old City Walls","Kofar Mazugal","Dala Hill view"],
  "farm-centre": ["Farm Centre","Tarauni Market","Court Road","Hadejia Road","Gyadi-Gyadi"],
  sharada: ["Sharada Industrial","Tudun Wada link","Bompai Industrial","Challawa Industrial"],
  naibawa: ["Naibawa","Yankaba","Eastern Bypass","Hotoro North"],
  tarauni: ["Tarauni Market","Court Road","Hadejia Road","Gyadi-Gyadi Junction"],
  gwale: ["Gwale Market","Neighborhood Square","Western Link","Kofar Ruwa"],
  kumbotso: ["Kumbotso Junction","Industrial Area","Southern Bypass","Panshekara link"],
  nassarawa: ["Nassarawa GRA","Government House","Aminu Kano Way","Silver Jubilee"],
  tudunwada: ["Tudun Wada Market","Community Centre","Sharada Link","Dorayi"],
  fagge: ["Fagge","Kofar Nassarawa","Wambai Market","City Centre link"],
  dala: ["Dala","Dala Hill","Goron Dutse","Kofar Dawanau"],
  "kofar-mata": ["Kofar Mata","Emir's Palace approach","Kurmi","Gidan Makama"],
  hotoro: ["Hotoro","Zoo Road South","Naibawa","Triumph Junction"],
  "aminu-kano": ["Aminu Kano Way","Nassarawa","Silver Jubilee House","State Road"],
  bompai: ["Bompai","Industrial layout","Airport Road link","Sharada"],
  "airport-road": ["Airport Road","Mal. Aminu Kano Airport","Kumbotso","Panshekara"],
  "hadejia-road": ["Hadejia Road","Tarauni","Yankaba","Wudil axis"],
  dorayi: ["Dorayi","Kabuga","Kofar Ruwa","Western Bypass"],
  kabuga: ["Kabuga","Dorayi","BUK Road","New Site"],
  "buk-road": ["BUK Road","Bayero University","Kabuga","Goron Dutse"],
  "wudil": ["Wudil Road","Yankaba East","Garko axis"],
  "kofar-ruwa": ["Kofar Ruwa","Cattle market","Gwale","Dawanau link"],
  dawanau: ["Dawanau Market","Kofar Dawanau","Rimin Gado road"],
  "rimin-gado": ["Rimin Gado","Dawanau","Western outer ring"],
};

const FALLBACK = [
  "Leaving the rank","Kofar Mata area","Kurmi Market junction","Emir's Palace road",
  "Sabon Gari approach","Zoo Road stretch","Farm Centre","Hotoro flyover",
  "Naibawa axis","Tarauni","Kumbotso link","Sharada Industrial","Airport Road",
];

export default class LandmarkSystem {
  constructor({ eventBus = null, routeSystem = null, gameState = null } = {}) {
    this.eventBus = eventBus;
    this.routeSystem = routeSystem;
    this.gameState = gameState;
    this.enabled = false;
    this.triggered = new Set();
    this.landmarks = [];
    this._toast = null;
    this._disposers = [];

    this._subscribe("game:started", () => {
      this.enabled = true;
      this.triggered.clear();
      this._loadFromRoute();
    });
    this._subscribe("game:stopped", () => {
      this.enabled = false;
      this._hideToast();
    });
    this._subscribe("route:changed", (p) => {
      this._loadFromRoute(p?.route ?? p);
      this.triggered.clear();
    });
    this._subscribe("lobby:confirmed", (p) => {
      this._loadFromRoute(p?.route);
      this.triggered.clear();
    });
  }

  initialize() {
    this._loadFromRoute();
    return this;
  }

  _loadFromRoute(route) {
    const r = route || this.routeSystem?.getSelectedRoute?.() || null;
    const raw = String(r?.id || r?.district || r?.name || "").toLowerCase();
    const id = raw.replace(/\s+/g, "-");
    const names =
      ROUTE_LANDMARKS[id] ||
      ROUTE_LANDMARKS[raw] ||
      (Array.isArray(r?.landmarks) && r.landmarks.length ? r.landmarks : null) ||
      FALLBACK;

    const step = 200;
    this.landmarks = names.map((name, i) => ({
      at: 60 + i * step,
      name,
    }));
  }

  update(deltaTime, playerZ = 0) {
    if (!this.enabled) return;
    const distance = Math.max(0, Number(playerZ) || 0);
    for (const lm of this.landmarks) {
      const key = `${lm.at}:${lm.name}`;
      if (this.triggered.has(key)) continue;
      if (distance >= lm.at) {
        this.triggered.add(key);
        this._announce(lm.name);
        this.eventBus?.emit?.("landmark:reached", {
          name: lm.name,
          distance: lm.at,
        });
      }
    }
  }

  _announce(name) {
    this._hideToast();
    const el = document.createElement("div");
    el.id = "landmark-toast";
    Object.assign(el.style, {
      position: "fixed",
      top: "22%",
      left: "50%",
      transform: "translateX(-50%)",
      zIndex: "1600",
      background: "rgba(7,18,32,0.9)",
      color: "#e0f2fe",
      padding: "10px 20px",
      borderRadius: "10px",
      border: "1px solid rgba(56,189,248,0.5)",
      fontFamily: "system-ui, Arial, sans-serif",
      fontSize: "16px",
      fontWeight: "700",
      pointerEvents: "none",
      textAlign: "center",
    });
    el.innerHTML = `<div style="font-size:11px;letter-spacing:2px;color:#38bdf8;margin-bottom:4px">LANDMARK</div>${name}`;
    document.body.appendChild(el);
    this._toast = el;
    setTimeout(() => this._hideToast(), 3200);
  }

  _hideToast() {
    this._toast?.remove();
    this._toast = null;
  }

  _subscribe(name, handler) {
    if (!this.eventBus?.on) return;
    const u = this.eventBus.on(name, handler);
    if (typeof u === "function") this._disposers.push(u);
  }

  dispose() {
    this._hideToast();
    for (const u of this._disposers) {
      try {
        u();
      } catch {}
    }
    this._disposers = [];
  }
}
