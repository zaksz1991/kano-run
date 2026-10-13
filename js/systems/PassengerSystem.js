import GAME_CONFIG from "../core/config.js";

const clamp = (value, min, max) =>
  Math.min(max, Math.max(min, value));

const randomBetween = (min, max) =>
  min + Math.random() * (max - min);

const randomItem = (items) =>
  items[Math.floor(Math.random() * items.length)];

const KANO_DISTRICTS = Object.freeze([
  { id: "fagge", name: "Fagge", fareMultiplier: 1.0 },
  { id: "sabongari", name: "Sabon Gari", fareMultiplier: 1.1 },
  { id: "nassarawa", name: "Nassarawa", fareMultiplier: 1.15 },
  { id: "kano-city", name: "Kano City", fareMultiplier: 1.0 },
  { id: "gwale", name: "Gwale", fareMultiplier: 1.05 },
  { id: "kumbotso", name: "Kumbotso", fareMultiplier: 1.25 },
  { id: "tarauni", name: "Tarauni", fareMultiplier: 1.15 },
  { id: "ungogo", name: "Ungogo", fareMultiplier: 1.2 },
  { id: "dawakin-kudu", name: "Dawakin Kudu", fareMultiplier: 1.35 },
  { id: "danbatta", name: "Dambatta", fareMultiplier: 1.5 },
]);

const PASSENGER_NAMES = Object.freeze([
  "Amina",
  "Musa",
  "Fatima",
  "Ibrahim",
  "Zainab",
  "Abdullahi",
  "Hadiza",
  "Usman",
  "Maryam",
  "Sani",
  "Khadija",
  "Bashir",
  "Hauwa",
  "Yusuf",
  "Bilal",
]);

export class PassengerSystem {
  constructor(options = {}) {
    this.config = options.config ?? GAME_CONFIG;
    this.eventBus = options.eventBus ?? null;
    this.gameState = options.gameState ?? null;

    this.settings = {
      baseFare: this.config.economy?.baseFare ?? 250,
      passengerXP: this.config.economy?.passengerXP ?? 20,
      pickupRadius: 5,
      deliveryRadius: 6,
      spawnInterval: 18,
      maximumWaitingPassengers: 5,
      maximumPassengerWait: 120,
      farePerDistance: 12,
      ...options.settings,
    };

    this.passengers = new Map();
    this.nextPassengerId = 1;
    this.elapsed = 0;
    this.spawnTimer = 0;
    this.active = false;
    this.statistics = this.createStatistics();
  }

  createStatistics() {
    return {
      spawned: 0,
      boarded: 0,
      delivered: 0,
      abandoned: 0,
      totalFares: 0,
    };
  }

  start() {
    this.active = true;
    this.spawnTimer = 1;

    this.emit("passengers:system-started", {
      waiting: this.getWaitingPassengers().length,
    });
  }

  stop() {
    this.active = false;
    this.emit("passengers:system-stopped");
  }

  update(deltaSeconds, player = {}) {
    if (!this.active) return;

    const dt = clamp(Number(deltaSeconds) || 0, 0, 0.05);
    this.elapsed += dt;

    this.updateWaitingPassengers(dt);

    this.spawnTimer -= dt;

    if (
      this.spawnTimer <= 0 &&
      this.getWaitingPassengers().length <
        this.settings.maximumWaitingPassengers
    ) {
      this.spawnPassenger(player);

      this.spawnTimer = randomBetween(
        this.settings.spawnInterval * 0.7,
        this.settings.spawnInterval * 1.3,
      );
    }

    this.checkPickup(player);
    this.checkDelivery(player);
  }

  spawnPassenger(player = {}) {
    const waiting = this.getWaitingPassengers();

    if (waiting.length >= this.settings.maximumWaitingPassengers) {
      return null;
    }

    const playerZ = Number(player.z) || 0;
    const playerLane = clamp(
      Math.round(Number(player.lane) || 0),
      0,
      2,
    );

    const pickupZ = playerZ + randomBetween(18, 55);
    const pickupLane = Math.floor(Math.random() * 3);

    const origin = randomItem(KANO_DISTRICTS);

    let destination = randomItem(KANO_DISTRICTS);

    while (destination.id === origin.id) {
      destination = randomItem(KANO_DISTRICTS);
    }

    const passenger = {
      id: this.nextPassengerId++,
      name: randomItem(PASSENGER_NAMES),
      origin: { ...origin },
      destination: { ...destination },

      lane: pickupLane,
      x: this.getLaneX(pickupLane),
      z: pickupZ,

      spawnedAt: this.elapsed,
      waitTime: 0,

      status: "waiting",
      fare: this.calculateFare(origin, destination),
      distance: Math.abs(pickupZ - playerZ),

      boardedAt: null,
      deliveredAt: null,
    };

    this.passengers.set(passenger.id, passenger);
    this.statistics.spawned += 1;

    this.emit("passengers:spawned", { ...passenger });

    return passenger;
  }

  calculateFare(origin, destination) {
    const distanceMultiplier =
      Math.abs(
        KANO_DISTRICTS.findIndex(
          (district) => district.id === origin.id,
        ) -
          KANO_DISTRICTS.findIndex(
            (district) => district.id === destination.id,
          ),
      ) + 1;

    const districtMultiplier =
      (origin.fareMultiplier + destination.fareMultiplier) / 2;

    return Math.max(
      this.settings.baseFare,
      Math.round(
        this.settings.baseFare *
          distanceMultiplier *
          districtMultiplier,
      ),
    );
  }

  checkPickup(player) {
    if (!player || !this.gameState?.run) return;

    const run = this.gameState.run;

    const capacity = Math.max(
      0,
      Number(run.passengerCapacity) || 0,
    );

    const onboard = Math.max(
      0,
      Number(run.passengers) || 0,
    );

    if (onboard >= capacity) return;

    const playerX = Number(player.x ?? player.lanePosition) || 0;
    const playerZ = Number(player.z) || 0;
    const playerSpeed = Number(player.speed) || 0;

    for (const passenger of this.passengers.values()) {
      if (passenger.status !== "waiting") continue;

      const distanceX = Math.abs(passenger.x - playerX);
      const distanceZ = Math.abs(passenger.z - playerZ);

      if (
        distanceX > this.settings.pickupRadius ||
        distanceZ > this.settings.pickupRadius
      ) {
        continue;
      }

      if (playerSpeed > 8) {
        this.emit("passengers:pickup-too-fast", {
          passengerId: passenger.id,
          speed: playerSpeed,
        });

        continue;
      }

      this.boardPassenger(passenger.id);
      break;
    }
  }

  boardPassenger(passengerId) {
    const passenger = this.passengers.get(passengerId);

    if (!passenger || passenger.status !== "waiting") {
      return false;
    }

    const boarded = this.gameState?.boardPassengers(1) ?? 0;

    if (boarded <= 0) {
      this.emit("passengers:vehicle-full", {
        passengerId,
      });

      return false;
    }

    passenger.status = "onboard";
    passenger.boardedAt = this.elapsed;

    this.statistics.boarded += 1;

    this.emit("passengers:boarded", {
      passenger: { ...passenger },
      onboard: this.gameState.run.passengers,
      capacity: this.gameState.run.passengerCapacity,
    });

    this.emit("missions:passenger-boarded", {
      passengerId,
      destination: passenger.destination.name,
    });

    return true;
  }

  checkDelivery(player) {
    if (!player || !this.gameState?.run) return;

    const playerX = Number(player.x ?? player.lanePosition) || 0;
    const playerZ = Number(player.z) || 0;
    const playerSpeed = Number(player.speed) || 0;

    if (playerSpeed > 8) return;

    for (const passenger of this.passengers.values()) {
      if (passenger.status !== "onboard") continue;

      const distanceX = Math.abs(passenger.x - playerX);
      const distanceZ = Math.abs(passenger.z - playerZ);

      if (
        distanceX > this.settings.deliveryRadius ||
        distanceZ > this.settings.deliveryRadius
      ) {
        continue;
      }

      this.deliverPassenger(passenger.id);
      break;
    }
  }

  deliverPassenger(passengerId) {
    const passenger = this.passengers.get(passengerId);

    if (!passenger || passenger.status !== "onboard") {
      return false;
    }

    passenger.status = "delivered";
    passenger.deliveredAt = this.elapsed;

    const waitingTime = passenger.boardedAt === null
      ? 0
      : this.elapsed - passenger.boardedAt;

    const punctualityBonus =
      waitingTime < 45 ? Math.round(passenger.fare * 0.2) : 0;

    const fare = passenger.fare + punctualityBonus;

    // Each delivery pays only for this passenger.
    const run = this.gameState?.run;

    if (run) {
      run.passengers = Math.max(0, run.passengers - 1);
      run.deliveries += 1;
    }

    this.gameState?.addMoney(fare);
    this.gameState?.addXP(this.settings.passengerXP);
    this.gameState?.addScore(Math.round(fare / 10));

    if (this.gameState?.profile) {
      this.gameState.profile.totalPassengers += 1;
    }

    this.statistics.delivered += 1;
    this.statistics.totalFares += fare;

    this.emit("passengers:delivered", {
      passenger: { ...passenger },
      fare,
      punctualityBonus,
      waitingTime,
      totalDelivered: this.statistics.delivered,
    });

    this.emit("missions:passenger-delivered", {
      passengerId,
      fare,
      destination: passenger.destination.name,
    });

    return true;
  }

  updateWaitingPassengers(dt) {
    for (const passenger of this.passengers.values()) {
      if (passenger.status !== "waiting") continue;

      passenger.waitTime += dt;

      if (passenger.waitTime >= this.settings.maximumPassengerWait) {
        passenger.status = "abandoned";
        this.statistics.abandoned += 1;

        this.emit("passengers:abandoned", {
          passengerId: passenger.id,
          name: passenger.name,
        });
      }
    }
  }

  getWaitingPassengers() {
    return [...this.passengers.values()].filter(
      (passenger) => passenger.status === "waiting",
    );
  }

  getOnboardPassengers() {
    return [...this.passengers.values()].filter(
      (passenger) => passenger.status === "onboard",
    );
  }

  getLaneX(lane) {
    const lanes = [-3.2, 0, 3.2];

    return lanes[
      clamp(Math.round(lane), 0, lanes.length - 1)
    ];
  }

  getSnapshot() {
    return {
      active: this.active,
      waiting: this.getWaitingPassengers().map((passenger) => ({
        ...passenger,
      })),
      onboard: this.getOnboardPassengers().map((passenger) => ({
        ...passenger,
      })),
      statistics: { ...this.statistics },
    };
  }

  emit(eventName, payload) {
    this.eventBus?.emit(eventName, payload);
    this.gameState?.emit(eventName, payload);
  }

  reset() {
    this.passengers.clear();
    this.nextPassengerId = 1;
    this.elapsed = 0;
    this.spawnTimer = 0;
    this.statistics = this.createStatistics();
  }

  destroy() {
    this.stop();
    this.reset();

    this.eventBus = null;
    this.gameState = null;
  }
}

export default PassengerSystem;