/**
 * KANO LIFE — COLLISION FLASH UPGRADE
 * Adds brief visual effects for traffic and pothole impacts.
 */

const OVERLAY_ID = "kano-life-collision-flash";

function showImpactFlash({
  type = "traffic",
  severity = 0.35,
  side = 0,
} = {}) {
  if (typeof document === "undefined" || !document.body) return;

  let overlay = document.getElementById(OVERLAY_ID);

  if (!overlay) {
    overlay = document.createElement("div");
    overlay.id = OVERLAY_ID;
    overlay.setAttribute("aria-hidden", "true");

    Object.assign(overlay.style, {
      position: "fixed",
      inset: "0",
      zIndex: "2147482000",
      pointerEvents: "none",
      opacity: "0",
      transition: "opacity 70ms ease-out",
      willChange: "opacity",
      mixBlendMode: "screen",
    });

    document.body.appendChild(overlay);
  }

  const power = Math.max(
    0.18,
    Math.min(1, Number(severity) || 0.35)
  );

  const color =
    type === "pothole"
      ? "255,184,52"
      : "255,55,28";

  const focal =
    side < 0 ? "left" :
    side > 0 ? "right" :
    "center";

  overlay.style.background =
    `radial-gradient(
      ellipse at ${focal},
      rgba(${color}, ${0.05 + power * 0.12}) 0%,
      rgba(${color}, ${0.10 + power * 0.20}) 42%,
      transparent 78%
    )`;

  overlay.style.boxShadow =
    `inset 0 0 ${Math.round(18 + power * 52)}px
    rgba(${color}, ${0.12 + power * 0.18})`;

  if (overlay.impactTimer) {
    clearTimeout(overlay.impactTimer);
  }

  overlay.style.opacity = String(0.45 + power * 0.45);

  overlay.impactTimer = setTimeout(() => {
    overlay.style.opacity = "0";
  }, 90 + Math.round(power * 150));
}

/**
 * Public API for the existing collision system.
 */
export function showTrafficImpact(severity = 0.5, side = 0) {
  showImpactFlash({
    type: "traffic",
    severity,
    side,
  });
}

export function showPotholeImpact(severity = 0.4, side = 0) {
  showImpactFlash({
    type: "pothole",
    severity,
    side,
  });
}

/**
 * Allows testing the visual effect from the browser console.
 */
if (typeof window !== "undefined") {
  window.KanoCollisionEffects = {
    traffic: showTrafficImpact,
    pothole: showPotholeImpact,
  };
}