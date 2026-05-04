// ============================================================
//  状态管理与常量
// ============================================================
(function() {
  'use strict';

  const COLORS = [
    '#4a90d9','#e74c3c','#2ecc71','#f39c12','#9b59b6',
    '#1abc9c','#e67e22','#3498db','#e91e63','#00bcd4',
    '#8bc34a','#ff9800','#795548','#607d8b','#cddc39',
    '#ff5722'
  ];

  const GRID_COLOR = '#1e2a4a';
  const GRID_TEXT_COLOR = '#556';
  const AXIS_COLOR = '#3a4a6a';
  const CROSSHAIR_COLOR = 'rgba(74,144,217,0.4)';

  const state = {
    bgColor: '#1a1a2e',
    port: null,
    portInfo: '',
    reader: null,
    connected: false,
    disconnecting: false,
    paused: false,
    channels: [],
    channelMap: {},
    typeGroups: {},
    typeOrder: [],
    maxPoints: 500,
    autoY: true,
    yMin: -10,
    yMax: 10,
    xScroll: 0,
    mouseX: -1,
    mouseY: -1,

    // Drag state
    isDragging: false,
    dragButton: -1,       // 0=left, 2=right
    dragStartX: 0,
    dragStartY: 0,
    dragStartYMin: 0,
    dragStartYMax: 0,
    dragStartScroll: 0,

    // Left-click region selection
    isSelecting: false,
    selectStartX: -1,
    selectEndX: -1,

    // Locked crosshair (click to lock, ESC to dismiss)
    lockedX: -1,
    lockedMouseX: -1,
    lockedMouseY: -1,
    _lockedIdx: -1,
    _snappedIdx: -1,
    _snappedX: -1,

    // X scroll fixed (disable auto X tracking during drag)
    xScrollFixed: false,

    // Data panel
    showDataPanel: true,

    // Undo/redo history
    historyStack: [],
    historyIndex: -1,

    // Minimap
    showMinimap: true,

    // Stats
    lineCount: 0,
    errorCount: 0,
    rateCounter: 0,
    rateDisplay: 0,
    textBuffer: '',
    _clickTooltipTimer: null,
  };

  window.UWV = window.UWV || {};
  window.UWV.COLORS = COLORS;
  window.UWV.GRID_COLOR = GRID_COLOR;
  window.UWV.GRID_TEXT_COLOR = GRID_TEXT_COLOR;
  window.UWV.AXIS_COLOR = AXIS_COLOR;
  window.UWV.CROSSHAIR_COLOR = CROSSHAIR_COLOR;
  window.UWV.state = state;
})();
