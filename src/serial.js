// ============================================================
//  串口操作
// ============================================================
(function() {
  'use strict';

  const state = () => window.UWV.state;
  const i18n = () => window.UWV.i18n;

  async function selectPort() {
    if (state().connected) return;
    try {
      const port = await navigator.serial.requestPort();
      state().port = port;
      const info = port.getInfo();
      const vid = info.usbVendorId ? 'VID:' + info.usbVendorId.toString(16).padStart(4, '0') : '';
      const pid = info.usbProductId ? 'PID:' + info.usbProductId.toString(16).padStart(4, '0') : '';
      state().portInfo = vid && pid ? vid + ' ' + pid : i18n().t('portSelected');
      document.getElementById('port-info').textContent = state().portInfo;
      document.getElementById('btn-port').classList.add('has-port');
      document.getElementById('btn-port').textContent = i18n().t('changePort');
    } catch (e) {
      if (e.name !== 'NotFoundError') {
        console.error('Select port failed:', e);
        alert(i18n().t('selectPortFailed') + ': ' + e.message);
      }
    }
  }

  async function toggleConnect() {
    if (state().connected) {
      await disconnectSerial();
    } else {
      await connectSerial();
    }
  }

  async function connectSerial() {
    if (!state().port) {
      alert(i18n().t('selectPortAlert'));
      return;
    }

    try {
      const baudRate = parseInt(document.getElementById('sel-baud').value);
      const dataBits = parseInt(document.getElementById('sel-databits').value);
      const stopBits = parseFloat(document.getElementById('sel-stopbits').value);
      const parity = document.getElementById('sel-parity').value;
      const flowControl = document.getElementById('sel-flow').value;

      await state().port.open({
        baudRate: baudRate,
        dataBits: dataBits,
        stopBits: stopBits,
        parity: parity,
        flowControl: flowControl === 'rtscts' ? 'hardware' : 'none',
        bufferSize: 65536
      });

      state().connected = true;
      state().textBuffer = '';

      updateConnectUI(true, baudRate);
      readSerialLoop();
    } catch (e) {
      console.error('Connect failed:', e);
      alert(i18n().t('connectFailed') + ': ' + e.message);
    }
  }

  function updateConnectUI(connected, baudRate) {
    const s = state();
    const t = i18n().t;
    const btnConnect = document.getElementById('btn-connect');
    const btnPort = document.getElementById('btn-port');

    if (connected) {
      btnConnect.textContent = t('disconnect');
      btnConnect.classList.add('connected');
      btnPort.disabled = true;
      btnPort.style.opacity = '0.5';
      document.getElementById('dot-conn').className = 'dot on';
      document.getElementById('txt-conn').textContent = t('connected') + ' ' + s.portInfo + ' @ ' + baudRate;
    } else {
      btnConnect.textContent = t('connect');
      btnConnect.classList.remove('connected');
      btnPort.disabled = false;
      btnPort.style.opacity = '1';
      document.getElementById('dot-conn').className = 'dot off';
      document.getElementById('txt-conn').textContent = t('notConnected');
    }
  }

  async function disconnectSerial() {
    if (!state().connected) return;
    state().disconnecting = true;

    try {
      if (state().reader) {
        try { await state().reader.cancel(); } catch(e) {}
      }
      if (state().reader) {
        try { state().reader.releaseLock(); } catch(e) {}
      }
      state().reader = null;

      if (state().port) {
        await state().port.close();
      }
    } catch (e) {
      console.error('Disconnect error:', e);
    }

    state().connected = false;
    state().disconnecting = false;
    updateConnectUI(false);
  }

  async function readSerialLoop() {
    const decoder = new TextDecoder();
    const s = state();

    while (s.port && s.port.readable && s.connected && !s.disconnecting) {
      try {
        s.reader = s.port.readable.getReader();
        while (!s.disconnecting) {
          const { value, done } = await s.reader.read();
          if (done) break;
          if (value) {
            s.textBuffer += decoder.decode(value, { stream: true });
            if (window.UWV.parser) {
              window.UWV.parser.processTextBuffer();
            }
          }
        }
      } catch (e) {
        if (!s.disconnecting) {
          console.error('Read error:', e);
        }
        break;
      } finally {
        if (s.reader) {
          try { s.reader.releaseLock(); } catch(e) {}
          s.reader = null;
        }
      }
    }
  }

  window.UWV = window.UWV || {};
  window.UWV.serial = {
    selectPort: selectPort,
    toggleConnect: toggleConnect,
    connectSerial: connectSerial,
    disconnectSerial: disconnectSerial
  };
})();
