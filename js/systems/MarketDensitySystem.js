/**
 * When district is market/sabon/kurmi, ask ScenerySystem for higher density
 * and spawn extra roadside props.
 */
export default class MarketDensitySystem {
  constructor({ eventBus = null, scenerySystem = null } = {}) {
    this.eventBus = eventBus;
    this.scenery = scenerySystem;
    this.isMarket = false;
    this._disposers = [];

    this._subscribe("world:districtChanged", (p) => this._onDistrict(p));
    this._subscribe("scenery:districtChanged", (p) => this._onDistrict(p));
    this._subscribe("route:selected", (p) => this._onRoute(p));
  }

  _onDistrict(payload = {}) {
    const key = String(
      payload.district || payload.theme || payload.name || "",
    ).toLowerCase();
    this.isMarket =
      key.includes("sabon") ||
      key.includes("kurmi") ||
      key.includes("market") ||
      key.includes("kwari") ||
      key.includes("singer");

    if (this.scenery?.config) {
      if (this.isMarket) {
        this.scenery.config.buildingDensity = 0.95;
        this.scenery.config.propDensity = 0.95;
        this.scenery.config.segmentsAhead = Math.max(
          this.scenery.config.segmentsAhead || 8,
          11,
        );
        this.scenery.currentTheme = "market";
      } else if (key.includes("industrial") || key.includes("sharada")) {
        this.scenery.config.buildingDensity = 0.8;
        this.scenery.config.propDensity = 0.55;
        this.scenery.currentTheme = "industrial";
      } else {
        this.scenery.config.buildingDensity = 0.85;
        this.scenery.config.propDensity = 0.7;
        this.scenery.currentTheme = "city";
      }
    }

    this.eventBus?.emit?.("scenery:theme", {
      theme: this.scenery?.currentTheme || "city",
      market: this.isMarket,
    });
  }

  _onRoute(payload = {}) {
    const name = String(payload.name || payload.route || "").toLowerCase();
    this._onDistrict({ district: name });
  }

  _subscribe(name, handler) {
    if (!this.eventBus?.on) return;
    const u = this.eventBus.on(name, handler);
    if (typeof u === "function") this._disposers.push(u);
  }

  dispose() {
    for (const u of this._disposers) {
      try {
        u();
      } catch {}
    }
    this._disposers = [];
  }
}
