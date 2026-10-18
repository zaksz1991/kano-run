// ============================================================
// KANO LIFE — INPUT CONTROLS
// File: js/controls.js
//
// Supports:
// - Keyboard steering, acceleration, and braking
// - Reverse gear using R or the on-screen reverse button
// - Touchscreen driving buttons
// - Horizontal swipe steering
// - Horn and pause controls
// - Multi-source held inputs (keyboard + touch)
// - Automatic release of held controls on focus loss
// ============================================================

const CONTROLLED_KEYS = new Set([
  'arrowleft',
  'arrowright',
  'arrowup',
  'arrowdown',
  ' ',
  'a',
  'd',
  'w',
  'h',
  'r',
  'escape',
]);

const DISCRETE_ACTIONS = new Set([
  'left',
  'right',
  'horn',
  'reverse',
]);

const HELD_ACTIONS = new Set(['gas', 'brake']);

export class Controls {
  constructor(root, handlers = {}) {
    if (!root || typeof root.addEventListener !== 'function') {
      throw new TypeError('Controls requires a valid root DOM element.');
    }

    this.root = root;
    this.handlers = handlers;
    this.keys = new Set();
    this.pointer = null;
    this.disposers = [];

    // Keep an action active until every input source releases it.
    this.heldSources = new Map([
      ['gas', new Set()],
      ['brake', new Set()],
    ]);

    this.on(window, 'keydown', (event) => this.onKeyDown(event));
    this.on(window, 'keyup', (event) => this.onKeyUp(event));

    this.on(window, 'blur', () => this.releaseHeldControls());

    this.on(document, 'visibilitychange', () => {
      if (document.hidden) this.releaseHeldControls();
    });

    this.on(root, 'pointerdown', (event) => this.onPointerDown(event));
    this.on(root, 'pointerup', (event) => this.onPointerUp(event));

    this.on(root, 'pointercancel', (event) => {
      if (!this.pointer || this.pointer.pointerId === event.pointerId) {
        this.pointer = null;
      }
    });

    this.bindActionButtons();
  }

  // ----------------------------------------------------------
  // EVENT MANAGEMENT
  // ----------------------------------------------------------

  on(target, name, handler, options) {
    target.addEventListener(name, handler, options);

    this.disposers.push(() => {
      target.removeEventListener(name, handler, options);
    });
  }

  callHandler(name, ...args) {
    const handler = this.handlers[name];

    if (typeof handler === 'function') {
      return handler(...args);
    }

    return undefined;
  }

  isEditableTarget(target) {
    return Boolean(
      target instanceof Element
      && target.closest(
        'input, textarea, select, [contenteditable="true"], [role="textbox"]',
      ),
    );
  }

  // ----------------------------------------------------------
  // KEYBOARD INPUT
  // ----------------------------------------------------------

  onKeyDown(event) {
    const key = String(event.key || '').toLowerCase();

    // Do not steer or change gears while typing in an input.
    if (this.isEditableTarget(event.target) && key !== 'escape') {
      return;
    }

    if (CONTROLLED_KEYS.has(key)) {
      event.preventDefault();
    }

    // Ignore repeated keydown events while a key is held.
    if (this.keys.has(key)) return;

    this.keys.add(key);

    if (key === 'escape') {
      this.callHandler('menu');
      return;
    }

    if (key === 'h') {
      this.callHandler('horn');
      return;
    }

    if (key === 'r') {
      this.callHandler('reverse');
      return;
    }

    if (key === 'arrowleft' || key === 'a') {
      this.callHandler('lane', -1);
      return;
    }

    if (key === 'arrowright' || key === 'd') {
      this.callHandler('lane', 1);
      return;
    }

    if (key === ' ' || key === 'arrowdown') {
      this.setHeld('brake', `key:${key}`, true);
      return;
    }

    if (key === 'arrowup' || key === 'w') {
      this.setHeld('gas', `key:${key}`, true);
    }
  }

  onKeyUp(event) {
    const key = String(event.key || '').toLowerCase();

    this.keys.delete(key);

    if (key === ' ' || key === 'arrowdown') {
      this.setHeld('brake', `key:${key}`, false);
    }

    if (key === 'arrowup' || key === 'w') {
      this.setHeld('gas', `key:${key}`, false);
    }
  }

  // ----------------------------------------------------------
  // HELD INPUT STATE
  // ----------------------------------------------------------

  setHeld(action, source, pressed) {
    if (!HELD_ACTIONS.has(action)) return;

    const sources = this.heldSources.get(action);

    if (!sources) return;

    const wasPressed = sources.size > 0;

    if (pressed) {
      sources.add(source);
    } else {
      sources.delete(source);
    }

    const isPressed = sources.size > 0;

    // Notify the game only when the overall action changes state.
    if (wasPressed !== isPressed) {
      this.callHandler(action, isPressed);
    }
  }

  // ----------------------------------------------------------
  // TOUCH AND MOUSE SWIPE STEERING
  // ----------------------------------------------------------

  onPointerDown(event) {
    // Interactive elements handle their own pointer events.
    if (
      event.target instanceof Element
      && event.target.closest(
        'button, select, a, .screen, .event-card, input, textarea',
      )
    ) {
      return;
    }

    if (event.pointerType === 'mouse' && event.button !== 0) {
      return;
    }

    this.pointer = {
      x: event.clientX,
      y: event.clientY,
      pointerId: event.pointerId,
    };

    try {
      this.root.setPointerCapture(event.pointerId);
    } catch {
      // Pointer capture is optional.
    }
  }

  onPointerUp(event) {
    if (!this.pointer) return;
    if (event.pointerId !== this.pointer.pointerId) return;

    const deltaX = event.clientX - this.pointer.x;
    const deltaY = event.clientY - this.pointer.y;

    if (
      Math.abs(deltaX) > 28
      && Math.abs(deltaX) > Math.abs(deltaY)
    ) {
      this.callHandler('lane', deltaX < 0 ? -1 : 1);
    }

    this.pointer = null;
  }

  // ----------------------------------------------------------
  // ON-SCREEN BUTTONS
  // ----------------------------------------------------------

  bindActionButtons() {
    // The reverse button works with either data-action="reverse"
    // or just id="reverse-btn" in index.html.
    const buttons = this.root.querySelectorAll(
      '[data-action], #reverse-btn',
    );

    buttons.forEach((button, index) => {
      const action = button.dataset.action
        || (button.id === 'reverse-btn' ? 'reverse' : '');

      if (!action) return;

      const buttonKey = button.id || `action-${action}-${index}`;

      const sourceFor = (event) =>
        `button:${buttonKey}:${event.pointerId}`;

      const down = (event) => {
        if (event.pointerType === 'mouse' && event.button !== 0) {
          return;
        }

        event.preventDefault();

        if (HELD_ACTIONS.has(action)) {
          try {
            button.setPointerCapture(event.pointerId);
          } catch {
            // Pointer capture may not be supported.
          }

          this.setHeld(action, sourceFor(event), true);
          return;
        }

        this.activateAction(action);
      };

      const up = (event) => {
        if (!HELD_ACTIONS.has(action)) return;

        event.preventDefault();
        this.setHeld(action, sourceFor(event), false);
      };

      this.on(button, 'pointerdown', down);
      this.on(button, 'pointerup', up);
      this.on(button, 'pointercancel', up);
      this.on(button, 'lostpointercapture', up);

      this.on(button, 'pointerleave', (event) => {
        if (event.buttons === 0) {
          up(event);
        }
      });

      // Support keyboard activation of focused buttons. Pointer clicks
      // are already handled by pointerdown and must not trigger twice.
      this.on(button, 'click', (event) => {
        if (event.detail !== 0 || HELD_ACTIONS.has(action)) {
          return;
        }

        event.preventDefault();
        this.activateAction(action);
      });
    });
  }

  activateAction(action) {
    if (DISCRETE_ACTIONS.has(action)) {
      if (action === 'left') {
        this.callHandler('lane', -1);
      } else if (action === 'right') {
        this.callHandler('lane', 1);
      } else if (action === 'horn') {
        this.callHandler('horn');
      } else if (action === 'reverse') {
        this.callHandler('reverse');
      }
    }
  }

  // ----------------------------------------------------------
  // RELEASE STUCK INPUTS
  // ----------------------------------------------------------

  releaseHeldControls() {
    this.keys.clear();
    this.pointer = null;

    for (const action of HELD_ACTIONS) {
      const sources = this.heldSources.get(action);

      if (sources) {
        sources.clear();
      }

      // Always release both actions when the window loses focus.
      this.callHandler(action, false);
    }
  }

  // ----------------------------------------------------------
  // CLEANUP
  // ----------------------------------------------------------

  dispose() {
    this.releaseHeldControls();

    this.disposers.forEach((dispose) => dispose());
    this.disposers = [];
  }
}