// Registers the offline/cache service worker on real (https) deployments only.
// Add ?sw=1 to the URL to test it on localhost; ?nosw=1 turns it off for debugging.
export function registerServiceWorker() {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;
  const params = new URLSearchParams(window.location.search);
  if (params.has('nosw')) return;
  const secure = window.location.protocol === 'https:';
  if (!secure && !params.has('sw')) return;

  const register = () => navigator.serviceWorker.register('/sw.js').catch((error) => {
    console.warn('[Kano Life] service worker unavailable', error);
  });

  if (document.readyState === 'complete') register();
  else window.addEventListener('load', register, { once: true });
}
