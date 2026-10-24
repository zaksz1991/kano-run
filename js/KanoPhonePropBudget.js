/**
 * Kano Life — Phone prop / crowd budget
 * -------------------------------------
 * Hides excess non-critical side objects after the 3D scene exists.
 * Never removes player, road, or traffic state — only decorative density.
 *
 * Heuristic: on phone, hide meshes far from origin lateral strip or named décor.
 */
const IS_PHONE =
  typeof navigator !== 'undefined' &&
  (/Mobi|Android|iPhone|iPad|iPod/i.test(navigator.userAgent) ||
    (navigator.maxTouchPoints > 1 && Math.min(screen.width, screen.height) < 600));

function tier() {
  const cores = navigator.hardwareConcurrency || 4;
  const mem = navigator.deviceMemory || 4;
  if (cores <= 4 || mem <= 2) return 'low';
  if (cores <= 6 || mem <= 4) return 'mid';
  return 'high';
}

function budget(t) {
  // Max decorative side props kept visible
  if (t === 'low') return 18;
  if (t === 'mid') return 28;
  return 40;
}

function applyPropBudget() {
  if (!IS_PHONE && !window.kanoPhonePlay?.isPhone) return;

  const t = window.kanoPhonePlay?.profile?.tier || tier();
  const maxProps = budget(t);
  const scene =
    window.__kanoScene ||
    window.game?.renderer?.scene ||
    window.game?.renderer3d?.scene;

  if (!scene || !scene.traverse) {
    console.info('[PropBudget] scene not ready');
    return;
  }

  const candidates = [];
  scene.traverse((obj) => {
    if (!obj.isMesh && !obj.isGroup) return;
    if (obj.userData?.kind === 'keke' || obj.userData?.player) return;
    if (obj.name && /player|road|lane|asphalt/i.test(obj.name)) return;
    // lateral roadside-ish
    const x = Math.abs(obj.position?.x || 0);
    const z = obj.position?.z || 0;
    if (x > 3.2 || obj.userData?.decorative || /pedestrian|tree|prop|crowd|billboard/i.test(obj.name || '')) {
      candidates.push({ obj, score: x + Math.abs(z) * 0.01 });
    }
  });

  candidates.sort((a, b) => b.score - a.score);
  let hidden = 0;
  for (let i = maxProps; i < candidates.length; i++) {
    candidates[i].obj.visible = false;
    hidden++;
  }

  console.info(
    `[PropBudget] tier=${t} kept≤${maxProps} hidden=${hidden} candidates=${candidates.length}`
  );
  window.kanoPhonePropBudget = { maxProps, hidden, candidates: candidates.length, tier: t };
}

function install() {
  // Try a few times as GLBs stream in
  let tries = 0;
  const tick = () => {
    tries += 1;
    applyPropBudget();
    if (tries < 6) setTimeout(tick, 1500 * tries);
  };
  setTimeout(tick, 1200);

  window.kanoPhonePropBudgetRun = applyPropBudget;
  console.info('[PropBudget] armed for phone decorative density');
}

install();
export { install, applyPropBudget };
