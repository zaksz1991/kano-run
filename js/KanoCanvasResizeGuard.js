/**
 * Canvas resize guard. Per the HTML spec, assigning canvas.width/height clears the canvas, even
 * when the value is unchanged. Several startup modules (resize/orientation handlers, quality
 * controllers) call renderer.setSize()/setPixelRatio() with the size the canvas already has, and
 * every such call blanked the 3D view for a frame: the game "blinked" for the first seconds.
 * Only WebGL canvases are guarded; 2D canvases that rely on `width = width` to clear keep working.
 */
const KEY = Symbol.for('kano.life.canvasResizeGuard.v1');

if (typeof window !== 'undefined' && typeof HTMLCanvasElement !== 'undefined' && !window[KEY]) {
  window[KEY] = true;
  const proto = HTMLCanvasElement.prototype;

  const getContext = proto.getContext;
  proto.getContext = function kanoGuardedGetContext(type, ...rest) {
    if (typeof type === 'string' && /webgl/i.test(type)) this.__kanoWebgl = true;
    return getContext.call(this, type, ...rest);
  };

  for (const prop of ['width', 'height']) {
    const descriptor = Object.getOwnPropertyDescriptor(proto, prop);
    if (!descriptor?.set || !descriptor?.get) continue;
    Object.defineProperty(proto, prop, {
      configurable: true,
      enumerable: descriptor.enumerable,
      get() { return descriptor.get.call(this); },
      set(value) {
        if (this.__kanoWebgl) {
          const next = Math.max(0, Math.floor(Number(value)));
          if (Number.isFinite(next) && next === descriptor.get.call(this)) return; // no-op resize: do not clear
        }
        descriptor.set.call(this, value);
      },
    });
  }
}
