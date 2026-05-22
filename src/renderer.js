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

    const pad = { top: 20, bottom: 30, left: 60 + Math.max(0, (s.analysisFontSize - 10) * 5), right: 15 };
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

    // --- Split view or overlay mode ---
    if (s.splitView === 'channel' && visibleChannels.length > 1) {
      renderSplitByChannel(s, visibleChannels, dataLen, xStart, xEnd, pad, plotW, plotH);
    } else if (s.splitView === 'type' && visibleChannels.length > 1) {
      renderSplitByType(s, visibleChannels, dataLen, xStart, xEnd, pad, plotW, plotH);
    } else {
      renderOverlay(s, visibleChannels, dataLen, xStart, xEnd, pad, plotW, plotH);
    }
    // 在 clip 区域外绘制 Ref 标签
    drawRefLineLabels(s, pad, plotW, plotH, s.yMin, s.yMax);

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

    document.getElementById('txt-point-count').textContent = dataLen + ' / ' + s.totalPoints;

    // Render minimap
    if (s.showMinimap && minimapCanvas && minimapCtx) {
      renderMinimap(visibleChannels, dataLen, xStart, xEnd);
    }
  }

  // --- Overlay mode (all channels on one plot) ---
  function renderOverlay(s, visibleChannels, dataLen, xStart, xEnd, pad, plotW, plotH) {
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

    drawGrid(pad, plotW, plotH, xStart, xEnd, s.yMin, s.yMax);

    ctx.save();
    ctx.beginPath();
    ctx.rect(pad.left, pad.top, plotW, plotH);
    ctx.clip();

    for (const ch of visibleChannels) {
      drawWaveform(ch, pad, plotW, plotH, xStart, xEnd, s.yMin, s.yMax);
    }

    drawCrosshairOverlay(s, visibleChannels, dataLen, xStart, xEnd, pad, plotW, plotH);
    drawSelectionOverlay(s, pad, plotW, plotH);
    drawAnalysisOverlay(s, visibleChannels, xStart, xEnd, pad, plotW, plotH);

    ctx.restore();
  }

  function drawCrosshairOverlay(s, visibleChannels, dataLen, xStart, xEnd, pad, plotW, plotH) {
    var lockedResult = null, liveResult = null;

    function drawAt(cx, locked, alpha) {
      if (cx < pad.left || cx > pad.left + plotW) return null;
      var xFrac = (cx - pad.left) / plotW;
      var idx = Math.round(xStart + xFrac * (xEnd - xStart));
      idx = Math.max(0, Math.min(idx, dataLen - 1));
      var sx = pad.left + (idx - xStart) / (xEnd - xStart) * plotW;
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
      for (var ci = 0; ci < visibleChannels.length; ci++) {
        var ch = visibleChannels[ci];
        var sd = getSmoothedData(ch);
        if (idx < sd.length) {
          var dy = pad.top + plotH - (sd[idx] - s.yMin) / (s.yMax - s.yMin) * plotH;
          ctx.fillStyle = ch.color;
          ctx.beginPath();
          ctx.arc(sx, dy, locked ? 4 : 3, 0, Math.PI * 2);
          ctx.fill();
          if (locked) { ctx.strokeStyle = '#fff'; ctx.lineWidth = 1; ctx.stroke(); }
        }
      }
      ctx.restore();
      return { idx: idx, sx: sx };
    }

    if (s.lockedX >= 0) {
      drawAt(s.lockedX, true, 1.0);
      s._lockedIdx = Math.round((s.lockedX - pad.left) / plotW * (xEnd - xStart) + xStart);
      s._lockedIdx = Math.max(0, Math.min(s._lockedIdx, dataLen - 1));
    }
    var liveMx = s.mouseX;
    if (liveMx >= pad.left && liveMx <= pad.left + plotW && s.mouseY >= pad.top && s.mouseY <= pad.top + plotH) {
      liveResult = drawAt(liveMx, false, s.lockedX >= 0 ? 0.6 : 1.0);
      if (liveResult) { s._snappedIdx = liveResult.idx; s._snappedX = liveResult.sx; }
    } else {
      s._snappedIdx = -1; s._snappedX = -1;
    }
  }

  // --- Split view mode (each channel in its own sub-plot) ---
  function renderSplitByChannel(s, visibleChannels, dataLen, xStart, xEnd, pad, plotW, plotH) {
    var n = visibleChannels.length;
    var subH = plotH / n;

    // Compute per-channel Y ranges
    var chYMin = new Array(n), chYMax = new Array(n);
    for (var ci = 0; ci < n; ci++) {
      var ch = visibleChannels[ci];
      var sd = getSmoothedData(ch);
      if (s.autoY) {
        var lo = Infinity, hi = -Infinity;
        for (var i = xStart; i < xEnd && i < sd.length; i++) {
          if (sd[i] < lo) lo = sd[i];
          if (sd[i] > hi) hi = sd[i];
        }
        if (!isFinite(lo) || !isFinite(hi)) { lo = -1; hi = 1; }
        if (lo === hi) { lo -= 1; hi += 1; }
        var margin = (hi - lo) * 0.08 || 1;
        chYMin[ci] = lo - margin;
        chYMax[ci] = hi + margin;
      } else {
        chYMin[ci] = s.yMin;
        chYMax[ci] = s.yMax;
      }
    }

    // Draw each sub-plot
    for (var ci = 0; ci < n; ci++) {
      var ch = visibleChannels[ci];
      var subTop = pad.top + ci * subH;
      var subPad = { top: subTop, bottom: pad.bottom, left: pad.left, right: pad.right };

      drawGrid(subPad, plotW, subH, xStart, xEnd, chYMin[ci], chYMax[ci]);

      ctx.save();
      ctx.beginPath();
      ctx.rect(pad.left, subTop, plotW, subH);
      ctx.clip();
      drawWaveform(ch, subPad, plotW, subH, xStart, xEnd, chYMin[ci], chYMax[ci]);
      ctx.restore();

      // Channel label
      ctx.save();
      ctx.fillStyle = ch.color;
      ctx.font = 'bold 11px Consolas, monospace';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'top';
      ctx.fillText(ch.name, pad.left + 5, subTop + 3);
      ctx.restore();

      // Separator line
      if (ci > 0) {
        ctx.strokeStyle = 'rgba(255,255,255,0.15)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(pad.left, subTop);
        ctx.lineTo(pad.left + plotW, subTop);
        ctx.stroke();
      }
    }

    // Crosshair spanning all sub-plots
    drawCrosshairSplit(s, visibleChannels, dataLen, xStart, xEnd, pad, plotW, plotH, subH, chYMin, chYMax);
    drawSelectionOverlay(s, pad, plotW, plotH);
  }

  function drawCrosshairSplit(s, visibleChannels, dataLen, xStart, xEnd, pad, plotW, plotH, subH, chYMin, chYMax, chSubTop) {
    var n = visibleChannels.length;

    function drawAt(cx, locked, alpha) {
      if (cx < pad.left || cx > pad.left + plotW) return null;
      var xFrac = (cx - pad.left) / plotW;
      var idx = Math.round(xStart + xFrac * (xEnd - xStart));
      idx = Math.max(0, Math.min(idx, dataLen - 1));
      var sx = pad.left + (idx - xStart) / (xEnd - xStart) * plotW;

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

      // Data point markers in each sub-plot
      for (var ci = 0; ci < n; ci++) {
        var ch = visibleChannels[ci];
        var sd = getSmoothedData(ch);
        if (idx < sd.length) {
          var subT = chSubTop ? chSubTop[ci] : pad.top + ci * subH;
          var dy = subT + subH - (sd[idx] - chYMin[ci]) / (chYMax[ci] - chYMin[ci]) * subH;
          ctx.fillStyle = ch.color;
          ctx.beginPath();
          ctx.arc(sx, dy, locked ? 4 : 3, 0, Math.PI * 2);
          ctx.fill();
          if (locked) { ctx.strokeStyle = '#fff'; ctx.lineWidth = 1; ctx.stroke(); }
        }
      }
      ctx.restore();
      return { idx: idx, sx: sx };
    }

    if (s.lockedX >= 0) {
      drawAt(s.lockedX, true, 1.0);
      s._lockedIdx = Math.round((s.lockedX - pad.left) / plotW * (xEnd - xStart) + xStart);
      s._lockedIdx = Math.max(0, Math.min(s._lockedIdx, dataLen - 1));
    }
    var liveMx = s.mouseX;
    if (liveMx >= pad.left && liveMx <= pad.left + plotW && s.mouseY >= pad.top && s.mouseY <= pad.top + plotH) {
      var liveResult = drawAt(liveMx, false, s.lockedX >= 0 ? 0.6 : 1.0);
      if (liveResult) { s._snappedIdx = liveResult.idx; s._snappedX = liveResult.sx; }
    } else {
      s._snappedIdx = -1; s._snappedX = -1;
    }
  }

  // --- Split by type mode (all channels of one type share a sub-plot) ---
  function renderSplitByType(s, visibleChannels, dataLen, xStart, xEnd, pad, plotW, plotH) {
    // Group visible channels by type, preserving order
    var groups = [];
    var seen = {};
    for (var i = 0; i < visibleChannels.length; i++) {
      var ch = visibleChannels[i];
      if (!seen[ch.type]) {
        seen[ch.type] = [];
        groups.push({ type: ch.type, channels: seen[ch.type] });
      }
      seen[ch.type].push(ch);
    }

    var n = groups.length;
    if (n === 0) return;
    var subH = plotH / n;

    // Compute per-group Y ranges
    var gYMin = new Array(n), gYMax = new Array(n);
    for (var gi = 0; gi < n; gi++) {
      var chs = groups[gi].channels;
      if (s.autoY) {
        var lo = Infinity, hi = -Infinity;
        for (var ci = 0; ci < chs.length; ci++) {
          var sd = getSmoothedData(chs[ci]);
          for (var k = xStart; k < xEnd && k < sd.length; k++) {
            if (sd[k] < lo) lo = sd[k];
            if (sd[k] > hi) hi = sd[k];
          }
        }
        if (!isFinite(lo) || !isFinite(hi)) { lo = -1; hi = 1; }
        if (lo === hi) { lo -= 1; hi += 1; }
        var margin = (hi - lo) * 0.08 || 1;
        gYMin[gi] = lo - margin;
        gYMax[gi] = hi + margin;
      } else {
        gYMin[gi] = s.yMin;
        gYMax[gi] = s.yMax;
      }
    }

    // Draw each sub-plot
    for (var gi = 0; gi < n; gi++) {
      var grp = groups[gi];
      var subTop = pad.top + gi * subH;
      var subPad = { top: subTop, bottom: pad.bottom, left: pad.left, right: pad.right };

      drawGrid(subPad, plotW, subH, xStart, xEnd, gYMin[gi], gYMax[gi]);

      ctx.save();
      ctx.beginPath();
      ctx.rect(pad.left, subTop, plotW, subH);
      ctx.clip();
      for (var ci = 0; ci < grp.channels.length; ci++) {
        drawWaveform(grp.channels[ci], subPad, plotW, subH, xStart, xEnd, gYMin[gi], gYMax[gi]);
      }
      ctx.restore();

      // Type label
      var typeNames = window.UWV.i18n.getTypeNames();
      var names = typeNames[grp.type];
      var labelText = grp.type + (names ? ' (' + names.join('/') + ')' : '');
      ctx.save();
      ctx.fillStyle = grp.channels[0].color;
      ctx.font = 'bold 11px Consolas, monospace';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'top';
      ctx.fillText(labelText, pad.left + 5, subTop + 3);
      ctx.restore();

      // Separator line
      if (gi > 0) {
        ctx.strokeStyle = 'rgba(255,255,255,0.15)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(pad.left, subTop);
        ctx.lineTo(pad.left + plotW, subTop);
        ctx.stroke();
      }
    }

    // Crosshair spanning all sub-plots
    // Map per-channel Y ranges and sub-plot tops from group ranges
    var nch = visibleChannels.length;
    var chYMin = new Array(nch), chYMax = new Array(nch), chSubTop = new Array(nch);
    for (var gi = 0; gi < n; gi++) {
      for (var ci = 0; ci < groups[gi].channels.length; ci++) {
        var chIdx = visibleChannels.indexOf(groups[gi].channels[ci]);
        if (chIdx >= 0) {
          chYMin[chIdx] = gYMin[gi];
          chYMax[chIdx] = gYMax[gi];
          chSubTop[chIdx] = pad.top + gi * subH;
        }
      }
    }
    drawCrosshairSplit(s, visibleChannels, dataLen, xStart, xEnd, pad, plotW, plotH, subH, chYMin, chYMax, chSubTop);
    drawSelectionOverlay(s, pad, plotW, plotH);
  }

  function drawSelectionOverlay(s, pad, plotW, plotH) {
    if (s.isSelecting && s.selectStartX >= 0 && s.selectEndX >= 0) {
      var sx1 = Math.max(pad.left, Math.min(s.selectStartX, s.selectEndX));
      var sx2 = Math.min(pad.left + plotW, Math.max(s.selectStartX, s.selectEndX));
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
  }

  function drawAnalysisOverlay(s, visibleChannels, xStart, xEnd, pad, plotW, plotH) {
    if (!s.analyzeMode || !s.analyzeRange) return;
    var r = s.analyzeRange;
    var px1 = pad.left + (r.startIdx - xStart) / (xEnd - xStart) * plotW;
    var px2 = pad.left + (r.endIdx - xStart) / (xEnd - xStart) * plotW;
    if (px2 < pad.left || px1 > pad.left + plotW) return;
    px1 = Math.max(pad.left, px1);
    px2 = Math.min(pad.left + plotW, px2);

    // 区域高亮（可隐藏）
    ctx.save();
    if (s.analysisShowRegion) {
      ctx.fillStyle = 'rgba(231, 76, 60, 0.08)';
      ctx.fillRect(px1, pad.top, px2 - px1, plotH);
      ctx.strokeStyle = 'rgba(231, 76, 60, 0.5)';
      ctx.lineWidth = 1;
      ctx.setLineDash([4, 2]);
      ctx.strokeRect(px1, pad.top, px2 - px1, plotH);
      ctx.setLineDash([]);
    }

    // 对每个可见通道绘制统计标注
    for (var ci = 0; ci < visibleChannels.length; ci++) {
      var ch = visibleChannels[ci];
      var sd = getSmoothedData(ch);
      if (!s.analysisStats || !s.analysisStats[ch.id]) continue;
      var stats = s.analysisStats[ch.id];
      if (stats.count < 2) continue;

      // 均值线（中值）
      var pyMean = pad.top + plotH - (stats.mean - s.yMin) / (s.yMax - s.yMin) * plotH;
      ctx.strokeStyle = ch.color;
      ctx.lineWidth = 1.5;
      ctx.globalAlpha = 0.7;
      ctx.setLineDash([6, 4]);
      ctx.beginPath();
      ctx.moveTo(px1, pyMean);
      ctx.lineTo(px2, pyMean);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.globalAlpha = 1;

      // 最大值标记
      if (stats.maxIdx >= xStart && stats.maxIdx <= xEnd) {
        var pmx = pad.left + (stats.maxIdx - xStart) / (xEnd - xStart) * plotW;
        var pmy = pad.top + plotH - (stats.max - s.yMin) / (s.yMax - s.yMin) * plotH;
        ctx.fillStyle = s.analysisColor || '#fff';
        ctx.beginPath();
        ctx.moveTo(pmx - 4, pmy - 6);
        ctx.lineTo(pmx + 4, pmy - 6);
        ctx.lineTo(pmx, pmy - 1);
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = s.analysisColor || '#fff';
        ctx.font = s.analysisFontSize + 'px Consolas, monospace';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'bottom';
        ctx.fillText(stats.max.toFixed(2), pmx + 6, pmy - 2);
      }

      // 最小值标记
      if (stats.minIdx >= xStart && stats.minIdx <= xEnd) {
        var pmn = pad.left + (stats.minIdx - xStart) / (xEnd - xStart) * plotW;
        var pmny = pad.top + plotH - (stats.min - s.yMin) / (s.yMax - s.yMin) * plotH;
        ctx.fillStyle = s.analysisColor || '#fff';
        ctx.beginPath();
        ctx.moveTo(pmn - 4, pmny + 6);
        ctx.lineTo(pmn + 4, pmny + 6);
        ctx.lineTo(pmn, pmny + 1);
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = s.analysisColor || '#fff';
        ctx.font = s.analysisFontSize + 'px Consolas, monospace';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'top';
        ctx.fillText(stats.min.toFixed(2), pmn + 6, pmny + 2);
      }

      // 波动范围指示（竖线双向箭头）
      var midX = (px1 + px2) / 2;
      var topY = pad.top + plotH - (stats.max - s.yMin) / (s.yMax - s.yMin) * plotH;
      var botY = pad.top + plotH - (stats.min - s.yMin) / (s.yMax - s.yMin) * plotH;
      // 总范围标注 - 在区域左侧显示
      var annoColor = s.analysisColor || '#fff';
      ctx.strokeStyle = annoColor;
      ctx.globalAlpha = 0.6;
      ctx.lineWidth = 1;
      var arrowX = px1 - 14;
      ctx.beginPath();
      ctx.moveTo(arrowX, topY);
      ctx.lineTo(arrowX, botY);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(arrowX - 3, topY + 4);
      ctx.lineTo(arrowX, topY);
      ctx.lineTo(arrowX + 3, topY + 4);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(arrowX - 3, botY - 4);
      ctx.lineTo(arrowX, botY);
      ctx.lineTo(arrowX + 3, botY - 4);
      ctx.stroke();
      ctx.fillStyle = annoColor;
      ctx.globalAlpha = 0.9;
      ctx.font = s.analysisFontSize + 'px Consolas, monospace';
      ctx.textAlign = 'right';
      ctx.textBaseline = 'middle';
      ctx.fillText('Δ' + stats.range.toFixed(2), arrowX - 4, (topY + botY) / 2);

      // 均值→最大值偏差 - 区域左侧
      var upDiff = stats.max - stats.mean;
      ctx.fillStyle = annoColor;
      ctx.globalAlpha = 0.9;
      ctx.textAlign = 'right';
      ctx.textBaseline = 'middle';
      ctx.fillText('+' + upDiff.toFixed(2), arrowX - 4, (pyMean + topY) / 2);

      // 均值→最小值偏差 - 区域左侧
      var downDiff = stats.mean - stats.min;
      ctx.fillText('-' + downDiff.toFixed(2), arrowX - 4, (pyMean + botY) / 2);
      ctx.globalAlpha = 1;
    }

    // 绘制用户设置的参考线（线本身保留在 clip 内）
    if (s.showRefLine && s.refLineValue !== null) {
      var refY = pad.top + plotH - (s.refLineValue - s.yMin) / (s.yMax - s.yMin) * plotH;
      if (refY >= pad.top && refY <= pad.top + plotH) {
        ctx.strokeStyle = '#f39c12';
        ctx.lineWidth = 2;
        ctx.setLineDash([8, 4]);
        ctx.beginPath();
        ctx.moveTo(pad.left, refY);
        ctx.lineTo(pad.left + plotW, refY);
        ctx.stroke();
        ctx.setLineDash([]);
      }
    }

    ctx.restore();
  }

  // 在 clip 区域外绘制 Ref 标签（防止被裁剪）
  function drawRefLineLabels(s, pad, plotW, plotH, yMin, yMax) {
    if (!s.showRefLine || s.refLineValue === null) return;
    var refY = pad.top + plotH - (s.refLineValue - yMin) / (yMax - yMin) * plotH;
    if (refY < pad.top || refY > pad.top + plotH) return;
    // 左侧 Y 轴标注
    ctx.save();
    ctx.fillStyle = '#f39c12';
    ctx.font = 'bold ' + s.analysisFontSize + 'px Consolas, monospace';
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    ctx.fillText('Ref:' + s.refLineValue.toFixed(2), pad.left - 5, refY);
    ctx.restore();
  }

  // --- Minimap ---
  function renderMinimap(visibleChannels, dataLen, viewXStart, viewXEnd) {
    const s = getState();
    const mw = minimapCanvas.width;
    const mh = minimapCanvas.height;

    // 使用主题面板色
    var panelBg = s.theme ? s.theme.panelBg : '#0d1428';
    minimapCtx.fillStyle = panelBg.replace(')', ',0.95)').replace('rgb', 'rgba');
    if (minimapCtx.fillStyle === panelBg) {
      // hex color, add alpha manually
      minimapCtx.fillStyle = hexToRgba(panelBg, 0.95);
    }
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

  function formatTime(ms) {
    if (ms < 1000) return ms.toFixed(0) + 'ms';
    if (ms < 60000) return (ms / 1000).toFixed(2) + 's';
    var minutes = Math.floor(ms / 60000);
    var secs = ((ms % 60000) / 1000).toFixed(1);
    return minutes + 'm' + secs + 's';
  }

  function hexToRgba(hex, alpha) {
    var r = parseInt(hex.slice(1,3), 16);
    var g = parseInt(hex.slice(3,5), 16);
    var b = parseInt(hex.slice(5,7), 16);
    return 'rgba(' + r + ',' + g + ',' + b + ',' + alpha + ')';
  }

  function drawGrid(pad, plotW, plotH, xStart, xEnd, yMin, yMax) {
    var s = getState();
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
      var label;
      if (s.timeUnitEnabled) {
        var timeMs;
        if (s.resetOnZoom) {
          // 相对时间：从当前视图起始点开始计算
          timeMs = (x - xStart) * s.sampleIntervalMs;
        } else {
          // 绝对时间：从数据起始点开始计算
          timeMs = x * s.sampleIntervalMs;
        }
        label = formatTime(timeMs);
      } else {
        label = x.toString();
      }
      ctx.fillText(label, px, pad.top + plotH + 4);
    }

    // Border
    ctx.strokeStyle = window.UWV.AXIS_COLOR;
    ctx.strokeRect(pad.left, pad.top, plotW, plotH);

    // X轴单位标注（时间模式下显示）
    if (s.timeUnitEnabled) {
      ctx.fillStyle = window.UWV.GRID_TEXT_COLOR;
      ctx.font = '9px Consolas, monospace';
      ctx.textAlign = 'right';
      ctx.textBaseline = 'top';
      ctx.fillText('', pad.left + plotW, pad.top + plotH + 4);
    }
  }

  function drawWaveform(ch, pad, plotW, plotH, xStart, xEnd, yMin, yMax) {
    const s = getState();
    const data = getSmoothedData(ch);
    ctx.strokeStyle = ch.color;
    ctx.lineWidth = s.lineWidth;
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
