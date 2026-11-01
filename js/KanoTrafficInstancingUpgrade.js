/**
 * KANO LIFE — STEP 108: GLB traffic instancing.
 * Loaded before the first Renderer3D instance is created.
 */
import * as THREE from 'three';
import { Renderer3D } from './renderer3d.js';
import { installKanoTrafficInstancingLOD } from './KanoTrafficInstancingLOD.js';

installKanoTrafficInstancingLOD(Renderer3D, THREE);
