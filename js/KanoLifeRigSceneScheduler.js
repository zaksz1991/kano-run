/**
 * KANO LIFE — active life-scene rig selection.
 *
 * Life-activity rigs belong to one named life scene. Only rigs whose scene is
 * currently active need their procedural animation updates. This helper is
 * deliberately small and side-effect-limited: it updates root visibility and
 * returns the active rig list without changing animation state or transforms.
 */
export function syncActiveLifeRigs(lifeRigs, activeRigs, activeScene) {
  if (!Array.isArray(activeRigs)) {
    throw new TypeError('syncActiveLifeRigs requires a reusable activeRigs array.');
  }

  activeRigs.length = 0;
  for (const rig of Array.isArray(lifeRigs) ? lifeRigs : []) {
    if (!rig) continue;
    const active = rig.scene === activeScene;
    if (rig.root && rig.root.visible !== active) rig.root.visible = active;
    if (active) activeRigs.push(rig);
  }
  return activeRigs;
}
