// Kano Run — Renderer Upgrade Adapter
// Phase A
//
// Safe integration layer.
//
// Important:
// This module NEVER assumes that game.onPlayerCollision()
// or any other gameplay callback exists.
//
// It accepts explicit state and optional callbacks.

import * as THREE from '../vendor/three.module.js';

import {
  WorldCollision,
  DEFAULT_LANE_X,
  laneToX
} from './worldCollision.js';

import {
  createPlayerKeke,
  updateKekeAnimation,
  recolorKeke
} from './kekeFactory.js';

import {
  createTrafficVehicle,
  updateTrafficVehicle
} from './trafficFactory.js';

import {
  createRoadSystem,
  createRoadsideModule,
  recycleRoadSegments
} from './roadFactory.js';

import {
  createPassenger,
  updatePedestrian
} from './pedestrianFactory.js';

import {
  createEffectsManager
} from './effectsFactory.js';

import {
  createCameraRig
} from './cameraRig.js';

const DEFAULT_CONFIG = {
  LANES: 3,
  LANE_WIDTH: 2.4,
  PLAYER_Z: 5.5
};

function finite(
  value,
  fallback = 0
) {
  return Number.isFinite(
    Number(value)
  )
    ? Number(value)
    : fallback;
}

function normalizePlayerState(
  state = {},
  config
) {
  const laneX =
    config.laneX;

  const lane =
    finite(
      state.playerLane,
      1
    );

  const worldX =
    Number.isFinite(
      Number(state.worldX)
    )
      ? Number(state.worldX)
      : laneToX(
          lane,
          laneX
        );

  const worldZ =
    finite(
      state.worldZ,
      config.PLAYER_Z
    );

  return {
    ...state,
    playerLane: lane,
    worldX,
    worldZ,
    speed: finite(
      state.speed,
      0
    ),
    accelerating:
      Boolean(
        state.accelerating
      ),
    braking:
      Boolean(
        state.braking
      ),
    steerAmount:
      finite(
        state.steerAmount,
        0
      )
  };
}

function normalizeTraffic(
  traffic,
  config
) {
  if (!Array.isArray(traffic)) {
    return [];
  }

  return traffic.map(
    (item, index) => {
      const lane =
        finite(
          item?.lane,
          1
        );

      const worldX =
        Number.isFinite(
          Number(
            item?.worldX
          )
        )
          ? Number(
              item.worldX
            )
          : laneToX(
              lane,
              config.laneX
            );

      return {
        ...item,
        id:
          item?.id ??
          `${item?.type || 'traffic'}-${index}`,
        lane,
        worldX,
        worldZ: finite(
          item?.worldZ,
          30 + index * 8
        ),
        speed: finite(
          item?.speed,
          0
        ),
        width: finite(
          item?.width,
          1.2
        ),
        length: finite(
          item?.length,
          2
        )
      };
    }
  );
}

export function createRendererUpgrade(
  options = {}
) {
  const scene =
    options.scene;

  const camera =
    options.camera;

  const renderer =
    options.renderer;

  if (!scene) {
    throw new Error(
      'createRendererUpgrade requires a Three.js scene.'
    );
  }

  const config = {
    ...DEFAULT_CONFIG,
    ...(options.config || {})
  };

  config.laneX =
    Array.isArray(
      options.config?.laneX
    )
      ? options.config.laneX.slice()
      : [
          -config.LANE_WIDTH,
          0,
          config.LANE_WIDTH
        ];

  const gameplay = {
    onPlayerCollision:
      typeof options.onPlayerCollision ===
      'function'
        ? options.onPlayerCollision
        : null,

    onPassengerPickup:
      typeof options.onPassengerPickup ===
      'function'
        ? options.onPassengerPickup
        : null,

    onPassengerDrop:
      typeof options.onPassengerDrop ===
      'function'
        ? options.onPassengerDrop
        : null,

    onPoliceEvent:
      typeof options.onPoliceEvent ===
      'function'
        ? options.onPoliceEvent
        : null,

    onKarotaEvent:
      typeof options.onKarotaEvent ===
      'function'
        ? options.onKarotaEvent
        : null
  };

  const root =
    new THREE.Group();

  root.name =
    'rendererUpgrade';

  scene.add(root);

  // --------------------------------------------------
  // Player
  // --------------------------------------------------

  const playerKeke =
    createPlayerKeke({
      paintColor:
        options.paintColor ??
        0xfbbf24
    });

  playerKeke.position.set(
    0,
    0,
    config.PLAYER_Z
  );

  root.add(
    playerKeke
  );

  // --------------------------------------------------
  // Traffic pool
  // --------------------------------------------------

  const trafficRoot =
    new THREE.Group();

  trafficRoot.name =
    'upgradeTraffic';

  root.add(
    trafficRoot
  );

  const trafficPool =
    new Map();

  // --------------------------------------------------
  // Passenger pool
  // --------------------------------------------------

  const passengerRoot =
    new THREE.Group();

  passengerRoot.name =
    'upgradePassengers';

  root.add(
    passengerRoot
  );

  const passengerPool =
    new Map();

  // --------------------------------------------------
  // Road
  // --------------------------------------------------

  const roadSystem =
    createRoadSystem({
      laneX:
        config.laneX
    });

  roadSystem.root.visible =
    false;

  root.add(
    roadSystem.root
  );

  const roadside =
    createRoadsideModule();

  roadside.visible =
    false;

  root.add(
    roadside
  );

  // --------------------------------------------------
  // Effects
  // --------------------------------------------------

  const effects =
    createEffectsManager();

  root.add(
    effects.root
  );

  // --------------------------------------------------
  // Camera
  // --------------------------------------------------

  const cameraRig =
    camera
      ? createCameraRig(
          camera,
          {
            followHeight:
              6.2,
            followZ:
              -3.5,
            lookAhead:
              16
          }
        )
      : null;

  // --------------------------------------------------
  // Collision
  // --------------------------------------------------

  const collisionEvents =
    [];

  const worldCollision =
    new WorldCollision({
      laneX:
        config.laneX,

      onCollision:
        (event) => {
          collisionEvents.push(
            event
          );

          effects.createCollisionEffect(
            {
              x:
                event.impactX,
              z:
                event.impactZ
            }
          );

          cameraRig?.impact(
            1.4,
            0.24
          );

          // Critical:
          // optional callback only.
          // No direct game method call.
          if (
            gameplay.onPlayerCollision
          ) {
            gameplay.onPlayerCollision(
              event
            );
          }
        }
    });

  let playerState =
    normalizePlayerState(
      {},
      config
    );

  let trafficState =
    [];

  let passengerState =
    [];

  let eventState =
    {};

  let frame = 0;

  // --------------------------------------------------
  // Traffic visual management
  // --------------------------------------------------

  function updateTrafficVisuals(
    traffic,
    dt
  ) {
    const activeIds =
      new Set();

    for (
      const item of traffic
    ) {
      if (!item) {
        continue;
      }

      const id =
        item.id;

      activeIds.add(
        id
      );

      let visual =
        trafficPool.get(
          id
        );

      if (!visual) {
        visual =
          createTrafficVehicle(
            item.type ||
              'sedan',
            {
              color:
                item.color
            }
          );

        visual.mesh.userData.id =
          id;

        trafficPool.set(
          id,
          visual
        );

        trafficRoot.add(
          visual.mesh
        );
      }

      visual.mesh.visible =
        item.visible !==
          false;

      visual.mesh.position.x =
        item.worldX;

      visual.mesh.position.z =
        item.worldZ;

      visual.mesh.position.y =
        finite(
          item.worldY,
          0
        );

      visual.box.worldX =
        item.worldX;

      visual.box.worldZ =
        item.worldZ;

      visual.box.width =
        finite(
          item.width,
          visual.box.width
        );

      visual.box.length =
        finite(
          item.length,
          visual.box.length
        );

      updateTrafficVehicle(
        visual,
        item,
        dt
      );

      if (
        item.isPolice ||
        item.type ===
          'police'
      ) {
        gameplay.onPoliceEvent?.(
          {
            traffic: item,
            frame
          }
        );
      }

      if (
        item.isKarota ||
        item.type ===
          'karota'
      ) {
        gameplay.onKarotaEvent?.(
          {
            traffic: item,
            frame
          }
        );
      }
    }

    for (
      const [
        id,
        visual
      ] of trafficPool
    ) {
      if (
        !activeIds.has(id)
      ) {
        visual.mesh.visible =
          false;
      }
    }
  }

  // --------------------------------------------------
  // Passenger visual management
  // --------------------------------------------------

  function updatePassengerVisuals(
    passengers,
    dt
  ) {
    const activeIds =
      new Set();

    for (
      let index = 0;
      index <
      passengers.length;
      index++
    ) {
      const item =
        passengers[index];

      if (!item) {
        continue;
      }

      const id =
        item.id ??
        `passenger-${index}`;

      activeIds.add(
        id
      );

      let visual =
        passengerPool.get(
          id
        );

      if (!visual) {
        visual =
          createPassenger({
            skinColor:
              item.skinColor,
            shirtColor:
              item.shirtColor,
            destination:
              item.destination,
            passengerType:
              item.passengerType,
            vip:
              item.vip,
            aishat:
              item.aishat
          });

        passengerPool.set(
          id,
          visual
        );

        passengerRoot.add(
          visual
        );
      }

      visual.visible =
        item.visible !==
          false;

      visual.position.x =
        finite(
          item.worldX,
          laneToX(
            item.lane,
            config.laneX
          )
        );

      visual.position.z =
        finite(
          item.worldZ,
          20
        );

      visual.position.y =
        finite(
          item.worldY,
          0
        );

      updatePedestrian(
        visual,
        {
          state:
            item.state,
          speed:
            item.speed
        },
        dt
      );

      if (
        item.state ===
        'boarding'
      ) {
        gameplay.onPassengerPickup?.(
          {
            passenger:
              item,
            id,
            frame
          }
        );
      }

      if (
        item.state ===
        'exiting'
      ) {
        gameplay.onPassengerDrop?.(
          {
            passenger:
              item,
            id,
            frame
          }
        );
      }
    }

    for (
      const [
        id,
        visual
      ] of passengerPool
    ) {
      if (
        !activeIds.has(id)
      ) {
        visual.visible =
          false;
      }
    }
  }

  // --------------------------------------------------
  // Public adapter contract
  // --------------------------------------------------

  function setPlayerState(
    state = {}
  ) {
    playerState =
      normalizePlayerState(
        state,
        config
      );

    const targetX =
      playerState.worldX;

    playerKeke.position.x +=
      (
        targetX -
        playerKeke.position.x
      ) *
      0.22;

    playerKeke.position.z =
      playerState.worldZ;

    playerKeke.userData.box.worldX =
      playerKeke.position.x;

    playerKeke.userData.box.worldZ =
      playerKeke.position.z;

    if (
      playerState.selectedPaint
    ) {
      recolorKeke(
        playerKeke,
        playerState.selectedPaint
      );
    }
  }

  function setTrafficState(
    state = {}
  ) {
    trafficState =
      normalizeTraffic(
        state.traffic ??
          state,
        config
      );
  }

  function setRoadState(
    state = {}
  ) {
    if (
      Number.isFinite(
        Number(
          state.roadOffset
        )
      )
    ) {
      for (
        const segment of
          roadSystem.segments
      ) {
        segment.position.z =
          state.roadOffset +
          segment.userData
            .roadOffset;
      }
    }

    if (
      state.visible !==
      undefined
    ) {
      roadSystem.root.visible =
        Boolean(
          state.visible
        );
    }

    if (
      state.roadsideVisible !==
      undefined
    ) {
      roadside.visible =
        Boolean(
          state.roadsideVisible
        );
    }
  }

  function setPassengerState(
    state = {}
  ) {
    passengerState =
      Array.isArray(state)
        ? state
        : state.passengers ??
          [];
  }

  function setEventState(
    state = {}
  ) {
    eventState = {
      ...state
    };
  }

  function update(
    dt = 1 / 60
  ) {
    frame += 1;

    // Player animation.
    updateKekeAnimation(
      playerKeke,
      playerState,
      dt
    );

    // Traffic visuals.
    updateTrafficVisuals(
      trafficState,
      dt
    );

    // Passenger visuals.
    updatePassengerVisuals(
      passengerState,
      dt
    );

    // World collision.
    worldCollision.update({
      frame,
      player: {
        ...playerState,
        worldX:
          playerKeke.position.x,
        worldZ:
          playerKeke.position.z,
        width:
          playerKeke.userData
            .box.width,
        length:
          playerKeke.userData
            .box.length
      },
      traffic:
        trafficState
    });

    // Effects.
    effects.update({
      speed:
        playerState.speed,
      dt,
      playerX:
        playerKeke.position.x,
      playerZ:
        playerKeke.position.z,
      weather:
        eventState.weather ||
        'clear'
    });

    effects.updateTransientEffects(
      dt
    );

    // Camera.
    cameraRig?.update(
      {
        playerX:
          playerKeke.position.x,
        speed:
          playerState.speed
      },
      dt
    );

    recycleRoadSegments(
      roadSystem,
      camera?.position.z ??
        0
    );
  }

  function dispose() {
    for (
      const visual of
        trafficPool.values()
    ) {
      visual.mesh.parent?.remove(
        visual.mesh
      );
    }

    trafficPool.clear();

    for (
      const visual of
        passengerPool.values()
    ) {
      visual.parent?.remove(
        visual
      );
    }

    passengerPool.clear();

    effects.dispose();

    playerKeke.traverse(
      (node) => {
        if (!node.isMesh) {
          return;
        }

        node.geometry?.dispose?.();

        if (
          Array.isArray(
            node.material
          )
        ) {
          node.material.forEach(
            (m) =>
              m?.dispose?.()
          );
        } else {
          node.material?.dispose?.();
        }
      }
    );

    root.parent?.remove(
      root
    );
  }

  return {
    root,

    playerKeke,

    trafficPool,

    passengerPool,

    roadSystem,

    roadside,

    effects,

    cameraRig,

    worldCollision,

    getCollisionEvents() {
      return collisionEvents.slice();
    },

    getPlayerState() {
      return {
        ...playerState
      };
    },

    getTrafficState() {
      return trafficState.slice();
    },

    getPassengerState() {
      return passengerState.slice();
    },

    getEventState() {
      return {
        ...eventState
      };
    },

    setPlayerState,

    setTrafficState,

    setRoadState,

    setPassengerState,

    setEventState,

    update,

    dispose
  };
}

export default createRendererUpgrade;