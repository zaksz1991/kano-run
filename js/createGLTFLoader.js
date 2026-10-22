import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';

/**
 * Create a GLTFLoader configured to load both ordinary GLB assets and models
 * compressed with EXT_meshopt_compression. Existing uncompressed GLBs remain
 * fully supported; the decoder is only used when a model declares the extension.
 */
export function createGLTFLoader(manager) {
  const loader = new GLTFLoader(manager);
  loader.setMeshoptDecoder(MeshoptDecoder);
  return loader;
}

export default createGLTFLoader;
