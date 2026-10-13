const DEFAULT_TIMEOUT = 15000;

export default class AssetManager {
  constructor(options = {}) {
    this.basePath = options.basePath ?? "/";
    this.timeout = options.timeout ?? DEFAULT_TIMEOUT;

    this.cache = new Map();
    this.pending = new Map();
    this.failures = new Map();
    this.destroyed = false;

    this.stats = {
      requested: 0,
      loaded: 0,
      failed: 0,
      cached: 0,
    };
  }

  resolvePath(path) {
    if (typeof path !== "string" || !path.trim()) {
      throw new TypeError(
        "[AssetManager] Asset path must be a non-empty string."
      );
    }

    if (/^(https?:|data:|blob:)/i.test(path)) {
      return path;
    }

    const base = this.basePath.endsWith("/")
      ? this.basePath
      : `${this.basePath}/`;

    return `${base}${path.replace(/^\/+/, "")}`;
  }

  async loadJSON(path, options = {}) {
    const url = this.resolvePath(path);

    return this.loadCached(`json:${url}`, async () => {
      const response = await this.fetchWithTimeout(
        url,
        options
      );

      if (!response.ok) {
        throw new Error(
          `Failed to load JSON "${url}": HTTP ${response.status}.`
        );
      }

      return response.json();
    });
  }

  async loadText(path, options = {}) {
    const url = this.resolvePath(path);

    return this.loadCached(`text:${url}`, async () => {
      const response = await this.fetchWithTimeout(
        url,
        options
      );

      if (!response.ok) {
        throw new Error(
          `Failed to load text "${url}": HTTP ${response.status}.`
        );
      }

      return response.text();
    });
  }

  async loadArrayBuffer(path, options = {}) {
    const url = this.resolvePath(path);

    return this.loadCached(`buffer:${url}`, async () => {
      const response = await this.fetchWithTimeout(
        url,
        options
      );

      if (!response.ok) {
        throw new Error(
          `Failed to load binary asset "${url}": HTTP ${response.status}.`
        );
      }

      return response.arrayBuffer();
    });
  }

  async loadImage(path, options = {}) {
    const url = this.resolvePath(path);

    return this.loadCached(`image:${url}`, () => {
      return new Promise((resolve, reject) => {
        if (typeof Image === "undefined") {
          reject(
            new Error("Image loading is not supported in this environment.")
          );
          return;
        }

        const image = new Image();
        let timer = null;

        const cleanup = () => {
          image.onload = null;
          image.onerror = null;

          if (timer !== null) {
            clearTimeout(timer);
            timer = null;
          }
        };

        image.onload = () => {
          cleanup();
          resolve(image);
        };

        image.onerror = () => {
          cleanup();
          reject(new Error(`Failed to load image "${url}".`));
        };

        if (options.crossOrigin) {
          image.crossOrigin = options.crossOrigin;
        }

        timer = setTimeout(() => {
          cleanup();
          image.src = "";
          reject(new Error(`Timed out loading image "${url}".`));
        }, options.timeout ?? this.timeout);

        image.src = url;

        if (image.complete && image.naturalWidth > 0) {
          cleanup();
          resolve(image);
        }
      });
    });
  }

  async loadAudioBuffer(path, audioContext, options = {}) {
    if (!audioContext?.decodeAudioData) {
      throw new TypeError(
        "[AssetManager] A valid AudioContext is required."
      );
    }

    const buffer = await this.loadArrayBuffer(path, options);

    return audioContext.decodeAudioData(buffer.slice(0));
  }

  async loadCached(key, loader) {
    this.assertAvailable();
    this.stats.requested += 1;

    if (this.cache.has(key)) {
      this.stats.cached += 1;
      return this.cache.get(key);
    }

    if (this.pending.has(key)) {
      return this.pending.get(key);
    }

    const task = Promise.resolve()
      .then(loader)
      .then((asset) => {
        this.assertAvailable();

        this.cache.set(key, asset);
        this.failures.delete(key);
        this.stats.loaded += 1;

        return asset;
      })
      .catch((error) => {
        this.failures.set(key, {
          message: error?.message ?? "Unknown asset error",
          time: Date.now(),
        });

        this.stats.failed += 1;
        throw error;
      })
      .finally(() => {
        this.pending.delete(key);
      });

    this.pending.set(key, task);

    return task;
  }

  async fetchWithTimeout(url, options = {}) {
    if (typeof fetch !== "function") {
      throw new Error("Fetch is not supported in this environment.");
    }

    const controller =
      typeof AbortController !== "undefined"
        ? new AbortController()
        : null;

    const timeout = options.timeout ?? this.timeout;

    let timer = null;

    try {
      if (controller) {
        timer = setTimeout(() => {
          controller.abort();
        }, timeout);
      }

      return await fetch(url, {
        ...options,
        signal: controller?.signal ?? options.signal,
      });
    } catch (error) {
      if (error?.name === "AbortError") {
        throw new Error(`Timed out loading asset "${url}".`);
      }

      throw error;
    } finally {
      if (timer !== null) {
        clearTimeout(timer);
      }
    }
  }

  preload(manifest, options = {}) {
    this.assertAvailable();

    if (!Array.isArray(manifest)) {
      throw new TypeError(
        "[AssetManager] preload() expects an array of assets."
      );
    }

    const concurrency = Math.max(
      1,
      Math.floor(options.concurrency ?? 4)
    );

    const results = new Array(manifest.length);
    let nextIndex = 0;

    const worker = async () => {
      while (nextIndex < manifest.length) {
        const index = nextIndex++;
        const item = manifest[index];

        try {
          results[index] = {
            item,
            value: await this.loadManifestItem(item),
            error: null,
          };
        } catch (error) {
          results[index] = {
            item,
            value: null,
            error,
          };

          if (options.failFast) {
            throw error;
          }
        }

        options.onProgress?.({
          completed: results.filter(Boolean).length,
          total: manifest.length,
          item,
        });
      }
    };

    return Promise.all(
      Array.from(
        { length: Math.min(concurrency, manifest.length) },
        () => worker()
      )
    ).then(() => results);
  }

  loadManifestItem(item) {
    if (!item || typeof item.path !== "string") {
      return Promise.reject(
        new TypeError("Each asset needs a path.")
      );
    }

    const options = item.options ?? {};

    switch (item.type) {
      case "json":
        return this.loadJSON(item.path, options);

      case "text":
        return this.loadText(item.path, options);

      case "image":
        return this.loadImage(item.path, options);

      case "buffer":
        return this.loadArrayBuffer(item.path, options);

      default:
        return Promise.reject(
          new Error(`Unsupported asset type: "${item.type}".`)
        );
    }
  }

  has(key) {
    return this.cache.has(key);
  }

  get(key) {
    return this.cache.get(key);
  }

  getStats() {
    return {
      ...this.stats,
      cachedAssets: this.cache.size,
      pendingAssets: this.pending.size,
      failedAssets: this.failures.size,
    };
  }

  getFailures() {
    return Array.from(this.failures.entries()).map(
      ([key, failure]) => ({
        key,
        ...failure,
      })
    );
  }

  remove(key) {
    if (!this.cache.has(key)) return false;

    const asset = this.cache.get(key);

    if (asset instanceof ImageBitmap) {
      asset.close();
    }

    this.cache.delete(key);
    return true;
  }

  clear() {
    for (const asset of this.cache.values()) {
      if (
        typeof ImageBitmap !== "undefined" &&
        asset instanceof ImageBitmap
      ) {
        asset.close();
      }
    }

    this.cache.clear();
    this.failures.clear();
  }

  assertAvailable() {
    if (this.destroyed) {
      throw new Error(
        "[AssetManager] Manager has already been destroyed."
      );
    }
  }

  destroy() {
    if (this.destroyed) return;

    this.clear();
    this.pending.clear();
    this.destroyed = true;
  }
}