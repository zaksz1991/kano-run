/**
 * Kano Life — collision feedback overlay
 *
 * Additive helper for the existing Game collision system.
 * No external dependencies. Safe to call repeatedly; it reuses one overlay.
 */
const OVERLAY_ID = "kano-impact-overlay";

export function showCollisionFeedback({
  severity = 0.35,
  kind = "traffic",
  side = 0,
} = {}) {
  if (typeof document === "undefined") return;

  let overlay = document.getElementById(OVERLAY_ID);
  if (!overlay) {
    overlay = document.createElement("div");
    overlay.id = OVERLAY_ID;
    overlay.setAttribute("aria-hidden", "true");
    Object.assign(overlay.style, {
      position: "fixed",
      inset: "0",
      zIndex: "9998",
      pointerEvents: "none",
      opacity: "0",
      overflow: "hidden",
      transition: "opacity 90ms ease-out",
      background:
        "radial-gradient(ellipse at center, transparent 38%, rgba(255,45,20,.12) 100%)",
      boxShadow: "inset 0 0 0 0 rgba(255,45,20,0)",
    });
    document.body.appendChild(overlay);
  }

  const strength = Math.max(0.15, Math.min(1, Number(severity) || 0.35));
  const color = kind === "pothole" ? "255,190,45" : "255,45,20";
  const direction = side < 0 ? "left" : side > 0 ? "right" : "center";

  overlay.style.background =
    `radial-gradient(ellipse at ${direction}, transparent 24%, rgba(${color},${0.10 + strength * 0.22}) 100%)`;
  overlay.style.boxShadow =
    `inset 0 0 ${Math.round(12 + strength * 48)}px rgba(${color},${0.12 + strength * 0.20})`;
  overlay.style.opacity = String(0.55 + strength * 0.4);

  if (overlay._impactTimer) clearTimeout(overlay._impactTimer);
  requestAnimationFrame(() => {
    overlay.style.opacity = "0";
  });
  overlay.style.opacity = String(0.55 + strength * 0.4);
  overlay._impactTimer = setTimeout(() => {
    overlay.style.opacity = "0";
  }, 110 + Math.round(strength * 120));
}
