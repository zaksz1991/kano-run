/** Records the strings painted on small canvases (sign boards) so the sign reader can show them large. Imported first. */
(function installTextCapture() {
  if (typeof CanvasRenderingContext2D === 'undefined' || CanvasRenderingContext2D.prototype.__kanoTextCapture) return;
  const proto = CanvasRenderingContext2D.prototype;
  proto.__kanoTextCapture = true;
  const original = proto.fillText;
  const originalStroke = proto.strokeText;
  const originalDraw = proto.drawImage;
  const note = (canvas, text) => {
    try {
      if (canvas && typeof text === 'string' && text.trim()) {
        const list = canvas.__kanoTexts || (canvas.__kanoTexts = []);
        if (!list.includes(text.trim()) && list.length < 6) list.push(text.trim());
      }
    } catch (_) { /* optional */ }
  };
  proto.strokeText = function capturedStroke(text, ...rest) { note(this.canvas, text); return originalStroke.call(this, text, ...rest); };
  proto.drawImage = function capturedDraw(image, ...rest) {
    try { if (image && image.__kanoTexts && this.canvas) image.__kanoTexts.forEach((t) => note(this.canvas, t)); } catch (_) { /* optional */ }
    return originalDraw.call(this, image, ...rest);
  };
  proto.fillText = function captured(text, ...rest) {
    try {
      const canvas = this.canvas;
      if (canvas && typeof text === 'string' && text.trim() && canvas.width >= 64 && canvas.width <= 2400) {
        const list = canvas.__kanoTexts || (canvas.__kanoTexts = []);
        if (!list.includes(text.trim()) && list.length < 6) list.push(text.trim());
      }
    } catch (_) { /* optional */ }
    return original.call(this, text, ...rest);
  };
})();

