/**
 * URL Utilities
 * RuffNeck Entertainment — Kano Run
 */

export const UrlUtils = {
  isValid(value) {
    try {
      new URL(value);
      return true;
    } catch {
      return false;
    }
  },

  parse(value, base) {
    try {
      return base
        ? new URL(value, base)
        : new URL(value);
    } catch {
      return null;
    }
  },

  origin(value) {
    return this.parse(value)?.origin ?? null;
  },

  hostname(value) {
    return this.parse(value)?.hostname ?? null;
  },

  pathname(value) {
    return this.parse(value)?.pathname ?? null;
  },

  searchParams(value) {
    return this.parse(value)?.searchParams ?? null;
  },

  getParam(value, key) {
    return this.parse(value)?.searchParams.get(key) ?? null;
  },

  getParams(value, key) {
    return this.parse(value)?.searchParams.getAll(key) ?? [];
  },

  setParam(value, key, parameterValue, base) {
    const url = this.parse(value, base);
    if (!url) return null;

    url.searchParams.set(key, String(parameterValue));

    return url.toString();
  },

  removeParam(value, key, base) {
    const url = this.parse(value, base);
    if (!url) return null;

    url.searchParams.delete(key);

    return url.toString();
  },

  build(base, params = {}) {
    const url = this.parse(base);
    if (!url) return null;

    for (const [key, value] of Object.entries(params)) {
      if (value == null) continue;

      if (Array.isArray(value)) {
        url.searchParams.delete(key);

        for (const item of value) {
          url.searchParams.append(key, String(item));
        }
      } else {
        url.searchParams.set(key, String(value));
      }
    }

    return url.toString();
  },

  join(...parts) {
    const filtered = parts
      .filter((part) => part != null && String(part).length > 0)
      .map((part) => String(part));

    if (!filtered.length) return "";

    return filtered
      .map((part, index) => {
        if (index === 0) {
          return part.replace(/\/+$/, "");
        }

        return part.replace(/^\/+|\/+$/g, "");
      })
      .filter(Boolean)
      .join("/");
  },

  encode(value) {
    return encodeURIComponent(String(value));
  },

  decode(value) {
    try {
      return decodeURIComponent(String(value));
    } catch {
      return String(value);
    }
  },

  encodePathSegment(value) {
    return encodeURIComponent(String(value)).replace(
      /[!'()*]/g,
      (character) =>
        `%${character.charCodeAt(0).toString(16).toUpperCase()}`
    );
  },

  toQueryString(params = {}) {
    const search = new URLSearchParams();

    for (const [key, value] of Object.entries(params)) {
      if (value == null) continue;

      if (Array.isArray(value)) {
        for (const item of value) {
          search.append(key, String(item));
        }
      } else {
        search.set(key, String(value));
      }
    }

    return search.toString();
  },

  normalizePath(path) {
    const value = String(path ?? "").trim();

    if (!value || value === "/") return "/";

    return `/${value
      .split("/")
      .filter(Boolean)
      .join("/")}`;
  },

  ensureTrailingSlash(path) {
    const value = String(path ?? "");

    if (!value) return "/";
    return value.endsWith("/") ? value : `${value}/`;
  },

  removeTrailingSlash(path) {
    const value = String(path ?? "");

    if (value === "/") return "/";
    return value.replace(/\/+$/, "");
  },

  isAbsolute(value) {
    return /^[a-z][a-z\d+.-]*:/i.test(String(value ?? ""));
  },

  isExternal(value, currentOrigin = globalThis.location?.origin) {
    const url = this.parse(value, currentOrigin);

    if (!url) return false;

    return (
      ["http:", "https:"].includes(url.protocol) &&
      (!currentOrigin || url.origin !== currentOrigin)
    );
  },

  isHttp(value) {
    const url = this.parse(value);

    return url !== null &&
      ["http:", "https:"].includes(url.protocol);
  },

  isSecure(value) {
    return this.parse(value)?.protocol === "https:";
  },

  getExtension(value) {
    const url = this.parse(value);
    if (!url) return "";

    const filename = url.pathname.split("/").pop() ?? "";
    const index = filename.lastIndexOf(".");

    return index > 0
      ? filename.slice(index + 1).toLowerCase()
      : "";
  },

  getFilename(value) {
    const url = this.parse(value);
    if (!url) return "";

    return url.pathname.split("/").pop() ?? "";
  },

  stripQuery(value) {
    const url = this.parse(value);
    if (!url) return String(value ?? "");

    url.search = "";
    url.hash = "";

    return url.toString();
  },

  withHash(value, hash, base) {
    const url = this.parse(value, base);
    if (!url) return null;

    url.hash = hash ? String(hash).replace(/^#/, "") : "";

    return url.toString();
  },

  getHash(value) {
    return this.parse(value)?.hash.replace(/^#/, "") ?? "";
  },

  sameOrigin(first, second) {
    const a = this.parse(first);
    const b = this.parse(second);

    return Boolean(a && b && a.origin === b.origin);
  },

  resolve(value, base = globalThis.location?.href) {
    const url = this.parse(value, base);
    return url?.toString() ?? null;
  },
};

export default UrlUtils;