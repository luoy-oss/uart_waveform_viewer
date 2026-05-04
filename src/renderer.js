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
        var sd = getSmoothedData(ch);
        for (let i = xStart; i < xEnd && i < sd.length; i++) {
          if (sd[i] < yMin) yMin = sd[i];
          if (sd[i] > yMax) yMax = sd[i];
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
        var sd = getSmoothedData(ch);
        if (idx < sd.length) {
          var dy = pad.top + plotH - (sd[idx] - s.yMin) / (s.yMax - s.yMin) * plotH;
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
      var liveAlpha = s.lockedX >= 0 ? 0.6 : 1.0;
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
        var sd = getSmoothedData(ch);
        valEl.textContent = sd[sd.length - 1].toFixed(3);
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
      var sd = getSmoothedData(ch);
      for (let i = 0; i < sd.length; i++) {
        if (sd[i] < gYMin) gYMin = sd[i];
        if (sd[i] > gYMax) gYMax = sd[i];
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
      var sd = getSmoothedData(ch);
      minimapCtx.strokeStyle = ch.color;
      minimapCtx.lineWidth = 0.8;
      minimapCtx.globalAlpha = 0.7;
      minimapCtx.beginPath();
      let started = false;
      for (let i = 0; i < sd.length; i += step) {
        const px = mPad + (i / dataLen) * mPlotW;
        const py = mPad + mPlotH - (sd[i] - gYMin) / (gYMax - gYMin) * mPlotH;
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
    const data = getSmoothedData(ch);
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

  // --- Smoothing algorithms ---
  function smoothSMA(data, win) {
    var n = data.length;
    if (win < 2 || n < 2) return data;
    var out = new Array(n);
    var half = Math.floor(win / 2);
    var sum = 0;
    for (var i = 0; i < n; i++) {
      sum += data[i];
      if (i >= win) sum -= data[i - win];
      if (i >= win - 1) {
        out[i - half] = sum / win;
      }
    }
    // Fill edges with nearest computed value
    for (var i = 0; i < half; i++) out[i] = out[half] !== undefined ? out[half] : data[i];
    for (var i = n - half; i < n; i++) out[i] = out[n - half - 1] !== undefined ? out[n - half - 1] : data[i];
    // Fill any remaining undefined
    for (var i = 0; i < n; i++) { if (out[i] === undefined) out[i] = data[i]; }
    return out;
  }

  function smoothEMA(data, alpha) {
    var n = data.length;
    if (n < 2) return data;
    var out = new Array(n);
    out[0] = data[0];
    for (var i = 1; i < n; i++) {
      out[i] = alpha * data[i] + (1 - alpha) * out[i - 1];
    }
    return out;
  }

  function smoothGaussian(data, win) {
    var n = data.length;
    if (win < 2 || n < 2) return data;
    // Build Gaussian kernel
    var sigma = win / 4;
    var half = Math.floor(win / 2);
    var kernel = new Array(win);
    var kSum = 0;
    for (var i = 0; i < win; i++) {
      var x = i - half;
      kernel[i] = Math.exp(-(x * x) / (2 * sigma * sigma));
      kSum += kernel[i];
    }
    for (var i = 0; i < win; i++) kernel[i] /= kSum;
    // Convolve
    var out = new Array(n);
    for (var i = 0; i < n; i++) {
      var val = 0, wSum = 0;
      for (var j = 0; j < win; j++) {
        var k = i + j - half;
        if (k >= 0 && k < n) {
          val += data[k] * kernel[j];
          wSum += kernel[j];
        }
      }
      out[i] = val / wSum;
    }
    return out;
  }

  function smoothSG(data, win) {
    var n = data.length;
    if (win < 3 || n < 2) return data;
    if (win % 2 === 0) win = win + 1;
    var half = Math.floor(win / 2);
    // Savitzky-Golay coefficients for polynomial degree 2, precomputed for common window sizes
    // For general case, compute on the fly using normal equations
    var out = new Array(n);
    for (var i = 0; i < n; i++) {
      var a = Math.max(0, i - half);
      var b = Math.min(n, i + half + 1);
      var len = b - a;
      if (len < 3) { out[i] = data[i]; continue; }
      // Fit quadratic: f(x) = c0 + c1*x + c2*x^2 using least squares
      var sx = 0, sx2 = 0, sx3 = 0, sx4 = 0, sy = 0, sxy = 0, sx2y = 0;
      for (var j = a; j < b; j++) {
        var x = j - i;
        var y = data[j];
        var x2 = x * x, x3 = x2 * x, x4 = x2 * x2;
        sx += x; sx2 += x2; sx3 += x3; sx4 += x4;
        sy += y; sxy += x * y; sx2y += x2 * y;
      }
      // Solve 3x3 normal equations
      var det = sx2 * (sx2 * sx4 - sx3 * sx3) - sx * (sx * sx4 - sx2 * sx3) + sx3 * (sx * sx3 - sx2 * sx2);
      if (Math.abs(det) < 1e-12) { out[i] = data[i]; continue; }
      var c0 = (sy * (sx2 * sx4 - sx3 * sx3) - sx * (sxy * sx4 - sx3 * sx2y) + sx3 * (sxy * sx3 - sx2 * sx2y)) / det;
      out[i] = c0;
    }
    return out;
  }

  function getSmoothedData(ch) {
    var s = getState();
    var method = s.smoothMethod;
    var param = s.smoothParam;
    if (method === 'none' || ch.data.length < 2) return ch.data;
    // Check cache
    var cache = ch._smoothCache;
    if (cache && cache.method === method && cache.param === param && cache.len === ch.data.length) {
      return cache.result;
    }
    var result;
    switch (method) {
      case 'sma':      result = smoothSMA(ch.data, param); break;
      case 'ema':      result = smoothEMA(ch.data, param / 100); break;
      case 'gaussian': result = smoothGaussian(ch.data, param); break;
      case 'sg':       result = smoothSG(ch.data, param); break;
      default:         result = ch.data;
    }
    ch._smoothCache = { method: method, param: param, len: ch.data.length, result: result };
    return result;
  }

  window.UWV = window.UWV || {};
  window.UWV.renderer = {
    init: init,
    resizeCanvas: resizeCanvas,
    render: render,
    getSmoothedData: getSmoothedData
  };
})();
