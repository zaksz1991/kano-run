/**
 * Kano Life renderer mode policy.
 * Canvas 2D is allowed only for an explicit developer audit override, an
 * explicit saved/current Settings choice, or a confirmed no-WebGL condition.
 */
export const WEBGL_UNAVAILABLE_CODE = 'KANO_WEBGL_UNAVAILABLE';

export function createWebGLUnavailableError() {
  const error = new Error('WebGL is unavailable in this browser or device.');
  error.name = 'KanoWebGLUnavailableError';
  error.code = WEBGL_UNAVAILABLE_CODE;
  return error;
}

export function isWebGLUnavailableError(error) {
  return error?.code === WEBGL_UNAVAILABLE_CODE;
}

export function canUse2D({
  force2d = false,
  userSelected2D = false,
  webglUnavailable = false,
} = {}) {
  return Boolean(force2d || userSelected2D || webglUnavailable);
}

/** Frame/render faults should recover the WebGL renderer, not switch modes. */
export function shouldRebuild3DAfterFrameError({
  renderMode = '2D',
  runtimeFailureCount = 0,
} = {}) {
  return renderMode === '3D' && Number(runtimeFailureCount) >= 2;
}
