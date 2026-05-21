// ============================================================
//  数据解析
// ============================================================
(function() {
  'use strict';

  function getState() { return window.UWV.state; }

  function processTextBuffer() {
    const s = getState();
    if (s.paused) return;
    const lines = s.textBuffer.split('\n');
    s.textBuffer = lines.pop() || '';
    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed.length > 0) parseLine(trimmed);
    }
  }

  function parseLine(line) {
    const s = getState();
    const colonIdx = line.indexOf(':');
    if (colonIdx < 1) { s.errorCount++; return; }

    const type = line.substring(0, colonIdx).trim();
    const dataStr = line.substring(colonIdx + 1);
    const values = dataStr.split(',').map(function(v) { return parseFloat(v.trim()); });

    const typeNames = window.UWV.i18n.getTypeNames();

    for (let i = 0; i < values.length; i++) {
      if (isNaN(values[i])) { s.errorCount++; continue; }

      const key = type + ':' + i;
      let ch = s.channelMap[key];

      if (!ch) {
        const colorIdx = s.channels.length % window.UWV.COLORS.length;
        let group = s.typeGroups[type];
        if (!group) {
          group = { visible: true, collapsed: false, channels: [] };
          s.typeGroups[type] = group;
          s.typeOrder.push(type);
        }

        const names = typeNames[type];
        const displayName = names && names[i] ? names[i] : (type + '[' + i + ']');

        ch = {
          id: key,
          type: type,
          index: i,
          name: displayName,
          color: window.UWV.COLORS[colorIdx],
          visible: true,
          data: []
        };
        s.channels.push(ch);
        s.channelMap[key] = ch;
        group.channels.push(ch);

        if (window.UWV.ui) {
          window.UWV.ui.rebuildChannelList();
        }
      }

      ch.data.push(values[i]);
      s.totalPoints++;
    }

    s.lineCount++;
    s.rateCounter++;
  }

  window.UWV = window.UWV || {};
  window.UWV.parser = {
    processTextBuffer: processTextBuffer,
    parseLine: parseLine
  };
})();
