/* Kano Life render-mode and frame-budget audit. Optional: load only when ?renderAudit=1 is present. */
(function () {
  'use strict';
  const params = new URLSearchParams(location.search);
  if (!params.has('renderAudit')) return;
  if (window.__kanoRenderAuditInstalled) return;
  window.__kanoRenderAuditInstalled = true;

  const state = {
    startedAt: performance.now(), frames: 0, lastFrameAt: 0, fps: 0,
    frameMs: 0, worstFrameMs: 0, contextLost: false, contextEvents: 0,
    canvasCount: 0, webglCanvasCount: 0, twoDCanvasCount: 0,
    rendererHints: [], warnings: []
  };
  let frameWindowStart = performance.now();
  let frameWindowCount = 0;
  let previousFrame = performance.now();
  let panel;
  const fmt = (n, digits = 1) => Number.isFinite(n) ? n.toFixed(digits) : '—';

  function inspectCanvases() {
    const canvases = Array.from(document.querySelectorAll('canvas'));
    state.canvasCount = canvases.length;
    state.webglCanvasCount = 0;
    state.twoDCanvasCount = 0;
    canvases.forEach((canvas) => {
      let webgl = false;
      try {
        webgl = !!(canvas.getContext('webgl2') || canvas.getContext('webgl') || canvas.getContext('experimental-webgl'));
      } catch (_) {}
      if (webgl) {
        state.webglCanvasCount++;
        canvas.addEventListener('webglcontextlost', (event) => {
          state.contextLost = true;
          state.contextEvents++;
          state.warnings.push('WebGL context lost');
          event.preventDefault();
          renderPanel();
        }, { passive: false });
        canvas.addEventListener('webglcontextrestored', () => {
          state.contextLost = false;
          state.contextEvents++;
          renderPanel();
        });
      } else {
        try { if (canvas.getContext('2d')) state.twoDCanvasCount++; } catch (_) {}
      }
    });
    if (state.canvasCount === 0) state.warnings.push('No canvas element found yet');
  }

  function collectHints() {
    const hints = [];
    if (window.renderer && window.renderer.isWebGLRenderer) hints.push('window.renderer: Three.js WebGLRenderer');
    if (window.gameRenderer && window.gameRenderer.isWebGLRenderer) hints.push('window.gameRenderer: Three.js WebGLRenderer');
    if (window.renderer && window.renderer.domElement) hints.push('window.renderer.domElement exists');
    if (window.THREE && window.THREE.REVISION) hints.push('Three.js revision ' + window.THREE.REVISION);
    state.rendererHints = hints;
  }

  function buildPanel() {
    panel = document.createElement('section');
    panel.id = 'kano-render-audit-panel';
    panel.style.cssText = 'position:fixed;z-index:2147483647;left:10px;top:10px;width:min(360px,calc(100vw - 20px));max-height:65vh;overflow:auto;background:rgba(7,17,28,.94);color:#f4f8ff;border:1px solid #36c7df;border-radius:8px;padding:12px;font:12px/1.45 system-ui,sans-serif;box-shadow:0 8px 30px #0008;';
    const heading = document.createElement('div');
    heading.textContent = 'KANO LIFE · RENDER AUDIT';
    heading.style.cssText = 'font-weight:800;font-size:13px;margin-bottom:7px;color:#66e5f5;';
    const close = document.createElement('button');
    close.textContent = 'HIDE';
    close.style.cssText = 'float:right;border:1px solid #91a9bb;background:#182a3a;color:white;border-radius:4px;padding:2px 6px;';
    close.onclick = () => panel.remove();
    heading.appendChild(close);
    const body = document.createElement('pre');
    body.id = 'kano-render-audit-body';
    body.style.cssText = 'white-space:pre-wrap;overflow-wrap:anywhere;margin:0;font:11px/1.5 ui-monospace,monospace;';
    const exportButton = document.createElement('button');
    exportButton.textContent = 'EXPORT JSON';
    exportButton.style.cssText = 'margin-top:8px;border:0;background:#00b4d8;color:#00121a;border-radius:4px;padding:6px 9px;font-weight:700;';
    exportButton.onclick = () => {
      const blob = new Blob([JSON.stringify(snapshot(), null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a'); a.href = url; a.download = 'kano-render-audit.json'; a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    };
    panel.append(heading, body, exportButton);
    document.body.appendChild(panel);
  }

  function snapshot() {
    return {
      capturedAt: new Date().toISOString(),
      elapsedSeconds: (performance.now() - state.startedAt) / 1000,
      fps: state.fps, averageFrameMs: state.frameMs, worstFrameMs: state.worstFrameMs,
      canvasCount: state.canvasCount, webglCanvasCount: state.webglCanvasCount,
      twoDCanvasCount: state.twoDCanvasCount, webglContextLost: state.contextLost,
      webglContextEvents: state.contextEvents, rendererHints: state.rendererHints,
      warnings: Array.from(new Set(state.warnings)).slice(-12),
      note: 'Canvas detection is observational. A 2D canvas does not prove gameplay fell back to 2D; inspect the game renderer state and console alongside this report.'
    };
  }

  function renderPanel() {
    if (!panel || !panel.isConnected) return;
    const s = snapshot();
    document.getElementById('kano-render-audit-body').textContent =
      `FPS (sampled): ${fmt(s.fps, 0)}\n` +
      `Average frame: ${fmt(s.averageFrameMs)} ms\n` +
      `Worst frame: ${fmt(s.worstFrameMs)} ms\n` +
      `Canvases: ${s.canvasCount}\n` +
      `WebGL canvases: ${s.webglCanvasCount}\n` +
      `2D canvases: ${s.twoDCanvasCount}\n` +
      `WebGL context lost: ${s.webglContextLost ? 'YES' : 'no'}\n` +
      `Context events: ${s.webglContextEvents}\n` +
      `Renderer hints: ${s.rendererHints.join('; ') || 'not exposed globally'}\n` +
      `Warnings: ${s.warnings.join('; ') || 'none recorded'}\n\n` +
      'This audit measures browser frame pacing. It does not change graphics mode or gameplay.';
  }

  function tick(now) {
    const delta = now - previousFrame;
    previousFrame = now;
    if (delta > 0 && delta < 10000) {
      state.frames++;
      frameWindowCount++;
      state.frameMs = state.frameMs ? state.frameMs * 0.9 + delta * 0.1 : delta;
      state.worstFrameMs = Math.max(state.worstFrameMs, delta);
    }
    if (now - frameWindowStart >= 1000) {
      state.fps = frameWindowCount * 1000 / (now - frameWindowStart);
      frameWindowStart = now;
      frameWindowCount = 0;
      inspectCanvases();
      collectHints();
      renderPanel();
    }
    requestAnimationFrame(tick);
  }

  function start() {
    inspectCanvases(); collectHints(); buildPanel(); renderPanel(); requestAnimationFrame(tick);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
  else start();
})();
