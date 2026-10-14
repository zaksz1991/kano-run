import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { BOOT_PRIORITY, MODEL_PATHS } from "./AssetCatalog.js";

/**
 * Two-phase loading:
 * 1. Priority GLBs (player + a few traffic) → allow START
 * 2. Background environment + rest of traffic
 */
export default class BootLoader {
  constructor({ eventBus = null } = {}) {
    this.eventBus = eventBus;
    this.loader = new GLTFLoader();
    this.cache = new Map();
    this.priorityReady = false;
    this.backgroundDone = false;
  }

  async loadPriority(onProgress) {
    const paths = [...BOOT_PRIORITY];
    let done = 0;
    await Promise.all(
      paths.map(
        (path) =>
          new Promise((resolve) => {
            this.loader.load(
              path,
              (gltf) => {
                this.cache.set(path, gltf);
                done += 1;
                onProgress?.(done / paths.length, path);
                resolve(gltf);
              },
              undefined,
              () => {
                done += 1;
                onProgress?.(done / paths.length, path);
                resolve(null);
              },
            );
          }),
      ),
    );
    this.priorityReady = true;
    this.eventBus?.emit?.("boot:priority-ready", {
      count: this.cache.size,
    });
    return this.cache;
  }

  loadBackground(onProgress) {
    const env = [
      ...(MODEL_PATHS.environment.buildingLow || []),
      ...(MODEL_PATHS.environment.props || []).slice(0, 3),
      MODEL_PATHS.traffic.taxi,
      MODEL_PATHS.traffic.bus,
      MODEL_PATHS.characters.passenger,
      MODEL_PATHS.characters.pedestrian,
    ].filter(Boolean);

    let done = 0;
    const total = env.length || 1;

    for (const path of env) {
      if (this.cache.has(path)) {
        done += 1;
        onProgress?.(done / total, path);
        continue;
      }
      this.loader.load(
        path,
        (gltf) => {
          this.cache.set(path, gltf);
          done += 1;
          onProgress?.(done / total, path);
          if (done >= total) {
            this.backgroundDone = true;
            this.eventBus?.emit?.("boot:background-ready", {
              count: this.cache.size,
            });
          }
        },
        undefined,
        () => {
          done += 1;
          onProgress?.(done / total, path);
        },
      );
    }
  }

  get(path) {
    return this.cache.get(path) ?? null;
  }
}
