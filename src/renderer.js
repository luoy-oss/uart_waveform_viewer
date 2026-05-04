// ============================================================
//  波形渲染
// ============================================================
(function() {
  'use strict';

  function getState() { return window.UWV.state; }
  let canvas, ctx;
  let minimapCanvas, minimapCtx;

  function init(canvasEl) {
    canvas = canvasEl;
    ctx = canvas.getContext('2d');
    minimapCanvas = document.getElementById('minimap-canvas');
    if (minimapCanvas) {
      minimapCtx = minimapCanvas.getContext('2d');
    }
  }

  function resizeCanvas() {
    const container = document.getElementById('canvas-container');
    const dpr = window.devicePixelRatio || 1;
    canvas.width = container.clientWidth * dpr;
    canvas.height = container.clientHeight * dpr;
    canvas.style.width = container.clientWidth + 'px';
    canvas.style.height = container.clientHeight + 'px';
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function render() {
    const s = getState();
    const w = canvas.width / (window.devicePixelRatio || 1);
    const h = canvas.height / (window.devicePixelRatio || 1);

    ctx.fillStyle = s.bgColor;
    ctx.fillRect(0, 0, w, h);

    const pad = { top: 20, bottom: 30, left: 60, right: 15 };
    const plotW = w - pad.left - pad.right;
    const plotH = h - pad.top - pad.bottom;
    if (plotW < 10 || plotH < 10) return;

    // Visible channels
    const visibleChannels = s.channels.filter(function(ch) {
      const group = s.typeGroups[ch.type];
      return ch.visible && group && group.visible && ch.data.length > 1;
    });

    // Data length
    let dataLen = 0;
    for (const ch of visibleChannels) {
      if (ch.data.length > dataLen) dataLen = ch.data.length;
    }
    if (dataLen === 0) dataLen = 100;

    // X axis range
    let xPoints = s.maxPoints;
    let xStart = Math.max(0, dataLen - xPoints - s.xScroll);
    let xEnd = Math.min(dataLen, xStart + xPoints);
    if (xEnd - xStart < 10) { xStart = Math.max(0, dataLen - 10); xEnd = dataLen; }

    // Y axis range
    if (s.autoY && visibleChannels.length > 0) {
      let yMin = Infinity, yMax = -Infinity;
      for (const ch of visibleChannels) {
        for (let i = xStart; i < xEnd && i < ch.data.length; i++) {
          if (ch.data[i] < yMin) yMin = ch.data[i];
          if (ch.data[i] > yMax) yMax = ch.data[i];
        }
      }
      if (isFinite(yMin) && isFinite(yMax)) {
        const margin = (yMax - yMin) * 0.08 || 1;
        s.yMin = yMin - margin;
        s.yMax = yMax + margin;
      }
    }
    if (s.yMin >= s.yMax) s.yMax = s.yMin + 1;

    // Draw
    drawGrid(pad, plotW, plotH, xStart, xEnd, s.yMin, s.yMax);

    ctx.save();
    ctx.beginPath();
    ctx.rect(pad.left, pad.top, plotW, plotH);
    ctx.clip();

    for (const ch of visibleChannels) {
      drawWaveform(ch, pad, plotW, plotH, xStart, xEnd, s.yMin, s.yMax);
    }

    // --- Helper: draw a crosshair + data points at a given X position ---
    function drawCrosshairAt(cx, locked, alpha) {
      if (cx < pad.left || cx > pad.left + plotW) return;
      var xFrac = (cx - pad.left) / plotW;
      var idx = Math.round(xStart + xFrac * (xEnd - xStart));
      idx = Math.max(0, Math.min(idx, dataLen - 1));
      var sx = pad.left + (idx - xStart) / (xEnd - xStart) * plotW;

      // Vertical line
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.strokeStyle = locked ? 'rgba(74,144,217,0.9)' : 'rgba(74,144,217,0.5)';
      ctx.lineWidth = locked ? 1.5 : 1;
      if (!locked) ctx.setLineDash([4, 4]);
      ctx.beginPath();
      ctx.moveTo(sx, pad.top);
      ctx.lineTo(sx, pad.top + plotH);
      ctx.stroke();
      ctx.setLineDash([]);

      // Data point markers
      for (var ci = 0; ci < visibleChannels.length; ci++) {
        var ch = visibleChannels[ci];
        if (idx < ch.data.length) {
          var dy = pad.top + plotH - (ch.data[idx] - s.yMin) / (s.yMax - s.yMin) * plotH;
          ctx.fillStyle = ch.color;
          ctx.beginPath();
          ctx.arc(sx, dy, locked ? 4 : 3, 0, Math.PI * 2);
          ctx.fill();
          if (locked) {
            ctx.strokeStyle = '#fff';
            ctx.lineWidth = 1;
            ctx.stroke();
          }
        }
      }
      ctx.restore();
      return { idx: idx, sx: sx };
    }

    // Draw locked crosshair first (if any)
    var liveResult = null;
    if (s.lockedX >= 0) {
      drawCrosshairAt(s.lockedX, true, 1.0);
      s._lockedIdx = Math.round((s.lockedX - pad.left) / plotW * (xEnd - xStart) + xStart);
      s._lockedIdx = Math.max(0, Math.min(s._lockedIdx, dataLen - 1));
    }

    // Draw live hover crosshair (always when mouse is in plot area)
    var liveMx = s.mouseX;
    if (liveMx >= pad.left && liveMx <= pad.left + plotW &&
        s.mouseY >= pad.top && s.mouseY <= pad.top + plotH) {
      var liveAlpha = s.lockedX >= 0 ? 0.35 : 1.0;
      liveResult = drawCrosshairAt(liveMx, false, liveAlpha);
      if (liveResult) {
        s._snappedIdx = liveResult.idx;
        s._snappedX = liveResult.sx;
      }
    } else {
      s._snappedIdx = -1;
      s._snappedX = -1;
    }

    // When not locked, use live as the primary snapped value
    if (s.lockedX < 0 && liveResult) {
      // already set above
    } else if (s.lockedX >= 0) {
      // Keep locked index for data panel primary display
    }

    // Selection overlay (left-click drag)
    if (s.isSelecting && s.selectStartX >= 0 && s.selectEndX >= 0) {
      const sx1 = Math.max(pad.left, Math.min(s.selectStartX, s.selectEndX));
      const sx2 = Math.min(pad.left + plotW, Math.max(s.selectStartX, s.selectEndX));
      if (sx2 > sx1) {
        ctx.fillStyle = 'rgba(74, 144, 217, 0.15)';
        ctx.fillRect(sx1, pad.top, sx2 - sx1, plotH);
        ctx.strokeStyle = 'rgba(74, 144, 217, 0.6)';
        ctx.lineWidth = 1;
        ctx.setLineDash([3, 3]);
        ctx.strokeRect(sx1, pad.top, sx2 - sx1, plotH);
        ctx.setLineDash([]);
      }
    }

    ctx.restore();

    // Update sidebar values (only for visible channels)
    for (const ch of s.channels) {
      const valEl = document.getElementById('val-' + ch.id);
      if (!valEl) continue;
      const group = s.typeGroups[ch.type];
      if (ch.visible && group && group.visible && ch.data.length > 0) {
        valEl.textContent = ch.data[ch.data.length - 1].toFixed(3);
      } else {
        valEl.textContent = '--';
      }
    }

    document.getElementById('txt-point-count').textContent = dataLen;

    // Render minimap
    if (s.showMinimap && minimapCanvas && minimapCtx) {
      renderMinimap(visibleChannels, dataLen, xStart, xEnd);
    }
  }

  // --- Minimap ---
  function renderMinimap(visibleChannels, dataLen, viewXStart, viewXEnd) {
    const s = getState();
    const mw = minimapCanvas.width;
    const mh = minimapCanvas.height;

    minimapCtx.fillStyle = 'rgba(13, 20, 40, 0.95)';
    minimapCtx.fillRect(0, 0, mw, mh);

    if (visibleChannels.length === 0 || dataLen < 2) return;

    // Compute global Y range across ALL data
    let gYMin = Infinity, gYMax = -Infinity;
    for (const ch of visibleChannels) {
      for (let i = 0; i < ch.data.length; i++) {
        if (ch.data[i] < gYMin) gYMin = ch.data[i];
        if (ch.data[i] > gYMax) gYMax = ch.data[i];
      }
    }
    if (!isFinite(gYMin) || !isFinite(gYMax)) return;
    if (gYMin === gYMax) { gYMin -= 1; gYMax += 1; }

    const mPad = 4;
    const mPlotW = mw - mPad * 2;
    const mPlotH = mh - mPad * 2;

    // Draw all waveforms (downsampled)
    const step = Math.max(1, Math.floor(dataLen / mPlotW));
    for (const ch of visibleChannels) {
      minimapCtx.strokeStyle = ch.color;
      minimapCtx.lineWidth = 0.8;
      minimapCtx.globalAlpha = 0.7;
      minimapCtx.beginPath();
      let started = false;
      for (let i = 0; i < ch.data.length; i += step) {
        const px = mPad + (i / dataLen) * mPlotW;
        const py = mPad + mPlotH - (ch.data[i] - gYMin) / (gYMax - gYMin) * mPlotH;
        if (!started) { minimapCtx.moveTo(px, py); started = true; }
        else minimapCtx.lineTo(px, py);
      }
      minimapCtx.stroke();
    }
    minimapCtx.globalAlpha = 1;

    // Draw current view rectangle
    const vx1 = mPad + (viewXStart / dataLen) * mPlotW;
    const vx2 = mPad + (viewXEnd / dataLen) * mPlotW;
    minimapCtx.strokeStyle = 'rgba(255, 255, 255, 0.7)';
    minimapCtx.lineWidth = 1.5;
    minimapCtx.strokeRect(vx1, mPad, vx2 - vx1, mPlotH);
    minimapCtx.fillStyle = 'rgba(74, 144, 217, 0.1)';
    minimapCtx.fillRect(vx1, mPad, vx2 - vx1, mPlotH);
  }

  function drawGrid(pad, plotW, plotH, xStart, xEnd, yMin, yMax) {
    ctx.strokeStyle = window.UWV.GRID_COLOR;
    ctx.lineWidth = 1;
    ctx.fillStyle = window.UWV.GRID_TEXT_COLOR;
    ctx.font = '10px Consolas, monospace';

    // Y axis grid
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    const yStep = niceStep(yMax - yMin, 8);
    const yFirst = Math.ceil(yMin / yStep) * yStep;
    for (let y = yFirst; y <= yMax; y += yStep) {
      const py = pad.top + plotH - (y - yMin) / (yMax - yMin) * plotH;
      ctx.beginPath();
      ctx.moveTo(pad.left, py);
      ctx.lineTo(pad.left + plotW, py);
      ctx.stroke();
      ctx.fillText(y.toFixed(2), pad.left - 5, py);
    }

    // Y=0 axis line
    if (yMin < 0 && yMax > 0) {
      const py0 = pad.top + plotH - (0 - yMin) / (yMax - yMin) * plotH;
      ctx.strokeStyle = window.UWV.AXIS_COLOR;
      ctx.beginPath();
      ctx.moveTo(pad.left, py0);
      ctx.lineTo(pad.left + plotW, py0);
      ctx.stroke();
      ctx.strokeStyle = window.UWV.GRID_COLOR;
    }

    // X axis grid
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    const xStep = niceStep(xEnd - xStart, 10);
    const xFirst = Math.ceil(xStart / xStep) * xStep;
    for (let x = xFirst; x <= xEnd; x += xStep) {
      const px = pad.left + (x - xStart) / (xEnd - xStart) * plotW;
      ctx.beginPath();
      ctx.moveTo(px, pad.top);
      ctx.lineTo(px, pad.top + plotH);
      ctx.stroke();
      ctx.fillText(x.toString(), px, pad.top + plotH + 4);
    }

    // Border
    ctx.strokeStyle = window.UWV.AXIS_COLOR;
    ctx.strokeRect(pad.left, pad.top, plotW, plotH);
  }

  function drawWaveform(ch, pad, plotW, plotH, xStart, xEnd, yMin, yMax) {
    const data = ch.data;
    ctx.strokeStyle = ch.color;
    ctx.lineWidth = 1.2;
    ctx.beginPath();

    let started = false;
    const iStart = Math.max(0, Math.floor(xStart));
    const iEnd = Math.min(data.length, Math.ceil(xEnd));

    for (let i = iStart; i < iEnd; i++) {
      const px = pad.left + (i - xStart) / (xEnd - xStart) * plotW;
      const py = pad.top + plotH - (data[i] - yMin) / (yMax - yMin) * plotH;
      if (!started) { ctx.moveTo(px, py); started = true; }
      else ctx.lineTo(px, py);
    }
    ctx.stroke();
  }

  function niceStep(range, maxTicks) {
    const rough = range / maxTicks;
    const pow = Math.pow(10, Math.floor(Math.log10(rough)));
    const norm = rough / pow;
    let nice;
    if (norm <= 1) nice = 1;
    else if (norm <= 2) nice = 2;
    else if (norm <= 5) nice = 5;
    else nice = 10;
    return nice * pow;
  }

  window.UWV = window.UWV || {};
  window.UWV.renderer = {
    init: init,
    resizeCanvas: resizeCanvas,
    render: render
  };
})();
