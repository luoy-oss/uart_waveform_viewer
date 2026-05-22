// ============================================================
//  UI 交互
// ============================================================
(function() {
  'use strict';

  function getState() { return window.UWV.state; }
  function t(key) { return window.UWV.i18n.t(key); }

  // --- 通道列表 ---
  function rebuildChannelList() {
    const s = getState();
    const container = document.getElementById('channel-list');
    container.innerHTML = '';

    if (s.typeOrder.length === 0) {
      const hint = document.createElement('div');
      hint.id = 'no-data-hint';
      hint.innerHTML = t('waitingData') + '<br>' + t('autoDetect');
      container.appendChild(hint);
      return;
    }

    const typeNames = window.UWV.i18n.getTypeNames();

    for (const type of s.typeOrder) {
      const group = s.typeGroups[type];
      if (!group) continue;

      const groupDiv = document.createElement('div');
      groupDiv.className = 'channel-group';

      const header = document.createElement('div');
      header.className = 'channel-group-header';

      const arrow = document.createElement('span');
      arrow.className = 'arrow' + (group.collapsed ? ' collapsed' : '');
      arrow.textContent = '▼';
      header.appendChild(arrow);

      const groupCb = document.createElement('input');
      groupCb.type = 'checkbox';
      groupCb.checked = group.visible;
      groupCb.title = t('showHideTip');
      groupCb.addEventListener('change', function() {
        group.visible = groupCb.checked;
        group.channels.forEach(function(ch) { ch.visible = groupCb.checked; });
        rebuildChannelList();
        updateDataPanel();
      });
      header.appendChild(groupCb);

      const colorDot = document.createElement('span');
      colorDot.className = 'type-color';
      colorDot.style.background = group.channels.length > 0 ? group.channels[0].color : '#888';
      header.appendChild(colorDot);

      const label = document.createElement('span');
      const names = typeNames[type];
      label.textContent = type + ' (' + group.channels.length + ')';
      label.title = names ? names.join('/') : type;
      header.appendChild(label);

      arrow.addEventListener('click', function(e) {
        e.stopPropagation();
        group.collapsed = !group.collapsed;
        rebuildChannelList();
      });
      header.addEventListener('click', function(e) {
        if (e.target !== groupCb) {
          group.collapsed = !group.collapsed;
          rebuildChannelList();
        }
      });
      groupDiv.appendChild(header);

      if (!group.collapsed) {
        for (const ch of group.channels) {
          const item = document.createElement('div');
          item.className = 'channel-item';

          const chCb = document.createElement('input');
          chCb.type = 'checkbox';
          chCb.checked = ch.visible;
          chCb.addEventListener('change', function() {
            ch.visible = chCb.checked;
            if (chCb.checked) group.visible = true;
            updateDataPanel();
          });
          item.appendChild(chCb);

          const chColor = document.createElement('span');
          chColor.className = 'ch-color';
          chColor.style.background = ch.color;
          item.appendChild(chColor);

          const chLabel = document.createElement('span');
          chLabel.textContent = ch.name;
          item.appendChild(chLabel);

          const valSpan = document.createElement('span');
          valSpan.className = 'value-display';
          valSpan.id = 'val-' + ch.id;
          valSpan.textContent = '--';
          item.appendChild(valSpan);

          groupDiv.appendChild(item);
        }
      }
      container.appendChild(groupDiv);
    }
  }

  function setAllVisible(visible) {
    const s = getState();
    for (const type of s.typeOrder) {
      const group = s.typeGroups[type];
      if (!group) continue;
      group.visible = visible;
      group.channels.forEach(function(ch) { ch.visible = visible; });
    }
    rebuildChannelList();
    updateDataPanel();
  }

  // --- 控制按钮 ---
  function toggleAutoY() {
    const s = getState();
    s.autoY = !s.autoY;
    updateAutoButton();
    if (s.autoY) syncYInputs();
  }

  function updateAutoButton() {
    document.getElementById('btn-auto').className = getState().autoY ? 'active' : '';
  }

  function syncYInputs() {
    const s = getState();
    document.getElementById('input-ymin').value = s.yMin.toFixed(2);
    document.getElementById('input-ymax').value = s.yMax.toFixed(2);
  }

  function zoomY(factor) {
    const s = getState();
    const center = (s.yMin + s.yMax) / 2;
    const halfRange = (s.yMax - s.yMin) / 2 * factor;
    s.yMin = center - halfRange;
    s.yMax = center + halfRange;
    s.autoY = false;
    updateAutoButton();
    syncYInputs();
  }

  function zoomX(factor) {
    const s = getState();
    s.maxPoints = Math.max(50, Math.round(s.maxPoints / factor));
    document.getElementById('input-points').value = s.maxPoints;
  }

  function autoX() {
    const s = getState();
    pushHistory();
    s.maxPoints = 500;
    s.xScroll = 0;
    document.getElementById('input-points').value = s.maxPoints;
  }

  function togglePause() {
    const s = getState();
    s.paused = !s.paused;
    document.getElementById('btn-pause').className = s.paused ? 'active' : '';
    document.getElementById('btn-pause').textContent = s.paused ? t('resume') : t('pause');
  }

  function clearData() {
    const s = getState();
    for (const ch of s.channels) ch.data = [];
    s.lineCount = 0;
    s.errorCount = 0;
    s.totalPoints = 0;
    s.xScroll = 0;
    s.historyStack = [];
    s.historyIndex = -1;
    s.analyzeRange = null;
    s.analysisStats = null;
    s.showRefLine = false;
    s.refLineValue = null;
    dismissLockedCrosshair();
  }

  // --- 历史记录 (撤销/重做) ---
  function pushHistory() {
    const s = getState();
    const snapshot = {
      maxPoints: s.maxPoints,
      xScroll: s.xScroll,
      yMin: s.yMin,
      yMax: s.yMax,
      autoY: s.autoY
    };
    if (s.historyIndex < s.historyStack.length - 1) {
      s.historyStack = s.historyStack.slice(0, s.historyIndex + 1);
    }
    s.historyStack.push(snapshot);
    if (s.historyStack.length > 100) s.historyStack.shift();
    s.historyIndex = s.historyStack.length - 1;
    updateUndoRedoButtons();
  }

  function undo() {
    const s = getState();
    if (s.historyIndex <= 0) return;
    if (s.historyIndex === s.historyStack.length - 1) {
      s.historyStack.push({
        maxPoints: s.maxPoints, xScroll: s.xScroll,
        yMin: s.yMin, yMax: s.yMax, autoY: s.autoY
      });
    }
    s.historyIndex--;
    restoreSnapshot(s.historyStack[s.historyIndex]);
  }

  function redo() {
    const s = getState();
    if (s.historyIndex >= s.historyStack.length - 1) return;
    s.historyIndex++;
    restoreSnapshot(s.historyStack[s.historyIndex]);
  }

  function restoreSnapshot(snap) {
    const s = getState();
    s.maxPoints = snap.maxPoints;
    s.xScroll = snap.xScroll;
    s.yMin = snap.yMin;
    s.yMax = snap.yMax;
    s.autoY = snap.autoY;
    document.getElementById('input-points').value = s.maxPoints;
    updateAutoButton();
    syncYInputs();
    updateUndoRedoButtons();
  }

  function updateUndoRedoButtons() {
    const s = getState();
    const btnUndo = document.getElementById('btn-undo');
    const btnRedo = document.getElementById('btn-redo');
    if (btnUndo) btnUndo.disabled = s.historyIndex <= 0;
    if (btnRedo) btnRedo.disabled = s.historyIndex >= s.historyStack.length - 1;
  }

  // --- 获取绘图区域参数 ---
  function getPlotParams() {
    const s = window.UWV.state;
    const canvas = document.getElementById('waveform-canvas');
    const w = canvas.width / (window.devicePixelRatio || 1);
    const h = canvas.height / (window.devicePixelRatio || 1);
    const pad = { top: 20, bottom: 30, left: 60 + Math.max(0, (s.analysisFontSize - 10) * 5), right: 15 };
    return { w: w, h: h, pad: pad, plotW: w - pad.left - pad.right, plotH: h - pad.top - pad.bottom };
  }

  function getXRange() {
    const s = getState();
    const visibleChannels = s.channels.filter(function(ch) {
      const group = s.typeGroups[ch.type];
      return ch.visible && group && group.visible && ch.data.length > 1;
    });
    let dataLen = 0;
    for (const ch of visibleChannels) {
      if (ch.data.length > dataLen) dataLen = ch.data.length;
    }
    if (dataLen === 0) dataLen = 100;
    let xPoints = s.maxPoints;
    let xStart = Math.max(0, dataLen - xPoints - s.xScroll);
    let xEnd = Math.min(dataLen, xStart + xPoints);
    if (xEnd - xStart < 10) { xStart = Math.max(0, dataLen - 10); xEnd = dataLen; }
    return { xStart: xStart, xEnd: xEnd, dataLen: dataLen };
  }

  function getVisibleChannels() {
    const s = getState();
    return s.channels.filter(function(ch) {
      const group = s.typeGroups[ch.type];
      return ch.visible && group && group.visible && ch.data.length > 1;
    });
  }

  // --- 锁定十字线 & 数据面板 ---
  function dismissLockedCrosshair() {
    const s = getState();
    s.lockedX = -1;
    s.lockedMouseX = -1;
    s.lockedMouseY = -1;
    updateDataPanel();
  }

  function formatTimeShort(ms) {
    if (ms < 1000) return ms.toFixed(0) + ' ms';
    if (ms < 60000) return (ms / 1000).toFixed(2) + ' s';
    var minutes = Math.floor(ms / 60000);
    var secs = ((ms % 60000) / 1000).toFixed(1);
    return minutes + 'm ' + secs + 's';
  }

  function updateDataPanel() {
    const s = getState();
    const panel = document.getElementById('data-panel');
    if (!panel) return;
    var titleEl = document.getElementById('data-panel-title-text');
    var bodyEl = document.getElementById('data-panel-body');

    const mx = s.lockedX >= 0 ? s.lockedMouseX : s.mouseX;
    const my = s.lockedX >= 0 ? s.lockedMouseY : s.mouseY;

    if (mx < 0 || my < 0) {
      if (titleEl) titleEl.textContent = t('dataPanelEmpty');
      if (bodyEl) bodyEl.innerHTML = '';
      return;
    }

    const p = getPlotParams();
    if (mx < p.pad.left || mx > p.pad.left + p.plotW || my < p.pad.top || my > p.pad.top + p.plotH) {
      if (s.lockedX < 0) {
        if (titleEl) titleEl.textContent = t('dataPanelEmpty');
        if (bodyEl) bodyEl.innerHTML = '';
        return;
      }
    }

    const visibleChannels = getVisibleChannels();
    const xr = getXRange();

    var idx;
    if (s.lockedX >= 0 && s._lockedIdx >= 0) {
      idx = s._lockedIdx;
    } else if (s._snappedIdx >= 0) {
      idx = s._snappedIdx;
    } else {
      const effectiveMx = s.lockedX >= 0 ? s.lockedX : mx;
      const xFrac = (effectiveMx - p.pad.left) / p.plotW;
      idx = Math.round(xr.xStart + xFrac * (xr.xEnd - xr.xStart));
    }
    idx = Math.max(0, Math.min(idx, xr.dataLen - 1));

    if (idx < 0 || idx >= xr.dataLen) {
      if (titleEl) titleEl.textContent = t('dataPanelEmpty');
      if (bodyEl) bodyEl.innerHTML = '';
      return;
    }

    var titleText;
    if (s.timeUnitEnabled) {
      var timeMs;
      if (s.resetOnZoom) {
        timeMs = (idx - xr.xStart) * s.sampleIntervalMs;
      } else {
        timeMs = idx * s.sampleIntervalMs;
      }
      titleText = formatTimeShort(timeMs);
    } else {
      titleText = '#' + idx;
    }
    if (titleEl) titleEl.textContent = titleText;

    var bodyHtml = '';
    var count = 0;
    for (const ch of visibleChannels) {
      var sd = window.UWV.renderer.getSmoothedData(ch);
      if (idx < sd.length) {
        bodyHtml += '<div class="data-panel-row"><span class="data-panel-dot" style="background:' + ch.color + '"></span><span class="data-panel-name">' + ch.name + '</span><span class="data-panel-val">' + sd[idx].toFixed(4) + '</span></div>';
        count++;
      }
    }
    if (count === 0) {
      if (titleEl) titleEl.textContent = t('dataPanelEmpty');
      if (bodyEl) bodyEl.innerHTML = '';
    } else {
      if (s.analyzeMode && s.analysisStats) {
        bodyHtml += '<div class="data-panel-stats">';
        for (const ch of visibleChannels) {
          var st = s.analysisStats[ch.id];
          if (!st || st.count < 2) continue;
          bodyHtml += '<div class="stats-ch-title" style="color:' + ch.color + '">' + ch.name + '</div>';
          bodyHtml += '<div class="stats-row"><span>最小值</span><span>' + st.min.toFixed(4) + '</span></div>';
          bodyHtml += '<div class="stats-row"><span>最大值</span><span>' + st.max.toFixed(4) + '</span></div>';
          bodyHtml += '<div class="stats-row"><span>均值</span><span>' + st.mean.toFixed(4) + '</span></div>';
          bodyHtml += '<div class="stats-row"><span>波动范围</span><span>' + st.range.toFixed(4) + '</span></div>';
          bodyHtml += '<div class="stats-row dim"><span>均值→最大值</span><span>+' + (st.max - st.mean).toFixed(4) + '</span></div>';
          bodyHtml += '<div class="stats-row dim"><span>均值→最小值</span><span>-' + (st.mean - st.min).toFixed(4) + '</span></div>';
          bodyHtml += '<div class="stats-row dim"><span>采样点数</span><span>' + st.count + '</span></div>';
        }
        if (s.showRefLine && s.refLineValue !== null) {
          bodyHtml += '<div class="stats-ref">参考中值: ' + s.refLineValue.toFixed(4) + ' <span style="color:#888;font-size:9px">(Ctrl+点击设置)</span></div>';
        }
        bodyHtml += '</div>';
      }
      if (bodyEl) bodyEl.innerHTML = bodyHtml;
    }
  }

  function toggleDataPanel() {
    const s = getState();
    s.showDataPanel = !s.showDataPanel;
    var btn = document.getElementById('btn-datapanel');
    if (btn) btn.className = s.showDataPanel ? 'active' : '';
    var dp = document.getElementById('data-panel');
    if (dp) dp.style.display = s.showDataPanel ? 'block' : 'none';
  }

  function toggleDataPanelMinimize() {
    const s = getState();
    s.dataPanelMinimized = !s.dataPanelMinimized;
    var dp = document.getElementById('data-panel');
    if (dp) dp.classList.toggle('minimized', s.dataPanelMinimized);
    var btn = document.getElementById('data-panel-minimize');
    if (btn) btn.textContent = s.dataPanelMinimized ? '□' : '─';
  }

  // --- Data panel drag ---
  function initDataPanelDrag() {
    var dragHandle = document.getElementById('data-panel-drag');
    var panel = document.getElementById('data-panel');
    if (!dragHandle || !panel) return;

    dragHandle.addEventListener('mousedown', function(e) {
      e.preventDefault();
      var startX = e.clientX;
      var startY = e.clientY;
      var startLeft = parseInt(panel.style.left) || panel.offsetLeft;
      var startTop = parseInt(panel.style.top) || panel.offsetTop;

      function onMove(ev) {
        panel.style.left = (startLeft + ev.clientX - startX) + 'px';
        panel.style.top = (startTop + ev.clientY - startY) + 'px';
        panel.style.right = 'auto';
        panel.style.bottom = 'auto';
      }
      function onUp() {
        document.removeEventListener('mousemove', onMove);
        document.removeEventListener('mouseup', onUp);
      }
      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup', onUp);
    });
  }

  // --- Data panel resize ---
  function initDataPanelResize() {
    var handle = document.getElementById('data-panel-resize');
    var panel = document.getElementById('data-panel');
    if (!handle || !panel) return;

    handle.addEventListener('mousedown', function(e) {
      e.preventDefault();
      e.stopPropagation();
      var startX = e.clientX;
      var startY = e.clientY;
      var startW = panel.offsetWidth;
      var startH = panel.offsetHeight;

      function onMove(ev) {
        panel.style.width = Math.max(120, startW + ev.clientX - startX) + 'px';
        panel.style.height = Math.max(60, startH + ev.clientY - startY) + 'px';
        panel.style.maxWidth = 'none';
        panel.style.maxHeight = 'none';
      }
      function onUp() {
        document.removeEventListener('mousemove', onMove);
        document.removeEventListener('mouseup', onUp);
      }
      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup', onUp);
    });
  }

  function applyDataPanelFontSize(size) {
    var panel = document.getElementById('data-panel');
    if (panel) panel.style.setProperty('--panel-font-size', size + 'px');
  }

  // --- 鼠标交互 ---
  function onWheel(e) {
    e.preventDefault();
    const factor = e.deltaY > 0 ? 1.1 : 1 / 1.1;
    pushHistory();
    if (e.shiftKey) zoomX(factor);
    else zoomY(factor);
  }

  function onMouseDown(e) {
    const s = getState();
    const p = getPlotParams();

    if (e.button === 2 || e.button === 1) {
      // Right or middle click: start drag for panning
      pushHistory();
      s.isDragging = true;
      s.dragButton = e.button;
      s.dragStartX = e.offsetX;
      s.dragStartY = e.offsetY;
      s.dragStartYMin = s.yMin;
      s.dragStartYMax = s.yMax;
      s.dragStartScroll = s.xScroll;
      // Disable X tracking: fix xScroll so it doesn't auto-reset
      s.xScrollFixed = true;
      document.getElementById('waveform-canvas').style.cursor = 'grabbing';
      e.preventDefault();
    } else if (e.button === 0) {
      // Ctrl+Click in analyze mode: set reference line
      if (s.analyzeMode && e.ctrlKey &&
          e.offsetX >= p.pad.left && e.offsetX <= p.pad.left + p.plotW &&
          e.offsetY >= p.pad.top && e.offsetY <= p.pad.top + p.plotH) {
        e.preventDefault();
        var clickY = s.yMax - (e.offsetY - p.pad.top) / p.plotH * (s.yMax - s.yMin);
        s.refLineValue = clickY;
        s.showRefLine = true;
        updateDataPanel();
        return;
      }
      // Left click: start region selection (if in plot area)
      if (e.offsetX >= p.pad.left && e.offsetX <= p.pad.left + p.plotW &&
          e.offsetY >= p.pad.top && e.offsetY <= p.pad.top + p.plotH) {
        s.isSelecting = true;
        s.selectStartX = e.offsetX;
        s.selectEndX = e.offsetX;
      }
    }
  }

  function onMouseMove(e) {
    const s = getState();
    s.mouseX = e.offsetX;
    s.mouseY = e.offsetY;

    if (s.isDragging && (s.dragButton === 2 || s.dragButton === 1)) {
      // Right/Middle drag: free pan both axes
      const dx = e.offsetX - s.dragStartX;
      const dy = e.offsetY - s.dragStartY;
      const p = getPlotParams();

      // Y axis
      const yRange = s.dragStartYMax - s.dragStartYMin;
      s.yMin = s.dragStartYMin + (dy / p.plotH) * yRange;
      s.yMax = s.dragStartYMax + (dy / p.plotH) * yRange;
      s.autoY = false;
      updateAutoButton();
      syncYInputs();

      // X axis: positive dx = see older data
      s.xScroll = s.dragStartScroll + Math.round((dx / p.plotW) * s.maxPoints);
    }

    if (s.isSelecting) {
      s.selectEndX = e.offsetX;
    }

    // Live update data panel on hover (when not locked)
    if (s.lockedX < 0 && s.showDataPanel) {
      updateDataPanel();
    }
  }

  function onMouseUp(e) {
    const s = getState();

    // Get canvas-relative coordinates (event may be on document, not canvas)
    var mx = e.offsetX;
    var my = e.offsetY;
    if (e.target && e.target.id !== 'waveform-canvas') {
      // Convert page coords to canvas-relative
      var canvas = document.getElementById('waveform-canvas');
      var rect = canvas.getBoundingClientRect();
      mx = e.clientX - rect.left;
      my = e.clientY - rect.top;
    }

    if (s.isDragging && (s.dragButton === 2 || s.dragButton === 1)) {
      s.isDragging = false;
      s.dragButton = -1;
      document.getElementById('waveform-canvas').style.cursor = 'default';
      return;
    }

    if (s.isSelecting && e.button === 0) {
      s.isSelecting = false;
      const p = getPlotParams();
      const x1 = Math.min(s.selectStartX, s.selectEndX);
      const x2 = Math.max(s.selectStartX, s.selectEndX);
      const dragDist = x2 - x1;

      if (dragDist < 5) {
        // Click: lock crosshair at nearest data point
        // Use snapped X from renderer if available
        var lockX = s._snappedX >= 0 ? s._snappedX : mx;
        s.lockedX = lockX;
        s.lockedMouseX = lockX;
        s.lockedMouseY = my;
        updateDataPanel();
      } else if (s.analyzeMode) {
        // 分析模式：选择区间用于统计分析
        const xr = getXRange();
        const frac1 = (x1 - p.pad.left) / p.plotW;
        const frac2 = (x2 - p.pad.left) / p.plotW;
        const idx1 = Math.round(xr.xStart + frac1 * (xr.xEnd - xr.xStart));
        const idx2 = Math.round(xr.xStart + frac2 * (xr.xEnd - xr.xStart));
        if (Math.abs(idx2 - idx1) >= 2) {
          s.analyzeRange = { startIdx: Math.min(idx1, idx2), endIdx: Math.max(idx1, idx2) };
          computeAnalysisStats();
        }
      } else {
        // Region selection: zoom to selected X range
        const xr = getXRange();
        const frac1 = (x1 - p.pad.left) / p.plotW;
        const frac2 = (x2 - p.pad.left) / p.plotW;
        const idx1 = Math.round(xr.xStart + frac1 * (xr.xEnd - xr.xStart));
        const idx2 = Math.round(xr.xStart + frac2 * (xr.xEnd - xr.xStart));
        const newRange = idx2 - idx1;

        if (newRange >= 10) {
          pushHistory();
          s.maxPoints = newRange;
          s.xScroll = Math.max(0, xr.dataLen - idx2);
          document.getElementById('input-points').value = s.maxPoints;
          dismissLockedCrosshair();
        }
      }
      s.selectStartX = -1;
      s.selectEndX = -1;
    }
  }

  function onContextMenu(e) {
    if (e.target.id === 'waveform-canvas') e.preventDefault();
  }

  function onMouseLeave() {
    const s = getState();
    s.isDragging = false;
    s.dragButton = -1;
    s.isSelecting = false;
    s.selectStartX = -1;
    s.selectEndX = -1;
    s.mouseX = -1;
    s.mouseY = -1;
    document.getElementById('waveform-canvas').style.cursor = 'default';
    // Don't clear locked crosshair on leave
    if (s.lockedX < 0 && s.showDataPanel) {
      updateDataPanel();
    }
  }

  // --- Minimap ---
  function toggleMinimap() {
    const s = getState();
    s.showMinimap = !s.showMinimap;
    var btn = document.getElementById('btn-minimap');
    if (btn) btn.className = s.showMinimap ? 'active' : '';
    var mc = document.getElementById('minimap-container');
    if (mc) mc.style.display = s.showMinimap ? 'block' : 'none';
  }

  // --- Sidebar collapse ---
  function toggleSidebar() {
    const s = getState();
    s.sidebarCollapsed = !s.sidebarCollapsed;
    var sidebar = document.getElementById('sidebar');
    if (sidebar) sidebar.classList.toggle('collapsed', s.sidebarCollapsed);
    var btn = document.getElementById('btn-sidebar-toggle');
    if (btn) btn.textContent = s.sidebarCollapsed ? '▶' : '◀';
  }

  // --- Theme panel ---
  function toggleThemePanel() {
    var panel = document.getElementById('theme-panel');
    if (panel) panel.classList.toggle('visible');
  }

  function applyTheme() {
    const s = getState();
    var t = s.theme;
    var root = document.documentElement;
    root.style.setProperty('--panel-bg', t.panelBg);
    root.style.setProperty('--status-bg', t.statusBarBg);
    root.style.setProperty('--text-color', t.textColor);
    root.style.setProperty('--accent', t.accentColor);
    root.style.setProperty('--checkbox-accent', t.accentColor);
    // 数据面板背景
    var dp = document.getElementById('data-panel');
    if (dp) dp.style.background = t.panelBg;
  }

  // --- Analysis mode ---
  function toggleAnalyzeMode() {
    const s = getState();
    s.analyzeMode = !s.analyzeMode;
    var btn = document.getElementById('btn-analyze');
    if (btn) btn.className = s.analyzeMode ? 'active' : '';
    var clearBtn = document.getElementById('btn-clear-analysis');
    if (clearBtn) clearBtn.style.display = s.analyzeMode ? '' : 'none';
    // 分析模式下自动打开数据面板
    if (s.analyzeMode && !s.showDataPanel) {
      toggleDataPanel();
    }
    if (!s.analyzeMode) {
      s.analyzeRange = null;
      s.analysisStats = null;
      s.showRefLine = false;
      s.refLineValue = null;
      s.dataPanelMinimized = false;
      var dp = document.getElementById('data-panel');
      if (dp) dp.classList.remove('minimized');
      var minBtn = document.getElementById('data-panel-minimize');
      if (minBtn) minBtn.textContent = '─';
      updateDataPanel();
    }
  }

  function clearAnalysis() {
    const s = getState();
    s.analyzeRange = null;
    s.analysisStats = null;
    s.showRefLine = false;
    s.refLineValue = null;
    updateDataPanel();
  }

  function computeAnalysisStats() {
    const s = getState();
    if (!s.analyzeRange) return;
    var r = s.analyzeRange;
    var visibleChannels = getVisibleChannels();
    var stats = {};
    for (var ci = 0; ci < visibleChannels.length; ci++) {
      var ch = visibleChannels[ci];
      var sd = window.UWV.renderer.getSmoothedData(ch);
      var iStart = Math.max(0, r.startIdx);
      var iEnd = Math.min(sd.length, r.endIdx);
      if (iEnd - iStart < 2) continue;
      var minVal = Infinity, maxVal = -Infinity, sum = 0;
      var minIdx = iStart, maxIdx = iStart;
      for (var i = iStart; i < iEnd; i++) {
        var v = sd[i];
        sum += v;
        if (v < minVal) { minVal = v; minIdx = i; }
        if (v > maxVal) { maxVal = v; maxIdx = i; }
      }
      var meanVal = sum / (iEnd - iStart);
      stats[ch.id] = {
        min: minVal,
        max: maxVal,
        mean: meanVal,
        range: maxVal - minVal,
        minIdx: minIdx,
        maxIdx: maxIdx,
        count: iEnd - iStart
      };
    }
    s.analysisStats = stats;
    // 自动设置参考中值为第一个通道的均值
    if (visibleChannels.length > 0) {
      var firstCh = visibleChannels[0];
      if (stats[firstCh.id]) {
        s.refLineValue = stats[firstCh.id].mean;
        s.showRefLine = true;
      }
    }
    updateDataPanel();
  }

  // --- Split view ---
  function toggleSplitView() {
    const s = getState();
    var modes = ['off', 'channel', 'type'];
    var idx = modes.indexOf(s.splitView);
    s.splitView = modes[(idx + 1) % modes.length];
    var btn = document.getElementById('btn-split');
    if (btn) {
      btn.className = s.splitView !== 'off' ? 'active' : '';
      btn.textContent = s.splitView === 'channel' ? t('splitChannel') : s.splitView === 'type' ? t('splitType') : t('splitView');
    }
  }

  // --- 导出/导入 ---
  function exportData() {
    const s = getState();
    if (s.channels.length === 0) { alert(t('noDataExport')); return; }
    let maxLen = 0;
    for (const ch of s.channels) { if (ch.data.length > maxLen) maxLen = ch.data.length; }
    if (maxLen === 0) { alert(t('noDataExportShort')); return; }

    let csv = '# ' + t('export') + ': ' + new Date().toLocaleString() + '\n';
    csv += '# Channels: ' + s.channels.length + '\n# Points: ' + maxLen + '\n';
    const headers = ['Index'];
    for (const ch of s.channels) headers.push(ch.name + '(' + ch.type + ':' + ch.index + ')');
    csv += headers.join(',') + '\n';
    const colors = [];
    for (const ch of s.channels) colors.push(ch.color);
    csv += '#COLORS:' + colors.join(',') + '\n';
    for (let i = 0; i < maxLen; i++) {
      const row = [i];
      for (const ch of s.channels) row.push(i < ch.data.length ? ch.data[i].toFixed(6) : '');
      csv += row.join(',') + '\n';
    }
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    a.download = 'waveform_data_' + timestamp + '.csv';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  function importData(e) {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = function(event) {
      try {
        const content = event.target.result;
        const lines = content.split('\n');
        if (lines.length < 3) { alert(t('fileFormatError')); return; }

        let channelNames = [], channelColors = [], dataStartLine = -1;
        for (let i = 0; i < lines.length; i++) {
          const line = lines[i].trim();
          if (line.startsWith('#COLORS:')) { channelColors = line.substring(8).split(','); continue; }
          if (line.startsWith('#')) continue;
          if (dataStartLine < 0) {
            const headers = line.split(',');
            for (let j = 1; j < headers.length; j++) {
              const header = headers[j].trim();
              const match = header.match(/^(.+?)\((.+?):(\d+)\)$/);
              if (match) channelNames.push({ name: match[1], type: match[2], index: parseInt(match[3]) });
              else channelNames.push({ name: header, type: 'imported', index: j - 1 });
            }
            dataStartLine = i + 1;
            break;
          }
        }
        if (channelNames.length === 0) { alert(t('parseChannelError')); return; }

        const s = getState();
        clearData();
        s.channels = []; s.channelMap = {}; s.typeGroups = {}; s.typeOrder = [];
        for (let i = 0; i < channelNames.length; i++) {
          const info = channelNames[i];
          const key = info.type + ':' + info.index;
          const color = (i < channelColors.length) ? channelColors[i] : window.UWV.COLORS[i % window.UWV.COLORS.length];
          const ch = { id: key, type: info.type, index: info.index, name: info.name, color: color, visible: true, data: [] };
          s.channels.push(ch); s.channelMap[key] = ch;
          if (!s.typeGroups[info.type]) { s.typeGroups[info.type] = { visible: true, collapsed: false, channels: [] }; s.typeOrder.push(info.type); }
          s.typeGroups[info.type].channels.push(ch);
        }
        let importedCount = 0;
        for (let i = dataStartLine; i < lines.length; i++) {
          const line = lines[i].trim();
          if (line === '' || line.startsWith('#')) continue;
          const values = line.split(',');
          for (let j = 1; j < values.length && j <= channelNames.length; j++) {
            const val = parseFloat(values[j]);
            if (!isNaN(val)) s.channels[j - 1].data.push(val);
          }
          importedCount++;
        }
        if (importedCount === 0) { alert(t('noValidData')); return; }
        rebuildChannelList();
        s.autoY = true;
        s.maxPoints = Math.max(50, importedCount);
        document.getElementById('input-points').value = s.maxPoints;
        s.historyStack = []; s.historyIndex = -1;
        alert(t('importSuccess').replace('{lines}', importedCount).replace('{channels}', channelNames.length));
      } catch (err) {
        console.error('Import error:', err);
        alert(t('importFailed') + ': ' + err.message);
      }
    };
    reader.onerror = function() { alert(t('readFileFailed')); };
    reader.readAsText(file, 'UTF-8');
    e.target.value = '';
  }

  // --- Status text update ---
  function updateStatusText() {
    const s = getState();
    if (!s.connected) document.getElementById('txt-conn').textContent = t('notConnected');
    document.getElementById('btn-pause').textContent = s.paused ? t('resume') : t('pause');
    const hint = document.getElementById('no-data-hint');
    if (hint) {
      hint.querySelectorAll('span[data-i18n]').forEach(function(span) {
        const key = span.getAttribute('data-i18n');
        const text = t(key);
        if (text !== key) span.textContent = text;
      });
    }
  }

  // --- 通道名编辑器 ---
  function updateChannelNames() {
    const s = getState();
    const typeNames = window.UWV.i18n.getTypeNames();
    for (const ch of s.channels) {
      const names = typeNames[ch.type];
      if (names && names[ch.index] !== undefined) {
        ch.name = names[ch.index];
      } else {
        ch.name = ch.type + '[' + ch.index + ']';
      }
    }
  }

  function openTypeNamesEditor() {
    // Remove existing overlay if any
    var old = document.getElementById('type-editor-overlay');
    if (old) old.remove();

    var overlay = document.createElement('div');
    overlay.id = 'type-editor-overlay';

    var modal = document.createElement('div');
    modal.id = 'type-editor-modal';

    var title = document.createElement('h3');
    title.textContent = t('typeEditor');
    modal.appendChild(title);

    var rowsDiv = document.createElement('div');
    rowsDiv.id = 'type-editor-rows';
    modal.appendChild(rowsDiv);

    // Load current merged typeNames
    var currentTypeNames = window.UWV.i18n.getTypeNames();
    var entries = Object.keys(currentTypeNames);

    function addRow(key, names) {
      var row = document.createElement('div');
      row.className = 'type-editor-row';

      var keyInput = document.createElement('input');
      keyInput.type = 'text';
      keyInput.value = key || '';
      keyInput.placeholder = t('typeKey');
      row.appendChild(keyInput);

      var namesInput = document.createElement('input');
      namesInput.type = 'text';
      namesInput.value = (names || []).join(',');
      namesInput.placeholder = t('subChannelNames');
      row.appendChild(namesInput);

      var delBtn = document.createElement('button');
      delBtn.textContent = t('remove');
      delBtn.addEventListener('click', function() { row.remove(); });
      row.appendChild(delBtn);

      rowsDiv.appendChild(row);
    }

    for (var i = 0; i < entries.length; i++) {
      addRow(entries[i], currentTypeNames[entries[i]]);
    }

    // Button bar
    var btns = document.createElement('div');
    btns.id = 'type-editor-btns';

    var addBtn = document.createElement('button');
    addBtn.textContent = t('addType');
    addBtn.addEventListener('click', function() { addRow('', []); });
    btns.appendChild(addBtn);

    var importBtn = document.createElement('button');
    importBtn.textContent = t('importConfig');
    importBtn.addEventListener('click', function() {
      var fileInput = document.createElement('input');
      fileInput.type = 'file';
      fileInput.accept = '.json';
      fileInput.addEventListener('change', function(e) {
        var file = e.target.files[0];
        if (!file) return;
        var reader = new FileReader();
        reader.onload = function(ev) {
          try {
            var imported = JSON.parse(ev.target.result);
            if (typeof imported !== 'object' || Array.isArray(imported)) throw new Error('Invalid');
            rowsDiv.innerHTML = '';
            var keys = Object.keys(imported);
            for (var j = 0; j < keys.length; j++) {
              var val = imported[keys[j]];
              addRow(keys[j], Array.isArray(val) ? val : []);
            }
          } catch (err) {
            alert('Invalid JSON file');
          }
        };
        reader.readAsText(file);
      });
      fileInput.click();
    });
    btns.appendChild(importBtn);

    var exportBtn = document.createElement('button');
    exportBtn.textContent = t('exportConfig');
    exportBtn.addEventListener('click', function() {
      var result = {};
      var rows = rowsDiv.querySelectorAll('.type-editor-row');
      for (var r = 0; r < rows.length; r++) {
        var inputs = rows[r].querySelectorAll('input');
        var k = inputs[0].value.trim();
        if (k) {
          result[k] = inputs[1].value.split(',').map(function(s) { return s.trim(); }).filter(function(s) { return s.length > 0; });
        }
      }
      var blob = new Blob([JSON.stringify(result, null, 2)], { type: 'application/json' });
      var a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'uwv_channel_names.json';
      a.click();
      URL.revokeObjectURL(a.href);
    });
    btns.appendChild(exportBtn);

    var resetBtn = document.createElement('button');
    resetBtn.className = 'danger';
    resetBtn.textContent = t('reset');
    resetBtn.addEventListener('click', function() {
      localStorage.removeItem('uwv-custom-typeNames');
      rowsDiv.innerHTML = '';
      var defaults = window.UWV.i18n.getDefaultTypeNames();
      var defKeys = Object.keys(defaults);
      for (var d = 0; d < defKeys.length; d++) {
        addRow(defKeys[d], defaults[defKeys[d]]);
      }
      updateChannelNames();
      rebuildChannelList();
      alert(t('typeNamesReset'));
    });
    btns.appendChild(resetBtn);

    var saveBtn = document.createElement('button');
    saveBtn.className = 'primary';
    saveBtn.textContent = t('save');
    saveBtn.addEventListener('click', function() {
      var result = {};
      var rows = rowsDiv.querySelectorAll('.type-editor-row');
      for (var r = 0; r < rows.length; r++) {
        var inputs = rows[r].querySelectorAll('input');
        var k = inputs[0].value.trim();
        if (k) {
          result[k] = inputs[1].value.split(',').map(function(s) { return s.trim(); }).filter(function(s) { return s.length > 0; });
        }
      }
      window.UWV.i18n.saveCustomTypeNames(result);
      updateChannelNames();
      rebuildChannelList();
      overlay.remove();
      alert(t('typeNamesSaved'));
    });
    btns.appendChild(saveBtn);

    var closeBtn = document.createElement('button');
    closeBtn.textContent = '×';
    closeBtn.style.cssText = 'margin-left:auto;font-size:16px;padding:4px 10px;';
    closeBtn.addEventListener('click', function() { overlay.remove(); });
    btns.appendChild(closeBtn);

    modal.appendChild(btns);
    overlay.appendChild(modal);
    overlay.addEventListener('click', function(e) {
      if (e.target === overlay) overlay.remove();
    });
    document.body.appendChild(overlay);
  }

  window.UWV = window.UWV || {};
  window.UWV.ui = {
    rebuildChannelList: rebuildChannelList,
    setAllVisible: setAllVisible,
    toggleAutoY: toggleAutoY,
    zoomY: zoomY,
    zoomX: zoomX,
    autoX: autoX,
    togglePause: togglePause,
    clearData: clearData,
    pushHistory: pushHistory,
    undo: undo,
    redo: redo,
    updateUndoRedoButtons: updateUndoRedoButtons,
    toggleMinimap: toggleMinimap,
    toggleSidebar: toggleSidebar,
    toggleThemePanel: toggleThemePanel,
    applyTheme: applyTheme,
    toggleDataPanel: toggleDataPanel,
    toggleDataPanelMinimize: toggleDataPanelMinimize,
    initDataPanelDrag: initDataPanelDrag,
    initDataPanelResize: initDataPanelResize,
    applyDataPanelFontSize: applyDataPanelFontSize,
    toggleAnalyzeMode: toggleAnalyzeMode,
    clearAnalysis: clearAnalysis,
    computeAnalysisStats: computeAnalysisStats,
    dismissLockedCrosshair: dismissLockedCrosshair,
    updateDataPanel: updateDataPanel,
    onWheel: onWheel,
    onMouseDown: onMouseDown,
    onMouseMove: onMouseMove,
    onMouseUp: onMouseUp,
    onContextMenu: onContextMenu,
    onMouseLeave: onMouseLeave,
    exportData: exportData,
    importData: importData,
    syncYInputs: syncYInputs,
    updateAutoButton: updateAutoButton,
    updateStatusText: updateStatusText,
    getPlotParams: getPlotParams,
    getXRange: getXRange,
    getVisibleChannels: getVisibleChannels,
    openTypeNamesEditor: openTypeNamesEditor,
    updateChannelNames: updateChannelNames,
    toggleSplitView: toggleSplitView
  };
})();
