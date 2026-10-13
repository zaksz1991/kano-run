// js/core/ModalManager.js

export class ModalManager {
  constructor(options = {}) {
    this.options = {
      root: null,
      closeOnBackdrop: true,
      closeOnEscape: true,
      ...options,
    };

    this.root = this.options.root;
    this.stack = [];
    this.listeners = new Map();
    this.previousFocus = new WeakMap();
    this.initialized = false;

    this.handleKeyDown = this.handleKeyDown.bind(this);
    this.handleClick = this.handleClick.bind(this);
  }

  init() {
    if (this.initialized || typeof document === "undefined") {
      return this;
    }

    this.root ??= document.body;

    document.addEventListener("keydown", this.handleKeyDown);
    document.addEventListener("click", this.handleClick);

    this.initialized = true;
    return this;
  }

  open(id, options = {}) {
    if (typeof document === "undefined") {
      return null;
    }

    if (!id || typeof id !== "string") {
      throw new TypeError("Modal ID must be a non-empty string.");
    }

    const element =
      options.element ??
      document.getElementById(id);

    if (!element) {
      throw new Error(`Modal element "${id}" was not found.`);
    }

    const existingIndex = this.stack.findIndex(
      (modal) => modal.id === id
    );

    if (existingIndex !== -1) {
      this.close(id);
    }

    const activeElement = document.activeElement;

    const modal = {
      id,
      element,
      options: {
        closeOnBackdrop: this.options.closeOnBackdrop,
        closeOnEscape: this.options.closeOnEscape,
        lockScroll: true,
        ...options,
      },
      previousFocus: activeElement instanceof HTMLElement
        ? activeElement
        : null,
      previousDisplay: element.style.display,
      previousAriaHidden: element.getAttribute("aria-hidden"),
      previousRole: element.getAttribute("role"),
      previousTabindex: element.getAttribute("tabindex"),
    };

    this.stack.push(modal);

    element.hidden = false;
    element.style.display = options.display ?? "flex";
    element.setAttribute("aria-hidden", "false");
    element.setAttribute("role", element.getAttribute("role") || "dialog");
    element.setAttribute("aria-modal", "true");

    if (!element.hasAttribute("tabindex")) {
      element.setAttribute("tabindex", "-1");
    }

    element.classList.add("is-open");
    element.dataset.modalOpen = "true";

    if (modal.options.lockScroll) {
      document.body.dataset.modalScrollLocked = "true";
      document.body.style.overflow = "hidden";
    }

    this.focusFirstElement(element);
    this.emit("open", { id, element });

    return element;
  }

  close(id, result = null) {
    const index = id
      ? this.stack.findIndex((modal) => modal.id === id)
      : this.stack.length - 1;

    if (index < 0) {
      return false;
    }

    const [modal] = this.stack.splice(index, 1);
    const { element } = modal;

    element.classList.remove("is-open");
    delete element.dataset.modalOpen;

    element.hidden = true;
    element.style.display = modal.previousDisplay;

    this.restoreAttribute(element, "aria-hidden", modal.previousAriaHidden);
    this.restoreAttribute(element, "role", modal.previousRole);
    this.restoreAttribute(element, "tabindex", modal.previousTabindex);

    element.removeAttribute("aria-modal");

    const anotherModalLocksScroll = this.stack.some(
      (item) => item.options.lockScroll
    );

    if (!anotherModalLocksScroll && typeof document !== "undefined") {
      document.body.style.overflow = "";
      delete document.body.dataset.modalScrollLocked;
    }

    if (
      modal.previousFocus &&
      modal.previousFocus.isConnected &&
      typeof modal.previousFocus.focus === "function"
    ) {
      modal.previousFocus.focus();
    }

    this.emit("close", {
      id: modal.id,
      element,
      result,
    });

    return true;
  }

  closeAll() {
    while (this.stack.length > 0) {
      this.close();
    }
  }

  toggle(id, options = {}) {
    if (this.isOpen(id)) {
      this.close(id);
      return false;
    }

    this.open(id, options);
    return true;
  }

  isOpen(id) {
    return this.stack.some((modal) => modal.id === id);
  }

  getActiveModal() {
    return this.stack[this.stack.length - 1] ?? null;
  }

  getOpenModals() {
    return this.stack.map(({ id, element }) => ({ id, element }));
  }

  handleKeyDown(event) {
    const modal = this.getActiveModal();

    if (!modal) {
      return;
    }

    if (event.key === "Escape" && modal.options.closeOnEscape) {
      event.preventDefault();
      this.close(modal.id);
      return;
    }

    if (event.key === "Tab") {
      this.trapFocus(event, modal.element);
    }
  }

  handleClick(event) {
    const closeButton = event.target.closest?.("[data-modal-close]");

    if (closeButton) {
      const modalElement = closeButton.closest("[data-modal]");
      const modal = modalElement
        ? this.stack.find((item) => item.element === modalElement)
        : this.getActiveModal();

      if (modal) {
        event.preventDefault();
        this.close(modal.id);
      }

      return;
    }

    const modal = this.getActiveModal();

    if (
      modal &&
      modal.options.closeOnBackdrop &&
      event.target === modal.element
    ) {
      this.close(modal.id);
    }
  }

  focusFirstElement(element) {
    const selector = [
      "button:not([disabled])",
      "[href]",
      "input:not([disabled])",
      "select:not([disabled])",
      "textarea:not([disabled])",
      '[tabindex]:not([tabindex="-1"])',
    ].join(", ");

    const firstFocusable = element.querySelector(selector);

    (firstFocusable ?? element).focus({ preventScroll: true });
  }

  trapFocus(event, element) {
    const selector = [
      "button:not([disabled])",
      "[href]",
      "input:not([disabled])",
      "select:not([disabled])",
      "textarea:not([disabled])",
      '[tabindex]:not([tabindex="-1"])',
    ].join(", ");

    const focusable = [...element.querySelectorAll(selector)].filter(
      (item) =>
        item.getAttribute("aria-hidden") !== "true" &&
        item.getClientRects().length > 0
    );

    if (focusable.length === 0) {
      event.preventDefault();
      element.focus();
      return;
    }

    const first = focusable[0];
    const last = focusable[focusable.length - 1];

    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (
      !event.shiftKey &&
      document.activeElement === last
    ) {
      event.preventDefault();
      first.focus();
    }
  }

  restoreAttribute(element, name, value) {
    if (value === null || value === undefined) {
      element.removeAttribute(name);
    } else {
      element.setAttribute(name, value);
    }
  }

  on(eventName, callback) {
    if (typeof callback !== "function") {
      throw new TypeError("Modal event listener must be a function.");
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
        console.error(`[ModalManager] ${eventName} listener failed:`, error);
      }
    }
  }

  destroy() {
    this.closeAll();

    if (this.initialized && typeof document !== "undefined") {
      document.removeEventListener("keydown", this.handleKeyDown);
      document.removeEventListener("click", this.handleClick);
    }

    this.listeners.clear();
    this.stack = [];
    this.initialized = false;
  }
}

export default ModalManager;