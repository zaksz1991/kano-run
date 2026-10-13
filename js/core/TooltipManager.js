// js/core/TooltipManager.js

export class TooltipManager {
  constructor(options = {}) {
    this.options = {
      selector: "[data-tooltip]",
      position: "top",
      offset: 10,
      delay: 350,
      hideDelay: 100,
      maxWidth: 280,
      className: "game-tooltip",
      ...options,
    };

    this.tooltip = null;
    this.activeElement = null;
    this.showTimer = null;
    this.hideTimer = null;
    this.listeners = new Map();
    this.initialized = false;

    this.handlePointerOver = this.handlePointerOver.bind(this);
    this.handlePointerOut = this.handlePointerOut.bind(this);
    this.handleFocusIn = this.handleFocusIn.bind(this);
    this.handleFocusOut = this.handleFocusOut.bind(this);
    this.handleKeyDown = this.handleKeyDown.bind(this);
    this.handleScroll = this.handleScroll.bind(this);
    this.handleResize = this.handleResize.bind(this);
  }

  init(root = document) {
    if (this.initialized || typeof document === "undefined") {
      return this;
    }

    this.root = root;
    this.createTooltip();

    root.addEventListener("pointerover", this.handlePointerOver);
    root.addEventListener("pointerout", this.handlePointerOut);
    root.addEventListener("focusin", this.handleFocusIn);
    root.addEventListener("focusout", this.handleFocusOut);

    document.addEventListener("keydown", this.handleKeyDown);
    window.addEventListener("scroll", this.handleScroll, true);
    window.addEventListener("resize", this.handleResize);

    this.initialized = true;
    return this;
  }

  createTooltip() {
    if (this.tooltip || typeof document === "undefined") {
      return this.tooltip;
    }

    const tooltip = document.createElement("div");

    tooltip.className = this.options.className;
    tooltip.id = `game-tooltip-${Math.random().toString(36).slice(2, 9)}`;
    tooltip.setAttribute("role", "tooltip");
    tooltip.setAttribute("aria-hidden", "true");

    Object.assign(tooltip.style, {
      position: "fixed",
      zIndex: "10000",
      maxWidth: `${this.options.maxWidth}px`,
      padding: "8px 12px",
      borderRadius: "6px",
      background: "rgba(11, 30, 58, 0.96)",
      color: "#ffffff",
      fontSize: "13px",
      lineHeight: "1.45",
      overflowWrap: "anywhere",
      pointerEvents: "none",
      opacity: "0",
      visibility: "hidden",
      transform: "translateY(4px)",
      transition: "opacity 120ms ease, transform 120ms ease",
      boxShadow: "0 4px 16px rgba(0, 0, 0, 0.25)",
    });

    document.body.appendChild(tooltip);
    this.tooltip = tooltip;

    return tooltip;
  }

  handlePointerOver(event) {
    const element = this.findTarget(event.target);

    if (!element || element === this.activeElement) {
      return;
    }

    if (
      event.relatedTarget instanceof Node &&
      element.contains(event.relatedTarget)
    ) {
      return;
    }

    this.scheduleShow(element);
  }

  handlePointerOut(event) {
    const element = this.findTarget(event.target);

    if (!element || element !== this.activeElement) {
      return;
    }

    if (
      event.relatedTarget instanceof Node &&
      element.contains(event.relatedTarget)
    ) {
      return;
    }

    this.scheduleHide();
  }

  handleFocusIn(event) {
    const element = this.findTarget(event.target);

    if (element) {
      this.scheduleShow(element, 0);
    }
  }

  handleFocusOut(event) {
    const element = this.findTarget(event.target);

    if (!element || element !== this.activeElement) {
      return;
    }

    this.scheduleHide();
  }

  handleKeyDown(event) {
    if (event.key === "Escape") {
      this.hide();
    }
  }

  handleScroll() {
    if (this.activeElement && this.tooltip?.dataset.visible === "true") {
      this.updatePosition();
    }
  }

  handleResize() {
    if (this.activeElement && this.tooltip?.dataset.visible === "true") {
      this.updatePosition();
    }
  }

  findTarget(target) {
    if (!(target instanceof Element)) {
      return null;
    }

    const element = target.closest(this.options.selector);

    if (!element || !this.root.contains(element)) {
      return null;
    }

    return this.getContent(element) ? element : null;
  }

  getContent(element) {
    return (
      element.getAttribute("data-tooltip") ||
      element.getAttribute("aria-description") ||
      ""
    ).trim();
  }

  scheduleShow(element, delay = this.options.delay) {
    this.clearTimers();
    this.activeElement = element;

    this.showTimer = window.setTimeout(() => {
      if (this.activeElement !== element || !element.isConnected) {
        return;
      }

      this.show(element);
    }, Math.max(0, delay));
  }

  scheduleHide() {
    this.clearTimers();

    this.hideTimer = window.setTimeout(() => {
      this.hide();
    }, Math.max(0, this.options.hideDelay));
  }

  show(element = this.activeElement) {
    if (!element || !element.isConnected || !this.tooltip) {
      return false;
    }

    const content = this.getContent(element);

    if (!content) {
      this.hide();
      return false;
    }

    this.activeElement = element;

    this.tooltip.textContent = content;
    this.tooltip.setAttribute("aria-hidden", "false");
    this.tooltip.style.visibility = "visible";
    this.tooltip.style.opacity = "0";
    this.tooltip.style.transform = "translateY(4px)";
    this.tooltip.dataset.visible = "true";

    const previousDescribedBy = element.getAttribute("aria-describedby");
    const tooltipId = this.tooltip.id;

    if (!element.dataset.tooltipPreviousDescribedBy) {
      element.dataset.tooltipPreviousDescribedBy = previousDescribedBy ?? "";
    }

    const describedBy = new Set(
      (previousDescribedBy || "").split(/\s+/).filter(Boolean)
    );

    describedBy.add(tooltipId);
    element.setAttribute("aria-describedby", [...describedBy].join(" "));

    this.updatePosition();

    requestAnimationFrame(() => {
      if (
        this.tooltip &&
        this.activeElement === element &&
        this.tooltip.dataset.visible === "true"
      ) {
        this.tooltip.style.opacity = "1";
        this.tooltip.style.transform = "translateY(0)";
      }
    });

    this.emit("show", { element, content });

    return true;
  }

  hide() {
    this.clearTimers();

    const element = this.activeElement;

    if (this.tooltip) {
      this.tooltip.style.opacity = "0";
      this.tooltip.style.transform = "translateY(4px)";
      this.tooltip.style.visibility = "hidden";
      this.tooltip.setAttribute("aria-hidden", "true");
      delete this.tooltip.dataset.visible;
    }

    if (element) {
      this.restoreDescribedBy(element);
    }

    this.activeElement = null;

    if (element) {
      this.emit("hide", { element });
    }
  }

  updatePosition() {
    if (!this.activeElement || !this.tooltip) {
      return;
    }

    const element = this.activeElement;

    if (!element.isConnected) {
      this.hide();
      return;
    }

    const targetRect = element.getBoundingClientRect();
    const tooltipRect = this.tooltip.getBoundingClientRect();
    const viewportPadding = 8;

    let position = element.dataset.tooltipPosition || this.options.position;
    let top;
    let left;

    switch (position) {
      case "bottom":
        top = targetRect.bottom + this.options.offset;
        left = targetRect.left + (targetRect.width - tooltipRect.width) / 2;
        break;

      case "left":
        top = targetRect.top + (targetRect.height - tooltipRect.height) / 2;
        left = targetRect.left - tooltipRect.width - this.options.offset;
        break;

      case "right":
        top = targetRect.top + (targetRect.height - tooltipRect.height) / 2;
        left = targetRect.right + this.options.offset;
        break;

      case "top":
      default:
        top = targetRect.top - tooltipRect.height - this.options.offset;
        left = targetRect.left + (targetRect.width - tooltipRect.width) / 2;
        break;
    }

    if (position === "top" && top < viewportPadding) {
      top = targetRect.bottom + this.options.offset;
      position = "bottom";
    } else if (
      position === "bottom" &&
      top + tooltipRect.height > window.innerHeight - viewportPadding
    ) {
      top = targetRect.top - tooltipRect.height - this.options.offset;
      position = "top";
    }

    if (
      position === "left" &&
      left < viewportPadding
    ) {
      left = targetRect.right + this.options.offset;
    } else if (
      position === "right" &&
      left + tooltipRect.width > window.innerWidth - viewportPadding
    ) {
      left = targetRect.left - tooltipRect.width - this.options.offset;
    }

    left = Math.max(
      viewportPadding,
      Math.min(left, window.innerWidth - tooltipRect.width - viewportPadding)
    );

    top = Math.max(
      viewportPadding,
      Math.min(top, window.innerHeight - tooltipRect.height - viewportPadding)
    );

    this.tooltip.dataset.position = position;
    this.tooltip.style.left = `${left}px`;
    this.tooltip.style.top = `${top}px`;
  }

  restoreDescribedBy(element) {
    if (!element) {
      return;
    }

    const previous = element.dataset.tooltipPreviousDescribedBy;

    if (previous === undefined) {
      return;
    }

    if (previous) {
      element.setAttribute("aria-describedby", previous);
    } else {
      element.removeAttribute("aria-describedby");
    }

    delete element.dataset.tooltipPreviousDescribedBy;
  }

  clearTimers() {
    if (this.showTimer !== null) {
      clearTimeout(this.showTimer);
      this.showTimer = null;
    }

    if (this.hideTimer !== null) {
      clearTimeout(this.hideTimer);
      this.hideTimer = null;
    }
  }

  setContent(element, content) {
    if (!element) {
      return false;
    }

    if (content === null || content === undefined || content === "") {
      element.removeAttribute("data-tooltip");

      if (this.activeElement === element) {
        this.hide();
      }

      return true;
    }

    element.setAttribute("data-tooltip", String(content));

    if (this.activeElement === element && this.tooltip?.dataset.visible === "true") {
      this.tooltip.textContent = String(content);
      this.updatePosition();
    }

    return true;
  }

  on(eventName, callback) {
    if (typeof callback !== "function") {
      throw new TypeError("Tooltip event listener must be a function.");
    }

    if (!this.listeners.has(eventName)) {
      this.listeners.set(eventName, new Set());
    }

    this.listeners.get(eventName).add(callback);

    return () => this.off(eventName, callback);
  }

  off(eventName, callback) {
    const callbacks = this.listeners.get(eventName);

    if (!callbacks) {
      return false;
    }

    const removed = callbacks.delete(callback);

    if (callbacks.size === 0) {
      this.listeners.delete(eventName);
    }

    return removed;
  }

  emit(eventName, payload) {
    const callbacks = this.listeners.get(eventName);

    if (!callbacks) {
      return;
    }

    for (const callback of [...callbacks]) {
      try {
        callback(payload);
      } catch (error) {
        console.error(`[TooltipManager] ${eventName} listener failed:`, error);
      }
    }
  }

  destroy() {
    this.hide();
    this.clearTimers();

    if (this.initialized && typeof document !== "undefined") {
      this.root.removeEventListener("pointerover", this.handlePointerOver);
      this.root.removeEventListener("pointerout", this.handlePointerOut);
      this.root.removeEventListener("focusin", this.handleFocusIn);
      this.root.removeEventListener("focusout", this.handleFocusOut);

      document.removeEventListener("keydown", this.handleKeyDown);
      window.removeEventListener("scroll", this.handleScroll, true);
      window.removeEventListener("resize", this.handleResize);
    }

    this.tooltip?.remove();
    this.tooltip = null;
    this.activeElement = null;
    this.listeners.clear();
    this.initialized = false;
  }
}

export default TooltipManager;