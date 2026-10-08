// Kano Run — Effects Factory
// Phase A upgrade module
//
// Local procedural effects:
//   dust
//   smoke
//   collision flash
//   speed streaks

import * as THREE from '../vendor/three.module.js';

function makeMaterial(
  color,
  opacity = 1,
  size = 0.12
) {
  return new THREE.PointsMaterial({
    color,
    size,
    transparent: true,
    opacity,
    depthWrite: false
  });
}

export function createEffectsManager(
  options = {}
) {
  const root =
    new THREE.Group();

  root.name =
    'effectsManager';

  const dustCount =
    options.dustCount ?? 80;

  const dustPositions =
    new Float32Array(
      dustCount * 3
    );

  for (
    let i = 0;
    i < dustCount;
    i++
  ) {
    dustPositions[i * 3] =
      (Math.random() - 0.5) * 6;

    dustPositions[
      i * 3 + 1
    ] =
      Math.random() * 0.7;

    dustPositions[
      i * 3 + 2
    ] =
      Math.random() * 10;
  }

  const dustGeometry =
    new THREE.BufferGeometry();

  dustGeometry.setAttribute(
    'position',
    new THREE.BufferAttribute(
      dustPositions,
      3
    )
  );

  const dust =
    new THREE.Points(
      dustGeometry,
      makeMaterial(
        0xc4b5a0,
        0.3,
        0.11
      )
    );

  dust.name =
    'dust';

  root.add(dust);

  const collisionGroup =
    new THREE.Group();

  collisionGroup.name =
    'collisionEffects';

  root.add(
    collisionGroup
  );

  const speedGroup =
    new THREE.Group();

  speedGroup.name =
    'speedLines';

  root.add(
    speedGroup
  );

  return {
    root,
    dust,
    collisionGroup,
    speedGroup,

    update({
      speed = 0,
      dt = 1 / 60,
      playerX = 0,
      playerZ = 5.5,
      weather = 'clear'
    } = {}) {
      const position =
        dust.geometry
          .attributes
          .position.array;

      for (
        let i = 0;
        i < position.length;
        i += 3
      ) {
        position[i + 2] -=
          speed *
          dt *
          0.75;

        if (
          position[i + 2] <
          -2
        ) {
          position[i] =
            playerX +
            (Math.random() - 0.5) *
              5;

          position[i + 1] =
            Math.random() *
            0.7;

          position[i + 2] =
            playerZ +
            12 +
            Math.random() *
              20;
        }
      }

      dust.geometry
        .attributes
        .position
        .needsUpdate = true;

      dust.material.opacity =
        weather === 'harmattan'
          ? 0.55
          : weather === 'rain'
            ? 0.06
            : 0.16 +
              Math.min(
                0.3,
                speed * 0.035
              );
    },

    createDustBurst({
      x = 0,
      y = 0.08,
      z = 5.5,
      amount = 10
    } = {}) {
      for (
        let i = 0;
        i < amount;
        i++
      ) {
        const particle =
          new THREE.Mesh(
            new THREE.SphereGeometry(
              0.035 +
                Math.random() *
                  0.055,
              6,
              5
            ),
            new THREE.MeshBasicMaterial({
              color: 0xc4b5a0,
              transparent: true,
              opacity: 0.65,
              depthWrite: false
            })
          );

        particle.position.set(
          x +
            (Math.random() -
              0.5) *
              0.8,
          y +
            Math.random() *
              0.25,
          z +
            (Math.random() -
              0.5) *
              0.8
        );

        particle.userData.life =
          0.45 +
          Math.random() * 0.4;

        particle.userData.velocity =
          new THREE.Vector3(
            (Math.random() -
              0.5) *
              0.8,
            Math.random() *
              0.6,
            (Math.random() -
              0.5) *
              0.8
          );

        collisionGroup.add(
          particle
        );
      }
    },

    createCollisionEffect({
      x = 0,
      z = 5.5
    } = {}) {
      const group =
        new THREE.Group();

      group.position.set(
        x,
        0.7,
        z
      );

      const flash =
        new THREE.Mesh(
          new THREE.SphereGeometry(
            0.22,
            12,
            8
          ),
          new THREE.MeshBasicMaterial({
            color: 0xfbbf24,
            transparent: true,
            opacity: 0.95
          })
        );

      group.add(
        flash
      );

      for (
        let i = 0;
        i < 8;
        i++
      ) {
        const spark =
          new THREE.Mesh(
            new THREE.BoxGeometry(
              0.025,
              0.025,
              0.25
            ),
            new THREE.MeshBasicMaterial({
              color:
                i % 2 === 0
                  ? 0xfbbf24
                  : 0xffffff,
              transparent: true,
              opacity: 0.9
            })
          );

        const angle =
          (Math.PI * 2 * i) /
          8;

        spark.rotation.y =
          angle;

        spark.position.set(
          Math.cos(angle) *
            0.32,
          Math.sin(angle) *
            0.16,
          Math.sin(angle) *
            0.32
        );

        group.add(
          spark
        );
      }

      group.userData.life =
        0.35;

      collisionGroup.add(
        group
      );

      return group;
    },

    updateTransientEffects(
      dt = 1 / 60
    ) {
      const remove = [];

      collisionGroup
        .traverse((node) => {
          if (
            node ===
            collisionGroup
          ) {
            return;
          }

          if (
            !node.userData
              ?.life
          ) {
            return;
          }

          node.userData.life -=
            dt;

          if (
            node.userData.life <=
            0
          ) {
            remove.push(
              node
            );
            return;
          }

          if (
            node.material
          ) {
            node.material.opacity =
              Math.max(
                0,
                node.userData
                  .life /
                  0.5
              );
          }
        });

      for (
        const node of remove
      ) {
        node.parent?.remove(
          node
        );
      }

      const dustParticles =
        [];

      collisionGroup.traverse(
        (node) => {
          if (
            node.userData
              ?.velocity
          ) {
            dustParticles.push(
              node
            );
          }
        }
      );

      for (
        const particle of
          dustParticles
      ) {
        particle.position.addScaledVector(
          particle.userData
            .velocity,
          dt
        );

        particle.userData
          .velocity.y -=
          dt * 0.7;

        if (
          particle.material
        ) {
          particle.material.opacity =
            Math.max(
              0,
              particle.userData
                .life /
                0.8
            );
        }
      }
    },

    dispose() {
      root.traverse(
        (node) => {
          if (!node.isMesh && !node.isPoints) {
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
  };
}

export default createEffectsManager;