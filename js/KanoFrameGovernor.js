/**
 * Automatic safety valve for slow phones. It watches the real frame rate and,
 * when the game stays below ~26 FPS, sheds purely decorative scenery in steps
 * (never traffic, the road, the player or pick-up zones, so gameplay and
 * collisions are unchanged). When the frame rate recovers it brings things back.
 *
 *  level 1: roadside gags and utility poles hidden, pavement people limited to 3
 *  level 2: all pavement people and street officers hidden
 *  level 3: roadside ads hidden and the view distance shortened
 */
const DECOR_L1 = /^(KANO_ROADSIDE_GAGS|KANO_UTILITY_POLES)$/;
const DECOR_L2 = /^(KANO_STREET_ANIMALS_OFFICERS|PURE_WATER_HAWKER)$/;
const DECOR_L3 = /^KANO_ROADSIDE_ADS$/;

let level = 0;
let lowFor = 0;
let highFor = 0;
let last = 0;
let frames = 0;
let clock = 0;
const original = { fogFar: null, cameraFar: null };

function renderer() {
  return typeof window !== 'undefined' ? window.__KANO_ACTIVE_RENDERER__ : null;
}

function apply(r) {
  if (!r?.world) return;
  for (const child of r.world.children) {
    const name = String(child.name || '');
    if (DECOR_L1.test(name)) child.visible = level < 1;
    else if (DECOR_L2.test(name)) child.visible = level < 2;
    else if (DECOR_L3.test(name)) child.visible = level < 3;
  }
  (r.pedestrians || []).forEach((person, index) => {
    if (!person?.actor) return;
    person.actor.visible = level === 0 ? true : level === 1 ? index < 3 : false;
  });
  if (r.scene?.fog) {
    if (original.fogFar === null) original.fogFar = r.scene.fog.far;
    r.scene.fog.far = level >= 3 ? Math.min(original.fogFar, 80) : original.fogFar;
  }
  if (r.camera) {
    if (original.cameraFar === null) original.cameraFar = r.camera.far;
    const far = level >= 3 ? Math.min(original.cameraFar, 100) : original.cameraFar;
    if (r.camera.far !== far) { r.camera.far = far; r.camera.updateProjectionMatrix(); }
  }
  window.kanoFrameGovernorLevel = level;
}

function tick(now) {
  if (!last) last = now;
  frames += 1;
  if (now - last >= 1000) {
    const fps = (frames * 1000) / (now - last);
    frames = 0; last = now; clock += 1;
    const r = renderer();
    const playing = Boolean(r?.world?.visible) && (!r.lifeScene || r.lifeScene === 'road') && !document.hidden;
    if (playing) {
      if (fps < 26) { lowFor += 1; highFor = 0; } else if (fps > 50) { highFor += 1; lowFor = 0; } else { lowFor = 0; highFor = 0; }
      if (lowFor >= 3 && level < 3) { level += 1; lowFor = 0; }
      else if (highFor >= 12 && level > 0) { level -= 1; highFor = 0; }
      if (level > 0 || window.kanoFrameGovernorLevel) apply(r);
    }
  }
  requestAnimationFrame(tick);
}

if (typeof window !== 'undefined' && typeof requestAnimationFrame === 'function' && !window.__kanoFrameGovernor) {
  window.__kanoFrameGovernor = true;
  requestAnimationFrame(tick);
}
