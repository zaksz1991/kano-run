/**
 * String Utilities
 * RuffNeck Entertainment — Kano Run
 */

export const StringUtils = {
  isString(value) {
    return typeof value === "string";
  },

  isEmpty(value) {
    return value == null || String(value).trim().length === 0;
  },

  capitalize(value) {
    const text = String(value ?? "");
    if (!text) return "";

    return text.charAt(0).toUpperCase() + text.slice(1);
  },

  capitalizeWords(value) {
    return String(value ?? "")
      .trim()
      .toLowerCase()
      .replace(/\b\p{L}/gu, (letter) => letter.toUpperCase());
  },

  camelCase(value) {
    return String(value ?? "")
      .trim()
      .replace(/([a-z\d])([A-Z])/g, "$1 $2")
      .replace(/[^\p{L}\p{N}]+/gu, " ")
      .toLowerCase()
      .split(/\s+/)
      .filter(Boolean)
      .map((word, index) =>
        index === 0
          ? word
          : word.charAt(0).toUpperCase() + word.slice(1)
      )
      .join("");
  },

  kebabCase(value) {
    return String(value ?? "")
      .trim()
      .replace(/([a-z\d])([A-Z])/g, "$1-$2")
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^\p{L}\p{N}]+/gu, "-")
      .replace(/^-+|-+$/g, "");
  },

  snakeCase(value) {
    return this.kebabCase(value).replace(/-/g, "_");
  },

  slugify(value) {
    return this.kebabCase(value);
  },

  truncate(value, maxLength = 100, suffix = "…") {
    const text = String(value ?? "");
    const limit = Math.max(0, Math.floor(maxLength));

    if (text.length <= limit) return text;
    if (limit === 0) return "";

    if (suffix.length >= limit) {
      return suffix.slice(0, limit);
    }

    return text.slice(0, limit - suffix.length).trimEnd() + suffix;
  },

  padStart(value, length, fill = "0") {
    return String(value).padStart(length, fill);
  },

  padEnd(value, length, fill = " ") {
    return String(value).padEnd(length, fill);
  },

  reverse(value) {
    return Array.from(String(value ?? "")).reverse().join("");
  },

  repeat(value, count = 1) {
    return String(value ?? "").repeat(
      Math.max(0, Math.floor(count))
    );
  },

  contains(value, search, ignoreCase = false) {
    let text = String(value ?? "");
    let query = String(search ?? "");

    if (ignoreCase) {
      text = text.toLocaleLowerCase();
      query = query.toLocaleLowerCase();
    }

    return text.includes(query);
  },

  startsWith(value, prefix, ignoreCase = false) {
    let text = String(value ?? "");
    let query = String(prefix ?? "");

    if (ignoreCase) {
      text = text.toLocaleLowerCase();
      query = query.toLocaleLowerCase();
    }

    return text.startsWith(query);
  },

  endsWith(value, suffix, ignoreCase = false) {
    let text = String(value ?? "");
    let query = String(suffix ?? "");

    if (ignoreCase) {
      text = text.toLocaleLowerCase();
      query = query.toLocaleLowerCase();
    }

    return text.endsWith(query);
  },

  count(value, search) {
    const text = String(value ?? "");
    const query = String(search ?? "");

    if (!query) return 0;

    return text.split(query).length - 1;
  },

  removeWhitespace(value) {
    return String(value ?? "").replace(/\s+/g, "");
  },

  normalizeWhitespace(value) {
    return String(value ?? "").trim().replace(/\s+/g, " ");
  },

  stripHtml(value) {
    return String(value ?? "")
      .replace(/<[^>]*>/g, "")
      .replace(/&nbsp;/gi, " ")
      .replace(/&amp;/gi, "&")
      .replace(/&lt;/gi, "<")
      .replace(/&gt;/gi, ">")
      .replace(/&quot;/gi, '"')
      .replace(/&#39;/gi, "'");
  },

  escapeHtml(value) {
    const entities = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;",
    };

    return String(value ?? "").replace(
      /[&<>"']/g,
      (character) => entities[character]
    );
  },

  escapeRegExp(value) {
    return String(value ?? "").replace(
      /[.*+?^${}()|[\]\\]/g,
      "\\$&"
    );
  },

  random(length = 8, rng = Math.random) {
    const size = Math.max(0, Math.floor(length));
    const characters =
      "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";

    let result = "";

    for (let i = 0; i < size; i++) {
      result += characters[
        Math.floor(rng() * characters.length)
      ];
    }

    return result;
  },

  initials(value, maxLength = 2) {
    const words = String(value ?? "")
      .trim()
      .split(/\s+/)
      .filter(Boolean);

    return words
      .slice(0, Math.max(0, maxLength))
      .map((word) => Array.from(word)[0] ?? "")
      .join("")
      .toUpperCase();
  },

  wordCount(value) {
    const text = String(value ?? "").trim();

    return text ? text.split(/\s+/u).length : 0;
  },

  lines(value) {
    return String(value ?? "").split(/\r\n|\r|\n/);
  },

  toNumber(value, fallback = 0) {
    if (typeof value === "number") {
      return Number.isFinite(value) ? value : fallback;
    }

    const parsed = Number(String(value ?? "").trim());

    return Number.isFinite(parsed) ? parsed : fallback;
  },

  toBoolean(value, fallback = false) {
    if (typeof value === "boolean") return value;

    if (typeof value === "number") {
      if (value === 1) return true;
      if (value === 0) return false;
    }

    if (typeof value === "string") {
      const normalized = value.trim().toLowerCase();

      if (["true", "1", "yes", "on"].includes(normalized)) {
        return true;
      }

      if (["false", "0", "no", "off"].includes(normalized)) {
        return false;
      }
    }

    return fallback;
  },

  formatTemplate(template, values = {}) {
    return String(template ?? "").replace(
      /\{\{\s*([\w.-]+)\s*\}\}/g,
      (match, path) => {
        const result = path.split(".").reduce(
          (current, key) => current?.[key],
          values
        );

        return result == null ? match : String(result);
      }
    );
  },

  mask(value, visibleStart = 2, visibleEnd = 2, maskChar = "*") {
    const text = String(value ?? "");
    const start = Math.max(0, Math.floor(visibleStart));
    const end = Math.max(0, Math.floor(visibleEnd));

    if (start + end >= text.length) {
      return maskChar.repeat(text.length);
    }

    return (
      text.slice(0, start) +
      maskChar.repeat(text.length - start - end) +
      text.slice(text.length - end)
    );
  },
};

export default StringUtils;