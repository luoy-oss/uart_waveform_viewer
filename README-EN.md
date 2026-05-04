# UART Waveform Viewer

A browser-based real-time UART waveform viewer powered by the Web Serial API. No installation required.

[中文](README.md)

## Features

- **Real-time Waveforms** — Read serial data via Web Serial API, render multi-channel waveforms live
- **Interactive Controls** — Drag panning, box-select zoom, scroll zoom, crosshair cursor, data panel
- **Global Minimap** — Bottom-right overview of all data, white rectangle marks current view
- **Undo / Redo** — Ctrl+Z / Ctrl+Y, up to 100 history steps
- **Data Management** — CSV export/import for analysis and playback
- **Bilingual UI** — Chinese / English, switch with one click
- **Customizable** — Background color, Y-axis range, display point count, and more

## Quick Start

### Online

Open directly in Chrome / Edge browser.

### Offline

Download `uart_waveform_viewer.html` from [Releases](../../releases), double-click to open in browser (all dependencies inlined).

### Local

```bash
git clone https://github.com/luoy-oss/uart_waveform_viewer.git
cd uart_waveform_viewer

# Pick one
npx serve src -l 8080
python -m http.server 8080 -d src

# Open http://localhost:8080
```

## Mouse Controls

| Action | Function |
|--------|----------|
| Left Click | Lock crosshair, data panel shows all channel values at that point |
| Left Drag | Box-select X region to zoom in |
| Right Drag | Free pan X + Y axes |
| Middle Drag | Free pan X + Y axes |
| Scroll | Zoom Y axis |
| Shift + Scroll | Zoom X axis |
| ESC | Dismiss locked crosshair |

The `?` button in the top-right corner opens the interactive guide panel.

## UI Components

- **Data Panel** — Top-left of waveform area, shows index and all channel values at the crosshair position, scrollable, toggle with `Info` button
- **Global Minimap** — Bottom-right overview, white rectangle marks current view range, toggle with `Map` button
- **Undo / Redo** — Control bar `↩` `↪` buttons, or Ctrl+Z / Ctrl+Y
- **Sidebar** — Left-side channel list, grouped by type, select all / deselect all

## Data Format

Serial data sent as text lines:

```
channel_name:value1,value2,value3,...
```

Examples:
```
att:1.23,4.56,7.89
imu_g:0.01,-0.02,0.03
leg:0.5,0.6
```

Built-in channel name mapping:

| Channel | Description | Count |
|---------|-------------|-------|
| att | Attitude (Roll/Pitch/Yaw) | 3 |
| imu_g | Gyroscope (X/Y/Z) | 3 |
| imu_a | Accelerometer (X/Y/Z) | 3 |
| leg | Leg length (Right/Left) | 2 |
| tor_j | Joint torque | 4 |
| tor_w | Wheel torque | 2 |
| tor_h | Hip torque | 2 |
| frce | Support force | 2 |
| move | Motion (Velocity/Position) | 2 |
| hgt | Height (Current/Set) | 2 |

Unrecognized channels display as `type_name[index]`.

## Project Structure

```
src/
  index.html          Main page
  style.css           Styles
  state.js            State management
  i18n.js             Internationalization
  serial.js           Serial port operations
  parser.js           Data parsing
  renderer.js         Waveform rendering
  ui.js               UI interactions
  app.js              Entry point
  locales/            Language packs
    zh.json
    en.json
scripts/
  build.mjs           Build script (generates single-file HTML)
```

## Build

```bash
node scripts/build.mjs
# Output: dist/uart_waveform_viewer.html
```

## Vercel Deployment

Project includes `vercel.json`. Fork and import in Vercel to deploy.

## Browser Compatibility

Requires [Web Serial API](https://developer.mozilla.org/en-US/docs/Web/API/Web_Serial_API):

- Chrome 89+
- Edge 89+
- Opera 75+

Only available in secure contexts (HTTPS / localhost).

## License

MIT
