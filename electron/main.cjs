const path = require('node:path');
const fs = require('node:fs');
const { app, BrowserWindow, ipcMain, Tray, Menu, nativeImage } = require('electron');
const { runMigrations } = require('./database/migrations.cjs');
const notes = require('./database/noteRepository.cjs');
const { saveAudioBuffer } = require('./services/audioService.cjs');

const isDev = !app.isPackaged;
let mainWindow;
let tray;

const windowModes = {
  pill: { width: 420, height: 76, resizable: false },
  popup: { width: 460, height: 280, resizable: false },
  voice: { width: 520, height: 420, resizable: false },
  dashboard: { width: 1080, height: 760, resizable: true },
};

function getStateFilePath() {
  return path.join(app.getPath('userData'), 'window-state.json');
}

function readWindowState() {
  try {
    return JSON.parse(fs.readFileSync(getStateFilePath(), 'utf8'));
  } catch {
    return { x: undefined, y: undefined, mode: 'pill' };
  }
}

function saveWindowState() {
  if (!mainWindow) return;
  const [x, y] = mainWindow.getPosition();
  const data = { x, y };
  fs.writeFileSync(getStateFilePath(), JSON.stringify(data, null, 2));
}

function setWindowMode(mode = 'pill') {
  if (!mainWindow || !windowModes[mode]) return;
  const config = windowModes[mode];
  mainWindow.setResizable(config.resizable);
  mainWindow.setSize(config.width, config.height, true);
  mainWindow.webContents.send('app:mode', mode);
}

function createMainWindow() {
  const state = readWindowState();

  mainWindow = new BrowserWindow({
    width: windowModes.pill.width,
    height: windowModes.pill.height,
    x: Number.isFinite(state.x) ? state.x : undefined,
    y: Number.isFinite(state.y) ? state.y : undefined,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    resizable: false,
    fullscreenable: false,
    skipTaskbar: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  if (isDev) {
    mainWindow.loadURL('http://localhost:5173');
  } else {
    mainWindow.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));
  }

  mainWindow.on('move', saveWindowState);
  mainWindow.on('close', saveWindowState);
}

function createTray() {
  const icon = nativeImage.createFromDataURL(
    'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9n32wAAAAASUVORK5CYII='
  );
  tray = new Tray(icon);
  tray.setTitle('QuickCapture');
  tray.setToolTip('QuickCapture');

  const sendAction = (action) => {
    if (!mainWindow) return;
    mainWindow.show();
    mainWindow.focus();
    mainWindow.webContents.send('tray:action', action);
  };

  const contextMenu = Menu.buildFromTemplate([
    { label: 'Open QuickCapture', click: () => sendAction('open-dashboard') },
    { label: 'New Text Note', click: () => sendAction('open-text') },
    { label: 'Record Voice Note', click: () => sendAction('open-voice') },
    { type: 'separator' },
    {
      label: 'Show/Hide Floating Widget',
      click: () => {
        if (!mainWindow) return;
        if (mainWindow.isVisible()) mainWindow.hide();
        else {
          mainWindow.show();
          sendAction('open-pill');
        }
      },
    },
    { type: 'separator' },
    { label: 'Exit Application', click: () => app.quit() },
  ]);

  tray.setContextMenu(contextMenu);
  tray.on('click', () => {
    if (!mainWindow) return;
    mainWindow.show();
    sendAction('open-pill');
  });
}

function registerIpcHandlers() {
  ipcMain.handle('app:set-mode', (_event, mode) => {
    if (!windowModes[mode]) return { ok: false };
    setWindowMode(mode);
    return { ok: true };
  });

  ipcMain.handle('app:hide-widget', () => {
    mainWindow?.hide();
    return { ok: true };
  });

  ipcMain.handle('notes:list', (_event, filters) => notes.listNotes(filters));

  ipcMain.handle('notes:create', (_event, payload) => {
    if (!payload || !['text', 'audio'].includes(payload.note_type)) {
      throw new Error('Invalid note type');
    }
    return notes.createNote(payload);
  });

  ipcMain.handle('notes:update', (_event, id, payload) => {
    const noteId = Number(id);
    if (!Number.isFinite(noteId)) throw new Error('Invalid note id');
    return notes.updateNote(noteId, payload || {});
  });

  ipcMain.handle('notes:delete', (_event, id) => {
    const noteId = Number(id);
    if (!Number.isFinite(noteId)) throw new Error('Invalid note id');
    return notes.deleteNote(noteId);
  });

  ipcMain.handle('audio:save', (_event, arrayBuffer, title, durationSeconds) => {
    if (!(arrayBuffer instanceof ArrayBuffer)) {
      throw new Error('Invalid audio payload');
    }

    const saved = saveAudioBuffer(Buffer.from(arrayBuffer));

    return notes.createNote({
      title: title?.trim() || 'Voice Note',
      note_type: 'audio',
      file_path: saved.relativePath,
      duration_seconds: Number.isFinite(durationSeconds) ? durationSeconds : 0,
      content: null,
    });
  });

  ipcMain.handle('audio:get-url', (_event, relativePath) => {
    if (!relativePath || typeof relativePath !== 'string') return null;
    const absolutePath = path.join(app.getPath('userData'), relativePath);
    if (!absolutePath.startsWith(app.getPath('userData'))) return null;
    if (!fs.existsSync(absolutePath)) return null;
    return `file://${absolutePath}`;
  });
}

app.whenReady().then(() => {
  runMigrations();
  createMainWindow();
  createTray();
  registerIpcHandlers();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createMainWindow();
  });
});

app.on('window-all-closed', (event) => {
  event.preventDefault();
  if (process.platform !== 'darwin') {
    mainWindow?.hide();
  }
});
