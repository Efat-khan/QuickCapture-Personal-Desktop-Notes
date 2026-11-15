// Generates every app icon from one SVG design.
// Run with: npm run icons   (uses Electron to render the SVG, no extra tools needed)
//
// Outputs:
//   build/icon.ico           Windows installer + .exe icon (16-256 px)
//   build/icon.png           512 px (electron-builder, Linux)
//   electron/assets/icon.png 256 px window/taskbar icon
//   electron/assets/tray.png + tray@2x.png  system tray icon
//   public/favicon.svg       the design itself

const fs = require('node:fs');
const path = require('node:path');
const { app, BrowserWindow } = require('electron');

const root = path.join(__dirname, '..');

/** Rounded square with the brand gradient and a white sound-wave mark. Small sizes get bolder strokes. */
function iconSvg({ stroke = 2.1, rounded = true } = {}) {
  const bars = [
    [2, 10, 13],
    [6, 6, 17],
    [10, 3, 21],
    [14, 8, 15],
    [18, 5, 18],
    [22, 10, 13],
  ]
    .map(([x, y1, y2]) => `<line x1="${x}" y1="${y1}" x2="${x}" y2="${y2}"/>`)
    .join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#6655f5"/>
      <stop offset="0.55" stop-color="#3f7af6"/>
      <stop offset="1" stop-color="#18c9dc"/>
    </linearGradient>
    <linearGradient id="shine" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#ffffff" stop-opacity="0.22"/>
      <stop offset="0.5" stop-color="#ffffff" stop-opacity="0"/>
    </linearGradient>
  </defs>
  <rect x="16" y="16" width="480" height="480" rx="${rounded ? 112 : 0}" fill="url(#bg)"/>
  <rect x="16" y="16" width="480" height="480" rx="${rounded ? 112 : 0}" fill="url(#shine)"/>
  <g transform="translate(256 256) scale(12.5) translate(-12 -12)" fill="none" stroke="#ffffff"
     stroke-width="${stroke}" stroke-linecap="round">${bars}</g>
</svg>`;
}

/** Packs PNG images into a .ico file (PNG-compressed entries, supported since Windows Vista). */
function buildIco(pngs) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(pngs.length, 4);
  const entries = [];
  let offset = 6 + 16 * pngs.length;
  for (const { size, data } of pngs) {
    const entry = Buffer.alloc(16);
    entry.writeUInt8(size >= 256 ? 0 : size, 0);
    entry.writeUInt8(size >= 256 ? 0 : size, 1);
    entry.writeUInt16LE(1, 4); // colour planes
    entry.writeUInt16LE(32, 6); // bits per pixel
    entry.writeUInt32LE(data.length, 8);
    entry.writeUInt32LE(offset, 12);
    entries.push(entry);
    offset += data.length;
  }
  return Buffer.concat([header, ...entries, ...pngs.map((p) => p.data)]);
}

async function render(win, svg, size) {
  const html = `<html><body style="margin:0;background:transparent">
    <img src="data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}" width="${size}" height="${size}" style="display:block"></body></html>`;
  await win.loadURL(`data:text/html;base64,${Buffer.from(html).toString('base64')}`);
  await new Promise((r) => setTimeout(r, 150));
  const image = await win.webContents.capturePage({ x: 0, y: 0, width: size, height: size });
  // capturePage returns device pixels (e.g. 125% scaling); normalise to the exact size.
  return image.resize({ width: size, height: size, quality: 'best' }).toPNG();
}

app.whenReady().then(async () => {
  const win = new BrowserWindow({
    width: 600,
    height: 600,
    show: false,
    frame: false,
    transparent: true,
    backgroundColor: '#00000000',
    webPreferences: { offscreen: true },
  });

  const write = (rel, data) => {
    const file = path.join(root, rel);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, data);
    console.log('wrote', rel);
  };

  const bold = iconSvg({ stroke: 2.9 }); // for 16-32 px, where thin lines would blur away
  const normal = iconSvg();

  const sizes = [16, 20, 24, 32, 40, 48, 64, 128, 256];
  const pngs = [];
  for (const size of sizes) pngs.push({ size, data: await render(win, size <= 32 ? bold : normal, size) });
  write('build/icon.ico', buildIco(pngs));
  write('build/icon.png', await render(win, normal, 512));
  write('electron/assets/icon.png', pngs.find((p) => p.size === 256).data);
  write('electron/assets/tray.png', pngs.find((p) => p.size === 16).data);
  write('electron/assets/tray@2x.png', pngs.find((p) => p.size === 32).data);
  write('public/favicon.svg', normal);

  app.exit(0);
});
