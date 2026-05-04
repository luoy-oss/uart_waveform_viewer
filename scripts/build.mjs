import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT = join(__dirname, '..');
const SRC = join(ROOT, 'src');
const DIST = join(ROOT, 'dist');

if (!existsSync(DIST)) mkdirSync(DIST, { recursive: true });

function read(file) {
  return readFileSync(join(SRC, file), 'utf-8');
}

const html = read('index.html');
const css = read('style.css');
const zhJson = read('locales/zh.json').trim();
const enJson = read('locales/en.json').trim();

// JS files in load order
const jsFiles = ['state.js', 'i18n.js', 'serial.js', 'parser.js', 'renderer.js', 'ui.js', 'app.js'];
let jsContent = '';
for (const f of jsFiles) {
  jsContent += '\n// === ' + f + ' ===\n';
  jsContent += read(f);
}

// Inline locale injection (must load before i18n.js runs)
const localeInline = 'window.__LOCALES__ = {\n  zh: ' + zhJson + ',\n  en: ' + enJson + '\n};\n';

// Build output
let output = html;

// 1. Inline CSS
output = output.replace(
  /<link\s+rel="stylesheet"\s+href="style\.css"\s*\/?>/,
  '<style>\n' + css + '\n</style>'
);

// 2. Replace script tags with single inline block
// Remove individual script src tags
for (const f of jsFiles) {
  output = output.replace(new RegExp('\\s*<script\\s+src="' + f.replace('.', '\\.') + '"\\s*><\\/script>'), '');
}

// Insert inline scripts before </body>
output = output.replace(
  '</body>',
  '<script>\n' + localeInline + '\n' + jsContent + '\n</script>\n</body>'
);

writeFileSync(join(DIST, 'uart_waveform_viewer.html'), output, 'utf-8');

console.log('Built: dist/uart_waveform_viewer.html');
console.log('Size: ' + (output.length / 1024).toFixed(1) + ' KB');
