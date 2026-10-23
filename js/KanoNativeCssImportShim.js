/**
 * Kano Life — native-browser CSS side-effect import compatibility shim.
 *
 * main.js was authored for Vite and contains:
 *   import '../css/kano-responsive-upgrade.css';
 * Native browser ES modules do not load CSS as JavaScript. The import map in
 * index.html redirects that exact resolved CSS URL to this file, while the
 * stylesheet is loaded normally by <link rel="stylesheet">. This module
 * additionally ensures the link exists if markup is adjusted in a later edit.
 */
const CSS_PATH = '/css/kano-responsive-upgrade.css';
const CSS_URL = new URL(CSS_PATH, import.meta.url).href;

if (typeof document !== 'undefined') {
  const isAlreadyLinked = Array.from(document.querySelectorAll('link[rel="stylesheet"]'))
    .some((link) => {
      try {
        return new URL(link.href, document.baseURI).href === CSS_URL;
      } catch {
        return false;
      }
    });

  if (!isAlreadyLinked) {
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = CSS_URL;
    link.dataset.kanoNativeCssImport = 'true';
    document.head.append(link);
  }
}

export {};
