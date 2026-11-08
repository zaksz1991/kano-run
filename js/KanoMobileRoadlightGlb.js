/**
 * Your own street-light GLB on phones too.
 * The roadlight model is tiny (about 6 KB) but phones skipped it, so phones only showed generated poles.
 * Load it once after start and swap the few phone poles for it. Desktop already does this.
 */
if (typeof window !== 'undefined' && !window.__kanoMobileRoadlight) {
  window.__kanoMobileRoadlight = true;
  let requested = false;
  setInterval(async () => {
    try {
      const R = window.kanoRenderer;
      if (!R || !R.mobile || !R.models || document.hidden) return;
      if (!requested && !R.models.cache?.has?.('roadlight')) {
        requested = true;
        await R.models.load('roadlight');
      }
      if (R.models.cache?.has?.('roadlight') && (R.streetLights || []).some((p) => p?.userData?.proceduralStreetLight)) {
        R.upgradeWorldAssets();
      }
    } catch (error) { /* optional */ }
  }, 3000);
}
