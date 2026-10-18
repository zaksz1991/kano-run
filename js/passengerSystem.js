/**
 * Kano Life — Passenger Transport System
 *
 * Features:
 * - Roadside passenger pickup and drop-off.
 * - Configurable passenger capacity.
 * - Fare calculation and earnings tracking.
 * - Passenger waiting timers.
 * - Pickup and drop-off events for game integration.
 */

export const PASSENGER_CONFIG = Object.freeze({
  maximumCapacity: 4,
  minimumFare: 100,
  maximumFare: 1500,
  minimumTripDistance: 30,
  maximumWaitTime: 90,
  pickupRadius: 4,
  dropoffRadius: 5,
});

function randomBetween(min, max) {
  return Math.floor(
    min + Math.random() * (max - min + 1)
  );
}

function distanceBetween(a, b) {
  return Math.hypot(
    a.x - b.x,
    a.z - b.z
  );
}

function getPosition(object) {
  const position = object?.position ?? object;

  if (
    !position ||
    !Number.isFinite(position.x) ||
    !Number.isFinite(position.z)
  ) {
    throw new TypeError(
      "Expected valid world coordinates."
    );
  }

  return {
    x: position.x,
    z: position.z,
  };
}

export function createPassengerSystem(config = {}) {
  const settings = {
    ...PASSENGER_CONFIG,
    ...config,
  };

  const waitingPassengers = new Map();
  const onboardPassengers = new Map();
  const destinations = new Map();

  let nextPassengerId = 1;
  let earnings = 0;
  let totalPassengersServed = 0;

  /**
   * Create a passenger waiting beside the road.
   *
   * Coordinates must come from valid roadside locations
   * in the existing game world.
   */
  function addWaitingPassenger({
    x,
    z,
    destinationX,
    destinationZ,
    fare,
    waitingTime,
    id,
  }) {
    if (
      !Number.isFinite(x) ||
      !Number.isFinite(z) ||
      !Number.isFinite(destinationX) ||
      !Number.isFinite(destinationZ)
    ) {
      throw new TypeError(
        "Passenger and destination coordinates are required."
      );
    }

    const passengerId =
      id ?? `passenger-${nextPassengerId++}`;

    if (
      waitingPassengers.has(passengerId) ||
      onboardPassengers.has(passengerId)
    ) {
      return null;
    }

    const destinationDistance = distanceBetween(
      { x, z },
      {
        x: destinationX,
        z: destinationZ,
      }
    );

    if (
      destinationDistance <
      settings.minimumTripDistance
    ) {
      throw new RangeError(
        "Passenger destination is too close to the pickup point."
      );
    }

    const passenger = {
      id: passengerId,
      x,
      z,
      destinationX,
      destinationZ,
      fare: Math.max(
        settings.minimumFare,
        Math.min(
          settings.maximumFare,
          Number(fare) ||
            randomBetween(
              settings.minimumFare,
              settings.maximumFare
            )
        )
      ),
      waitingTime: Math.max(
        1,
        Number(waitingTime) ||
          settings.maximumWaitTime
      ),
      status: "waiting",
    };

    waitingPassengers.set(
      passengerId,
      passenger
    );

    return passenger;
  }

  /**
   * Find passengers within pickup range.
   */
  function findNearbyPassengers(keke) {
    const position = getPosition(keke);

    return Array.from(
      waitingPassengers.values()
    )
      .map((passenger) => ({
        passenger,
        distance: distanceBetween(
          position,
          passenger
        ),
      }))
      .filter(
        (item) =>
          item.distance <= settings.pickupRadius
      )
      .sort(
        (a, b) => a.distance - b.distance
      )
      .map((item) => item.passenger);
  }

  /**
   * Pick up a passenger.
   *
   * Returns an event describing the successful pickup,
   * or a failure result if pickup is not possible.
   */
  function pickup(keke, passengerId) {
    const passenger =
      waitingPassengers.get(passengerId);

    if (!passenger) {
      return {
        success: false,
        reason: "Passenger is no longer waiting.",
      };
    }

    if (Math.abs(Number(keke.speed) || 0) > 0.5) {
      return {
        success: false,
        reason: "Stop the keke before picking up passengers.",
      };
    }

    if (
      onboardPassengers.size >=
      settings.maximumCapacity
    ) {
      return {
        success: false,
        reason: "The keke is full.",
      };
    }

    const position = getPosition(keke);

    if (
      distanceBetween(position, passenger) >
      settings.pickupRadius
    ) {
      return {
        success: false,
        reason: "Move closer to the waiting passenger.",
      };
    }

    waitingPassengers.delete(passengerId);

    passenger.status = "onboard";
    passenger.boardedAt = Date.now();

    onboardPassengers.set(
      passengerId,
      passenger
    );

    destinations.set(passengerId, {
      x: passenger.destinationX,
      z: passenger.destinationZ,
    });

    return {
      success: true,
      event: {
        type: "passenger_picked_up",
        passengerId,
        fare: passenger.fare,
        passengersOnboard:
          onboardPassengers.size,
        capacity: settings.maximumCapacity,
      },
    };
  }

  /**
   * Drop off passengers whose destinations are reached.
   */
  function updateDropoffs(keke) {
    const position = getPosition(keke);
    const events = [];

    if (Math.abs(Number(keke.speed) || 0) > 0.5) {
      return events;
    }

    for (const [passengerId, passenger] of onboardPassengers) {
      const destination =
        destinations.get(passengerId);

      if (!destination) {
        continue;
      }

      const distance = distanceBetween(
        position,
        destination
      );

      if (distance > settings.dropoffRadius) {
        continue;
      }

      onboardPassengers.delete(passengerId);
      destinations.delete(passengerId);

      earnings += passenger.fare;
      totalPassengersServed += 1;

      events.push({
        type: "passenger_dropped_off",
        passengerId,
        fareEarned: passenger.fare,
        totalEarnings: earnings,
        totalPassengersServed,
        passengersOnboard:
          onboardPassengers.size,
      });
    }

    return events;
  }

  /**
   * Reduce waiting time and remove passengers
   * who have waited too long.
   */
  function updateWaitingPassengers(deltaTime) {
    const dt = Math.max(
      0,
      Number(deltaTime) || 0
    );

    const events = [];

    for (const [id, passenger] of waitingPassengers) {
      passenger.waitingTime -= dt;

      if (passenger.waitingTime > 0) {
        continue;
      }

      waitingPassengers.delete(id);

      events.push({
        type: "passenger_left",
        passengerId: id,
      });
    }

    return events;
  }

  function update(deltaTime, keke) {
    return {
      dropoffs: updateDropoffs(keke),
      waiting: updateWaitingPassengers(deltaTime),
    };
  }

  function getState() {
    return {
      waitingPassengers: Array.from(
        waitingPassengers.values()
      ),
      onboardPassengers: Array.from(
        onboardPassengers.values()
      ),
      passengersOnboard:
        onboardPassengers.size,
      capacity: settings.maximumCapacity,
      earnings,
      totalPassengersServed,
    };
  }

  function reset() {
    waitingPassengers.clear();
    onboardPassengers.clear();
    destinations.clear();

    earnings = 0;
    totalPassengersServed = 0;
    nextPassengerId = 1;
  }

  return {
    addWaitingPassenger,
    findNearbyPassengers,
    pickup,
    update,
    getState,
    reset,
  };
}