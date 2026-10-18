// ============================================================
// KANO LIFE — INPUT CONTROLS
// File: js/controls.js
//
// Supports:
// - Keyboard steering
// - Forward acceleration and braking
// - Reverse-gear keyboard shortcut (R)
// - Touchscreen driving buttons
// - Horizontal swipe steering
// - Horn and pause controls
// - Automatic release of held controls
// ============================================================

export class Controls {
  constructor(root, handlers) {
    this.root = root;
    this.handlers = handlers;

    this.keys = new Set();
    this.pointer = null;
    this.disposers = [];

    this.on(window, 'keydown', (event) => {
      this.onKeyDown(event);
    });

    this.on(window, 'keyup', (event) => {
      this.onKeyUp(event);
    });

    this.on(window, 'blur', () => {
      this.releaseHeldControls();
    });

    this.on(document, 'visibilitychange', () => {
      if (document.hidden) {
        this.releaseHeldControls();
      }
    });

    this.on(root, 'pointerdown', (event) => {
      this.onPointerDown(event);
    });

    this.on(root, 'pointerup', (event) => {
      this.onPointerUp(event);
    });

    this.on(root, 'pointercancel', () => {
      this.pointer = null;
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

  // ----------------------------------------------------------
  // KEYBOARD INPUT
  // ----------------------------------------------------------

  onKeyDown(event) {
    const key = event.key.toLowerCase();

    const controlled = [
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
    ];

    if (controlled.includes(key)) {
      event.preventDefault();
    }

    // Do not repeat discrete actions while a key remains held.
    if (
      this.keys.has(key)
      && [
        'arrowleft',
        'arrowright',
        'a',
        'd',
        'h',
        'r',
        'escape',
      ].includes(key)
    ) {
      return;
    }

    this.keys.add(key);

    if (key === 'escape') {
      this.handlers.menu();
    } else if (key === 'h') {
      this.handlers.horn();
    } else if (key === 'r') {
      // Reverse must be connected by main.js.
      // Existing builds without this handler remain functional.
      if (typeof this.handlers.reverse === 'function') {
        this.handlers.reverse();
      }
    } else if (
      key === 'arrowleft'
      || key === 'a'
    ) {
      this.handlers.lane(-1);
    } else if (
      key === 'arrowright'
      || key === 'd'
    ) {
      this.handlers.lane(1);
    } else if (
      key === ' '
      || key === 'arrowdown'
    ) {
      this.handlers.brake(true);
    } else if (
      key === 'arrowup'
      || key === 'w'
    ) {
      this.handlers.gas(true);
    }
  }

  onKeyUp(event) {
    const key = event.key.toLowerCase();

    this.keys.delete(key);

    if (
      key === ' '
      || key === 'arrowdown'
    ) {
      this.handlers.brake(false);
    }

    if (
      key === 'arrowup'
      || key === 'w'
    ) {
      this.handlers.gas(false);
    }
  }

  // ----------------------------------------------------------
  // TOUCH AND MOUSE SWIPE STEERING
  // ----------------------------------------------------------

  onPointerDown(event) {
    // Interactive elements handle their own pointer events.
    if (
      event.target.closest(
        'button, select, a, .screen, .event-card, input, textarea',
      )
    ) {
      return;
    }

    if (
      event.pointerType === 'mouse'
      && event.button !== 0
    ) {
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

    const deltaX = event.clientX - this.pointer.x;
    const deltaY = event.clientY - this.pointer.y;

    if (
      Math.abs(deltaX) > 28
      && Math.abs(deltaX) > Math.abs(deltaY)
    ) {
      this.handlers.lane(
        deltaX < 0 ? -1 : 1,
      );
    }

    this.pointer = null;
  }

  // ----------------------------------------------------------
  // ON-SCREEN BUTTONS
  // ----------------------------------------------------------

  bindActionButtons() {
    this.root.querySelectorAll('[data-action]').forEach((button) => {
      const action = button.dataset.action;

      const down = (event) => {
        event.preventDefault();

        if (
          action === 'gas'
          || action === 'brake'
        ) {
          try {
            button.setPointerCapture(event.pointerId);
          } catch {
            // Pointer capture may not be available.
          }
        }

        if (action === 'left') {
          this.handlers.lane(-1);
        } else if (action === 'right') {
          this.handlers.lane(1);
        } else if (action === 'gas') {
          this.handlers.gas(true);
        } else if (action === 'brake') {
          this.handlers.brake(true);
        } else if (action === 'horn') {
          this.handlers.horn();
        }
      };

      const up = (event) => {
        event.preventDefault();

        if (action === 'gas') {
          this.handlers.gas(false);
        }

        if (action === 'brake') {
          this.handlers.brake(false);
        }
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
    });
  }

  // ----------------------------------------------------------
  // RELEASE STUCK INPUTS
  // ----------------------------------------------------------

  releaseHeldControls() {
    this.keys.clear();
    this.pointer = null;

    this.handlers.gas(false);
    this.handlers.brake(false);
  }

  // ----------------------------------------------------------
  // CLEANUP
  // ----------------------------------------------------------

  dispose() {
    this.releaseHeldControls();

    this.disposers.forEach((dispose) => {
      dispose();
    });

    this.disposers = [];
  }
}