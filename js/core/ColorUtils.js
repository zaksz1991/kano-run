const ColorUtils = {
  toHex(value) {
    return Math.round(this.clamp(value, 0, 255))
      .toString(16)
      .padStart(2, "0");
  },

  clamp(value, min = 0, max = 255) {
    return Math.min(Math.max(value, min), max);
  },

  normalizeHex(hex) {
    if (typeof hex !== "string") {
      throw new TypeError("Color must be a hexadecimal string.");
    }

    let value = hex.trim().replace(/^#/, "");

    if (/^[0-9a-fA-F]{3}$/.test(value)) {
      value = value
        .split("")
        .map((character) => character + character)
        .join("");
    }

    if (!/^[0-9a-fA-F]{6}$/.test(value)) {
      throw new Error(`Invalid hexadecimal color: ${hex}`);
    }

    return `#${value.toLowerCase()}`;
  },

  hexToRgb(hex) {
    const normalized = this.normalizeHex(hex).slice(1);
    const value = Number.parseInt(normalized, 16);

    return {
      r: (value >> 16) & 255,
      g: (value >> 8) & 255,
      b: value & 255,
    };
  },

  rgbToHex(r, g, b) {
    return `#${this.toHex(r)}${this.toHex(b === undefined ? g : g)}${this.toHex(b)}`;
  },

  rgbaToString(r, g, b, a = 1) {
    return `rgba(${this.clamp(r)}, ${this.clamp(g)}, ${this.clamp(b)}, ${this.clamp(a, 0, 1)})`;
  },

  hexToRgba(hex, alpha = 1) {
    const { r, g, b } = this.hexToRgb(hex);

    return `rgba(${r}, ${g}, ${b}, ${this.clamp(alpha, 0, 1)})`;
  },

  rgbToHsl(r, g, b) {
    r = this.clamp(r) / 255;
    g = this.clamp(g) / 255;
    b = this.clamp(b) / 255;

    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const difference = max - min;

    let h = 0;
    let s = 0;
    const l = (max + min) / 2;

    if (difference !== 0) {
      s = difference / (1 - Math.abs(2 * l - 1));

      switch (max) {
        case r:
          h = ((g - b) / difference) % 6;
          break;
        case g:
          h = (b - r) / difference + 2;
          break;
        default:
          h = (r - g) / difference + 4;
          break;
      }

      h *= 60;

      if (h < 0) h += 360;
    }

    return {
      h,
      s: s * 100,
      l: l * 100,
    };
  },

  hslToRgb(h, s, l) {
    h = ((h % 360) + 360) % 360;
    s = this.clamp(s, 0, 100) / 100;
    l = this.clamp(l, 0, 100) / 100;

    const chroma = (1 - Math.abs(2 * l - 1)) * s;
    const hueSection = h / 60;
    const secondary = chroma * (1 - Math.abs((hueSection % 2) - 1));
    const offset = l - chroma / 2;

    let r = 0;
    let g = 0;
    let b = 0;

    if (hueSection < 1) {
      r = chroma;
      g = secondary;
    } else if (hueSection < 2) {
      r = secondary;
      g = chroma;
    } else if (hueSection < 3) {
      g = chroma;
      b = secondary;
    } else if (hueSection < 4) {
      g = secondary;
      b = chroma;
    } else if (hueSection < 5) {
      r = secondary;
      b = chroma;
    } else {
      r = chroma;
      b = secondary;
    }

    return {
      r: Math.round((r + offset) * 255),
      g: Math.round((g + offset) * 255),
      b: Math.round((b + offset) * 255),
    };
  },

  hslToHex(h, s, l) {
    const { r, g, b } = this.hslToRgb(h, s, l);
    return this.rgbToHex(r, g, b);
  },

  lighten(hex, amount = 10) {
    const { h, s, l } = this.rgbToHsl(
      ...Object.values(this.hexToRgb(hex))
    );

    return this.hslToHex(h, s, this.clamp(l + amount, 0, 100));
  },

  darken(hex, amount = 10) {
    const { h, s, l } = this.rgbToHsl(
      ...Object.values(this.hexToRgb(hex))
    );

    return this.hslToHex(h, s, this.clamp(l - amount, 0, 100));
  },

  adjustBrightness(hex, amount = 0) {
    const { r, g, b } = this.hexToRgb(hex);

    return this.rgbToHex(
      this.clamp(r + amount),
      this.clamp(g + amount),
      this.clamp(b + amount)
    );
  },

  mix(firstHex, secondHex, amount = 0.5) {
    const first = this.hexToRgb(firstHex);
    const second = this.hexToRgb(secondHex);
    const t = this.clamp(amount, 0, 1);

    return this.rgbToHex(
      first.r + (second.r - first.r) * t,
      first.g + (second.g - first.g) * t,
      first.b + (second.b - first.b) * t
    );
  },

  randomHex() {
    return this.rgbToHex(
      Math.floor(Math.random() * 256),
      Math.floor(Math.random() * 256),
      Math.floor(Math.random() * 256)
    );
  },

  getContrastColor(hex) {
    const { r, g, b } = this.hexToRgb(hex);
    const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;

    return luminance > 0.55 ? "#111111" : "#ffffff";
  },

  getLuminance(hex) {
    const channels = Object.values(this.hexToRgb(hex)).map((value) => {
      const normalized = value / 255;

      return normalized <= 0.04045
        ? normalized / 12.92
        : ((normalized + 0.055) / 1.055) ** 2.4;
    });

    return (
      0.2126 * channels[0] +
      0.7152 * channels[1] +
      0.0722 * channels[2]
    );
  },

  contrastRatio(firstHex, secondHex) {
    const first = this.getLuminance(firstHex);
    const second = this.getLuminance(secondHex);
    const lighter = Math.max(first, second);
    const darker = Math.min(first, second);

    return (lighter + 0.05) / (darker + 0.05);
  },

  palette(baseHex, count = 5) {
    const base = this.hexToRgb(baseHex);
    const { h, s, l } = this.rgbToHsl(base.r, base.g, base.b);
    const total = Math.max(1, Math.floor(count));

    if (total === 1) return [this.normalizeHex(baseHex)];

    return Array.from({ length: total }, (_, index) => {
      const lightness = 15 + (70 * index) / (total - 1);
      return this.hslToHex(h, s, lightness);
    });
  },

  getVehicleColor(vehicleType, fallback = "#00b4d8") {
    const colors = {
      keke: "#fbbf24",
      taxi: "#facc15",
      bus: "#16a34a",
      car: "#2563eb",
      motorcycle: "#dc2626",
      truck: "#64748b",
      police: "#1d4ed8",
      karota: "#ea580c",
      robber: "#7c3aed",
    };

    return colors[String(vehicleType).toLowerCase()] || fallback;
  },
};

export default ColorUtils;