// Asset loader — Vite serves public/ at site root
const PATHS = {
  player: '/assets/player/keke-player.png',
  playerLeft: '/assets/player/keke-player-left.png',
  playerRight: '/assets/player/keke-player-right.png',
  playerDamaged: '/assets/player/keke-player-damaged.png',
  kekeYellow: '/assets/traffic/keke-yellow.png',
  kekeBlue: '/assets/traffic/keke-blue.png',
  car: '/assets/traffic/car-sedan.png',
  taxi: '/assets/traffic/taxi.png',
  bus: '/assets/traffic/bus.png',
  motorcycle: '/assets/traffic/motorcycle.png',
  truck: '/assets/traffic/truck.png',
  police: '/assets/traffic/police.png',
  karota: '/assets/traffic/karota.png',
  shop: '/assets/environment/shop.png',
  market: '/assets/environment/market-stall.png',
  house: '/assets/environment/house.png',
  mosque: '/assets/environment/mosque.png',
  school: '/assets/environment/school.png',
  petrol: '/assets/environment/petrol-station.png',
  busStop: '/assets/environment/bus-stop.png',
  billboard: '/assets/environment/billboard.png',
  streetLight: '/assets/environment/street-light.png',
  ped1: '/assets/people/pedestrian-01.png',
  ped2: '/assets/people/pedestrian-02.png',
  ped3: '/assets/people/pedestrian-03.png',
  passenger: '/assets/people/passenger.png',
  dust: '/assets/effects/dust.png',
  smoke: '/assets/effects/smoke.png',
  collision: '/assets/effects/collision.png',
  speedLines: '/assets/effects/speed-lines.png'
};

export const Assets = {
  images: {},
  ready: false,
  loaded: 0,
  failed: 0,

  load() {
    const entries = Object.entries(PATHS);
    let left = entries.length;
    return new Promise((resolve) => {
      if (!left) { this.ready = true; resolve(); return; }
      entries.forEach(([key, src]) => {
        const img = new Image();
        img.onload = () => {
          this.images[key] = img;
          this.loaded++;
          if (--left <= 0) { this.ready = true; resolve(); }
        };
        img.onerror = () => {
          this.failed++;
          if (--left <= 0) { this.ready = true; resolve(); }
        };
        img.src = src;
      });
    });
  },

  get(key) {
    return this.images[key] || null;
  }
};
