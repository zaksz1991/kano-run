/**
 * Shared sign texture profile for Kano Life's world-space direction boards.
 * Kept intentionally small: a moderate texture increase, not a full-resolution
 * canvas for every sign, to protect mobile memory and upload bandwidth.
 */
export const KANO_SIGNBOARD_TEXTURE_PROFILE = Object.freeze({
  width: 1536,
  height: 384,
  topBand: 32,
  innerBand: 12,
  borderLineWidth: 8,
  titleFontSize: 142,
  subtitleFontSize: 58,
  titleY: 146,
  subtitleY: 278,
  anisotropy: 4,
  titleStrokeWidth: 7,
  subtitleStrokeWidth: 4,
});

export function getKanoSignboardTextureProfile({ maxAnisotropy = 4 } = {}) {
  const maximum = Number.isFinite(Number(maxAnisotropy))
    ? Math.max(1, Math.floor(Number(maxAnisotropy)))
    : 4;
  return {
    ...KANO_SIGNBOARD_TEXTURE_PROFILE,
    anisotropy: Math.min(KANO_SIGNBOARD_TEXTURE_PROFILE.anisotropy, maximum),
  };
}

export function isKanoSignboardTextureProfileValid(profile) {
  if (!profile || typeof profile !== 'object') return false;
  const positive = [
    'width', 'height', 'topBand', 'innerBand', 'borderLineWidth',
    'titleFontSize', 'subtitleFontSize', 'titleY', 'subtitleY',
    'anisotropy', 'titleStrokeWidth', 'subtitleStrokeWidth',
  ];
  if (!positive.every((key) => Number.isFinite(profile[key]) && profile[key] > 0)) return false;
  if (profile.width < 1024 || profile.height < 256) return false;
  if (profile.width / profile.height < 3.5 || profile.width / profile.height > 4.5) return false;
  if (profile.titleY >= profile.subtitleY || profile.subtitleY >= profile.height) return false;
  if (profile.anisotropy > 4) return false;
  return true;
}
