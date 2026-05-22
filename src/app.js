// ============================================================
//  主入口
// ============================================================
(function() {
  'use strict';

  window.addEventListener('DOMContentLoaded', function() {
    const canvas = document.getElementById('waveform-canvas');

    // Init renderer
    window.UWV.renderer.init(canvas);
    window.UWV.renderer.resizeCanvas();
    window.addEventListener('resize', window.UWV.renderer.resizeCanvas);

    // Init i18n
    window.UWV.i18n.init().then(function() {
      document.title = window.UWV.i18n.t('title');
    });

    // Bind events
    document.getElementById('btn-port').addEventListener('click', window.UWV.serial.selectPort);
    document.getElementById('btn-connect').addEventListener('click', window.UWV.serial.toggleConnect);
    document.getElementById('btn-auto').addEventListener('click', window.UWV.ui.toggleAutoY);
    document.getElementById('btn-auto-x').addEventListener('click', window.UWV.ui.autoX);
    document.getElementById('btn-y-zoom-in').addEventListener('click', function() { window.UWV.ui.pushHistory(); window.UWV.ui.zoomY(1.2); });
    document.getElementById('btn-y-zoom-out').addEventListener('click', function() { window.UWV.ui.pushHistory(); window.UWV.ui.zoomY(1/1.2); });
    document.getElementById('btn-x-zoom-in').addEventListener('click', function() { window.UWV.ui.pushHistory(); window.UWV.ui.zoomX(1.2); });
    document.getElementById('btn-x-zoom-out').addEventListener('click', function() { window.UWV.ui.pushHistory(); window.UWV.ui.zoomX(1/1.2); });
    document.getElementById('btn-pause').addEventListener('click', window.UWV.ui.togglePause);
    document.getElementById('btn-clear').addEventListener('click', window.UWV.ui.clearData);
    document.getElementById('btn-show-all').addEventListener('click', function() { window.UWV.ui.setAllVisible(true); });
    document.getElementById('btn-hide-all').addEventListener('click', function() { window.UWV.ui.setAllVisible(false); });
    document.getElementById('btn-type-editor').addEventListener('click', window.UWV.ui.openTypeNamesEditor);
    document.getElementById('btn-export').addEventListener('click', window.UWV.ui.exportData);
    document.getElementById('btn-import').addEventListener('click', function() { document.getElementById('file-import').click(); });
    document.getElementById('file-import').addEventListener('change', window.UWV.ui.importData);
    document.getElementById('btn-lang').addEventListener('click', window.UWV.i18n.toggleLanguage);
    document.getElementById('btn-undo').addEventListener('click', window.UWV.ui.undo);
    document.getElementById('btn-redo').addEventListener('click', window.UWV.ui.redo);
    document.getElementById('btn-minimap').addEventListener('click', window.UWV.ui.toggleMinimap);
    document.getElementById('btn-datapanel').addEventListener('click', window.UWV.ui.toggleDataPanel);
    document.getElementById('btn-split').addEventListener('click', window.UWV.ui.toggleSplitView);
    document.getElementById('btn-analyze').addEventListener('click', window.UWV.ui.toggleAnalyzeMode);
    document.getElementById('btn-clear-analysis').addEventListener('click', window.UWV.ui.clearAnalysis);
    document.getElementById('btn-sidebar-toggle').addEventListener('click', window.UWV.ui.toggleSidebar);
    document.getElementById('btn-theme-settings').addEventListener('click', window.UWV.ui.toggleThemePanel);
    document.getElementById('theme-close').addEventListener('click', window.UWV.ui.toggleThemePanel);
    document.getElementById('data-panel-minimize').addEventListener('click', window.UWV.ui.toggleDataPanelMinimize);

    // Init data panel drag and resize
    window.UWV.ui.initDataPanelDrag();
    window.UWV.ui.initDataPanelResize();
    // 初始化面板字号 CSS 变量
    document.getElementById('data-panel').style.setProperty('--panel-font-size', window.UWV.state.dataPanelFontSize + 'px');
    window.UWV.ui.applyDataPanelFontSize(window.UWV.state.dataPanelFontSize);

    document.getElementById('input-points').addEventListener('change', function(e) {
      window.UWV.ui.pushHistory();
      window.UWV.state.maxPoints = Math.max(50, parseInt(e.target.value) || 500);
      e.target.value = window.UWV.state.maxPoints;
    });
    document.getElementById('input-ymin').addEventListener('change', function(e) {
      window.UWV.state.yMin = parseFloat(e.target.value) || -10;
      window.UWV.state.autoY = false;
      window.UWV.ui.updateAutoButton();
    });
    document.getElementById('input-ymax').addEventListener('change', function(e) {
      window.UWV.state.yMax = parseFloat(e.target.value) || 10;
      window.UWV.state.autoY = false;
      window.UWV.ui.updateAutoButton();
    });
    document.getElementById('input-bg').addEventListener('input', function(e) {
      window.UWV.state.bgColor = e.target.value;
    });
    document.getElementById('sel-smooth').addEventListener('change', function(e) {
      window.UWV.state.smoothMethod = e.target.value;
    });
    document.getElementById('input-smooth').addEventListener('change', function(e) {
      window.UWV.state.smoothParam = Math.max(2, Math.min(50, parseInt(e.target.value) || 5));
      e.target.value = window.UWV.state.smoothParam;
    });

    // Time axis controls
    document.getElementById('btn-time-unit').addEventListener('click', function() {
      var s = window.UWV.state;
      s.timeUnitEnabled = !s.timeUnitEnabled;
      this.textContent = s.timeUnitEnabled ? '时间' : '点数';
    });
    document.getElementById('input-interval').addEventListener('change', function(e) {
      window.UWV.state.sampleIntervalMs = Math.max(0.1, parseFloat(e.target.value) || 5);
      e.target.value = window.UWV.state.sampleIntervalMs;
    });
    document.getElementById('chk-reset-time').addEventListener('change', function(e) {
      window.UWV.state.resetOnZoom = e.target.checked;
    });

    // Line width control
    document.getElementById('input-line-width').addEventListener('input', function(e) {
      var val = parseFloat(e.target.value);
      window.UWV.state.lineWidth = val;
      document.getElementById('txt-line-width').textContent = val.toFixed(1);
    });

    // Analysis annotation controls
    document.getElementById('input-analysis-font').addEventListener('input', function(e) {
      var val = parseInt(e.target.value);
      window.UWV.state.analysisFontSize = val;
      document.getElementById('txt-analysis-font').textContent = val;
    });
    document.getElementById('input-analysis-color').addEventListener('input', function(e) {
      window.UWV.state.analysisColor = e.target.value;
    });
    document.getElementById('chk-show-region').addEventListener('change', function(e) {
      window.UWV.state.analysisShowRegion = e.target.checked;
    });

    // Annotation settings panel
    document.getElementById('btn-anno-settings').addEventListener('click', function(e) {
      e.stopPropagation();
      document.getElementById('anno-panel').classList.toggle('visible');
    });
    document.getElementById('anno-close').addEventListener('click', function() {
      document.getElementById('anno-panel').classList.remove('visible');
    });
    document.addEventListener('click', function(e) {
      var panel = document.getElementById('anno-panel');
      var btn = document.getElementById('btn-anno-settings');
      if (panel && panel.classList.contains('visible') && !panel.contains(e.target) && e.target !== btn) {
        panel.classList.remove('visible');
      }
    });
    function setupAnnoCheckbox(id, stateKey) {
      document.getElementById(id).addEventListener('change', function(e) {
        window.UWV.state[stateKey] = e.target.checked;
      });
    }
    setupAnnoCheckbox('chk-anno-mean', 'analysisShowMean');
    setupAnnoCheckbox('chk-anno-maxmin', 'analysisShowMaxMin');
    setupAnnoCheckbox('chk-anno-range', 'analysisShowRange');
    setupAnnoCheckbox('chk-anno-deviation', 'analysisShowDeviation');

    // Data panel font size
    document.getElementById('input-panel-font').addEventListener('input', function(e) {
      var val = parseInt(e.target.value);
      window.UWV.state.dataPanelFontSize = val;
      document.getElementById('txt-panel-font').textContent = val;
      window.UWV.ui.applyDataPanelFontSize(val);
    });

    // Theme color controls
    function setupThemeInput(id, key) {
      document.getElementById(id).addEventListener('input', function(e) {
        window.UWV.state.theme[key] = e.target.value;
        window.UWV.ui.applyTheme();
      });
    }
    setupThemeInput('input-panel-bg', 'panelBg');
    setupThemeInput('input-status-bg', 'statusBarBg');
    setupThemeInput('input-text-color', 'textColor');
    setupThemeInput('input-accent-color', 'accentColor');

    // Close theme panel on outside click
    document.addEventListener('click', function(e) {
      var panel = document.getElementById('theme-panel');
      var btn = document.getElementById('btn-theme-settings');
      if (panel && panel.classList.contains('visible')) {
        if (!panel.contains(e.target) && e.target !== btn) {
          panel.classList.remove('visible');
        }
      }
    });

    // Canvas events
    canvas.addEventListener('wheel', window.UWV.ui.onWheel, { passive: false });
    canvas.addEventListener('mousedown', window.UWV.ui.onMouseDown);
    canvas.addEventListener('mousemove', window.UWV.ui.onMouseMove);
    canvas.addEventListener('mouseleave', window.UWV.ui.onMouseLeave);
    canvas.addEventListener('contextmenu', window.UWV.ui.onContextMenu);
    // mouseup on document so drag-end works even if cursor leaves canvas
    document.addEventListener('mouseup', window.UWV.ui.onMouseUp);

    // Keyboard shortcuts
    document.addEventListener('keydown', function(e) {
      // Ctrl+Z = undo
      if ((e.ctrlKey || e.metaKey) && !e.shiftKey && e.key === 'z') {
        e.preventDefault();
        window.UWV.ui.undo();
      }
      // Ctrl+Y or Ctrl+Shift+Z = redo
      if ((e.ctrlKey || e.metaKey) && (e.key === 'y' || (e.shiftKey && e.key === 'Z') || (e.shiftKey && e.key === 'z'))) {
        e.preventDefault();
        window.UWV.ui.redo();
      }
      // ESC = dismiss locked crosshair or close hint panel
      if (e.key === 'Escape') {
        if (hintPanel && hintPanel.classList.contains('visible')) {
          hintPanel.classList.remove('visible');
        } else {
          window.UWV.ui.dismissLockedCrosshair();
        }
      }
    });

    // Tutorial hint panel
    var hintToggle = document.getElementById('hint-toggle');
    var hintPanel = document.getElementById('hint-panel');
    var hintClose = document.getElementById('hint-close');
    if (hintToggle && hintPanel) {
      hintToggle.addEventListener('click', function(e) {
        e.stopPropagation();
        hintPanel.classList.toggle('visible');
      });
    }
    if (hintClose && hintPanel) {
      hintClose.addEventListener('click', function() {
        hintPanel.classList.remove('visible');
      });
    }
    // 点击 hint-panel 外部区域关闭
    document.addEventListener('click', function(e) {
      if (hintPanel && hintPanel.classList.contains('visible')) {
        if (!hintPanel.contains(e.target) && e.target !== hintToggle) {
          hintPanel.classList.remove('visible');
        }
      }
    });

    // Stats timer
    setInterval(function() {
      var s = window.UWV.state;
      s.rateDisplay = s.rateCounter;
      s.rateCounter = 0;
      document.getElementById('txt-rate').textContent = s.rateDisplay;
      document.getElementById('txt-lines').textContent = s.lineCount;
      document.getElementById('txt-errors').textContent = s.errorCount;
    }, 1000);

    // Render loop
    requestAnimationFrame(function loop() {
      window.UWV.renderer.render();
      requestAnimationFrame(loop);
    });
  });

  window.addEventListener('beforeunload', function() {
    if (window.UWV.state.connected) {
      window.UWV.serial.disconnectSerial();
    }
  });
})();
