/**
 * Kano Life — mobile world clarity policy.
 * These rules balance legibility with a measured frame-rate escape hatch.
 */
export const KANO_MOBILE_WORLD_CLARITY_POLICY = Object.freeze({
  targetAnisotropy: 4,
  smoothFps: 48,
  softFps: 39,
  emergencyFps: 34,
  standard: Object.freeze({ smooth: 1.0, soft: 0.88, emergency: 0.62 }),
  sharp: Object.freeze({ smooth: 1.1, soft: 0.95, emergency: 0.68 }),
  max: Object.freeze({ smooth: 1.25, soft: 1.0, emergency: 0.72 }),
});

const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));

export function normalizeSharpness(value) {
  return value === 'sharp' || value === 'max' ? value : 'standard';
}

/**
 * Returns the requested minimum rendering ratio for the current performance.
 * The adaptive controller still owns all quality changes. Under severe load the
 * policy explicitly permits a lower ratio instead of forcing clarity at any cost.
 */
export function chooseMobileClarityFloor({ fps = 60, sharpness = 'standard' } = {}) {
  const safeFps = Number.isFinite(Number(fps)) && Number(fps) > 0
    ? Number(fps)
    : 60;
  const profile = KANO_MOBILE_WORLD_CLARITY_POLICY[normalizeSharpness(sharpness)];

  if (safeFps < KANO_MOBILE_WORLD_CLARITY_POLICY.emergencyFps) {
    return profile.emergency;
  }
  if (safeFps < KANO_MOBILE_WORLD_CLARITY_POLICY.smoothFps) {
    return profile.soft;
  }
  return profile.smooth;
}

export function clampRequestedMobileRatio(requestedRatio, {
  fps = 60,
  sharpness = 'standard',
  minimumRatio = 0.58,
  maximumRatio = 1.1,
} = {}) {
  const min = Number.isFinite(Number(minimumRatio)) ? Math.max(0.1, Number(minimumRatio)) : 0.58;
  const max = Number.isFinite(Number(maximumRatio)) ? Math.max(min, Number(maximumRatio)) : 1.1;
  const requested = Number.isFinite(Number(requestedRatio)) ? Number(requestedRatio) : 1;
  const floor = chooseMobileClarityFloor({ fps, sharpness });
  return clamp(Math.max(requested, floor), min, max);
}

export function shouldUseMipmapFiltering(texture) {
  if (!texture || texture.isDataTexture || texture.isVideoTexture || texture.isCompressedTexture) return false;
  return texture.generateMipmaps !== false;
}

export function getClarityTextureSettings(texture, maxAnisotropy = 4) {
  const limit = Number.isFinite(Number(maxAnisotropy))
    ? clamp(Math.floor(Number(maxAnisotropy)), 1, 4)
    : 4;
  return {
    anisotropy: limit,
    magFilter: 'linear',
    minFilter: shouldUseMipmapFiltering(texture) ? 'linear-mipmap-linear' : 'linear',
  };
}
