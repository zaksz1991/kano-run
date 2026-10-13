import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";

class ModelLoader {
  constructor() {
    this.loader = new GLTFLoader();
    this.cache = new Map();
    this.loadingPromises = new Map();
  }

  async loadModel(url, options = {}) {
    // Check cache first
    if (this.cache.has(url)) {
      return this.cloneModel(this.cache.get(url), options);
    }

    // Check if already loading
    if (this.loadingPromises.has(url)) {
      const gltf = await this.loadingPromises.get(url);
      return this.cloneModel(gltf, options);
    }

    // Start loading
    const loadPromise = new Promise((resolve, reject) => {
      this.loader.load(
        url,
        (gltf) => {
          this.cache.set(url, gltf);
          this.loadingPromises.delete(url);
          resolve(gltf);
        },
        (progress) => {
          if (options.onProgress) {
            options.onProgress(progress);
          }
        },
        (error) => {
          this.loadingPromises.delete(url);
          reject(error);
        }
      );
    });

    this.loadingPromises.set(url, loadPromise);
    const gltf = await loadPromise;
    return this.cloneModel(gltf, options);
  }

  cloneModel(gltf, options = {}) {
    const model = gltf.scene.clone(true);

    // Apply options
    if (options.scale) {
      model.scale.set(
        options.scale.x || 1,
        options.scale.y || 1,
        options.scale.z || 1
      );
    }

    if (options.rotation) {
      model.rotation.set(
        options.rotation.x || 0,
        options.rotation.y || 0,
        options.rotation.z || 0
      );
    }

    if (options.position) {
      model.position.set(
        options.position.x || 0,
        options.position.y || 0,
        options.position.z || 0
      );
    }

    // Apply color tint if specified
    if (options.color !== undefined) {
      model.traverse((child) => {
        if (child.isMesh && child.material) {
          const material = child.material.clone();
          material.color.set(options.color);
          child.material = material;
        }
      });
    }

    // Enable shadows
    model.traverse((child) => {
      if (child.isMesh) {
        child.castShadow = true;
        child.receiveShadow = true;
      }
    });

    return model;
  }

  clearCache() {
    this.cache.clear();
    this.loadingPromises.clear();
  }

  dispose() {
    this.clearCache();
    this.loader = null;
  }
}

// Singleton instance
const modelLoader = new ModelLoader();

export default modelLoader;
export { ModelLoader };