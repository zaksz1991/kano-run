
/** Wire title-screen buttons to EventBus once game boots */
export function attachTitleBridge(eventBus) {
  if (!eventBus || typeof window === "undefined") return;
  window.addEventListener("kano:open-garage", () => {
    eventBus.emit?.("garage:open");
  });
  window.addEventListener("kano:open-naija", () => {
    eventBus.emit?.("naija:open");
  });
}
