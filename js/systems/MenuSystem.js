/**
 * Pre-run lobby: driver, keke, route, one-way / two-way.
 * Emits game:lobby-ready with the selection, then the host starts the run.
 */
const DRIVERS = [
  {
    id: "ruffneck",
    name: "RuffNeck",
    bonus: "Best handling + max speed",
    handling: 1.2,
    maxSpeedBonus: 4,
    default: true,
  },
  {
    id: "baba",
    name: "Baba",
    bonus: "Careful driving · fewer fines",
    handling: 0.95,
    maxSpeedBonus: 0,
    careful: true,
  },
  {
    id: "mama",
    name: "Mama",
    bonus: "Steady fares · fuel efficient",
    handling: 1.0,
    maxSpeedBonus: 1,
    fuelBonus: 0.85,
  },
  {
    id: "mayen",
    name: "Mayen Mata",
    bonus: "Prefers female passengers",
    handling: 1.05,
    maxSpeedBonus: 2,
    prefersWomen: true,
  },
  {
    id: "uztaz",
    name: "Uztaz",
    bonus: "Respectful · careful with women",
    handling: 1.0,
    maxSpeedBonus: 1,
    carefulWomen: true,
  },
];

const KEKES = [
  { id: "standard", name: "Standard Adaidaita", vehicleType: "standard" },
  { id: "luxury", name: "Luxury Adaidaita", vehicleType: "luxury" },
  { id: "cargo", name: "Cargo Adaidaita", vehicleType: "cargo" },
  { id: "open", name: "Open Adaidaita", vehicleType: "open" },
];

const ROUTES = [
  { id: "city-centre", name: "City Centre → Emir Palace", district: "Kano City Centre" },
  { id: "sabon-gari", name: "Sabon Gari Market Loop", district: "Sabon Gari" },
  { id: "kurmi", name: "Kurmi Market → Kofar Wambai", district: "Kurmi Market" },
  { id: "kwari", name: "Kantin Kwari Traders", district: "Kantin Kwari" },
  { id: "fagge", name: "Fagge → Airport Road", district: "Fagge" },
  { id: "tarauni", name: "Tarauni Circuit", district: "Tarauni" },
  { id: "hotoro", name: "Zoo Road → Hotoro", district: "Hotoro" },
  { id: "bompai", name: "Bompai Industrial", district: "Bompai" },
  { id: "nassarawa", name: "Nassarawa GRA", district: "Nassarawa" },
  { id: "wambai", name: "Kofar Wambai Gate", district: "Kofar Wambai" },
];

export default class MenuSystem {
  constructor({ eventBus = null, gameState = null } = {}) {
    this.eventBus = eventBus;
    this.gameState = gameState;
    this.root = null;
    this.selection = {
      driverId: "ruffneck",
      kekeId: "standard",
      routeId: "city-centre",
      direction: "one-way",
    };
    this.visible = false;
  }

  initialize() {
    this._build();
    this.show();
    return this;
  }

  show() {
    if (this.root) {
      this.root.style.display = "flex";
      this.visible = true;
    }
  }

  hide() {
    if (this.root) {
      this.root.style.display = "none";
      this.visible = false;
    }
  }

  _build() {
    document.getElementById("kano-lobby")?.remove();

    const root = document.createElement("div");
    root.id = "kano-lobby";
    Object.assign(root.style, {
      position: "fixed",
      inset: "0",
      zIndex: "2000",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      background:
        "linear-gradient(160deg, rgba(7,18,32,0.96), rgba(15,40,60,0.94))",
      fontFamily: "system-ui, Arial, sans-serif",
      color: "#e2e8f0",
      padding: "16px",
      overflow: "auto",
    });

    root.innerHTML = `
      <div style="width:min(720px,100%);background:rgba(15,23,42,0.95);border:1px solid #334155;border-radius:16px;padding:24px;box-shadow:0 20px 50px rgba(0,0,0,0.45)">
        <h1 style="margin:0 0 6px;font-size:28px;color:#38bdf8">Kano Run</h1>
        <p style="margin:0 0 20px;color:#94a3b8;font-size:14px">Select driver, keke, route and direction before you start.</p>

        <label style="font-size:12px;color:#38bdf8;letter-spacing:1px">DRIVER</label>
        <div id="lobby-drivers" style="display:grid;grid-template-columns:repeat(auto-fill,minmax(140px,1fr));gap:8px;margin:8px 0 16px"></div>

        <label style="font-size:12px;color:#38bdf8;letter-spacing:1px">KEKE</label>
        <div id="lobby-kekes" style="display:grid;grid-template-columns:repeat(auto-fill,minmax(140px,1fr));gap:8px;margin:8px 0 16px"></div>

        <label style="font-size:12px;color:#38bdf8;letter-spacing:1px">ROUTE</label>
        <select id="lobby-route" style="width:100%;margin:8px 0 16px;padding:10px;border-radius:8px;border:1px solid #475569;background:#0f172a;color:#e2e8f0"></select>

        <label style="font-size:12px;color:#38bdf8;letter-spacing:1px">DIRECTION</label>
        <div style="display:flex;gap:10px;margin:8px 0 20px">
          <button type="button" data-dir="one-way" class="lobby-dir" style="flex:1;padding:10px;border-radius:8px;border:1px solid #38bdf8;background:#0ea5e9;color:#0f172a;font-weight:700;cursor:pointer">One way</button>
          <button type="button" data-dir="two-way" class="lobby-dir" style="flex:1;padding:10px;border-radius:8px;border:1px solid #475569;background:#1e293b;color:#e2e8f0;cursor:pointer">Two way</button>
        </div>

        <button id="lobby-start" type="button" style="width:100%;padding:14px;border:0;border-radius:10px;background:#22c55e;color:#052e16;font-size:16px;font-weight:800;cursor:pointer">START RUN</button>
      </div>
    `;

    document.body.appendChild(root);
    this.root = root;

    const driversEl = root.querySelector("#lobby-drivers");
    for (const d of DRIVERS) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.dataset.driver = d.id;
      btn.innerHTML = `<b>${d.name}</b><br><span style="font-size:11px;opacity:0.8">${d.bonus}</span>`;
      Object.assign(btn.style, {
        textAlign: "left",
        padding: "10px",
        borderRadius: "8px",
        border: d.default ? "1px solid #38bdf8" : "1px solid #475569",
        background: d.default ? "#0c4a6e" : "#1e293b",
        color: "#e2e8f0",
        cursor: "pointer",
        fontSize: "13px",
      });
      btn.addEventListener("click", () => {
        this.selection.driverId = d.id;
        driversEl.querySelectorAll("button").forEach((b) => {
          b.style.border = "1px solid #475569";
          b.style.background = "#1e293b";
        });
        btn.style.border = "1px solid #38bdf8";
        btn.style.background = "#0c4a6e";
      });
      driversEl.appendChild(btn);
    }

    const kekesEl = root.querySelector("#lobby-kekes");
    for (const k of KEKES) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.dataset.keke = k.id;
      btn.textContent = k.name;
      Object.assign(btn.style, {
        padding: "10px",
        borderRadius: "8px",
        border: k.id === "standard" ? "1px solid #38bdf8" : "1px solid #475569",
        background: k.id === "standard" ? "#0c4a6e" : "#1e293b",
        color: "#e2e8f0",
        cursor: "pointer",
        fontSize: "13px",
      });
      btn.addEventListener("click", () => {
        this.selection.kekeId = k.id;
        kekesEl.querySelectorAll("button").forEach((b) => {
          b.style.border = "1px solid #475569";
          b.style.background = "#1e293b";
        });
        btn.style.border = "1px solid #38bdf8";
        btn.style.background = "#0c4a6e";
      });
      kekesEl.appendChild(btn);
    }

    const routeSel = root.querySelector("#lobby-route");
    for (const r of ROUTES) {
      const opt = document.createElement("option");
      opt.value = r.id;
      opt.textContent = r.name;
      routeSel.appendChild(opt);
    }
    routeSel.addEventListener("change", () => {
      this.selection.routeId = routeSel.value;
    });

    root.querySelectorAll(".lobby-dir").forEach((btn) => {
      btn.addEventListener("click", () => {
        this.selection.direction = btn.dataset.dir;
        root.querySelectorAll(".lobby-dir").forEach((b) => {
          b.style.background = "#1e293b";
          b.style.border = "1px solid #475569";
          b.style.color = "#e2e8f0";
        });
        btn.style.background = "#0ea5e9";
        btn.style.border = "1px solid #38bdf8";
        btn.style.color = "#0f172a";
      });
    });

    root.querySelector("#lobby-start").addEventListener("click", () => {
      this._confirm();
    });
  }

  _confirm() {
    const driver = DRIVERS.find((d) => d.id === this.selection.driverId) || DRIVERS[0];
    const keke = KEKES.find((k) => k.id === this.selection.kekeId) || KEKES[0];
    const route = ROUTES.find((r) => r.id === this.selection.routeId) || ROUTES[0];

    const payload = {
      driver,
      keke,
      route,
      direction: this.selection.direction,
      vehicleType: keke.vehicleType,
    };

    this.hide();
    this.eventBus?.emit?.("lobby:confirmed", payload);
    this.eventBus?.emit?.("vehicle:select", { type: keke.vehicleType });
    this.eventBus?.emit?.("route:changed", { route, district: route.district });
    this.eventBus?.emit?.("game:request-start", payload);
  }

  dispose() {
    this.root?.remove();
    this.root = null;
  }
}

export { DRIVERS, KEKES, ROUTES };
