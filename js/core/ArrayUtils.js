/**
 * Array Utilities
 * RuffNeck Entertainment — Kano Run
 */

export const ArrayUtils = {
  isArray(value) {
    return Array.isArray(value);
  },

  unique(items) {
    return [...new Set(items)];
  },

  uniqueBy(items, selector) {
    const seen = new Set();

    return items.filter((item) => {
      const key =
        typeof selector === "function"
          ? selector(item)
          : item?.[selector];

      if (seen.has(key)) return false;

      seen.add(key);
      return true;
    });
  },

  shuffle(items, random = Math.random) {
    const result = [...items];

    for (let i = result.length - 1; i > 0; i--) {
      const j = Math.floor(random() * (i + 1));
      [result[i], result[j]] = [result[j], result[i]];
    }

    return result;
  },

  sample(items, random = Math.random) {
    if (!items.length) return undefined;

    const index = Math.min(
      items.length - 1,
      Math.floor(random() * items.length)
    );

    return items[index];
  },

  sampleMany(items, count, random = Math.random) {
    const amount = Math.max(
      0,
      Math.min(items.length, Math.floor(count))
    );

    return this.shuffle(items, random).slice(0, amount);
  },

  chunk(items, size) {
    if (!Number.isInteger(size) || size < 1) {
      throw new RangeError("Chunk size must be a positive integer.");
    }

    const result = [];

    for (let i = 0; i < items.length; i += size) {
      result.push(items.slice(i, i + size));
    }

    return result;
  },

  compact(items) {
    return items.filter(Boolean);
  },

  flatten(items, depth = Infinity) {
    return items.flat(depth);
  },

  groupBy(items, selector) {
    const groups = new Map();

    for (const item of items) {
      const key =
        typeof selector === "function"
          ? selector(item)
          : item?.[selector];

      if (!groups.has(key)) {
        groups.set(key, []);
      }

      groups.get(key).push(item);
    }

    return groups;
  },

  countBy(items, selector) {
    const counts = new Map();

    for (const item of items) {
      const key =
        typeof selector === "function"
          ? selector(item)
          : item?.[selector];

      counts.set(key, (counts.get(key) ?? 0) + 1);
    }

    return counts;
  },

  sum(items, selector = (value) => value) {
    return items.reduce(
      (total, item) => total + Number(selector(item) || 0),
      0
    );
  },

  average(items, selector = (value) => value) {
    if (!items.length) return 0;

    return this.sum(items, selector) / items.length;
  },

  min(items, selector = (value) => value) {
    if (!items.length) return undefined;

    return items.reduce((best, item) =>
      selector(item) < selector(best) ? item : best
    );
  },

  max(items, selector = (value) => value) {
    if (!items.length) return undefined;

    return items.reduce((best, item) =>
      selector(item) > selector(best) ? item : best
    );
  },

  partition(items, predicate) {
    const matched = [];
    const unmatched = [];

    for (const item of items) {
      (predicate(item) ? matched : unmatched).push(item);
    }

    return [matched, unmatched];
  },

  difference(first, second) {
    const excluded = new Set(second);
    return first.filter((item) => !excluded.has(item));
  },

  intersection(first, second) {
    const included = new Set(second);
    return this.unique(first.filter((item) => included.has(item)));
  },

  rotate(items, offset = 0) {
    if (!items.length) return [];

    const normalized =
      ((Math.trunc(offset) % items.length) + items.length) %
      items.length;

    return [
      ...items.slice(normalized),
      ...items.slice(0, normalized),
    ];
  },

  last(items) {
    return items.length ? items[items.length - 1] : undefined;
  },

  first(items) {
    return items.length ? items[0] : undefined;
  },

  removeAt(items, index) {
    if (index < 0 || index >= items.length) {
      return [...items];
    }

    return items.filter((_, currentIndex) => currentIndex !== index);
  },

  move(items, fromIndex, toIndex) {
    const result = [...items];

    if (
      fromIndex < 0 ||
      fromIndex >= result.length ||
      toIndex < 0 ||
      toIndex >= result.length
    ) {
      return result;
    }

    const [item] = result.splice(fromIndex, 1);
    result.splice(toIndex, 0, item);

    return result;
  },

  range(start, end, step = 1) {
    if (step === 0) {
      throw new RangeError("Range step cannot be zero.");
    }

    const result = [];
    const direction = start <= end ? 1 : -1;
    const increment = Math.abs(step) * direction;

    for (
      let value = start;
      direction > 0 ? value < end : value > end;
      value += increment
    ) {
      result.push(value);
    }

    return result;
  },

  binarySearch(items, target, compare = (a, b) => a - b) {
    let low = 0;
    let high = items.length - 1;

    while (low <= high) {
      const middle = Math.floor((low + high) / 2);
      const result = compare(items[middle], target);

      if (result === 0) return middle;
      if (result < 0) low = middle + 1;
      else high = middle - 1;
    }

    return -1;
  },

  sortBy(items, selector, direction = "asc") {
    const multiplier = direction === "desc" ? -1 : 1;

    return [...items].sort((a, b) => {
      const first =
        typeof selector === "function" ? selector(a) : a?.[selector];

      const second =
        typeof selector === "function" ? selector(b) : b?.[selector];

      if (first == null && second == null) return 0;
      if (first == null) return 1;
      if (second == null) return -1;

      if (first < second) return -1 * multiplier;
      if (first > second) return 1 * multiplier;

      return 0;
    });
  },
};

export default ArrayUtils;